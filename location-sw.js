// Caches only the /location page's app shell (its own HTML + the Leaflet
// CDN assets it loads) — not a full offline-first PWA, just enough that the
// page still opens with no signal at all after Android kills the background
// tab (see CLAUDE.md, "Connectivity resilience"). Live data and posts
// (/location/all, /location/days, /location/set) deliberately never go
// through this cache — location.html's own stale-hint/post-queue logic
// needs to see real network failures, not something silently served stale.
//
// Registered with scope "/location" (see location.html) so this never
// touches the main trumpp.dev site.

const CACHE_NAME = "location-shell-v1";
const SHELL_URLS = [
  "/location",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Live data / posts: always hit the network, never intercepted.
  if (url.pathname.startsWith("/location/")) return;

  if (url.origin === self.location.origin) {
    // Own shell (the /location page itself): network-first, falling back
    // to cache only when genuinely offline. Keeps the cached copy updated
    // on every successful load, so a location.html change ships without
    // needing a manual CACHE_NAME bump.
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Pinned, versioned CDN assets (Leaflet) — never change under the same
    // URL, so cache-first avoids re-fetching them every load.
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
