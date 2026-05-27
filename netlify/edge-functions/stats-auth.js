const PASSWORD = Netlify.env.get("STATS_PASSWORD");

export default async (req, context) => {
  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const supabaseKey = Netlify.env.get("SUPABASE_SECRET_KEY");
  const url = new URL(req.url);

  // API-Endpunkt: /stats/data
  if (url.pathname === "/stats/data") {
    const auth = req.headers.get("x-stats-auth");
    if (auth !== PASSWORD) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    // Alle Queries parallel
    const [totalRes, dailyRes, citiesRes, germanRes, recentRes] = await Promise.all([

      // Gesamt
      fetch(`${supabaseUrl}/rest/v1/visits?select=count`, {
        headers: { "apikey": supabaseKey, "Prefer": "count=exact", "Range": "0-0" }
      }),

      // Pro Tag (letzte 30 Tage)
      fetch(`${supabaseUrl}/rest/v1/rpc/visits_per_day`, {
        method: "POST",
        headers: { "apikey": supabaseKey, "Content-Type": "application/json" },
        body: JSON.stringify({})
      }),

      // Top Städte
      fetch(`${supabaseUrl}/rest/v1/rpc/top_cities`, {
        method: "POST",
        headers: { "apikey": supabaseKey, "Content-Type": "application/json" },
        body: JSON.stringify({})
      }),

      // Besuche aus Deutschland
      fetch(`${supabaseUrl}/rest/v1/rpc/german_visits`, {
        method: "POST",
        headers: { "apikey": supabaseKey, "Content-Type": "application/json" },
        body: JSON.stringify({})
      }),

      // Letzte 30 Besuche
      fetch(`${supabaseUrl}/rest/v1/visits?select=visited_at,url,city,country,user_agent&order=visited_at.desc&limit=30`, {
        headers: { "apikey": supabaseKey }
      }),
    ]);

    const total = totalRes.headers.get("content-range")?.split("/")[1] || "0";
    const daily = await dailyRes.json();
    const cities = await citiesRes.json();
    const german = await germanRes.json();
    const recent = await recentRes.json();

    return new Response(JSON.stringify({ total, daily, cities, german, recent }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  // Passwortschutz für /stats
  if (url.pathname === "/stats" || url.pathname === "/stats/") {
    const cookie = req.headers.get("cookie") || "";
    if (!cookie.includes(`stats_auth=${PASSWORD}`)) {
      return new Response(`<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Login – trumpp.dev/stats</title>
  <style>
    body { font-family: sans-serif; display: flex; justify-content: center;
           align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
    .box { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    input { padding: 0.5rem; font-size: 1rem; border: 1px solid #ccc; border-radius: 4px; width: 200px; }
    button { margin-left: 0.5rem; padding: 0.5rem 1rem; background: #333; color: white;
             border: none; border-radius: 4px; cursor: pointer; font-size: 1rem; }
    .error { color: red; margin-top: 0.5rem; font-size: 0.9rem; display: none; }
  </style>
</head>
<body>
  <div class="box">
    <h2 style="margin-top:0">trumpp.dev · Stats</h2>
    <input type="password" id="pw" placeholder="Passwort" />
    <button onclick="login()">Login</button>
    <div class="error" id="err">Falsches Passwort</div>
  </div>
  <script>
    function login() {
      const pw = document.getElementById("pw").value;
      document.cookie = "stats_auth=" + pw + "; path=/; max-age=86400";
      location.reload();
    }
    document.getElementById("pw").addEventListener("keydown", e => {
      if (e.key === "Enter") login();
    });
  </script>
</body>
</html>`, { headers: { "Content-Type": "text/html" } });
    }
  }

  return context.next();
};

export const config = { path: ["/stats", "/stats/", "/stats/data"] };
