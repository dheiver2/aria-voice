const CACHE_NAME = 'aria-voice-v3';
const ASSETS = [
    '/',
    '/index-pro.html',
    '/styles-pro.css',
    '/app-pro.js',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});
