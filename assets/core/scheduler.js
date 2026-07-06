import { dayKey, normalizeText } from './utils.js';

export function createScheduler({ contentStore, learnerModel, audioService }) {
  function buildSession(options = {}) {
    const summary = learnerModel.summary();
    const targetCount = Math.max(6, Math.min(options.targetCount || summary.dailyTarget || 10, 16));
    const candidates = interleaveTargets(rankTargets()).slice(0, targetCount);
    const tasks = [];

    candidates.forEach((entry, index) => {
      const target = entry.target;
      const state = learnerModel.getTargetState(target.id);
      if (!state.attempts || state.mastery < 0.35 || entry.reason === 'error') {
        tasks.push(makeExplainTask(target, entry.reason));
      }
      tasks.push(makeExerciseTask(target, chooseExerciseType(target, state, index)));
    });

    return {
      session_id: `session-${dayKey(new Date())}-${Date.now().toString(36)}`,
      created_at: new Date().toISOString(),
      estimated_minutes: options.minutes || summary.sessionMinutes || 10,
      tasks: tasks.slice(0, targetCount + 4),
      rationale: {
        due: learnerModel.dueTargets().length,
        weak: learnerModel.weakTargets().length,
        unlocked: summary.unlockedCount
      }
    };
  }

  function previewPlan(days = 14) {
    const targets = learnerModel.unlockedTargets();
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
    return learnerModel.unlockedTargets()
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
        const score = dueBoost + newBoost + wrongBoost + lowMastery + importance + difficulty + starterVocabulary - starterComplexity - index * 0.001;
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

  function chooseExerciseType(target, state, index) {
    const examples = contentStore.getExamplesForTarget(target);
    const exactExample = examples.some(example => normalizeText(example).includes(target.normalized_text));
    const hasAudio = audioService.hasRecorded(target.text) || examples.some(example => audioService.hasRecorded(example));
    const needsListening = (state.skills?.listening || 0) < 0.62;
    const needsProduction = (state.skills?.production || 0) < 0.58;
    const needsGrammar = (state.skills?.grammar_transfer || 0) < 0.58;
    if (hasAudio && needsListening && (index + 1) % 3 === 0) return state.attempts ? 'dictation' : 'listen-choice';
    if (target.kind === 'grammar' && needsGrammar && transformSeedFor(target)) return 'transform';
    if (target.kind === 'vocabulary' && state.attempts >= 1 && state.mastery >= 0.35 && (index + 1) % 5 === 0) return 'production-prompt';
    if (isCopyHostileTarget(target)) return exactExample ? 'cloze' : 'multiple-choice';
    if ((index + 1) % 4 === 0 && target.kind === 'vocabulary' && (hasAudio || needsListening)) return 'dictation';
    if (exactExample) return 'cloze';
    if (!state.attempts || (index + 1) % 3 === 0 || target.kind === 'grammar') return 'multiple-choice';
    if (target.kind === 'vocabulary' && needsProduction && (index + 1) % 2 === 0) return 'text-input';
    return 'text-input';
  }

  function staticExerciseFor(target, preferredType) {
    const exercises = contentStore.state.exercises
      .filter(exercise => (exercise.target_ids || []).includes(target.id))
      .filter(exercise => isUsableStaticExercise(exercise));
    if (!exercises.length) return null;
    const selected = exercises.find(exercise => exercise.type === preferredType) ||
      exercises.find(exercise => exercise.type === 'multiple-choice') ||
      (isLowFrictionExercise(exercises[0]) ? exercises[0] : null);
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

    if (type === 'cloze' && exactExample) {
      return {
        ...base,
        display: exactExample.replace(new RegExp(escapeRegExp(target.text), 'i'), '_____'),
        prompt: 'Completa la frase rusa.',
        display_expected: target.text,
        tts_text: exactExample
      };
    }

    if (type === 'multiple-choice') {
      const grammarPrompt = card?.short_explanation || target.explanation || target.translation || 'esta estructura';
      return {
        ...base,
        prompt: target.kind === 'grammar'
          ? `Elige la frase rusa que aplica: ${grammarPrompt}`
          : card?.translation ? `Elige la forma rusa para: ${card.translation}` : 'Elige la forma rusa correcta.',
        choices: target.kind === 'grammar'
          ? contentStore.semanticChoicesForTarget(target)
          : contentStore.choicesForTarget(target)
      };
    }

    if (type === 'dictation') {
      const ttsText = exactExample || target.text;
      return {
        ...base,
        prompt: 'Escucha y escribe en ruso.',
        expected: ttsText,
        tts_text: ttsText,
        require_audio: false
      };
    }

    if (type === 'listen-choice') {
      const ttsText = exactExample || target.text;
      return {
        ...base,
        prompt: 'Escucha y elige lo que has oído.',
        expected: ttsText,
        tts_text: ttsText,
        choices: listeningChoices(contentStore, target, ttsText),
        require_audio: false
      };
    }

    if (type === 'transform') {
      const seed = transformSeedFor(target);
      if (seed) {
        return {
          ...base,
          prompt: 'Transforma la forma rusa siguiendo el patrón.',
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
          ? `Escribe una frase rusa corta que use esta idea: ${card.translation}`
          : 'Escribe una frase rusa corta que use el objetivo de forma natural.',
        expected: target.text,
        sample: examples[0] || ''
      };
    }

    return {
      ...base,
      prompt: card?.translation ? `Escribe en ruso: ${card.translation}` : 'Escribe de memoria la forma rusa practicada.',
      allow_contains: target.kind === 'vocabulary',
      accepted: buildAcceptedForms(target)
    };
  }

  return { buildSession, previewPlan, rankTargets, buildExercise };
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
  if (exercise.type === 'multiple-choice' || exercise.type === 'listen-choice') return true;
  if (exercise.type === 'dictation') {
    const value = String(exercise.tts_text || exercise.expected || '').trim();
    return /[а-яё]/i.test(value) && value.split(/\s+/).length <= 10;
  }
  return isLowFrictionExercise(exercise);
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
  if (type === 'cloze' || target.kind === 'grammar') return 'grammar_transfer';
  return 'production';
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
