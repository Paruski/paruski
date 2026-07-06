import { escapeHtml, normalizeText } from '../../core/utils.js';

export const libraryFeature = {
  id: 'library',
  label: 'Biblioteca',
  order: 20,
  navMode: 'secondary',
  mount(container, context) {
    let kind = 'all';
    let showLocked = false;
    let query = '';

    function render() {
      container.innerHTML = `
        <section class="library-view">
          <div class="panel-head app-section-head">
            <div>
              <p class="eyebrow">Consulta</p>
              <h2>Biblioteca desbloqueada</h2>
            </div>
            <input id="librarySearch" type="search" placeholder="Buscar ruso, traducción, estructura o explicación" value="${escapeHtml(query)}" />
          </div>
          <div class="library-toolbar">
            <button type="button" data-kind="all" class="${kind === 'all' ? 'active-filter' : 'secondary'}">Todo</button>
            <button type="button" data-kind="vocabulary" class="${kind === 'vocabulary' ? 'active-filter' : 'secondary'}">Vocabulario</button>
            <button type="button" data-kind="grammar" class="${kind === 'grammar' ? 'active-filter' : 'secondary'}">Gramática</button>
            <label class="checkbox-row"><input id="showLocked" type="checkbox" ${showLocked ? 'checked' : ''}> Mostrar bloqueado</label>
          </div>
          <div class="library-grid">
          </div>
        </section>
      `;
      container.querySelector('#librarySearch')?.addEventListener('input', event => {
        query = event.target.value;
        renderResults();
      });
      container.querySelector('#showLocked')?.addEventListener('change', event => {
        showLocked = event.target.checked;
        render();
      });
      container.querySelectorAll('[data-kind]').forEach(button => button.addEventListener('click', () => {
        kind = button.dataset.kind;
        render();
      }));
      renderResults();
    }

    function renderResults() {
      const box = container.querySelector('.library-grid');
      if (!box) return;
      const targets = context.content.state.targets.filter(target => targetMatches(target, context, { showLocked, kind, query }));
      box.innerHTML = targets.map(target => renderTarget(target, context)).join('') || '<p class="empty">No hay resultados.</p>';
      box.querySelectorAll('[data-speak]').forEach(button => button.addEventListener('click', () => {
        context.notify?.('');
        context.audio.speak(button.dataset.speak, { requireRecorded: true }).then(ok => {
          if (!ok) context.notify?.('Ese audio grabado aún no está disponible.');
        });
      }));
    }

    render();
  }
};

function targetMatches(target, context, filters) {
  if (!filters.showLocked && !context.learner.isTargetUnlocked(target)) return false;
  if (filters.kind !== 'all' && target.kind !== filters.kind) return false;
  const card = context.content.getCard(target);
  const lesson = context.content.getLesson(target.lesson);
  const examples = context.content.getExamplesForTarget(target);
  const haystack = normalizeText([
    target.text,
    target.translation,
    target.level_title,
    lesson?.title,
    lesson?.summary,
    card?.translation,
    card?.short_explanation,
    card?.transcription,
    card?.stress_syllable,
    ...(target.tags || []),
    ...examples
  ].join(' '));
  const needle = normalizeText(filters.query);
  return !needle || haystack.includes(needle);
}

function renderTarget(target, context) {
  const card = context.content.getCard(target);
  const unlocked = context.learner.isTargetUnlocked(target);
  const examples = context.content.getExamplesForTarget(target).slice(0, 2);
  const hasAudio = context.audio.hasRecorded(target.text);
  return `
    <article class="library-card ${unlocked ? '' : 'locked'}">
      <div class="card-topline">
        <span class="tag">${target.kind === 'grammar' ? 'gramática' : 'vocabulario'}</span>
        <span class="tag">Clase ${String(target.lesson).padStart(2, '0')}</span>
      </div>
      <h3>${escapeHtml(target.text)}</h3>
      <p class="muted">${escapeHtml(card?.translation || target.translation || 'Traducción pendiente')}</p>
      <dl class="mini-facts">
        <div><dt>Transcripción</dt><dd>${escapeHtml(card?.transcription || 'Pendiente')}</dd></div>
        <div><dt>Tónica</dt><dd>${escapeHtml(card?.stress_syllable || 'Pendiente')}</dd></div>
      </dl>
      <p>${escapeHtml(card?.short_explanation || target.explanation || '')}</p>
      ${examples.length ? `<ul>${examples.map(example => `<li>${escapeHtml(example)}</li>`).join('')}</ul>` : ''}
      ${hasAudio ? `<button type="button" class="secondary" data-speak="${escapeHtml(target.text)}">Escuchar</button>` : '<p class="muted small">Audio pendiente.</p>'}
    </article>
  `;
}
