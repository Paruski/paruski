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
  const renderedExamples = examples.map(example => renderExample(example, context)).join('');
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
      ${examples.length ? `<ul class="example-list">${renderedExamples}</ul>` : ''}
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
  const showListen = audioText && !['dictation', 'listen-choice', 'multiple-choice'].includes(exercise.type) && context.audio.hasRecorded(audioText);
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
  controls.className = 'exercise-controls exercise-actions';
  controls.innerHTML = `
    <button type="button" class="secondary" id="unknownTask">No sé</button>
    <button type="button" class="secondary" id="deferTask">Resolver luego</button>
    <button type="submit">Comprobar</button>
  `;
  form.append(widget.element, controls);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const answer = widget.readAnswer();
    const result = handler.evaluate(answer, exercise, context);
    const responseTime = Math.round(performance.now() - startedAt);
    finishExercise({
      context,
      exercise,
      result,
      responseTime,
      optionUsed: 'responder'
    });
    renderFeedback(node.querySelector('#exerciseFeedback'), result, exercise, onNext);
    lockForm(form);
  });
  node.querySelector('#unknownTask')?.addEventListener('click', () => {
    const responseTime = Math.round(performance.now() - startedAt);
    const result = {
      correct: false,
      answer: '',
      expected: exercise.expected,
      displayExpected: exercise.display_expected || exercise.expected,
      error_type: 'no_se',
      option_used: 'no_se'
    };
    finishExercise({ context, exercise, result, responseTime, optionUsed: 'no_se' });
    renderFeedback(node.querySelector('#exerciseFeedback'), result, exercise, onNext);
    lockForm(form);
  });
  node.querySelector('#deferTask')?.addEventListener('click', () => {
    const responseTime = Math.round(performance.now() - startedAt);
    const result = {
      correct: null,
      deferred: true,
      answer: '',
      expected: exercise.expected,
      displayExpected: exercise.display_expected || exercise.expected,
      error_type: null,
      option_used: 'resolver_luego'
    };
    finishExercise({ context, exercise, result, responseTime, optionUsed: 'resolver_luego' });
    renderFeedback(node.querySelector('#exerciseFeedback'), result, exercise, onNext);
    lockForm(form);
  });
  window.setTimeout(() => widget.focus?.(), 50);
}

function renderFeedback(node, result, exercise, onNext) {
  const title = result.deferred ? 'Lo dejamos para luego' : result.correct ? 'Correcto' : result.option_used === 'no_se' ? 'Registrado como no sabido' : 'Aún no';
  const body = result.deferred
    ? 'Volverá pronto sin contar como fallo completo ni como acierto.'
      : result.correct
        ? 'Este objetivo se espaciará más y volverá cuando toque.'
        : `${result.feedback ? `${escapeHtml(result.feedback)} ` : ''}Respuesta esperada: ${escapeHtml(result.displayExpected || exercise.expected)}`;
  node.innerHTML = `
    <div class="feedback-box ${result.correct ? 'correct' : result.deferred ? 'neutral' : 'wrong'}">
      <strong>${escapeHtml(title)}</strong>
      <p>${body}</p>
      ${result.error_type ? `<p class="muted">Foco de error: ${escapeHtml(result.error_type)}</p>` : ''}
      <button type="button" id="nextTask">Siguiente</button>
    </div>
  `;
  node.querySelector('#nextTask')?.addEventListener('click', onNext);
}

function finishExercise({ context, exercise, result, responseTime, optionUsed }) {
  const competencyTags = context.content.getCompetencyTagsForExercise(exercise);
  const reviewBefore = reviewSnapshot(context, exercise);
  const targetSnapshots = targetSnapshot(context, exercise);
  const confidence = inferredConfidence(result.correct, responseTime, optionUsed);
  if (optionUsed === 'resolver_luego') {
    context.learner.deferExerciseResult({ exercise, responseTime });
  } else {
    context.learner.recordExerciseResult({
      exercise,
      correct: Boolean(result.correct),
      confidence,
      responseTime,
      errorType: result.error_type,
      optionUsed
    });
  }
  const reviewAfter = reviewSnapshot(context, exercise);
  context.eventLog.record({
    item_id: exercise.id,
    exercise_id: exercise.id,
    skill: exercise.skill,
    exercise_type: exercise.type,
    modality: exercise.modality,
    direction: exercise.direction || directionForExercise(exercise),
    difficulty: exercise.difficulty ?? exercise.complexity ?? null,
    importance: exercise.weight ?? exercise.importance ?? null,
    target_ids: exercise.target_ids || [],
    targets: targetSnapshots,
    target_snapshots: targetSnapshots,
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
    option_used: optionUsed,
    action: optionUsed,
    error_type: result.error_type,
    response_time_ms: responseTime,
    hints_used: 0,
    confidence,
    review_before: reviewBefore,
    review_after: reviewAfter,
    srs_before: reviewBefore,
    srs_after: reviewAfter
  });
}

function lockForm(form) {
  form.querySelectorAll('input, textarea, button, select').forEach(item => {
    if (item.id !== 'nextTask') item.disabled = true;
  });
}

function inferredConfidence(correct, responseTime, optionUsed) {
  if (optionUsed === 'no_se') return 1;
  if (optionUsed === 'resolver_luego') return null;
  if (!correct) return 2;
  if (responseTime && responseTime < 7000) return 5;
  if (responseTime && responseTime < 18000) return 4;
  return 3;
}

function reviewSnapshot(context, exercise) {
  return Object.fromEntries((exercise.target_ids || []).map(targetId => {
    const state = context.learner.getTargetState(targetId);
    return [targetId, {
      mastery: state.mastery || 0,
      attempts: state.attempts || 0,
      correct: state.correct || 0,
      wrong: state.wrong || 0,
      interval_days: state.interval_days || 0,
      next_due_at: state.next_due_at || null,
      skills: state.skills || {}
    }];
  }));
}

function targetSnapshot(context, exercise) {
  return (exercise.target_ids || []).map(targetId => {
    const target = context.content.getTarget(targetId);
    return {
      id: targetId,
      text: target?.text || targetId,
      kind: target?.kind || null,
      lesson: target?.lesson || exercise.lesson || null,
      level: target?.level || exercise.level || null,
      importance: target?.importance ?? null,
      difficulty: target?.difficulty ?? null
    };
  });
}

function directionForExercise(exercise) {
  if (exercise.type === 'listen-choice' || exercise.type === 'dictation') return 'audio_to_russian';
  if (exercise.type === 'production-prompt' || exercise.type === 'text-input') return 'spanish_or_prompt_to_russian';
  if (exercise.type === 'multiple-choice') return 'recognition';
  if (exercise.type === 'error-correction') return 'error_diagnosis';
  if (exercise.type === 'cloze' || exercise.type === 'transform') return 'russian_form_manipulation';
  return 'practice';
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
        <span><strong>${summary.lessonMax}</strong> clases en estudio</span>
        <span><strong>${summary.unlockedLessonMax || summary.lessonMax}</strong> clases desbloqueadas</span>
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
    'error-correction': 'corrección',
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
    'listen-choice': 'Escucha antes de mirar demasiado las opciones y elige el significado o la interpretación más precisa.',
    'error-correction': 'Detecta el error, corrige la frase rusa y comprueba que no traduces literalmente desde el español.',
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
  context.audio.speak(text, { requireRecorded: true }).then(ok => {
    if (!ok) context.notify('Ese audio grabado aún no está disponible.');
  }).catch(() => context.notify('Ese audio grabado aún no está disponible.'));
}

function explainAudioText(target, examples, context) {
  const candidates = [target?.text, ...(examples || [])]
    .map(value => String(value || '').trim())
    .filter(Boolean);
  const recorded = candidates.find(value => context.audio.hasRecorded(value));
  if (recorded) return recorded;
  return '';
}

function renderExample(example, context) {
  const value = String(example || '').trim();
  if (!value) return '';
  if (!context.audio.hasRecorded(value)) {
    return `<li><span>${escapeHtml(value)}</span></li>`;
  }
  return `<li><button type="button" data-speak="${escapeHtml(value)}">${escapeHtml(value)}</button></li>`;
}
