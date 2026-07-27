// Teclado cirílico de apoyo y transliteración sobre la marcha.
// Escribir en ruso forma parte de la destreza: no se ofrece el texto hecho,
// sólo el acceso a los caracteres.

import { h } from './util.js';

const ROWS = [
  'а б в г д е ё ж з и й к л м н о п р с т у ф х ц ч ш щ ъ ы ь э ю я',
];

const TRANSLIT = {
  a: 'а', b: 'б', v: 'в', g: 'г', d: 'д', e: 'е', z: 'з', i: 'и', j: 'й', k: 'к',
  l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', r: 'р', s: 'с', t: 'т', u: 'у', f: 'ф',
  h: 'х', c: 'ц', y: 'ы', q: 'я', w: 'ш', x: 'ж', "'": 'ь',
};

export function insertAt(input, text) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  const pos = start + text.length;
  input.setSelectionRange(pos, pos);
  input.focus();
}

export function cyrillicKeyboard(input) {
  const wrap = h('div', { class: 'keyboard', role: 'group', 'aria-label': 'Teclado cirílico' });
  for (const row of ROWS) {
    for (const letter of row.split(' ')) {
      wrap.append(h('button', {
        type: 'button', tabindex: '-1',
        onclick: (event) => { event.preventDefault(); insertAt(input, letter); },
      }, letter));
    }
  }
  wrap.append(h('button', {
    type: 'button', tabindex: '-1', title: 'Borrar el último carácter',
    onclick: (event) => {
      event.preventDefault();
      input.value = input.value.slice(0, -1);
      input.focus();
    },
  }, '⌫'));
  return wrap;
}

/** Convierte lo escrito en latín a cirílico (para quien no tenga teclado ruso). */
export function transliterate(text) {
  let out = '';
  const lower = text.toLowerCase();
  for (let i = 0; i < lower.length; i++) {
    const pair = lower.slice(i, i + 2);
    if (pair === 'sh') { out += 'ш'; i++; continue; }
    if (pair === 'ch') { out += 'ч'; i++; continue; }
    if (pair === 'yo') { out += 'ё'; i++; continue; }
    if (pair === 'yu') { out += 'ю'; i++; continue; }
    if (pair === 'ya') { out += 'я'; i++; continue; }
    const ch = lower[i];
    out += TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch;
  }
  return out;
}
