/**
 * get-clients.js - Netlify Function to read the clients directory
 * Returns the contents of data/clients.json
 */

const fs = require('fs');
const path = require('path');

const CLIENTS_PATH = path.join(__dirname, '..', 'data', 'clients.json');

exports.handler = async (event) => {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            },
            body: ''
        };
    }

    try {
        let clients = [];
        if (fs.existsSync(CLIENTS_PATH)) {
            const data = fs.readFileSync(CLIENTS_PATH, 'utf8');
            clients = JSON.parse(data);
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(clients)
        };
    } catch (error) {
        console.error('Error reading clients:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to read clients data' })
        };
    }
};
