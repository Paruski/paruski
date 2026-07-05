import { makeEventId } from './utils.js';

const STORAGE_KEYS = {
  progress: 'paruski.progress.v1',
  events: 'paruski.events.v1',
  sync: 'paruski.githubSync.v1',
  tokenSession: 'paruski.githubKey.session',
  tokenLocal: 'paruski.githubKey.local'
};

const DEFAULT_PROGRESS = {
  version: 3,
  updated_at: null,
  user: { id: 'usuario-local', name: 'usuario-local', created_at: null },
  settings: {
    dailyTarget: 8,
    sessionMinutes: 10
  },
  unlocked: {
    lessonMax: 5,
    level: 'ru-a0-seed'
  },
  lessons: {},
  targets: {},
  competencies: {},
  items: {}
};

const DEFAULT_SYNC = {
  repoFullName: 'Paruski/paruski',
  branch: 'main',
  lastSyncAt: null
};

export function createStorage() {
  return {
    keys: STORAGE_KEYS,
    defaultProgress: DEFAULT_PROGRESS,
    loadProgress,
    saveProgress,
    loadEvents,
    saveEvents,
    appendEvent,
    loadSyncConfig,
    saveSyncConfig,
    getToken,
    saveToken,
    forgetToken,
    downloadJson,
    downloadText,
    resetLocal
  };
}

function loadProgress() {
  const stored = readJson(STORAGE_KEYS.progress, null);
  const now = new Date().toISOString();
  const progress = mergeProgress(DEFAULT_PROGRESS, stored || {});
  if (!progress.user?.id) {
    progress.user = { id: 'usuario-local', name: 'usuario-local', created_at: now };
  }
  if (!progress.user.created_at) progress.user.created_at = now;
  progress.settings = { ...DEFAULT_PROGRESS.settings, ...(progress.settings || {}) };
  progress.unlocked = { ...DEFAULT_PROGRESS.unlocked, ...(progress.unlocked || {}) };
  progress.targets = progress.targets || {};
  progress.competencies = progress.competencies || {};
  progress.lessons = progress.lessons || {};
  progress.items = progress.items || {};
  return progress;
}

function saveProgress(progress) {
  const next = {
    ...mergeProgress(DEFAULT_PROGRESS, progress || {}),
    updated_at: new Date().toISOString()
  };
  localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(next, null, 2));
  return next;
}

function loadEvents() {
  const events = readJson(STORAGE_KEYS.events, []);
  return Array.isArray(events) ? events : [];
}

function saveEvents(events) {
  const next = (Array.isArray(events) ? events : []).map((event, index) => ({
    ...event,
    event_id: event.event_id || makeEventId({ event, index })
  }));
  localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(next, null, 2));
  return next;
}

function appendEvent(partial) {
  const events = loadEvents();
  const event = {
    event_id: partial.event_id || makeEventId(partial),
    timestamp: partial.timestamp || new Date().toISOString(),
    user_id: partial.user_id || loadProgress().user?.id || 'usuario-local',
    ...partial
  };
  events.push(event);
  saveEvents(events);
  return event;
}

function loadSyncConfig() {
  return { ...DEFAULT_SYNC, ...readJson(STORAGE_KEYS.sync, {}) };
}

function saveSyncConfig(config) {
  const next = { ...DEFAULT_SYNC, ...(config || {}) };
  localStorage.setItem(STORAGE_KEYS.sync, JSON.stringify(next, null, 2));
  return next;
}

function getToken() {
  return sessionStorage.getItem(STORAGE_KEYS.tokenSession) || localStorage.getItem(STORAGE_KEYS.tokenLocal) || '';
}

function saveToken(token, remember = false) {
  sessionStorage.removeItem(STORAGE_KEYS.tokenSession);
  localStorage.removeItem(STORAGE_KEYS.tokenLocal);
  const value = String(token || '').trim();
  if (!value) return;
  if (remember) localStorage.setItem(STORAGE_KEYS.tokenLocal, value);
  else sessionStorage.setItem(STORAGE_KEYS.tokenSession, value);
}

function forgetToken() {
  sessionStorage.removeItem(STORAGE_KEYS.tokenSession);
  localStorage.removeItem(STORAGE_KEYS.tokenLocal);
}

function downloadJson(filename, data) {
  downloadText(filename, JSON.stringify(data, null, 2), 'application/json');
}

function downloadText(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function resetLocal() {
  Object.values(STORAGE_KEYS).forEach(key => {
    if (!key.includes('githubKey')) localStorage.removeItem(key);
  });
  sessionStorage.removeItem(STORAGE_KEYS.tokenSession);
}

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function mergeProgress(base, value) {
  return {
    ...base,
    ...(value || {}),
    user: { ...(base.user || {}), ...((value || {}).user || {}) },
    settings: { ...(base.settings || {}), ...((value || {}).settings || {}) },
    unlocked: { ...(base.unlocked || {}), ...((value || {}).unlocked || {}) },
    lessons: { ...(base.lessons || {}), ...((value || {}).lessons || {}) },
    targets: { ...(base.targets || {}), ...((value || {}).targets || {}) },
    competencies: { ...(base.competencies || {}), ...((value || {}).competencies || {}) },
    items: { ...(base.items || {}), ...((value || {}).items || {}) }
  };
}
