import { escapeHtml } from '../../core/utils.js';

export const speakingLabFeature = {
  id: 'speaking-lab',
  label: 'Hablar',
  order: 6,
  navMode: 'secondary',
  mount(container) {
    const futureBlocks = [
      ['Entrada', 'Grabación local de la respuesta oral del alumno.'],
      ['Procesado', 'Transcripción y evaluación por un LLM local, sin enviar audio a servidores externos.'],
      ['Respuesta', 'Feedback estructurado por intención, pronunciación, gramática y vocabulario recuperado.']
    ];
    container.innerHTML = `
      <section class="panel">
        <p class="eyebrow">Experimental · futuro</p>
        <h2>Práctica oral con evaluación local</h2>
        <p class="big-text">Esta sección queda reservada para ejercicios hablados. Todavía no graba, no transcribe y no llama a ningún modelo.</p>
        <div class="grid cards-3">
          ${futureBlocks.map(([title, text]) => `
            <article class="card">
              <strong>${escapeHtml(title)}</strong>
              <span>${escapeHtml(text)}</span>
            </article>
          `).join('')}
        </div>
      </section>
    `;
  }
};
