let learningLessons = [];
let learningMaterials = [];

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initLearning);
} else {
  initLearning();
}

async function initLearning() {
  addLearningTab();
  const data = await Promise.all([
    loadJson('content/lessons.json'),
    loadJson('content/materials.json').catch(() => ({ classes: [] }))
  ]);
  learningLessons = data[0];
  learningMaterials = data[1].classes || [];
  renderLearningPicker();
  renderLearningLesson(learningLessons[0]?.id || 1);
}

function addLearningTab() {
  if (document.getElementById('learning')) return;
  const tabs = document.querySelector('.tabs');
  const main = document.querySelector('main');
  if (!tabs || !main) return;
  const tab = document.createElement('button');
  tab.className = 'tab';
  tab.dataset.view = 'learning';
  tab.textContent = 'Aprender';
  tab.addEventListener('click', () => showLearning());
  const lessonsTab = document.querySelector('[data-view="lessons"]');
  tabs.insertBefore(tab, lessonsTab?.nextSibling || null);
  const section = document.createElement('section');
  section.id = 'learning';
  section.className = 'view';
  section.innerHTML = '<div class="panel"><div class="panel-head"><div><h2>Aprender por clase</h2><p class="muted">Contenido ruso de estudio antes de practicar.</p></div><select id="learningLessonSelect"></select></div><div id="learningLessonContent" class="stack"></div></div>';
  const lessons = document.getElementById('lessons');
  main.insertBefore(section, lessons?.nextSibling || null);
}

function showLearning() {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.view === 'learning'));
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === 'learning'));
}

async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(path);
  return response.json();
}

function renderLearningPicker() {
  const select = document.getElementById('learningLessonSelect');
  if (!select) return;
  select.innerHTML = learningLessons.map(lesson => '<option value="' + lesson.id + '">Clase ' + String(lesson.id).padStart(2, '0') + ': ' + escapeHtml(lesson.title) + '</option>').join('');
  select.addEventListener('change', () => renderLearningLesson(Number(select.value)));
}

function renderLearningLesson(id) {
  const lesson = learningLessons.find(item => Number(item.id) === Number(id));
  const material = learningMaterials.find(item => Number(item.l) === Number(id)) || { v: [], g: [] };
  const box = document.getElementById('learningLessonContent');
  if (!lesson || !box) return;
  const vocabHtml = material.v && material.v.length ? '<div class="tag-list">' + material.v.map(renderTag).join('') + '</div>' : '<p class="empty">Sin vocabulario ruso estructurado todavía.</p>';
  const grammarHtml = material.g && material.g.length ? '<div class="tag-list">' + material.g.map(renderTag).join('') + '</div>' : '<p class="empty">Sin patrones gramaticales estructurados todavía.</p>';
  box.innerHTML = '<article class="lesson-card"><span class="lesson-number">Clase ' + String(lesson.id).padStart(2, '0') + '</span><h3>' + escapeHtml(lesson.title) + '</h3><p>' + escapeHtml(lesson.summary) + '</p></article><article class="lesson-card"><h3>Vocabulario ruso</h3>' + vocabHtml + '</article><article class="lesson-card"><h3>Gramática y patrones</h3>' + grammarHtml + '</article>';
}

function renderTag(value) {
  return '<span class="tag">' + escapeHtml(value) + '</span>';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, function(ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; });
}
