function generateGoogleMapsUrl(street, houseNumber, postcode) {
    const query = `${houseNumber} ${street}, ${postcode}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };
}

module.exports = {
    generateGoogleMapsUrl,
    corsHeaders
};
