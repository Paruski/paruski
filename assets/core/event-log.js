import { dayKey, makeEventId } from './utils.js';

export function createEventLog(storage) {
  let events = storage.loadEvents();

  function record(partial) {
    const correct = partial.correct === null ? null : Boolean(partial.correct);
    const event = {
      event_id: partial.event_id || makeEventId(partial),
      timestamp: partial.timestamp || new Date().toISOString(),
      user_id: partial.user_id || storage.loadProgress().user?.id || 'usuario-local',
      item_id: partial.item_id || partial.exercise_id || null,
      exercise_id: partial.exercise_id || partial.item_id || null,
      skill: partial.skill || 'general',
      exercise_type: partial.exercise_type || null,
      modality: partial.modality || null,
      direction: partial.direction || null,
      difficulty: partial.difficulty ?? null,
      importance: partial.importance ?? null,
      target_ids: partial.target_ids || [],
      targets: partial.targets || [],
      target_snapshots: partial.target_snapshots || partial.targets || [],
      competency_ids: partial.competency_ids || [],
      competency_tags: partial.competency_tags || [],
      lesson: partial.lesson || null,
      prompt: partial.prompt || '',
      expected: partial.expected || '',
      answer: partial.answer || '',
      correct,
      option_used: partial.option_used || partial.action || 'responder',
      action: partial.action || partial.option_used || 'responder',
      error_type: partial.error_type || null,
      response_time_ms: partial.response_time_ms || null,
      hints_used: partial.hints_used || 0,
      confidence: partial.confidence || null,
      review_before: partial.review_before || null,
      review_after: partial.review_after || null,
      srs_before: partial.srs_before || partial.review_before || null,
      srs_after: partial.srs_after || partial.review_after || null
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
    return events.filter(event => event.skill !== 'estado' && event.option_used !== 'resolver_luego');
  }

  return { record, reload, replace, all, forDay, practiceEvents };
}
