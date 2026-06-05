"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const express_session_1 = __importDefault(require("express-session"));
const session_file_store_1 = __importDefault(require("session-file-store"));
const auth_1 = __importDefault(require("./routes/auth"));
const activities_1 = __importDefault(require("./routes/activities"));
const dealContributions_1 = __importDefault(require("./routes/dealContributions"));
const accounts_1 = __importDefault(require("./routes/accounts"));
const users_1 = __importDefault(require("./routes/users"));
const opportunities_1 = __importDefault(require("./routes/opportunities"));
const travelApprovals_1 = __importDefault(require("./routes/travelApprovals"));
const slack_1 = __importDefault(require("./routes/slack"));
const meta_1 = __importDefault(require("./routes/meta"));
const calendar_1 = __importDefault(require("./routes/calendar"));
const assistant_1 = __importDefault(require("./routes/assistant"));
const dashboard_1 = __importDefault(require("./routes/dashboard"));
const terminal_1 = __importDefault(require("./routes/terminal"));
const dsr_1 = __importDefault(require("./routes/dsr"));
const slack_2 = require("./services/slack");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
app.use((0, cors_1.default)({ origin: true, credentials: true }));
app.use(express_1.default.json({ limit: '2mb' }));
const SessionFileStore = (0, session_file_store_1.default)(express_session_1.default);
app.use((0, express_session_1.default)({
    store: new SessionFileStore({ path: './.sessions', ttl: 365 * 24 * 60 * 60, reapInterval: 3600 }),
    secret: process.env.SESSION_SECRET || 'org62-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 365 * 24 * 60 * 60 * 1000 }, // 1 year
}));
app.use('/api/auth', auth_1.default);
app.use('/api/activities', activities_1.default);
app.use('/api/deal-contributions', dealContributions_1.default);
app.use('/api/accounts', accounts_1.default);
app.use('/api/users', users_1.default);
app.use('/api/opportunities', opportunities_1.default);
app.use('/api/travel-approvals', travelApprovals_1.default);
app.use('/api/slack', slack_1.default);
app.use('/api/meta', meta_1.default);
app.use('/api/calendar', calendar_1.default);
app.use('/api/assistant', assistant_1.default);
app.use('/api/dashboard', dashboard_1.default);
app.use('/api/terminal', terminal_1.default);
app.use('/api/dsr', dsr_1.default);
if (process.env.SLACK_SIGNING_SECRET && process.env.SLACK_BOT_TOKEN) {
    app.use((0, slack_2.createSlackReceiver)());
    console.log('Slack integration enabled');
}
app.get('/health', (_, res) => res.json({ ok: true }));
// Serve client build in production (Heroku)
const clientDist = path_1.default.join(__dirname, '../../client/dist');
if ((0, fs_1.existsSync)(clientDist)) {
    app.use(express_1.default.static(clientDist));
    app.get('*', (_req, res) => {
        res.sendFile(path_1.default.join(clientDist, 'index.html'));
    });
}
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
