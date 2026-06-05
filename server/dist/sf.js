"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConnection = getConnection;
exports.resetConnection = resetConnection;
require("dotenv/config");
const jsforce_1 = __importDefault(require("jsforce"));
const child_process_1 = require("child_process");
let _conn = null;
/** Fetch a fresh access token from the SF CLI for the org62 alias */
function getTokenFromCli() {
    try {
        const raw = (0, child_process_1.execSync)('sf org display --target-org org62 --json 2>/dev/null', { encoding: 'utf8' });
        const data = JSON.parse(raw);
        const result = data?.result;
        if (result?.accessToken && result?.instanceUrl) {
            return { accessToken: result.accessToken, instanceUrl: result.instanceUrl };
        }
    }
    catch { /* fall through */ }
    return null;
}
function getConnection() {
    // Always fetch a fresh token from the CLI — it handles refresh transparently
    const cli = getTokenFromCli();
    if (cli && (_conn === null || _conn.accessToken !== cli.accessToken)) {
        _conn = new jsforce_1.default.Connection({
            instanceUrl: cli.instanceUrl,
            accessToken: cli.accessToken,
            version: '62.0',
        });
    }
    if (!_conn) {
        _conn = new jsforce_1.default.Connection({
            instanceUrl: process.env.SF_INSTANCE_URL,
            accessToken: process.env.SF_ACCESS_TOKEN,
            version: '62.0',
        });
    }
    return _conn;
}
/** Replace the active connection — called to force a refresh */
function resetConnection() {
    _conn = null;
    return getConnection();
}
