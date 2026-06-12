const CACHE_NAME = 'aria-voice-v8';
const ASSETS = [
    '/',
    '/app',
    '/index.html',
    '/landing.html',
    '/app.js',
    '/manifest.json',
    '/favicon.svg',
    '/logo.svg'
];

// Limpar caches antigos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // API e requisições não-GET sempre vão direto à rede
    if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) {
        return;
    }

    // Network-first para HTML/app.js (evita versões velhas presas no cache)
    const isCore = ['/', '/app', '/index.html', '/landing.html', '/app.js'].includes(url.pathname);
    if (isCore) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Cache-first para demais assets estáticos
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});
