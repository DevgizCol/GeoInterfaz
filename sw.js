// GeoInterfaz · service worker (resiliencia offline para sustentación y defensa)
// Estrategia Network-First: con conexión se obtiene siempre la última versión.
// Sin conexión, se recurre a la caché local incluyendo librerías del visor.
const CACHE_NAME = 'geointerfaz-v6';
const CDN_HOSTS = ['unpkg.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isLocal = url.origin === location.origin;
  const isWhitelistedCdn = CDN_HOSTS.some((h) => url.hostname.includes(h));
  if (!isLocal && !isWhitelistedCdn) return;

  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.status === 200 && !req.url.includes('/descargas/')) {
        const copia = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copia));
      }
      return res;
    }).catch(() => caches.match(req))
  );
});

