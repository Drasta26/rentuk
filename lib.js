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

  // Compliance rules per UK nation live in rules.js (checked against official sources; see the date there).
  const RULES = (typeof module !== 'undefined' && module.exports) ? require('./rules.js') : root.RentUKRules;
  const NATION_ITEMS = n => (RULES.NATION_RULES[n] || RULES.NATION_RULES.england).items;
  // Kept for older callers: the England checklist.
  const COMPLIANCE_ITEMS = NATION_ITEMS('england');
  const ALL_KEYS = [...new Set(Object.values(RULES.NATION_RULES).flatMap(r => r.items.map(i => i.key)))];
  const EPC_BANDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  // Plain labels. "Up to date" means what the landlord recorded is current; it is never a legal guarantee.
  const STATUS_LABEL = { ok: 'Up to date', soon: 'Expiring soon', expired: 'Expired', missing: 'Action required',
    action: 'Action required', na: 'Not applicable', unverified: 'Unable to verify' };
  const SOON_DAYS = 60;

  function addMonths(isoDate, months) {
    const [y, m, d] = isoDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + months, d));
    return dt.toISOString().slice(0, 10);
  }

  function daysBetween(fromIso, toIso) {
    return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400000);
  }

  // Score 0-100 for one property in one nation, from what the landlord has recorded.
  // Each recorded value is a date (last check), true (done), 'na' (not applicable) or 'unsure'.
  // Only legal duties count; not-applicable items are left out; up to date = 1, expiring soon = 0.5, else 0.
  function complianceScore(compliance, todayIso, nation) {
    const c = compliance || {};
    let points = 0, counted = 0;
    const items = NATION_ITEMS(nation).map(item => {
      const v = c[item.key];
      let status = 'missing', expires = '', daysLeft = null, note = '';
      if (v === 'na' && item.canNA) status = 'na';
      else if (v === 'unsure') status = 'unverified';
      else if (item.kind === 'yes') status = v === true ? 'ok' : 'missing';
      else if (typeof v === 'string' && DATE_RE.test(v)) {
        expires = addMonths(v, item.months);
        daysLeft = daysBetween(todayIso, expires);
        status = daysLeft < 0 ? 'expired' : daysLeft <= SOON_DAYS ? 'soon' : 'ok';
        if (item.key === 'epc' && item.minimum && EPC_BANDS.indexOf(c.epcRating) > EPC_BANDS.indexOf(item.minimum) && status !== 'expired') {
          status = 'action'; note = `Rated ${c.epcRating}: below the minimum ${item.minimum} to let, unless an exemption is registered`;
        }
      }
      if (item.legal && status !== 'na') {
        counted++;
        points += status === 'ok' ? 1 : status === 'soon' ? 0.5 : 0;
      }
      return { ...item, status, expires, daysLeft, note, statusLabel: STATUS_LABEL[status] };
    });
    const score = counted ? Math.round((points / counted) * 100) : 100;
    const level = score >= 90 ? 'great' : score >= 60 ? 'fair' : 'poor';
    return { score, level, items, counted };
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
  // Where tracking starts: the date the landlord chose (stored, so it never moves), else the tenancy start.
  // With neither, rent is not tracked yet: nothing is counted as due.
  function rentFromOf(t) {
    return date(t && t.rentFrom) || date(t && t.leaseStart) || null;
  }
  // Rent history: [{ from, amount }], oldest first. The rent on a date is the latest change on or before it.
  function rentHistoryOf(t) {
    const base = parseFloat(t && t.rentAmount) || 0;
    const list = Array.isArray(t && t.rentHistory) ? t.rentHistory.filter(r => r && date(r.from) && parseFloat(r.amount) >= 0)
      .map(r => ({ from: r.from, amount: parseFloat(r.amount) })).sort((a, b) => a.from.localeCompare(b.from)) : [];
    return { base, list };
  }
  function rentAt(t, iso) {
    const { base, list } = rentHistoryOf(t);
    let amount = list.length ? list[0].amount : base;
    for (const r of list) if (r.from <= iso) amount = r.amount;
    return amount;
  }
  // Rent due between two dates (inclusive), using the rent in force on each due date.
  function expectedBetween(t, fromIso, toIso) {
    const start = rentFromOf(t);
    if (!start || !(parseFloat(t && t.rentAmount) > 0)) return 0;
    const ended = date(t && t.endedOn);
    const from = fromIso > start ? fromIso : start;
    const to = ended && ended < toIso ? ended : toIso;
    return Math.round(dueDates(from, to, dueDayOf(t)).reduce((n, d) => n + rentAt(t, d), 0) * 100) / 100;
  }
  // A fixed-term end date does not stop rent (tenancies roll on as periodic); only an ended tenancy does.
  function rentLedger(tenant, payments, propertyId, todayIso) {
    const t = tenant || {};
    const rent = parseFloat(t.rentAmount) || 0;
    const from = rentFromOf(t);
    const day = dueDayOf(t);
    const ended = date(t.endedOn) && t.endedOn < todayIso ? t.endedOn : null;
    const until = ended || todayIso;
    const dues = rent > 0 && from ? dueDates(from, until, day).map(d => ({ d, amount: rentAt(t, d) })) : [];
    const paidList = from ? (payments || []).filter(x => x && x.propertyId === propertyId && date(x.date) && x.date >= from)
      .sort((a, b) => a.date.localeCompare(b.date)) : [];
    const paid = Math.round(paidList.reduce((s, x) => s + (Number(x.amount) || 0), 0) * 100) / 100;
    const expected = Math.round(dues.reduce((n, x) => n + x.amount, 0) * 100) / 100;
    const balance = Math.round((expected - paid) * 100) / 100;
    // Oldest due date not yet covered by payments (payments pay off the oldest rent first).
    let covered = paid, oldestUnpaid = null;
    for (const x of dues) { if (covered + 0.005 >= x.amount) covered -= x.amount; else { oldestUnpaid = x.d; break; } }
    const nextDue = rent > 0 && from && !ended ? (dueDates(addDays(todayIso > from ? todayIso : addDays(from, -1), 1), addDays(todayIso > from ? todayIso : from, 62), day)[0] || null) : null;
    const lastPayment = paidList.length ? paidList[paidList.length - 1] : null;
    return {
      rent, from, day, expected, paid, balance, tracked: !!(rent > 0 && from),
      arrears: balance > 0.004 ? balance : 0,
      credit: balance < -0.004 ? -balance : 0,
      oldestUnpaid, daysOverdue: oldestUnpaid ? daysBetween(oldestUnpaid, todayIso) : 0,
      nextDue, nextAmount: nextDue ? rentAt(t, nextDue) : 0, lastPayment, dueCount: dues.length
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

  // ---- Deposits: cap and protection deadline by nation (checked 18 Nov 2026; see rules.js sources) ----
  // England: 5 weeks' rent (6 if annual rent is £50,000 or more), protect within 30 days.
  // Wales: no security-deposit cap found, protect within 30 days. Scotland: 2 months' rent, lodge within
  // 30 working days. Northern Ireland: 1 month's rent, protect within 28 days.
  function addWorkingDays(iso, n) {
    let d = iso, left = n;
    while (left > 0) { d = addDays(d, 1); const wd = new Date(d + 'T00:00:00Z').getUTCDay(); if (wd !== 0 && wd !== 6) left--; }
    return d;
  }
  function depositCheck(nation, tenant, todayIso) {
    const t = tenant || {};
    const amount = parseFloat(t.depositAmount) || 0;
    const rent = parseFloat(t.rentAmount) || 0;
    let cap = null, capText = '';
    if (rent > 0) {
      if (nation === 'england') { const weeks = rent * 12 >= 50000 ? 6 : 5; cap = Math.floor(rent * 12 / 52 * weeks * 100) / 100; capText = `${weeks} weeks’ rent`; }
      else if (nation === 'scotland') { cap = rent * 2; capText = '2 months’ rent'; }
      else if (nation === 'ni') { cap = rent; capText = '1 month’s rent'; }
    }
    const received = date(t.depositReceived);
    const protectedOn = date(t.depositProtected);
    // Scotland counts from the start of the tenancy; England, Wales and NI from receiving the deposit.
    const startScot = date(t.leaseStart) || received;
    const deadline = received ? (nation === 'scotland' ? addWorkingDays(startScot, 30) : addDays(received, nation === 'ni' ? 28 : 30)) : null;
    const deadlineText = nation === 'scotland' ? '30 working days of the tenancy starting (bank holidays not taken off)' : nation === 'ni' ? '28 days' : '30 days';
    return {
      amount, cap, capText, overCap: cap != null && amount > cap + 0.004,
      deadline, deadlineText,
      due: !!(amount > 0 && received && !protectedOn),
      late: !!(deadline && ((protectedOn && protectedOn > deadline) || (!protectedOn && todayIso > deadline))),
      protectedOn
    };
  }

  // ---- Documents: the list lives with the other records; the files themselves stay in this browser's IndexedDB ----
  const DOC_TYPES = {
    gas: 'Gas safety record', eicr: 'Electrical report', epc: 'Energy certificate (EPC)', tenancy: 'Tenancy agreement or terms',
    deposit: 'Deposit certificate', inventory: 'Inventory', id: 'Right to Rent / ID check', licence: 'Licence or registration',
    insurance: 'Insurance', invoice: 'Invoice or receipt', photo: 'Photo', other: 'Other'
  };
  // Only PDFs and common photos. No HTML, SVG or other types that could run script when opened.
  const DOC_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  const MAX_DOC_BYTES = 10 * 1024 * 1024;
  function docFileOk(file) {
    if (!file) return { ok: false, error: 'Choose a file first.' };
    if (!DOC_MIME.includes(file.type)) return { ok: false, error: 'Only PDF files and photos (JPEG, PNG, WebP, HEIC) can be added.' };
    if (file.size > MAX_DOC_BYTES) return { ok: false, error: 'That file is over 10 MB. Try a smaller scan or photo.' };
    if (!file.size) return { ok: false, error: 'That file is empty.' };
    return { ok: true };
  }
  function cleanDoc(d) {
    return {
      id: d.id, propertyId: idOrNull(d.propertyId), name: text(d.name).slice(0, 120) || 'Document',
      type: Object.hasOwn(DOC_TYPES, d.type) ? d.type : 'other', mime: DOC_MIME.includes(d.mime) ? d.mime : '',
      size: Number.isFinite(Number(d.size)) ? Math.max(0, Math.round(Number(d.size))) : 0, added: date(d.added), expires: date(d.expires)
    };
  }

  // ---- CSV for an accountant. Cells that start like a formula are made literal (spreadsheet formula injection). ----
  function csvCell(v) {
    let t = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) t = "'" + t;
    return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }
  function buildCsv(rows) {
    return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  // One line per rent payment and cost in [from, to], oldest first. Money in is positive, money out negative.
  function ledgerRows(properties, payments, expenses, fromIso, toIso) {
    const name = id => { const p = (properties || []).find(x => x.id === id); return p ? p.name : 'Unknown property'; };
    const inRange = d => date(d) && d >= fromIso && d <= toIso;
    const rows = [
      ...(payments || []).filter(x => inRange(x.date)).map(x => [x.date, name(x.propertyId), 'Rent received', 'Rent', x.note || 'Rent payment', (Number(x.amount) || 0).toFixed(2)]),
      ...(expenses || []).filter(e => inRange(e.date)).map(e => [e.date, name(e.propertyId), 'Cost', e.category || 'other', e.description || '', (-(Number(e.amount) || 0)).toFixed(2)])
    ].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    return [['Date', 'Property', 'Type', 'Category', 'Description', 'Amount (GBP)'], ...rows];
  }

  // Monthly repeat for a rent due day: days 29 and 30 fall back to the month's last day when it is shorter.
  function monthlyRule(day) {
    return day >= 31 ? 'FREQ=MONTHLY;BYMONTHDAY=-1' : day === 30 ? 'FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1'
      : day === 29 ? 'FREQ=MONTHLY;BYMONTHDAY=28,29;BYSETPOS=-1' : `FREQ=MONTHLY;BYMONTHDAY=${day}`;
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
      // Only simple monthly repeats are allowed (used for rent due dates).
      if (e.rrule && /^FREQ=MONTHLY;BYMONTHDAY=(-1|[1-9]|1\d|2[0-8]|28,29;BYSETPOS=-1|28,29,30;BYSETPOS=-1)$/.test(e.rrule)) lines.push(`RRULE:${e.rrule}`);
      const alarm = Number.isInteger(e.alarmDays) && e.alarmDays >= 0 && e.alarmDays <= 60 ? e.alarmDays : 14;
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(e.title)}`, `TRIGGER:-P${alarm}D`, 'END:VALARM', 'END:VEVENT');
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
        compliance: { gas: ago(100), eicr: ago(400), epc: ago(1000), epcRating: 'C', deposit: true, alarms: true, rightToRent: true, rraInfo: true, licence: 'na', legionella: true } },
      { id: 'demo_oak', name: 'Oak Lane house (demo)', address: '2 Example Lane, Sampletown', nation: 'england',
        tenant: tenant('Alex Sample', 1450, 300), createdAt: todayIso,
        compliance: { gas: ago(350), eicr: ago(1900), epc: ago(2000), epcRating: 'D', deposit: true, alarms: true, rightToRent: true, licence: 'na', legionella: true } },
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
    for (const key of ALL_KEYS) {
      const v = c[key];
      if (v === true || v === 'na' || v === 'unsure') out[key] = v;
      else { const d = date(v); if (d) out[key] = d; }
    }
    if (EPC_BANDS.includes(c.epcRating)) out.epcRating = c.epcRating;
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
      ...(date(t.rentFrom) ? { rentFrom: t.rentFrom } : {}),
      ...(Number.isFinite(parseFloat(t.depositAmount)) && parseFloat(t.depositAmount) >= 0 ? { depositAmount: String(parseFloat(t.depositAmount)) } : {}),
      ...(t.depositScheme ? { depositScheme: text(t.depositScheme) } : {}),
      ...(t.depositRef ? { depositRef: text(t.depositRef) } : {}),
      ...(date(t.depositReceived) ? { depositReceived: t.depositReceived } : {}),
      ...(date(t.depositProtected) ? { depositProtected: t.depositProtected } : {}),
      ...(date(t.endedOn) ? { endedOn: t.endedOn } : {}),
      ...(Array.isArray(t.rentHistory) ? { rentHistory: t.rentHistory.slice(0, 60).filter(r => r && date(r.from) && Number.isFinite(parseFloat(r.amount)) && parseFloat(r.amount) >= 0)
        .map(r => ({ from: r.from, amount: parseFloat(r.amount) })) } : {})
    };
  }

  // Check and clean an imported backup. Unknown fields are dropped and
  // records with unsafe IDs are skipped, so a crafted file cannot inject script.
  function validateBackup(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: 'Backup file is not a RentUK backup.' };
    }
    const list = (k) => (Array.isArray(raw[k]) ? raw[k].filter(x => x && typeof x === 'object' && isSafeId(x.id)) : null);
    const props = list('properties'), exps = list('expenses'), rems = list('reminders'), aobs = list('aobReminders'), pays = list('payments'), iss = list('issues'), docs = list('documents');
    if (!props && !exps && !rems && !aobs && !pays && !iss && !docs) {
      return { ok: false, error: 'Backup file has no RentUK data.' };
    }
    const data = {};
    let skipped = ['properties', 'expenses', 'reminders', 'aobReminders', 'payments', 'issues', 'documents']
      .reduce((n, k) => n + (Array.isArray(raw[k]) ? raw[k].length : 0), 0);
    if (props) data.properties = props.map(p => ({
      id: p.id, name: text(p.name) || 'Untitled property', address: text(p.address), nation: nationOf(p),
      tenant: cleanTenant(p.tenant), createdAt: text(p.createdAt),
      ...(Array.isArray(p.pastTenants) ? { pastTenants: p.pastTenants.slice(0, 50).map(cleanTenant).filter(Boolean) } : {}),
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
    if (docs) data.documents = docs.map(cleanDoc).filter(d => d.propertyId && d.mime);
    data.currentPropertyId = idOrNull(raw.currentPropertyId);
    for (const k of ['properties', 'expenses', 'reminders', 'aobReminders', 'payments', 'issues', 'documents']) skipped -= data[k] ? data[k].length : 0;
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
  const DATA_KEYS = ['expenses', 'properties', 'reminders', 'aobReminders', 'payments', 'issues', 'documents', 'currentPropertyId', 'rentukInstallHintDismissed', 'rentukLastBackup', 'rentukBackupSnooze'];

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
  const SAVED_KEYS = ['expenses', 'properties', 'reminders', 'aobReminders', 'payments', 'issues', 'documents', 'currentPropertyId'];
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

  const RentUKLib = { rentAt, expectedBetween, monthlyRule, DOC_TYPES, DOC_MIME, MAX_DOC_BYTES, docFileOk, cleanDoc, depositCheck, addWorkingDays, cleanTenant, STATUS_LABEL, EPC_BANDS, NATION_ITEMS, RULES_VERIFIED: RULES.VERIFIED, UPCOMING: n => (RULES.NATION_RULES[n] || RULES.NATION_RULES.england).upcoming, buildCsv, ledgerRows, ISSUE_STATUS, ISSUE_PRIORITY, sortIssues, issueSummary, cleanIssue, dueDates, rentLedger, received, dueDayOf, NATIONS, nationOf, datesFor, backupDue, escapeHtml, isSafeId, validateBackup, readJson, writeAll, DATA_KEYS, clearAll, erasedElsewhere, contactWays, asList,
    COMPLIANCE_ITEMS, complianceScore, cleanCompliance,
    taxYearStart, taxYear, rentalEstimate, buildIcs, demoData, MAX_BACKUP_BYTES: 5 * 1024 * 1024 };

  if (typeof module !== 'undefined' && module.exports) module.exports = RentUKLib;
  else root.RentUKLib = RentUKLib;
})(typeof window !== 'undefined' ? window : globalThis);
