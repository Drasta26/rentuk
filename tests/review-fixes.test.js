// Fixes from the independent review (19 Nov 2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const { rentLedger, rentAt, expectedBetween, depositCheck, addWorkingDays, monthlyRule, buildIcs, validateBackup } = require('../lib.js');

test('no tracking start means nothing is counted as due (no moving "today")', () => {
  const r = rentLedger({ rentAmount: '900' }, [], 'p', '2026-11-19');
  assert.equal(r.tracked, false);
  assert.equal(r.expected, 0);
  assert.equal(r.arrears, 0);
});

test('a fixed-term end date does not stop rent; only an ended tenancy does', () => {
  const t = { rentAmount: '1000', rentDueDay: 1, rentFrom: '2026-08-01', leaseEnd: '2026-09-15' };
  const r = rentLedger(t, [], 'p', '2026-11-19');
  assert.equal(r.dueCount, 4);
  assert.equal(r.nextDue, '2026-12-01');
});

test('a rent increase applies only from its date, not to past months', () => {
  const t = { rentAmount: '1100', rentDueDay: 1, rentFrom: '2026-08-01',
    rentHistory: [{ from: '2026-08-01', amount: 1000 }, { from: '2026-11-01', amount: 1100 }] };
  assert.equal(rentAt(t, '2026-10-01'), 1000);
  assert.equal(rentAt(t, '2026-11-01'), 1100);
  const pays = ['2026-08-01', '2026-09-01', '2026-10-01'].map(d => ({ propertyId: 'p', date: d, amount: 1000 }))
    .concat([{ propertyId: 'p', date: '2026-11-01', amount: 1100 }]);
  const r = rentLedger(t, pays, 'p', '2026-11-19');
  assert.equal(r.expected, 4100);
  assert.equal(r.arrears, 0);
  assert.equal(r.nextAmount, 1100);
});

test('expectedBetween uses the rent on each due date and stops at an ended tenancy', () => {
  const t = { rentAmount: '1100', rentDueDay: 1, rentFrom: '2026-08-01', rentHistory: [{ from: '2026-08-01', amount: 1000 }, { from: '2026-11-01', amount: 1100 }] };
  assert.equal(expectedBetween(t, '2026-10-01', '2026-11-30'), 2100);
  assert.equal(expectedBetween({ ...t, endedOn: '2026-10-20' }, '2026-10-01', '2026-11-30'), 1000);
});

test('Scotland deposit deadline counts 30 working days from the tenancy start', () => {
  const d = depositCheck('scotland', { leaseStart: '2026-11-02', depositAmount: '900', depositReceived: '2026-11-20' }, '2026-11-19');
  assert.equal(d.deadline, addWorkingDays('2026-11-02', 30));
});

test('calendar rent repeats land on the due day or the last day of shorter months', () => {
  assert.equal(monthlyRule(1), 'FREQ=MONTHLY;BYMONTHDAY=1');
  assert.equal(monthlyRule(30), 'FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1');
  assert.equal(monthlyRule(31), 'FREQ=MONTHLY;BYMONTHDAY=-1');
  const ics = buildIcs([{ uid: 'r', date: '2026-11-30', title: 'Rent', rrule: monthlyRule(30) }], '2026-11-19T10:00:00Z');
  assert.match(ics, /RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1/);
});

test('rent history survives a backup', () => {
  const r = validateBackup({ properties: [{ id: 'p', name: 'A', tenant: { name: 'T', rentAmount: '1100', rentHistory: [{ from: '2026-08-01', amount: '1000' }, { from: 'bad', amount: 5 }] } }] });
  assert.deepEqual(r.data.properties[0].tenant.rentHistory, [{ from: '2026-08-01', amount: 1000 }]);
});
