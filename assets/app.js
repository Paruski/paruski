import { createAppContext } from './core/app-context.js';
import { createAudioService } from './core/audio.js';
import { createContentStore } from './core/content-store.js';
import { createEventLog } from './core/event-log.js';
import { createLearnerModel } from './core/learner-model.js';
import { createRegistry } from './core/registry.js';
import { createScheduler } from './core/scheduler.js';
import { createStorage } from './core/storage.js';
import { escapeHtml } from './core/utils.js';

import { calendarFeature } from './features/calendar/index.js';
import { examsFeature } from './features/exams/index.js';
import { guidedSessionFeature } from './features/guided-session/index.js';
import { libraryFeature } from './features/library/index.js';
import { progressFeature } from './features/progress/index.js';
import { settingsFeature } from './features/settings/index.js';
import { speakingLabFeature } from './features/speaking-lab/index.js';
import { syncFeature } from './features/sync/index.js';

import { clozeExercise } from './exercises/cloze/index.js';
import { choiceGridExercise } from './exercises/choice-grid/index.js';
import { dictationExercise } from './exercises/dictation/index.js';
import { errorCorrectionExercise } from './exercises/error-correction/index.js';
import { listenChoiceExercise } from './exercises/listen-choice/index.js';
import { multipleChoiceExercise } from './exercises/multiple-choice/index.js';
import { productionPromptExercise } from './exercises/production-prompt/index.js';
import { textInputExercise } from './exercises/text-input/index.js';
import { tokenBuildExercise } from './exercises/token-build/index.js';
import { transformExercise } from './exercises/transform/index.js';

const registry = createRegistry();
[
  guidedSessionFeature,
  examsFeature,
  libraryFeature,
  calendarFeature,
  progressFeature,
  speakingLabFeature,
  syncFeature,
  settingsFeature
].forEach(feature => registry.registerFeature(feature));

[
  textInputExercise,
  clozeExercise,
  choiceGridExercise,
  multipleChoiceExercise,
  tokenBuildExercise,
  dictationExercise,
  listenChoiceExercise,
  errorCorrectionExercise,
  transformExercise,
  productionPromptExercise
].forEach(exercise => registry.registerExercise(exercise));

bootstrap().catch(error => {
  const root = document.getElementById('appRoot') || document.body;
  root.innerHTML = `<main class="panel"><h1>Error al cargar</h1><p>${escapeHtml(error.message)}</p></main>`;
});

async function bootstrap() {
  await loadScript('assets/audio-bank.js').catch(() => {});
  const content = await createContentStore().load();
  const storage = createStorage();
  const eventLog = createEventLog(storage);
  const learner = createLearnerModel(storage, eventLog, content);
  const audio = createAudioService(content);
  const scheduler = createScheduler({ contentStore: content, learnerModel: learner, audioService: audio });
  const root = document.getElementById('appRoot');
  const nav = document.getElementById('appNav');
  const status = document.getElementById('appStatus');
  let context;

  function notify(message) {
    if (!status) return;
    status.textContent = message || '';
    status.hidden = !message;
  }

  function showFeature(id) {
    const feature = registry.getFeature(id) || registry.getFeature('guided-session');
    document.querySelectorAll('[data-feature]').forEach(button => {
      button.classList.toggle('active', button.dataset.feature === feature.id);
    });
    root.innerHTML = '';
    feature.mount(root, context);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  context = createAppContext({
    registry,
    content,
    storage,
    eventLog,
    learner,
    scheduler,
    audio,
    showFeature,
    notify
  });

  renderNav(nav, registry, showFeature);
  showFeature('guided-session');
  registerServiceWorker();
  window.ParuskiApp = context;
}

function renderNav(nav, registry, showFeature) {
  if (!nav) return;
  nav.innerHTML = registry.listFeatures().map(feature => `
    <button type="button" class="tab" data-feature="${feature.id}">${escapeHtml(feature.label)}</button>
  `).join('');
  nav.querySelectorAll('[data-feature]').forEach(button => {
    button.addEventListener('click', () => showFeature(button.dataset.feature));
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}
