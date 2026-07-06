import { escapeHtml, formatDateTime } from '../../core/utils.js';

export const guidedSessionFeature = {
  id: 'guided-session',
  label: 'Sesión',
  order: 1,
  navMode: 'primary',
  mount(container, context) {
    let session = context.scheduler.buildSession();
    let taskIndex = 0;
    let startedAt = performance.now();

    function render() {
      const task = session.tasks[taskIndex];
      container.innerHTML = `
        <section class="app-layout guided-session">
          <div class="primary-pane" id="guidedMain"></div>
          <aside class="side-pane" id="guidedSide"></aside>
        </section>
      `;
      renderSide(container.querySelector('#guidedSide'), context, session, taskIndex);
      if (!task) return renderDone(container.querySelector('#guidedMain'), context, () => {
        session = context.scheduler.buildSession();
        taskIndex = 0;
        startedAt = performance.now();
        render();
      });
      if (task.kind === 'explain') renderExplain(container.querySelector('#guidedMain'), task, context, () => {
        taskIndex += 1;
        startedAt = performance.now();
        render();
      });
      else renderExercise(container.querySelector('#guidedMain'), task.exercise, context, startedAt, () => {
        taskIndex += 1;
        startedAt = performance.now();
        render();
      });
    }

    render();
  }
};

function renderExplain(node, task, context, onNext) {
  const card = task.card || {};
  const target = task.target;
  const examples = card.examples || context.content.getExamplesForTarget(target).slice(0, 3);
  const audioText = explainAudioText(target, examples, context);
  node.innerHTML = `
    <article class="learning-card focus-card">
      <p class="eyebrow">Objetivo ahora</p>
      <h2>${escapeHtml(target.text)}</h2>
      <div class="tag-row">
        <span class="tag">${escapeHtml(target.kind === 'grammar' ? 'gramática' : 'vocabulario')}</span>
        <span class="tag">Clase ${String(target.lesson).padStart(2, '0')}</span>
        <span class="tag">${escapeHtml(target.level_title || target.level)}</span>
      </div>
      <dl class="fact-grid">
        <div><dt>Traducción</dt><dd>${escapeHtml(card.translation || 'Pendiente de completar')}</dd></div>
        <div><dt>Transcripción</dt><dd>${escapeHtml(card.transcription || 'Pendiente')}</dd></div>
        <div><dt>Sílaba tónica</dt><dd>${escapeHtml(card.stress_syllable || 'Pendiente')}</dd></div>
        <div><dt>Forma marcada</dt><dd>${escapeHtml(card.stress_marked || target.text)}</dd></div>
      </dl>
      <p class="big-text">${escapeHtml(card.short_explanation || target.explanation || 'Observa la forma, escúchala y recupérala sin mirar.')}</p>
      ${examples.length ? `<ul class="example-list">${examples.map(example => `<li><button type="button" data-speak="${escapeHtml(example)}">${escapeHtml(example)}</button></li>`).join('')}</ul>` : ''}
      <div class="guided-actions">
        ${audioText ? `<button type="button" class="secondary" data-speak="${escapeHtml(audioText)}">${audioText === target.text ? 'Escuchar' : 'Escuchar ejemplo'}</button>` : ''}
        <button type="button" id="continueTask">Practicar</button>
      </div>
    </article>
  `;
  node.querySelectorAll('[data-speak]').forEach(button => {
    button.addEventListener('click', () => playAudio(context, button.dataset.speak));
  });
  node.querySelector('#continueTask')?.addEventListener('click', onNext);
}

function renderExercise(node, exercise, context, startedAt, onNext) {
  const handler = context.registry.getExercise(exercise.type);
  const widget = handler.render(exercise, context);
  const audioText = exercise.tts_text || exercise.expected || '';
  const showListen = audioText && !['dictation', 'listen-choice'].includes(exercise.type) && context.audio.hasRecorded(audioText);
  node.innerHTML = `
    <article class="learning-card focus-card">
      <p class="eyebrow">Recuperación activa</p>
      <h2>${escapeHtml(exercise.prompt)}</h2>
      <p class="task-guidance">${escapeHtml(guidanceForExercise(exercise))}</p>
      <div class="tag-row">
        <span class="tag">${escapeHtml(labelForExercise(exercise.type))}</span>
        <span class="tag">Clase ${String(exercise.lesson || '').padStart(2, '0')}</span>
        <span class="tag">${escapeHtml(skillLabel(exercise.skill))}</span>
      </div>
      ${showListen ? `<div class="inline-actions"><button type="button" class="secondary" id="listenExercise">Escuchar modelo</button></div>` : ''}
      <form id="exerciseForm" class="exercise-form"></form>
      <div id="exerciseFeedback"></div>
    </article>
  `;
  node.querySelector('#listenExercise')?.addEventListener('click', () => playAudio(context, audioText));
  const form = node.querySelector('#exerciseForm');
  const controls = document.createElement('div');
  controls.className = 'exercise-controls';
  controls.innerHTML = `
    <label class="confidence-label">Confianza
      <select id="confidenceInput">
        <option value="3">Normal</option>
        <option value="1">He dudado</option>
        <option value="5">Muy seguro</option>
      </select>
    </label>
    <button type="submit">Comprobar</button>
  `;
  form.append(widget.element, controls);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const confidence = Number(node.querySelector('#confidenceInput')?.value || 3);
    const answer = widget.readAnswer();
    const result = handler.evaluate(answer, exercise, context);
    const competencyTags = context.content.getCompetencyTagsForExercise(exercise);
    const responseTime = Math.round(performance.now() - startedAt);
    context.eventLog.record({
      skill: exercise.skill,
      exercise_type: exercise.type,
      modality: exercise.modality,
      target_ids: exercise.target_ids || [],
      competency_ids: competencyTags.map(item => item.id),
      competency_tags: competencyTags.map(item => ({
        id: item.id,
        dimension: item.dimension,
        label: item.label
      })),
      lesson: exercise.lesson,
      prompt: exercise.prompt,
      expected: result.expected,
      answer: result.answer,
      correct: result.correct,
      error_type: result.error_type,
      response_time_ms: responseTime,
      confidence
    });
    context.learner.recordExerciseResult({
      exercise,
      correct: result.correct,
      confidence,
      responseTime,
      errorType: result.error_type
    });
    renderFeedback(node.querySelector('#exerciseFeedback'), result, exercise, onNext);
    form.querySelectorAll('input, textarea, button, select').forEach(item => {
      if (item.id !== 'nextTask') item.disabled = true;
    });
  });
  window.setTimeout(() => widget.focus?.(), 50);
}

function renderFeedback(node, result, exercise, onNext) {
  node.innerHTML = `
    <div class="feedback-box ${result.correct ? 'correct' : 'wrong'}">
      <strong>${result.correct ? 'Correcto' : 'Aún no'}</strong>
      <p>${result.correct ? 'Este objetivo se espaciará más y volverá cuando toque.' : `Respuesta esperada: ${escapeHtml(result.displayExpected || exercise.expected)}`}</p>
      ${result.error_type ? `<p class="muted">Foco de error: ${escapeHtml(result.error_type)}</p>` : ''}
      <button type="button" id="nextTask">Siguiente</button>
    </div>
  `;
  node.querySelector('#nextTask')?.addEventListener('click', onNext);
}

function renderDone(node, context, onRestart) {
  const summary = context.learner.summary();
  node.innerHTML = `
    <article class="learning-card focus-card">
      <p class="eyebrow">Sesión completada</p>
      <h2>Sesión cerrada.</h2>
      <p class="big-text">Has registrado ${summary.todayCount}/${summary.dailyTarget} actividades hoy. La siguiente ronda mezclará material nuevo, repaso vencido y objetivos fallados para que no tengas que escoger qué estudiar.</p>
      <div class="guided-actions">
        <button type="button" id="restartSession">Otra ronda</button>
        <button type="button" class="secondary" id="openCalendar">Ver calendario</button>
      </div>
    </article>
  `;
  node.querySelector('#restartSession')?.addEventListener('click', onRestart);
  node.querySelector('#openCalendar')?.addEventListener('click', () => context.showFeature('calendar'));
}

function renderSide(node, context, session, taskIndex) {
  const summary = context.learner.summary();
  const weak = context.learner.weakTargets(3);
  const nextPlan = context.scheduler.previewPlan(4);
  const task = session.tasks[taskIndex];
  node.innerHTML = `
    <article class="side-card">
      <h3>Ahora</h3>
      <p>${escapeHtml(currentTaskLabel(task))}</p>
      <p class="muted small">Sigue el panel principal: escuchar, responder, comprobar y pasar a la siguiente tarea.</p>
    </article>
    <article class="side-card">
      <h3>Hoy</h3>
      <div class="metric-list">
        <span><strong>${summary.todayCount}/${summary.dailyTarget}</strong> objetivo diario</span>
        <span><strong>${summary.streak}</strong> día(s) de racha</span>
        <span><strong>${summary.lessonMax}</strong> clases desbloqueadas</span>
      </div>
    </article>
    <article class="side-card">
      <h3>Sesión</h3>
      <progress max="${session.tasks.length}" value="${Math.min(taskIndex, session.tasks.length)}"></progress>
      <p class="muted small">${Math.min(taskIndex + 1, session.tasks.length)} de ${session.tasks.length} tareas · creada ${formatDateTime(session.created_at)}</p>
    </article>
    <article class="side-card">
      <h3>Atención</h3>
      ${weak.length ? weak.map(item => `<p><strong>${escapeHtml(item.target.text)}</strong><br><span class="muted">${Math.round(item.state.mastery * 100)}% dominio</span></p>`).join('') : '<p class="muted">Sin debilidades claras todavía.</p>'}
    </article>
    <article class="side-card">
      <h3>Próximos repasos</h3>
    ${nextPlan.slice(0, 3).map(day => `<p><strong>${escapeHtml(day.date)}</strong><br><span class="muted">${day.items.length} objetivo(s)</span></p>`).join('')}
    </article>
    <article class="side-card">
      <h3>Método aplicado</h3>
      <ol class="method-compact">
        <li>Explicación breve sólo cuando ayuda.</li>
        <li>Recuperación activa antes de ver la respuesta.</li>
        <li>Feedback inmediato con foco de error.</li>
        <li>Repaso espaciado e intercalado.</li>
      </ol>
    </article>
  `;
}

function labelForExercise(type) {
  return ({
    'text-input': 'escritura',
    cloze: 'huecos',
    'multiple-choice': 'elección',
    dictation: 'dictado',
    'listen-choice': 'escucha',
    transform: 'transformación',
    'production-prompt': 'producción'
  })[type] || type;
}

function skillLabel(skill) {
  return ({
    recognition: 'reconocimiento',
    production: 'producción',
    listening: 'escucha',
    grammar_transfer: 'gramática'
  })[skill] || skill || 'práctica';
}

function guidanceForExercise(exercise) {
  return ({
    'text-input': 'Recupera la forma rusa de memoria. Si dudas, escribe una respuesta corta y comprueba.',
    cloze: 'Lee la frase y completa sólo la parte que falta.',
    'multiple-choice': 'No busques la opción por descarte superficial: lee las cuatro y elige la que cumple el objetivo.',
    dictation: 'Escucha primero la frase completa; luego escríbela en ruso.',
    'listen-choice': 'Escucha antes de mirar demasiado las opciones y elige la frase que oyes.',
    transform: 'Cambia la forma, no traduzcas palabra por palabra.',
    'production-prompt': 'Produce una frase breve y natural usando el objetivo.'
  })[exercise.type] || 'Responde antes de mirar la solución.';
}

function currentTaskLabel(task) {
  if (!task) return 'Cierre de la sesión.';
  if (task.kind === 'explain') {
    return `Primero observa: ${task.target?.text || 'nuevo objetivo'}.`;
  }
  const exercise = task.exercise || {};
  return `Practica ${labelForExercise(exercise.type).toLowerCase()} de clase ${String(exercise.lesson || '').padStart(2, '0')}.`;
}

function playAudio(context, text) {
  context.notify('');
  context.audio.speak(text, { allowFallback: true }).then(ok => {
    if (!ok) context.notify('No se pudo reproducir el audio en este navegador.');
  }).catch(() => context.notify('No se pudo reproducir el audio en este navegador.'));
}

function explainAudioText(target, examples, context) {
  const candidates = [target?.text, ...(examples || [])]
    .map(value => String(value || '').trim())
    .filter(Boolean);
  const recorded = candidates.find(value => context.audio.hasRecorded(value));
  if (recorded) return recorded;
  return candidates.find(isNaturalRussianSpeech) || '';
}

function isNaturalRussianSpeech(value) {
  return /[а-яё]/i.test(value) && !/[+/_|()[\]{}<>→=]/.test(value) && !/[A-Za-zÁÉÍÓÚáéíóúñÑ]/.test(value);
}
