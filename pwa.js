// Installable-app features: splash screen, offline cache, update message and install help.
// Nothing here talks to any server; the service worker only caches this app's own files.
(function () {
  'use strict';

  // Android only: lets the CSS lift the bottom menu clear of Android's own navigation bar.
  if (/Android/i.test(navigator.userAgent)) document.documentElement.classList.add('android');

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

  // Install help. Shown on every visit until RentUK is added to the home screen; the × only hides it for this visit.
  const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // The bar reads "[Add] RentUK to your home screen." where "Add" is the button.
  function showInstallBar(onAdd) {
    if (isInstalled() || document.getElementById('pwa-update') || document.getElementById('pwa-install') || document.getElementById('backup-nudge')) return;
    // Not on the first-look landing page: people should see the app before being asked anything.
    if (document.querySelector('.landing')) { setTimeout(() => showInstallBar(onAdd), 4000); return; }
    const bar = document.createElement('div');
    bar.id = 'pwa-install';
    bar.className = 'pwa-bar';
    bar.setAttribute('role', 'status');
    const icon = document.createElement('img');
    icon.src = 'icons/icon-192.png';
    icon.alt = '';
    icon.width = icon.height = 36;
    icon.className = 'pwa-bar-icon';
    const p = document.createElement('p');
    const add = document.createElement('button');
    add.className = 'pwa-add';
    add.type = 'button';
    add.textContent = 'Add';
    add.setAttribute('aria-label', 'Add RentUK to your home screen');
    add.addEventListener('click', () => { bar.remove(); onAdd(); });
    const words = document.createElement('span');
    words.textContent = 'RentUK to your home screen';
    p.className = 'pwa-add-line';
    p.append(add, words);
    const close = document.createElement('button');
    close.className = 'pwa-close';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '×';
    close.addEventListener('click', () => bar.remove());
    bar.append(icon, p, close);
    document.body.appendChild(bar);
  }

  // Android and desktop Chrome/Edge: "Add" opens the browser's own install prompt.
  let installEvent = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installEvent = e;
    showInstallBar(() => {
      installEvent.prompt();
      installEvent.userChoice.finally(() => { installEvent = null; });
    });
  });
  window.addEventListener('appinstalled', () => {
    const bar = document.getElementById('pwa-install');
    if (bar) bar.remove();
  });

  // iPhone and iPad do not let websites install themselves, so "Add"
  // opens a short picture guide with an arrow pointing at Safari's toolbar.
  const SHARE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
  const ADD_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>';
  const DOTS_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
  const isIosSafari = isIos && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent);

  function showIosGuide() {
    if (document.getElementById('pwa-guide')) return;
    const g = document.createElement('div');
    g.id = 'pwa-guide';
    g.setAttribute('role', 'dialog');
    g.setAttribute('aria-modal', 'true');
    g.setAttribute('aria-labelledby', 'pwa-guide-title');
    g.innerHTML =
      '<div class="pwa-guide-card">' +
        '<img src="icons/icon-192.png" alt="" width="56" height="56">' +
        '<h2 id="pwa-guide-title">Add RentUK to your home screen</h2>' +
        '<ol>' +
          '<li><span class="pwa-step-icon">' + SHARE_SVG + '</span><span>Tap <b>Share</b>' + (isIosSafari ? ' in the bar below.<small>Can’t see it? Tap <i class="pwa-inline">' + DOTS_SVG + '</i> first.</small>' : ' in your browser’s menu.') + '</span></li>' +
          '<li><span class="pwa-step-icon">' + ADD_SVG + '</span><span>Tap <b>Add to Home Screen</b>.<small>Scroll down or tap “View more” if needed.</small></span></li>' +
          '<li><span class="pwa-step-icon pwa-step-num">✓</span><span>Tap <b>Add</b>. RentUK appears on your home screen.</span></li>' +
        '</ol>' +
        '<button class="btn" type="button">Got it</button>' +
      '</div>' +
      (isIosSafari ? '<div class="pwa-guide-arrow" aria-hidden="true">↓</div>' : '');
    const close = () => g.remove();
    g.querySelector('.btn').addEventListener('click', close);
    g.addEventListener('click', e => { if (e.target === g) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
    document.body.appendChild(g);
    g.querySelector('.btn').focus();
  }

  // Used by the Home screen's always-visible "Add" message.
  window.RentUKPwa.canAdd = () => !isInstalled();
  window.RentUKPwa.add = () => {
    if (installEvent) { installEvent.prompt(); installEvent.userChoice.finally(() => { installEvent = null; }); }
    else showIosGuide();
  };

  if (isIos && !isInstalled()) {
    setTimeout(() => showInstallBar(showIosGuide), 3000);
  }

  // Offline cache and "new version" message. Service workers need https or localhost,
  // so this is skipped when index.html is opened straight from a folder.
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;

  // Updates install by themselves. When a new version takes over, reload once,
  // unless a form is open (then the new version loads next time the app opens).
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  function offerUpdate(worker) { worker.postMessage({ type: 'SKIP_WAITING' }); }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    if (document.querySelector('.sheet, .sheet-backdrop, dialog[open]')) return;
    reloaded = true;
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
