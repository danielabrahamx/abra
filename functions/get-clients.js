/**
 * get-clients.js - Netlify Function to read clients from GitHub
 * Returns the clients array from GitHub repository
 */

const { readJSON } = require('./lib/github-storage');

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
        console.log('get-clients: reading from GitHub...');
        const clients = await readJSON('data/clients.json');
        console.log(`get-clients: retrieved ${clients ? clients.length : 0} clients`);

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
