// Deposit caps and protection deadlines by UK nation.
const test = require('node:test');
const assert = require('node:assert/strict');
const { depositCheck, addWorkingDays, validateBackup } = require('../lib.js');

test('England cap is 5 weeks of rent, 6 weeks when annual rent is £50,000 or more', () => {
  const low = depositCheck('england', { rentAmount: '1300', depositAmount: '1500' }, '2026-11-19');
  assert.equal(low.capText, '5 weeks’ rent');
  assert.equal(low.cap, 1500);
  assert.equal(low.overCap, false);
  assert.equal(depositCheck('england', { rentAmount: '1300', depositAmount: '1501' }, '2026-11-19').overCap, true);
  const high = depositCheck('england', { rentAmount: '5000', depositAmount: '6000' }, '2026-11-19');
  assert.equal(high.capText, '6 weeks’ rent');
  assert.equal(high.overCap, false);
});

test('Scotland caps at 2 months, Northern Ireland at 1 month, Wales has no cap found', () => {
  assert.equal(depositCheck('scotland', { rentAmount: '800', depositAmount: '1700' }, '2026-11-19').overCap, true);
  assert.equal(depositCheck('ni', { rentAmount: '800', depositAmount: '800' }, '2026-11-19').overCap, false);
  assert.equal(depositCheck('ni', { rentAmount: '800', depositAmount: '900' }, '2026-11-19').overCap, true);
  const w = depositCheck('wales', { rentAmount: '800', depositAmount: '5000' }, '2026-11-19');
  assert.equal(w.cap, null); assert.equal(w.overCap, false);
});

test('protection deadlines: 30 days (England, Wales), 30 working days (Scotland), 28 days (NI)', () => {
  const t = { depositAmount: '1000', depositReceived: '2026-11-02' };
  assert.equal(depositCheck('england', t, '2026-11-19').deadline, '2026-12-02');
  assert.equal(depositCheck('wales', t, '2026-11-19').deadline, '2026-12-02');
  assert.equal(depositCheck('ni', t, '2026-11-19').deadline, '2026-11-30');
  assert.equal(depositCheck('scotland', t, '2026-11-19').deadline, addWorkingDays('2026-11-02', 30));
  assert.equal(addWorkingDays('2026-11-02', 30), '2026-12-14');
});

test('deposit due, protected on time and protected late', () => {
  const due = depositCheck('england', { depositAmount: '1000', depositReceived: '2026-11-10' }, '2026-11-19');
  assert.equal(due.due, true); assert.equal(due.late, false);
  const overdue = depositCheck('england', { depositAmount: '1000', depositReceived: '2026-09-01' }, '2026-11-19');
  assert.equal(overdue.late, true);
  const onTime = depositCheck('england', { depositAmount: '1000', depositReceived: '2026-09-01', depositProtected: '2026-09-20' }, '2026-11-19');
  assert.equal(onTime.due, false); assert.equal(onTime.late, false);
  const late = depositCheck('england', { depositAmount: '1000', depositReceived: '2026-09-01', depositProtected: '2026-10-15' }, '2026-11-19');
  assert.equal(late.late, true);
});

test('backups keep deposit details and past tenants', () => {
  const r = validateBackup({ properties: [{ id: 'p1', name: 'A',
    tenant: { name: 'T', rentAmount: '900', depositAmount: '1000', depositScheme: 'DPS', depositRef: 'X1', depositReceived: '2026-11-01', depositProtected: '2026-11-05' },
    pastTenants: [{ name: 'Old', rentAmount: '800', leaseStart: '2024-01-01', endedOn: '2026-10-31' }] }] });
  const p = r.data.properties[0];
  assert.equal(p.tenant.depositScheme, 'DPS');
  assert.equal(p.tenant.depositProtected, '2026-11-05');
  assert.equal(p.pastTenants[0].name, 'Old');
  assert.equal(p.pastTenants[0].endedOn, '2026-10-31');
});
