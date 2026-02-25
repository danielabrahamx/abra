/**
 * update-schedule.js - Netlify Function to manage schedule, clients, and recurring jobs
 * Uses Upstash Redis for persistent storage
 * Accepts POST request for various actions: add-job, update-workers, cancel-job, delete-job,
 * add-client, delete-client, add-recurring-job, edit-recurring-job, delete-recurring-job, cancel-recurring-instance
 */

const { readJSON, writeJSON } = require('./lib/redis-storage');
const { generateUUID, buildMapsURL, WORKER_ROSTER } = require('./lib/utils');

// Valid status values from Data Dictionary
const VALID_STATUSES = ['pending', 'completed', 'cancelled'];

/**
 * Validate date format (DD-MM-YYYY)
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
 */
function isValidTeam(teamId) {
    return teamId === 'Team_A' || teamId === 'Team_B';
}

/**
 * Validate worker names against roster
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
 * Validate address object
 */
function validateAddress(address) {
    if (!address || typeof address !== 'object') {
        return { valid: false, message: 'Address must be an object' };
    }
    if (!address.street || typeof address.street !== 'string') {
        return { valid: false, message: 'Address must have a valid "street" field (string)' };
    }
    if (!address.house_number || typeof address.house_number !== 'string') {
        return { valid: false, message: 'Address must have a valid "house_number" field (string)' };
    }
    if (address.status && !VALID_STATUSES.includes(address.status)) {
        return { valid: false, message: `Invalid status "${address.status}". Must be one of: ${VALID_STATUSES.join(', ')}` };
    }
    return { valid: true };
}

// ─── CORS helper ─────────────────────────────────────────────
function corsHeaders() {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    };
}

/**
 * Netlify Function handler
 */
exports.handler = async (event, context) => {
    // CORS preflight
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
        if (event.httpMethod !== 'POST') {
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed. Use POST.' }) };
        }

        let body;
        try {
            body = JSON.parse(event.body);
        } catch (error) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON in request body' }) };
        }

        const action = body.action || 'add-job';

        // ─── ACTION: update-workers ───────────────────────────────
        if (action === 'update-workers') {
            const { date, team_id, assigned_workers } = body;

            if (!isValidDate(date)) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Invalid or missing "date" field. Must be in DD-MM-YYYY format.' }) };
            }
            if (!isValidTeam(team_id)) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Invalid or missing "team_id" field. Must be "Team_A" or "Team_B".' }) };
            }
            if (!Array.isArray(assigned_workers)) {
                return { statusCode: 400, body: JSON.stringify({ error: '"assigned_workers" must be an array of worker names.' }) };
            }
            const workersValidation = validateWorkers(assigned_workers);
            if (!workersValidation.valid) {
                return { statusCode: 400, body: JSON.stringify({ error: workersValidation.message }) };
            }

            const schedule = await readJSON('data/schedule.json');
            if (!schedule[date]) {
                schedule[date] = { Team_A: { assigned_workers: [], addresses: [] }, Team_B: { assigned_workers: [], addresses: [] } };
            }
            if (!schedule[date][team_id]) {
                schedule[date][team_id] = { assigned_workers: [], addresses: [] };
            }
            schedule[date][team_id].assigned_workers = assigned_workers;
            await writeJSON('data/schedule.json', schedule, `Update workers for ${team_id} on ${date}`);

            return {
                statusCode: 200,
                headers: corsHeaders(),
                body: JSON.stringify({ message: 'Workers updated successfully', date, team_id, assigned_workers })
            };
        }

        // ─── ACTION: clear-schedule-assignments ──────────────────
        if (action === 'clear-schedule-assignments') {
            const { dates } = body;
            if (!Array.isArray(dates) || dates.length === 0) {
                return { statusCode: 400, body: JSON.stringify({ error: '"dates" must be a non-empty array of DD-MM-YYYY strings.' }) };
            }

            const schedule = await readJSON('data/schedule.json');
            let modified = false;
            for (const date of dates) {
                if (schedule[date]) {
                    if (schedule[date].Team_A) schedule[date].Team_A.assigned_workers = [];
                    if (schedule[date].Team_B) schedule[date].Team_B.assigned_workers = [];
                    modified = true;
                }
            }
            if (modified) {
                await writeJSON('data/schedule.json', schedule, `Clear assignments for ${dates.length} days`);
            }

            return {
                statusCode: 200,
                headers: corsHeaders(),
                body: JSON.stringify({ message: 'Assignments cleared successfully' })
            };
        }

        // ─── ACTION: delete-job ──────────────────────────────────
        if (action === 'delete-job') {
            const { date, team_id, job_id } = body;
            if (!isValidDate(date) || !isValidTeam(team_id) || !job_id) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Invalid parameters for delete-job' }) };
            }

            const schedule = await readJSON('data/schedule.json');
            if (!schedule[date] || !schedule[date][team_id] || !schedule[date][team_id].addresses) {
                return { statusCode: 404, body: JSON.stringify({ error: 'Schedule or job not found' }) };
            }

            const addresses = schedule[date][team_id].addresses;
            const idx = addresses.findIndex(j => j.id === job_id);
            if (idx === -1) {
                return { statusCode: 404, body: JSON.stringify({ error: 'Job not found' }) };
            }

            const removedJob = addresses.splice(idx, 1)[0];
            await writeJSON('data/schedule.json', schedule, `Delete job ${job_id}`);

            return {
                statusCode: 200,
                headers: corsHeaders(),
                body: JSON.stringify({ message: 'Job deleted successfully', job: removedJob })
            };
        }

        // ─── ACTION: cancel-job ───────────────────────────────────
        if (action === 'cancel-job') {
            const { date, team_id, job_id } = body;
            if (!isValidDate(date)) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Invalid or missing "date" field.' }) };
            }
            if (!isValidTeam(team_id)) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Invalid or missing "team_id" field.' }) };
            }
            if (!job_id || typeof job_id !== 'string') {
                return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid "job_id" field.' }) };
            }

            const schedule = await readJSON('data/schedule.json');
            if (!schedule[date] || !schedule[date][team_id]) {
                return { statusCode: 404, body: JSON.stringify({ error: `No schedule entry found for ${date} / ${team_id}` }) };
            }

            const addresses = schedule[date][team_id].addresses;
            if (!Array.isArray(addresses)) {
                return { statusCode: 404, body: JSON.stringify({ error: 'No addresses array found for this team/date' }) };
            }

            const job = addresses.find(a => a.id === job_id);
            if (!job) {
                return { statusCode: 404, body: JSON.stringify({ error: `Job with id "${job_id}" not found` }) };
            }

            if (job.status !== 'cancelled') {
                job.status = 'cancelled';
                await writeJSON('data/schedule.json', schedule, `Cancel job ${job_id}`);
            }

            return {
                statusCode: 200,
                headers: corsHeaders(),
                body: JSON.stringify({ message: 'Job cancelled successfully', job })
            };
        }

        // ─── ACTION: add-client ──────────────────────────────────
        if (action === 'add-client') {
            const { name, street, house_number, notes, expected_hours, default_frequency, default_time_interval } = body;
            if (!name || typeof name !== 'string' || !name.trim()) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Client "name" is required.' }) };
            }
            if (!street || typeof street !== 'string' || !street.trim()) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Client "street" is required.' }) };
            }
            if (!house_number || typeof house_number !== 'string' || !house_number.trim()) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Client "house_number" is required.' }) };
            }

            let clients = await readJSON('data/clients.json');
            if (!Array.isArray(clients)) clients = [];
            const newClient = {
                id: generateUUID(),
                name: name.trim(),
                street: street.trim(),
                house_number: house_number.trim(),
                notes: (notes && typeof notes === 'string') ? notes.trim() : '',
                expected_hours: parseFloat(expected_hours) || 0,
                default_frequency: ['none', 'weekly', 'fortnightly'].includes(default_frequency) ? default_frequency : 'none',
                default_time_interval: (default_time_interval && typeof default_time_interval === 'string') ? default_time_interval.trim() : ''
            };
            clients.push(newClient);
            await writeJSON('data/clients.json', clients, `Add client: ${newClient.name}`);

            return {
                statusCode: 201,
                headers: corsHeaders(),
                body: JSON.stringify({ message: 'Client added successfully', client: newClient })
            };
        }

        // ─── ACTION: delete-client ───────────────────────────────
        if (action === 'delete-client') {
            const { client_id } = body;
            if (!client_id || typeof client_id !== 'string') {
                return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid "client_id".' }) };
            }

            let clients = await readJSON('data/clients.json');
            if (!Array.isArray(clients)) clients = [];
            const idx = clients.findIndex(c => c.id === client_id);
            if (idx === -1) {
                return { statusCode: 404, body: JSON.stringify({ error: `Client "${client_id}" not found.` }) };
            }
            const removed = clients.splice(idx, 1)[0];
            await writeJSON('data/clients.json', clients, `Delete client: ${removed.name}`);

            return {
                statusCode: 200,
                headers: corsHeaders(),
                body: JSON.stringify({ message: 'Client deleted successfully', client: removed })
            };
        }

        // ─── ACTION: edit-client ─────────────────────────────────
        if (action === 'edit-client') {
            const { client_id, name, street, house_number, notes, expected_hours, default_frequency, default_time_interval } = body;
            if (!client_id || typeof client_id !== 'string') {
                return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid "client_id".' }) };
            }

            let clients = await readJSON('data/clients.json');
            if (!Array.isArray(clients)) clients = [];
            const client = clients.find(c => c.id === client_id);
            if (!client) {
                return { statusCode: 404, body: JSON.stringify({ error: `Client "${client_id}" not found.` }) };
            }

            if (name && typeof name === 'string') client.name = name.trim();
            if (street && typeof street === 'string') client.street = street.trim();
            if (house_number && typeof house_number === 'string') client.house_number = house_number.trim();
            if (notes !== undefined) client.notes = (typeof notes === 'string') ? notes.trim() : '';
            if (expected_hours !== undefined) client.expected_hours = parseFloat(expected_hours) || 0;
            if (default_frequency !== undefined) client.default_frequency = ['none', 'weekly', 'fortnightly'].includes(default_frequency) ? default_frequency : 'none';
            if (default_time_interval !== undefined) client.default_time_interval = (typeof default_time_interval === 'string') ? default_time_interval.trim() : '';

            await writeJSON('data/clients.json', clients, `Edit client: ${client.name}`);

            return {
                statusCode: 200,
                headers: corsHeaders(),
                body: JSON.stringify({ message: 'Client updated successfully', client })
            };
        }
        if (action === 'add-recurring-job') {
            const { client_name, street, house_number, notes, team_id, start_date, frequency, time_interval, expected_hours } = body;

            if (!street || !house_number || !team_id || !start_date || !frequency) {
                return { statusCode: 400, body: JSON.stringify({ error: 'street, house_number, team_id, start_date, and frequency are required.' }) };
            }
            if (!isValidDate(start_date)) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Invalid start_date. Must be DD-MM-YYYY.' }) };
            }
            if (!isValidTeam(team_id)) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Invalid team_id.' }) };
            }
            if (!['weekly', 'fortnightly'].includes(frequency)) {
                return { statusCode: 400, body: JSON.stringify({ error: 'frequency must be "weekly" or "fortnightly".' }) };
            }

            let recurringJobs = await readJSON('data/recurring-jobs.json');
            if (!Array.isArray(recurringJobs)) recurringJobs = [];
            const newRule = {
                id: generateUUID(),
                client_name: (client_name || '').trim(),
                street: street.trim(),
                house_number: house_number.trim(),
                notes: (notes || '').trim(),
                team_id,
                start_date,
                frequency,
                time_interval: (time_interval || '').trim(),
                expected_hours: parseFloat(expected_hours) || 0,
                exceptions: [],
                paused: false,
                created_at: new Date().toISOString()
            };
            recurringJobs.push(newRule);
            await writeJSON('data/recurring-jobs.json', recurringJobs, `Add recurring job: ${newRule.client_name}`);

            return {
                statusCode: 201,
                headers: corsHeaders(),
                body: JSON.stringify({ message: 'Recurring job created', rule: newRule })
            };
        }

        // ─── ACTION: edit-recurring-job ──────────────────────────
        if (action === 'edit-recurring-job') {
            const { rule_id } = body;
            if (!rule_id) {
                return { statusCode: 400, body: JSON.stringify({ error: 'rule_id is required.' }) };
            }

            let recurringJobs = await readJSON('data/recurring-jobs.json');
            if (!Array.isArray(recurringJobs)) recurringJobs = [];
            const rule = recurringJobs.find(r => r.id === rule_id);
            if (!rule) {
                return { statusCode: 404, body: JSON.stringify({ error: `Recurring job "${rule_id}" not found.` }) };
            }

            // Update mutable fields
            if (body.client_name !== undefined) rule.client_name = body.client_name.trim();
            if (body.street !== undefined) rule.street = body.street.trim();
            if (body.house_number !== undefined) rule.house_number = body.house_number.trim();
            if (body.notes !== undefined) rule.notes = (body.notes || '').trim();
            if (body.team_id !== undefined && isValidTeam(body.team_id)) rule.team_id = body.team_id;
            if (body.frequency !== undefined && ['weekly', 'fortnightly'].includes(body.frequency)) rule.frequency = body.frequency;
            if (body.time_interval !== undefined) rule.time_interval = body.time_interval.trim();
            if (body.expected_hours !== undefined) rule.expected_hours = parseFloat(body.expected_hours) || 0;
            if (body.paused !== undefined) rule.paused = !!body.paused;

            await writeJSON('data/recurring-jobs.json', recurringJobs, `Edit recurring job: ${rule.client_name}`);

            return {
                statusCode: 200,
                headers: corsHeaders(),
                body: JSON.stringify({ message: 'Recurring job updated', rule })
            };
        }

        // ─── ACTION: delete-recurring-job ────────────────────────
        if (action === 'delete-recurring-job') {
            const { rule_id } = body;
            if (!rule_id) {
                return { statusCode: 400, body: JSON.stringify({ error: 'rule_id is required.' }) };
            }

            let recurringJobs = await readJSON('data/recurring-jobs.json');
            if (!Array.isArray(recurringJobs)) recurringJobs = [];
            const idx = recurringJobs.findIndex(r => r.id === rule_id);
            if (idx === -1) {
                return { statusCode: 404, body: JSON.stringify({ error: `Recurring job "${rule_id}" not found.` }) };
            }
            const removed = recurringJobs.splice(idx, 1)[0];
            await writeJSON('data/recurring-jobs.json', recurringJobs, `Delete recurring job: ${removed.client_name}`);

            return {
                statusCode: 200,
                headers: corsHeaders(),
                body: JSON.stringify({ message: 'Recurring job deleted', rule: removed })
            };
        }

        // ─── ACTION: cancel-recurring-instance ───────────────────
        if (action === 'cancel-recurring-instance') {
            const { rule_id, date } = body;
            if (!rule_id || !isValidDate(date)) {
                return { statusCode: 400, body: JSON.stringify({ error: 'rule_id and valid date are required.' }) };
            }

            let recurringJobs = await readJSON('data/recurring-jobs.json');
            if (!Array.isArray(recurringJobs)) recurringJobs = [];
            const rule = recurringJobs.find(r => r.id === rule_id);
            if (!rule) {
                return { statusCode: 404, body: JSON.stringify({ error: `Recurring job "${rule_id}" not found.` }) };
            }

            if (!rule.exceptions) rule.exceptions = [];
            if (!rule.exceptions.includes(date)) {
                rule.exceptions.push(date);
            }
            await writeJSON('data/recurring-jobs.json', recurringJobs, `Cancel recurring instance on ${date}`);

            return {
                statusCode: 200,
                headers: corsHeaders(),
                body: JSON.stringify({ message: `Recurring instance cancelled for ${date}`, rule })
            };
        }

        // ─── ACTION: add-job (default) ────────────────────────────
        const { date, team_id, address, time_interval, selected_workers, expected_hours } = body;

        if (!isValidDate(date)) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid or missing "date" field. Must be in DD-MM-YYYY format.' }) };
        }
        if (!isValidTeam(team_id)) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid or missing "team_id" field. Must be "Team_A" or "Team_B".' }) };
        }

        const addressValidation = validateAddress(address);
        if (!addressValidation.valid) {
            return { statusCode: 400, body: JSON.stringify({ error: addressValidation.message }) };
        }

        if (selected_workers) {
            const workersValidation = validateWorkers(selected_workers);
            if (!workersValidation.valid) {
                return { statusCode: 400, body: JSON.stringify({ error: workersValidation.message }) };
            }
        }

        const schedule = await readJSON('data/schedule.json');
        if (!schedule[date]) {
            schedule[date] = { Team_A: { assigned_workers: [], addresses: [] }, Team_B: { assigned_workers: [], addresses: [] } };
        }
        if (!schedule[date][team_id]) {
            schedule[date][team_id] = { assigned_workers: [], addresses: [] };
        }
        if (!Array.isArray(schedule[date][team_id].assigned_workers)) {
            schedule[date][team_id].assigned_workers = [];
        }
        if (!Array.isArray(schedule[date][team_id].addresses)) {
            schedule[date][team_id].addresses = [];
        }

        const job = {
            id: generateUUID(),
            street: address.street,
            house_number: address.house_number,
            status: address.status || 'pending',
            maps_url: buildMapsURL(address.street, address.house_number),
            expected_hours: parseFloat(expected_hours) || 0
        };

        if (address.client_name) job.client_name = address.client_name;
        if (address.notes) job.notes = address.notes;
        if (time_interval) job.time_interval = time_interval;

        schedule[date][team_id].addresses.push(job);

        if (selected_workers && selected_workers.length > 0) {
            schedule[date][team_id].assigned_workers = selected_workers;
        }

        await writeJSON('data/schedule.json', schedule, `Add job: ${job.house_number} ${job.street}`);

        return {
            statusCode: 201,
            headers: corsHeaders(),
            body: JSON.stringify({ message: 'Job added successfully', job })
        };

    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error', message: error.message })
        };
    }
};
