let paruskiMaterials = [];
let paruskiLessons = [];

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initMaterialsUi);
} else {
  initMaterialsUi();
}

async function initMaterialsUi() {
  injectMaterialsStyles();
  const data = await Promise.all([
    fetchJson('content/materials.json').catch(() => ({ classes: [] })),
    fetchJson('content/lessons.json').catch(() => [])
  ]);
  paruskiMaterials = data[0].classes || [];
  paruskiLessons = data[1] || [];
  mountDashboardMaterials();
  mountVocabularyMaterials();
  mountGrammarMaterials();
  patchLessonCards();
  new MutationObserver(patchLessonCards).observe(document.body, { childList: true, subtree: true });
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(path);
  return response.json();
}

function mountDashboardMaterials() {
  const dashboard = document.getElementById('dashboard');
  if (!dashboard || document.getElementById('materialsDashboardPanel')) return;
  const totalWords = paruskiMaterials.reduce((sum, item) => sum + (item.v || []).length, 0);
  const totalPatterns = paruskiMaterials.reduce((sum, item) => sum + (item.g || []).length, 0);
  const filledLessons = paruskiMaterials.filter(item => (item.v || []).length || (item.g || []).length).length;
  const panel = document.createElement('section');
  panel.id = 'materialsDashboardPanel';
  panel.className = 'panel';
  panel.innerHTML = '<div class="panel-head"><div><h2>Materiales del curso</h2><p class="muted">Vocabulario y patrones rusos extraídos como material de estudio, sin transcripciones.</p></div><button type="button" class="secondary" id="openLearningFromHome">Abrir Aprender</button></div><div class="grid cards-4"><article class="card"><div class="value">' + filledLessons + '</div><div class="label">Clases con material</div></article><article class="card"><div class="value">' + totalWords + '</div><div class="label">Items rusos</div></article><article class="card"><div class="value">' + totalPatterns + '</div><div class="label">Patrones</div></article><article class="card"><div class="value">80</div><div class="label">Clases previstas</div></article></div>';
  const firstPanel = dashboard.querySelector('.panel');
  dashboard.insertBefore(panel, firstPanel || null);
  panel.querySelector('#openLearningFromHome')?.addEventListener('click', () => openLearningLesson(firstLessonWithMaterials()));
}

function mountVocabularyMaterials() {
  const view = document.getElementById('vocabulary');
  const panel = view?.querySelector('.panel');
  if (!panel || document.getElementById('materialsVocabPanel')) return;
  const box = document.createElement('section');
  box.id = 'materialsVocabPanel';
  box.className = 'materials-inline-panel';
  box.innerHTML = '<div class="materials-inline-head"><h3>Vocabulario por clase</h3><select id="materialsVocabSelect"></select></div><div id="materialsVocabChips" class="tag-list"></div>';
  panel.appendChild(box);
  fillLessonSelect('materialsVocabSelect');
  const select = box.querySelector('#materialsVocabSelect');
  select.value = String(firstLessonWithMaterials());
  select.addEventListener('change', () => renderVocabChips(Number(select.value)));
  renderVocabChips(Number(select.value));
}

function mountGrammarMaterials() {
  const view = document.getElementById('grammar');
  const panel = view?.querySelector('.panel');
  if (!panel || document.getElementById('materialsGrammarPanel')) return;
  const box = document.createElement('section');
  box.id = 'materialsGrammarPanel';
  box.className = 'materials-inline-panel';
  box.innerHTML = '<div class="materials-inline-head"><h3>Patrones por clase</h3><select id="materialsGrammarSelect"></select></div><div id="materialsGrammarChips" class="tag-list"></div>';
  panel.appendChild(box);
  fillLessonSelect('materialsGrammarSelect');
  const select = box.querySelector('#materialsGrammarSelect');
  select.value = String(firstLessonWithMaterials());
  select.addEventListener('change', () => renderGrammarChips(Number(select.value)));
  renderGrammarChips(Number(select.value));
}

function patchLessonCards() {
  document.querySelectorAll('#lessonGrid .lesson-card').forEach(card => {
    if (card.dataset.materialsPatched) return;
    const numberText = card.querySelector('.lesson-number')?.textContent || '';
    const lessonId = Number((numberText.match(/\d+/) || [])[0]);
    if (!lessonId) return;
    const material = materialFor(lessonId);
    const words = (material.v || []).length;
    const patterns = (material.g || []).length;
    const meta = document.createElement('p');
    meta.className = 'muted small lesson-meta materials-meta';
    meta.textContent = words || patterns ? `Material: ${words} palabra(s) · ${patterns} patrón(es)` : 'Material: pendiente de estructurar';
    const existingMeta = card.querySelector('.lesson-meta');
    (existingMeta || card.querySelector('.lesson-summary'))?.after(meta);
    const actions = card.querySelector('.lesson-actions');
    if (actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary';
      button.textContent = 'Aprender';
      button.addEventListener('click', () => openLearningLesson(lessonId));
      actions.prepend(button);
    }
    card.dataset.materialsPatched = '1';
  });
}

function renderVocabChips(lessonId) {
  const box = document.getElementById('materialsVocabChips');
  const values = materialFor(lessonId).v || [];
  if (box) box.innerHTML = values.length ? values.map(tag).join('') : '<p class="empty">Sin vocabulario estructurado para esta clase.</p>';
}

function renderGrammarChips(lessonId) {
  const box = document.getElementById('materialsGrammarChips');
  const values = materialFor(lessonId).g || [];
  if (box) box.innerHTML = values.length ? values.map(tag).join('') : '<p class="empty">Sin patrones estructurados para esta clase.</p>';
}

function fillLessonSelect(id) {
  const select = document.getElementById(id);
  if (!select) return;
  select.innerHTML = paruskiLessons.map(lesson => {
    const material = materialFor(lesson.id);
    const count = (material.v || []).length + (material.g || []).length;
    return '<option value="' + lesson.id + '">Clase ' + String(lesson.id).padStart(2, '0') + ' · ' + count + ' item(s)</option>';
  }).join('');
}

function openLearningLesson(lessonId) {
  const learningTab = document.querySelector('[data-view="learning"]');
  learningTab?.click();
  window.setTimeout(() => {
    const select = document.getElementById('learningLessonSelect');
    if (!select) return;
    select.value = String(lessonId);
    select.dispatchEvent(new Event('change'));
  }, 120);
}

function firstLessonWithMaterials() {
  return (paruskiMaterials.find(item => (item.v || []).length || (item.g || []).length) || { l: 1 }).l;
}

function materialFor(lessonId) {
  return paruskiMaterials.find(item => Number(item.l) === Number(lessonId)) || { v: [], g: [] };
}

function tag(value) {
  return '<span class="tag">' + escapeHtml(value) + '</span>';
}

function injectMaterialsStyles() {
  if (document.getElementById('materialsUiStyles')) return;
  const style = document.createElement('style');
  style.id = 'materialsUiStyles';
  style.textContent = '.tag-list{display:flex;flex-wrap:wrap;gap:.45rem}.materials-inline-panel{margin-top:1rem;padding:1rem;border:1px solid var(--line);border-radius:1rem;background:rgba(255,255,255,.03)}.materials-inline-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:.75rem}.materials-meta{color:#c4b5fd}@media(max-width:720px){.materials-inline-head{align-items:flex-start;flex-direction:column}.materials-inline-head select{width:100%}}';
  document.head.appendChild(style);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
