const STORAGE_KEYS = {
  progress: 'paruski.progress.v1',
  events: 'paruski.events.v1'
};

const DEFAULT_PROGRESS = {
  version: 1,
  updated_at: null,
  user: null,
  lessons: {},
  items: {},
  settings: {
    dailyTarget: 12
  }
};

const state = {
  lessons: [],
  vocabulary: [],
  grammar: [],
  exercises: [],
  progress: loadProgress(),
  events: loadEvents(),
  currentExercise: null
};

function loadProgress() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.progress));
    return stored ? { ...structuredClone(DEFAULT_PROGRESS), ...stored } : structuredClone(DEFAULT_PROGRESS);
  } catch {
    return structuredClone(DEFAULT_PROGRESS);
  }
}

function loadEvents() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.events)) || [];
  } catch {
    return [];
  }
}

function ensureUser() {
  if (state.progress.user?.id) return;
  const raw = prompt('Nombre de usuario para guardar el progreso de esta sesión:', 'Paruski');
  const name = (raw || 'usuario-local').trim() || 'usuario-local';
  const id = slugify(name);
  state.progress.user = {
    id,
    name,
    created_at: new Date().toISOString()
  };
  saveAll(false);
}

function saveAll(shouldRender = true) {
  state.progress.updated_at = new Date().toISOString();
  localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(state.progress, null, 2));
  localStorage.setItem(STORAGE_KEYS.events, JSON.stringify(state.events, null, 2));
  if (shouldRender) renderAll();
}

async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`No se pudo cargar ${path}`);
  return response.json();
}

async function init() {
  const [lessons, vocabulary, grammar, exercises] = await Promise.all([
    loadJson('content/lessons.json'),
    loadJson('content/vocabulary.json'),
    loadJson('content/grammar.json'),
    loadJson('content/exercises.json')
  ]);
  state.lessons = lessons;
  state.vocabulary = vocabulary;
  state.grammar = grammar;
  state.exercises = exercises;
  ensureUser();
  registerHandlers();
  renderAll();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}

function registerHandlers() {
  document.querySelectorAll('.tab').forEach(button => {
    button.addEventListener('click', () => switchView(button.dataset.view));
  });

  document.getElementById('lessonStatusFilter').addEventListener('change', renderLessons);
  document.getElementById('vocabSearch').addEventListener('input', renderVocabulary);
  document.getElementById('grammarSearch').addEventListener('input', renderGrammar);
  document.getElementById('nextExerciseBtn').addEventListener('click', nextExercise);
  document.getElementById('startRecommendedBtn').addEventListener('click', () => {
    switchView('review');
    nextExercise();
  });
  document.getElementById('exportProgressBtn').addEventListener('click', exportProgress);
  document.getElementById('exportEventsBtn').addEventListener('click', exportEvents);
  document.getElementById('importProgressInput').addEventListener('change', importProgress);
  document.getElementById('resetLocalBtn').addEventListener('click', resetLocalProgress);
}

function switchView(viewId) {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.view === viewId));
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === viewId));
  renderAll();
}

function lessonProgress(lessonId) {
  return state.progress.lessons[lessonId] || { status: 'prepared', mastery: { vocabulario: 0, gramatica: 0, produccion: 0, comprension: 0 }, attempts: 0, correct: 0 };
}

function itemProgress(itemId) {
  return state.progress.items[itemId] || { attempts: 0, correct: 0, wrong: 0, last_seen: null, mastery: 0, errors: {} };
}

function lessonExercises(lessonId) {
  return state.exercises.filter(exercise => Number(exercise.lesson) === Number(lessonId));
}

function exerciseTypeSummary(exercises) {
  if (!exercises.length) return 'sin ejercicios todavía';
  const types = [...new Set(exercises.map(exercise => exercise.type).filter(Boolean))];
  return `${exercises.length} ejercicio(s) · ${types.slice(0, 3).join(', ')}${types.length > 3 ? '…' : ''}`;
}

function setLessonStatus(lessonId, status) {
  const previous = lessonProgress(lessonId);
  state.progress.lessons[lessonId] = { ...previous, status, updated_at: new Date().toISOString() };
  logEvent({ lesson: lessonId, skill: 'estado', item_id: `lesson-${lessonId}`, prompt: `Cambiar estado a ${status}`, expected: status, answer: status, correct: true, error_type: null });
  saveAll();
}

function logEvent(partial) {
  const event = {
    event_id: partial.event_id ?? makeEventId(partial),
    timestamp: new Date().toISOString(),
    user_id: state.progress.user?.id ?? 'usuario-local',
    user_name: state.progress.user?.name ?? 'usuario-local',
    lesson: partial.lesson ?? null,
    item_id: partial.item_id ?? null,
    skill: partial.skill ?? 'general',
    exercise_type: partial.exercise_type ?? null,
    modality: partial.modality ?? null,
    targets: partial.targets ?? null,
    prompt: partial.prompt ?? '',
    expected: partial.expected ?? '',
    accepted_by: partial.accepted_by ?? null,
    answer: partial.answer ?? '',
    selected_choice: partial.selected_choice ?? null,
    correct: Boolean(partial.correct),
    error_type: partial.error_type ?? null,
    response_time_ms: partial.response_time_ms ?? null,
    confidence: partial.confidence ?? null
  };
  state.events.push(event);
  updateAggregates(event);
}

function makeEventId(seed = {}) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const base = [Date.now(), seed.lesson, seed.item_id, seed.answer, Math.random()].join('|');
  let hash = 0;
  for (let index = 0; index < base.length; index += 1) {
    hash = ((hash << 5) - hash + base.charCodeAt(index)) | 0;
  }
  return `evt-${Math.abs(hash).toString(36)}-${Date.now().toString(36)}`;
}

function updateAggregates(event) {
  if (!event.item_id) return;
  const current = itemProgress(event.item_id);
  const next = {
    ...current,
    attempts: current.attempts + 1,
    correct: current.correct + (event.correct ? 1 : 0),
    wrong: current.wrong + (event.correct ? 0 : 1),
    last_seen: event.timestamp,
    mastery: scoreMastery(current.correct + (event.correct ? 1 : 0), current.attempts + 1),
    errors: { ...current.errors }
  };
  if (!event.correct && event.error_type) {
    next.errors[event.error_type] = (next.errors[event.error_type] || 0) + 1;
  }
  state.progress.items[event.item_id] = next;

  if (event.lesson) {
    const lesson = lessonProgress(event.lesson);
    const attempts = (lesson.attempts || 0) + 1;
    const correct = (lesson.correct || 0) + (event.correct ? 1 : 0);
    const skill = event.skill || 'general';
    const mastery = { ...(lesson.mastery || {}) };
    mastery[skill] = scoreMastery(correct, attempts);
    state.progress.lessons[event.lesson] = { ...lesson, attempts, correct, mastery, updated_at: event.timestamp };
  }
}

function scoreMastery(correct, attempts) {
  if (!attempts) return 0;
  const raw = correct / attempts;
  const confidence = Math.min(1, attempts / 8);
  return Number((raw * confidence).toFixed(3));
}

function renderAll() {
  renderStats();
  renderRecommended();
  renderRecentEvents();
  renderLessons();
  renderVocabulary();
  renderGrammar();
  renderErrors();
  renderDataPreview();
  if (!state.currentExercise) renderExercisePlaceholder();
}

function renderStats() {
  const seen = Object.values(state.progress.lessons).filter(l => ['seen', 'active', 'consolidated'].includes(l.status)).length;
  const active = Object.values(state.progress.lessons).filter(l => l.status === 'active').length;
  const attempts = state.events.filter(e => e.skill !== 'estado').length;
  const correct = state.events.filter(e => e.skill !== 'estado' && e.correct).length;
  const accuracy = attempts ? Math.round((correct / attempts) * 100) : 0;
  const due = buildReviewQueue().length;
  const user = state.progress.user?.name || 'sin usuario';
  const todayCount = practiceEventsForDate(dateKey(new Date())).length;
  const dailyTarget = state.progress.settings?.dailyTarget || 12;
  const streak = studyStreakDays();
  const cards = [
    ['Usuario', user],
    ['Racha', `${streak} día(s)`],
    ['Hoy', `${todayCount}/${dailyTarget}`],
    ['Clases vistas', seen],
    ['Clases activas', active],
    ['Ejercicios', attempts],
    ['Precisión', `${accuracy}%`],
    ['Pendientes hoy', due]
  ];
  document.getElementById('statsCards').innerHTML = cards.map(([label, value]) => `
    <article class="card"><div class="value">${escapeHtml(value)}</div><div class="label">${escapeHtml(label)}</div></article>
  `).join('');
}

function practiceEventsForDate(key) {
  return state.events.filter(event => event.skill !== 'estado' && dateKey(event.timestamp) === key);
}

function studyStreakDays() {
  const studiedDays = new Set(state.events.filter(event => event.skill !== 'estado').map(event => dateKey(event.timestamp)));
  if (!studiedDays.size) return 0;
  let cursor = startOfDay(new Date());
  if (!studiedDays.has(dateKey(cursor))) cursor = addDays(cursor, -1);
  let streak = 0;
  while (studiedDays.has(dateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function renderRecommended() {
  const queue = buildReviewQueue().slice(0, 8);
  const box = document.getElementById('recommendedSession');
  if (!queue.length) {
    const activeWithoutExercises = activeLessonsWithoutExercises();
    box.innerHTML = activeWithoutExercises.length
      ? `<p class="empty">Tienes clase(s) activa(s) sin ejercicios cargados: ${activeWithoutExercises.map(lesson => `Clase ${lesson.id}`).join(', ')}. Puedes activar otra clase o cargar ejercicios para estas clases.</p>`
      : '<p class="empty">No hay ejercicios pendientes. Activa una clase con ejercicios o empieza un repaso.</p>';
    return;
  }
  box.innerHTML = queue.map(item => `
    <div class="event-item">
      <div><strong>${escapeHtml(item.title)}</strong><br><span class="muted">${escapeHtml(item.reason)}</span></div>
      <span class="tag">prioridad ${item.priority.toFixed(2)}</span>
    </div>
  `).join('');
}

function activeLessonsWithoutExercises() {
  return state.lessons.filter(lesson => ['seen', 'active'].includes(lessonProgress(lesson.id).status) && !lessonExercises(lesson.id).length);
}

function renderRecentEvents() {
  const events = state.events.slice(-8).reverse();
  const box = document.getElementById('recentEvents');
  if (!events.length) {
    box.innerHTML = '<p class="empty">Aún no hay eventos. Haz un ejercicio o marca una clase.</p>';
    return;
  }
  box.innerHTML = events.map(event => `
    <div class="event-item">
      <div><strong>${event.correct ? '✓' : '✗'} ${escapeHtml(event.skill)}</strong><br><span class="muted">${escapeHtml(event.prompt).slice(0, 90)}</span></div>
      <span class="muted">${new Date(event.timestamp).toLocaleString()}</span>
    </div>
  `).join('');
}

function renderLessons() {
  const filter = document.getElementById('lessonStatusFilter')?.value || 'all';
  const grid = document.getElementById('lessonGrid');
  const template = document.getElementById('lessonCardTemplate');
  grid.innerHTML = '';
  state.lessons
    .filter(lesson => filter === 'all' || lessonProgress(lesson.id).status === filter)
    .forEach(lesson => {
      const fragment = template.content.cloneNode(true);
      const card = fragment.querySelector('.lesson-card');
      const progress = lessonProgress(lesson.id);
      const exercises = lessonExercises(lesson.id);
      fragment.querySelector('.lesson-number').textContent = `Clase ${String(lesson.id).padStart(2, '0')}`;
      const pill = fragment.querySelector('.status-pill');
      pill.textContent = statusLabel(progress.status);
      pill.classList.add(progress.status);
      fragment.querySelector('h3').textContent = lesson.title;
      const summary = fragment.querySelector('.lesson-summary');
      summary.textContent = lesson.summary;
      const meta = document.createElement('p');
      meta.className = `muted small lesson-meta ${exercises.length ? '' : 'pending'}`.trim();
      meta.textContent = exerciseTypeSummary(exercises);
      summary.after(meta);
      card.querySelector('[data-action="mark-seen"]').addEventListener('click', () => setLessonStatus(lesson.id, 'seen'));
      card.querySelector('[data-action="activate"]').addEventListener('click', () => setLessonStatus(lesson.id, 'active'));
      const practiceButton = card.querySelector('[data-action="practice"]');
      if (!exercises.length) practiceButton.textContent = 'Ver estado';
      practiceButton.addEventListener('click', () => {
        setLessonStatus(lesson.id, 'active');
        switchView('review');
        nextExercise(lesson.id);
      });
      grid.appendChild(fragment);
    });
}

function renderVocabulary() {
  const query = normalize(document.getElementById('vocabSearch')?.value || '');
  const rows = state.vocabulary.filter(item => normalize(Object.values(item).join(' ')).includes(query));
  document.getElementById('vocabTable').innerHTML = `
    <table>
      <thead><tr><th>Clase</th><th>Ruso</th><th>Español</th><th>Tipo</th><th>Ejemplo</th><th>Dominio</th></tr></thead>
      <tbody>
        ${rows.map(item => {
          const progress = itemProgress(item.id);
          return `<tr>
            <td>${item.lesson}</td>
            <td><strong>${escapeHtml(item.russian)}</strong><br><span class="muted">${escapeHtml(item.accent || '')}</span></td>
            <td>${escapeHtml(item.spanish)}</td>
            <td>${escapeHtml(item.type || '')}</td>
            <td>${escapeHtml(item.example || '')}</td>
            <td>${Math.round((progress.mastery || 0) * 100)}%</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderGrammar() {
  const query = normalize(document.getElementById('grammarSearch')?.value || '');
  const rules = state.grammar.filter(rule => normalize(JSON.stringify(rule)).includes(query));
  const box = document.getElementById('grammarList');
  if (!rules.length) {
    box.innerHTML = '<p class="empty">Sin resultados.</p>';
    return;
  }
  box.innerHTML = rules.map(rule => `
    <article class="lesson-card">
      <div class="lesson-card-head"><span class="lesson-number">Clase ${rule.lesson}</span><span class="tag">${escapeHtml(rule.skill)}</span></div>
      <h3>${escapeHtml(rule.title)}</h3>
      <p>${escapeHtml(rule.explanation)}</p>
      <ul>${(rule.examples || []).map(ex => `<li>${escapeHtml(ex)}</li>`).join('')}</ul>
      <p class="muted">Errores típicos: ${(rule.common_errors || []).map(escapeHtml).join('; ') || '—'}</p>
    </article>
  `).join('');
}

function renderErrors() {
  const counts = {};
  state.events.forEach(event => {
    if (!event.correct && event.error_type) counts[event.error_type] = (counts[event.error_type] || 0) + 1;
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const box = document.getElementById('errorSummary');
  if (!entries.length) {
    box.innerHTML = '<p class="empty">Aún no hay errores registrados.</p>';
    return;
  }
  box.innerHTML = entries.map(([error, count]) => `
    <div class="event-item"><strong>${escapeHtml(error)}</strong><span>${count} veces</span></div>
  `).join('');
}

function renderDataPreview() {
  document.getElementById('progressPreview').textContent = JSON.stringify(state.progress, null, 2).slice(0, 5000);
  document.getElementById('eventsPreview').textContent = eventsToNdjson(state.events).slice(0, 5000);
}

function renderExercisePlaceholder() {
  document.getElementById('exerciseBox').innerHTML = '<p class="empty">Pulsa “Siguiente ejercicio” para empezar.</p>';
}

function renderLessonWithoutExercises(lessonId) {
  const lesson = state.lessons.find(item => Number(item.id) === Number(lessonId));
  const box = document.getElementById('exerciseBox');
  box.innerHTML = `
    <div class="empty">
      <strong>${lesson ? `Clase ${lesson.id}: ${escapeHtml(lesson.title)}` : 'Clase sin ejercicios'}</strong>
      <p>Esta clase todavía no tiene ejercicios cargados. Puedes mantenerla activa, pero el repaso necesita contenido en <code>content/exercises.json</code>.</p>
      <button id="fallbackExerciseBtn" type="button" class="secondary">Practicar otra clase disponible</button>
    </div>
  `;
  box.querySelector('#fallbackExerciseBtn')?.addEventListener('click', () => nextExercise());
}

function buildReviewQueue() {
  const activeLessons = new Set(Object.entries(state.progress.lessons)
    .filter(([, value]) => ['seen', 'active'].includes(value.status))
    .map(([id]) => Number(id)));
  if (!activeLessons.size) activeLessons.add(19);

  return state.exercises
    .filter(ex => activeLessons.has(ex.lesson))
    .map(ex => {
      const progress = itemProgress(ex.id);
      const wrongBoost = progress.wrong * 0.18;
      const lowMastery = 1 - (progress.mastery || 0);
      const ageBoost = progress.last_seen ? Math.min(0.4, (Date.now() - new Date(progress.last_seen).getTime()) / 86400000 * 0.08) : 0.35;
      const priority = Math.min(1, 0.25 + lowMastery * 0.35 + wrongBoost + ageBoost + (ex.weight || 0.1));
      return { ...ex, priority, reason: reasonFor(ex, progress), title: ex.prompt };
    })
    .sort((a, b) => b.priority - a.priority);
}

function reasonFor(ex, progress) {
  if (!progress.attempts) return 'nuevo o no practicado';
  if (progress.wrong) return `${progress.wrong} fallo(s) registrado(s)`;
  return `dominio ${Math.round((progress.mastery || 0) * 100)}%`;
}

function nextExercise(preferredLesson = null) {
  if (preferredLesson !== null && !lessonExercises(preferredLesson).length) {
    state.currentExercise = null;
    renderLessonWithoutExercises(preferredLesson);
    return;
  }

  const queue = buildReviewQueue();
  const exercise = preferredLesson ? queue.find(ex => ex.lesson === preferredLesson) || queue[0] : queue[0];
  state.currentExercise = exercise || null;
  if (!exercise) {
    renderExercisePlaceholder();
    return;
  }
  const started = performance.now();
  const box = document.getElementById('exerciseBox');
  box.innerHTML = `
    <div class="exercise-prompt">${escapeHtml(exercise.prompt)}</div>
    <p class="muted">Clase ${exercise.lesson} · ${escapeHtml(exercise.skill)} · ${escapeHtml(exercise.type)}${exercise.modality ? ` · ${escapeHtml(exercise.modality)}` : ''}</p>
    ${renderExerciseMedia(exercise)}
    <div class="exercise-controls">
      ${renderAnswerControl(exercise)}
      <select id="confidenceInput">
        <option value="3">Confianza normal</option>
        <option value="1">He dudado mucho</option>
        <option value="5">Muy seguro</option>
      </select>
      <button id="checkAnswerBtn">Comprobar</button>
      <div id="exerciseResult" class="result"></div>
    </div>
  `;
  bindExerciseControls(box, exercise, started);
}

function renderExerciseMedia(exercise) {
  const parts = [];
  if (exercise.image_asset) {
    parts.push(`<img class="exercise-image" src="${escapeHtml(exercise.image_asset)}" alt="${escapeHtml(exercise.image_alt || 'Imagen del ejercicio')}" />`);
  }
  if (exercise.audio_asset) {
    parts.push(`<audio class="exercise-audio" controls src="${escapeHtml(exercise.audio_asset)}"></audio>`);
  }
  if (exercise.tts_text) {
    parts.push('<button id="speakExerciseBtn" type="button" class="secondary">Escuchar con voz del navegador</button>');
  }
  return parts.length ? `<div class="exercise-media">${parts.join('')}</div>` : '';
}

function renderAnswerControl(exercise) {
  if (isMultipleChoice(exercise)) {
    const choices = normalizeChoices(exercise);
    return `<fieldset class="choice-grid" id="answerChoices">
      <legend>Elige una opción</legend>
      ${choices.map((choice, index) => `
        <label class="choice-option">
          <input type="radio" name="answerChoice" value="${escapeHtml(choice.value)}" data-choice-index="${index}" />
          ${choice.image_asset ? `<img src="${escapeHtml(choice.image_asset)}" alt="${escapeHtml(choice.label)}" />` : ''}
          <span>${escapeHtml(choice.label)}</span>
        </label>
      `).join('')}
    </fieldset>`;
  }
  return '<input id="answerInput" autocomplete="off" placeholder="Escribe tu respuesta" />';
}

function bindExerciseControls(box, exercise, started) {
  box.querySelector('#checkAnswerBtn').addEventListener('click', () => checkExercise(exercise, started));
  box.querySelector('#answerInput')?.focus();
  box.querySelector('#answerInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') checkExercise(exercise, started);
  });
  box.querySelectorAll('input[name="answerChoice"]').forEach(input => {
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') checkExercise(exercise, started);
    });
  });
  box.querySelector('#speakExerciseBtn')?.addEventListener('click', () => speakText(exercise.tts_text));
}

function checkExercise(exercise, started) {
  const confidence = Number(document.getElementById('confidenceInput').value);
  const answerData = readExerciseAnswer(exercise);
  const answer = answerData.value.trim();
  const evaluation = evaluateAnswer(answer, exercise);
  const correct = evaluation.correct;
  const errorType = correct ? null : inferErrorType(answer, exercise);
  const responseTime = Math.round(performance.now() - started);
  logEvent({
    lesson: exercise.lesson,
    item_id: exercise.id,
    skill: exercise.skill,
    exercise_type: exercise.type ?? null,
    modality: exercise.modality ?? null,
    targets: exercise.targets ?? null,
    prompt: exercise.prompt,
    expected: exercise.expected,
    accepted_by: evaluation.accepted_by,
    answer,
    selected_choice: answerData.choice ?? null,
    correct,
    error_type: errorType,
    response_time_ms: responseTime,
    confidence
  });
  const result = document.getElementById('exerciseResult');
  result.className = `result ${correct ? 'correct' : 'wrong'}`;
  result.innerHTML = correct
    ? `Correcto. Respuesta: <strong>${escapeHtml(expectedDisplay(exercise))}</strong>`
    : `No exactamente. Esperado: <strong>${escapeHtml(expectedDisplay(exercise))}</strong><br>Error: ${escapeHtml(errorType)}`;
  saveAll();
}

function readExerciseAnswer(exercise) {
  if (!isMultipleChoice(exercise)) {
    return { value: document.getElementById('answerInput')?.value || '', choice: null };
  }
  const checked = document.querySelector('input[name="answerChoice"]:checked');
  const choices = normalizeChoices(exercise);
  const choice = checked ? choices[Number(checked.dataset.choiceIndex)] : null;
  return { value: checked?.value || '', choice: choice ? { label: choice.label, value: choice.value } : null };
}

function evaluateAnswer(answer, exercise) {
  const normalizedAnswer = normalizeAnswer(answer);
  const normalizedExpected = normalizeAnswer(exercise.expected);

  if (isMultipleChoice(exercise)) {
    const correctChoices = normalizeChoices(exercise).filter(choice => choice.correct).map(choice => normalizeAnswer(choice.value));
    const acceptedChoices = correctChoices.length ? correctChoices : [normalizedExpected];
    return acceptedChoices.includes(normalizedAnswer)
      ? { correct: true, accepted_by: correctChoices.length ? 'choice_marked_correct' : 'expected_choice' }
      : { correct: false, accepted_by: null };
  }

  const accepted = [exercise.expected, ...(exercise.accepted || [])]
    .filter(Boolean)
    .map(normalizeAnswer);

  if (accepted.includes(normalizedAnswer)) return { correct: true, accepted_by: 'exact_or_variant' };

  const expectedTokens = normalizedExpected.split(' ').filter(Boolean);
  const answerTokens = normalizedAnswer.split(' ').filter(Boolean);
  const expectsSingleForm = expectedTokens.length === 1;
  const isFormExercise = ['transformacion', 'huecos'].includes(exercise.type) || expectsSingleForm;

  if (isFormExercise && expectsSingleForm && answerTokens.includes(normalizedExpected)) {
    return { correct: true, accepted_by: 'contains_expected_form' };
  }

  return { correct: false, accepted_by: null };
}

function isMultipleChoice(exercise) {
  return ['multiple_choice', 'mcq', 'image_choice', 'audio_mcq'].includes(exercise.type) || Array.isArray(exercise.choices);
}

function normalizeChoices(exercise) {
  return (exercise.choices || []).map(choice => {
    if (typeof choice === 'string') return { label: choice, value: choice, correct: normalizeAnswer(choice) === normalizeAnswer(exercise.expected) };
    const label = choice.label ?? choice.text ?? choice.value ?? choice.answer ?? '';
    const value = choice.value ?? choice.answer ?? choice.label ?? choice.text ?? '';
    return { label, value, correct: Boolean(choice.correct), image_asset: choice.image_asset ?? null };
  });
}

function expectedDisplay(exercise) {
  if (!isMultipleChoice(exercise)) return exercise.expected;
  const correctChoice = normalizeChoices(exercise).find(choice => choice.correct || normalizeAnswer(choice.value) === normalizeAnswer(exercise.expected));
  return correctChoice?.label || exercise.expected;
}

function inferErrorType(answer, exercise) {
  const normalized = normalizeAnswer(answer);
  if (!answer) return 'respuesta_vacia';
  if (isMultipleChoice(exercise)) return 'opcion_incorrecta';
  if (exercise.expected.includes(' в ') && !normalized.includes(' в ')) return 'preposicion_omitida';
  if (exercise.tags?.includes('gde-kuda')) return 'где_vs_куда';
  if (exercise.tags?.includes('pronombres')) return 'pronombre_objeto';
  return 'forma_incorrecta';
}

function speakText(text) {
  if (!('speechSynthesis' in window)) {
    alert('Este navegador no ofrece voz integrada.');
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ru-RU';
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function exportProgress() {
  downloadFile('progress.json', JSON.stringify(state.progress, null, 2), 'application/json');
}

function exportEvents() {
  downloadFile('events.ndjson', eventsToNdjson(state.events), 'application/x-ndjson');
}

function importProgress(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(String(reader.result));
      state.progress = { ...structuredClone(DEFAULT_PROGRESS), ...imported };
      ensureUser();
      saveAll();
    } catch {
      alert('No se pudo importar el progreso. El archivo no es JSON válido.');
    }
  };
  reader.readAsText(file);
}

function resetLocalProgress() {
  if (!confirm('¿Borrar todo el progreso local de este navegador?')) return;
  localStorage.removeItem(STORAGE_KEYS.progress);
  localStorage.removeItem(STORAGE_KEYS.events);
  state.progress = structuredClone(DEFAULT_PROGRESS);
  state.events = [];
  state.currentExercise = null;
  ensureUser();
  saveAll();
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function eventsToNdjson(events) {
  return events.map(event => JSON.stringify(event)).join('\n');
}

function statusLabel(status) {
  return ({ prepared: 'preparada', seen: 'vista', active: 'activa', consolidated: 'consolidada', pending: 'pendiente' })[status] || status;
}

function normalize(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeAnswer(text) {
  return normalize(text).replace(/[.,!?¿¡:;]/g, '').replace(/\s+/g, ' ').trim();
}

function slugify(text) {
  return normalize(text).replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'usuario-local';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

init().catch(error => {
  document.body.innerHTML = `<main class="panel"><h1>Error al cargar</h1><p>${escapeHtml(error.message)}</p></main>`;
});
