// Wait for DOM to be fully loaded before running app
document.addEventListener('DOMContentLoaded', function() {
  const esc = window.RentUKLib.escapeHtml;
  // Today's date on this device's clock (so BST evenings are not counted as tomorrow or yesterday).
  const localIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const { readJson, writeAll, asList } = window.RentUKLib;
  // localStorage itself can throw (e.g. blocked in some private modes), so fall back to an in-memory store.
  const memoryStore = () => {
    const mem = {};
    return { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
  };
  // Demo mode (?demo): made-up data in memory only, so the visitor's real data is never touched.
  // A first visit (nothing saved yet) opens a simple welcome page; "See an example" opens the demo.
  const params = new URLSearchParams(location.search);
  let store;
  try { store = window.localStorage; store.getItem('_'); } catch (e) { store = null; }
  const hasRealData = !!store && asList(readJson(store, 'properties', []), []).length > 0;
  const isPreview = false; // the sample dashboard on first visit was too much at once
  const isDemo = params.has('demo') || isPreview;
  const storageMissing = !store && !isDemo;
  if (!store || isDemo) store = memoryStore();
  if (isDemo) writeAll(store, window.RentUKLib.demoData(localIso()));
  let storageWarned = false;
  // Data storage: this browser's localStorage only. Nothing is sent to any server.
  let expenses = asList(readJson(store, 'expenses', []), []);
  let properties = asList(readJson(store, 'properties', []), []);
  let currentPropertyId = store.getItem('currentPropertyId') || null;
  let reminders = asList(readJson(store, 'reminders', null), null) || [
    { id: 1, name: 'Gas Safety Check', dueDate: '', type: 'gas', completed: false, propertyId: null },
    { id: 2, name: 'Boiler Service', dueDate: '', type: 'maintenance', completed: false, propertyId: null },
    { id: 3, name: 'Electrical Safety Check', dueDate: '', type: 'electrical', completed: false, propertyId: null },
    { id: 4, name: 'Insurance Renewal', dueDate: '', type: 'insurance', completed: false, propertyId: null },
    { id: 5, name: 'EPC Renewal', dueDate: '', type: 'epc', completed: false, propertyId: null },
    { id: 6, name: 'Deposit Protection', dueDate: '', type: 'deposit', completed: false, propertyId: null }
  ];

  // AOB reminders (dynamic)
  let aobReminders = asList(readJson(store, 'aobReminders', []), []);
  // Rent payments the landlord has recorded (actual money received).
  let payments = asList(readJson(store, 'payments', []), []);
  // Maintenance issues (repairs) per property.
  let issues = asList(readJson(store, 'issues', []), []);
  // Document list (the files themselves are in IndexedDB, see files.js).
  let documents = asList(readJson(store, 'documents', []), []);

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

  // Start the app (local-only, no sign-in)
  function initApp() {
    loadLocalData();
    loadMainUI();
    if (isDemo) { showDemoBanner(); render(); }
    else if (params.has('setup') && !properties.length) showSetupWizard();
    else if (storageMissing) showCustomAlert('This browser is blocking storage, so nothing you enter will be kept after you close the page. Try a normal (not private) window.', 'Storage unavailable');
    else setTimeout(maybeRemindBackup, 1500);
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
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>'),
    alert: svg('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>'),
    pound: svg('<path d="M16 6.5A4 4 0 0 0 9 9v9"/><path d="M6.5 13h7"/><path d="M6 19h12"/>'),
    phone: svg('<path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
    chat: svg('<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8"/>'),
    mail: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7l8 6 8-6"/>'),
    clipboard: svg('<rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 3.5h6v3H9z"/><path d="M9 12h6M9 16h4"/>'),
    sparkle: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 16l.6 1.6 1.6.6-1.6.6-.6 1.7-.6-1.7-1.6-.6 1.6-.6z"/>'),
    heart: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'),
    share: svg('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>'),
    megaphone: svg('<path d="M4 10v4h3l8 4V6L7 10z"/><path d="M18 9.5a3.5 3.5 0 0 1 0 5"/>'),
    user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/>'),
    wrench: svg('<path d="M15 4a5 5 0 0 0-4.6 6.9L4 17.3 6.7 20l6.4-6.4A5 5 0 0 0 20 9l-3 1-2-2 1-3z"/>'),
    hammer: svg('<path d="M14 4l6 6-2 2-6-6z"/><path d="M13 9l-8 8 2 2 8-8"/>'),
    bolt: svg('<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>'),
    house: svg('<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>'),
    trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    down: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
    up: svg('<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>'),
    video: svg('<rect x="3" y="6" width="13" height="12" rx="3"/><path d="M16 10.5l5-3v9l-5-3z"/>'),
    mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
    send: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
    doc: svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h4"/>'),
    report: svg('<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 16v-3M12 16V9M16 16v-5"/>'),
    pencil: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
    pin: svg('<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>'),
    menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    property: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>'),
    thumb: svg('<path d="M7 11v9H4v-9z"/><path d="M7 11l4-7a2 2 0 0 1 3 2l-1 4h5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7"/>')
  };
  // A small rounded square holding one icon; tone is sky, indigo, deep or glass.
  const chip = (name, tone = 'indigo', extra = '') => `<span class="ichip ichip-${tone} ${extra}" aria-hidden="true">${ICON[name]}</span>`;
  const TABS = [
    { id: 'home', label: 'Home' }, { id: 'checks', label: 'Checks' }, { id: 'money', label: 'Money' },
    { id: 'property', label: 'Property' }
  ];
  let screen = 'home';
  let moneyView = 'rent';
  let propView = 'main';
  let homeList = false; // Home shows one thing; "more things to do" opens the full list
  const pageAt = {};

  function loadMainUI() {
    document.getElementById('app').innerHTML = `
      <header class="topbar">
        <h1 class="brand"><img src="icons/icon-192.png" alt="" width="32" height="32"><span>RentUK</span></h1>
        <button class="prop-chip" data-action="properties" aria-haspopup="dialog">
          <span id="prop-chip-name"></span>${ICON.chevron}
        </button>
        <button class="icon-btn menu-btn" data-action="menu" aria-haspopup="dialog" aria-label="Menu: your data, help and settings">${ICON.menu}</button>
      </header>
      <main id="main" class="screen" tabindex="-1" aria-live="polite"></main>
      <nav class="tabbar" aria-label="Sections">
        ${TABS.map(t => `<button data-tab="${t.id}">${ICON[t.id]}<span>${t.label}</span></button>`).slice(0, 2).join('')}
        <button class="tab-ask" data-action="ask" aria-label="Ask the RentUK assistant (AI)"><img src="icons/assistant.svg" alt="" width="36" height="36"><span>Ask</span></button>
        ${TABS.map(t => `<button data-tab="${t.id}">${ICON[t.id]}<span>${t.label}</span></button>`).slice(2).join('')}
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
    screen = SCREENS[tab] ? tab : 'home';
    homeList = false;
    propView = 'main';
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
    document.querySelector('.menu-btn').hidden = !p;
    main.className = 'screen screen-' + (p ? screen : 'welcome');
    // Lists start optimistic (extra rows), then the fit check below trims them to exactly what fits.
    main.innerHTML = p ? SCREENS[screen](p, main.clientHeight + 240) : welcomeScreen();
    // No scrolling: if the screen still overflows (bigger text, small phone), page lists with fewer rows.
    // Measured with animations paused, because entrance animations shift content while they run.
    if (p) {
      main.classList.add('measuring');
      let h = main.clientHeight + 240;
      for (let i = 0; i < 8 && main.scrollHeight > main.clientHeight + 1 && main.querySelector('.pager, .list'); i++) {
        h -= (main.scrollHeight - main.clientHeight) + 4;
        main.innerHTML = SCREENS[screen](p, h);
      }
      // Then the other way: if a paged list leaves a gap at the bottom, add rows while they still fit.
      for (let i = 0; i < 4 && main.querySelector('.pager'); i++) {
        const before = main.innerHTML, pagesBefore = { ...pageAt };
        main.innerHTML = SCREENS[screen](p, h + 40);
        if (main.scrollHeight > main.clientHeight + 1) { main.innerHTML = before; Object.assign(pageAt, pagesBefore); break; }
        h += 40;
      }
      main.classList.remove('measuring');
    }
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
    const per = Math.max(1, Math.floor((height - reserved) / rowH));
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
    const own = [...reminders.map(r => ({ ...r, kind: 'std' })), ...RentUKLib.datesFor(aobReminders, p && p.id).filter(a => a.name).map(a => ({ ...a, kind: 'aob' }))];
    const auto = [];
    if (p) {
      checksFor(p).items.filter(i => i.expires)
        .forEach(i => auto.push({ id: 'c-' + i.key, kind: 'auto', go: 'checks', name: i.label + ' due', dueDate: i.expires }));
      if (p.tenant && p.tenant.leaseEnd) auto.push({ id: 'lease', kind: 'auto', go: 'tenant', name: 'Lease ends · ' + p.tenant.name, dueDate: p.tenant.leaseEnd });
    }
    const taken = new Set(own.map(d => d.dueDate));
    return [...own, ...auto.filter(d => !taken.has(d.dueDate))]
      .sort((a, b) => (a.completed - b.completed) || (!a.dueDate) - (!b.dueDate) || String(a.dueDate).localeCompare(String(b.dueDate)));
  }



  // The property's checks, using the rules for the UK nation it is in.
  const checksFor = (p, today) => RentUKLib.complianceScore(p && p.compliance, today || todayIso(), RentUKLib.nationOf(p));
  const nationName = p => RentUKLib.NATIONS[RentUKLib.nationOf(p)];
  const ledgerFor = p => RentUKLib.rentLedger(p && p.tenant, payments, p && p.id, todayIso());
  // One line about rent for a property: paid up, overdue, in credit or not tracked.
  function rentState(p) {
    const t = p && p.tenant;
    if (!t || !(parseFloat(t.rentAmount) > 0)) return { tone: 'none', title: 'Not tracked', text: 'Add the rent to start' };
    const L = ledgerFor(p);
    if (!L.tracked) return { tone: 'none', title: 'Not tracked', text: 'Set when to track rent from' };
    if (L.arrears) return { tone: 'bad', title: `${money2(L.arrears)} overdue`, amount: money2(L.arrears), text: `Unpaid since ${ukDate(L.oldestUnpaid)}`, L };
    if (L.credit) return { tone: 'ok', title: 'Paid up', text: `${money2(L.credit)} in credit`, L };
    return { tone: 'ok', title: 'Paid up', text: L.nextDue ? `Next ${money(L.nextAmount)} due ${ukDate(L.nextDue)}` : 'Nothing due', L };
  }

  // Everything that needs the landlord for one property, most urgent first (lower rank = sooner).
  function attentionFor(p, showName) {
    const out = [], today = todayIso(), many = !!showName;
    const where = txt => many ? `${p.name} · ${txt}` : txt;
    const add = (rank, tone, title, text, nav) => out.push({ rank, tone, title, text: where(text), propId: p.id, ...nav });
    const rs = rentState(p);
    if (rs.tone === 'bad') add(0, 'bad', `Rent overdue · ${rs.amount}`, `unpaid since ${ukDate(rs.L.oldestUnpaid)}`, { tab: 'money' });
    RentUKLib.sortIssues(issues.filter(i => i.propertyId === p.id && i.status !== 'done' && i.priority === 'urgent'))
      .forEach(i => add(1, 'bad', `Urgent repair: ${i.title}`, RentUKLib.ISSUE_STATUS[i.status], { act: 'repairs' }));
    const r = checksFor(p, today);
    r.items.filter(i => i.status === 'expired').forEach(i => add(2, 'bad', `${i.label} expired`, `on ${ukDate(i.expires)}`, { tab: 'checks' }));
    r.items.filter(i => i.status === 'action').forEach(i => add(2, 'bad', `${i.label}: action required`, i.note, { tab: 'checks' }));
    const unsure = r.items.filter(i => i.status === 'unverified');
    if (unsure.length) add(5, 'warn', `${unsure.length} ${unsure.length === 1 ? 'check' : 'checks'} to confirm`, unsure.map(i => i.label).slice(0, 2).join(', ') + (unsure.length > 2 ? '…' : ''), { tab: 'checks' });
    r.items.filter(i => i.status === 'soon').forEach(i => add(3, 'warn', `${i.label} due`, `by ${ukDate(i.expires)}`, { tab: 'checks' }));
    allDates(p).filter(d => !d.completed && d.dueDate && d.kind !== 'auto' && daysFrom(d.dueDate) <= 14)
      .forEach(d => add(3, daysFrom(d.dueDate) < 0 ? 'bad' : 'warn', d.name, whenText(d.dueDate), { tab: 'checks' }));
    const dep = RentUKLib.depositCheck(RentUKLib.nationOf(p), p.tenant, today);
    if (p.tenant && dep.overCap) add(2, 'bad', 'Deposit over the legal cap', `${money2(dep.amount)} is more than ${dep.capText}`, { act: 'tenant-dep' });
    if (p.tenant && dep.protectedOn && dep.late) add(2, 'bad', 'Deposit protected after the deadline', 'get advice on what this means', { act: 'tenant-dep' });
    if (p.tenant && dep.due) add(dep.late ? 1 : 3, dep.late ? 'bad' : 'warn', dep.late ? 'Deposit protection overdue' : 'Protect the deposit', `${dep.late ? 'deadline was' : 'by'} ${ukDate(dep.deadline)}`, { act: 'tenant-dep' });
    if (p.tenant && p.tenant.leaseEnd && daysFrom(p.tenant.leaseEnd) >= 0 && daysFrom(p.tenant.leaseEnd) <= 60)
      add(4, 'warn', 'Tenancy end date coming up', `${ukDate(p.tenant.leaseEnd)} · ${whenText(p.tenant.leaseEnd)}`, { act: 'tenant' });
    const missing = r.items.filter(i => i.status === 'missing' && i.legal);
    if (missing.length) add(5, 'warn', `${missing.length} ${missing.length === 1 ? 'check' : 'checks'} not recorded`, missing.map(i => i.label).slice(0, 2).join(', ') + (missing.length > 2 ? '…' : ''), { tab: 'checks' });
    const routine = issues.filter(i => i.propertyId === p.id && i.status !== 'done' && i.priority !== 'urgent').length;
    if (routine) add(6, 'info', `${routine} ${routine === 1 ? 'repair' : 'repairs'} in progress`, 'not urgent', { act: 'repairs' });
    return out;
  }

  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  // First visit: show what RentUK does before asking for anything. The main button opens the demo (nothing saved).
  function welcomeScreen() {
    return `
      <div class="landing">
        <div class="land-glow" aria-hidden="true"></div>
        <div class="land-group">
        <p class="land-kicker">For UK landlords</p>
        <h2 class="land-h">Your Rental,<br><span>Calmly Sorted.</span></h2>
        <p class="land-sub">Never miss rent, a repair or a legal check.</p>
        </div>
        <div class="land-stage" aria-hidden="true">
          <div class="land-card lc-1"><i class="lc-bar warn"></i><small>Next up</small><strong>Gas safety check due</strong><span>by 4 December</span><em>Sort it${ICON.chevron}</em></div>
          <div class="land-card lc-2"><i class="lc-bar ok"></i><small>Rent</small><strong>£950 received</strong><span>Paid up · next due 1 January</span></div>
          <div class="land-card lc-3"><span class="lc-tick">${ICON.tick}</span><strong>All clear</strong><span>Nothing needs you today</span></div>
        </div>
        <div class="land-group land-cta">
        <a class="btn btn-big land-go" href="?demo">Take a look${ICON.chevron}</a>
        <button class="link-btn land-setup" data-action="setup">or set up my property</button>
        </div>
        <div class="land-group">
        <p class="privacy-line">Free · No sign-up</p>
        <p class="privacy-line tagline-line land-sign">${ICON.lock}<span>Your App. Your Data. Your Choice.</span></p>
        </div>
      </div>`;
  }

  // Dates shown under the checks. Certificate renewals and the standard gas, electrical, EPC and deposit
  // reminders are left out because the check rows above already cover them.
  const CHECK_TYPES = ['gas', 'electrical', 'epc', 'deposit'];
  const checkDates = p => allDates(p).filter(d => !(d.kind === 'auto' && d.go === 'checks') && !(d.kind === 'std' && CHECK_TYPES.includes(d.type)));
  const dateRow = d => d.kind === 'auto' ? `
        <div class="row">
          <span class="auto-badge">${chip(d.go === 'tenant' ? 'user' : 'checks', d.go === 'tenant' ? 'sky' : 'indigo', 'ichip-sm')}</span>
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
        </div>`;;

  const SCREENS = {
    home(p, h) {
      // Calm by design: the single most important thing, a quiet summary, and everything else one tap away.
      const many = properties.length > 1;
      const scope = many ? properties : [p];
      const items = scope.flatMap(q => attentionFor(q, many)).sort((x, y) => x.rank - y.rank);
      const today = todayIso(), monthStart = today.slice(0, 8) + '01';
      let due = 0, got = 0, open = 0, upToDate = 0;
      scope.forEach(q => {
        if (q.tenant) due += RentUKLib.expectedBetween(q.tenant, monthStart, today.slice(0, 8) + '31');
        got += RentUKLib.received(payments, monthStart, today, q.id);
        open += RentUKLib.issueSummary(issues, q.id, today).open;
        if (checksFor(q, today).items.every(i => i.status === 'ok' || i.status === 'na' || !i.legal)) upToDate++;
      });
      const r = checksFor(p, today);
      const legal = r.items.filter(i => i.legal && i.status !== 'na');
      const done = legal.filter(i => i.status === 'ok').length;
      const nav = it => `data-action="attn" data-prop="${esc(it.propId)}" ${it.tab ? `data-go="${it.tab}"` : ''} ${it.act ? `data-act="${it.act}"` : ''}`;
      const row = it => `
        <button class="row attn-row tone-${it.tone}" ${nav(it)}>
          <span class="attn-dot" aria-hidden="true"></span>
          <span class="row-text"><strong>${esc(it.title)}</strong><small>${esc(it.text)}</small></span>${ICON.chevron}
        </button>`;
      if (homeList && items.length > 1) return `
        <div class="list-top"><button class="back-btn" data-action="home-back">${ICON.back}Home</button>
          <h2>Everything to do <span>${items.length}</span></h2></div>
        ${pager('attn', items, h, 190, 74, row)}`;
      const top = items[0];
      const n = items.length;
      return `
        <div class="hello"><h2>${greeting()}</h2>
          <p>${n === 0 ? 'Everything’s on track.' : n === 1 ? 'Just one thing needs you.' : 'Here’s the most important thing.'}</p></div>
        ${top ? `
        <button class="hero-task glass tone-${top.tone}" ${nav(top)}>
          <span class="hero-label">${top.tone === 'bad' ? 'Do this first' : 'Next up'}</span>
          <strong>${esc(top.title)}</strong>
          <small>${esc(top.text)}</small>
          <span class="hero-go">Sort it${ICON.chevron}</span>
        </button>
        ${n > 1 ? `<button class="more-btn" data-action="home-list">${n - 1} more ${n - 1 === 1 ? 'thing' : 'things'} to do${ICON.chevron}</button>` : ''}` : `
        <div class="all-clear glass">${chip('tick', 'indigo')}<div><strong>All clear</strong><p>No overdue rent, no urgent repairs and every check you’ve recorded is up to date.</p></div></div>`}
        <div class="quiet-sum" aria-label="Summary">
          <button data-tab="money"><small>Rent this month</small><strong>${money(got)}</strong><span>of ${money(due)}</span></button>
          <button ${many ? 'data-tab="property"' : 'data-action="repairs"'}><small>Repairs</small><strong>${open}</strong><span>open</span></button>
          <button data-tab="checks"><small>Checks</small><strong>${many ? `${upToDate}/${scope.length}` : `${done}/${legal.length}`}</strong><span>${many ? 'properties' : 'up to date'}</span></button>
        </div>
        <p class="privacy-line tagline-line">${ICON.lock}<span>Your app. Your data. Your choice.</span></p>`;
    },

    checks(p, h) {
      const r = checksFor(p);
      const legal = r.items.filter(i => i.legal && i.status !== 'na');
      const done = legal.filter(i => i.status === 'ok').length;
      const row = item => `
        <div class="row check-row status-${item.status}">
          <span class="dot dot-${item.status}" aria-hidden="true"></span>
          <button class="row-text" data-action="check-info" data-key="${esc(item.key)}">
            <strong>${esc(item.label)}${item.legal ? '' : ' <em class="gp">good practice</em>'}</strong><small class="st-${item.status}">${statusText(item)}</small>
          </button>
          ${item.kind === 'yes' && (item.status === 'ok' || item.status === 'missing')
            ? `<button class="check-toggle ${item.status === 'ok' ? 'on' : ''}" data-check="${esc(item.key)}" aria-pressed="${item.status === 'ok'}" aria-label="${esc(item.label)} done">${item.status === 'ok' ? ICON.tick : 'No'}</button>`
            : `<button class="check-pill ${item.status === 'missing' ? 'add' : ''}" data-action="check-info" data-key="${esc(item.key)}" aria-label="${item.status === 'missing' ? 'Add' : 'Change'} ${esc(item.label)}">${item.status === 'missing' ? 'Add date' : 'Update'}</button>`}
        </div>`;
      return `
        <div class="screen-head">
          ${scoreRing(r.score, r.level, 64)}
          <div class="grow"><h2>Checks &amp; dates</h2><p>${done} of ${legal.length} legal checks up to date · ${esc(nationName(p))}</p></div>
          <button class="icon-btn" data-action="share" aria-label="Share my score (no personal details)">${ICON.megaphone}</button>
        </div>
        <button class="fab" data-action="add-date" aria-label="Add a date">${ICON.plus}</button>
        ${pager('checks', [...r.items.map(i => ({ t: 'check', i })), { t: 'head' }, ...checkDates(p).map(d => ({ t: 'date', d }))], h, 330, 70,
          x => x.t === 'check' ? row(x.i) : x.t === 'date' ? dateRow(x.d) : `
          <div class="list-head dates-head"><span>Your dates</span><button class="pill-btn" data-action="calendar">${ICON.dates}Add to calendar</button></div>`)}
        <p class="fine">${esc(nationName(p))} rules, checked against official sources on ${esc(RentUKLib.RULES_VERIFIED)}. Based on what you record: a guide, not legal advice. <button class="link-btn inline" data-action="upcoming">What’s changing</button></p>`;
    },

    money(p, h) {
      const seg = `
        <div class="seg" role="group" aria-label="Money view">
          ${[['rent', 'Rent'], ['expenses', 'Costs'], ['tax', 'Tax']].map(([id, label]) =>
            `<button data-money="${id}" aria-pressed="${moneyView === id}" class="${moneyView === id ? 'on' : ''}">${label}</button>`).join('')}
        </div>`;
      const start = RentUKLib.taxYearStart(todayIso());
      if (moneyView === 'tax') {
        const est = RentUKLib.rentalEstimate(properties, expenses, start);
        return `${seg}
          <h2 class="sub-h">Tax year ${esc(est.taxYear.label)} · all properties</h2>
          <p class="fine">Received so far: <strong>${money2(RentUKLib.received(payments, est.taxYear.start, todayIso()))}</strong>. Below: full-year estimate.</p>
          <div class="stats">
            <div class="stat"><small>Rent (full year)</small><strong>${money(est.income)}</strong></div>
            <div class="stat"><small>${est.useAllowance ? 'Allowance' : 'Costs'}</small><strong>−${money(est.useAllowance ? Math.min(1000, est.income) : est.costs)}</strong></div>
            <div class="stat stat-hi"><small>Profit</small><strong>${money(est.profit)}</strong></div>
          </div>
          <div class="panel">
            <p>Tax on that profit is about</p>
            <div class="bands"><span><strong>${money(est.taxAt.basic)}</strong>basic 20%</span><span><strong>${money(est.taxAt.higher)}</strong>higher 40%</span><span><strong>${money(est.taxAt.additional)}</strong>top 45%</span></div>
          </div>
          ${FAB_COST}<div class="note tone-${est.mtd.due ? 'warn' : 'ok'}">${est.mtd.due
            ? `Making Tax Digital likely applies from ${esc(est.mtd.from)}. Rent is over ${money(est.mtd.over)}.`
            : 'Making Tax Digital is not triggered by your rent alone.'}</div>
          <div class="btn-row">
            <button class="link-btn" data-action="tax-info">${ICON.info}How this is worked out</button>
            <button class="link-btn" data-action="export-csv">${ICON.down}Export for accountant</button>
          </div>`;
      }
      if (moneyView === 'expenses') {
        const list = expenses.filter(e => e.propertyId === p.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
        return `${seg}${FAB_COST}
          ${list.length ? pager('expenses', list, h, 310, 66, costRow) : '<p class="empty">No costs yet. Add repairs, insurance or fees and they count towards your tax estimate.</p>'}`;
      }
      return `${seg}${rentView(p, h, start)}`;
    },

    property(p, h) {
      if (propView === 'repairs') return repairsView(p, h);
      if (propView === 'docs') return docsView(p, h);
      const docCount = documents.filter(d => d.propertyId === p.id).length;
      const t = p.tenant;
      const iss = RentUKLib.issueSummary(issues, p.id, todayIso());
      const others = properties.length - 1;
      return `
        <div class="prop-head glass">
          ${chip('property', 'indigo')}
          <div class="grow">
            <h2>${esc(p.name)}</h2>
            <p>${p.address ? esc(p.address) : '<span class="muted">No address yet</span>'}</p>
            <span class="nation-pill">${ICON.pin}${esc(RentUKLib.NATIONS[RentUKLib.nationOf(p)])}</span>
          </div>
          <button class="icon-btn" data-action="edit-property" aria-label="Edit property details">${ICON.pencil}</button>
        </div>
        <div class="tiles">
          <button class="tile tile-sky" data-action="${t && t.name ? 'contact' : 'tenant'}">
            ${chip('user', 'glass')}
            <span class="tile-body"><small>Tenant</small><strong>${t && t.name ? esc(t.name) : 'Add tenant'}</strong>
              <span>${t && t.rentAmount ? money(t.rentAmount) + ' a month' : 'Name, contact, rent'}</span></span>
          </button>
          <button class="tile tile-sky" data-action="repairs">
            ${chip('wrench', 'glass', iss.urgent ? 'ichip-warn' : '')}
            <span class="tile-body"><small>Repairs</small><strong class="${iss.urgent ? 't-bad' : ''}">${iss.open ? `${iss.open} open` : 'None open'}</strong>
              <span>${iss.urgent ? `${iss.urgent} urgent` : iss.open ? esc(iss.first.title) : 'Report an issue'}</span></span>
          </button>
          <button class="tile tile-sky" data-action="docs">
            ${chip('doc', 'glass')}
            <span class="tile-body"><small>Documents</small><strong>${docCount ? `${docCount} ${docCount === 1 ? 'file' : 'files'}` : 'None yet'}</strong>
              <span>${docCount ? 'Certificates, agreements' : 'Add a certificate'}</span></span>
          </button>
          <button class="tile tile-sky" data-action="report">
            ${chip('report', 'glass')}
            <span class="tile-body"><small>Report</small><strong>Property report</strong><span>Print, PDF or share</span></span>
          </button>
          <button class="tile tile-sky" data-action="move-in">
            ${chip('clipboard', 'glass')}
            <span class="tile-body"><small>Move-in pack</small><strong>Checklist</strong><span>Print or save as PDF</span></span>
          </button>
          <button class="tile tile-sky" data-action="properties">
            ${chip('house', 'glass')}
            <span class="tile-body"><small>Portfolio</small><strong>${properties.length} ${properties.length === 1 ? 'property' : 'properties'}</strong>
              <span>${others ? 'Switch or add' : 'Add another'}</span></span>
          </button>
        </div>`;
    }
  };

  // ---- Rent: actual payments against what was due. Nothing is assumed paid. ----
  function rentView(p, h, start) {
    const t = p.tenant;
    if (!t || !(parseFloat(t.rentAmount) > 0)) return `
      <div class="empty-card glass">
        ${chip('pound', 'indigo')}
        <h2>Track rent for ${esc(p.name)}</h2>
        <p>Add the monthly rent and the day it is due. Then record each payment as it arrives and RentUK shows anything overdue.</p>
        <button class="btn" data-action="tenant">Add rent details</button>
      </div>`;
    const rs = rentState(p), L = rs.L;
    if (!L) return `<div class="empty-card glass">${chip('pound', 'indigo')}<h2>Choose when to track from</h2>
        <p>Set the date RentUK should start counting rent due, then record payments as they arrive.</p>
        <button class="btn" data-action="tenant-rent">Set tracking date</button></div>`;
    const today = todayIso(), monthStart = today.slice(0, 8) + '01';
    const thisMonthDue = RentUKLib.expectedBetween(t, monthStart, today.slice(0, 8) + '31');
    const gotMonth = RentUKLib.received(payments, monthStart, today, p.id);
    const list = payments.filter(x => x.propertyId === p.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return `
      <div class="rent-card glass tone-${rs.tone}">
        <div class="grow">
          <small>${rs.tone === 'bad' ? 'Rent overdue' : 'Rent'}</small>
          <strong>${esc(rs.amount || rs.title)}</strong>
          <span>${esc(rs.text)}</span>
        </div>
        <button class="btn" data-action="add-payment">${ICON.plus}Record payment</button>
      </div>
      <div class="stats stats-2">
        <div class="stat"><small>Due this month</small><strong>${money2(thisMonthDue)}</strong></div>
        <div class="stat"><small>Received this month</small><strong>${money2(gotMonth)}</strong></div>
      </div>
      <p class="fine">Tracking from ${esc(ukDate(L.from))}.</p>
      ${list.length ? pager('payments', list, h, 420, 66, paymentRow) : '<p class="empty">No payments recorded yet.</p>'}`;
  }
  const paymentRow = x => `
    <button class="row" data-action="payment" data-id="${esc(x.id)}">
      ${chip('pound', 'sky', 'ichip-sm')}
      <span class="row-text"><strong>${esc(ukDate(x.date))}</strong><small>${esc(x.note || 'Rent payment')}</small></span>
      <span class="amount amount-in">+${money2(x.amount)}</span>
    </button>`;

  // ---- Repairs ----
  const ISSUE_TONE = { open: 'warn', quoted: 'warn', booked: 'info', done: 'ok' };
  function repairsView(p, h) {
    const list = RentUKLib.sortIssues(issues.filter(i => i.propertyId === p.id));
    const iss = RentUKLib.issueSummary(issues, p.id, todayIso());
    const row = i => `
      <button class="row issue-row ${i.status === 'done' ? 'done' : ''}" data-action="issue" data-id="${esc(i.id)}">
        <span class="prio prio-${esc(i.priority)}" aria-hidden="true"></span>
        <span class="row-text"><strong>${esc(i.title)}</strong>
          <small>${esc(RentUKLib.ISSUE_PRIORITY[i.priority])} · <span class="st st-${ISSUE_TONE[i.status]}">${esc(RentUKLib.ISSUE_STATUS[i.status])}</span>${i.reported ? ' · ' + esc(ukDate(i.reported)) : ''}</small></span>
        ${i.status === 'done' && i.cost != null ? `<span class="amount">${money2(i.cost)}</span>` : i.quote != null ? `<span class="amount muted" title="Quote">${money2(i.quote)}</span>` : ''}
      </button>`;
    return `
      <div class="screen-head">
        <button class="icon-btn" data-action="prop-back" aria-label="Back to property">${ICON.back}</button>
        <div class="grow"><h2>Repairs</h2><p>${iss.open ? `${iss.open} open${iss.urgent ? ` · ${iss.urgent} urgent` : ''}` : 'Nothing open'} · ${esc(p.name)}</p></div>
      </div>
      <button class="fab" data-action="add-issue" aria-label="Report a repair">${ICON.plus}</button>
      ${list.length ? pager('issues', list, h, 200, 70, row) : `
        <div class="empty-card glass">${chip('wrench', 'indigo')}<h2>No repairs logged</h2>
          <p>When something needs fixing, log it here. Track the quote, the contractor and the cost, and see the full history later.</p>
          <button class="btn" data-action="add-issue">Report a repair</button></div>`}`;
  }

  function issueSheet(p, existing) {
    if (!p) return;
    const i = existing || { title: '', detail: '', priority: 'soon', status: 'open', contractor: '', quote: null, cost: null, reported: todayIso(), doneOn: '' };
    let pr = i.priority, st = i.status;
    const seg = (name, map, cur) => `<div class="seg seg-${Object.keys(map).length}" role="group" aria-label="${name}">${Object.entries(map)
      .map(([k, label]) => `<button data-${name}="${k}" class="${k === cur ? 'on' : ''}" aria-pressed="${k === cur}">${label}</button>`).join('')}</div>`;
    openSheet(existing ? 'Repair' : 'Report a repair', `
      ${field('i-title', 'What needs fixing?', 'text', i.title, 'maxlength="80" placeholder="Boiler not heating water" autocomplete="off"')}
      <label class="field" for="i-detail"><span>Details (optional)</span><textarea id="i-detail" rows="2" maxlength="400" placeholder="What the tenant said, access, photos taken…">${esc(i.detail)}</textarea></label>
      <div class="field"><span>How urgent?</span>${seg('prio', RentUKLib.ISSUE_PRIORITY, pr)}</div>
      ${existing ? `
      <div class="field"><span>Status</span>${seg('stat', RentUKLib.ISSUE_STATUS, st)}</div>
      ${field('i-contractor', 'Contractor (optional)', 'text', i.contractor, 'maxlength="80" autocomplete="off"')}
      <div class="field-row">
        ${field('i-quote', 'Quote (£)', 'number', i.quote, 'inputmode="decimal" step="0.01" min="0"')}
        ${field('i-cost', 'Final cost (£)', 'number', i.cost, 'inputmode="decimal" step="0.01" min="0"')}
      </div>
      <div class="field-row">
        ${field('i-reported', 'Reported', 'date', i.reported, `max="${todayIso()}"`)}
        ${field('i-done', 'Done on', 'date', i.doneOn, `max="${todayIso()}"`)}
      </div>
      <p class="fine">When it’s done, the final cost is added to this property’s costs for you.</p>` : ''}
      <div class="sheet-actions">
        ${existing ? '<button class="btn btn-quiet" id="i-del">Delete</button>' : ''}
        <button class="btn" id="i-save">${existing ? 'Save' : 'Log repair'}</button>
      </div>`, s => {
      const pick = (attr, set) => s.querySelectorAll(`[data-${attr}]`).forEach(b => b.onclick = () => {
        set(b.dataset[attr]);
        s.querySelectorAll(`[data-${attr}]`).forEach(o => { o.classList.toggle('on', o === b); o.setAttribute('aria-pressed', o === b); });
        if (attr === 'stat' && b.dataset.stat === 'done' && !s.querySelector('#i-done').value) s.querySelector('#i-done').value = todayIso();
      });
      pick('prio', v => { pr = v; });
      pick('stat', v => { st = v; });
      if (existing) s.querySelector('#i-del').onclick = () => {
        issues = issues.filter(x => x !== existing);
        expenses = expenses.filter(e => e.issueId !== existing.id);
        saveData(); closeSheet(); render();
      };
      s.querySelector('#i-save').onclick = () => {
        const title = s.querySelector('#i-title').value.trim();
        if (!title) return sheetError(s, 'Say what needs fixing.');
        const num = id => { const el = s.querySelector(id); const n = el && el.value !== '' ? Math.round(parseFloat(el.value) * 100) / 100 : null; return Number.isFinite(n) && n >= 0 ? n : null; };
        const next = { title, detail: s.querySelector('#i-detail').value.trim(), priority: pr };
        if (existing) Object.assign(next, { status: st, contractor: s.querySelector('#i-contractor').value.trim(), quote: num('#i-quote'), cost: num('#i-cost'),
          reported: s.querySelector('#i-reported').value || i.reported, doneOn: st === 'done' ? (s.querySelector('#i-done').value || todayIso()) : '' });
        let rec = existing;
        if (existing) Object.assign(existing, next);
        else { rec = { id: 'iss_' + Date.now(), propertyId: p.id, status: 'open', contractor: '', quote: null, cost: null, reported: todayIso(), doneOn: '', ...next }; issues.push(rec); }
        syncRepairCost(p, rec);
        saveData(); closeSheet(); screen = 'property'; propView = 'repairs'; render();
      };
    });
  }

  // ---- Documents ----
  // Demo mode keeps files in memory only, so it never reads or changes the visitor's real files.
  const demoFiles = new Map();
  const memFiles = { put: async (id, b) => { demoFiles.set(id, b); }, get: async id => demoFiles.get(id), remove: async id => { demoFiles.delete(id); }, clear: async () => demoFiles.clear() };
  const fileStore = () => isDemo ? memFiles : (window.RentUKFiles || null);
  const sizeText = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  function docsView(p, h) {
    const list = documents.filter(d => d.propertyId === p.id).sort((a, b) => String(b.added).localeCompare(String(a.added)));
    const row = d => `
      <button class="row" data-action="doc" data-id="${esc(d.id)}">
        ${chip(d.mime.startsWith('image/') ? 'sparkle' : 'doc', 'sky', 'ichip-sm')}
        <span class="row-text"><strong>${esc(d.name)}</strong><small>${esc(RentUKLib.DOC_TYPES[d.type])} · ${esc(ukDate(d.added))} · ${sizeText(d.size)}</small></span>
        ${ICON.chevron}
      </button>`;
    return `
      <div class="screen-head">
        <button class="icon-btn" data-action="prop-back" aria-label="Back to property">${ICON.back}</button>
        <div class="grow"><h2>Documents</h2><p>${list.length} ${list.length === 1 ? 'file' : 'files'} · ${esc(p.name)}</p></div>
      </div>
      <button class="fab" data-action="add-doc" aria-label="Add a document">${ICON.plus}</button>
      ${list.length ? pager('docs', list, h, 230, 70, row) : `
        <div class="empty-card glass">${chip('doc', 'indigo')}<h2>Keep your paperwork here</h2>
          <p>Gas and electrical certificates, the EPC, tenancy terms, deposit certificate, inventory and receipts. Stored only on this device.</p>
          <button class="btn" data-action="add-doc">Add a document</button></div>`}
      <p class="fine">Files stay in this browser only. Backup files list your documents but don’t contain them, so keep the originals too.</p>`;
  }

  function docSheet(p) {
    if (!fileStore()) return showCustomAlert('This browser can’t store files. Try Safari, Chrome or Edge.', 'Files unavailable');
    openSheet('Add a document', `
      <label class="field" for="dc-file"><span>File (PDF or photo, up to 10 MB)</span><input id="dc-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"></label>
      ${field('dc-name', 'Name', 'text', '', 'maxlength="120" autocomplete="off" placeholder="Gas safety record 2026"')}
      <label class="field" for="dc-type"><span>Type</span><select id="dc-type">${Object.entries(RentUKLib.DOC_TYPES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
      <div class="dc-check" hidden>${field('dc-date', 'Date of the check (updates your checklist)', 'date', '', `max="${todayIso()}"`)}</div>
      <div class="sheet-actions"><button class="btn" id="dc-save">Add document</button></div>`, s => {
      const type = s.querySelector('#dc-type'), file = s.querySelector('#dc-file'), name = s.querySelector('#dc-name');
      const certs = ['gas', 'eicr', 'epc'];
      const sync = () => { s.querySelector('.dc-check').hidden = !certs.includes(type.value); };
      name.addEventListener('input', () => { name.dataset.auto = ''; });
      type.onchange = sync; sync();
      file.onchange = () => {
        const f = file.files[0]; if (!f) return;
        if (!name.value || name.dataset.auto === '1') { name.value = f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 120); name.dataset.auto = '1'; }
        const guess = /gas|cp12/i.test(f.name) ? 'gas' : /eicr|electric/i.test(f.name) ? 'eicr' : /epc|energy/i.test(f.name) ? 'epc' : /tenan|agreement|contract/i.test(f.name) ? 'tenancy' : /deposit/i.test(f.name) ? 'deposit' : /inventory/i.test(f.name) ? 'inventory' : /invoice|receipt/i.test(f.name) ? 'invoice' : f.type.startsWith('image/') ? 'photo' : 'other';
        type.value = guess; sync();
      };
      s.querySelector('#dc-save').onclick = async () => {
        const f = file.files[0];
        const ok = RentUKLib.docFileOk(f);
        if (!ok.ok) return sheetError(s, ok.error);
        const checkDate = certs.includes(type.value) ? s.querySelector('#dc-date').value : '';
        if (checkDate && checkDate > todayIso()) return sheetError(s, 'The check date can’t be in the future.');
        const doc = RentUKLib.cleanDoc({ id: 'doc_' + Date.now(), propertyId: p.id, name: name.value.trim() || f.name, type: type.value, mime: f.type, size: f.size, added: todayIso() });
        s.querySelector('#dc-save').disabled = true;
        try { await fileStore().put(doc.id, f); }
        catch (e) { s.querySelector('#dc-save').disabled = false; return sheetError(s, 'Couldn’t save the file: this browser’s storage may be full or blocked.'); }
        documents.push(doc);
        if (checkDate && checksFor(p).items.some(i => i.key === type.value)) {
          p.compliance = { ...(p.compliance || {}), [type.value]: checkDate };
        }
        saveData(); closeSheet(); screen = 'property'; propView = 'docs'; render();
      };
    });
  }

  function docOpenSheet(p, d) {
    if (!d) return;
    openSheet(esc(d.name), `
      <p class="sheet-lead"><span>${esc(RentUKLib.DOC_TYPES[d.type])} · added ${esc(ukDate(d.added))} · ${sizeText(d.size)}</span></p>
      <div class="stack">
        <button class="btn" id="do-open">${ICON.doc}Open</button>
        <button class="btn btn-ghost" id="do-save">${ICON.down}Save a copy</button>
        <button class="btn btn-quiet" id="do-del">Delete</button>
      </div>`, s => {
      const withFile = async fn => {
        try {
          const blob = fileStore() && await fileStore().get(d.id);
          if (!blob) return showCustomAlert('This file isn’t in this browser. It may have been added on another device or before a restore.', 'File not found');
          // Re-type the blob so it can only open as the PDF or image it was saved as.
          fn(URL.createObjectURL(new Blob([blob], { type: RentUKLib.DOC_MIME.includes(d.mime) ? d.mime : 'application/octet-stream' })));
        } catch (e) { showCustomAlert('Couldn’t open the file storage in this browser.', 'File not available'); }
      };
      s.querySelector('#do-open').onclick = () => withFile(url => {
        const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10 * 60000);
      });
      s.querySelector('#do-save').onclick = () => withFile(url => {
        const a = document.createElement('a'); a.href = url; a.download = d.name.replace(/[^\w .-]+/g, '_') + (d.mime === 'application/pdf' ? '.pdf' : '.' + d.mime.split('/')[1]);
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
      });
      s.querySelector('#do-del').onclick = () => {
        openSheet('Delete this document?', `<p class="story">${esc(d.name)} will be removed from this device. This can’t be undone.</p>
          <div class="sheet-actions"><button class="btn btn-quiet" id="dd-no">Cancel</button><button class="btn btn-danger" id="dd-yes">Delete</button></div>`, s2 => {
          s2.querySelector('#dd-no').onclick = () => docOpenSheet(p, d);
          s2.querySelector('#dd-yes').onclick = async () => {
            try { await fileStore().remove(d.id); } catch (e) { /* the list entry still goes */ }
            documents = documents.filter(x => x !== d); saveData(); closeSheet(); render();
          };
        });
      };
    });
  }

  // A finished repair with a cost becomes one linked cost record (kept in step if edited, removed if reopened).
  function syncRepairCost(p, rec) {
    const linked = expenses.find(e => e.issueId === rec.id);
    if (rec.status === 'done' && rec.cost != null && rec.cost > 0) {
      const data = { description: rec.title + (rec.contractor ? ' (' + rec.contractor + ')' : ''), amount: rec.cost, date: rec.doneOn || todayIso(), category: 'repairs' };
      if (linked) Object.assign(linked, data);
      else expenses.push({ id: Date.now(), propertyId: p.id, issueId: rec.id, ...data });
    } else if (linked) expenses = expenses.filter(e => e !== linked);
  }

  function paymentSheet(p, existing) {
    if (!p) return;
    const rent = parseFloat(p.tenant && p.tenant.rentAmount) || '';
    openSheet(existing ? 'Rent payment' : 'Record a payment', `
      <div class="field-row">
        ${field('pay-amount', 'Amount (£)', 'number', existing ? existing.amount : rent, 'inputmode="decimal" step="0.01" min="0"')}
        ${field('pay-date', 'Date received', 'date', existing ? existing.date : todayIso(), `max="${todayIso()}"`)}
      </div>
      ${field('pay-note', 'Note (optional)', 'text', existing ? existing.note : '', 'maxlength="80" placeholder="Bank transfer" autocomplete="off"')}
      <p class="fine">Record money that has actually arrived. Partial payments are fine.</p>
      <div class="sheet-actions">
        ${existing ? '<button class="btn btn-quiet" id="pay-del">Delete</button>' : ''}
        <button class="btn" id="pay-save">${existing ? 'Save changes' : 'Record payment'}</button>
      </div>`, s => {
      if (existing) s.querySelector('#pay-del').onclick = () => { payments = payments.filter(x => x !== existing); saveData(); closeSheet(); render(); };
      s.querySelector('#pay-save').onclick = () => {
        const amount = Math.round(parseFloat(s.querySelector('#pay-amount').value) * 100) / 100;
        const date = s.querySelector('#pay-date').value;
        const note = s.querySelector('#pay-note').value.trim();
        if (!(amount > 0) || !date) return sheetError(s, 'Add the amount and the date it arrived.');
        if (date > todayIso()) return sheetError(s, 'The date can’t be in the future.');
        if (existing) Object.assign(existing, { amount, date, note });
        else payments.push({ id: 'pay_' + Date.now(), propertyId: p.id, date, amount, note });
        saveData(); closeSheet(); screen = 'money'; moneyView = 'rent'; render();
      };
    });
  }

  const costRow = e => `
    <button class="row" data-action="expense" data-id="${esc(e.id)}">
      ${chip(Object.hasOwn(CATEGORY, e.category) ? CATEGORY[e.category][0] : 'sparkle', 'sky', 'ichip-sm')}
      <span class="row-text"><strong>${esc(e.description)}</strong><small>${esc(ukDate(e.date))}</small></span>
      <span class="amount">${money2(e.amount)}</span>
    </button>`;

  const FAB_COST = `<button class="fab" data-action="add-expense" aria-label="Add a cost">${ICON.plus}</button>`;
  const CATEGORY = { maintenance: ['wrench', 'Maintenance'], repairs: ['hammer', 'Repairs'], insurance: ['checks', 'Insurance'], utilities: ['bolt', 'Utilities'], other: ['sparkle', 'Other'] };
  const money2 = n => (Number(n) < 0 ? '−' : '') + '£' + Math.abs(Number(n || 0)).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
      'add-property': () => isPreview ? location.assign(location.pathname + '?setup') : showSetupWizard(),
      'edit-property': () => propertySheet(p),
      menu: menuSheet,
      properties: propertiesSheet,
      tenant: () => tenantSheet(p),
      contact: () => contactSheet(p),
      share: shareScore,
      calendar: exportCalendar,
      'move-in': openMoveInPack,
      data: dataSheet,
      feedback: feedbackSheet,
      about: aboutSheet,
      resources: resourcesSheet,
      ask: () => openChat(p),
      'tax-info': taxInfoSheet,
      upcoming: upcomingSheet,
      'export-csv': exportLedgerCsv,
      'check-info': () => checkInfoSheet(t.dataset.key),
      'add-expense': () => expenseSheet(p),
      'home-list': () => { homeList = true; delete pageAt.attn; render(true); },
      'home-back': () => { homeList = false; render(true); },
      attn: () => {
        homeList = false;
        if (t.dataset.prop && t.dataset.prop !== String(p.id)) { currentPropertyId = t.dataset.prop; writeAll(store, { currentPropertyId: String(currentPropertyId) }); }
        if (t.dataset.act === 'repairs') { screen = 'property'; propView = 'repairs'; render(true); }
        else if (t.dataset.act === 'tenant') { render(); tenantSheet(getCurrentProperty()); }
        else if (t.dataset.act === 'tenant-dep') { render(); tenantSheet(getCurrentProperty(), 'dep'); }
        else go(t.dataset.go || 'home');
      },
      'add-payment': () => paymentSheet(p),
      'tenant-rent': () => tenantSheet(p, 'rent'),
      repairs: () => { screen = 'property'; propView = 'repairs'; render(true); },
      'prop-back': () => { propView = 'main'; render(true); },
      'add-issue': () => issueSheet(p),
      docs: () => { screen = 'property'; propView = 'docs'; render(true); },
      'add-doc': () => docSheet(p),
      report: reportSheet,
      doc: () => docOpenSheet(p, documents.find(x => String(x.id) === t.dataset.id)),
      issue: () => issueSheet(p, issues.find(x => String(x.id) === t.dataset.id)),
      payment: () => paymentSheet(p, payments.find(x => String(x.id) === t.dataset.id)),
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
        ${Object.entries(CATEGORY).map(([k, [ic, label]]) => `<button class="chip ${k === cat ? 'on' : ''}" data-cat="${k}" aria-pressed="${k === cat}">${ICON[ic]}${label}</button>`).join('')}
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
    const p = getCurrentProperty();
    let scope = existing ? (existing.propertyId ? 'one' : 'all') : 'one';
    const canScope = kind !== 'std' && properties.length > 1;
    openSheet(existing ? 'Key date' : 'Add a date', `
      ${field('d-name', 'What is it?', 'text', existing ? existing.name : preset, 'placeholder="Check smoke alarms" autocomplete="off"')}
      ${field('d-date', 'When', 'date', existing && existing.dueDate)}
      ${canScope ? `<div class="seg seg-2" role="group" aria-label="Which properties">
        <button data-scope="one" class="${scope === 'one' ? 'on' : ''}" aria-pressed="${scope === 'one'}">This property</button>
        <button data-scope="all" class="${scope === 'all' ? 'on' : ''}" aria-pressed="${scope === 'all'}">All properties</button>
      </div>` : ''}
      <div class="sheet-actions">
        ${existing ? '<button class="btn btn-quiet" id="d-del">Delete</button>' : ''}
        <button class="btn" id="d-save">${existing ? 'Save' : 'Add date'}</button>
      </div>`, s => {
      if (preset) s.querySelector('#d-date').focus();
      s.querySelectorAll('[data-scope]').forEach(b => b.onclick = () => {
        scope = b.dataset.scope;
        s.querySelectorAll('[data-scope]').forEach(o => { o.classList.toggle('on', o === b); o.setAttribute('aria-pressed', o === b); });
      });
      if (existing) s.querySelector('#d-del').onclick = () => {
        closeSheet();
        if (kind === 'aob') deleteAOBReminder(existing.id); else deleteReminder(existing.id);
      };
      s.querySelector('#d-save').onclick = () => {
        const name = s.querySelector('#d-name').value.trim();
        const dueDate = s.querySelector('#d-date').value;
        if (!name) return sheetError(s, 'Give it a name.');
        const propertyId = kind === 'std' ? null : (scope === 'all' && canScope) ? null : (p ? p.id : null);
        if (existing) Object.assign(existing, kind === 'std' ? { name, dueDate } : { name, dueDate, propertyId });
        else aobReminders.push({ id: 'aob_' + Date.now(), name, dueDate, completed: false, propertyId });
        saveData(); closeSheet(); render();
      };
    });
  }

  // Tenant, rent and deposit in one sheet with three tabs, so it never needs scrolling.
  function tenantSheet(p, startTab) {
    if (!p) return;
    const t = p.tenant || {};
    const nation = RentUKLib.nationOf(p);
    let tab = startTab || 'who';
    const past = (p.pastTenants || []).length;
    openSheet(`Tenancy · ${esc(p.name)}`, `
      <div class="seg seg-3" role="tablist" aria-label="Tenancy details">
        <button data-ttab="who" role="tab">Tenant</button><button data-ttab="rent" role="tab">Rent</button><button data-ttab="dep" role="tab">Deposit</button>
      </div>
      <div class="tpanel" data-panel="who">
        ${field('t-name', 'Name', 'text', t.name, 'autocomplete="off" maxlength="80"')}
        ${field('t-contact', 'Phone or email', 'text', t.contact, 'autocomplete="off" maxlength="120"')}
        <div class="field-row">
          ${field('t-start', 'Tenancy start', 'date', t.leaseStart)}
          ${field('t-end', nation === 'england' ? 'Fixed term end (if any)' : 'Tenancy end (if any)', 'date', t.leaseEnd)}
        </div>
        ${nation === 'england' ? '<p class="fine">Since 1 May 2026, private tenancies in England are periodic (rolling). Section 21 is abolished; ending one needs a legal ground.</p>' : ''}
        ${past ? `<p class="fine">${past} past ${past === 1 ? 'tenancy' : 'tenancies'} kept in your records.</p>` : ''}
      </div>
      <div class="tpanel" data-panel="rent" hidden>
        <div class="field-row">
          ${field('t-rent', 'Monthly rent (£)', 'number', t.rentAmount, 'inputmode="decimal" min="0" step="0.01"')}
          ${field('t-due', 'Due on day', 'number', t.rentDueDay || (t.leaseStart ? Number(t.leaseStart.slice(8)) : ''), 'inputmode="numeric" min="1" max="31" placeholder="1"')}
        </div>
        ${field('t-from', 'Track rent from', 'date', t.rentFrom || t.leaseStart || todayIso())}
        ${parseFloat(t.rentAmount) > 0 ? field('t-change', 'If you change the rent, the new amount applies from', 'date', todayIso()) : ''}
        <p class="fine">RentUK counts rent due from the tracking date and compares it with the payments you record. A rent change applies only from its date.</p>
      </div>
      <div class="tpanel" data-panel="dep" hidden>
        <div class="field-row">
          ${field('t-dep', 'Deposit (£)', 'number', t.depositAmount, 'inputmode="decimal" min="0" step="0.01" placeholder="0 if none"')}
          ${field('t-scheme', 'Scheme', 'text', t.depositScheme, 'maxlength="60" autocomplete="off" placeholder="e.g. DPS"')}
        </div>
        ${field('t-ref', 'Scheme reference', 'text', t.depositRef, 'maxlength="60" autocomplete="off"')}
        <div class="field-row">
          ${field('t-dreceived', 'Received on', 'date', t.depositReceived, `max="${todayIso()}"`)}
          ${field('t-dprotected', 'Protected on', 'date', t.depositProtected, `max="${todayIso()}"`)}
        </div>
        <p class="fine dep-live" aria-live="polite"></p>
      </div>
      <div class="sheet-actions">
        ${p.tenant ? '<button class="btn btn-quiet" id="t-end-tenancy">End tenancy</button>' : ''}
        <button class="btn" id="t-save">Save</button>
      </div>`, s => {
      const show = name => {
        tab = name;
        s.querySelectorAll('[data-ttab]').forEach(b => { const on = b.dataset.ttab === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
        s.querySelectorAll('.tpanel').forEach(x => { x.hidden = x.dataset.panel !== name; });
      };
      s.querySelectorAll('[data-ttab]').forEach(b => b.onclick = () => show(b.dataset.ttab));
      show(tab);
      const read = () => ({
        rentAmount: s.querySelector('#t-rent').value, depositAmount: s.querySelector('#t-dep').value,
        depositReceived: s.querySelector('#t-dreceived').value, depositProtected: s.querySelector('#t-dprotected').value
      });
      const live = () => {
        const d = RentUKLib.depositCheck(nation, read(), todayIso());
        const bits = [];
        if (d.cap != null) bits.push(d.overCap ? `Over the legal cap of ${money2(d.cap)} (${d.capText}).` : `Legal cap: ${money2(d.cap)} (${d.capText}).`);
        else if (nation === 'wales') bits.push('No cap on security deposits was found for Wales (a holding deposit is capped at 1 week’s rent).');
        if (d.deadline) bits.push(d.protectedOn ? (d.late ? `Protected after the deadline (${ukDate(d.deadline)}, ${d.deadlineText}). Get advice.` : 'Protection date is within the deadline. The required information must also be given to the tenant.') : `Protect it by ${ukDate(d.deadline)} (${d.deadlineText}).`);
        const el = s.querySelector('.dep-live'); el.textContent = bits.join(' '); el.classList.toggle('t-bad', d.overCap || d.late);
      };
      ['#t-rent', '#t-dep', '#t-dreceived', '#t-dprotected'].forEach(id => s.querySelector(id).addEventListener('input', live));
      live();
      const end = s.querySelector('#t-end-tenancy');
      if (end) end.onclick = () => endTenancySheet(p);
      s.querySelector('#t-save').onclick = () => {
        const name = s.querySelector('#t-name').value.trim();
        if (!name) { show('who'); return sheetError(s, 'Add the tenant’s name.'); }
        const due = parseInt(s.querySelector('#t-due').value, 10);
        if (s.querySelector('#t-due').value && !(due >= 1 && due <= 31)) { show('rent'); return sheetError(s, 'The due day must be between 1 and 31.'); }
        const r = read();
        if (r.depositProtected && r.depositReceived && r.depositProtected < r.depositReceived) { show('dep'); return sheetError(s, 'The protected date can’t be before the date it was received.'); }
        const oldRent = parseFloat(t.rentAmount) || 0, newRent = parseFloat(r.rentAmount) || 0;
        const changeEl = s.querySelector('#t-change');
        let rentHistory = t.rentHistory;
        if (oldRent > 0 && newRent !== oldRent && changeEl) {
          const from = changeEl.value || todayIso();
          const base = (rentHistory && rentHistory.length) ? rentHistory : [{ from: t.rentFrom || t.leaseStart || from, amount: oldRent }];
          rentHistory = [...base.filter(x => x.from < from), { from, amount: newRent }];
        }
        p.tenant = { ...t, name, contact: s.querySelector('#t-contact').value.trim(), leaseStart: s.querySelector('#t-start').value,
          leaseEnd: s.querySelector('#t-end').value, rentAmount: newRent, rentHistory,
          rentDueDay: due || undefined, rentFrom: s.querySelector('#t-from').value || undefined,
          depositAmount: r.depositAmount === '' ? undefined : String(Math.max(0, parseFloat(r.depositAmount) || 0)),
          depositScheme: s.querySelector('#t-scheme').value.trim() || undefined, depositRef: s.querySelector('#t-ref').value.trim() || undefined,
          depositReceived: r.depositReceived || undefined, depositProtected: r.depositProtected || undefined };
        // Fewer taps: a protected deposit ticks the deposit check; recording a deposit of £0 marks it not applicable.
        const comp = { ...(p.compliance || {}) };
        const depNow = RentUKLib.depositCheck(nation, r, todayIso());
        if (r.depositProtected && !depNow.late) comp.deposit = true;
        else if (r.depositAmount !== '' && parseFloat(r.depositAmount) === 0) comp.deposit = 'na';
        p.compliance = comp;
        saveData(); closeSheet(); render();
      };
    });
  }

  // Ending a tenancy keeps it in the property's history; it never deletes payments or records.
  function endTenancySheet(p) {
    const t = p.tenant;
    if (!t) return;
    openSheet('End this tenancy?', `
      <p class="story">${esc(t.name || 'This tenant')} moves to the property’s past tenancies. Their rent payments and records stay. Use this after the tenant has left; RentUK never sends notices.</p>
      ${field('e-date', 'Tenancy ended on', 'date', todayIso(), `max="${todayIso()}"`)}
      ${RentUKLib.nationOf(p) === 'england' ? '<p class="fine">In England, a landlord can only end a tenancy using a legal ground and the correct notice. Get advice before serving any notice.</p>' : '<p class="fine">Ending a tenancy has legal rules on notice. Get advice before serving any notice.</p>'}
      <div class="sheet-actions"><button class="btn btn-quiet" id="e-no">Cancel</button><button class="btn" id="e-yes">End tenancy</button></div>`, s => {
      s.querySelector('#e-no').onclick = () => tenantSheet(p);
      s.querySelector('#e-yes').onclick = () => {
        const endedOn = s.querySelector('#e-date').value || todayIso();
        p.pastTenants = [{ ...t, endedOn }, ...(p.pastTenants || [])].slice(0, 50);
        p.tenant = null;
        saveData(); closeSheet(); render();
      };
    });
  }

  const contactWays = RentUKLib.contactWays;

  function contactSheet(p) {
    const t = p && p.tenant;
    if (!t) return tenantSheet(p);
    const { email, phone } = contactWays(t.contact);
    const way = (href, icon, tone, label) => `<a class="way" href="${esc(href)}">${chip(icon, tone)}${label}</a>`;
    openSheet(esc(t.name), `
      <p class="sheet-lead"><span>${esc(p.name)}${t.leaseEnd ? ` · lease ends ${esc(ukDate(t.leaseEnd))}` : ''}${t.rentAmount ? ` · ${money(t.rentAmount)} a month` : ''}</span></p>
      ${phone || email ? `<div class="ways">
        ${phone ? way('tel:' + phone, 'phone', 'sky', 'Call') + way('sms:' + phone, 'chat', 'indigo', 'Text') : ''}
        ${email ? way('mailto:' + email + '?subject=' + encodeURIComponent(p.name), 'mail', 'sky', 'Email') : ''}
      </div>` : '<p class="story">No phone number or email saved yet.</p>'}
      <button class="btn btn-ghost" id="t-edit">Edit tenant details</button>`, s => {
      s.querySelector('#t-edit').onclick = () => tenantSheet(p);
    });
  }

  function propertiesSheet() {
    const cur = getCurrentProperty();
    openSheet('Your properties', `
      <div class="pick-list">${properties.map(p => `
        <button class="pick ${cur && p.id === cur.id ? 'on' : ''}" data-id="${esc(p.id)}" aria-pressed="${!!(cur && p.id === cur.id)}">
          ${chip('house', 'indigo', 'ichip-sm')}<strong>${esc(p.name)}</strong>${cur && p.id === cur.id ? ICON.tick : ''}</button>`).join('')}
      </div>
      <button class="btn btn-add" id="p-add">${ICON.plus}Add a property</button>`, s => {
      s.querySelectorAll('.pick').forEach(b => b.onclick = () => { closeSheet(); Object.keys(pageAt).forEach(k => delete pageAt[k]); setCurrentProperty(b.dataset.id); });
      s.querySelector('#p-add').onclick = () => { closeSheet(); if (isPreview) location.assign(location.pathname + '?setup'); else showSetupWizard(); };
    });
  }

  function menuSheet() {
    const item = (action, icon, title, text) =>
      `<button class="pick menu-item" data-go="${action}">${chip(icon, 'sky', 'ichip-sm')}<span class="grow"><strong>${title}</strong><small>${text}</small></span>${ICON.chevron}</button>`;
    openSheet('Menu', `
      <div class="pick-list">
        ${item('data', 'lock', 'Your data', 'Backup, restore, delete')}
        ${item('resources', 'info', 'Helpful resources', 'Official GOV.UK and HMRC pages')}
        ${item('feedback', 'thumb', 'Feedback', 'Tell us what to fix')}
        ${item('about', 'sparkle', 'About and privacy', 'Why RentUK exists')}
        ${item('support', 'heart', 'Support RentUK', 'Share it or chip in')}
      </div>`, s => {
      const go = { data: dataSheet, resources: resourcesSheet, feedback: feedbackSheet, about: aboutSheet, support: supportSheet };
      s.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go[b.dataset.go]());
    });
  }

  function nationSelect(id, value) {
    return `<label class="field" for="${id}"><span>Where is it?</span><select id="${id}">${Object.entries(RentUKLib.NATIONS)
      .map(([k, label]) => `<option value="${k}" ${k === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
  }

  function propertySheet(p) {
    if (!p) return;
    openSheet('Property details', `
      ${field('p-name', 'Name', 'text', p.name, 'maxlength="60" autocomplete="off"')}
      ${field('p-address', 'Address', 'text', p.address, 'maxlength="200" autocomplete="off" placeholder="Street, town, postcode"')}
      ${nationSelect('p-nation', RentUKLib.nationOf(p))}
      <p class="fine">Letting rules differ in England, Wales, Scotland and Northern Ireland. Your checks follow this choice.</p>
      <div class="sheet-actions">
        <button class="btn btn-quiet" id="p-del">Delete property</button>
        <button class="btn" id="p-save">Save</button>
      </div>`, s => {
      s.querySelector('#p-save').onclick = () => {
        const name = s.querySelector('#p-name').value.trim();
        if (!name) return sheetError(s, 'Give the property a name.');
        Object.assign(p, { name, address: s.querySelector('#p-address').value.trim(), nation: s.querySelector('#p-nation').value });
        saveData(); closeSheet(); render();
      };
      s.querySelector('#p-del').onclick = () => confirmDeleteProperty(p);
    });
  }

  // Deleting a property also removes its own costs and dates. Typed name confirmation, as it cannot be undone.
  function confirmDeleteProperty(p) {
    const costs = expenses.filter(e => e.propertyId === p.id).length;
    openSheet('Delete this property?', `
      <p class="story">This removes <strong>${esc(p.name)}</strong>, its tenant details, checks${costs ? `, ${costs} ${costs === 1 ? 'cost' : 'costs'}` : ''} and its own dates from this device. It cannot be undone. Save a backup first if you may want it later.</p>
      <label class="field" for="pd-confirm"><span>Type <strong>DELETE</strong> to confirm</span><input id="pd-confirm" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
      <div class="sheet-actions"><button class="btn btn-quiet" id="pd-no">Cancel</button><button class="btn btn-danger" id="pd-yes" disabled>Delete property</button></div>`, s => {
      const input = s.querySelector('#pd-confirm'), yes = s.querySelector('#pd-yes');
      input.addEventListener('input', () => { yes.disabled = input.value.trim().toUpperCase() !== 'DELETE'; });
      s.querySelector('#pd-no').onclick = () => propertySheet(p);
      yes.onclick = () => {
        properties = properties.filter(x => x !== p);
        expenses = expenses.filter(e => e.propertyId !== p.id);
        aobReminders = aobReminders.filter(a => a.propertyId !== p.id);
        payments = payments.filter(x => x.propertyId !== p.id);
        issues = issues.filter(x => x.propertyId !== p.id);
        documents.filter(d => d.propertyId === p.id).forEach(d => fileStore() && fileStore().remove(d.id).catch(() => {}));
        documents = documents.filter(d => d.propertyId !== p.id);
        currentPropertyId = properties.length ? properties[0].id : null;
        Object.keys(pageAt).forEach(k => delete pageAt[k]);
        saveData(); closeSheet(); screen = 'home'; render(true);
      };
    });
  }

  function dataSheet() {
    openSheet('Your data', `
      <p class="sheet-lead">${ICON.lock}<span>Everything is stored only in this browser on this device. We never see it, so we can’t recover it. Deleting the app or clearing browser data deletes it too. Keep a backup somewhere safe, such as iCloud or Google Drive.</span></p>
      ${isDemo ? '' : `<p class="fine">${metaGet(BACKUP_AT) ? 'Last backup: ' + new Date(metaGet(BACKUP_AT)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No backup saved yet.'}</p>`}
      <div class="stack">
        <button class="btn" id="g-export">${ICON.down}Save a backup file</button>
        <label class="btn btn-ghost">${ICON.up}Restore from a backup<input type="file" id="g-import" accept="application/json,.json" hidden></label>
        <button class="btn btn-danger" id="delete-all-btn">${ICON.trash}Delete all my data</button>
      </div>`, s => {
      s.querySelector('#g-export').onclick = exportData;
      s.querySelector('#g-import').onchange = ev => { closeSheet(); importData(ev); };
      s.querySelector('#delete-all-btn').onclick = () => { closeSheet(); confirmDeleteAll(); };
    });
  }

  // Public feedback address: an addy.io forwarding alias, so no personal email appears in the app or code.
  const FEEDBACK_EMAIL = 'fumr8uw9@anonaddy.me';
  // "Support privately": the owner's personal Stripe Payment Link (customer chooses the amount).
  // Leave empty and the button stays hidden, so it never leads nowhere.
  const SUPPORT_URL = '';
  const CHANNELS = [{ label: 'YouTube: The Mental SPA', url: 'https://www.youtube.com/@BeWithBreath' }];

  // Ways to support RentUK: fund it, share it, follow along. Never nagging, never guilt.
  function supportSheet() {
    openSheet('Support RentUK', `
      <p class="support-big">Built by one. Funded by many.</p>
      <p class="story">Your App. Your Data. Your Choice. RentUK has no adverts and never sells your data. If it helps you, here’s how you can help it.</p>
      ${SUPPORT_URL ? `<a class="btn btn-big" href="${esc(SUPPORT_URL)}" target="_blank" rel="noopener noreferrer">${ICON.heart}Support privately</a>
        <p class="fine">Your name is never shown publicly. Payments are handled securely by Stripe; we never see your card details.</p>` : ''}
      <button class="btn ${SUPPORT_URL ? 'btn-quiet' : 'btn-big'}" id="sup-share">${ICON.share}<span>Share RentUK with a landlord</span></button>
      ${CHANNELS.map(c => `<a class="link-btn support-link" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.label)}</a>`).join('')}`, s => {
      const btn = s.querySelector('#sup-share'), label = btn.querySelector('span');
      btn.onclick = async () => {
        const text = 'RentUK: a free, private app for UK landlords. Never miss rent, a repair or a legal check.';
        try {
          if (navigator.share) { await navigator.share({ title: 'RentUK', text, url: APP_LINK }); label.textContent = 'Thank you for sharing'; return; }
          await navigator.clipboard.writeText(`${text} ${APP_LINK}`); label.textContent = 'Copied, ready to paste';
        } catch (e) { /* share sheet closed */ }
      };
    });
  }
  function feedbackSheet() {
    openSheet('How is RentUK for you?', `
      <div class="stack">
        <button class="btn" id="f-up">${ICON.thumb}It’s helping</button>
        <button class="btn btn-ghost thumb-down" id="f-down">${ICON.thumb}Something’s not right</button>
        <a class="btn btn-ghost" href="mailto:${FEEDBACK_EMAIL}?subject=RentUK%20feedback">${ICON.mail}Email us</a>
      </div>
      <p class="fine">Nothing is sent unless you choose to email us. Emails open in your own mail app, and your property data is never included.</p>`, s => {
      s.querySelector('#f-up').onclick = () => showCustomAlert('Thank you. That means a lot.', 'Thanks');
      s.querySelector('#f-down').onclick = () => showCustomAlert('Sorry about that. Please tap “Email us” and tell us what went wrong. Your data is never included.', 'Help us fix it');
    });
  }

  // ---- Helpful resources: official pages only (each link checked on 17 Nov 2026) ----
  const RESOURCES = [
    ['Renting', [
      ['house', 'Renting out your property', 'https://www.gov.uk/renting-out-a-property'],
      ['house', 'Private renting', 'https://www.gov.uk/private-renting'],
      ['clipboard', "Renters' Rights Act information sheet", 'https://www.gov.uk/government/publications/the-renters-rights-act-information-sheet-2026'],
      ['lock', 'Tenancy deposit protection', 'https://www.gov.uk/tenancy-deposit-protection'],
      ['user', 'Right to Rent document checks', 'https://www.gov.uk/check-tenant-right-to-rent-documents'],
      ['checks', 'Gas safety for landlords (HSE)', 'https://www.hse.gov.uk/gas/domestic/faqlandlord.htm'],
      ['bolt', 'Electrical safety standards', 'https://www.gov.uk/government/publications/electrical-safety-standards-in-the-private-and-social-rented-sectors-guidance'],
      ['sparkle', 'Find an energy certificate (EPC)', 'https://www.gov.uk/find-energy-certificate']
    ]],
    ['Tax (HMRC)', [
      ['pound', 'Paying tax on rental income', 'https://www.gov.uk/renting-out-a-property/paying-tax'],
      ['pound', 'Work out your rental income', 'https://www.gov.uk/guidance/income-tax-when-you-rent-out-a-property-working-out-your-rental-income'],
      ['dates', 'Making Tax Digital: do you need it, and when', 'https://www.gov.uk/guidance/find-out-if-and-when-you-need-to-use-making-tax-digital-for-income-tax'],
      ['dates', 'Use Making Tax Digital for Income Tax', 'https://www.gov.uk/guidance/use-making-tax-digital-for-income-tax']
    ]]
  ];
  function resourcesSheet() {
    openSheet('Helpful resources', RESOURCES.map(([group, links]) => `
      <div class="list-head"><span>${esc(group)}</span></div>
      <div class="pick-list">${links.map(([icon, label, url]) => `
        <a class="pick res-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${chip(icon, 'sky', 'ichip-sm')}<strong>${esc(label)}</strong>${ICON.chevron}</a>`).join('')}
      </div>`).join('') + `<p class="fine">Official GOV.UK, HMRC and HSE pages. They open in your browser; RentUK sends nothing to them.</p>`);
  }

  // ---- Ask RentUK: chat with Claude through the RentUK relay (relay/worker.mjs, a Cloudflare Worker) ----
  // The relay holds the owner's Anthropic key as a secret and sets the prompt, so users never need a key or any setup.
  // It never logs or stores questions.
  const CHAT_RELAY = 'https://rentuk-chat.bimuti.com/';
  const chat = { turns: [], withSummary: false, busy: false };

  // Scores and totals only: no property names, addresses or tenant details.
  function chatSummary(p) {
    const r = checksFor(p);
    const est = RentUKLib.rentalEstimate([p], expenses, RentUKLib.taxYearStart(todayIso()));
    const checks = r.items.map(i => `- ${i.label}: ${i.status}${i.expires ? ` (valid until ${i.expires})` : ''}`).join('\n');
    return `Summary of the user's current property (shared by the user; no personal details):
Today: ${todayIso()}. Property in ${nationName(p)}. Compliance score ${r.score}/100.
${checks}
Monthly rent: ${p.tenant && p.tenant.rentAmount ? '£' + p.tenant.rentAmount : 'not set'}.
Tax year ${est.taxYear.label} estimate: rent £${est.income}, costs £${est.costs}.`;
  }

  function chatErrorText(status, body) {
    if (status === 401) return 'Chat is unavailable right now. Try again later.';
    if (status === 402 || /credit|billing/i.test(body)) return 'Your Anthropic account needs credit before Claude can answer.';
    if (status === 429) return 'Too many questions at once. Wait a moment and try again.';
    if (status >= 500) return 'Claude is busy or unavailable right now. Try again shortly.';
    return 'Something went wrong (' + status + '). Try again.';
  }

  async function askClaude(p) {
    // Send only the latest question and the five exchanges before it, which keeps each request small.
    const recent = chat.turns.slice(-11);
    while (recent.length && recent[0].role !== 'user') recent.shift();
    const messages = recent.map(t => ({ role: t.role, content: t.content }));
    let res;
    try {
      res = await fetch(CHAT_RELAY, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages, summary: chat.withSummary ? chatSummary(p) : '' })
      });
    } catch (e) {
      return { error: 'Could not reach Claude. Check your internet connection.' };
    }
    const raw = await res.text();
    if (!res.ok) return { error: chatErrorText(res.status, raw) };
    let data;
    try { data = JSON.parse(raw); } catch (e) { return { error: 'Claude sent a reply RentUK could not read. Try again.' }; }
    if (data.stop_reason === 'refusal') return { error: 'Claude declined to answer that one. Try asking it another way.' };
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    // Keep only the visible answer for later turns; earlier reasoning is not needed and keeps requests small.
    const kept = (data.content || []).filter(b => b.type === 'text').map(b => ({ type: 'text', text: String(b.text).slice(0, 6000) }));
    return { content: kept.length ? kept : [{ type: 'text', text: '(no answer)' }], text: text + (data.stop_reason === 'max_tokens' ? '\n\n(Answer cut short.)' : '') };
  }

  const COMING_SOON = `<div class="soon-row" aria-label="Coming soon">
      <span class="soon-pill">${ICON.mic}Voice chat <em>Premium · coming soon</em></span>
      <span class="soon-pill">${ICON.video}Video chat <em>Premium · coming soon</em></span>
    </div>`;

  function openChat(p) {
    closeSheet();
    const old = document.getElementById('chat-screen');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'chat-screen';
    el.className = 'chat-screen';
    el.innerHTML = `
      <header class="chat-top">
        <button class="icon-btn" id="c-back" aria-label="Close chat">${ICON.back}</button>
        <img src="icons/assistant.svg" alt="" width="40" height="40" class="chat-avatar">
        <div class="grow"><h3>RentUK Assistant</h3><p>AI assistant · powered by Claude</p></div>
      </header>
      <div class="chat-body" id="c-body"></div>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    makeDialog(el, close);
    el.querySelector('#c-back').onclick = close;
    const body = el.querySelector('#c-body');
    if (!CHAT_RELAY) {
      body.innerHTML = `
        <div class="chat-intro">
          <img src="icons/assistant.svg" alt="" width="96" height="96" class="chat-avatar-lg">
          <h2>Chat is unavailable</h2>
          <p>The RentUK assistant can’t be reached right now. Please try again later.</p>
        </div>`;
      return;
    }
    body.innerHTML = `
      <div class="chat-log" id="c-log" aria-live="polite"></div>
      <div class="chat-dock">
        ${COMING_SOON}
        <label class="chat-opt"><input type="checkbox" id="c-sum" ${chat.withSummary ? 'checked' : ''}> Share this property’s scores and totals (no names or contact details)</label>
        <div class="chat-input">
          <textarea id="c-q" rows="1" maxlength="2000" placeholder="Ask a landlord question" aria-label="Your question"></textarea>
          <button class="btn chat-send" id="c-send" aria-label="Send">${ICON.send}</button>
        </div>
        <div class="chat-foot"><span class="fine">AI can make mistakes. Not legal or tax advice.</span><span class="fine">${ICON.lock} We never see or store your questions.</span></div>
      </div>`;
    const log = body.querySelector('#c-log'), q = body.querySelector('#c-q'), send = body.querySelector('#c-send');
    const bubble = (role, text) => {
      const b = document.createElement('div');
      b.className = 'bubble bubble-' + role;
      b.textContent = text;
      log.appendChild(b);
      log.scrollTop = log.scrollHeight;
      return b;
    };
    if (!chat.turns.length) bubble('assistant', 'Hello. I’m an AI assistant for landlords in England. What would you like to know?');
    chat.turns.forEach(t => bubble(t.role, t.text));
    body.querySelector('#c-sum').onchange = e => { chat.withSummary = e.target.checked; };
    const ask = async () => {
      const text = q.value.trim();
      if (!text || chat.busy) return;
      chat.busy = true; send.disabled = true; q.value = '';
      chat.turns.push({ role: 'user', content: text, text });
      bubble('user', text);
      const wait = bubble('assistant', 'Thinking…');
      wait.classList.add('bubble-wait');
      const out = await askClaude(p);
      wait.remove();
      if (out.error) {
        chat.turns.pop();
        bubble('error', out.error);
      } else {
        chat.turns.push({ role: 'assistant', content: out.content, text: out.text });
        bubble('assistant', out.text);
      }
      chat.busy = false; send.disabled = false; q.focus();
    };
    send.onclick = ask;
    q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } });
    q.focus();
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
      <p class="tagline">Your app. Your data. Your choice.</p>
      <button class="link-btn" id="a-priv">Read our privacy notice</button>`, s => {
      s.querySelector('#a-priv').onclick = privacySheet;
    });
  }

  // Plain-English privacy notice (updated 17 Nov 2026). Keep in step with PRIVACY.md.
  function privacySheet() {
    openSheet('Privacy notice', `
      <p class="story"><strong>Your property data stays on your device.</strong> Properties, tenants, rent payments, deposit details, repairs, checks, dates and costs are saved only in this browser. Documents you add are stored in this browser’s file storage on the same device. We never receive any of it. Backups, reports and exports are made only when you choose; reports leave out tenant details unless you tick the box. “Delete all my data” removes everything from this device, including documents.</p>
      <p class="story"><strong>No tracking.</strong> No accounts, cookies, analytics, adverts or trackers. The browser’s own storage is used only to make the app work.</p>
      <p class="story"><strong>If you use the chat.</strong> Your question, the earlier questions and answers in that chat and, only if you tick the box, this property’s scores and totals (no names or contact details) go through our small relay on Cloudflare to Anthropic, the maker of Claude, to get an answer. The relay does not log or store them. Cloudflare handles your internet (IP) address to deliver the message and limit misuse; we do not keep it. Anthropic handles your question under its own privacy policy and may keep it for a limited time. Please don’t type names, addresses or other personal details into the chat.</p>
      <p class="story"><strong>If you email us.</strong> Your message reaches us through a forwarding service (addy.io), which hides our address. We use your email address and message only to reply, and delete them if you ask.</p>
      <p class="story"><strong>Questions or requests.</strong> Use “Email us” under Menu → Feedback.</p>
      <p class="fine">Last updated 19 November 2026.</p>`);
  }

  function taxInfoSheet() {
    openSheet('How the tax estimate works', `
      <p class="story">Rent is worked out from each tenant’s monthly rent and lease dates inside this tax year (6 April to 5 April). Costs are the ones you’ve added.</p>
      <p class="story">If your costs are under £1,000, the £1,000 property allowance gives a lower profit, so we use it. You can claim one or the other, not both.</p>
      <p class="story">It leaves out mortgage interest relief, other income, joint ownership and your personal allowance. It’s a rough guide, not tax advice. Check with HMRC or an accountant.</p>`);
  }

  function checkInfoSheet(key) {
    const p = getCurrentProperty();
    const item = checksFor(p).items.find(i => i.key === key);
    if (!item) return;
    const comp = p.compliance || {};
    const cur = comp[key];
    const isDate = typeof cur === 'string' && /^\d{4}-/.test(cur) ? cur : '';
    const answer = (id, label, on) => `<button class="chip ${on ? 'on' : ''}" data-answer="${id}" aria-pressed="${!!on}">${label}</button>`;
    openSheet(esc(item.label), `
      <p class="kind-badge ${item.legal ? 'legal' : 'good'}">${item.legal ? 'Legal duty' : 'Good practice'} · ${esc(nationName(p))}</p>
      <p class="story">${esc(item.detail)}</p>
      <p class="status-line st-${item.status}"><strong>${esc(item.statusLabel)}</strong>${item.status === 'ok' || item.status === 'soon' || item.status === 'expired' || item.status === 'action' ? ' · ' + statusText(item) : ''}</p>
      ${item.kind === 'date' ? `<div class="field-row">
        ${field('c-date', 'Date of the last one', 'date', isDate, `max="${todayIso()}"`)}
        ${item.key === 'epc' ? `<label class="field" for="c-epc"><span>Rating</span><select id="c-epc"><option value="">Not set</option>${RentUKLib.EPC_BANDS.map(b => `<option ${comp.epcRating === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label>` : ''}
      </div>` : ''}
      <div class="chips" role="group" aria-label="Your answer">
        ${item.kind === 'yes' ? answer('yes', 'Done', cur === true) + answer('no', 'Not done', cur === undefined) : ''}
        ${item.canNA ? answer('na', 'Not applicable', cur === 'na') : ''}
        ${answer('unsure', 'Not sure', cur === 'unsure')}
      </div>
      <div class="sheet-actions">${item.kind === 'date' && cur ? '<button class="btn btn-quiet" id="c-clear">Clear</button>' : ''}${item.kind === 'date' ? '<button class="btn" id="c-save">Save date</button>' : ''}</div>
      <a class="btn btn-ghost" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Read the official source ↗</a>
      <p class="fine">Checked against official sources on ${esc(RentUKLib.RULES_VERIFIED)}. Simplified: a guide, not legal advice.</p>`, s => {
      s.querySelectorAll('[data-answer]').forEach(b => b.onclick = () => {
        const a = b.dataset.answer;
        closeSheet();
        updateCompliance(key, a === 'yes' ? true : a === 'no' ? '' : a);
      });
      const save = s.querySelector('#c-save');
      if (save) save.onclick = () => {
        const v = s.querySelector('#c-date').value;
        const epc = s.querySelector('#c-epc');
        if (v && v > todayIso()) return sheetError(s, 'The date can’t be in the future.');
        closeSheet();
        if (epc) updateCompliance('epcRating', epc.value);
        updateCompliance(key, v);
      };
      const clear = s.querySelector('#c-clear');
      if (clear) clear.onclick = () => { closeSheet(); updateCompliance(key, ''); };
    });
  }

  function upcomingSheet() {
    const p = getCurrentProperty();
    openSheet('What’s changing', `
      <p class="sheet-lead"><span>${esc(nationName(p))}: announced changes that are not in force yet, as checked on ${esc(RentUKLib.RULES_VERIFIED)}. Your checklist only includes rules already in force.</span></p>
      <ul class="usp">${RentUKLib.UPCOMING(RentUKLib.nationOf(p)).map(u => `<li>${esc(u)}</li>`).join('')}</ul>
      <p class="fine">Dates can move. Check GOV.UK or your nation’s official site before acting.</p>`);
  }

  function sheetError(s, msg) {
    let el = s.querySelector('.sheet-error');
    if (!el) { el = document.createElement('p'); el.className = 'sheet-error'; el.setAttribute('role', 'alert'); s.querySelector('.sheet-actions').before(el); }
    el.textContent = msg;
  }

  // Load local data
  function loadLocalData() {
    expenses = asList(readJson(store, 'expenses', []), []);
    properties = asList(readJson(store, 'properties', []), []);
    currentPropertyId = store.getItem('currentPropertyId') || (properties.length > 0 ? properties[0].id : null);
    reminders = asList(readJson(store, 'reminders', null), null) || [
      { id: 1, name: 'Gas Safety Check', dueDate: '', type: 'gas', completed: false, propertyId: null },
      { id: 2, name: 'Boiler Service', dueDate: '', type: 'maintenance', completed: false, propertyId: null },
      { id: 3, name: 'Electrical Safety Check', dueDate: '', type: 'electrical', completed: false, propertyId: null },
      { id: 4, name: 'Insurance Renewal', dueDate: '', type: 'insurance', completed: false, propertyId: null },
      { id: 5, name: 'EPC Renewal', dueDate: '', type: 'epc', completed: false, propertyId: null },
      { id: 6, name: 'Deposit Protection', dueDate: '', type: 'deposit', completed: false, propertyId: null }
    ];
    aobReminders = asList(readJson(store, 'aobReminders', []), []);
    payments = asList(readJson(store, 'payments', []), []);
    issues = asList(readJson(store, 'issues', []), []);
    fixRentStart();
    documents = asList(readJson(store, 'documents', []), []);
  }

  // Tenancies saved before rent tracking existed have no start date. Start tracking today (saved, so it never
  // moves) rather than from an old lease start, which would show years of false arrears.
  function fixRentStart() {
    let changed = false;
    properties.forEach(p => {
      const t = p && p.tenant;
      if (t && parseFloat(t.rentAmount) > 0 && !t.rentFrom) { t.rentFrom = todayIso(); changed = true; }
    });
    if (changed && !isDemo) saveLocalData();
  }

  // Save local data
  function saveLocalData() {
    const result = writeAll(store, {
      expenses, properties, reminders, aobReminders, payments, issues, documents,
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
    setTimeout(maybeRemindBackup, 600);
  }

  // Export data functionality
  function exportData() {
    const dataStr = JSON.stringify({ expenses, properties, currentPropertyId, reminders, aobReminders, payments, issues, documents }, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

    const exportFileDefaultName = `rentuk-backup-${new Date().toISOString().slice(0,10)}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    rememberBackup();
  }

  // Gentle backup reminder. We never hold anyone's data, so a backup file is the only way back
  // if the app or browser data is deleted. Shown after the first property, then monthly.
  const BACKUP_AT = 'rentukLastBackup', BACKUP_SNOOZE = 'rentukBackupSnooze';
  const metaGet = k => { try { return Number(localStorage.getItem(k)) || 0; } catch (e) { return 0; } };
  const metaSet = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (e) { /* not essential */ } };
  function rememberBackup() {
    if (isDemo) return;
    metaSet(BACKUP_AT, Date.now());
    const bar = document.getElementById('backup-nudge');
    if (bar) bar.remove();
  }
  function maybeRemindBackup() {
    if (isDemo || !window.RentUKPwa || document.getElementById('backup-nudge') || document.getElementById('pwa-install')) return;
    if (!window.RentUKLib.backupDue(Date.now(), properties.length > 0, metaGet(BACKUP_AT), metaGet(BACKUP_SNOOZE))) return;
    const ever = metaGet(BACKUP_AT) > 0;
    window.RentUKPwa.showBar('backup-nudge',
      ever ? 'Time for a fresh backup. We can’t recover your data for you.' : 'Save a backup. We can’t recover your data for you.',
      'Back up', bar => { bar.remove(); exportData(); });
    const close = document.querySelector('#backup-nudge .pwa-close');
    if (close) { close.setAttribute('aria-label', 'Remind me later'); close.addEventListener('click', () => metaSet(BACKUP_SNOOZE, Date.now())); }
  }

  function applyImport(result) {
    const d = result.data;
    const before = documents;
    // Restoring replaces everything: anything not in the backup is cleared, not kept from before.
    expenses = d.expenses || [];
    properties = d.properties || [];
    currentPropertyId = d.currentPropertyId || (properties[0] && properties[0].id) || null;
    reminders = d.reminders || reminders;
    aobReminders = d.aobReminders || [];
    payments = d.payments || [];
    issues = d.issues || [];
    documents = d.documents || [];
    const keep = new Set(documents.map(x => String(x.id)));
    before.filter(x => !keep.has(String(x.id))).forEach(x => fileStore() && fileStore().remove(x.id).catch(() => {}));
    fixRentStart();
    saveData();
    showCustomAlert(result.skipped > 0
      ? `Data restored. ${result.skipped} invalid record(s) were skipped.`
      : 'Data restored.' + (documents.length ? ' Document files are not inside backups, so any not on this device will show as not found.' : ''), 'RentUK says');
    render(true);
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
        const d = result.data;
        const count = (list, one, many) => list ? `${list.length} ${list.length === 1 ? one : many}` : null;
        const incoming = [count(d.properties, 'property', 'properties'), count(d.expenses, 'cost', 'costs'),
          count(d.reminders, 'date', 'dates'), count(d.aobReminders, 'extra date', 'extra dates'), count(d.payments, 'rent payment', 'rent payments'), count(d.issues, 'repair', 'repairs'), count(d.documents, 'document listed', 'documents listed')].filter(Boolean).join(', ');
        openSheet('Replace your data?', `
          <p class="story">This file holds ${esc(incoming)}. Restoring replaces what you have now (${properties.length} ${properties.length === 1 ? 'property' : 'properties'}, ${expenses.length} costs). Save a backup first if you may want it back.</p>
          <div class="sheet-actions"><button class="btn btn-quiet" id="imp-no">Cancel</button><button class="btn" id="imp-yes">Replace my data</button></div>`, s => {
          s.querySelector('#imp-no').onclick = closeSheet;
          s.querySelector('#imp-yes').onclick = () => { closeSheet(); applyImport(result); };
        });
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
  const todayIso = localIso;
  const STATUS_ICON = { ok: '✅', soon: '⏳', expired: '❌', missing: '⚪' };

  const ukDate = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  function statusText(item) {
    if (item.status === 'na') return 'Not applicable';
    if (item.status === 'unverified') return 'Unable to verify: you marked it not sure';
    if (item.status === 'action') return esc(item.note);
    if (item.kind === 'yes') return item.status === 'ok' ? 'Done' : 'Action required';
    if (item.status === 'missing') return 'Action required: add the date of the last one';
    if (item.status === 'expired') return `Expired ${esc(ukDate(item.expires))}`;
    return item.status === 'soon' ? `Expiring soon: renew by ${esc(ukDate(item.expires))} · ${item.daysLeft === 1 ? '1 day' : item.daysLeft + ' days'} left` : `Up to date until ${esc(ukDate(item.expires))}`;
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


  const money = n => (Number(n) < 0 ? '−' : '') + '£' + Math.abs(Math.round(Number(n) || 0)).toLocaleString('en-GB');

  // ---- Accountant export: every rent payment and cost in the current tax year, all properties ----
  function exportLedgerCsv() {
    const ty = RentUKLib.taxYear(RentUKLib.taxYearStart(todayIso()));
    const rows = RentUKLib.ledgerRows(properties, payments, expenses, ty.start, ty.end);
    if (rows.length < 2) { showCustomAlert('Nothing to export yet. Record rent payments or add costs for this tax year first.', 'Nothing yet'); return; }
    const blob = new Blob([RentUKLib.buildCsv(rows)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `rentuk-${ty.label.replace('/', '-')}-income-and-costs.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showCustomAlert(`Saved ${rows.length - 1} lines for tax year ${ty.label} (rent you recorded as received, and costs). Open it in Excel, Numbers or Google Sheets, or send it to your accountant.`, 'Export ready');
  }

  // ---- Calendar export ----
  function exportCalendar() {
    const events = [];
    const today = todayIso();
    properties.forEach(p => {
      checksFor(p, today).items
        .filter(i => i.expires)
        .forEach(i => events.push({
          uid: `${p.id}-${i.key}-${i.expires}`, date: i.expires,
          title: `Renew ${i.label} – ${p.name}`,
          description: `${i.hint}. Guidance: ${i.url}`
        }));
    });
    [...reminders, ...aobReminders].filter(r => r.dueDate && !r.completed && r.dueDate >= today)
      .forEach(r => {
        const prop = r.propertyId ? properties.find(x => x.id === r.propertyId) : null;
        events.push({ uid: `reminder-${r.id}-${r.dueDate}`, date: r.dueDate, title: prop ? `${r.name} – ${prop.name}` : r.name });
      });
    // Rent due every month, and any deposit protection deadline.
    properties.forEach(p => {
      const L = ledgerFor(p);
      if (L.tracked && L.nextDue) events.push({ uid: `rent-${p.id}`, date: L.nextDue, title: `Rent due ${money2(L.nextAmount)} – ${p.name}`,
        description: 'Record the payment in RentUK when it arrives.', rrule: RentUKLib.monthlyRule(L.day), alarmDays: 1 });
      const dep = RentUKLib.depositCheck(RentUKLib.nationOf(p), p.tenant, today);
      if (p.tenant && dep.due && dep.deadline >= today) events.push({ uid: `deposit-${p.id}-${dep.deadline}`, date: dep.deadline, title: `Protect the deposit – ${p.name}`, alarmDays: 7 });
    });
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
    showCustomAlert(`Saved ${events.length} date${events.length === 1 ? '' : 's'} as rentuk-reminders.ics. Open it to add them to Apple, Google or Outlook calendar. Renewals alert you 14 days before; rent reminders repeat monthly and alert the day before.`, 'Calendar file ready');
  }

  // ---- Property report (printable). Tenant details are left out unless the landlord chooses to include them. ----
  function reportSheet() {
    const many = properties.length > 1;
    openSheet('Property report', `
      <p class="story">A one-page summary to print, save as PDF or share with an accountant, lender or agent.</p>
      ${many ? `<div class="seg seg-2" role="group" aria-label="Which properties">
        <button data-rscope="one" class="on" aria-pressed="true">This property</button><button data-rscope="all" aria-pressed="false">All ${properties.length}</button></div>` : ''}
      <label class="chat-opt"><input type="checkbox" id="r-tenant"> Include tenant names and contact details</label>
      <p class="fine">Left unticked, the report shows no personal details, so it is safer to share.</p>
      <div class="sheet-actions"><button class="btn" id="r-open">${ICON.report}Open report</button></div>`, s => {
      let scope = 'one';
      s.querySelectorAll('[data-rscope]').forEach(b => b.onclick = () => {
        scope = b.dataset.rscope;
        s.querySelectorAll('[data-rscope]').forEach(o => { o.classList.toggle('on', o === b); o.setAttribute('aria-pressed', o === b); });
      });
      s.querySelector('#r-open').onclick = () => {
        const list = scope === 'all' ? properties : [getCurrentProperty()];
        closeSheet();
        openPrintWindow(`RentUK report – ${scope === 'all' ? 'all properties' : list[0].name}`, reportBody(list, s.querySelector('#r-tenant').checked));
      };
    });
  }

  function reportBody(list, withTenant) {
    const today = todayIso();
    const ty = RentUKLib.taxYear(RentUKLib.taxYearStart(today));
    const until = today < ty.end ? today : ty.end;
    const cell = v => `<td>${v}</td>`;
    const sections = list.map(p => {
      const r = checksFor(p);
      const L = ledgerFor(p);
      const t = p.tenant;
      const got = RentUKLib.received(payments, ty.start, until, p.id);
      const costs = expenses.filter(e => e.propertyId === p.id && e.date >= ty.start && e.date <= until);
      const byCat = {};
      costs.forEach(e => { byCat[e.category || 'other'] = (byCat[e.category || 'other'] || 0) + (Number(e.amount) || 0); });
      const costTotal = costs.reduce((n, e) => n + (Number(e.amount) || 0), 0);
      const iss = issues.filter(i => i.propertyId === p.id);
      const open = iss.filter(i => i.status !== 'done');
      const doneYear = iss.filter(i => i.status === 'done' && i.doneOn >= ty.start);
      const dep = RentUKLib.depositCheck(RentUKLib.nationOf(p), t, today);
      const legal = r.items.filter(i => i.legal && i.status !== 'na');
      return `
        <section>
          <h2>${esc(p.name)}</h2>
          <p class="meta">${p.address && withTenant ? esc(p.address) + ' · ' : ''}${esc(nationName(p))}${t && withTenant && t.name ? ' · Tenant: ' + esc(t.name) + (t.contact ? ' (' + esc(t.contact) + ')' : '') : t ? ' · Let' : ' · Vacant'}</p>
          <h3>Compliance: ${legal.filter(i => i.status === 'ok').length} of ${legal.length} legal checks up to date (score ${r.score}/100)</h3>
          <table><tr><th>Check</th><th>Status</th><th>Valid until</th><th>Type</th></tr>
            ${r.items.map(i => `<tr class="s-${i.status}">${cell(esc(i.label))}${cell(esc(i.statusLabel) + (i.note ? ': ' + esc(i.note) : ''))}${cell(i.expires ? esc(ukDate(i.expires)) : '—')}${cell(i.legal ? 'Legal duty' : 'Good practice')}</tr>`).join('')}
          </table>
          <h3>Money, tax year ${esc(ty.label)} to ${esc(ukDate(until))} (actual, as recorded)</h3>
          <table>
            <tr><td>Rent received</td><td class="n">${money2(got)}</td></tr>
            <tr><td>Costs</td><td class="n">−${money2(costTotal)}</td></tr>
            ${Object.entries(byCat).map(([k, v]) => `<tr class="sub"><td>${esc(k)}</td><td class="n">${money2(v)}</td></tr>`).join('')}
            <tr class="tot"><td>Profit before tax</td><td class="n">${money2(got - costTotal)}</td></tr>
            ${L.rent ? `<tr><td>Rent arrears now</td><td class="n">${L.arrears ? money2(L.arrears) + ' (since ' + esc(ukDate(L.oldestUnpaid)) + ')' : 'None'}</td></tr>` : ''}
          </table>
          ${t ? `<h3>Deposit</h3><p>${dep.amount ? `${money2(dep.amount)}${t.depositScheme ? ' · ' + esc(t.depositScheme) : ''}${dep.protectedOn ? ' · protected ' + esc(ukDate(dep.protectedOn)) + (dep.late ? ' (after the deadline)' : '') : ' · not recorded as protected'}${dep.overCap ? ' · over the legal cap' : ''}` : 'No deposit recorded.'}</p>` : ''}
          <h3>Repairs</h3>
          <p>${open.length ? `${open.length} open: ${open.map(i => esc(i.title) + ' (' + esc(RentUKLib.ISSUE_PRIORITY[i.priority]) + ', ' + esc(RentUKLib.ISSUE_STATUS[i.status]) + ')').join('; ')}` : 'None open.'}
            ${doneYear.length ? `<br>${doneYear.length} completed this tax year.` : ''}</p>
        </section>`;
    }).join('');
    return `<h1>${list.length > 1 ? 'Portfolio report' : 'Property report'}</h1>
      <p class="meta">Prepared ${esc(ukDate(today))} with RentUK from the owner’s own records.</p>
      ${sections}
      <p class="note">Figures are the payments and costs recorded in RentUK, not audited accounts. Compliance statuses reflect what the owner recorded against official guidance checked on ${esc(RentUKLib.RULES_VERIFIED)}; they are not legal advice or a guarantee of compliance.</p>`;
  }

  // Opens a print-ready page in a new tab (used by the report and the move-in pack).
  function openPrintWindow(title, body) {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${esc(title)}</title>
      <style>
        body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; max-width: 820px; margin: 24px auto; padding: 0 16px; }
        h1 { font-size: 24px; margin: 0; } h2 { font-size: 18px; border-bottom: 2px solid #6366f1; padding-bottom: 4px; margin-top: 28px; }
        h3 { font-size: 14px; margin: 16px 0 6px; } section { break-inside: avoid-page; }
        table { width: 100%; border-collapse: collapse; } td, th { border: 1px solid #ccc; padding: 5px 7px; text-align: left; vertical-align: top; }
        th { background: #f3f4ff; } td.n { text-align: right; white-space: nowrap; } tr.sub td { color: #555; padding-left: 20px; } tr.tot td { font-weight: 700; }
        tr.s-expired td:nth-child(2), tr.s-action td:nth-child(2), tr.s-missing td:nth-child(2) { color: #b91c1c; font-weight: 600; }
        tr.s-soon td:nth-child(2), tr.s-unverified td:nth-child(2) { color: #b45309; font-weight: 600; } tr.s-ok td:nth-child(2) { color: #047857; }
        .meta { color: #555; margin-top: 2px; } .note { color: #555; font-size: 12px; margin-top: 28px; }
        .print { background: #4f46e5; color: #fff; border: 0; padding: 10px 18px; border-radius: 8px; font-size: 15px; cursor: pointer; }
        @media print { .print { display: none; } body { margin: 0; } }
      </style></head><body><button class="print">Print or save as PDF</button>${body}</body></html>`;
    const w = window.open('', '_blank');
    if (!w) { showCustomAlert('Your browser blocked the new window. Allow pop-ups for this page and try again.', 'Pop-up blocked'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    const printBtn = w.document.querySelector('.print');
    if (printBtn) printBtn.addEventListener('click', () => w.print());
  }

  // ---- Tenant move-in pack (printable) ----
  function openMoveInPack() {
    const p = getCurrentProperty();
    if (!p) return;
    const r = checksFor(p);
    const box = ok => ok ? '☑' : '☐';
    const line = i => `<li>${box(i.status === 'ok' || i.status === 'na')} ${esc(i.label)}${i.status === 'na' ? ' — not applicable' : i.expires ? ` — valid until ${esc(ukDate(i.expires))}` : ''}: ${esc(i.hint)}</li>`;
    const before = r.items.filter(i => i.key !== 'deposit' && i.key !== 'alarms' && i.legal);
    const dep = r.items.find(i => i.key === 'deposit');
    const alarms = r.items.find(i => i.key === 'alarms');
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
      <button class="print">🖨️ Print or save as PDF</button>
      <h1>Tenant move-in pack</h1>
      <p class="meta">${esc(p.name)}${p.address ? ' · ' + esc(p.address) : ''} · ${esc(nationName(p))}<br>
        Tenant: ${esc(t.name || '____________________')} · Move-in date: ${esc(t.leaseStart ? ukDate(t.leaseStart) : '____________')}</p>

      <h2>1. Before the tenant moves in</h2>
      <ul>
        ${before.map(line).join('')}
        <li>☐ Copies of the certificates above given to the tenant</li>
      </ul>

      <h2>2. On move-in day</h2>
      <ul>
        ${alarms ? `<li>${box(alarms.status === 'ok')} ${esc(alarms.label)} tested and working: ${esc(alarms.hint)} (tenant initials: ______)</li>` : ''}
        <li>☐ Inventory below completed and signed by both</li>
        <li>☐ Meter readings taken (below)</li>
        <li>☐ Keys handed over (below)</li>
        <li>☐ Stopcock, boiler, fuse box and alarm locations shown to tenant</li>
      </ul>

      ${dep ? `<h2>3. Deposit</h2>
      <ul>
        <li>${box(dep.status === 'ok' || dep.status === 'na')} ${esc(dep.label)}${dep.status === 'na' ? ' — no deposit taken' : ''}: ${esc(dep.hint)}</li>
      </ul>` : ''}

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

      <p class="note">Made with RentUK. Checklist for ${esc(nationName(p))}, based on official guidance checked on ${esc(RentUKLib.RULES_VERIFIED)}. Informational only, not legal advice.</p>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { showCustomAlert('Your browser blocked the new window. Allow pop-ups for this page and try again.', 'Pop-up blocked'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    const printBtn = w.document.querySelector('.print');
    if (printBtn) printBtn.addEventListener('click', () => w.print());
  }

  // ---- Demo mode ----
  function showDemoBanner() {
    const bar = document.createElement('div');
    bar.className = 'demo-banner';
    const exit = location.pathname + (hasRealData ? '' : '?setup');
    bar.innerHTML = `<span>${isPreview ? 'Preview · nothing is saved' : 'Demo · nothing is saved'}</span>
      <a href="${esc(exit)}" class="demo-exit">${hasRealData ? 'Use my own' : 'Set up mine'} →</a>`;
    document.querySelector('.topbar').before(bar);
  }

  // ---- 60-second setup ----
  function showSetupWizard() {
    if (document.getElementById('setup-wizard')) return;
    const answers = { name: '', rent: '', nation: 'england', compliance: {} };
    const overlay = document.createElement('div');
    overlay.id = 'setup-wizard';
    overlay.className = 'wizard-overlay';
    overlay.setAttribute('aria-label', 'Property setup');
    document.body.appendChild(overlay);
    makeDialog(overlay);
    const items = () => RentUKLib.NATION_ITEMS(answers.nation).filter(i => i.legal);
    // The chosen nation's legal checks (the nation is picked on step 1, before these are shown).
    const dates = () => items().filter(i => i.kind === 'date');
    const yeses = () => items().filter(i => i.kind === 'yes');
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
          <label class="wizard-label" for="wz-nation">Where is it?</label>
          <select id="wz-nation">${Object.entries(RentUKLib.NATIONS).map(([k, label]) => `<option value="${k}" ${k === answers.nation ? 'selected' : ''}>${label}</option>`).join('')}</select>
          <label class="wizard-label" for="wz-rent">Monthly rent (optional)</label>
          <input id="wz-rent" type="number" min="0" step="1" placeholder="£" value="${esc(answers.rent)}">
          <p class="wizard-hint">🔒 Stays on this device. No account, no sign-up.</p>
          <p class="wizard-hint"><a href="?demo" class="demo-link">Just looking? Try the demo first →</a></p>`, 'Next →');
      } else if (step === 1) {
        frame(`
          <p class="wizard-kicker">Step 2 of 3</p>
          <h3>When were these last done?</h3>
          <p class="wizard-hint">Not sure? Leave it blank and add it later.</p>
          ${dates().map(i => `
            <label class="wizard-label" for="wz-${i.key}">${esc(i.label)} <small>${esc(i.hint)}</small></label>
            <input id="wz-${i.key}" type="date" max="${todayIso()}" value="${esc(answers.compliance[i.key] || '')}">`).join('')}`, 'Next →');
      } else if (step === 2) {
        frame(`
          <p class="wizard-kicker">Step 3 of 3</p>
          <h3>Quick yes or no</h3>
          ${yeses().map(i => `
            <div class="yn-row">
              <span>${esc(i.label)}<small>${esc(i.hint)}</small></span>
              <button class="yn ${answers.compliance[i.key] ? 'on' : ''}" data-key="${esc(i.key)}" aria-pressed="${!!answers.compliance[i.key]}">${answers.compliance[i.key] ? 'Yes' : 'No'}</button>
            </div>`).join('')}`, 'See my score →');
        overlay.querySelectorAll('.yn').forEach(b => b.onclick = () => {
          answers.compliance[b.dataset.key] = !answers.compliance[b.dataset.key];
          render();
        });
      } else {
        const r = RentUKLib.complianceScore(answers.compliance, todayIso(), answers.nation);
        const todo = r.items.filter(i => i.status !== 'ok').slice(0, 3);
        frame(`
          <p class="wizard-kicker">All set</p>
          <h3>Your compliance score</h3>
          <div class="wizard-score">${scoreRing(r.score, r.level, 150)}</div>
          ${todo.length ? `<p class="wizard-hint">Next to fix:</p><ul class="wizard-todo">${todo.map(i => `<li><span aria-hidden="true">${STATUS_ICON[i.status]}</span> ${esc(i.label)}</li>`).join('')}</ul>`
            : '<p class="wizard-hint">🎉 Everything you recorded is up to date. Nice work.</p>'}`, 'Go to my dashboard');
        animateScores(overlay);
      }
    }

    function next() {
      if (step === 0) {
        const name = overlay.querySelector('#wz-name').value.trim();
        if (!name) { overlay.querySelector('#wz-name').classList.add('invalid'); overlay.querySelector('#wz-name').focus(); return; }
        answers.name = name;
        answers.rent = overlay.querySelector('#wz-rent').value;
        answers.nation = overlay.querySelector('#wz-nation').value;
      } else if (step === 1) {
        dates().forEach(i => {
          const v = overlay.querySelector('#wz-' + i.key).value;
          if (v) answers.compliance[i.key] = v; else delete answers.compliance[i.key];
        });
      } else if (step === 2) {
        const rent = parseFloat(answers.rent);
        const property = {
          id: 'prop_' + Date.now(),
          name: answers.name,
          address: '',
          nation: answers.nation,
          tenant: null,
          compliance: RentUKLib.cleanCompliance(answers.compliance),
          createdAt: new Date().toISOString()
        };
        if (Number.isFinite(rent) && rent > 0) {
          property.tenant = { name: '', contact: '', leaseStart: '', leaseEnd: '', rentAmount: String(rent), rentFrom: todayIso() };
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
  // The public address people can open from a shared score card.
  const APP_LINK = 'https://rentuk.bimuti.com/';
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
    g.fillText(level === 'great' ? 'Checks up to date' : level === 'fair' ? 'Getting there' : 'Work in progress', 540, 840);
    g.fillStyle = '#cbd5e1'; g.font = `400 40px ${font}`;
    g.fillText(`${done} of ${total} legal checks up to date`, 540, 905);
    g.fillStyle = '#94a3b8'; g.font = `500 34px ${font}`;
    g.fillText('RentUK · free, private, no sign-up · What’s your score?', 540, 985);
    g.fillStyle = '#a5b4fc'; g.font = `600 34px ${font}`;
    g.fillText(APP_LINK.replace(/^https:\/\//, ''), 540, 1040);
    return c;
  }

  async function shareScore() {
    const property = getCurrentProperty();
    if (!property) return;
    const r = checksFor(property);
    const legal = r.items.filter(i => i.legal && i.status !== 'na');
    const canvas = drawShareCard(r.score, r.level, legal.filter(i => i.status === 'ok').length, legal.length);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    const file = new File([blob], `rentuk-score-${r.score}.png`, { type: 'image/png' });
    const text = `My rental compliance score is ${r.score}/100 on RentUK. What's yours? Check yours free: ${APP_LINK}`;
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

  // Delete everything RentUK keeps in this browser, after typed confirmation.
  function confirmDeleteAll() {
    if (document.getElementById('delete-all-dialog')) return;
    const overlay = document.createElement('div');
    overlay.id = 'delete-all-dialog';
    overlay.className = 'wizard-overlay';
    overlay.innerHTML = `
      <div class="wizard">
        <h3>Delete all my data?</h3>
        <p>This removes every property, tenant, rent payment, repair, document, cost, date and check from this device. It cannot be undone.</p>
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
      if (!isDemo && fileStore()) fileStore().clear().catch(() => {});
      overlay.remove();
      if (!result.ok) { showCustomAlert('This browser blocked the delete. Clear this site\'s data in your browser settings instead.', 'Not deleted'); return; }
      // Reload so every screen starts empty; demo mode leaves to a clean, real start.
      location.replace(location.pathname);
    };
    input.focus();
  }

  // Re-fit the current screen when the window changes size (rotation, split view, keyboard closing).
  let resizeTimer = null;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (!document.getElementById('sheet')) render(); }, 200); });

  // If another tab deletes all data, reload so this tab cannot write its old copy back.
  window.addEventListener('storage', e => { if (RentUKLib.erasedElsewhere(e, store)) location.reload(); });

  // Initialize app
  initApp();

});