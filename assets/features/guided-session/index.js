import { escapeHtml, formatDateTime } from '../../core/utils.js';

const PRACTICE_MODES = [
  { id: 'all', label: 'Todo' },
  { id: 'vocabulary', label: 'Vocabulario' },
  { id: 'grammar', label: 'Gramática' },
  { id: 'mixed', label: 'Mixto' }
];

const VOCABULARY_FORMATS = [
  { id: 'all', label: 'Ambos' },
  { id: 'test', label: 'Tipo test' },
  { id: 'open', label: 'Respuesta abierta' }
];

// Module-level exam timer to prevent orphans across remounts
let _globalExamTimerInterval = null;

function _stopAnyExamTimer() {
  if (_globalExamTimerInterval !== null) {
    clearInterval(_globalExamTimerInterval);
    _globalExamTimerInterval = null;
  }
}

export const guidedSessionFeature = {
  id: 'guided-session',
  label: 'Ejercicios',
  order: 2,
  navMode: 'primary',
  mount(container, context) {
    // Clear any orphan exam timer from previous guided-session instance
    _stopAnyExamTimer();
    let practiceMode = getPracticeMode(context);
    let practiceVocabularyFormat = getPracticeVocabularyFormat(context);
    let session = context.scheduler.buildSession({ practiceMode, practiceVocabularyFormat });
    let taskIndex = 0;
    let startedAt = performance.now();
    let wrongCriticalIds = new Set();
    let examAutoSubmitted = false;
    let rebuildGuard = false;

    function rebuild() {
      if (rebuildGuard) return;
      rebuildGuard = true;
      examAutoSubmitted = false;
      showLanding = false;
      practiceMode = getPracticeMode(context);
      practiceVocabularyFormat = getPracticeVocabularyFormat(context);
      session = context.scheduler.buildSession({ practiceMode, practiceVocabularyFormat });
      taskIndex = 0;
      startedAt = performance.now();
      render();
      rebuildGuard = false;
    }

    function doAutoSubmit() {
      if (examAutoSubmitted || session.timedOut) return;
      examAutoSubmitted = true;
      stopExamTimerGlobal();
      session.timedOut = true;
      // Record unanswered remaining tasks as incorrect
      for (let i = taskIndex; i < session.tasks.length; i++) {
        const t = session.tasks[i];
        if (!t || !t.exercise) continue;
        const ex = t.exercise;
        context.learner.recordExerciseResult({
          exercise: ex,
          correct: false,
          confidence: 1,
          responseTime: null,
          errorType: 'timed_out',
          optionUsed: 'timed_out'
        });
      }
      taskIndex = session.tasks.length; // go to end
      render();
    }

    function startExamTimerGlobal() {
      stopExamTimerGlobal();
      if (!session.examTimer) return;
      _globalExamTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - session.examTimer.startedAt) / 1000);
        const remaining = Math.max(0, session.examTimer.timeLimitSeconds - elapsed);
        session.examTimer.remainingSeconds = remaining;
        const display = container.querySelector('#examTimerDisplay');
        if (display) {
          display.textContent = formatTime(remaining);
          if (remaining <= 60) display.style.color = 'var(--danger)';
        }
        if (remaining <= 0) {
          doAutoSubmit();
        }
      }, 500);
    }

    function stopExamTimerGlobal() {
      _stopAnyExamTimer();
    }

    let showLanding = true;

    function hideLanding() {
      showLanding = false;
      render();
    }

    function render() {
      // Show landing page with cards when no session tasks or first visit
      if (showLanding && session.mode !== 'exam' && (!session.tasks || session.tasks.length === 0 || taskIndex === 0)) {
        renderLandingPage(container, context, session, hideLanding, rebuild);
        return;
      }

      // If after landing we have no tasks, show message instead of rebuilding
      if (!showLanding && (!session.tasks || session.tasks.length === 0)) {
        container.innerHTML = `
          <section class="app-layout guided-session">
            <div class="primary-pane" style="padding:2rem;text-align:center">
              <p class="big-text">No hay ejercicios disponibles para esta configuración.</p>
              <p class="muted">Prueba otro tipo de práctica o completa más contenido para desbloquear ejercicios.</p>
              <button type="button" class="primary" style="margin-top:1rem" id="backToLanding">Volver al inicio</button>
            </div>
          </section>
        `;
        container.querySelector('#backToLanding')?.addEventListener('click', () => { showLanding = true; render(); });
        return;
      }

      const task = session.tasks[taskIndex];

      container.innerHTML = `
        <section class="app-layout guided-session">
          <div class="primary-pane" id="guidedMain"></div>
          <aside class="side-pane" id="guidedSide"></aside>
        </section>
      `;

      // Start/stop exam timer globally (not in renderSide)
      stopExamTimerGlobal();
      if (session.mode === 'exam' && session.examTimer && !examAutoSubmitted) {
        startExamTimerGlobal();
      }

      renderSide(
        container.querySelector('#guidedSide'),
        context,
        session,
        taskIndex,
        practiceMode,
        practiceVocabularyFormat,
        nextMode => {
          if (session.mode === 'exam' || nextMode === practiceMode) return;
          practiceMode = nextMode;
          savePracticeMode(context, practiceMode);
          rebuild();
        },
        nextFormat => {
          if (session.mode === 'exam' || nextFormat === practiceVocabularyFormat) return;
          practiceVocabularyFormat = nextFormat;
          savePracticeVocabularyFormat(context, practiceVocabularyFormat);
          rebuild();
        }
      );
      if (!task) {
        stopExamTimerGlobal();
        return renderDone(container.querySelector('#guidedMain'), context, session, taskIndex, rebuild);
      }
      if (task.kind === 'explain') renderExplain(container.querySelector('#guidedMain'), task, context, () => {
        taskIndex += 1;
        startedAt = performance.now();
        render();
      });
      else renderExercise(container.querySelector('#guidedMain'), task.exercise, context, startedAt, session, () => {
        taskIndex += 1;
        startedAt = performance.now();
        render();
      });
    }

    render();
  }
};

function renderLandingPage(container, context, session, onStart, onRebuild) {
  const summary = context.learner.summary();
  const weakCount = context.learner.weakTargets(6).length;
  const dueCount = context.learner.dueTargets().length;
  const studyMax = summary.lessonMax || 1;

  container.innerHTML = `
    <section class="guided-session">
      <div class="panel-head app-section-head">
        <div>
          <p class="eyebrow">Practica</p>
          <h2>Que quieres hacer ahora?</h2>
          <p class="muted">Elige el tipo de practica. Cada opcion selecciona ejercicios variados y los mezcla por ti.</p>
        </div>
      </div>
      <div class="plan-card-grid" style="margin-top:1rem">
        <div class="landing-card" data-mode="all">
          <h3>Plan recomendado</h3>
          <p class="muted">${dueCount > 0 ? dueCount + ' objetivos vencidos.' : ''} ${weakCount > 0 ? weakCount + ' debilidades.' : ''} Prioriza lo que mas necesitas segun tu progreso.</p>
          <div class="tag-row">${dueCount > 0 ? '<span class="tag">' + dueCount + ' vencidos</span>' : ''}${weakCount > 0 ? '<span class="tag">' + weakCount + ' debiles</span>' : ''}<span class="tag">~10 min</span></div>
          <button type="button" class="primary" style="margin-top:0.75rem">Empezar</button>
        </div>
        <div class="landing-card" data-mode="vocabulary">
          <h3>Vocabulario</h3>
          <p class="muted">Practica palabras sueltas: reconocimiento y produccion. Ideal para sesiones cortas.</p>
          <div class="tag-row"><span class="tag">~5 min</span><span class="tag">reconocimiento</span><span class="tag">produccion</span></div>
          <button type="button" class="primary" style="margin-top:0.75rem">Empezar</button>
        </div>
        <div class="landing-card" data-mode="grammar">
          <h3>Gramatica</h3>
          <p class="muted">Estructuras, conjugaciones, casos. Ejercicios de correccion, cloze y transformacion.</p>
          <div class="tag-row"><span class="tag">~8 min</span><span class="tag">correccion</span><span class="tag">transformacion</span></div>
          <button type="button" class="primary" style="margin-top:0.75rem">Empezar</button>
        </div>
        <div class="landing-card" data-mode="mixed">
          <h3>Mixto</h3>
          <p class="muted">Combina vocabulario y gramatica en situaciones nuevas. Exige transferencia.</p>
          <div class="tag-row"><span class="tag">~10 min</span><span class="tag">transferencia</span></div>
          <button type="button" class="primary" style="margin-top:0.75rem">Empezar</button>
        </div>
      </div>
      <p class="muted small" style="margin-top:1rem;text-align:center">Tambien puedes ir a <a href="#" id="landingToExams" style="color:var(--accent)">Examenes</a> para desbloquear la siguiente clase.</p>
    </section>
  `;

  container.querySelectorAll('.landing-card[data-mode]').forEach(card => {
    card.addEventListener('click', () => {
      const mode = card.dataset.mode;
      // Save mode to localStorage
      const storage = context.storage;
      if (storage && storage.getProgress) {
        const prog = storage.getProgress ? storage.getProgress() : storage.loadProgress();
        if (prog) {
          prog.settings = prog.settings || {};
          prog.settings.practiceMode = mode;
          if (mode !== 'vocabulary') prog.settings.practiceVocabularyFormat = 'all';
          storage.saveProgress ? storage.saveProgress(prog) : null;
        }
      }
      onRebuild();
    });
    card.querySelector('button')?.addEventListener('click', (e) => {
      e.stopPropagation();
      card.click();
    });
  });

  container.querySelector('#landingToExams')?.addEventListener('click', (e) => {
    e.preventDefault();
    context.showFeature('exams');
  });
}

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

function renderExercise(node, exercise, context, startedAt, session, onNext) {
  const handler = context.registry.getExercise(exercise.type);
  const widget = handler.render(exercise, context);
  const audioText = exercise.tts_text || '';
  const showListen = audioText && !['dictation', 'listen-choice', 'multiple-choice'].includes(exercise.type) && context.audio.hasRecorded(audioText);
  const isExam = session?.mode === 'exam' || exercise.unlock_exam || exercise.exam;
  node.innerHTML = `
    <article class="learning-card focus-card">
      <p class="eyebrow">${isExam ? `Examen de desbloqueo · clase ${String(exercise.lesson || '').padStart(2, '0')}` : 'Recuperación activa'}</p>
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
  if (exercise.type === 'production-prompt' || exercise.type === 'text-input' || exercise.type === 'token-build') return 'spanish_or_prompt_to_russian';
  if (exercise.type === 'multiple-choice' || exercise.type === 'choice-grid') return 'recognition';
  if (exercise.type === 'error-correction') return 'error_diagnosis';
  if (exercise.type === 'cloze' || exercise.type === 'transform') return 'russian_form_manipulation';
  return 'practice';
}

function renderDone(node, context, session, taskIndex, onRestart) {
  const summary = context.learner.summary();
  const examLesson = session?.mode === 'exam' ? session.exam_lesson : summary.examLesson;
  const examStatus = examLesson ? context.learner.lessonExamStatus(examLesson, session?.exam_kind || null) : null;
  const readyForExam = session?.mode !== 'exam' && Boolean(summary.examLesson);
  const weakCount = context.learner.weakTargets(6).length;
  const dueCount = context.learner.dueTargets().length;
  const studyMax = summary.lessonMax || 1;

  let planCards = '';
  if (!readyForExam && session?.mode !== 'exam') {
    planCards = `
      <section class="plan-cards">
        <h3>Plan recomendado para ahora</h3>
        <div class="plan-card-grid">
          ${dueCount > 0 ? `
          <div class="plan-card">
            <h4>Repasar contenido vencido</h4>
            <p class="muted">${dueCount == 1 ? '1 objetivo necesita repaso.' : dueCount + ' objetivos necesitan repaso.'} La repetición espaciada programa repasos justo antes de olvidar.</p>
            <button type="button" class="secondary" id="restartSession">Practicar vencido</button>
          </div>` : ''}
          ${weakCount > 0 ? `
          <div class="plan-card">
            <h4>Reforzar debilidades</h4>
            <p class="muted">${weakCount == 1 ? '1 objetivo con dominio bajo.' : weakCount + ' objetivos con dominio bajo.'} La sesión priorizará fallos recientes para consolidarlos.</p>
            <button type="button" class="secondary" id="restartSession">Reforzar debilidades</button>
          </div>` : ''}
          <div class="plan-card">
            <h4>Avanzar en la lección ${String(studyMax).padStart(2, '0')}</h4>
            <p class="muted">Practica vocabulario y gramática de tu clase actual para preparar el desbloqueo.</p>
            <button type="button" class="secondary" data-go-feature="classes">Ir a clases</button>
          </div>
          <div class="plan-card">
            <h4>Práctica libre</h4>
            <p class="muted">Mezcla vocabulario, gramática y ejercicios variados sin presión de examen.</p>
            <button type="button" class="secondary" id="restartSession">Seguir practicando</button>
          </div>
        </div>
      </section>`;
  }

  // Critical failures from THIS exam: only exercises answered WRONG in this session
  // that have criticalErrors defined. Check the learner's exam progress for the current lesson
  // and filter by timestamp to only include this session's results.
  const examCriticals = (() => {
    if (session?.mode !== 'exam') return [];
    const examLesson = session.exam_lesson;
    const examKind = session.exam_kind || null;
    const examStatus = examLesson ? context.learner.lessonExamStatus(examLesson, examKind) : null;
    const recentResults = examStatus?.recent || [];
    const sessionCreated = new Date(session.created_at).getTime();
    // Only results from this session (created after session start)
    const sessionResults = recentResults.filter(item => {
      if (item.correct !== false) return false;
      if (!item.critical) return false;
      const itemTime = new Date(item.at).getTime();
      return itemTime >= sessionCreated;
    });
    return (session?.tasks || []).filter(t => {
      const ex = t.exercise || {};
      if (!ex.diagnostics?.criticalErrors?.length) return false;
      return sessionResults.some(r => r.exercise_id === ex.id);
    });
  })();

  const resultHtml = `
    <article class="learning-card focus-card">
      <p class="eyebrow">Sesión completada</p>
      <h2>${session?.timedOut ? 'Tiempo agotado.' : session?.mode === 'exam' ? (examStatus?.passed ? 'Examen superado.' : 'Examen no superado todavia.') : readyForExam ? `Toca examen de clase ${String(summary.examLesson).padStart(2, '0')}.` : 'No quedan mas ejercicios en esta sesion.'}</h2>
      <p class="big-text">${session?.timedOut ? `El tiempo ha terminado. Has respondido ${session.examTimer ? Math.min(taskIndex, (session.examTimer.scoredCount || session.tasks.length)) : taskIndex} de ${session.tasks.length} preguntas. Las preguntas no respondidas cuentan como incorrectas.` : session?.mode === 'exam' ? `Clase ${examLesson}: necesitas ${examStatus?.required_correct || session.rationale?.required_correct || 0}/${examStatus?.exam_total || session.tasks.length} y cero fallos críticos. Resultado reciente: ${examStatus?.recent?.filter(item => item.correct).length || 0}/${examStatus?.recent?.length || 0}.` : readyForExam ? 'La evidencia de practica ya es suficiente. Pasa al examen para demostrar transferencia.' : `Has registrado ${summary.todayCount}/${summary.dailyTarget} actividades hoy. La siguiente ronda mezclara material nuevo y objetivos fallados; los repasos correctos quedan para dias sucesivos.`}</p>
      ${session?.timedOut ? `<p class="muted small">Duracion: ${session.examTimer ? formatTime(session.examTimer.timeLimitSeconds - session.examTimer.remainingSeconds) : '—'} de ${session.examTimer ? formatTime(session.examTimer.timeLimitSeconds) : '—'}. ${session.examTimer ? 'Puedes reintentar el examen.' : ''}</p>` : ''}
      ${session?.mode === 'exam' && examCriticals.length > 0 ? `
        <div style="margin-top:1rem;padding:0.75rem;border:1px solid rgba(239,68,68,0.5);border-radius:0.6rem;background:rgba(239,68,68,0.08)">
          <h4 style="color:#fecaca;margin:0 0 0.5rem 0">Fallo(s) crítico(s) detectado(s)</h4>
          <p class="muted small">Este examen exige no fallar ciertos puntos centrales. Aunque la nota global sea suficiente, si fallas estos puntos el examen no se considera superado.</p>
          <ul style="margin:0.5rem 0 0 0;font-size:0.85rem">
            ${examCriticals.slice(0, 3).map(t => {
              const ex = t.exercise || {};
              const criticals = ex.diagnostics?.criticalErrors || [];
              return `<li><strong>Pregunta:</strong> ${escapeHtml(ex.prompt || '')}<br><span class="muted">Punto crítico: ${criticals.join(', ')}</span></li>`;
            }).join('')}
          </ul>
          <p class="muted small" style="margin-top:0.5rem">Practica estos puntos concretos antes de reintentar el examen.</p>
          <button type="button" class="secondary" id="practiceCriticalBtn" style="margin-top:0.5rem">Practicar estos puntos</button>
        </div>
      ` : ''}
      <div class="guided-actions">
        ${session?.mode === 'exam' ? '<button type="button" id="openExams" class="primary">Volver al menú de exámenes</button>' : (readyForExam ? '<button type="button" id="openExams" class="primary">Ir a exámenes</button>' : '')}
        ${session?.timedOut ? '<button type="button" id="restartSession" class="secondary">Reintentar examen</button>' : (session?.mode === 'exam' && !examStatus?.passed ? '<button type="button" id="restartSession" class="secondary">Reintentar examen</button>' : '')}
        ${session?.mode === 'exam' && examStatus?.passed ? '<button type="button" class="primary" id="continueToClasses">Siguiente clase</button>' : ''}
        <button type="button" class="secondary" id="openCalendar">Ver calendario</button>
      </div>
    </article>
    ${planCards}
  `;
  node.innerHTML = resultHtml;
  node.querySelector('#restartSession')?.addEventListener('click', onRestart);
  node.querySelector('#openExams')?.addEventListener('click', () => context.showFeature('exams'));
  node.querySelector('#continueToClasses')?.addEventListener('click', () => context.showFeature('classes'));
  node.querySelector('#openCalendar')?.addEventListener('click', () => context.showFeature('calendar'));
  node.querySelector('#practiceCriticalBtn')?.addEventListener('click', () => context.showFeature('guided-session'));
  node.querySelectorAll('[data-go-feature]').forEach(btn => {
    btn.addEventListener('click', () => context.showFeature(btn.dataset.goFeature));
  });
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}



function renderSide(node, context, session, taskIndex, practiceMode, practiceVocabularyFormat, onChangeMode, onChangeVocabularyFormat) {
  const summary = context.learner.summary();
  const weak = context.learner.weakTargets(3);
  const nextPlan = context.scheduler.previewPlan(4);
  const task = session.tasks[taskIndex];
  const examMode = session.mode === 'exam';


  node.innerHTML = `
    <article class="side-card">
      <h3>${examMode ? 'Examen' : (session.rationale?.source ? 'Plan recomendado' : 'Práctica libre')}</h3>
      <p>${escapeHtml(currentTaskLabel(task))}</p>
      ${examMode && session.examTimer ? `
        <div id="examTimerDisplay" class="exam-timer" style="font-size:1.1rem;font-weight:700;margin:0.5rem 0;color:var(--accent-2)">
          ${formatTime(session.examTimer.remainingSeconds)}
        </div>
        <p class="muted small">${session.examTimer.scoredCount} preguntas · ${formatTime(session.examTimer.timeLimitSeconds)} total</p>
      ` : ''}
      <p class="muted small">${examMode ? 'Para desbloquear la siguiente clase, responde sin ayuda y evita fallos críticos.' : (session.rationale?.source ? 'La sesión prioriza lo que más necesitas repasar según tu progreso.' : 'Tú eliges qué practicar. Usa los filtros de abajo.')}</p>
    </article>
    ${examMode ? '' : `
    <article class="side-card">
      <h3>Elige qué practicar</h3>
      <p class="muted small">Área de contenido</p>
      <div class="tag-row">
        ${PRACTICE_MODES.map(mode => `<button type="button" class="${mode.id === practiceMode ? '' : 'secondary'}" data-practice-mode="${mode.id}">${escapeHtml(mode.label)}</button>`).join('')}
      </div>
      <p class="muted small">Formato (solo vocabulario)</p>
      <div class="tag-row" id="vocabFormatRow">
        ${VOCABULARY_FORMATS.map(format => {
  const baseClass = format.id === practiceVocabularyFormat ? '' : 'secondary';
  const muteClass = practiceMode !== 'vocabulary' ? 'muted-tag' : '';
  const disabled = practiceMode !== 'vocabulary' ? 'disabled' : '';
  return `<button type="button" class="${baseClass} ${muteClass}" data-vocabulary-format="${format.id}" ${disabled}>${escapeHtml(format.label)}</button>`;
}).join('')}
      </div>
      <p class="muted small" id="vocabFormatHint" style="${practiceMode === 'vocabulary' ? 'display:none' : ''}">Selecciona «Vocabulario» como área para cambiar el formato.</p>
    </article>`}
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
      <p class="muted small">${examMode ? `Examen clase ${session.exam_lesson} · ` : ''}${session.timedOut && session.examTimer ? Math.min(session.examTimer.scoredCount || session.tasks.length, session.tasks.length) : Math.min(taskIndex + 1, session.tasks.length)} de ${session.tasks.length} tareas${session.timedOut ? ' (autoentregado)' : ''} · creada ${formatDateTime(session.created_at)}</p>
    </article>
    <article class="side-card">
      <h3>Atención</h3>
      ${weak.length ? weak.map(item => `<p><strong>${escapeHtml(item.target.text)}</strong><br><span class="muted">${Math.round(item.state.mastery * 100)}% dominio</span></p>`).join('') : '<p class="muted">Sin debilidades claras todavía.</p>'}
    </article>
    <article class="side-card">
      <h3>Próximos repasos</h3>
    ${nextPlan.slice(0, 3).map(day => `<p><strong>${escapeHtml(day.date)}</strong><br><span class="muted">${day.items.length == 1 ? '1 objetivo' : day.items.length + ' objetivos'}</span></p>`).join('')}
    </article>
    <article class="side-card">
      <h3>${session.rationale?.source ? 'Por qué esta sesión' : 'Práctica libre'}</h3>
      <p class="muted small">${session.rationale?.source
        ? `Basada en: ${session.rationale.weak || 0} debilidades, ${session.rationale.due || 0} vencidos, lección ${session.rationale.study_lesson_max || '—'} activa.`
        : 'No hay recomendación activa. Selecciona un modo de práctica o activa la sesión guiada.'}</p>
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
  node.querySelectorAll('[data-practice-mode]').forEach(button => {
    button.addEventListener('click', () => onChangeMode?.(button.dataset.practiceMode));
  });
  node.querySelectorAll('[data-vocabulary-format]').forEach(button => {
    button.addEventListener('click', () => onChangeVocabularyFormat?.(button.dataset.vocabularyFormat));
  });
}

function labelForExercise(type) {
  return ({
    'text-input': 'escritura',
    'choice-grid': 'decisiones',
    cloze: 'huecos',
    'multiple-choice': 'elección',
    'token-build': 'construcción',
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
    'choice-grid': 'Resuelve cada microdecisión por función. No busques una palabra aislada repetida.',
    cloze: 'Lee la frase y completa sólo la parte que falta.',
    'multiple-choice': 'No busques la opción por descarte superficial: lee las cuatro y elige la que cumple el objetivo.',
    'token-build': 'Construye la frase con fichas. Hay distractores: no uses todo por inercia.',
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

function getPracticeMode(context) {
  const value = context.storage.loadProgress().settings?.practiceMode || 'all';
  return PRACTICE_MODES.some(mode => mode.id === value) ? value : 'all';
}

function getPracticeVocabularyFormat(context) {
  const value = context.storage.loadProgress().settings?.practiceVocabularyFormat || 'all';
  return VOCABULARY_FORMATS.some(format => format.id === value) ? value : 'all';
}

function savePracticeMode(context, practiceMode) {
  const progress = context.storage.loadProgress();
  context.storage.saveProgress({
    ...progress,
    settings: {
      ...(progress.settings || {}),
      practiceMode
    }
  });
}

function savePracticeVocabularyFormat(context, practiceVocabularyFormat) {
  const progress = context.storage.loadProgress();
  context.storage.saveProgress({
    ...progress,
    settings: {
      ...(progress.settings || {}),
      practiceVocabularyFormat
    }
  });
}
