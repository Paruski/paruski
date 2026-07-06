const CACHE_NAME = 'paruski-v34';
const ASSETS = [
  './',
  './index.html',
  './favicon.svg',
  './favicon.ico',
  './assets/styles.css',
  './assets/app-shell.css',
  './assets/keyboard.css',
  './assets/audio-bank.js',
  './assets/app.js',
  './assets/core/app-context.js',
  './assets/core/audio.js',
  './assets/core/competency-tagger.js',
  './assets/core/content-store.js',
  './assets/core/event-log.js',
  './assets/core/input-tools.js',
  './assets/core/learner-model.js',
  './assets/core/registry.js',
  './assets/core/scheduler.js',
  './assets/core/storage.js',
  './assets/core/utils.js',
  './assets/features/calendar/index.js',
  './assets/features/guided-session/index.js',
  './assets/features/library/index.js',
  './assets/features/progress/index.js',
  './assets/features/settings/index.js',
  './assets/features/speaking-lab/index.js',
  './assets/features/sync/index.js',
  './assets/exercises/shared.js',
  './assets/exercises/cloze/index.js',
  './assets/exercises/dictation/index.js',
  './assets/exercises/listen-choice/index.js',
  './assets/exercises/multiple-choice/index.js',
  './assets/exercises/production-prompt/index.js',
  './assets/exercises/text-input/index.js',
  './assets/exercises/transform/index.js',
  './content/lessons.json',
  './content/vocabulary.json',
  './content/grammar.json',
  './content/exercises.json',
  './content/competencies.json',
  './content/materials.json',
  './content/materials-aspect.json',
  './content/learning-notes.json',
  './content/guided-path.json',
  './content/paruski-db.json',
  './content/audio-index.json',
  './content/lexical-selection.json',
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
