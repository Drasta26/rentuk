// RentUK service worker: keeps a copy of the app's own files so it opens offline.
// It never sees user data (that stays in localStorage) and never contacts other servers.
// Bump VERSION on every release so installed apps pick up the new files.
const VERSION = '2026-11-04.1';
const CACHE = 'rentuk-' + VERSION;
const APP_FILES = [
  './',
  './index.html',
  './style.css',
  './lib.js',
  './script.js',
  './pwa.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_FILES)));
  // No skipWaiting here: the page asks the user first ("New version available").
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

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(cache =>
      // ignoreSearch so index.html?demo opens offline too
      cache.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).catch(() =>
        req.mode === 'navigate' ? cache.match('./index.html') : Response.error()
      ))
    )
  );
});
