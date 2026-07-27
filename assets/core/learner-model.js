import { addDays, average, clamp, dayKey, startOfDay } from './utils.js';

const REQUIRED_EXAM_KINDS = ['vocabulary', 'grammar', 'mixed'];

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
      const practiceCovered = lessonPracticeCovered(contentStore, getTargetState, progress, lesson);
      if (!practiceCovered) continue;
      const allPassed = lessonAllRequiredExamsPassed(progress, lesson);
      if (allPassed) {
        // Even if passed before, check for recent critical failures that may have degraded mastery
        const lessonTargets = contentStore.state.targets.filter(t => Number(t.lesson) === lesson);
        const hasRecentCriticalFailure = lessonTargets.some(target => {
          const state = getTargetState(target.id);
          return (state.critical_failures || 0) > 0 && (state.mastery || 0) < 0.58;
        });
        if (hasRecentCriticalFailure) return lesson; // needs repair
      }
      if (!allPassed) return lesson;
    }
    return null;
  }

  function lessonExamStatus(lesson, examKind = null) {
    const exam = examProgressForLesson(progress, lesson, examKind);
    return {
      lesson: Number(lesson),
      exam_kind: examKind,
      passed: lessonExamPassed(progress, lesson, examKind),
      attempts: exam.attempts || 0,
      correct: exam.correct || 0,
      wrong: exam.wrong || 0,
      recent: exam.recent || [],
      required_correct: exam.required_correct || null,
      exam_total: exam.exam_total || null,
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
    const isExam = Boolean(exercise.unlock_exam || exercise.exam);
    const isAuthored = Boolean(exercise.curated || exercise.quality?.authoredAsWhole);
    const isTransfer = Boolean(exercise.quality?.requiresTransfer || exercise.quality?.requiresGeneralization);
    const isCriticalTarget = exercise.diagnostics?.criticalErrors?.length > 0;

    // Evidence weight by exercise type (science-based)
    const weightsByType = {
      'multiple-choice': 0.4,
      'choice-grid': 0.4,
      'listen-choice': 0.5,
      'cloze': 0.7,
      'dictation': 0.7,
      'text-input': 0.7,
      'token-build': 0.75,
      'error-correction': 0.85,
      'transform': 0.9,
      'production-prompt': 0.95
    };
    let baseWeight = weightsByType[exercise.type] || 0.6;
    if (isTransfer) baseWeight = Math.min(1.0, baseWeight * 1.15);
    if (isExam) baseWeight = Math.min(1.0, baseWeight * 1.2);
    if (isAuthored) baseWeight = Math.min(1.0, baseWeight * 1.1);
    if (exercise.processing === 'recognition') baseWeight *= 0.6;
    const evidenceWeight = clamp(baseWeight, 0.2, 1.0);

    // Confidence factor from response time + option used
    let confidenceFactor = clamp(Number(confidence || 3) / 5, 0.2, 1);
    if (optionUsed === 'no_se') confidenceFactor = 0.1;
    if (optionUsed === 'resolver_luego') {
      // Defer: no mastery change, just reschedule
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
      recordCompetencyResult({ exercise, correct: false, confidenceFactor, responseTime, errorType, timestamp });
      updateCalibrationForProgress(progress, exercise, false, confidenceFactor, timestamp);
      save();
      return;
    }

    const isFastResponse = responseTime !== null && responseTime < 7000;
    const isSlowResponse = responseTime !== null && responseTime >= 18000;

    targetIds.forEach(targetId => {
      const target = contentStore.getTarget(targetId);
      const current = getTargetState(targetId);
      const skill = exercise.skill || skillForExercise(exercise);
      const skillScore = current.skills[skill] ?? 0;

      // Base gain: 0.12 for correct, scaled by evidence weight and confidence
      let gain = 0;
      if (correct) {
        gain = 0.12 * evidenceWeight * confidenceFactor;
        if (isFastResponse) gain *= 1.3;
        if (isSlowResponse) gain *= 0.6;
        // Production > recognition
        if (exercise.type === 'production-prompt' || exercise.type === 'transform' || exercise.type === 'error-correction') {
          gain *= 1.2;
        }
      } else {
        gain = -0.18 * evidenceWeight;
        if (optionUsed === 'no_se') gain = -0.25;
        if (isCriticalTarget) gain *= 1.5;
      }

      const nextSkillScore = clamp(skillScore + gain * (1 - Math.abs(skillScore)));
      const attempts = current.attempts + 1;
      const right = current.correct + (correct ? 1 : 0);
      const wrong = current.wrong + (correct ? 0 : 1);
      const lapses = (current.lapses || 0) + (correct ? 0 : 1);
      const criticalFailures = (current.critical_failures || 0) + (!correct && isCriticalTarget ? 1 : 0);

      // Interval: use science-based spacing
      let intervalDays = 1;
      if (correct && attempts > 0) {
        const prevInterval = current.interval_days || 0;
        if (isFastResponse && confidenceFactor > 0.7) {
          // Fast correct: multiply interval
          intervalDays = Math.min(60, Math.max(1, Math.round(prevInterval * (1.4 + confidenceFactor * 0.6))));
        } else if (correct) {
          intervalDays = Math.min(30, Math.max(1, Math.round(prevInterval * (1.2 + confidenceFactor * 0.3))));
        }
      } else if (!correct) {
        intervalDays = 1; // Review tomorrow
        if (optionUsed === 'no_se') intervalDays = 0; // Same session
      }

      // Stability: approximate number of days before forgetting
      const stability = correct
        ? Math.min(60, Math.max(0.5, (intervalDays * 0.7 + (current.stability || 0) * 0.3)))
        : Math.max(0.5, (current.stability || 1) * 0.3);

      const errors = { ...(current.error_types || {}) };
      if (!correct && errorType) errors[errorType] = (errors[errorType] || 0) + 1;
      const skills = { ...current.skills, [skill]: Number(clamp(nextSkillScore).toFixed(3)) };

      // History by skill
      const historyBySkill = { ...(current.history_by_skill || {}) };
      if (!historyBySkill[skill]) historyBySkill[skill] = { attempts: 0, correct: 0, wrong: 0, last_seen_at: null };
      historyBySkill[skill] = {
        attempts: historyBySkill[skill].attempts + 1,
        correct: historyBySkill[skill].correct + (correct ? 1 : 0),
        wrong: historyBySkill[skill].wrong + (correct ? 0 : 1),
        last_seen_at: timestamp
      };

      const dueAt = intervalDays === 0 ? addDays(new Date(), 0) : addDays(new Date(), intervalDays);

      progress.targets[targetId] = {
        ...current,
        target_id: targetId,
        lesson: target?.lesson || current.lesson || null,
        level: target?.level || current.level || null,
        skills,
        mastery: Number(average(Object.values(skills)).toFixed(3)),
        stability: Number(stability.toFixed(1)),
        attempts,
        correct: right,
        wrong,
        last_seen_at: timestamp,
        last_correct_at: correct ? timestamp : current.last_correct_at || null,
        last_result: correct,
        last_skill_mode: skill,
        next_due_at: dueAt.toISOString(),
        interval_days: intervalDays,
        error_types: errors,
        history_by_skill: historyBySkill,
        last_response_time_ms: responseTime,
        last_option_used: optionUsed,
        lapses,
        critical_failures: criticalFailures
      };
    });

    recordCompetencyResult({ exercise, correct, confidenceFactor, responseTime, errorType, timestamp });
    updateCalibrationForProgress(progress, exercise, correct, confidenceFactor, timestamp);
    updateLessonProgress(exercise, correct);
    updateUnlocks();
    save();
  }

  function deferExerciseResult({ exercise, responseTime = null }) {
    recordExerciseResult({ exercise, correct: false, confidence: 1, responseTime, errorType: null, optionUsed: 'resolver_luego' });
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
    const dueTargetsCount = studyTargets().filter(t => {
      const st = getTargetState(t.id);
      return st.attempts > 0 && st.next_due_at && new Date(st.next_due_at).getTime() <= Date.now();
    }).length;
    const nextReviewTarget = studyTargets().filter(t => {
      const st = getTargetState(t.id);
      return st.next_due_at && new Date(st.next_due_at).getTime() > Date.now();
    }).sort((a, b) => {
      return new Date(getTargetState(a.id).next_due_at) - new Date(getTargetState(b.id).next_due_at);
    })[0] || null;
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
      streak: streakDays(events),
      dueTargets: dueTargetsCount,
      nextReviewAt: nextReviewTarget ? getTargetState(nextReviewTarget.id).next_due_at : null
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
      const examKey = examProgressKey(exercise.exam_kind);
      next[examKey] = updateExamProgress(current[examKey], exercise, correct);
      if (lessonAllRequiredExamsPassed({ ...progress, lessons: { ...progress.lessons, [lesson]: next } }, lesson)) next.status = 'exam_passed';
    }
    progress.lessons[lesson] = next;
  }

  function updateUnlocks() {
    const currentMax = Math.max(1, Number(progress.unlocked?.lessonMax || 1));
    const firstIncomplete = firstIncompleteLesson(currentMax);
    // Also check if earlier lessons have critical failures that need re-lock
    let criticalBlock = false;
    for (let l = 1; l < firstIncomplete; l++) {
      const key = `lesson_${String(l).padStart(3, '0')}`;
      const lessonData = progress.lessons?.[key] || {};
      if (lessonData.status !== 'exam_passed') continue;
      const targets = contentStore.state.targets.filter(t => Number(t.lesson) === l);
      const hasCriticalDegradation = targets.some(t => {
        const st = getTargetState(t.id);
        return (st.critical_failures || 0) > 0 && (st.mastery || 0) < 0.58;
      });
      if (hasCriticalDegradation) {
        criticalBlock = true;
        break;
      }
    }
    let nextLessonMax;
    if (criticalBlock) {
      // Don't advance further, keep at current max
      nextLessonMax = currentMax;
    } else if (firstIncomplete > currentMax) {
      nextLessonMax = Math.min(80, currentMax + 1);
    } else {
      nextLessonMax = currentMax;
    }
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
  return lessonPracticeCovered(contentStore, getTargetState, progress, lesson) && lessonAllRequiredExamsPassed(progress, lesson);
}

function lessonAllRequiredExamsPassed(progress, lesson) {
  return REQUIRED_EXAM_KINDS.every(kind => lessonExamPassed(progress, lesson, kind));
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

function lessonExamPassed(progress, lesson, examKind = null) {
  return Boolean(examProgressForLesson(progress, lesson, examKind).passed_at);
}

function examProgressForLesson(progress, lesson, examKind = null) {
  const current = progress.lessons?.[lesson] || {};
  return current[examProgressKey(examKind)] || {};
}

function examProgressKey(examKind = null) {
  return examKind ? `exam_${examKind}` : 'exam';
}

function updateExamProgress(currentExam = {}, exercise, correct) {
  const timestamp = new Date().toISOString();
  const examTotal = Math.max(1, Number(exercise.exam_total || currentExam.exam_total || 20));
  const requiredCorrect = Math.max(1, Number(exercise.exam_required_correct || currentExam.required_correct || Math.ceil(examTotal * 0.9)));
  const event = {
    exercise_id: exercise.id,
    type: exercise.type,
    exam_kind: exercise.exam_kind || null,
    exam_question_type: exercise.exam_question_type || null,
    difficulty: exercise.difficulty || null,
    correct: Boolean(correct),
    critical: !correct && isCriticalExamMiss(exercise),
    at: timestamp
  };
  const recent = [...(currentExam.recent || []), event].slice(-examTotal);
  const recentCorrect = recent.filter(item => item.correct).length;
  const recentCriticalWrong = recent.filter(item => item.critical).length;
  const windowReady = recent.length >= examTotal;
  const passed = currentExam.passed_at || (windowReady && recentCorrect >= requiredCorrect && recentCriticalWrong === 0);
  return {
    ...currentExam,
    exam_kind: exercise.exam_kind || currentExam.exam_kind || null,
    exam_total: examTotal,
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
