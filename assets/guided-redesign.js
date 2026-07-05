const GUIDED_KEYS = {
  progress: 'paruski.progress.v1',
  events: 'paruski.events.v1',
  drills: 'paruski.generatedDrills.v1',
  journal: 'paruski.journal.v1'
};

const DEFAULT_GUIDED_CONTENT = {
  hero: {
    eyebrow: 'Sesión de hoy',
    title: 'Un paso pequeño, ruso real.',
    subtitle: 'Trabaja 10 minutos: entiende una idea, recupérala sin mirar, produce ruso, corrige el error y deja que el repaso vuelva cuando toque.',
    primaryAction: 'Empezar práctica',
    secondaryAction: 'Aprender antes',
    progressAction: 'Ver progreso'
  },
  today: {
    title: 'Objetivo recomendado',
    duration: '10 minutos',
    text: 'Una sesión buena tiene pocas piezas, respuesta activa y feedback inmediato.',
    promise: 'Al terminar deberías recordar algo sin mirar.'
  },
  journey: [
    { step: 1, title: 'Entiende', body: 'Lee una explicación corta y escucha ejemplos.', action: 'Aprender', view: 'learning' },
    { step: 2, title: 'Recuerda', body: 'Haz ejercicios sin mirar la respuesta.', action: 'Practicar', view: 'review' },
    { step: 3, title: 'Corrige', body: 'Repite la forma correcta y deja programado el repaso.', action: 'Seguimiento', view: 'tracking' }
  ],
  sessionRecipe: { title: 'Qué hacer ahora', items: ['Escucha 3 ejemplos rusos.', 'Escribe 5 respuestas sin mirar.', 'Corrige los fallos copiando la forma correcta.', 'Para antes de saturarte.'] },
  principles: [
    { tag: 'ciencia', title: 'Recuperación', body: 'Recordar fortalece más que releer.' },
    { tag: 'memoria', title: 'Espaciado', body: 'Lo difícil vuelve antes; lo sabido espera.' },
    { tag: 'uso', title: 'Producción', body: 'Escribes y escuchas ruso real.' },
    { tag: 'mezcla', title: 'Intercalado', body: 'No haces siempre el mismo tipo.' },
    { tag: 'feedback', title: 'Corrección', body: 'Cada error indica qué repasar.' }
  ],
  qualityChecklist: { title: 'Una práctica buena se nota así', items: ['Piensas en ruso, no en números de clase.', 'Trabajas con frases reales.', 'Ves la forma esperada.', 'El error queda registrado.', 'La sesión es corta y acabable.'] }
};

let guidedContent = DEFAULT_GUIDED_CONTENT;

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initGuidedRedesign);
} else {
  initGuidedRedesign();
}

async function initGuidedRedesign() {
  guidedContent = await loadGuidedContent();
  document.body.classList.add('guided-redesign');
  rewriteHeader();
  mountGuidedNav();
  mountGuidedHome();
  refreshGuidedHome();
  window.setInterval(refreshGuidedHome, 10000);
}

async function loadGuidedContent() {
  try {
    const response = await fetch('content/guided-path.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('guided path');
    return { ...DEFAULT_GUIDED_CONTENT, ...(await response.json()) };
  } catch {
    return DEFAULT_GUIDED_CONTENT;
  }
}

function rewriteHeader() {
  const title = document.querySelector('.topbar h1');
  const subtitle = document.querySelector('.topbar .muted');
  if (title) title.textContent = 'Aprende ruso paso a paso';
  if (subtitle) subtitle.textContent = 'Una ruta guiada: entiende, recuerda, produce, recibe feedback y repasa en el momento adecuado.';
}

function mountGuidedNav() {
  if (document.getElementById('guidedNav')) return;
  const nav = document.createElement('nav');
  nav.id = 'guidedNav';
  nav.className = 'guided-nav';
  nav.setAttribute('aria-label', 'Ruta de aprendizaje');
  nav.innerHTML = [
    navButton('dashboard', 'Hoy'),
    navButton('learning', 'Aprender'),
    navButton('review', 'Practicar'),
    navButton('tracking', 'Progreso'),
    navButton('method', 'Método'),
    '<div class="guided-more-wrap"><button type="button" id="guidedMoreBtn" class="secondary">Más</button><div class="guided-hidden-links"><button type="button" data-guided-view="vocabulary">Vocabulario</button><button type="button" data-guided-view="grammar">Gramática</button><button type="button" data-guided-view="errors">Errores</button><button type="button" data-guided-view="settings">Datos</button><button type="button" data-guided-view="faq">FAQ</button></div></div>'
  ].join('');
  document.querySelector('.tabs')?.after(nav);
  nav.addEventListener('click', event => {
    const more = event.target.closest?.('#guidedMoreBtn');
    if (more) {
      more.closest('.guided-more-wrap')?.classList.toggle('open');
      return;
    }
    const button = event.target.closest?.('[data-guided-view]');
    if (!button) return;
    goToView(button.dataset.guidedView);
    document.querySelector('.guided-more-wrap')?.classList.remove('open');
  });
}

function navButton(view, label) {
  return '<button type="button" data-guided-view="' + view + '">' + label + '</button>';
}

function mountGuidedHome() {
  const dashboard = document.getElementById('dashboard');
  if (!dashboard || document.getElementById('guidedShell')) return;
  const shell = document.createElement('section');
  shell.id = 'guidedShell';
  shell.className = 'guided-shell';
  shell.innerHTML = renderHero() + renderJourney() + '<div id="guidedProgressRow" class="guided-progress-row"></div>' + renderSessionRecipe() + renderPrinciples() + renderQualityChecklist();
  dashboard.prepend(shell);
  shell.addEventListener('click', event => {
    const button = event.target.closest?.('[data-guided-view]');
    if (button) goToView(button.dataset.guidedView);
  });
}

function renderHero() {
  const hero = guidedContent.hero || DEFAULT_GUIDED_CONTENT.hero;
  const today = guidedContent.today || DEFAULT_GUIDED_CONTENT.today;
  return '<div class="guided-hero"><article class="guided-card-main"><p class="eyebrow">' + safe(hero.eyebrow) + '</p><h2>' + safe(hero.title) + '</h2><p class="muted">' + safe(hero.subtitle) + '</p><div class="guided-actions"><button type="button" class="guided-primary" data-guided-view="review">' + safe(hero.primaryAction) + '</button><button type="button" class="secondary" data-guided-view="learning">' + safe(hero.secondaryAction) + '</button><button type="button" class="secondary" data-guided-view="tracking">' + safe(hero.progressAction) + '</button></div></article><aside class="guided-card-side"><h3>' + safe(today.title) + '</h3><p class="guided-duration">' + safe(today.duration) + '</p><p class="muted">' + safe(today.text) + '</p><p class="muted"><strong>' + safe(today.promise) + '</strong></p><div id="guidedTodayStats"></div></aside></div>';
}

function renderJourney() {
  const steps = guidedContent.journey || DEFAULT_GUIDED_CONTENT.journey;
  return '<div class="guided-plan">' + steps.map(step => '<article class="guided-step"><span class="step-number">' + safe(step.step) + '</span><strong>' + safe(step.title) + '</strong><p class="muted">' + safe(step.body) + '</p><button type="button" class="secondary" data-guided-view="' + safe(step.view) + '">' + safe(step.action) + '</button></article>').join('') + '</div>';
}

function renderSessionRecipe() {
  const recipe = guidedContent.sessionRecipe || DEFAULT_GUIDED_CONTENT.sessionRecipe;
  return '<section class="guided-recipe"><div><p class="eyebrow">micro-sesión</p><h2>' + safe(recipe.title) + '</h2></div><ol>' + (recipe.items || []).map(item => '<li>' + safe(item) + '</li>').join('') + '</ol></section>';
}

function renderPrinciples() {
  const principles = guidedContent.principles || DEFAULT_GUIDED_CONTENT.principles;
  return '<section class="guided-principles">' + principles.map(item => '<article class="guided-principle"><span class="tag">' + safe(item.tag) + '</span><h3>' + safe(item.title) + '</h3><p class="muted">' + safe(item.body) + '</p></article>').join('') + '</section>';
}

function renderQualityChecklist() {
  const checklist = guidedContent.qualityChecklist || DEFAULT_GUIDED_CONTENT.qualityChecklist;
  return '<section class="guided-checklist"><div><p class="eyebrow">calidad</p><h2>' + safe(checklist.title) + '</h2></div><ul>' + (checklist.items || []).map(item => '<li>' + safe(item) + '</li>').join('') + '</ul></section>';
}

function refreshGuidedHome() {
  const statsBox = document.getElementById('guidedTodayStats');
  const row = document.getElementById('guidedProgressRow');
  if (!statsBox || !row) return;
  const progress = readJson(GUIDED_KEYS.progress, {});
  const events = readJson(GUIDED_KEYS.events, []);
  const practice = events.filter(event => event.skill !== 'estado');
  const today = dayKey(new Date());
  const todayEvents = practice.filter(event => dayKey(new Date(event.timestamp)) === today);
  const correct = todayEvents.filter(event => event.correct).length;
  const accuracy = todayEvents.length ? Math.round(correct / todayEvents.length * 100) : 0;
  const streak = calcStreak(practice);
  const drillStats = readJson(GUIDED_KEYS.drills, {});
  const due = Object.values(drillStats).filter(item => !item.due || item.due <= today).length;
  statsBox.innerHTML = '<div class="guided-mini-card"><div class="value">' + todayEvents.length + '</div><div class="label">respuestas hoy</div></div><div class="guided-mini-card"><div class="value">' + accuracy + '%</div><div class="label">precisión hoy</div></div>';
  row.innerHTML = [
    mini('Racha', streak + ' día(s)'),
    mini('Pendientes', due),
    mini('Items trabajados', Object.keys(progress.items || {}).length),
    mini('Eventos totales', practice.length)
  ].join('');
}

function mini(label, value) {
  return '<article class="guided-mini-card"><div class="value">' + safe(value) + '</div><div class="label">' + safe(label) + '</div></article>';
}

function goToView(view) {
  const tab = document.querySelector('.tab[data-view="' + view + '"]');
  if (tab) tab.click();
  else {
    document.querySelectorAll('.tab').forEach(item => item.classList.toggle('active', item.dataset.view === view));
    document.querySelectorAll('.view').forEach(item => item.classList.toggle('active', item.id === view));
  }
  document.querySelectorAll('#guidedNav [data-guided-view]').forEach(item => item.classList.toggle('active', item.dataset.guidedView === view));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function calcStreak(events) {
  const days = new Set(events.map(event => dayKey(new Date(event.timestamp))));
  let cursor = new Date();
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}

function dayKey(date) {
  if (Number.isNaN(date.getTime())) return '';
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function safe(value) {
  return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
