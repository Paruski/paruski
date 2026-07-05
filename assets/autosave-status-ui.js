const AUTO_KEYS = {
  progress: 'paruski.progress.v1',
  events: 'paruski.events.v1',
  sync: 'paruski.githubSync.v1',
  sessionSecret: 'paruski.githubKey.session',
  localSecret: 'paruski.githubKey.local',
  enabled: 'paruski.githubSync.autosync.v1',
  loaded: 'paruski.githubSync.loadedThisSession.v1'
};

let lastAutoSignature = '';
let autoTimer = null;

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initAutosaveStatus);
} else {
  initAutosaveStatus();
}

function initAutosaveStatus() {
  injectAutoStyles();
  mountAutoStatus();
  bindAutoControls();
  refreshAutoStatus();
  lastAutoSignature = progressSignature();
  maybeLoadRemoteOnce();
  window.setInterval(checkForAutoSync, 8000);
  window.setInterval(refreshAutoStatus, 5000);
}

function mountAutoStatus() {
  const settings = document.querySelector('#settings .panel');
  if (settings && !document.getElementById('autoStatusBox')) {
    const box = document.createElement('section');
    box.id = 'autoStatusBox';
    box.className = 'auto-status-box';
    box.innerHTML = '<h3>Autoguardado y sincronización</h3><p class="muted small">El progreso se guarda en el navegador al responder, cambiar estado o importar datos. Si configuras GitHub, se puede sincronizar automáticamente.</p><div class="auto-grid"><div><strong>Navegador</strong><p id="autoLocalText" class="muted">Comprobando...</p></div><div><strong>GitHub</strong><p id="autoRemoteText" class="muted">Comprobando...</p></div></div><label class="checkbox-row"><input id="autoSyncEnabled" type="checkbox"> Autosync con GitHub si hay clave guardada</label><div class="auto-actions"><button type="button" id="autoSyncNow" class="secondary">Sincronizar ahora</button><button type="button" id="autoLoadRemote" class="secondary">Cargar remoto</button></div>';
    const syncBox = document.getElementById('githubSyncBox');
    settings.insertBefore(box, syncBox?.nextSibling || settings.firstChild);
  }
  const dashboard = document.getElementById('dashboard');
  if (dashboard && !document.getElementById('autoDashboardBox')) {
    const box = document.createElement('section');
    box.id = 'autoDashboardBox';
    box.className = 'panel auto-dashboard-box';
    box.innerHTML = '<div class="panel-head"><div><h2>Guardado automático</h2><p id="autoDashboardText" class="muted">Comprobando...</p></div><button type="button" id="autoDashboardSync" class="secondary">Sincronizar</button></div>';
    const ref = document.getElementById('simpleHomePanel') || dashboard.querySelector('.panel');
    dashboard.insertBefore(box, ref?.nextSibling || null);
  }
}

function bindAutoControls() {
  const enabled = document.getElementById('autoSyncEnabled');
  if (enabled) {
    enabled.checked = localStorage.getItem(AUTO_KEYS.enabled) !== '0';
    enabled.addEventListener('change', () => {
      localStorage.setItem(AUTO_KEYS.enabled, enabled.checked ? '1' : '0');
      refreshAutoStatus();
    });
  }
  document.getElementById('autoSyncNow')?.addEventListener('click', () => clickSync('syncNowBtn'));
  document.getElementById('autoDashboardSync')?.addEventListener('click', () => clickSync('syncNowBtn'));
  document.getElementById('autoLoadRemote')?.addEventListener('click', () => clickSync('syncLoadBtn'));
  document.getElementById('syncKeyInput')?.addEventListener('change', () => window.setTimeout(() => {
    refreshAutoStatus();
    maybeLoadRemoteOnce(true);
  }, 500));
}

function maybeLoadRemoteOnce(force = false) {
  if (!hasSecret()) return;
  if (!force && sessionStorage.getItem(AUTO_KEYS.loaded)) return;
  sessionStorage.setItem(AUTO_KEYS.loaded, '1');
  window.setTimeout(() => clickSync('syncLoadBtn'), 1200);
}

function checkForAutoSync() {
  if (localStorage.getItem(AUTO_KEYS.enabled) === '0') return;
  if (!hasSecret()) return;
  const next = progressSignature();
  if (!next || next === lastAutoSignature) return;
  lastAutoSignature = next;
  window.clearTimeout(autoTimer);
  autoTimer = window.setTimeout(() => clickSync('syncNowBtn'), 4000);
}

function refreshAutoStatus() {
  const progress = readJson(AUTO_KEYS.progress, {});
  const events = readJson(AUTO_KEYS.events, []);
  const sync = readJson(AUTO_KEYS.sync, {});
  const eventCount = Array.isArray(events) ? events.length : 0;
  const updated = progress.updated_at || progress.user?.created_at;
  const local = updated ? 'Guardado local: ' + new Date(updated).toLocaleString() + ' · ' + eventCount + ' evento(s).' : 'Progreso local preparado · ' + eventCount + ' evento(s).';
  const remote = hasSecret() ? 'GitHub configurado · último sync: ' + (sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleString() : 'pendiente') + '.' : 'GitHub no configurado: el progreso queda en este navegador.';
  text('autoLocalText', local);
  text('autoRemoteText', remote);
  text('autoDashboardText', local + ' ' + (hasSecret() ? 'Autosync disponible.' : 'Puedes añadir GitHub en Datos.'));
}

function clickSync(id) {
  const button = document.getElementById(id);
  if (button) button.click();
}

function progressSignature() {
  return (localStorage.getItem(AUTO_KEYS.progress) || '') + '\n' + (localStorage.getItem(AUTO_KEYS.events) || '');
}
function hasSecret() { return Boolean(sessionStorage.getItem(AUTO_KEYS.sessionSecret) || localStorage.getItem(AUTO_KEYS.localSecret)); }
function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
function text(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
function injectAutoStyles() { if (document.getElementById('autoStatusStyles')) return; const style = document.createElement('style'); style.id = 'autoStatusStyles'; style.textContent = '.auto-status-box{margin:1rem 0;padding:1rem;border:1px solid var(--line);border-radius:1rem;background:rgba(255,255,255,.03)}.auto-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.75rem}.auto-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.75rem}.auto-dashboard-box{border-color:rgba(34,197,94,.35)}'; document.head.appendChild(style); }
