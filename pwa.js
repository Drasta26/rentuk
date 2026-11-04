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
})();
