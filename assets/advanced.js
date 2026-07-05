(function () {
  function loadLearning() {
    if (document.querySelector('script[src="assets/learning.js"]')) return;
    var script = document.createElement('script');
    script.src = 'assets/learning.js';
    script.defer = true;
    document.head.appendChild(script);
  }
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', loadLearning);
  } else {
    loadLearning();
  }
}());
