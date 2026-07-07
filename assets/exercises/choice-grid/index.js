import { normalizeAnswer } from '../../core/utils.js';

export const choiceGridExercise = {
  type: 'choice-grid',
  modalities: ['text'],
  render(exercise) {
    const wrap = document.createElement('div');
    wrap.className = 'exercise-renderer choice-grid';
    const items = exercise.items || [];
    items.forEach((item, itemIndex) => {
      const row = document.createElement('fieldset');
      row.className = 'choice-grid-row';
      const legend = document.createElement('legend');
      legend.textContent = item.prompt || `Decisión ${itemIndex + 1}`;
      row.appendChild(legend);
      shuffled(item.choices || [], `${exercise.id}-${itemIndex}`).forEach((choice, choiceIndex) => {
        const label = document.createElement('label');
        label.className = 'choice-option compact';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = `choice-grid-${exercise.id}-${itemIndex}`;
        input.value = choice;
        input.dataset.choiceIndex = String(choiceIndex);
        const span = document.createElement('span');
        span.textContent = choice;
        label.append(input, span);
        row.appendChild(label);
      });
      wrap.appendChild(row);
    });
    return {
      element: wrap,
      readAnswer: () => JSON.stringify(items.map((_, index) => {
        const selected = wrap.querySelector(`input[name="choice-grid-${exercise.id}-${index}"]:checked`);
        return selected?.value || '';
      })),
      focus: () => wrap.querySelector('input')?.focus()
    };
  },
  evaluate(answer, exercise) {
    const selected = parseAnswer(answer);
    const items = exercise.items || [];
    const correct = items.length > 0 && items.every((item, index) =>
      normalizeRussian(selected[index]) === normalizeRussian(item.expected)
    );
    const expected = items.map(item => item.expected).join(' | ');
    return {
      correct,
      answer: selected.join(' | '),
      expected,
      displayExpected: exercise.display_expected || expected,
      feedback: correct ? exercise.feedback?.correct : exercise.feedback?.incorrect || '',
      accepted_by: correct ? 'choice_grid' : null,
      error_type: correct ? null : 'opcion_incorrecta'
    };
  },
  getTargets(exercise) {
    return exercise.target_ids || [];
  }
};

function parseAnswer(answer) {
  try {
    const parsed = JSON.parse(answer || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function normalizeRussian(value) {
  return normalizeAnswer(value).replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

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
