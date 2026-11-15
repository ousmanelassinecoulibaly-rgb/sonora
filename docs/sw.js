// Service worker minimal : rend Sonora installable et affiche l'interface même si le réseau est lent.
// Stratégie « réseau d'abord » : on sert toujours la dernière version, le cache n'est qu'un secours.
const CACHE = 'sonora-shell-mwi7dofo';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'favicon.svg', 'manifest.webmanifest', 'icons/icon-192.png'];
const OPTIONAL = ['config.js', 'recommender.js', 'backend.js', 'seed-library.json']; // version en ligne uniquement

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL).then(() => Promise.all(OPTIONAL.map((u) => c.add(u).catch(() => {})))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Uniquement l'interface de Sonora (pas l'API, pas la musique, pas les autres sites)
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./')))
  );
});
