// Vistas de la aplicación.

import { h, clear, pct, relTime, shuffle } from './util.js';
import { store, DIMENSIONS, PASS_MARK } from './store.js';
import { loadCurriculum, loadUnit } from './data.js';
import { gradeStep } from './grader.js';
import { buildPracticeSession, buildReviewSession, buildExam } from './session.js';
import { cyrillicKeyboard, transliterate } from './keyboard.js';
import { audioButton } from './audio.js';

const CYR = /[Ѐ-ӿ]/;
const hasCyr = (t) => CYR.test(t || '');

function unitProgress(unit, n) {
  const state = store.unit(n);
  const done = Object.entries(store.state.items)
    .filter(([id, v]) => v.ok > 0 && id.includes(`l${String(n).padStart(3, '0')}`)).length;
  return { state, done };
}

// ------------------------------------------------------------------- portada

export async function viewHome(root) {
  const curriculum = await loadCurriculum();
  const total = curriculum.units.length;
  const current = store.highestUnlocked(total);

  const hero = h('section', { class: 'hero' },
    h('h1', {}, 'Curso de ruso, unidad a unidad'),
    h('p', { class: 'lede' },
      'Cada unidad tiene lección, práctica y un examen obligatorio: hay que superarlo para abrir la siguiente. ',
      'La práctica no repite ítems, sino que reactiva las competencias que los sostienen cuando toca repasarlas.'),
    h('div', { class: 'row' },
      h('a', { class: 'btn primary', href: `#/u/${current}` }, `Continuar en la unidad ${String(current).padStart(3, '0')}`),
      h('a', { class: 'btn ghost', href: '#/repaso' }, `Repaso pendiente (${store.dueSkills().length})`)),
  );

  const grid = h('div', { class: 'units' });
  for (const u of curriculum.units) {
    const unlocked = store.isUnlocked(u.unit);
    const { state } = unitProgress(u, u.unit);
    const badge = state.exam.passed
      ? h('span', { class: 'pill ok' }, `examen ${pct(state.exam.best)}`)
      : unlocked ? h('span', { class: 'pill accent' }, 'abierta')
        : h('span', { class: 'pill' }, 'bloqueada');

    grid.append(h('a', {
      class: `unit${unlocked ? '' : ' locked'}`,
      href: unlocked ? `#/u/${u.unit}` : '#/',
      'aria-disabled': !unlocked,
    },
      h('span', { class: 'n' }, `UNIDAD ${String(u.unit).padStart(3, '0')} · ${u.cefr}`),
      h('h3', {}, u.title),
      h('p', { class: 'obj' }, u.objective),
      h('div', { class: 'meta' },
        badge,
        h('span', { class: 'pill' }, `${u.practiceCount} ejercicios`),
        h('span', { class: 'pill' }, `${u.vocabCount} palabras`)),
    ));
  }

  clear(root).append(hero, grid,
    h('p', { class: 'notice small' },
      'Materiales revisados editorialmente pero pendientes de validación por hablante nativo. ',
      'El audio procede del banco de locuciones del repositorio; donde no existe grabación, se usa la voz del navegador.'));
}

// ------------------------------------------------------------------- unidad

export async function viewUnit(root, n) {
  const [curriculum, data] = await Promise.all([loadCurriculum(), loadUnit(n)]);
  const unit = data.unit;
  const state = store.unit(n);
  const unlocked = store.isUnlocked(n);

  if (!unlocked) {
    clear(root).append(h('div', { class: 'card' },
      h('h1', {}, `Unidad ${String(n).padStart(3, '0')} bloqueada`),
      h('p', {}, `Supera el examen de la unidad ${String(n - 1).padStart(3, '0')} con un ${pct(PASS_MARK)} para abrirla.`),
      h('a', { class: 'btn primary', href: `#/u/${n - 1}/examen` }, 'Ir a ese examen')));
    return;
  }

  const head = h('section', { class: 'stack' },
    h('p', { class: 'muted small' }, `UNIDAD ${String(n).padStart(3, '0')} · ${unit.cefr}`),
    h('h1', {}, unit.title),
    h('p', { class: 'lede muted' }, unit.objective),
    h('div', { class: 'row' },
      h('a', { class: 'btn primary', href: `#/u/${n}/practica` }, 'Practicar'),
      h('a', { class: 'btn', href: `#/u/${n}/examen` },
        state.exam.passed ? `Repetir examen (${pct(state.exam.best)})` : 'Examen de la unidad'),
      h('span', { class: 'pill' }, `${unit.practiceCount} ejercicios`),
      h('span', { class: 'pill' }, `${unit.examCount} ítems de examen`)),
  );

  const lesson = h('section', { class: 'card stack' }, h('h2', {}, 'Lección'));
  for (const section of unit.sections || []) {
    const block = h('div', { class: `lesson-section ${section.type}` }, h('h3', {}, section.heading));
    if (section.body) block.append(h('p', {}, section.body));
    for (const ex of section.examples || []) {
      block.append(h('div', { class: 'model' },
        h('span', { class: 'task' }, ex.task),
        h('div', { class: 'row' },
          h('span', { class: 'ru ru-big' }, ex.model),
          audioButton(ex.model))));
    }
    for (const it of section.items || []) {
      block.append(h('div', { class: 'wrongright' },
        h('span', { class: 'ru w' }, it.wrong),
        h('span', { class: 'ru r' }, it.right)));
    }
    lesson.append(block);
  }
  lesson.append(h('button', {
    class: 'primary', type: 'button',
    onclick: (e) => { store.markLessonRead(n); e.target.textContent = 'Lección marcada como leída'; e.target.disabled = true; },
  }, state.lesson ? 'Lección marcada como leída' : 'He leído la lección'));

  const skills = h('section', { class: 'card' },
    h('h2', {}, 'Competencias que se introducen'),
    h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Competencia'), h('th', {}, 'Estado'), h('th', {}, 'Próximo repaso'))),
      h('tbody', {}, ...(unit.newSkills || []).map((id) => {
        const meta = curriculum.skills.find((s) => s.skillId === id);
        const st = store.state.skills[id];
        return h('tr', {},
          h('td', {}, meta ? meta.linguisticPhenomenon : id),
          h('td', {}, st ? pct(store.strength(id)) : 'sin practicar'),
          h('td', {}, st && st.seen ? relTime(st.due) : '—'));
      }))));

  const vocab = h('section', { class: 'card' },
    h('h2', {}, `Vocabulario de la unidad (${data.vocabulary.length})`),
    h('div', { class: 'vocab-list' }, ...data.vocabulary.map(vocabCard)));

  clear(root).append(head, lesson, skills, vocab);
}

function vocabCard(v) {
  return h('div', { class: 'vocab' },
    h('div', {},
      h('div', { class: 'l' }, v.stressed || v.lemma),
      v.exampleRu ? h('div', { class: 'small muted ru' }, v.exampleRu) : null),
    h('div', {},
      h('div', { class: 't' }, v.translation),
      audioButton(v.lemma, '▶')));
}

// ------------------------------------------------------------------ sesiones

export async function viewPractice(root, n) {
  const curriculum = await loadCurriculum();
  const unlocked = curriculum.units.filter((u) => store.isUnlocked(u.unit)).map((u) => u.unit);
  const datasets = await Promise.all(unlocked.map(loadUnit));
  const pool = datasets.flatMap((d) => d.items);
  const unitItems = (datasets.find((d) => d.unit.unit === n) || { items: [] }).items;

  const items = buildPracticeSession(unitItems, pool.filter((i) => i.unit !== n));
  if (!items.length) {
    clear(root).append(h('div', { class: 'card' }, h('p', {}, 'No hay ejercicios disponibles en esta unidad.')));
    return;
  }
  runSession(root, {
    items, mode: 'practica',
    title: `Práctica · unidad ${String(n).padStart(3, '0')}`,
    backHref: `#/u/${n}`,
  });
}

export async function viewReview(root) {
  const curriculum = await loadCurriculum();
  const unlocked = curriculum.units.filter((u) => store.isUnlocked(u.unit)).map((u) => u.unit);
  const datasets = await Promise.all(unlocked.map(loadUnit));
  const pool = datasets.flatMap((d) => d.items);
  const items = buildReviewSession(pool);

  if (!items.length) {
    const next = Object.entries(store.state.skills)
      .filter(([, s]) => s.seen > 0)
      .sort((a, b) => a[1].due - b[1].due)[0];
    clear(root).append(h('div', { class: 'card stack' },
      h('h1', {}, 'Nada vencido por ahora'),
      h('p', { class: 'muted' }, next
        ? `La próxima competencia vence ${relTime(next[1].due)}. El repaso se programa sobre competencias, no sobre ejercicios sueltos.`
        : 'Practica alguna unidad para que empiece a programarse el repaso.'),
      h('a', { class: 'btn primary', href: '#/' }, 'Volver al curso')));
    return;
  }
  runSession(root, {
    items, mode: 'repaso',
    title: `Repaso · ${items.length} competencias vencidas`,
    backHref: '#/',
  });
}

export async function viewExam(root, n) {
  const data = await loadUnit(n);
  const items = buildExam(data.items);
  if (!items.length) {
    clear(root).append(h('div', { class: 'card' }, h('p', {}, 'Esta unidad todavía no tiene examen.')));
    return;
  }
  runSession(root, {
    items, mode: 'examen', unit: n,
    title: `Examen · unidad ${String(n).padStart(3, '0')}`,
    backHref: `#/u/${n}`,
  });
}

// -------------------------------------------------------------- motor de sesión

function runSession(root, config) {
  const { items, mode, title, backHref, unit } = config;
  const isExam = mode === 'examen';
  let index = 0;
  let stepIndex = 0;
  let attempts = 0;
  let itemResults = [];
  const sessionResults = [];
  const examAnswers = [];

  const bar = h('i', { style: 'width:0%' });
  const counter = h('span', { class: 'muted small' });
  const stage = h('div', {});
  const head = h('div', { class: 'session-head' },
    h('a', { class: 'btn ghost', href: backHref }, '← salir'),
    h('div', { class: 'bar accent' }, bar), counter);

  clear(root).append(h('h1', {}, title),
    isExam ? h('p', { class: 'notice small' },
      `Examen: no hay corrección hasta el final. Se aprueba con un ${pct(PASS_MARK)} de los pasos correctos.`) : null,
    head, stage);

  render();

  function render() {
    const item = items[index];
    counter.textContent = `${index + 1} / ${items.length}`;
    bar.style.width = `${(index / items.length) * 100}%`;
    clear(stage).append(renderItem(item));
    const field = stage.querySelector('.answer-field, .option');
    if (field) field.focus();
  }

  function renderItem(item) {
    const step = item.steps[stepIndex];
    const box = h('div', { class: 'item' });

    box.append(h('div', { class: 'kicker' },
      h('span', { class: 'pill accent' }, item.typeLabel),
      h('span', { class: 'pill' }, `u${String(item.unit).padStart(3, '0')}`),
      item.reason ? h('span', { class: 'pill warn' }, 'repaso programado') : null,
      item.steps.length > 1 ? h('span', { class: 'pill' }, `paso ${stepIndex + 1} de ${item.steps.length}`) : null));

    box.append(h('p', { class: 'prompt' }, item.prompt));
    if (item.input) {
      const given = h('div', { class: 'given' }, item.input);
      if (hasCyr(item.input)) given.append(h('div', { class: 'row' }, audioButton(item.input)));
      box.append(given);
    }
    if (step.prompt) box.append(h('p', { class: 'steplabel' }, step.prompt));

    box.append(step.kind === 'choice' ? renderChoice(item, step) : renderWritten(item, step));
    return box;
  }

  function renderChoice(item, step) {
    const wrap = h('div', { class: 'options' });
    const options = shuffle(step.options, hashString(step.id));
    options.forEach((option, i) => {
      const btn = h('button', {
        class: 'option', type: 'button',
        onclick: () => choose(item, step, option, wrap),
      }, h('span', { class: 'key' }, String(i + 1)),
         h('span', { class: hasCyr(option) ? 'ru' : '' }, option));
      wrap.append(btn);
    });
    wrap.addEventListener('keydown', (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= options.length) wrap.children[n - 1].click();
    });
    return wrap;
  }

  function choose(item, step, option, wrap) {
    if (wrap.dataset.done) return;
    wrap.dataset.done = '1';
    const result = gradeStep(step, option);
    [...wrap.children].forEach((btn) => {
      const text = btn.textContent.slice(1);
      const isAnswer = text.trim() === step.answer.trim();
      const isChosen = text.trim() === option.trim();
      if (isAnswer) btn.classList.add('correct');
      else if (isChosen) btn.classList.add('wrong');
      const why = step.explain && step.explain[text.trim()];
      if (why && (isChosen || isAnswer)) btn.append(h('span', { class: 'why' }, why));
      btn.disabled = true;
    });
    if (isExam) {
      examAnswers.push({ item, step, value: option, result });
      wrap.after(nextButton(item, step, result));
      return;
    }
    finishStep(item, step, result, wrap, { assisted: false });
  }

  function renderWritten(item, step) {
    const isRu = step.language !== 'es';
    const field = h('textarea', {
      class: `answer-field${isRu ? '' : ' es'}`, rows: isRu ? 2 : 3, spellcheck: 'false',
      placeholder: isRu ? 'Escribe en ruso (puedes teclear en latín: privet → привет)' : 'Escribe en español',
      'aria-label': 'Tu respuesta',
    });
    const wrap = h('div', { class: 'stack' }, field);

    if (isRu) {
      field.addEventListener('blur', () => {
        if (field.value && !hasCyr(field.value)) field.value = transliterate(field.value);
      });
      wrap.append(cyrillicKeyboard(field));
    }
    const send = h('button', { class: 'primary', type: 'button', onclick: () => check() }, 'Comprobar');
    wrap.append(h('div', { class: 'row' }, send,
      h('span', { class: 'muted small' }, 'Ctrl + Enter para enviar')));

    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || step.language !== 'es')) {
        e.preventDefault();
        check();
      }
    });

    function check() {
      if (wrap.dataset.done) return;
      const value = field.value.trim();
      if (!value) { field.focus(); return; }
      const result = gradeStep(step, value);

      if (isExam) {
        wrap.dataset.done = '1';
        field.disabled = true;
        send.disabled = true;
        examAnswers.push({ item, step, value, result });
        wrap.append(nextButton(item, step, result));
        return;
      }

      if (result.status !== 'correcto' && attempts === 0) {
        attempts = 1;
        field.classList.add('wrong');
        wrap.append(h('div', { class: 'verdict bad' },
          h('h4', {}, result.status === 'errata' ? 'Casi' : 'Todavía no'),
          h('p', { class: 'small' }, result.detail || 'Revisa la forma y vuelve a intentarlo.'),
          hint(step)));
        field.focus();
        return;
      }
      wrap.dataset.done = '1';
      field.disabled = true;
      send.disabled = true;
      field.classList.add(result.status === 'correcto' ? 'correct' : 'wrong');
      finishStep(item, step, result, wrap, { assisted: attempts > 0 });
    }
    return wrap;
  }

  function hint(step) {
    const model = (step.accepted && step.accepted[0]) || '';
    if (step.mode === 'tokens') {
      return h('p', { class: 'small muted' }, `Pista: la respuesta debe mencionar ${(step.requiredTokens || []).length} datos.`);
    }
    if (step.mode === 'fragments') {
      return h('p', { class: 'small muted' }, `Pista: hacen falta ${(step.requiredFragments || []).length} frases.`);
    }
    const skeleton = model.split(/\s+/).map((w) => `${w[0]}${'·'.repeat(Math.max(w.length - 1, 0))}`).join(' ');
    return h('p', { class: 'small muted' }, 'Pista: ', h('span', { class: 'ru' }, skeleton));
  }

  function finishStep(item, step, result, wrap, { assisted }) {
    itemResults.push({ step, status: result.status, assisted });
    const ok = result.status === 'correcto';
    const verdict = h('div', { class: `verdict ${ok ? 'ok' : 'bad'}` },
      h('h4', {}, ok ? (assisted ? 'Correcto, con pista' : 'Correcto') : 'Incorrecto'));

    if (!ok) {
      const model = step.kind === 'choice' ? step.answer : (step.accepted || [])[0];
      if (model) verdict.append(h('p', {}, 'Respuesta esperada: ',
        h('span', { class: hasCyr(model) ? 'ref ru' : 'ref' }, model)));
      if (result.detail) verdict.append(h('p', { class: 'small muted' }, result.detail));
    }
    const isLastStep = stepIndex >= item.steps.length - 1;
    if (isLastStep && item.notes && item.notes.length) {
      verdict.append(h('p', { class: 'small muted' }, 'Lo que decide esta tarea:'),
        h('ul', { class: 'small muted' }, ...item.notes.map((note) => h('li', {}, note))));
    }
    if (isLastStep && item.reference && hasCyr(item.reference)) {
      verdict.append(h('div', { class: 'row' },
        h('span', { class: 'ru' }, item.reference), audioButton(item.reference)));
    }
    wrap.append(verdict, nextButton(item, step, result));
  }

  function nextButton(item, step) {
    const isLastStep = stepIndex >= item.steps.length - 1;
    const isLastItem = index >= items.length - 1;
    const label = !isLastStep ? 'Siguiente paso' : isLastItem ? 'Terminar' : 'Siguiente ejercicio';
    const btn = h('button', { class: 'primary', type: 'button', onclick: advance }, label);
    setTimeout(() => btn.focus(), 30);
    document.addEventListener('keydown', onEnter);
    function onEnter(e) {
      if (e.key === 'Enter' && document.activeElement === btn) return;
      if (e.key === 'Enter' && !e.shiftKey && !['TEXTAREA', 'INPUT'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        advance();
      }
    }
    function advance() {
      document.removeEventListener('keydown', onEnter);
      if (!isLastStep) { stepIndex += 1; attempts = 0; render(); return; }
      if (!isExam) {
        store.recordItem(item, itemResults);
        sessionResults.push({ item, results: itemResults });
      }
      itemResults = [];
      attempts = 0;
      stepIndex = 0;
      if (isLastItem) { finishSession(); return; }
      index += 1;
      render();
    }
    return btn;
  }

  function finishSession() {
    bar.style.width = '100%';
    if (isExam) return finishExam();

    const total = sessionResults.reduce((acc, r) => acc + r.results.length, 0);
    const ok = sessionResults.reduce((acc, r) => acc + r.results.filter((x) => x.status === 'correcto').length, 0);
    const skills = new Map();
    for (const { item, results } of sessionResults) {
      for (const id of item.skillIds || []) {
        const entry = skills.get(id) || { ok: 0, n: 0 };
        entry.n += results.length;
        entry.ok += results.filter((r) => r.status === 'correcto').length;
        skills.set(id, entry);
      }
    }
    clear(stage).append(h('div', { class: 'card stack' },
      h('h2', {}, 'Sesión terminada'),
      h('p', {}, `${ok} de ${total} pasos correctos (${pct(total ? ok / total : 0)}).`),
      h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Competencia'), h('th', { class: 'num' }, 'Acierto'), h('th', {}, 'Próximo repaso'))),
        h('tbody', {}, ...[...skills.entries()].map(([id, v]) => h('tr', {},
          h('td', {}, id),
          h('td', { class: 'num' }, pct(v.ok / v.n)),
          h('td', {}, relTime((store.state.skills[id] || {}).due)))))),
      h('div', { class: 'row' },
        h('a', { class: 'btn primary', href: backHref }, 'Volver'),
        h('a', { class: 'btn', href: '#/progreso' }, 'Ver progreso'))));
  }

  function finishExam() {
    const total = examAnswers.length;
    const ok = examAnswers.filter((a) => a.result.status === 'correcto').length;
    const score = total ? ok / total : 0;

    // el examen sí alimenta el modelo, con el peso alto que le da el esquema
    const byItem = new Map();
    for (const a of examAnswers) {
      const list = byItem.get(a.item) || [];
      list.push({ step: a.step, status: a.result.status, assisted: false });
      byItem.set(a.item, list);
    }
    for (const [item, results] of byItem) store.recordItem(item, results);
    const examState = store.recordExam(unit, score, { ok, total });

    const detail = h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Ítem'), h('th', {}, 'Tu respuesta'), h('th', {}, 'Esperado'), h('th', {}, ''))),
      h('tbody', {}, ...examAnswers.map((a) => h('tr', {},
        h('td', { class: 'small' }, a.item.prompt.slice(0, 90)),
        h('td', { class: hasCyr(a.value) ? 'ru small' : 'small' }, a.value),
        h('td', { class: 'ru small' }, a.step.kind === 'choice' ? a.step.answer : (a.step.accepted || [])[0] || '—'),
        h('td', {}, a.result.status === 'correcto' ? '✓' : '✗')))));

    clear(stage).append(h('div', { class: 'card stack' },
      h('h2', {}, examState.passed ? 'Examen superado' : 'Examen no superado'),
      h('p', {}, `${ok} de ${total} correctos · ${pct(score)} (mínimo ${pct(PASS_MARK)}).`),
      h('p', { class: 'muted small' }, examState.passed
        ? `La unidad ${String(unit + 1).padStart(3, '0')} queda desbloqueada.`
        : 'Repasa la unidad y vuelve a intentarlo: los fallos ya están en la cola de repaso.'),
      h('div', { class: 'row' },
        h('a', { class: 'btn primary', href: examState.passed ? `#/u/${unit + 1}` : `#/u/${unit}/practica` },
          examState.passed ? 'Ir a la siguiente unidad' : 'Practicar lo fallado'),
        h('a', { class: 'btn ghost', href: `#/u/${unit}` }, 'Volver a la unidad')),
      h('h3', {}, 'Detalle'), detail));
  }
}

function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// -------------------------------------------------------------- vocabulario

export async function viewVocabulary(root) {
  const curriculum = await loadCurriculum();
  const datasets = await Promise.all(curriculum.units.map((u) => loadUnit(u.unit)));
  const all = datasets.flatMap((d) => d.vocabulary.map((v) => ({ ...v })));

  const list = h('div', { class: 'vocab-list' });
  const search = h('input', {
    class: 'answer-field es', placeholder: 'Buscar en ruso o en español…', type: 'search',
    oninput: () => paint(search.value),
  });
  const filter = h('select', { class: 'answer-field es', onchange: () => paint(search.value) },
    h('option', { value: '' }, 'Todas las unidades'),
    ...curriculum.units.map((u) => h('option', { value: String(u.unit) }, `Unidad ${String(u.unit).padStart(3, '0')}`)));

  function paint(query = '') {
    const q = query.trim().toLowerCase();
    const unit = filter.value;
    clear(list).append(...all
      .filter((v) => (!unit || String(v.unit) === unit))
      .filter((v) => !q || `${v.lemma} ${v.translation}`.toLowerCase().includes(q))
      .map(vocabCard));
  }

  clear(root).append(
    h('h1', {}, 'Vocabulario'),
    h('p', { class: 'muted' }, `${all.length} entradas de las unidades 001–011, con ejemplo y locución cuando existe grabación.`),
    h('div', { class: 'row' }, search, filter),
    h('div', { class: 'card flat' }, list));
  paint();
}

// ----------------------------------------------------------------- progreso

export async function viewProgress(root) {
  const curriculum = await loadCurriculum();
  const total = curriculum.units.length;
  const skills = curriculum.skills;
  const practised = skills.filter((s) => store.state.skills[s.skillId]);
  const due = store.dueSkills();
  const events = store.state.events;

  const stats = h('div', { class: 'grid2' },
    stat(String(store.highestUnlocked(total)), 'unidad más avanzada'),
    stat(String(practised.length), `competencias tocadas de ${skills.length}`),
    stat(String(due.length), 'competencias vencidas'),
    stat(String(events.length), 'respuestas registradas'));

  const unitRows = curriculum.units.map((u) => {
    const st = store.unit(u.unit);
    return h('tr', {},
      h('td', {}, `${String(u.unit).padStart(3, '0')} · ${u.title}`),
      h('td', {}, st.lesson ? 'leída' : '—'),
      h('td', { class: 'num' }, st.exam.attempts ? pct(st.exam.best) : '—'),
      h('td', {}, st.exam.passed ? h('span', { class: 'pill ok' }, 'superado')
        : store.isUnlocked(u.unit) ? h('span', { class: 'pill accent' }, 'abierta')
          : h('span', { class: 'pill' }, 'bloqueada')));
  });

  const skillRows = skills
    .filter((s) => store.state.skills[s.skillId])
    .sort((a, b) => store.strength(a.skillId) - store.strength(b.skillId))
    .map((s) => {
      const st = store.state.skills[s.skillId];
      return h('tr', {},
        h('td', {}, h('div', {}, s.linguisticPhenomenon), h('div', { class: 'small muted' }, s.skillId)),
        h('td', {}, h('div', { class: 'dims' }, ...DIMENSIONS.map(([dim, label]) => {
          const d = st.dims[dim] || { s: 0, n: 0 };
          const level = d.n === 0 ? 0 : d.s > 0.75 ? 3 : d.s > 0.4 ? 2 : 1;
          return h('i', { title: `${label}: ${d.n ? pct(d.s) : 'sin medir'}`, dataset: { v: String(level) } });
        }))),
        h('td', { class: 'num' }, pct(store.strength(s.skillId))),
        h('td', {}, relTime(st.due)),
        h('td', { class: 'num' }, String(st.lapses || 0)));
    });

  clear(root).append(
    h('h1', {}, 'Progreso'),
    stats,
    h('section', { class: 'card' },
      h('h2', {}, 'Unidades'),
      h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Unidad'), h('th', {}, 'Lección'), h('th', { class: 'num' }, 'Mejor examen'), h('th', {}, 'Estado'))),
        h('tbody', {}, ...unitRows))),
    h('section', { class: 'card' },
      h('h2', {}, 'Competencias'),
      h('p', { class: 'small muted' },
        'Cada barra es una dimensión: ', DIMENSIONS.map(([, l]) => l).join(' · '), '. ',
        'El repaso se programa por competencia, atacando su dimensión más débil.'),
      skillRows.length
        ? h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Competencia'), h('th', {}, 'Dimensiones'), h('th', { class: 'num' }, 'Fuerza'), h('th', {}, 'Próximo repaso'), h('th', { class: 'num' }, 'Recaídas'))),
          h('tbody', {}, ...skillRows))
        : h('p', { class: 'muted' }, 'Todavía no hay datos: practica una unidad.')),
    h('section', { class: 'card' },
      h('h2', {}, 'Datos'),
      h('p', { class: 'small muted' }, 'El progreso se guarda sólo en este navegador.'),
      h('div', { class: 'row' },
        h('button', {
          class: 'ghost', type: 'button',
          onclick: () => {
            const blob = new Blob([JSON.stringify(store.state, null, 1)], { type: 'application/json' });
            const a = h('a', { href: URL.createObjectURL(blob), download: 'paruski-progreso.json' });
            a.click();
          },
        }, 'Exportar progreso'),
        h('button', {
          class: 'ghost', type: 'button',
          onclick: () => {
            if (confirm('¿Borrar todo el progreso guardado en este navegador?')) {
              store.reset();
              location.hash = '#/';
              location.reload();
            }
          },
        }, 'Borrar progreso'))));
}

function stat(value, label) {
  return h('div', { class: 'stat' }, h('b', {}, value), h('span', {}, label));
}
