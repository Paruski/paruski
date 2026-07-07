import { addDays, average, clamp, dayKey, startOfDay } from './utils.js';

export function createLearnerModel(storage, eventLog, contentStore) {
  let progress = storage.loadProgress();

  function reload() {
    progress = storage.loadProgress();
    return progress;
  }

  function save() {
    progress = storage.saveProgress(progress);
    return progress;
  }

  function getProgress() {
    return progress;
  }

  function getTargetState(targetId) {
    return progress.targets[targetId] || defaultTargetState(targetId);
  }

  function getCompetencyState(competencyId) {
    return progress.competencies?.[competencyId] || defaultCompetencyState(competencyId);
  }

  function isTargetUnlocked(target) {
    if (!target) return false;
    return Number(target.lesson) <= Number(progress.unlocked?.lessonMax || 1);
  }

  function unlockedTargets() {
    return contentStore.state.targets.filter(isTargetUnlocked);
  }

  function studyLessonMax() {
    const unlockedMax = Math.max(1, Number(progress.unlocked?.lessonMax || 1));
    const examLesson = lessonReadyForExam();
    if (examLesson) return Math.min(unlockedMax, examLesson);
    const frontier = firstIncompleteLesson(unlockedMax);
    return Math.min(unlockedMax, Math.max(1, frontier));
  }

  function studyTargets() {
    const maxLesson = studyLessonMax();
    return unlockedTargets().filter(target => Number(target.lesson) <= maxLesson);
  }

  function firstIncompleteLesson(maxLesson) {
    return firstIncompleteLessonFor(contentStore, getTargetState, progress, maxLesson);
  }

  function lessonReadyForExam() {
    const unlockedMax = Math.max(1, Number(progress.unlocked?.lessonMax || 1));
    for (let lesson = 1; lesson <= unlockedMax; lesson += 1) {
      if (lessonPracticeCovered(contentStore, getTargetState, progress, lesson) && !lessonExamPassed(progress, lesson)) return lesson;
    }
    return null;
  }

  function lessonExamStatus(lesson) {
    const exam = progress.lessons?.[lesson]?.exam || {};
    return {
      lesson: Number(lesson),
      passed: lessonExamPassed(progress, lesson),
      attempts: exam.attempts || 0,
      correct: exam.correct || 0,
      wrong: exam.wrong || 0,
      recent: exam.recent || [],
      passed_at: exam.passed_at || null
    };
  }

  function seenTodayTargetIds() {
    const today = dayKey(new Date());
    return new Set(eventLog.practiceEvents()
      .filter(event => dayKey(event.timestamp) === today)
      .flatMap(event => event.target_ids || []));
  }

  function seenTodayExerciseIds() {
    const today = dayKey(new Date());
    return new Set(eventLog.practiceEvents()
      .filter(event => dayKey(event.timestamp) === today)
      .map(event => event.exercise_id || event.item_id)
      .filter(Boolean));
  }

  function calibration() {
    progress.calibration = { ...defaultCalibration(), ...(progress.calibration || {}) };
    return progress.calibration;
  }

  function lockedTargets() {
    return contentStore.state.targets.filter(target => !isTargetUnlocked(target));
  }

  function recordExerciseResult({ exercise, correct, confidence = 3, responseTime = null, errorType = null, optionUsed = 'responder' }) {
    const targetIds = exercise.target_ids?.length ? exercise.target_ids : [];
    const timestamp = new Date().toISOString();
    const confidenceFactor = clamp(Number(confidence || 3) / 5, 0.2, 1);
    const evidenceWeight = exerciseEvidenceWeight(exercise);
    targetIds.forEach(targetId => {
      const target = contentStore.getTarget(targetId);
      const current = getTargetState(targetId);
      const skill = exercise.skill || skillForExercise(exercise);
      const skillScore = current.skills[skill] ?? 0;
      const gain = (0.16 + confidenceFactor * 0.08) * evidenceWeight;
      const nextSkillScore = correct
        ? clamp(skillScore + gain * (1 - skillScore))
        : clamp(skillScore - 0.16 * evidenceWeight);
      const attempts = current.attempts + 1;
      const right = current.correct + (correct ? 1 : 0);
      const wrong = current.wrong + (correct ? 0 : 1);
      const lapses = (current.lapses || 0) + (correct ? 0 : 1);
      const intervalDays = nextInterval(current.interval_days || 0, correct, confidenceFactor);
      const errors = { ...(current.error_types || {}) };
      if (!correct && errorType) errors[errorType] = (errors[errorType] || 0) + 1;
      const skills = { ...current.skills, [skill]: Number(nextSkillScore.toFixed(3)) };
      progress.targets[targetId] = {
        ...current,
        target_id: targetId,
        lesson: target?.lesson || current.lesson || null,
        level: target?.level || current.level || null,
        skills,
        mastery: Number(average(Object.values(skills)).toFixed(3)),
        attempts,
        correct: right,
        wrong,
        last_seen_at: timestamp,
        next_due_at: addDays(new Date(), intervalDays).toISOString(),
        interval_days: intervalDays,
        error_types: errors,
        last_response_time_ms: responseTime,
        last_option_used: optionUsed,
        lapses
      };
    });

    recordCompetencyResult({ exercise, correct, confidenceFactor, responseTime, errorType, timestamp });
    updateCalibrationForProgress(progress, exercise, correct, confidenceFactor, timestamp);
    updateLessonProgress(exercise, correct);
    updateUnlocks();
    save();
  }

  function deferExerciseResult({ exercise, responseTime = null }) {
    const targetIds = exercise.target_ids?.length ? exercise.target_ids : [];
    const timestamp = new Date().toISOString();
    targetIds.forEach(targetId => {
      const target = contentStore.getTarget(targetId);
      const current = getTargetState(targetId);
      progress.targets[targetId] = {
        ...current,
        target_id: targetId,
        lesson: target?.lesson || current.lesson || null,
        level: target?.level || current.level || null,
        deferred: (current.deferred || 0) + 1,
        last_deferred_at: timestamp,
        last_response_time_ms: responseTime,
        last_option_used: 'resolver_luego',
        next_due_at: addDays(new Date(), 1).toISOString()
      };
    });
    save();
  }

  function dueTargets(date = new Date()) {
    const today = startOfDay(date).getTime();
    return studyTargets().filter(target => {
      const state = getTargetState(target.id);
      if (!state.attempts) return true;
      return new Date(state.next_due_at || 0).getTime() <= today;
    });
  }

  function weakTargets(limit = 8) {
    return studyTargets()
      .map(target => ({ target, state: getTargetState(target.id) }))
      .filter(item => item.state.attempts && item.state.mastery < 0.62)
      .sort((left, right) => left.state.mastery - right.state.mastery || right.state.wrong - left.state.wrong)
      .slice(0, limit);
  }

  function summary() {
    const events = eventLog.practiceEvents();
    const gradableEvents = events.filter(event => event.correct !== null);
    const correct = gradableEvents.filter(event => event.correct).length;
    const today = dayKey(new Date());
    const todayCount = events.filter(event => dayKey(event.timestamp) === today).length;
    const targetStates = Object.values(progress.targets || {});
    const mastered = targetStates.filter(state => state.mastery >= 0.72).length;
    const competencyStates = Object.values(progress.competencies || {});
    const competencyMastered = competencyStates.filter(state => state.mastery >= 0.72).length;
    return {
      events: events.length,
      correct,
      accuracy: gradableEvents.length ? Math.round((correct / gradableEvents.length) * 100) : 0,
      todayCount,
      dailyTarget: progress.settings?.dailyTarget || 8,
      mastered,
      competencyCount: contentStore.state.competencies.length,
      competencyMastered,
      targetCount: contentStore.state.targets.length,
      unlockedCount: unlockedTargets().length,
      lockedCount: lockedTargets().length,
      lessonMax: studyLessonMax(),
      unlockedLessonMax: progress.unlocked?.lessonMax || 1,
      examLesson: lessonReadyForExam(),
      calibration: calibration(),
      streak: streakDays(events)
    };
  }

  function competencyProgress(limit = 16) {
    return contentStore.state.competencies
      .map(competency => ({
        competency,
        state: getCompetencyState(competency.id)
      }))
      .filter(item => item.state.attempts > 0)
      .sort((left, right) => {
        const leftPriority = left.state.mastery < 0.58 ? 0 : 1;
        const rightPriority = right.state.mastery < 0.58 ? 0 : 1;
        return leftPriority - rightPriority ||
          left.state.mastery - right.state.mastery ||
          right.state.attempts - left.state.attempts ||
          left.competency.label.localeCompare(right.competency.label, 'es');
      })
      .slice(0, limit);
  }

  function weakCompetencies(limit = 6) {
    return competencyProgress(100)
      .filter(item => item.state.attempts >= 2 && item.state.mastery < 0.62)
      .slice(0, limit);
  }

  function recordCompetencyResult({ exercise, correct, confidenceFactor, responseTime, errorType, timestamp }) {
    const competencies = contentStore.getCompetencyTagsForExercise(exercise);
    competencies.forEach(competency => {
      const current = getCompetencyState(competency.id);
      const currentMastery = current.mastery || 0;
      const nextMastery = correct
        ? clamp(currentMastery + (0.1 + confidenceFactor * 0.07) * (1 - currentMastery))
        : clamp(currentMastery - 0.12);
      const errors = { ...(current.error_types || {}) };
      if (!correct && errorType) errors[errorType] = (errors[errorType] || 0) + 1;
      const exerciseTypes = { ...(current.exercise_types || {}) };
      exerciseTypes[exercise.type] = (exerciseTypes[exercise.type] || 0) + 1;
      const modalities = { ...(current.modalities || {}) };
      modalities[exercise.modality || 'text'] = (modalities[exercise.modality || 'text'] || 0) + 1;
      progress.competencies[competency.id] = {
        ...current,
        competency_id: competency.id,
        dimension: competency.dimension,
        mastery: Number(nextMastery.toFixed(3)),
        attempts: current.attempts + 1,
        correct: current.correct + (correct ? 1 : 0),
        wrong: current.wrong + (correct ? 0 : 1),
        last_seen_at: timestamp,
        error_types: errors,
        exercise_types: exerciseTypes,
        modalities,
        last_response_time_ms: responseTime
      };
    });
  }

  function updateLessonProgress(exercise, correct) {
    const lesson = Number(exercise.lesson || contentStore.getTarget(exercise.target_ids?.[0])?.lesson || 0);
    if (!lesson) return;
    const current = progress.lessons[lesson] || { attempts: 0, correct: 0, status: 'unlocked' };
    const next = {
      ...current,
      attempts: current.attempts + 1,
      correct: current.correct + (correct ? 1 : 0),
      updated_at: new Date().toISOString()
    };
    if (exercise.unlock_exam || exercise.exam) {
      next.exam = updateExamProgress(current.exam, exercise, correct);
      if (next.exam.passed_at) next.status = 'exam_passed';
    }
    progress.lessons[lesson] = next;
  }

  function updateUnlocks() {
    const currentMax = Math.max(1, Number(progress.unlocked?.lessonMax || 1));
    const firstIncomplete = firstIncompleteLesson(currentMax);
    const nextLessonMax = firstIncomplete > currentMax ? Math.min(80, currentMax + 1) : currentMax;
    progress.unlocked.lessonMax = Math.max(currentMax, nextLessonMax);
    const lesson = progress.unlocked.lessonMax;
    progress.unlocked.level = contentStore.levelForLesson(lesson).id;
  }

  return {
    reload,
    save,
    getProgress,
    getTargetState,
    calibration,
    lessonReadyForExam,
    lessonExamStatus,
    seenTodayTargetIds,
    seenTodayExerciseIds,
    studyLessonMax,
    studyTargets,
    isTargetUnlocked,
    unlockedTargets,
    lockedTargets,
    recordExerciseResult,
    deferExerciseResult,
    dueTargets,
    weakTargets,
    competencyProgress,
    weakCompetencies,
    summary
  };
}

function lessonTargets(contentStore, lesson) {
  return contentStore.state.targets.filter(target => Number(target.lesson) === Number(lesson));
}

function firstIncompleteLessonFor(contentStore, getTargetState, progress, maxLesson) {
  for (let lesson = 1; lesson <= Number(maxLesson || 1); lesson += 1) {
    if (!lessonIsCovered(contentStore, getTargetState, progress, lesson)) return lesson;
  }
  return Number(maxLesson || 1) + 1;
}

function lessonIsCovered(contentStore, getTargetState, progress, lesson) {
  return lessonPracticeCovered(contentStore, getTargetState, progress, lesson) && lessonExamPassed(progress, lesson);
}

function lessonPracticeCovered(contentStore, getTargetState, progress, lesson) {
  const targets = lessonTargets(contentStore, lesson);
  if (!targets.length) return true;
  const states = targets.map(target => getTargetState(target.id));
  const attempts = states.reduce((sum, state) => sum + (state.attempts || 0), 0);
  const correct = states.reduce((sum, state) => sum + (state.correct || 0), 0);
  const wrong = states.reduce((sum, state) => sum + (state.wrong || 0), 0);
  const accuracy = attempts ? correct / attempts : 0;
  const seen = states.filter(state => state.attempts > 0).length;
  const coverage = seen / targets.length;
  const averageMastery = average(states.map(state => bestSkillMastery(state)));
  const grammarTargets = targets.filter(target => target.kind === 'grammar');
  const seenGrammar = grammarTargets.filter(target => getTargetState(target.id).attempts > 0).length;
  const grammarCoverage = grammarTargets.length ? seenGrammar / grammarTargets.length : 1;
  const productiveEvidence = states.filter(state =>
    (state.skills?.production || 0) >= 0.18 ||
    (state.skills?.grammar_transfer || 0) >= 0.18 ||
    (state.skills?.listening || 0) >= 0.18
  ).length;
  const lessonProgress = progress?.lessons?.[lesson] || {};
  const lessonAttempts = Number(lessonProgress.attempts || 0);
  const lessonCorrect = Number(lessonProgress.correct || 0);
  const lessonAccuracy = lessonAttempts ? lessonCorrect / lessonAttempts : 0;
  const criticalBlocker = targets.some(target => {
    const state = getTargetState(target.id);
    const critical = target.kind === 'grammar' || Number(target.importance || 0) >= 0.72;
    return critical && (state.lapses || state.wrong || 0) >= 3 && (state.wrong || 0) >= (state.correct || 0);
  });
  if (criticalBlocker) return false;
  const highSignalPass = lessonAttempts >= 8 &&
    lessonAccuracy >= 0.875 &&
    productiveEvidence >= 4 &&
    wrong <= Math.max(1, Math.floor(lessonAttempts * 0.12));
  if (highSignalPass) return true;
  const minimumEvidence = Math.min(10, Math.max(4, Math.ceil(targets.length * 0.08)));
  const fastPass = attempts >= minimumEvidence &&
    accuracy >= 0.86 &&
    productiveEvidence >= Math.min(3, Math.max(1, Math.ceil(targets.length * 0.03))) &&
    averageMastery >= 0.2;
  const standardPass = coverage >= 0.36 &&
    grammarCoverage >= 0.5 &&
    averageMastery >= 0.32 &&
    accuracy >= 0.72 &&
    productiveEvidence >= Math.min(5, Math.max(2, Math.ceil(targets.length * 0.05)));
  return fastPass || standardPass;
}

function lessonExamPassed(progress, lesson) {
  return Boolean(progress.lessons?.[lesson]?.exam?.passed_at);
}

function updateExamProgress(currentExam = {}, exercise, correct) {
  const timestamp = new Date().toISOString();
  const event = {
    exercise_id: exercise.id,
    type: exercise.type,
    difficulty: exercise.difficulty || null,
    correct: Boolean(correct),
    critical: !correct && isCriticalExamMiss(exercise),
    at: timestamp
  };
  const recent = [...(currentExam.recent || []), event].slice(-20);
  const recentCorrect = recent.filter(item => item.correct).length;
  const recentCriticalWrong = recent.filter(item => item.critical).length;
  const windowReady = recent.length >= 20;
  const requiredCorrect = 18;
  const passed = currentExam.passed_at || (windowReady && recentCorrect >= requiredCorrect && recentCriticalWrong === 0);
  return {
    ...currentExam,
    attempts: (currentExam.attempts || 0) + 1,
    correct: (currentExam.correct || 0) + (correct ? 1 : 0),
    wrong: (currentExam.wrong || 0) + (correct ? 0 : 1),
    recent,
    recent_correct: recentCorrect,
    recent_critical_wrong: recentCriticalWrong,
    required_correct: requiredCorrect,
    passed_at: passed === true ? timestamp : currentExam.passed_at || null,
    updated_at: timestamp
  };
}

function isCriticalExamMiss(exercise) {
  const criticalErrors = exercise.diagnostics?.criticalErrors || [];
  return criticalErrors.length > 0 ||
    ['text-input', 'error-correction', 'transform'].includes(exercise.type) ||
    Number(exercise.difficulty || 0) >= 5 ||
    Boolean(exercise.quality?.requiresTransfer) ||
    Boolean(exercise.quality?.requiresGeneralization);
}

function bestSkillMastery(state) {
  const values = Object.values(state.skills || {}).map(Number).filter(Number.isFinite);
  return values.length ? Math.max(...values, state.mastery || 0) : state.mastery || 0;
}

function defaultTargetState(targetId) {
  return {
    target_id: targetId,
    skills: {
      recognition: 0,
      production: 0,
      listening: 0,
      grammar_transfer: 0
    },
    mastery: 0,
    attempts: 0,
    correct: 0,
    wrong: 0,
    last_seen_at: null,
    next_due_at: null,
    interval_days: 0,
    error_types: {}
  };
}

function defaultCompetencyState(competencyId) {
  return {
    competency_id: competencyId,
    mastery: 0,
    attempts: 0,
    correct: 0,
    wrong: 0,
    last_seen_at: null,
    error_types: {},
    exercise_types: {},
    modalities: {},
    last_response_time_ms: null
  };
}

function defaultCalibration() {
  return {
    rating: 900,
    uncertainty: 350,
    attempts: 0,
    last_result_at: null
  };
}

function updateCalibrationForProgress(progress, exercise, correct, confidenceFactor, timestamp) {
  const current = { ...defaultCalibration(), ...(progress.calibration || {}) };
  const difficulty = exerciseDifficultyRating(exercise);
  const expected = 1 / (1 + Math.pow(10, (difficulty - current.rating) / 400));
  const earlyBoost = Math.max(0, 18 - current.attempts) * 2.5;
  const k = Math.max(18, Math.min(96, current.uncertainty / 5 + earlyBoost));
  const confidenceWeight = correct ? 0.85 + confidenceFactor * 0.3 : 1;
  const delta = k * ((correct ? 1 : 0) - expected) * confidenceWeight;
  const nextUncertainty = correct
    ? Math.max(80, current.uncertainty * 0.9)
    : Math.max(120, current.uncertainty * 0.94);
  progress.calibration = {
    rating: Math.round(clamp(current.rating + delta, 650, 2100)),
    uncertainty: Math.round(nextUncertainty),
    attempts: current.attempts + 1,
    last_result_at: timestamp
  };
}

function exerciseDifficultyRating(exercise) {
  const lesson = Number(exercise.lesson || 1);
  const typeBonus = {
    'multiple-choice': 0,
    cloze: 45,
    dictation: 85,
    'listen-choice': 110,
    transform: 125,
    'error-correction': 150,
    'production-prompt': 165,
    'text-input': 150
  }[exercise.type] || 70;
  const rawDifficulty = Number(exercise.difficulty || exercise.complexity || 0);
  const complexity = rawDifficulty > 1 ? (rawDifficulty - 1) / 4 : rawDifficulty;
  const q = exercise.quality || {};
  let cognitiveBonus = 0;
  if (q.requiresInference) cognitiveBonus += 30;
  if (q.requiresGeneralization) cognitiveBonus += 35;
  if (q.requiresTransfer) cognitiveBonus += 40;
  if (q.contrastive) cognitiveBonus += 15;
  if (q.novelContext) cognitiveBonus += 20;
  if (q.notImmediatelyAfterExplanation) cognitiveBonus += 15;
  if (exercise.transfer_level === 'far') cognitiveBonus += 35;
  else if (exercise.transfer_level === 'medium') cognitiveBonus += 20;
  else if (exercise.transfer_level === 'near') cognitiveBonus += 10;
  return 820 + lesson * 18 + typeBonus + complexity * 160 + cognitiveBonus;
}

function skillForExercise(exercise) {
  if (exercise.type === 'dictation' || exercise.type === 'listen-choice') return 'listening';
  if (exercise.type === 'multiple-choice' || exercise.type === 'choice-grid') return 'recognition';
  if (exercise.type === 'transform' || exercise.type === 'cloze' || exercise.type === 'error-correction' || exercise.type === 'token-build') return 'grammar_transfer';
  return 'production';
}

function exerciseEvidenceWeight(exercise) {
  const q = exercise.quality || {};
  let weight = 1;
  if (exercise.unlock_exam || exercise.exam) weight *= 1.5;
  if (q.requiresInference || q.requiresGeneralization) weight *= 1.2;
  if (q.requiresTransfer) weight *= 1.15;
  if (q.contrastive) weight *= 1.05;
  if (q.combinesTargets && (exercise.target_ids || []).length >= 2) weight *= 1.1;
  if (q.notImmediatelyAfterExplanation) weight *= 1.1;
  const transferLevel = exercise.transfer_level;
  if (transferLevel === 'far') weight *= 1.3;
  else if (transferLevel === 'medium') weight *= 1.15;
  else if (transferLevel === 'near') weight *= 1.05;
  if (exercise.type === 'multiple-choice') weight *= 0.7;
  if (exercise.processing === 'recognition' || q.isTrivialRecognition) weight *= 0.6;
  return clamp(weight, 0.3, 3);
}

function nextInterval(previous, correct, confidenceFactor) {
  if (!correct) return 1;
  if (!previous) return confidenceFactor > 0.75 ? 2 : 1;
  return Math.min(60, Math.max(1, Math.round(previous * (1.7 + confidenceFactor))));
}

function streakDays(events) {
  const days = new Set(events.map(event => dayKey(event.timestamp)).filter(Boolean));
  if (!days.size) return 0;
  let cursor = new Date();
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(dayKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}
