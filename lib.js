// Small pure helpers shared by the app and the tests.
(function (root) {
  'use strict';

  // Escape text before it is inserted into HTML with innerHTML.
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const MAX_TEXT = 500;
  const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  // IDs end up inside onclick handlers, so only allow plain numbers or simple tokens.
  function isSafeId(id) {
    return (typeof id === 'number' && Number.isFinite(id)) || (typeof id === 'string' && ID_RE.test(id));
  }
  // Control characters (including line breaks) are dropped from text fields; they have no use in names or notes.
  function text(v) { return v === null || v === undefined ? '' : String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, MAX_TEXT); }
  function date(v) { return typeof v === 'string' && DATE_RE.test(v) ? v : ''; }
  function idOrNull(v) { return isSafeId(v) ? v : null; }

  // UK nations have different letting law, so every property records which one it is in.
  const NATIONS = { england: 'England', wales: 'Wales', scotland: 'Scotland', ni: 'Northern Ireland' };
  function nationOf(p) { return p && Object.hasOwn(NATIONS, p.nation) ? p.nation : 'england'; }
  // A date belongs to one property, or to every property when propertyId is empty.
  function datesFor(list, propertyId) {
    return (list || []).filter(d => d && (d.propertyId == null || d.propertyId === '' || d.propertyId === propertyId));
  }

  // Compliance checklist (England, private rented sector). Informational only, not legal advice.
  // kind 'date' = date of last certificate/check, valid for `months`; kind 'yes' = done or not.
  // Checked against GOV.UK and HSE on 30 Oct 2026 (Renters' Rights Act changes from 1 May 2026).
  const COMPLIANCE_ITEMS = [
    { key: 'gas', label: 'Gas safety check', kind: 'date', months: 12,
      hint: 'Gas Safe engineer every 12 months; copy to tenants within 28 days', url: 'https://www.hse.gov.uk/gas/domestic/faqlandlord.htm' },
    { key: 'eicr', label: 'Electrical safety (EICR)', kind: 'date', months: 60,
      hint: 'Qualified inspector at least every 5 years', url: 'https://www.gov.uk/government/publications/electrical-safety-standards-in-the-private-and-social-rented-sectors-guidance' },
    { key: 'epc', label: 'Energy certificate (EPC)', kind: 'date', months: 120,
      hint: 'Valid for 10 years', url: 'https://www.gov.uk/selling-a-home/energy-performance-certificates' },
    { key: 'deposit', label: 'Deposit protected', kind: 'yes',
      hint: 'In a government-backed scheme within 30 days', url: 'https://www.gov.uk/tenancy-deposit-protection' },
    { key: 'alarms', label: 'Smoke and CO alarms', kind: 'yes',
      hint: 'Fitted, and working on the first day of each tenancy', url: 'https://www.gov.uk/government/publications/smoke-and-carbon-monoxide-alarms-explanatory-booklet-for-landlords/the-smoke-and-carbon-monoxide-alarm-england-regulations-2015-qa-booklet-for-the-private-rented-sector-landlords-and-tenants' },
    { key: 'rightToRent', label: 'Right to Rent checked', kind: 'yes',
      hint: 'Before the tenancy starts', url: 'https://www.gov.uk/check-tenant-right-to-rent-documents' },
    { key: 'rraInfo', label: "Renters' Rights info given", kind: 'yes',
      hint: 'Official Information Sheet or written terms (replaced How to Rent from 1 May 2026)', url: 'https://www.gov.uk/government/publications/the-renters-rights-act-information-sheet-2026' }
  ];

  function addMonths(isoDate, months) {
    const [y, m, d] = isoDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + months, d));
    return dt.toISOString().slice(0, 10);
  }

  function daysBetween(fromIso, toIso) {
    return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400000);
  }

  // Score 0-100 for one property. Each item: ok = full marks, due within 30 days = half, else none.
  function complianceScore(compliance, todayIso) {
    const c = compliance || {};
    let points = 0;
    const items = COMPLIANCE_ITEMS.map(item => {
      let status = 'missing', expires = '', daysLeft = null;
      if (item.kind === 'yes') {
        status = c[item.key] === true ? 'ok' : 'missing';
      } else if (typeof c[item.key] === 'string' && DATE_RE.test(c[item.key])) {
        expires = addMonths(c[item.key], item.months);
        daysLeft = daysBetween(todayIso, expires);
        status = daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'soon' : 'ok';
      }
      points += status === 'ok' ? 1 : status === 'soon' ? 0.5 : 0;
      return { ...item, status, expires, daysLeft };
    });
    const score = Math.round((points / COMPLIANCE_ITEMS.length) * 100);
    const level = score >= 90 ? 'great' : score >= 60 ? 'fair' : 'poor';
    return { score, level, items };
  }


  // ---- Tax estimate (UK tax year 6 April to 5 April). Rough guide only, not tax advice. ----
  // Checked against GOV.UK on 30 Oct 2026: MTD for Income Tax thresholds use income before expenses;
  // property allowance is £1,000 and cannot be combined with actual expenses.
  const PROPERTY_ALLOWANCE = 1000;
  const MTD_STAGES = [
    { over: 50000, from: '6 April 2026' },
    { over: 30000, from: '6 April 2027' },
    { over: 20000, from: '6 April 2028' }
  ];

  function taxYearStart(iso) {
    const y = Number(iso.slice(0, 4));
    return iso.slice(5) >= '04-06' ? y : y - 1;
  }

  function taxYear(startYear) {
    return {
      start: `${startYear}-04-06`, end: `${startYear + 1}-04-05`,
      label: `${startYear}/${String(startYear + 1).slice(2)}`
    };
  }

  // Days in [a, b] (inclusive ISO dates) that overlap [c, d].
  function overlapDays(a, b, c, d) {
    const from = a > c ? a : c, to = b < d ? b : d;
    return to < from ? 0 : daysBetween(from, to) + 1;
  }

  function rentalEstimate(properties, expenses, startYear) {
    const ty = taxYear(startYear);
    const yearDays = daysBetween(ty.start, ty.end) + 1;
    const rows = (properties || []).map(p => {
      const t = p.tenant || {};
      const rent = parseFloat(t.rentAmount) || 0;
      const leaseFrom = date(t.leaseStart) || ty.start;
      const leaseTo = date(t.leaseEnd) || ty.end;
      const income = rent * 12 * overlapDays(ty.start, ty.end, leaseFrom, leaseTo) / yearDays;
      const costs = (expenses || [])
        .filter(e => e.propertyId === p.id && date(e.date) && e.date >= ty.start && e.date <= ty.end)
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      return { id: p.id, name: p.name, income: Math.round(income), costs: Math.round(costs * 100) / 100 };
    });
    const income = rows.reduce((s, r) => s + r.income, 0);
    const costs = rows.reduce((s, r) => s + r.costs, 0);
    const allowance = Math.min(PROPERTY_ALLOWANCE, income);
    const useAllowance = allowance > costs;
    const profit = Math.max(0, income - (useAllowance ? allowance : costs));
    const stage = MTD_STAGES.find(m => income > m.over);
    return {
      taxYear: ty, rows, income, costs: Math.round(costs * 100) / 100, useAllowance, profit,
      taxAt: { basic: Math.round(profit * 0.2), higher: Math.round(profit * 0.4), additional: Math.round(profit * 0.45) },
      mtd: stage ? { due: true, from: stage.from, over: stage.over } : { due: false }
    };
  }

  // ---- Rent tracking: what was due, what was actually received, and any arrears ----
  // Only payments the landlord records count as received. Nothing is guessed.
  function monthDue(y, m, day) {
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(day, last))).toISOString().slice(0, 10);
  }
  // Monthly due dates on `day` from `from` (inclusive) to `to` (inclusive).
  function dueDates(from, to, day) {
    if (!date(from) || !date(to) || from > to) return [];
    const out = [];
    let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7)) - 1;
    for (let i = 0; i < 600; i++) {
      const d = monthDue(y, m, day);
      if (d > to) break;
      if (d >= from) out.push(d);
      m++; if (m > 11) { m = 0; y++; }
    }
    return out;
  }
  function dueDayOf(t) {
    const n = parseInt(t && t.rentDueDay, 10);
    if (n >= 1 && n <= 31) return n;
    return date(t && t.leaseStart) ? Number(t.leaseStart.slice(8)) : 1;
  }
  // Where tracking starts: the date the landlord chose, else the lease start, else today.
  function rentFromOf(t, todayIso) {
    return date(t && t.rentFrom) || date(t && t.leaseStart) || todayIso;
  }
  function rentLedger(tenant, payments, propertyId, todayIso) {
    const t = tenant || {};
    const rent = parseFloat(t.rentAmount) || 0;
    const from = rentFromOf(t, todayIso);
    const day = dueDayOf(t);
    const ended = date(t.leaseEnd) && t.leaseEnd < todayIso ? t.leaseEnd : null;
    const until = ended || todayIso;
    const dues = rent > 0 ? dueDates(from, until, day) : [];
    const paidList = (payments || []).filter(x => x && x.propertyId === propertyId && date(x.date) && x.date >= from)
      .sort((a, b) => a.date.localeCompare(b.date));
    const paid = Math.round(paidList.reduce((s, x) => s + (Number(x.amount) || 0), 0) * 100) / 100;
    const expected = Math.round(dues.length * rent * 100) / 100;
    const balance = Math.round((expected - paid) * 100) / 100;
    // Oldest due date not yet covered by payments (payments pay off the oldest rent first).
    let covered = paid, oldestUnpaid = null;
    for (const d of dues) { if (covered + 0.005 >= rent) covered -= rent; else { oldestUnpaid = d; break; } }
    const nextDue = rent > 0 && !ended ? (dueDates(addDays(todayIso, 1), addDays(todayIso, 62), day)[0] || null) : null;
    const lastPayment = paidList.length ? paidList[paidList.length - 1] : null;
    return {
      rent, from, day, expected, paid, balance,
      arrears: balance > 0.004 ? balance : 0,
      credit: balance < -0.004 ? -balance : 0,
      oldestUnpaid, daysOverdue: oldestUnpaid ? daysBetween(oldestUnpaid, todayIso) : 0,
      nextDue, lastPayment, dueCount: dues.length
    };
  }
  // Money actually received between two dates (inclusive), for one property or all.
  function received(payments, fromIso, toIso, propertyId) {
    return Math.round((payments || []).filter(x => x && date(x.date) && x.date >= fromIso && x.date <= toIso &&
      (propertyId == null || x.propertyId === propertyId)).reduce((s, x) => s + (Number(x.amount) || 0), 0) * 100) / 100;
  }

  // ---- Maintenance: issues move from reported to done; urgent ones come first ----
  const ISSUE_STATUS = { open: 'Reported', quoted: 'Quote in', booked: 'Booked', done: 'Done' };
  const ISSUE_PRIORITY = { urgent: 'Urgent', soon: 'Soon', routine: 'Routine' };
  const PRIORITY_RANK = { urgent: 0, soon: 1, routine: 2 };
  function sortIssues(list) {
    return [...(list || [])].sort((a, b) =>
      ((a.status === 'done') - (b.status === 'done')) ||
      ((PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2)) ||
      String(a.reported || '').localeCompare(String(b.reported || '')));
  }
  function issueSummary(list, propertyId, todayIso) {
    const open = (list || []).filter(i => i && i.status !== 'done' && (propertyId == null || i.propertyId === propertyId));
    const urgent = open.filter(i => i.priority === 'urgent');
    const oldest = open.map(i => date(i.reported)).filter(Boolean).sort()[0] || null;
    return { open: open.length, urgent: urgent.length, oldestDays: oldest ? daysBetween(oldest, todayIso) : 0, first: sortIssues(open)[0] || null };
  }
  function cleanIssue(i) {
    const num = v => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null; };
    return {
      id: i.id, propertyId: idOrNull(i.propertyId), title: text(i.title) || 'Repair', detail: text(i.detail),
      priority: Object.hasOwn(ISSUE_PRIORITY, i.priority) ? i.priority : 'routine',
      status: Object.hasOwn(ISSUE_STATUS, i.status) ? i.status : 'open',
      contractor: text(i.contractor), quote: num(i.quote), cost: num(i.cost),
      reported: date(i.reported), doneOn: date(i.doneOn)
    };
  }

  // ---- Calendar export (iCalendar, RFC 5545) ----
  function icsText(v) {
    return String(v).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
  }

  function buildIcs(events, stampIso) {
    const stamp = stampIso.replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RentUK//Reminders//EN', 'CALSCALE:GREGORIAN'];
    for (const e of events) {
      if (!DATE_RE.test(e.date || '')) continue;
      const day = e.date.replace(/-/g, '');
      const next = addDays(e.date, 1).replace(/-/g, '');
      lines.push('BEGIN:VEVENT', `UID:${icsText(e.uid)}@rentuk`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next}`, `SUMMARY:${icsText(e.title)}`);
      if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(e.title)}`, 'TRIGGER:-P14D', 'END:VALARM', 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  function addDays(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  }


  // ---- Demo data: made-up records, dated relative to today so the demo never goes stale ----
  function demoData(todayIso) {
    const ago = n => addDays(todayIso, -n);
    const tenant = (name, rent, startAgo) => ({
      name, contact: '07700 900' + String(100 + name.length) + ', ' + name.split(' ')[0].toLowerCase() + '@example.com',
      leaseStart: ago(startAgo), leaseEnd: addDays(ago(startAgo), 365), rentAmount: String(rent),
      rentDueDay: 1, rentFrom: ago(Math.min(startAgo, 95))
    });
    const properties = [
      { id: 'demo_maple', name: 'Maple Court flat (demo)', address: '1 Example Road, Sampletown', nation: 'england',
        tenant: tenant('Sam Example', 1150, 120), createdAt: todayIso,
        compliance: { gas: ago(100), eicr: ago(400), epc: ago(1000), deposit: true, alarms: true, rightToRent: true, rraInfo: true } },
      { id: 'demo_oak', name: 'Oak Lane house (demo)', address: '2 Example Lane, Sampletown', nation: 'england',
        tenant: tenant('Alex Sample', 1450, 300), createdAt: todayIso,
        compliance: { gas: ago(350), eicr: ago(1900), epc: ago(2000), deposit: true, alarms: true, rightToRent: true } },
      { id: 'demo_station', name: 'Station Road studio (demo)', address: '3 Example Street, Sampletown', nation: 'england',
        tenant: tenant('Jo Test', 795, 30), createdAt: todayIso,
        compliance: { epc: ago(700), deposit: true } }
    ];
    const ty = taxYear(taxYearStart(todayIso)).start;
    const inYear = n => { const d = ago(n); return d < ty ? ty : d; };
    const expenses = [
      ['demo_maple', 'Boiler service', 95, 'maintenance', 60],
      ['demo_maple', 'Landlord insurance', 310, 'insurance', 150],
      ['demo_oak', 'Gutter repair', 240, 'repairs', 40],
      ['demo_oak', 'Landlord insurance', 380, 'insurance', 150],
      ['demo_station', 'Deep clean between tenants', 180, 'other', 35]
    ].map(([propertyId, description, amount, category, n], i) =>
      ({ id: 9000 + i, date: inYear(n), description, amount, category, propertyId }));
    const reminders = [
      { id: 1, name: 'Gas Safety Check', dueDate: addDays(todayIso, 15), type: 'gas', completed: false, propertyId: null },
      { id: 4, name: 'Insurance Renewal', dueDate: addDays(todayIso, 25), type: 'insurance', completed: false, propertyId: null }
    ];
    const aobReminders = [{ id: 9100, name: 'Check smoke alarms', dueDate: addDays(todayIso, 9), completed: false, propertyId: 'demo_oak' }];
    // Made-up rent payments: Maple and Oak paid in full, Station Road missed the latest month.
    const payments = [];
    properties.forEach((p, pi) => {
      const dues = dueDates(p.tenant.rentFrom, todayIso, 1);
      dues.forEach((d, i) => {
        if (p.id === 'demo_station' && i === dues.length - 1) return;
        payments.push({ id: 9200 + pi * 20 + i, propertyId: p.id, date: addDays(d, pi), amount: Number(p.tenant.rentAmount), note: 'Bank transfer' });
      });
    });
    const issues = [
      { id: 9300, propertyId: 'demo_oak', title: 'Boiler losing pressure', detail: 'Tenant reports radiators cold in the mornings.', priority: 'urgent', status: 'booked', contractor: 'Example Heating Ltd', quote: 180, cost: null, reported: ago(3), doneOn: '' },
      { id: 9301, propertyId: 'demo_oak', title: 'Loose stair handrail', detail: '', priority: 'soon', status: 'open', contractor: '', quote: null, cost: null, reported: ago(6), doneOn: '' },
      { id: 9302, propertyId: 'demo_maple', title: 'Dripping kitchen tap', detail: 'Washer replaced.', priority: 'routine', status: 'done', contractor: 'Sample Plumbing', quote: 60, cost: 55, reported: ago(40), doneOn: ago(34) }
    ];
    return { properties, expenses, reminders, aobReminders, payments, issues, currentPropertyId: 'demo_oak' };
  }

  function cleanCompliance(c) {
    const out = {};
    if (!c || typeof c !== 'object') return out;
    for (const item of COMPLIANCE_ITEMS) {
      if (item.kind === 'date') { const d = date(c[item.key]); if (d) out[item.key] = d; }
      else if (c[item.key] === true) out[item.key] = true;
    }
    return out;
  }

  function cleanTenant(t) {
    if (!t || typeof t !== 'object') return null;
    const rent = parseFloat(t.rentAmount);
    const day = parseInt(t.rentDueDay, 10);
    return {
      name: text(t.name), contact: text(t.contact),
      leaseStart: date(t.leaseStart), leaseEnd: date(t.leaseEnd),
      rentAmount: Number.isFinite(rent) && rent >= 0 ? String(rent) : '',
      ...(day >= 1 && day <= 31 ? { rentDueDay: day } : {}),
      ...(date(t.rentFrom) ? { rentFrom: t.rentFrom } : {})
    };
  }

  // Check and clean an imported backup. Unknown fields are dropped and
  // records with unsafe IDs are skipped, so a crafted file cannot inject script.
  function validateBackup(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: 'Backup file is not a RentUK backup.' };
    }
    const list = (k) => (Array.isArray(raw[k]) ? raw[k].filter(x => x && typeof x === 'object' && isSafeId(x.id)) : null);
    const props = list('properties'), exps = list('expenses'), rems = list('reminders'), aobs = list('aobReminders'), pays = list('payments'), iss = list('issues');
    if (!props && !exps && !rems && !aobs && !pays && !iss) {
      return { ok: false, error: 'Backup file has no RentUK data.' };
    }
    const data = {};
    let skipped = ['properties', 'expenses', 'reminders', 'aobReminders', 'payments', 'issues']
      .reduce((n, k) => n + (Array.isArray(raw[k]) ? raw[k].length : 0), 0);
    if (props) data.properties = props.map(p => ({
      id: p.id, name: text(p.name) || 'Untitled property', address: text(p.address), nation: nationOf(p),
      tenant: cleanTenant(p.tenant), createdAt: text(p.createdAt),
      ...(p.compliance ? { compliance: cleanCompliance(p.compliance) } : {})
    }));
    if (exps) data.expenses = exps
      .map(e => ({ id: e.id, date: date(e.date), description: text(e.description),
        amount: parseFloat(e.amount), category: text(e.category), propertyId: idOrNull(e.propertyId),
        ...(isSafeId(e.issueId) ? { issueId: e.issueId } : {}) }))
      .filter(e => Number.isFinite(e.amount));
    if (rems) data.reminders = rems.map(r => ({
      id: r.id, name: text(r.name), dueDate: date(r.dueDate), type: text(r.type),
      completed: r.completed === true, propertyId: idOrNull(r.propertyId)
    }));
    if (aobs) data.aobReminders = aobs.map(a => ({
      id: a.id, name: text(a.name), dueDate: date(a.dueDate), completed: a.completed === true, propertyId: idOrNull(a.propertyId)
    }));
    if (pays) data.payments = pays
      .map(x => ({ id: x.id, propertyId: idOrNull(x.propertyId), date: date(x.date), amount: parseFloat(x.amount), note: text(x.note) }))
      .filter(x => Number.isFinite(x.amount) && x.amount >= 0 && x.date && x.propertyId);
    if (iss) data.issues = iss.map(cleanIssue).filter(i => i.propertyId);
    data.currentPropertyId = idOrNull(raw.currentPropertyId);
    for (const k of ['properties', 'expenses', 'reminders', 'aobReminders', 'payments', 'issues']) skipped -= data[k] ? data[k].length : 0;
    return { ok: true, data, skipped };
  }

  // Read JSON from storage; a missing, blocked or corrupt value gives the fallback.
  function readJson(storage, key, fallback) {
    try {
      const raw = storage.getItem(key);
      if (raw === null) return fallback;
      const v = JSON.parse(raw);
      return v === null || v === undefined ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  // Stored lists must be arrays of objects; anything else (wrong type, null entries) is dropped so the app still opens.
  function asList(v, fallback) {
    return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : fallback;
  }

  // Write several keys; returns { ok, reason } instead of throwing when storage is full or blocked.
  function writeAll(storage, entries) {
    try {
      for (const [key, value] of Object.entries(entries)) {
        storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
      return { ok: true };
    } catch (e) {
      const full = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
      return { ok: false, reason: full ? 'full' : 'unavailable' };
    }
  }

  // Every key RentUK keeps in this browser. Other apps on the same site keep their own keys, so only these are cleared.
  const DATA_KEYS = ['expenses', 'properties', 'reminders', 'aobReminders', 'payments', 'issues', 'currentPropertyId', 'rentukInstallHintDismissed', 'rentukLastBackup', 'rentukBackupSnooze'];

  // Remove all RentUK keys; returns { ok } instead of throwing when storage is blocked.
  function clearAll(storage, keys = DATA_KEYS) {
    try {
      keys.forEach(k => storage.removeItem(k));
      return { ok: true };
    } catch (e) {
      return { ok: false };
    }
  }

  // Pull a phone number and an email out of the one contact field. The email must look like a plain address,
  // so a pasted '?bcc=...' cannot add extra headers to the mailto link.
  function contactWays(text) {
    const value = String(text || '');
    const email = (value.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/) || [])[0] || '';
    const phone = (value.replace(email, '').match(/\+?\d[\d\s()-]{6,}\d/) || [])[0] || '';
    return { email, phone: phone.replace(/[^\d+]/g, '') };
  }

  // True when another tab erased RentUK data, so this tab must reload instead of writing its stale copy back.
  const SAVED_KEYS = ['expenses', 'properties', 'reminders', 'aobReminders', 'payments', 'issues', 'currentPropertyId'];
  function erasedElsewhere(e, storage) {
    if (!e || e.storageArea !== storage) return false;
    return e.key === null || (SAVED_KEYS.includes(e.key) && e.newValue === null);
  }

  // Backup reminder: due once there is something to lose, then monthly.
  // Times are milliseconds; 0 means never. "Later" pauses it for a week.
  const DAY_MS = 86400000;
  function backupDue(now, hasData, lastBackup, snoozedAt) {
    if (!hasData) return false;
    if (snoozedAt && now - snoozedAt < 7 * DAY_MS) return false;
    return !lastBackup || now - lastBackup >= 30 * DAY_MS;
  }

  const RentUKLib = { ISSUE_STATUS, ISSUE_PRIORITY, sortIssues, issueSummary, cleanIssue, dueDates, rentLedger, received, dueDayOf, NATIONS, nationOf, datesFor, backupDue, escapeHtml, isSafeId, validateBackup, readJson, writeAll, DATA_KEYS, clearAll, erasedElsewhere, contactWays, asList,
    COMPLIANCE_ITEMS, complianceScore, cleanCompliance,
    taxYearStart, taxYear, rentalEstimate, buildIcs, demoData, MAX_BACKUP_BYTES: 5 * 1024 * 1024 };

  if (typeof module !== 'undefined' && module.exports) module.exports = RentUKLib;
  else root.RentUKLib = RentUKLib;
})(typeof window !== 'undefined' ? window : globalThis);
