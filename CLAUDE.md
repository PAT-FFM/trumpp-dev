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

**Credentials stay server-side only — never fetch them into the client or the dev shell.** There is no legitimate reason to read `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `STATS_PASSWORD`, or any other secret via `env`, `printenv`, `netlify env:get`, `wrangler secret list`, or similar — that's exactly what these variables are designed to avoid: they exist so secrets are only ever resolved server-side (Netlify Edge Functions, Cloudflare Workers), never in the browser or in a local development shell. This holds even for convenience tasks like cleaning up test data written during local testing — ask the user to do it themselves via the Netlify/Cloudflare/Supabase dashboard instead of trying to obtain the key.

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
| `locations` | table | `location.js` (insert, query) |
| `visits_per_day` | RPC | `stats-auth.js` |
| `top_cities` | RPC | `stats-auth.js` |
| `german_visits` | RPC | `stats-auth.js` |
| `location_days` | RPC | `location.js` — distinct Europe/Berlin calendar days with entries |

## Development Notes

- **No build step** — edit files directly; changes are visible immediately after Netlify deploy or `wrangler deploy`
- **Local testing of Workers:** `npx wrangler dev workers/mcp.js` starts a local dev server; update the chat widget URL temporarily for local testing
- **Local testing of Netlify edge functions:** `npx netlify dev` (requires Netlify CLI)
- **CV updates:** Edit `workers/cv.md` — this is the single source of truth for the AI's knowledge about Peter. After editing, redeploy the Worker.
- **Tagline changes:** Edit the three `<span class="tagline-...">` elements in `index.html`; the CSS animation handles display rotation automatically
- **netlify.toml** only contains security redirects to hide internal files — do not use it for routing logic

## Feature: Location Tracker

### Idea

Minimalistic multi-user location tracker with no login/auth, for Peter's
family & friends only — **not a general trumpp.dev website feature**. Users
enter a self-chosen label; the current position is posted under it.
Others see all label positions from a selected day (default: today, always
a Europe/Berlin calendar day — see "Day selection" below) on a shared map.

No claim to security or uniqueness: anyone who knows the URL can post under
any label and read all positions. No password protection, no protection
against overwriting.

**Privacy:** No mention in the imprint (Impressum) needed — not a general
website feature, the URL is not linked anywhere (no nav menu, no sitemap),
and the page's own content unambiguously explains what happens (satisfies
the GDPR information duty directly at the point of collection, no need for a
separate document).

### Scope (deliberately minimal, "keep it simple")

- **No Flutter, no native app, no PWA.** Plain website, usable from mobile
  browser and desktop alike.
- **Foreground tracking only**, while the page is active/open. No background
  tracking (would require a foreground service + background location
  permission, out of scope).
- **One combined page** at `/location` (unlinked, `noindex`, also excluded
  in `robots.txt` like `/stats`):
  - Map with two pin types: **"You"** (own position, draggable, not
    persisted until posted, always blue) and **DB pins** — one pin per
    stored row, not per label, from the selected day, so a label with
    several posts that day shows as a short trail of pins. DB pins are
    colored per label from a 10-color rotating palette, assigned by
    order of first appearance among the currently loaded entries (the 11th
    distinct active label reuses the 1st's color) — so a person's trail
    is visually consistent and distinguishable from others. Recomputed on
    every load, so the color can drift as the set of loaded entries changes
    (switching days, or new posts arriving today); acceptable for a
    handful of family/friends users. Tap/click on a pin opens a popup with
    label + timestamp (`HH:MM:SS`, deliberately `bindPopup()` instead of a
    hover tooltip, since hover doesn't exist on touch devices).
  - **Day selection:** a dropdown (top of the panel) picks which day's pins
    are shown. Default and always-present option: "Heute" (today). Other
    options only appear once they have at least one entry, sourced from the
    `location_days` RPC (distinct days, DB-side `DISTINCT`, not fetched-and
    -bucketed client-side). "Day" is always a **Europe/Berlin** calendar
    day, computed server-side in `location.js` — deliberately not the
    viewing device's local timezone, since a traveling family member's
    phone auto-switching timezone must not shift what "today" means for
    everyone else looking at the map. Live polling (every 5s) only runs
    while viewing today; past days are static and don't need it. Posting a
    position always jumps the view back to "today" (a post is always
    "now"), even if a past day was selected.
  - Initial map centering: own live position (via `getCurrentPosition()`) at
    street-level zoom. The geolocation permission prompt fires immediately
    on load — that's the whole point of the page; a use case of "view
    positions without sharing your own" is not supported.
  - The "You" pin is **draggable** — lets the user correct a slightly-off
    GPS fix or deliberately mark a nearby place before arriving there.
  - Required label field + "Post position" button: posts whichever
    coordinates the "You" pin currently shows (GPS or manually dragged), not
    a fresh GPS fetch — dragging would otherwise be overwritten on every
    click. Button label deliberately doesn't say "my position", since after
    dragging it may not be. A separate "Refresh location" link re-fetches a
    fresh GPS position and resets the pin there. Helper text directly under
    the label field explains the link between pin and label.
  - Focus row (only shown if the selected day has DB entries): dropdown
    with existing labels, deduplicated to one entry per label (on
    change: map pans/zooms to that label's *newest* pin, other pins stay
    visible; also collapses the panel, see below) + separate "Show all pins"
    button (fitBounds over every pin, not just the latest per label).
    Deliberately no "all" dropdown entry, since that's an action, not a
    selection.
  - The control panel is a bottom sheet (full-width on mobile, a small
    floating card on desktop) that visually covers a chunk of the map. Both
    "Show all pins" and focusing a label collapse it (animated slide to
    the side) so `fitBounds`/panning isn't fighting for space with the
    panel; a small handle button re-expands it.

### Stack

- **Hosting/integration:** trumpp.dev (Netlify), same setup as the existing
  website
- **Backend/storage:** Supabase (free tier, already used for
  visitor/click analytics on trumpp.dev)
- **Map rendering:** OpenStreetMap via Leaflet.js
- **Frontend:** plain HTML/JS, no framework needed
- **API access:** no Supabase key in the browser. A new
  `netlify/edge-functions/location.js` proxies server-side (service role
  key, same pattern as `stats-auth.js`), three endpoints:
  - `GET /location/all?date=YYYY-MM-DD` → all entries for that Europe/Berlin
    calendar day (label, lat, lng, timestamp), newest first — feeds map pins
    directly; the label dropdown dedupes client-side to the newest entry per
    label. `date` is validated server-side (`YYYY-MM-DD` shape); missing/
    invalid falls back to the old last-24h window. Day-boundary→UTC
    conversion happens in `location.js` via `Intl`, fixed to `Europe/Berlin`
    regardless of the requester's own timezone.
  - `GET /location/days` → distinct days that have entries, via the
    `location_days` RPC (DB-side `DISTINCT`, same pattern as
    `visits_per_day`/`top_cities`/`german_visits` in `stats-auth.js`) —
    feeds the day-selection dropdown.
  - `POST /location/set` → plain insert of a new position under a
    label (not an upsert — see "Data model" for why). Accepts an optional
    client-supplied `timestamp` (ISO string), used instead of the server's
    own clock if present and within a bounded window (5 min future / 7 days
    past) — see "Connectivity resilience" below for why.
- **Abuse hardening on `POST /location/set`** (basic speed bumps, not real
  security — see "Explicitly out of scope"):
  - Origin allowlist (`trumpp.dev`, `www.trumpp.dev`), same list as
    `workers/mcp.js`. Rejects with **401**, not 403 — `netlify dev`'s local
    static-file fallback treats a 403 from an edge function as "maybe this
    is a directory" and retries the request against `/index.html` variants,
    clobbering the response; 401 doesn't trigger that. Trivially bypassed by
    a script that just sets the header itself, same caveat as the chat
    endpoint's origin check.
  - Best-effort per-IP rate limit (10 requests/60s), state held in an
    in-memory `Map` at module scope — only holds within a single warm
    edge isolate, resets on cold start, not shared across edge locations.
    No Cloudflare-style rate-limiter binding available on Netlify Edge
    Functions, so this is the pragmatic substitute.

### Connectivity resilience (dead zones)

The use case: coverage in Germany is generally fine, but the tracker should
still work for a stretch with no signal at all (e.g. an hour in the woods) —
not full offline-first/PWA support, just "don't lose a click that happened
while briefly unreachable."

- **Post queue:** if `POST /location/set` fails with a genuine network error
  (`fetch` throwing `TypeError`/`AbortError` — not a real server response
  like a 400/429), the entry is kept in `localStorage`
  (`location_pending_posts`) instead of being reported as a failure. Retried
  oldest-first on the browser's `online` event and on a 20s interval timer
  (the `online` event alone only reflects the network interface, not actual
  reachability, so the interval is the real fallback). `localStorage`, not
  IndexedDB — a handful of small JSON records don't need the extra
  complexity, and it survives a reload while still offline. A small hint in
  the panel shows the pending count.
- **Client-captured timestamp:** a queued post carries the timestamp from
  the moment of the original click, not the moment it eventually reaches the
  server — otherwise a position captured in a dead zone at 14:00 but sent at
  15:00 would display as if the person was there at 15:00. The edge function
  trusts this client-supplied timestamp (bounded window, see above) — a
  deliberate choice consistent with this feature's existing "no auth, no
  integrity guarantees" model (see "Explicitly out of scope").
- **Stale-data hint:** `GET /location/all` and `GET /location/days` failures
  (same dead-zone case, or just a flaky load) no longer fail silently — a
  small hint shows "no connection, showing state from HH:MM:SS" (or "no
  positions loaded yet" before the first successful load) so a viewer
  focusing a label or hitting "Show all pins" isn't misled into thinking
  what's on screen is current. All three GET/POST requests go through an
  8s-timeout fetch wrapper so a hanging request (flaky signal, not a clean
  failure) is treated as offline promptly rather than stalling the UI.
- **Self-clearing hints:** both the stale-data hint and the pending-post
  count clear themselves the moment connectivity returns, via a
  `reconcileConnectivity()` run on the `online` event and on the same 20s
  interval — not just via the 5s poll, which only runs while viewing today,
  so a dead zone hit while looking at a past day still recovers on its own.
- **Day-switch-during-outage guard:** switching the day dropdown while
  offline attempts the load like normal, but if it fails, `selectedDate` (and
  the dropdown itself) falls back to whichever day's entries are actually
  still rendered on the map (`loadedDate` in `location.html`) — otherwise the
  dropdown could claim to show a day the map isn't actually displaying.
- Explicitly **not** attempted: caching map tiles or DB pins for full
  offline viewing (PWA/service worker) — out of scope, this only covers
  posting through a temporary dead zone while the page stays open.

### Data model

Table `locations`:
- `id` (bigint, identity, primary key)
- `label` (text, not unique — a label can have many rows)
- `lat` (float)
- `lng` (float)
- `timestamp` (timestamptz)

Every post is a plain **insert**, not an upsert — each label
accumulates a short history (see caps below) instead of overwriting a
single row. Deliberate: no cookie/session ties a browser to "its"
label, so there's no reliable way to know which stored label (if
any) is "you" — see the location tracker's "You" vs. DB-pin distinction
above. Every row renders as its own pin; the dropdown dedupes to the
newest per label for focusing.

RLS "deny all" for direct client access — access only via the edge function
with the service role key.

Two DB triggers, both `after insert ... for each row` (so they only fire on
genuine new rows, matching the plain-insert model above):
- `trg_limit_locations` (function `limit_locations_table()`): caps the
  **whole table at 500 rows total** — on insert, deletes rows beyond the
  500 most recent (by `timestamp`, `id` as tiebreak), regardless of
  label.
- `trg_limit_locations_per_label` (function
  `limit_locations_per_label()`): caps **each label at 50 rows** —
  same eviction logic, scoped to `label = new.label`.

Both guard against a spam script flooding the table, either with many
distinct fake labels (global cap) or many rapid posts under one
label (per-label cap). Set up manually via the Supabase SQL editor,
not part of this repo (no migrations tooling here).

RPC `location_days()` — returns the distinct Europe/Berlin calendar days
that have at least one row, newest first:

```sql
create or replace function location_days()
returns table(day date) as $$
  select distinct (timestamp at time zone 'Europe/Berlin')::date as day
  from locations
  order by day desc;
$$ language sql stable;
```

Also set up manually via the Supabase SQL editor, same as the triggers
above — not part of this repo.

### Explicitly out of scope (v1)

- No password protection (unlinked URL + `noindex` is sufficient)
- No authentication / no protection of labels
- No background tracking while the screen is locked
- No iOS consideration (Android-focused, no Mac/iPhone available for a
  Flutter iOS build — hence web instead of a native app anyway)
- No offline support, no service worker


