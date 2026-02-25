/**
 * redis-storage.js - Upstash Redis-based storage adapter
 * Uses Upstash Redis REST API to read/write JSON data
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables
 */

/**
 * Get Redis configuration from environment
 * @returns {Object} Redis config with url and token
 */
function getRedisConfig() {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables are required');
    }

    return { url, token };
}

/**
 * Read a JSON value from Redis
 * @param {string} key - Redis key (e.g., 'data/schedule.json')
 * @returns {Promise<any>} Parsed JSON content, or default ([] for clients, {} otherwise)
 */
async function readJSON(key) {
    const { url, token } = getRedisConfig();

    console.log(`Reading from Redis: ${key}`);

    const response = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.ok) {
        throw new Error(`Redis API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Upstash returns { result: <string|null> }
    if (data.result === null || data.result === undefined) {
        console.log(`Key not found: ${key}, returning default`);
        return key.includes('clients') || key.includes('recurring') ? [] : {};
    }

    // Upstash stores values as strings. Due to writeJSON's double-stringify,
    // the result may be wrapped in multiple layers of JSON encoding.
    // Keep parsing until we get a non-string value (object or array).
    let parsed = data.result;
    while (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch (e) {
            // If it can't be parsed further, return as-is
            break;
        }
    }
    return parsed;
}

/**
 * Write a JSON value to Redis
 * @param {string} key - Redis key (e.g., 'data/schedule.json')
 * @param {any} content - JSON content to write
 * @param {string} message - Log message (kept for API compatibility with github-storage)
 */
async function writeJSON(key, content, message = 'Update data') {
    const { url, token } = getRedisConfig();

    console.log(`Writing to Redis: ${key} (${message})`);

    const response = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(JSON.stringify(content))
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Redis API write error: ${response.status}`, errorText);
        throw new Error(`Redis API write error: ${response.status} - ${errorText}`);
    }

    console.log(`Successfully wrote to Redis: ${key}`);
    return await response.json();
}

module.exports = {
    readJSON,
    writeJSON
};
