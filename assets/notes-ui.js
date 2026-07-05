let paruskiNotes = [];

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initNotesUi);
} else {
  initNotesUi();
}

async function initNotesUi() {
  injectNotesStyles();
  const data = await fetchJson('content/learning-notes.json').catch(() => ({ notes: [] }));
  paruskiNotes = data.notes || [];
  mountNotesHome();
  mountNotesLearning();
  mountNotesGrammar();
  bindNotesEvents();
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(path);
  return response.json();
}

function mountNotesHome() {
  const dashboard = document.getElementById('dashboard');
  if (!dashboard || document.getElementById('notesHomePanel')) return;
  const panel = document.createElement('section');
  panel.id = 'notesHomePanel';
  panel.className = 'panel';
  panel.innerHTML = '<div class="panel-head"><div><h2>Explicaciones rápidas</h2><p class="muted">Definiciones, ejemplos y consejos por bloque del curso.</p></div><input id="notesSearchInput" type="search" placeholder="Buscar: acusativo, aspecto, где..." /></div><div id="notesHomeList" class="notes-grid"></div>';
  const ref = document.getElementById('materialsDashboardPanel') || dashboard.querySelector('.panel');
  dashboard.insertBefore(panel, ref?.nextSibling || null);
  panel.querySelector('#notesSearchInput')?.addEventListener('input', event => renderNotesList('notesHomeList', event.target.value, 8));
  renderNotesList('notesHomeList', '', 8);
}

function mountNotesLearning() {
  const learning = document.getElementById('learning');
  if (!learning || document.getElementById('notesLearningPanel')) return;
  const panel = document.createElement('section');
  panel.id = 'notesLearningPanel';
  panel.className = 'panel';
  panel.innerHTML = '<div class="panel-head"><div><h2>Definiciones y ejemplos</h2><p class="muted">Elige una clase para ver las notas relacionadas.</p></div><select id="notesLessonSelect"></select></div><div id="notesLessonList" class="notes-grid"></div>';
  learning.appendChild(panel);
  fillLessonSelect();
  const select = panel.querySelector('#notesLessonSelect');
  select.addEventListener('change', () => renderNotesForLesson(Number(select.value)));
  renderNotesForLesson(Number(select.value || 1));
}

function mountNotesGrammar() {
  const grammar = document.getElementById('grammar')?.querySelector('.panel');
  if (!grammar || document.getElementById('notesGrammarPanel')) return;
  const panel = document.createElement('section');
  panel.id = 'notesGrammarPanel';
  panel.className = 'materials-inline-panel';
  panel.innerHTML = '<div class="materials-inline-head"><h3>Explicaciones gramaticales</h3><input id="notesGrammarSearch" type="search" placeholder="Buscar explicación..." /></div><div id="notesGrammarList" class="notes-grid"></div>';
  grammar.appendChild(panel);
  panel.querySelector('#notesGrammarSearch')?.addEventListener('input', event => renderNotesList('notesGrammarList', event.target.value, 20));
  renderNotesList('notesGrammarList', '', 20);
}

function fillLessonSelect() {
  const select = document.getElementById('notesLessonSelect');
  if (!select) return;
  const lessons = [...new Set(paruskiNotes.flatMap(note => note.lessons || []))].sort((a, b) => a - b);
  select.innerHTML = lessons.map(lesson => '<option value="' + lesson + '">Clase ' + String(lesson).padStart(2, '0') + '</option>').join('');
}

function renderNotesForLesson(lessonId) {
  const notes = paruskiNotes.filter(note => (note.lessons || []).map(Number).includes(Number(lessonId)));
  renderNotes('notesLessonList', notes, 12);
}

function renderNotesList(targetId, query, limit) {
  const q = normalize(query);
  const notes = q ? paruskiNotes.filter(note => normalize([note.title, note.definition, ...(note.examples || []), ...(note.tips || [])].join(' ')).includes(q)) : paruskiNotes;
  renderNotes(targetId, notes, limit);
}

function renderNotes(targetId, notes, limit) {
  const box = document.getElementById(targetId);
  if (!box) return;
  const list = notes.slice(0, limit);
  box.innerHTML = list.length ? list.map(renderNote).join('') : '<p class="empty">No hay explicaciones para esa búsqueda.</p>';
}

function renderNote(note) {
  const examples = (note.examples || []).slice(0, 4).map(example => '<li><button type="button" class="note-speak" data-note-speak="' + escapeAttr(example) + '">' + escapeHtml(example) + '</button></li>').join('');
  const tips = (note.tips || []).slice(0, 3).map(tip => '<li>' + escapeHtml(tip) + '</li>').join('');
  return '<article class="note-card"><div class="note-head"><span class="tag">Clase(s) ' + escapeHtml((note.lessons || []).join(', ')) + '</span><button type="button" class="secondary note-open" data-note-lesson="' + (note.lessons?.[0] || 1) + '">Abrir</button></div><h3>' + escapeHtml(note.title) + '</h3><p>' + escapeHtml(note.definition) + '</p><h4>Ejemplos</h4><ul>' + examples + '</ul><h4>Consejos</h4><ul>' + tips + '</ul></article>';
}

function bindNotesEvents() {
  document.addEventListener('click', event => {
    const speak = event.target.closest?.('[data-note-speak]');
    if (speak) return speakRu(speak.dataset.noteSpeak);
    const open = event.target.closest?.('.note-open');
    if (open) return openLearningLesson(Number(open.dataset.noteLesson));
  });
}

function openLearningLesson(lessonId) {
  document.querySelector('[data-view="learning"]')?.click();
  window.setTimeout(() => {
    const select = document.getElementById('learningLessonSelect');
    if (select) { select.value = String(lessonId); select.dispatchEvent(new Event('change')); }
    const notesSelect = document.getElementById('notesLessonSelect');
    if (notesSelect) { notesSelect.value = String(lessonId); renderNotesForLesson(lessonId); }
  }, 120);
}

function speakRu(value) {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(value);
  utterance.lang = 'ru-RU';
  utterance.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function injectNotesStyles() {
  if (document.getElementById('notesUiStyles')) return;
  const style = document.createElement('style');
  style.id = 'notesUiStyles';
  style.textContent = '.notes-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:.8rem}.note-card{border:1px solid var(--line);border-radius:1rem;padding:1rem;background:rgba(0,0,0,.12)}.note-card h4{margin:.7rem 0 .3rem;color:var(--muted)}.note-card ul{margin:.2rem 0 0;padding-left:1.1rem}.note-head{display:flex;align-items:center;justify-content:space-between;gap:.5rem}.note-speak{background:transparent;border:0;color:var(--text);padding:.1rem 0;text-align:left;cursor:pointer}.note-speak:hover{text-decoration:underline}.panel-head input{max-width:26rem;width:100%}@media(max-width:720px){.note-head{align-items:flex-start;flex-direction:column}}';
  document.head.appendChild(style);
}

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}
