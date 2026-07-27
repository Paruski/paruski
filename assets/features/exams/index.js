import { escapeHtml } from '../../core/utils.js';
import { guidedSessionFeature } from '../guided-session/index.js';

const MANUAL_EXAM_KINDS = [
  { id: 'vocabulary', label: 'Vocabulario', minimum: 15 },
  { id: 'grammar', label: 'Gramática', minimum: 15 },
  { id: 'mixed', label: 'Mixto', minimum: 15 }
];

export const examsFeature = {
  id: 'exams',
  label: 'Exámenes',
  order: 3,
  navMode: 'primary',
  mount(container, context) {
    const summary = context.learner.summary();
    const max = Number(summary.unlockedLessonMax || 1);
    const lessons = context.content.state.lessons
      .filter(lesson => Number(lesson.id) <= max)
      .map(lesson => ({
        lesson,
        examCount: context.scheduler.examExerciseCount?.(lesson.id) || 0,
        manualKinds: MANUAL_EXAM_KINDS.map(kind => ({
          ...kind,
          examCount: context.scheduler.examExerciseCount?.(lesson.id, kind.id) || 0
        })).filter(kind => kind.examCount > 0)
      }));
    container.innerHTML = `
      <section class="library-view">
        <div class="panel-head app-section-head">
          <div>
            <p class="eyebrow">Desbloqueo</p>
            <h2>Exámenes de nivel</h2>
            <p class="muted">Los exámenes manuales separan vocabulario puro, gramática pura y mixto. Cada intento elige preguntas aleatorias dentro de bancos por tipo.</p>
          </div>
        </div>
        <div class="library-grid">
          ${lessons.map(item => renderLessonExams(item.lesson, context, item)).join('')}
        </div>
      </section>
    `;
    container.querySelectorAll('[data-start-exam]').forEach(button => {
      button.addEventListener('click', () => startExam(container, context, Number(button.dataset.startExam), button.dataset.examKind || null));
    });
  }
};

function renderLessonExams(lesson, context, item) {
  if (item.manualKinds.length) {
    return item.manualKinds.map(kind => renderExamCard(lesson, context, kind.examCount, kind)).join('');
  }
  return renderExamCard(lesson, context, item.examCount, { id: '', label: 'Mixto', minimum: 20 });
}

function renderExamCard(lesson, context, examCount, kind) {
  const status = context.learner.lessonExamStatus(Number(lesson.id), kind.id || null);
  const passed = status.passed;
  const recent = status.recent || [];
  const correct = recent.filter(item => item.correct).length;
  const available = examCount >= kind.minimum;
  const examSize = Math.min(30, examCount);
  const required = Math.ceil(examSize * 0.9);
  return `
    <article class="library-card">
      <div class="card-topline">
        <span class="tag">Clase ${String(lesson.id).padStart(2, '0')}</span>
        <span class="tag">${escapeHtml(kind.label)}</span>
        <span class="tag">${passed ? 'superado' : available ? 'pendiente' : 'en preparación'}</span>
      </div>
      <h3>${escapeHtml(lesson.title || `Clase ${lesson.id}`)}</h3>
      <p>${escapeHtml(lesson.summary || '')}</p>
      <p class="muted small">${available ? `Banco: ${examCount}. Intento: ${examSize} preguntas. Última ventana: ${correct}/${recent.length || examSize}. Umbral: ${required}/${examSize} sin fallo crítico.` : `Examen disponible cuando haya ${kind.minimum} tareas manuales. Ahora hay ${examCount}/${kind.minimum}.`}</p>
      <button type="button" data-start-exam="${lesson.id}" data-exam-kind="${escapeHtml(kind.id)}" ${available ? '' : 'disabled'}>${passed ? 'Repetir examen' : available ? startLabel(kind) : 'Examen no disponible'}</button>
    </article>
  `;
}

function startLabel(kind) {
  return kind.id === 'mixed' ? 'Iniciar examen mixto' : `Iniciar examen de ${escapeHtml(kind.label.toLowerCase())}`;
}

function startExam(container, context, lesson, examKind) {
  const kind = MANUAL_EXAM_KINDS.find(item => item.id === examKind) || { id: examKind || '', label: 'mixto', minimum: 20 };
  const examCount = context.scheduler.examExerciseCount?.(lesson, examKind) || 0;
  if (examCount < kind.minimum) {
    context.notify?.(`La clase ${lesson} aún no tiene un examen de ${kind.label.toLowerCase()} completo (${examCount}/${kind.minimum}).`);
    examsFeature.mount(container, context);
    return;
  }
  const session = context.scheduler.buildExamSession(lesson, { examCount: Math.min(30, examCount), examKind });
  guidedSessionFeature.mount(container, {
    ...context,
    scheduler: {
      ...context.scheduler,
      buildSession: () => session
    }
  });
}
