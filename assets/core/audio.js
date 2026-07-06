import { normalizeText } from './utils.js';

export function createAudioService(contentStore) {
  let ruVoice = null;
  let outputPrimed = false;
  let audioContext = null;
  let activeSource = null;
  const bufferCache = new Map();
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
    if (await playWithAudioContext(src)) return true;
    try {
      player.pause();
      player.removeAttribute('src');
      player.volume = 1;
      player.playbackRate = 1;
      player.load();
      player.src = src;
      player.load();
      await waitForAudioReady(player);
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

  async function playWithAudioContext(src) {
    try {
      const context = await getAudioContext();
      if (!context) return false;
      const buffer = await loadAudioBuffer(context, src);
      if (!buffer) return false;
      await primeOutput(context);
      try { activeSource?.stop(); } catch {}
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      gain.gain.setValueAtTime(1, context.currentTime);
      source.connect(gain).connect(context.destination);
      source.onended = () => {
        if (activeSource === source) activeSource = null;
      };
      activeSource = source;
      source.start(context.currentTime + 0.08);
      return true;
    } catch {
      return false;
    }
  }

  async function getAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContextClass();
    if (audioContext.state === 'suspended') await audioContext.resume();
    return audioContext;
  }

  async function loadAudioBuffer(context, src) {
    if (bufferCache.has(src)) return bufferCache.get(src);
    const response = await fetch(src, { cache: 'force-cache' });
    if (!response.ok) return null;
    const data = await response.arrayBuffer();
    const buffer = await context.decodeAudioData(data.slice(0));
    bufferCache.set(src, buffer);
    while (bufferCache.size > 48) bufferCache.delete(bufferCache.keys().next().value);
    return buffer;
  }

  async function primeOutput(context) {
    if (outputPrimed) return;
    outputPrimed = true;
    try {
      if (!context) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      gain.gain.value = 0.0001;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      await new Promise(resolve => window.setTimeout(resolve, 180));
      oscillator.stop();
    } catch {}
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
