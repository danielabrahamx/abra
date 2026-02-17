/**
 * migrate-data.js - One-time migration to seed Netlify Blobs from JSON files
 * Run this once to transfer existing schedule.json and clients.json data to Blobs
 */

const { getStore } = require('@netlify/blobs');
const fs = require('fs');
const path = require('path');

const SCHEDULE_PATH = path.join(__dirname, '..', 'data', 'schedule.json');
const CLIENTS_PATH = path.join(__dirname, '..', 'data', 'clients.json');

exports.handler = async (event) => {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    try {
        const store = getStore('abra-data');
        const results = {};

        // Migrate schedule.json
        if (fs.existsSync(SCHEDULE_PATH)) {
            const scheduleData = fs.readFileSync(SCHEDULE_PATH, 'utf8');
            const schedule = JSON.parse(scheduleData);
            await store.setJSON('schedule', schedule);
            results.schedule = {
                migrated: true,
                dateCount: Object.keys(schedule).length
            };
        } else {
            results.schedule = {
                migrated: false,
                message: 'No schedule.json found to migrate'
            };
        }

        // Migrate clients.json
        if (fs.existsSync(CLIENTS_PATH)) {
            const clientsData = fs.readFileSync(CLIENTS_PATH, 'utf8');
            const clients = JSON.parse(clientsData);
            await store.setJSON('clients', clients);
            results.clients = {
                migrated: true,
                clientCount: clients.length
            };
        } else {
            // Initialize with empty array
            await store.setJSON('clients', []);
            results.clients = {
                migrated: true,
                clientCount: 0,
                message: 'Initialized empty clients array'
            };
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                message: 'Migration completed successfully',
                results
            })
        };

    } catch (error) {
        console.error('Migration error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Migration failed',
                message: error.message
            })
        };
    }
};
