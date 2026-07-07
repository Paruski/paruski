import { normalizeAnswer } from '../core/utils.js';
import { attachRussianKeyboard } from '../core/input-tools.js';

export function makeTextInputExercise(exercise, options = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'exercise-renderer';
  if (options.display) {
    const display = document.createElement('p');
    display.className = 'exercise-display';
    display.textContent = options.display;
    wrap.appendChild(display);
  }
  const input = document.createElement(options.multiline ? 'textarea' : 'input');
  input.id = `answer-${exercise.id}`;
  input.autocomplete = 'off';
  input.placeholder = options.placeholder || 'Escribe en ruso...';
  if (options.multiline) input.rows = 4;
  wrap.appendChild(input);
  attachRussianKeyboard(wrap, input);
  return {
    element: wrap,
    readAnswer: () => input.value,
    focus: () => input.focus()
  };
}

export function makeChoiceExercise(exercise) {
  const wrap = document.createElement('div');
  wrap.className = 'exercise-renderer choice-list';
  const choices = shuffledChoices(exercise);
  choices.forEach((choice, index) => {
    const label = document.createElement('label');
    label.className = 'choice-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `choice-${exercise.id}`;
    input.value = choice.value || choice.label || '';
    input.dataset.choiceIndex = String(index);
    const span = document.createElement('span');
    span.textContent = choice.label || choice.value || '';
    label.append(input, span);
    wrap.appendChild(label);
  });
  return {
    element: wrap,
    readAnswer: () => {
      const selected = wrap.querySelector('input:checked');
      return selected?.value || '';
    },
    focus: () => wrap.querySelector('input')?.focus()
  };
}

function shuffledChoices(exercise) {
  const choices = [...(exercise.choices || [])];
  if (choices.length < 2) return choices;
  const seed = `${exercise.id || ''}:${Date.now()}:${Math.random()}`;
  let state = hashSeed(seed);
  for (let index = choices.length - 1; index > 0; index -= 1) {
    state = nextRandomState(state);
    const swapIndex = state % (index + 1);
    [choices[index], choices[swapIndex]] = [choices[swapIndex], choices[index]];
  }
  if (choices[0]?.correct && choices.length > 1) {
    state = nextRandomState(state);
    const swapIndex = 1 + (state % (choices.length - 1));
    [choices[0], choices[swapIndex]] = [choices[swapIndex], choices[0]];
  }
  return choices;
}

function hashSeed(value) {
  let hash = 2166136261;
  String(value || '').split('').forEach(ch => {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  });
  return hash >>> 0;
}

function nextRandomState(value) {
  return (Math.imul(value || 1, 1664525) + 1013904223) >>> 0;
}

export function evaluateExact(answer, exercise) {
  const normalized = normalizeRussian(answer);
  const accepted = [exercise.expected, ...(exercise.accepted || [])]
    .filter(Boolean)
    .flatMap(value => answerVariants(value))
    .map(normalizeRussian);
  const expected = normalizeRussian(exercise.expected);
  const expectedTokens = expected.split(' ').filter(Boolean);
  const answerTokens = normalized.split(' ').filter(Boolean);
  const correct = accepted.some(value => value === normalized || sameTokenBag(value, normalized)) ||
    (expected && expectedTokens.length === 1 && normalized.split(' ').includes(expected)) ||
    (exercise.allow_contains && expected && containsRussianPhrase(answerTokens, expectedTokens));
  return result(correct, answer, exercise, correct ? 'exact_or_contains' : null);
}

export function evaluateContains(answer, exercise) {
  const normalized = normalizeRussian(answer);
  const expected = normalizeRussian(exercise.expected);
  const correct = Boolean(normalized && expected && normalized.includes(expected));
  return result(correct, answer, exercise, correct ? 'contains_target' : null);
}

export function evaluateChoice(answer, exercise) {
  const normalized = normalizeRussian(answer);
  const choices = exercise.choices || [];
  const marked = choices.filter(choice => choice.correct).map(choice => normalizeRussian(choice.value || choice.label));
  const accepted = marked.length ? marked : [normalizeRussian(exercise.expected)];
  const correct = accepted.includes(normalized);
  return result(correct, answer, exercise, correct ? 'choice' : null);
}

function result(correct, answer, exercise, acceptedBy) {
  return {
    correct,
    answer,
    expected: exercise.expected,
    displayExpected: exercise.display_expected || exercise.expected,
    feedback: correct ? exercise.feedback?.correct : feedbackForError(exercise, inferErrorType(answer, exercise)),
    accepted_by: acceptedBy,
    error_type: correct ? null : inferErrorType(answer, exercise)
  };
}

function feedbackForError(exercise, errorType) {
  return exercise.feedback?.byErrorType?.[errorType] || exercise.feedback?.errorSpecific?.[errorType] || exercise.feedback?.incorrect || '';
}

function normalizeRussian(value) {
  return normalizeAnswer(value)
    .replace(/ё/g, 'е')
    .replace(/[+/_|()[\]{}<>→=]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function answerVariants(value) {
  const text = String(value || '');
  const variants = [text];
  if (text.includes('/')) variants.push(...text.split('/'));
  if (/[+→=]/.test(text)) variants.push(...text.split(/[+→=]/));
  const withoutParentheses = text.replace(/\([^)]*\)/g, '').trim();
  if (withoutParentheses && withoutParentheses !== text) variants.push(withoutParentheses);
  return [...new Set(variants.map(item => item.trim()).filter(Boolean))];
}

function sameTokenBag(left, right) {
  const leftTokens = left.split(' ').filter(Boolean);
  const rightTokens = right.split(' ').filter(Boolean);
  if (leftTokens.length < 2 || leftTokens.length > 4 || leftTokens.length !== rightTokens.length) return false;
  return sortedKey(leftTokens) === sortedKey(rightTokens);
}

function containsRussianPhrase(answerTokens, expectedTokens) {
  if (!answerTokens.length || !expectedTokens.length) return false;
  if (expectedTokens.length === 1) return answerTokens.includes(expectedTokens[0]);
  return answerTokens.join(' ').includes(expectedTokens.join(' '));
}

function sortedKey(tokens) {
  return [...tokens].sort((left, right) => left.localeCompare(right, 'ru')).join('\u0001');
}

function inferErrorType(answer, exercise) {
  if (!String(answer || '').trim()) return 'respuesta_vacia';
  if (exercise.type === 'multiple-choice' || exercise.type === 'listen-choice') return 'opcion_incorrecta';
  if (exercise.skill === 'listening') return 'percepcion_auditiva';
  if (exercise.skill === 'grammar_transfer') return 'forma_o_estructura';
  return 'recuperacion_incorrecta';
}
