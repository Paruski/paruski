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
for (const item of all) {
  for (const s of item.steps) {
    const value = s.kind === 'choice' ? s.answer
      : s.mode === 'fragments' ? (s.referenceParts || []).join(' ')
        : (s.accepted || [])[0];
    if (gradeStep(s, value).status !== 'correcto') badModels.push(`${item.id}:${s.id}`);
  }
}
check('las 1029 respuestas modelo del curso se autocorrigen',
  badModels.length === 0, badModels.slice(0, 5).join(', '));

console.log(failures ? `\n${failures} comprobaciones fallidas` : '\nTodo correcto');
process.exit(failures ? 1 : 0);
