import { evaluateChoice, makeChoiceExercise } from '../shared.js';

export const listenChoiceExercise = {
  type: 'listen-choice',
  modalities: ['audio', 'text'],
  render(exercise, context) {
    const widget = makeChoiceExercise(exercise);
    const actions = document.createElement('div');
    actions.className = 'inline-actions';
    const listen = document.createElement('button');
    listen.type = 'button';
    listen.className = 'secondary';
    listen.textContent = 'Escuchar';
    listen.addEventListener('click', () => {
      context.notify?.('');
      context.audio.speak(exercise.tts_text || exercise.expected, { requireRecorded: true }).then(ok => {
        if (!ok) context.notify?.('Ese audio grabado aún no está disponible.');
      });
    });
    actions.appendChild(listen);
    widget.element.prepend(actions);
    return widget;
  },
  evaluate(answer, exercise) {
    return evaluateChoice(answer, exercise);
  },
  getTargets(exercise) {
    return exercise.target_ids || [];
  }
};
