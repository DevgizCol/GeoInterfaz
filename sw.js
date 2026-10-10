// GeoInterfaz Service Worker · DevGiz Cloud-Native WebGIS Cache
const CACHE_NAME = 'geointerfaz-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/estilo.css?v=3',
  './css/refinado.css?v=6',
  './js/app.js?v=10',
  './logo_aida.svg',
  './logo_devgiz.svg',
  './img/devgiz_lockup.svg',
  './img/devgiz_emblem.svg',
  './data/catalogo.json',
  './data/vistas.json',
  './data/capas.json',
  './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => console.warn('Cache prefetch partial warning:', err));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Stale-while-revalidate for local app assets
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
