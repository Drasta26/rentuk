// RentUK service worker: keeps a copy of the app's own files so it opens offline.
// It never sees user data (that stays in localStorage) and never contacts other servers.
// Bump VERSION on every release so installed apps pick up the new files.
const VERSION = '2026-11-19.7';
const CACHE = 'rentuk-' + VERSION;
const APP_FILES = [
  './',
  './index.html',
  './style.css',
  './rules.js',
  './lib.js',
  './files.js',
  './script.js',
  './pwa.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/assistant.svg'
];

self.addEventListener('install', event => {
  // New versions take over straight away, so nobody is left on an old copy.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('rentuk-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Online: always fetch the latest file (and refresh the offline copy). Offline or very slow: use the saved copy.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(cache => {
    const saved = () => cache.match(req, { ignoreSearch: true })
      .then(hit => hit || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error()));
    const fresh = fetch(req, { cache: 'no-cache' }).then(res => {
      if (res.ok && res.type === 'basic') cache.put(new Request(req.url.split('?')[0]), res.clone());
      return res;
    });
    const slow = new Promise(r => setTimeout(r, 4000)).then(() => saved());
    return Promise.race([fresh.catch(saved), slow.then(x => x || fresh)]);
  }));
});
