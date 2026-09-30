/* SiteOps service worker (plan D1): lets the app open with no signal.
 * - /_next/static/*: cache-first (content-hashed, immutable).
 * - page navigations: network-first, falling back to the last copy of that page, then to any cached page.
 * - API and everything cross-origin: never touched (offline writes are handled by the app's outbox, not here). */
const VERSION = "v1";
const PAGES = `siteops-pages-${VERSION}`;
const STATIC = `siteops-static-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => ![PAGES, STATIC].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(PAGES).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(PAGES);
          return (await cache.match(req)) || (await cache.match(url.pathname)) || (await cache.match(`/${url.pathname.split("/")[1]}`)) || Response.error();
        }),
    );
  }
});
