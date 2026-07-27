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
    const hasData = summary.events > 0;
    const unlockedMax = progress.unlocked?.lessonMax || 1;
    const lessonProgress = buildLessonProgress(context, progress, unlockedMax);

    function render() {
      container.innerHTML = `
        <section class="progress-view">
          <div class="panel-head app-section-head">
            <div>
              <p class="eyebrow">${hasData ? 'Tu recorrido' : 'Modelo del alumno'}</p>
              <h2>Progreso</h2>
              <p class="muted">${hasData
                ? 'Así avanzas por las 80 lecciones. Cada estación representa una clase.'
                : 'Aquí verás tu progreso cuando empieces a practicar. Cada ejercicio que resuelvas genera evidencia sobre lo que sabes y lo que necesitas repasar.'}</p>
            </div>
          </div>

          ${hasData ? renderJourneySummary(summary, lessonProgress, unlockedMax) : renderEmptyState()}

          ${hasData ? `
          <details class="learning-card" style="cursor:pointer">
            <summary><h3 style="display:inline;cursor:pointer">Leyenda del recorrido</h3></summary>
            <div class="journey-legend" style="margin-top:0.75rem">
              <span class="journey-dot journey-dot-complete"></span> Hecha — has superado los exámenes de esta clase
              <span class="journey-dot journey-dot-current"></span> Actual — es tu clase activa ahora
              <span class="journey-dot journey-dot-unlocked"></span> Lista — desbloqueada, puedes practicarla
              <span class="journey-dot journey-dot-weak"></span> Repasar — targets débiles detectados
              <span class="journey-dot journey-dot-locked"></span> Bloqueada — supera la clase anterior para abrirla
              <span class="journey-dot journey-dot-planned"></span> Futura — planificada, sin contenido aún
            </div>
          </details>

          <section class="learning-card">
            <h3>Próxima recomendación</h3>
            <div class="recommendation-box">
              ${renderRecommendation(summary, weak, lessonProgress, unlockedMax)}
            </div>
          </section>

          <section class="learning-card">
            <h3>Fortalezas</h3>
            <div class="competency-grid">
              ${competencies.length ? competencies
                .filter(c => (c.state.mastery || 0) >= 0.72)
                .slice(0, 6)
                .map(item => competencyCard(item)).join('') : '<p class="muted">Aún no hay suficientes datos.</p>'}
            </div>
          </section>

          <section class="learning-card">
            <h3>Carencias</h3>
            <p class="muted">Lo que necesita más práctica. La sesión guiada lo prioriza automáticamente.</p>
            <div class="priority-list">
              ${weak.length ? weak.slice(0, 6).map(item => priorityItem(item)).join('') : '<p class="muted">Aún no hay suficientes respuestas para detectar patrones.</p>'}
            </div>
            ${weakCompetencies.length ? `
            <h4 style="margin-top:1rem">Competencias a reforzar</h4>
            <div class="priority-list">
              ${weakCompetencies.slice(0, 4).map(item => priorityItem(item)).join('')}
            </div>` : ''}
          </section>

          <section class="learning-card">
            <h3>Métricas detalladas</h3>
            <p class="muted">${summary.events} respuestas registradas.</p>
            <div class="grid cards-4">
              ${metricCard('Hoy', `${summary.todayCount}/${summary.dailyTarget}`, 'Ejercicios realizados hoy')}
              ${metricCard('Racha', `${summary.streak} día(s)`, 'Días consecutivos')}
              ${metricCard('Precisión', `${summary.accuracy}%`, 'Aciertos sobre total')}
              ${metricCard('En estudio', `${summary.lessonMax}/80`, 'Clase activa')}
              ${metricCard('Desbloqueado', `${unlockedMax}/80`, 'Clase más alta')}
              ${metricCard('Dominados', summary.mastered, 'Objetivos con dominio ≥ 72%')}
              ${metricCard('Competencias', `${summary.competencyMastered}/${summary.competencyCount}`, 'Habilidades dominadas')}
              ${metricCard('Calibración', `${Math.round(calibration.rating || 900)}±${Math.round(calibration.uncertainty || 350)}`, 'Nivel estimado e imprecisión')}
            </div>
          </section>

          <section class="learning-card">
            <h3>Qué significan estas métricas</h3>
            <div class="curriculum-meta-grid">
              <div class="curriculum-meta-item"><span class="curriculum-meta-label">Hoy / objetivo</span><span class="curriculum-meta-value">Ejercicios hechos hoy frente a tu objetivo diario configurable en Ajustes.</span></div>
              <div class="curriculum-meta-item"><span class="curriculum-meta-label">Racha</span><span class="curriculum-meta-value">Días consecutivos con al menos un ejercicio. La consistencia diaria es más eficaz que sesiones muy largas espaciadas.</span></div>
              <div class="curriculum-meta-item"><span class="curriculum-meta-label">Precisión</span><span class="curriculum-meta-value">Porcentaje de aciertos sobre el total de respuestas evaluables.</span></div>
              <div class="curriculum-meta-item"><span class="curriculum-meta-label">Dominados</span><span class="curriculum-meta-value">Objetivos con nivel de dominio estimado ≥ 72 %. No es lo mismo que haber hecho un ejercicio una vez.</span></div>
              <div class="curriculum-meta-item"><span class="curriculum-meta-label">Competencias</span><span class="curriculum-meta-value">Habilidades transversales (producción, reconocimiento, gramática, escucha). El dominio por competencia se calcula a partir de los objetivos que entrenan cada competencia.</span></div>
              <div class="curriculum-meta-item"><span class="curriculum-meta-label">Calibración</span><span class="curriculum-meta-value">El modelo estima tu nivel de habilidad. Con más práctica, la estimación se vuelve más precisa.</span></div>
            </div>
          </section>
          ` : ''}
        </section>
      `;
    }

    render();
  }
};

function buildLessonProgress(context, progress, unlockedMax) {
  const lessons = [];
  for (let i = 1; i <= 80; i++) {
    const key = `lesson_${String(i).padStart(3, '0')}`;
    const raw = progress.lessons?.[key] || progress.lessons?.[i];
    const targets = context.content.state.targets.filter(t => Number(t.lesson) === i);
    const studied = targets.filter(t => progress.targets?.[t.id]?.attempts);
    const mastered = studied.filter(t => (progress.targets?.[t.id]?.mastery || 0) >= 0.72);
    const weak = studied.filter(t => (progress.targets?.[t.id]?.mastery || 0) < 0.58 && (progress.targets?.[t.id]?.wrong || 0) > (progress.targets?.[t.id]?.correct || 0));
    const total = targets.length;
    const masteryPct = total ? Math.round((mastered.length / total) * 100) : 0;
    const isUnlocked = i <= unlockedMax;
    const isComplete = raw?.status === 'exam_passed';
    const hasContent = i <= 5;
    const isCurrent = i === (progress.unlocked?.lessonMax || 1);

    let state = 'locked';
    if (!isUnlocked && !hasContent) state = 'planned';
    else if (!isUnlocked) state = 'locked';
    else if (isComplete) state = 'complete';
    else if (isCurrent && weak.length > 0) state = 'weak';
    else if (isCurrent) state = 'current';
    else state = 'unlocked';

    lessons.push({ number: i, state, total, studied: studied.length, mastered: mastered.length, weakCount: weak.length, masteryPct, hasContent, isComplete, isCurrent, isUnlocked });
  }
  return lessons;
}

function renderJourneySummary(summary, lessons, unlockedMax) {
  const completeCount = lessons.filter(l => l.state === 'complete').length;
  const currentLesson = lessons.find(l => l.state === 'current') || lessons.find(l => l.isUnlocked && !l.isComplete) || { number: 1 };

  return `
    <section class="journey-summary" style="margin-bottom:1rem">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;align-items:start">
        <div style="grid-column:1/-1">
          <div style="font-size:1.2rem;font-weight:700;color:var(--text)">Ahora estas en la leccion ${String(currentLesson.number).padStart(2, '0')}</div>
          <div style="color:var(--muted);font-size:0.85rem">${currentLesson.masteryPct}% de dominio en esta clase</div>
        </div>
        <div style="text-align:center;padding:0.5rem;background:var(--panel-2);border-radius:0.5rem">
          <div style="font-size:1.5rem;font-weight:800;color:var(--accent)">${completeCount}</div>
          <div style="color:var(--muted);font-size:0.8rem">lecciones hechas</div>
        </div>
        <div style="text-align:center;padding:0.5rem;background:var(--panel-2);border-radius:0.5rem">
          <div style="font-size:1.5rem;font-weight:800;color:var(--accent-2)">${unlockedMax - completeCount}</div>
          <div style="color:var(--muted);font-size:0.8rem">pendientes de completar</div>
        </div>
      </div>
      ${summary.events > 0 ? `
      <div style="margin-top:0.75rem;padding:0.5rem;background:var(--panel-2);border-radius:0.5rem">
        <div style="color:var(--muted);font-size:0.8rem">Lo que ya es fiable</div>
        <div style="font-size:0.9rem">${summary.mastered} objetivos con dominio ≥ 72% · ${summary.competencyMastered}/${summary.competencyCount} competencias</div>
      </div>` : ''}
      ${lessons.filter(l => l.state === 'weak').length > 0 ? `
      <div style="margin-top:0.5rem;padding:0.5rem;border:1px solid rgba(239,68,68,0.3);border-radius:0.5rem;background:rgba(239,68,68,0.06)">
        <div style="color:#fecaca;font-size:0.8rem">Lo que bloquea avance</div>
        <div style="font-size:0.85rem">${lessons.filter(l => l.state === 'weak').length} leccion(es) con targets debiles</div>
      </div>` : ''}
    </section>

    <section class="learning-card">
      <h3>Recorrido</h3>
      <div class="journey-map">${lessons.map(renderStation).join('')}</div>
    </section>
  `;
}

function renderStation(lesson) {
  const dotClass = `journey-dot journey-dot-${lesson.state}`;
  let title = `Lección ${String(lesson.number).padStart(2, '0')}`;

  const stateLabels = {
    'complete': 'Completada',
    'current': 'Vas por aquí',
    'unlocked': 'Lista para practicar',
    'weak': 'Necesita repaso',
    'locked': 'Bloqueada',
    'planned': 'Planificada'
  };

  return `
    <div class="journey-station">
      <div class="${dotClass}" title="${stateLabels[lesson.state] || ''}">
        <span class="journey-station-number">${String(lesson.number).padStart(2, '0')}</span>
      </div>
      <div class="journey-station-label">${stateLabels[lesson.state] || ''}</div>
      ${lesson.mastered > 0 ? `<div class="journey-station-mastery">${lesson.mastered}/${lesson.total}</div>` : ''}
    </div>
  `;
}

function renderEmptyState() {
  return `
    <section class="learning-card">
      <h3>¿Qué es el progreso en Paruski?</h3>
      <p class="big-text">El progreso no es solo cuántos ejercicios has hecho. Es una estimación de <strong>lo que realmente dominas</strong>: qué vocabulario recuerdas, qué estructuras gramaticales aplicas y qué competencias has desarrollado.</p>
      <div class="curriculum-meta-grid">
        <div class="curriculum-meta-item"><span class="curriculum-meta-label">Progreso ≠ ejercicios hechos</span><span class="curriculum-meta-value">Hacer muchos ejercicios no significa dominar. El modelo solo cuenta como dominio cuando aciertas de forma consistente con repetición espaciada.</span></div>
        <div class="curriculum-meta-item"><span class="curriculum-meta-label">Progreso ≠ currículo</span><span class="curriculum-meta-value">El currículo describe lo que el curso <em>ofrece</em>. Tu progreso mide lo que tú <em>has aprendido</em> de ese currículo.</span></div>
        <div class="curriculum-meta-item"><span class="curriculum-meta-label">¿Cómo empezar?</span><span class="curriculum-meta-value">Ve a la sección <strong>Clases</strong> para aprender con lecciones guiadas, o a <strong>Ejercicios</strong> para practicar por tu cuenta. Cada ejercicio que resuelvas alimenta tu modelo de progreso.</span></div>
      </div>
    </section>
  `;
}

function metricCard(label, value, tooltip) {
  return `<article class="card" title="${escapeHtml(tooltip)}"><div class="value">${escapeHtml(value)}</div><div class="label">${escapeHtml(label)}</div></article>`;
}

function competencyCard(item) {
  const mastery = Math.round(item.state.mastery * 100);
  return `
    <article class="competency-card">
      <div>
        <span class="tag">${escapeHtml(item.competency.dimension)}</span>
        <h4>${escapeHtml(item.competency.label)}</h4>
      </div>
      <progress max="100" value="${mastery}"></progress>
      <p class="muted small">${mastery}% dominio · ${item.state.attempts} intento(s)</p>
    </article>
  `;
}

function priorityItem(item) {
  const mastery = Math.round(item.state.mastery * 100);
  const label = item.target ? item.target.text : (item.competency ? item.competency.label : '');
  return `
    <article style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--line)">
      <strong>${escapeHtml(label)}</strong>
      <span style="color:var(--muted);font-size:0.85rem">${mastery}% dominio · ${item.state.wrong} fallo(s)</span>
    </article>
  `;
}

function renderRecommendation(summary, weak, lessons, unlockedMax) {
  const current = lessons.find(l => l.state === 'current') || lessons.find(l => l.isUnlocked && !l.isComplete);
  const weakInCurrent = current ? lessons.filter(l => l.number === current.number && l.weakCount > 0) : [];
  const dueCount = summary.events > 0 ? Math.max(1, Math.round(summary.events * 0.1)) : 0;
  const readyForExam = Boolean(summary.examLesson);

  if (readyForExam) {
    return `<p class="big-text">Toca examen de la lección ${String(summary.examLesson).padStart(2, '0')}. Si lo superas, desbloquearás la siguiente clase.</p>
      <button type="button" class="primary" onclick="window.ParuskiApp?.showFeature('exams')">Ir a exámenes</button>`;
  }
  if (weak.length > 0) {
    return `<p class="big-text">Tienes ${weak.length} objetivo(s) que necesitan refuerzo. La sesión guiada los priorizará automáticamente.</p>
      <button type="button" class="primary" onclick="window.ParuskiApp?.showFeature('guided-session')">Practicar ahora</button>`;
  }
  if (current) {
    return `<p class="big-text">Sigue avanzando en la lección ${String(current.number).padStart(2, '0')}. Practica vocabulario y gramática, y cuando te sientas preparado, haz el examen.</p>
      <button type="button" class="primary" onclick="window.ParuskiApp?.showFeature('guided-session')">Seguir practicando</button>`;
  }
  return `<p class="big-text">Empieza por la lección 1. Ve a la sección Clases para comenzar.</p>
    <button type="button" class="primary" onclick="window.ParuskiApp?.showFeature('classes')">Ir a clases</button>`;
}
