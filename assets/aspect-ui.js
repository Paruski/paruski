let aspectLessons = [];
let aspectItems = [];
const ASPECT_KEY = 'paruski.aspectStudy.v1';

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initAspectUi);
} else {
  initAspectUi();
}

async function initAspectUi() {
  injectAspectStyles();
  const data = await Promise.all([
    fetchJson('content/materials-aspect.json').catch(() => ({ classes: [] })),
    fetchJson('content/lessons.json').catch(() => [])
  ]);
  aspectLessons = data[0].classes || [];
  aspectItems = aspectLessons.flatMap(item => [
    ...(item.v || []).map(value => ({ lesson: item.l, kind: 'vocabulario', value })),
    ...(item.g || []).map(value => ({ lesson: item.l, kind: 'gramática', value }))
  ]);
  mountAspectDashboard();
  mountAspectLearningPanel();
  mountAspectGrammarPanel();
  renderAspectCard();
  bindAspectEvents();
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(path);
  return response.json();
}

function mountAspectDashboard() {
  const dashboard = document.getElementById('dashboard');
  if (!dashboard || document.getElementById('aspectDashboardPanel')) return;
  const panel = document.createElement('section');
  panel.id = 'aspectDashboardPanel';
  panel.className = 'panel';
  panel.innerHTML = '<div class="panel-head"><div><h2>Bloque de aspecto verbal</h2><p class="muted">Suplemento derivado para las clases 61–80: pares aspectuales, contextos y uso del infinitivo.</p></div><button type="button" class="secondary" data-aspect-open="61">Abrir clase 61</button></div><div class="grid cards-4"><article class="card"><div class="value">20</div><div class="label">Clases 61–80</div></article><article class="card"><div class="value">' + aspectItems.length + '</div><div class="label">Items de aspecto</div></article><article class="card"><div class="value">' + studiedCount() + '</div><div class="label">Estudiados</div></article><article class="card"><div class="value">v1</div><div class="label">Suplemento</div></article></div><div id="aspectCardBox"></div>';
  const ref = document.getElementById('materialStudyDeck') || document.getElementById('materialsDashboardPanel') || dashboard.querySelector('.panel');
  dashboard.insertBefore(panel, ref?.nextSibling || null);
}

function mountAspectLearningPanel() {
  const learning = document.getElementById('learning');
  if (!learning || document.getElementById('aspectLearningPanel')) return;
  const panel = document.createElement('section');
  panel.id = 'aspectLearningPanel';
  panel.className = 'panel';
  panel.innerHTML = '<div class="panel-head"><div><h2>Aspecto verbal 61–80</h2><p class="muted">Atajos para estudiar el bloque de aspecto sin navegar clase por clase.</p></div><select id="aspectLessonSelect"></select></div><div id="aspectLessonContent" class="tag-list"></div>';
  learning.appendChild(panel);
  fillAspectSelect();
  const select = panel.querySelector('#aspectLessonSelect');
  select.addEventListener('change', () => renderAspectLesson(Number(select.value)));
  renderAspectLesson(Number(select.value));
}

function mountAspectGrammarPanel() {
  const grammar = document.getElementById('grammar')?.querySelector('.panel');
  if (!grammar || document.getElementById('aspectGrammarPanel')) return;
  const panel = document.createElement('section');
  panel.id = 'aspectGrammarPanel';
  panel.className = 'materials-inline-panel';
  panel.innerHTML = '<div class="materials-inline-head"><h3>Aspecto verbal 61–80</h3><select id="aspectGrammarSelect"></select></div><div id="aspectGrammarChips" class="tag-list"></div>';
  grammar.appendChild(panel);
  fillAspectSelect('aspectGrammarSelect');
  const select = panel.querySelector('#aspectGrammarSelect');
  select.addEventListener('change', () => renderAspectGrammar(Number(select.value)));
  renderAspectGrammar(Number(select.value));
}

function fillAspectSelect(id = 'aspectLessonSelect') {
  const select = document.getElementById(id);
  if (!select) return;
  select.innerHTML = aspectLessons.map(item => '<option value="' + item.l + '">Clase ' + item.l + ' · ' + ((item.v || []).length + (item.g || []).length) + ' item(s)</option>').join('');
}

function renderAspectLesson(lessonId) {
  const box = document.getElementById('aspectLessonContent');
  const item = aspectLessons.find(entry => Number(entry.l) === Number(lessonId));
  if (!box || !item) return;
  box.innerHTML = [...(item.v || []), ...(item.g || [])].map(value => aspectChip(value)).join('');
}

function renderAspectGrammar(lessonId) {
  const box = document.getElementById('aspectGrammarChips');
  const item = aspectLessons.find(entry => Number(entry.l) === Number(lessonId));
  if (!box || !item) return;
  box.innerHTML = (item.g || []).map(value => aspectChip(value)).join('') || '<p class="empty">Sin patrones.</p>';
}

function renderAspectCard() {
  const box = document.getElementById('aspectCardBox');
  if (!box || !aspectItems.length) return;
  const stats = loadAspectStats();
  const next = aspectItems.find(item => !stats[keyOf(item)] || stats[keyOf(item)].due <= today()) || aspectItems[0];
  const record = stats[keyOf(next)] || {};
  box.innerHTML = '<article class="aspect-card"><span class="tag">Clase ' + next.lesson + '</span><span class="tag">' + escapeHtml(next.kind) + '</span><h3>' + escapeHtml(next.value) + '</h3><p class="muted small">Intentos: ' + (record.attempts || 0) + ' · estudiado: ' + (record.known || 0) + '</p><div class="aspect-actions"><button type="button" class="secondary" data-aspect-speak="' + escapeAttr(next.value) + '">Escuchar</button><button type="button" class="secondary" data-aspect-later="' + escapeAttr(keyOf(next)) + '">Repasar luego</button><button type="button" data-aspect-known="' + escapeAttr(keyOf(next)) + '">Lo sé</button><button type="button" class="secondary" data-aspect-open="' + next.lesson + '">Clase</button></div></article>';
}

function bindAspectEvents() {
  document.addEventListener('click', event => {
    const speak = event.target.closest?.('[data-aspect-speak]');
    if (speak) return speakRu(speak.dataset.aspectSpeak);
    const known = event.target.closest?.('[data-aspect-known]');
    if (known) return grade(known.dataset.aspectKnown, true);
    const later = event.target.closest?.('[data-aspect-later]');
    if (later) return grade(later.dataset.aspectLater, false);
    const open = event.target.closest?.('[data-aspect-open]');
    if (open) return openLesson(Number(open.dataset.aspectOpen));
  });
}

function grade(key, known) {
  const stats = loadAspectStats();
  const prev = stats[key] || { attempts: 0, known: 0 };
  stats[key] = { attempts: prev.attempts + 1, known: prev.known + (known ? 1 : 0), due: known ? datePlus(known ? 2 : 0) : today(), last: new Date().toISOString() };
  localStorage.setItem(ASPECT_KEY, JSON.stringify(stats));
  renderAspectCard();
  const count = document.querySelector('#aspectDashboardPanel .card:nth-child(3) .value');
  if (count) count.textContent = studiedCount();
}

function openLesson(lessonId) {
  document.querySelector('[data-view="learning"]')?.click();
  window.setTimeout(() => {
    const select = document.getElementById('learningLessonSelect');
    if (select) { select.value = String(lessonId); select.dispatchEvent(new Event('change')); }
    const aspect = document.getElementById('aspectLessonSelect');
    if (aspect) { aspect.value = String(lessonId); renderAspectLesson(lessonId); }
  }, 120);
}

function aspectChip(value) { return '<button type="button" class="tag material-chip" data-aspect-speak="' + escapeAttr(value) + '">' + escapeHtml(value) + '</button>'; }
function keyOf(item) { return item.lesson + ':' + item.kind + ':' + item.value; }
function loadAspectStats() { try { return JSON.parse(localStorage.getItem(ASPECT_KEY)) || {}; } catch { return {}; } }
function studiedCount() { return Object.values(loadAspectStats()).filter(item => item.known > 0).length; }
function today() { return datePlus(0); }
function datePlus(days) { const d = new Date(); d.setDate(d.getDate() + days); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function speakRu(value) { if (!('speechSynthesis' in window)) return; const u = new SpeechSynthesisUtterance(value); u.lang = 'ru-RU'; u.rate = 0.9; speechSynthesis.cancel(); speechSynthesis.speak(u); }
function injectAspectStyles() { if (document.getElementById('aspectUiStyles')) return; const style = document.createElement('style'); style.id = 'aspectUiStyles'; style.textContent = '.aspect-card{margin-top:1rem;border:1px solid var(--line);border-radius:1rem;padding:1rem;background:rgba(0,0,0,.12)}.aspect-card h3{font-size:1.8rem}.aspect-actions{display:flex;gap:.5rem;flex-wrap:wrap}'; document.head.appendChild(style); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
function escapeAttr(value) { return escapeHtml(value).replace(/'/g, '&#39;'); }
