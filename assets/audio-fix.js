(() => {
  const RU_LANG = 'ru-RU';
  let voicesReady = false;
  let ruVoice = null;

  function refreshVoices() {
    if (!('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices() || [];
    ruVoice = voices.find(voice => /^ru(-|_)?/i.test(voice.lang)) || voices.find(voice => /russian|рус/i.test(voice.name)) || null;
    voicesReady = voices.length > 0;
  }

  function speakRu(text) {
    const value = String(text || '').trim();
    if (!value || !('speechSynthesis' in window)) return false;
    refreshVoices();
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = RU_LANG;
    utterance.rate = 0.88;
    utterance.pitch = 1;
    if (ruVoice) utterance.voice = ruVoice;
    window.speechSynthesis.cancel();
    window.setTimeout(() => window.speechSynthesis.speak(utterance), 30);
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
  if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = refreshVoices;
  document.addEventListener('click', handleAudioClick, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshVoices(); });
})();
