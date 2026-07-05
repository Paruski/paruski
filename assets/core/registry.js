export function createRegistry() {
  const features = new Map();
  const exercises = new Map();

  return {
    registerFeature(feature) {
      if (!feature?.id || typeof feature.mount !== 'function') {
        throw new Error('Feature invalida: falta id o mount.');
      }
      features.set(feature.id, feature);
      return feature;
    },

    getFeature(id) {
      return features.get(id) || null;
    },

    listFeatures() {
      return [...features.values()].sort((left, right) => (left.order || 0) - (right.order || 0));
    },

    registerExercise(handler) {
      if (!handler?.type || typeof handler.render !== 'function' || typeof handler.evaluate !== 'function') {
        throw new Error('Ejercicio invalido: falta type, render o evaluate.');
      }
      exercises.set(handler.type, handler);
      return handler;
    },

    getExercise(type) {
      return exercises.get(type) || exercises.get('text-input') || null;
    },

    listExercises() {
      return [...exercises.values()];
    }
  };
}
