import { escapeHtml, formatDateTime } from '../../core/utils.js';

export const progressFeature = {
  id: 'progress',
  label: 'Progreso',
  order: 40,
  navMode: 'secondary',
  mount(container, context) {
    const summary = context.learner.summary();
    const weak = context.learner.weakTargets(6);
    const competencies = context.learner.competencyProgress(12);
    const weakCompetencies = context.learner.weakCompetencies(6);
    const progress = context.learner.getProgress();
    const calibration = summary.calibration || {};
    container.innerHTML = `
      <section class="progress-view">
        <div class="app-section-head">
          <p class="eyebrow">Modelo del alumno</p>
          <h2>Progreso y prioridades</h2>
        </div>
        <div class="grid cards-4">
          ${metric('Hoy', `${summary.todayCount}/${summary.dailyTarget}`)}
          ${metric('Racha', `${summary.streak} día(s)`)}
          ${metric('Precisión', `${summary.accuracy}%`)}
          ${metric('En estudio', `${summary.lessonMax}/80 clases`)}
          ${metric('Desbloqueado', `${summary.unlockedLessonMax || summary.lessonMax}/80 clases`)}
          ${metric('Calibración', `${Math.round(calibration.rating || 900)} · ±${Math.round(calibration.uncertainty || 350)}`)}
          ${metric('Targets', `${summary.unlockedCount}/${summary.targetCount}`)}
          ${metric('Dominados', summary.mastered)}
          ${metric('Competencias', `${summary.competencyMastered}/${summary.competencyCount}`)}
          ${metric('Eventos', summary.events)}
          ${metric('Último guardado', progress.updated_at ? formatDateTime(progress.updated_at) : 'local')}
        </div>
        <section class="learning-card">
          <h3>Competencias entrenadas</h3>
          <div class="competency-grid">
            ${competencies.length ? competencies.map(item => competencyCard(item)).join('') : '<p class="muted">Las competencias aparecerán al resolver ejercicios.</p>'}
          </div>
        </section>
        <section class="learning-card">
          <h3>Competencias a reforzar</h3>
          <div class="priority-list">
            ${weakCompetencies.length ? weakCompetencies.map(item => `
              <article>
                <strong>${escapeHtml(item.competency.label)}</strong>
                <span>${Math.round(item.state.mastery * 100)}% dominio · ${item.state.wrong} fallo(s)</span>
              </article>
            `).join('') : '<p class="muted">Aún no hay debilidades de competencia con suficiente evidencia.</p>'}
          </div>
        </section>
        <section class="learning-card">
          <h3>Debilidades detectadas</h3>
          <div class="priority-list">
            ${weak.length ? weak.map(item => `
              <article>
                <strong>${escapeHtml(item.target.text)}</strong>
                <span>${Math.round(item.state.mastery * 100)}% dominio · ${item.state.wrong} fallo(s)</span>
              </article>
            `).join('') : '<p class="muted">Aún no hay suficientes respuestas para detectar patrones.</p>'}
          </div>
        </section>
      </section>
    `;
  }
};

function metric(label, value) {
  return `<article class="card"><div class="value">${escapeHtml(value)}</div><div class="label">${escapeHtml(label)}</div></article>`;
}

function competencyCard(item) {
  const accuracy = item.state.attempts ? Math.round((item.state.correct / item.state.attempts) * 100) : 0;
  const mastery = Math.round(item.state.mastery * 100);
  return `
    <article class="competency-card">
      <div>
        <span class="tag">${escapeHtml(item.competency.dimension)}</span>
        <h4>${escapeHtml(item.competency.label)}</h4>
      </div>
      <progress max="100" value="${mastery}"></progress>
      <p class="muted small">${mastery}% dominio · ${accuracy}% precision · ${item.state.attempts} intento(s)</p>
    </article>
  `;
}
