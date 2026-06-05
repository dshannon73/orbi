# Orbi

AI-powered SE Command Center that automates quarterly "App Rigor" admin — logging activities, filing Deal Contributions, and drafting DSR status updates — by connecting Google Calendar, Salesforce org62, Slack, and Gmail into a single intelligent workflow. Built entirely with Claude Code (Anthropic's CLI agent) for the Salesforce Vibe Coding Competition 2026.

**Live:**
- **Deck**: https://orbi-deck-66e67b8b9735.herokuapp.com
- **Docs**: https://orbi-deck-66e67b8b9735.herokuapp.com/docs
- **v2 app (MCP calendar)**: https://orbi-v2-33a2c3f213ef.herokuapp.com

## Versions

| | v1 (main) | v2 (v2-mcp-calendar branch) |
|---|---|---|
| Calendar | Google OAuth (requires GCP project) | Google Calendar MCP via aisuite |
| Server port (local) | 3001 | 3002 |
| Client port (local) | 5173 | 5174 |

## Prerequisites

- **Node.js 20+**
- **Salesforce CLI** (`sf`) — authenticated against org62
- **Claude Code CLI** — installed and authenticated (for terminal, DSR, and v2 calendar)
- **v1 only**: Google Cloud project — OAuth 2.0 credentials with Calendar (read) scope
- **v2 only**: aisuite MCP adaptor with google-workspace configured
- **Slack workspace** — Bot token with channels:read, chat:write, canvas permissions

## Architecture

```
┌─────────────┐  ┌──────────────┐  ┌──────────┐  ┌───────┐
│ Google Cal  │  │ Salesforce   │  │ Slack    │  │ Gmail │
│ (OAuth)     │  │ org62 (CLI)  │  │ (MCP)    │  │       │
└──────┬──────┘  └──────┬───────┘  └────┬─────┘  └───┬───┘
       │                │               │             │
       └────────────────┼───────────────┼─────────────┘
                        │
              ┌─────────▼──────────┐
              │  Orbi Server       │
              │  (Express + TS)    │
              │                    │
              │  ┌──────────────┐  │
              │  │ Claude LLM   │  │  ← Event classification,
              │  │ (Gateway)    │  │    account matching
              │  └──────────────┘  │
              │                    │
              │  ┌──────────────┐  │
              │  │ Claude CLI   │  │  ← Terminal, DSR research
              │  │ (subprocess) │  │
              │  └──────────────┘  │
              └─────────┬──────────┘
                        │
              ┌─────────▼──────────┐
              │  React Frontend    │
              │  (Vite + Tailwind) │
              │                    │
              │  Review UI         │
              │  Terminal Panel    │
              └─────────┬──────────┘
                        │
              ┌─────────▼──────────┐
              │  Write Targets     │
              │  SF org62 (DML)    │
              │  Slack Canvas      │
              └────────────────────┘
```

## Setup

```bash
# Get source via Heroku CLI (no GitHub needed)
heroku git:clone -a orbi-v2 orbi && cd orbi

# For v2 (MCP calendar):
git checkout v2-mcp-calendar

# For v1 (OAuth calendar):
# stay on main branch

# Install all dependencies
npm install
cd server && npm install
cd ../client && npm install
cd ..

# Authenticate SF CLI
sf org login web --alias org62 --instance-url https://org62.my.salesforce.com

# Configure environment
cp server/.env.example server/.env
# Edit server/.env with your credentials (see below)

# Run dev (server + client concurrently)
npm run dev
```

Open `http://localhost:5173` and log in.

## Environment Variables

Create `server/.env`:

```env
# Salesforce (fallback — server prefers SF CLI token)
SF_INSTANCE_URL=https://org62.my.salesforce.com
SF_ACCESS_TOKEN=

# Slack
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret

# Google Calendar OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/calendar/oauth/callback

# LLM Gateway (SF internal — for AI event classification)
ENG_AI_MODEL_GW_KEY=your-key

# Session
SESSION_SECRET=a-random-secret-string
PORT=3001
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Tailwind CSS, Zustand, React Query, Radix UI |
| Backend | Node.js, Express 4, TypeScript, ts-node |
| Salesforce | jsforce, SF CLI (session-based auth) |
| Google | googleapis (Calendar OAuth) |
| Slack | @slack/bolt, MCP adaptor (aisuite) |
| AI | Claude LLM via OpenAI-compatible gateway, Claude CLI subprocess |
| State | Zustand (UI), Express session + file-store (auth), SF (data truth) |

## Key Design Decisions

1. **SF CLI as auth layer** — No manual token refresh. The server calls `sf org display --json` on each request and hands the token to jsforce. The CLI handles refresh transparently.

2. **LLM for event classification** — Deterministic signals (name-in-title, attendee domain, ownership) handle 60%+ of account matching. A single LLM batch pass handles task type classification, grouping, and ambiguous account resolution in one call.

3. **Claude CLI for deep research** — Features like DSR Review and the Terminal spawn Claude CLI as a subprocess with `--output-format stream-json`. This gives access to Slack MCP search, Drive, and full Claude Code capabilities without embedding those tools in the server.

4. **Human-in-the-loop** — Nothing writes to Salesforce without explicit user approval. The AI produces drafts; the Review UI presents them for confirmation.

5. **SSE for long operations** — Briefing, DSR review, and terminal all use Server-Sent Events for streaming progress and results back to the client.

## Gotchas

- **MCP not callable from Node** — You cannot import MCP tools into a Node process. Spawn Claude CLI and pipe prompts to stdin.
- **Auth across 5 systems** — SF CLI, Google OAuth, Slack bot, LLM gateway, and Express sessions must all stay valid. SF CLI is the most fragile (expires after 12h idle).
- **Claude safety filters** — Spawned Claude CLI processes reject prompts that look adversarial. Use natural language, set a neutral cwd, avoid system-instruction-style framing.
- **Large org queries** — org62 has millions of records. Always scope queries by OwnerId or date range. Never use relationship fields in WHERE on unscoped activity queries (triggers "exceeded 100000 distinct who/what's").

## Extending

### Add a new agent

1. Create `server/src/routes/yourAgent.ts` with a POST endpoint
2. Set SSE headers (`Content-Type: text/event-stream`)
3. Pre-fetch SF data the agent needs
4. Build a prompt with the pre-fetched context
5. Spawn `claude --print --dangerously-skip-permissions --output-format stream-json --verbose`
6. Pipe prompt to stdin, stream stdout as SSE
7. Register route in `server/src/index.ts`

### Add a new data source

1. Add API client to `server/package.json`
2. Create service in `server/src/services/`
3. Create route in `server/src/routes/` (follow Google Calendar OAuth pattern for consent flow)
4. Add page in `client/src/pages/`

## Scripts

```bash
npm run dev          # Both server + client
npm run dev:server   # Express on :3001
npm run dev:client   # Vite on :5173
npm start            # Production (serves demo deck)
```

## Deployment

The demo deck is deployed to Heroku (`orbi-deck` app):

```bash
git push heroku-deck main
```

Live at: https://orbi-deck-66e67b8b9735.herokuapp.com

## License

Internal Salesforce project. Not for external distribution.

---

Built by Dan Shannon | Distinguished SE | Salesforce | Vibe Coding Competition 2026
