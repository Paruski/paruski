// Audio: primero el banco de locuciones estáticas del repositorio; si la frase
// no está grabada, se usa la voz del navegador y se marca como provisional.

import { loadAudioIndex } from './data.js';
import { unstress } from './util.js';
import { h } from './util.js';

let current = null;

export async function findRecording(text) {
  const index = await loadAudioIndex();
  const key = unstress(text || '').trim().toLowerCase();
  return index.get(key) || index.get(key.replace(/[.!?]+$/, '')) || null;
}

export async function play(text) {
  const clean = unstress(text || '').trim();
  if (!clean) return { source: 'none' };
  const path = await findRecording(clean);
  if (path) {
    if (current) { current.pause(); current = null; }
    current = new Audio(path);
    await current.play().catch(() => {});
    return { source: 'banco' };
  }
  if ('speechSynthesis' in window) {
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = 'ru-RU';
    utter.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(utter);
    return { source: 'sintesis' };
  }
  return { source: 'none' };
}

/** Botón de escucha reutilizable. */
export function audioButton(text, label = '▶ escuchar') {
  const btn = h('button', {
    class: 'audio-btn', type: 'button', title: 'Escuchar en ruso',
    onclick: async () => {
      const { source } = await play(text);
      btn.textContent = source === 'banco' ? '▶ escuchar'
        : source === 'sintesis' ? '▶ voz del navegador'
        : 'sin audio';
    },
  }, label);
  return btn;
}
