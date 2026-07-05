let tabMaterials = [];
let tabNotes = [];
let vocabOffset = 0;
let grammarOffset = 0;

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
  installGuidedHandlers();
  renderVocabularyTab();
  renderGrammarTab();
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

function installGuidedHandlers() {
  document.getElementById('vocabSearch')?.addEventListener('input', () => { vocabOffset = 0; renderVocabularyTab(); });
  document.getElementById('grammarSearch')?.addEventListener('input', () => { grammarOffset = 0; renderGrammarTab(); });
  document.addEventListener('click', event => {
    const tab = event.target.closest?.('.tab');
    if (tab?.dataset.view === 'vocabulary') window.setTimeout(renderVocabularyTab, 0);
    if (tab?.dataset.view === 'grammar') window.setTimeout(renderGrammarTab, 0);
    const speak = event.target.closest?.('[data-guided-speak]');
    if (speak) speakRussian(speak.dataset.guidedSpeak);
    const nextVocab = event.target.closest?.('#guidedNextVocab');
    if (nextVocab) { vocabOffset += 12; renderVocabularyTab(); }
    const nextGrammar = event.target.closest?.('#guidedNextGrammar');
    if (nextGrammar) { grammarOffset += 6; renderGrammarTab(); }
    const practice = event.target.closest?.('[data-guided-practice]');
    if (practice) document.querySelector('[data-view="review"]')?.click();
  });
}

function vocabItems() {
  return tabMaterials.flatMap(entry => (entry.v || []).map(value => ({ lesson: entry.l, value, note: noteForLesson(entry.l) })));
}

function grammarItems() {
  return tabMaterials.flatMap(entry => (entry.g || []).map(value => ({ lesson: entry.l, value, note: noteForLesson(entry.l) })));
}

function visibleItems(items, query, offset, limit) {
  const q = normalize(query);
  const filtered = q ? items.filter(item => normalize([item.value, item.note?.title, item.note?.definition, ...(item.note?.examples || [])].join(' ')).includes(q)) : items;
  return filtered.slice(offset, offset + limit);
}

function renderVocabularyTab() {
  const box = document.getElementById('vocabTable');
  if (!box || !tabMaterials.length) return;
  const query = document.getElementById('vocabSearch')?.value || '';
  const items = visibleItems(vocabItems(), query, vocabOffset, 12);
  box.innerHTML = '<section class="guided-panel"><div class="guided-intro"><div><h3>Vocabulario para usar ahora</h3><p class="muted">Lee, escucha, repite en voz alta y usa una palabra en una frase. No hace falta elegir números de clase.</p></div><button type="button" id="guidedNextVocab" class="secondary">Más vocabulario</button></div><div class="guided-grid">' + (items.length ? items.map(renderVocabCard).join('') : '<p class="empty">No hay resultados. Prueba otra búsqueda.</p>') + '</div><div class="guided-footer"><button type="button" data-guided-practice="vocabulario">Practicar ahora</button></div></section>';
}

function renderGrammarTab() {
  const box = document.getElementById('grammarList');
  if (!box || !tabMaterials.length) return;
  const query = document.getElementById('grammarSearch')?.value || '';
  const items = visibleItems(grammarItems(), query, grammarOffset, 6);
  box.innerHTML = '<section class="guided-panel"><div class="guided-intro"><div><h3>Patrones para entender y producir ruso</h3><p class="muted">Observa el patrón, escucha el ejemplo y luego produce una frase propia. La gramática aquí sirve para hablar y escribir.</p></div><button type="button" id="guidedNextGrammar" class="secondary">Más patrones</button></div><div class="guided-stack">' + (items.length ? items.map(renderGrammarCard).join('') : '<p class="empty">No hay resultados. Prueba otra búsqueda.</p>') + '</div><div class="guided-footer"><button type="button" data-guided-practice="gramatica">Practicar ahora</button></div></section>';
}

function renderVocabCard(item) {
  const example = exampleFor(item.value, item.lesson);
  return '<article class="guided-card"><span class="tag">vocabulario</span><h3>' + safe(item.value) + '</h3><p>' + safe(item.note?.title || 'Material útil del curso') + '</p>' + (example ? '<p class="example">' + safe(example) + '</p>' : '') + '<div class="guided-actions"><button type="button" class="secondary" data-guided-speak="' + attr(item.value) + '">Escuchar</button>' + (example ? '<button type="button" class="secondary" data-guided-speak="' + attr(example) + '">Escuchar ejemplo</button>' : '') + '</div></article>';
}

function renderGrammarCard(item) {
  const note = item.note;
  const examples = (note?.examples || []).slice(0, 3);
  return '<article class="guided-card wide"><span class="tag">patrón</span><h3>' + safe(item.value) + '</h3><p>' + safe(note?.definition || 'Patrón gramatical para reconocer y producir ruso.') + '</p>' + (examples.length ? '<ul>' + examples.map(example => '<li><button type="button" class="note-speak" data-guided-speak="' + attr(example) + '">' + safe(example) + '</button></li>').join('') + '</ul>' : '') + '<p class="muted">' + safe((note?.tips || ['Intenta crear una frase propia con este patrón.'])[0]) + '</p></article>';
}

function noteForLesson(lesson) {
  return tabNotes.find(note => (note.lessons || []).map(Number).includes(Number(lesson)));
}

function exampleFor(value, lesson) {
  const note = noteForLesson(lesson);
  const exact = (note?.examples || []).find(example => normalize(example).includes(normalize(value)));
  return exact || (note?.examples || [])[0] || '';
}

function speakRussian(value) {
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

if (!document.getElementById('guidedTabsStyles')) {
  const style = document.createElement('style');
  style.id = 'guidedTabsStyles';
  style.textContent = '.guided-panel{display:grid;gap:1rem}.guided-intro{display:flex;align-items:center;justify-content:space-between;gap:1rem}.guided-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:.8rem}.guided-stack{display:grid;gap:.8rem}.guided-card{border:1px solid var(--line);border-radius:1rem;padding:1rem;background:rgba(255,255,255,.03)}.guided-card h3{font-size:1.4rem}.guided-card.wide h3{font-size:1.2rem}.guided-actions,.guided-footer{display:flex;gap:.5rem;flex-wrap:wrap}.example{font-size:1.05rem}.note-speak{background:transparent;border:0;color:var(--text);padding:0;text-align:left;cursor:pointer}.note-speak:hover{text-decoration:underline}@media(max-width:760px){.guided-intro{align-items:flex-start;flex-direction:column}}';
  document.head.appendChild(style);
}
