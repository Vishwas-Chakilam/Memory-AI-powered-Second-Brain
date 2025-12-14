
const CACHE_NAME = 'memory-cache-v3';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/onboarding_logo.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(URLS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Special handling for manifest.json to ensure correct content-type
  if (event.request.url.includes('/manifest.json')) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          const clonedResponse = response.clone();
          return new Response(clonedResponse.body, {
            status: clonedResponse.status,
            statusText: clonedResponse.statusText,
            headers: {
              'Content-Type': 'application/manifest+json',
              ...Object.fromEntries(clonedResponse.headers.entries())
            }
          });
        }
        return response;
      }).catch(() => {
        return caches.match('/manifest.json');
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached response if found
      if (response) {
        return response;
      }

      // Clone request for fetch
      const fetchRequest = event.request.clone();

      return fetch(fetchRequest).then((response) => {
        // Check if valid response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Cache the new resource
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch(() => {
        // Fallback for offline if not in cache
        // For this app, if main app is cached, it works offline via IndexedDB
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});
