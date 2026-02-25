/**
 * get-clients.js - Netlify Function to read clients from Redis
 * Returns the clients array from Upstash Redis
 */

const { readJSON } = require('./lib/redis-storage');

exports.handler = async (event, context) => {
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
        let clients = await readJSON('data/clients.json');
        if (!Array.isArray(clients)) clients = [];
        console.log(`get-clients: retrieved ${clients.length} clients`);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
            },
            body: JSON.stringify(clients || [])
        };
    } catch (error) {
        console.error('Error reading clients from GitHub:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to read clients data', message: error.message })
        };
    }
};
