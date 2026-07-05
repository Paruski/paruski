import { dayKey, escapeHtml } from '../../core/utils.js';

const PROGRESS_PATH = 'data/progress.json';
const REVIEW_QUEUE_PATH = 'data/review-queue.json';

export const syncFeature = {
  id: 'sync',
  label: 'Nube',
  order: 80,
  navMode: 'secondary',
  mount(container, context) {
    const config = context.storage.loadSyncConfig();
    const events = context.eventLog.all();
    const today = todayKey();
    container.innerHTML = `
      <section class="sync-view">
        <div class="app-section-head">
          <p class="eyebrow">Repositorio</p>
          <h2>Exportar progreso sin claves</h2>
        </div>
        <div class="learning-card sync-panel-v2">
          <p class="big-text">Paruski no guarda tokens ni claves de GitHub en el navegador. El progreso se queda local y, cuando quieras versionarlo, puedes descargar archivos listos para subirlos manualmente al repositorio.</p>
          <div class="sync-grid">
            <label>Repositorio <input id="syncRepo" value="${escapeHtml(config.repoFullName)}" autocomplete="off" spellcheck="false"></label>
            <label>Rama <input id="syncBranch" value="${escapeHtml(config.branch)}" autocomplete="off" spellcheck="false"></label>
          </div>
          <div class="sync-paths" aria-label="Rutas sugeridas en el repositorio">
            ${pathRow(PROGRESS_PATH, 'estado agregado')}
            ${pathRow(`data/events/${today}.ndjson`, `${eventsForDate(events, today).length} evento(s) de hoy`)}
            ${pathRow(REVIEW_QUEUE_PATH, 'cola de repaso calculada')}
          </div>
          <div class="sync-actions">
            <button type="button" id="downloadProgress">Descargar progreso</button>
            <button type="button" id="downloadTodayEvents" class="secondary">Descargar eventos de hoy</button>
            <button type="button" id="downloadAllEvents" class="secondary">Descargar todos los eventos</button>
            <button type="button" id="downloadQueue" class="secondary">Descargar cola de repaso</button>
          </div>
          <div class="sync-actions">
            <button type="button" id="importProgress" class="secondary">Importar progreso JSON</button>
            <input id="importProgressFile" type="file" accept="application/json,.json" hidden>
          </div>
          <p id="syncStatus" class="sync-status info">Guardado local activo. ${config.lastSyncAt ? `Última exportación: ${escapeHtml(new Date(config.lastSyncAt).toLocaleString())}.` : 'Sin exportación manual registrada todavía.'}</p>
        </div>
      </section>
    `;

    container.querySelector('#downloadProgress')?.addEventListener('click', () => downloadProgress(container, context));
    container.querySelector('#downloadTodayEvents')?.addEventListener('click', () => downloadTodayEvents(container, context));
    container.querySelector('#downloadAllEvents')?.addEventListener('click', () => downloadAllEvents(container, context));
    container.querySelector('#downloadQueue')?.addEventListener('click', () => downloadReviewQueue(container, context));
    container.querySelector('#importProgress')?.addEventListener('click', () => container.querySelector('#importProgressFile')?.click());
    container.querySelector('#importProgressFile')?.addEventListener('change', event => importProgress(event, container, context));
  }
};

function downloadProgress(container, context) {
  const options = readOptions(container, context);
  const progress = context.learner.getProgress();
  context.storage.downloadJson('progress.json', progress);
  markExported(context, container, `Descargado ${PROGRESS_PATH}. Súbelo manualmente a ${options.repoFullName}:${options.branch}.`);
}

function downloadTodayEvents(container, context) {
  const options = readOptions(container, context);
  const today = todayKey();
  const events = eventsForDate(context.eventLog.all(), today);
  context.storage.downloadText(`events-${today}.ndjson`, toNdjson(events), 'application/x-ndjson');
  markExported(context, container, `Descargado data/events/${today}.ndjson para ${options.repoFullName}:${options.branch}.`);
}

function downloadAllEvents(container, context) {
  readOptions(container, context);
  const events = context.eventLog.all();
  context.storage.downloadText('events-all.ndjson', toNdjson(events), 'application/x-ndjson');
  markExported(context, container, `Descargados ${events.length} evento(s) en NDJSON. Divide por fecha si quieres mantener data/events/YYYY-MM-DD.ndjson.`);
}

function downloadReviewQueue(container, context) {
  const options = readOptions(container, context);
  context.storage.downloadJson('review-queue.json', buildReviewQueue(context));
  markExported(context, container, `Descargado ${REVIEW_QUEUE_PATH}. Súbelo manualmente a ${options.repoFullName}:${options.branch}.`);
}

async function importProgress(event, container, context) {
  const status = container.querySelector('#syncStatus');
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== 'object') throw new Error('El archivo no contiene un objeto JSON de progreso.');
    context.storage.saveProgress({ ...context.learner.getProgress(), ...data });
    setStatus(status, 'Progreso importado. Recargando la app...', 'ok');
    window.setTimeout(() => location.reload(), 700);
  } catch (error) {
    setStatus(status, error.message || 'No se pudo importar el progreso.', 'error');
  } finally {
    event.target.value = '';
  }
}

function readOptions(container, context) {
  const repoFullName = container.querySelector('#syncRepo')?.value.trim() || 'Paruski/paruski';
  const branch = container.querySelector('#syncBranch')?.value.trim() || 'main';
  context.storage.saveSyncConfig({ repoFullName, branch });
  return { repoFullName, branch };
}

function markExported(context, container, message) {
  const config = context.storage.loadSyncConfig();
  context.storage.saveSyncConfig({ ...config, lastSyncAt: new Date().toISOString() });
  setStatus(container.querySelector('#syncStatus'), message, 'ok');
}

function buildReviewQueue(context) {
  return {
    version: 3,
    updated_at: new Date().toISOString(),
    due: context.learner.dueTargets().slice(0, 40).map(target => ({
      target_id: target.id,
      lesson: target.lesson,
      text: target.text,
      kind: target.kind,
      state: context.learner.getTargetState(target.id)
    }))
  };
}

function eventsForDate(events, date) {
  return (events || []).filter(event => dayKey(event.timestamp) === date);
}

function todayKey() {
  return dayKey(new Date());
}

function toNdjson(records) {
  const lines = (records || []).map(record => JSON.stringify(record));
  return lines.length ? `${lines.join('\n')}\n` : '';
}

function pathRow(path, note) {
  return `<div><code>${escapeHtml(path)}</code><span>${escapeHtml(note)}</span></div>`;
}

function setStatus(node, message, kind) {
  if (!node) return;
  node.textContent = message;
  node.className = `sync-status ${kind}`;
}
