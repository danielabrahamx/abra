require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 8888;

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper to simulate Netlify Event payload
function createNetlifyEvent(req) {
    return {
        httpMethod: req.method,
        queryStringParameters: req.query || {},
        body: req.body && Object.keys(req.body).length ? new URLSearchParams(req.body).toString() : null
    };
}

// Dynamically load all Netlify Functions
const functionsDir = path.join(__dirname, 'netlify', 'functions');

fs.readdirSync(functionsDir).forEach(file => {
    if (file.endsWith('.js') && file !== 'lib') {
        const functionName = file.replace('.js', '');
        const route = `/.netlify/functions/${functionName}`;

        console.log(`Mapping route: ${route} -> ${file}`);

        app.all(route, async (req, res) => {
            try {
                const handlerPath = path.join(functionsDir, file);
                // Clear cache so we can edit functions without restarting server
                delete require.cache[require.resolve(handlerPath)];
                const { handler } = require(handlerPath);

                const event = createNetlifyEvent(req);
                const response = await handler(event, {});

                if (response.headers) {
                    for (const [key, value] of Object.entries(response.headers)) {
                        res.setHeader(key, value);
                    }
                }

                res.status(response.statusCode || 200).send(response.body);
            } catch (error) {
                console.error(`Error executing function ${functionName}:`, error);
                res.status(500).send('Internal Server Error');
            }
        });
    }
});

app.listen(PORT, () => {
    console.log(`\n🚀 Local Dev Server running at http://localhost:${PORT}`);
    console.log(`- Manager Portal: http://localhost:${PORT}/manager.html`);
    console.log(`- Worker Portal:  http://localhost:${PORT}/worker.html`);
    console.log(`- Client Portal:  http://localhost:${PORT}/client.html\n`);
});
