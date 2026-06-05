import { Router } from 'express';
import OpenAI from 'openai';
import { getConnection } from '../sf';

const router = Router();

// ── LLM client (SF LLM Gateway Express; OpenAI-compatible) ──
const llmGateway = new OpenAI({
  apiKey: process.env.ENG_AI_MODEL_GW_KEY,
  baseURL: 'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl',
});

function stripFences(raw: string): string {
  return raw.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '').trim();
}

async function callLLM(
  systemPrompt: string,
  userContent: string,
  onIO?: (input: { system: string; user: string }, output: string) => void,
): Promise<string> {
  const res = await llmGateway.chat.completions.create({
    model: 'claude-sonnet-4-20250514',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    max_tokens: 8192,
  } as any);
  const raw = res.choices[0]?.message?.content ?? '{}';
  const finishReason = res.choices[0]?.finish_reason;
  const cleaned = stripFences(raw);
  console.log(`[LLM] finish_reason=${finishReason} raw=${raw.length} cleaned=${cleaned.length}`);
  if (finishReason === 'length') {
    console.warn('[LLM] WARNING: response truncated — increase batch size or max_tokens');
  }
  onIO?.({ system: systemPrompt, user: userContent }, cleaned);
  return cleaned;
}

// Classify events in batches to avoid hitting max_tokens
async function classifyEventsBatched(
  events: Array<{ id: string; summary: string; description: string; [key: string]: any }>,
  systemPrompt: string,
  onIO?: (input: { system: string; user: string }, output: string) => void,
  batchSize = 30,
): Promise<Array<{ id: string; taskType: string | null; group: string; accountI?: number | null }>> {
  const results: Array<{ id: string; taskType: string | null; group: string; accountI?: number | null }> = [];

  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    const userContent = JSON.stringify({ events: batch });
    const raw = await callLLM(systemPrompt, userContent,
      onIO ? (input, output) => onIO({ ...input, user: `[batch ${Math.floor(i/batchSize)+1}] ${input.user}` }, output) : undefined
    );
    let parsed: any = {};
    try { parsed = JSON.parse(raw); }
    catch { const m = raw.match(/\{[\s\S]*\}/); try { parsed = m ? JSON.parse(m[0]) : {}; } catch {} }
    results.push(...(parsed.events ?? []));
  }

  return results;
}

// ── Utility ────────────────────────────────────────────────────────────────────

function parseTermList(raw: string): string[] {
  // comma-separated, respects "quoted phrases", strips - prefix for exclusions
  const parts: string[] = [];
  let cur = '', inQ = false;
  for (const ch of raw) {
    if (ch === '"') { inQ = !inQ; cur += ch; }
    else if (ch === ',' && !inQ) { if (cur.trim()) parts.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function parseTerms(raw: string[]): { include: string[]; exclude: string[] } {
  const include: string[] = [], exclude: string[] = [];
  for (const t of raw) {
    const s = t.trim(); if (!s) continue;
    const isNeg = s.startsWith('-') || s.startsWith('!');
    let term = (isNeg ? s.slice(1) : s).trim();
    if ((term.startsWith('"') && term.endsWith('"')) || (term.startsWith("'") && term.endsWith("'")))
      term = term.slice(1, -1).trim();
    if (!term) continue;
    (isNeg ? exclude : include).push(term.toLowerCase());
  }
  return { include, exclude };
}

function matchesTerms(text: string, terms: { include: string[]; exclude: string[] }, requireInclude = false): boolean {
  const lower = text.toLowerCase();
  if (terms.exclude.some(t => lower.includes(t))) return false;
  if (requireInclude && terms.include.length > 0) return terms.include.some(t => lower.includes(t));
  return true;
}

function fmt$(n: number | null | undefined): string {
  if (!n) return '';
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : `$${n}`;
}

function recencyScore(lastModifiedDate: string | null): number {
  if (!lastModifiedDate) return 0;
  const days = (Date.now() - new Date(lastModifiedDate).getTime()) / 86400000;
  if (days <= 14) return 1.0; if (days <= 30) return 0.7;
  if (days <= 60) return 0.4; if (days <= 90) return 0.2;
  return 0;
}

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[\s\-_/,.()\[\]&@#!?:;'"]+/).filter(t => t.length >= 3);
}

const NOISE = new Set(['the','and','for','with','from','this','that','have','will','are','was','been',
  'call','meeting','team','teams','sync','weekly','daily','monthly','catch','review','check','update',
  'discussion','session','intro','kickoff','follow','prep','internal','external','standup',
  'offsite','onsite','lunch','coffee','all','hands','our','about','know','learn','help','your',
  'any','can','how','what','need','needs','new','get','use','using','best','next','join','also',
  // generic business nouns — appear in far too many unrelated event titles
  'account','accounts','customer','customers','product','products','platform','portal',
  'business','market','markets','sales','commerce','commercial','channel','partner','partners',
  'marketing','cloud','energy','digital','analytics','data','insight','insights','intelligence',
  'keynote','summit','conference','event','events','webinar','workshop','forum','expo',
  'innovation','initiative','strategy','strategic','transformation','solutions','network','networks',
  'software','hardware','infrastructure','integration','automation','operations','financial','finance',
  'healthcare','health','media','retail','manufacturing','distribution','logistics',
  // generic business suffixes
  'company','inc','corp','llc','ltd','limited','group','global','solution',
  'service','services','technologies','technology','tech','systems','system',
  'holdings','enterprises','enterprise','consulting','consultants',
  'management','international','national','american','corporate']);

// ── Account matching ────────────────────────────────────────────────────────────

interface AccountMatch {
  accountId: string;
  accountName: string;
  score: number;         // 0-100
  signals: string[];
}

function matchEventToAccounts(
  eventSummary: string,
  eventDescription: string,
  attendeeEmails: string[],
  attendeeSfIds: string[],
  accounts: any[],               // SF account records with OwnerId, Owner.Name etc
  emailToSfId: Map<string, string>,
): AccountMatch[] {
  const summaryLower = (eventSummary ?? '').toLowerCase();
  const descLower = (eventDescription ?? '').toLowerCase();
  const combined = `${summaryLower} ${descLower}`;
  const summaryTokens = tokenize(eventSummary).filter(t => !NOISE.has(t));
  const attendeeDomainsLower = attendeeEmails.map(e => (e.split('@')[1] ?? '').toLowerCase());

  const matches: AccountMatch[] = [];

  for (const acc of accounts) {
    const accName = (acc.Name ?? '').toLowerCase();
    const accTokens = tokenize(acc.Name ?? '').filter(t => !NOISE.has(t) && t.length >= 5);
    let score = 0;
    const signals: string[] = [];

    // Word-boundary check: tok must appear as a whole word (not a substring of another word)
    const wordMatch = (text: string, tok: string) =>
      new RegExp(`(?<![a-z0-9])${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i').test(text);

    // Signal 1: account name in summary (strongest)
    if (accName.length >= 3 && summaryLower.includes(accName)) {
      score += 60; signals.push('name in title');
    } else if (accTokens.some(tok => wordMatch(summaryLower, tok))) {
      score += 35; signals.push('partial name in title');
    }

    // Signal 2: account name in description
    if (score === 0 && accName.length >= 3 && descLower.includes(accName)) {
      score += 25; signals.push('name in description');
    }

    // Signal 3: attendee email domain matches known account domain
    // (derive domain from account name tokens — rough but effective)
    const accDomain = accTokens[0]; // first meaningful token as proxy domain
    if (accDomain && attendeeDomainsLower.some(d => d.startsWith(accDomain) || accDomain.startsWith(d.split('.')[0]))) {
      score += 30; signals.push('attendee domain match');
    }

    // Signal 4: attendee is SF user who owns the account or its opps
    if (attendeeSfIds.some(sfId => sfId === acc.OwnerId)) {
      score += 25; signals.push('attendee owns account');
    }

    if (score > 0) matches.push({ accountId: acc.Id, accountName: acc.Name, score, signals });
  }

  return matches.sort((a, b) => b.score - a.score);
}

// ── Opp ranking within an account ──────────────────────────────────────────────

function rankOpps(
  opps: any[],
  myDCOppIds: Set<string>,
  teamDCOppIds: Set<string>,
  oppIdsWithMyActivity: Set<string>,
): any[] {
  const FC_RANK: Record<string, number> = { Commit: 4, 'Best Case': 3, Pipeline: 2, Omitted: 0 };

  return opps
    .filter(o => (o.ForecastCategoryName ?? '') !== 'Omitted')
    .map(o => {
      let score = 0;
      const reasons: string[] = [];

      const fcScore = (FC_RANK[o.ForecastCategoryName] ?? 1) * 15;
      score += fcScore;
      if (o.ForecastCategoryName === 'Commit') reasons.push('Commit forecast');
      else if (o.ForecastCategoryName === 'Best Case') reasons.push('Best Case forecast');

      const amtScore = Math.min((o.Amount ?? 0) / 500_000, 1) * 20;
      score += amtScore;
      if (o.Amount >= 500_000) reasons.push(`${fmt$(o.Amount)} deal`);
      else if (o.Amount > 0) reasons.push(`${fmt$(o.Amount)}`);

      const rec = recencyScore(o.LastModifiedDate);
      score += rec * 15;
      if (rec >= 0.7) reasons.push('updated recently');

      if (myDCOppIds.has(o.Id)) { score += 20; reasons.push('your DC exists'); }
      if (teamDCOppIds.has(o.Id)) { score += 25; reasons.push('team member has DC'); }
      if (oppIdsWithMyActivity.has(o.Id)) { score += 10; reasons.push('activity logged'); }

      const daysToClose = o.CloseDate
        ? Math.round((new Date(o.CloseDate).getTime() - Date.now()) / 86400000)
        : null;
      if (daysToClose !== null && daysToClose <= 30 && daysToClose >= 0) reasons.push(`closes in ${daysToClose}d`);

      return { ...o, _score: score, _rankReasons: reasons };
    })
    .sort((a, b) => b._score - a._score);
}

// ── DC gap priority ─────────────────────────────────────────────────────────────

function dcPriority(opp: any, totalActivities: number, totalDurationMins: number): { priority: string; splitPct: number } {
  const FC_RANK: Record<string, number> = { Commit: 3, 'Best Case': 2, Pipeline: 1 };
  const fc = FC_RANK[opp.ForecastCategoryName] ?? 0;
  const daysToClose = opp.CloseDate
    ? (new Date(opp.CloseDate).getTime() - Date.now()) / 86400000
    : 999;

  let priority = 'Low';
  if (fc >= 3 || daysToClose <= 30) priority = 'High';
  else if (fc >= 2 || daysToClose <= 90) priority = 'Medium';

  // Split % based on engagement
  let splitPct = 50;
  const totalHours = totalDurationMins / 60;
  if (totalActivities >= 7 || totalHours >= 24) splitPct = 100;
  else if (totalActivities <= 4 && totalHours < 4) splitPct = 25;

  return { priority, splitPct };
}

// ── Main route ─────────────────────────────────────────────────────────────────

router.post('/briefing', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  function send(type: string, payload: object) {
    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
  }

  try {
    const conn = getConnection();
    const {
      currentUserId, dateFrom, dateTo,
      accountScope,    // comma-separated name filter (include/exclude)
      calExclude,      // comma-separated exclude terms for calendar events
      roleFilter,      // comma-separated role fuzzy match list
      lookbackMonths,  // historical engagement window in months (default 24)
    } = req.body as {
      currentUserId: string;
      dateFrom: string;
      dateTo: string;
      accountScope?: string;
      calExclude?: string;
      roleFilter?: string;
      lookbackMonths?: number;
    };

    if (!currentUserId) { send('error', { error: 'currentUserId required' }); return res.end(); }

    const fromDT = `${dateFrom}T00:00:00Z`;
    const toDT   = `${dateTo}T23:59:59Z`;
    const histLookbackMonths = lookbackMonths ?? 24;
    const historicalFromDT = new Date(Date.now() - histLookbackMonths * 30.44 * 86400_000).toISOString().slice(0, 10) + 'T00:00:00Z';
    const scopeTerms  = parseTerms(parseTermList(accountScope ?? ''));
    const excludeTerms = parseTerms(parseTermList(calExclude ?? ''));
    const roleTerms = (roleFilter ?? '').split(',').map(r => r.trim()).filter(Boolean);

    // ── 1. Google Calendar ─────────────────────────────────────────────────────
    send('progress', { step: 'calendar', message: 'Fetching Google Calendar events…' });
    let rawCalEvents: any[] = [];
    const sessionTokens = (req.session as any)?.googleTokens;
    if (sessionTokens) {
      try {
        const { google } = await import('googleapis');
        const oauth2 = new google.auth.OAuth2();
        oauth2.setCredentials(sessionTokens);
        const cal = google.calendar({ version: 'v3', auth: oauth2 });
        const gcResp = await cal.events.list({
          calendarId: 'primary', timeMin: fromDT, timeMax: toDT,
          singleEvents: true, orderBy: 'startTime', maxResults: 250,
        });
        rawCalEvents = (gcResp.data.items || []).filter((e: any) => e.status !== 'cancelled' && e.start?.dateTime);
        send('debug', { message: `Fetched ${rawCalEvents.length} timed events` });
      } catch (err: any) { send('debug', { message: `Calendar error: ${err.message}` }); }
    } else {
      send('debug', { message: 'No Google session — calendar skipped' });
    }

    // Apply exclude filter only (no include — we want all events by default)
    const calEvents = excludeTerms.exclude.length > 0
      ? rawCalEvents.filter(e => matchesTerms(`${e.summary ?? ''} ${e.description ?? ''}`, excludeTerms))
      : rawCalEvents;

    if (excludeTerms.exclude.length > 0) {
      const dropped = rawCalEvents.length - calEvents.length;
      if (dropped) send('debug', { message: `Excluded ${dropped} events by cal filter` });
    }

    send('progress', { step: 'calendar', message: `${calEvents.length} calendar event${calEvents.length !== 1 ? 's' : ''} in range` });

    // ── 1b. SE Task Type picklist ──────────────────────────────────────────────
    let seTaskTypes: string[] = [];
    try {
      const desc = await conn.sobject('Event').describe();
      const field = (desc.fields as any[]).find((f: any) => f.name === 'SE_Task_Type__c');
      seTaskTypes = (field?.picklistValues ?? []).filter((v: any) => v.active).map((v: any) => v.value as string);
      send('debug', { message: `SE_Task_Type__c picklist: ${seTaskTypes.length > 0 ? seTaskTypes.join(', ') : '(none found)'}` });
    } catch (err: any) {
      send('debug', { message: `SE_Task_Type__c picklist error: ${err.message}` });
    }

    // ── 2. Resolve attendee emails → SF users ──────────────────────────────────
    send('progress', { step: 'attendees', message: 'Resolving attendees to Salesforce users…' });
    const allEmails = new Set<string>();
    calEvents.forEach(e => (e.attendees || []).forEach((a: any) => { if (a.email && !a.self) allEmails.add(a.email.toLowerCase()); }));

    const emailToSfId = new Map<string, string>();
    const sfIdToUser = new Map<string, any>();
    if (allEmails.size > 0) {
      try {
        const emailList = [...allEmails].slice(0, 100).map(e => `'${e.replace(/'/g, "''")}'`).join(',');
        const ur = await conn.query(`SELECT Id, Email, Name, UserRole.Name FROM User WHERE Email IN (${emailList})`);
        (ur.records as any[]).forEach((u: any) => {
          if (u.Email) { emailToSfId.set(u.Email.toLowerCase(), u.Id); sfIdToUser.set(u.Id, u); }
        });
      } catch { /* non-fatal */ }
    }
    const attendeeSfIds = new Set(emailToSfId.values());
    send('progress', { step: 'attendees', message: `${emailToSfId.size} attendee${emailToSfId.size !== 1 ? 's' : ''} matched to SF users` });

    // ── 3. SF activities already logged in timeframe ───────────────────────────
    send('progress', { step: 'activities', message: 'Fetching logged SF activities…' });
    const sfEventsResult = await conn.query(
      `SELECT Id, Subject, StartDateTime, EndDateTime, WhatId, What.Name, AccountId, Account.Name
       FROM Event
       WHERE OwnerId = '${currentUserId}'
         AND StartDateTime >= ${fromDT}
         AND StartDateTime <= ${toDT}
       ORDER BY StartDateTime ASC LIMIT 300`
    );
    const sfLoggedEvents = sfEventsResult.records as any[];

    // Index SF events by UTC timestamp + subject for already-logged detection.
    // We use UTC timestamps (not local-date slices) to avoid mismatches when an
    // evening cal event's local date differs from its UTC date.
    interface SfEventIndex { ts: number; utcDate: string; subject: string }
    const sfEventIndex: SfEventIndex[] = sfLoggedEvents.map((e: any) => {
      const ts = new Date(e.StartDateTime).getTime();
      return {
        ts,
        utcDate: new Date(ts).toISOString().slice(0, 10),
        subject: (e.Subject ?? '').toLowerCase().trim(),
      };
    });

    function isAlreadyLogged(calEvent: any): boolean {
      const calTs  = new Date(calEvent.start?.dateTime ?? '').getTime();
      if (isNaN(calTs)) return false;
      const calUtcDate = new Date(calTs).toISOString().slice(0, 10);
      const subj = (calEvent.summary ?? '').toLowerCase().trim();

      return sfEventIndex.some(sf => {
        // Must be on the same UTC date
        if (sf.utcDate !== calUtcDate) return false;
        // Exact subject match
        if (sf.subject === subj) return true;
        // Partial subject match: share first 8 chars in either direction
        return sf.subject.length >= 5 && (
          sf.subject.includes(subj.slice(0, 8)) || subj.includes(sf.subject.slice(0, 8))
        );
      });
    }

    // Duration of logged events per WhatId (opp) and AccountId
    const loggedDurationByOpp = new Map<string, number>();
    const loggedCountByOpp = new Map<string, number>();
    const loggedDurationByAccount = new Map<string, number>();
    const loggedCountByAccount = new Map<string, number>();
    const oppIdsWithMyActivity = new Set<string>();

    sfLoggedEvents.forEach((e: any) => {
      const mins = e.StartDateTime && e.EndDateTime
        ? Math.round((new Date(e.EndDateTime).getTime() - new Date(e.StartDateTime).getTime()) / 60000)
        : 0;
      if (e.WhatId) {
        oppIdsWithMyActivity.add(e.WhatId);
        loggedDurationByOpp.set(e.WhatId, (loggedDurationByOpp.get(e.WhatId) ?? 0) + mins);
        loggedCountByOpp.set(e.WhatId, (loggedCountByOpp.get(e.WhatId) ?? 0) + 1);
      }
      if (e.AccountId) {
        loggedDurationByAccount.set(e.AccountId, (loggedDurationByAccount.get(e.AccountId) ?? 0) + mins);
        loggedCountByAccount.set(e.AccountId, (loggedCountByAccount.get(e.AccountId) ?? 0) + 1);
      }
    });

    send('progress', { step: 'activities', message: `${sfLoggedEvents.length} SF activit${sfLoggedEvents.length !== 1 ? 'ies' : 'y'} in timeframe` });

    // ── 4. Scoped accounts + opportunities ────────────────────────────────────
    send('progress', { step: 'opps', message: 'Querying Salesforce accounts and opportunities…' });

    // Build role filter clause (OR across multiple roles, applied to opp owner + account owner)
    let roleClause = '';
    if (roleTerms.length > 0) {
      const roleConditions = roleTerms.map(r => {
        const safe = r.replace(/'/g, "''");
        return `Owner.UserRole.Name LIKE '%${safe}%' OR Account.Owner.UserRole.Name LIKE '%${safe}%'`;
      }).join(' OR ');
      roleClause = ` AND (${roleConditions})`;
    }

    // Scope by account/opp name if provided
    let nameClause = '';
    if (scopeTerms.include.length > 0) {
      const includes = scopeTerms.include.map(t => {
        const safe = t.replace(/'/g, "''");
        return `Account.Name LIKE '%${safe}%' OR Name LIKE '%${safe}%'`;
      }).join(' OR ');
      nameClause = ` AND (${includes})`;
    }

    const oppsResult = await conn.query(
      `SELECT Id, Name, Amount, StageName, ForecastCategoryName, CloseDate,
              OwnerId, Owner.Name, Owner.Email, Owner.UserRole.Name,
              AccountId, Account.Name, Account.OwnerId, Account.Owner.Name, Account.Owner.Email, Account.Owner.UserRole.Name,
              LastModifiedDate, LastActivityDate
       FROM Opportunity
       WHERE IsClosed = false
         AND ForecastCategoryName != 'Omitted'${nameClause}${roleClause}
       ORDER BY LastModifiedDate DESC NULLS LAST LIMIT 1000`
    );
    let scopedOpps = oppsResult.records as any[];

    // Helper: does an opp pass the scope name filters?
    function oppPassesScope(o: any): boolean {
      const accName = (o['Account']?.Name ?? '').toLowerCase();
      const oppName = (o.Name ?? '').toLowerCase();
      if (scopeTerms.exclude.some(t => accName.includes(t) || oppName.includes(t))) return false;
      if (scopeTerms.include.length > 0) {
        return scopeTerms.include.some(t => accName.includes(t) || oppName.includes(t));
      }
      return true;
    }

    // Apply exclude (and re-check include) on the primary result set
    if (scopeTerms.exclude.length > 0 || scopeTerms.include.length > 0) {
      scopedOpps = scopedOpps.filter(oppPassesScope);
    }

    // Pull in attendee-owned opps — but only those that also pass scope filters
    if (attendeeSfIds.size > 0) {
      try {
        const idList = [...attendeeSfIds].map(id => `'${id}'`).join(',');
        const attendeeOppRes = await conn.query(
          `SELECT Id, Name, Amount, StageName, ForecastCategoryName, CloseDate,
                  OwnerId, Owner.Name, Owner.Email, Owner.UserRole.Name,
                  AccountId, Account.Name, Account.OwnerId, Account.Owner.Name, Account.Owner.Email, Account.Owner.UserRole.Name,
                  LastModifiedDate, LastActivityDate
           FROM Opportunity
           WHERE IsClosed = false AND ForecastCategoryName != 'Omitted'
             AND (OwnerId IN (${idList}) OR Account.OwnerId IN (${idList}))${nameClause}
           ORDER BY LastModifiedDate DESC NULLS LAST LIMIT 200`
        );
        const existingIds = new Set(scopedOpps.map((o: any) => o.Id));
        const newOpps = (attendeeOppRes.records as any[])
          .filter(o => !existingIds.has(o.Id) && oppPassesScope(o));
        if (newOpps.length) {
          send('debug', { message: `Added ${newOpps.length} attendee-owned opp(s)` });
          scopedOpps = [...scopedOpps, ...newOpps];
        }
      } catch { /* non-fatal */ }
    }

    // Unique accounts from scoped opps
    const accountMap = new Map<string, any>();
    scopedOpps.forEach(o => {
      if (o.AccountId && !accountMap.has(o.AccountId)) {
        accountMap.set(o.AccountId, { Id: o.AccountId, Name: o['Account']?.Name, OwnerId: o['Account']?.OwnerId });
      }
    });

    // Supplement: pull in accounts whose names appear in calendar event titles.
    // The role filter restricts the opp query, but should NOT prevent matching
    // a meeting titled "Emerson sync" just because the AE's role doesn't match.
    // Extract meaningful tokens from all cal event summaries and search SF accounts.
    if (calEvents.length > 0) {
      try {
        const calTokens = new Set<string>();
        calEvents.forEach(e => {
          tokenize(e.summary ?? '').forEach(t => {
            if (!NOISE.has(t) && t.length >= 3) calTokens.add(t);
          });
        });
        if (calTokens.size > 0) {
          const tokenList = [...calTokens];
          const TOKEN_BATCH = 20;
          const calAccRecords: any[] = [];
          for (let i = 0; i < tokenList.length; i += TOKEN_BATCH) {
            const batch = tokenList.slice(i, i + TOKEN_BATCH);
            const tokenConditions = batch.map(t => `Name LIKE '%${t.replace(/'/g, "''")}%'`).join(' OR ');
            try {
              const res = await conn.query(`SELECT Id, Name, OwnerId FROM Account WHERE (${tokenConditions}) LIMIT 100`);
              calAccRecords.push(...(res.records as any[]));
            } catch { /* non-fatal */ }
          }
          let added = 0;
          calAccRecords.forEach((a: any) => {
            if (!accountMap.has(a.Id)) {
              const accNameLower = (a.Name ?? '').toLowerCase();
              if (scopeTerms.exclude.some(t => accNameLower.includes(t))) return;
              if (scopeTerms.include.length > 0 && !scopeTerms.include.some(t => accNameLower.includes(t))) return;
              accountMap.set(a.Id, { Id: a.Id, Name: a.Name, OwnerId: a.OwnerId });
              added++;
            }
          });
          if (added) send('debug', { message: `Added ${added} account(s) from calendar event title matching` });
        }
      } catch { /* non-fatal */ }
    }

    const accounts = [...accountMap.values()];

    // Resolve ultimate parent (global company) for each account — walk ParentId chain up to 3 levels
    const parentAccountMap = new Map<string, { id: string; name: string }>(); // accountId → ultimate parent
    if (accounts.length > 0) {
      try {
        const ACC_BATCH = 200;
        const accDetailRecords: any[] = [];
        for (let i = 0; i < accounts.length; i += ACC_BATCH) {
          const accIdList = accounts.slice(i, i + ACC_BATCH).map(a => `'${a.Id}'`).join(',');
          const res = await conn.query(
            `SELECT Id, ParentId, Parent.Name, Parent.ParentId, Parent.Parent.Name, Parent.Parent.ParentId
             FROM Account WHERE Id IN (${accIdList})`
          );
          accDetailRecords.push(...(res.records as any[]));
        }
        const accDetailRes = { records: accDetailRecords };
        (accDetailRes.records as any[]).forEach((a: any) => {
          // Walk up: use deepest non-null ancestor
          let parentId: string | null = null;
          let parentName: string | null = null;
          if (a.Parent?.Parent?.ParentId) {
            // 3+ levels deep — use grandparent as approximation of global parent
            parentId = a.Parent.Parent.ParentId;
            parentName = null; // would need another query; skip name for now
          } else if (a.Parent?.ParentId) {
            parentId = a.Parent.ParentId;
            parentName = a.Parent.Parent?.Name ?? null;
          } else if (a.ParentId) {
            parentId = a.ParentId;
            parentName = a.Parent?.Name ?? null;
          }
          if (parentId && parentId !== a.Id) {
            parentAccountMap.set(a.Id, { id: parentId, name: parentName ?? '' });
          }
        });
        // Backfill any missing parent names (IDs we have but no name for)
        const missingNameIds = [...parentAccountMap.values()].filter(p => !p.name).map(p => p.id);
        if (missingNameIds.length > 0) {
          const missingRes = await conn.query(`SELECT Id, Name FROM Account WHERE Id IN (${missingNameIds.map(id => `'${id}'`).join(',')})`);
          (missingRes.records as any[]).forEach((a: any) => {
            parentAccountMap.forEach((v, k) => { if (v.id === a.Id && !v.name) v.name = a.Name; });
          });
        }
      } catch { /* non-fatal */ }
    }

    // Fetch opps for calendar-matched accounts that aren't already covered by scopedOpps.
    // These accounts were found via cal title matching and bypassed the role filter,
    // so we pull their opps without a role clause (just for the OppPicker — not for DC gap scoring).
    const supplementalAccountIds = accounts
      .map(a => a.Id)
      .filter(id => !scopedOpps.some(o => o.AccountId === id));
    if (supplementalAccountIds.length > 0) {
      try {
        const idList = supplementalAccountIds.map(id => `'${id}'`).join(',');
        const suppOppRes = await conn.query(
          `SELECT Id, Name, Amount, StageName, ForecastCategoryName, CloseDate,
                  OwnerId, Owner.Name, Owner.Email, Owner.UserRole.Name,
                  AccountId, Account.Name, Account.OwnerId, Account.Owner.Name, Account.Owner.Email, Account.Owner.UserRole.Name,
                  LastModifiedDate, LastActivityDate
           FROM Opportunity
           WHERE IsClosed = false AND ForecastCategoryName != 'Omitted'
             AND AccountId IN (${idList})
           ORDER BY LastModifiedDate DESC NULLS LAST LIMIT 100`
        );
        const existingIds = new Set(scopedOpps.map((o: any) => o.Id));
        const newOpps = (suppOppRes.records as any[]).filter(o => !existingIds.has(o.Id));
        if (newOpps.length) {
          send('debug', { message: `Added ${newOpps.length} opp(s) for calendar-matched accounts` });
          scopedOpps = [...scopedOpps, ...newOpps];
        }
      } catch { /* non-fatal */ }
    }

    send('progress', { step: 'opps', message: `${scopedOpps.length} opp${scopedOpps.length !== 1 ? 's' : ''} across ${accounts.length} account${accounts.length !== 1 ? 's' : ''}` });

    // ── 5. My DCs + team DCs ──────────────────────────────────────────────────
    send('progress', { step: 'dcs', message: 'Fetching Deal Contributions…' });
    const myDCOppIds = new Set<string>();
    const teamDCsByOpp = new Map<string, any[]>(); // oppId → [{seId, seName, role, splitPct}]

    if (scopedOpps.length > 0) {
      const DC_BATCH = 200;
      const oppIds = scopedOpps.map(o => o.Id);
      for (let i = 0; i < oppIds.length; i += DC_BATCH) {
        const batchIds = oppIds.slice(i, i + DC_BATCH).map(id => `'${id}'`).join(',');
        const dcRes = await conn.query(
          `SELECT Id, Opportunity__c, SE_Name__c, SE_Full_Name__c, Opportunity_Role__c, Split_Percentage__c
           FROM Deal_Contribution__c WHERE Opportunity__c IN (${batchIds})`
        );
        (dcRes.records as any[]).forEach((d: any) => {
          if (d.SE_Name__c === currentUserId) {
            myDCOppIds.add(d.Opportunity__c);
          } else {
            if (!teamDCsByOpp.has(d.Opportunity__c)) teamDCsByOpp.set(d.Opportunity__c, []);
            teamDCsByOpp.get(d.Opportunity__c)!.push({
              seId: d.SE_Name__c,
              seName: d.SE_Full_Name__c ?? '',
              role: d.Opportunity_Role__c ?? '',
              splitPct: d.Split_Percentage__c ?? 0,
            });
          }
        });
      }
    }

    // All opps with any team DC (not mine) — attendee overlap is used for reason text only
    const teamDCOppIds = new Set<string>(teamDCsByOpp.keys());
    // Subset where the DC holder was actually in one of your calendar meetings
    const attendeeTeamDCOppIds = new Set<string>();
    teamDCsByOpp.forEach((dcs, oppId) => {
      if (dcs.some(d => attendeeSfIds.has(d.seId))) attendeeTeamDCOppIds.add(oppId);
    });
    send('debug', { message: `Team DCs: ${teamDCOppIds.size} total, ${attendeeTeamDCOppIds.size} with meeting attendee` });

    // Per-account engagement score: DCs (role-filtered) + logged activities on opps
    // Used to surface "most engaged account" as a suggested logging target
    const accountEngagement = new Map<string, { dcCount: number; actCount: number; score: number }>();
    scopedOpps.forEach(o => {
      if (!o.AccountId) return;
      const eng = accountEngagement.get(o.AccountId) ?? { dcCount: 0, actCount: 0, score: 0 };
      // Count DCs on this opp — filter by role terms if provided (match against Opportunity_Role__c or SE role)
      const opDCs = teamDCsByOpp.get(o.Id) ?? [];
      const roleFilteredDCs = roleTerms.length > 0
        ? opDCs.filter(d => roleTerms.some(r => (d.role ?? '').toLowerCase().includes(r.toLowerCase())))
        : opDCs;
      if (myDCOppIds.has(o.Id)) eng.dcCount += 1;
      eng.dcCount += roleFilteredDCs.length;
      const acts = loggedCountByOpp.get(o.Id) ?? 0;
      eng.actCount += acts;
      eng.score = eng.dcCount * 3 + eng.actCount; // DCs weighted higher
      accountEngagement.set(o.AccountId, eng);
    });

    send('progress', { step: 'dcs', message: `${myDCOppIds.size} my DC${myDCOppIds.size !== 1 ? 's' : ''}, ${teamDCOppIds.size} team-attendee DC gap${teamDCOppIds.size !== 1 ? 's' : ''}` });

    // ── 5b. Historical engagement (last N months) ──────────────────────────────
    // Find accounts where user has a DC or Activity in the lookback window.
    // Expand via hierarchy (parent + siblings + direct children) using parentAccountMap.
    const historicallyEngagedAccountIds = new Set<string>();
    try {
      let histDCRecords: any[] = [];
      let histActRecords: any[] = [];
      try { const r = await conn.query(`SELECT Opportunity__r.AccountId FROM Deal_Contribution__c WHERE SE_Name__c = '${currentUserId}' AND CreatedDate >= ${historicalFromDT} AND Opportunity__r.AccountId != null`); histDCRecords = r.records as any[]; } catch { /* non-fatal */ }
      try { const r = await conn.query(`SELECT AccountId FROM Event WHERE OwnerId = '${currentUserId}' AND StartDateTime >= ${historicalFromDT} AND AccountId != null LIMIT 2000`); histActRecords = r.records as any[]; } catch { /* non-fatal */ }
      histDCRecords.forEach((d: any) => { const accId = d.Opportunity__r?.AccountId; if (accId) historicallyEngagedAccountIds.add(accId); });
      histActRecords.forEach((e: any) => { if (e.AccountId) historicallyEngagedAccountIds.add(e.AccountId); });
      send('debug', { message: `Historical engagement: ${historicallyEngagedAccountIds.size} account(s) from last ${histLookbackMonths} months` });
    } catch (err: any) {
      send('debug', { message: `Historical engagement error: ${err.message}` });
    }

    // Expand via hierarchy: for each historically-engaged account, also mark its
    // parent, siblings (same parent), and direct children as engaged.
    // Uses parentAccountMap which was built in step 4 from in-scope accounts.
    const expandedEngagedAccountIds = new Set<string>(historicallyEngagedAccountIds);
    historicallyEngagedAccountIds.forEach(accId => {
      const parent = parentAccountMap.get(accId);
      if (parent?.id) {
        expandedEngagedAccountIds.add(parent.id);
        // siblings: other accounts with same parent
        parentAccountMap.forEach((p, sibId) => {
          if (p.id === parent.id) expandedEngagedAccountIds.add(sibId);
        });
      }
      // direct children: accounts whose parent is this account
      parentAccountMap.forEach((p, childId) => {
        if (p.id === accId) expandedEngagedAccountIds.add(childId);
      });
    });

    // Build seId → accountIds index so we can quickly check per-event whether an attendee
    // has a DC on a given account (used as a matching signal for the LLM + group scoring)
    const seIdToAccountIds = new Map<string, Set<string>>();
    teamDCsByOpp.forEach((dcs, oppId) => {
      const opp = scopedOpps.find(o => o.Id === oppId);
      if (!opp?.AccountId) return;
      dcs.forEach(d => {
        if (!seIdToAccountIds.has(d.seId)) seIdToAccountIds.set(d.seId, new Set());
        seIdToAccountIds.get(d.seId)!.add(opp.AccountId);
      });
    });

    // Query which accounts attendees have logged activities on in this timeframe.
    // Cheap: scoped to the date range, limited to known attendee SF IDs.
    const attendeeActsByAccount = new Map<string, Set<string>>(); // accountId → Set<seId>
    if (attendeeSfIds.size > 0) {
      try {
        const idList = [...attendeeSfIds].map(id => `'${id}'`).join(',');
        const actRes = await conn.query(
          `SELECT AccountId, OwnerId FROM Event
           WHERE OwnerId IN (${idList})
             AND StartDateTime >= ${fromDT} AND StartDateTime <= ${toDT}
             AND AccountId != null LIMIT 500`
        );
        (actRes.records as any[]).forEach((e: any) => {
          if (!attendeeActsByAccount.has(e.AccountId)) attendeeActsByAccount.set(e.AccountId, new Set());
          attendeeActsByAccount.get(e.AccountId)!.add(e.OwnerId);
        });
        send('debug', { message: `Attendee activity coverage: ${attendeeActsByAccount.size} accounts` });
      } catch { /* non-fatal */ }
    }

    // ── 6. Match calendar events → accounts (deterministic) ───────────────────
    send('progress', { step: 'matching', message: 'Matching calendar events to accounts…' });

    // Annotate each cal event
    const annotatedEvents = calEvents.map(e => {
      const attendeeEmails = (e.attendees || []).filter((a: any) => !a.self).map((a: any) => a.email?.toLowerCase() ?? '');
      const attendeeSfIdsForEvent = attendeeEmails.map((em: string) => emailToSfId.get(em)).filter(Boolean) as string[];
      const startDT: string = e.start?.dateTime ?? '';
      const endDT: string   = e.end?.dateTime ?? '';
      const durationMins = startDT && endDT
        ? Math.round((new Date(endDT).getTime() - new Date(startDT).getTime()) / 60000)
        : 0;
      const logged = isAlreadyLogged(e);
      const accountMatches = matchEventToAccounts(
        e.summary ?? '', e.description ?? '',
        attendeeEmails, attendeeSfIdsForEvent,
        accounts, emailToSfId,
      );

      return {
        id: e.id ?? '',
        summary: e.summary ?? '(no title)',
        date: startDT.slice(0, 10),
        startDateTime: startDT,
        endDateTime: endDT,
        durationMins,
        attendeeEmails,
        attendeeSfIds: attendeeSfIdsForEvent,
        attendeeNames: (e.attendees || []).filter((a: any) => !a.self).map((a: any) => a.displayName || a.email || '').slice(0, 8),
        description: (e.description ?? '').replace(/<[^>]*>/g, ' ').trim().slice(0, 200),
        alreadyLogged: logged,
        accountMatches,        // sorted by score desc
        topAccountId: accountMatches[0]?.accountId ?? null,
        matchScore: accountMatches[0]?.score ?? 0,
      };
    });

    const unloggedAnnotated = annotatedEvents.filter(e => !e.alreadyLogged);
    send('debug', { message: `${unloggedAnnotated.length} unlogged events, ${annotatedEvents.filter(e => e.alreadyLogged).length} already logged` });

    // ── 7. LLM: single combined pass ───────────────────────────────────────────
    // One pass handles task type + group label + account matching for ALL unlogged events.
    // The LLM uses its inherent knowledge of Salesforce products, airports, conference names,
    // and common business terms — no exhaustive NOISE lists or regex fallbacks needed.
    //
    // Fast-path exception: score >= 60 (full account name verbatim in title) skips LLM matching
    // for that event's account but still goes through the pass for task type + group.
    //
    // Per-event candidate list (top 8 by token overlap) guides the LLM without constraining it.

    const suggestedTaskTypeMap = new Map<string, string>();
    const suggestedGroupMap = new Map<string, string>();

    if (unloggedAnnotated.length > 0) {
      send('progress', { step: 'llm', message: 'AI: classifying events and matching accounts…' });
      try {
        const taskTypeList = seTaskTypes.length > 0
          ? `Choose taskType from this EXACT list only (null if nothing fits):\n${seTaskTypes.map(t => `  "${t}"`).join('\n')}`
          : 'Set taskType to null (no picklist configured).';

        // Build per-event candidates (for events that don't already have a strong match).
        // Each candidate carries attendee engagement signals so the LLM can use them.
        function candidatesForEvent(
          e: typeof unloggedAnnotated[0],
          limit = 8,
        ): Array<{ i: number; name: string; _id: string; attendeeDCs: number; attendeeActs: number }> {
          const evAttendeeSfIds = e.attendeeSfIds as string[];

          if (e.matchScore >= 60) {
            const acc = accountMap.get(e.topAccountId!);
            if (!acc) return [];
            const attendeeDCs  = evAttendeeSfIds.filter(id => seIdToAccountIds.get(id)?.has(acc.Id)).length;
            const attendeeActs = evAttendeeSfIds.filter(id => attendeeActsByAccount.get(acc.Id)?.has(id)).length;
            return [{ i: 1, name: acc.Name, _id: acc.Id, attendeeDCs, attendeeActs }];
          }

          const evTokens = new Set(tokenize(`${e.summary} ${e.description}`).filter(t => !NOISE.has(t) && t.length >= 3));
          const evDomains = new Set(e.attendeeEmails.map((em: string) => em.split('@')[1]?.split('.')[0] ?? '').filter(Boolean));
          const evDomainsArr = [...evDomains] as string[];
          const scored = accounts.map(a => {
            const aTokens = tokenize(a.Name ?? '').filter(t => !NOISE.has(t) && t.length >= 3);
            const overlap = aTokens.filter(t => evTokens.has(t) || evDomainsArr.some(d => t.startsWith(d) || d.startsWith(t))).length;
            const domainHit = aTokens.some(t => evDomains.has(t)) ? 2 : 0;
            // Boost rank if attendees have DCs or activity on this account
            const attendeeDCs  = evAttendeeSfIds.filter(id => seIdToAccountIds.get(id)?.has(a.Id)).length;
            const attendeeActs = evAttendeeSfIds.filter(id => attendeeActsByAccount.get(a.Id)?.has(id)).length;
            const engagementBoost = attendeeDCs * 3 + attendeeActs * 2;
            return { account: a, score: overlap + domainHit + engagementBoost, attendeeDCs, attendeeActs };
          }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);

          // Always include the current weak match if present
          if (e.topAccountId && !scored.find(s => s.account.Id === e.topAccountId)) {
            const existing = accounts.find(a => a.Id === e.topAccountId);
            if (existing) {
              const attendeeDCs  = evAttendeeSfIds.filter(id => seIdToAccountIds.get(id)?.has(existing.Id)).length;
              const attendeeActs = evAttendeeSfIds.filter(id => attendeeActsByAccount.get(existing.Id)?.has(id)).length;
              scored.push({ account: existing, score: 0, attendeeDCs, attendeeActs });
            }
          }

          return scored.map((s, idx) => ({
            i: idx + 1,
            name: s.account.Name,
            _id: s.account.Id,
            attendeeDCs: s.attendeeDCs,
            attendeeActs: s.attendeeActs,
          }));
        }

        // Build reverse map: eventId → (candidateI → accountId)
        const eventCandidateMap = new Map<string, Map<number, string>>();
        unloggedAnnotated.forEach(e => {
          const cands = candidatesForEvent(e);
          const m = new Map<number, string>();
          cands.forEach(c => m.set(c.i, c._id));
          eventCandidateMap.set(e.id, m);
        });

        const combinedSystemPrompt = `You are a Salesforce Sales Engineer (SE) assistant with deep knowledge of:
- Salesforce products: Sales Cloud, Service Cloud, Marketing Cloud, Commerce Cloud, Agentforce, Data Cloud, MuleSoft, Tableau, Slack, Einstein, Heroku, and all sub-brands
- Airports worldwide (IATA codes and city names) and travel terminology
- Major industry conferences, summits, and trade shows
- Common Salesforce internal meeting types (QBRs, V2MOMs, all-hands, skip-levels, etc.)
- Generic business phrases that do NOT indicate a specific customer (e.g., "cloud migration", "digital transformation", "analytics review")

For each calendar event, return THREE things:
1. taskType — the best SE Task Type
2. group — a short human-readable group label for clustering similar events (3 words max)
3. accountI — index of the best matching Salesforce account from the per-event candidates list, or null if none fits

${taskTypeList}

taskType rules (use EXACT picklist values above):
- "Admin" → internal calls, all-hands, leader calls, org syncs, QBRs, skip-levels, 1:1s, town halls, HR, standups, staff meetings
- "Travel" → any flight, drive, train, transit, travel day (e.g. "Flight to ORD", "Drive to SFO", "AA 1234")
- "Customer Presentation" → live demos, product presentations to a customer or prospect
- "Customer Discovery" → discovery calls, intro calls, EBC, business review, exec meeting with customer
- "Solution Creation" → architecture sessions, technical deep-dives, solution design, hands-on labs
- "POC" → proof of concept, POC kickoff, POC review
- "Partner Support" → partner calls, ISV, alliance, reseller, SI
- "Sales Enablement" → training sessions, certifications, workshops, bootcamps, enablement
- "Workshop" → workshops delivered to customers or internal teams
- "BVS - Proposal" → pricing, proposals, commercial review, deal desk, RFP
- "Mentorship" → mentoring or mentorship sessions
- "Wellness" → wellness, personal health, yoga, exercise
- "Personal Development" → personal dev, certifications, self-study, AWS cert, Trailhead
- "Marketing Support" → marketing events, webinars, field marketing
- "V2MOM Initiatives" → V2MOM planning, company planning
- Default ALL ambiguous internal meetings to "Admin"

group rules (short descriptive label, consistent across similar events):
- Use the SAME group string for events of the same category so they cluster
- Examples: "Weekly Team Calls", "Travel", "Enablement Sessions", "Internal Syncs", "Leadership Calls", "Partner Meetings", "Customer Meetings", "All Hands", "Training"
- For a unique one-off event, use the taskType as the group

accountI rules — use your knowledge to determine if this meeting is with a real external company:
- Each event has a candidates list of plausible accounts — accountI is the 1-based index into THAT event's list
- Return null if none of the candidates genuinely matches the event
- Travel events (flights, drives, transit): ALWAYS return null — airports and cities are not accounts
- Internal Salesforce meetings (all-hands, QBRs, team syncs, leader calls): ALWAYS return null
- Salesforce product names used alone (e.g. "Marketing Cloud workshop") are NOT account matches — return null
- Generic phrases like "digital transformation", "analytics review", "cloud migration" are NOT matches — return null
- Match only when the meeting is clearly with a named external company (the company appears in the title, description, or attendee domains)
- Prefer the candidate whose name best aligns with a real company name in the meeting context
- Use attendee engagement signals as STRONG corroborating evidence:
  - attendeeDCs > 0: one or more meeting attendees already have a Deal Contribution logged on this account → strong signal you were working this account together
  - attendeeActs > 0: one or more meeting attendees have SF activities logged for this account in the same period → corroborates the account relationship
  - High attendeeDCs/attendeeActs combined with a plausible name match should tip you toward confirming the match
  - These signals alone are not sufficient — the meeting must still make sense as a customer-facing event

Each event object you receive includes: id, summary, description, attendeeDomains, and candidates (each candidate has attendeeDCs and attendeeActs counts).

Respond ONLY with valid JSON: {"events":[{"id":"string","taskType":"string_or_null","group":"string","accountI":number_or_null}]}`;

        const llmPayload = unloggedAnnotated.map(e => {
          const cands = candidatesForEvent(e);
          return {
            id: e.id,
            summary: e.summary,
            description: e.description.slice(0, 150),
            attendeeDomains: [...new Set(e.attendeeEmails.map((em: string) => em.split('@')[1] ?? '').filter(Boolean))],
            candidates: cands.map(c => ({
              i: c.i,
              name: c.name,
              ...(c.attendeeDCs  > 0 ? { attendeeDCs:  c.attendeeDCs  } : {}),
              ...(c.attendeeActs > 0 ? { attendeeActs: c.attendeeActs } : {}),
            })),
          };
        });

        const batchCount = Math.ceil(llmPayload.length / 30);
        send('debug', { message: `LLM combined pass: ${llmPayload.length} events in ${batchCount} batch${batchCount !== 1 ? 'es' : ''}` });

        const llmResults = await classifyEventsBatched(llmPayload, combinedSystemPrompt, (input, output) => {
          send('llm_io', { pass: 'combined: task type + account', input, output });
        });
        console.log('[LLM combined] total results:', llmResults.length);

        let confirmed = 0, corrected = 0, rejected = 0, newMatch = 0;

        llmResults.forEach((item: any) => {
          if (!item.id) return;

          // Task type
          if (item.taskType) {
            if (seTaskTypes.length === 0 || seTaskTypes.includes(item.taskType)) {
              suggestedTaskTypeMap.set(item.id, item.taskType);
            } else {
              const lower = item.taskType.toLowerCase();
              const closest = seTaskTypes.find(t => t.toLowerCase() === lower)
                ?? seTaskTypes.find(t => t.toLowerCase().includes(lower) || lower.includes(t.toLowerCase()));
              suggestedTaskTypeMap.set(item.id, closest ?? item.taskType);
            }
          }

          // Group
          if (item.group) {
            suggestedGroupMap.set(item.id, item.group);
          }

          // Account match (only for events that don't already have a strong deterministic match)
          const ev = annotatedEvents.find(e => e.id === item.id);
          if (!ev || ev.matchScore >= 60) return; // strong match already set — keep it

          const candMap = eventCandidateMap.get(item.id);
          const llmAccountId = item.accountI != null && candMap ? candMap.get(item.accountI) ?? null : null;
          const prevAccountId = ev.topAccountId;

          if (prevAccountId && llmAccountId === prevAccountId) {
            confirmed++;
          } else if (prevAccountId && llmAccountId === null) {
            (ev as any).topAccountId = null;
            ev.matchScore = 0;
            ev.accountMatches = [];
            rejected++;
            send('debug', { message: `LLM rejected "${ev.summary}" → ${accountMap.get(prevAccountId)?.Name}` });
          } else if (llmAccountId && llmAccountId !== prevAccountId) {
            const accName = accountMap.get(llmAccountId)?.Name ?? '';
            ev.topAccountId = llmAccountId;
            ev.matchScore = prevAccountId ? 40 : 35;
            ev.accountMatches = [{ accountId: llmAccountId, accountName: accName, score: ev.matchScore, signals: [prevAccountId ? 'AI corrected' : 'AI matched'] }];
            if (prevAccountId) { corrected++; send('debug', { message: `LLM corrected "${ev.summary}" → ${accName}` }); }
            else { newMatch++; send('debug', { message: `LLM matched "${ev.summary}" → ${accName}` }); }
          }
        });

        // Normalize groups across batches: events with the same summary get the most-common group
        const groupsByTitle = new Map<string, string[]>();
        suggestedGroupMap.forEach((group, id) => {
          const ev = annotatedEvents.find(e => e.id === id);
          if (!ev) return;
          const title = ev.summary.trim().toLowerCase();
          if (!groupsByTitle.has(title)) groupsByTitle.set(title, []);
          groupsByTitle.get(title)!.push(group);
        });
        const canonicalGroupByTitle = new Map<string, string>();
        groupsByTitle.forEach((groups, title) => {
          const freq = new Map<string, number>();
          groups.forEach(g => freq.set(g, (freq.get(g) ?? 0) + 1));
          const best = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
          canonicalGroupByTitle.set(title, best);
        });
        suggestedGroupMap.forEach((_, id) => {
          const ev = annotatedEvents.find(e => e.id === id);
          if (!ev) return;
          const canon = canonicalGroupByTitle.get(ev.summary.trim().toLowerCase());
          if (canon) suggestedGroupMap.set(id, canon);
        });

        const groupCounts = [...new Set(suggestedGroupMap.values())].length;
        send('progress', { step: 'llm', message: `AI: ${suggestedTaskTypeMap.size} task types, ${groupCounts} groups, ${confirmed} confirmed + ${newMatch} new + ${corrected} corrected + ${rejected} rejected account matches` });
        send('debug', { message: `Groups: ${[...new Set(suggestedGroupMap.values())].join(', ')}` });
      } catch (err: any) {
        send('debug', { message: `LLM error: ${err.message} ${JSON.stringify(err)}` });
      }
    }

    // ── 8. Group by account ────────────────────────────────────────────────────
    send('progress', { step: 'grouping', message: 'Building account groups…' });

    // Build opp lookup by account
    const oppsByAccount = new Map<string, any[]>();
    scopedOpps.forEach(o => {
      if (!oppsByAccount.has(o.AccountId)) oppsByAccount.set(o.AccountId, []);
      oppsByAccount.get(o.AccountId)!.push(o);
    });

    // Tally cal event stats per account (from both already-logged and unlogged)
    const calStatsByAccount = new Map<string, { totalEvents: number; totalMins: number; unloggedEvents: any[]; loggedEvents: any[] }>();

    annotatedEvents.forEach(e => {
      const accountId = e.topAccountId;
      if (!accountId) return;
      if (!calStatsByAccount.has(accountId)) calStatsByAccount.set(accountId, { totalEvents: 0, totalMins: 0, unloggedEvents: [], loggedEvents: [] });
      const s = calStatsByAccount.get(accountId)!;
      s.totalEvents++;
      s.totalMins += e.durationMins;
      if (e.alreadyLogged) s.loggedEvents.push(e);
      else s.unloggedEvents.push(e);
    });

    // Build the account groups
    interface AccountGroup {
      accountId: string;
      accountName: string;
      accountOwnerId: string;
      accountOwnerName: string;
      parentAccountId: string | null;
      parentAccountName: string | null;
      mostEngagedAccountId: string | null;
      mostEngagedAccountName: string | null;
      totalCalEvents: number;
      totalCalMins: number;
      loggedCalCount: number;
      groupScore: number;
      unloggedEvents: any[];
      loggedEvents: any[];
      rankedOpps: any[];
      dcGaps: any[];
      matchSignals: string[];
    }

    const accountGroups: AccountGroup[] = [];
    const processedAccounts = new Set<string>();

    // Accounts with cal events first, then any remaining accounts with DC gaps
    const allRelevantAccountIds = new Set<string>([
      ...[...calStatsByAccount.keys()],
      // accounts where we have DC gaps (team attendee has DC)
      ...[...teamDCOppIds].map(oppId => scopedOpps.find(o => o.Id === oppId)?.AccountId).filter(Boolean),
    ]);

    for (const accountId of allRelevantAccountIds) {
      if (processedAccounts.has(accountId)) continue;
      processedAccounts.add(accountId);

      const acc = accountMap.get(accountId);
      if (!acc) continue;

      const calStats = calStatsByAccount.get(accountId) ?? { totalEvents: 0, totalMins: 0, unloggedEvents: [], loggedEvents: [] };

      // Include opps from this account + parent + siblings so that e.g. "Illuminate Agentforce"
      // on the parent account still appears in the OppPicker for a child-account event.
      const parentId = parentAccountMap.get(accountId)?.id ?? null;
      const relatedAccountIds = new Set<string>([accountId]);
      if (parentId) relatedAccountIds.add(parentId);
      parentAccountMap.forEach((p, aid) => { if (p.id === parentId && parentId) relatedAccountIds.add(aid); });
      // Also include opps the user has a DC on, even if Omitted (always show user's own DCs)
      const oppsForAccount = [
        ...new Map(
          [...relatedAccountIds].flatMap(aid => oppsByAccount.get(aid) ?? [])
            // Always include opps where user has a DC, regardless of forecast category
            .concat(scopedOpps.filter(o => myDCOppIds.has(o.Id) && relatedAccountIds.has(o.AccountId)))
            .map(o => [o.Id, o])
        ).values()
      ];
      const ranked = rankOpps(oppsForAccount, myDCOppIds, teamDCOppIds, oppIdsWithMyActivity);

      // DC gaps: opps where I have no DC but any team member does, or I have opp-specific logged activity
      const dcGaps = ranked
        .filter(o => !myDCOppIds.has(o.Id))
        .filter(o => teamDCOppIds.has(o.Id) || oppIdsWithMyActivity.has(o.Id))
        .map(o => {
          // Split % and priority are based on opp-specific logged activities only (not account-level cal events)
          const totalActs = loggedCountByOpp.get(o.Id) ?? 0;
          const totalMins = loggedDurationByOpp.get(o.Id) ?? 0;
          const { priority, splitPct } = dcPriority(o, totalActs, totalMins);
          const teamDCs = teamDCsByOpp.get(o.Id) ?? [];
          const attendeeTeamDCs = teamDCs.filter(d => attendeeSfIds.has(d.seId));

          // Build human-readable DC gap reasons
          const dcReasons: string[] = [];
          if (attendeeTeamDCs.length > 0) {
            dcReasons.push(`${attendeeTeamDCs.map(d => d.seName).join(', ')} (meeting attendee) has a DC`);
          } else if (teamDCs.length > 0) {
            dcReasons.push(`${teamDCs.slice(0, 2).map(d => d.seName).join(', ')} has a DC on this opp`);
          }
          if (oppIdsWithMyActivity.has(o.Id)) dcReasons.push(`you have ${loggedCountByOpp.get(o.Id) ?? 0} logged SF activit${(loggedCountByOpp.get(o.Id) ?? 0) !== 1 ? 'ies' : 'y'} against this opp`);
          if (o.ForecastCategoryName === 'Commit') dcReasons.push('deal is in Commit');
          else if (o.ForecastCategoryName === 'Best Case') dcReasons.push('deal is in Best Case');
          const daysToClose = o.CloseDate ? Math.round((new Date(o.CloseDate).getTime() - Date.now()) / 86400000) : null;
          if (daysToClose !== null && daysToClose >= 0 && daysToClose <= 30) dcReasons.push(`closes in ${daysToClose} days`);

          const totalHours = Math.round(totalMins / 60 * 10) / 10;
          const splitReasonParts: string[] = [];
          if (totalActs >= 7 || totalHours >= 24) splitReasonParts.push(`${totalActs} opp activit${totalActs !== 1 ? 'ies' : 'y'} / ${totalHours}h → 100%`);
          else if (totalActs <= 4 && totalHours < 4) splitReasonParts.push(`${totalActs} opp activit${totalActs !== 1 ? 'ies' : 'y'} / ${totalHours}h → 25%`);
          else splitReasonParts.push(`${totalActs} opp activit${totalActs !== 1 ? 'ies' : 'y'} / ${totalHours}h → 50%`);

          return {
            oppId: o.Id,
            oppName: o.Name,
            accountId,
            accountName: acc.Name,
            parentAccountName: parentAccountMap.get(accountId)?.name ?? null,
            stage: o.StageName,
            forecastCategory: o.ForecastCategoryName,
            closeDate: o.CloseDate,
            amount: o.Amount,
            aeOwner: o['Owner']?.Name ?? '',
            aeOwnerRole: o['Owner']?.UserRole?.Name ?? '',
            priority,
            suggestedSplitPct: splitPct,
            suggestedRole: 'Distinguished SE',
            teamDCAttendees: attendeeTeamDCs.map(d => d.seName),
            totalActivities: totalActs,
            totalHours,
            dcReasons,
            splitReason: splitReasonParts[0] ?? '',
            isHistoricallyEngaged: expandedEngagedAccountIds.has(accountId),
          };
        });

      // Match signals: collect per-event signals and dedupe
      const allEventSignals = annotatedEvents
        .filter(e => e.topAccountId === accountId)
        .map(e => ({ summary: e.summary, signals: e.accountMatches[0]?.signals ?? [], score: e.matchScore }));
      const uniqueSignals = [...new Set(allEventSignals.flatMap(e => e.signals))];

      // Group-level score for sorting: unlogged events + hours + DC gaps + match quality
      // + attendee engagement (DCs + activities on this account in the period)
      // + top opp forecast priority (Commit > Best Case > Pipeline)
      const FC_SCORE: Record<string, number> = { Commit: 30, 'Best Case': 20, Pipeline: 10 };
      const topOppFcScore = oppsForAccount.length > 0
        ? Math.max(...oppsForAccount.map(o => FC_SCORE[o.ForecastCategoryName] ?? 0))
        : 0;
      const attendeeDCsForAccount = [...attendeeSfIds].filter(id => seIdToAccountIds.get(id)?.has(accountId)).length;
      const attendeeActsForAccount = attendeeActsByAccount.get(accountId)?.size ?? 0;
      const groupScore =
        calStats.unloggedEvents.length * 20 +
        Math.min(calStats.totalMins / 60, 10) * 3 +
        dcGaps.length * 15 +
        (allEventSignals[0]?.score ?? 0) +
        topOppFcScore +
        attendeeDCsForAccount * 12 +
        attendeeActsForAccount * 8;

      const accountOwnerName = scopedOpps.find(o => o.AccountId === accountId)?.['Account']?.Owner?.Name ?? '';

      if (calStats.totalEvents > 0 || dcGaps.length > 0) {
        const parentAcc = parentAccountMap.get(accountId);

        // Find the most-engaged account in the same parent family (excluding self)
        // "Same family" = shares the same ultimate parent, or any account whose parent matches this one
        const parentId = parentAcc?.id ?? null;
        let mostEngagedAccountId: string | null = null;
        let mostEngagedAccountName: string | null = null;
        let topEngScore = -1;
        accountEngagement.forEach((eng, accId) => {
          if (accId === accountId) return; // skip self
          // Only include if related: shares same parent, or is a sibling (same grandparent)
          const accParent = parentAccountMap.get(accId);
          const related = parentId
            ? (accParent?.id === parentId || accId === parentId || accParent?.id === accountId)
            : (accParent?.id === accountId); // this account IS the parent of the candidate
          if (!related) return;
          if (eng.score > topEngScore) {
            topEngScore = eng.score;
            mostEngagedAccountId = accId;
            mostEngagedAccountName = accountMap.get(accId)?.Name ?? null;
          }
        });
        // Only surface if score > 0 (there's actual engagement to show)
        if (topEngScore <= 0) { mostEngagedAccountId = null; mostEngagedAccountName = null; }

        accountGroups.push({
          accountId,
          accountName: acc.Name,
          accountOwnerId: acc.OwnerId,
          accountOwnerName,
          parentAccountId: parentAcc?.id ?? null,
          parentAccountName: parentAcc?.name ?? null,
          mostEngagedAccountId,
          mostEngagedAccountName,
          totalCalEvents: calStats.totalEvents,
          totalCalMins: calStats.totalMins,
          loggedCalCount: calStats.loggedEvents.length,
          groupScore,
          unloggedEvents: calStats.unloggedEvents.map(e => ({
            id: e.id,
            summary: e.summary,
            date: e.date,
            startDateTime: e.startDateTime,
            endDateTime: e.endDateTime,
            durationMins: e.durationMins,
            attendeeNames: e.attendeeNames,
            matchScore: e.matchScore,
            matchSignals: e.accountMatches[0]?.signals ?? [],
            suggestedTaskType: suggestedTaskTypeMap.get(e.id) ?? '',
          })),
          loggedEvents: calStats.loggedEvents.map(e => ({
            id: e.id,
            summary: e.summary,
            date: e.date,
            startDateTime: e.startDateTime,
            durationMins: e.durationMins,
          })),
          rankedOpps: ranked.map(o => ({
            oppId: o.Id,
            oppName: o.Name,
            stage: o.StageName,
            forecastCategory: o.ForecastCategoryName,
            closeDate: o.CloseDate,
            amount: o.Amount,
            aeOwner: o['Owner']?.Name ?? '',
            aeOwnerRole: o['Owner']?.UserRole?.Name ?? '',
            lastModified: (o.LastModifiedDate ?? '').slice(0, 10),
            hasMyDC: myDCOppIds.has(o.Id),
            hasTeamDC: teamDCOppIds.has(o.Id),
            hasMyActivity: oppIdsWithMyActivity.has(o.Id),
            teamDCMembers: (teamDCsByOpp.get(o.Id) ?? []).map(d => d.seName),
            rankReasons: o._rankReasons ?? [],
            rankScore: o._score ?? 0,
          })),
          dcGaps,
          matchSignals: uniqueSignals,
        });
      }
    }

    // Sort by group score descending
    accountGroups.sort((a, b) => (b as any).groupScore - (a as any).groupScore);

    // Events with no account match (truly ambiguous)
    const unmatchedEvents = annotatedEvents.filter(e => !e.alreadyLogged && !e.topAccountId).map(e => ({
      id: e.id, summary: e.summary, date: e.date,
      startDateTime: e.startDateTime, durationMins: e.durationMins,
      attendeeNames: e.attendeeNames,
      suggestedTaskType: suggestedTaskTypeMap.get(e.id) ?? '',
      suggestedGroup: suggestedGroupMap.get(e.id) ?? 'Other',
    }));

    // Deduplicate DC gaps globally — each opp should appear in exactly one group
    // (the highest-scoring one). This prevents duplicates when hierarchy expansion
    // causes the same opp to land in both parent and child account groups.
    const claimedOppIds = new Set<string>();
    const sortedByScore = [...accountGroups].sort((a, b) => b.groupScore - a.groupScore);
    sortedByScore.forEach(g => {
      g.dcGaps = g.dcGaps.filter(d => {
        if (claimedOppIds.has(d.oppId)) return false;
        claimedOppIds.add(d.oppId);
        return true;
      });
    });

    send('progress', { step: 'grouping', message: `${accountGroups.length} account group${accountGroups.length !== 1 ? 's' : ''} built` });

    send('result', {
      accountGroups,
      unmatchedEvents,
      meta: {
        totalCalEvents: calEvents.length,
        alreadyLoggedCount: annotatedEvents.filter(e => e.alreadyLogged).length,
        unloggedCount: annotatedEvents.filter(e => !e.alreadyLogged).length,
        matchedCount: annotatedEvents.filter(e => !e.alreadyLogged && e.topAccountId).length,
        unmatchedCount: unmatchedEvents.length,
        dcGapCount: accountGroups.reduce((s, g) => s + g.dcGaps.length, 0),
      },
    });
    res.end();
  } catch (err: any) {
    console.error('Assistant briefing error:', err);
    send('error', { error: err.message });
    res.end();
  }
});

// ── Execute ────────────────────────────────────────────────────────────────────

router.post('/execute', async (req, res) => {
  try {
    const conn = getConnection();
    const { currentUserId, activities, dcs } = req.body as {
      currentUserId: string;
      activities?: {
        summary: string; startDateTime: string; endDateTime: string;
        durationMins?: number | null; whatId?: string | null; seTaskType?: string | null;
        recordTypeId?: string | null;
      }[];
      dcs?: { oppId: string; role: string; splitPct: number }[];
    };

    if (!currentUserId) return res.status(400).json({ error: 'currentUserId required' });

    const results: { type: string; name: string; action: string }[] = [];

    for (const act of activities ?? []) {
      try {
        const startDT = act.startDateTime;
        const endDT = act.durationMins && act.durationMins > 0
          ? new Date(new Date(startDT).getTime() + act.durationMins * 60000).toISOString()
          : act.endDateTime;
        await conn.sobject('Event').create({
          Subject: act.summary, StartDateTime: startDT, EndDateTime: endDT,
          OwnerId: currentUserId, WhatId: act.whatId || undefined,
          ...(act.seTaskType   ? { SE_Task_Type__c: act.seTaskType }     : {}),
          ...(act.recordTypeId ? { RecordTypeId:    act.recordTypeId }   : {}),
        });
        results.push({ type: 'activity', name: act.summary, action: 'created' });
      } catch (e: any) {
        results.push({ type: 'activity', name: act.summary, action: 'error: ' + e.message });
      }
    }

    for (const dc of dcs ?? []) {
      try {
        const existing = await conn.query(
          `SELECT Id FROM Deal_Contribution__c WHERE SE_Name__c = '${currentUserId}' AND Opportunity__c = '${dc.oppId}' LIMIT 1`
        );
        const fields: any = { Opportunity_Role__c: dc.role, Split_Percentage__c: dc.splitPct, Comments__c: '#orbi' };
        if ((existing.records as any[]).length > 0) {
          await conn.sobject('Deal_Contribution__c').update({ Id: (existing.records[0] as any).Id, ...fields });
          results.push({ type: 'dc', name: dc.oppId, action: 'updated' });
        } else {
          await conn.sobject('Deal_Contribution__c').create({ SE_Name__c: currentUserId, Opportunity__c: dc.oppId, ...fields });
          results.push({ type: 'dc', name: dc.oppId, action: 'created' });
        }
      } catch (e: any) {
        results.push({ type: 'dc', name: dc.oppId, action: 'error: ' + e.message });
      }
    }

    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── /chat — conversational activity/DC creation ────────────────────────────
router.post('/chat', async (req, res) => {
  try {
    const conn = getConnection();
    const { currentUserId, messages, briefingContext } = req.body as {
      currentUserId: string;
      messages: { role: 'user' | 'assistant'; content: string }[];
      briefingContext?: {
        accounts: { accountId: string; accountName: string; opps: { oppId: string; oppName: string; stage: string; amount: number }[] }[];
      };
    };
    if (!currentUserId) return res.status(400).json({ error: 'currentUserId required' });

    // Fetch user's default record type + task types
    const [rtRes, metaRes] = await Promise.all([
      conn.query(`SELECT Id FROM RecordType WHERE SobjectType = 'Event' AND IsActive = true AND Name = 'Solutions Event' LIMIT 1`).catch(() => ({ records: [] })),
      conn.query(`SELECT SE_Task_Type__c FROM Event WHERE OwnerId = '${currentUserId}' AND SE_Task_Type__c != null GROUP BY SE_Task_Type__c LIMIT 10`).catch(() => ({ records: [] })),
    ]);
    const defaultRTId = (rtRes.records[0] as any)?.Id ?? null;
    const taskTypes = [...new Set((metaRes.records as any[]).map(r => r.SE_Task_Type__c).filter(Boolean))];

    // Extract any account/opp names mentioned in the latest user message that aren't in scope,
    // then do a live SF lookup to resolve them
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content ?? '';
    const scopedAccountNames = new Set((briefingContext?.accounts ?? []).map(a => a.accountName.toLowerCase()));

    // Simple heuristic: pull quoted strings or capitalized multi-word phrases likely to be account names
    const candidateNames = (lastUserMsg.match(/["']([^"']+)["']|([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/g) ?? [])
      .map(s => s.replace(/["']/g, '').trim())
      .filter(s => s.length > 2 && !scopedAccountNames.has(s.toLowerCase()));

    let extraContext = '';
    if (candidateNames.length > 0) {
      // Search SF for accounts + opps matching candidate names not in scope
      const nameFilter = candidateNames.slice(0, 5).map(n => `Name LIKE '%${n.replace(/'/g, "\\'")}%'`).join(' OR ');
      const [accRes, oppRes] = await Promise.all([
        conn.query(`SELECT Id, Name FROM Account WHERE ${nameFilter} AND IsDeleted = false ORDER BY LastModifiedDate DESC LIMIT 10`).catch(() => ({ records: [] })),
        conn.query(`SELECT Id, Name, AccountId, Account.Name, StageName, Amount FROM Opportunity WHERE (${nameFilter}) AND IsClosed = false ORDER BY CloseDate ASC LIMIT 10`).catch(() => ({ records: [] })),
      ]);
      const accLines = (accRes.records as any[]).map(a => `- Account: ${a.Name} (id:${a.Id})`);
      const oppLines = (oppRes.records as any[]).map(o => `- Opp: ${o.Name} [${o.StageName}, $${Math.round((o.Amount ?? 0) / 1000)}k, id:${o.Id}] on ${(o as any).Account?.Name ?? 'unknown account'} (accountId:${o.AccountId})`);
      if (accLines.length || oppLines.length) {
        extraContext = `\nLive SF lookup results:\n${[...accLines, ...oppLines].join('\n')}`;
      }
    }

    const accountSummary = (briefingContext?.accounts ?? []).slice(0, 30).map(a =>
      `- ${a.accountName} (id:${a.accountId}): ${a.opps.slice(0, 4).map(o => `${o.oppName} [$${Math.round((o.amount ?? 0) / 1000)}k, id:${o.oppId}]`).join('; ')}`
    ).join('\n');

    const today = new Date().toISOString().slice(0, 10);

    const systemPrompt = `You are Orbi, a terse Salesforce assistant for Sales Engineers. Today: ${today}. User SF ID: ${currentUserId}.
${defaultRTId ? `Event RecordTypeId: ${defaultRTId}` : ''}
${taskTypes.length ? `SE task types: ${taskTypes.join(', ')}` : ''}

Scoped accounts/opps:
${accountSummary || '(none)'}
${extraContext}

Rules:
- Be VERY concise. 1-2 sentences max for conversational replies. No pleasantries.
- Use exact IDs from scope or live lookup above. Never invent IDs.
- If you still can't find an account/opp, say so in one sentence.
- Spread activities across working days (Mon–Fri, 9am–5pm).
- When ready to act, output ONLY a \`\`\`json block (no other text) in this format:
\`\`\`json
{
  "type": "preview",
  "summary": "one-line summary",
  "activities": [{ "summary": "...", "startDateTime": "YYYY-MM-DDTHH:mm:ss", "durationMins": 120, "whatId": "oppId or null", "seTaskType": "...", "recordTypeId": "${defaultRTId ?? null}" }],
  "dcs": [{ "oppId": "...", "role": "Distinguished SE", "splitPct": 50 }]
}
\`\`\`
- If you need clarification first, ask in ONE short question only.`;

    const completion = await llmGateway.chat.completions.create({
      model: 'claude-sonnet-4-20250514',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      max_tokens: 4096,
    } as any);

    const raw = completion.choices[0]?.message?.content ?? '';

    const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/i);
    if (jsonMatch) {
      try {
        const plan = JSON.parse(jsonMatch[1].trim());
        const prose = raw.replace(/```json[\s\S]*?```/i, '').trim();
        return res.json({ type: 'plan', plan, prose });
      } catch {
        // fall through to text
      }
    }

    res.json({ type: 'text', content: raw });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── /chat/execute — execute a confirmed plan ────────────────────────────────
router.post('/chat/execute', async (req, res) => {
  try {
    const conn = getConnection();
    const { currentUserId, plan } = req.body as {
      currentUserId: string;
      plan: {
        activities?: { summary: string; startDateTime: string; durationMins?: number; whatId?: string | null; seTaskType?: string | null; recordTypeId?: string | null }[];
        dcs?: { oppId: string; role: string; splitPct: number }[];
      };
    };
    if (!currentUserId) return res.status(400).json({ error: 'currentUserId required' });

    const results: { type: string; name: string; action: string }[] = [];

    for (const act of plan.activities ?? []) {
      try {
        const endDT = new Date(new Date(act.startDateTime).getTime() + (act.durationMins ?? 60) * 60000).toISOString();
        await conn.sobject('Event').create({
          Subject: act.summary,
          StartDateTime: act.startDateTime,
          EndDateTime: endDT,
          OwnerId: currentUserId,
          ...(act.whatId      ? { WhatId: act.whatId }                : {}),
          ...(act.seTaskType  ? { SE_Task_Type__c: act.seTaskType }   : {}),
          ...(act.recordTypeId ? { RecordTypeId: act.recordTypeId }   : {}),
        });
        results.push({ type: 'activity', name: act.summary, action: 'created' });
      } catch (e: any) {
        results.push({ type: 'activity', name: act.summary, action: 'error: ' + e.message });
      }
    }

    for (const dc of plan.dcs ?? []) {
      try {
        const existing = await conn.query(
          `SELECT Id FROM Deal_Contribution__c WHERE SE_Name__c = '${currentUserId}' AND Opportunity__c = '${dc.oppId}' LIMIT 1`
        );
        const fields: any = { Opportunity_Role__c: dc.role, Split_Percentage__c: dc.splitPct, Comments__c: '#orbi-chat' };
        if ((existing.records as any[]).length > 0) {
          await conn.sobject('Deal_Contribution__c').update({ Id: (existing.records[0] as any).Id, ...fields });
          results.push({ type: 'dc', name: dc.oppId, action: 'updated' });
        } else {
          await conn.sobject('Deal_Contribution__c').create({ SE_Name__c: currentUserId, Opportunity__c: dc.oppId, ...fields });
          results.push({ type: 'dc', name: dc.oppId, action: 'created' });
        }
      } catch (e: any) {
        results.push({ type: 'dc', name: dc.oppId, action: 'error: ' + e.message });
      }
    }

    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
