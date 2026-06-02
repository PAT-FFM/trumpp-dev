export default async (req, context) => {
  const url = req.url;

  // Nur HTML-Seiten tracken, keine Assets
  if (!url.endsWith("/") && !url.endsWith("/impressum")) return;

  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const supabaseKey = Netlify.env.get("SUPABASE_SECRET_KEY");
  
  // Bots & Crawler ignorieren
  const userAgent = req.headers.get("User-Agent") || "";
  const isBot = /bot|crawl|spider|slurp|facebookexternalhit/i.test(userAgent);
  if (isBot) return;

  await fetch(`${supabaseUrl}/rest/v1/visits`, {
    method: "POST",
    headers: {
      "apikey": supabaseKey,
      "Authorization": `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({
      url: url,
      city: context.geo?.city || null,
      country: context.geo?.country?.name || null,
      user_agent: userAgent
    })
  });
};

export const config = { path: "/*" };
