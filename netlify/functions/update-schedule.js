const redis = require('./lib/redis');
const { corsHeaders, generateGoogleMapsUrl } = require('./lib/utils');
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
        const action = params.get('action');
        const date = params.get('date');

        if (!date) {
            return { statusCode: 400, body: 'Date is required' };
        }

        const scheduleKey = `schedule:${date}`;
        let scheduleData = await redis.get(scheduleKey) || [];

        if (action === 'add-job') {
            const clientJsonStr = params.get('client');
            let clientData = {};
            try {
                clientData = JSON.parse(clientJsonStr);
            } catch (e) {
                return { statusCode: 400, body: 'Invalid client selection' };
            }

            const newJob = {
                id: crypto.randomUUID(),
                client_name: clientData.name,
                street: clientData.street,
                house_number: clientData.house_number,
                postcode: params.get('postcode') || '',
                maps_url: generateGoogleMapsUrl(clientData.street, clientData.house_number, params.get('postcode') || ''),
                time_interval: params.get('time_interval'),
                notes: clientData.notes,
                status: 'pending',
                assigned_workers: []
            };

            scheduleData.push(newJob);
            await redis.set(scheduleKey, scheduleData);

            // We trigger an event rather than sending back just one card because the manager 
            // will likely need the whole column re-rendered to keep sorted states clean.
            return {
                statusCode: 200,
                headers: {
                    ...corsHeaders(),
                    'HX-Trigger': `{"scheduleUpdated": {"date": "${date}"}}`
                },
                body: '' // HX-Trigger handles reload
            };
        }
        else if (action === 'cancel') {
            const jobId = params.get('job_id');
            const jobIndex = scheduleData.findIndex(j => j.id === jobId);

            if (jobIndex > -1) {
                scheduleData[jobIndex].status = 'cancelled';
                await redis.set(scheduleKey, scheduleData);

                // Re-render just this job card
                scheduleData[jobIndex].date = date;

                // This relies on get-schedule render function logic. For speed, we just trigger reload
                return {
                    statusCode: 200,
                    headers: {
                        ...corsHeaders(),
                        'HX-Trigger': `{"scheduleUpdated": {"date": "${date}"}}`
                    },
                    body: ''
                };
            }
            return { statusCode: 404, body: 'Job not found' };
        }
        else if (action === 'update-workers') {
            const jobId = params.get('job_id');
            const workersJson = params.get('workers');

            const jobIndex = scheduleData.findIndex(j => j.id === jobId);

            if (jobIndex > -1) {
                scheduleData[jobIndex].assigned_workers = JSON.parse(workersJson || "[]");
                await redis.set(scheduleKey, scheduleData);

                return {
                    statusCode: 200,
                    headers: corsHeaders(),
                    body: 'OK'
                };
            }
        }

        return { statusCode: 400, body: 'Invalid action' };

    } catch (error) {
        console.error('Error updating schedule:', error);
        return {
            statusCode: 500,
            headers: corsHeaders(),
            body: `Error updating schedule: ${error.message}`
        };
    }
};
