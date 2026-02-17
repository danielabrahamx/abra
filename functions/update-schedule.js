/**
 * update-schedule.js - Netlify Function to add jobs to the schedule
 * Uses the Read-Modify-Write pattern to safely update schedule.json
 * Accepts POST request with Address + Selected Workers
 * Validates inputs against Data Dictionary and ensures status defaults to 'pending'
 */

const fs = require('fs');
const path = require('path');
const { generateUUID, buildMapsURL, WORKER_ROSTER } = require('./lib/utils');

// Path to data files
const SCHEDULE_PATH = path.join(__dirname, '..', 'data', 'schedule.json');
const CLIENTS_PATH = path.join(__dirname, '..', 'data', 'clients.json');

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
 * Read clients from file
 * @returns {Array} Clients array
 */
function readClients() {
    try {
        if (!fs.existsSync(CLIENTS_PATH)) return [];
        const data = fs.readFileSync(CLIENTS_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading clients:', error);
        throw new Error('Failed to read clients data');
    }
}

/**
 * Write clients to file
 * @param {Array} clients - Clients array to write
 */
function writeClients(clients) {
    try {
        const data = JSON.stringify(clients, null, 4);
        fs.writeFileSync(CLIENTS_PATH, data, 'utf8');
    } catch (error) {
        console.error('Error writing clients:', error);
        throw new Error('Failed to write clients data');
    }
}

/**
 * Read schedule from file
 * @returns {Object} Schedule data
 */
function readSchedule() {
    try {
        if (!fs.existsSync(SCHEDULE_PATH)) {
            return {};
        }

        const data = fs.readFileSync(SCHEDULE_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading schedule:', error);
        throw new Error('Failed to read schedule data');
    }
}

/**
 * Write schedule to file
 * @param {Object} schedule - Schedule data to write
 */
function writeSchedule(schedule) {
    try {
        const data = JSON.stringify(schedule, null, 4);
        fs.writeFileSync(SCHEDULE_PATH, data, 'utf8');
    } catch (error) {
        console.error('Error writing schedule:', error);
        throw new Error('Failed to write schedule data');
    }
}

/**
 * Add a job to the schedule using Read-Modify-Write pattern
 * @param {string} date - Date in DD-MM-YYYY format
 * @param {string} teamId - Team identifier (Team_A or Team_B)
 * @param {Object} address - Address object with street and house_number
 * @param {Array<string>} selectedWorkers - Array of worker names
 * @returns {Object} Created job with generated id and maps_url
 */
function addJob(date, teamId, address, selectedWorkers) {
    // STEP 1: READ
    const schedule = readSchedule();

    // Ensure date exists in schedule
    if (!schedule[date]) {
        schedule[date] = {
            Team_A: { assigned_workers: [], addresses: [] },
            Team_B: { assigned_workers: [], addresses: [] }
        };
    }

    // Ensure team exists for the date
    if (!schedule[date][teamId]) {
        schedule[date][teamId] = { assigned_workers: [], addresses: [] };
    }

    // Ensure arrays exist
    if (!Array.isArray(schedule[date][teamId].assigned_workers)) {
        schedule[date][teamId].assigned_workers = [];
    }
    if (!Array.isArray(schedule[date][teamId].addresses)) {
        schedule[date][teamId].addresses = [];
    }

    // STEP 2: MODIFY
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
    schedule[date][teamId].addresses.push(job);

    // Update assigned workers if provided
    if (selectedWorkers && selectedWorkers.length > 0) {
        schedule[date][teamId].assigned_workers = selectedWorkers;
    }

    // STEP 3: WRITE
    writeSchedule(schedule);

    return job;
}

/**
 * Update assigned workers for a team on a specific date
 * Uses Read-Modify-Write pattern
 * @param {string} date - Date in DD-MM-YYYY format
 * @param {string} teamId - Team identifier (Team_A or Team_B)
 * @param {Array<string>} assignedWorkers - Array of worker names
 * @returns {Object} Updated team data
 */
function updateWorkers(date, teamId, assignedWorkers) {
    // STEP 1: READ
    const schedule = readSchedule();

    // Ensure date exists in schedule
    if (!schedule[date]) {
        schedule[date] = {
            Team_A: { assigned_workers: [], addresses: [] },
            Team_B: { assigned_workers: [], addresses: [] }
        };
    }

    // Ensure team exists for the date
    if (!schedule[date][teamId]) {
        schedule[date][teamId] = { assigned_workers: [], addresses: [] };
    }

    // STEP 2: MODIFY
    schedule[date][teamId].assigned_workers = assignedWorkers;

    // STEP 3: WRITE
    writeSchedule(schedule);

    return {
        date,
        team_id: teamId,
        assigned_workers: schedule[date][teamId].assigned_workers
    };
}

/**
 * Cancel a job (soft-delete) by setting its status to 'cancelled'
 * Uses Read-Modify-Write pattern
 * @param {string} date - Date in DD-MM-YYYY format
 * @param {string} teamId - Team identifier (Team_A or Team_B)
 * @param {string} jobId - UUID of the job to cancel
 * @returns {Object} Updated job object
 */
function cancelJob(date, teamId, jobId) {
    // STEP 1: READ
    const schedule = readSchedule();

    // Validate date/team exist
    if (!schedule[date] || !schedule[date][teamId]) {
        throw new Error(`No schedule entry found for ${date} / ${teamId}`);
    }

    const addresses = schedule[date][teamId].addresses;
    if (!Array.isArray(addresses)) {
        throw new Error('No addresses array found for this team/date');
    }

    // Find the job by ID
    const job = addresses.find(a => a.id === jobId);
    if (!job) {
        throw new Error(`Job with id "${jobId}" not found`);
    }

    if (job.status === 'cancelled') {
        return job; // Already cancelled, no-op
    }

    // STEP 2: MODIFY
    job.status = 'cancelled';

    // STEP 3: WRITE
    writeSchedule(schedule);

    return job;
}

/**
 * Netlify Function handler
 * Routes between "add-job" (default) and "update-workers" actions
 * @param {Object} event - Netlify event object
 * @returns {Object} HTTP response
 */
exports.handler = async (event) => {
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

            // Perform update
            const result = updateWorkers(date, team_id, assigned_workers);

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    message: 'Workers updated successfully',
                    ...result
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

            try {
                const updatedJob = cancelJob(date, team_id, job_id);

                return {
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify({
                        message: 'Job cancelled successfully',
                        job: updatedJob
                    })
                };
            } catch (err) {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ error: err.message })
                };
            }
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

            const clients = readClients();
            const newClient = {
                id: generateUUID(),
                name: name.trim(),
                street: street.trim(),
                house_number: house_number.trim(),
                notes: (notes && typeof notes === 'string') ? notes.trim() : ''
            };
            clients.push(newClient);
            writeClients(clients);

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

            const clients = readClients();
            const idx = clients.findIndex(c => c.id === client_id);
            if (idx === -1) {
                return { statusCode: 404, body: JSON.stringify({ error: `Client "${client_id}" not found.` }) };
            }
            const removed = clients.splice(idx, 1)[0];
            writeClients(clients);

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

        // Add job to schedule using Read-Modify-Write pattern
        const createdJob = addJob(date, team_id, address, selected_workers || []);

        return {
            statusCode: 201,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                message: 'Job added successfully',
                job: createdJob
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
