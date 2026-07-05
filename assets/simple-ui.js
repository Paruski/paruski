if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initSimpleUi);
} else {
  initSimpleUi();
}

function initSimpleUi() {
  injectSimpleStyles();
  mountSimpleHome();
  mountFocusToggle();
}

function mountSimpleHome() {
  const dashboard = document.getElementById('dashboard');
  if (!dashboard || document.getElementById('simpleHomePanel')) return;
  const panel = document.createElement('section');
  panel.id = 'simpleHomePanel';
  panel.className = 'panel simple-home';
  panel.innerHTML = '<div class="simple-hero"><div><p class="eyebrow">Ruta rápida</p><h2>Aprende ruso en 4 pasos</h2><p class="muted">Empieza por leer una clase, estudia las palabras, practica y revisa tus errores. Todo funciona gratis y local-first.</p></div><button type="button" id="simpleStartBtn">Empezar ahora</button></div><div class="simple-steps"><button type="button" data-simple-view="learning"><strong>1. Aprender</strong><span>Ver vocabulario, gramática, definiciones y ejemplos.</span></button><button type="button" data-simple-view="review"><strong>2. Practicar</strong><span>Ejercicios normales y práctica generada.</span></button><button type="button" data-simple-view="errors"><strong>3. Corregir</strong><span>Ver errores recurrentes y repetir.</span></button><button type="button" data-simple-view="settings"><strong>4. Guardar</strong><span>Exportar o sincronizar progreso.</span></button></div>';
  dashboard.prepend(panel);
  panel.querySelector('#simpleStartBtn')?.addEventListener('click', () => go('learning'));
  panel.querySelectorAll('[data-simple-view]').forEach(button => button.addEventListener('click', () => go(button.dataset.simpleView)));
}

function mountFocusToggle() {
  if (document.getElementById('simpleFocusToggle')) return;
  const button = document.createElement('button');
  button.id = 'simpleFocusToggle';
  button.type = 'button';
  button.className = 'secondary simple-focus-toggle';
  button.textContent = localStorage.getItem('paruski.simpleMode') === '1' ? 'Ver todo' : 'Modo simple';
  document.body.appendChild(button);
  applySimpleMode();
  button.addEventListener('click', () => {
    const next = localStorage.getItem('paruski.simpleMode') === '1' ? '0' : '1';
    localStorage.setItem('paruski.simpleMode', next);
    button.textContent = next === '1' ? 'Ver todo' : 'Modo simple';
    applySimpleMode();
  });
}

function applySimpleMode() {
  const enabled = localStorage.getItem('paruski.simpleMode') === '1';
  document.body.classList.toggle('simple-mode', enabled);
}

function go(view) {
  const tab = document.querySelector('[data-view="' + view + '"]');
  if (tab) tab.click();
  else document.getElementById(view)?.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function injectSimpleStyles() {
  if (document.getElementById('simpleUiStyles')) return;
  const style = document.createElement('style');
  style.id = 'simpleUiStyles';
  style.textContent = '.simple-home{border-color:rgba(34,197,94,.35)}.simple-hero{display:flex;align-items:center;justify-content:space-between;gap:1rem}.simple-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem;margin-top:1rem}.simple-steps button{display:grid;gap:.35rem;text-align:left;background:rgba(255,255,255,.04);border-color:var(--line)}.simple-steps span{color:var(--muted);font-size:.9rem}.simple-focus-toggle{position:fixed;right:1rem;bottom:1rem;z-index:20;box-shadow:var(--shadow)}.simple-mode #statsCards,.simple-mode #recentEvents,.simple-mode #errorSummary,.simple-mode .code-grid{max-height:22rem;overflow:auto}.simple-mode .top-actions{opacity:.75}.simple-mode .tabs{gap:.35rem}.simple-mode .tab:not([data-view="dashboard"]):not([data-view="learning"]):not([data-view="review"]):not([data-view="errors"]):not([data-view="settings"]){display:none}@media(max-width:900px){.simple-hero{align-items:flex-start;flex-direction:column}.simple-steps{grid-template-columns:1fr}}';
  document.head.appendChild(style);
}
