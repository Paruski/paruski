export function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[?.!¿¡,;:«»“”"']/g, '')
    .replace(/\s+/g, ' ');
}

export function normalizeAnswer(value) {
  return normalizeText(value).replace(/\s+/g, ' ').trim();
}

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function dayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

export function addDays(value, amount) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setDate(date.getDate() + amount);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function startOfDay(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

export function hashString(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  })[ch]);
}

export function makeEventId(seed = {}) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `evt-${hashString(JSON.stringify(seed))}-${Date.now().toString(36)}`;
}

export function average(values) {
  const list = values.filter(value => Number.isFinite(value));
  return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0;
}

export function unique(values) {
  return [...new Set((values || []).filter(value => value !== null && value !== undefined && value !== ''))];
}

export function byNumber(a, b) {
  return Number(a) - Number(b);
}
