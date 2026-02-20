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

        // Use provided booking date or fallback to tomorrow
        const bookingDateParam = params.get('booking_date');
        let dateStr;

        if (bookingDateParam) {
            // Convert YYYY-MM-DD to DD-MM-YYYY
            const [year, month, day] = bookingDateParam.split('-');
            dateStr = `${day}-${month}-${year}`;
        } else {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            dateStr = `${String(tomorrow.getDate()).padStart(2, '0')}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${tomorrow.getFullYear()}`;
        }

        const scheduleKey = `schedule:${dateStr}`;
        let scheduleData = await redis.get(scheduleKey) || [];

        const newJob = {
            id: crypto.randomUUID(),
            client_name: params.get('name'),
            street: params.get('address'), // Simplified address field
            house_number: '',
            postcode: params.get('postcode') || '',
            maps_url: generateGoogleMapsUrl(params.get('address'), '', params.get('postcode') || ''),
            time_interval: params.get('time_slot'),
            notes: params.get('notes'),
            status: 'pending',
            assigned_workers: []
        };

        scheduleData.push(newJob);
        await redis.set(scheduleKey, scheduleData);

        return {
            statusCode: 200,
            headers: { ...corsHeaders(), 'Content-Type': 'text/html' },
            body: `<div class="p-6 bg-green-50 text-green-800 rounded-xl border border-green-200">
                <i data-lucide="check-circle" class="w-8 h-8 mb-4"></i>
                <h3 class="text-xl font-bold mb-2">Booking Confirmed!</h3>
                <p>We've received your booking for ${dateStr} at ${newJob.time_interval}. Our team will review it shortly.</p>
               </div>`
        };

    } catch (error) {
        console.error('Error submitting booking:', error);
        return {
            statusCode: 500,
            headers: { ...corsHeaders(), 'Content-Type': 'text/html' },
            body: `<div class="p-4 bg-red-50 text-red-800 rounded-lg">Error submitting booking. Please try again.</div>`
        };
    }
};
