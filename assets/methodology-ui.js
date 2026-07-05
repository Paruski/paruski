if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initMethodologyUi);
} else {
  initMethodologyUi();
}

function initMethodologyUi() {
  injectMethodStyles();
  addMethodTab();
}

function addMethodTab() {
  if (document.getElementById('method')) return;
  const tabs = document.querySelector('.tabs');
  const main = document.querySelector('main');
  if (!tabs || !main) return;
  const tab = document.createElement('button');
  tab.className = 'tab';
  tab.dataset.view = 'method';
  tab.textContent = 'Método';
  tab.addEventListener('click', () => show('method'));
  const reviewTab = document.querySelector('[data-view="review"]');
  tabs.insertBefore(tab, reviewTab?.nextSibling || null);
  const section = document.createElement('section');
  section.id = 'method';
  section.className = 'view';
  section.innerHTML = '<div class="panel method-panel"><div class="panel-head"><div><h2>Método de aprendizaje</h2><p class="muted">La web está pensada para aprender ruso con práctica activa, no sólo para leer listas.</p></div><button type="button" id="methodStartBtn">Practicar ahora</button></div><div class="method-steps"><article><span class="tag">1</span><h3>Primero comprendes</h3><p>En Aprender ves la clase, el vocabulario, patrones, definiciones y ejemplos. El objetivo es formar una primera representación clara.</p></article><article><span class="tag">2</span><h3>Luego recuperas</h3><p>Las tarjetas y ejercicios te obligan a recordar. Recordar desde cero fortalece más que releer pasivamente.</p></article><article><span class="tag">3</span><h3>Producción temprana</h3><p>No basta con reconocer. Se alternan copia activa, escucha-escribe, traducción, selección y clasificación.</p></article><article><span class="tag">4</span><h3>Feedback inmediato</h3><p>Después de cada respuesta ves si era correcta y cuál era la forma esperada. El error se convierte en señal de repaso.</p></article><article><span class="tag">5</span><h3>Repaso espaciado</h3><p>Lo que cuesta o falla vuelve antes. Lo que aciertas se retrasa. Así se distribuye la práctica en el tiempo.</p></article><article><span class="tag">6</span><h3>Intercalado</h3><p>La práctica mezcla vocabulario, gramática, clase, aspecto verbal y comprensión para aprender a elegir el patrón correcto en contexto.</p></article></div><div class="method-flow"><h3>Cómo usarlo cada día</h3><ol><li>Abre <strong>Aprender</strong> y lee una clase pequeña.</li><li>Escucha y repite 8–12 palabras o patrones.</li><li>Ve a <strong>Practicar</strong> y haz una ronda corta.</li><li>Corrige lo fallado y repítelo al día siguiente.</li><li>No estudies todo de golpe: sesiones breves y frecuentes.</li></ol></div><div class="method-flow"><h3>Implementación actual en Paruski</h3><ul><li><strong>Recuperación activa:</strong> ejercicios con input, selección y tarjetas.</li><li><strong>Repetición espaciada:</strong> cada item guarda vencimiento local y vuelve según acierto/error.</li><li><strong>Intercalado:</strong> la práctica generada mezcla tipos y clases.</li><li><strong>Producción:</strong> copia activa, escucha-escribe y traducción obligan a producir ruso.</li><li><strong>Feedback:</strong> respuesta esperada y corrección inmediata.</li><li><strong>Privacidad:</strong> progreso local; no se suben transcripciones ni datos personales.</li></ul></div><p class="muted small">Base científica resumida: práctica de recuperación, práctica distribuida, intercalado, feedback y análisis de errores. Se documenta aquí para que el diseño de ejercicios sea transparente.</p></div>';
  const review = document.getElementById('review');
  main.insertBefore(section, review?.nextSibling || null);
  section.querySelector('#methodStartBtn')?.addEventListener('click', () => document.querySelector('[data-view="review"]')?.click());
}

function show(viewId) {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.view === viewId));
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === viewId));
}

function injectMethodStyles() {
  if (document.getElementById('methodUiStyles')) return;
  const style = document.createElement('style');
  style.id = 'methodUiStyles';
  style.textContent = '.method-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:.8rem}.method-steps article,.method-flow{border:1px solid var(--line);border-radius:1rem;padding:1rem;background:rgba(0,0,0,.12)}.method-flow{margin-top:1rem}.method-flow li{margin:.35rem 0}.method-panel h3{margin-top:.2rem}';
  document.head.appendChild(style);
}
