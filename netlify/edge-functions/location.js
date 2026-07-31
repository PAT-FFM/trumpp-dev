const ALLOWED_ORIGINS = new Set([
  "https://trumpp.dev",
  "https://www.trumpp.dev",
]);

// Best-effort per-IP rate limit: state lives in module scope, so it only
// holds within a single warm isolate (resets on cold start, not shared
// across edge locations). Fine as a speed bump against a naive spam
// script; not a hard guarantee against a determined/distributed attacker.
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitState = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitState.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitState.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

const BERLIN_TZ = "Europe/Berlin";

// "Day" always means a Europe/Berlin calendar day, never the viewer's device
// timezone — this tracker is for a German family/friends group, and someone
// traveling shouldn't shift what "today" means for everyone watching.
function berlinOffsetMinutes(instant) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BERLIN_TZ, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).formatToParts(instant).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - instant.getTime()) / 60000);
}

// Converts a "YYYY-MM-DD" Berlin calendar day into its UTC [from, to) bounds.
// The offset is sampled at UTC noon of that date — comfortably clear of the
// 1-3am DST transition window, so it's correct for 363-364 days a year. On
// the two transition days themselves, pins right around local midnight can
// land in the wrong day bucket by up to an hour — a known, accepted
// trade-off given the tiny user base, same spirit as the color-drift
// trade-off already documented in location.html.
function berlinDayBoundsUtc(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const offsetMin = berlinOffsetMinutes(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
  const from = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMin * 60000);
  const to = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0) - offsetMin * 60000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default async (req, context) => {
  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const supabaseKey = Netlify.env.get("SUPABASE_SECRET_KEY");
  const url = new URL(req.url);

  if (url.pathname === "/location/all" && req.method === "GET") {
    // date is an attacker-reachable query param, so validate its shape
    // before using it — anything malformed falls back to the old default
    // (last 24h, open-ended) rather than being spliced into the upstream URL.
    const dateParam = url.searchParams.get("date");
    const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam || "") && !Number.isNaN(Date.parse(dateParam));

    let query;
    if (isValidDate) {
      const { from, to } = berlinDayBoundsUtc(dateParam);
      query = `select=label,lat,lng,timestamp&timestamp=gte.${encodeURIComponent(from)}&timestamp=lt.${encodeURIComponent(to)}&order=timestamp.desc`;
    } else {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = `select=label,lat,lng,timestamp&timestamp=gte.${encodeURIComponent(since)}&order=timestamp.desc`;
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/locations?${query}`, {
      headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` }
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Upstream error" }), {
        status: 502,
        headers: { "Content-Type": "application/json" }
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (url.pathname === "/location/days" && req.method === "GET") {
    // Distinct Europe/Berlin calendar days that have at least one entry,
    // computed on the DB side via the location_days() RPC (same pattern as
    // visits_per_day/top_cities/german_visits in stats-auth.js) rather than
    // hauling all rows over and bucketing them here.
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/location_days`, {
      method: "POST",
      headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Upstream error" }), {
        status: 502,
        headers: { "Content-Type": "application/json" }
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (url.pathname === "/location/set" && req.method === "POST") {
    const origin = req.headers.get("Origin");
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      // 401, not 403: netlify dev's local static-file fallback treats a 403
      // from an edge function as "maybe this is a directory, retry with
      // /index.html" and re-invokes the function chain for each variant,
      // clobbering this response. 401 doesn't trigger that (verified
      // against stats-auth.js, which already returns 401 cleanly).
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const ip = context.ip || "unknown";
    if (isRateLimited(ip)) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json" }
      });
    }

    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 2048) {
      return new Response(JSON.stringify({ error: "Payload too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json" }
      });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const label = typeof body.label === "string" ? body.label.trim().slice(0, 64) : "";
    const lat = Number(body.lat);
    const lng = Number(body.lng);

    if (!label || !Number.isFinite(lat) || !Number.isFinite(lng) ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/locations`, {
      method: "POST",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({ label, lat, lng, timestamp: new Date().toISOString() })
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Upstream error" }), {
        status: 502,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response("Not found", { status: 404 });
};

export const config = { path: ["/location/all", "/location/set", "/location/days"] };
