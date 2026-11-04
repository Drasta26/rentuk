// Installable-app features: splash screen, offline cache, update message and install help.
// Nothing here talks to any server; the service worker only caches this app's own files.
(function () {
  'use strict';

  // Splash: shown by index.html until the app has drawn its first screen.
  function hideSplash() {
    const splash = document.getElementById('splash');
    if (!splash) return;
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 400);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(hideSplash, 150));
  else setTimeout(hideSplash, 150);

  // Small message bar at the bottom of the screen (used for updates and install help).
  function showBar(id, text, actionLabel, onAction) {
    if (document.getElementById(id)) return;
    const bar = document.createElement('div');
    bar.id = id;
    bar.className = 'pwa-bar';
    bar.setAttribute('role', 'status');
    const p = document.createElement('p');
    p.textContent = text;
    bar.appendChild(p);
    if (actionLabel) {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = actionLabel;
      btn.addEventListener('click', () => onAction(bar));
      bar.appendChild(btn);
    }
    const close = document.createElement('button');
    close.className = 'pwa-close';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '×';
    close.addEventListener('click', () => bar.remove());
    bar.appendChild(close);
    document.body.appendChild(bar);
  }
  window.RentUKPwa = { showBar };

  // Offline cache and "new version" message. Service workers need https or localhost,
  // so this is skipped when index.html is opened straight from a folder.
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;

  // Reload only after the user taps update; the first install also changes controller and must not reload.
  let updateRequested = false;
  function offerUpdate(worker) {
    showBar('pwa-update', 'New version available.', 'Tap to update', bar => {
      bar.remove();
      updateRequested = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateRequested) return;
    updateRequested = false;
    location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          // An existing controller means this is an update, not the first install.
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
        });
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => { /* offline cache unavailable; the app still works online */ });
  });
})();
