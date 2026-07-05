import { evaluateContains, makeTextInputExercise } from '../shared.js';

export const productionPromptExercise = {
  type: 'production-prompt',
  modalities: ['text'],
  render(exercise) {
    return makeTextInputExercise(exercise, {
      display: exercise.sample ? `Modelo: ${exercise.sample}` : '',
      multiline: true,
      placeholder: 'Escribe una frase rusa...'
    });
  },
  evaluate(answer, exercise) {
    return evaluateContains(answer, exercise);
  },
  getTargets(exercise) {
    return exercise.target_ids || [];
  }
};
