// Modelo del alumno y programación del repaso.
//
// El repaso se programa SOBRE COMPETENCIAS, no sobre ítems: cada competencia
// lleva su propio intervalo y su perfil de dimensiones. Un ítem sólo es el
// vehículo con el que se mide o se reactiva la competencia, y no vuelve a
// aparecer si hay otro ítem disponible que ejercite lo mismo en otro contexto.

import { DAY } from './util.js';

const KEY = 'paruski.progreso.v1';
const PASS_MARK = 0.8;

export const DIMENSIONS = [
  ['comprension_explicita', 'Comprensión explícita', 'Sabe explicar por qué'],
  ['reconocimiento_escrito', 'Reconocimiento escrito', 'Distingue la forma correcta entre alternativas'],
  ['recuperacion_escrita', 'Recuperación escrita', 'Produce la forma sin modelo'],
  ['transferencia_contextual', 'Transferencia', 'Resuelve situaciones nuevas'],
  ['retencion_diferida', 'Retención diferida', 'Recupera tras días sin verlo'],
  ['reconocimiento_auditivo', 'Reconocimiento auditivo', 'Pendiente: falta locución validada'],
];

const INTERVALS = [1, 3, 7, 16, 35, 70, 140];

function emptySkill() {
  const dims = {};
  for (const [id] of DIMENSIONS) dims[id] = { s: 0, ok: 0, n: 0, last: 0 };
  return { dims, step: -1, due: 0, lapses: 0, seen: 0, lastSeen: 0, assisted: 0 };
}

function emptyState() {
  return { v: 1, skills: {}, units: {}, items: {}, events: [], settings: { theme: 'dark' } };
}

class Store {
  constructor() {
    this.state = this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw);
      return { ...emptyState(), ...parsed };
    } catch {
      return emptyState();
    }
  }

  save() {
    try {
      if (this.state.events.length > 1500) {
        this.state.events = this.state.events.slice(-1500);
      }
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch { /* almacenamiento lleno o bloqueado: el prototipo sigue funcionando en memoria */ }
  }

  reset() {
    this.state = emptyState();
    this.save();
  }

  // ------------------------------------------------------------ competencias

  skill(id) {
    if (!this.state.skills[id]) this.state.skills[id] = emptySkill();
    const s = this.state.skills[id];
    for (const [dim] of DIMENSIONS) if (!s.dims[dim]) s.dims[dim] = { s: 0, ok: 0, n: 0, last: 0 };
    return s;
  }

  /** Fuerza global de una competencia: media de las dimensiones ya evaluadas. */
  strength(id) {
    const s = this.state.skills[id];
    if (!s) return 0;
    const active = DIMENSIONS.map(([d]) => s.dims[d]).filter((d) => d && d.n > 0);
    if (!active.length) return 0;
    return active.reduce((acc, d) => acc + d.s, 0) / active.length;
  }

  weakestDimension(id) {
    const s = this.skill(id);
    const usable = DIMENSIONS.filter(([d]) => d !== 'reconocimiento_auditivo');
    let worst = usable[0][0];
    let worstValue = Infinity;
    for (const [dim] of usable) {
      const d = s.dims[dim];
      const value = d.n === 0 ? -1 : d.s; // lo nunca medido es lo más urgente
      if (value < worstValue) { worstValue = value; worst = dim; }
    }
    return worst;
  }

  /**
   * Registra el resultado de un ítem completo.
   * @param {object} item ítem de ejecución
   * @param {Array} results [{step, status, assisted}]
   */
  recordItem(item, results) {
    const now = Date.now();
    const allCorrect = results.every((r) => r.status === 'correcto');
    const assisted = results.some((r) => r.assisted);
    const skillIds = item.skillIds && item.skillIds.length ? item.skillIds : [item.skillId].filter(Boolean);

    for (const skillId of skillIds) {
      const skill = this.skill(skillId);
      const gapDays = skill.lastSeen ? (now - skill.lastSeen) / DAY : 0;

      for (const r of results) {
        const dim = r.step.dimension || (r.step.kind === 'choice' ? 'reconocimiento_escrito' : 'recuperacion_escrita');
        const d = skill.dims[dim];
        d.n += 1;
        d.last = now;
        if (r.status === 'correcto') {
          d.ok += 1;
          // el éxito con pista acredita menos: queda registrado como dependencia de clave
          d.s = d.s + (1 - d.s) * (r.assisted ? 0.18 : 0.42);
        } else {
          d.s = d.s * 0.5;
        }
        // la retención diferida sólo se acredita con recuperación no asistida tras días
        if (dim === 'recuperacion_escrita' && r.status === 'correcto' && !r.assisted && gapDays >= 7) {
          const dd = skill.dims.retencion_diferida;
          dd.n += 1; dd.ok += 1; dd.last = now;
          dd.s = dd.s + (1 - dd.s) * 0.5;
        }
      }

      skill.seen += 1;
      skill.lastSeen = now;
      if (assisted) skill.assisted += 1;

      if (allCorrect && !assisted) {
        skill.step = Math.min(skill.step + 1, INTERVALS.length - 1);
        skill.due = now + INTERVALS[Math.max(skill.step, 0)] * DAY;
      } else if (allCorrect) {
        skill.step = Math.max(skill.step, 0);
        skill.due = now + INTERVALS[Math.max(skill.step, 0)] * DAY * 0.5;
      } else {
        skill.lapses += 1;
        skill.step = -1;
        skill.due = now; // vuelve a la cola de forma inmediata
      }
    }

    const seen = this.state.items[item.id] || { n: 0, ok: 0 };
    seen.n += 1;
    if (allCorrect) seen.ok += 1;
    seen.last = now;
    this.state.items[item.id] = seen;

    this.state.events.push({
      t: now, item: item.id, unit: item.unit, skills: skillIds,
      ok: allCorrect, assisted, phase: item.phase,
      steps: results.map((r) => ({ k: r.step.kind, d: r.step.dimension, s: r.status })),
    });
    this.save();
  }

  dueSkills(now = Date.now()) {
    return Object.entries(this.state.skills)
      .filter(([, s]) => s.seen > 0 && s.due <= now)
      .sort((a, b) => (a[1].due - b[1].due) || (this.strength(a[0]) - this.strength(b[0])))
      .map(([id]) => id);
  }

  // -------------------------------------------------------------- unidades

  unit(n) {
    if (!this.state.units[n]) {
      this.state.units[n] = { lesson: false, practiced: 0, exam: { attempts: 0, best: 0, passed: false } };
    }
    return this.state.units[n];
  }

  markLessonRead(n) {
    this.unit(n).lesson = true;
    this.save();
  }

  recordExam(n, score, detail) {
    const u = this.unit(n);
    u.exam.attempts += 1;
    u.exam.best = Math.max(u.exam.best, score);
    u.exam.last = score;
    u.exam.lastAt = Date.now();
    u.exam.detail = detail;
    if (score >= PASS_MARK) u.exam.passed = true;
    this.save();
    return u.exam;
  }

  isUnlocked(n) {
    if (n <= 1) return true;
    return !!this.unit(n - 1).exam.passed;
  }

  highestUnlocked(total) {
    let last = 1;
    for (let n = 1; n <= total; n++) if (this.isUnlocked(n)) last = n;
    return last;
  }

  get settings() { return this.state.settings; }

  setSetting(key, value) {
    this.state.settings[key] = value;
    this.save();
  }
}

export const store = new Store();
export { PASS_MARK };
