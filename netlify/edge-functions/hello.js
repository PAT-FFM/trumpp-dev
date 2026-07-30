export default async (req, context) => {
  const { pathname } = new URL(req.url);

  // Nur echte Seitenaufrufe tracken (Pfad-Vergleich, nicht String-Suffix auf
  // der vollen URL — sonst brechen Query-Strings den Match, und zufällig auf
  // "/" endende Scanner-Pfade wie /wp-includes/js/dist/ matchen fälschlich).
  // Alles andere landet nur in den Netlify Function-Logs, nicht in Supabase —
  // generisches Scanner-/Asset-Rauschen, kein Signal über trumpp.dev.
  if (pathname !== "/" && pathname !== "/impressum") {
    console.log("SKIP", pathname);
    return;
  }

  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const supabaseKey = Netlify.env.get("SUPABASE_SECRET_KEY");

  const userAgent = req.headers.get("User-Agent") || "";
  const isBot = /bot|crawl|spider|slurp|facebookexternalhit/i.test(userAgent);

  await fetch(`${supabaseUrl}/rest/v1/visits`, {
    method: "POST",
    headers: {
      "apikey": supabaseKey,
      "Authorization": `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({
      url: req.url,
      city: context.geo?.city || null,
      country: context.geo?.country?.name || null,
      user_agent: userAgent,
      is_bot: isBot
    })
  });
};

export const config = { path: "/*" };
