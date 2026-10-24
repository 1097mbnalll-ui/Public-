// Offline support: app shell + every built file cached on install, network-first for navigation,
// cache-first for assets. The build fills in the file list and version (see vite.config.ts).
const CACHE = 'masar-' + '__VERSION__';
const BUILT = [] /* __PRECACHE__ */;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icon.svg', ...BUILT])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isFont = url.hostname.includes('fonts.g');
  if (!sameOrigin && !isFont) return;
  // data files (course packages…) must always be fresh: network only
  if (sameOrigin && url.pathname.endsWith('.json')) return;

  // pages: the network when online; offline, the index.html cached with this version's own files
  // (never one written by an older worker, which would point at files it doesn't have)
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.open(CACHE).then((c) => c.match('./index.html'))));
    return;
  }
  e.respondWith(
    caches.match(req, { cacheName: CACHE, ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok || res.type === 'opaque') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '#/today';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          return c.focus().then(() => c.postMessage({ type: 'open', url: target }));
        }
      }
      return self.clients.openWindow('./' + target);
    }),
  );
});
