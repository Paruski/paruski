let drillItems = [];
let drillCurrent = null;
const DRILL_KEY = 'paruski.generatedDrills.v1';

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initGeneratedDrills);
} else {
  initGeneratedDrills();
}

async function initGeneratedDrills() {
  injectDrillStyles();
  const data = await Promise.all([
    fetchJson('content/materials.json').catch(() => ({ classes: [] })),
    fetchJson('content/materials-aspect.json').catch(() => ({ classes: [] })),
    fetchJson('content/lessons.json').catch(() => [])
  ]);
  const lessons = data[2] || [];
  drillItems = [...(data[0].classes || []), ...(data[1].classes || [])].flatMap(entry => [
    ...(entry.v || []).map(value => makeItem(entry.l, 'vocabulario', value, lessons)),
    ...(entry.g || []).map(value => makeItem(entry.l, 'gramática', value, lessons))
  ]);
  mountDrillsPanel();
  renderNewDrill();
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(path);
  return response.json();
}

function makeItem(lesson, kind, value, lessons) {
  const title = lessons.find(item => Number(item.id) === Number(lesson))?.title || '';
  return { lesson: Number(lesson), kind, value, title, key: `${lesson}:${kind}:${value}` };
}

function mountDrillsPanel() {
  const review = document.getElementById('review');
  if (!review || document.getElementById('generatedDrillsPanel')) return;
  const panel = document.createElement('section');
  panel.id = 'generatedDrillsPanel';
  panel.className = 'panel';
  panel.innerHTML = '<div class="panel-head"><div><h2>Práctica rápida generada</h2><p class="muted">Ejercicios ilimitados desde el material del curso: copia activa, escucha, clasificación y selección por clase.</p></div><button type="button" id="newGeneratedDrillBtn" class="secondary">Nuevo</button></div><div id="generatedDrillBox"></div>';
  review.prepend(panel);
  panel.querySelector('#newGeneratedDrillBtn')?.addEventListener('click', renderNewDrill);
}

function renderNewDrill() {
  const box = document.getElementById('generatedDrillBox');
  if (!box) return;
  if (!drillItems.length) {
    box.innerHTML = '<p class="empty">No hay materiales para generar ejercicios.</p>';
    return;
  }
  const due = dueItems();
  const item = sample(due.length ? due : drillItems);
  const type = sample(['copy','listen','kind','lesson','recognition']);
  drillCurrent = buildDrill(item, type);
  renderDrill(drillCurrent);
}

function buildDrill(item, type) {
  if (type === 'listen') {
    return { type, item, prompt: 'Escucha y escribe el ruso que oyes.', expected: item.value, input: true, speak: true };
  }
  if (type === 'kind') {
    return { type, item, prompt: `Clasifica: “${item.value}”`, expected: item.kind, choices: ['vocabulario','gramática'] };
  }
  if (type === 'lesson') {
    const wrong = shuffle([...new Set(drillItems.map(entry => entry.lesson).filter(lesson => lesson !== item.lesson))]).slice(0, 3);
    return { type, item, prompt: `¿A qué clase pertenece “${item.value}”?`, expected: String(item.lesson), choices: shuffle([item.lesson, ...wrong]).map(String) };
  }
  if (type === 'recognition') {
    const wrong = shuffle(drillItems.filter(entry => entry.value !== item.value)).slice(0, 3).map(entry => entry.value);
    return { type, item, prompt: `Elige el elemento ruso de la clase ${String(item.lesson).padStart(2, '0')}.`, expected: item.value, choices: shuffle([item.value, ...wrong]) };
  }
  return { type: 'copy', item, prompt: 'Copia activamente este material ruso.', expected: item.value, input: true, showExpected: true };
}

function renderDrill(drill) {
  const box = document.getElementById('generatedDrillBox');
  if (!box) return;
  const control = drill.choices
    ? '<div class="drill-choices">' + drill.choices.map(choice => '<button type="button" class="secondary drill-choice" data-drill-answer="' + escapeAttr(choice) + '">' + escapeHtml(choice) + '</button>').join('') + '</div>'
    : '<input id="generatedDrillInput" autocomplete="off" placeholder="Escribe la respuesta..." />';
  box.innerHTML = '<article class="drill-card"><div class="drill-meta"><span class="tag">Clase ' + String(drill.item.lesson).padStart(2, '0') + '</span><span class="tag">' + escapeHtml(drill.item.kind) + '</span><span class="tag">' + escapeHtml(drill.type) + '</span></div><h3>' + escapeHtml(drill.prompt) + '</h3>' + (drill.showExpected ? '<p class="drill-big">' + escapeHtml(drill.expected) + '</p>' : '') + '<p class="muted">' + escapeHtml(drill.item.title || '') + '</p>' + control + '<div class="drill-actions">' + (drill.speak ? '<button type="button" id="drillSpeakBtn" class="secondary">Escuchar</button>' : '') + '<button type="button" id="checkGeneratedDrillBtn">Comprobar</button><button type="button" id="skipGeneratedDrillBtn" class="secondary">Saltar</button></div><div id="generatedDrillResult" class="muted"></div></article>';
  box.querySelector('#checkGeneratedDrillBtn')?.addEventListener('click', () => checkDrill());
  box.querySelector('#skipGeneratedDrillBtn')?.addEventListener('click', renderNewDrill);
  box.querySelector('#drillSpeakBtn')?.addEventListener('click', () => speakRu(drill.expected));
  box.querySelector('#generatedDrillInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') checkDrill();
  });
  box.querySelectorAll('.drill-choice').forEach(button => button.addEventListener('click', () => checkDrill(button.dataset.drillAnswer)));
  if (drill.speak) speakRu(drill.expected);
}

function checkDrill(choiceAnswer) {
  if (!drillCurrent) return;
  const answer = choiceAnswer ?? document.getElementById('generatedDrillInput')?.value ?? '';
  const ok = normalize(answer) === normalize(drillCurrent.expected);
  saveDrillResult(drillCurrent, ok);
  const result = document.getElementById('generatedDrillResult');
  if (result) {
    result.className = ok ? 'result correct' : 'result wrong';
    result.textContent = ok ? 'Correcto.' : `Respuesta esperada: ${drillCurrent.expected}`;
  }
  window.setTimeout(renderNewDrill, ok ? 700 : 1400);
}

function dueItems() {
  const stats = loadStats();
  const today = dateKey(new Date());
  return drillItems.filter(item => !stats[item.key] || !stats[item.key].due || stats[item.key].due <= today);
}

function saveDrillResult(drill, ok) {
  const stats = loadStats();
  const previous = stats[drill.item.key] || { attempts: 0, correct: 0, wrong: 0, interval: 0 };
  const interval = ok ? Math.max(1, Math.round((previous.interval || 1) * 2.1)) : 0;
  stats[drill.item.key] = {
    attempts: previous.attempts + 1,
    correct: previous.correct + (ok ? 1 : 0),
    wrong: previous.wrong + (ok ? 0 : 1),
    interval,
    due: dateKey(addDays(new Date(), interval)),
    last_type: drill.type,
    last: new Date().toISOString()
  };
  localStorage.setItem(DRILL_KEY, JSON.stringify(stats));
}

function loadStats() {
  try { return JSON.parse(localStorage.getItem(DRILL_KEY)) || {}; } catch { return {}; }
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  next.setHours(0,0,0,0);
  return next;
}

function dateKey(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function speakRu(value) {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(value);
  utterance.lang = 'ru-RU';
  utterance.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function sample(values) { return values[Math.floor(Math.random() * values.length)]; }
function shuffle(values) { return [...values].sort(() => Math.random() - 0.5); }
function normalize(value) { return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[?.!¿¡,;:]/g, ''); }
function injectDrillStyles() { if (document.getElementById('drillUiStyles')) return; const style = document.createElement('style'); style.id = 'drillUiStyles'; style.textContent = '.drill-card{border:1px solid var(--line);border-radius:1rem;padding:1rem;background:rgba(0,0,0,.12)}.drill-meta,.drill-actions,.drill-choices{display:flex;gap:.5rem;flex-wrap:wrap}.drill-big{font-size:2rem;font-weight:800}.drill-card input{width:100%;margin:.5rem 0}.drill-actions{margin-top:.7rem}'; document.head.appendChild(style); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
function escapeAttr(value) { return escapeHtml(value).replace(/'/g, '&#39;'); }
