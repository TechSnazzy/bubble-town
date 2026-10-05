// Service worker: lets the game run offline once it has been opened online.
// Network first: when online you always get the newest version, and the copy in the
// cache is refreshed. When offline, the cached copy is used.

const CACHE = 'bubble-town';
const CORE = [
  './', 'index.html', 'css/game.css', 'manifest.webmanifest',
  'js/main.js', 'js/engine.js', 'js/generator.js', 'js/rng.js',
  'catalog/catalog.json', 'worlds/town.json',
  'icons/icon.svg', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    // Every image in the catalog, so a fresh install can play offline straight away.
    const catalog = await (await fetch('catalog/catalog.json')).json();
    await cache.addAll(catalog.assets.map(a => a.file));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await fetch(req);
      if (fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch {
      return (await cache.match(req, { ignoreSearch: true })) || Response.error();
    }
  })());
});
