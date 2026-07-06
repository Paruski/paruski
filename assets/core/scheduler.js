import { dayKey, normalizeText } from './utils.js';

export function createScheduler({ contentStore, learnerModel, audioService }) {
  function buildSession(options = {}) {
    const summary = learnerModel.summary();
    const calibration = learnerModel.calibration?.() || { rating: 900, uncertainty: 350, attempts: 0 };
    const targetCount = Math.max(6, Math.min(options.targetCount || summary.dailyTarget || 10, 16));
    const candidates = adaptiveOrder(interleaveTargets(rankTargets()), calibration).slice(0, targetCount);
    const tasks = [];
    const sessionState = {
      recentTypes: [],
      typeCounts: {},
      targetCounts: {},
      recognitionCount: 0,
      productiveCount: 0,
      comprehensionCount: 0
    };

    candidates.forEach((entry, index) => {
      const target = entry.target;
      const state = learnerModel.getTargetState(target.id);
      if (!state.attempts || state.mastery < 0.35 || entry.reason === 'error') {
        tasks.push(makeExplainTask(target, entry.reason));
      }
      const type = chooseExerciseType(target, state, index, targetCount, calibration, sessionState);
      recordSessionType(sessionState, type, target);
      tasks.push(makeExerciseTask(target, type));
    });

    return {
      session_id: `session-${dayKey(new Date())}-${Date.now().toString(36)}`,
      created_at: new Date().toISOString(),
      estimated_minutes: options.minutes || summary.sessionMinutes || 10,
      tasks: tasks.slice(0, targetCount + 4),
      rationale: {
        due: learnerModel.dueTargets().length,
        weak: learnerModel.weakTargets().length,
        unlocked: summary.unlockedCount,
        study_lesson_max: learnerModel.studyLessonMax?.() || summary.lessonMax,
        calibration
      }
    };
  }

  function previewPlan(days = 14) {
    const targets = learnerModel.studyTargets?.() || learnerModel.unlockedTargets();
    const grouped = {};
    targets.forEach(target => {
      const state = learnerModel.getTargetState(target.id);
      const key = state.next_due_at ? dayKey(state.next_due_at) : dayKey(new Date());
      grouped[key] = grouped[key] || [];
      grouped[key].push({ target, state });
    });
    return Object.entries(grouped)
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, days)
      .map(([date, items]) => ({ date, items }));
  }

  function rankTargets() {
    const today = new Date();
    return (learnerModel.studyTargets?.() || learnerModel.unlockedTargets())
      .map((target, index) => {
        const state = learnerModel.getTargetState(target.id);
        const dueAt = state.next_due_at ? new Date(state.next_due_at) : null;
        const isDue = !dueAt || dueAt <= today;
        const wrongBoost = (state.wrong || 0) * 18;
        const newBoost = state.attempts ? 0 : 34;
        const dueBoost = isDue ? 42 : 0;
        const lowMastery = (1 - (state.mastery || 0)) * 28;
        const importance = (target.importance || 0.5) * 12;
        const difficulty = (target.difficulty || 0.3) * 6;
        const starterVocabulary = !state.attempts && target.kind === 'vocabulary' ? 10 : 0;
        const starterComplexity = !state.attempts
          ? (target.kind === 'grammar' ? 8 : 0) + (isCopyHostileTarget(target) ? 6 : 0)
          : 0;
        const earlierLesson = Math.max(0, 12 - Number(target.lesson || 1)) * 2.5;
        const score = dueBoost + newBoost + wrongBoost + lowMastery + importance + difficulty + starterVocabulary + earlierLesson - starterComplexity - index * 0.001;
        const reason = state.wrong ? 'error' : !state.attempts ? 'nuevo' : isDue ? 'vencido' : 'refuerzo';
        return { target, state, score, reason };
      })
      .sort((left, right) => right.score - left.score);
  }

  function makeExplainTask(target, reason) {
    const card = contentStore.getCard(target);
    return {
      id: `explain-${target.id}-${Date.now().toString(36)}`,
      kind: 'explain',
      reason,
      target_ids: [target.id],
      lesson: target.lesson,
      target,
      card
    };
  }

  function makeExerciseTask(target, type) {
    const exercise = staticExerciseFor(target, type) || buildExercise(target, type);
    return {
      id: `task-${target.id}-${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      kind: 'exercise',
      exercise
    };
  }

  function chooseExerciseType(target, state, index, targetCount, calibration, sessionState) {
    const examples = contentStore.getExamplesForTarget(target);
    const exactExample = examples.some(example => normalizeText(example).includes(target.normalized_text));
    const hasAudio = audioService.hasRecorded(target.text) || examples.some(example => audioService.hasRecorded(example));
    const hasErrorCorrection = Boolean(errorCorrectionSeedFor(target));
    const hasTransform = Boolean(transformSeedFor(target));
    const needsListening = (state.skills?.listening || 0) < 0.62;
    const needsProduction = (state.skills?.production || 0) < 0.58;
    const needsGrammar = (state.skills?.grammar_transfer || 0) < 0.58;
    const calibrating = (calibration?.attempts || 0) < 18 || (calibration?.uncertainty || 0) > 150;
    const available = [
      hasAudio && needsListening ? 'listen-choice' : '',
      exactExample ? 'cloze' : '',
      hasErrorCorrection && needsGrammar ? 'error-correction' : '',
      hasTransform && needsGrammar ? 'transform' : '',
      target.kind === 'vocabulary' && needsProduction ? 'text-input' : '',
      target.kind === 'vocabulary' || state.attempts ? 'production-prompt' : '',
      state.attempts >= 2 && hasAudio ? 'dictation' : '',
      canUseContextChoice(target) ? 'multiple-choice' : ''
    ].filter(Boolean);
    const plan = calibrating
      ? ['cloze', 'listen-choice', 'text-input', 'error-correction', 'production-prompt', 'transform', 'multiple-choice']
      : ['text-input', 'listen-choice', 'error-correction', 'cloze', 'production-prompt', 'transform', 'multiple-choice'];
    if (sessionState.productiveCount < Math.floor((index + 2) / 3)) {
      const productive = ['text-input', 'error-correction', 'transform', 'production-prompt'].find(type => available.includes(type));
      if (productive) return diversifyExerciseType(productive, { target, exactExample, hasAudio, needsListening, sessionState, available });
    }
    if (!sessionState.comprehensionCount && index >= Math.min(2, targetCount - 1)) {
      const comprehension = ['listen-choice', 'cloze'].find(type => available.includes(type));
      if (comprehension) return diversifyExerciseType(comprehension, { target, exactExample, hasAudio, needsListening, sessionState, available });
    }
    const planned = plan[index % plan.length];
    const selected = available.includes(planned) ? planned : plan.find(type => available.includes(type)) || available[0] || 'text-input';
    return diversifyExerciseType(selected, { target, exactExample, hasAudio, needsListening, sessionState, available });
  }

  function staticExerciseFor(target, preferredType) {
    const studyMax = Number(learnerModel.studyLessonMax?.() || target.lesson || 5);
    const exercises = contentStore.state.exercises
      .filter(exercise => (exercise.target_ids || []).includes(target.id))
      .filter(exercise => Number(exercise.lesson || target.lesson || 0) <= studyMax)
      .filter(exercise => isUsableStaticExercise(exercise));
    if (!exercises.length) return null;
    const selected = exercises.find(exercise => exercise.type === preferredType) || null;
    if (!selected) return null;
    return {
      ...selected,
      target,
      card: contentStore.getCard(target),
      examples: contentStore.getExamplesForTarget(target)
    };
  }

  function buildExercise(target, type) {
    const card = contentStore.getCard(target);
    const examples = contentStore.getExamplesForTarget(target);
    const exactExample = examples.find(example => normalizeText(example).includes(target.normalized_text));
    const base = {
      id: `generated-${target.id}-${type}`,
      source: 'generated',
      type,
      lesson: target.lesson,
      level: target.level,
      skill: skillForType(type, target),
      modality: type === 'dictation' || type === 'listen-choice' ? 'audio' : 'text',
      prompt: '',
      expected: target.text,
      accepted: [],
      target_ids: [target.id],
      target,
      card,
      examples,
      tts_text: target.text,
      weight: target.importance || 0.5
    };
    enrichProtocolMetadata(base, target, type);

    if (type === 'cloze' && exactExample) {
      return {
        ...base,
        display: exactExample.replace(new RegExp(escapeRegExp(target.text), 'i'), '_____'),
        prompt: 'Completa la frase rusa para conservar el significado del ejemplo.',
        display_expected: target.text,
        tts_text: exactExample
      };
    }

    if (type === 'multiple-choice') {
      const context = contextForTarget(target, card);
      return {
        ...base,
        context,
        prompt: target.kind === 'grammar'
          ? `${context} Elige la frase rusa natural.`
          : card?.translation ? `Quieres expresar "${card.translation}". Elige la opcion rusa natural.` : 'Elige la opcion rusa que encaja en el contexto.',
        choices: target.kind === 'grammar'
          ? contentStore.semanticChoicesForTarget(target)
          : contentStore.choicesForTarget(target)
      };
    }

    if (type === 'dictation') {
      const ttsText = exactExample || target.text;
      return {
        ...base,
        prompt: 'Escucha y escribe la frase rusa completa. Esto entrena percepcion, no cuenta por si solo como dominio.',
        expected: ttsText,
        tts_text: ttsText,
        require_audio: false
      };
    }

    if (type === 'listen-choice') {
      const ttsText = exactExample || target.text;
      const listening = listeningComprehensionForTarget(contentStore, target, card, ttsText);
      return {
        ...base,
        prompt: listening.prompt,
        context: listening.context,
        expected: listening.expected,
        tts_text: ttsText,
        choices: listening.choices,
        require_audio: false
      };
    }

    if (type === 'error-correction') {
      const seed = errorCorrectionSeedFor(target);
      if (seed) {
        return {
          ...base,
          prompt: seed.prompt,
          context: seed.context,
          display: seed.display,
          expected: seed.expected,
          accepted: [seed.expected],
          display_expected: seed.expected,
          feedback: seed.feedback,
          diagnostics: seed.diagnostics
        };
      }
      return buildExercise(target, 'text-input');
    }

    if (type === 'transform') {
      const seed = transformSeedFor(target);
      if (seed) {
        return {
          ...base,
          prompt: 'Transforma la forma rusa: aplica el cambio gramatical, no traduzcas palabra por palabra.',
          display: `${seed.left} → _____`,
          expected: seed.right,
          display_expected: `${seed.left} → ${seed.right}`,
          accepted: [seed.right],
          tts_text: seed.example || seed.right
        };
      }
    }

    if (type === 'production-prompt') {
      return {
        ...base,
        prompt: card?.translation
          ? `Escribe una frase rusa nueva que incluya la idea "${card.translation}". No copies un modelo.`
          : 'Escribe una frase rusa nueva que use el objetivo de forma natural. No copies un modelo.',
        expected: target.text,
        sample: ''
      };
    }

    return {
      ...base,
      prompt: card?.translation ? `Produce en ruso, sin mirar opciones: ${card.translation}` : 'Produce de memoria una forma rusa natural para este objetivo.',
      allow_contains: target.kind === 'vocabulary',
      accepted: buildAcceptedForms(target)
    };
  }

  return { buildSession, previewPlan, rankTargets, buildExercise };
}

function adaptiveOrder(entries, calibration) {
  const rating = Number(calibration?.rating || 900);
  const uncertainty = Number(calibration?.uncertainty || 350);
  const calibrating = Number(calibration?.attempts || 0) < 18 || uncertainty > 150;
  const decorated = entries.map(entry => ({
    ...entry,
    difficulty: targetDifficulty(entry.target)
  }));
  if (calibrating) {
    const easy = decorated
      .filter(entry => entry.difficulty <= rating + uncertainty * 0.2)
      .sort(byCalibrationPriority);
    const probes = decorated
      .filter(entry => entry.difficulty > rating + uncertainty * 0.2)
      .sort(byCalibrationPriority);
    return [...easy, ...probes];
  }
  return decorated.sort((left, right) =>
    Math.abs(left.difficulty - rating) - Math.abs(right.difficulty - rating) ||
    right.score - left.score
  );
}

function byDifficultyThenPriority(left, right) {
  return left.difficulty - right.difficulty || right.score - left.score;
}

function byCalibrationPriority(left, right) {
  return reasonPriority(left.reason) - reasonPriority(right.reason) ||
    left.difficulty - right.difficulty ||
    right.score - left.score;
}

function reasonPriority(reason) {
  return ({
    error: 0,
    vencido: 1,
    nuevo: 2,
    refuerzo: 3
  })[reason] ?? 4;
}

function diversifyExerciseType(selected, { target, exactExample, hasAudio, needsListening, sessionState, available = [] }) {
  const recentTypes = sessionState.recentTypes || [];
  const overTypeLimit = (type) => (sessionState.typeCounts?.[type] || 0) >= 3;
  const lastTwo = recentTypes.slice(-2);
  const options = [
    hasAudio && needsListening ? 'listen-choice' : '',
    available.includes('error-correction') ? 'error-correction' : '',
    exactExample ? 'cloze' : '',
    target.kind === 'grammar' && transformSeedFor(target) ? 'transform' : '',
    target.kind === 'vocabulary' ? 'text-input' : '',
    available.includes('production-prompt') ? 'production-prompt' : '',
    'multiple-choice'
  ].filter(Boolean).filter(type => type !== selected && !overTypeLimit(type) && (!available.length || available.includes(type)));
  if (overTypeLimit(selected)) return options[0] || selected;
  if (lastTwo.length < 2 || !lastTwo.every(type => type === selected)) return selected;
  return options[0] || selected;
}

function recordSessionType(sessionState, type, target) {
  sessionState.recentTypes.push(type);
  sessionState.typeCounts[type] = (sessionState.typeCounts[type] || 0) + 1;
  sessionState.targetCounts[target.id] = (sessionState.targetCounts[target.id] || 0) + 1;
  if (type === 'multiple-choice') sessionState.recognitionCount += 1;
  if (['text-input', 'production-prompt', 'transform', 'error-correction'].includes(type)) sessionState.productiveCount += 1;
  if (['listen-choice', 'cloze'].includes(type)) sessionState.comprehensionCount += 1;
}

function targetDifficulty(target) {
  const lesson = Number(target.lesson || 1);
  const kindBonus = target.kind === 'grammar' ? 55 : 0;
  const copyHostileBonus = isCopyHostileTarget(target) ? 35 : 0;
  return 820 + lesson * 18 + kindBonus + copyHostileBonus + Number(target.difficulty || 0) * 120;
}

function interleaveTargets(entries) {
  const result = [];
  const queues = new Map();
  entries.forEach(entry => {
    const key = `${entry.target.kind}:${entry.target.level}`;
    queues.set(key, [...(queues.get(key) || []), entry]);
  });
  while (queues.size) {
    [...queues.keys()].forEach(key => {
      const queue = queues.get(key);
      const next = queue.shift();
      if (next) result.push(next);
      if (!queue.length) queues.delete(key);
    });
  }
  return result;
}

function isCopyHostileTarget(target) {
  const text = target.text || '';
  return target.kind === 'grammar' || /[+/_|()[\]{}<>→=]/.test(text) || text.trim().split(/\s+/).length > 2;
}

function isUsableStaticExercise(exercise) {
  if (hasRejectedPrompt(exercise.prompt)) return false;
  if (exercise.type === 'listen-choice' && isTranscriptionChoice(exercise)) return false;
  if (exercise.type === 'multiple-choice' || exercise.type === 'listen-choice') return true;
  if (exercise.type === 'dictation') {
    const value = String(exercise.tts_text || exercise.expected || '').trim();
    return /[а-яё]/i.test(value) && value.split(/\s+/).length <= 10;
  }
  return isLowFrictionExercise(exercise);
}

function hasRejectedPrompt(prompt) {
  return /Elige la frase rusa que aplica|Estructura que conviene reconocer|Selecciona el ejemplo|Reconoce la estructura|Frase de práctica|Ejemplo de uso/i.test(String(prompt || ''));
}

function isTranscriptionChoice(exercise) {
  const prompt = String(exercise.prompt || '');
  const choices = exercise.choices || [];
  const russianChoices = choices.filter(choice => /[а-яё]/i.test(String(choice.label || choice.value || ''))).length;
  return /frase que has oído|lo que has oído/i.test(prompt) && russianChoices >= Math.max(2, choices.length - 1);
}

function isLowFrictionExercise(exercise) {
  const expected = String(exercise.expected || '').trim();
  if (!expected || !/[а-яё]/i.test(expected)) return false;
  if (/[+/_|()[\]{}<>→=]/.test(expected)) return false;
  return expected.split(/\s+/).length <= 2 || exercise.type === 'cloze' || exercise.type === 'transform';
}

function buildAcceptedForms(target) {
  const values = [target.text];
  if (target.text.includes('/')) values.push(...target.text.split('/'));
  return values.map(value => value.trim()).filter(Boolean);
}

function canUseContextChoice(target) {
  if (target.kind === 'grammar') return Boolean(errorCorrectionSeedFor(target) || contextForTarget(target, null));
  return Boolean(target.translation || target.text);
}

function contextForTarget(target, card) {
  const haystack = normalizeText([target.text, target.explanation, card?.short_explanation, ...(target.tags || [])].join(' '));
  if (haystack.includes('играть') && haystack.includes('гитар')) return 'Quieres decir que ella toca la guitarra.';
  if (haystack.includes('играть') && (haystack.includes('футбол') || haystack.includes('шахмат') || haystack.includes('игра'))) return 'Quieres decir que alguien juega a un deporte o a un juego.';
  if (haystack.includes('у меня') || haystack.includes('есть')) return 'Quieres expresar posesion basica sin traducir literalmente "tener".';
  if (haystack.includes('нет') || haystack.includes('genitivo')) return 'Quieres negar posesion o existencia y necesitas la forma tras нет.';
  if (haystack.includes('прошед') || haystack.includes('был')) return 'Quieres poner la frase en pasado y hacer concordar la forma.';
  if (haystack.includes('где') || haystack.includes('куда') || haystack.includes('домой')) return 'Debes distinguir lugar donde estas y direccion hacia donde vas.';
  if (haystack.includes('это')) return 'Quieres identificar una persona o cosa en presente, sin anadir un verbo copulativo.';
  return '';
}

function listeningComprehensionForTarget(contentStore, target, card, ttsText) {
  const translation = card?.translation || target.translation || '';
  if (target.kind === 'vocabulary' && translation) {
    const choices = meaningChoices(contentStore, target, translation);
    return {
      prompt: 'Escucha y responde por significado: ¿que comunica el audio?',
      context: 'No transcribas mentalmente palabra por palabra; identifica la idea.',
      expected: translation,
      choices
    };
  }
  return {
    prompt: 'Escucha la frase y elige la interpretacion mas precisa.',
    context: 'La respuesta depende del significado, no de reconocer letras.',
    expected: ttsText,
    choices: listeningChoices(contentStore, target, ttsText)
  };
}

function meaningChoices(contentStore, target, correct, count = 4) {
  const pool = contentStore.state.targets
    .filter(item => item.id !== target.id && item.kind === 'vocabulary' && item.level === target.level)
    .map(item => contentStore.getCard(item)?.translation || item.translation)
    .filter(Boolean)
    .filter(value => normalizeText(value) !== normalizeText(correct));
  return shuffleStrings(uniqueStrings([correct, ...pool]).slice(0, count)).map(value => ({
    label: value,
    value,
    correct: normalizeText(value) === normalizeText(correct)
  }));
}

function errorCorrectionSeedFor(target) {
  const haystack = normalizeText([target.text, target.explanation, ...(target.tags || [])].join(' '));
  if (haystack.includes('играть') && haystack.includes('на')) {
    return correctionSeed({
      context: 'Un hispanohablante ha usado la preposicion de juegos con un instrumento.',
      wrong: 'Она играет в гитару.',
      expected: 'Она играет на гитаре.',
      target: 'играть на + instrumento',
      error: 'wrong_preposition'
    });
  }
  if (haystack.includes('играть') && haystack.includes('в')) {
    return correctionSeed({
      context: 'Un hispanohablante ha omitido la preposicion obligatoria con un deporte.',
      wrong: 'Я играю футбол.',
      expected: 'Я играю в футбол.',
      target: 'играть в + juego/deporte',
      error: 'missing_preposition'
    });
  }
  if (haystack.includes('у меня') || haystack.includes('есть')) {
    return correctionSeed({
      context: 'La frase copia literalmente el espanol "yo tengo".',
      wrong: 'Я имею брат.',
      expected: 'У меня есть брат.',
      target: 'у + genitivo + есть',
      error: 'literal_translation_from_spanish'
    });
  }
  if (haystack.includes('это')) {
    return correctionSeed({
      context: 'La frase anade un verbo copulativo que no se usa en presente en esta estructura.',
      wrong: 'Это есть чай.',
      expected: 'Это чай.',
      target: 'это + sustantivo sin быть en presente',
      error: 'spanish_ser_estar_interference'
    });
  }
  if (haystack.includes('нет')) {
    return correctionSeed({
      context: 'Tras нет, el sustantivo debe ir en genitivo.',
      wrong: 'У меня нет время.',
      expected: 'У меня нет времени.',
      target: 'нет + genitivo',
      error: 'wrong_case'
    });
  }
  if (haystack.includes('где') || haystack.includes('куда') || haystack.includes('домой')) {
    return correctionSeed({
      context: 'La frase confunde lugar estatico y direccion.',
      wrong: 'Я иду дома.',
      expected: 'Я иду домой.',
      target: 'где vs куда',
      error: 'location_direction_confusion'
    });
  }
  return null;
}

function correctionSeed({ context, wrong, expected, target, error }) {
  return {
    prompt: 'Corrige la frase rusa. Explica en tu cabeza que interferencia espanola evita la forma correcta.',
    context,
    display: `Frase incorrecta: ${wrong}`,
    expected,
    feedback: {
      correct: `Correcto: aplicas ${target}.`,
      incorrect: `La correccion debe aplicar ${target}; el error diagnosticado es ${error}.`
    },
    diagnostics: {
      possibleErrors: [error],
      criticalErrors: [error]
    }
  };
}

function enrichProtocolMetadata(exercise, target, type) {
  exercise.direction = directionForType(type);
  exercise.processing = processingForType(type);
  exercise.difficulty = protocolDifficulty(type, target);
  exercise.importance = target.importance || exercise.weight || 0.5;
  exercise.feedback = exercise.feedback || feedbackForTarget(target, type);
  exercise.diagnostics = exercise.diagnostics || {
    possibleErrors: possibleErrorsForTarget(target),
    criticalErrors: target.kind === 'grammar' ? possibleErrorsForTarget(target).slice(0, 2) : []
  };
  exercise.quality = {
    status: 'approved',
    requiresUnderstanding: !['dictation'].includes(type),
    requiresRecall: !['multiple-choice'].includes(type),
    requiresApplication: ['cloze', 'transform', 'error-correction', 'text-input', 'production-prompt'].includes(type),
    isTrivialRecognition: false,
    answerGivenInPrompt: false,
    hasSpecificFeedback: true,
    hasPlausibleDistractors: ['multiple-choice', 'listen-choice'].includes(type),
    suitableForUnlockExam: ['text-input', 'transform', 'error-correction', 'listen-choice', 'production-prompt'].includes(type)
  };
  exercise.srs = {
    scheduleByTarget: true,
    countsAsEvidenceFor: [`${target.id}:${skillForType(type, target)}`],
    doesNotCountAsMasteryFor: type === 'multiple-choice' ? [`${target.id}:production`] : []
  };
}

function directionForType(type) {
  if (type === 'listen-choice') return 'audio_to_meaning';
  if (type === 'dictation') return 'audio_to_ru';
  if (type === 'multiple-choice') return 'context_to_ru';
  if (type === 'text-input' || type === 'production-prompt') return 'es_to_ru';
  if (type === 'error-correction' || type === 'transform' || type === 'cloze') return 'ru_to_ru';
  return 'mixed';
}

function processingForType(type) {
  if (type === 'multiple-choice') return 'recognition';
  if (type === 'listen-choice') return 'comprehension';
  if (type === 'error-correction') return 'diagnosis';
  if (type === 'transform') return 'transformation';
  if (type === 'text-input' || type === 'production-prompt') return 'production';
  return 'comprehension';
}

function protocolDifficulty(type, target) {
  const base = {
    'multiple-choice': 2,
    cloze: 2,
    dictation: 2,
    'listen-choice': 3,
    'text-input': 3,
    transform: 3,
    'production-prompt': 4,
    'error-correction': 4
  }[type] || 3;
  return Math.min(5, base + (target.kind === 'grammar' ? 1 : 0));
}

function feedbackForTarget(target, type) {
  const errors = possibleErrorsForTarget(target);
  return {
    correct: 'Correcto: has usado el target en una tarea con significado.',
    incorrect: errors.length
      ? `Revisa el target "${target.text}". Posibles focos: ${errors.join(', ')}.`
      : `Revisa forma, significado y contexto de "${target.text}".`,
    byErrorType: Object.fromEntries(errors.map(error => [error, `Este fallo apunta a ${error} en el target "${target.text}".`]))
  };
}

function possibleErrorsForTarget(target) {
  const haystack = normalizeText([target.text, target.explanation, ...(target.tags || [])].join(' '));
  const errors = [];
  if (haystack.includes('у меня') || haystack.includes('есть')) errors.push('literal_translation_from_spanish', 'wrong_possession_structure');
  if (haystack.includes('нет') || haystack.includes('genitivo')) errors.push('wrong_case');
  if (haystack.includes('играть')) errors.push('wrong_preposition');
  if (haystack.includes('где') || haystack.includes('куда')) errors.push('location_direction_confusion');
  if (haystack.includes('вид') || haystack.includes('соверш')) errors.push('wrong_aspect');
  if (!errors.length && target.kind === 'grammar') errors.push('grammar_transfer_error');
  if (!errors.length) errors.push('lexical_recall_error');
  return uniqueStrings(errors);
}

function transformSeedFor(target) {
  const examples = [
    ...(target.examples || [])
  ].map(String);
  for (const example of examples) {
    const match = example.match(/([А-Яа-яЁё -]+?)\s*[→=]\s*([А-Яа-яЁё -]+)(?::\s*(.+))?/);
    if (match) {
      return {
        left: match[1].trim(),
        right: match[2].trim(),
        example: (match[3] || '').trim()
      };
    }
  }
  return null;
}

function listeningChoices(contentStore, target, correct, count = 4) {
  const examples = contentStore.getExamplesForTarget(target).filter(value => /[а-яё]/i.test(String(value || '')));
  const sameLevelExamples = contentStore.state.targets
    .filter(item => item.id !== target.id && item.level === target.level)
    .flatMap(item => contentStore.getExamplesForTarget(item))
    .filter(value => /[а-яё]/i.test(String(value || '')));
  const options = uniqueStrings([correct, ...examples, ...sameLevelExamples])
    .filter(value => normalizeText(value) !== normalizeText(correct))
    .slice(0, 24);
  const values = shuffleStrings([correct, ...options.slice(0, Math.max(0, count - 1))]);
  return values.map(value => ({
    label: value,
    value,
    correct: normalizeText(value) === normalizeText(correct)
  }));
}

function uniqueStrings(values) {
  const seen = new Set();
  return values.map(value => String(value || '').trim()).filter(value => {
    const key = normalizeText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shuffleStrings(values) {
  return [...values].sort(() => Math.random() - 0.5);
}

function skillForType(type, target) {
  if (type === 'dictation' || type === 'listen-choice') return 'listening';
  if (type === 'multiple-choice') return 'recognition';
  if (type === 'cloze' || type === 'error-correction' || target.kind === 'grammar') return 'grammar_transfer';
  return 'production';
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
