/**
 * get-clients.js - Netlify Function to read clients from Netlify Blobs
 * Returns the clients array from blob storage
 */

const { getStore } = require('@netlify/blobs');

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
        // Get the blob store for this site
        const store = getStore('abra-data');

        // Retrieve clients from blob storage
        const clients = await store.get('clients', { type: 'json' }) || [];

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(clients)
        };
    } catch (error) {
        console.error('Error reading clients from Blobs:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to read clients data', message: error.message })
        };
    }
};
