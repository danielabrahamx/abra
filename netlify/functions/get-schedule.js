const redis = require('./lib/redis');
const { corsHeaders, generateGoogleMapsUrl } = require('./lib/utils');

const allWorkers = ["Amylea", "Angelo", "Chloe", "George", "Leeroy", "Myka", "Nathan", "Olivia", "Tracy"];

function renderJobCard(job, options) {
    const { isManager, isWorker } = options;
    const workerPills = (job.assigned_workers || []).map(w =>
        `<div class="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full flex items-center justify-center m-1 ${isManager ? 'cursor-grab' : ''}" data-worker="${w}">${w}</div>`
    ).join('');

    const unassignedWorkers = allWorkers.filter(w => !(job.assigned_workers || []).includes(w));

    let deleteBtn = '';
    let statusStyle = job.status === 'cancelled' ? 'opacity-50 line-through' : 'opacity-100';

    if (isManager && job.status !== 'cancelled') {
        deleteBtn = `
            <button hx-post="/.netlify/functions/update-schedule" 
                    hx-vals='{"action": "cancel", "job_id": "${job.id}", "date": "${job.date}"}' 
                    hx-target="#job-${job.id}" 
                    hx-swap="outerHTML" 
                    class="absolute top-2 right-2 text-red-500 hover:text-red-700 mt-2">
                <i data-lucide="x-circle" class="w-5 h-5"></i>
            </button>
        `;
    }

    let workerViewAdditions = '';
    if (isWorker) {
        // Navigation button touch target minimum 48x48px
        workerViewAdditions = `
            <a href="${job.maps_url}" target="_blank" class="mt-4 flex items-center justify-center w-full min-h-[48px] bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm transition-colors">
                 <i data-lucide="navigation" class="w-5 h-5 mr-2"></i> Launch Navigation
            </a>
        `;
    }

    return `
        <div id="job-${job.id}" class="relative bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-4 ${statusStyle} transition-all" data-job-id="${job.id}">
            ${deleteBtn}
            
            <div class="mb-2">
                <h4 class="font-bold text-slate-800 text-lg">${job.client_name}</h4>
                <p class="text-slate-600 text-sm flex items-center mt-1">
                    <i data-lucide="map-pin" class="w-4 h-4 mr-1 text-slate-400"></i>
                    ${job.house_number} ${job.street}, ${job.postcode}
                </p>
                <p class="text-slate-600 text-sm flex items-center mt-1">
                    <i data-lucide="clock" class="w-4 h-4 mr-1 text-slate-400"></i>
                    ${job.time_interval}
                </p>
            </div>
            
            ${job.notes ? `<div class="bg-amber-50 rounded p-2 text-sm text-amber-800 mb-3"><span class="font-bold">Notes:</span> ${job.notes}</div>` : ''}
            
            <div class="mt-3">
                <h5 class="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Assigned Team</h5>
                <div class="${isManager ? 'job-workers-container min-h-[40px] bg-slate-50 border border-slate-200 border-dashed rounded-lg p-2 flex flex-wrap items-center gap-1' : 'flex flex-wrap items-center gap-1'}" ${isManager ? `data-job-id="${job.id}" data-date="${job.date}"` : ''}>
                    ${workerPills}
                    ${isManager && (job.assigned_workers || []).length === 0 ? `<span class="text-xs text-slate-400 italic">Drag workers here</span>` : ''}
                    ${!isManager && (job.assigned_workers || []).length === 0 ? `<span class="text-xs text-slate-400 italic">Unassigned</span>` : ''}
                </div>
            </div>

            ${workerViewAdditions}
        </div>
    `;
}

exports.handler = async (event, context) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders(), body: '' };
    }

    const { date, view = 'manager' } = event.queryStringParameters || {};

    if (!date) {
        return { statusCode: 400, body: 'Date is required' };
    }

    try {
        const scheduleData = await redis.get(`schedule:${date}`) || [];

        let html = '';

        if (view === 'manager') {
            const activeJobs = scheduleData.filter(j => j.status !== 'cancelled');
            activeJobs.forEach(job => {
                job.date = date;
                html += renderJobCard(job, { isManager: true, isWorker: false });
            });
            if (activeJobs.length === 0) {
                html = `<div class="text-center p-6 text-slate-400 text-sm italic border-2 border-dashed border-slate-200 rounded-xl">No jobs scheduled</div>`;
            }
        } else if (view === 'worker') {
            const activeJobs = scheduleData.filter(j => j.status !== 'cancelled');

            if (activeJobs.length === 0) {
                html = `<div class="p-4 text-center text-slate-400 text-sm italic border border-dashed border-slate-200 rounded-xl">No work scheduled</div>`;
            } else {
                html = `<div class="space-y-4">`;
                activeJobs.forEach(job => {
                    html += renderJobCard(job, { isManager: false, isWorker: true });
                });
                html += `</div>`;
            }
        }

        return {
            statusCode: 200,
            headers: { ...corsHeaders(), 'Content-Type': 'text/html' },
            body: html
        };
    } catch (error) {
        console.error('Error fetching schedule:', error);
        return {
            statusCode: 500,
            headers: corsHeaders(),
            body: `<div class="text-red-500 p-4 bg-red-50 rounded-lg">Error loading schedule</div>`
        };
    }
};
