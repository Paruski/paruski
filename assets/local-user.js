(() => {
  try {
    const key = 'paruski.progress.v1';
    const stored = JSON.parse(localStorage.getItem(key) || 'null') || {};
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
    localStorage.setItem(key, JSON.stringify(progress, null, 2));
  } catch {}
})();
