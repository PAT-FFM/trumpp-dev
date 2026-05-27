# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Static one-page website for [trumpp.dev](https://trumpp.dev) — Peter Trumpp's freelance IT consulting landing page. No build step; files are deployed directly to Netlify.

This project is a fork/copy of the petruc-io-onepager codebase. All references to `petruc.io` must be replaced with `trumpp.dev`.

## Deployment

Push to the connected Git branch — Netlify auto-deploys. No build command or publish directory configuration needed (static files at root).

## Architecture

| File | Purpose |
|---|---|
| `index.html` | Main landing page (German, fullscreen video background + CTA) |
| `style.css` | All styles for `index.html`; uses CSS custom properties for colors |
| `impressum.html` | Legal imprint page |
| `stats.html` | Password-protected analytics dashboard (Chart.js, fetches from edge function) |
| `netlify/edge-functions/hello.js` | Tracks page visits into Supabase on every HTML request (skips bots/assets) |
| `netlify/edge-functions/stats-auth.js` | Guards `/stats` with cookie-based password auth; serves `/stats/data` API from Supabase |

## Environment Variables (Netlify)

Set in the Netlify dashboard (not in files):

- `STATS_PASSWORD` — password for the `/stats` dashboard
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SECRET_KEY` — Supabase key (used in edge functions as SERVICE_ROLE)

## Analytics flow

1. `hello.js` edge function fires on every `/*` request, filters to HTML pages only (`/` and `/impressum`), ignores bots, and inserts a row into the Supabase `visits` table.
2. `stats.html` fetches `/stats/data`, passing the password cookie as `x-stats-auth` header.
3. `stats-auth.js` validates the header, then queries Supabase for totals, daily counts (`visits_per_day` RPC), top cities (`top_cities` RPC), and recent visits — all in parallel.
