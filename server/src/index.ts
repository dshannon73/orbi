import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import authRouter from './routes/auth';
import activitiesRouter from './routes/activities';
import dealContributionsRouter from './routes/dealContributions';
import accountsRouter from './routes/accounts';
import usersRouter from './routes/users';
import opportunitiesRouter from './routes/opportunities';
import travelApprovalsRouter from './routes/travelApprovals';
import slackRouter from './routes/slack';
import metaRouter from './routes/meta';
import calendarRouter from './routes/calendar';
import assistantRouter from './routes/assistant';
import dashboardRouter from './routes/dashboard';
import { createSlackReceiver } from './services/slack';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'org62-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 }, // 30 days
}));

app.use('/api/auth', authRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/deal-contributions', dealContributionsRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/users', usersRouter);
app.use('/api/opportunities', opportunitiesRouter);
app.use('/api/travel-approvals', travelApprovalsRouter);
app.use('/api/slack', slackRouter);
app.use('/api/meta', metaRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/assistant', assistantRouter);
app.use('/api/dashboard', dashboardRouter);

if (process.env.SLACK_SIGNING_SECRET && process.env.SLACK_BOT_TOKEN) {
  app.use(createSlackReceiver());
  console.log('Slack integration enabled');
}

app.get('/health', (_, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
