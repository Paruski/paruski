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
const pad = (n) => String(n).padStart(3, '0');

/** Pinta en rojo la vocal tónica de una forma marcada editorialmente. */
function stressed(text) {
  const out = h('span', {});
  const chars = [...(text || '')];
  chars.forEach((ch, i) => {
    if (ch === '́') return;
    const isStressed = chars[i + 1] === '́';
    out.append(isStressed ? h('span', { class: 'stress' }, ch) : ch);
  });
  return out;
}

function skillName(curriculum, id) {
  const s = curriculum.skills.find((x) => x.skillId === id);
  return s ? s.linguisticPhenomenon : id;
}

// ------------------------------------------------------------------- portada

export async function viewHome(root) {
  const curriculum = await loadCurriculum();
  const total = curriculum.units.length;
  const current = store.highestUnlocked(total);
  const due = store.dueSkills().length;
  const touched = Object.keys(store.state.skills).length;

  const hero = h('section', { class: 'hero' },
    h('div', { class: 'hero-beam' }),
    h('span', { class: 'cyr-ghost', 'aria-hidden': 'true' }, 'Я'),
    h('p', { class: 'eyebrow' }, 'Ruso para hispanohablantes · A1'),
    h('h1', {}, 'Once unidades. Ninguna ', h('span', {}, 'aprobada por casualidad'), '.'),
    h('p', { class: 'lede' },
      'Cada unidad se abre sólo cuando la anterior está superada. La práctica no repite ejercicios: '
      + 'reactiva la competencia que hay debajo, en un contexto nuevo y por su dimensión más floja.'),
    h('div', { class: 'row', style: 'margin-top:1.2rem' },
      h('a', { class: 'btn primary', href: `#/u/${current}` }, `Continuar · unidad ${pad(current)}`),
      due ? h('a', { class: 'btn', href: '#/repaso' }, `Repasar ${due} competencia${due === 1 ? '' : 's'}`)
        : h('a', { class: 'btn ghost', href: '#/repaso' }, 'Sin repaso vencido')));

  const kpis = h('div', { class: 'kpis' },
    kpi(pad(current), 'unidad abierta'),
    kpi(`${touched}/${curriculum.skills.length}`, 'competencias en juego'),
    kpi(String(due), 'vencidas hoy'),
    kpi(String(store.state.events.length), 'respuestas registradas'));

  const route = h('div', { class: 'route' });
  for (const u of curriculum.units) {
    const unlocked = store.isUnlocked(u.unit);
    const state = store.unit(u.unit);
    const strengths = (u.newSkills || []).map((id) => store.strength(id));
    const avg = strengths.length ? strengths.reduce((a, b) => a + b, 0) / strengths.length : 0;

    route.append(h('div', {
      class: `stop${state.exam.passed ? ' passed' : unlocked ? ' open' : ' locked'}`,
    },
      h('span', { class: 'disc' }, state.exam.passed ? '✓' : pad(u.unit)),
      h('a', { class: 'stop-card', href: unlocked ? `#/u/${u.unit}` : '#/' },
        h('div', { class: 'spread' },
          h('h3', {}, u.title),
          h('span', { class: 'pill' }, u.cefr)),
        h('p', { class: 'obj' }, u.objective),
        h('div', { class: 'meta' },
          state.exam.passed ? h('span', { class: 'pill green' }, `examen ${pct(state.exam.best)}`)
            : unlocked ? h('span', { class: 'pill red' }, 'abierta')
              : h('span', { class: 'pill' }, 'bloqueada'),
          h('span', { class: 'pill' }, `${u.practiceCount} ejercicios`),
          h('span', { class: 'pill' }, `${u.vocabCount} palabras`),
          avg > 0 ? h('span', { class: 'pill amber' }, `dominio ${pct(avg)}`) : null))));
  }

  clear(root).append(hero, kpis,
    h('p', { class: 'eyebrow' }, 'La ruta'),
    route,
    h('p', { class: 'notice small', style: 'margin-top:2rem' },
      'Materiales con revisión editorial hecha y validación de hablante nativo pendiente. '
      + 'El audio sale del banco de locuciones del repositorio; donde aún no hay grabación, se usa la voz del navegador.'));
}

function kpi(value, label) {
  return h('div', { class: 'kpi' }, h('b', {}, value), h('span', {}, label));
}

// ------------------------------------------------------------------- unidad

export async function viewUnit(root, n, tab = 'leccion') {
  const [curriculum, data] = await Promise.all([loadCurriculum(), loadUnit(n)]);
  const unit = data.unit;
  const state = store.unit(n);

  if (!store.isUnlocked(n)) {
    clear(root).append(h('section', { class: 'card stack' },
      h('p', { class: 'eyebrow' }, `Unidad ${pad(n)}`),
      h('h1', {}, 'Todavía cerrada'),
      h('p', { class: 'lede' }, `Se abre al superar el examen de la unidad ${pad(n - 1)} con un ${pct(PASS_MARK)}.`),
      h('div', { class: 'row' },
        h('a', { class: 'btn primary', href: `#/u/${n - 1}/examen` }, `Examen de la ${pad(n - 1)}`),
        h('a', { class: 'btn ghost', href: `#/u/${n - 1}` }, 'Volver a esa unidad'))));
    return;
  }

  const head = h('section', { class: 'unit-head' },
    h('span', { class: 'n' }, pad(n)),
    h('p', { class: 'eyebrow' }, `${unit.cefr} · ${unit.practiceCount} ejercicios · ${unit.examCount} de examen`),
    h('h1', {}, unit.title),
    h('p', { class: 'lede' }, unit.objective),
    h('div', { class: 'row', style: 'margin-top:.8rem' },
      h('a', { class: 'btn primary', href: `#/u/${n}/practica` }, 'Practicar ahora'),
      h('a', { class: 'btn', href: `#/u/${n}/examen` },
        state.exam.passed ? `Repetir examen · mejor ${pct(state.exam.best)}` : 'Presentarse al examen')));

  const panel = h('div', {});
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const TABS = [
    ['leccion', 'Lección'],
    ['ejercicios', `Ejercicios (${data.items.filter((i) => i.phase !== 'exam').length})`],
    ['vocabulario', `Vocabulario (${data.vocabulary.length})`],
    ['competencias', 'Competencias'],
  ];
  for (const [id, label] of TABS) {
    tabs.append(h('button', {
      type: 'button', role: 'tab', 'aria-selected': id === tab,
      onclick: () => { location.hash = `#/u/${n}/${id === 'leccion' ? '' : id}`; },
    }, label));
  }

  if (tab === 'ejercicios') panel.append(exerciseIndex(curriculum, data, n));
  else if (tab === 'vocabulario') panel.append(h('div', { class: 'vocab-list' }, ...data.vocabulary.map(vocabCard)));
  else if (tab === 'competencias') panel.append(skillTable(curriculum, unit));
  else panel.append(lessonArticle(unit, n, state));

  clear(root).append(head, tabs, panel);
}

function lessonArticle(unit, n, state) {
  const article = h('article', { class: 'lesson' });
  for (const section of unit.sections || []) {
    const block = h('section', { class: `lesson-section ${section.type}` }, h('h3', {}, section.heading));
    if (section.body) block.append(h('p', {}, section.body));
    for (const ex of section.examples || []) {
      block.append(h('div', { class: 'model' },
        h('span', { class: 'task' }, ex.task),
        h('span', { class: 'ru-lg' }, stressed(ex.model)),
        audioButton(ex.model, '▶ oír')));
    }
    for (const it of section.items || []) {
      block.append(h('div', { class: 'wrongright' },
        h('span', { class: 'w' }, stressed(it.wrong)),
        h('span', { class: 'r' }, stressed(it.right))));
    }
    article.append(block);
  }
  article.append(h('div', { class: 'row' },
    h('button', {
      class: state.lesson ? 'ghost' : 'primary', type: 'button',
      onclick: (e) => {
        store.markLessonRead(n);
        e.target.textContent = 'Lección leída ✓';
        e.target.className = 'ghost';
      },
    }, state.lesson ? 'Lección leída ✓' : 'Marcar la lección como leída'),
    h('a', { class: 'btn', href: `#/u/${n}/ejercicios` }, 'Ver los ejercicios')));
  return article;
}

function exerciseIndex(curriculum, data, n) {
  const items = data.items.filter((i) => i.phase !== 'exam');
  const types = [...new Set(items.map((i) => i.typeLabel))].sort();
  const wrap = h('div', { class: 'stack' });
  let activeType = '';
  let activeState = '';

  const filters = h('div', { class: 'ex-filters' });
  const body = h('tbody', {});

  const chip = (label, value, kind) => h('button', {
    class: 'chip', type: 'button', 'aria-pressed': false,
    onclick: (e) => {
      const group = [...filters.querySelectorAll(`[data-kind="${kind}"]`)];
      const on = e.currentTarget.getAttribute('aria-pressed') === 'true';
      group.forEach((b) => b.setAttribute('aria-pressed', 'false'));
      e.currentTarget.setAttribute('aria-pressed', String(!on));
      if (kind === 'type') activeType = on ? '' : value;
      else activeState = on ? '' : value;
      paint();
    },
    dataset: { kind },
  }, label);

  filters.append(chip('Sin hacer', 'nuevo', 'state'), chip('Fallados', 'fallo', 'state'),
    chip('Acertados', 'ok', 'state'));
  for (const t of types) filters.append(chip(t, t, 'type'));

  function statusOf(item) {
    const seen = store.state.items[item.id];
    if (!seen) return 'nuevo';
    return seen.ok > 0 ? 'ok' : 'fallo';
  }

  function paint() {
    clear(body).append(...items
      .filter((i) => !activeType || i.typeLabel === activeType)
      .filter((i) => !activeState || statusOf(i) === activeState)
      .map((item) => {
        const st = statusOf(item);
        return h('tr', { class: 'ex-row' },
          h('td', {},
            h('div', {}, item.prompt.length > 120 ? `${item.prompt.slice(0, 120)}…` : item.prompt),
            h('div', { class: 'sc' }, skillName(curriculum, item.skillId))),
          h('td', {}, h('span', { class: 'pill' }, item.typeLabel)),
          h('td', {}, h('span', {
            class: `dot ${st === 'ok' ? 'ok' : st === 'fallo' ? 'bad' : ''}`,
            title: st === 'ok' ? 'acertado' : st === 'fallo' ? 'fallado' : 'sin hacer',
          })),
          h('td', {}, h('a', { class: 'btn icon-btn', href: `#/u/${n}/ej/${item.id}` }, 'Hacer →')));
      }));
    if (!body.children.length) {
      body.append(h('tr', {}, h('td', { colspan: '4', class: 'muted' }, 'Nada que mostrar con este filtro.')));
    }
  }

  wrap.append(
    h('p', { class: 'muted small' },
      'Todos los ejercicios de la unidad, uno a uno. Los de examen no aparecen aquí: sólo se ven en el examen.'),
    filters,
    h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Ejercicio'), h('th', {}, 'Tipo'), h('th', {}, 'Estado'), h('th', {}, ''))),
      body));
  paint();
  return wrap;
}

function skillTable(curriculum, unit) {
  return h('div', { class: 'skillcards' }, ...(unit.newSkills || []).map((id) => {
    const st = store.state.skills[id];
    return h('div', { class: 'skillcard' },
      radar(st),
      h('div', {},
        h('h4', {}, skillName(curriculum, id)),
        h('div', { class: 'muted small' }, id),
        h('div', { class: 'row', style: 'margin-top:.5rem' },
          h('span', { class: 'pill' }, st ? `dominio ${pct(store.strength(id))}` : 'sin practicar'),
          st && st.seen ? h('span', { class: 'pill amber' }, `repaso ${relTime(st.due)}`) : null)));
  }));
}

/** Radar de las seis dimensiones de una competencia. */
function radar(skill) {
  const size = 120;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 12;
  const dims = DIMENSIONS.map(([id]) => (skill && skill.dims[id] ? skill.dims[id].s : 0));
  const point = (i, value) => {
    const angle = (Math.PI * 2 * i) / dims.length - Math.PI / 2;
    return [cx + Math.cos(angle) * r * value, cy + Math.sin(angle) * r * value];
  };
  const poly = (values) => values.map((v, i) => point(i, v).join(',')).join(' ');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', 'radar');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', DIMENSIONS.map(([, l], i) => `${l}: ${pct(dims[i])}`).join('; '));
  for (const ring of [0.33, 0.66, 1]) {
    const g = document.createElementNS(ns, 'polygon');
    g.setAttribute('class', 'grid');
    g.setAttribute('points', poly(dims.map(() => ring)));
    svg.append(g);
  }
  const value = document.createElementNS(ns, 'polygon');
  value.setAttribute('class', 'value');
  value.setAttribute('points', poly(dims.map((d) => Math.max(d, 0.02))));
  svg.append(value);
  return svg;
}

function vocabCard(v) {
  return h('div', { class: 'vocab' },
    h('div', { class: 'l' }, stressed(v.stressed || v.lemma)),
    h('div', { class: 't' }, v.translation),
    v.exampleRu ? h('div', { class: 'ex' }, v.exampleRu) : null,
    h('div', { class: 'foot' },
      h('span', { class: 'pill' }, v.pos || '—'),
      audioButton(v.lemma, '▶ oír')));
}

// ------------------------------------------------------------------ sesiones

async function poolFor(n) {
  const curriculum = await loadCurriculum();
  const unlocked = curriculum.units.filter((u) => store.isUnlocked(u.unit)).map((u) => u.unit);
  const datasets = await Promise.all(unlocked.map(loadUnit));
  return { curriculum, datasets, pool: datasets.flatMap((d) => d.items) };
}

export async function viewPractice(root, n) {
  const { datasets, pool } = await poolFor(n);
  const dataset = datasets.find((d) => d.unit.unit === n);
  if (!dataset) {
    clear(root).append(h('div', { class: 'card' },
      h('h2', {}, 'Unidad bloqueada'),
      h('p', { class: 'muted' }, 'Supera el examen de la unidad anterior para practicar ésta.'),
      h('a', { class: 'btn primary', href: '#/' }, 'Volver a la ruta')));
    return;
  }
  const items = buildPracticeSession(dataset.items, pool.filter((i) => i.unit !== n));
  runSession(root, { items, mode: 'practica', title: `Práctica · unidad ${pad(n)}`, backHref: `#/u/${n}` });
}

/** Un único ejercicio, lanzado desde el índice de la unidad. */
export async function viewSingle(root, n, id) {
  const data = await loadUnit(n);
  const item = data.items.find((i) => i.id === id);
  if (!item) {
    clear(root).append(h('div', { class: 'card' }, h('p', {}, 'Ese ejercicio no existe.'),
      h('a', { class: 'btn primary', href: `#/u/${n}/ejercicios` }, 'Volver al índice')));
    return;
  }
  runSession(root, {
    items: [item], mode: 'practica',
    title: `${item.typeLabel} · unidad ${pad(n)}`,
    backHref: `#/u/${n}/ejercicios`,
  });
}

export async function viewReview(root) {
  const { pool } = await poolFor(1);
  const items = buildReviewSession(pool);
  if (!items.length) {
    const next = Object.entries(store.state.skills)
      .filter(([, s]) => s.seen > 0)
      .sort((a, b) => a[1].due - b[1].due)[0];
    clear(root).append(h('section', { class: 'card stack' },
      h('p', { class: 'eyebrow' }, 'Repaso'),
      h('h1', {}, 'Nada vencido'),
      h('p', { class: 'lede' }, next
        ? `La próxima competencia vence ${relTime(next[1].due)}. Adelantar el repaso no lo hace más sólido.`
        : 'Practica una unidad para que el sistema empiece a programar repasos.'),
      h('a', { class: 'btn primary', href: '#/' }, 'Volver a la ruta')));
    return;
  }
  runSession(root, {
    items, mode: 'repaso',
    title: `Repaso · ${items.length} competencia${items.length === 1 ? '' : 's'}`,
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
  runSession(root, { items, mode: 'examen', unit: n, title: `Examen · unidad ${pad(n)}`, backHref: `#/u/${n}` });
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
  const marks = items.map(() => '');

  document.body.classList.add('focus-mode');

  const segments = h('div', { class: 'segments' }, ...items.map(() => h('i', {})));
  const counter = h('span', { class: 'pill' });
  const top = h('div', { class: 'session-top' },
    h('a', { class: 'btn ghost', href: backHref }, '← salir'), segments, counter);
  const stage = h('div', {});

  clear(root).append(h('section', { class: 'session' },
    ...[h('p', { class: 'eyebrow' }, title),
      isExam ? h('p', { class: 'notice small' },
        `Sin corrección hasta el final. Se aprueba con ${pct(PASS_MARK)} de pasos correctos. `
        + 'No se exigen mayúsculas, punto final ni marcas de acento.') : null,
      top, stage].filter(Boolean)));

  render();

  function paintSegments() {
    [...segments.children].forEach((el, i) => {
      el.className = i === index ? 'now' : marks[i];
    });
    counter.textContent = `${index + 1} / ${items.length}`;
  }

  function render() {
    paintSegments();
    clear(stage).append(renderItem(items[index]));
    const first = stage.querySelector('.answer-field, .option');
    if (first) first.focus({ preventScroll: true });
  }

  function renderItem(item) {
    const step = item.steps[stepIndex];
    const box = h('div', { class: 'item' });

    box.append(h('div', { class: 'kicker' },
      h('span', { class: 'pill solid' }, item.typeLabel),
      h('span', { class: 'pill' }, `u${pad(item.unit)}`),
      item.reason ? h('span', { class: 'pill amber' }, 'repaso programado') : null,
      item.steps.length > 1 ? h('span', { class: 'pill' }, `paso ${stepIndex + 1}/${item.steps.length}`) : null));

    box.append(h('p', { class: 'prompt' }, item.prompt));
    if (item.input) {
      box.append(h('div', { class: 'given' },
        item.input,
        hasCyr(item.input) ? h('div', { class: 'row' }, audioButton(item.input, '▶ oír')) : null));
    }
    if (step.prompt) box.append(h('p', { class: 'steplabel' }, step.prompt));
    if (step.expects) box.append(h('p', { class: 'expects' }, step.expects));

    box.append(step.kind === 'choice' ? renderChoice(item, step) : renderWritten(item, step));
    return box;
  }

  function renderChoice(item, step) {
    const wrap = h('div', { class: 'options' });
    const options = shuffle(step.options, hashString(step.id));
    options.forEach((option, i) => {
      wrap.append(h('button', {
        class: 'option', type: 'button', dataset: { option },
        onclick: () => choose(item, step, option, wrap),
      },
        h('span', { class: 'key' }, String(i + 1)),
        h('span', { class: `txt${hasCyr(option) ? ' ru' : ''}` }, hasCyr(option) ? stressed(option) : option)));
    });
    wrap.addEventListener('keydown', (e) => {
      const k = Number(e.key);
      if (k >= 1 && k <= options.length) wrap.children[k - 1].click();
    });
    return wrap;
  }

  function choose(item, step, option, wrap) {
    if (wrap.dataset.done) return;
    wrap.dataset.done = '1';
    const result = gradeStep(step, option);
    [...wrap.children].forEach((btn) => {
      const text = (btn.dataset.option || '').trim();
      const isAnswer = text === step.answer.trim();
      const isChosen = text === option.trim();
      if (isAnswer) btn.classList.add('correct');
      else if (isChosen) btn.classList.add('wrong');
      const why = step.explain && step.explain[text];
      if (why && (isChosen || isAnswer)) btn.append(h('span', { class: 'why' }, why));
      btn.disabled = true;
    });
    if (isExam) {
      examAnswers.push({ item, step, value: option, result });
      wrap.after(nextButton(item, step));
      return;
    }
    finishStep(item, step, result, wrap, { assisted: false });
  }

  function renderWritten(item, step) {
    const isRu = step.language !== 'es';
    const field = h('textarea', {
      class: `answer-field${isRu ? '' : ' es'}`, rows: isRu ? 2 : 3, spellcheck: 'false',
      placeholder: isRu ? 'Escribe en ruso — puedes teclear en latín: privet → привет' : 'Escribe en español',
      'aria-label': 'Tu respuesta',
    });
    const wrap = h('div', {}, field);
    const send = h('button', { class: 'primary', type: 'button', onclick: () => check() }, 'Comprobar');
    const tools = h('div', { class: 'field-tools' },
      send,
      h('span', { class: 'muted small' }, isRu ? 'Enter comprueba · Mayús+Enter salta de línea' : 'Ctrl + Enter comprueba'));
    wrap.append(tools);
    if (isRu) {
      field.addEventListener('blur', () => {
        if (field.value && !hasCyr(field.value)) field.value = transliterate(field.value);
      });
      wrap.append(cyrillicKeyboard(field));
    }

    field.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.shiftKey) return;
      if (isRu || e.ctrlKey || e.metaKey) { e.preventDefault(); check(); }
    });

    function check() {
      if (wrap.dataset.done) return;
      const value = field.value.trim();
      if (!value) { field.focus(); return; }
      const result = gradeStep(step, value);

      if (isExam) {
        wrap.dataset.done = '1';
        field.disabled = true; send.disabled = true;
        examAnswers.push({ item, step, value, result });
        wrap.append(nextButton(item, step));
        return;
      }
      if (result.status !== 'correcto' && attempts === 0) {
        attempts = 1;
        field.classList.add('wrong');
        tools.after(h('div', { class: 'verdict bad' },
          h('h4', {}, result.status === 'errata' ? 'Casi' : 'Todavía no'),
          h('p', { class: 'small' }, result.detail || 'Revisa la forma y vuelve a intentarlo.'),
          hint(step)));
        field.focus();
        return;
      }
      wrap.dataset.done = '1';
      field.disabled = true; send.disabled = true;
      field.classList.add(result.status === 'correcto' ? 'correct' : 'wrong');
      finishStep(item, step, result, wrap, { assisted: attempts > 0 });
    }
    return wrap;
  }

  function hint(step) {
    if (step.mode === 'tokens') {
      return h('p', { class: 'small muted' },
        `Pista: la respuesta tiene que mencionar ${(step.requiredTokens || []).length} datos.`);
    }
    if (step.mode === 'fragments') {
      return h('p', { class: 'small muted' },
        `Pista: hacen falta ${(step.requiredFragments || []).length} frases.`);
    }
    const model = (step.accepted && step.accepted[0]) || '';
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
      if (model) {
        verdict.append(h('p', {}, 'Respuesta esperada: ',
          h('span', { class: hasCyr(model) ? 'ref' : '' }, hasCyr(model) ? stressed(model) : model)));
      }
      if (result.detail) verdict.append(h('p', { class: 'small muted' }, result.detail));
    }

    const isLastStep = stepIndex >= item.steps.length - 1;
    if (isLastStep) {
      if (item.notes && item.notes.length) {
        verdict.append(h('p', { class: 'small muted', style: 'margin-top:.6rem' }, 'Lo que decide esta tarea:'),
          h('ul', { class: 'small muted' }, ...item.notes.map((note) => h('li', {}, note))));
      }
      if (item.reference && hasCyr(item.reference)) {
        verdict.append(h('div', { class: 'row' },
          h('span', { class: 'ref' }, stressed(item.reference)), audioButton(item.reference, '▶ oír')));
      }
    }
    wrap.append(verdict, nextButton(item, step));
  }

  function nextButton(item) {
    const isLastStep = stepIndex >= item.steps.length - 1;
    const isLastItem = index >= items.length - 1;
    const label = !isLastStep ? 'Siguiente paso →' : isLastItem ? 'Terminar' : 'Siguiente ejercicio →';
    const btn = h('button', { class: 'primary', type: 'button', onclick: advance }, label);
    setTimeout(() => btn.focus({ preventScroll: true }), 40);
    document.addEventListener('keydown', onKey);

    function onKey(e) {
      if (e.key !== 'Enter') return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      e.preventDefault();
      advance();
    }
    function advance() {
      document.removeEventListener('keydown', onKey);
      if (!isLastStep) { stepIndex += 1; attempts = 0; render(); return; }
      if (!isExam) {
        store.recordItem(item, itemResults);
        sessionResults.push({ item, results: itemResults });
        marks[index] = itemResults.every((r) => r.status === 'correcto') ? 'done' : 'miss';
      } else {
        marks[index] = 'done';
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
    paintSegments();
    document.body.classList.remove('focus-mode');
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
      h('p', { class: 'eyebrow' }, 'Sesión terminada'),
      h('h2', {}, `${ok} de ${total} pasos correctos`),
      h('div', { class: 'bar' }, h('i', { style: `width:${total ? (ok / total) * 100 : 0}%` })),
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Competencia'), h('th', { class: 'num' }, 'Acierto'), h('th', {}, 'Vuelve'))),
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

    const byItem = new Map();
    for (const a of examAnswers) {
      const list = byItem.get(a.item) || [];
      list.push({ step: a.step, status: a.result.status, assisted: false });
      byItem.set(a.item, list);
    }
    for (const [item, results] of byItem) store.recordItem(item, results);
    const examState = store.recordExam(unit, score, { ok, total });

    clear(stage).append(h('div', { class: 'card stack' },
      h('p', { class: 'eyebrow' }, examState.passed ? 'Examen superado' : 'Examen no superado'),
      h('h2', {}, `${pct(score)} · ${ok} de ${total}`),
      h('div', { class: 'bar red' }, h('i', { style: `width:${score * 100}%` })),
      h('p', { class: 'muted' }, examState.passed
        ? `Queda abierta la unidad ${pad(unit + 1)}.`
        : `Hace falta un ${pct(PASS_MARK)}. Lo fallado ya está en la cola de repaso.`),
      h('div', { class: 'row' },
        h('a', {
          class: 'btn primary',
          href: examState.passed ? `#/u/${unit + 1}` : `#/u/${unit}/practica`,
        }, examState.passed ? 'Siguiente unidad →' : 'Practicar lo fallado'),
        h('a', { class: 'btn ghost', href: `#/u/${unit}` }, 'Volver a la unidad')),
      h('h3', { style: 'margin-top:1rem' }, 'Detalle'),
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Tarea'), h('th', {}, 'Tu respuesta'), h('th', {}, 'Esperado'), h('th', {}, ''))),
        h('tbody', {}, ...examAnswers.map((a) => h('tr', {},
          h('td', { class: 'small' }, a.item.prompt.length > 80 ? `${a.item.prompt.slice(0, 80)}…` : a.item.prompt),
          h('td', { class: hasCyr(a.value) ? 'ru small' : 'small' }, a.value),
          h('td', { class: 'ru small' }, a.step.kind === 'choice' ? a.step.answer : (a.step.accepted || [])[0] || '—'),
          h('td', {}, a.result.status === 'correcto' ? '✓' : '✗')))))));
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
  const all = datasets.flatMap((d) => d.vocabulary);

  const list = h('div', { class: 'vocab-list' });
  const search = h('input', {
    class: 'search', type: 'search', placeholder: 'Buscar en ruso o en español…',
    oninput: () => paint(),
  });
  const chips = h('div', { class: 'ex-filters' });
  let unitFilter = '';
  chips.append(h('button', {
    class: 'chip', type: 'button', 'aria-pressed': true,
    onclick: (e) => { unitFilter = ''; mark(e.currentTarget); paint(); },
  }, 'Todas'));
  for (const u of curriculum.units) {
    chips.append(h('button', {
      class: 'chip', type: 'button', 'aria-pressed': false,
      onclick: (e) => { unitFilter = String(u.unit); mark(e.currentTarget); paint(); },
    }, pad(u.unit)));
  }
  function mark(active) {
    [...chips.children].forEach((c) => c.setAttribute('aria-pressed', String(c === active)));
  }

  function paint() {
    const q = search.value.trim().toLowerCase();
    clear(list).append(...all
      .filter((v) => !unitFilter || String(v.unit) === unitFilter)
      .filter((v) => !q || `${v.lemma} ${v.translation}`.toLowerCase().includes(q))
      .map(vocabCard));
  }

  clear(root).append(
    h('p', { class: 'eyebrow' }, 'Léxico'),
    h('h1', {}, 'Vocabulario del curso'),
    h('p', { class: 'lede' }, `${all.length} entradas de las once unidades, con la vocal tónica marcada en rojo.`),
    h('div', { class: 'row', style: 'margin:1rem 0' }, search),
    chips, list);
  paint();
}

// ----------------------------------------------------------------- progreso

export async function viewProgress(root) {
  const curriculum = await loadCurriculum();
  const total = curriculum.units.length;
  const due = store.dueSkills();
  const practised = curriculum.skills.filter((s) => store.state.skills[s.skillId]);

  const heat = h('div', { class: 'heat' }, ...curriculum.units.map((u) => {
    const st = store.unit(u.unit);
    const bg = st.exam.passed ? 'var(--green)' : store.isUnlocked(u.unit) ? 'var(--red)' : 'var(--paper-3)';
    return h('i', {
      style: `background:${bg};color:${st.exam.passed || store.isUnlocked(u.unit) ? '#fff' : 'inherit'}`,
      title: `Unidad ${pad(u.unit)} · ${st.exam.passed ? `superada ${pct(st.exam.best)}` : store.isUnlocked(u.unit) ? 'abierta' : 'bloqueada'}`,
    }, pad(u.unit).slice(1));
  }));

  const cards = practised
    .sort((a, b) => store.strength(a.skillId) - store.strength(b.skillId))
    .map((s) => {
      const st = store.state.skills[s.skillId];
      return h('div', { class: 'skillcard' },
        radar(st),
        h('div', {},
          h('h4', {}, s.linguisticPhenomenon),
          h('div', { class: 'muted small' }, `unidad ${pad(s.unit)} · ${st.lapses || 0} recaídas · vuelve ${relTime(st.due)}`),
          h('div', { class: 'dimlist' }, ...DIMENSIONS.map(([id, label]) => {
            const d = st.dims[id] || { s: 0, n: 0 };
            return h('div', { class: 'dimline' },
              h('span', {}, label),
              h('span', { class: 'bar' }, h('i', { style: `width:${(d.n ? d.s : 0) * 100}%` })),
              h('span', {}, d.n ? pct(d.s) : '—'));
          }))));
    });

  clear(root).append(
    h('p', { class: 'eyebrow' }, 'Progreso'),
    h('h1', {}, 'Qué sabes, y hasta cuándo'),
    h('div', { class: 'kpis' },
      kpi(pad(store.highestUnlocked(total)), 'unidad abierta'),
      kpi(`${practised.length}/${curriculum.skills.length}`, 'competencias tocadas'),
      kpi(String(due.length), 'vencidas hoy'),
      kpi(String(store.state.events.length), 'respuestas')),
    h('section', { class: 'stack' }, h('p', { class: 'eyebrow' }, 'Unidades'), heat),
    h('hr', { class: 'rule' }),
    h('p', { class: 'eyebrow' }, 'Competencias, dimensión a dimensión'),
    h('p', { class: 'muted small' },
      'Una elección múltiple sólo acredita reconocimiento. Producir sin pista acredita recuperación, '
      + 'y si han pasado siete días o más, también retención diferida.'),
    cards.length ? h('div', { class: 'skillcards' }, ...cards)
      : h('p', { class: 'muted' }, 'Todavía no hay datos: practica una unidad.'),
    h('hr', { class: 'rule' }),
    h('section', { class: 'stack' },
      h('p', { class: 'eyebrow' }, 'Datos'),
      h('p', { class: 'muted small' }, 'El progreso vive sólo en este navegador.'),
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
