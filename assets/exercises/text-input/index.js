import { evaluateExact, makeTextInputExercise } from '../shared.js';

export const textInputExercise = {
  type: 'text-input',
  modalities: ['text'],
  render(exercise) {
    return makeTextInputExercise(exercise);
  },
  evaluate(answer, exercise) {
    return evaluateExact(answer, exercise);
  },
  getTargets(exercise) {
    return exercise.target_ids || [];
  }
};
