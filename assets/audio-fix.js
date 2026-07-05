(() => {
  const RU_LANG = 'ru-RU';
  let voicesReady = false;
  let ruVoice = null;
  let lastUtterance = null;
  let noticeEl = null;
  let noticeTimer = null;
  let playSeq = 0;

  function refreshVoices() {
    if (!('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices() || [];
    ruVoice = voices.find(voice => /^ru(-|_)?/i.test(voice.lang)) || voices.find(voice => /russian|рус/i.test(voice.name)) || null;
    voicesReady = voices.length > 0;
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
      if (mode === 'ru') {
        showNotice('La voz rusa local no ha arrancado. Reintento con la voz por defecto del sistema.');
        speakWithMode(value, 'default', seq);
      } else {
        showNotice('El navegador no ha conseguido reproducir audio. Instala una voz de texto a voz en el sistema o prueba otro navegador.', 'error');
      }
    }, 1600);

    utterance.onstart = () => {
      started = true;
      window.clearTimeout(timer);
      hideNotice();
    };
    utterance.onend = () => window.clearTimeout(timer);
    utterance.onerror = event => {
      window.clearTimeout(timer);
      try { window.speechSynthesis.cancel(); } catch {}
      if (mode === 'ru') {
        showNotice('La voz rusa local ha fallado (' + (event.error || 'error desconocido') + '). Reintento con la voz por defecto.');
        window.setTimeout(() => speakWithMode(value, 'default', seq), 0);
      } else {
        showNotice('No se pudo reproducir el audio (' + (event.error || 'error desconocido') + '). Instala voces de texto a voz o prueba otro navegador.', 'error');
      }
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
    if (!('speechSynthesis' in window)) {
      showNotice('Tu navegador no soporta voz integrada. Prueba con Chrome, Edge o Safari.', 'error');
      return false;
    }

    refreshVoices();
    if (!voicesReady) {
      showNotice('Las voces del navegador aún no están listas. Reintento automático en cuanto responda el motor.');
    } else if (!ruVoice) {
      showNotice('No encuentro una voz rusa instalada. Intento usar la voz por defecto del sistema.');
    }

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

  window.ParuskiAudio = { speakRu, refreshVoices };
  refreshVoices();
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = refreshVoices;
    window.setTimeout(refreshVoices, 300);
    window.setTimeout(refreshVoices, 1200);
  }
  document.addEventListener('click', handleAudioClick, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshVoices(); });
})();
