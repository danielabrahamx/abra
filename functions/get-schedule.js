/**
 * get-schedule.js - Netlify Function to retrieve schedule data
 * Returns schedule.json with support for assigned_workers arrays
 * Generates default 7-day template if schedule is missing/empty
 */

const fs = require('fs');
const path = require('path');

// Path to schedule.json
const SCHEDULE_PATH = path.join(__dirname, '..', 'data', 'schedule.json');

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
 * Read schedule from file, or return default template
 * @returns {Object} Schedule data
 */
function readSchedule() {
    try {
        // Check if file exists
        if (!fs.existsSync(SCHEDULE_PATH)) {
            console.log('Schedule file not found, generating default template');
            return generateDefaultSchedule();
        }

        // Read and parse the file
        const data = fs.readFileSync(SCHEDULE_PATH, 'utf8');
        const schedule = JSON.parse(data);

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
        console.error('Error reading schedule:', error);
        return generateDefaultSchedule();
    }
}

/**
 * Netlify Function handler
 * @param {Object} event - Netlify event object
 * @returns {Object} HTTP response with schedule data
 */
exports.handler = async (event) => {
    try {
        // Only allow GET requests
        if (event.httpMethod !== 'GET') {
            return {
                statusCode: 405,
                body: JSON.stringify({ error: 'Method Not Allowed' })
            };
        }

        const schedule = readSchedule();

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
