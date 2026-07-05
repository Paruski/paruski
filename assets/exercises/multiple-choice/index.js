import { evaluateChoice, makeChoiceExercise } from '../shared.js';

export const multipleChoiceExercise = {
  type: 'multiple-choice',
  modalities: ['text'],
  render(exercise) {
    return makeChoiceExercise(exercise);
  },
  evaluate(answer, exercise) {
    return evaluateChoice(answer, exercise);
  },
  getTargets(exercise) {
    return exercise.target_ids || [];
  }
};
