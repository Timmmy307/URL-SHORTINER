require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const { Octokit } = require("@octokit/rest");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DB_FILE = path.join(__dirname, 'links.json');

app.use(express.static(PUBLIC_DIR));
app.use(bodyParser.json());

const OWNER_PASSWORD = 'sircoownsthis@2025'; // <-- Set your real password here

// GitHub configuration
// Store the token base64-encoded (obfuscated, not secure for production)
const GITHUB_TOKEN_ENC = 'Z2hwXzhuMHpEWDBZNFprRHRDTzlGZGNwMTFJd3M1RDJBajRTa0Vwcg=='; // base64 of the token
const GITHUB_TOKEN = Buffer.from(GITHUB_TOKEN_ENC, 'base64').toString('utf8'); // decode at runtime
const GITHUB_OWNER = "Timmmy307";
const GITHUB_REPO = "URL-SHORTINER-files";
const GITHUB_PATH = "links.json";

const octokit = new Octokit({ auth: GITHUB_TOKEN });

if (!GITHUB_TOKEN) {
    console.error("Missing GITHUB_TOKEN! Exiting.");
    process.exit(1);
}

// Add this to log GitHub repo access at startup
(async () => {
    try {
        await octokit.repos.get({ owner: GITHUB_OWNER, repo: GITHUB_REPO });
        console.log("GitHub repo access OK.");
    } catch (err) {
        console.error("GitHub repo access failed:", err.message);
        process.exit(1);
    }
})();

const CREATE_ENABLED_KEY = '__create_enabled';

// Helper to generate random 5-char code
function generateCode(length = 5) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Helper to fetch links.json from GitHub
async function fetchLinksFromGitHub() {
    try {
        const res = await octokit.repos.getContent({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            path: GITHUB_PATH,
        });
        const content = Buffer.from(res.data.content, 'base64').toString();
        return { json: JSON.parse(content), sha: res.data.sha };
    } catch (err) {
        // If file not found, treat as empty DB (only if 404)
        if (err.status === 404) {
            console.warn("links.json not found in repo, initializing empty DB.");
            return { json: {}, sha: null };
        }
        console.error("Error fetching links.json from GitHub:", err);
        throw new Error("Could not fetch links.json from GitHub");
    }
}

// Helper to update links.json on GitHub
async function updateLinksOnGitHub(newLinks, sha) {
    try {
        await octokit.repos.createOrUpdateFileContents({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            path: GITHUB_PATH,
            message: "Update links.json",
            content: Buffer.from(JSON.stringify(newLinks, null, 2)).toString('base64'),
            sha: sha || undefined, // undefined if file doesn't exist yet
        });
    } catch (err) {
        console.error("Error updating links.json on GitHub:", err);
        throw new Error("Could not update links.json on GitHub");
    }
}

// Helper to load/save DB
async function loadDB() {
    try {
        const { json } = await fetchLinksFromGitHub();
        return json;
    } catch (err) {
        throw err;
    }
}
async function saveDB(db) {
    try {
        const { sha } = await fetchLinksFromGitHub();
        await updateLinksOnGitHub(db, sha);
    } catch (err) {
        throw err;
    }
}

// Helper for global creation toggle (now in links.json)
async function isCreateEnabled() {
    try {
        const db = await loadDB();
        // Default to true if not set
        return db[CREATE_ENABLED_KEY] !== false;
    } catch {
        return true;
    }
}
async function setCreateEnabled(enabled) {
    const db = await loadDB();
    db[CREATE_ENABLED_KEY] = !!enabled;
    await saveDB(db);
}

// API: Get creation enabled status (owner only)
app.post('/api/get-create-enabled', async (req, res) => {
    const { ownerPass } = req.body;
    if (ownerPass !== OWNER_PASSWORD) return res.status(403).json({ error: 'Invalid owner password' });
    res.json({ enabled: await isCreateEnabled() });
});

// API: Set creation enabled status (owner only)
app.post('/api/set-create-enabled', async (req, res) => {
    const { ownerPass, enabled } = req.body;
    if (ownerPass !== OWNER_PASSWORD) return res.status(403).json({ error: 'Invalid owner password' });
    await setCreateEnabled(!!enabled);
    res.json({ success: true, enabled: !!enabled });
});

// API: Export links.json (owner only)
app.post('/api/export-links', async (req, res) => {
    const { ownerPass } = req.body;
    if (ownerPass !== OWNER_PASSWORD) return res.status(403).json({ error: 'Invalid owner password' });
    try {
        const { json } = await fetchLinksFromGitHub();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="links.json"');
        res.send(JSON.stringify(json, null, 2));
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch links.json from GitHub." });
    }
});

// API: Import links.json (owner only)
// When importing, preserve the current __create_enabled flag if not present in import
app.post('/api/import-links', async (req, res) => {
    const { ownerPass, data } = req.body;
    if (ownerPass !== OWNER_PASSWORD) return res.status(403).json({ error: 'Invalid owner password' });
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Invalid data' });
    try {
        const currentDB = await loadDB();
        if (!(CREATE_ENABLED_KEY in data) && (CREATE_ENABLED_KEY in currentDB)) {
            data[CREATE_ENABLED_KEY] = currentDB[CREATE_ENABLED_KEY];
        }
        await saveDB(data);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to update links.json on GitHub." });
    }
});

// API to create a new short link
app.post('/api/shorten', async (req, res) => {
    try {
        let { url, customCode, ownerPass } = req.body;
        if (!url || !/^https?:\/\//.test(url)) {
            return res.status(400).json({ error: 'Invalid URL' });
        }
        if (!customCode && !(await isCreateEnabled())) {
            return res.status(403).json({ error: 'Link creation is currently disabled by the owner.' });
        }
        let db = await loadDB();

        // Prevent duplicate URLs (for non-custom codes, i.e., not owner)
        if (!customCode) {
            for (const [code, entry] of Object.entries(db)) {
                if (code === CREATE_ENABLED_KEY) continue;
                let entryObj = typeof entry === "string" ? { url: entry } : entry;
                if (code.length !== 5) continue;
                if (entryObj.url === url) {
                    const baseUrl = req.protocol + '://' + req.get('host');
                    return res.status(409).json({ error: 'This URL is already shortened.', shortUrl: `${baseUrl}/${code}` });
                }
            }
        }

        let code;
        if (customCode) {
            if ((ownerPass || '').trim().toLowerCase() !== OWNER_PASSWORD.toLowerCase()) {
                return res.status(403).json({ error: 'Invalid owner password' });
            }
            code = customCode;
            if (db[code]) {
                return res.status(409).json({ error: 'Custom code already exists' });
            }
        } else {
            do {
                code = generateCode();
            } while (db[code]);
        }
        db[code] = { url, status: "active" };
        await saveDB(db);
        const baseUrl = req.protocol + '://' + req.get('host');
        res.json({ shortUrl: `${baseUrl}/${code}` });
    } catch (err) {
        // Improved error logging
        console.error("Error in /api/shorten:", err.stack || err);
        res.status(500).json({ error: "Internal server error", details: err.message });
    }
});

// API to delete all redirects (owner only)
app.post('/api/delete-all', async (req, res) => {
    const { ownerPass } = req.body;
    if ((ownerPass || '').trim().toLowerCase() !== OWNER_PASSWORD.toLowerCase()) {
        return res.status(403).json({ error: 'Invalid owner password' });
    }
    try {
        await saveDB({});
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to update links.json on GitHub." });
    }
});

// API to list all links (owner only)
app.post('/api/list-links', async (req, res) => {
    const { ownerPass } = req.body;
    if ((ownerPass || '').trim().toLowerCase() !== OWNER_PASSWORD.toLowerCase()) {
        return res.status(403).json({ error: 'Invalid owner password' });
    }
    try {
        const db = await loadDB();
        res.json({ success: true, links: db });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch links.json from GitHub." });
    }
});

// API to update a link (edit id, url, or status)
app.post('/api/update-link', async (req, res) => {
    const { ownerPass, id, update } = req.body;
    if ((ownerPass || '').trim().toLowerCase() !== OWNER_PASSWORD.toLowerCase()) {
        return res.status(403).json({ error: 'Invalid owner password' });
    }
    if (!id || !update) {
        return res.status(400).json({ error: 'Missing id or update' });
    }
    try {
        let db = await loadDB();
        if (!(id in db)) {
            return res.status(404).json({ error: 'ID not found' });
        }
        let link = db[id];
        if (typeof link === "string") link = { url: link, status: "active" };
        if (update.url) link.url = update.url;
        if (update.status) link.status = update.status;
        let newId = id;
        if (update.id && update.id !== id) {
            if (db[update.id]) {
                return res.status(409).json({ error: 'New ID already exists' });
            }
            db[update.id] = link;
            delete db[id];
            newId = update.id;
        } else {
            db[id] = link;
        }
        await saveDB(db);
        res.json({ success: true, id: newId });
    } catch (err) {
        res.status(500).json({ error: "Failed to update links.json on GitHub." });
    }
});

// API to delete a single link (owner only)
app.post('/api/delete-link', async (req, res) => {
    const { ownerPass, id } = req.body;
    if ((ownerPass || '').trim().toLowerCase() !== OWNER_PASSWORD.toLowerCase()) {
        return res.status(403).json({ error: 'Invalid owner password' });
    }
    if (!id) {
        return res.status(400).json({ error: 'Missing id' });
    }
    try {
        let db = await loadDB();
        if (!(id in db)) {
            return res.status(404).json({ error: 'ID not found' });
        }
        delete db[id];
        await saveDB(db);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to update links.json on GitHub." });
    }
});

// Add CSP header to allow fonts and other resources
app.use((req, res, next) => {
    res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; font-src 'self' https://fonts.gstatic.com data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline'; img-src 'self' data:;"
    );
    next();
});

// Serve /owner as a static directory (for /owner/index.html)
app.use('/owner', express.static(path.join(PUBLIC_DIR, 'owner')));

// Place this AFTER all static middleware
app.get('/:code', async (req, res, next) => {
    try {
        const code = req.params.code;

        // Ignore requests for static files or reserved routes
        if (
            code.includes('.') || // static files like favicon.ico, .js, .css, etc.
            code === 'api' ||
            code === 'owner' ||
            code === '' ||
            code === 'custom' || // add any other reserved routes here
            code === 'l'
        ) return next();

        const db = await loadDB();
        let entry = db[code];
        // Support old format
        if (typeof entry === "string") entry = { url: entry, status: "active" };
        if (!entry) {
            // Optional: log for debugging
            console.log(`[404] Code not found: ${code}`);
            return res.status(404).send('<h1>Link not found.</h1>');
        }
        if (entry.status === "disabled") {
            // Redirect to main page after 5 seconds
            return res.status(403).send(`
                <h1>This link is disabled.</h1>
                <p>You will be redirected to the <a href="/">main page</a> in 5 seconds.</p>
                <script>
                    setTimeout(function(){ window.location.href = "/"; }, 5000);
                </script>
            `);
        }
        if ('tellurl' in req.query) {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Continue to Short Link</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; margin-top: 60px; }
                        .url-box { margin: 20px auto; padding: 10px; border: 1px solid #ccc; display: inline-block; }
                        a.button { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #007bff; color: #fff; text-decoration: none; border-radius: 4px; }
                    </style>
                </head>
                <body>
                    <h1>Ready to Continue?</h1>
                    <div class="url-box">
                        Click the button below to go to your short link:<br>
                        <a class="button" href="/${code}">/${code}</a>
                    </div>
                </body>
                </html>
            `);
        } else if ('showurl' in req.query) {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Short Link Destination</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; margin-top: 60px; }
                        .url-box { margin: 20px auto; padding: 10px; border: 1px solid #ccc; display: inline-block; word-break: break-all; }
                        a.button { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #28a745; color: #fff; text-decoration: none; border-radius: 4px; }
                    </style>
                </head>
                <body>
                    <h1>Short Link Information</h1>
                    <div class="url-box">
                        <strong>The short link <code>/${code}</code> points to:</strong><br>
                        <span style="color:#007bff">${entry.url.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span>
                    </div>
                    <br>
                    <a class="button" href="${entry.url}" rel="noopener noreferrer">Go to Destination</a>
                </body>
                </html>
            `);
        } else {
            // Optional: log for debugging
            console.log(`[REDIRECT] ${code} -> ${entry.url}`);
            res.redirect(entry.url);
        }
    } catch (err) {
        console.error("Error in /:code:", err);
        res.status(500).send('<h1>Internal server error</h1>');
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
