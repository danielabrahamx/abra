/**
 * get-schedule.js - Netlify Function to retrieve schedule data
 * Returns schedule from Redis with support for assigned_workers arrays
 * Generates default 7-day template if schedule is missing/empty
 * Projects recurring jobs onto the requested date range
 */

const { readJSON } = require('./lib/redis-storage');

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
 * Parse a DD-MM-YYYY string into a Date object
 */
function parseDateKey(dateKey) {
    const [day, month, year] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day);
}

/**
 * Format a Date as DD-MM-YYYY
 */
function formatDateKey(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

/**
 * Project recurring jobs onto the schedule for the requested dates
 * @param {Object} schedule - The base schedule
 * @param {Array} recurringJobs - List of recurring job templates
 * @param {Array} requestedDateKeys - Array of DD-MM-YYYY strings for the requested week
 * @returns {Object} Schedule with recurring jobs merged in
 */
function projectRecurringJobs(schedule, recurringJobs, requestedDateKeys) {
    if (!recurringJobs || recurringJobs.length === 0) return schedule;

    for (const rule of recurringJobs) {
        if (rule.paused) continue;

        const startDate = parseDateKey(rule.start_date);
        const dayOfWeek = startDate.getDay(); // 0=Sun, 1=Mon, ...
        const intervalDays = rule.frequency === 'fortnightly' ? 14 : 7;

        for (const dateKey of requestedDateKeys) {
            const currentDate = parseDateKey(dateKey);

            // Must match the same day of week
            if (currentDate.getDay() !== dayOfWeek) continue;

            // Must be on or after the start date
            const diffMs = currentDate.getTime() - startDate.getTime();
            if (diffMs < 0) continue;

            // Check interval alignment
            const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
            if (diffDays % intervalDays !== 0) continue;

            // Check if this specific occurrence is in the exceptions list
            const exceptions = rule.exceptions || [];
            if (exceptions.includes(dateKey)) continue;

            // Project this recurring job onto the schedule
            const teamId = rule.team_id;
            if (!schedule[dateKey]) {
                schedule[dateKey] = {
                    Team_A: { assigned_workers: [], addresses: [] },
                    Team_B: { assigned_workers: [], addresses: [] }
                };
            }
            if (!schedule[dateKey][teamId]) {
                schedule[dateKey][teamId] = { assigned_workers: [], addresses: [] };
            }
            if (!Array.isArray(schedule[dateKey][teamId].addresses)) {
                schedule[dateKey][teamId].addresses = [];
            }

            // Check if this recurring job is already manually placed on this date
            const alreadyExists = schedule[dateKey][teamId].addresses.some(
                a => a.recurring_id === rule.id
            );
            if (alreadyExists) continue;

            // Create the job instance from the recurring template
            const job = {
                id: `${rule.id}_${dateKey}`,
                recurring_id: rule.id,
                street: rule.street,
                house_number: rule.house_number,
                client_name: rule.client_name || '',
                notes: rule.notes || '',
                status: 'pending',
                time_interval: rule.time_interval || '',
                expected_hours: rule.expected_hours || 0,
                maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rule.house_number + ' ' + rule.street)}`,
                is_recurring: true,
                frequency: rule.frequency
            };

            schedule[dateKey][teamId].addresses.push(job);
        }
    }

    return schedule;
}

/**
 * Read schedule from Redis, or return default template
 * @returns {Object} Schedule data
 */
async function readSchedule() {
    try {
        console.log('get-schedule: reading from Redis...');
        let schedule = await readJSON('data/schedule.json');

        // If no schedule exists, generate default
        if (!schedule || Object.keys(schedule).length === 0) {
            console.log('Schedule not found, generating default template');
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
        console.error('Error reading schedule from Redis:', error);
        return generateDefaultSchedule();
    }
}

/**
 * Netlify Function handler
 * @param {Object} event - Netlify event object
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

        let schedule = await readSchedule();

        // Accept optional from/to query params to ensure date range has entries
        const params = event.queryStringParameters || {};
        if (params.from && params.to) {
            const fromDate = parseDateKey(params.from);
            const toDate = parseDateKey(params.to);
            if (!isNaN(fromDate) && !isNaN(toDate)) {
                const cursor = new Date(fromDate);
                while (cursor <= toDate) {
                    const dk = formatDateKey(cursor);
                    if (!schedule[dk]) {
                        schedule[dk] = {
                            Team_A: { assigned_workers: [], addresses: [] },
                            Team_B: { assigned_workers: [], addresses: [] }
                        };
                    }
                    cursor.setDate(cursor.getDate() + 1);
                }
            }
        }

        // Load recurring jobs and project them
        try {
            let recurringJobs = await readJSON('data/recurring-jobs.json');
            if (!Array.isArray(recurringJobs)) recurringJobs = [];
            if (recurringJobs.length > 0) {
                const dateKeys = Object.keys(schedule);
                schedule = projectRecurringJobs(schedule, recurringJobs, dateKeys);
            }
        } catch (err) {
            console.error('Error projecting recurring jobs:', err);
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
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
