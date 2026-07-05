const TRACK_KEYS = {
  progress: 'paruski.progress.v1',
  events: 'paruski.events.v1',
  drill: 'paruski.generatedDrills.v1',
  material: 'paruski.materialStudy.v1',
  aspect: 'paruski.aspectStudy.v1',
  notes: 'paruski.journal.v1'
};

let currentMonth = startOfMonth(new Date());
let selectedDay = dayKey(new Date());
let lastSignature = '';

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initTrackingUi);
} else {
  initTrackingUi();
}

function initTrackingUi() {
  injectTrackingStyles();
  addTrackingTab();
  lastSignature = trackingSignature();
  window.setInterval(refreshIfChanged, 4000);
}

function addTrackingTab() {
  if (document.getElementById('tracking')) return;
  const tabs = document.querySelector('.tabs');
  const main = document.querySelector('main');
  if (!tabs || !main) return;
  const tab = document.createElement('button');
  tab.className = 'tab';
  tab.dataset.view = 'tracking';
  tab.textContent = 'Seguimiento';
  tab.addEventListener('click', showTracking);
  const methodTab = document.querySelector('[data-view="method"]') || document.querySelector('[data-view="errors"]');
  tabs.insertBefore(tab, methodTab?.nextSibling || null);
  const section = document.createElement('section');
  section.id = 'tracking';
  section.className = 'view';
  section.innerHTML = '<div class="panel"><div class="panel-head"><div><h2>Seguimiento</h2><p class="muted">Calendario real de práctica, métricas útiles y diario de estudio.</p></div><button type="button" id="trackingExportBtn" class="secondary">Exportar</button></div><div id="trackingMetrics" class="grid cards-4"></div><div class="study-calendar-shell"><section class="study-calendar-panel"><div class="calendar-head"><button type="button" id="prevMonthBtn" class="secondary">‹</button><h3 id="calendarTitle"></h3><button type="button" id="nextMonthBtn" class="secondary">›</button></div><div class="calendar-weekdays"><span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span></div><div id="trackingCalendar" class="study-calendar"></div></section><aside class="day-detail"><h3 id="selectedDayTitle"></h3><div id="selectedDaySummary"></div><div id="selectedDayEvents" class="event-list"></div></aside></div><section class="journal-box"><div class="materials-inline-head"><h3>Diario de estudio</h3><input id="journalDate" type="date"></div><textarea id="journalText" rows="6" placeholder="Qué he aprendido, qué me cuesta, qué voy a repasar mañana..."></textarea><div class="journal-actions"><button type="button" id="saveJournalBtn">Guardar diario</button><span id="journalStatus" class="muted small"></span></div></section></div>';
  main.appendChild(section);
  section.querySelector('#trackingExportBtn')?.addEventListener('click', exportTracking);
  section.querySelector('#prevMonthBtn')?.addEventListener('click', () => changeMonth(-1));
  section.querySelector('#nextMonthBtn')?.addEventListener('click', () => changeMonth(1));
  section.querySelector('#saveJournalBtn')?.addEventListener('click', saveJournalEntry);
  const date = section.querySelector('#journalDate');
  if (date) {
    date.value = selectedDay;
    date.addEventListener('change', () => { selectedDay = date.value || dayKey(new Date()); renderTracking(); loadJournalEntry(); });
  }
  section.addEventListener('click', event => {
    const day = event.target.closest?.('[data-calendar-day]');
    if (!day) return;
    selectedDay = day.dataset.calendarDay;
    const input = document.getElementById('journalDate');
    if (input) input.value = selectedDay;
    renderTracking();
    loadJournalEntry();
  });
  loadJournalEntry();
}

function showTracking() {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.view === 'tracking'));
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === 'tracking'));
  currentMonth = startOfMonth(new Date(selectedDay));
  renderTracking();
}

function changeMonth(delta) {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1);
  renderTracking();
}

function refreshIfChanged() {
  if (!document.getElementById('tracking')?.classList.contains('active')) return;
  const next = trackingSignature();
  if (next === lastSignature) return;
  lastSignature = next;
  renderTracking();
}

function renderTracking() {
  const section = document.getElementById('tracking');
  if (!section) return;
  const events = cleanEvents(readJson(TRACK_KEYS.events, []));
  const progress = readJson(TRACK_KEYS.progress, {});
  const stats = { ...readJson(TRACK_KEYS.drill, {}), ...readJson(TRACK_KEYS.material, {}), ...readJson(TRACK_KEYS.aspect, {}) };
  renderMetrics(events, progress, stats);
  renderCalendar(events);
  renderSelectedDay(events);
}

function renderMetrics(events, progress, stats) {
  const practice = events.filter(event => event.skill !== 'estado');
  const today = dayKey(new Date());
  const todayEvents = practice.filter(event => dayKey(new Date(event.timestamp)) === today);
  const accuracy = practice.length ? Math.round(practice.filter(event => event.correct).length / practice.length * 100) : 0;
  const cards = [
    ['Hoy', todayEvents.length],
    ['Racha', calcStreak(practice) + ' día(s)'],
    ['Precisión', accuracy + '%'],
    ['Pendientes', dueCount(stats)],
    ['Eventos', practice.length],
    ['Items trabajados', Object.keys(progress.items || {}).length],
    ['Días con diario', Object.keys(readJson(TRACK_KEYS.notes, {})).length],
    ['Último día', practice.length ? formatDate(dayKey(new Date(practice[practice.length - 1].timestamp))) : '—']
  ];
  const box = document.getElementById('trackingMetrics');
  if (box) box.innerHTML = cards.map(([label, value]) => '<article class="card"><div class="value">' + safe(value) + '</div><div class="label">' + safe(label) + '</div></article>').join('');
}

function renderCalendar(events) {
  const box = document.getElementById('trackingCalendar');
  if (!box) return;
  const title = document.getElementById('calendarTitle');
  if (title) title.textContent = monthTitle(currentMonth);
  const counts = events.reduce((map, event) => {
    const key = dayKey(new Date(event.timestamp));
    const current = map[key] || { total: 0, correct: 0, wrong: 0 };
    current.total += 1;
    if (event.correct) current.correct += 1;
    if (event.correct === false) current.wrong += 1;
    map[key] = current;
    return map;
  }, {});
  const start = startCalendarGrid(currentMonth);
  const cells = [];
  const today = dayKey(new Date());
  for (let i = 0; i < 42; i += 1) {
    const date = addDays(start, i);
    const key = dayKey(date);
    const count = counts[key] || { total: 0, correct: 0, wrong: 0 };
    const inMonth = date.getMonth() === currentMonth.getMonth();
    const level = Math.min(4, count.total);
    cells.push('<button type="button" class="calendar-cell level-' + level + (inMonth ? '' : ' muted-day') + (key === today ? ' today' : '') + (key === selectedDay ? ' selected' : '') + '" data-calendar-day="' + key + '"><span class="day-number">' + date.getDate() + '</span>' + (count.total ? '<span class="day-count">' + count.total + '</span>' : '') + (count.wrong ? '<span class="day-wrong">' + count.wrong + ' error</span>' : '') + '</button>');
  }
  box.innerHTML = cells.join('');
}

function renderSelectedDay(events) {
  const dayEvents = events.filter(event => dayKey(new Date(event.timestamp)) === selectedDay).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  const title = document.getElementById('selectedDayTitle');
  if (title) title.textContent = formatDate(selectedDay);
  const correct = dayEvents.filter(event => event.correct).length;
  const wrong = dayEvents.filter(event => event.correct === false).length;
  const summary = document.getElementById('selectedDaySummary');
  if (summary) summary.innerHTML = '<div class="day-summary"><span class="tag">' + dayEvents.length + ' evento(s)</span><span class="tag">' + correct + ' acierto(s)</span><span class="tag">' + wrong + ' error(es)</span></div>';
  const list = document.getElementById('selectedDayEvents');
  if (!list) return;
  list.innerHTML = dayEvents.length ? dayEvents.slice(0, 20).map(event => '<div class="event-item"><div><strong>' + (event.correct ? '✓ ' : event.correct === false ? '✗ ' : '• ') + safe(event.skill || 'actividad') + '</strong><br><span class="muted">' + safe(event.prompt || event.item_id || '').slice(0, 120) + '</span>' + (event.expected ? '<br><span class="muted">Esperado: ' + safe(event.expected).slice(0, 80) + '</span>' : '') + '</div><span class="muted">' + new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</span></div>').join('') : '<p class="empty">Ese día no tiene práctica registrada todavía.</p>';
}

function cleanEvents(events) {
  return (Array.isArray(events) ? events : []).filter(event => event && event.timestamp && !Number.isNaN(new Date(event.timestamp).getTime()));
}

function loadJournalEntry() {
  const date = document.getElementById('journalDate')?.value || selectedDay;
  const journal = readJson(TRACK_KEYS.notes, {});
  const text = document.getElementById('journalText');
  if (text) text.value = journal[date]?.text || '';
  setJournalStatus(journal[date]?.updated_at ? 'Última edición: ' + new Date(journal[date].updated_at).toLocaleString() : 'Sin entrada para este día.');
}

function saveJournalEntry() {
  const date = document.getElementById('journalDate')?.value || selectedDay;
  const text = document.getElementById('journalText')?.value || '';
  const journal = readJson(TRACK_KEYS.notes, {});
  journal[date] = { date, text, updated_at: new Date().toISOString() };
  localStorage.setItem(TRACK_KEYS.notes, JSON.stringify(journal, null, 2));
  setJournalStatus('Guardado en este navegador: ' + new Date().toLocaleString());
  lastSignature = trackingSignature();
  renderTracking();
}

function exportTracking() {
  const payload = {
    exported_at: new Date().toISOString(),
    progress: readJson(TRACK_KEYS.progress, {}),
    events: readJson(TRACK_KEYS.events, []),
    generated_drills: readJson(TRACK_KEYS.drill, {}),
    material_study: readJson(TRACK_KEYS.material, {}),
    aspect_study: readJson(TRACK_KEYS.aspect, {}),
    journal: readJson(TRACK_KEYS.notes, {})
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'paruski-tracking.json';
  link.click();
  URL.revokeObjectURL(url);
}

function trackingSignature() {
  return [localStorage.getItem(TRACK_KEYS.events) || '', localStorage.getItem(TRACK_KEYS.notes) || '', localStorage.getItem(TRACK_KEYS.drill) || '', localStorage.getItem(TRACK_KEYS.material) || '', localStorage.getItem(TRACK_KEYS.aspect) || ''].join('|');
}

function dueCount(stats) {
  const today = dayKey(new Date());
  return Object.values(stats || {}).filter(item => !item.due || item.due <= today).length;
}

function calcStreak(events) {
  const days = new Set(events.map(event => dayKey(new Date(event.timestamp))));
  let cursor = new Date();
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function startCalendarGrid(month) { const start = startOfMonth(month); const weekday = (start.getDay() + 6) % 7; return addDays(start, -weekday); }
function addDays(date, days) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
function dayKey(date) { if (Number.isNaN(date.getTime())) return ''; return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'); }
function monthTitle(date) { return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }); }
function formatDate(key) { const [y, m, d] = String(key).split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
function setJournalStatus(value) { const el = document.getElementById('journalStatus'); if (el) el.textContent = value; }
function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
function safe(value) { return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }

function injectTrackingStyles() {
  if (document.getElementById('trackingStyles')) return;
  const style = document.createElement('style');
  style.id = 'trackingStyles';
  style.textContent = '.study-calendar-shell{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(280px,.8fr);gap:1rem;margin-top:1rem}.study-calendar-panel,.day-detail,.journal-box{border:1px solid var(--line);border-radius:1rem;padding:1rem;background:rgba(0,0,0,.12)}.calendar-head{display:flex;align-items:center;justify-content:space-between;gap:.75rem}.calendar-head h3{text-transform:capitalize}.calendar-weekdays,.study-calendar{display:grid;grid-template-columns:repeat(7,1fr);gap:.35rem}.calendar-weekdays{margin:.75rem 0 .35rem;color:var(--muted);font-size:.82rem;text-align:center}.calendar-cell{min-height:5.2rem;display:flex;flex-direction:column;align-items:flex-start;gap:.25rem;border:1px solid var(--line);border-radius:.7rem;background:rgba(255,255,255,.03);color:var(--text);padding:.55rem;text-align:left}.calendar-cell:hover{border-color:var(--accent)}.calendar-cell.today{outline:2px solid var(--accent)}.calendar-cell.selected{background:rgba(124,92,255,.22)}.calendar-cell.muted-day{opacity:.45}.day-count{font-weight:800}.day-wrong{font-size:.72rem;color:#fca5a5}.level-1{background:rgba(34,197,94,.13)}.level-2{background:rgba(34,197,94,.22)}.level-3{background:rgba(34,197,94,.34)}.level-4{background:rgba(34,197,94,.46)}.day-summary{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem}.journal-box{margin-top:1rem}.journal-box textarea{width:100%;margin-top:.5rem}.journal-actions{display:flex;align-items:center;gap:.75rem;margin-top:.75rem}@media(max-width:900px){.study-calendar-shell{grid-template-columns:1fr}.calendar-cell{min-height:4rem;font-size:.85rem}}';
  document.head.appendChild(style);
}
