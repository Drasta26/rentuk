// Wait for DOM to be fully loaded before running app
document.addEventListener('DOMContentLoaded', function() {
  const esc = window.RentUKLib.escapeHtml;
  const { readJson, writeAll } = window.RentUKLib;
  // localStorage itself can throw (e.g. blocked in some private modes), so fall back to an in-memory store.
  const memoryStore = () => {
    const mem = {};
    return { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  };
  // Demo mode (?demo): made-up data in memory only, so the visitor's real data is never touched.
  const isDemo = new URLSearchParams(location.search).has('demo');
  let store;
  try { store = window.localStorage; store.getItem('_'); } catch (e) { store = null; }
  const storageMissing = !store && !isDemo;
  if (!store || isDemo) store = memoryStore();
  if (isDemo) writeAll(store, window.RentUKLib.demoData(new Date().toISOString().slice(0, 10)));
  let storageWarned = false;
  // Data storage: this browser's localStorage only. Nothing is sent to any server.
  let expenses = readJson(store, 'expenses', []);
  let properties = readJson(store, 'properties', []);
  let currentPropertyId = store.getItem('currentPropertyId') || null;
  let reminders = readJson(store, 'reminders', null) || [
    { id: 1, name: '🔥 Gas Safety Check', dueDate: '', type: 'gas', completed: false, propertyId: null },
    { id: 2, name: '🌡️ Boiler Service', dueDate: '', type: 'maintenance', completed: false, propertyId: null },
    { id: 3, name: '⚡ Electrical Safety Check', dueDate: '', type: 'electrical', completed: false, propertyId: null },
    { id: 4, name: '🛡️ Insurance Renewal', dueDate: '', type: 'insurance', completed: false, propertyId: null },
    { id: 5, name: '📊 EPC Renewal', dueDate: '', type: 'epc', completed: false, propertyId: null },
    { id: 6, name: '🔒 Deposit Protection', dueDate: '', type: 'deposit', completed: false, propertyId: null }
  ];

  // AOB reminders (dynamic)
  let aobReminders = readJson(store, 'aobReminders', []);

  // Get current property
  function getCurrentProperty() {
    return properties.find(p => p.id === currentPropertyId) || (properties.length > 0 ? properties[0] : null);
  }

  // Set current property
  function setCurrentProperty(propertyId) {
    currentPropertyId = propertyId;
    writeAll(store, { currentPropertyId: String(propertyId) });
    loadDashboard();
    loadExpenses();
    loadReminders();
  }

  // Make a popup behave as a proper dialog for keyboard and screen-reader users.
  function makeDialog(el, onClose) {
    const opener = document.activeElement;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    const heading = el.querySelector('h3');
    if (heading) { heading.id = heading.id || 'dlg-' + Date.now(); el.setAttribute('aria-labelledby', heading.id); }
    const focusables = () => [...el.querySelectorAll('button, a[href], input, select, textarea')].filter(n => !n.disabled && n.offsetParent !== null);
    el.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); (onClose || (() => el.remove()))(); }
      if (e.key !== 'Tab') return;
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    new MutationObserver((m, obs) => {
      if (!el.isConnected) { obs.disconnect(); if (opener && opener.isConnected) opener.focus(); }
    }).observe(document.body, { childList: true });
    requestAnimationFrame(() => { const f = el.querySelector('input, .yn') || focusables()[0]; if (f) f.focus(); });
  }

  // Custom Alert System
  function showCustomAlert(message, title = 'RentUK') {
    openSheet(esc(title), `<p class="story">${esc(message)}</p><div class="sheet-actions"><button class="btn" id="alert-ok">OK</button></div>`,
      s => { s.querySelector('#alert-ok').onclick = closeSheet; });
  }

  // Show feedback form for thumbs down
  function showFeedbackForm() {
    // Remove existing alert if any
    const existingAlert = document.getElementById('custom-alert');
    if (existingAlert) {
      existingAlert.remove();
    }

    const alertDiv = document.createElement('div');
    alertDiv.id = 'custom-alert';
    alertDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      padding: 20px;
      z-index: 10000;
      max-width: 400px;
      text-align: center;
    `;

    alertDiv.innerHTML = `
      <h3 style="color: #4f46e5; margin-bottom: 12px;">RentUK says</h3>
      <p style="margin-bottom: 10px; color: #1e293b;">We're sorry to hear that. What could we improve?</p>
      <textarea id="feedback-text" placeholder="Please share your feedback..." 
                 style="width: 100%; height: 80px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 10px;"></textarea>
      <div style="display: flex; gap: 10px; justify-content: center;">
        <button onclick="submitFeedback()" 
                style="background: #4f46e5; color: white; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer;">
          Submit
        </button>
        <button onclick="document.getElementById('custom-alert').remove()" 
                style="background: #ef4444; color: white; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer;">
          Cancel
        </button>
      </div>
    `;

    document.body.appendChild(alertDiv);
    makeDialog(alertDiv);
  }

  function submitFeedback() {
    const feedback = document.getElementById('feedback-text').value.trim();
    if (feedback) {
      showCustomAlert('Thank you for your feedback!', 'RentUK says');
    } else {
      showCustomAlert('Thank you!', 'RentUK says');
    }
  }

  // Start the app (local-only, no sign-in)
  function initApp() {
    loadLocalData();
    loadMainUI();
    if (isDemo) showDemoBanner();
    else if (storageMissing) showCustomAlert('This browser is blocking storage, so nothing you enter will be kept after you close the page. Try a normal (not private) window.', 'Storage unavailable');
  }

  // ---- App shell: one screen at a time, no scrolling. Bottom tabs, tiles, sheets and Next/Back pages. ----
  const svg = d => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M9.5 15.5l2 2 3.5-4"/>'),
    checks: svg('<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
    money: svg('<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><path d="M7 15h4"/>'),
    dates: svg('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/><path d="M9 14.5l2 2 4-4"/>'),
    more: svg('<rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/>'),
    chevron: svg('<path d="M9 6l6 6-6 6"/>'),
    back: svg('<path d="M15 6l-6 6 6 6"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    lock: svg('<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 018 0v3"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    tick: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>')
  };
  const TABS = [
    { id: 'home', label: 'Home' }, { id: 'checks', label: 'Checks' }, { id: 'money', label: 'Money' },
    { id: 'dates', label: 'Dates' }, { id: 'more', label: 'More' }
  ];
  let screen = 'home';
  let moneyView = 'overview';
  const pageAt = {};

  function loadMainUI() {
    document.getElementById('app').innerHTML = `
      <header class="topbar">
        <h1 class="brand"><img src="icons/icon-192.png" alt="" width="32" height="32"><span>RentUK</span></h1>
        <button class="prop-chip" data-action="properties" aria-haspopup="dialog">
          <span id="prop-chip-name"></span>${ICON.chevron}
        </button>
      </header>
      <main id="main" class="screen" tabindex="-1" aria-live="polite"></main>
      <nav class="tabbar" aria-label="Sections">
        ${TABS.map(t => `<button data-tab="${t.id}">${ICON[t.id]}<span>${t.label}</span></button>`).join('')}
      </nav>`;
    document.getElementById('app').addEventListener('click', onAppClick);
    render(true);
  }

  // Old names still used by the setup wizard, import and reminder helpers.
  function loadDashboard() { render(); }
  function loadPropertySelector() { render(); }
  function loadExpenses() { render(); }
  function loadReminders() { render(); }
  function loadTenants() { render(); }

  function go(tab) {
    screen = tab;
    render(true);
    document.getElementById('main').focus({ preventScroll: true });
  }

  function render(animate) {
    const main = document.getElementById('main');
    if (!main) return;
    const p = getCurrentProperty();
    document.getElementById('prop-chip-name').textContent = p ? p.name : 'No property yet';
    document.querySelector('.tabbar').hidden = !p;
    document.querySelector('.prop-chip').hidden = !p;
    main.className = 'screen screen-' + (p ? screen : 'welcome');
    main.innerHTML = p ? SCREENS[screen](p, main.clientHeight) : welcomeScreen();
    document.querySelectorAll('.tabbar button').forEach(b => {
      const on = b.dataset.tab === screen;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    bindCompliance(main);
    if (animate) animateScores(main);
  }

  // How many rows fit in the space left, so lists page instead of scroll.
  function pager(key, items, height, reserved, rowH, renderRow) {
    const per = Math.max(2, Math.floor((height - reserved) / rowH));
    const pages = Math.max(1, Math.ceil(items.length / per));
    const at = Math.min(pageAt[key] || 0, pages - 1);
    pageAt[key] = at;
    const rows = items.slice(at * per, at * per + per).map(renderRow).join('');
    const nav = pages > 1 ? `
      <div class="pager">
        <button class="pager-btn" data-page="${key}" data-dir="-1" ${at === 0 ? 'disabled' : ''}>${ICON.back}Back</button>
        <span class="pager-dots" aria-label="Page ${at + 1} of ${pages}">${Array.from({ length: pages }, (_, i) => `<i class="${i === at ? 'on' : ''}"></i>`).join('')}</span>
        <button class="pager-btn" data-page="${key}" data-dir="1" ${at === pages - 1 ? 'disabled' : ''}>Next${ICON.chevron}</button>
      </div>` : '';
    return `<div class="list">${rows}</div>${nav}`;
  }

  const daysFrom = iso => Math.round((new Date(iso + 'T00:00:00Z') - new Date(todayIso() + 'T00:00:00Z')) / 86400000);
  function whenText(iso) {
    const d = daysFrom(iso);
    const span = n => n < 61 ? `${n} days` : n < 548 ? `${Math.round(n / 30.4)} months` : `${Math.round(n / 365)} years`;
    if (d === 0) return 'Today';
    if (d === 1) return 'Tomorrow';
    if (d > 1) return `In ${span(d)}`;
    return d === -1 ? '1 day overdue' : `${span(-d)} overdue`;
  }
  const toneFor = iso => { const d = daysFrom(iso); return d < 0 ? 'bad' : d <= 14 ? 'warn' : 'ok'; };

  // Your own dates plus ones RentUK already knows: certificate renewals and the lease end.
  function allDates(p) {
    const own = [...reminders.map(r => ({ ...r, kind: 'std' })), ...aobReminders.filter(a => a.name).map(a => ({ ...a, kind: 'aob' }))];
    const auto = [];
    if (p) {
      RentUKLib.complianceScore(p.compliance, todayIso()).items.filter(i => i.expires)
        .forEach(i => auto.push({ id: 'c-' + i.key, kind: 'auto', go: 'checks', name: i.label + ' due', dueDate: i.expires }));
      if (p.tenant && p.tenant.leaseEnd) auto.push({ id: 'lease', kind: 'auto', go: 'tenant', name: 'Lease ends · ' + p.tenant.name, dueDate: p.tenant.leaseEnd });
    }
    const taken = new Set(own.map(d => d.dueDate));
    return [...own, ...auto.filter(d => !taken.has(d.dueDate))]
      .sort((a, b) => (a.completed - b.completed) || (!a.dueDate) - (!b.dueDate) || String(a.dueDate).localeCompare(String(b.dueDate)));
  }

  function nextUp(p) {
    const r = RentUKLib.complianceScore(p.compliance, todayIso());
    const bad = r.items.find(i => i.status === 'expired') || r.items.find(i => i.status === 'missing');
    if (bad) return { tone: 'bad', title: bad.label, text: bad.status === 'expired' ? 'Expired. Renew it now.' : 'Not set yet. Takes a few seconds.', go: 'checks' };
    const due = allDates(p).find(d => !d.completed && d.dueDate);
    if (due && daysFrom(due.dueDate) <= 60) return { tone: toneFor(due.dueDate), title: due.name, text: whenText(due.dueDate), go: 'dates' };
    const soon = r.items.find(i => i.status === 'soon');
    if (soon) return { tone: 'warn', title: soon.label, text: statusText(soon), go: 'checks' };
    return { tone: 'ok', title: 'All clear', text: 'Nothing needs you right now. Enjoy it.', go: null };
  }

  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  function welcomeScreen() {
    return `
      <div class="welcome">
        <img src="icons/icon-512.png" alt="" width="112" height="112" class="welcome-logo">
        <h2 class="welcome-h">Landlording, <span>sorted.</span></h2>
        <p class="welcome-sub">Your legal checks, rent, costs and key dates in one calm place. Set up in about a minute.</p>
        <button class="btn btn-big" data-action="setup">Set up my property</button>
        <a class="btn btn-ghost" href="?demo">Look around with sample data</a>
        <p class="privacy-line">${ICON.lock}<span>Your app. Your data. Your choice. Everything stays on this device.</span></p>
      </div>`;
  }

  const SCREENS = {
    home(p) {
      const r = RentUKLib.complianceScore(p.compliance, todayIso());
      const done = r.items.filter(i => i.status === 'ok').length;
      const n = nextUp(p);
      const est = RentUKLib.rentalEstimate([p], expenses, RentUKLib.taxYearStart(todayIso()));
      const pending = allDates(p).filter(d => !d.completed && d.dueDate && daysFrom(d.dueDate) <= 30).length;
      const t = p.tenant;
      return `
        <div class="hello"><p>${greeting()}</p><h2>${esc(p.name)}</h2></div>
        <button class="hero level-${r.level}" data-tab="checks">
          ${scoreRing(r.score, r.level, 96)}
          <span class="hero-text"><small>Compliance score</small>
            <strong>${r.level === 'great' ? 'You’re on top of it' : r.level === 'fair' ? 'Nearly there' : 'Needs attention'}</strong>
            <span>${done} of ${r.items.length} legal checks done</span></span>
          ${ICON.chevron}
        </button>
        <button class="next tone-${n.tone}" ${n.go ? `data-tab="${n.go}"` : 'disabled'}>
          <span class="next-dot"></span>
          <span class="next-text"><small>Next up</small><strong>${esc(n.title)}</strong><span>${esc(n.text)}</span></span>
          ${n.go ? ICON.chevron : ''}
        </button>
        <div class="tiles">
          <button class="tile" data-tab="money"><span class="tile-ico" aria-hidden="true">💷</span><small>Profit this year</small><strong>${money(est.income - est.costs)}</strong></button>
          <button class="tile" data-tab="dates"><span class="tile-ico" aria-hidden="true">📅</span><small>Next 30 days</small><strong>${pending ? pending + (pending === 1 ? ' date' : ' dates') : 'All clear'}</strong></button>
          <button class="tile" data-action="tenant"><span class="tile-ico" aria-hidden="true">👤</span><small>Tenant</small><strong>${t ? esc(t.name) : 'Add tenant'}</strong></button>
          <button class="tile" data-action="share"><span class="tile-ico" aria-hidden="true">📣</span><small>Your score</small><strong>Share it</strong></button>
        </div>`;
    },

    checks(p, h) {
      const r = RentUKLib.complianceScore(p.compliance, todayIso());
      const done = r.items.filter(i => i.status === 'ok').length;
      const row = item => `
        <div class="row check-row status-${item.status}">
          <span class="dot dot-${item.status}" aria-hidden="true"></span>
          <button class="row-text" data-action="check-info" data-key="${esc(item.key)}">
            <strong>${esc(item.label)}</strong><small>${statusText(item)}</small>
          </button>
          ${item.kind === 'yes'
            ? `<button class="check-toggle ${item.status === 'ok' ? 'on' : ''}" data-check="${esc(item.key)}" aria-pressed="${item.status === 'ok'}" aria-label="${esc(item.label)} done">${item.status === 'ok' ? ICON.tick : 'No'}</button>`
            : `<button class="check-pill ${item.status === 'missing' ? 'add' : ''}" data-action="check-info" data-key="${esc(item.key)}" aria-label="${item.status === 'missing' ? 'Add' : 'Change'} date of last ${esc(item.label)}">${item.status === 'missing' ? 'Add date' : 'Update'}</button>`}
        </div>`;
      return `
        <div class="screen-head">
          ${scoreRing(r.score, r.level, 64)}
          <div><h2>🛡️ Legal checks</h2><p>${done} of ${r.items.length} done · tap any check for help</p></div>
        </div>
        ${pager('checks', r.items, h, 150, 70, row)}
        <p class="fine">England rules, checked against GOV.UK and HSE on 30 Oct 2026. A guide, not legal advice.</p>`;
    },

    money(p, h) {
      const seg = `
        <div class="seg" role="group" aria-label="Money view">
          ${[['overview', 'Overview'], ['expenses', 'Costs'], ['tax', 'Tax']].map(([id, label]) =>
            `<button data-money="${id}" aria-pressed="${moneyView === id}" class="${moneyView === id ? 'on' : ''}">${label}</button>`).join('')}
        </div>`;
      const start = RentUKLib.taxYearStart(todayIso());
      if (moneyView === 'tax') {
        const est = RentUKLib.rentalEstimate(properties, expenses, start);
        return `${seg}
          <h2 class="sub-h">Tax year ${esc(est.taxYear.label)} · all properties</h2>
          <div class="stats">
            <div class="stat"><small>Rent</small><strong>${money(est.income)}</strong></div>
            <div class="stat"><small>${est.useAllowance ? 'Allowance' : 'Costs'}</small><strong>−${money(est.useAllowance ? Math.min(1000, est.income) : est.costs)}</strong></div>
            <div class="stat stat-hi"><small>Profit</small><strong>${money(est.profit)}</strong></div>
          </div>
          <div class="panel">
            <p>Tax on that profit is about</p>
            <div class="bands"><span><strong>${money(est.taxAt.basic)}</strong>basic 20%</span><span><strong>${money(est.taxAt.higher)}</strong>higher 40%</span><span><strong>${money(est.taxAt.additional)}</strong>top 45%</span></div>
          </div>
          <div class="note tone-${est.mtd.due ? 'warn' : 'ok'}">${est.mtd.due
            ? `Making Tax Digital likely applies from ${esc(est.mtd.from)}. Rent is over ${money(est.mtd.over)}.`
            : 'Making Tax Digital is not triggered by your rent alone.'}</div>
          <button class="link-btn" data-action="tax-info">${ICON.info}How this is worked out</button>`;
      }
      if (moneyView === 'expenses') {
        const list = expenses.filter(e => e.propertyId === p.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
        return `${seg}
          <button class="btn btn-add" data-action="add-expense">${ICON.plus}Add a cost</button>
          ${list.length ? pager('expenses', list, h, 150, 66, costRow) : '<p class="empty">No costs yet. Add repairs, insurance or fees and they count towards your tax estimate.</p>'}`;
      }
      const est = RentUKLib.rentalEstimate([p], expenses, start);
      const rent = p.tenant ? parseFloat(p.tenant.rentAmount) || 0 : 0;
      return `${seg}
        <h2 class="sub-h">${esc(p.name)} · tax year ${esc(est.taxYear.label)}</h2>
        <div class="big-stat"><small>Profit so far this year (projected)</small><strong>${money(est.income - est.costs)}</strong></div>
        <div class="stats">
          <div class="stat"><small>Monthly rent</small><strong>${money(rent)}</strong></div>
          <div class="stat"><small>Rent this year</small><strong>${money(est.income)}</strong></div>
          <div class="stat"><small>Costs</small><strong>${money(est.costs)}</strong></div>
        </div>
        <button class="btn btn-add" data-action="add-expense">${ICON.plus}Add a cost</button>
        ${recentCosts(p, h)}`;
    },

    dates(p, h) {
      const row = d => d.kind === 'auto' ? `
        <div class="row">
          <span class="auto-badge" aria-hidden="true">${d.go === 'tenant' ? '👤' : '🛡️'}</span>
          <button class="row-text" ${d.go === 'tenant' ? 'data-action="tenant"' : 'data-tab="checks"'}>
            <strong>${esc(d.name)}</strong>
            <small class="tone-${toneFor(d.dueDate)}">${esc(ukDate(d.dueDate))} · ${whenText(d.dueDate)}</small>
          </button>
        </div>` : `
        <div class="row ${d.completed ? 'done' : ''}">
          <button class="tick-btn ${d.completed ? 'on' : ''}" data-action="toggle-date" data-kind="${d.kind}" data-id="${esc(d.id)}" aria-pressed="${!!d.completed}" aria-label="Mark ${esc(d.name)} done">${ICON.tick}</button>
          <button class="row-text" data-action="date" data-kind="${d.kind}" data-id="${esc(d.id)}">
            <strong>${esc(d.name)}</strong>
            <small class="${d.dueDate && !d.completed ? 'tone-' + toneFor(d.dueDate) : ''}">${d.completed ? 'Done' : d.dueDate ? `${esc(ukDate(d.dueDate))} · ${whenText(d.dueDate)}` : 'Tap to set a date'}</small>
          </button>
        </div>`;
      return `
        <div class="screen-title"><h2>📅 Key dates</h2>
          <button class="icon-btn icon-btn-hi" data-action="add-date" aria-label="Add a date">${ICON.plus}</button></div>
        ${pager('dates', allDates(p), h, 190, 66, row)}
        ${dateIdeas(h - 190 - allDates(p).length * 74)}
        <button class="btn btn-ghost btn-foot" data-action="calendar">Add all to my phone’s calendar</button>`;
    },

    more() {
      const item = (action, icon, title, text) =>
        `<button class="tile tile-wide" data-action="${action}"><span class="tile-emoji" aria-hidden="true">${icon}</span><span><strong>${title}</strong><small>${text}</small></span></button>`;
      return `
        <h2 class="screen-h">Everything else</h2>
        <div class="tiles tiles-more">
          ${item('tenant', '👤', 'Tenant', 'Name, lease, rent')}
          ${item('properties', '🏘️', 'Properties', 'Switch or add')}
          ${item('move-in', '📋', 'Move-in pack', 'Print-ready checklist')}
          ${item('calendar', '📅', 'Calendar', 'All dates, 14-day alerts')}
          ${item('share', '📣', 'Share score', 'No personal details')}
          ${item('data', '🔒', 'Your data', 'Backup, restore, delete')}
          ${item('feedback', '💬', 'Feedback', 'Tell us what to fix')}
          ${item('about', '✨', 'About', 'Why RentUK exists')}
        </div>
        <p class="privacy-line">${ICON.lock}<span>Everything stays on this device. We never see it.</span></p>`;
    }
  };

  // One-tap ideas for common landlord dates, shown only when there is room.
  const IDEAS = ['🔥 Boiler service', '🔍 Property inspection', '💷 Rent review', '📝 Lease renewal talk'];
  function dateIdeas(spare) {
    if (spare < 120) return '';
    return `<div class="list-head"><span>Quick add</span></div>
      <div class="chips">${IDEAS.map(i => `<button class="chip" data-action="idea" data-name="${esc(i)}">${esc(i)}</button>`).join('')}</div>`;
  }

  // Fill spare space on Money with the latest costs, only as many as fit.
  function recentCosts(p, h) {
    const fit = Math.floor((h - 440) / 66);
    const list = expenses.filter(e => e.propertyId === p.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (fit < 1 || !list.length) return '';
    return `<div class="list-head"><span>Latest costs</span>${list.length > fit ? '<button class="link-btn" data-money="expenses">See all</button>' : ''}</div>
      <div class="list">${list.slice(0, fit).map(costRow).join('')}</div>`;
  }
  const costRow = e => `
    <button class="row" data-action="expense" data-id="${esc(e.id)}">
      <span class="cat" aria-hidden="true">${CATEGORY[e.category] ? CATEGORY[e.category][0] : '✨'}</span>
      <span class="row-text"><strong>${esc(e.description)}</strong><small>${esc(ukDate(e.date))}</small></span>
      <span class="amount">${money2(e.amount)}</span>
    </button>`;

  const CATEGORY = { maintenance: ['🔧', 'Maintenance'], repairs: ['🛠️', 'Repairs'], insurance: ['🛡️', 'Insurance'], utilities: ['⚡', 'Utilities'], other: ['✨', 'Other'] };
  const money2 = n => '£' + Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function onAppClick(e) {
    const t = e.target.closest('button, a');
    if (!t) return;
    if (t.dataset.tab) return go(t.dataset.tab);
    if (t.dataset.page) {
      pageAt[t.dataset.page] = (pageAt[t.dataset.page] || 0) + Number(t.dataset.dir);
      render();
      const again = document.querySelector(`[data-page="${t.dataset.page}"][data-dir="${t.dataset.dir}"]:not([disabled])`)
        || document.querySelector(`[data-page="${t.dataset.page}"]:not([disabled])`);
      if (again) again.focus();
      return;
    }
    if (t.dataset.money) { moneyView = t.dataset.money; render(); document.querySelector(`[data-money="${moneyView}"]`).focus(); return; }
    const a = t.dataset.action;
    if (!a) return;
    const p = getCurrentProperty();
    const actions = {
      setup: showSetupWizard,
      properties: propertiesSheet,
      tenant: () => tenantSheet(p),
      share: shareScore,
      calendar: exportCalendar,
      'move-in': openMoveInPack,
      data: dataSheet,
      feedback: feedbackSheet,
      about: aboutSheet,
      'tax-info': taxInfoSheet,
      'check-info': () => checkInfoSheet(t.dataset.key),
      'add-expense': () => expenseSheet(p),
      expense: () => expenseSheet(p, expenses.find(x => String(x.id) === t.dataset.id)),
      'add-date': () => dateSheet(),
      idea: () => dateSheet(null, null, t.dataset.name),
      date: () => dateSheet(t.dataset.kind, t.dataset.id),
      'toggle-date': () => t.dataset.kind === 'aob' ? toggleAOBStatus(t.dataset.id) : toggleReminderStatus(t.dataset.id)
    };
    if (actions[a]) actions[a]();
  }

  // ---- Sheets: every form opens here, sized to fit the screen ----
  function openSheet(title, body, onMount) {
    closeSheet();
    const overlay = document.createElement('div');
    overlay.className = 'sheet-overlay';
    overlay.id = 'sheet';
    overlay.innerHTML = `<div class="sheet"><div class="sheet-head"><h3>${title}</h3>
      <button class="icon-btn sheet-close" aria-label="Close">${ICON.close}</button></div>${body}</div>`;
    document.body.appendChild(overlay);
    makeDialog(overlay, closeSheet);
    overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('.sheet-close')) closeSheet(); });
    if (onMount) onMount(overlay);
    const first = overlay.querySelector('.sheet input, .sheet select, .sheet button:not(.sheet-close)') || overlay.querySelector('.sheet-close');
    if (first) first.focus();
    return overlay;
  }
  function closeSheet() { const s = document.getElementById('sheet'); if (s) s.remove(); }

  const field = (id, label, type, value, extra = '') =>
    `<label class="field" for="${id}"><span>${label}</span><input id="${id}" type="${type}" value="${esc(value == null ? '' : value)}" ${extra}></label>`;

  function expenseSheet(p, existing) {
    let cat = existing ? existing.category : 'repairs';
    openSheet(existing ? 'Cost' : 'Add a cost', `
      ${field('x-desc', 'What was it?', 'text', existing && existing.description, 'placeholder="Boiler repair" autocomplete="off"')}
      <div class="field-row">
        ${field('x-amount', 'Amount (£)', 'number', existing && existing.amount, 'inputmode="decimal" step="0.01" min="0" placeholder="0.00"')}
        ${field('x-date', 'Date', 'date', existing ? existing.date : todayIso())}
      </div>
      <div class="chips" role="group" aria-label="Category">
        ${Object.entries(CATEGORY).map(([k, [ic, label]]) => `<button class="chip ${k === cat ? 'on' : ''}" data-cat="${k}" aria-pressed="${k === cat}">${ic} ${label}</button>`).join('')}
      </div>
      <div class="sheet-actions">
        ${existing ? '<button class="btn btn-quiet" id="x-del">Delete</button>' : ''}
        <button class="btn" id="x-save">${existing ? 'Save changes' : 'Add cost'}</button>
      </div>`, s => {
      s.querySelectorAll('.chip').forEach(c => c.onclick = () => {
        cat = c.dataset.cat;
        s.querySelectorAll('.chip').forEach(o => { o.classList.toggle('on', o === c); o.setAttribute('aria-pressed', o === c); });
      });
      if (existing) s.querySelector('#x-del').onclick = () => {
        expenses = expenses.filter(x => x !== existing); saveData(); closeSheet(); render();
      };
      s.querySelector('#x-save').onclick = () => {
        const description = s.querySelector('#x-desc').value.trim();
        const amount = parseFloat(s.querySelector('#x-amount').value);
        const date = s.querySelector('#x-date').value;
        if (!description || !(amount >= 0) || !date) return sheetError(s, 'Add what it was, the amount and the date.');
        if (existing) Object.assign(existing, { description, amount, date, category: cat });
        else expenses.push({ id: Date.now(), date, description, amount, category: cat, propertyId: p.id });
        saveData(); closeSheet(); moneyView = 'expenses'; screen = 'money'; render();
      };
    });
  }

  function dateSheet(kind, id, preset) {
    const list = kind === 'aob' ? aobReminders : reminders;
    const existing = kind ? list.find(r => String(r.id) === String(id)) : null;
    openSheet(existing ? 'Key date' : 'Add a date', `
      ${field('d-name', 'What is it?', 'text', existing ? existing.name : preset, 'placeholder="Check smoke alarms" autocomplete="off"')}
      ${field('d-date', 'When', 'date', existing && existing.dueDate)}
      <div class="sheet-actions">
        ${existing ? '<button class="btn btn-quiet" id="d-del">Delete</button>' : ''}
        <button class="btn" id="d-save">${existing ? 'Save' : 'Add date'}</button>
      </div>`, s => {
      if (preset) s.querySelector('#d-date').focus();
      if (existing) s.querySelector('#d-del').onclick = () => {
        closeSheet();
        if (kind === 'aob') deleteAOBReminder(existing.id); else deleteReminder(existing.id);
      };
      s.querySelector('#d-save').onclick = () => {
        const name = s.querySelector('#d-name').value.trim();
        const dueDate = s.querySelector('#d-date').value;
        if (!name) return sheetError(s, 'Give it a name.');
        if (existing) Object.assign(existing, { name, dueDate });
        else aobReminders.push({ id: 'aob_' + Date.now(), name, dueDate, completed: false });
        saveData(); closeSheet(); render();
      };
    });
  }

  function tenantSheet(p) {
    if (!p) return;
    const t = p.tenant || {};
    openSheet(`Tenant · ${esc(p.name)}`, `
      ${field('t-name', 'Name', 'text', t.name, 'autocomplete="off"')}
      ${field('t-contact', 'Phone or email', 'text', t.contact, 'autocomplete="off"')}
      <div class="field-row">
        ${field('t-start', 'Lease start', 'date', t.leaseStart)}
        ${field('t-end', 'Lease end', 'date', t.leaseEnd)}
      </div>
      ${field('t-rent', 'Monthly rent (£)', 'number', t.rentAmount, 'inputmode="decimal" min="0"')}
      <div class="sheet-actions">
        ${p.tenant ? '<button class="btn btn-quiet" id="t-del">Remove tenant</button>' : ''}
        <button class="btn" id="t-save">Save</button>
      </div>`, s => {
      if (p.tenant) s.querySelector('#t-del').onclick = () => { p.tenant = null; saveData(); closeSheet(); render(); };
      s.querySelector('#t-save').onclick = () => {
        const name = s.querySelector('#t-name').value.trim();
        if (!name) return sheetError(s, 'Add the tenant’s name.');
        p.tenant = { name, contact: s.querySelector('#t-contact').value.trim(), leaseStart: s.querySelector('#t-start').value,
          leaseEnd: s.querySelector('#t-end').value, rentAmount: parseFloat(s.querySelector('#t-rent').value) || 0 };
        saveData(); closeSheet(); render();
      };
    });
  }

  function editTenant(propertyId) { tenantSheet(properties.find(p => p.id === propertyId)); }

  function propertiesSheet() {
    const cur = getCurrentProperty();
    openSheet('Your properties', `
      <div class="pick-list">${properties.map(p => `
        <button class="pick ${cur && p.id === cur.id ? 'on' : ''}" data-id="${esc(p.id)}" aria-pressed="${!!(cur && p.id === cur.id)}">
          <span>🏠</span><strong>${esc(p.name)}</strong>${cur && p.id === cur.id ? ICON.tick : ''}</button>`).join('')}
      </div>
      <button class="btn btn-add" id="p-add">${ICON.plus}Add a property</button>`, s => {
      s.querySelectorAll('.pick').forEach(b => b.onclick = () => { closeSheet(); Object.keys(pageAt).forEach(k => delete pageAt[k]); setCurrentProperty(b.dataset.id); });
      s.querySelector('#p-add').onclick = () => { closeSheet(); showSetupWizard(); };
    });
  }

  function dataSheet() {
    openSheet('Your data', `
      <p class="sheet-lead">${ICON.lock}<span>Everything is stored only in this browser on this device. We never see it. Clearing browser data deletes it, so keep a backup.</span></p>
      <div class="stack">
        <button class="btn" id="g-export">⬇️ Save a backup file</button>
        <label class="btn btn-ghost">⬆️ Restore from a backup<input type="file" id="g-import" accept="application/json,.json" hidden></label>
        <button class="btn btn-danger" id="delete-all-btn">🗑️ Delete all my data</button>
      </div>`, s => {
      s.querySelector('#g-export').onclick = exportData;
      s.querySelector('#g-import').onchange = ev => { closeSheet(); importData(ev); };
      s.querySelector('#delete-all-btn').onclick = () => { closeSheet(); confirmDeleteAll(); };
    });
  }

  function feedbackSheet() {
    openSheet('How is RentUK for you?', `
      <div class="stack">
        <button class="btn" id="f-up">👍 It’s helping</button>
        <button class="btn btn-ghost" id="f-down">👎 Something’s not right</button>
      </div>
      <p class="fine">Nothing is sent anywhere. To tell us more, open an issue on the project’s GitHub page.</p>`, s => {
      s.querySelector('#f-up').onclick = () => showCustomAlert('Thank you. That means a lot.', 'Thanks');
      s.querySelector('#f-down').onclick = () => showCustomAlert('Sorry about that. Please tell us what went wrong on GitHub (github.com/Drasta26/rentuk/issues). Your data is never included.', 'Help us fix it');
    });
  }

  function aboutSheet() {
    openSheet('Why RentUK exists', `
      <p class="story">Most landlords in the UK own one or two homes. The rules keep changing, the paperwork piles up, and the apps that help usually want your data and a monthly fee.</p>
      <p class="story">RentUK does the opposite. It keeps your checks, dates and money in one calm place, on your phone, and nowhere else.</p>
      <ul class="usp">
        <li><strong>We never see your data.</strong> No accounts, no tracking, nothing to breach.</li>
        <li><strong>You own everything.</strong> Back up, restore or delete it any time. Open-source code.</li>
        <li><strong>Fair by design.</strong> Free core. No subscription traps.</li>
      </ul>
      <p class="tagline">Your app. Your data. Your choice.</p>`);
  }

  function taxInfoSheet() {
    openSheet('How the tax estimate works', `
      <p class="story">Rent is worked out from each tenant’s monthly rent and lease dates inside this tax year (6 April to 5 April). Costs are the ones you’ve added.</p>
      <p class="story">If your costs are under £1,000, the £1,000 property allowance gives a lower profit, so we use it. You can claim one or the other, not both.</p>
      <p class="story">It leaves out mortgage interest relief, other income, joint ownership and your personal allowance. It’s a rough guide, not tax advice. Check with HMRC or an accountant.</p>`);
  }

  function checkInfoSheet(key) {
    const item = RentUKLib.COMPLIANCE_ITEMS.find(i => i.key === key);
    if (!item) return;
    const p = getCurrentProperty();
    const cur = (p.compliance || {})[key] || '';
    openSheet(esc(item.label), `
      <p class="story">${esc(item.hint)}</p>
      ${item.kind === 'date' ? `${field('c-date', 'Date of the last one', 'date', cur, `max="${todayIso()}"`)}
      <div class="sheet-actions">${cur ? '<button class="btn btn-quiet" id="c-clear">Clear</button>' : ''}<button class="btn" id="c-save">Save</button></div>` : ''}
      <a class="btn btn-ghost" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Read the official guidance ↗</a>
      <p class="fine">England rules, simplified. A guide, not legal advice.</p>`, s => {
      if (item.kind !== 'date') return;
      s.querySelector('#c-save').onclick = () => { const v = s.querySelector('#c-date').value; closeSheet(); updateCompliance(key, v); };
      if (cur) s.querySelector('#c-clear').onclick = () => { closeSheet(); updateCompliance(key, ''); };
    });
  }

  function sheetError(s, msg) {
    let el = s.querySelector('.sheet-error');
    if (!el) { el = document.createElement('p'); el.className = 'sheet-error'; el.setAttribute('role', 'alert'); s.querySelector('.sheet-actions').before(el); }
    el.textContent = msg;
  }

  // Show add property form
  function showAddPropertyForm() {
    const alertDiv = document.createElement('div');
    alertDiv.id = 'custom-alert';
    alertDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      padding: 20px;
      z-index: 10000;
      max-width: 500px;
      width: 90%;
      color: #1e293b;
    `;

    alertDiv.innerHTML = `
      <h3 style="color: #4f46e5; margin-bottom: 16px;">Add New Property</h3>
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Property Name</label>
        <input type="text" id="property-name" placeholder="e.g., 123 Main Street" 
               style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px;">
      </div>
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Address</label>
        <input type="text" id="property-address" placeholder="Full property address" 
               style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px;">
      </div>
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button id="confirm-add-property" 
                style="background: #4f46e5; color: white; padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer;">
          Add Property
        </button>
        <button onclick="document.getElementById('custom-alert').remove()" 
                style="background: #94a3b8; color: white; padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer;">
          Cancel
        </button>
      </div>
    `;

    document.body.appendChild(alertDiv);
    makeDialog(alertDiv);

    // Add event listener to the button after the element is created
    setTimeout(() => {
      const confirmButton = document.getElementById('confirm-add-property');
      if (confirmButton) {
        confirmButton.addEventListener('click', addNewProperty);
      }
    }, 100);
  }

  // Add new property - FIXED VERSION
  function addNewProperty() {
    const alertDiv = document.getElementById('custom-alert');
    if (!alertDiv) return;

    const nameInput = alertDiv.querySelector('#property-name');
    const addressInput = alertDiv.querySelector('#property-address');

    if (!nameInput || !addressInput) {
      showCustomAlert('Form elements not found', 'RentUK says');
      return;
    }

    const name = nameInput.value.trim();
    const address = addressInput.value.trim();

    if (!name) {
      showCustomAlert('Please enter a property name', 'RentUK says');
      return;
    }

    const newProperty = {
      id: 'prop_' + Date.now(),
      name: name,
      address: address,
      tenant: null,
      createdAt: new Date().toISOString()
    };

    properties.push(newProperty);

    // Set as current property if it's the first one
    if (properties.length === 1) {
      currentPropertyId = newProperty.id;
      writeAll(store, { currentPropertyId: String(currentPropertyId) });
    }

    saveData();
    alertDiv.remove();
    loadPropertySelector();
    loadDashboard();
    showCustomAlert('Property added successfully!', 'RentUK says');
  }

  // Load local data
  function loadLocalData() {
    expenses = readJson(store, 'expenses', []);
    properties = readJson(store, 'properties', []);
    currentPropertyId = store.getItem('currentPropertyId') || (properties.length > 0 ? properties[0].id : null);
    reminders = readJson(store, 'reminders', null) || [
      { id: 1, name: '🔥 Gas Safety Check', dueDate: '', type: 'gas', completed: false, propertyId: null },
      { id: 2, name: '🌡️ Boiler Service', dueDate: '', type: 'maintenance', completed: false, propertyId: null },
      { id: 3, name: '⚡ Electrical Safety Check', dueDate: '', type: 'electrical', completed: false, propertyId: null },
      { id: 4, name: '🛡️ Insurance Renewal', dueDate: '', type: 'insurance', completed: false, propertyId: null },
      { id: 5, name: '📊 EPC Renewal', dueDate: '', type: 'epc', completed: false, propertyId: null },
      { id: 6, name: '🔒 Deposit Protection', dueDate: '', type: 'deposit', completed: false, propertyId: null }
    ];
    aobReminders = readJson(store, 'aobReminders', []);
  }

  // Save local data
  function saveLocalData() {
    const result = writeAll(store, {
      expenses, properties, reminders, aobReminders,
      currentPropertyId: currentPropertyId === null ? '' : String(currentPropertyId)
    });
    if (!result.ok && !storageWarned) {
      storageWarned = true;
      showCustomAlert(result.reason === 'full'
        ? 'Browser storage is full, so your latest change was not saved. Export a backup now, then delete old expenses or receipts.'
        : 'This browser is blocking storage, so changes will be lost when you close the page. Export a backup before leaving.',
        'Not saved');
    }
    return result.ok;
  }

  // Save data (this device only)
  function saveData() {
    saveLocalData();
  }

  // Export data functionality
  function exportData() {
    const dataStr = JSON.stringify({ expenses, properties, currentPropertyId, reminders, aobReminders }, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

    const exportFileDefaultName = `rentuk-backup-${new Date().toISOString().slice(0,10)}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }

  // Import data functionality
  function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > window.RentUKLib.MAX_BACKUP_BYTES) {
      showCustomAlert('Backup file is too large (over 5 MB).', 'RentUK says');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const result = window.RentUKLib.validateBackup(JSON.parse(e.target.result));
        if (!result.ok) {
          showCustomAlert(result.error, 'RentUK says');
          return;
        }
        const importedData = result.data;
        expenses = importedData.expenses || expenses;
        properties = importedData.properties || properties;
        currentPropertyId = importedData.currentPropertyId || currentPropertyId;
        reminders = importedData.reminders || reminders;
        aobReminders = importedData.aobReminders || aobReminders;
        saveData();
        showCustomAlert(result.skipped > 0
          ? `Data imported. ${result.skipped} invalid record(s) were skipped.`
          : 'Data imported successfully!', 'RentUK says');
        loadPropertySelector();
        loadDashboard();
        loadExpenses();
        loadReminders();
        loadTenants();
      } catch (error) {
        showCustomAlert('Error importing data. Please check the file format.', 'RentUK says');
      }
    };
    reader.readAsText(file);
  }


  // Function to toggle reminder status
  function toggleReminderStatus(id) {
    const reminder = reminders.find(r => r.id == id);
    if (reminder) {
      reminder.completed = !reminder.completed;
      saveData();
      loadReminders(); // Refresh UI
      loadDashboard(); // Update dashboard too
    }
  }

  // Function to toggle AOB status
  function toggleAOBStatus(id) {
    const aob = aobReminders.find(a => a.id === id);
    if (aob) {
      aob.completed = !aob.completed;
      saveData();
      loadReminders(); // Refresh UI
      loadDashboard(); // Update dashboard too
    }
  }

  // Function to update reminder date
  function updateReminderDate(id, value) {
    const reminder = reminders.find(r => r.id == id);
    if (reminder) {
      reminder.dueDate = value;
      saveData();
      loadDashboard(); // Update dashboard too
    }
  }

  // Delete reminder function
  function deleteReminder(id) {
    reminders = reminders.filter(r => r.id != id);
    saveData();
    loadReminders();
    loadDashboard();
  }

  // Delete AOB reminder function
  function deleteAOBReminder(id) {
    aobReminders = aobReminders.filter(a => a.id !== id);
    saveData();
    loadReminders();
    loadDashboard();
  }

  // ---- Compliance Score ----
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const STATUS_ICON = { ok: '✅', soon: '⏳', expired: '❌', missing: '⚪' };

  const ukDate = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  function statusText(item) {
    if (item.kind === 'yes') return item.status === 'ok' ? 'Done' : 'Not done yet';
    if (item.status === 'missing') return 'Add the date of the last one';
    if (item.status === 'expired') return `Expired ${esc(ukDate(item.expires))}`;
    return item.daysLeft <= 60 ? `Renew by ${esc(ukDate(item.expires))} · ${item.daysLeft === 1 ? '1 day' : item.daysLeft + ' days'} left` : `Valid until ${esc(ukDate(item.expires))}`;
  }

  function scoreRing(score, level, size) {
    return `<div class="score-ring level-${level}" style="--p:${score}; --size:${size}px" role="img" aria-label="Compliance score ${score} out of 100">
      <span class="score-num" data-target="${score}" aria-hidden="true">${score}</span></div>`;
  }

  function animateScores(root) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    root.querySelectorAll('.score-num[data-target]').forEach(el => {
      const target = Number(el.dataset.target);
      const ring = el.parentElement;
      const start = performance.now();
      const step = now => {
        const t = Math.min(1, (now - start) / 900);
        const v = Math.round(target * (1 - Math.pow(1 - t, 3)));
        el.textContent = v;
        ring.style.setProperty('--p', v);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  function updateCompliance(key, value) {
    const property = getCurrentProperty();
    if (!property) return;
    property.compliance = { ...(property.compliance || {}) };
    if (value === '' || value === false) delete property.compliance[key];
    else property.compliance[key] = value;
    saveData();
    loadDashboard();
  }

  function bindCompliance(root) {
    root.querySelectorAll('.check-toggle').forEach(btn =>
      btn.addEventListener('click', () => updateCompliance(btn.dataset.check, !btn.classList.contains('on'))));
    root.querySelectorAll('.check-date').forEach(input =>
      input.addEventListener('change', () => updateCompliance(input.dataset.check, input.value)));
    const share = root.querySelector('#share-score-btn');
    if (share) share.addEventListener('click', shareScore);
    const cal = root.querySelector('#calendar-btn');
    if (cal) cal.addEventListener('click', exportCalendar);
    const pack = root.querySelector('#move-in-btn');
    if (pack) pack.addEventListener('click', openMoveInPack);
  }


  const money = n => '£' + Math.round(n).toLocaleString('en-GB');

  // ---- Calendar export ----
  function exportCalendar() {
    const events = [];
    const today = todayIso();
    properties.forEach(p => {
      RentUKLib.complianceScore(p.compliance, today).items
        .filter(i => i.expires)
        .forEach(i => events.push({
          uid: `${p.id}-${i.key}-${i.expires}`, date: i.expires,
          title: `Renew ${i.label} – ${p.name}`,
          description: `${i.hint}. Guidance: ${i.url}`
        }));
    });
    [...reminders, ...aobReminders].filter(r => r.dueDate && !r.completed && r.dueDate >= today)
      .forEach(r => events.push({ uid: `reminder-${r.id}-${r.dueDate}`, date: r.dueDate, title: r.name }));
    if (!events.length) {
      showCustomAlert('Nothing to add yet. Add certificate dates in the Compliance Score, or reminder due dates, then try again.', 'No dates yet');
      return;
    }
    const blob = new Blob([RentUKLib.buildIcs(events, new Date().toISOString())], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'rentuk-reminders.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showCustomAlert(`Saved ${events.length} date${events.length === 1 ? '' : 's'} as rentuk-reminders.ics. Open it to add them to Apple, Google or Outlook calendar — each one alerts you 14 days before.`, 'Calendar file ready');
  }

  // ---- Tenant move-in pack (printable) ----
  function openMoveInPack() {
    const p = getCurrentProperty();
    if (!p) return;
    const r = RentUKLib.complianceScore(p.compliance, todayIso());
    const box = ok => ok ? '☑' : '☐';
    const item = key => r.items.find(i => i.key === key);
    const certLine = key => {
      const i = item(key);
      return `<li>${box(i.status === 'ok')} ${esc(i.label)}${i.expires ? ` — valid until ${esc(ukDate(i.expires))}` : ''}: copy given to tenant</li>`;
    };
    const rooms = ['Entrance / hall', 'Living room', 'Kitchen', 'Bathroom', 'Bedroom 1', 'Bedroom 2', 'Garden / outside'];
    const t = p.tenant || {};
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Move-in pack – ${esc(p.name)}</title>
      <style>
        body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; max-width: 780px; margin: 24px auto; padding: 0 16px; }
        h1 { font-size: 22px; margin-bottom: 0; } h2 { font-size: 16px; border-bottom: 2px solid #6366f1; padding-bottom: 4px; margin-top: 24px; }
        ul { list-style: none; padding: 0; } li { padding: 3px 0; }
        table { width: 100%; border-collapse: collapse; } td, th { border: 1px solid #999; padding: 6px; text-align: left; vertical-align: top; }
        td { height: 28px; } .meta { color: #555; } .note { color: #555; font-size: 12px; margin-top: 24px; }
        .print { background: #4f46e5; color: #fff; border: 0; padding: 10px 18px; border-radius: 8px; font-size: 15px; cursor: pointer; }
        @media print { .print { display: none; } body { margin: 0; } }
      </style></head><body>
      <button class="print" onclick="window.print()">🖨️ Print or save as PDF</button>
      <h1>Tenant move-in pack</h1>
      <p class="meta">${esc(p.name)}${p.address ? ' · ' + esc(p.address) : ''}<br>
        Tenant: ${esc(t.name || '____________________')} · Move-in date: ${esc(t.leaseStart ? ukDate(t.leaseStart) : '____________')}</p>

      <h2>1. Before the tenant moves in</h2>
      <ul>
        <li>${box(item('rightToRent').status === 'ok')} Right to Rent checked for every adult, copies of documents kept</li>
        <li>${box(item('rraInfo').status === 'ok')} Renters' Rights Act Information Sheet or written statement of terms given (as a printed copy or attached PDF — a link alone is not valid)</li>
        ${certLine('gas')}
        ${certLine('eicr')}
        ${certLine('epc')}
      </ul>

      <h2>2. On move-in day</h2>
      <ul>
        <li>${box(item('alarms').status === 'ok')} Every smoke alarm and CO alarm tested and working (tenant initials: ______)</li>
        <li>☐ Inventory below completed and signed by both</li>
        <li>☐ Meter readings taken (below)</li>
        <li>☐ Keys handed over (below)</li>
        <li>☐ Stopcock, boiler, fuse box and alarm locations shown to tenant</li>
      </ul>

      <h2>3. Within 30 days</h2>
      <ul>
        <li>${box(item('deposit').status === 'ok')} Deposit protected in a government-backed scheme and its required information given to the tenant</li>
      </ul>

      <h2>Meter readings</h2>
      <table><tr><th>Meter</th><th>Reading</th><th>Serial / location</th></tr>
        <tr><td>Electricity</td><td></td><td></td></tr><tr><td>Gas</td><td></td><td></td></tr><tr><td>Water</td><td></td><td></td></tr></table>

      <h2>Keys</h2>
      <table><tr><th>Key / fob</th><th>How many</th></tr>
        <tr><td>Front door</td><td></td></tr><tr><td>Back door</td><td></td></tr><tr><td>Windows</td><td></td></tr><tr><td>Other</td><td></td></tr></table>

      <h2>Inventory and condition</h2>
      <table><tr><th style="width:22%">Room</th><th>Items and condition (note marks, damage, cleanliness)</th><th style="width:12%">Photos taken</th></tr>
        ${rooms.map(room => `<tr><td>${room}</td><td style="height:48px"></td><td>☐</td></tr>`).join('')}</table>

      <h2>Signatures</h2>
      <table><tr><th>Landlord</th><th>Tenant</th></tr><tr><td style="height:56px">Signed:<br>Date:</td><td>Signed:<br>Date:</td></tr></table>

      <p class="note">Made with RentUK. Checklist for England, based on GOV.UK and HSE guidance checked on 30 Oct 2026. Informational only, not legal advice.</p>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { showCustomAlert('Your browser blocked the new window. Allow pop-ups for this page and try again.', 'Pop-up blocked'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  // ---- Demo mode ----
  function showDemoBanner() {
    const bar = document.createElement('div');
    bar.className = 'demo-banner';
    bar.innerHTML = `<span>Demo · nothing is saved</span>
      <a href="${esc(location.pathname)}" class="demo-exit">Use my own →</a>`;
    document.querySelector('.topbar').before(bar);
  }

  // ---- 60-second setup ----
  function showSetupWizard() {
    if (document.getElementById('setup-wizard')) return;
    const answers = { name: '', rent: '', compliance: {} };
    const overlay = document.createElement('div');
    overlay.id = 'setup-wizard';
    overlay.className = 'wizard-overlay';
    overlay.setAttribute('aria-label', 'Property setup');
    document.body.appendChild(overlay);
    makeDialog(overlay);
    const dates = RentUKLib.COMPLIANCE_ITEMS.filter(i => i.kind === 'date');
    const yeses = RentUKLib.COMPLIANCE_ITEMS.filter(i => i.kind === 'yes');
    let step = 0;

    function frame(body, nextLabel) {
      overlay.innerHTML = `
        <div class="wizard">
          <div class="wizard-progress"><span style="width:${(step + 1) * 25}%"></span></div>
          <button class="wizard-close" aria-label="Close setup">×</button>
          ${body}
          <div class="wizard-actions">
            ${step > 0 && step < 3 ? '<button class="wizard-back">Back</button>' : '<span></span>'}
            <button class="btn wizard-next">${nextLabel}</button>
          </div>
        </div>`;
      overlay.querySelector('.wizard-close').onclick = () => overlay.remove();
      const back = overlay.querySelector('.wizard-back');
      if (back) back.onclick = () => { step--; render(); };
      overlay.querySelector('.wizard-next').onclick = next;
      const first = overlay.querySelector('input, .yn');
      if (first) first.focus();
    }

    function render() {
      if (step === 0) {
        frame(`
          <p class="wizard-kicker">Step 1 of 3 · about 60 seconds</p>
          <h3>What do you call this property?</h3>
          <input id="wz-name" type="text" aria-label="Property name" maxlength="60" placeholder="e.g. Flat 2, Oak Street house" value="${esc(answers.name)}">
          <label class="wizard-label" for="wz-rent">Monthly rent (optional)</label>
          <input id="wz-rent" type="number" min="0" step="1" placeholder="£" value="${esc(answers.rent)}">
          <p class="wizard-hint">🔒 Stays on this device. No account, no sign-up.</p>
          <p class="wizard-hint"><a href="?demo" class="demo-link">Just looking? Try the demo first →</a></p>`, 'Next →');
      } else if (step === 1) {
        frame(`
          <p class="wizard-kicker">Step 2 of 3</p>
          <h3>When were these last done?</h3>
          <p class="wizard-hint">Not sure? Leave it blank and add it later.</p>
          ${dates.map(i => `
            <label class="wizard-label" for="wz-${i.key}">${esc(i.label)} <small>${esc(i.hint)}</small></label>
            <input id="wz-${i.key}" type="date" max="${todayIso()}" value="${esc(answers.compliance[i.key] || '')}">`).join('')}`, 'Next →');
      } else if (step === 2) {
        frame(`
          <p class="wizard-kicker">Step 3 of 3</p>
          <h3>Quick yes or no</h3>
          ${yeses.map(i => `
            <div class="yn-row">
              <span>${esc(i.label)}<small>${esc(i.hint)}</small></span>
              <button class="yn ${answers.compliance[i.key] ? 'on' : ''}" data-key="${esc(i.key)}" aria-pressed="${!!answers.compliance[i.key]}">${answers.compliance[i.key] ? 'Yes' : 'No'}</button>
            </div>`).join('')}`, 'See my score →');
        overlay.querySelectorAll('.yn').forEach(b => b.onclick = () => {
          answers.compliance[b.dataset.key] = !answers.compliance[b.dataset.key];
          render();
        });
      } else {
        const r = RentUKLib.complianceScore(answers.compliance, todayIso());
        const todo = r.items.filter(i => i.status !== 'ok').slice(0, 3);
        frame(`
          <p class="wizard-kicker">All set</p>
          <h3>Your compliance score</h3>
          <div class="wizard-score">${scoreRing(r.score, r.level, 150)}</div>
          ${todo.length ? `<p class="wizard-hint">Next to fix:</p><ul class="wizard-todo">${todo.map(i => `<li><span aria-hidden="true">${STATUS_ICON[i.status]}</span> ${esc(i.label)}</li>`).join('')}</ul>`
            : '<p class="wizard-hint">🎉 Every check is complete. Nice work.</p>'}`, 'Go to my dashboard');
        animateScores(overlay);
      }
    }

    function next() {
      if (step === 0) {
        const name = overlay.querySelector('#wz-name').value.trim();
        if (!name) { overlay.querySelector('#wz-name').classList.add('invalid'); overlay.querySelector('#wz-name').focus(); return; }
        answers.name = name;
        answers.rent = overlay.querySelector('#wz-rent').value;
      } else if (step === 1) {
        dates.forEach(i => {
          const v = overlay.querySelector('#wz-' + i.key).value;
          if (v) answers.compliance[i.key] = v; else delete answers.compliance[i.key];
        });
      } else if (step === 2) {
        const rent = parseFloat(answers.rent);
        const property = {
          id: 'prop_' + Date.now(),
          name: answers.name,
          address: '',
          tenant: null,
          compliance: RentUKLib.cleanCompliance(answers.compliance),
          createdAt: new Date().toISOString()
        };
        if (Number.isFinite(rent) && rent > 0) {
          property.tenant = { name: '', contact: '', leaseStart: '', leaseEnd: '', rentAmount: String(rent) };
        }
        properties.push(property);
        currentPropertyId = property.id;
        saveData();
      } else {
        overlay.remove();
        loadPropertySelector();
        loadDashboard();
        return;
      }
      step++;
      render();
    }

    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') overlay.remove();
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') next();
    });
    render();
  }

  // ---- Share card (no names, addresses or tenant details) ----
  function drawShareCard(score, level, done, total) {
    const c = document.createElement('canvas');
    c.width = 1080; c.height = 1080;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 1080, 1080);
    bg.addColorStop(0, '#0f172a'); bg.addColorStop(1, '#312e81');
    g.fillStyle = bg; g.fillRect(0, 0, 1080, 1080);
    const colour = level === 'great' ? '#10b981' : level === 'fair' ? '#f59e0b' : '#ef4444';
    const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = '#c7d2fe'; g.font = `600 44px ${font}`;
    g.fillText('MY RENTAL COMPLIANCE SCORE', 540, 160);
    g.lineWidth = 44; g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.beginPath(); g.arc(540, 500, 230, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = colour;
    g.beginPath(); g.arc(540, 500, 230, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * score / 100); g.stroke();
    g.fillStyle = '#ffffff'; g.font = `800 200px ${font}`;
    g.fillText(String(score), 540, 570);
    g.fillStyle = colour; g.font = `700 56px ${font}`;
    g.fillText(level === 'great' ? 'On top of it 💪' : level === 'fair' ? 'Getting there' : 'Work in progress', 540, 840);
    g.fillStyle = '#cbd5e1'; g.font = `400 40px ${font}`;
    g.fillText(`${done} of ${total} landlord checks complete`, 540, 905);
    g.fillStyle = '#94a3b8'; g.font = `500 34px ${font}`;
    g.fillText('RentUK · free, private, no sign-up · What’s your score?', 540, 1010);
    return c;
  }

  async function shareScore() {
    const property = getCurrentProperty();
    if (!property) return;
    const r = RentUKLib.complianceScore(property.compliance, todayIso());
    const done = r.items.filter(i => i.status === 'ok').length;
    const canvas = drawShareCard(r.score, r.level, done, r.items.length);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    const file = new File([blob], `rentuk-score-${r.score}.png`, { type: 'image/png' });
    const text = `My rental compliance score is ${r.score}/100 on RentUK. What's yours?`;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showCustomAlert('Your score card image has been saved. It shows only your score — no names or addresses.', 'Score card ready');
  }

  // Function to toggle reminder status from dashboard
  function toggleDashboardReminderStatus(id) {
    // Find in reminders first
    let reminder = reminders.find(r => r.id == id);
    if (reminder) {
      reminder.completed = !reminder.completed;
      saveData();
      loadDashboard();
      loadReminders();
      return;
    }

    // Find in AOB reminders
    let aob = aobReminders.find(a => a.id == id);
    if (aob) {
      aob.completed = !aob.completed;
      saveData();
      loadDashboard();
      loadReminders();
    }
  }

  // Delete everything RentUK keeps in this browser, after typed confirmation.
  function confirmDeleteAll() {
    if (document.getElementById('delete-all-dialog')) return;
    const overlay = document.createElement('div');
    overlay.id = 'delete-all-dialog';
    overlay.className = 'wizard-overlay';
    overlay.innerHTML = `
      <div class="wizard">
        <h3>Delete all my data?</h3>
        <p>This removes every property, tenant, expense, reminder and compliance date from this device. It cannot be undone.</p>
        <p>${isDemo ? 'You are in demo mode, so only the sample data will be cleared.' : 'Export a backup first if you might want it later.'}</p>
        <label for="delete-confirm-input">Type <strong>DELETE</strong> to confirm</label>
        <input id="delete-confirm-input" autocomplete="off" autocapitalize="characters" spellcheck="false">
        <div class="wizard-actions">
          <button class="wizard-back" id="delete-cancel">Cancel</button>
          <button class="btn btn-danger" id="delete-go" disabled>Delete everything</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    makeDialog(overlay);
    const input = overlay.querySelector('#delete-confirm-input');
    const go = overlay.querySelector('#delete-go');
    input.addEventListener('input', () => { go.disabled = input.value.trim().toUpperCase() !== 'DELETE'; });
    overlay.querySelector('#delete-cancel').onclick = () => overlay.remove();
    go.onclick = () => {
      const result = RentUKLib.clearAll(store);
      overlay.remove();
      if (!result.ok) { showCustomAlert('This browser blocked the delete. Clear this site\'s data in your browser settings instead.', 'Not deleted'); return; }
      // Reload so every screen starts empty; demo mode leaves to a clean, real start.
      location.replace(location.pathname);
    };
    input.focus();
  }

  // Initialize app
  initApp();

  // Make functions available globally for HTML onclick
  window.exportData = exportData;
  window.importData = importData;
  window.toggleReminderStatus = toggleReminderStatus;
  window.toggleAOBStatus = toggleAOBStatus;
  window.toggleDashboardReminderStatus = toggleDashboardReminderStatus;
  window.deleteReminder = deleteReminder;
  window.deleteAOBReminder = deleteAOBReminder;
  window.showCustomAlert = showCustomAlert;
  window.showFeedbackForm = showFeedbackForm;
  window.submitFeedback = submitFeedback;
  window.showAddPropertyForm = showAddPropertyForm;
  window.addNewProperty = addNewProperty;
  window.setCurrentProperty = setCurrentProperty;
  window.editTenant = editTenant;
  window.updateReminderDate = updateReminderDate;
  window.showSetupWizard = showSetupWizard;
});