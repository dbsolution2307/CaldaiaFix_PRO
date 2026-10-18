const CACHE_NAME = 'caldaiafix-v7';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './db.js',
  './app.js',
  './manifest.json'
];

// Installazione Service Worker
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

// Attivazione e pulizia vecchie cache
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// Strategia NETWORK-FIRST: cerca prima sul web per avere l'ultimo aggiornamento, se offline usa la cache
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        const resClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, resClone);
        });
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
