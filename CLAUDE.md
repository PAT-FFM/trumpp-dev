# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Static one-page website for [trumpp.dev](https://trumpp.dev) — Peter Trumpp's freelance IT consulting landing page. No build step; HTML/CSS/JS files are deployed directly to Netlify. Backend functionality runs on Netlify Edge Functions and Cloudflare Workers.

## Repository Structure

```
trumpp-dev/
├── index.html                          # Main landing page
├── impressum.html                      # Legal imprint + privacy policy (German)
├── stats.html                          # Password-protected analytics dashboard
├── style.css                           # All styles for the site
├── robots.txt                          # Disallows /stats from indexing
├── sitemap.xml                         # Sitemap (/ and /impressum)
├── llms.txt                            # LLM-readable profile for AI agents
├── netlify.toml                        # Netlify redirects (hides /wrangler.toml and /workers/*)
├── wrangler.toml                       # Cloudflare Workers config
├── fonts/
│   ├── inter-latin.woff2               # Inter font, basic Latin
│   └── inter-latin-ext.woff2           # Inter font, Latin extended
├── netlify/edge-functions/
│   ├── hello.js                        # Visit tracking → Supabase
│   └── stats-auth.js                   # Stats auth + /stats/data API
└── workers/
    ├── mcp.js                          # MCP server + chat endpoint (Cloudflare Worker)
    └── cv.md                           # Peter's CV — injected as AI system prompt context
```

Static assets at root: `favicon.png`, `logo.svg`, `og-image.jpg`, `poster.jpg`, `video.mp4`

## Deployment

**Netlify (main site):** Push to the connected Git branch — Netlify auto-deploys. No build command or publish directory needed (static files at root).

**Cloudflare Workers:** Deploy `workers/mcp.js` manually via Wrangler:
```bash
npx wrangler deploy
```
The worker is named `trumpp-dev-mcp` and runs at `trumpp-dev-mcp.trumpp-dev.workers.dev`. Set secrets with `npx wrangler secret put <KEY>`.

## Architecture

### Static Site (Netlify)

| File | Purpose |
|---|---|
| `index.html` | Main landing page: German, fullscreen video background, rotating taglines, embedded chat widget |
| `style.css` | All styles; no preprocessor; CSS custom properties for colors |
| `impressum.html` | Legal notice + GDPR privacy policy (German law) |
| `stats.html` | Password-protected analytics dashboard using Chart.js |
| `netlify/edge-functions/hello.js` | Tracks page visits into Supabase; fires on `/*`, filters to HTML pages, skips bots |
| `netlify/edge-functions/stats-auth.js` | Guards `/stats` with cookie auth; serves `/stats/data` API from Supabase |

### Cloudflare Workers

| File | Purpose |
|---|---|
| `workers/mcp.js` | Implements MCP server (`/` endpoint) + chat (`/chat` endpoint) backed by Cloudflare Workers AI (Llama 3.3-70B) |
| `workers/cv.md` | Peter's CV in Markdown — embedded verbatim into the AI system prompt |

### Chat Widget (inline in `index.html`)

- 52px circular button, bottom-right corner
- Connects to `https://trumpp-dev-mcp.trumpp-dev.workers.dev/chat` via SSE streaming
- Session persistence via `sessionStorage` (`chat_session_id`)
- Keyboard shortcut: Enter to send

## Key Conventions

### Language
- Site content is in **German** (`lang="de"` on `index.html`)
- The AI chat assistant responds in the **visitor's language** (German or English)
- Privacy policy and legal notice are German-language only

### Fonts
- Typeface: **Inter** (self-hosted woff2 in `/fonts/`)
- Weights used: 400 (regular), 600 (semi-bold)
- Loaded via `@font-face` in `style.css`; no external font CDN

### Styling
- Single flat `style.css` — no preprocessor, no framework
- Full-viewport video background (`z-index: -1`, `position: fixed`)
- Tagline animation: 3 `<span>` elements rotated every 12 s using `tagline-pulse` keyframes
- Chat widget styling is embedded in `style.css`, not inline in HTML

### Security practices already in place
- Chat endpoint validates `Origin` header against an allowlist (`trumpp.dev`, `www.trumpp.dev`, localhost variants)
- Rate limiting: 5 chat requests per 60 s per IP (Cloudflare `CHAT_RATE_LIMITER` binding)
- User messages are truncated to 512 chars server-side
- Body reads are capped at declared `Content-Length` (max 64 KB)
- Stats page uses `textContent` (not `innerHTML`) everywhere to prevent XSS

### GDPR / Legal
- No IP addresses are stored anywhere
- Visit tracking stores: URL, city, country, user-agent, timestamp only
- Chat logs stored 90 days in Supabase (QA/abuse); visits stored 12 months
- Data transfers to USA covered by EU Standard Contract Clauses
- Privacy page (`impressum.html`) must be kept up to date if new data flows are added
- Do **not** add cookies without updating the privacy policy

## Environment Variables

### Netlify (set in Netlify dashboard)

| Variable | Purpose |
|---|---|
| `STATS_PASSWORD` | Password for `/stats` dashboard |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Supabase service-role key (used by edge functions) |

### Cloudflare Workers (set via `wrangler secret put`)

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SECRET_KEY` | Supabase service-role key (chat log storage) |
| `RESEND_API_KEY` | Resend API key for email notifications on new chat sessions |

Cloudflare also provides bindings declared in `wrangler.toml`:
- `AI` — Workers AI (Llama 3.3-70B inference)
- `CHAT_RATE_LIMITER` — rate limiter (namespace 1001, 5 req/60 s)

## Data Flows

### Analytics (visit tracking)
1. `hello.js` edge function fires on every `/*` request.
2. Filters to HTML pages (`/` and `/impressum`) and skips bot user-agents.
3. Inserts row into Supabase `visits` table: `url`, `city`, `country`, `user_agent`.
4. `stats.html` fetches `/stats/data`, passing the `stats_auth` cookie as `x-stats-auth`.
5. `stats-auth.js` validates the header, then runs 5 parallel Supabase queries:
   - Total count (from `content-range` header)
   - Daily counts (`visits_per_day` RPC)
   - Top cities (`top_cities` RPC)
   - German visitors (`german_visits` RPC)
   - Recent visits (last 30, ordered by `visited_at` desc)

### Chat
1. User sends message from widget in `index.html` via `POST /chat`.
2. `mcp.js` validates origin and rate limit, truncates message, builds prompt from `cv.md`.
3. Streams response from Cloudflare Workers AI (Llama 3.3-70B) as SSE.
4. Logs exchange asynchronously to Supabase `chat_logs`.
5. On first turn of a session, optionally sends email notification via Resend (throttled to 1 per 10 min globally).

### MCP Protocol
- `GET /` — returns connected status
- `POST /` with `initialize` method — returns capabilities and server info
- `POST /` with `tools/list` — returns `get_profile` tool definition
- `POST /` with `tools/call` (`get_profile`) — returns structured profile JSON
- Supports protocol versions: `2025-06-18`, `2025-03-26`, `2024-11-05`

## Supabase Schema (expected)

The edge functions and worker expect these tables/RPCs:

| Name | Type | Used by |
|---|---|---|
| `visits` | table | `hello.js` (insert), `stats-auth.js` (query) |
| `chat_logs` | table | `mcp.js` (insert) |
| `visits_per_day` | RPC | `stats-auth.js` |
| `top_cities` | RPC | `stats-auth.js` |
| `german_visits` | RPC | `stats-auth.js` |

## Development Notes

- **No build step** — edit files directly; changes are visible immediately after Netlify deploy or `wrangler deploy`
- **Local testing of Workers:** `npx wrangler dev workers/mcp.js` starts a local dev server; update the chat widget URL temporarily for local testing
- **Local testing of Netlify edge functions:** `npx netlify dev` (requires Netlify CLI)
- **CV updates:** Edit `workers/cv.md` — this is the single source of truth for the AI's knowledge about Peter. After editing, redeploy the Worker.
- **Tagline changes:** Edit the three `<span class="tagline-...">` elements in `index.html`; the CSS animation handles display rotation automatically
- **netlify.toml** only contains security redirects to hide internal files — do not use it for routing logic
