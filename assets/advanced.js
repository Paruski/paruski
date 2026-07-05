(function () {
  function loadScript(src) {
    if (document.querySelector('script[src="' + src + '"]')) return;
    var script = document.createElement('script');
    script.src = src;
    script.defer = true;
    document.head.appendChild(script);
  }

  function loadLearning() {
    loadScript('assets/learning.js');
    loadScript('assets/materials-ui.js');
    loadScript('assets/material-study.js');
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', loadLearning);
  } else {
    loadLearning();
  }
}());
