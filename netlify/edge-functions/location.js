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

export default async (req, context) => {
  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const supabaseKey = Netlify.env.get("SUPABASE_SECRET_KEY");
  const url = new URL(req.url);

  if (url.pathname === "/location/all" && req.method === "GET") {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(
      `${supabaseUrl}/rest/v1/locations?select=label,lat,lng,timestamp&timestamp=gte.${since}&order=timestamp.desc`,
      { headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` } }
    );

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

export const config = { path: ["/location/all", "/location/set"] };
