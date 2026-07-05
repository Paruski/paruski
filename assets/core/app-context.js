export function createAppContext(parts) {
  return {
    registry: parts.registry,
    content: parts.content,
    storage: parts.storage,
    eventLog: parts.eventLog,
    learner: parts.learner,
    scheduler: parts.scheduler,
    audio: parts.audio,
    showFeature: parts.showFeature,
    notify: parts.notify || (() => {})
  };
}
