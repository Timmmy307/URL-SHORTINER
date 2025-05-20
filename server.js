const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DB_FILE = path.join(__dirname, 'links.json');

app.use(express.static(PUBLIC_DIR));
app.use(bodyParser.json());

const OWNER_PASSWORD = 'Timour'; // <-- Set your real password here

// Helper to generate random 5-char code
function generateCode(length = 5) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Helper to load/save DB
function loadDB() {
    if (!fs.existsSync(DB_FILE)) return {};
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveDB(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// API to create a new short link
app.post('/api/shorten', (req, res) => {
    let { url, customCode, ownerPass } = req.body;
    if (!url || !/^https?:\/\//.test(url)) {
        return res.status(400).json({ error: 'Invalid URL' });
    }
    let db = loadDB();
    let code;
    if (customCode) {
        // Owner password check (now server-side)
        if (ownerPass !== OWNER_PASSWORD) {
            return res.status(403).json({ error: 'Invalid owner password' });
        }
        code = customCode;
        if (db[code]) {
            return res.status(409).json({ error: 'Custom code already exists' });
        }
    } else {
        // Generate unique code
        do {
            code = generateCode();
        } while (db[code]);
    }
    db[code] = url;
    saveDB(db);
    // Use the actual host and protocol from the request
    const baseUrl = req.protocol + '://' + req.get('host');
    res.json({ shortUrl: `${baseUrl}/${code}` });
});

// API to delete all redirects (owner only)
app.post('/api/delete-all', (req, res) => {
    const { ownerPass } = req.body;
    if (ownerPass !== OWNER_PASSWORD) {
        return res.status(403).json({ error: 'Invalid owner password' });
    }
    saveDB({});
    res.json({ success: true });
});

// API to list all links (owner only)
app.post('/api/list-links', (req, res) => {
    const { ownerPass } = req.body;
    if (ownerPass !== OWNER_PASSWORD) {
        return res.status(403).json({ error: 'Invalid owner password' });
    }
    const db = loadDB();
    res.json({ success: true, links: db });
});

// API to delete a single link (owner only)
app.post('/api/delete-link', (req, res) => {
    const { ownerPass, id } = req.body;
    if (ownerPass !== OWNER_PASSWORD) {
        return res.status(403).json({ error: 'Invalid owner password' });
    }
    if (!id) {
        return res.status(400).json({ error: 'Missing id' });
    }
    const db = loadDB();
    if (!(id in db)) {
        return res.status(404).json({ error: 'ID not found' });
    }
    delete db[id];
    saveDB(db);
    res.json({ success: true });
});

// Serve /owner as a static directory (for /owner/index.html)
app.use('/owner', express.static(path.join(PUBLIC_DIR, 'owner')));

// Place this AFTER all static middleware
app.get('/:code', (req, res, next) => {
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

    const db = loadDB();
    const url = db[code];
    if (!url) {
        // Optional: log for debugging
        console.log(`[404] Code not found: ${code}`);
        return res.status(404).send('<h1>Link not found.</h1>');
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
    } else {
        // Optional: log for debugging
        console.log(`[REDIRECT] ${code} -> ${url}`);
        res.redirect(url);
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
