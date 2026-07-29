export default async (req, context) => {
  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const supabaseKey = Netlify.env.get("SUPABASE_SECRET_KEY");
  const url = new URL(req.url);

  if (url.pathname === "/location/all" && req.method === "GET") {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(
      `${supabaseUrl}/rest/v1/locations?select=pseudonym,lat,lng,timestamp&timestamp=gte.${since}&order=timestamp.desc`,
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

    const pseudonym = typeof body.pseudonym === "string" ? body.pseudonym.trim().slice(0, 64) : "";
    const lat = Number(body.lat);
    const lng = Number(body.lng);

    if (!pseudonym || !Number.isFinite(lat) || !Number.isFinite(lng) ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const res = await fetch(`${supabaseUrl}/rest/v1/locations?on_conflict=pseudonym`, {
      method: "POST",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify({ pseudonym, lat, lng, timestamp: new Date().toISOString() })
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
