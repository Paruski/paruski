(() => {
  const KEYS = {
    progress: 'paruski.progress.v1',
    events: 'paruski.events.v1',
    session: 'paruski.directedSession.v1',
    free: 'paruski.freeExplore.v1'
  };

  let materials = [];
  let notes = [];
  let current = null;
  let task = null;
  let phase = 'learn';

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', startDirectedSession);
  } else {
    startDirectedSession();
  }

  async function startDirectedSession() {
    document.body.classList.add('guided-redesign', 'directed-session');
    await loadMaterials();
    setHeader();
    mountSession();
    pickNext();
    renderSession();
  }

  async function loadMaterials() {
    const data = await Promise.all([
      readRemote('content/materials.json').catch(() => ({ classes: [] })),
      readRemote('content/materials-aspect.json').catch(() => ({ classes: [] })),
      readRemote('content/learning-notes.json').catch(() => ({ notes: [] }))
    ]);
    notes = data[2].notes || [];
    materials = mergeClasses(data[0].classes || [], data[1].classes || []).flatMap(entry => [
      ...(entry.v || []).map(value => makeItem(entry.l, 'vocabulario', value)),
      ...(entry.g || []).map(value => makeItem(entry.l, 'patrón', value))
    ]).filter(item => item.value && item.value.length > 1);
  }

  async function readRemote(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(path);
    return response.json();
  }

  function mergeClasses(base, extra) {
    const map = new Map();
    [...base, ...extra].forEach(entry => {
      const lesson = Number(entry.l);
      const saved = map.get(lesson) || { l: lesson, v: [], g: [] };
      saved.v = unique([...(saved.v || []), ...(entry.v || [])]);
      saved.g = unique([...(saved.g || []), ...(entry.g || [])]);
      map.set(lesson, saved);
    });
    return [...map.values()].sort((a, b) => a.l - b.l);
  }

  function makeItem(lesson, kind, value) {
    const note = notes.find(item => (item.lessons || []).map(Number).includes(Number(lesson))) || null;
    return { lesson: Number(lesson), kind, value, note, key: lesson + ':' + kind + ':' + value };
  }

  function setHeader() {
    const title = document.querySelector('.topbar h1');
    const subtitle = document.querySelector('.topbar .muted');
    if (title) title.textContent = 'Sesión de ruso';
    if (subtitle) subtitle.textContent = 'La web elige un objetivo, lo explica, lo comprueba y ajusta el siguiente repaso.';
  }

  function mountSession() {
    const dashboard = document.getElementById('dashboard');
    if (!dashboard || document.getElementById('guidedShell')) return;
    const shell = document.createElement('section');
    shell.id = 'guidedShell';
    shell.className = 'guided-shell directed-shell';
    shell.innerHTML = '<main id="directedMain"></main><aside id="directedSide"></aside>';
    dashboard.prepend(shell);
    shell.addEventListener('click', event => {
      const action = event.target.closest('[data-session-action]');
      if (!action) return;
      handleAction(action.dataset.sessionAction, action.dataset.value || '');
    });
    shell.addEventListener('keydown', event => {
      if (event.key === 'Enter' && phase === 'check') checkAnswer();
    });
  }

  function pickNext() {
    if (!materials.length) return;
    const stats = readJson(KEYS.session, {});
    const today = dayKey(new Date());
    current = materials.map((item, index) => {
      const stat = stats[item.key] || {};
      const due = !stat.due || stat.due <= today ? 100 : 0;
      const errors = (stat.wrong || 0) * 25;
      const fresh = stat.attempts ? 0 : 20;
      const good = (stat.correct || 0) * 8;
      return { item, score: due + errors + fresh - good - index * 0.001 };
    }).sort((a, b) => b.score - a.score)[0].item;
    task = null;
    phase = 'learn';
  }

  function renderSession() {
    const main = document.getElementById('directedMain');
    const side = document.getElementById('directedSide');
    if (!main || !side) return;
    if (!current) {
      main.innerHTML = '<article class="guided-card-main"><h2>No hay material cargado.</h2></article>';
      side.innerHTML = '';
      return;
    }
    main.innerHTML = phase === 'learn' ? renderLearn() : phase === 'check' ? renderCheck() : renderResult();
    side.innerHTML = renderSide();
  }

  function renderLearn() {
    const examples = (current.note?.examples || []).slice(0, 4);
    const tips = (current.note?.tips || []).slice(0, 2);
    return '<article class="guided-card-main directed-card"><p class="eyebrow">Objetivo elegido para ti</p><h2>' + escapeHtml(current.value) + '</h2><div class="guided-actions"><span class="tag">' + escapeHtml(current.kind) + '</span><span class="tag">ruta adaptativa</span></div><p class="muted big-text">' + escapeHtml(current.note?.definition || 'Escucha, repite y prepárate para producir esta forma en ruso.') + '</p>' + (examples.length ? '<h3>Ejemplos</h3><ul class="directed-list">' + examples.map(example => '<li><button type="button" data-session-action="speak" data-value="' + escapeAttr(example) + '">' + escapeHtml(example) + '</button></li>').join('') + '</ul>' : '') + (tips.length ? '<h3>Fíjate</h3><ul>' + tips.map(tip => '<li>' + escapeHtml(tip) + '</li>').join('') + '</ul>' : '') + '<div class="guided-actions"><button type="button" class="secondary" data-session-action="speak" data-value="' + escapeAttr(current.value) + '">Escuchar</button><button type="button" class="guided-primary" data-session-action="check">Comprobar ahora</button></div></article>';
  }

  function buildTask() {
    const example = exampleFor(current);
    if (example && normalize(example).includes(normalize(current.value))) {
      task = { prompt: 'Completa la frase rusa.', display: example.split(current.value).join('_____'), expected: current.value, speak: example };
    } else {
      task = { prompt: 'Escucha y escribe la forma rusa.', display: '', expected: current.value, speak: current.value };
    }
  }

  function renderCheck() {
    if (!task) buildTask();
    return '<article class="guided-card-main directed-card"><p class="eyebrow">Prueba activa</p><h2>' + escapeHtml(task.prompt) + '</h2>' + (task.display ? '<p class="directed-prompt">' + escapeHtml(task.display) + '</p>' : '') + '<p class="muted">Responde sin mirar. También vale una frase completa si contiene la forma esperada.</p><input id="directedAnswer" autocomplete="off" placeholder="Escribe en ruso..." /><div class="guided-actions"><button type="button" class="secondary" data-session-action="speak" data-value="' + escapeAttr(task.speak) + '">Escuchar</button><button type="button" class="guided-primary" data-session-action="answer">Comprobar</button></div></article>';
  }

  function renderResult() {
    const last = readJson('paruski.lastDirectedResult.v1', {});
    const ok = last.correct === true;
    return '<article class="guided-card-main directed-card ' + (ok ? 'correct' : 'wrong') + '"><p class="eyebrow">Feedback</p><h2>' + (ok ? 'Correcto. Seguimos.' : 'Todavía no. Volverá pronto.') + '</h2><p>' + (ok ? 'Esta forma se espaciará más.' : 'Esta forma gana prioridad para próximos repasos.') + '</p><div class="answer-box"><span>Forma esperada</span><strong>' + escapeHtml(last.expected || current.value) + '</strong></div><div class="guided-actions"><button type="button" class="secondary" data-session-action="speak" data-value="' + escapeAttr(last.expected || current.value) + '">Escuchar corrección</button><button type="button" class="guided-primary" data-session-action="next">Siguiente objetivo</button></div></article>';
  }

  function renderSide() {
    const stats = readJson(KEYS.session, {});
    const stat = stats[current.key] || {};
    const events = readJson(KEYS.events, []);
    const today = dayKey(new Date());
    const todayCount = events.filter(event => event.skill === 'directed-session' && dayKey(new Date(event.timestamp)) === today).length;
    return '<article class="guided-card-side"><h3>Por qué toca esto</h3><p class="muted">Se prioriza lo vencido, lo fallado y el material nuevo.</p><div class="guided-progress-row one-column"><article class="guided-mini-card"><div class="value">' + (stat.attempts || 0) + '</div><div class="label">intentos</div></article><article class="guided-mini-card"><div class="value">' + (stat.correct || 0) + '</div><div class="label">aciertos</div></article><article class="guided-mini-card"><div class="value">' + (stat.wrong || 0) + '</div><div class="label">fallos</div></article><article class="guided-mini-card"><div class="value">' + todayCount + '</div><div class="label">hoy</div></article></div></article><article class="guided-card-side"><h3>Explorar libremente</h3><p class="muted">Disponible sólo como consulta secundaria.</p><button type="button" class="secondary" data-session-action="explore">Abrir opciones</button><div id="freeExploreBox" hidden><button type="button" data-session-action="view" data-value="learning">Aprender</button><button type="button" data-session-action="view" data-value="review">Práctica libre</button><button type="button" data-session-action="view" data-value="tracking">Progreso</button><button type="button" data-session-action="view" data-value="settings">Datos</button></div></article>';
  }

  function handleAction(action, value) {
    if (action === 'speak') return speak(value);
    if (action === 'check') { phase = 'check'; buildTask(); renderSession(); setTimeout(() => document.getElementById('directedAnswer')?.focus(), 50); return; }
    if (action === 'answer') return checkAnswer();
    if (action === 'next') { pickNext(); renderSession(); return; }
    if (action === 'explore') { const box = document.getElementById('freeExploreBox'); if (box) box.hidden = !box.hidden; return; }
    if (action === 'view') return goToView(value);
  }

  function checkAnswer() {
    const answer = document.getElementById('directedAnswer')?.value || '';
    const correct = isCorrectAnswer(answer, task.expected);
    saveResult(correct, answer);
    phase = 'result';
    renderSession();
  }

  function isCorrectAnswer(answer, expected) {
    const a = normalize(answer);
    const e = normalize(expected);
    return Boolean(a && e && (a === e || a.includes(e)));
  }

  function saveResult(correct, answer) {
    const stats = readJson(KEYS.session, {});
    const old = stats[current.key] || { attempts: 0, correct: 0, wrong: 0, interval: 0 };
    const interval = correct ? Math.min(45, Math.max(1, Math.round((old.interval || 1) * 2.1))) : 0;
    stats[current.key] = { attempts: old.attempts + 1, correct: old.correct + (correct ? 1 : 0), wrong: old.wrong + (correct ? 0 : 1), interval, due: dayKey(addDays(new Date(), interval)), last: new Date().toISOString() };
    localStorage.setItem(KEYS.session, JSON.stringify(stats));
    localStorage.setItem('paruski.lastDirectedResult.v1', JSON.stringify({ correct, answer, expected: task.expected, timestamp: new Date().toISOString() }));
    const events = readJson(KEYS.events, []);
    const event = { timestamp: new Date().toISOString(), skill: 'directed-session', correct, answer, expected: task.expected, prompt: task.prompt, item_id: current.key, targets: { lesson: current.lesson, kind: current.kind, value: current.value } };
    events.push(event);
    localStorage.setItem(KEYS.events, JSON.stringify(events));
    const progress = readJson(KEYS.progress, {});
    progress.updated_at = new Date().toISOString();
    progress.items = progress.items || {};
    progress.items[current.key] = { attempts: stats[current.key].attempts, wrong: stats[current.key].wrong, mastery: Math.min(1, stats[current.key].correct / Math.max(3, stats[current.key].attempts)) };
    localStorage.setItem(KEYS.progress, JSON.stringify(progress, null, 2));
  }

  function exampleFor(item) {
    const examples = item.note?.examples || [];
    return examples.find(example => normalize(example).includes(normalize(item.value))) || examples[0] || '';
  }

  function goToView(view) { document.querySelector('.tab[data-view="' + view + '"]')?.click(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
  function unique(values) { return [...new Set(values.filter(Boolean))]; }
  function addDays(date, amount) { const next = new Date(date); next.setDate(next.getDate() + amount); next.setHours(0, 0, 0, 0); return next; }
  function dayKey(date) { if (Number.isNaN(date.getTime())) return ''; return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'); }
  function normalize(value) { return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[?.!¿¡,;:«»“”"']/g, ''); }
  function speak(value) { if (!('speechSynthesis' in window)) return; const u = new SpeechSynthesisUtterance(value); u.lang = 'ru-RU'; u.rate = 0.9; speechSynthesis.cancel(); speechSynthesis.speak(u); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
  function escapeAttr(value) { return escapeHtml(value).replace(/'/g, '&#39;'); }
})();
