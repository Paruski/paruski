(() => {
  const DB_PATH = 'content/paruski-db.json';
  const FALLBACK_SOURCES = {
    legacy_materials: 'content/materials.json',
    legacy_aspect_materials: 'content/materials-aspect.json',
    learning_notes: 'content/learning-notes.json'
  };

  const state = {
    ready: false,
    schema: null,
    targets: [],
    targetMap: new Map(),
    examples: [],
    exampleMap: new Map(),
    notes: [],
    cards: [],
    cardMap: new Map(),
    levels: []
  };

  window.ParuskiDB = {
    ready: init(),
    state,
    allTargets: () => state.targets,
    getTarget: id => state.targetMap.get(id) || null,
    findTargetByText,
    findCard,
    getLevels: () => state.levels,
    getExamplesForTarget,
    normalize
  };

  async function init() {
    const schema = await readJson(DB_PATH).catch(() => null);
    state.schema = schema;
    const sources = schema?.canonical_sources?.ru || FALLBACK_SOURCES;
    const data = await Promise.all([
      readJson(sources.legacy_materials || FALLBACK_SOURCES.legacy_materials).catch(() => ({ classes: [] })),
      readJson(sources.legacy_aspect_materials || FALLBACK_SOURCES.legacy_aspect_materials).catch(() => ({ classes: [] })),
      readJson(sources.learning_notes || FALLBACK_SOURCES.learning_notes).catch(() => ({ notes: [] }))
    ]);
    state.levels = schema?.levels || [];
    state.cards = schema?.cards || [];
    state.notes = data[2].notes || [];
    state.cards.forEach(card => state.cardMap.set(normalize(card.text), card));
    importMaterials(data[0].classes || [], 'legacy_materials');
    importMaterials(data[1].classes || [], 'legacy_aspect_materials');
    importNotes(state.notes);
    state.targets.sort((a, b) => (a.lesson_refs?.[0] || 999) - (b.lesson_refs?.[0] || 999) || a.text.localeCompare(b.text));
    state.ready = true;
    window.dispatchEvent(new CustomEvent('paruski-db-ready', { detail: { targets: state.targets.length, examples: state.examples.length } }));
    return state;
  }

  async function readJson(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(path);
    return response.json();
  }

  function importMaterials(classes, source) {
    classes.forEach(entry => {
      const lesson = Number(entry.l);
      (entry.v || []).forEach(text => addTarget({ language: 'ru', kind: 'vocabulario', text, lesson_refs: [lesson], source }));
      (entry.g || []).forEach(text => addTarget({ language: 'ru', kind: 'patrón', text, lesson_refs: [lesson], source }));
    });
  }

  function importNotes(notes) {
    notes.forEach(note => {
      const lessonRefs = (note.lessons || []).map(Number).filter(Boolean);
      (note.examples || []).forEach(exampleText => addExample({ language: 'ru', text: exampleText, lesson_refs: lessonRefs, source: 'learning_notes' }));
      lessonRefs.forEach(lesson => {
        const linked = state.targets.filter(target => (target.lesson_refs || []).includes(lesson));
        linked.forEach(target => {
          target.note_ids = unique([...(target.note_ids || []), note.id].filter(Boolean));
          target.definition = target.definition || note.definition || '';
          target.examples = unique([...(target.examples || []), ...(note.examples || [])]);
          target.tips = unique([...(target.tips || []), ...(note.tips || [])]);
        });
      });
    });
  }

  function addTarget(input) {
    const id = targetId(input.language, input.kind, input.text);
    const existing = state.targetMap.get(id);
    if (existing) {
      existing.lesson_refs = unique([...(existing.lesson_refs || []), ...(input.lesson_refs || [])]).sort((a, b) => a - b);
      existing.sources = unique([...(existing.sources || []), input.source].filter(Boolean));
      return existing;
    }
    const card = findCard(input.text);
    const target = {
      id,
      language: input.language,
      kind: input.kind,
      text: input.text,
      normalized_text: normalize(input.text),
      translation: card?.translation || '',
      stress_marked: card?.stress_marked || '',
      pronunciation: card?.pronunciation || '',
      stress_syllable: card?.stress_syllable || '',
      lesson_refs: unique(input.lesson_refs || []).sort((a, b) => a - b),
      tags: card?.tags || [],
      difficulty: 1,
      importance: 1,
      sources: [input.source].filter(Boolean),
      examples: []
    };
    state.targetMap.set(id, target);
    state.targets.push(target);
    return target;
  }

  function addExample(input) {
    const id = 'ru:example:' + normalize(input.text);
    if (state.exampleMap.has(id)) return state.exampleMap.get(id);
    const example = { id, language: input.language, text: input.text, lesson_refs: input.lesson_refs || [], source: input.source };
    state.exampleMap.set(id, example);
    state.examples.push(example);
    return example;
  }

  function targetId(language, kind, text) {
    return [language, kind, normalize(text)].join(':');
  }

  function findTargetByText(text, kind = '') {
    const n = normalize(text);
    return state.targets.find(target => target.normalized_text === n && (!kind || target.kind === kind)) || null;
  }

  function findCard(text) {
    return state.cardMap.get(normalize(text)) || null;
  }

  function getExamplesForTarget(target) {
    if (!target) return [];
    const n = normalize(target.text);
    return unique([...(target.examples || []), ...state.examples.filter(example => normalize(example.text).includes(n)).map(example => example.text)]);
  }

  function unique(values) {
    return [...new Set((values || []).filter(value => value !== null && value !== undefined && value !== ''))];
  }

  function normalize(value) {
    return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[?.!¿¡,;:«»“”"']/g, '').replace(/\s+/g, ' ');
  }
})();
