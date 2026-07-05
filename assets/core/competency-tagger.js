import { normalizeText, unique } from './utils.js';

const RULES = [
  {
    ids: ['lexicon.people_family', 'function.identify'],
    pattern: /(familia|persona|personas|pronombre|мама|папа|брат|сестра|дочь|сын|муж|жена|дядя|тётя|тетя|бабушка|дедушка|человек|люди|он|она|они|мы|вы)/
  },
  {
    ids: ['lexicon.food_drink'],
    pattern: /(comida|bebida|чай|кофе|молоко|еда|пить|есть)/
  },
  {
    ids: ['lexicon.animals'],
    pattern: /(animal|animales|кот|кошка|собака)/
  },
  {
    ids: ['lexicon.city_places', 'function.locate'],
    pattern: /(ciudad|lugar|ubicacion|ubicación|город|улица|площадь|музей|парк|магазин|рынок|метро|почта|церковь|университет|школа|в городе|здесь|там)/
  },
  {
    ids: ['lexicon.professions_identity', 'function.identify'],
    pattern: /(profesion|profesión|actor|actriz|periodista|medico|médico|врач|инженер|писатель|журналист|артист|актёр|актер|актриса)/
  },
  {
    ids: ['lexicon.home_work_study'],
    pattern: /(casa|trabajo|estudio|escuela|universidad|дом|дома|домой|работа|работать|школа|университет|учиться)/
  },
  {
    ids: ['lexicon.weather_time'],
    pattern: /(clima|tiempo|hoy|ayer|mañana|manana|invierno|estacion|estación|сегодня|вчера|завтра|зимой|жарко|холодно|день|неделя|понедельник|вторник)/
  },
  {
    ids: ['lexicon.movement_transport', 'function.move'],
    pattern: /(movimiento|transporte|direccion|dirección|идти|ходить|ехать|ездить|иду|хожу|еду|езжу|куда|где|домой|пешком|на работу|в москву)/
  },
  {
    ids: ['lexicon.preferences', 'function.prefer'],
    pattern: /(gustar|querer|amar|preferencia|любить|люблю|нравится)/
  },
  {
    ids: ['lexicon.numbers_prices', 'function.transact'],
    pattern: /(numero|número|cantidad|precio|coste|рубль|рубля|рублей|сколько стоит|стоить|два|пять)/
  },
  {
    ids: ['lexicon.health_obligation', 'function.health_need'],
    pattern: /(salud|dolor|obligacion|obligación|necesidad|болит|температура|должен|должна|надо|нужно)/
  },
  {
    ids: ['lexicon.actions_aspect', 'grammar.aspect'],
    pattern: /(aspecto|perfectivo|imperfectivo|resultado|proceso|acción|accion|сделать|делать|читать|прочитать|писать|написать|звонить|позвонить)/
  },
  {
    ids: ['grammar.identification', 'function.identify'],
    pattern: /(это|identificar|presentar|ser\/estar|quien|que es|que significa)/
  },
  {
    ids: ['grammar.questions_basic', 'function.ask_answer'],
    pattern: /(pregunta|preguntas|кто|что|где|куда|сколько|чей|чья|чьё|чьи)/
  },
  {
    ids: ['grammar.negation'],
    pattern: /(negacion|negación|не|нет|ausencia)/
  },
  {
    ids: ['grammar.gender_agreement', 'morphology.gender_number'],
    pattern: /(genero|género|masculino|femenino|neutro|concordancia|мой|моя|моё|мое|новый|новая|новое)/
  },
  {
    ids: ['grammar.present_conjugation', 'morphology.verb_form'],
    pattern: /(conjugacion|conjugación|presente|говорить|смотреть|строить|слушаешь|понимаю)/
  },
  {
    ids: ['grammar.accusative', 'morphology.case_selection'],
    pattern: /(acusativo|objeto directo|книгу|меня|тебя|музыку|футбол|москву)/
  },
  {
    ids: ['grammar.prepositional', 'morphology.case_selection', 'function.locate'],
    pattern: /(prepositivo|ubicacion|ubicación|lugar|в\/на|о ком|о чём|о чем|столе|университете|испании)/
  },
  {
    ids: ['grammar.genitive', 'morphology.case_selection'],
    pattern: /(genitivo|нет|много|мало|из|откуда|директора|времени|друзей)/
  },
  {
    ids: ['grammar.pronouns'],
    pattern: /(pronombre|pronombres|я|ты|он|она|мы|вы|они|меня|тебя|её|ее|вас)/
  },
  {
    ids: ['grammar.possession_u', 'function.possess'],
    pattern: /(posesion|posesión|у меня|есть|tengo|evento personal|встреча|экзамен|урок)/
  },
  {
    ids: ['grammar.past', 'morphology.verb_form'],
    pattern: /(pasado|ayer|был|была|было|были|работал|говорила|ходил)/
  },
  {
    ids: ['grammar.future', 'morphology.verb_form', 'function.plan'],
    pattern: /(futuro|mañana|manana|буду|будешь|будет|будем|будете|будут|позвоню|куплю|сделаю)/
  },
  {
    ids: ['grammar.location_direction', 'function.locate', 'function.move'],
    pattern: /(где|куда|дома|домой|здесь|сюда|там|туда|lugar frente a direccion|dirección)/
  },
  {
    ids: ['grammar.motion_verbs', 'function.move', 'morphology.verb_form'],
    pattern: /(идти|ходить|ехать|ездить|movement|movimiento|a pie|transporte|иду|хожу|еду|езжу)/
  },
  {
    ids: ['grammar.adjective_agreement', 'function.describe', 'morphology.gender_number'],
    pattern: /(adjetivo|adjetivos|demostrativo|describir|новый|новая|эта|этот|это|эти|весь)/
  },
  {
    ids: ['grammar.quantity_government', 'lexicon.numbers_prices', 'morphology.case_selection'],
    pattern: /(cantidad|numero|número|рубль|рубля|рублей|час|часа|часов|два|пять|много|мало)/
  }
];

export function inferExerciseCompetencyIds(exercise, contentStore) {
  const ids = new Set();
  const targets = (exercise.target_ids || []).map(id => contentStore.getTarget(id)).filter(Boolean);
  const cards = targets.map(target => contentStore.getCard(target)).filter(Boolean);
  const lessons = targets.map(target => contentStore.getLesson(target.lesson)).filter(Boolean);
  const examples = targets.flatMap(target => contentStore.getExamplesForTarget(target));
  const targetHints = targets.flatMap(target => [
    target.text,
    target.translation,
    target.explanation,
    target.kind,
    ...(target.tags || [])
  ]);
  const cardHints = cards.flatMap(card => [
    card.text,
    card.translation,
    card.short_explanation,
    ...(card.tags || []),
    ...(card.examples || [])
  ]);
  const lessonHints = lessons.flatMap(lesson => [lesson.title, lesson.summary]);
  const structured = exercise.targets || {};
  const structuredHints = Object.values(structured).flatMap(value => Array.isArray(value) ? value : [value]);
  const haystack = normalizeText([
    exercise.skill,
    exercise.type,
    exercise.modality,
    exercise.prompt,
    exercise.expected,
    ...(exercise.accepted || []),
    ...(exercise.tags || []),
    ...structuredHints,
    ...targetHints,
    ...cardHints,
    ...lessonHints,
    ...examples
  ].join(' '));

  addBaseExerciseIds(ids, exercise);
  addTargetIds(ids, targets);
  RULES.forEach(rule => {
    if (rule.pattern.test(haystack)) rule.ids.forEach(id => ids.add(id));
  });

  if (targets.some(target => target.kind === 'vocabulary')) {
    ids.add('skill.semantic_mapping');
  }
  if (targets.some(target => target.kind === 'grammar')) {
    ids.add('skill.grammar_transfer');
  }

  const known = new Set((contentStore.state.competencies || []).map(item => item.id));
  return unique([...ids]).filter(id => !known.size || known.has(id));
}

function addBaseExerciseIds(ids, exercise) {
  ids.add('modality.text');
  if (String(exercise.modality || '').includes('audio') || ['dictation', 'listen-choice'].includes(exercise.type)) {
    ids.add('modality.audio');
    ids.add('skill.listening');
  }
  if (['text-input', 'cloze', 'dictation', 'transform', 'production-prompt'].includes(exercise.type)) {
    ids.add('modality.keyboard');
    ids.add('morphology.cyrillic_form');
  }

  if (exercise.type === 'multiple-choice' || exercise.type === 'listen-choice') ids.add('retrieval.recognition');
  if (exercise.type === 'text-input' || exercise.type === 'dictation') ids.add('retrieval.cued_recall');
  if (exercise.type === 'cloze' || exercise.type === 'transform') ids.add('retrieval.application');
  if (exercise.type === 'production-prompt') ids.add('retrieval.transfer');

  if (exercise.skill === 'recognition') ids.add('skill.recognition');
  if (exercise.skill === 'production') ids.add('skill.controlled_production');
  if (exercise.skill === 'listening') ids.add('skill.listening');
  if (exercise.skill === 'grammar_transfer') ids.add('skill.grammar_transfer');
  if (exercise.type === 'production-prompt') ids.add('skill.semantic_production');

  const prompt = normalizeText(`${exercise.prompt || ''} ${exercise.type || ''} ${exercise.targets?.direction || ''}`);
  if (/ru_to_es|traduccion-directa|traducción directa|significa|traduccion correcta|traducción correcta/.test(prompt)) {
    ids.add('direction.ru_to_meaning');
  }
  if (/es_to_ru|traduce|escribe en ruso|como se dice|cómo se dice/.test(prompt)) {
    ids.add('direction.meaning_to_ru');
  }
  if (exercise.type === 'multiple-choice' || /form_selection|elige la forma/.test(prompt)) {
    ids.add('direction.form_selection');
  }
  if (exercise.type === 'cloze' || exercise.type === 'transform' || /pon en|transform/.test(prompt)) {
    ids.add('direction.form_manipulation');
  }
}

function addTargetIds(ids, targets) {
  targets.forEach(target => {
    if (target.kind === 'vocabulary') {
      ids.add('skill.semantic_mapping');
    }
    if (target.kind === 'grammar') {
      ids.add('skill.grammar_transfer');
      ids.add('retrieval.application');
    }
  });
}
