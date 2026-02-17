/**
 * get-schedule.js - Netlify Function to retrieve schedule data
 * Returns schedule from Netlify Blobs with support for assigned_workers arrays
 * Generates default 7-day template if schedule is missing/empty
 */

const { getStore } = require('@netlify/blobs');

/**
 * Generate a default 7-day schedule template
 * Each day has Team_A and Team_B with empty assigned_workers arrays
 * @returns {Object} Default schedule object
 */
function generateDefaultSchedule() {
    const schedule = {};
    const today = new Date();

    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);

        // Format as DD-MM-YYYY
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const dateKey = `${day}-${month}-${year}`;

        schedule[dateKey] = {
            Team_A: {
                assigned_workers: [],
                addresses: []
            },
            Team_B: {
                assigned_workers: [],
                addresses: []
            }
        };
    }

    return schedule;
}

/**
 * Read schedule from Blobs, or return default template
 * @param {Object} context - Netlify context for Blobs authentication
 * @returns {Object} Schedule data
 */
async function readSchedule(context) {
    try {
        // Get the blob store for this site with context
        const store = getStore({ name: 'abra-data', context });

        // Retrieve schedule from blob storage
        let schedule = await store.get('schedule', { type: 'json' });

        // If no schedule exists, generate default
        if (!schedule || Object.keys(schedule).length === 0) {
            console.log('Schedule not found in Blobs, generating default template');
            return generateDefaultSchedule();
        }

        // Ensure each team entry has assigned_workers array
        Object.keys(schedule).forEach(dateKey => {
            Object.keys(schedule[dateKey]).forEach(teamKey => {
                const teamData = schedule[dateKey][teamKey];

                // If it's an array (old format), convert to new format
                if (Array.isArray(teamData)) {
                    schedule[dateKey][teamKey] = {
                        assigned_workers: [],
                        addresses: teamData
                    };
                }
                // If it's an object but missing assigned_workers, add it
                else if (typeof teamData === 'object' && !Array.isArray(teamData.assigned_workers)) {
                    teamData.assigned_workers = [];
                }
            });
        });

        return schedule;
    } catch (error) {
        console.error('Error reading schedule from Blobs:', error);
        return generateDefaultSchedule();
    }
}

/**
 * Netlify Function handler
 * @param {Object} event - Netlify event object
 * @param {Object} context - Netlify context (required for Blobs)
 * @returns {Object} HTTP response with schedule data
 */
exports.handler = async (event, context) => {
    try {
        // Only allow GET requests
        if (event.httpMethod !== 'GET') {
            return {
                statusCode: 405,
                body: JSON.stringify({ error: 'Method Not Allowed' })
            };
        }

        const schedule = await readSchedule(context);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(schedule, null, 2)
        };
    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: error.message
            })
        };
    }
};
