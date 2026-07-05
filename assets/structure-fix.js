(() => {
  const FALLBACKS = {
    learning: 'lessons',
    tracking: 'dashboard',
    method: 'faq',
    practice: 'review',
    data: 'settings'
  };

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initStructureFix);
  } else {
    initStructureFix();
  }

  function initStructureFix() {
    mountLocationBar();
    document.addEventListener('click', handleFreeLink, true);
    document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => setTimeout(updateLocationBar, 20)));
    updateLocationBar();
  }

  function handleFreeLink(event) {
    const button = event.target.closest('[data-session-action="view"],[data-free-view],[data-guided-view],[data-go]');
    if (!button) return;
    const view = button.dataset.value || button.dataset.freeView || button.dataset.guidedView || button.dataset.go;
    if (!view) return;
    const opened = openView(view);
    if (opened) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function openView(view) {
    const resolved = resolveView(view);
    const tab = document.querySelector('.tab[data-view="' + resolved + '"]');
    if (tab) {
      tab.click();
      updateLocationBar(resolved);
      return true;
    }
    const section = document.getElementById(resolved);
    if (!section) return false;
    document.querySelectorAll('.view').forEach(item => item.classList.toggle('active', item.id === resolved));
    document.querySelectorAll('.tab').forEach(item => item.classList.toggle('active', item.dataset.view === resolved));
    updateLocationBar(resolved);
    return true;
  }

  function resolveView(view) {
    if (document.getElementById(view) || document.querySelector('.tab[data-view="' + view + '"]')) return view;
    return FALLBACKS[view] || 'dashboard';
  }

  function mountLocationBar() {
    if (document.getElementById('locationBar')) return;
    const bar = document.createElement('div');
    bar.id = 'locationBar';
    bar.className = 'location-bar muted small';
    document.querySelector('main')?.prepend(bar);
  }

  function updateLocationBar(forced) {
    const bar = document.getElementById('locationBar');
    if (!bar) return;
    const active = forced || document.querySelector('.view.active')?.id || 'dashboard';
    const label = active === 'dashboard' ? 'Sesión dirigida' : active === 'review' ? 'Práctica libre' : active === 'settings' ? 'Datos y sincronización' : active === 'lessons' ? 'Materiales' : active;
    bar.textContent = 'Estás en: ' + label;
  }
})();
