(() => {
  const RU_LANG = 'ru-RU';
  let voicesReady = false;
  let ruVoice = null;
  let lastUtterance = null;
  let noticeEl = null;
  let noticeTimer = null;

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
    noticeTimer = window.setTimeout(() => { if (noticeEl) noticeEl.style.display = 'none'; }, 6500);
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
      showNotice('Las voces del navegador aún no están listas. Pulsa “Escuchar” otra vez dentro de un segundo.');
    } else if (!ruVoice) {
      showNotice('No encuentro una voz rusa instalada. Se usará la voz por defecto del navegador o del sistema.');
    }

    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = RU_LANG;
    utterance.rate = 0.88;
    utterance.pitch = 1;
    if (ruVoice) utterance.voice = ruVoice;
    utterance.onerror = event => {
      showNotice('No se pudo reproducir el audio (' + (event.error || 'error desconocido') + '). Recarga la página o prueba otro navegador.', 'error');
    };
    utterance.onstart = () => {
      if (noticeEl) noticeEl.style.display = 'none';
    };
    lastUtterance = utterance;

    const synth = window.speechSynthesis;
    const wasBusy = synth.speaking || synth.pending;
    synth.resume();
    if (wasBusy) {
      synth.cancel();
      window.setTimeout(() => synth.speak(utterance), 0);
    } else {
      synth.speak(utterance);
    }
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
