/**
 * github-storage.js - GitHub-based storage adapter
 * Uses GitHub API to read/write JSON files in the repository
 * Requires GITHUB_TOKEN environment variable
 */

const GITHUB_API = 'https://api.github.com';

/**
 * Get GitHub configuration from environment
 * @returns {Object} GitHub config with owner, repo, branch, token
 */
function getGitHubConfig() {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER || 'danielabrahamx'; // Your GitHub username
    const repo = process.env.GITHUB_REPO || 'abra';
    const branch = process.env.GITHUB_BRANCH || 'main';

    if (!token) {
        throw new Error('GITHUB_TOKEN environment variable is required');
    }

    return { owner, repo, branch, token };
}

/**
 * Read a JSON file from GitHub
 * @param {string} path - Path to file in repo (e.g., 'data/schedule.json')
 * @returns {Promise<any>} Parsed JSON content
 */
async function readJSON(path) {
    const { owner, repo, branch, token } = getGitHubConfig();
    // Add timestamp to prevent caching
    const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${branch}&t=${Date.now()}`;

    console.log(`Reading from GitHub: ${path}`);

    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Netlify-Function'
        }
    });

    if (!response.ok) {
        if (response.status === 404) {
            console.log(`File not found: ${path}, returning default`);
            return path.includes('clients') ? [] : {};
        }
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return JSON.parse(content);
}

/**
 * Write a JSON file to GitHub
 * @param {string} path - Path to file in repo (e.g., 'data/schedule.json')
 * @param {any} content - JSON content to write
 * @param {string} message - Commit message
 */
async function writeJSON(path, content, message = 'Update data') {
    const { owner, repo, branch, token } = getGitHubConfig();
    const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`;

    console.log(`Writing to GitHub: ${path}`);

    // First, get the current file SHA (required for updates)
    let sha = null;
    try {
        // Add timestamp to prevent caching on GET
        const getUrl = `${url}?ref=${branch}&t=${Date.now()}`;
        const getResponse = await fetch(getUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Netlify-Function'
            }
        });

        if (getResponse.ok) {
            const fileData = await getResponse.json();
            sha = fileData.sha;
            console.log(`File exists, SHA: ${sha}`);
        } else {
            console.log(`File check status: ${getResponse.status}`);
        }
    } catch (err) {
        console.log('Error checking file existence:', err);
    }

    // Write the file
    const contentBase64 = Buffer.from(JSON.stringify(content, null, 2)).toString('base64');
    const payload = {
        message,
        content: contentBase64,
        branch
    };
    if (sha) {
        payload.sha = sha;
    }

    const putResponse = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Netlify-Function'
        },
        body: JSON.stringify(payload)
    });

    if (!putResponse.ok) {
        const errorText = await putResponse.text();
        console.error(`GitHub API write error: ${putResponse.status}`, errorText);
        throw new Error(`GitHub API write error: ${putResponse.status} - ${errorText}`);
    }

    console.log(`Successfully wrote to GitHub: ${path}`);
    return await putResponse.json();
}

module.exports = {
    readJSON,
    writeJSON
};
