// Corrección determinista. Todo ítem publicado se corrige aquí, sin excepción.

import { norm, levenshtein } from './util.js';

/** Pliega diacríticos (incluida la ñ) para comparar en igualdad de condiciones. */
function fold(text) {
  return (text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase();
}

/** Coincidencia por prefijo, para tolerar variación morfológica en español. */
function tokenPresent(token, words) {
  const t = fold(token);
  const stem = t.slice(0, 5);
  return words.some((w) => w.startsWith(stem) || t.startsWith(w.slice(0, 5)));
}

function spanishWords(text) {
  return fold(norm(text))
    .replace(/[^0-9a-z\s]/g, ' ')
    .split(/\s+/).filter(Boolean);
}

/**
 * Corrige un paso.
 * @returns {{status:'correcto'|'errata'|'incompleto'|'incorrecto', detail?:string, missing?:string[]}}
 */
export function gradeStep(step, value) {
  const given = (value || '').trim();
  if (!given) return { status: 'incorrecto', detail: 'No hay respuesta.' };

  if (step.kind === 'choice') {
    return norm(given) === norm(step.answer)
      ? { status: 'correcto' }
      : { status: 'incorrecto' };
  }

  const g = norm(given);

  if (step.mode === 'fragments') {
    const missing = (step.requiredFragments || []).filter((f) => !g.includes(f));
    if (!missing.length) return { status: 'correcto' };
    if (missing.length < (step.requiredFragments || []).length) {
      return {
        status: 'incompleto',
        detail: 'Falta parte del intercambio: cada laguna debe quedar cerrada.',
        missing,
      };
    }
    return { status: 'incorrecto' };
  }

  if (step.mode === 'tokens') {
    const words = spanishWords(given);
    const missing = (step.requiredTokens || []).filter((t) => !tokenPresent(t, words));
    if (!missing.length) return { status: 'correcto' };
    if (missing.length <= Math.floor((step.requiredTokens || []).length / 2)) {
      return { status: 'incompleto', detail: 'La respuesta no recoge toda la información pedida.', missing };
    }
    return { status: 'incorrecto' };
  }

  // modo exacto (ruso)
  const accepted = step.acceptedNorm || [];
  if (accepted.includes(g)) return { status: 'correcto' };
  const best = accepted.reduce(
    (acc, a) => Math.min(acc, levenshtein(g, a)), Infinity);
  if (best === 1 && g.length > 4) {
    return { status: 'errata', detail: 'Casi: hay un carácter mal. Corrígelo y vuelve a enviar.' };
  }
  return { status: 'incorrecto' };
}

export const OK_STATUS = new Set(['correcto']);

/** Dimensión de competencia que acredita cada paso, según el esquema del material. */
export function stepDimension(step) {
  if (step.dimension) return step.dimension;
  return step.kind === 'choice' ? 'reconocimiento_escrito' : 'recuperacion_escrita';
}
