const CACHE_NAME = "farrux-shop-v2";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = ["/", "/offline.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_URLS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => (key === CACHE_NAME ? null : caches.delete(key)))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  // Навигация: сеть -> кэш -> офлайн-страница
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
          return response;
        } catch (error) {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
          throw error;
        }
      })()
    );
    return;
  }

  // Статика same-origin: cache-first, затем сеть
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
          }
          return response;
        } catch (error) {
          return cached;
        }
      })()
    );
  }
});
