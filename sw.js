// SaintSal™ Labs — Service Worker (PWA Offline + Cache)
const CACHE_NAME = 'sal-labs-v3';
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

  // Never cache or intercept API calls, auth, or uploads — let them pass through to network directly
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth')) {
    return; // Don't call event.respondWith — let the browser handle it natively
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
