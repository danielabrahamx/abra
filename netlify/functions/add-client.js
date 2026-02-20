const redis = require('./lib/redis');
const { corsHeaders } = require('./lib/utils');
const crypto = require('crypto');

exports.handler = async (event, context) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders(), body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const params = new URLSearchParams(event.body);
        const newClient = {
            id: crypto.randomUUID(),
            name: params.get('client_name'),
            street: params.get('street'),
            house_number: params.get('house_number'),
            notes: params.get('notes') || ''
        };

        let clients = await redis.get('clients') || [];
        clients.push(newClient);
        await redis.set('clients', clients);

        let html = `<option value="">Select a saved client...</option>`;
        for (const client of clients) {
            html += `<option value='${JSON.stringify(client)}' ${client.id === newClient.id ? 'selected' : ''}>${client.name} - ${client.street}</option>`;
        }

        return {
            statusCode: 200,
            headers: { ...corsHeaders(), 'Content-Type': 'text/html' },
            body: html
        };
    } catch (error) {
        console.error('Error adding client:', error);
        return {
            statusCode: 500,
            headers: corsHeaders(),
            body: `<option value="">Error saving client</option>`
        };
    }
};
