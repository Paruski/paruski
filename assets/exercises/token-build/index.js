import { evaluateExact } from '../shared.js';

export const tokenBuildExercise = {
  type: 'token-build',
  modalities: ['text'],
  render(exercise) {
    const wrap = document.createElement('div');
    wrap.className = 'exercise-renderer token-build';
    const answer = document.createElement('div');
    answer.className = 'token-answer';
    answer.setAttribute('aria-live', 'polite');
    const bank = document.createElement('div');
    bank.className = 'token-bank';
    const selected = [];

    function renderAnswer() {
      answer.textContent = selected.join(' ') || 'Construye aquí la frase rusa.';
      answer.classList.toggle('empty', !selected.length);
    }

    shuffled(exercise.tokens || [], exercise.id).forEach(token => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'token-chip';
      button.textContent = token;
      button.addEventListener('click', () => {
        selected.push(token);
        renderAnswer();
      });
      bank.appendChild(button);
    });

    const tools = document.createElement('div');
    tools.className = 'inline-actions';
    const undo = document.createElement('button');
    undo.type = 'button';
    undo.className = 'secondary';
    undo.textContent = 'Deshacer ficha';
    undo.addEventListener('click', () => {
      selected.pop();
      renderAnswer();
    });
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'secondary';
    clear.textContent = 'Limpiar';
    clear.addEventListener('click', () => {
      selected.splice(0);
      renderAnswer();
    });
    tools.append(undo, clear);
    wrap.append(answer, bank, tools);
    renderAnswer();

    return {
      element: wrap,
      readAnswer: () => selected.join(' '),
      focus: () => bank.querySelector('button')?.focus()
    };
  },
  evaluate(answer, exercise) {
    return evaluateExact(answer, exercise);
  },
  getTargets(exercise) {
    return exercise.target_ids || [];
  }
};

function shuffled(values, seed) {
  const output = [...values];
  let state = hashSeed(`${seed}:${Date.now()}:${Math.random()}`);
  for (let index = output.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state || 1, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

function hashSeed(value) {
  let hash = 2166136261;
  String(value || '').split('').forEach(ch => {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  });
  return hash >>> 0;
}
