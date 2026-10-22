const CACHE_NAME = 'caldaiafix-offline-v2';

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            const fetchPromise = fetch(event.request).then(networkResponse => {
                // Aggiorna la cache in background con la versione più recente
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, networkResponse.clone());
                });
                return networkResponse;
            }).catch(() => {
                // Se offline e non c'è rete, usa la cache
                return cachedResponse;
            });
            
            // Restituisci subito la cache se esiste, altrimenti aspetta la rete
            return cachedResponse || fetchPromise;
        })
    );
});
