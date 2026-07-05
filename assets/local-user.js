(() => {
  try {
    const params = new URLSearchParams(window.location.search);
    const resetMode = params.get('reset');
    const progressKey = 'paruski.progress.v1';
    const localKeys = [
      progressKey,
      'paruski.events.v1',
      'paruski.generatedDrills.v1',
      'paruski.materialStudy.v1',
      'paruski.aspectStudy.v1',
      'paruski.journal.v1',
      'paruski.materialsSeen.v1',
      'paruski.githubSync.loadedThisSession.v1',
      'paruski.githubSync.lastAutoRun.v1'
    ];

    if (resetMode === 'local' || resetMode === 'all') {
      localKeys.forEach(key => localStorage.removeItem(key));
      sessionStorage.removeItem('paruski.githubSync.loadedThisSession.v1');
      if (resetMode === 'all') {
        localStorage.removeItem('paruski.githubKey.local');
        sessionStorage.removeItem('paruski.githubKey.session');
        localStorage.removeItem('paruski.githubSync.v1');
        localStorage.removeItem('paruski.githubSync.autosync.v1');
      }
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    const stored = JSON.parse(localStorage.getItem(progressKey) || 'null') || {};
    if (stored.user && stored.user.id) return;
    const now = new Date().toISOString();
    const progress = {
      version: stored.version || 1,
      updated_at: stored.updated_at || now,
      user: { id: 'usuario-local', name: 'usuario-local', created_at: stored.user?.created_at || now },
      lessons: stored.lessons || {},
      items: stored.items || {},
      settings: { dailyTarget: 12, ...(stored.settings || {}) }
    };
    localStorage.setItem(progressKey, JSON.stringify(progress, null, 2));
  } catch {}
})();
