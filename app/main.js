// Arranque y enrutado.

import { $, clear, h } from './util.js';
import { store } from './store.js';
import { viewHome, viewUnit, viewPractice, viewExam, viewReview, viewVocabulary, viewProgress } from './views.js';

const root = $('#main');

const ROUTES = [
  [/^#?\/?$/, () => viewHome(root)],
  [/^#\/u\/(\d+)$/, (m) => viewUnit(root, Number(m[1]))],
  [/^#\/u\/(\d+)\/practica$/, (m) => viewPractice(root, Number(m[1]))],
  [/^#\/u\/(\d+)\/examen$/, (m) => viewExam(root, Number(m[1]))],
  [/^#\/repaso$/, () => viewReview(root)],
  [/^#\/vocabulario$/, () => viewVocabulary(root)],
  [/^#\/progreso$/, () => viewProgress(root)],
];

async function route() {
  const hash = location.hash || '#/';
  for (const [pattern, handler] of ROUTES) {
    const match = hash.match(pattern);
    if (!match) continue;
    clear(root).append(h('p', { class: 'loading' }, 'Cargando…'));
    try {
      await handler(match);
    } catch (error) {
      console.error(error);
      clear(root).append(h('div', { class: 'card' },
        h('h2', {}, 'No se ha podido cargar esta pantalla'),
        h('p', { class: 'muted' }, String(error.message || error)),
        h('a', { class: 'btn primary', href: '#/' }, 'Volver al inicio')));
    }
    markNav(hash);
    root.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    return;
  }
  location.hash = '#/';
}

function markNav(hash) {
  for (const link of document.querySelectorAll('.mainnav a')) {
    const target = link.getAttribute('href');
    const active = target === '#/' ? /^#\/(u\/\d+)?$/.test(hash) || hash === '#/' : hash.startsWith(target);
    link.classList.toggle('active', active);
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  store.setSetting('theme', theme);
}

$('#themeToggle').addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
});

applyTheme(store.settings.theme || 'dark');
window.addEventListener('hashchange', route);
route();
