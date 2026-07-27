import { escapeHtml } from '../../core/utils.js';

const STATUS_CONFIG = {
  complete:     { label: 'Completa',   css: 'status-complete' },
  partial:      { label: 'En curso',   css: 'status-partial' },
  planned:      { label: 'Planificada', css: 'status-planned' },
  needs_review: { label: 'Revisar',    css: 'status-review' }
};

export const classesFeature = {
  id: 'classes',
  label: 'Clases',
  order: 0,
  navMode: 'primary',
  mount(container, context) {
    let selectedLesson = null;
    let classData = null;
    let practiceExercises = [];
    let practiceStep = 0;
    let inPractice = false;

    function render() {
      if (false) { // practice removed from classes; use Ejercicios section
      } else if (selectedLesson && classData) {
        renderClassView(container, context, selectedLesson, classData, goBack, startPractice, goToExams);
      } else {
        container.innerHTML = `
          <section class="classes-view">
            <div class="panel-head app-section-head">
              <div>
                <p class="eyebrow">Aprendizaje guiado</p>
                <h2>Tus clases</h2>
              </div>
            </div>
            ${renderLessonList(context, openLesson)}
          </section>
        `;
      }
    }

    function openLesson(num) {
      selectedLesson = num;
      fetch('./content/classes.json')
        .then(resp => resp.ok ? resp.json() : [])
        .then(data => {
          classData = data.find(l => l.lessonId === num) || null;
          practiceExercises = [];
          practiceStep = 0;
          inPractice = false;
          render();
        })
        .catch(() => {
          classData = null;
          render();
        });
    }

    function goBack() {
      selectedLesson = null;
      classData = null;
      practiceExercises = [];
      practiceStep = 0;
      inPractice = false;
      render();
    }

    function startPractice() {
      if (!classData) return;
      const refs = classData.guidedPracticeRefs || [];
      const allEx = context.content.state.exercises;
      const selected = [];
      const seenLemmaIds = new Set();

      for (const ref of refs) {
        if (selected.length >= 5) break;
        const ex = allEx.find(e => e.id === ref);
        if (!ex) continue;
        const handler = context.registry.getExercise(ex.type);
        if (!handler) continue;
        const lids = ex.target_ids || ex.targets?.lemmas || [];
        const hasNewLemma = lids.every(lid => !seenLemmaIds.has(lid));
        if (lids.length > 0 && !hasNewLemma) continue;
        lids.forEach(lid => seenLemmaIds.add(lid));
        selected.push(ex);
      }

      practiceExercises = selected;
      practiceStep = 0;
      inPractice = true;
      render();
    }

    function goNextPractice() {
      practiceStep++;
      render();
    }

    function finishPractice() {
      inPractice = false;
      practiceExercises = [];
      practiceStep = 0;
      render();
    }

    function goToExams() {
      inPractice = false;
      context.showFeature('exams');
    }

    render();
  }
};

function renderLessonList(context, openLesson) {
  const summary = context.learner.summary();
  const maxLesson = summary.unlockedLessonMax || 1;

  const listHtml = `
    <p class="muted">Cada clase es una unidad didáctica guiada con explicación, ejemplos, micro-checks y práctica.</p>
    <div id="classLessonList" class="curriculum-list"></div>
  `;

  setTimeout(() => {
    const listEl = document.getElementById('classLessonList');
    if (!listEl) return;

    fetch('./content/curriculum.json')
      .then(resp => resp.ok ? resp.json() : [])
      .then(data => {
        const lessons = data.length ? data : [];
        listEl.innerHTML = lessons.map(lesson => {
          const num = lesson.number;
          const isAccessible = num <= maxLesson;
          const status = lesson.status || 'planned';
          const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.planned;
          const hasContent = num <= 5;
          const examCount = hasContent ? Object.values(lesson.closingExam || {}).filter(Boolean).length : 0;
          const examLabel = examCount === 1 ? '1 bloque de evaluación' : examCount > 1 ? `${examCount} bloques de evaluación` : '';

          return `
            <article class="curriculum-card ${isAccessible ? '' : 'locked'}">
              <div class="curriculum-card-header">
                <div class="curriculum-card-number">${String(num).padStart(2, '0')}</div>
                <div class="curriculum-card-title-group">
                  <h3>${escapeHtml(lesson.title)}</h3>
                  <div class="curriculum-card-tags">
                    <span class="tag ${cfg.css}">${cfg.label}</span>
                    <span class="tag">${lesson.approxLevel || '—'}</span>
                    ${isAccessible ? '' : '<span class="tag locked-tag">Bloqueada</span>'}
                    ${examLabel ? `<span class="tag exam-tag">${examLabel}</span>` : ''}
                    ${hasContent ? '<span class="tag has-content-tag">Clase disponible</span>' : ''}
                  </div>
                </div>
                ${isAccessible && hasContent ? `<button type="button" class="primary" data-open-class="${num}">Comenzar clase</button>` : ''}
                ${isAccessible && !hasContent ? `<span class="tag status-planned">Próximamente</span>` : ''}
              </div>
            </article>
          `;
        }).join('') || '<p class="empty">No se pudo cargar el currículo.</p>';

        listEl.querySelectorAll('[data-open-class]').forEach(btn => {
          btn.addEventListener('click', () => openLesson(Number(btn.dataset.openClass)));
        });
      })
      .catch(() => {
        listEl.innerHTML = '<p class="empty">Error al cargar las clases.</p>';
      });
  }, 50);

  return listHtml;
}

function renderClassView(container, context, lessonNum, classData, goBack, startPractice, goToExams) {
  const summary = context.learner.summary();
  container.innerHTML = `
    <section class="classes-view">
      <div class="panel-head app-section-head">
        <div>
          <p class="eyebrow">Clase ${String(lessonNum).padStart(2, '0')}</p>
          <h2>${escapeHtml(classData.title)}</h2>
        </div>
      </div>

      <button type="button" class="secondary" data-back-classes>&larr; Volver a clases</button>

      <article class="learning-card focus-card" style="margin-top:1rem">
        <p class="big-text">${escapeHtml(classData.goal)}</p>
        <div class="curriculum-meta-grid">
          <div class="curriculum-meta-item">
            <span class="curriculum-meta-label">Por qué es importante</span>
            <span class="curriculum-meta-value">${escapeHtml(classData.whyItMatters)}</span>
          </div>
          <div class="curriculum-meta-item">
            <span class="curriculum-meta-label">Interferencia del español</span>
            <span class="curriculum-meta-value">${escapeHtml(classData.spanishInterference)}</span>
          </div>
        </div>
      </article>

      <nav class="class-section-nav" style="margin-top:0.5rem">
        <span class="muted small">Ir a: </span>
        <a href="#classSections" class="secondary small" style="cursor:pointer">Secciones</a>
        <a href="#classGuidedPractice" class="secondary small" style="cursor:pointer">Práctica</a>
        <a href="#" class="secondary small" style="cursor:pointer" id="scrollTopLink">Volver arriba</a>
      </nav>

      <div id="classSections"></div>

      <div id="classGuidedPractice"></div>

      <article class="learning-card" style="margin-top:1rem">
        <h3>Resumen</h3>
        <p style="white-space:pre-line">${escapeHtml(classData.summary)}</p>
        ${classData.errorsToWatch?.length ? `
        <h4 style="margin-top:0.75rem">Errores a vigilar</h4>
        <ul>${classData.errorsToWatch.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
        ` : ''}
        <p class="big-text" style="margin-top:0.75rem">${escapeHtml(classData.nextStep)}</p>
      </article>

      <div class="guided-actions" style="margin-top:1rem; gap:0.5rem; flex-wrap:wrap">
        <button type="button" class="primary" id="practiceRedirectBtn">Practicar esta clase</button>
        ${classData.examAvailable ? '<button type="button" class="secondary" id="goToExamsBtn">Ir al examen</button>' : ''}
        <button type="button" class="secondary" data-back-classes>Elegir otra clase</button>
      </div>
    </section>
  `;

  // Render sections
  const sectionsBox = container.querySelector('#classSections');
  (classData.sections || []).forEach((section, i) => {
    const sectionEl = document.createElement('section');
    sectionEl.className = 'learning-card';
    sectionEl.style.marginTop = '1rem';
    sectionEl.innerHTML = renderSection(section, i);
    sectionsBox.appendChild(sectionEl);
  });

  // Wire up micro-checks (after render)
  setTimeout(() => wireMicroChecks(container, classData), 50);

  // Wire up guided practice section
  renderGuidedPracticeList(container, context, classData);

  // Wire up buttons
  container.querySelector('#practiceRedirectBtn')?.addEventListener('click', () => context.showFeature('guided-session'));
  container.querySelector('#goToExamsBtn')?.addEventListener('click', goToExams);
  container.querySelectorAll('[data-back-classes]').forEach(btn => {
    btn.addEventListener('click', goBack);
  });
  container.querySelector('#scrollTopLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    container.scrollIntoView({ behavior: 'smooth' });
  });
  container.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href === '#') return;
      const targetId = href?.slice(1);
      if (targetId) {
        const target = container.querySelector('[id="' + targetId.replace(/"/g, '') + '"]');
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  });
}

function renderSection(section, index) {
  const examples = (section.examples || []).map(ex => `
    <div class="class-example">
      <div class="class-example-ru">${escapeHtml(ex.ru)}</div>
      <div class="class-example-es">${escapeHtml(ex.es)}</div>
    </div>
  `).join('');

  const contrasts = (section.contrasts || []).map(c => `
    <div class="class-contrast">
      <div class="class-contrast-label">${escapeHtml(c.label)}</div>
      <div class="class-contrast-es">${escapeHtml(c.es)}</div>
      ${c.ru ? `<div class="class-contrast-ru">${escapeHtml(c.ru)}</div>` : ''}
    </div>
  `).join('');

  const microChecks = (section.microChecks || []).map((mc, mi) => `
    <div class="class-micro-check" data-mc-section="${index}" data-mc-index="${mi}">
      <div class="class-mc-question">${mc.type === 'choice' ? '🧠 ' : '💡 '}${escapeHtml(mc.question)}</div>
      ${mc.type === 'choice' ? `
        <div class="class-mc-options">
          ${mc.options.map((opt, oi) => `
            <label class="class-mc-option">
              <input type="radio" name="mc-${index}-${mi}" value="${oi}" data-mc-correct="${oi === mc.correctIndex}">
              ${escapeHtml(opt)}
            </label>
          `).join('')}
        </div>
        <div class="class-mc-feedback" hidden></div>
        <button type="button" class="secondary small" data-mc-check="${index}-${mi}">Comprobar</button>
      ` : `
        <div class="class-mc-reveal">
          <button type="button" class="secondary small" data-mc-reveal="${index}-${mi}">Ver respuesta</button>
          <div class="class-mc-answer" hidden style="margin-top:0.5rem">
            <strong>${escapeHtml(mc.answer)}</strong>
            ${mc.explanation ? `<p class="muted small">${escapeHtml(mc.explanation)}</p>` : ''}
          </div>
        </div>
      `}
    </div>
  `).join('');

  return `
    <h3>${escapeHtml(section.title)}</h3>
    <div class="class-section-content" style="white-space:pre-line">${escapeHtml(section.content)}</div>
    ${examples ? `<div class="class-examples"><h4>Ejemplos</h4>${examples}</div>` : ''}
    ${contrasts ? `<div class="class-contrasts"><h4>Contraste con el español</h4>${contrasts}</div>` : ''}
    ${microChecks ? `<div class="class-micro-checks"><h4>Comprueba que lo has entendido</h4>${microChecks}</div>` : ''}
  `;
}

function wireMicroChecks(container, classData) {
  // Reveal buttons
  container.querySelectorAll('[data-mc-reveal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const answer = btn.nextElementSibling;
      if (answer) {
        answer.hidden = !answer.hidden;
        btn.textContent = answer.hidden ? 'Ver respuesta' : 'Ocultar respuesta';
      }
    });
  });

  // Check buttons for choice type
  container.querySelectorAll('[data-mc-check]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [sectionIdx, mcIdx] = btn.dataset.mcCheck.split('-').map(Number);
      const section = classData.sections[sectionIdx];
      const mc = section?.microChecks[mcIdx];
      if (!mc) return;

      const options = btn.closest('.class-micro-check').querySelectorAll('input[type="radio"]');
      let selected = null;
      options.forEach((opt, oi) => {
        if (opt.checked) selected = oi;
      });

      const feedback = btn.closest('.class-micro-check').querySelector('.class-mc-feedback');
      if (feedback) {
        if (selected === null) {
          feedback.innerHTML = `<p class="muted" style="color:var(--warn)">Selecciona una opción primero.</p>`;
          feedback.hidden = false;
        } else if (selected === mc.correctIndex) {
          feedback.innerHTML = `<p style="color:#bbf7d0">✅ Correcto. ${mc.explanation ? escapeHtml(mc.explanation) : ''}</p>`;
          feedback.hidden = false;
          btn.disabled = true;
        } else {
          feedback.innerHTML = `<p style="color:#fecaca">❌ No es correcto. ${mc.explanation ? escapeHtml(mc.explanation) : ''}</p>`;
          feedback.hidden = false;
        }
      }
    });
  });
}

function renderGuidedPracticeList(container, context, classData) {
  const box = container.querySelector('#classGuidedPractice');
  if (!box) return;

  const refs = classData.guidedPracticeRefs || [];
  const allEx = context.content.state.exercises;
  const available = refs.filter(ref => allEx.find(e => e.id === ref));

  if (available.length === 0) {
    box.innerHTML = `
      <article class="learning-card" style="margin-top:1rem">
        <h3>Práctica guiada</h3>
        <p class="muted">Práctica pendiente de implementar. Mientras tanto, puedes practicar en la sección Ejercicios.</p>
      </article>
    `;
    return;
  }

  box.innerHTML = `
    <article class="learning-card" style="margin-top:1rem">
      <h3>Ejercicios relacionados</h3>
      <p class="muted">Estos ejercicios están conectados con lo que acabas de aprender. Para practicarlos, ve a la seccion Ejercicios.</p>
      <ul class="class-practice-list">
        ${available.map((ref, i) => {
          const ex = allEx.find(e => e.id === ref);
          const typeLabel = ex ? typeLabelMap(ex.type) || ex.type : '?';
          const skillLabel = ex ? skillLabelMap(ex.skill) || '' : '';
          const hasDisplay = ex && ex.display && ex.display.length > 3;
          const hasContext = ex && ex.context && ex.context.length > 3;
          const fullPrompt = ex ? ex.prompt || '' : '?';
          const displayPart = hasDisplay ? ex.display : '';
          const contextPart = hasContext ? ex.context : '';
          return `<li>
            <strong>${i + 1}.</strong>
            <div class="class-practice-prompt">${escapeHtml(fullPrompt)}</div>
            ${displayPart ? `<div class="class-practice-source">${escapeHtml(displayPart)}</div>` : ''}
            ${contextPart ? `<div class="muted small">${escapeHtml(contextPart)}</div>` : ''}
            <div style="margin-top:0.25rem">
              <span class="tag" style="font-size:0.75rem">${typeLabel}</span>
              ${skillLabel ? `<span class="tag" style="font-size:0.75rem">${skillLabel}</span>` : ''}
            </div>
          </li>`;
        }).join('')}
      </ul>
    </article>
  `;
}

function renderPracticeMode(container, context, lessonNum, step, exercises, onNext, onFinish, goToExams) {
  const exercise = exercises[step];
  const total = exercises.length;

  if (step >= total) {
    // Practice done
    container.innerHTML = `
      <section class="classes-view">
        <div class="panel-head app-section-head">
          <div><p class="eyebrow">Clase ${String(lessonNum).padStart(2, '0')}</p><h2>Práctica completada</h2></div>
        </div>
        <article class="learning-card focus-card">
          <h2>Bien hecho</h2>
          <p class="big-text">Has completado la práctica guiada de la lección ${String(lessonNum).padStart(2, '0')}. Has trabajado ${total} ejercicios relacionados con la explicación.</p>
          <div class="guided-actions" style="margin-top:1rem; gap:0.5rem">
            <button type="button" class="secondary" id="continuePractice">Seguir practicando</button>
            <button type="button" class="secondary" id="goToExams">Ir a exámenes</button>
            <button type="button" class="secondary" id="finishPractice">Volver a la clase</button>
          </div>
        </article>
      </section>
    `;
    container.querySelector('#continuePractice')?.addEventListener('click', onNext);
    container.querySelector('#goToExams')?.addEventListener('click', goToExams);
    container.querySelector('#finishPractice')?.addEventListener('click', onFinish);
    return;
  }

  const handler = context.registry.getExercise(exercise.type);
  if (!handler) { onNext(); return; }

  const widget = handler.render(exercise, context);

  container.innerHTML = `
    <section class="classes-view">
      <div class="panel-head app-section-head">
        <div>
          <p class="eyebrow">Clase ${String(lessonNum).padStart(2, '0')} · Práctica guiada</p>
          <h2>${escapeHtml(exercise.prompt)}</h2>
        </div>
        <div class="progress-bar-container" style="width:100%;margin-top:0.5rem">
          <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--muted);margin-bottom:0.25rem">
            <span>${step + 1} de ${total}</span>
          </div>
          <progress max="${total}" value="${step + 1}" style="width:100%"></progress>
        </div>
      </div>

      <article class="learning-card focus-card" style="margin-top:0.5rem">
        <div class="tag-row">
          <span class="tag">${escapeHtml(typeLabelMap(exercise.type) || exercise.type)}</span>
          <span class="tag">${escapeHtml(skillLabelMap(exercise.skill) || exercise.skill || '')}</span>
        </div>
        <form id="classPracticeForm" class="exercise-form"></form>
        <div id="classPracticeFeedback"></div>
      </article>
    </section>
  `;

  const form = container.querySelector('#classPracticeForm');
  form.appendChild(widget.element);

  const controls = document.createElement('div');
  controls.className = 'exercise-actions';
  controls.innerHTML = `
    <button type="button" class="secondary" id="classPracticeUnknown">No sé</button>
    <button type="submit" class="primary">Comprobar</button>
  `;
  form.appendChild(controls);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const answer = widget.readAnswer();
    const result = handler.evaluate(answer, exercise, context);
    finishPracticeExercise(container, result, exercise, onNext);
    lockPracticeForm(form);
  });

  container.querySelector('#classPracticeUnknown')?.addEventListener('click', () => {
    finishPracticeExercise(container, {
      correct: false, answer: '', expected: exercise.expected,
      displayExpected: exercise.display_expected || exercise.expected
    }, exercise, onNext);
    lockPracticeForm(form);
  });
}

function finishPracticeExercise(container, result, exercise, onNext) {
  const fb = container.querySelector('#classPracticeFeedback');
  if (!fb) return;
  const title = result.correct ? 'Correcto' : result.option_used === 'no_se' ? 'Registrado como no sabido' : 'Aún no';
  const body = result.correct
    ? 'Bien. Este objetivo se espaciará más y volverá cuando toque.'
    : `${result.feedback ? `${escapeHtml(result.feedback)} ` : ''}Respuesta esperada: ${escapeHtml(result.displayExpected || exercise.expected)}`;
  fb.innerHTML = `
    <div class="feedback-box ${result.correct ? 'correct' : 'wrong'}">
      <strong>${title}</strong>
      <p>${body}</p>
      <button type="button" class="primary" id="classPracticeNext">Continuar</button>
    </div>
  `;
  fb.querySelector('#classPracticeNext')?.addEventListener('click', onNext);
}

function lockPracticeForm(form) {
  if (!form) return;
  form.querySelectorAll('input, textarea, button, select').forEach(el => {
    if (el.id === 'classPracticeNext' || el.id === 'classPracticeUnknown') return;
    el.disabled = true;
  });
}

const typeLabelMap = (type) => ({
  'cloze': 'Completar',
  'text-input': 'Escribir',
  'error-correction': 'Corregir',
  'transform': 'Transformar',
  'multiple-choice': 'Opción múltiple',
  'choice-grid': 'Seleccionar',
  'token-build': 'Construir',
  'production-prompt': 'Producir',
  'dictation': 'Dictado',
  'listen-choice': 'Escuchar y elegir'
}[type] || type);

const skillLabelMap = (skill) => ({
  'production': 'Producción',
  'recognition': 'Reconocimiento',
  'grammar_transfer': 'Gramática',
  'listening': 'Auditiva'
}[skill] || skill);
