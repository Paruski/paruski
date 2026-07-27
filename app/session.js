// Construcción de sesiones: qué ítem toca ahora y por qué.
//
// Regla: la unidad de programación es la competencia. Dentro de una competencia
// se elige el ítem que ataca su dimensión más débil, en un contexto distinto del
// último visto, y sólo se repite un ítem si no queda otro que ejercite lo mismo.

import { store } from './store.js';
import { shuffle } from './util.js';

const STAGE_ORDER = {
  discovery: 0,
  guided_recognition: 1,
  same_session_retrieval: 2,
  next_day_retrieval: 3,
  contextual_transfer: 4,
  delayed_retention: 5,
  practice: 3,
};

const DIMENSION_OF_TYPE = {
  contextual_choice: 'reconocimiento_escrito',
  semantic_contrast: 'comprension_explicita',
  inductive_generalization: 'comprension_explicita',
  diagnostic_repair: 'comprension_explicita',
  backtranslation_critique: 'comprension_explicita',
  cloze: 'recuperacion_escrita',
  transformation: 'recuperacion_escrita',
  translation_es_ru: 'recuperacion_escrita',
  production: 'recuperacion_escrita',
  translation_ru_es: 'comprension_explicita',
  reading_comprehension: 'comprension_explicita',
  constrained_transfer: 'transferencia_contextual',
  information_gap_reconstruction: 'transferencia_contextual',
};

export function itemDimensions(item) {
  const dims = new Set(item.steps.map((s) => s.dimension).filter(Boolean));
  if (DIMENSION_OF_TYPE[item.type]) dims.add(DIMENSION_OF_TYPE[item.type]);
  return [...dims];
}

/** Puntuación de idoneidad de un ítem para reactivar una competencia. */
function scoreForSkill(item, skillId, now) {
  const weak = store.weakestDimension(skillId);
  const seen = store.state.items[item.id];
  let score = 0;
  if (itemDimensions(item).includes(weak)) score += 40;
  if (!seen) score += 30;
  else {
    const days = (now - (seen.last || 0)) / 86400000;
    score += Math.min(days * 2, 20);
    score -= Math.min(seen.n * 6, 24);      // penaliza la repetición del mismo ítem
    if (seen.ok === 0) score += 8;          // lo fallado vuelve antes
  }
  if (item.phase === 'transfer') score += 6;
  return score;
}

/** Repaso: recorre las competencias vencidas y elige un ítem para cada una. */
export function buildReviewSession(pool, limit = 14) {
  const now = Date.now();
  const due = store.dueSkills(now);
  const chosen = [];
  const used = new Set();

  for (const skillId of due) {
    const candidates = pool.filter(
      (item) => item.phase !== 'exam' && !used.has(item.id)
        && (item.skillIds || []).includes(skillId));
    if (!candidates.length) continue;
    candidates.sort((a, b) => scoreForSkill(b, skillId, now) - scoreForSkill(a, skillId, now));
    const pick = candidates[0];
    used.add(pick.id);
    chosen.push({ ...pick, reason: { kind: 'repaso', skillId } });
    if (chosen.length >= limit) break;
  }
  return chosen;
}

/** Práctica de una unidad, con repaso entrelazado de lo anterior. */
export function buildPracticeSession(unitItems, reviewPool, { size = 12, reviews = 4 } = {}) {
  const now = Date.now();
  const practice = unitItems.filter((i) => i.phase !== 'exam');

  const ranked = practice.map((item) => {
    const seen = store.state.items[item.id];
    const stage = STAGE_ORDER[item.stage] ?? 3;
    let score = 100 - stage * 10;
    if (!seen) score += 25;
    else {
      score -= Math.min(seen.n * 10, 40);
      if (seen.ok === 0) score += 12;
      score += Math.min((now - (seen.last || 0)) / 86400000, 10);
    }
    return { item, score, stage };
  });

  ranked.sort((a, b) => b.score - a.score || a.stage - b.stage);
  const main = ranked.slice(0, size).sort((a, b) => a.stage - b.stage).map((r) => r.item);

  const review = buildReviewSession(reviewPool, reviews)
    .filter((r) => !main.some((m) => m.id === r.id));

  // el repaso se intercala, no se acumula al final
  const out = [];
  const gap = Math.max(2, Math.floor(main.length / (review.length + 1)));
  let ri = 0;
  main.forEach((item, index) => {
    out.push(item);
    if (ri < review.length && (index + 1) % gap === 0) out.push(review[ri++]);
  });
  while (ri < review.length) out.push(review[ri++]);
  return out;
}

/** Examen de unidad: todos los ítems de evaluación, sin corrección hasta el final. */
export function buildExam(unitItems) {
  return shuffle(unitItems.filter((i) => i.phase === 'exam'), 20260727);
}
