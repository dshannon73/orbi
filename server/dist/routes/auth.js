"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const child_process_1 = require("child_process");
const sf_1 = require("../sf");
const router = (0, express_1.Router)();
function isTokenExpired() {
    try {
        const raw = (0, child_process_1.execSync)('sf org display --target-org org62 --json 2>/dev/null', { encoding: 'utf8' });
        const data = JSON.parse(raw);
        const status = data?.result?.connectedStatus ?? '';
        return status.toLowerCase().includes('expired') || status.toLowerCase().includes('unable');
    }
    catch {
        return true;
    }
}
function runSfLogin() {
    return new Promise((resolve, reject) => {
        // Launch browser-based re-auth; poll every 2s until the token becomes valid (max 120s)
        const child = (0, child_process_1.execFile)('sf', ['org', 'login', 'web', '--alias', 'org62'], { timeout: 0 });
        child.unref();
        const start = Date.now();
        const poll = setInterval(() => {
            if (!isTokenExpired()) {
                clearInterval(poll);
                resolve();
                return;
            }
            if (Date.now() - start > 120_000) {
                clearInterval(poll);
                reject(new Error('Login timed out'));
            }
        }, 2000);
    });
}
// POST /login — authenticates using the SF CLI token for the org62 alias.
// If the token is expired, spawns `sf org login web` to open the browser and
// waits for the user to complete OAuth before proceeding.
router.post('/login', async (req, res) => {
    try {
        if (isTokenExpired()) {
            try {
                await runSfLogin();
            }
            catch {
                return res.status(401).json({ error: 'Salesforce re-authentication timed out. Run `sf org login web --alias org62` in your terminal.' });
            }
        }
        const conn = (0, sf_1.resetConnection)(); // always grab a fresh CLI token on login
        const identity = await conn.identity();
        req.session.userId = identity.user_id;
        req.session.userName = identity.display_name || identity.username;
        req.session.userEmail = identity.email || identity.username;
        let photoUrl;
        try {
            const photoResult = await conn.request(`/connect/user-profiles/${identity.user_id}/photo`);
            photoUrl = photoResult?.fullEmailPhotoUrl || photoResult?.photoUrl || undefined;
        }
        catch { /* skip */ }
        // Explicitly persist before responding so FileStore writes to disk.
        await new Promise((resolve, reject) => req.session.save(e => e ? reject(e) : resolve()));
        return res.json({
            ok: true,
            user: {
                userId: identity.user_id,
                userName: identity.display_name || identity.username,
                userEmail: identity.email || identity.username,
                photoUrl,
            },
        });
    }
    catch (err) {
        return res.status(401).json({ error: err.message || 'Authentication failed' });
    }
});
// POST /logout
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ ok: true });
    });
});
// POST /reconnect — re-auth via SF CLI web flow, streams SSE progress back
router.post('/reconnect', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const emit = (msg) => res.write(`data: ${JSON.stringify({ message: msg })}\n\n`);
    emit('Opening Salesforce login…');
    // Launch browser-based auth
    const child = (0, child_process_1.execFile)('sf', ['org', 'login', 'web', '--alias', 'org62'], { timeout: 0 });
    child.unref();
    emit('Complete the login in your browser, then return here.');
    const start = Date.now();
    const poll = setInterval(async () => {
        if (!isTokenExpired()) {
            clearInterval(poll);
            try {
                const conn = (0, sf_1.resetConnection)();
                const identity = await conn.identity();
                req.session.userId = identity.user_id;
                req.session.userName = identity.display_name || identity.username;
                req.session.userEmail = identity.email || identity.username;
                await new Promise((resolve, reject) => req.session.save(e => e ? reject(e) : resolve()));
                res.write(`data: ${JSON.stringify({ done: true, user: { userId: identity.user_id, userName: identity.display_name || identity.username, userEmail: identity.email || identity.username } })}\n\n`);
            }
            catch (err) {
                res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
            }
            res.end();
            return;
        }
        if (Date.now() - start > 120_000) {
            clearInterval(poll);
            res.write(`data: ${JSON.stringify({ error: 'Login timed out after 2 minutes.' })}\n\n`);
            res.end();
        }
    }, 2000);
    req.on('close', () => clearInterval(poll));
});
// GET /me
router.get('/me', async (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
        const conn = (0, sf_1.getConnection)();
        const result = await conn.query(`SELECT Id, Name, Email, Title, Department, UserRole.Name, Profile.Name, LastLoginDate FROM User WHERE Id = '${userId}'`);
        const sfUser = result.records[0];
        return res.json({ user: sfUser });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
