let tabMaterials = [];
let tabNotes = [];
let tabRendering = false;

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initTabsFix);
} else {
  initTabsFix();
}

async function initTabsFix() {
  const data = await Promise.all([
    readJson('content/materials.json').catch(() => ({ classes: [] })),
    readJson('content/materials-aspect.json').catch(() => ({ classes: [] })),
    readJson('content/learning-notes.json').catch(() => ({ notes: [] }))
  ]);
  tabMaterials = mergeClasses(data[0].classes || [], data[1].classes || []);
  tabNotes = data[2].notes || [];
  enhanceTabs();
  document.getElementById('vocabSearch')?.addEventListener('input', () => renderVocabularyTab());
  document.getElementById('grammarSearch')?.addEventListener('input', () => renderGrammarTab());
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => window.setTimeout(enhanceTabs, 50)));
  const vocabularyBox = document.getElementById('vocabTable');
  const grammarBox = document.getElementById('grammarList');
  if (vocabularyBox) new MutationObserver(() => { if (!tabRendering) renderVocabularyTab(); }).observe(vocabularyBox, { childList: true });
  if (grammarBox) new MutationObserver(() => { if (!tabRendering) renderGrammarTab(); }).observe(grammarBox, { childList: true });
}

async function readJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(path);
  return response.json();
}

function mergeClasses(base, extra) {
  const map = new Map();
  [...base, ...extra].forEach(item => {
    const id = Number(item.l);
    const current = map.get(id) || { l: id, v: [], g: [] };
    current.v = unique([...(current.v || []), ...(item.v || [])]);
    current.g = unique([...(current.g || []), ...(item.g || [])]);
    map.set(id, current);
  });
  return [...map.values()].sort((a, b) => a.l - b.l);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function enhanceTabs() {
  renderVocabularyTab();
  renderGrammarTab();
}

function renderVocabularyTab() {
  const box = document.getElementById('vocabTable');
  if (!box || !tabMaterials.length) return;
  const query = normalize(document.getElementById('vocabSearch')?.value || '');
  const rows = tabMaterials.flatMap(item => (item.v || []).map(value => ({ lesson: item.l, russian: value, note: noteForLesson(item.l) })))
    .filter(row => normalize([row.lesson, row.russian, row.note?.title, row.note?.definition].join(' ')).includes(query));
  tabRendering = true;
  box.innerHTML = '<table data-derived-tab="vocabulary"><thead><tr><th>Clase</th><th>Ruso</th><th>Uso</th><th>Ejemplo</th><th>Escuchar</th></tr></thead><tbody>' + rows.map(row => '<tr><td>' + row.lesson + '</td><td><strong>' + safe(row.russian) + '</strong></td><td>' + safe(row.note?.title || 'Material de clase') + '<br><span class="muted">' + safe((row.note?.definition || '').slice(0, 120)) + '</span></td><td>' + safe(exampleFor(row.russian, row.lesson)) + '</td><td><button type="button" class="secondary" data-tab-speak="' + attr(row.russian) + '">Escuchar</button></td></tr>').join('') + '</tbody></table>';
  tabRendering = false;
  bindSpeakButtons(box);
}

function renderGrammarTab() {
  const box = document.getElementById('grammarList');
  if (!box || !tabMaterials.length) return;
  const query = normalize(document.getElementById('grammarSearch')?.value || '');
  const rules = tabMaterials.flatMap(item => (item.g || []).map(value => ({ lesson: item.l, rule: value, note: noteForLesson(item.l) })))
    .filter(row => normalize([row.lesson, row.rule, row.note?.title, row.note?.definition].join(' ')).includes(query));
  tabRendering = true;
  box.innerHTML = rules.map(row => '<article class="lesson-card" data-derived-tab="grammar"><div class="lesson-card-head"><span class="lesson-number">Clase ' + row.lesson + '</span><span class="tag">derivado</span></div><h3>' + safe(row.rule) + '</h3><p>' + safe(row.note?.definition || 'Patrón gramatical de esta clase.') + '</p><ul>' + (row.note?.examples || []).slice(0, 3).map(example => '<li><button type="button" class="note-speak" data-tab-speak="' + attr(example) + '">' + safe(example) + '</button></li>').join('') + '</ul><p class="muted">Consejo: ' + safe((row.note?.tips || ['Practica primero reconociendo el patrón y después produciendo una frase propia.'])[0]) + '</p></article>').join('') || '<p class="empty">Sin resultados.</p>';
  tabRendering = false;
  bindSpeakButtons(box);
}

function noteForLesson(lesson) {
  return tabNotes.find(note => (note.lessons || []).map(Number).includes(Number(lesson)));
}

function exampleFor(value, lesson) {
  const note = noteForLesson(lesson);
  const exact = (note?.examples || []).find(example => normalize(example).includes(normalize(value)));
  return exact || (note?.examples || [])[0] || '';
}

function bindSpeakButtons(root) {
  root.querySelectorAll('[data-tab-speak]').forEach(button => button.onclick = () => speak(button.dataset.tabSpeak));
}

function speak(value) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(value);
  u.lang = 'ru-RU';
  u.rate = 0.9;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function safe(value) { return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
function attr(value) { return safe(value).replace(/'/g, '&#39;'); }
