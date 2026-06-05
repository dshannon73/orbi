import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';

const router = Router();

const CLAUDE_PATH = '/Users/dshannon/.local/bin/claude';
const CLAUDE_ENV = { ...process.env, PATH: `${process.env.PATH}:/Users/dshannon/.local/bin` };

function buildPrompt(
  messages: { role: string; content: string }[],
  userId?: string,
  userName?: string,
  userEmail?: string,
): string {
  const last = messages[messages.length - 1];
  const prior = messages.slice(0, -1);

  const systemContext = `<system_context>
You are the Orbi terminal assistant — a full Claude Code session scoped to the Orbi SE command center app.

You have full Claude Code capabilities (bash, file editing, web search, Slack MCP, etc).
You are also connected to the Orbi backend API running at http://localhost:3001/api.
All Orbi API endpoints are pre-authenticated — no auth headers needed, cookies are handled server-side.

Authenticated user:
- SF User ID: ${userId ?? 'unknown'}
- Name: ${userName ?? 'unknown'}
- Email: ${userEmail ?? 'unknown'}

Key Orbi API endpoints (use curl from bash to call them):
- GET  /api/activities?currentUserId=<id>&limit=50        — SF activities/events
- GET  /api/deal-contributions?currentUserId=<id>         — Deal Contributions
- GET  /api/opportunities?currentUserId=<id>              — Opportunities
- GET  /api/accounts?currentUserId=<id>                   — Accounts
- GET  /api/calendar/events?currentUserId=<id>            — Google Calendar events
- GET  /api/dashboard?currentUserId=<id>                  — Dashboard summary
- POST /api/activities/log-event                          — Create SF activity/event (body: {subject, startDateTime, endDateTime, whatId, seTaskType, recordTypeId})
- POST /api/deal-contributions/upsert                     — Create/update Deal Contribution
- POST /api/assistant/briefing                            — Run the full Orbi briefing pipeline (body: {currentUserId, dateFrom, dateTo})
- POST /api/slack/send                                    — Send Slack message (body: {channel, text})
- POST /api/slack/canvas/activities                       — Post activities canvas to Slack
- POST /api/slack/canvas/dcs                              — Post DC rollup canvas to Slack

When the user asks to "run the briefing", call POST /api/assistant/briefing with appropriate date range.
When the user asks to create activities, use POST /api/activities/log-event.
Always use the authenticated user's SF ID (${userId ?? 'unknown'}) as currentUserId in requests.
Be concise and action-oriented. Show results inline. Use tables for lists.

You also have access to Claude Code skills via slash commands. Prefer these over manual API calls where they fit:
- /se-activities        — log SE activities from Google Calendar
- /se-apprigor          — full SE app rigor cycle (DCs + SE update + scorecards)
- /se-dealcontribution  — audit and log Deal Contributions
- /se-update            — update SE Comments/Next Steps on opportunities
- /se-followup          — scan for open asks across Slack, Calendar, Gmail
- /se-granola-sync      — sync Granola meeting notes to Slack
- /se-pov-workshop      — populate North Star POV Workshop template
- /se-travel-approval   — draft travel approval descriptions
- /se-dsr-draft         — draft a DSR description with routing metadata
- /se-memory-audit      — audit and clean up SE memory files
- /morning-brief        — build and publish daily brief

When a user says something like "log my activities", "run app rigor", "check my follow-ups", "sync granola", etc — invoke the matching skill directly.
</system_context>`;

  if (prior.length === 0) {
    return `${systemContext}\n\n${last.content}`;
  }

  const contextLines = prior.map(m => {
    const prefix = m.role === 'user' ? 'User' : 'Assistant';
    return `${prefix}: ${m.content}`;
  });

  return `${systemContext}\n\nConversation so far:\n${contextLines.join('\n\n')}\n\nUser: ${last.content}`;
}

router.post('/run', (req: Request, res: Response) => {
  const { messages } = req.body as { messages: { role: string; content: string }[] };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const userId = req.session?.userId;
  const userName = req.session?.userName;
  const userEmail = req.session?.userEmail;
  const prompt = buildPrompt(messages, userId, userName, userEmail);

  const proc = spawn(
    CLAUDE_PATH,
    ['--print', '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose'],
    { env: CLAUDE_ENV },
  );

  let killed = false;
  let stderrBuf = '';
  let stdoutBuf = '';

  // Handle client disconnect
  req.on('close', () => {
    if (!killed) {
      killed = true;
      proc.kill('SIGTERM');
    }
  });

  proc.stderr.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString();
  });

  proc.stdout.on('data', (chunk: Buffer) => {
    stdoutBuf += chunk.toString();

    // Process complete lines
    const lines = stdoutBuf.split('\n');
    // Keep the last (potentially incomplete) chunk in the buffer
    stdoutBuf = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const obj = JSON.parse(trimmed);

        if (obj.type === 'assistant') {
          // Extract text content from the message
          const content = obj.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && typeof block.text === 'string') {
                res.write(`data: ${JSON.stringify({ type: 'delta', text: block.text })}\n\n`);
              }
            }
          }
        } else if (obj.type === 'result') {
          // Final result — done signal is sent on process close
        }
        // Ignore system, user echo, tool_use, tool_result, etc.
      } catch {
        // Non-JSON line — ignore
      }
    }
  });

  proc.on('close', (code) => {
    if (killed) return;

    // Flush any remaining stdout buffer
    if (stdoutBuf.trim()) {
      try {
        const obj = JSON.parse(stdoutBuf.trim());
        if (obj.type === 'assistant') {
          const content = obj.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && typeof block.text === 'string') {
                res.write(`data: ${JSON.stringify({ type: 'delta', text: block.text })}\n\n`);
              }
            }
          }
        }
      } catch { /* ignore */ }
    }

    if (code !== 0 && code !== null) {
      const errMsg = stderrBuf.trim() || `claude exited with code ${code}`;
      res.write(`data: ${JSON.stringify({ type: 'error', message: errMsg })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  });

  proc.on('error', (err) => {
    if (!killed) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    }
  });

  // Write the prompt to stdin
  proc.stdin.write(prompt);
  proc.stdin.end();
});

// POST /api/terminal/auth — trigger mcp-adaptor OAuth flow for a provider
router.post('/auth', (req: Request, res: Response) => {
  const { provider } = req.body as { provider: string };
  const MCP_ADAPTOR = '/Users/dshannon/.mcp-adaptor/bin/mcp-adaptor';

  const args = ['auth'];
  if (provider) args.push('--provider', provider);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const proc = spawn(MCP_ADAPTOR, args, {
    env: { ...process.env, PATH: `${process.env.PATH}:/Users/dshannon/.local/bin` },
  });

  const emit = (type: string, text: string) =>
    res.write(`data: ${JSON.stringify({ type, text })}\n\n`);

  proc.stdout.on('data', (d: Buffer) => emit('delta', d.toString()));
  proc.stderr.on('data', (d: Buffer) => emit('delta', d.toString()));

  proc.on('close', (code) => {
    if (code !== 0) emit('delta', `\n[exited with code ${code}]`);
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  });

  proc.on('error', (err) => {
    emit('error', err.message);
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  });

  req.on('close', () => proc.kill());
});

export default router;
