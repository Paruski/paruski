import { addDays, dayKey, escapeHtml, formatDate } from '../../core/utils.js';

export const calendarFeature = {
  id: 'calendar',
  label: 'Calendario',
  order: 30,
  navMode: 'secondary',
  mount(container, context) {
    let selected = dayKey(new Date());

    function render() {
      const events = context.eventLog.all();
      const plan = context.scheduler.previewPlan(21);
      const days = Array.from({ length: 21 }, (_, index) => dayKey(addDays(new Date(), index - 7)));
      container.innerHTML = `
        <section class="calendar-view">
          <div class="app-section-head">
            <p class="eyebrow">Ritmo de estudio</p>
            <h2>Calendario de práctica</h2>
          </div>
          <div class="calendar-layout">
            <div class="calendar-grid-v2">
              ${days.map(key => renderDay(key, events, plan, selected)).join('')}
            </div>
            <aside class="side-pane">
              ${renderSelectedDay(selected, events, plan, context)}
            </aside>
          </div>
        </section>
      `;
      container.querySelectorAll('[data-day]').forEach(button => button.addEventListener('click', () => {
        selected = button.dataset.day;
        render();
      }));
    }

    render();
  }
};

function renderDay(key, events, plan, selected) {
  const eventCount = events.filter(event => dayKey(event.timestamp) === key).length;
  const planned = plan.find(day => day.date === key)?.items.length || 0;
  const today = key === dayKey(new Date());
  return `
    <button type="button" class="calendar-cell-v2 ${selected === key ? 'selected' : ''} ${today ? 'today' : ''}" data-day="${key}">
      <strong>${escapeHtml(formatDate(key))}</strong>
      <span>${eventCount} hecho(s)</span>
      <span>${planned} planificado(s)</span>
    </button>
  `;
}

function renderSelectedDay(key, events, plan, context) {
  const dayEvents = events.filter(event => dayKey(event.timestamp) === key);
  const planned = plan.find(day => day.date === key)?.items || [];
  return `
    <article class="side-card">
      <h3>${escapeHtml(formatDate(key))}</h3>
      <p class="muted">${dayEvents.length} actividad(es) registradas · ${planned.length} repaso(s) planificados</p>
    </article>
    <article class="side-card">
      <h3>Hecho</h3>
      ${dayEvents.length ? dayEvents.slice(-8).reverse().map(event => `
        <p><strong>${event.correct ? '✓' : '✗'} ${escapeHtml(event.exercise_type || event.skill)}</strong><br>
        <span class="muted">${escapeHtml(event.prompt || '').slice(0, 100)}</span></p>
      `).join('') : '<p class="muted">Sin actividad registrada.</p>'}
    </article>
    <article class="side-card">
      <h3>Plan</h3>
      ${planned.length ? planned.slice(0, 8).map(item => {
        const card = context.content.getCard(item.target);
        return `<p><strong>${escapeHtml(item.target.text)}</strong><br><span class="muted">${escapeHtml(card?.translation || item.target.kind)}</span></p>`;
      }).join('') : '<p class="muted">No hay repasos previstos para este día.</p>'}
    </article>
  `;
}
