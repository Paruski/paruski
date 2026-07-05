const RU_KEYS = [
  ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х'],
  ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'],
  ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', 'ё'],
  ['space', 'backspace', 'clear']
];

export function attachRussianKeyboard(container, input) {
  if (!container || !input || container.querySelector('.ru-keyboard')) return;
  const keyboard = document.createElement('div');
  keyboard.className = 'ru-keyboard';
  keyboard.innerHTML = '<div class="ru-keyboard-head"><span class="ru-keyboard-title">Teclado ruso</span></div>';
  const grid = document.createElement('div');
  grid.className = 'ru-keyboard-grid';

  RU_KEYS.flat().forEach(key => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.ruKey = key;
    button.textContent = key === 'space' ? 'espacio' : key === 'backspace' ? '⌫' : key === 'clear' ? 'limpiar' : key;
    if (key.length > 1) button.className = 'ru-wide';
    grid.appendChild(button);
  });

  keyboard.appendChild(grid);
  keyboard.addEventListener('click', event => {
    const key = event.target?.dataset?.ruKey;
    if (!key) return;
    if (key === 'space') return insertAtCursor(input, ' ');
    if (key === 'clear') {
      input.value = '';
      input.focus();
      return;
    }
    if (key === 'backspace') return backspace(input);
    insertAtCursor(input, key);
  });
  container.appendChild(keyboard);
}

function insertAtCursor(input, text) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  const next = start + text.length;
  input.setSelectionRange(next, next);
  input.focus();
}

function backspace(input) {
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
}
