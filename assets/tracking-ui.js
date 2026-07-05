const TRACK_KEYS = {
  progress: 'paruski.progress.v1',
  events: 'paruski.events.v1',
  drill: 'paruski.generatedDrills.v1',
  material: 'paruski.materialStudy.v1',
  aspect: 'paruski.aspectStudy.v1',
  notes: 'paruski.journal.v1'
};

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initTrackingUi);
} else {
  initTrackingUi();
}

function initTrackingUi() {
  injectTrackingStyles();
  addTrackingTab();
  renderTracking();
  window.setInterval(renderTracking, 5000);
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
  tab.addEventListener('click', () => showTracking());
  const methodTab = document.querySelector('[data-view="method"]') || document.querySelector('[data-view="errors"]');
  tabs.insertBefore(tab, methodTab?.nextSibling || null);
  const section = document.createElement('section');
  section.id = 'tracking';
  section.className = 'view';
  section.innerHTML = '<div class="panel"><div class="panel-head"><div><h2>Seguimiento avanzado</h2><p class="muted">Métricas locales, calendario de práctica, items difíciles y diario de estudio.</p></div><button type="button" id="trackingExportBtn" class="secondary">Exportar seguimiento</button></div><div id="trackingMetrics" class="grid cards-4"></div><div class="tracking-layout"><section><h3>Calendario</h3><div id="trackingCalendar" class="calendar-grid"></div></section><section><h3>Focos de repaso</h3><div id="trackingFocus"></div></section></div><section class="journal-box"><div class="materials-inline-head"><h3>Diario de estudio</h3><input id="journalDate" type="date"></div><textarea id="journalText" rows="7" placeholder="Qué he estudiado, qué me cuesta, qué quiero repasar mañana..."></textarea><div class="journal-actions"><button type="button" id="saveJournalBtn">Guardar diario</button><span id="journalStatus" class="muted small"></span></div></section></div>';
  main.appendChild(section);
  section.querySelector('#trackingExportBtn')?.addEventListener('click', exportTracking);
  section.querySelector('#saveJournalBtn')?.addEventListener('click', saveJournalEntry);
  const date = section.querySelector('#journalDate');
  if (date) {
    date.value = dayKey(new Date());
    date.addEventListener('change', loadJournalEntry);
  }
  loadJournalEntry();
}

function showTracking() {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.view === 'tracking'));
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === 'tracking'));
  renderTracking();
}

function renderTracking() {
  if (!document.getElementById('tracking')) return;
  const events = readJson(TRACK_KEYS.events, []);
  const progress = readJson(TRACK_KEYS.progress, {});
  const drillStats = readJson(TRACK_KEYS.drill, {});
  const materialStats = readJson(TRACK_KEYS.material, {});
  const aspectStats = readJson(TRACK_KEYS.aspect, {});
  const practiceEvents = events.filter(event => event.skill !== 'estado');
  const correct = practiceEvents.filter(event => event.correct).length;
  const accuracy = practiceEvents.length ? Math.round((correct / practiceEvents.length) * 100) : 0;
  const today = dayKey(new Date());
  const todayCount = practiceEvents.filter(event => dayKey(new Date(event.timestamp)) === today).length;
  const streak = calcStreak(practiceEvents);
  const due = dueCount({ ...drillStats, ...materialStats, ...aspectStats });
  const hard = hardItems(progress, events, drillStats, aspectStats);
  const metrics = [
    ['Hoy', todayCount],
    ['Racha', streak + ' día(s)'],
    ['Precisión', accuracy + '%'],
    ['Pendientes', due],
    ['Eventos', practiceEvents.length],
    ['Items locales', Object.keys(progress.items || {}).length],
    ['Drills', Object.keys(drillStats).length],
    ['Diario', Object.keys(readJson(TRACK_KEYS.notes, {})).length + ' día(s)']
  ];
  const metricsBox = document.getElementById('trackingMetrics');
  if (metricsBox) metricsBox.innerHTML = metrics.map(([label, value]) => '<article class="card"><div class="value">' + safe(value) + '</div><div class="label">' + safe(label) + '</div></article>').join('');
  renderCalendar(practiceEvents);
  const focus = document.getElementById('trackingFocus');
  if (focus) focus.innerHTML = hard.length ? hard.map(item => '<div class="event-item"><div><strong>' + safe(item.title) + '</strong><br><span class="muted">' + safe(item.reason) + '</span></div><span class="tag">prioridad ' + item.score + '</span></div>').join('') : '<p class="empty">Sin focos críticos todavía. Practica más para detectar patrones.</p>';
}

function renderCalendar(events) {
  const box = document.getElementById('trackingCalendar');
  if (!box) return;
  const counts = events.reduce((map, event) => {
    const key = dayKey(new Date(event.timestamp));
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});
  const days = [];
  const now = new Date();
  for (let i = 55; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = dayKey(d);
    const count = counts[key] || 0;
    days.push('<div class="calendar-day level-' + Math.min(4, count) + '" title="' + key + ': ' + count + ' evento(s)"><span>' + d.getDate() + '</span></div>');
  }
  box.innerHTML = days.join('');
}

function hardItems(progress, events, drillStats, aspectStats) {
  const fromProgress = Object.entries(progress.items || {}).map(([id, item]) => ({ title: id, score: (item.wrong || 0) + (1 - (item.mastery || 0)), reason: 'Errores: ' + (item.wrong || 0) + ' · dominio: ' + Math.round((item.mastery || 0) * 100) + '%' }));
  const fromDrills = Object.entries({ ...drillStats, ...aspectStats }).map(([id, item]) => ({ title: id.split(':').slice(-1)[0], score: (item.wrong || item.again || 0) + Math.max(0, 3 - (item.correct || item.known || 0)), reason: 'Práctica generada · intentos: ' + (item.attempts || 0) }));
  const fromEvents = events.filter(event => event.correct === false).slice(-50).map(event => ({ title: event.expected || event.item_id || event.prompt, score: 2, reason: 'Error reciente: ' + String(event.prompt || '').slice(0, 90) }));
  return [...fromProgress, ...fromDrills, ...fromEvents].filter(item => item.title).sort((a, b) => b.score - a.score).slice(0, 10).map(item => ({ ...item, score: Number(item.score || 0).toFixed(1) }));
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

function loadJournalEntry() {
  const date = document.getElementById('journalDate')?.value || dayKey(new Date());
  const journal = readJson(TRACK_KEYS.notes, {});
  const text = document.getElementById('journalText');
  if (text) text.value = journal[date]?.text || '';
  setJournalStatus(journal[date]?.updated_at ? 'Última edición: ' + new Date(journal[date].updated_at).toLocaleString() : 'Sin entrada para este día.');
}

function saveJournalEntry() {
  const date = document.getElementById('journalDate')?.value || dayKey(new Date());
  const text = document.getElementById('journalText')?.value || '';
  const journal = readJson(TRACK_KEYS.notes, {});
  journal[date] = { date, text, updated_at: new Date().toISOString() };
  localStorage.setItem(TRACK_KEYS.notes, JSON.stringify(journal, null, 2));
  setJournalStatus('Guardado en este navegador: ' + new Date().toLocaleString());
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

function setJournalStatus(value) { const el = document.getElementById('journalStatus'); if (el) el.textContent = value; }
function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
function dayKey(date) { if (Number.isNaN(date.getTime())) return ''; return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'); }
function safe(value) { return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
function injectTrackingStyles() { if (document.getElementById('trackingStyles')) return; const style = document.createElement('style'); style.id = 'trackingStyles'; style.textContent = '.tracking-layout{display:grid;grid-template-columns:1.2fr 1fr;gap:1rem;margin-top:1rem}.calendar-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:.35rem}.calendar-day{aspect-ratio:1;border:1px solid var(--line);border-radius:.35rem;display:grid;place-items:center;font-size:.75rem;background:rgba(255,255,255,.03)}.calendar-day.level-1{background:rgba(34,197,94,.18)}.calendar-day.level-2{background:rgba(34,197,94,.28)}.calendar-day.level-3{background:rgba(34,197,94,.42)}.calendar-day.level-4{background:rgba(34,197,94,.58)}.journal-box{margin-top:1rem;border:1px solid var(--line);border-radius:1rem;padding:1rem;background:rgba(0,0,0,.12)}.journal-box textarea{width:100%;margin-top:.5rem}.journal-actions{display:flex;align-items:center;gap:.75rem;margin-top:.75rem}@media(max-width:900px){.tracking-layout{grid-template-columns:1fr}.calendar-grid{grid-template-columns:repeat(7,1fr)}}'; document.head.appendChild(style); }
