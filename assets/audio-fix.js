(() => {
  const RU_LANG = 'ru-RU';
  const AUDIO_INDEX_PATH = 'content/audio-index.json';
  let voicesReady = false;
  let ruVoice = null;
  let lastUtterance = null;
  let noticeEl = null;
  let noticeTimer = null;
  let playSeq = 0;
  let bankLoading = false;
  let audioIndexReady = false;
  let audioIndex = new Map();

  function normalize(text) {
    return String(text || '').trim().toLowerCase().replace(/[?.!¿¡,;:«»“”"']/g, '').replace(/\s+/g, ' ');
  }

  async function loadAudioIndex() {
    try {
      const response = await fetch(AUDIO_INDEX_PATH, { cache: 'no-store' });
      if (!response.ok) throw new Error(AUDIO_INDEX_PATH);
      const data = await response.json();
      audioIndex = new Map((data.entries || []).filter(entry => entry.audio_path).map(entry => [normalize(entry.text || entry.normalized_text), entry]));
      audioIndexReady = true;
    } catch (error) {
      console.warn('[Paruski audio] No se pudo cargar audio-index.json', error);
    }
  }

  function loadAudioBank() {
    if (window.ParuskiAudioBank || bankLoading) return;
    bankLoading = true;
    const script = document.createElement('script');
    script.src = 'assets/audio-bank.js';
    script.defer = true;
    document.head.appendChild(script);
  }

  function playAudioSrc(src, failureMessage) {
    const audio = new Audio(src);
    const p = audio.play();
    if (p?.catch) p.catch(() => showNotice(failureMessage, 'error'));
    return true;
  }

  function playIndexed(text) {
    const entry = audioIndex.get(normalize(text));
    if (!entry?.audio_path) return false;
    return playAudioSrc(entry.audio_path, 'El navegador ha bloqueado el audio del curso. Pulsa “Escuchar” otra vez.');
  }

  function playBank(text) {
    const src = window.ParuskiAudioBank?.get?.(text);
    if (!src) return false;
    return playAudioSrc(src, 'El navegador ha bloqueado el audio interno. Pulsa “Escuchar” otra vez.');
  }

  function refreshVoices() {
    if (!('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices() || [];
    ruVoice = voices.find(voice => /^ru(-|_)?/i.test(voice.lang)) || voices.find(voice => /russian|рус/i.test(voice.name)) || null;
    voicesReady = voices.length > 0;
    console.info('[Paruski audio] voces disponibles:', voices.map(v => v.name + ' [' + v.lang + ']'));
  }

  function showNotice(message, tone = 'warn') {
    console.warn('[Paruski audio]', message);
    if (!noticeEl) {
      noticeEl = document.createElement('div');
      noticeEl.id = 'paruskiAudioNotice';
      noticeEl.setAttribute('role', 'status');
      noticeEl.style.cssText = 'position:fixed;left:50%;bottom:1.2rem;transform:translateX(-50%);max-width:90vw;background:#111827;color:#f9fafb;border:1px solid #8b5cf6;border-radius:.75rem;padding:.75rem 1rem;font-size:.92rem;z-index:9999;box-shadow:0 8px 28px rgba(0,0,0,.42)';
      document.body.appendChild(noticeEl);
    }
    noticeEl.style.borderColor = tone === 'error' ? '#ef4444' : '#8b5cf6';
    noticeEl.style.color = tone === 'error' ? '#fecaca' : '#f9fafb';
    noticeEl.textContent = message;
    noticeEl.style.display = 'block';
    clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => { if (noticeEl) noticeEl.style.display = 'none'; }, 7000);
  }

  function hideNotice() {
    if (noticeEl) noticeEl.style.display = 'none';
  }

  function makeUtterance(value, mode) {
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.rate = mode === 'default' ? 0.78 : 0.88;
    utterance.pitch = 1;
    if (mode === 'ru') {
      utterance.lang = RU_LANG;
      if (ruVoice) utterance.voice = ruVoice;
    }
    return utterance;
  }

  function speakWithMode(value, mode, seq) {
    const utterance = makeUtterance(value, mode);
    lastUtterance = utterance;
    let started = false;
    const timer = window.setTimeout(() => {
      if (seq !== playSeq || started) return;
      try { window.speechSynthesis.cancel(); } catch {}
      if (playIndexed(value) || playBank(value)) return;
      if (mode === 'ru') speakWithMode(value, 'default', seq);
      else showNotice('No hay audio grabado para esta palabra y el motor de voz del sistema no funciona.', 'error');
    }, 1600);

    utterance.onstart = () => {
      started = true;
      window.clearTimeout(timer);
      hideNotice();
    };
    utterance.onend = () => window.clearTimeout(timer);
    utterance.onerror = () => {
      window.clearTimeout(timer);
      try { window.speechSynthesis.cancel(); } catch {}
      if (playIndexed(value) || playBank(value)) return;
      if (mode === 'ru') window.setTimeout(() => speakWithMode(value, 'default', seq), 0);
      else showNotice('No hay audio grabado para esta palabra y el motor de voz del sistema no funciona.', 'error');
    };

    const synth = window.speechSynthesis;
    const wasBusy = synth.speaking || synth.pending;
    try { synth.resume(); } catch {}
    if (wasBusy) {
      synth.cancel();
      window.setTimeout(() => { if (seq === playSeq) synth.speak(utterance); }, 0);
    } else {
      synth.speak(utterance);
    }
  }

  function speakRu(text) {
    const value = String(text || '').trim();
    if (!value) return false;
    if (playIndexed(value) || playBank(value)) return true;
    if (!audioIndexReady) loadAudioIndex().then(() => { if (playIndexed(value)) return; });
    if (!('speechSynthesis' in window)) {
      showNotice('No hay audio grabado para esta palabra y tu navegador no soporta voz integrada.', 'error');
      return false;
    }
    refreshVoices();
    if (!voicesReady) showNotice('Las voces del navegador no están listas. Si falla, usaré audio grabado cuando exista.');
    const seq = ++playSeq;
    speakWithMode(value, ruVoice ? 'ru' : 'default', seq);
    return true;
  }

  function targetTextFromButton(button) {
    if (!button) return '';
    return button.dataset.audioText || button.dataset.sessionAction === 'speak' && button.dataset.value || button.dataset.guidedSpeak || button.dataset.tabSpeak || button.dataset.studySpeak || button.dataset.aspectSpeak || button.dataset.noteSpeak || '';
  }

  function handleAudioClick(event) {
    const button = event.target.closest('[data-audio-text],[data-session-action="speak"],[data-guided-speak],[data-tab-speak],[data-study-speak],[data-aspect-speak],[data-note-speak]');
    if (!button) return;
    const text = targetTextFromButton(button);
    if (!text) return;
    event.preventDefault();
    event.stopPropagation();
    speakRu(text);
  }

  window.ParuskiAudio = { speakRu, refreshVoices, playBank, playIndexed, loadAudioIndex };
  loadAudioIndex();
  loadAudioBank();
  refreshVoices();
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = refreshVoices;
    window.setTimeout(refreshVoices, 300);
    window.setTimeout(refreshVoices, 1200);
  }
  document.addEventListener('click', handleAudioClick, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshVoices(); });
})();
