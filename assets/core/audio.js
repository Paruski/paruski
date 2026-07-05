import { normalizeText } from './utils.js';

export function createAudioService(contentStore) {
  let ruVoice = null;
  const player = document.createElement('audio');
  player.preload = 'auto';
  player.playsInline = true;
  player.hidden = true;
  document.body?.appendChild(player);

  function refreshVoices() {
    if (!('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices() || [];
    ruVoice = voices.find(voice => /^ru(-|_)?/i.test(voice.lang)) ||
      voices.find(voice => /russian|рус/i.test(voice.name)) ||
      null;
  }

  async function playFile(src) {
    if (!src) return false;
    try {
      player.pause();
      player.removeAttribute('src');
      player.load();
      player.src = src;
      player.currentTime = 0;
      await player.play();
      return true;
    } catch {
      return false;
    }
  }

  async function playRecorded(text) {
    const entry = contentStore.getAudioEntry(text);
    const src = audioSource(entry);
    return src ? playFile(src) : false;
  }

  async function playBank(text) {
    const src = window.ParuskiAudioBank?.get?.(text) || window.ParuskiAudioBank?.get?.(normalizeText(text));
    return src ? playFile(src) : false;
  }

  async function speak(text, options = {}) {
    const value = String(text || '').trim();
    if (!value) return false;
    if (await playRecorded(value)) return true;
    if (await playBank(value)) return true;
    if (!options.allowFallback && options.requireRecorded) return false;
    if (!('speechSynthesis' in window)) return false;

    refreshVoices();
    return speakWithSynthesis(value, options, ruVoice);
  }

  function hasRecorded(text) {
    const entry = contentStore.getAudioEntry(text);
    return Boolean(audioSource(entry) || window.ParuskiAudioBank?.has?.(normalizeText(text)) || window.ParuskiAudioBank?.has?.(text));
  }

  refreshVoices();
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = refreshVoices;
    window.setTimeout(refreshVoices, 500);
  }

  return { speak, hasRecorded, refreshVoices };
}

function audioSource(entry) {
  if (!entry) return '';
  const src = entry.audio_path || entry.src || entry.path || entry.url || '';
  if (src) return src;
  return entry.storage && entry.storage !== 'assets/audio-bank.js' ? entry.storage : '';
}

function speakWithSynthesis(value, options = {}, preferredVoice = null) {
  return new Promise(resolve => {
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = 'ru-RU';
    utterance.rate = options.rate || 0.86;
    const voices = synth.getVoices() || [];
    const voice = preferredVoice || voices.find(item => /^ru(-|_)?/i.test(item.lang)) || voices.find(item => /russian|рус/i.test(item.name));
    if (voice) utterance.voice = voice;
    let started = false;
    const timer = window.setTimeout(() => {
      if (!started) {
        try { synth.cancel(); } catch {}
        resolve(false);
      }
    }, 2200);
    utterance.onstart = () => {
      started = true;
      window.clearTimeout(timer);
      resolve(true);
    };
    utterance.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    utterance.onend = () => window.clearTimeout(timer);
    try {
      synth.cancel();
      synth.resume();
      synth.speak(utterance);
    } catch {
      window.clearTimeout(timer);
      resolve(false);
    }
  });
}
