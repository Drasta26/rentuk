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
      tenant: cleanTenant(p.tenant), createdAt: text(p.createdAt)
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

  const RentUKLib = { escapeHtml, isSafeId, validateBackup, readJson, writeAll, MAX_BACKUP_BYTES: 5 * 1024 * 1024 };

  if (typeof module !== 'undefined' && module.exports) module.exports = RentUKLib;
  else root.RentUKLib = RentUKLib;
})(typeof window !== 'undefined' ? window : globalThis);
