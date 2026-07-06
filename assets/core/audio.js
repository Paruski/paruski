import { normalizeText } from './utils.js';

export function createAudioService(contentStore) {
  let ruVoice = null;
  let outputPrimed = false;
  let mediaOutputPrimed = false;
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
      player.volume = 1;
      player.playbackRate = 1;
      player.load();
      player.src = src;
      player.load();
      await waitForAudioReady(player);
      await primeOutput();
      await primeMediaOutput(player);
      player.currentTime = 0;
      player.volume = 1;
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
    if (options.allowSynthesis !== true) return false;
    if (!('speechSynthesis' in window)) return false;

    refreshVoices();
    return speakWithSynthesis(speechText(value), options, ruVoice);
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

  async function primeOutput() {
    if (outputPrimed) return;
    outputPrimed = true;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const audioContext = new AudioContextClass();
      if (audioContext.state === 'suspended') await audioContext.resume();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      gain.gain.value = 0.0001;
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      await new Promise(resolve => window.setTimeout(resolve, 180));
      oscillator.stop();
      window.setTimeout(() => audioContext.close?.(), 250);
    } catch {}
  }

  async function primeMediaOutput(audio) {
    if (mediaOutputPrimed) return;
    mediaOutputPrimed = true;
    try {
      audio.currentTime = 0;
      audio.volume = 0.002;
      await audio.play();
      await new Promise(resolve => window.setTimeout(resolve, 180));
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 1;
    } catch {
      audio.volume = 1;
      try { audio.pause(); } catch {}
      try { audio.currentTime = 0; } catch {}
    }
  }
}

function waitForAudioReady(audio, timeoutMs = 2500) {
  if (audio.readyState >= 3) return Promise.resolve();
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      audio.removeEventListener('canplay', finish);
      audio.removeEventListener('canplaythrough', finish);
      audio.removeEventListener('loadeddata', finish);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    audio.addEventListener('canplay', finish, { once: true });
    audio.addEventListener('canplaythrough', finish, { once: true });
    audio.addEventListener('loadeddata', finish, { once: true });
  });
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

function speechText(value) {
  return String(value || '')
    .replace(/[→/+]/g, ' ')
    .replace(/[?.!¿¡,;:«»“”"']/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
