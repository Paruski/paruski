import { dayKey, normalizeText } from './utils.js';

export function createScheduler({ contentStore, learnerModel, audioService }) {
  function buildSession(options = {}) {
    const summary = learnerModel.summary();
    const calibration = learnerModel.calibration?.() || summary.calibration || null;
    const practiceMode = options.practiceMode || 'all';
    const practiceVocabularyFormat = options.practiceVocabularyFormat || 'all';
    const targetCount = Math.max(6, Math.min(options.targetCount || summary.dailyTarget || 10, 16));
    if (summary.examLesson && !options.forcePractice) {
      return {
        session_id: `session-exam-ready-${summary.examLesson}-${dayKey(new Date())}-${Date.now().toString(36)}`,
        created_at: new Date().toISOString(),
        estimated_minutes: 0,
        tasks: [],
        examTimer: null,
        rationale: {
          exam_ready: true,
          exam_lesson: summary.examLesson,
          reason: 'practice_evidence_sufficient'
        }
      };
    }
    const staticTasks = buildStaticPracticeTasks({ targetCount, calibration, summary, practiceMode, practiceVocabularyFormat });
    if (staticTasks.length >= Math.min(targetCount, 6) || (practiceMode !== 'all' && staticTasks.length > 0)) {
      return {
        session_id: `session-${dayKey(new Date())}-${Date.now().toString(36)}`,
        created_at: new Date().toISOString(),
        estimated_minutes: options.minutes || summary.sessionMinutes || 10,
        tasks: staticTasks,
        examTimer: null,
        rationale: {
          due: learnerModel.dueTargets().length,
          weak: learnerModel.weakTargets().length,
          unlocked: summary.unlockedCount,
          study_lesson_max: learnerModel.studyLessonMax?.() || summary.lessonMax,
          calibration,
          practice_mode: practiceMode,
          practice_vocabulary_format: practiceVocabularyFormat,
          source: 'audited_static_exercises',
          anti_repetition: true
        }
      };
    }

    return {
      session_id: `session-${dayKey(new Date())}-${Date.now().toString(36)}`,
      created_at: new Date().toISOString(),
      estimated_minutes: options.minutes || summary.sessionMinutes || 10,
      tasks: [],
      examTimer: null,
      rationale: {
        practice_mode: practiceMode,
        practice_vocabulary_format: practiceVocabularyFormat,
        reason: 'manual_content_missing'
      }
    };
  }

  function buildExamSession(lesson, options = {}, summary = learnerModel.summary()) {
    const requestedCount = Number(options.examCount || 15);
    const examCount = Math.max(8, Math.min(requestedCount, 30));
    const examKind = options.examKind || null;
    const requiredCorrect = Math.ceil(examCount * 0.9);
    const exercises = selectExamQuestions(examExercisesForLesson(lesson, examKind), examCount)
      .map(exercise => ({
        ...exercise,
        exam: true,
        unlock_exam: true,
        exam_kind: examKind || exercise.exam_kind || null,
        exam_total: examCount,
        exam_required_correct: requiredCorrect
      }));
    return {
      session_id: `exam-${lesson}-${dayKey(new Date())}-${Date.now().toString(36)}`,
      mode: 'exam',
      examTimer: {
        startedAt: Date.now(),
        timeLimitSeconds: examCount * 30,
        remainingSeconds: examCount * 30,
        scoredCount: examCount
      },
      exam_kind: examKind,
      exam_lesson: Number(lesson),
      created_at: new Date().toISOString(),
      estimated_minutes: options.minutes || Math.max(10, summary.sessionMinutes || 10),
      tasks: exercises.map(exercise => ({
        id: `task-exam-${exercise.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        kind: 'exercise',
        exercise
      })),
      rationale: {
        exam_lesson: Number(lesson),
        exam_kind: examKind,
        required_correct: requiredCorrect,
        reason: 'level_unlock_exam'
      }
    };
  }

  function examExercisesForLesson(lesson, examKind = null) {
    let pool = contentStore.state.exercises
      .filter(exercise => Number(exercise.lesson) === Number(lesson))
      .filter(exercise => isSelectableExercise(exercise))
      .filter(exercise => exercise.unlock_exam)
      .filter(exercise => !examKind || exercise.exam_kind === examKind)
      .filter(exercise => isUsableStaticExercise(exercise));
    // Vocabulary exams: also include vocab-drills (vocab puro de recuperacion mecanica)
    // que no tienen unlock_exam=true porque no son examenes, pero son candidatos validos
    // para seleccion en el examen de vocabulario.
    if (examKind === 'vocabulary') {
      const vocabDrills = contentStore.state.exercises
        .filter(exercise => Number(exercise.lesson) === Number(lesson))
        .filter(exercise => exercise.source === 'vocab-drill')
        .filter(exercise => isUsableStaticExercise(exercise));
      pool = [...pool, ...vocabDrills];
    }
    return orderExamExercises(pool);
  }

  function examExerciseCount(lesson, examKind = null) {
    return examExercisesForLesson(lesson, examKind).length;
  }

  function selectExamQuestions(exercises, count) {
    const selected = [];
    const selectedIds = new Set();
    const buckets = new Map();
    shuffleForExam(exercises).forEach(exercise => {
      const key = exercise.exam_question_type || exercise.targets?.primary || exercise.type || 'general';
      buckets.set(key, [...(buckets.get(key) || []), exercise]);
    });
    while (selected.length < count && buckets.size) {
      [...buckets.keys()].forEach(key => {
        if (selected.length >= count) return;
        const bucket = buckets.get(key) || [];
        const next = bucket.shift();
        if (next && !selectedIds.has(next.id)) {
          selected.push(next);
          selectedIds.add(next.id);
        }
        if (!bucket.length) buckets.delete(key);
        else buckets.set(key, bucket);
      });
    }
    shuffleForExam(exercises).forEach(exercise => {
      if (selected.length >= count || selectedIds.has(exercise.id)) return;
      selected.push(exercise);
      selectedIds.add(exercise.id);
    });
    return selected.slice(0, count);
  }

  function buildStaticPracticeTasks({ targetCount, calibration, summary, practiceMode = 'all', practiceVocabularyFormat = 'all' }) {
    const candidates = staticPracticeCandidates({ calibration, summary, practiceMode, practiceVocabularyFormat });
    const selected = selectDiverseExercises(candidates, targetCount, {
      maxPerType: 3,
      maxPerTemplate: 1,
      maxPerTarget: 1,
      preferDifficult: true
    });
    return selected.map(exercise => ({
      id: `task-${exercise.id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      kind: 'exercise',
      exercise: attachExerciseContext(exercise)
    }));
  }

  function staticPracticeCandidates({ calibration, summary, practiceMode = 'all', practiceVocabularyFormat = 'all' }) {
    const studyMax = Number(learnerModel.studyLessonMax?.() || summary.lessonMax || 1);
    const seenExercises = learnerModel.seenTodayExerciseIds?.() || new Set();
    const seenTargets = learnerModel.seenTodayTargetIds?.() || new Set();
    const now = new Date();
    const exercises = contentStore.state.exercises
      .filter(exercise => isSelectableExercise(exercise))
      .filter(exercise => Number(exercise.lesson || 0) <= studyMax)
      .filter(exercise => !exercise.unlock_exam && !exercise.exam)
      .filter(exercise => practiceMode === 'all' || (exercise.exam_kind || '') === practiceMode)
      .filter(exercise => matchesVocabularyFormat(exercise, practiceVocabularyFormat))
      .filter(exercise => !seenExercises.has(exercise.id))
      .filter(exercise => isUsableStaticExercise(exercise));
    return exercises.map((exercise, index) => ({
      ...exercise,
      _practiceScore: practiceExerciseScore(exercise, { calibration, seenTargets, studyMax, now, index })
    })).sort((left, right) =>
      right._practiceScore - left._practiceScore ||
      String(left.id).localeCompare(String(right.id))
    );
  }

  function targetCountFloor(summary) {
    return Math.max(12, Math.min(32, Number(summary.dailyTarget || 10) * 2));
  }

  function practiceExerciseScore(exercise, { calibration, seenTargets, studyMax, now, index }) {
    const targetIds = exercise.target_ids || [];
    const states = targetIds.map(targetId => learnerModel.getTargetState(targetId));
    const hasUnseen = states.some(state => !state.attempts);
    const hasWeak = states.some(state => state.attempts && (state.mastery || 0) < 0.58);
    const hasDue = states.some(state => !state.next_due_at || new Date(state.next_due_at) <= now);
    const seenTodayPenalty = targetIds.some(targetId => seenTargets.has(targetId)) ? 42 : 0;
    const frontierBonus = Number(exercise.lesson || 0) === Number(studyMax) ? 34 : 0;
    const difficulty = Number(exercise.difficulty || 0);
    const quality = Number(exercise.quality?.score || 0);
    const productiveBonus = ['text-input', 'error-correction', 'transform'].includes(exercise.type) ? 28 : 0;
    const comprehensionBonus = ['listen-choice', 'dictation'].includes(exercise.type) ? 20 : 0;
    const inferenceBonus = exercise.challenge || exercise.quality?.requiresInference ? 30 : 0;
    const transferBonus = exercise.quality?.requiresTransfer ? 25 : 0;
    const generalizationBonus = exercise.quality?.requiresGeneralization ? 20 : 0;
    const contrastiveBonus = exercise.quality?.contrastive ? 15 : 0;
    const notImmediateBonus = exercise.quality?.notImmediatelyAfterExplanation ? 18 : 0;
    const authoredBonus = exercise.curated || exercise.quality?.authoredAsWhole || String(exercise.source || '').includes('authored') ? 70 : 0;
    const singleIntentBonus = exercise.design === 'single_intent' ? 90 : 0;
    const noveltyBonus = hasUnseen ? 32 : 0;
    const weakBonus = hasWeak ? 38 : 0;
    const dueBonus = hasDue ? 26 : 0;
    const calibrating = Number(calibration?.attempts || 0) < 18 || Number(calibration?.uncertainty || 0) > 150;
    const challengeBonus = calibrating ? difficulty * 15 : difficulty * 10;
    const dailyNoise = hashNoise(`${dayKey(new Date())}:${exercise.id}`) * 8;
    return singleIntentBonus + authoredBonus + frontierBonus + challengeBonus + inferenceBonus + transferBonus + generalizationBonus + contrastiveBonus + notImmediateBonus + quality + productiveBonus + comprehensionBonus +
      noveltyBonus + weakBonus + dueBonus + dailyNoise - seenTodayPenalty - index * 0.001;
  }

  function attachExerciseContext(exercise) {
    const target = contentStore.getTarget(exercise.target_ids?.[0]);
    return {
      ...exercise,
      target,
      card: target ? contentStore.getCard(target) : null,
      examples: target ? contentStore.getExamplesForTarget(target) : []
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
    const seenToday = learnerModel.seenTodayTargetIds?.() || new Set();
    const allTargets = (learnerModel.studyTargets?.() || learnerModel.unlockedTargets());
    const freshTargets = allTargets.filter(target => {
      const state = learnerModel.getTargetState(target.id);
      if (!seenToday.has(target.id)) return true;
      return (state.wrong || 0) > (state.correct || 0);
    });
    const sourceTargets = freshTargets.length ? freshTargets : allTargets.filter(target => !seenToday.has(target.id));
    return (sourceTargets.length ? sourceTargets : allTargets)
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

  return { buildSession, buildExamSession, examExerciseCount, previewPlan, rankTargets };
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

function orderExamExercises(exercises) {
  const ranked = [...exercises].sort((left, right) =>
    Number(isAuthoredExercise(right)) - Number(isAuthoredExercise(left)) ||
    cognitiveDemandScore(right) - cognitiveDemandScore(left) ||
    Number(right.difficulty || 0) - Number(left.difficulty || 0) ||
    Number(right.quality?.score || 0) - Number(left.quality?.score || 0) ||
    String(left.id).localeCompare(String(right.id)));
  return selectDiverseExercises(ranked, exercises.length, {
    maxPerType: 5,
    maxPerTemplate: 2,
    maxPerTarget: 2,
    preferDifficult: true
  });
}

function cognitiveDemandScore(exercise) {
  const q = exercise.quality || {};
  let score = 0;
  if (q.requiresGeneralization) score += 40;
  if (q.requiresTransfer) score += 40;
  if (q.novelContext) score += 30;
  if (q.notImmediatelyAfterExplanation) score += 25;
  if (q.contrastive) score += 20;
  if (q.combinesTargets) score += 15;
  if (q.suitableForAdvancedLearner) score += 15;
  const transferLevel = exercise.transfer_level;
  if (transferLevel === 'far') score += 30;
  else if (transferLevel === 'medium') score += 20;
  else if (transferLevel === 'near') score += 10;
  if (exercise.exposure_dependency === 'inference_before_explanation') score += 35;
  else if (exercise.exposure_dependency === 'unseen_combination') score += 25;
  else if (exercise.exposure_dependency === 'unseen_context') score += 15;
  return score;
}

function selectDiverseExercises(exercises, count, options = {}) {
  const selected = [];
  const selectedIds = new Set();
  const typeCounts = {};
  const templateCounts = {};
  const targetCounts = {};
  const strictRounds = [
    {
      maxPerType: options.maxPerType || 3,
      maxPerTemplate: options.maxPerTemplate || 1,
      maxPerTarget: options.maxPerTarget || 1,
      minDifficulty: options.preferDifficult ? 4 : 0
    },
    {
      maxPerType: options.maxPerType || 3,
      maxPerTemplate: options.maxPerTemplate || 1,
      maxPerTarget: (options.maxPerTarget || 1) + 1,
      minDifficulty: options.preferDifficult ? 3 : 0
    },
    {
      maxPerType: Math.max(4, (options.maxPerType || 3) + 1),
      maxPerTemplate: Math.max(2, (options.maxPerTemplate || 1) + 1),
      maxPerTarget: Math.max(3, (options.maxPerTarget || 1) + 2),
      minDifficulty: 0
    }
  ];

  strictRounds.forEach(round => {
    if (selected.length >= count) return;
    interleaveCandidateTypes(exercises, round.minDifficulty).forEach(exercise => {
      if (selected.length >= count || selectedIds.has(exercise.id)) return;
      if (!fitsDiversityRound(exercise, round, { typeCounts, templateCounts, targetCounts })) return;
      selected.push(exercise);
      selectedIds.add(exercise.id);
      incrementCount(typeCounts, exercise.type || 'unknown');
      incrementCount(templateCounts, exerciseTemplateKey(exercise));
      countableTargetIds(exercise).forEach(targetId => incrementCount(targetCounts, targetId));
    });
  });

  if (selected.length < count) {
    const fallbackMaxPerType = Math.max(4, (options.maxPerType || 3) + 1);
    const fallbackMaxPerTemplate = Math.max(2, (options.maxPerTemplate || 1) + 1);
    interleaveCandidateTypes(exercises, 0).forEach(exercise => {
      if (selected.length >= count || selectedIds.has(exercise.id)) return;
      if ((typeCounts[exercise.type || 'unknown'] || 0) >= fallbackMaxPerType) return;
      if ((templateCounts[exerciseTemplateKey(exercise)] || 0) >= fallbackMaxPerTemplate) return;
      selected.push(exercise);
      selectedIds.add(exercise.id);
      incrementCount(typeCounts, exercise.type || 'unknown');
      incrementCount(templateCounts, exerciseTemplateKey(exercise));
      countableTargetIds(exercise).forEach(targetId => incrementCount(targetCounts, targetId));
    });
  }

  if (selected.length < count) {
    interleaveCandidateTypes(exercises, 0).forEach(exercise => {
      if (selected.length >= count || selectedIds.has(exercise.id)) return;
      selected.push(exercise);
      selectedIds.add(exercise.id);
    });
  }

  const ordered = interleaveExerciseTypes(selected).slice(0, count);
  return ensureExerciseTypeCoverage(ordered, exercises, ['multiple-choice', 'cloze'], count);
}

function fitsDiversityRound(exercise, round, counts) {
  if (Number(exercise.difficulty || 0) < round.minDifficulty) return false;
  if ((counts.typeCounts[exercise.type || 'unknown'] || 0) >= round.maxPerType) return false;
  if ((counts.templateCounts[exerciseTemplateKey(exercise)] || 0) >= round.maxPerTemplate) return false;
  const targets = countableTargetIds(exercise);
  if (targets.some(targetId => (counts.targetCounts[targetId] || 0) >= round.maxPerTarget)) return false;
  return true;
}

function countableTargetIds(exercise) {
  if (isAuthoredExercise(exercise)) return [];
  return (exercise.target_ids || []).filter(targetId => !String(targetId).startsWith('ru-grammar-'));
}

function isAuthoredExercise(exercise) {
  return Boolean(exercise.curated || exercise.quality?.authoredAsWhole || String(exercise.source || '').includes('authored'));
}

function incrementCount(counts, key) {
  counts[key] = (counts[key] || 0) + 1;
}

function interleaveExerciseTypes(exercises) {
  return interleaveCandidateTypes(exercises, 0);
}

function ensureExerciseTypeCoverage(selected, exercises, desiredTypes, count) {
  const result = [...selected];
  const selectedIds = new Set(result.map(exercise => exercise.id));
  desiredTypes.forEach(type => {
    if (result.some(exercise => exercise.type === type)) return;
    const candidate = interleaveCandidateTypes(exercises, 0).find(exercise =>
      exercise.type === type &&
      !selectedIds.has(exercise.id) &&
      canAddCoverageCandidate(exercise, result)
    );
    if (!candidate) return;
    const replaceIndex = redundantExerciseIndex(result);
    if (replaceIndex >= 0 && result.length >= count) {
      selectedIds.delete(result[replaceIndex].id);
      result[replaceIndex] = candidate;
      selectedIds.add(candidate.id);
      return;
    }
    if (result.length < count) {
      result.push(candidate);
      selectedIds.add(candidate.id);
    }
  });
  return result.slice(0, count);
}

function canAddCoverageCandidate(candidate, selected) {
  const template = exerciseTemplateKey(candidate);
  const sameTemplate = selected.filter(exercise => exerciseTemplateKey(exercise) === template).length;
  return sameTemplate < 2;
}

function redundantExerciseIndex(exercises) {
  const counts = exercises.reduce((acc, exercise) => {
    acc[exercise.type] = (acc[exercise.type] || 0) + 1;
    return acc;
  }, {});
  for (let index = exercises.length - 1; index >= 0; index -= 1) {
    const exercise = exercises[index];
    if (exercise.challenge) continue;
    if ((counts[exercise.type] || 0) > 1 && ['text-input', 'error-correction', 'listen-choice'].includes(exercise.type)) return index;
  }
  return exercises.findIndex(exercise => !exercise.challenge);
}

function interleaveCandidateTypes(exercises, minDifficulty = 0) {
  const priority = ['text-input', 'error-correction', 'token-build', 'choice-grid', 'cloze', 'multiple-choice', 'listen-choice', 'transform', 'dictation'];
  const buckets = new Map(priority.map(type => [type, []]));
  exercises
    .filter(exercise => Number(exercise.difficulty || 0) >= minDifficulty)
    .sort(byExercisePriority)
    .forEach(exercise => {
    if (!buckets.has(exercise.type)) buckets.set(exercise.type, []);
    buckets.get(exercise.type).push(exercise);
  });
  const result = [];
  while (result.length < exercises.length) {
    let progressed = false;
    priority.forEach(type => {
      const next = buckets.get(type)?.shift();
      if (next) {
        result.push(next);
        progressed = true;
      }
    });
    if (!progressed) break;
  }
  return result;
}

function byExercisePriority(left, right) {
  return Number(right._practiceScore || 0) - Number(left._practiceScore || 0) ||
    Number(right.difficulty || 0) - Number(left.difficulty || 0) ||
    Number(right.quality?.score || 0) - Number(left.quality?.score || 0) ||
    String(left.id).localeCompare(String(right.id));
}

function exerciseTemplateKey(exercise) {
  const targets = exercise.targets || {};
  const primary = String(targets.primary || '').trim();
  if (isAuthoredExercise(exercise)) {
    const structures = Array.isArray(targets.structures) ? targets.structures : [];
    const structure = structures.find(item => item && item !== 'audio_to_meaning') || structures[0] || exercise.processing || exercise.type || 'unknown';
    return `${primary || exercise.type}:${structure}`;
  }
  const primaryBase = primary.includes(':') ? primary.split(':')[0] : primary.replace(/_[а-яёa-z0-9-]+$/iu, '');
  const structures = Array.isArray(targets.structures) ? targets.structures : [];
  const structure = structures.find(item => item && item !== 'audio_to_meaning') || structures[0] || exercise.processing || exercise.type || 'unknown';
  return `${primaryBase || exercise.type}:${structure}`;
}

function isManualExercise(exercise) {
  return String(exercise?.source || '').includes('manual-authored');
}

function matchesVocabularyFormat(exercise, practiceVocabularyFormat = 'all') {
  if ((exercise.exam_kind || '') !== 'vocabulary') return true;
  if (practiceVocabularyFormat === 'all') return true;
  const format = vocabularyFormatForExercise(exercise);
  return format === practiceVocabularyFormat;
}

function vocabularyFormatForExercise(exercise) {
  const examFormat = String(exercise?.exam_format || '').trim().toLowerCase();
  if (examFormat === 'test') return 'test';
  if (examFormat === 'blank' || examFormat === 'open') return 'open';
  if (exercise?.type === 'multiple-choice') return 'test';
  if (exercise?.type === 'text-input') return 'open';
  return 'all';
}

function isSelectableExercise(exercise) {
  return isManualExercise(exercise) || isAutoVocabularyRecallExercise(exercise);
}

function isAutoVocabularyRecallExercise(exercise) {
  if (!exercise || isManualExercise(exercise)) return false;
  if (!String(exercise.source || '').includes('generated')) return false;
  if (exercise.exam_kind && exercise.exam_kind !== 'vocabulary') return false;
  if (exercise.modality && exercise.modality !== 'text') return false;
  if (!['multiple-choice', 'text-input'].includes(exercise.type)) return false;
  if (!['es_to_ru', 'ru_to_es'].includes(exercise.direction)) return false;
  const targets = exercise.targets || {};
  if ((targets.structures || []).length) return false;
  if ((targets.lemmas || []).length !== 1) return false;
  if ((exercise.target_ids || []).length !== 1) return false;
  if (!singleWordAnswer(exercise.expected)) return false;
  if (String(exercise.display || '').trim()) return false;
  return true;
}

function singleWordAnswer(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/[.!?,:;]/.test(text)) return false;
  return text.split(/\s+/).length === 1;
}

function hashNoise(value) {
  let hash = 2166136261;
  String(value || '').split('').forEach(ch => {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  });
  return ((hash >>> 0) % 1000) / 1000;
}

function shuffleForExam(values) {
  const output = [...values];
  let state = hashExamSeed(`${dayKey(new Date())}:${Date.now()}:${Math.random()}`);
  for (let index = output.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state || 1, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

function hashExamSeed(value) {
  let hash = 2166136261;
  String(value || '').split('').forEach(ch => {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  });
  return hash >>> 0;
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
  if (['text-input', 'transform', 'error-correction'].includes(type)) sessionState.productiveCount += 1;
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
  if (exercise.type === 'production-prompt' || exercise.allow_contains) return false;
  if (exercise.auto_correctable) return true;
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
