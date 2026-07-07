import { escapeHtml } from '../../core/utils.js';
import { guidedSessionFeature } from '../guided-session/index.js';

export const examsFeature = {
  id: 'exams',
  label: 'Exámenes',
  order: 3,
  navMode: 'primary',
  mount(container, context) {
    const summary = context.learner.summary();
    const max = Number(summary.unlockedLessonMax || 1);
    const lessons = context.content.state.lessons.filter(lesson => Number(lesson.id) <= max);
    container.innerHTML = `
      <section class="library-view">
        <div class="panel-head app-section-head">
          <div>
            <p class="eyebrow">Desbloqueo</p>
            <h2>Exámenes de nivel</h2>
            <p class="muted">Cada examen usa 20 ejercicios variados. Para pasar necesitas 18 aciertos y ningún fallo crítico.</p>
          </div>
        </div>
        <div class="library-grid">
          ${lessons.map(lesson => renderExamCard(lesson, context)).join('')}
        </div>
      </section>
    `;
    container.querySelectorAll('[data-start-exam]').forEach(button => {
      button.addEventListener('click', () => startExam(container, context, Number(button.dataset.startExam)));
    });
  }
};

function renderExamCard(lesson, context) {
  const status = context.learner.lessonExamStatus(Number(lesson.id));
  const passed = status.passed;
  const recent = status.recent || [];
  const correct = recent.filter(item => item.correct).length;
  return `
    <article class="library-card">
      <div class="card-topline">
        <span class="tag">Clase ${String(lesson.id).padStart(2, '0')}</span>
        <span class="tag">${passed ? 'superado' : 'pendiente'}</span>
      </div>
      <h3>${escapeHtml(lesson.title || `Clase ${lesson.id}`)}</h3>
      <p>${escapeHtml(lesson.summary || '')}</p>
      <p class="muted small">Última ventana: ${correct}/${recent.length || 20}. Umbral: 18/20 sin fallo crítico.</p>
      <button type="button" data-start-exam="${lesson.id}">${passed ? 'Repetir examen' : 'Iniciar examen'}</button>
    </article>
  `;
}

function startExam(container, context, lesson) {
  const session = context.scheduler.buildExamSession(lesson, { examCount: 20 });
  guidedSessionFeature.mount(container, {
    ...context,
    scheduler: {
      ...context.scheduler,
      buildSession: () => session
    }
  });
}
