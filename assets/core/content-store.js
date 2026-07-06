import { byNumber, hashString, normalizeText, unique } from './utils.js';
import { inferExerciseCompetencyIds } from './competency-tagger.js';

const LEVEL_BANDS = [
  { maxLesson: 18, id: 'ru-a0-seed', fallbackTitle: 'A0 · Primer contacto' },
  { maxLesson: 36, id: 'ru-a1-core', fallbackTitle: 'A1 · Base cotidiana' },
  { maxLesson: 60, id: 'ru-a1-plus', fallbackTitle: 'A1+ · Frases con casos' },
  { maxLesson: 80, id: 'ru-a2-aspect', fallbackTitle: 'A2 inicial · Aspecto y matiz' }
];

const PATHS = {
  lessons: 'content/lessons.json',
  vocabulary: 'content/vocabulary.json',
  grammar: 'content/grammar.json',
  exercises: 'content/exercises.json',
  materials: 'content/materials.json',
  aspect: 'content/materials-aspect.json',
  notes: 'content/learning-notes.json',
  db: 'content/paruski-db.json',
  audio: 'content/audio-index.json',
  competencies: 'content/competencies.json'
};

export function createContentStore() {
  const state = {
    ready: false,
    lessons: [],
    levels: [],
    targets: [],
    targetMap: new Map(),
    cards: [],
    cardMap: new Map(),
    examples: [],
    exercises: [],
    notes: [],
    audioMap: new Map(),
    competencies: [],
    competencyMap: new Map()
  };

  async function load() {
    const [
      lessons,
      vocabulary,
      grammar,
      exercises,
      materials,
      aspect,
      notes,
      db,
      audio,
      competencies
    ] = await Promise.all([
      readJson(PATHS.lessons, []),
      readJson(PATHS.vocabulary, []),
      readJson(PATHS.grammar, []),
      readJson(PATHS.exercises, []),
      readJson(PATHS.materials, { classes: [] }),
      readJson(PATHS.aspect, { classes: [] }),
      readJson(PATHS.notes, { notes: [] }),
      readJson(PATHS.db, {}),
      readJson(PATHS.audio, { entries: [] }),
      readJson(PATHS.competencies, { competencies: [] })
    ]);

    state.lessons = normalizeLessons(lessons);
    state.levels = normalizeLevels(db.levels || []);
    state.notes = notes.notes || [];
    state.competencies = normalizeCompetencies(competencies.competencies || []);
    state.competencyMap = new Map(state.competencies.map(item => [item.id, item]));
    state.cards = normalizeSeedCards(db.cards || []);
    state.cards.forEach(card => state.cardMap.set(normalizeText(card.text), card));
    importMaterialClasses(materials.classes || [], 'materials');
    importMaterialClasses(aspect.classes || [], 'aspect');
    importLegacyVocabulary(vocabulary);
    importLegacyGrammar(grammar);
    connectNotes();
    state.cards = buildCards();
    state.exercises = normalizeExercises(exercises);
    state.audioMap = new Map((audio.entries || []).map(entry => [normalizeText(entry.text || entry.normalized_text), entry]));
    state.targets.sort((left, right) => (left.lesson || 999) - (right.lesson || 999) || left.text.localeCompare(right.text, 'ru'));
    state.ready = true;
    return api;
  }

  function importMaterialClasses(classes, source) {
    classes.forEach(entry => {
      const lesson = Number(entry.l);
      (entry.v || []).forEach(text => addTarget({ lesson, kind: 'vocabulary', text, source }));
      (entry.g || []).forEach(text => addTarget({ lesson, kind: 'grammar', text, source }));
    });
  }

  function importLegacyVocabulary(items) {
    (items || []).forEach(item => {
      const target = addTarget({
        lesson: Number(item.lesson),
        kind: 'vocabulary',
        text: item.russian,
        source: 'legacy-vocabulary',
        translation: item.spanish,
        tags: [item.type, item.theme].filter(Boolean)
      });
      const key = normalizeText(target.text);
      if (!state.cardMap.has(key)) {
        state.cardMap.set(key, {
          id: item.id || `card-${hashString(key)}`,
          target_id: target.id,
          text: item.russian,
          translation: item.spanish || '',
          stress_marked: item.accent || item.russian,
          transcription: item.transcription || '',
          stress_syllable: stressFromMarked(item.accent || ''),
          short_explanation: item.phonetics || item.theme || '',
          examples: [item.example].filter(Boolean),
          tags: [item.type, item.theme].filter(Boolean)
        });
      }
    });
  }

  function importLegacyGrammar(items) {
    (items || []).forEach(item => {
      const target = addTarget({
        lesson: Number(item.lesson),
        kind: 'grammar',
        text: item.title,
        source: 'legacy-grammar',
        translation: item.explanation,
        tags: [item.skill].filter(Boolean)
      });
      target.examples = unique([...(target.examples || []), ...(item.examples || [])]);
      target.explanation = target.explanation || item.explanation || '';
      target.common_errors = unique([...(target.common_errors || []), ...(item.common_errors || [])]);
    });
  }

  function addTarget(input) {
    const text = String(input.text || '').trim();
    if (!text) return null;
    const key = `${input.kind}:${normalizeText(text)}`;
    const id = `ru-${input.kind}-${hashString(key)}`;
    const existing = state.targetMap.get(id);
    if (existing) {
      existing.lesson_refs = unique([...(existing.lesson_refs || []), input.lesson]).sort(byNumber);
      existing.lesson = Math.min(...existing.lesson_refs);
      existing.sources = unique([...(existing.sources || []), input.source]);
      existing.tags = unique([...(existing.tags || []), ...(input.tags || [])]);
      if (input.translation && !existing.translation) existing.translation = input.translation;
      return existing;
    }

    const level = levelForLesson(input.lesson);
    const target = {
      id,
      language: 'ru',
      kind: input.kind,
      text,
      normalized_text: normalizeText(text),
      translation: input.translation || '',
      lesson: Number(input.lesson) || 1,
      lesson_refs: [Number(input.lesson) || 1],
      level: level.id,
      level_title: level.title,
      card_id: null,
      difficulty: difficultyForLesson(input.lesson),
      importance: input.kind === 'grammar' ? 0.75 : 0.65,
      tags: unique(input.tags || []),
      examples: [],
      explanation: '',
      common_errors: [],
      sources: [input.source].filter(Boolean)
    };
    state.targetMap.set(id, target);
    state.targets.push(target);
    return target;
  }

  function connectNotes() {
    state.notes.forEach(note => {
      const lessons = (note.lessons || []).map(Number).filter(Boolean);
      const noteExamples = note.examples || [];
      (note.examples || []).forEach(text => {
        state.examples.push({
          id: `ex-${hashString(normalizeText(text))}`,
          text,
          lesson_refs: lessons,
          note_id: note.id || null
        });
      });
      state.targets.forEach(target => {
        if (!lessons.includes(Number(target.lesson))) return;
        const exact = noteExamples.filter(example => normalizeText(example).includes(target.normalized_text));
        if (!noteMatchesTarget(note, target, noteExamples, exact)) return;
        const signalExamples = noteExamples.filter(example => sharesRussianSignal(target.text, normalizeText(example)));
        target.examples = unique([...(target.examples || []), ...(exact.length ? exact : signalExamples.length ? signalExamples : noteExamples.slice(0, 2))]);
        target.explanation = mergeExplanation(target.explanation, note.definition);
        target.note_ids = unique([...(target.note_ids || []), note.id].filter(Boolean));
        target.tags = unique([...(target.tags || []), ...(note.tags || [])]);
      });
    });
  }

  function buildCards() {
    const cards = [];
    state.targets.forEach(target => {
      const seeded = state.cardMap.get(target.normalized_text);
      const card = {
        id: seeded?.id || `card-${target.id}`,
        target_id: target.id,
        text: target.text,
        translation: seeded?.translation || target.translation || '',
        stress_marked: seeded?.stress_marked || target.text,
        transcription: seeded?.transcription || seeded?.pronunciation || '',
        stress_syllable: seeded?.stress_syllable || stressFromMarked(seeded?.stress_marked || ''),
        short_explanation: seeded?.short_explanation || target.explanation || fallbackExplanation(target),
        examples: unique([...(seeded?.examples || []), ...(target.examples || [])]).slice(0, 6),
        tags: unique([...(seeded?.tags || []), ...(target.tags || [])])
      };
      target.card_id = card.id;
      cards.push(card);
    });
    return cards;
  }

  function normalizeExercises(items) {
    return (items || []).map(item => {
      const type = mapExerciseType(item.type);
      const targetIds = Array.isArray(item.target_ids) && item.target_ids.length ? item.target_ids : matchTargets(item);
      return {
        id: item.id || `exercise-${hashString(JSON.stringify(item))}`,
        source: 'static',
        lesson: Number(item.lesson) || null,
        level: levelForLesson(item.lesson).id,
        type,
        original_type: item.type || type,
        skill: normalizeSkill(item.skill),
        modality: item.modality || (type === 'dictation' ? 'audio' : 'text'),
        prompt: item.prompt || '',
        expected: item.expected || '',
        accepted: item.accepted || [],
        choices: item.choices || null,
        display: item.display || '',
        display_expected: item.display_expected || '',
        tts_text: item.tts_text || '',
        sample: item.sample || '',
        require_audio: Boolean(item.require_audio),
        allow_contains: Boolean(item.allow_contains),
        difficulty: Number(item.difficulty || item.complexity || 0),
        tags: item.tags || [],
        target_ids: targetIds,
        targets: item.targets || {},
        weight: Number(item.weight || 0.2)
      };
    });
  }

  function matchTargets(item) {
    const expected = normalizeText(item.expected || '');
    const tags = (item.tags || []).map(normalizeText);
    const matches = state.targets.filter(target => {
      if (expected && (expected.includes(target.normalized_text) || target.normalized_text.includes(expected))) return true;
      return tags.some(tag => target.tags.map(normalizeText).includes(tag) || target.normalized_text.includes(tag));
    });
    if (matches.length) return matches.slice(0, 4).map(target => target.id);

    const lesson = Number(item.lesson);
    if (!lesson) return [];
    const haystack = normalizeText([
      item.prompt,
      item.display,
      item.display_expected,
      item.tts_text,
      item.sample,
      item.expected
    ].filter(Boolean).join(' '));
    const sameLesson = state.targets.filter(target => (target.lesson_refs || []).includes(lesson));
    const signalMatches = sameLesson.filter(target => sharesRussianSignal(target.text, haystack));
    if (signalMatches.length) return signalMatches.slice(0, 4).map(target => target.id);
    const grammarMatches = sameLesson.filter(target => target.kind === 'grammar');
    return (grammarMatches.length ? grammarMatches : sameLesson).slice(0, 2).map(target => target.id);
  }

  function levelForLesson(lessonNumber) {
    const lesson = Number(lessonNumber) || 1;
    const band = LEVEL_BANDS.find(item => lesson <= item.maxLesson) || LEVEL_BANDS[LEVEL_BANDS.length - 1];
    const existing = state.levels.find(level => level.id === band.id);
    return existing || { id: band.id, title: band.fallbackTitle };
  }

  function getLesson(id) {
    return state.lessons.find(lesson => Number(lesson.id) === Number(id)) || null;
  }

  function getLevel(id) {
    return state.levels.find(level => level.id === id) || null;
  }

  function getTarget(id) {
    return state.targetMap.get(id) || null;
  }

  function getCard(targetOrId) {
    const target = typeof targetOrId === 'string' ? getTarget(targetOrId) : targetOrId;
    if (!target) return null;
    return state.cards.find(card => card.target_id === target.id) || null;
  }

  function getExamplesForTarget(targetOrId) {
    const target = typeof targetOrId === 'string' ? getTarget(targetOrId) : targetOrId;
    if (!target) return [];
    return unique([
      ...(target.examples || []),
      ...state.examples
        .filter(example => (example.lesson_refs || []).includes(Number(target.lesson)) && normalizeText(example.text).includes(target.normalized_text))
        .map(example => example.text)
    ]);
  }

  function getAudioEntry(text) {
    return state.audioMap.get(normalizeText(text)) || null;
  }

  function getCompetency(id) {
    return state.competencyMap.get(id) || null;
  }

  function getCompetencyTagsForExercise(exercise) {
    return inferExerciseCompetencyIds(exercise, api)
      .map(id => getCompetency(id))
      .filter(Boolean);
  }

  function choicesForTarget(target, count = 4) {
    const pool = state.targets
      .filter(item => item.id !== target.id && item.kind === target.kind && item.level === target.level)
      .slice(0, 40);
    const choices = shuffle([target, ...pool]).slice(0, count);
    if (!choices.find(item => item.id === target.id)) choices[0] = target;
    return shuffle(choices).map(item => ({
      label: item.text,
      value: item.text,
      correct: item.id === target.id
    }));
  }

  function semanticChoicesForTarget(target, count = 4) {
    const contrastive = contrastiveChoicesForTarget(target, count);
    if (contrastive.length) return contrastive;

    const correctExamples = getExamplesForTarget(target).filter(hasCyrillic);
    const correct = correctExamples[0] || (hasCyrillic(target.text) ? target.text : '');
    if (!correct) return choicesForTarget(target, count);
    const distractors = state.targets
      .filter(item => item.id !== target.id && item.level === target.level)
      .flatMap(item => getExamplesForTarget(item).filter(hasCyrillic))
      .filter(example => normalizeText(example) !== normalizeText(correct));
    const options = [
      correct,
      ...shuffle(unique(distractors).slice(0, 32)).slice(0, Math.max(0, count - 1))
    ];
    return shuffle(unique(options).slice(0, count)).map(example => ({
      label: example,
      value: example,
      correct: normalizeText(example) === normalizeText(correct)
    }));
  }

  const api = {
    state,
    load,
    getLesson,
    getLevel,
    getTarget,
    getCard,
    getExamplesForTarget,
    getAudioEntry,
    getCompetency,
    getCompetencyTagsForExercise,
    choicesForTarget,
    semanticChoicesForTarget,
    levelForLesson
  };

  return api;
}

async function readJson(path, fallback) {
  try {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(path);
    return response.json();
  } catch {
    return fallback;
  }
}

function normalizeLessons(lessons) {
  return (lessons || []).map(lesson => ({
    ...lesson,
    id: Number(lesson.id),
    level: levelIdForLesson(lesson.id)
  }));
}

function normalizeLevels(levels) {
  const map = new Map((levels || []).map(level => [level.id, level]));
  return LEVEL_BANDS.map(band => ({
    id: band.id,
    title: map.get(band.id)?.title || band.fallbackTitle,
    description: map.get(band.id)?.description || '',
    required_correct: map.get(band.id)?.required_correct || 0,
    required_accuracy: map.get(band.id)?.required_accuracy || 0
  }));
}

function normalizeSeedCards(cards) {
  return (cards || []).map(card => ({
    ...card,
    target_id: card.target_id || null,
    transcription: card.transcription || card.pronunciation || '',
    short_explanation: card.short_explanation || card.translation || ''
  }));
}

function normalizeCompetencies(items) {
  return (items || []).filter(item => item?.id).map(item => ({
    id: item.id,
    dimension: item.dimension || 'general',
    label: item.label || item.id,
    description: item.description || ''
  }));
}

function levelIdForLesson(lesson) {
  const item = LEVEL_BANDS.find(band => Number(lesson) <= band.maxLesson) || LEVEL_BANDS[LEVEL_BANDS.length - 1];
  return item.id;
}

function difficultyForLesson(lesson) {
  return Math.min(0.9, 0.18 + (Number(lesson || 1) / 80) * 0.55);
}

function fallbackExplanation(target) {
  if (target.kind === 'grammar') return 'Patron gramatical que cambia la forma o el significado de una frase rusa.';
  return 'Unidad lexica del curso para comprender y producir frases rusas breves.';
}

function stressFromMarked(value) {
  const text = String(value || '');
  if (!text.includes('\u0301') && !/[áéíóú]/i.test(text)) return '';
  const pieces = text.split(/[-\s]+/);
  return pieces.find(piece => piece.includes('\u0301') || /[áéíóú]/i.test(piece)) || '';
}

function mapExerciseType(type) {
  const value = String(type || '').trim();
  if (['multiple_choice', 'mcq', 'eleccion', 'image_choice'].includes(value)) return 'multiple-choice';
  if (['listen-choice', 'listen_choice', 'audio_mcq', 'audio-choice'].includes(value)) return 'listen-choice';
  if (['huecos', 'cloze'].includes(value)) return 'cloze';
  if (['transformacion', 'transform'].includes(value)) return 'transform';
  if (['audio_transcription', 'dictation'].includes(value)) return 'dictation';
  if (['production-prompt', 'production_prompt', 'respuesta-libre'].includes(value)) return 'production-prompt';
  return 'text-input';
}

function normalizeSkill(skill) {
  const value = String(skill || '').toLowerCase();
  if (value.includes('comprension')) return 'recognition';
  if (value.includes('pronunciacion')) return 'listening';
  if (value.includes('gramatica')) return 'grammar_transfer';
  return 'production';
}

function shuffle(values) {
  return [...values].sort(() => Math.random() - 0.5);
}

function hasCyrillic(value) {
  return /[а-яё]/i.test(String(value || ''));
}

function noteMatchesTarget(note, target, noteExamples, exactExamples) {
  if (exactExamples.length) return true;
  const noteHaystack = normalizeText([
    note.title,
    note.definition,
    ...(note.tips || []),
    ...noteExamples
  ].filter(Boolean).join(' '));
  return sharesRussianSignal(target.text, noteHaystack);
}

function mergeExplanation(current, addition) {
  const base = String(current || '').trim();
  const next = String(addition || '').trim();
  if (!next) return base;
  if (!base) return next;
  if (normalizeText(base).includes(normalizeText(next))) return base;
  return `${base} ${next}`;
}

function contrastiveChoicesForTarget(target, count = 4) {
  const haystack = normalizeText([
    target.text,
    target.explanation,
    ...(target.tags || [])
  ].filter(Boolean).join(' '));
  if (!haystack.includes('играть')) return [];

  let options = [];
  if (haystack.includes('на') && !haystack.includes('в')) {
    options = [
      ['Она играет на гитаре.', true],
      ['Она играет в гитару.', false],
      ['Она играет гитару.', false],
      ['Она играет на футболе.', false]
    ];
  } else if (haystack.includes('в') && !haystack.includes('на')) {
    options = [
      ['Я играю в футбол.', true],
      ['Я играю на футболе.', false],
      ['Я играю футбол.', false],
      ['Я играю в гитару.', false]
    ];
  } else {
    options = [
      ['Она играет на гитаре.', true],
      ['Она играет в гитару.', false],
      ['Мы играем на шахматах.', false],
      ['Я играю футбол.', false]
    ];
  }
  return shuffle(options.slice(0, count)).map(([value, correct]) => ({ label: value, value, correct }));
}

function sharesRussianSignal(targetText, haystack) {
  return russianSignals(targetText).some(signal => haystack.includes(signal));
}

function russianSignals(value) {
  return String(value || '')
    .toLowerCase()
    .match(/[а-яё]{4,}/g)
    ?.flatMap(token => token.length > 5 ? [token, token.slice(0, -1), token.slice(0, -2)] : [token]) || [];
}
