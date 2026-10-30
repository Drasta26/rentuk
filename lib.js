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
  function text(v) { return v === null || v === undefined ? '' : String(v).slice(0, MAX_TEXT); }
  function date(v) { return typeof v === 'string' && DATE_RE.test(v) ? v : ''; }
  function idOrNull(v) { return isSafeId(v) ? v : null; }

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
      } else if (DATE_RE.test(c[item.key] || '')) {
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
    return {
      name: text(t.name), contact: text(t.contact),
      leaseStart: date(t.leaseStart), leaseEnd: date(t.leaseEnd),
      rentAmount: Number.isFinite(rent) && rent >= 0 ? String(rent) : ''
    };
  }

  // Check and clean an imported backup. Unknown fields are dropped and
  // records with unsafe IDs are skipped, so a crafted file cannot inject script.
  function validateBackup(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: 'Backup file is not a RentUK backup.' };
    }
    const list = (k) => (Array.isArray(raw[k]) ? raw[k].filter(x => x && typeof x === 'object' && isSafeId(x.id)) : null);
    const props = list('properties'), exps = list('expenses'), rems = list('reminders'), aobs = list('aobReminders');
    if (!props && !exps && !rems && !aobs) {
      return { ok: false, error: 'Backup file has no RentUK data.' };
    }
    const data = {};
    let skipped = ['properties', 'expenses', 'reminders', 'aobReminders']
      .reduce((n, k) => n + (Array.isArray(raw[k]) ? raw[k].length : 0), 0);
    if (props) data.properties = props.map(p => ({
      id: p.id, name: text(p.name) || 'Untitled property', address: text(p.address),
      tenant: cleanTenant(p.tenant), createdAt: text(p.createdAt),
      ...(p.compliance ? { compliance: cleanCompliance(p.compliance) } : {})
    }));
    if (exps) data.expenses = exps
      .map(e => ({ id: e.id, date: date(e.date), description: text(e.description),
        amount: parseFloat(e.amount), category: text(e.category), propertyId: idOrNull(e.propertyId) }))
      .filter(e => Number.isFinite(e.amount));
    if (rems) data.reminders = rems.map(r => ({
      id: r.id, name: text(r.name), dueDate: date(r.dueDate), type: text(r.type),
      completed: r.completed === true, propertyId: idOrNull(r.propertyId)
    }));
    if (aobs) data.aobReminders = aobs.map(a => ({
      id: a.id, name: text(a.name), dueDate: date(a.dueDate), completed: a.completed === true
    }));
    data.currentPropertyId = idOrNull(raw.currentPropertyId);
    for (const k of ['properties', 'expenses', 'reminders', 'aobReminders']) skipped -= data[k] ? data[k].length : 0;
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

  const RentUKLib = { escapeHtml, isSafeId, validateBackup, readJson, writeAll,
    COMPLIANCE_ITEMS, complianceScore, cleanCompliance, MAX_BACKUP_BYTES: 5 * 1024 * 1024 };

  if (typeof module !== 'undefined' && module.exports) module.exports = RentUKLib;
  else root.RentUKLib = RentUKLib;
})(typeof window !== 'undefined' ? window : globalThis);
