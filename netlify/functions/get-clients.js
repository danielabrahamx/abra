const redis = require('./lib/redis');
const { corsHeaders } = require('./lib/utils');

exports.handler = async (event, context) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders(), body: '' };
    }

    try {
        const clients = await redis.get('clients') || [];

        let html = `<option value="">Select a saved client...</option>`;
        for (const client of clients) {
            html += `<option value='${JSON.stringify(client)}'>${client.name} - ${client.street}</option>`;
        }

        return {
            statusCode: 200,
            headers: { ...corsHeaders(), 'Content-Type': 'text/html' },
            body: html
        };
    } catch (error) {
        console.error('Error fetching clients:', error);
        return {
            statusCode: 500,
            headers: corsHeaders(),
            body: JSON.stringify({ error: 'Failed to load clients' })
        };
    }
};
