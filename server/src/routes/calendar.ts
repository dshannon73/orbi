import { Router } from 'express';
import { spawn } from 'child_process';
import { getConnection } from '../sf';

const router = Router();

const CLAUDE_PATH = '/Users/dshannon/.local/bin/claude';
const CLAUDE_ENV = { ...process.env, PATH: `${process.env.PATH}:/Users/dshannon/.local/bin` };

function runClaude(prompt: string, timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(CLAUDE_PATH, ['--print', '--dangerously-skip-permissions', '--output-format', 'text'], {
      env: CLAUDE_ENV,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('claude subprocess timed out'));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${stderr.trim()}`));
      resolve(stdout.trim());
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

// GET /api/calendar/status — always connected when MCP is configured
router.get('/status', (_req, res) => {
  res.json({ connected: true, method: 'mcp' });
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

// GET /api/calendar/events — fetch via Google Calendar MCP through Claude subprocess
router.get('/events', async (req, res) => {
  const {
    datePreset = 'current_fq',
    dateFrom, dateTo,
    subject, attendee, description,
    currentUserId,
  } = req.query as Record<string, string>;

  const { timeMin, timeMax } = dateRange(datePreset, dateFrom, dateTo);

  const prompt = [
    `Use the google-workspace MCP tool get_events with these parameters:`,
    `  timeMin: "${timeMin}"`,
    `  timeMax: "${timeMax}"`,
    `  maxResults: 500`,
    `  singleEvents: true`,
    `  orderBy: "startTime"`,
    ``,
    `Return ONLY a valid JSON array of calendar event objects. No explanation, no markdown, no code fences.`,
    `Each event object should include: id, summary, start, end, attendees, description, location, htmlLink, hangoutLink, organizer, creator.`,
    `If there are no events, return an empty array: []`,
  ].join('\n');

  try {
    const raw = await runClaude(prompt, 90_000);

    // Strip markdown code fences if present
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    let events: any[] = [];
    try {
      const parsed = JSON.parse(cleaned);
      events = Array.isArray(parsed) ? parsed : (parsed.items ?? parsed.events ?? []);
    } catch {
      return res.status(500).json({ error: 'Failed to parse calendar response from MCP', raw: raw.slice(0, 500) });
    }

    // Parse filter string into include/exclude term lists.
    function parseTerms(filter: string) {
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

    // Match against SF Events
    try {
      const conn = getConnection();
      const ownerClause = currentUserId ? ` AND OwnerId = '${currentUserId}'` : '';
      const sfResult = await conn.query<{ Id: string; Subject: string; StartDateTime: string }>(
        `SELECT Id, Subject, StartDateTime FROM Event WHERE StartDateTime >= ${timeMin} AND StartDateTime <= ${timeMax} AND StartDateTime != null${ownerClause}`
      );
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
    res.status(500).json({ error: err.message });
  }
});

export default router;
