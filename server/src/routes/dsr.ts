import { Router } from 'express';
import { getConnection } from '../sf';
import { spawn } from 'child_process';

const CLAUDE_PATH = '/Users/dshannon/.local/bin/claude';
const CLAUDE_ENV = { ...process.env, PATH: `${process.env.PATH}:/Users/dshannon/.local/bin` };
const DSR_CANVAS_URL = 'https://salesforce.enterprise.slack.com/docs/T01G0063H29/F0B663CUWA1';
const SLACKBOT_CHANNEL_ID = 'D01G88L8S1Y';

const router = Router();

const FIELDS = `Id, Name, Status__c, Status_Detail__c, Account__c, Oppty_Account__c,
  Opportunity__c, Opportunity__r.Name, Oppty_Amount__c, Status_Comments__c,
  Next_Steps__c, Oppty_Close_Date__c`;

router.get('/', async (req, res) => {
  try {
    const conn = getConnection();
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { status, dateFrom, dateTo, account, amountMin, amountMax } = req.query as Record<string, string>;

    const clauses: string[] = [`OwnerId = '${userId}'`];

    // Status filter — default excludes Closed/Cancelled; if provided, use as-is (supports ! prefix for NOT IN)
    if (status) {
      const negate = status.startsWith('!');
      const vals = (negate ? status.slice(1) : status).split(',').map(s => `'${s.trim().replace(/'/g, "\\'")}'`).join(',');
      clauses.push(`Status__c ${negate ? 'NOT IN' : 'IN'} (${vals})`);
    } else {
      clauses.push(`Status__c NOT IN ('Closed','Cancelled')`);
    }

    if (dateFrom) clauses.push(`Oppty_Close_Date__c >= ${dateFrom}`);
    if (dateTo)   clauses.push(`Oppty_Close_Date__c <= ${dateTo}`);
    if (account)  clauses.push(`Oppty_Account__c LIKE '%${account.replace(/'/g, "\\'")}%'`);
    if (amountMin) clauses.push(`Oppty_Amount__c >= ${parseFloat(amountMin)}`);
    if (amountMax) clauses.push(`Oppty_Amount__c <= ${parseFloat(amountMax)}`);

    const result = await conn.query(
      `SELECT ${FIELDS} FROM Deal_Support_Request__c
       WHERE ${clauses.join(' AND ')}
       ORDER BY Oppty_Close_Date__c ASC NULLS LAST`
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const conn = getConnection();
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { statusComments, nextSteps } = req.body as { statusComments?: string; nextSteps?: string };
    const payload: { Id: string; Status_Comments__c?: string; Next_Steps__c?: string } = { Id: req.params.id };
    if (statusComments !== undefined) payload.Status_Comments__c = statusComments;
    if (nextSteps !== undefined) payload.Next_Steps__c = nextSteps;

    const result = await conn.sobject('Deal_Support_Request__c').update(payload as any);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dsr/run-review — SSE: pre-fetch SF data, inject as context, run skill via Claude subprocess
router.post('/run-review', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const emit = (type: string, data: Record<string, any> = {}) =>
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  const userId = req.session?.userId;
  const userName = req.session?.userName;
  const userEmail = req.session?.userEmail;

  if (!userId) { emit('error', { message: 'Not authenticated' }); emit('done'); res.end(); return; }

  // ── Pre-fetch SF data so Claude skips straight to research + drafting ──
  let dsrContext = '';
  try {
    emit('delta', { text: '⏳ Fetching your active DSRs from Salesforce…\n\n' });
    const conn = getConnection();
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const dsrResult = await conn.query(
      `SELECT Id, Name, Status__c, Status_Detail__c, Oppty_Account__c, Opportunity__c,
              Opportunity__r.Name, Oppty_Amount__c, Status_Comments__c, Next_Steps__c,
              Oppty_Close_Date__c
       FROM Deal_Support_Request__c
       WHERE OwnerId = '${userId}' AND Status__c NOT IN ('Closed','Cancelled')
       ORDER BY Oppty_Close_Date__c ASC NULLS LAST`
    );

    const dsrs = dsrResult.records as any[];
    if (dsrs.length === 0) {
      emit('delta', { text: 'No active DSRs found.\n' });
      emit('done'); res.end(); return;
    }

    // For each DSR, fetch recent activity on linked opp/account
    const activityByDsr: Record<string, any[]> = {};
    await Promise.all(dsrs.map(async (dsr: any) => {
      const oppId = dsr.Opportunity__c;
      if (!oppId) return;
      try {
        const acts = await conn.query(
          `SELECT Subject, ActivityDate, StartDateTime, Description, Type
           FROM ActivityHistory
           WHERE WhatId = '${oppId}' AND ActivityDate >= ${thirtyDaysAgo}
           ORDER BY ActivityDate DESC LIMIT 10`
        );
        activityByDsr[dsr.Id] = acts.records as any[];
      } catch { activityByDsr[dsr.Id] = []; }
    }));

    // Build context block
    const fmt$ = (n: number | null) => n ? (n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : `$${(n/1000).toFixed(0)}K`) : '—';
    dsrContext = dsrs.map((dsr: any) => {
      const acts = activityByDsr[dsr.Id] ?? [];
      const actLines = acts.length
        ? acts.map((a: any) => `  - ${a.ActivityDate ?? a.StartDateTime?.slice(0,10) ?? '?'}: ${a.Subject}${a.Description ? ` — ${a.Description.slice(0, 150)}` : ''}`).join('\n')
        : '  (no activity in last 30 days)';
      return [
        `### ${dsr.Name} — ${dsr.Oppty_Account__c ?? '—'} (${dsr.Opportunity__r?.Name ?? '—'}) — ${fmt$(dsr.Oppty_Amount__c)}`,
        `- **SF Record ID:** ${dsr.Id}`,
        `- **Status:** ${dsr.Status__c}${dsr.Status_Detail__c ? ` / ${dsr.Status_Detail__c}` : ''}`,
        `- **Close Date:** ${dsr.Oppty_Close_Date__c ?? '—'}`,
        `- **Current Status Comments:** ${dsr.Status_Comments__c ?? '(empty)'}`,
        `- **Current Next Steps:** ${dsr.Next_Steps__c ?? '(empty)'}`,
        `- **Recent Activity (last 30 days):**`,
        actLines,
      ].join('\n');
    }).join('\n\n');

    emit('delta', { text: `✅ Found ${dsrs.length} active DSR${dsrs.length !== 1 ? 's' : ''}. Starting research…\n\n---\n\n` });
  } catch (err: any) {
    emit('error', { message: `SF fetch failed: ${err.message}` });
    emit('done'); res.end(); return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const prompt = `You are executing the Bi-Weekly DSR Status Update skill for Dan Shannon (${userEmail ?? 'dshannon@salesforce.com'}), a Distinguished SE at Salesforce. His Slack handle is Dan Shannon and his status comment initials tag is #DWS.

## Pre-loaded Salesforce Data (Phases 1 & 2 already complete)

The following DSR data has been fetched live from Salesforce org62. Do NOT re-query SF — use this data directly and skip straight to Phase 3.

${dsrContext}

---

## Your Task — Phases 3, 4, and 5

### Phase 3: Deep Research Each DSR Across Slack, Drive, and Calendar

For EACH DSR, run these searches — be thorough, use multiple search terms per account:

**Slack searches (use slack_search_public_and_private for each):**
- Search the account name (e.g. "Emerson Electric", "Sysco", "Komatsu") — look for dedicated account channels like #emerson, #sysco-agentforce, #komatsu, etc.
- Search the opportunity name or DSR ID
- Search for Dan Shannon's name combined with the account (e.g. "Dan Shannon Emerson", "dshannon Sysco")
- Search for recent meeting notes, demo prep, discovery readouts, competitive intel, blockers, AE/SE alignment discussions
- Look for messages from or to Dan Shannon about this account in the last 14 days
- Try product names mentioned in the opp (Agentforce, MFG Cloud, Service Cloud, etc.) combined with the account name
- Read any relevant threads you find — don't just skim the summary

**Google Drive searches:**
- Search for prep decks, workshop docs, proposals, demo scripts, discovery readouts related to the account or opp
- Try at least 2 search angles per account (account name + "demo", account name + "discovery", opp name)

**Calendar:**
- Check for upcoming meetings with the account in the next 14 days

**What to extract from each source:**
- Specific names of stakeholders, AEs, attendees (first and last name)
- Exact meeting dates and types (demo, discovery, ELT, readout, etc.)
- Specific products in scope
- Competitive threats or blockers mentioned
- Decisions made or pending
- Upcoming deadlines or close dates at risk
- Any action items or commitments made

If a source returns no results after 2-3 varied search attempts, say so explicitly — list what you searched.

### Phase 4: Draft Status Comments and SE Next Steps

For each DSR, synthesize ALL findings into:

**Status Comments format:** ${today} #DWS - [2-4 sentences. Lead with the most recent concrete activity (meeting, demo, decision). Include specific names, dates, products, and deal context. Note any blockers, competitive threats, or critical context. Match the tone and specificity of the existing Status Comments shown above.]

**SE Next Steps format:** 3 specific, named action items. Each must start with an action verb and include a person's name, a date, or a specific deliverable where known. No vague items like "follow up with team."

Rules:
- Every claim must trace to a Slack message, SF activity, or Drive doc found this session
- Use exact names, dates, and meeting types from your research
- If evidence is thin after thorough searching, say so — list what you searched and flag it for manual update
- Never invent names, dates, or deal details

### Phase 5: Present for Review

Use this EXACT format for each DSR — match it precisely so the results can be parsed and loaded into the review cards:

---
## [DSR ID] — [Account Name]

**Linked Opportunity:** [Opp Name] — $[Amount] — Stage [X] — Closes [date]

### Status_Comments__c (prepend this entry)

> ${today} #DWS - [2-4 sentence narrative: what recently happened, where the deal stands, key stakeholders, competitors, blockers, or critical context. Cite specific names, dates, and meeting types from Slack/SF evidence.]

### SE_Next_Steps__c (replace with)

> * [Action item 1 — include name/date/deliverable]
> * [Action item 2 — include name/date/deliverable]
> * [Action item 3 — include name/date/deliverable]

*Sources: [Slack #channel, SF activity date, Google Doc name, etc.]*

---

Repeat for every DSR. End with a total count. Do not write to Salesforce — present drafts only.

Start immediately with Phase 3 research. No preamble.`;

  const proc = spawn(CLAUDE_PATH, [
    '--print',
    '--dangerously-skip-permissions',
    '--output-format', 'stream-json',
    '--verbose',
  ], {
    env: CLAUDE_ENV,
    cwd: `${process.env.HOME}/.aisuite/notebook`, // same workspace Slackbot uses — same MCP context + skills
  });

  let killed = false;
  let stdoutBuf = '';

  req.on('close', () => {
    if (!killed) { killed = true; proc.kill('SIGTERM'); }
  });

  proc.stderr.on('data', () => { /* suppress */ });

  proc.stdout.on('data', (chunk: Buffer) => {
    stdoutBuf += chunk.toString();
    const lines = stdoutBuf.split('\n');
    stdoutBuf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        if (obj.type === 'assistant') {
          const content = obj.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                res.write(`data: ${JSON.stringify({ type: 'delta', text: block.text })}\n\n`);
              }
            }
          }
        }
      } catch { /* non-JSON line */ }
    }
  });

  proc.on('close', (code) => {
    if (killed) return;
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  });

  proc.on('error', (err) => {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  });

  proc.stdin.write(prompt);
  proc.stdin.end();
});

export default router;
