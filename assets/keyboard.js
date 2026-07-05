const RU_KEYS = [
  ['й','ц','у','к','е','н','г','ш','щ','з','х'],
  ['ф','ы','в','а','п','р','о','л','д','ж','э'],
  ['я','ч','с','м','и','т','ь','б','ю','ё'],
  ['space','backspace','clear']
];

function insertAtCursor(input, text) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  const next = start + text.length;
  input.setSelectionRange(next, next);
  input.focus();
}

function makeKey(label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.ruKey = label;
  if (label === 'space') {
    button.textContent = 'espacio';
    button.className = 'ru-wide';
  } else if (label === 'backspace') {
    button.textContent = '⌫';
    button.className = 'ru-wide';
  } else if (label === 'clear') {
    button.textContent = 'limpiar';
    button.className = 'ru-wide';
  } else {
    button.textContent = label;
  }
  return button;
}

function buildKeyboard() {
  const wrap = document.createElement('div');
  wrap.className = 'ru-keyboard';
  wrap.innerHTML = '<div class="ru-keyboard-head"><span class="ru-keyboard-title">Teclado ruso</span><span class="muted">Pulsa letras para escribir la respuesta</span></div>';
  const grid = document.createElement('div');
  grid.className = 'ru-keyboard-grid';
  RU_KEYS.flat().forEach(key => grid.appendChild(makeKey(key)));
  wrap.appendChild(grid);
  return wrap;
}

function attachKeyboard() {
  const input = document.getElementById('answerInput');
  if (!input) return;
  const box = document.getElementById('exerciseBox');
  if (!box || box.querySelector('.ru-keyboard')) return;
  const keyboard = buildKeyboard();
  keyboard.addEventListener('click', event => {
    const key = event.target?.dataset?.ruKey;
    if (!key) return;
    if (key === 'space') insertAtCursor(input, ' ');
    else if (key === 'clear') input.value = '';
    else if (key === 'backspace') {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      if (start !== end) {
        input.value = input.value.slice(0, start) + input.value.slice(end);
        input.setSelectionRange(start, start);
      } else if (start > 0) {
        input.value = input.value.slice(0, start - 1) + input.value.slice(start);
        input.setSelectionRange(start - 1, start - 1);
      }
      input.focus();
    } else {
      insertAtCursor(input, key);
    }
  });
  box.appendChild(keyboard);
}

function loadSyncStyles() {
  if (document.querySelector('link[href="assets/sync-ui.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'assets/sync-ui.css';
  document.head.appendChild(link);
}

const observer = new MutationObserver(attachKeyboard);
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('DOMContentLoaded', attachKeyboard);
loadSyncStyles();
import('./sync-ui.js').catch(() => {});
import('./advanced.js').catch(() => {});
import('./aspect-ui.js').catch(() => {});
import('./notes-ui.js').catch(() => {});
import('./drills-ui.js').catch(() => {});
import('./simple-ui.js').catch(() => {});
import('./tabs-fix-ui.js').catch(() => {});
import('./methodology-ui.js').catch(() => {});
