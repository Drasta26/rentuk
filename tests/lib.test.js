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
    properties: [{ id: 'prop_1', name: 'Flat 1', address: '1 Example Road', nation: 'england', tenant: null, createdAt: '2026-10-30T10:00:00.000Z' }],
    currentPropertyId: 'prop_1',
    reminders: [{ id: 1, name: 'Gas Safety Check', dueDate: '2026-12-01', type: 'gas', completed: false, propertyId: null }],
    aobReminders: [{ id: 'aob_1730000000002', name: 'Check smoke alarms', dueDate: '2026-11-15', completed: true, propertyId: 'prop_1' }]
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
    deposit: true, alarms: true, rightToRent: true, rraInfo: true, licence: 'na', legionella: true };
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
  assert.equal(r.score, Math.round(0.5 / 9 * 100));
});

test('cleanCompliance keeps only known keys with valid values', () => {
  assert.deepEqual(
    cleanCompliance({ gas: '2026-01-01', epc: 'soon', deposit: 'yes', alarms: true, evil: '<x>', licence: 'na', legionella: 'unsure', epcRating: 'Z' }),
    { gas: '2026-01-01', alarms: true, licence: 'na', legionella: 'unsure' }
  );
  assert.deepEqual(cleanCompliance(null), {});
});

test('cleanCompliance drops the withdrawn How to Rent answer', () => {
  assert.deepEqual(cleanCompliance({ howToRent: true, rraInfo: true }), { rraInfo: true });
});

const { taxYearStart, rentalEstimate, buildIcs } = require('../lib.js');

test('taxYearStart uses the 6 April boundary', () => {
  assert.equal(taxYearStart('2026-04-05'), 2025);
  assert.equal(taxYearStart('2026-04-06'), 2026);
  assert.equal(taxYearStart('2027-01-10'), 2026);
});

test('rentalEstimate uses expenses or the £1,000 allowance, whichever is bigger', () => {
  const props = [{ id: 'a', name: 'A', tenant: { rentAmount: '1000' } }];
  const low = rentalEstimate(props, [{ propertyId: 'a', date: '2026-05-01', amount: 200 }], 2026);
  assert.equal(low.income, 12000);
  assert.equal(low.useAllowance, true);
  assert.equal(low.profit, 11000);
  const high = rentalEstimate(props, [
    { propertyId: 'a', date: '2026-05-01', amount: 3000 },
    { propertyId: 'a', date: '2026-04-05', amount: 9999 } // previous tax year
  ], 2026);
  assert.equal(high.useAllowance, false);
  assert.equal(high.profit, 9000);
  assert.equal(high.taxAt.basic, 1800);
});

test('rentalEstimate pro-rates rent to the lease and flags MTD by gross income', () => {
  const half = rentalEstimate([{ id: 'a', tenant: { rentAmount: '1000', leaseStart: '2026-10-06' } }], [], 2026);
  assert.ok(half.income > 5900 && half.income < 6100);
  const big = rentalEstimate([{ id: 'a', tenant: { rentAmount: '2600' } }], [], 2026);
  assert.deepEqual(big.mtd, { due: true, from: '6 April 2027', over: 30000 });
  assert.equal(half.mtd.due, false);
});

test('buildIcs makes all-day events with escaped text and CRLF lines', () => {
  const ics = buildIcs([{ uid: 'gas-a', date: '2026-11-15', title: 'Gas check, Flat 2', description: 'Line1\nLine2; x' },
    { uid: 'x', date: 'bad', title: 'skip' }], '2026-10-30T12:00:00.000Z');
  assert.match(ics, /DTSTART;VALUE=DATE:20261115\r\nDTEND;VALUE=DATE:20261116/);
  assert.match(ics, /SUMMARY:Gas check\\, Flat 2/);
  assert.match(ics, /DESCRIPTION:Line1\\nLine2\\; x/);
  assert.match(ics, /DTSTAMP:20261030T120000Z/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
});

const { demoData } = require('../lib.js');

test('demoData passes backup validation and shows a range of scores', () => {
  const d = demoData('2026-10-30');
  const v = validateBackup(d);
  assert.equal(v.ok, true);
  assert.equal(v.skipped, 0);
  const levels = d.properties.map(p => complianceScore(p.compliance, '2026-10-30').level);
  assert.deepEqual(levels, ['great', 'fair', 'poor']);
  assert.ok(d.expenses.every(e => e.date >= '2026-04-06'));
});

test('demoData triggers the Making Tax Digital flag', () => {
  const d = demoData('2026-10-30');
  assert.equal(rentalEstimate(d.properties, d.expenses, 2026).mtd.due, true);
});

const { clearAll, DATA_KEYS } = require('../lib.js');

test('clearAll removes only RentUK keys and reports blocked storage', () => {
  const mem = { expenses: '[]', properties: '[]', otherApp: 'keep' };
  const store = { removeItem: k => { delete mem[k]; } };
  DATA_KEYS.forEach(k => { mem[k] = 'x'; });
  assert.deepEqual(clearAll(store), { ok: true });
  assert.deepEqual(mem, { otherApp: 'keep' });
  assert.deepEqual(clearAll({ removeItem: () => { throw new Error('blocked'); } }), { ok: false });
});

test('erasedElsewhere is true only when another tab removes saved data', () => {
  const { erasedElsewhere } = require('../lib.js');
  const store = {};
  assert.ok(erasedElsewhere({ storageArea: store, key: null, newValue: null }, store));
  assert.ok(erasedElsewhere({ storageArea: store, key: 'properties', newValue: null }, store));
  assert.ok(!erasedElsewhere({ storageArea: store, key: 'properties', newValue: '[]' }, store));
  assert.ok(!erasedElsewhere({ storageArea: store, key: 'rentukInstallHintDismissed', newValue: null }, store));
  assert.ok(!erasedElsewhere({ storageArea: {}, key: null, newValue: null }, store));
});

test('control characters are stripped from imported text and escaped in calendar files', () => {
  const { validateBackup, buildIcs } = require('../lib.js');
  const r = validateBackup({ properties: [{ id: 'p1', name: 'Flat\rBEGIN:VALARM\nX' }] });
  assert.ok(!/[\r\n]/.test(r.data.properties[0].name));
  const ics = buildIcs([{ uid: 'a', date: '2027-01-01', title: 'A\rB' }], '2026-11-06T10:00:00Z');
  assert.ok(!/A\rB/.test(ics) && ics.includes('SUMMARY:A\\nB'));
});

test('contactWays finds a phone and a plain email, and ignores mail header tricks', () => {
  const { contactWays } = require('../lib.js');
  assert.deepEqual(contactWays('07700 900123, sam@example.com'), { email: 'sam@example.com', phone: '07700900123' });
  assert.equal(contactWays('a@b.com?bcc=x@y.com&body=hi').email, 'a@b.com');
  assert.deepEqual(contactWays(''), { email: '', phone: '' });
});

test('asList keeps only objects and falls back for wrong types', () => {
  const { asList, complianceScore } = require('../lib.js');
  assert.deepEqual(asList([{ a: 1 }, null, 'x', 3], []), [{ a: 1 }]);
  assert.deepEqual(asList({}, []), []);
  assert.equal(asList('oops', null), null);
  assert.doesNotThrow(() => complianceScore({ gas: ['2025-01-01'] }, '2026-11-06'));
});

test('backupDue: nothing to lose means no reminder', () => {
  const { backupDue } = require('../lib.js');
  assert.equal(backupDue(Date.now(), false, 0, 0), false);
});

test('backupDue: never backed up is due, Later pauses it for a week', () => {
  const { backupDue } = require('../lib.js');
  const day = 86400000, now = 100 * day;
  assert.equal(backupDue(now, true, 0, 0), true);
  assert.equal(backupDue(now, true, 0, now - 6 * day), false);
  assert.equal(backupDue(now, true, 0, now - 7 * day), true);
});

test('backupDue: monthly after the last backup', () => {
  const { backupDue } = require('../lib.js');
  const day = 86400000, now = 100 * day;
  assert.equal(backupDue(now, true, now - 29 * day, 0), false);
  assert.equal(backupDue(now, true, now - 30 * day, 0), true);
});

test('nationOf defaults to England and only accepts the four UK nations', () => {
  const { nationOf } = require('../lib.js');
  assert.equal(nationOf({}), 'england');
  assert.equal(nationOf({ nation: 'wales' }), 'wales');
  assert.equal(nationOf({ nation: 'scotland' }), 'scotland');
  assert.equal(nationOf({ nation: 'ni' }), 'ni');
  assert.equal(nationOf({ nation: 'france' }), 'england');
  assert.equal(nationOf({ nation: 'toString' }), 'england');
});

test('datesFor keeps dates for this property and dates for all properties', () => {
  const { datesFor } = require('../lib.js');
  const list = [{ id: 1, propertyId: 'a' }, { id: 2, propertyId: 'b' }, { id: 3, propertyId: null }, { id: 4 }];
  assert.deepEqual(datesFor(list, 'a').map(d => d.id), [1, 3, 4]);
  assert.deepEqual(datesFor(list, 'b').map(d => d.id), [2, 3, 4]);
});

test('validateBackup keeps a valid nation and the property a date belongs to', () => {
  const r = validateBackup({ properties: [{ id: 'p1', name: 'A', nation: 'scotland' }, { id: 'p2', name: 'B', nation: '<x>' }],
    aobReminders: [{ id: 'aob_1', name: 'Check', propertyId: 'p1' }, { id: 'aob_2', name: 'Bad', propertyId: '<script>' }] });
  assert.equal(r.data.properties[0].nation, 'scotland');
  assert.equal(r.data.properties[1].nation, 'england');
  assert.equal(r.data.aobReminders[0].propertyId, 'p1');
  assert.equal(r.data.aobReminders[1].propertyId, null);
});

const { dueDates, rentLedger, received } = require('../lib.js');

test('dueDates gives one date a month and handles short months', () => {
  assert.deepEqual(dueDates('2026-01-31', '2026-04-30', 31), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual(dueDates('2026-05-10', '2026-07-09', 1), ['2026-06-01', '2026-07-01']);
  assert.deepEqual(dueDates('2026-05-10', '2026-05-01', 1), []);
});

test('rentLedger: paid up when every due rent is covered', () => {
  const t = { rentAmount: '1000', rentDueDay: 1, rentFrom: '2026-09-01' };
  const pays = [{ propertyId: 'p', date: '2026-09-01', amount: 1000 }, { propertyId: 'p', date: '2026-10-02', amount: 1000 }, { propertyId: 'p', date: '2026-11-01', amount: 1000 }];
  const r = rentLedger(t, pays, 'p', '2026-11-18');
  assert.equal(r.expected, 3000);
  assert.equal(r.paid, 3000);
  assert.equal(r.arrears, 0);
  assert.equal(r.oldestUnpaid, null);
  assert.equal(r.nextDue, '2026-12-01');
});

test('rentLedger: arrears and the oldest unpaid month', () => {
  const t = { rentAmount: '800', rentDueDay: 5, rentFrom: '2026-08-01' };
  const pays = [{ propertyId: 'p', date: '2026-08-05', amount: 800 }, { propertyId: 'p', date: '2026-09-10', amount: 400 }];
  const r = rentLedger(t, pays, 'p', '2026-11-18');
  assert.equal(r.expected, 3200);
  assert.equal(r.paid, 1200);
  assert.equal(r.arrears, 2000);
  assert.equal(r.oldestUnpaid, '2026-09-05');
  assert.equal(r.daysOverdue, 74);
});

test('rentLedger ignores other properties, payments before tracking starts, and stops at the lease end', () => {
  const t = { rentAmount: '500', rentDueDay: 1, rentFrom: '2026-09-01', leaseEnd: '2026-10-15' };
  const pays = [{ propertyId: 'other', date: '2026-09-01', amount: 500 }, { propertyId: 'p', date: '2026-08-01', amount: 500 }, { propertyId: 'p', date: '2026-09-01', amount: 1200 }];
  const r = rentLedger(t, pays, 'p', '2026-11-18');
  assert.equal(r.expected, 1000);
  assert.equal(r.paid, 1200);
  assert.equal(r.credit, 200);
  assert.equal(r.nextDue, null);
});

test('rentLedger with no rent set expects nothing', () => {
  const r = rentLedger({}, [], 'p', '2026-11-18');
  assert.equal(r.expected, 0);
  assert.equal(r.arrears, 0);
  assert.equal(r.nextDue, null);
});

test('received sums actual payments in a date range', () => {
  const pays = [{ propertyId: 'a', date: '2026-11-01', amount: 100 }, { propertyId: 'b', date: '2026-11-03', amount: 50.5 }, { propertyId: 'a', date: '2026-10-31', amount: 999 }];
  assert.equal(received(pays, '2026-11-01', '2026-11-30'), 150.5);
  assert.equal(received(pays, '2026-11-01', '2026-11-30', 'a'), 100);
});

test('validateBackup keeps valid rent payments and drops broken ones', () => {
  const r = validateBackup({ payments: [
    { id: 1, propertyId: 'p1', date: '2026-11-01', amount: '950.50', note: 'Transfer' },
    { id: 2, propertyId: 'p1', date: 'not a date', amount: 10 },
    { id: 3, propertyId: '<bad>', date: '2026-11-01', amount: 10 },
    { id: 4, propertyId: 'p1', date: '2026-11-01', amount: -5 }] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.payments, [{ id: 1, propertyId: 'p1', date: '2026-11-01', amount: 950.5, note: 'Transfer' }]);
  assert.equal(r.skipped, 3);
});

test('demo data includes made-up payments with one month missed at Station Road', () => {
  const { demoData, rentLedger } = require('../lib.js');
  const d = demoData('2026-11-18');
  const st = d.properties.find(p => p.id === 'demo_station');
  const oak = d.properties.find(p => p.id === 'demo_oak');
  assert.ok(rentLedger(st.tenant, d.payments, st.id, '2026-11-18').arrears > 0);
  assert.equal(rentLedger(oak.tenant, d.payments, oak.id, '2026-11-18').arrears, 0);
});

test('issues: open urgent first, done last; summary counts open and urgent per property', () => {
  const { sortIssues, issueSummary } = require('../lib.js');
  const list = [
    { id: 1, propertyId: 'a', priority: 'routine', status: 'open', reported: '2026-11-01' },
    { id: 2, propertyId: 'a', priority: 'urgent', status: 'booked', reported: '2026-11-10' },
    { id: 3, propertyId: 'a', priority: 'urgent', status: 'done', reported: '2026-10-01' },
    { id: 4, propertyId: 'b', priority: 'soon', status: 'open', reported: '2026-11-05' }];
  assert.deepEqual(sortIssues(list).map(i => i.id), [2, 4, 1, 3]);
  const s = issueSummary(list, 'a', '2026-11-18');
  assert.equal(s.open, 2); assert.equal(s.urgent, 1); assert.equal(s.oldestDays, 17); assert.equal(s.first.id, 2);
  assert.equal(issueSummary(list, null, '2026-11-18').open, 3);
});

test('validateBackup cleans maintenance issues and keeps the link from a cost to its repair', () => {
  const r = validateBackup({
    issues: [{ id: 'iss_1', propertyId: 'p1', title: 'Leak', priority: 'nonsense', status: 'booked', quote: '120', cost: '-3', reported: '2026-11-01' },
      { id: 'iss_2', propertyId: '<x>', title: 'Bad' }],
    expenses: [{ id: 5, date: '2026-11-02', description: 'Leak', amount: 120, category: 'repairs', propertyId: 'p1', issueId: 'iss_1' }] });
  assert.equal(r.data.issues.length, 1);
  const i = r.data.issues[0];
  assert.equal(i.priority, 'routine'); assert.equal(i.status, 'booked'); assert.equal(i.quote, 120); assert.equal(i.cost, null);
  assert.equal(r.data.expenses[0].issueId, 'iss_1');
});
