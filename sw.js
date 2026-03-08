// SaintSal™ Labs — Service Worker (PWA Offline + Cache)
const CACHE_NAME = 'sal-labs-v1';
const STATIC_ASSETS = [
  '/',
  '/app.js',
  '/style.css',
  '/manifest.json'
];

// Install — pre-cache static shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// Fetch — network-first for API, cache-first for static
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls, auth, or uploads
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth')) {
    event.respondWith(fetch(event.request).catch(() => new Response('{"error":"offline"}', { headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // Stale-while-revalidate for static assets
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResp) => {
        const fetchPromise = fetch(event.request).then((networkResp) => {
          if (networkResp && networkResp.ok) {
            cache.put(event.request, networkResp.clone());
          }
          return networkResp;
        }).catch(() => cachedResp);
        return cachedResp || fetchPromise;
      });
    })
  );
});
