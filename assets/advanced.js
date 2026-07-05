const ADVANCED_KEYS = {
  progress: 'paruski.progress.v1',
  events: 'paruski.events.v1',
  profiles: 'paruski.profiles.v1'
};

let lastAdvancedSignature = '';

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initAdvancedLayer);
} else {
  initAdvancedLayer();
}

function initAdvancedLayer() {
  mountProfilePanel();
  mountSrsDashboardPanel();
  bindAdvancedControls();
  refreshAdvancedMetrics(true);
  window.setInterval(() => refreshAdvancedMetrics(false), 1800);
  document.addEventListener('click', event => {
    if (event.target?.id === 'checkAnswerBtn' || event.target?.id === 'nextExerciseBtn') {
      window.setTimeout(() => refreshAdvancedMetrics(true), 250);
    }
  });
}

function bindAdvancedControls() {
  document.getElementById('refreshSrsBtn')?.addEventListener('click', () => refreshAdvancedMetrics(true));
  document.getElementById('createProfileBtn')?.addEventListener('click', createLocalProfile);
  document.getElementById('switchProfileBtn')?.addEventListener('click', switchLocalProfile);
}

function mountProfilePanel() {
  const settingsPanel = document.querySelector('#settings .panel');
  if (!settingsPanel || document.getElementById('localProfileBox')) return;

  const box = document.createElement('section');
  box.id = 'localProfileBox';
  box.className = 'profile-box';
  box.innerHTML = `
    <h3>Usuarios locales</h3>
    <p class="muted small">Perfiles por alias para separar progreso en este navegador. No es seguridad real: usa seudónimos y no guardes datos personales.</p>
    <div class="profile-grid">
      <label>Alias <input id="profileAliasInput" autocomplete="off" placeholder="Ej. estudiante-a" /></label>
      <label>Perfil guardado <select id="profileSelect"></select></label>
    </div>
    <div class="profile-actions">
      <button id="createProfileBtn" type="button">Crear perfil</button>
      <button id="switchProfileBtn" type="button" class="secondary">Cambiar de perfil</button>
    </div>
    <div id="profileStatus" class="muted small"></div>
  `;

  const codeGrid = settingsPanel.querySelector('.code-grid');
  settingsPanel.insertBefore(box, codeGrid || settingsPanel.firstChild);
  renderProfileOptions();
}

function mountSrsDashboardPanel() {
  const dashboard = document.getElementById('dashboard');
  if (!dashboard || document.getElementById('srsDashboardPanel')) return;
  const panel = document.createElement('section');
  panel.id = 'srsDashboardPanel';
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-head">
      <div>
        <h2>Métricas de repetición espaciada</h2>
        <p class="muted">Seguimiento por ejercicio, vocabulario, gramática, casos, estructuras, modalidad y tipo de error.</p>
      </div>
      <button id="refreshSrsBtn" type="button" class="secondary">Recalcular</button>
    </div>
    <div id="srsSummaryCards" class="grid cards-4"></div>
    <div id="srsWeakTargets" class="stack"></div>
  `;
  const recent = dashboard.querySelector('#recentEvents')?.closest('.panel');
  dashboard.insertBefore(panel, recent || null);
}

function createLocalProfile() {
  const aliasInput = document.getElementById('profileAliasInput');
  const alias = (aliasInput?.value || '').trim();
  if (!alias) return setProfileStatus('Escribe un alias local. Mejor usa un seudónimo, no un nombre real.', true);

  const profiles = loadProfiles();
  const id = uniqueProfileId(alias, profiles);
  profiles.profiles[id] = { id, alias, created_at: new Date().toISOString() };
  backupCurrentProfile(profiles);
  profiles.activeUserId = id;
  saveProfiles(profiles);
  activateProfile(profiles.profiles[id], true);
}

function switchLocalProfile() {
  const profiles = loadProfiles();
  const id = document.getElementById('profileSelect')?.value;
  const profile = profiles.profiles[id];
  if (!profile) return setProfileStatus('Elige un perfil válido.', true);
  backupCurrentProfile(profiles);
  profiles.activeUserId = profile.id;
  saveProfiles(profiles);
  activateProfile(profile, true);
}

function activateProfile(profile, reloadAfter) {
  const storedProgress = localStorage.getItem(profileProgressKey(profile.id));
  const storedEvents = localStorage.getItem(profileEventsKey(profile.id));
  const progress = storedProgress ? safeJson(storedProgress, defaultProfileProgress(profile)) : defaultProfileProgress(profile);
  progress.user = { id: profile.id, name: profile.alias, auth: 'local_profile', created_at: progress.user?.created_at || profile.created_at };
  localStorage.setItem(ADVANCED_KEYS.progress, JSON.stringify(progress, null, 2));
  localStorage.setItem(ADVANCED_KEYS.events, storedEvents || '[]');
  setProfileStatus(`Perfil activo: ${profile.alias}.`);
  if (reloadAfter) window.location.reload();
}

function backupCurrentProfile(profiles = loadProfiles()) {
  const currentProgress = loadProgress();
  const currentUserId = currentProgress.user?.id || profiles.activeUserId;
  if (!currentUserId) return;
  localStorage.setItem(profileProgressKey(currentUserId), JSON.stringify(currentProgress, null, 2));
  localStorage.setItem(profileEventsKey(currentUserId), JSON.stringify(loadEvents(), null, 2));
}

function renderProfileOptions() {
  const select = document.getElementById('profileSelect');
  if (!select) return;
  const profiles = loadProfiles();
  const entries = Object.values(profiles.profiles);
  select.innerHTML = entries.length
    ? entries.map(profile => `<option value="${escapeHtml(profile.id)}" ${profile.id === profiles.activeUserId ? 'selected' : ''}>${escapeHtml(profile.alias)}</option>`).join('')
    : '<option value="">Sin perfiles guardados</option>';
}

function loadProfiles() {
  const data = safeJson(localStorage.getItem(ADVANCED_KEYS.profiles), null);
  return data && data.profiles ? data : { activeUserId: null, profiles: {} };
}

function saveProfiles(profiles) {
  localStorage.setItem(ADVANCED_KEYS.profiles, JSON.stringify(profiles, null, 2));
}

function defaultProfileProgress(profile) {
  return {
    version: 1,
    updated_at: new Date().toISOString(),
    user: { id: profile.id, name: profile.alias, auth: 'local_profile', created_at: profile.created_at },
    lessons: {},
    items: {},
    settings: { dailyTarget: 12 },
    srs: null
  };
}

function profileProgressKey(id) { return `${ADVANCED_KEYS.progress}.${id}`; }
function profileEventsKey(id) { return `${ADVANCED_KEYS.events}.${id}`; }

function uniqueProfileId(alias, profiles) {
  const base = slugify(alias) || `usuario-${Date.now().toString(36)}`;
  let id = base;
  let count = 2;
  while (profiles.profiles[id]) {
    id = `${base}-${count}`;
    count += 1;
  }
  return id;
}

function setProfileStatus(message, isError = false) {
  const box = document.getElementById('profileStatus');
  if (!box) return;
  box.textContent = message;
  box.className = `small ${isError ? 'danger-text' : 'muted'}`;
}

function refreshAdvancedMetrics(force) {
  const events = loadEvents().filter(event => event.skill !== 'estado');
  const progress = loadProgress();
  const signature = `${progress.user?.id || 'anon'}|${events.length}|${events.at(-1)?.event_id || ''}|${events.at(-1)?.timestamp || ''}`;
  if (!force && signature === lastAdvancedSignature) return;
  lastAdvancedSignature = signature;

  const srs = deriveSrsMetrics(events);
  progress.srs = srs;
  progress.updated_at = new Date().toISOString();
  localStorage.setItem(ADVANCED_KEYS.progress, JSON.stringify(progress, null, 2));
  backupCurrentProfile();
  renderSrsDashboard(srs);
  renderCalendar(srs, events);
  renderDataPreviewPatch(progress, events);
}

function deriveSrsMetrics(events) {
  const sorted = [...events].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  const metrics = {};
  for (const event of sorted) {
    for (const target of eventTargets(event)) {
      const current = metrics[target.key] || emptyMetric(target);
      metrics[target.key] = updateMetric(current, event);
    }
  }

  const all = Object.values(metrics).map(metric => ({ ...metric, priority: targetPriority(metric) }));
  const due = all.filter(metric => metric.due_at <= todayKey()).sort((a, b) => b.priority - a.priority);
  const weak = all.sort((a, b) => b.priority - a.priority).slice(0, 12);
  return {
    version: 1,
    updated_at: new Date().toISOString(),
    totals: { targets: all.length, due_today: due.length, weak_targets: weak.length, events: sorted.length },
    target_metrics: Object.fromEntries(all.map(metric => [metric.key, metric])),
    due_targets: due.slice(0, 30),
    weak_targets: weak,
    calendar: buildDueCalendar(all, sorted, 28)
  };
}

function emptyMetric(target) {
  return {
    key: target.key,
    dimension: target.dimension,
    value: target.value,
    label: target.label,
    attempts: 0,
    correct: 0,
    wrong: 0,
    streak: 0,
    lapses: 0,
    ease: 2.3,
    interval_days: 0,
    due_at: todayKey(),
    mastery: 0,
    retrieval_strength: 0,
    avg_response_time_ms: null,
    avg_confidence: null,
    last_seen: null,
    last_error_type: null
  };
}

function updateMetric(metric, event) {
  const correct = Boolean(event.correct);
  const attempts = metric.attempts + 1;
  const correctCount = metric.correct + (correct ? 1 : 0);
  const wrong = metric.wrong + (correct ? 0 : 1);
  const confidence = Number(event.confidence || 3);
  const responseTime = Number(event.response_time_ms || 0) || null;
  const avgResponse = responseTime ? rollingAverage(metric.avg_response_time_ms, responseTime, attempts) : metric.avg_response_time_ms;
  const avgConfidence = rollingAverage(metric.avg_confidence, confidence, attempts);
  const streak = correct ? metric.streak + 1 : 0;
  const lapses = metric.lapses + (!correct && metric.correct > 0 ? 1 : 0);
  const ease = clamp(metric.ease + (correct ? 0.04 * (confidence - 3) : -0.28), 1.3, 2.8);
  const interval = correct ? nextInterval(metric.interval_days, ease, confidence, streak) : 0;
  const seenDate = new Date(event.timestamp || Date.now());
  const dueAt = dateKey(addDays(seenDate, interval));
  const accuracy = correctCount / attempts;
  const confidenceScore = clamp(avgConfidence / 5, 0, 1);
  const speedScore = avgResponse ? clamp(1 - (avgResponse / 30000), 0.15, 1) : 0.65;
  const streakScore = clamp(streak / 5, 0, 1);
  const lapsePenalty = clamp(lapses * 0.06, 0, 0.35);
  const mastery = clamp((accuracy * 0.55) + (streakScore * 0.18) + (confidenceScore * 0.17) + (speedScore * 0.1) - lapsePenalty, 0, 1);
  const daysSince = Math.max(0, daysBetween(seenDate, new Date()));
  const retrieval = clamp(Math.exp(-daysSince / Math.max(1, interval || 1)), 0, 1);

  return {
    ...metric,
    attempts,
    correct: correctCount,
    wrong,
    streak,
    lapses,
    ease: round(ease, 2),
    interval_days: interval,
    due_at: dueAt,
    mastery: round(mastery, 3),
    retrieval_strength: round(retrieval, 3),
    avg_response_time_ms: avgResponse ? Math.round(avgResponse) : null,
    avg_confidence: round(avgConfidence, 2),
    last_seen: event.timestamp,
    last_error_type: correct ? metric.last_error_type : event.error_type || 'error_desconocido'
  };
}

function nextInterval(previous, ease, confidence, streak) {
  if (!previous) return confidence >= 4 ? 2 : 1;
  const confidenceFactor = clamp(confidence / 3, 0.7, 1.6);
  const streakFactor = 1 + Math.min(0.35, streak * 0.05);
  return Math.max(1, Math.round(previous * ease * confidenceFactor * streakFactor));
}

function targetPriority(metric) {
  const dueBoost = metric.due_at <= todayKey() ? 0.35 : 0;
  const weakness = 1 - (metric.mastery || 0);
  const errorBoost = Math.min(0.25, metric.wrong * 0.04 + metric.lapses * 0.07);
  const forgetting = 1 - (metric.retrieval_strength || 0);
  return round(clamp((weakness * 0.45) + (forgetting * 0.25) + errorBoost + dueBoost, 0, 1), 3);
}

function eventTargets(event) {
  const out = [];
  addTarget(out, 'item', event.item_id, `Ejercicio ${event.item_id}`);
  addTarget(out, 'lesson', event.lesson, `Clase ${event.lesson}`);
  addTarget(out, 'skill', event.skill, event.skill);
  addTarget(out, 'exercise_type', event.exercise_type, event.exercise_type);
  addTarget(out, 'modality', event.modality, event.modality);
  const targets = event.targets || {};
  Object.entries(targets).forEach(([dimension, value]) => {
    if (Array.isArray(value)) value.forEach(item => addTarget(out, dimension, item, item));
    else addTarget(out, dimension, value, value);
  });
  return out;
}

function addTarget(out, dimension, value, label) {
  if (value === null || value === undefined || value === '') return;
  const clean = String(value);
  out.push({ dimension, value: clean, label: String(label || clean), key: `${dimension}:${clean}` });
}

function buildDueCalendar(metrics, events, days) {
  const practiceCounts = events.reduce((map, event) => {
    const key = dateKey(new Date(event.timestamp));
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});
  return Array.from({ length: days }, (_, offset) => {
    const date = addDays(new Date(), offset);
    const key = dateKey(date);
    const due = metrics.filter(metric => metric.due_at === key).length;
    return { date: key, due, practiced: practiceCounts[key] || 0 };
  });
}

function renderSrsDashboard(srs) {
  const cards = document.getElementById('srsSummaryCards');
  const weakBox = document.getElementById('srsWeakTargets');
  if (!cards || !weakBox) return;
  cards.innerHTML = [
    ['Targets medidos', srs.totals.targets],
    ['Vencen hoy', srs.totals.due_today],
    ['Eventos útiles', srs.totals.events],
    ['Actualizado', new Date(srs.updated_at).toLocaleTimeString()]
  ].map(([label, value]) => `<article class="card"><div class="value">${escapeHtml(value)}</div><div class="label">${escapeHtml(label)}</div></article>`).join('');

  weakBox.innerHTML = srs.weak_targets.length
    ? srs.weak_targets.slice(0, 8).map(metric => `
      <div class="event-item metric-row">
        <div><strong>${escapeHtml(metric.label)}</strong><br><span class="muted">${escapeHtml(metric.dimension)} · dominio ${Math.round(metric.mastery * 100)}% · vence ${escapeHtml(metric.due_at)}</span></div>
        <span class="tag">prioridad ${metric.priority}</span>
      </div>
    `).join('')
    : '<p class="empty">Aún no hay suficientes eventos para calcular métricas SRS.</p>';
}

function renderCalendar(srs, events) {
  const summary = document.getElementById('calendarSummary');
  const grid = document.getElementById('srsCalendarGrid');
  const plan = document.getElementById('srsStudyPlan');
  if (!summary || !grid || !plan) return;

  const today = todayKey();
  const practicedToday = events.filter(event => dateKey(new Date(event.timestamp)) === today).length;
  const dueToday = srs.calendar.find(day => day.date === today)?.due || 0;
  const nextDue = srs.calendar.reduce((sum, day) => sum + day.due, 0);
  summary.innerHTML = [
    ['Práctica hoy', practicedToday],
    ['Vencen hoy', dueToday],
    ['Vencen 28 días', nextDue],
    ['Targets débiles', srs.weak_targets.length]
  ].map(([label, value]) => `<article class="card"><div class="value">${escapeHtml(value)}</div><div class="label">${escapeHtml(label)}</div></article>`).join('');

  grid.innerHTML = srs.calendar.map(day => `
    <article class="calendar-day ${day.date === today ? 'today' : ''}">
      <strong>${formatCalendarDay(day.date)}</strong>
      <span>${day.due} target(s) SRS</span>
      <span>${day.practiced} práctica(s)</span>
    </article>
  `).join('');

  plan.innerHTML = srs.due_targets.length
    ? srs.due_targets.slice(0, 10).map(metric => `
      <div class="event-item">
        <div><strong>${escapeHtml(metric.label)}</strong><br><span class="muted">${escapeHtml(metric.dimension)} · ${metric.attempts} intento(s) · ${metric.wrong} fallo(s)</span></div>
        <span class="tag">${Math.round(metric.mastery * 100)}%</span>
      </div>
    `).join('')
    : '<p class="empty">No hay targets vencidos hoy. Practica una sesión corta para generar más datos.</p>';
}

function renderDataPreviewPatch(progress, events) {
  const progressPreview = document.getElementById('progressPreview');
  const eventsPreview = document.getElementById('eventsPreview');
  if (progressPreview) progressPreview.textContent = JSON.stringify(progress, null, 2).slice(0, 5000);
  if (eventsPreview) eventsPreview.textContent = events.map(event => JSON.stringify(event)).join('\n').slice(0, 5000);
}

function loadProgress() { return safeJson(localStorage.getItem(ADVANCED_KEYS.progress), {}); }
function loadEvents() { return safeJson(localStorage.getItem(ADVANCED_KEYS.events), []); }
function safeJson(raw, fallback) { try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
function rollingAverage(previous, value, attempts) { return previous === null || previous === undefined ? value : previous + ((value - previous) / attempts); }
function todayKey() { return dateKey(new Date()); }
function dateKey(date) { const safe = date instanceof Date ? date : new Date(date); if (Number.isNaN(safe.getTime())) return todayKey(); return `${safe.getFullYear()}-${String(safe.getMonth() + 1).padStart(2, '0')}-${String(safe.getDate()).padStart(2, '0')}`; }
function addDays(date, amount) { const next = new Date(date); next.setDate(next.getDate() + amount); next.setHours(0, 0, 0, 0); return next; }
function daysBetween(a, b) { const start = new Date(a); start.setHours(0, 0, 0, 0); const end = new Date(b); end.setHours(0, 0, 0, 0); return Math.round((end - start) / 86400000); }
function formatCalendarDay(key) { return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' }); }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function round(value, decimals) { return Number(value.toFixed(decimals)); }
function slugify(text) { return normalize(text).replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase(); }
function normalize(text) { return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
