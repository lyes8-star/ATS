/* Service worker Test Mon CV — cache app shell (chemins relatifs) */
const CACHE = "tmc-shell-v7";

function shellUrls() {
  const base = self.registration.scope;
  return [
    "./",
    "index.html",
    "offline.html",
    "css/styles.css",
    "js/site-config.js",
    "js/consent.js",
    "js/analytics.js",
    "js/a11y.js",
    "js/chat.js",
    "js/pwa-install.js",
    "js/seo.js",
    "js/boot.js",
    "js/analyzer.js",
    "js/app.js",
    "js/extract.js",
    "js/studio.js",
    "js/ai-prompt.js",
    "data/site.json",
    "manifest.webmanifest",
    "favicon.svg",
    "icons/icon-192.png",
    "icons/icon-512.png",
  ].map((path) => new URL(path, base).href);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(
          shellUrls().map((url) =>
            cache.add(url).catch(() => {
              /* ignore missing optional assets */
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isHtml =
    req.headers.get("accept")?.includes("text/html") ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith("/");

  if (isHtml) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          return cached || caches.match(new URL("offline.html", self.registration.scope).href);
        })
    );
    return;
  }

  // CSS/JS/JSON : network-first
  if (/\.(css|js|json|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Icons etc. : cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      });
    })
  );
});
