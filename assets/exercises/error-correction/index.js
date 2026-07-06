import { evaluateExact, makeTextInputExercise } from '../shared.js';

export const errorCorrectionExercise = {
  type: 'error-correction',
  modalities: ['text'],
  render(exercise) {
    return makeTextInputExercise(exercise, {
      display: exercise.display || exercise.context || '',
      placeholder: 'Escribe la frase corregida en ruso...'
    });
  },
  evaluate(answer, exercise) {
    return evaluateExact(answer, exercise);
  },
  getTargets(exercise) {
    return exercise.target_ids || [];
  }
};
