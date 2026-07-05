let drillItems = [];
let drillNotes = [];
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
    fetchJson('content/learning-notes.json').catch(() => ({ notes: [] }))
  ]);
  drillNotes = data[2].notes || [];
  drillItems = [...(data[0].classes || []), ...(data[1].classes || [])].flatMap(entry => [
    ...(entry.v || []).map(value => makeItem(entry.l, 'vocabulario', value)),
    ...(entry.g || []).map(value => makeItem(entry.l, 'patrón', value))
  ]).filter(item => item.value && item.value.length > 1);
  mountDrillsPanel();
  renderNewDrill();
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(path);
  return response.json();
}

function makeItem(lesson, kind, value) {
  const note = drillNotes.find(entry => (entry.lessons || []).map(Number).includes(Number(lesson))) || null;
  return { lesson: Number(lesson), kind, value, note, key: `${lesson}:${kind}:${value}` };
}

function mountDrillsPanel() {
  const review = document.getElementById('review');
  if (!review || document.getElementById('generatedDrillsPanel')) return;
  const panel = document.createElement('section');
  panel.id = 'generatedDrillsPanel';
  panel.className = 'panel';
  panel.innerHTML = '<div class="panel-head"><div><h2>Práctica guiada</h2><p class="muted">Ejercicios para aprender ruso: escuchar, escribir, completar frases y reconocer patrones en ejemplos reales.</p></div><button type="button" id="newGeneratedDrillBtn" class="secondary">Otro ejercicio</button></div><div id="generatedDrillBox"></div>';
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
  const type = chooseDrillType(item);
  drillCurrent = buildDrill(item, type);
  renderDrill(drillCurrent);
}

function chooseDrillType(item) {
  const example = exampleFor(item);
  const weighted = ['listen_write', 'copy_active'];
  if (example && normalize(example).includes(normalize(item.value))) weighted.push('fill_gap', 'listen_example');
  if (example) weighted.push('choose_example');
  if (item.kind === 'patrón' && item.note?.title) weighted.push('pattern_meaning');
  return sample(weighted);
}

function buildDrill(item, type) {
  const example = exampleFor(item);
  if (type === 'listen_write') {
    return { type, item, label: 'escucha-escribe', prompt: 'Escucha y escribe en ruso exactamente lo que oyes.', expected: item.value, input: true, speak: item.value, feedback: contextFor(item) };
  }
  if (type === 'fill_gap' && example) {
    const cloze = makeCloze(example, item.value);
    return { type, item, label: 'completa', prompt: 'Completa la frase rusa.', expected: item.value, input: true, display: cloze, speak: example, feedback: example };
  }
  if (type === 'listen_example' && example) {
    const choices = choiceExamples(example);
    return { type, item, label: 'comprensión auditiva', prompt: 'Escucha y elige la frase que has oído.', expected: example, choices, speak: example, feedback: contextFor(item) };
  }
  if (type === 'choose_example' && example) {
    const choices = choiceExamples(example);
    return { type, item, label: 'reconocimiento', prompt: `Elige el ejemplo que usa “${item.value}”.`, expected: example, choices, feedback: contextFor(item) };
  }
  if (type === 'pattern_meaning' && item.note?.title) {
    const choices = shuffle(unique([item.note.title, ...drillNotes.map(note => note.title).filter(Boolean)])).slice(0, 4);
    if (!choices.includes(item.note.title)) choices[0] = item.note.title;
    return { type, item, label: 'uso del patrón', prompt: `¿Qué idea practica “${item.value}”?`, expected: item.note.title, choices: shuffle(choices), feedback: item.note.definition || contextFor(item) };
  }
  return { type: 'copy_active', item, label: 'copia activa', prompt: 'Copia esta forma rusa prestando atención a cada letra.', expected: item.value, input: true, display: item.value, feedback: contextFor(item) };
}

function renderDrill(drill) {
  const box = document.getElementById('generatedDrillBox');
  if (!box) return;
  const control = drill.choices
    ? '<div class="drill-choices">' + drill.choices.map(choice => '<button type="button" class="secondary drill-choice" data-drill-answer="' + escapeAttr(choice) + '">' + escapeHtml(choice) + '</button>').join('') + '</div>'
    : '<input id="generatedDrillInput" autocomplete="off" placeholder="Escribe en ruso..." />';
  box.innerHTML = '<article class="drill-card"><div class="drill-meta"><span class="tag">' + escapeHtml(drill.item.kind) + '</span><span class="tag">' + escapeHtml(drill.label) + '</span></div><h3>' + escapeHtml(drill.prompt) + '</h3>' + (drill.display ? '<p class="drill-big">' + escapeHtml(drill.display) + '</p>' : '') + '<p class="muted">' + escapeHtml(drill.feedback || '') + '</p>' + control + '<div class="drill-actions">' + (drill.speak ? '<button type="button" id="drillSpeakBtn" class="secondary">Escuchar</button>' : '') + '<button type="button" id="checkGeneratedDrillBtn">Comprobar</button><button type="button" id="skipGeneratedDrillBtn" class="secondary">Saltar</button></div><div id="generatedDrillResult" class="muted"></div></article>';
  box.querySelector('#checkGeneratedDrillBtn')?.addEventListener('click', () => checkDrill());
  box.querySelector('#skipGeneratedDrillBtn')?.addEventListener('click', renderNewDrill);
  box.querySelector('#drillSpeakBtn')?.addEventListener('click', () => speakRu(drill.speak));
  box.querySelector('#generatedDrillInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') checkDrill();
  });
  box.querySelectorAll('.drill-choice').forEach(button => button.addEventListener('click', () => checkDrill(button.dataset.drillAnswer)));
  if (drill.speak && drill.type === 'listen_write') window.setTimeout(() => speakRu(drill.speak), 250);
}

function checkDrill(choiceAnswer) {
  if (!drillCurrent) return;
  const answer = choiceAnswer ?? document.getElementById('generatedDrillInput')?.value ?? '';
  const ok = normalize(answer) === normalize(drillCurrent.expected);
  saveDrillResult(drillCurrent, ok);
  const result = document.getElementById('generatedDrillResult');
  if (result) {
    result.className = ok ? 'result correct' : 'result wrong';
    result.innerHTML = ok
      ? 'Correcto. Repítelo una vez en voz alta.'
      : 'Respuesta esperada: <strong>' + escapeHtml(drillCurrent.expected) + '</strong>' + (drillCurrent.feedback ? '<br><span class="muted">' + escapeHtml(drillCurrent.feedback) + '</span>' : '');
  }
  window.setTimeout(renderNewDrill, ok ? 900 : 2600);
}

function exampleFor(item) {
  const examples = item.note?.examples || [];
  const exact = examples.find(example => normalize(example).includes(normalize(item.value)));
  return exact || examples[0] || '';
}

function contextFor(item) {
  return item.note?.definition || item.note?.title || 'Material de ruso para practicar activamente.';
}

function makeCloze(example, value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'i');
  return example.replace(re, '_____');
}

function choiceExamples(correct) {
  const pool = unique(drillNotes.flatMap(note => note.examples || []).filter(Boolean));
  const wrong = shuffle(pool.filter(example => normalize(example) !== normalize(correct))).slice(0, 3);
  return shuffle([correct, ...wrong]);
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
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function normalize(value) { return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[?.!¿¡,;:«»“”"']/g, ''); }
function injectDrillStyles() { if (document.getElementById('drillUiStyles')) return; const style = document.createElement('style'); style.id = 'drillUiStyles'; style.textContent = '.drill-card{border:1px solid var(--line);border-radius:1rem;padding:1rem;background:rgba(0,0,0,.12)}.drill-meta,.drill-actions,.drill-choices{display:flex;gap:.5rem;flex-wrap:wrap}.drill-big{font-size:2rem;font-weight:800}.drill-card input{width:100%;margin:.5rem 0}.drill-actions{margin-top:.7rem}.drill-choices button{text-align:left}.result.correct{color:#86efac}.result.wrong{color:#fca5a5}'; document.head.appendChild(style); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
function escapeAttr(value) { return escapeHtml(value).replace(/'/g, '&#39;'); }
