// Utilidades comunes: DOM mínimo, normalización y formato.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    // Un estado ARIA se escribe siempre como texto: aria-selected="" no es
    // verdadero para el CSS ni para el lector de pantalla, y omitir el atributo
    // no es lo mismo que declararlo falso.
    if (k.startsWith('aria-') && typeof v === 'boolean') { el.setAttribute(k, String(v)); continue; }
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Normalización de respuesta, idéntica a la del build en Python.
 *  En modo estricto se conserva la ё, porque hay ítems en los que esa letra
 *  es justamente lo que se evalúa. */
export function norm(text, strict = false) {
  const folded = (text || '')
    .normalize('NFD').replace(/[̀́]/g, '').normalize('NFC')
    .trim().toLowerCase();
  return (strict ? folded : folded.replace(/ё/g, 'е'))
    .replace(/[«»"“”„']/g, '')
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*([,.;:!?])/g, '$1')
    .replace(/\.+$/, '')
    .trim();
}

/** Quita sólo la marca de acento editorial, conservando el resto. */
export function unstress(text) {
  return (text || '').normalize('NFD').replace(/[̀́]/g, '').normalize('NFC');
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function shuffle(list, seed = Date.now()) {
  const out = list.slice();
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const DAY = 86400000;

export function relTime(ts) {
  if (!ts) return '—';
  const diff = ts - Date.now();
  const days = Math.round(diff / DAY);
  if (diff <= 0) return 'ahora';
  if (days <= 0) return 'hoy';
  if (days === 1) return 'mañana';
  return `en ${days} días`;
}

export function pct(value) {
  return `${Math.round((value || 0) * 100)}%`;
}
