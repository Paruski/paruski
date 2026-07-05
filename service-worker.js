const CACHE_NAME = 'paruski-v17';
const ASSETS = [
  './',
  './index.html',
  './assets/styles.css',
  './assets/keyboard.css',
  './assets/app.js',
  './assets/github-sync.js',
  './assets/sync-ui.js',
  './assets/sync-ui.css',
  './assets/keyboard.js',
  './assets/advanced.js',
  './assets/learning.js',
  './assets/materials-ui.js',
  './assets/material-study.js',
  './assets/aspect-ui.js',
  './assets/notes-ui.js',
  './assets/drills-ui.js',
  './assets/simple-ui.js',
  './assets/tabs-fix-ui.js',
  './assets/methodology-ui.js',
  './assets/local-user.js',
  './assets/autosave-status-ui.js',
  './assets/tracking-ui.js',
  './content/lessons.json',
  './content/vocabulary.json',
  './content/grammar.json',
  './content/exercises.json',
  './content/materials.json',
  './content/materials-aspect.json',
  './content/learning-notes.json',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
