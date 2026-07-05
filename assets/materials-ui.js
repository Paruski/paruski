let paruskiMaterials = [];
let paruskiLessons = [];
let paruskiMaterialIndex = [];
const MATERIALS_SEEN_KEY = 'paruski.materialsSeen.v1';

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
  paruskiMaterialIndex = buildMaterialIndex();
  mountDashboardMaterials();
  mountVocabularyMaterials();
  mountGrammarMaterials();
  patchLessonCards();
  bindMaterialsEvents();
  new MutationObserver(patchLessonCards).observe(document.body, { childList: true, subtree: true });
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(path);
  return response.json();
}

function buildMaterialIndex() {
  return paruskiMaterials.flatMap(item => [
    ...(item.v || []).map(value => materialEntry(item.l, 'vocabulario', value)),
    ...(item.g || []).map(value => materialEntry(item.l, 'gramática', value))
  ]);
}

function materialEntry(lesson, kind, value) {
  const title = paruskiLessons.find(item => Number(item.id) === Number(lesson))?.title || '';
  return { lesson, kind, value, title, key: `${lesson}:${kind}:${value}` };
}

function mountDashboardMaterials() {
  const dashboard = document.getElementById('dashboard');
  if (!dashboard || document.getElementById('materialsDashboardPanel')) return;
  const totalWords = paruskiMaterials.reduce((sum, item) => sum + (item.v || []).length, 0);
  const totalPatterns = paruskiMaterials.reduce((sum, item) => sum + (item.g || []).length, 0);
  const filledLessons = paruskiMaterials.filter(item => (item.v || []).length || (item.g || []).length).length;
  const studied = loadSeenMaterials().size;
  const panel = document.createElement('section');
  panel.id = 'materialsDashboardPanel';
  panel.className = 'panel';
  panel.innerHTML = '<div class="panel-head"><div><h2>Materiales del curso</h2><p class="muted">Vocabulario y patrones rusos extraídos como material de estudio, sin transcripciones.</p></div><button type="button" class="secondary" id="openLearningFromHome">Abrir Aprender</button></div><div class="grid cards-4"><article class="card"><div class="value">' + filledLessons + '</div><div class="label">Clases con material</div></article><article class="card"><div class="value">' + totalWords + '</div><div class="label">Items rusos</div></article><article class="card"><div class="value">' + totalPatterns + '</div><div class="label">Patrones</div></article><article class="card"><div class="value" id="materialsStudiedCount">' + studied + '</div><div class="label">Marcados estudiados</div></article></div><div class="materials-search"><div class="materials-inline-head"><h3>Buscar y estudiar</h3><button type="button" class="secondary" id="materialsRandomBtn">Sugerir 12</button></div><input id="materialsSearchInput" type="search" placeholder="Buscar ruso, patrón o clase..." /><div id="materialsSearchResults" class="materials-results"></div></div>';
  const firstPanel = dashboard.querySelector('.panel');
  dashboard.insertBefore(panel, firstPanel || null);
  panel.querySelector('#openLearningFromHome')?.addEventListener('click', () => openLearningLesson(firstLessonWithMaterials()));
  panel.querySelector('#materialsSearchInput')?.addEventListener('input', event => renderMaterialSearch(event.target.value));
  panel.querySelector('#materialsRandomBtn')?.addEventListener('click', () => renderMaterialSuggestions());
  renderMaterialSuggestions();
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
    const studied = lessonStudiedCount(lessonId);
    const meta = document.createElement('p');
    meta.className = 'muted small lesson-meta materials-meta';
    meta.textContent = words || patterns ? `Material: ${words} palabra(s) · ${patterns} patrón(es) · ${studied} estudiado(s)` : 'Material: pendiente de estructurar';
    const existingMeta = card.querySelector('.lesson-meta');
    (existingMeta || card.querySelector('.lesson-summary'))?.after(meta);
    const preview = document.createElement('div');
    preview.className = 'tag-list lesson-material-preview';
    preview.innerHTML = [...(material.v || []).slice(0, 5), ...(material.g || []).slice(0, 2)].map(value => tag(value, lessonId)).join('');
    meta.after(preview);
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

function renderMaterialSuggestions() {
  const seen = loadSeenMaterials();
  const candidates = paruskiMaterialIndex.filter(item => !seen.has(item.key));
  const list = (candidates.length ? candidates : paruskiMaterialIndex).slice(0, 12);
  renderMaterialResults(list, 'materialsSearchResults');
}

function renderMaterialSearch(query) {
  const normalized = normalize(query);
  const results = normalized
    ? paruskiMaterialIndex.filter(item => normalize([item.value, item.kind, item.title, item.lesson].join(' ')).includes(normalized)).slice(0, 40)
    : paruskiMaterialIndex.slice(0, 12);
  renderMaterialResults(results, 'materialsSearchResults');
}

function renderMaterialResults(results, targetId) {
  const box = document.getElementById(targetId);
  if (!box) return;
  if (!results.length) {
    box.innerHTML = '<p class="empty">No hay resultados para esa búsqueda.</p>';
    return;
  }
  const seen = loadSeenMaterials();
  box.innerHTML = results.map(item => {
    const studied = seen.has(item.key);
    return '<article class="material-result ' + (studied ? 'studied' : '') + '"><div><strong>' + escapeHtml(item.value) + '</strong><br><span class="muted">Clase ' + String(item.lesson).padStart(2, '0') + ' · ' + escapeHtml(item.kind) + ' · ' + escapeHtml(item.title) + '</span></div><div class="material-actions"><button type="button" class="secondary material-speak" data-value="' + escapeAttr(item.value) + '">Escuchar</button><button type="button" class="secondary material-open" data-lesson="' + item.lesson + '">Clase</button><button type="button" class="material-study" data-key="' + escapeAttr(item.key) + '">' + (studied ? 'Estudiado' : 'Marcar') + '</button></div></article>';
  }).join('');
}

function renderVocabChips(lessonId) {
  const box = document.getElementById('materialsVocabChips');
  const values = materialFor(lessonId).v || [];
  if (box) box.innerHTML = values.length ? values.map(value => tag(value, lessonId)).join('') : '<p class="empty">Sin vocabulario estructurado para esta clase.</p>';
}

function renderGrammarChips(lessonId) {
  const box = document.getElementById('materialsGrammarChips');
  const values = materialFor(lessonId).g || [];
  if (box) box.innerHTML = values.length ? values.map(value => tag(value, lessonId)).join('') : '<p class="empty">Sin patrones estructurados para esta clase.</p>';
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

function bindMaterialsEvents() {
  document.addEventListener('click', event => {
    const speak = event.target.closest?.('.material-speak, .material-chip');
    if (speak?.dataset?.value) {
      speakRussian(speak.dataset.value);
      return;
    }
    const open = event.target.closest?.('.material-open');
    if (open?.dataset?.lesson) {
      openLearningLesson(Number(open.dataset.lesson));
      return;
    }
    const study = event.target.closest?.('.material-study');
    if (study?.dataset?.key) {
      toggleSeenMaterial(study.dataset.key);
      refreshMaterialUi();
    }
  });
}

function refreshMaterialUi() {
  renderMaterialSearch(document.getElementById('materialsSearchInput')?.value || '');
  const vocabSelect = document.getElementById('materialsVocabSelect');
  if (vocabSelect) renderVocabChips(Number(vocabSelect.value));
  const grammarSelect = document.getElementById('materialsGrammarSelect');
  if (grammarSelect) renderGrammarChips(Number(grammarSelect.value));
  const studiedCount = document.getElementById('materialsStudiedCount');
  if (studiedCount) studiedCount.textContent = loadSeenMaterials().size;
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

function speakRussian(text) {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ru-RU';
  utterance.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function loadSeenMaterials() {
  try { return new Set(JSON.parse(localStorage.getItem(MATERIALS_SEEN_KEY)) || []); } catch { return new Set(); }
}

function saveSeenMaterials(seen) {
  localStorage.setItem(MATERIALS_SEEN_KEY, JSON.stringify([...seen]));
}

function toggleSeenMaterial(key) {
  const seen = loadSeenMaterials();
  if (seen.has(key)) seen.delete(key);
  else seen.add(key);
  saveSeenMaterials(seen);
}

function lessonStudiedCount(lessonId) {
  const seen = loadSeenMaterials();
  return paruskiMaterialIndex.filter(item => Number(item.lesson) === Number(lessonId) && seen.has(item.key)).length;
}

function firstLessonWithMaterials() {
  return (paruskiMaterials.find(item => (item.v || []).length || (item.g || []).length) || { l: 1 }).l;
}

function materialFor(lessonId) {
  return paruskiMaterials.find(item => Number(item.l) === Number(lessonId)) || { v: [], g: [] };
}

function tag(value, lessonId) {
  return '<button type="button" class="tag material-chip" data-value="' + escapeAttr(value) + '" data-lesson="' + (lessonId || '') + '" title="Escuchar">' + escapeHtml(value) + '</button>';
}

function injectMaterialsStyles() {
  if (document.getElementById('materialsUiStyles')) return;
  const style = document.createElement('style');
  style.id = 'materialsUiStyles';
  style.textContent = '.tag-list{display:flex;flex-wrap:wrap;gap:.45rem}.material-chip{cursor:pointer}.materials-inline-panel,.materials-search{margin-top:1rem;padding:1rem;border:1px solid var(--line);border-radius:1rem;background:rgba(255,255,255,.03)}.materials-inline-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:.75rem}.materials-meta{color:#c4b5fd}.materials-results{display:grid;gap:.65rem;margin-top:.75rem}.material-result{display:flex;align-items:center;justify-content:space-between;gap:1rem;border:1px solid var(--line);border-radius:.9rem;padding:.75rem;background:rgba(0,0,0,.12)}.material-result.studied{border-color:rgba(34,197,94,.45);background:rgba(34,197,94,.08)}.material-actions{display:flex;flex-wrap:wrap;gap:.45rem;justify-content:flex-end}.lesson-material-preview{margin:.55rem 0}.materials-search input{width:100%}@media(max-width:720px){.materials-inline-head,.material-result{align-items:flex-start;flex-direction:column}.materials-inline-head select,.materials-search input{width:100%}.material-actions{justify-content:flex-start}}';
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
