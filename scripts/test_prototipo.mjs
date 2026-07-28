// Prueba de humo del prototipo: monta la aplicación en jsdom, recorre una
// sesión de práctica y un examen completo, y comprueba que la corrección,
// el desbloqueo y la programación del repaso se comportan como se espera.
//
//   node --experimental-vm-modules scripts/test_prototipo.mjs
// (requiere jsdom instalado en el entorno de pruebas)

import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let failures = 0;

function check(name, condition, extra = '') {
  const ok = !!condition;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FALLA'} ${name}${ok || !extra ? '' : ` · ${extra}`}`);
}

const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), {
  url: 'https://paruski.github.io/paruski/',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.localStorage = dom.window.localStorage;
global.Node = dom.window.Node;
global.Blob = dom.window.Blob;
global.Audio = class { play() { return Promise.resolve(); } pause() {} };
global.fetch = async (url) => {
  const file = path.join(ROOT, String(url).replace(/^\/+/, ''));
  if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
};

const { store } = await import('../app/store.js');
const { gradeStep } = await import('../app/grader.js');
const { buildPracticeSession, buildReviewSession, buildExam } = await import('../app/session.js');

const curriculum = JSON.parse(fs.readFileSync(path.join(ROOT, 'curso/curriculum.json'), 'utf8'));
const units = [];
for (let n = 1; n <= curriculum.units.length; n++) {
  units.push(JSON.parse(fs.readFileSync(path.join(ROOT, `curso/unidades/unidad-${String(n).padStart(3, '0')}.json`), 'utf8')));
}
const all = units.flatMap((u) => u.items);

// ---------------------------------------------------------------- contenido

check('11 unidades', curriculum.units.length === 11, `hay ${curriculum.units.length}`);
check('todas las unidades tienen examen', units.every((u) => u.items.some((i) => i.phase === 'exam')));
check('todo ítem tiene al menos un paso', all.every((i) => i.steps.length > 0));
check('todo paso es corregible', all.every((i) => i.steps.every((s) =>
  (s.kind === 'choice' && s.options.includes(s.answer))
  || (s.kind === 'written' && ((s.acceptedNorm || []).length || (s.requiredFragments || []).length)))));
check('ningún ítem de examen aparece en la práctica',
  all.filter((i) => i.phase === 'exam').every((e) => !all.some((p) => p.phase !== 'exam' && p.id === e.id)));
check('todo ítem declara competencia', all.every((i) => (i.skillIds || []).length));

// El examen abre la unidad siguiente: no puede dejar competencias sin comprobar,
// ni darlas por adquiridas sólo con reconocerlas.
const RECONOCER = new Set(['comprension_explicita', 'reconocimiento_escrito']);
const PRODUCIR = new Set(['recuperacion_escrita', 'transferencia_contextual']);
const dimsDe = (i) => new Set(i.steps.map((s) => s.dimension).filter(Boolean));
const cubre = (examen, skill, quiere) => examen.some((i) => (i.skillIds || []).includes(skill)
  && [...dimsDe(i)].some((d) => quiere.has(d)));
const sinCubrir = [];
for (const u of units) {
  const n = u.unit.unit;
  const examen = u.items.filter((i) => i.phase === 'exam');
  for (const skill of curriculum.skills.filter((s) => s.unit === n).map((s) => s.skillId)) {
    if (!cubre(examen, skill, RECONOCER)) sinCubrir.push(`${n}:${skill}:reconocer`);
    if (!cubre(examen, skill, PRODUCIR)) sinCubrir.push(`${n}:${skill}:producir`);
  }
}
check('el examen comprueba todas las competencias de su unidad',
  sinCubrir.length === 0, sinCubrir.slice(0, 3).join(' '));
check('el examen las comprueba reconociendo y produciendo', sinCubrir.length === 0);

// una consigna que pide la frase y un contrato que dice «sólo la palabra» hacen
// fallar a quien obedece
const contradicen = all.flatMap((i) => i.steps).filter((s) => s.kind === 'written'
  && /sólo la palabra/.test(s.expects || '')
  && ((s.accepted || [])[0] || '').trim().split(/\s+/).length > 1);
check('ningún contrato de respuesta contradice a su consigna',
  contradicen.length === 0, contradicen.slice(0, 2).map((s) => s.id).join(' '));

// una frase de infinitivo entre oraciones con verbo conjugado (o al revés) tiene
// otra pinta que sus compañeras, y eso se ve antes de leerla
const esInfinitivo = (t) => /^(\S+)/.test(t || '') && /(ar|er|ir)$/i.test((t || '').trim().split(/\s+/)[0] || '');
check('las opciones conceptuales comparten forma gramatical',
  all.flatMap((i) => i.steps)
    .filter((s) => s.kind === 'choice' && s.dimension === 'comprension_explicita')
    .every((s) => new Set(s.options.filter((o) => !/^Las dos/.test(o)).map(esInfinitivo)).size <= 1));

check('hay ejercicios de vocabulario en todas las unidades',
  units.every((u) => u.items.some((i) => i.type === 'vocabulary')));

// pliega los homoglifos latinos, pero conserva la puntuación: «Что это?» y
// «Что это.» son formas distintas y perfectamente visibles
const fold = (t) => t.normalize('NFD').replace(/[\u0300\u0301]/g, '').normalize('NFC').toLowerCase()
  .replace(/[aeopcyxkmtbh]/g, (c) => ({ a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', y: 'у', x: 'х', k: 'к', m: 'м', t: 'т', b: 'в', h: 'н' }[c]))
  .replace(/\s+/g, ' ').trim();

const isStressStep = (s) => s.kind === 'choice' && s.options.every((o) => /vocal\)$/.test(o));

check('ninguna elección ofrece dos opciones idénticas en pantalla',
  all.every((i) => i.steps.every((s) => {
    if (s.kind !== 'choice') return true;
    const folded = s.options.map(fold);
    return new Set(folded).size === folded.length;
  })));

// la opción que no lleva la mayúscula que llevan las demás se ve distinta antes
// de leerse, y eso basta para delatarla
check('ninguna opción destaca por su mayúscula inicial',
  all.every((i) => i.steps.every((s) => {
    if (s.kind !== 'choice') return true;
    const ru = s.options.map((o) => o.trim()).filter((o) => /^[а-яА-ЯёЁ]/.test(o));
    return new Set(ru.map((o) => o[0] === o[0].toUpperCase())).size <= 1;
  })));

check('ningún paso escrito exige teclear la marca de acento',
  all.every((i) => i.steps.every((s) => s.kind !== 'written'
    || (s.accepted || []).every((a) => !a.includes('\u0301')))));

// el material trae ítems cuya respuesta es sólo la vocal tónica; si eso llega al
// paso que pide escribir la palabra, la consigna y lo aceptado se contradicen y
// nadie puede acertar
check('lo que se acepta en acento léxico es la palabra que nombra la consigna',
  all.filter((i) => i.typeLabel === 'Acento léxico').every((i) => {
    const palabra = (i.prompt.match(/«([^»]+)»/) || [])[1];
    if (!palabra) return false;
    return i.steps.filter((s) => s.kind === 'written')
      .every((s) => (s.accepted || []).some((a) => a.toLowerCase().includes(palabra.toLowerCase())));
  }));

check('todo paso escrito declara qué se espera',
  all.every((i) => i.steps.every((s) => s.kind !== 'written' || !!s.expects)));

check('los pasos en ruso piden ruso y los de español, español',
  all.every((i) => i.steps.every((s) => {
    if (s.kind !== 'written') return true;
    const model = (s.accepted || [])[0] || '';
    return s.language === 'ru' ? /[Ѐ-ӿ]/.test(model) : !/[Ѐ-ӿ]/.test(model);
  })));

check('las preguntas conceptuales tienen al menos tres opciones',
  all.every((i) => i.steps.every((s) => s.kind !== 'choice' || isStressStep(s)
    || s.dimension !== 'comprension_explicita' || s.options.length >= 3)));

const phenomena = new Set(curriculum.skills.map((s) => s.linguisticPhenomenon.toLowerCase()));
check('los distractores conceptuales salen del propio material',
  all.flatMap((i) => i.steps)
    .filter((s) => s.kind === 'choice' && s.dimension === 'comprension_explicita' && !isStressStep(s))
    .every((s) => s.options.some((o) => phenomena.has(o.toLowerCase())
      || /^(la |un |después|todos|una)/i.test(o))));

// -------------------------------------------------------------- corrección

const written = { kind: 'written', mode: 'exact', accepted: ['Это чай.'], acceptedNorm: ['это чай'] };
check('acepta la forma exacta', gradeStep(written, 'Это чай.').status === 'correcto');
check('acepta sin punto final', gradeStep(written, 'это чай').status === 'correcto');
check('acepta ё escrito como е', gradeStep({ ...written, acceptedNorm: ['это все'] }, 'Это всё').status === 'correcto');
check('detecta errata de un carácter', gradeStep(written, 'Это чаи.').status === 'errata');
check('rechaza la cópula explícita', gradeStep(written, 'Это есть чай.').status === 'incorrecto');
check('rechaza la respuesta vacía', gradeStep(written, '   ').status === 'incorrecto');

const tokens = { kind: 'written', mode: 'tokens', requiredTokens: ['ana', 'tiene', 'pelicula'], acceptedNorm: [] };
check('tolera variación en español', gradeStep(tokens, 'Ana tiene una película').status === 'correcto');
check('marca respuesta incompleta', gradeStep(tokens, 'Ana tiene').status === 'incompleto');

const frags = { kind: 'written', mode: 'fragments', requiredFragments: ['это кофе', 'кофе тут'], acceptedNorm: [] };
check('acepta el intercambio en cualquier orden', gradeStep(frags, 'Кофе тут. Это кофе.').status === 'correcto');
check('detecta laguna sin cerrar', gradeStep(frags, 'Это кофе.').status === 'incompleto');

const choice = { kind: 'choice', options: ['Это чай.', 'Это есть чай.'], answer: 'Это чай.' };
check('elección correcta', gradeStep(choice, 'Это чай.').status === 'correcto');
check('elección incorrecta', gradeStep(choice, 'Это есть чай.').status === 'incorrecto');

// ------------------------------------------------------------------ sesión

store.reset();
const session = buildPracticeSession(units[0].items, all.filter((i) => i.unit !== 1));
check('la práctica devuelve ítems', session.length > 0, `${session.length}`);
check('la práctica no incluye ítems de examen', session.every((i) => i.phase !== 'exam'));
check('la práctica empieza por el descubrimiento',
  ['discovery', 'guided_recognition', 'practice'].includes(session[0].stage), session[0].stage);

// responde bien a toda la sesión
for (const item of session) {
  store.recordItem(item, item.steps.map((s) => ({ step: s, status: 'correcto', assisted: false })));
}
const touched = Object.keys(store.state.skills);
check('la sesión alimenta el modelo de competencias', touched.length > 0, `${touched.length}`);
check('acertar programa el repaso en el futuro',
  touched.every((id) => store.state.skills[id].due > Date.now()));

// una sesión trae varios ítems de la misma competencia: si cada acierto subiera
// un escalón, una sola tanda la mandaría al intervalo máximo y no volvería nunca
check('una sola sesión no sube más de un escalón de intervalo',
  touched.every((id) => store.state.skills[id].step <= 0),
  touched.map((id) => `${id}:${store.state.skills[id].step}`).slice(0, 3).join(' '));

// un fallo devuelve la competencia a la cola inmediata
const failItem = units[0].items.find((i) => i.phase !== 'exam');
store.recordItem(failItem, failItem.steps.map((s) => ({ step: s, status: 'incorrecto', assisted: false })));
const failedSkill = failItem.skillIds[0];
check('fallar devuelve la competencia a repaso inmediato', store.state.skills[failedSkill].due <= Date.now());
check('fallar registra recaída', store.state.skills[failedSkill].lapses >= 1);

const review = buildReviewSession(all);
check('el repaso propone ítems para lo vencido', review.length > 0, `${review.length}`);
check('el repaso no repite competencia dentro de la misma tanda',
  new Set(review.map((r) => r.reason.skillId)).size === review.length);
check('el repaso puede traer un ítem distinto del fallado',
  review.some((r) => r.reason.skillId === failedSkill));

// ----------------------------------------------------------------- examen

store.reset();
check('la unidad 001 está abierta', store.isUnlocked(1));
check('la unidad 002 está bloqueada al empezar', !store.isUnlocked(2));

const exam = buildExam(units[0].items);
check('el examen tiene ítems', exam.length > 0, `${exam.length}`);
let steps = 0;
for (const item of exam) {
  const results = item.steps.map((s) => {
    steps++;
    const value = s.kind === 'choice' ? s.answer : (s.accepted || [])[0];
    return { step: s, status: gradeStep(s, value).status, assisted: false };
  });
  store.recordItem(item, results);
}
check('las respuestas modelo del examen se corrigen como correctas',
  exam.every((i) => i.steps.every((s) => gradeStep(s, s.kind === 'choice' ? s.answer : (s.accepted || [])[0]).status === 'correcto')));
store.recordExam(1, 1, { ok: steps, total: steps });
check('aprobar desbloquea la unidad siguiente', store.isUnlocked(2));

store.reset();
store.recordExam(1, 0.6, { ok: 3, total: 5 });
check('suspender no desbloquea', !store.isUnlocked(2));

// todas las respuestas modelo de todo el curso deben validarse
const badModels = [];
let modelos = 0;
for (const item of all) {
  for (const s of item.steps) {
    const value = s.kind === 'choice' ? s.answer
      : s.mode === 'fragments' ? (s.referenceParts || []).join(' ')
        : (s.accepted || [])[0];
    modelos += 1;
    if (gradeStep(s, value).status !== 'correcto') badModels.push(`${item.id}:${s.id}`);
  }
}
// el número se cuenta, no se escribe: crece con el curso y quedaba desfasado
check(`las ${modelos} respuestas modelo del curso se autocorrigen`,
  badModels.length === 0, badModels.slice(0, 5).join(', '));

console.log(failures ? `\n${failures} comprobaciones fallidas` : '\nTodo correcto');
process.exit(failures ? 1 : 0);
