import { Router } from 'express';
import { google } from 'googleapis';
import { getConnection } from '../sf';

const router = Router();

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

declare module 'express-session' {
  interface SessionData {
    googleTokens?: {
      access_token: string | null;
      refresh_token: string | null;
      expiry_date: number | null;
    };
  }
}

// GET /api/calendar/oauth/connect — redirect user to Google consent page
router.get('/oauth/connect', (req, res) => {
  const returnTo = req.query.returnTo as string | undefined;
  if (returnTo) (req.session as any).oauthReturnTo = returnTo;
  const auth = getOAuth2Client();
  const url = auth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.readonly'],
  });
  res.redirect(url);
});

// GET /api/calendar/oauth/callback — Google redirects here after consent
router.get('/oauth/callback', async (req, res) => {
  const { code } = req.query as { code: string };
  if (!code) return res.status(400).send('Missing code');

  try {
    const auth = getOAuth2Client();
    const { tokens } = await auth.getToken(code);
    req.session.googleTokens = {
      access_token: tokens.access_token ?? null,
      refresh_token: tokens.refresh_token ?? null,
      expiry_date: tokens.expiry_date ?? null,
    };
    const returnTo = (req.session as any).oauthReturnTo as string | undefined;
    delete (req.session as any).oauthReturnTo;
    await new Promise<void>((resolve, reject) => req.session.save(e => e ? reject(e) : resolve()));
    res.redirect(returnTo ?? 'http://localhost:5173/calendar');
  } catch (err: any) {
    res.status(500).send('OAuth error: ' + err.message);
  }
});

// GET /api/calendar/status — is the user connected?
// If access token is expired but refresh token exists, proactively refresh it.
router.get('/status', async (req, res) => {
  const tokens = req.session.googleTokens;
  if (!tokens?.access_token) return res.json({ connected: false });

  const isExpired = tokens.expiry_date ? tokens.expiry_date < Date.now() + 60_000 : false;
  if (isExpired && tokens.refresh_token) {
    try {
      const auth = getOAuth2Client();
      auth.setCredentials(tokens);
      const { credentials } = await auth.refreshAccessToken();
      req.session.googleTokens = {
        access_token: credentials.access_token ?? tokens.access_token,
        refresh_token: credentials.refresh_token ?? tokens.refresh_token,
        expiry_date: credentials.expiry_date ?? null,
      };
      await new Promise<void>((resolve, reject) => req.session.save(e => e ? reject(e) : resolve()));
    } catch {
      // refresh failed — still connected if access token hasn't hard-expired
    }
  }

  res.json({ connected: true });
});

// DELETE /api/calendar/disconnect
router.delete('/disconnect', (req, res) => {
  req.session.googleTokens = undefined;
  res.json({ ok: true });
});

// SF fiscal year starts Feb 1. FQ: Q1=Feb-Apr, Q2=May-Jul, Q3=Aug-Oct, Q4=Nov-Jan
function sfFiscalQuarter(date: Date): { start: Date; end: Date } {
  const m = date.getMonth();
  const y = date.getFullYear();
  if (m >= 1 && m <= 3) return { start: new Date(y, 1, 1, 0,0,0,0),      end: new Date(y, 3, 30, 23,59,59,999) };
  if (m >= 4 && m <= 6) return { start: new Date(y, 4, 1, 0,0,0,0),      end: new Date(y, 6, 31, 23,59,59,999) };
  if (m >= 7 && m <= 9) return { start: new Date(y, 7, 1, 0,0,0,0),      end: new Date(y, 9, 31, 23,59,59,999) };
  // Q4: Nov–Jan. Jan belongs to the Q4 that started the prior November.
  const q4start = m === 0 ? new Date(y - 1, 10, 1, 0,0,0,0) : new Date(y, 10, 1, 0,0,0,0);
  const q4end   = m === 0 ? new Date(y, 0, 31, 23,59,59,999) : new Date(y + 1, 0, 31, 23,59,59,999);
  return { start: q4start, end: q4end };
}

function sfFiscalYear(date: Date): { start: Date; end: Date } {
  const fyStart = date.getMonth() >= 1 ? date.getFullYear() : date.getFullYear() - 1;
  return {
    start: new Date(fyStart, 1, 1, 0, 0, 0, 0),
    end:   new Date(fyStart + 1, 0, 31, 23, 59, 59, 999),
  };
}

function dateRange(preset: string, customFrom?: string, customTo?: string): { timeMin: string; timeMax: string } {
  const now = new Date();
  let start: Date, end: Date;

  switch (preset) {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      break;
    case 'this_week': {
      const dow = now.getDay();
      start = new Date(now); start.setDate(now.getDate() - dow); start.setHours(0,0,0,0);
      end   = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
      break;
    }
    case 'this_month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
    case 'last_month':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    case 'current_fq':
      ({ start, end } = sfFiscalQuarter(now));
      break;
    case 'last_fq': {
      const prev = new Date(now); prev.setMonth(prev.getMonth() - 3);
      ({ start, end } = sfFiscalQuarter(prev));
      break;
    }
    case 'next_fq': {
      const next = new Date(now); next.setMonth(next.getMonth() + 3);
      ({ start, end } = sfFiscalQuarter(next));
      break;
    }
    case 'current_fy':
      ({ start, end } = sfFiscalYear(now));
      break;
    case 'last_fy':
      ({ start, end } = sfFiscalYear(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())));
      break;
    case 'last_30':
      start = new Date(now); start.setDate(now.getDate() - 30); start.setHours(0,0,0,0);
      end   = now;
      break;
    case 'last_90':
      start = new Date(now); start.setDate(now.getDate() - 90); start.setHours(0,0,0,0);
      end   = now;
      break;
    case 'next_30':
      start = now;
      end   = new Date(now); end.setDate(now.getDate() + 30); end.setHours(23,59,59,999);
      break;
    case 'next_90':
      start = now;
      end   = new Date(now); end.setDate(now.getDate() + 90); end.setHours(23,59,59,999);
      break;
    case 'custom':
      start = customFrom ? new Date(customFrom + 'T00:00:00') : new Date(now.getFullYear(), 0, 1);
      end   = customTo   ? new Date(customTo   + 'T23:59:59') : now;
      break;
    default:
      ({ start, end } = sfFiscalQuarter(now));
  }

  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

// GET /api/calendar/events
router.get('/events', async (req, res) => {
  const tokens = req.session.googleTokens;
  if (!tokens?.access_token) return res.status(401).json({ error: 'Not connected to Google Calendar' });

  const {
    datePreset = 'current_fq',
    dateFrom, dateTo,
    subject, attendee, description,
    currentUserId,
  } = req.query as Record<string, string>;

  try {
    const auth = getOAuth2Client();
    auth.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? undefined,
      expiry_date: tokens.expiry_date ?? undefined,
    });

    auth.on('tokens', (newTokens) => {
      if (newTokens.access_token) {
        req.session.googleTokens = {
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token ?? tokens.refresh_token ?? null,
          expiry_date: newTokens.expiry_date ?? null,
        };
        req.session.save(() => {});
      }
    });

    const cal = google.calendar({ version: 'v3', auth });
    const { timeMin, timeMax } = dateRange(datePreset, dateFrom, dateTo);

    const response = await cal.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      maxResults: 500,
      singleEvents: true,
      orderBy: 'startTime',
    });

    let events = response.data.items ?? [];

    // Parse filter string into include/exclude term lists.
    // Each comma-separated term prefixed with - or ! is an exclude; otherwise include.
    function parseTerms(filter: string) {
      // Split on commas that are NOT inside quotes
      const parts: string[] = [];
      let cur = '', inQuote = false;
      for (let i = 0; i < filter.length; i++) {
        const ch = filter[i];
        if (ch === '"') { inQuote = !inQuote; cur += ch; }
        else if (ch === ',' && !inQuote) { if (cur.trim()) parts.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
      if (cur.trim()) parts.push(cur.trim());

      const include: string[] = [];
      const exclude: string[] = [];
      for (const p of parts) {
        const neg = p.startsWith('-') || p.startsWith('!');
        let term = (neg ? p.slice(1) : p).trim();
        if ((term.startsWith('"') && term.endsWith('"')) || (term.startsWith("'") && term.endsWith("'"))) {
          term = term.slice(1, -1).trim();
        }
        if (term) (neg ? exclude : include).push(term.toLowerCase());
      }
      return { include, exclude };
    }

    function matchesField(value: string, filter: string): boolean {
      const { include, exclude } = parseTerms(filter);
      const v = value.toLowerCase();
      if (exclude.some(t => v.includes(t))) return false;
      if (include.length && !include.some(t => v.includes(t))) return false;
      return true;
    }

    function matchesAttendee(attendees: any[], filter: string): boolean {
      const { include, exclude } = parseTerms(filter);
      const names = attendees.map(a => `${(a.displayName ?? '')} ${(a.email ?? '')}`.toLowerCase());
      if (exclude.some(t => names.some(n => n.includes(t)))) return false;
      if (include.length && !include.some(t => names.some(n => n.includes(t)))) return false;
      return true;
    }

    if (subject) events = events.filter(e => matchesField(e.summary ?? '', subject));
    if (attendee) events = events.filter(e => matchesAttendee(e.attendees ?? [], attendee));
    if (description) events = events.filter(e => matchesField(e.description ?? '', description));

    // Match against SF Events: scoped to current user to avoid large-org timeout
    try {
      const conn = getConnection();
      const ownerClause = currentUserId ? ` AND OwnerId = '${currentUserId}'` : '';
      const sfResult = await conn.query<{ Id: string; Subject: string; StartDateTime: string }>(
        `SELECT Id, Subject, StartDateTime FROM Event WHERE StartDateTime >= ${timeMin} AND StartDateTime <= ${timeMax} AND StartDateTime != null${ownerClause}`
      );
      // Map "date|subject" → SF record Id
      const sfMap = new Map<string, string>();
      for (const sfEvt of sfResult.records) {
        const day = sfEvt.StartDateTime.slice(0, 10);
        const subj = (sfEvt.Subject ?? '').toLowerCase().trim();
        sfMap.set(`${day}|${subj}`, sfEvt.Id);
      }
      const sfInstance = process.env.SF_INSTANCE_URL ?? 'https://org62.my.salesforce.com';
      events = events.map(e => {
        const startDT = e.start?.dateTime ?? e.start?.date ?? '';
        const day = startDT.slice(0, 10);
        const subj = (e.summary ?? '').toLowerCase().trim();
        const exactKey = `${day}|${subj}`;
        let sfId: string | undefined = sfMap.get(exactKey);
        if (!sfId) {
          for (const [k, id] of sfMap.entries()) {
            if (k.startsWith(day + '|')) {
              const kSubj = k.split('|')[1];
              if (kSubj.includes(subj) || subj.includes(kSubj)) { sfId = id; break; }
            }
          }
        }
        return sfId
          ? { ...e, _loggedInSF: true, _sfEventId: sfId, _sfEventUrl: `${sfInstance}/lightning/r/Event/${sfId}/view` }
          : { ...e, _loggedInSF: false };
      });
    } catch (_) {
      // SF lookup failure shouldn't break calendar display
    }

    res.json({ events, timeMin, timeMax });
  } catch (err: any) {
    if (err.code === 401 || err.message?.includes('invalid_grant')) {
      req.session.googleTokens = undefined;
      return res.status(401).json({ error: 'Google session expired — please reconnect' });
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;
