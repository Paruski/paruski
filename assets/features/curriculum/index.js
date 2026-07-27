import { escapeHtml } from '../../core/utils.js';

const STATUS_CONFIG = {
  complete:     { label: 'Completa',   css: 'status-complete' },
  partial:      { label: 'Parcial',    css: 'status-partial' },
  planned:      { label: 'Planificada', css: 'status-planned' },
  needs_review: { label: 'Revisar',    css: 'status-review' }
};

const LEVEL_BANDS = [
  { max: 5,  name: 'A0' },
  { max: 10, name: 'A0→A1' },
  { max: 28, name: 'A1' },
  { max: 40, name: 'A1→A2' },
  { max: 60, name: 'A2' },
  { max: 80, name: 'A2→B1' }
];

function levelBand(lesson) {
  for (const band of LEVEL_BANDS) {
    if (lesson.number <= band.max) return band.name;
  }
  return 'B1';
}

function defaultStatusBadge(status) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.planned;
  return `<span class="tag status-badge ${cfg.css}">${cfg.label}</span>`;
}

function examStatusBadge(exam) {
  if (!exam) return '';
  const parts = [];
  if (exam.vocabulary) parts.push('V');
  if (exam.grammar) parts.push('G');
  if (exam.mixed) parts.push('M');
  if (exam.full) parts.push('C');
  if (!parts.length) return '<span class="tag muted-tag">Sin examen</span>';
  return `<span class="tag exam-tag">Examen: ${parts.join('·')}</span>`;
}

export const curriculumFeature = {
  id: 'curriculum',
  label: 'Currículo',
  order: 5,
  navMode: 'primary',
  mount(container, context) {
    container.innerHTML = `
      <section class="curriculum-view">
        <div class="panel-head app-section-head">
          <div>
            <p class="eyebrow">Plan de estudios</p>
            <h2>Currículo de 80 lecciones</h2>
            <p class="muted">Estructura completa del curso Paruski desde A0 hasta B1. 
              Las lecciones 1–5 tienen contenido real implementado. Las lecciones 6–80 
              están planificadas pedagógicamente pero aún no tienen ejercicios.</p>
          </div>
        </div>
        <div class="curriculum-legend">
          <span class="tag status-complete">Completa</span>
          <span class="tag status-partial">Parcial</span>
          <span class="tag status-planned">Planificada</span>
          <span class="tag status-review">Revisar</span>
          <span class="tag exam-tag">Con examen</span>
          <span class="tag muted-tag">Sin examen</span>
        </div>
        <div id="curriculumList" class="curriculum-list">
          <p class="muted">Cargando currículo…</p>
        </div>
      </section>
    `;

    fetch('./content/curriculum.json')
      .then(resp => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json();
      })
      .then(curriculum => renderCurriculum(container, curriculum, context))
      .catch(err => {
        const list = container.querySelector('#curriculumList');
        if (list) list.innerHTML = `<p class="empty">Error al cargar el currículo: ${escapeHtml(err.message)}</p>`;
      });
  }
};

function renderCurriculum(container, curriculum, context) {
  const list = container.querySelector('#curriculumList');
  if (!list) return;

  const maxLesson = context.learner.summary().unlockedLessonMax || 1;

  list.innerHTML = curriculum.map(lesson => {
    const isAccessible = lesson.number <= maxLesson;
    const status = lesson.status || 'planned';
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.planned;
    const hasExercises = lesson.number <= 5;

    return `
      <article class="curriculum-card" data-lesson="${lesson.number}">
        <div class="curriculum-card-header">
          <div class="curriculum-card-number">${String(lesson.number).padStart(2, '0')}</div>
          <div class="curriculum-card-title-group">
            <h3>${escapeHtml(lesson.title)}</h3>
            <div class="curriculum-card-tags">
              ${defaultStatusBadge(status)}
              <span class="tag">${levelBand(lesson)}</span>
              ${examStatusBadge(lesson.closingExam)}
              ${hasExercises ? '<span class="tag has-content-tag">Implementada</span>' : ''}
              ${isAccessible ? '' : '<span class="tag locked-tag">Bloqueada</span>'}
            </div>
          </div>
          <button type="button" class="secondary curriculum-expand" aria-label="Expandir lección">+</button>
        </div>
        <div class="curriculum-card-body" hidden>
          <div class="curriculum-meta-grid">
            ${metaBlock('Tema comunicativo', lesson.communicativeTheme)}
            ${metaBlock('Nivel aproximado', lesson.approxLevel)}
            ${metaBlock('Resumen', lesson.summary)}
            ${listBlock('Objetivos comunicativos', lesson.communicativeObjectives)}
            ${listBlock('Objetivos gramaticales', lesson.grammarObjectives)}
            ${listBlock('Vocabulario activo', lesson.activeVocabularyThemes)}
            ${listBlock('Estructuras nuevas', lesson.newStructures)}
            ${listBlock('Estructuras recicladas', lesson.recycledStructures)}
            ${listBlock('Casos gramaticales', lesson.cases)}
            ${listBlock('Habilidades', lesson.skills)}
            ${listBlock('Errores típicos hispanohablantes', lesson.typicalErrorsForSpanishSpeakers)}
            ${criticalTargetsBlock(lesson.criticalTargets)}
            ${listBlock('Producción esperada', lesson.expectedProduction)}
            ${listBlock('Comprensión esperada', lesson.expectedComprehension)}
            ${metaBlock('Criterio de desbloqueo', lesson.unlockCriteria)}
            ${listBlock('Enlaces a lecciones anteriores', lesson.previousLessonLinks)}
            ${metaBlock('Notas de implementación', lesson.implementationNotes)}
          </div>
        </div>
      </article>
    `;
  }).join('');

  list.querySelectorAll('.curriculum-expand').forEach(button => {
    button.addEventListener('click', () => {
      const card = button.closest('.curriculum-card');
      const body = card.querySelector('.curriculum-card-body');
      const isOpen = !body.hidden;
      body.hidden = isOpen;
      button.textContent = isOpen ? '+' : '−';
    });
  });
}

function metaBlock(label, value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return `
    <div class="curriculum-meta-item">
      <span class="curriculum-meta-label">${escapeHtml(label)}</span>
      <span class="curriculum-meta-value">${escapeHtml(text)}</span>
    </div>
  `;
}

function listBlock(label, items) {
  if (!items || !items.length) return '';
  return `
    <div class="curriculum-meta-item">
      <span class="curriculum-meta-label">${escapeHtml(label)}</span>
      <ul class="curriculum-meta-list">
        ${items.map(item => `<li>${escapeHtml(String(item))}</li>`).join('')}
      </ul>
    </div>
  `;
}

function criticalTargetsBlock(targets) {
  if (!targets || !targets.length) return '';
  return `
    <div class="curriculum-meta-item">
      <span class="curriculum-meta-label">Targets críticos</span>
      <ul class="curriculum-meta-list">
        ${targets.map(t => `<li><strong>${escapeHtml(t.id)}</strong>: ${escapeHtml(t.description)}</li>`).join('')}
      </ul>
    </div>
  `;
}
