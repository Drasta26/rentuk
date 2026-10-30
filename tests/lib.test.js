// Run with: npm test  (uses Node's built-in test runner, no dependencies)
const test = require('node:test');
const assert = require('node:assert/strict');
const { escapeHtml, isSafeId, validateBackup } = require('../lib.js');

test('escapeHtml escapes HTML special characters', () => {
  assert.equal(escapeHtml('<img src=x onerror="a()">'), '&lt;img src=x onerror=&quot;a()&quot;&gt;');
  assert.equal(escapeHtml("Tom & Jerry's"), 'Tom &amp; Jerry&#39;s');
});

test('escapeHtml handles empty values and numbers', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '42');
});

test('isSafeId accepts app-generated IDs only', () => {
  assert.ok(isSafeId(1730000000000));
  assert.ok(isSafeId('prop_1730000000000'));
  assert.ok(isSafeId('aob_1730000000000'));
  assert.ok(!isSafeId("x');alert(1);//"));
  assert.ok(!isSafeId(''));
  assert.ok(!isSafeId(Infinity));
  assert.ok(!isSafeId({}));
});

test('validateBackup rejects non-backup input', () => {
  assert.equal(validateBackup(null).ok, false);
  assert.equal(validateBackup([1, 2, 3]).ok, false);
  assert.equal(validateBackup({ hello: 'world' }).ok, false);
});

test('validateBackup skips records with unsafe IDs and counts them', () => {
  const r = validateBackup({ properties: [{ id: 'prop_1', name: 'Flat 1' }, { id: "x');bad()//", name: 'Evil' }] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.properties.map(p => p.id), ['prop_1']);
  assert.equal(r.skipped, 1);
});

test('validateBackup drops unknown fields and cleans values', () => {
  const r = validateBackup({
    properties: [{ id: 'prop_1', name: 'Flat 1', extra: 'x',
      tenant: { name: 'A Tenant', rentAmount: '850.50', leaseStart: 'not-a-date', leaseEnd: '2027-01-31' } }],
    currentPropertyId: 'prop_1'
  });
  const p = r.data.properties[0];
  assert.equal(p.extra, undefined);
  assert.equal(p.tenant.rentAmount, '850.5');
  assert.equal(p.tenant.leaseStart, '');
  assert.equal(p.tenant.leaseEnd, '2027-01-31');
  assert.equal(r.data.currentPropertyId, 'prop_1');
});

test('validateBackup removes expenses without a valid amount', () => {
  const r = validateBackup({ expenses: [
    { id: 1, amount: '12.50', date: '2026-10-01', description: 'Repair', category: 'repairs', propertyId: 'prop_1' },
    { id: 2, amount: 'abc' }
  ] });
  assert.deepEqual(r.data.expenses.map(e => e.amount), [12.5]);
  assert.equal(r.skipped, 1);
});

test('validateBackup accepts an export from the app unchanged', () => {
  const exported = {
    expenses: [{ id: 1730000000001, date: '2026-10-01', description: 'Boiler repair', amount: 120, category: 'repairs', propertyId: 'prop_1' }],
    properties: [{ id: 'prop_1', name: 'Flat 1', address: '1 Example Road', tenant: null, createdAt: '2026-10-30T10:00:00.000Z' }],
    currentPropertyId: 'prop_1',
    reminders: [{ id: 1, name: 'Gas Safety Check', dueDate: '2026-12-01', type: 'gas', completed: false, propertyId: null }],
    aobReminders: [{ id: 'aob_1730000000002', name: 'Check smoke alarms', dueDate: '2026-11-15', completed: true }]
  };
  const r = validateBackup(exported);
  assert.equal(r.skipped, 0);
  assert.deepEqual(r.data, exported);
});

const { readJson, writeAll } = require('../lib.js');

function fakeStore(initial = {}, setError = null) {
  const data = { ...initial };
  return {
    data,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { if (setError) throw setError; data[k] = v; }
  };
}

test('readJson returns the fallback for missing, corrupt or null values', () => {
  const s = fakeStore({ bad: '{not json', nul: 'null', ok: '[1,2]' });
  assert.deepEqual(readJson(s, 'missing', []), []);
  assert.deepEqual(readJson(s, 'bad', []), []);
  assert.deepEqual(readJson(s, 'nul', []), []);
  assert.deepEqual(readJson(s, 'ok', []), [1, 2]);
});

test('readJson returns the fallback when storage itself throws', () => {
  const s = { getItem() { throw new Error('SecurityError'); } };
  assert.equal(readJson(s, 'x', 'fb'), 'fb');
});

test('writeAll stores strings as-is and other values as JSON', () => {
  const s = fakeStore();
  assert.deepEqual(writeAll(s, { a: 'p1', b: [1] }), { ok: true });
  assert.equal(s.data.a, 'p1');
  assert.equal(s.data.b, '[1]');
});

test('writeAll reports full storage instead of throwing', () => {
  const err = Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
  assert.deepEqual(writeAll(fakeStore({}, err), { a: 1 }), { ok: false, reason: 'full' });
  assert.deepEqual(writeAll(fakeStore({}, new Error('blocked')), { a: 1 }), { ok: false, reason: 'unavailable' });
});

const { complianceScore, cleanCompliance } = require('../lib.js');

test('complianceScore is 0 for an empty checklist and 100 when all current', () => {
  assert.equal(complianceScore({}, '2026-10-30').score, 0);
  const all = { gas: '2026-06-01', eicr: '2025-01-01', epc: '2020-01-01',
    deposit: true, alarms: true, rightToRent: true, rraInfo: true };
  const r = complianceScore(all, '2026-10-30');
  assert.equal(r.score, 100);
  assert.equal(r.level, 'great');
});

test('complianceScore marks expired and due-soon certificates', () => {
  const r = complianceScore({ gas: '2025-11-15', eicr: '2020-01-01' }, '2026-10-30');
  const gas = r.items.find(i => i.key === 'gas');
  const eicr = r.items.find(i => i.key === 'eicr');
  assert.equal(gas.status, 'soon');
  assert.equal(gas.expires, '2026-11-15');
  assert.equal(gas.daysLeft, 16);
  assert.equal(eicr.status, 'expired');
  assert.equal(r.score, Math.round(0.5 / 7 * 100));
});

test('cleanCompliance keeps only known keys with valid values', () => {
  assert.deepEqual(
    cleanCompliance({ gas: '2026-01-01', epc: 'soon', deposit: 'yes', alarms: true, evil: '<x>' }),
    { gas: '2026-01-01', alarms: true }
  );
  assert.deepEqual(cleanCompliance(null), {});
});

test('cleanCompliance drops the withdrawn How to Rent answer', () => {
  assert.deepEqual(cleanCompliance({ howToRent: true, rraInfo: true }), { rraInfo: true });
});
