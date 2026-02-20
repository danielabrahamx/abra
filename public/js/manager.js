const allWorkers = ["Amylea", "Angelo", "Chloe", "George", "Leeroy", "Myka", "Nathan", "Olivia", "Tracy"];

// Utility to format date as DD-MM-YYYY
function formatDate(date) {
    const d = new Date(date);
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

// Utility to get day name
function getDayName(date) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
}

// Initialize the 7-day grid starting from today
function initializeGrid() {
    const grid = document.getElementById('schedule-grid');
    const today = new Date();
    const dropdown = document.getElementById('quick-add-date');
    dropdown.innerHTML = ''; // clear

    for (let i = 0; i < 7; i++) {
        const currentDate = new Date(today);
        currentDate.setDate(today.getDate() + i);

        const dateStr = formatDate(currentDate);
        const dayName = getDayName(currentDate);
        const isToday = i === 0;

        // Populate quick add dropdown
        const option = document.createElement('option');
        option.value = dateStr;
        option.textContent = `${isToday ? 'Today (' : ''}${dayName}, ${currentDate.toLocaleDateString()}${isToday ? ')' : ''}`;
        dropdown.appendChild(option);

        // Build HTML for column
        const colHtml = `
            <div class="flex flex-col w-[320px] shrink-0 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex-1">
                <div class="${isToday ? 'bg-indigo-50 border-b-2 border-indigo-500' : 'bg-slate-50 border-b border-slate-200'} px-4 py-3 sticky top-0 z-10">
                    <h3 class="font-bold ${isToday ? 'text-indigo-800' : 'text-slate-800'} flex items-center justify-between">
                        <span>${dayName}</span>
                        <span class="${isToday ? 'bg-indigo-200 text-indigo-800' : 'bg-slate-200 text-slate-600'} text-xs px-2 py-0.5 rounded-md font-medium">${dateStr}</span>
                    </h3>
                </div>
                <div class="p-3 flex-1 overflow-y-auto bg-slate-50/30 custom-scrollbar relative min-h-[500px]" 
                     id="day-col-${dateStr}" 
                     hx-get="/.netlify/functions/get-schedule?date=${dateStr}&view=manager" 
                     hx-trigger="load, scheduleUpdated from:body, every 60s [document.visibilityState == 'visible']">
                     <!-- Loading skeleton -->
                     <div class="animate-pulse flex space-x-4">
                        <div class="flex-1 space-y-4 py-1">
                            <div class="h-2 bg-slate-200 rounded"></div>
                            <div class="space-y-3">
                                <div class="grid grid-cols-3 gap-4">
                                    <div class="h-2 bg-slate-200 rounded col-span-2"></div>
                                    <div class="h-2 bg-slate-200 rounded col-span-1"></div>
                                </div>
                                <div class="h-2 bg-slate-200 rounded"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        grid.insertAdjacentHTML('beforeend', colHtml);
    }

    // Process new elements with HTMX
    htmx.process(grid);
}

// Initialize the worker pool
function initializeWorkers() {
    const pool = document.getElementById('roster-pool');
    pool.innerHTML = '';
    allWorkers.forEach(worker => {
        pool.innerHTML += `
            <div class="worker-pill bg-white border shadow-sm border-slate-200 text-slate-700 font-medium px-4 py-3 rounded-lg flex items-center justify-between cursor-grab hover:border-indigo-300 hover:shadow-md transition-all group" data-worker="${worker}">
                <div class="flex items-center">
                    <div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center mr-3 text-sm">
                        ${worker.charAt(0)}
                    </div>
                    ${worker}
                </div>
                <i data-lucide="grip-vertical" class="w-4 h-4 text-slate-300 group-hover:text-indigo-400"></i>
            </div>
        `;
    });
}

function showToast(message) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-message').textContent = message;

    // Slide up
    toast.classList.remove('translate-y-[150%]');

    setTimeout(() => {
        toast.classList.add('translate-y-[150%]');
    }, 3000);
}

// --- Sortable.js Initialization ---
function initSortable() {
    // 1. Sidebar worker pool is sortable and connected to job groups
    const pool = document.getElementById('roster-pool');
    Sortable.create(pool, {
        group: {
            name: 'workers',
            pull: 'clone', // Clone the worker pill
            put: false     // Don't drag back into the pool
        },
        sort: false, // Prevent reordering in the sidebar
        animation: 150,
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag'
    });

    // We need to attach instances dynamically as job cards are loaded by HTMX
}

// Re-attach Sortable to newly loaded job cards
function attachSortableToJobs() {
    const jobContainers = document.querySelectorAll('.job-workers-container');
    jobContainers.forEach(container => {
        // Avoid dual-initialization
        if (container.dataset.sortableInitialized) return;

        // Remove the empty placeholder if present
        const initText = container.querySelector('.text-xs.italic');
        if (initText) initText.remove();

        Sortable.create(container, {
            group: {
                name: 'job_workers',
                put: ['workers', 'job_workers'] // Accept from sidebar OR other jobs
            },
            animation: 150,
            ghostClass: 'sortable-ghost',
            onAdd: function (evt) {
                // Formatting the newly dropped item from sidebar
                if (evt.from.id === 'roster-pool') {
                    const el = evt.item;
                    const workerName = el.dataset.worker;

                    // Replace big sidebar style with small pill style
                    el.className = 'bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full flex items-center justify-center m-1 cursor-grab';
                    el.innerHTML = workerName;
                }
                saveWorkerAssignment(container);
            },
            onRemove: function (evt) {
                // Removed from this list, moved to another list. 
                // We need to save state for THIS list as well (the one it left).
                saveWorkerAssignment(container);
            },
            onUpdate: function (evt) {
                // Reordered within the same list
                saveWorkerAssignment(container);
            }
        });

        container.dataset.sortableInitialized = 'true';
    });
}

// Debounce helper to prevent blasting the server during rapid drag/drops
let saveTimeout;
function saveWorkerAssignment(container) {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        const jobId = container.dataset.jobId;
        const date = container.dataset.date;

        // Extract worker names from the DOM pills
        const workerElements = container.querySelectorAll('[data-worker]');
        const workers = Array.from(workerElements).map(el => el.dataset.worker);

        // Ensure uniqueness (can't assign same worker twice to same job)
        const uniqueWorkers = [...new Set(workers)];

        // Clean up UI if duplicate was dragged
        if (workers.length !== uniqueWorkers.length) {
            workerElements.forEach(el => el.remove());
            uniqueWorkers.forEach(w => {
                container.innerHTML += `<div class="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full flex items-center justify-center m-1 cursor-grab" data-worker="${w}">${w}</div>`;
            });
        }

        try {
            const formData = new URLSearchParams();
            formData.append('action', 'update-workers');
            formData.append('job_id', jobId);
            formData.append('date', date);
            formData.append('workers', JSON.stringify(uniqueWorkers));

            const response = await fetch('/.netlify/functions/update-schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString()
            });

            if (!response.ok) throw new Error('Failed to update');
            showToast('Assignment saved');

        } catch (error) {
            console.error(error);
            showToast('Error saving assignment');
            // Optimistically failed, we should trigger a reload for this day
            htmx.ajax('GET', `/.netlify/functions/get-schedule?date=${date}&view=manager`, `#day-col-${date}`);
        }
    }, 500); // Wait 500ms after last drag to persist
}

// Document Ready
document.addEventListener('DOMContentLoaded', () => {
    initializeGrid();
    initializeWorkers();
    initSortable();
    lucide.createIcons();
});

// HTMX Event Listeners
document.body.addEventListener('htmx:afterSettle', function (evt) {
    lucide.createIcons(); // Re-init icons for new HTML
    attachSortableToJobs(); // Re-init sortable containers
});

document.body.addEventListener('scheduleUpdated', function (evt) {
    const date = evt.detail.date;
    if (date) {
        // Trigger a reload of that specific column
        htmx.ajax('GET', `/.netlify/functions/get-schedule?date=${date}&view=manager`, `#day-col-${date}`);
        showToast('Schedule updated');
    }
});
