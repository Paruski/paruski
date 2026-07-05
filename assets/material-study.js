let studyItems = [];
let currentStudyIndex = 0;
const STUDY_KEY = 'paruski.materialStudy.v1';

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initMaterialStudy);
} else {
  initMaterialStudy();
}

async function initMaterialStudy() {
  const data = await Promise.all([
    loadJson('content/materials.json').catch(() => ({ classes: [] })),
    loadJson('content/lessons.json').catch(() => [])
  ]);
  const lessons = data[1] || [];
  studyItems = (data[0].classes || []).flatMap(entry => [
    ...(entry.v || []).map(value => makeItem(entry.l, 'vocabulario', value, lessons)),
    ...(entry.g || []).map(value => makeItem(entry.l, 'patrón', value, lessons))
  ]);
  mountStudyDeck();
  renderStudyDeck();
}

async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(path);
  return response.json();
}

function makeItem(lesson, kind, value, lessons) {
  const title = lessons.find(item => Number(item.id) === Number(lesson))?.title || '';
  return { key: lesson + ':' + kind + ':' + value, lesson, kind, value, title };
}

function mountStudyDeck() {
  const dashboard = document.getElementById('dashboard');
  if (!dashboard || document.getElementById('materialStudyDeck')) return;
  const panel = document.createElement('section');
  panel.id = 'materialStudyDeck';
  panel.className = 'panel';
  panel.innerHTML = '<div class="panel-head"><div><h2>Tarjetas rápidas</h2><p class="muted">Estudia vocabulario y patrones sin esperar a un ejercicio. Pulsa “Lo sé” o “Repasar luego”.</p></div><button id="studyShuffleBtn" type="button" class="secondary">Mezclar</button></div><div id="studyCardBox"></div>';
  const materialsPanel = document.getElementById('materialsDashboardPanel');
  dashboard.insertBefore(panel, materialsPanel?.nextSibling || dashboard.querySelector('.panel'));
  panel.querySelector('#studyShuffleBtn')?.addEventListener('click', () => {
    currentStudyIndex = Math.floor(Math.random() * Math.max(1, studyItems.length));
    renderStudyDeck();
  });
}

function renderStudyDeck() {
  const box = document.getElementById('studyCardBox');
  if (!box) return;
  if (!studyItems.length) {
    box.innerHTML = '<p class="empty">No hay materiales cargados todavía.</p>';
    return;
  }
  const stats = loadStats();
  const item = nextDueItem(stats) || studyItems[currentStudyIndex % studyItems.length];
  currentStudyIndex = Math.max(0, studyItems.findIndex(candidate => candidate.key === item.key));
  const record = stats[item.key] || {};
  box.innerHTML = '<article class="study-card"><div class="study-card-main"><span class="tag">Clase ' + String(item.lesson).padStart(2, '0') + '</span><span class="tag">' + escapeHtml(item.kind) + '</span><h3>' + escapeHtml(item.value) + '</h3><p class="muted">' + escapeHtml(item.title) + '</p><p class="muted small">Intentos: ' + (record.attempts || 0) + ' · Sé: ' + (record.known || 0) + ' · Repasar luego: ' + (record.again || 0) + '</p></div><div class="study-actions"><button type="button" id="studyListenBtn" class="secondary">Escuchar</button><button type="button" id="studyAgainBtn" class="secondary">Repasar luego</button><button type="button" id="studyKnownBtn">Lo sé</button><button type="button" id="studyOpenLessonBtn" class="secondary">Abrir clase</button><button type="button" id="studyNextBtn" class="secondary">Siguiente</button></div></article>';
  box.querySelector('#studyListenBtn')?.addEventListener('click', () => speakRussian(item.value));
  box.querySelector('#studyAgainBtn')?.addEventListener('click', () => gradeItem(item, false));
  box.querySelector('#studyKnownBtn')?.addEventListener('click', () => gradeItem(item, true));
  box.querySelector('#studyOpenLessonBtn')?.addEventListener('click', () => openLearningLesson(item.lesson));
  box.querySelector('#studyNextBtn')?.addEventListener('click', nextCard);
}

function gradeItem(item, known) {
  const stats = loadStats();
  const previous = stats[item.key] || { attempts: 0, known: 0, again: 0, interval: 0 };
  const interval = known ? nextInterval(previous.interval || 0, previous.known || 0) : 0;
  stats[item.key] = {
    ...previous,
    attempts: previous.attempts + 1,
    known: previous.known + (known ? 1 : 0),
    again: previous.again + (known ? 0 : 1),
    interval,
    due: dateKey(addDays(new Date(), interval)),
    last: new Date().toISOString()
  };
  localStorage.setItem(STUDY_KEY, JSON.stringify(stats));
  nextCard();
}

function nextInterval(previous, knownCount) {
  if (!previous) return knownCount >= 2 ? 2 : 1;
  return Math.min(60, Math.max(1, Math.round(previous * 2.2)));
}

function nextDueItem(stats) {
  const today = dateKey(new Date());
  return studyItems.find(item => !stats[item.key] || !stats[item.key].due || stats[item.key].due <= today);
}

function nextCard() {
  currentStudyIndex = (currentStudyIndex + 1) % studyItems.length;
  renderStudyDeck();
}

function loadStats() {
  try { return JSON.parse(localStorage.getItem(STUDY_KEY)) || {}; } catch { return {}; }
}

function openLearningLesson(lessonId) {
  document.querySelector('[data-view="learning"]')?.click();
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

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  next.setHours(0, 0, 0, 0);
  return next;
}

function dateKey(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
