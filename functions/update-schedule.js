/**
 * update-schedule.js - Netlify Function to manage schedule and clients
 * Uses GitHub API for persistent storage (replaces Netlify Blobs)
 * Accepts POST request for various actions: add-job, update-workers, cancel-job, add-client, delete-client
 * Validates inputs against Data Dictionary and ensures status defaults to 'pending'
 */

const { readJSON, writeJSON } = require('./lib/github-storage');
const { generateUUID, buildMapsURL, WORKER_ROSTER } = require('./lib/utils');

// Valid status values from Data Dictionary
const VALID_STATUSES = ['pending', 'completed', 'cancelled'];

/**
 * Validate date format (DD-MM-YYYY)
 * @param {string} dateStr - Date string to validate
 * @returns {boolean} True if valid format
 */
function isValidDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return false;
    const regex = /^\d{2}-\d{2}-\d{4}$/;
    if (!regex.test(dateStr)) return false;

    const [day, month, year] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getDate() === day && date.getMonth() === month - 1 && date.getFullYear() === year;
}

/**
 * Validate team ID
 * @param {string} teamId - Team identifier to validate
 * @returns {boolean} True if valid team
 */
function isValidTeam(teamId) {
    return teamId === 'Team_A' || teamId === 'Team_B';
}

/**
 * Validate worker names against roster
 * @param {Array<string>} workers - Array of worker names
 * @returns {Object} { valid: boolean, message: string }
 */
function validateWorkers(workers) {
    if (!Array.isArray(workers)) {
        return { valid: false, message: 'Selected workers must be an array' };
    }

    for (const worker of workers) {
        if (!WORKER_ROSTER.includes(worker)) {
            return { valid: false, message: `Invalid worker name: ${worker}. Must be one of: ${WORKER_ROSTER.join(', ')}` };
        }
    }

    return { valid: true };
}

/**
 * Validate address object against Data Dictionary
 * @param {Object} address - Address object to validate
 * @returns {Object} { valid: boolean, message: string }
 */
function validateAddress(address) {
    if (!address || typeof address !== 'object') {
        return { valid: false, message: 'Address must be an object' };
    }

    // Required fields
    if (!address.street || typeof address.street !== 'string') {
        return { valid: false, message: 'Address must have a valid "street" field (string)' };
    }

    if (!address.house_number || typeof address.house_number !== 'string') {
        return { valid: false, message: 'Address must have a valid "house_number" field (string)' };
    }

    // Optional status field - validate if present
    if (address.status && !VALID_STATUSES.includes(address.status)) {
        return { valid: false, message: `Invalid status "${address.status}". Must be one of: ${VALID_STATUSES.join(', ')}` };
    }

    return { valid: true };
}

/**
 * Netlify Function handler
 * Routes between different actions
 * @param {Object} event - Netlify event object
 * @returns {Object} HTTP response
 */
exports.handler = async (event, context) => {
    // CORS preflight support
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    try {
        // Only allow POST requests
        if (event.httpMethod !== 'POST') {
            return {
                statusCode: 405,
                body: JSON.stringify({ error: 'Method Not Allowed. Use POST.' })
            };
        }

        // Parse request body
        let body;
        try {
            body = JSON.parse(event.body);
        } catch (error) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid JSON in request body' })
            };
        }

        // Determine action (default to "add-job" for backwards compatibility)
        const action = body.action || 'add-job';

        // ─── ACTION: update-workers ───────────────────────────────
        if (action === 'update-workers') {
            const { date, team_id, assigned_workers } = body;

            // Validate date
            if (!isValidDate(date)) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        error: 'Invalid or missing "date" field. Must be in DD-MM-YYYY format.'
                    })
                };
            }

            // Validate team_id
            if (!isValidTeam(team_id)) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        error: 'Invalid or missing "team_id" field. Must be "Team_A" or "Team_B".'
                    })
                };
            }

            // Validate assigned_workers
            if (!Array.isArray(assigned_workers)) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        error: '"assigned_workers" must be an array of worker names.'
                    })
                };
            }

            const workersValidation = validateWorkers(assigned_workers);
            if (!workersValidation.valid) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: workersValidation.message })
                };
            }

            // Read-Modify-Write
            const schedule = await readJSON('data/schedule.json');

            // Ensure date exists in schedule
            if (!schedule[date]) {
                schedule[date] = {
                    Team_A: { assigned_workers: [], addresses: [] },
                    Team_B: { assigned_workers: [], addresses: [] }
                };
            }

            // Ensure team exists for the date
            if (!schedule[date][team_id]) {
                schedule[date][team_id] = { assigned_workers: [], addresses: [] };
            }

            // Update workers
            schedule[date][team_id].assigned_workers = assigned_workers;

            // Write back
            await writeJSON('data/schedule.json', schedule, `Update workers for ${team_id} on ${date}`);

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    message: 'Workers updated successfully',
                    date,
                    team_id,
                    assigned_workers
                })
            };
        }

        // ─── ACTION: cancel-job ───────────────────────────────────
        if (action === 'cancel-job') {
            const { date, team_id, job_id } = body;

            // Validate date
            if (!isValidDate(date)) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        error: 'Invalid or missing "date" field. Must be in DD-MM-YYYY format.'
                    })
                };
            }

            // Validate team_id
            if (!isValidTeam(team_id)) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        error: 'Invalid or missing "team_id" field. Must be "Team_A" or "Team_B".'
                    })
                };
            }

            // Validate job_id
            if (!job_id || typeof job_id !== 'string') {
                return {
                    statusCode: 400,
                    body: JSON.stringify({
                        error: 'Missing or invalid "job_id" field. Must be a string UUID.'
                    })
                };
            }

            // Read-Modify-Write
            const schedule = await readJSON('data/schedule.json');

            // Validate date/team exist
            if (!schedule[date] || !schedule[date][team_id]) {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ error: `No schedule entry found for ${date} / ${team_id}` })
                };
            }

            const addresses = schedule[date][team_id].addresses;
            if (!Array.isArray(addresses)) {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ error: 'No addresses array found for this team/date' })
                };
            }

            // Find the job by ID
            const job = addresses.find(a => a.id === job_id);
            if (!job) {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ error: `Job with id "${job_id}" not found` })
                };
            }

            if (job.status !== 'cancelled') {
                job.status = 'cancelled';
                await writeJSON('data/schedule.json', schedule, `Cancel job ${job_id}`);
            }

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    message: 'Job cancelled successfully',
                    job
                })
            };
        }

        // ─── ACTION: add-client ──────────────────────────────────
        if (action === 'add-client') {
            const { name, street, house_number, notes } = body;

            if (!name || typeof name !== 'string' || !name.trim()) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Client "name" is required.' }) };
            }
            if (!street || typeof street !== 'string' || !street.trim()) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Client "street" is required.' }) };
            }
            if (!house_number || typeof house_number !== 'string' || !house_number.trim()) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Client "house_number" is required.' }) };
            }

            const clients = await readJSON('data/clients.json');
            const newClient = {
                id: generateUUID(),
                name: name.trim(),
                street: street.trim(),
                house_number: house_number.trim(),
                notes: (notes && typeof notes === 'string') ? notes.trim() : ''
            };
            clients.push(newClient);
            await writeJSON('data/clients.json', clients, `Add client: ${newClient.name}`);

            return {
                statusCode: 201,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ message: 'Client added successfully', client: newClient })
            };
        }

        // ─── ACTION: delete-client ───────────────────────────────
        if (action === 'delete-client') {
            const { client_id } = body;
            if (!client_id || typeof client_id !== 'string') {
                return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid "client_id".' }) };
            }

            const clients = await readJSON('data/clients.json');
            const idx = clients.findIndex(c => c.id === client_id);
            if (idx === -1) {
                return { statusCode: 404, body: JSON.stringify({ error: `Client "${client_id}" not found.` }) };
            }
            const removed = clients.splice(idx, 1)[0];
            await writeJSON('data/clients.json', clients, `Delete client: ${removed.name}`);

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ message: 'Client deleted successfully', client: removed })
            };
        }

        // ─── ACTION: add-job (default) ────────────────────────────
        const { date, team_id, address, selected_workers } = body;

        // Validate date
        if (!isValidDate(date)) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: 'Invalid or missing "date" field. Must be in DD-MM-YYYY format.'
                })
            };
        }

        // Validate team_id
        if (!isValidTeam(team_id)) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: 'Invalid or missing "team_id" field. Must be "Team_A" or "Team_B".'
                })
            };
        }

        // Validate address against Data Dictionary
        const addressValidation = validateAddress(address);
        if (!addressValidation.valid) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: addressValidation.message })
            };
        }

        // Validate selected workers if provided
        if (selected_workers) {
            const workersValidation = validateWorkers(selected_workers);
            if (!workersValidation.valid) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ error: workersValidation.message })
                };
            }
        }

        // Read-Modify-Write
        const schedule = await readJSON('data/schedule.json');

        // Ensure date exists in schedule
        if (!schedule[date]) {
            schedule[date] = {
                Team_A: { assigned_workers: [], addresses: [] },
                Team_B: { assigned_workers: [], addresses: [] }
            };
        }

        // Ensure team exists for the date
        if (!schedule[date][team_id]) {
            schedule[date][team_id] = { assigned_workers: [], addresses: [] };
        }

        // Ensure arrays exist
        if (!Array.isArray(schedule[date][team_id].assigned_workers)) {
            schedule[date][team_id].assigned_workers = [];
        }
        if (!Array.isArray(schedule[date][team_id].addresses)) {
            schedule[date][team_id].addresses = [];
        }

        // Create job object with all required fields from Data Dictionary
        const job = {
            id: generateUUID(),
            street: address.street,
            house_number: address.house_number,
            status: address.status || 'pending', // Default to 'pending'
            maps_url: buildMapsURL(address.street, address.house_number)
        };

        // Attach client info when job is created from a saved client
        if (address.client_name) job.client_name = address.client_name;
        if (address.notes) job.notes = address.notes;

        // Add job to addresses array
        schedule[date][team_id].addresses.push(job);

        // Update assigned workers if provided
        if (selected_workers && selected_workers.length > 0) {
            schedule[date][team_id].assigned_workers = selected_workers;
        }

        // Write back
        await writeJSON('data/schedule.json', schedule, `Add job: ${job.house_number} ${job.street}`);

        return {
            statusCode: 201,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                message: 'Job added successfully',
                job
            })
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
