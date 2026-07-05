import { evaluateExact, makeTextInputExercise } from '../shared.js';

export const clozeExercise = {
  type: 'cloze',
  modalities: ['text'],
  render(exercise) {
    return makeTextInputExercise(exercise, { display: exercise.display || '' });
  },
  evaluate(answer, exercise) {
    return evaluateExact(answer, exercise);
  },
  getTargets(exercise) {
    return exercise.target_ids || [];
  }
};
