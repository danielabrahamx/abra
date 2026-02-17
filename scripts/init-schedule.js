/**
 * Helper script to pre-populate schedule.json with dates
 * Run this locally to generate dates for the next N days
 */

const fs = require('fs');
const path = require('path');

const SCHEDULE_PATH = path.join(__dirname, '..', 'data', 'schedule.json');

function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

function generateSchedule(daysAhead = 60) {
    const schedule = {};
    const today = new Date();

    for (let i = 0; i < daysAhead; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const dateKey = formatDate(date);

        schedule[dateKey] = {
            Team_A: { assigned_workers: [], addresses: [] },
            Team_B: { assigned_workers: [], addresses: [] }
        };
    }

    return schedule;
}

// Read existing schedule to preserve current data
let existingSchedule = {};
if (fs.existsSync(SCHEDULE_PATH)) {
    const data = fs.readFileSync(SCHEDULE_PATH, 'utf8');
    existingSchedule = JSON.parse(data);
}

// Generate new schedule for next 60 days
const newSchedule = generateSchedule(60);

// Merge: preserve existing entries, add new ones
const mergedSchedule = { ...newSchedule, ...existingSchedule };

// Write back
fs.writeFileSync(SCHEDULE_PATH, JSON.stringify(mergedSchedule, null, 4), 'utf8');

console.log(`✅ Schedule populated with ${Object.keys(mergedSchedule).length} dates`);
