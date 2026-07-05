export const settingsFeature = {
  id: 'settings',
  label: 'Datos',
  order: 90,
  navMode: 'secondary',
  mount(container, context) {
    container.innerHTML = `
      <section class="settings-view">
        <div class="app-section-head">
          <p class="eyebrow">Datos locales</p>
          <h2>Exportar, importar y reiniciar</h2>
        </div>
        <div class="learning-card">
          <div class="settings-actions">
            <button type="button" id="exportProgress">Exportar progreso</button>
            <button type="button" id="exportEvents" class="secondary">Exportar eventos</button>
            <label class="import-label secondary">Importar progreso <input id="importProgress" type="file" accept="application/json"></label>
            <button type="button" id="resetLocal" class="danger">Borrar local</button>
          </div>
          <div class="code-grid">
            <div><h3>progress.json</h3><pre id="progressPreview"></pre></div>
            <div><h3>events.json</h3><pre id="eventsPreview"></pre></div>
          </div>
        </div>
      </section>
    `;
    container.querySelector('#progressPreview').textContent = JSON.stringify(context.learner.getProgress(), null, 2).slice(0, 6000);
    container.querySelector('#eventsPreview').textContent = JSON.stringify(context.eventLog.all(), null, 2).slice(0, 6000);
    container.querySelector('#exportProgress')?.addEventListener('click', () => context.storage.downloadJson('progress.json', context.learner.getProgress()));
    container.querySelector('#exportEvents')?.addEventListener('click', () => context.storage.downloadJson('events.json', context.eventLog.all()));
    container.querySelector('#resetLocal')?.addEventListener('click', () => {
      if (!confirm('¿Borrar progreso local de este navegador?')) return;
      context.storage.resetLocal();
      location.reload();
    });
    container.querySelector('#importProgress')?.addEventListener('change', event => importProgress(event, context));
  }
};

function importProgress(event, context) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const progress = JSON.parse(String(reader.result || '{}'));
      context.storage.saveProgress(progress);
      location.reload();
    } catch {
      alert('No se pudo importar el JSON.');
    }
  };
  reader.readAsText(file);
}
