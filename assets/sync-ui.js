import { fetchJsonFile, fetchTextFile, isConflictError, isNotFoundError, parseNdjson, putTextFile, toNdjson } from './github-sync.js';

const STORAGE_KEYS = {
  progress: 'paruski.progress.v1',
  events: 'paruski.events.v1',
  sync: 'paruski.githubSync.v1',
  sessionKey: 'paruski.githubKey.session',
  localKey: 'paruski.githubKey.local'
};

const DEFAULT_SYNC = {
  repoFullName: 'Paruski/paruski',
  branch: 'main',
  lastSyncAt: null,
  progressSha: null,
  reviewQueueSha: null,
  eventFileShas: {}
};

const PROGRESS_PATH = 'data/progress.json';
const REVIEW_QUEUE_PATH = 'data/review-queue.json';

let els = {};

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', mountSyncPanel);
} else {
  mountSyncPanel();
}

function mountSyncPanel() {
  const panel = document.querySelector('#settings .panel');
  if (!panel || document.getElementById('githubSyncBox')) return;

  const box = document.createElement('section');
  box.id = 'githubSyncBox';
  box.className = 'sync-box';
  box.append(
    makeTitle(),
    makeText('La app funciona sin conexión. Esta opción copia el progreso a GitHub Pages usando archivos en data/.'),
    makeForm(),
    makeActions(),
    makeStatus(),
    makeConflictBox()
  );

  const codeGrid = panel.querySelector('.code-grid');
  panel.insertBefore(box, codeGrid || panel.firstChild);
  cacheElements();
  loadConfigIntoForm();
  bindEvents();
}

function makeTitle() {
  const title = document.createElement('h3');
  title.textContent = 'Sincronización con GitHub';
  return title;
}

function makeText(text) {
  const p = document.createElement('p');
  p.className = 'muted small';
  p.textContent = text;
  return p;
}

function makeForm() {
  const wrap = document.createElement('div');
  wrap.className = 'sync-grid';
  wrap.append(
    labelledInput('Repositorio', 'syncRepoInput', 'text'),
    labelledInput('Rama', 'syncBranchInput', 'text'),
    labelledInput('Clave GitHub', 'syncKeyInput', 'password', 'Contents: Read and write'),
    checkboxInput('Recordar clave en este navegador', 'syncRememberInput')
  );
  return wrap;
}

function labelledInput(labelText, id, type, placeholder = '') {
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.id = id;
  input.type = type;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = placeholder;
  label.append(input);
  return label;
}

function checkboxInput(labelText, id) {
  const label = document.createElement('label');
  label.className = 'checkbox-row';
  const input = document.createElement('input');
  input.id = id;
  input.type = 'checkbox';
  label.append(input, document.createTextNode(` ${labelText}`));
  return label;
}

function makeActions() {
  const wrap = document.createElement('div');
  wrap.className = 'sync-actions';
  wrap.append(
    button('syncTestBtn', 'Probar conexión', 'secondary'),
    button('syncLoadBtn', 'Cargar remoto', 'secondary'),
    button('syncNowBtn', 'Sincronizar ahora', ''),
    button('syncForgetBtn', 'Olvidar clave', 'secondary')
  );
  return wrap;
}

function button(id, text, className) {
  const btn = document.createElement('button');
  btn.id = id;
  btn.type = 'button';
  btn.textContent = text;
  if (className) btn.className = className;
  return btn;
}

function makeStatus() {
  const status = document.createElement('div');
  status.id = 'syncStatus';
  status.className = 'sync-status info';
  status.textContent = 'Sin conexión remota configurada.';
  return status;
}

function makeConflictBox() {
  const box = document.createElement('div');
  box.id = 'syncConflictBox';
  box.className = 'sync-conflict';
  box.hidden = true;
  box.append(
    makeText('Conflicto remoto: no se ha sobrescrito GitHub. Reintenta para leer la versión actual y fusionar por event_id.'),
    button('syncRetryBtn', 'Reintentar fusión', ''),
    button('syncBackupBtn', 'Exportar copia local', 'secondary')
  );
  return box;
}

function cacheElements() {
  els = {
    repo: document.getElementById('syncRepoInput'),
    branch: document.getElementById('syncBranchInput'),
    key: document.getElementById('syncKeyInput'),
    remember: document.getElementById('syncRememberInput'),
    status: document.getElementById('syncStatus'),
    conflict: document.getElementById('syncConflictBox')
  };
}

function bindEvents() {
  document.getElementById('syncTestBtn')?.addEventListener('click', testConnection);
  document.getElementById('syncLoadBtn')?.addEventListener('click', loadRemoteProgress);
  document.getElementById('syncNowBtn')?.addEventListener('click', syncNow);
  document.getElementById('syncForgetBtn')?.addEventListener('click', forgetKey);
  document.getElementById('syncRetryBtn')?.addEventListener('click', syncNow);
  document.getElementById('syncBackupBtn')?.addEventListener('click', exportLocalBackup);
  [els.repo, els.branch, els.remember].forEach(el => el?.addEventListener('change', saveConfigFromForm));
  els.key?.addEventListener('change', saveKeyFromForm);
}

function loadConfigIntoForm() {
  const config = loadSyncConfig();
  els.repo.value = config.repoFullName;
  els.branch.value = config.branch;
  els.key.value = getStoredKey() || '';
  els.remember.checked = Boolean(localStorage.getItem(STORAGE_KEYS.localKey));
}

function loadSyncConfig() {
  try {
    return { ...DEFAULT_SYNC, ...(JSON.parse(localStorage.getItem(STORAGE_KEYS.sync)) || {}) };
  } catch {
    return { ...DEFAULT_SYNC };
  }
}

function saveSyncConfig(config) {
  localStorage.setItem(STORAGE_KEYS.sync, JSON.stringify(config, null, 2));
}

function saveConfigFromForm() {
  const previous = loadSyncConfig();
  saveSyncConfig({ ...previous, repoFullName: els.repo.value.trim() || DEFAULT_SYNC.repoFullName, branch: els.branch.value.trim() || DEFAULT_SYNC.branch });
  saveKeyFromForm();
}

function saveKeyFromForm() {
  const value = els.key.value.trim();
  sessionStorage.removeItem(STORAGE_KEYS.sessionKey);
  localStorage.removeItem(STORAGE_KEYS.localKey);
  if (!value) return;
  if (els.remember.checked) localStorage.setItem(STORAGE_KEYS.localKey, value);
  else sessionStorage.setItem(STORAGE_KEYS.sessionKey, value);
}

function getStoredKey() {
  return sessionStorage.getItem(STORAGE_KEYS.sessionKey) || localStorage.getItem(STORAGE_KEYS.localKey) || '';
}

function githubOptions() {
  saveConfigFromForm();
  const config = loadSyncConfig();
  return { repoFullName: config.repoFullName, branch: config.branch, secret: getStoredKey(), config };
}

async function testConnection() {
  setBusy('Probando conexión...');
  try {
    const options = githubOptions();
    const remote = await fetchJsonFile({ ...options, path: PROGRESS_PATH });
    saveSyncConfig({ ...options.config, progressSha: remote.sha });
    setStatus('Conexión correcta. Progreso remoto leído.', 'ok');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function loadRemoteProgress() {
  setBusy('Cargando progreso remoto...');
  try {
    const options = githubOptions();
    const remote = await fetchJsonFile({ ...options, path: PROGRESS_PATH });
    const merged = mergeProgress(loadProgress(), remote.data || {});
    saveProgress(merged);
    saveSyncConfig({ ...options.config, progressSha: remote.sha, lastSyncAt: new Date().toISOString() });
    setStatus('Progreso remoto cargado y fusionado localmente.', 'ok');
    location.reload();
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function syncNow() {
  setBusy('Sincronizando...');
  try {
    const options = githubOptions();
    const events = ensureEventIds(loadEvents());
    saveEvents(events);
    const byDate = groupEventsByDate(events);
    const eventFileShas = { ...(options.config.eventFileShas || {}) };

    for (const [date, localEvents] of Object.entries(byDate)) {
      const path = `data/events/${date}.ndjson`;
      const remote = await readRemoteEvents({ ...options, path });
      const mergedEvents = mergeEvents(remote.events, localEvents);
      const result = await putTextFile({ ...options, path, content: toNdjson(mergedEvents), sha: remote.sha, message: `Sync learning events ${date}` });
      eventFileShas[path] = result.contentSha;
    }

    const progressRemote = await fetchJsonFile({ ...options, path: PROGRESS_PATH }).catch(error => {
      if (isNotFoundError(error)) return { data: {}, sha: null };
      throw error;
    });
    const progress = mergeProgress(progressRemote.data || {}, loadProgress());
    progress.updated_at = new Date().toISOString();
    const progressResult = await putTextFile({ ...options, path: PROGRESS_PATH, content: JSON.stringify(progress, null, 2) + '\n', sha: progressRemote.sha, message: 'Sync learning progress' });

    const queue = buildReviewSnapshot(progress, events);
    const queueRemote = await fetchJsonFile({ ...options, path: REVIEW_QUEUE_PATH }).catch(error => {
      if (isNotFoundError(error)) return { data: {}, sha: null };
      throw error;
    });
    const queueResult = await putTextFile({ ...options, path: REVIEW_QUEUE_PATH, content: JSON.stringify(queue, null, 2) + '\n', sha: queueRemote.sha, message: 'Sync review queue' });

    saveProgress(progress);
    saveSyncConfig({ ...options.config, progressSha: progressResult.contentSha, reviewQueueSha: queueResult.contentSha, eventFileShas, lastSyncAt: new Date().toISOString() });
    hideConflict();
    setStatus('Sincronización completada.', 'ok');
  } catch (error) {
    if (isConflictError(error)) showConflict();
    setStatus(error.message, isConflictError(error) ? 'conflict' : 'error');
  }
}

async function readRemoteEvents(options) {
  try {
    const file = await fetchTextFile(options);
    return { events: parseNdjson(file.content), sha: file.sha };
  } catch (error) {
    if (isNotFoundError(error)) return { events: [], sha: null };
    throw error;
  }
}

function loadProgress() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.progress)) || {}; } catch { return {}; }
}

function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(progress, null, 2));
}

function loadEvents() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.events)) || []; } catch { return []; }
}

function saveEvents(events) {
  localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(events, null, 2));
}

function ensureEventIds(events) {
  return (events || []).map((event, index) => event.event_id ? event : { ...event, event_id: makeEventId(event, index) });
}

function makeEventId(event, index) {
  const base = [event.timestamp, event.user_id, event.item_id, event.answer, index].join('|');
  let hash = 0;
  for (let i = 0; i < base.length; i += 1) hash = ((hash << 5) - hash + base.charCodeAt(i)) | 0;
  return `evt-${Math.abs(hash).toString(36)}-${Date.now().toString(36)}-${index}`;
}

function groupEventsByDate(events) {
  return events.reduce((groups, event) => {
    const date = String(event.timestamp || new Date().toISOString()).slice(0, 10);
    groups[date] = groups[date] || [];
    groups[date].push(event);
    return groups;
  }, {});
}

function mergeEvents(a, b) {
  const map = new Map();
  [...(a || []), ...(b || [])].forEach((event, index) => {
    const id = event.event_id || makeEventId(event, index);
    map.set(id, { ...event, event_id: id });
  });
  return [...map.values()].sort((left, right) => String(left.timestamp).localeCompare(String(right.timestamp)));
}

function mergeProgress(remote, local) {
  return {
    ...remote,
    ...local,
    lessons: { ...(remote.lessons || {}), ...(local.lessons || {}) },
    items: { ...(remote.items || {}), ...(local.items || {}) },
    settings: { ...(remote.settings || {}), ...(local.settings || {}) }
  };
}

function buildReviewSnapshot(progress, events) {
  const items = Object.entries(progress.items || {}).map(([itemId, value]) => ({ item_id: itemId, mastery: value.mastery || 0, wrong: value.wrong || 0, last_seen: value.last_seen || null }));
  return {
    version: 1,
    updated_at: new Date().toISOString(),
    due_today: items.sort((a, b) => (a.mastery - b.mastery) || (b.wrong - a.wrong)).slice(0, 20),
    event_count: events.length
  };
}

function exportLocalBackup() {
  const backup = { progress: loadProgress(), events: loadEvents(), exported_at: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'paruski-local-backup.json';
  link.click();
  URL.revokeObjectURL(url);
}

function forgetKey() {
  sessionStorage.removeItem(STORAGE_KEYS.sessionKey);
  localStorage.removeItem(STORAGE_KEYS.localKey);
  if (els.key) els.key.value = '';
  setStatus('Clave olvidada en este navegador.', 'info');
}

function setBusy(message) {
  hideConflict();
  setStatus(message, 'info');
}

function setStatus(message, kind) {
  if (!els.status) return;
  els.status.textContent = message;
  els.status.className = `sync-status ${kind}`;
}

function showConflict() {
  if (els.conflict) els.conflict.hidden = false;
}

function hideConflict() {
  if (els.conflict) els.conflict.hidden = true;
}
