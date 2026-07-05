import { fetchJsonFile, fetchTextFile, isNotFoundError, parseNdjson, putTextFile, toNdjson } from '../../github-sync.js';
import { escapeHtml } from '../../core/utils.js';

const PROGRESS_PATH = 'data/progress.json';
const REVIEW_QUEUE_PATH = 'data/review-queue.json';

export const syncFeature = {
  id: 'sync',
  label: 'Nube',
  order: 80,
  navMode: 'secondary',
  mount(container, context) {
    const config = context.storage.loadSyncConfig();
    const token = context.storage.getToken();
    container.innerHTML = `
      <section class="sync-view">
        <div class="app-section-head">
          <p class="eyebrow">Repositorio</p>
          <h2>Guardar progreso en GitHub</h2>
        </div>
        <div class="learning-card sync-panel-v2">
          <div class="sync-grid">
            <label>Repositorio <input id="syncRepo" value="${escapeHtml(config.repoFullName)}"></label>
            <label>Rama <input id="syncBranch" value="${escapeHtml(config.branch)}"></label>
            <label>Clave GitHub <input id="syncToken" type="password" value="${escapeHtml(token)}" placeholder="Contents: Read and write"></label>
            <label class="checkbox-row"><input id="rememberToken" type="checkbox" ${localStorage.getItem(context.storage.keys.tokenLocal) ? 'checked' : ''}> Recordar en este navegador</label>
          </div>
          <div class="sync-actions">
            <button type="button" id="syncNow">Sincronizar ahora</button>
            <button type="button" id="loadRemote" class="secondary">Cargar remoto</button>
            <button type="button" id="forgetToken" class="secondary">Olvidar clave</button>
          </div>
          <p id="syncStatus" class="sync-status info">${config.lastSyncAt ? `Último sync: ${new Date(config.lastSyncAt).toLocaleString()}` : 'Sin sincronización todavía.'}</p>
        </div>
      </section>
    `;
    container.querySelector('#syncNow')?.addEventListener('click', () => syncNow(container, context));
    container.querySelector('#loadRemote')?.addEventListener('click', () => loadRemote(container, context));
    container.querySelector('#forgetToken')?.addEventListener('click', () => {
      context.storage.forgetToken();
      context.showFeature('sync');
    });
  }
};

async function syncNow(container, context) {
  const options = readOptions(container, context);
  const status = container.querySelector('#syncStatus');
  setStatus(status, 'Sincronizando...', 'info');
  try {
    const progress = context.learner.getProgress();
    const events = context.eventLog.all();
    await putJson(options, PROGRESS_PATH, progress, 'Sync learning progress');
    for (const [date, dateEvents] of Object.entries(groupEventsByDate(events))) {
      const path = `data/events/${date}.ndjson`;
      const remote = await readRemoteText(options, path);
      const merged = mergeEvents(parseNdjson(remote.content || ''), dateEvents);
      await putTextFile({ ...options, path, sha: remote.sha, content: toNdjson(merged), message: `Sync learning events ${date}` });
    }
    await putJson(options, REVIEW_QUEUE_PATH, buildReviewQueue(context), 'Sync review queue');
    context.storage.saveSyncConfig({ repoFullName: options.repoFullName, branch: options.branch, lastSyncAt: new Date().toISOString() });
    setStatus(status, 'Sincronización completada.', 'ok');
  } catch (error) {
    setStatus(status, error.message, 'error');
  }
}

async function loadRemote(container, context) {
  const options = readOptions(container, context);
  const status = container.querySelector('#syncStatus');
  setStatus(status, 'Cargando remoto...', 'info');
  try {
    const remote = await fetchJsonFile({ ...options, path: PROGRESS_PATH });
    context.storage.saveProgress({ ...context.learner.getProgress(), ...(remote.data || {}) });
    setStatus(status, 'Progreso remoto cargado. Recargando...', 'ok');
    window.setTimeout(() => location.reload(), 700);
  } catch (error) {
    setStatus(status, error.message, 'error');
  }
}

function readOptions(container, context) {
  const repoFullName = container.querySelector('#syncRepo')?.value.trim() || 'Paruski/paruski';
  const branch = container.querySelector('#syncBranch')?.value.trim() || 'main';
  const secret = container.querySelector('#syncToken')?.value.trim();
  const remember = container.querySelector('#rememberToken')?.checked;
  context.storage.saveSyncConfig({ repoFullName, branch });
  context.storage.saveToken(secret, remember);
  if (!secret) throw new Error('Introduce una clave de GitHub para escribir en el repositorio.');
  return { repoFullName, branch, secret };
}

async function putJson(options, path, data, message) {
  const remote = await fetchJsonFile({ ...options, path }).catch(error => {
    if (isNotFoundError(error)) return { sha: null, data: null };
    throw error;
  });
  return putTextFile({
    ...options,
    path,
    sha: remote.sha,
    content: JSON.stringify(data, null, 2) + '\n',
    message
  });
}

async function readRemoteText(options, path) {
  return fetchTextFile({ ...options, path }).catch(error => {
    if (isNotFoundError(error)) return { content: '', sha: null };
    throw error;
  });
}

function groupEventsByDate(events) {
  return (events || []).reduce((groups, event) => {
    const date = String(event.timestamp || new Date().toISOString()).slice(0, 10);
    groups[date] = groups[date] || [];
    groups[date].push(event);
    return groups;
  }, {});
}

function mergeEvents(remote, local) {
  const map = new Map();
  [...(remote || []), ...(local || [])].forEach(event => map.set(event.event_id, event));
  return [...map.values()].sort((left, right) => String(left.timestamp).localeCompare(String(right.timestamp)));
}

function buildReviewQueue(context) {
  return {
    version: 2,
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

function setStatus(node, message, kind) {
  if (!node) return;
  node.textContent = message;
  node.className = `sync-status ${kind}`;
}
