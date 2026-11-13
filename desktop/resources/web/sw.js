const CACHE_NAME = 'soulima-app-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/assets/soulimaWhiteLogo.png',
  '/assets/soulima.png',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip caching API proxy or external stream requests in Service Worker asset cache
  if (url.pathname.startsWith('/api/') || url.hostname.includes('themoviedb.org') || url.hostname.includes('vidsrc')) {
    return;
  }

  // Navigation: always prefer the network so a fresh index.html is served after
  // every deploy (bundle hashes change). Fall back to the cached copy offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('/index.html', networkResponse.clone());
            });
          }
          return networkResponse;
        })
        .catch(() => caches.match('/index.html') || caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(event.request).then((networkResponse) => {
          // Only store a response whose type matches the request. A missing JS
          // bundle is served index.html by SPA fallback - caching that breaks the app.
          if (networkResponse && networkResponse.status === 200 && responseMatches(networkResponse, event.request)) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).catch(() => {
        return new Response('Offline content unavailable', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});

function responseMatches(response, request) {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const path = new URL(request.url).pathname;
  const isScript = path.endsWith('.js');
  return !(isScript && contentType.includes('text/html'));
});
