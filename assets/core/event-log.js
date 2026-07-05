import { dayKey, makeEventId } from './utils.js';

export function createEventLog(storage) {
  let events = storage.loadEvents();

  function record(partial) {
    const event = {
      event_id: partial.event_id || makeEventId(partial),
      timestamp: partial.timestamp || new Date().toISOString(),
      user_id: partial.user_id || storage.loadProgress().user?.id || 'usuario-local',
      skill: partial.skill || 'general',
      exercise_type: partial.exercise_type || null,
      modality: partial.modality || null,
      target_ids: partial.target_ids || [],
      competency_ids: partial.competency_ids || [],
      competency_tags: partial.competency_tags || [],
      lesson: partial.lesson || null,
      prompt: partial.prompt || '',
      expected: partial.expected || '',
      answer: partial.answer || '',
      correct: Boolean(partial.correct),
      error_type: partial.error_type || null,
      response_time_ms: partial.response_time_ms || null,
      confidence: partial.confidence || null
    };
    events = [...events, event];
    storage.saveEvents(events);
    return event;
  }

  function reload() {
    events = storage.loadEvents();
    return events;
  }

  function replace(nextEvents) {
    events = storage.saveEvents(nextEvents || []);
    return events;
  }

  function all() {
    return events;
  }

  function forDay(key) {
    return events.filter(event => dayKey(event.timestamp) === key);
  }

  function practiceEvents() {
    return events.filter(event => event.skill !== 'estado');
  }

  return { record, reload, replace, all, forDay, practiceEvents };
}
