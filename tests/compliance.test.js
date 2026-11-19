// Nation-aware compliance rules and honest statuses.
const test = require('node:test');
const assert = require('node:assert/strict');
const { complianceScore, NATION_ITEMS, cleanCompliance, STATUS_LABEL } = require('../lib.js');
const { NATION_RULES, VERIFIED } = require('../rules.js');

const keys = n => NATION_ITEMS(n).map(i => i.key);

test('each nation has its own checklist; Right to Rent is England only', () => {
  assert.ok(keys('england').includes('rightToRent'));
  for (const n of ['wales', 'scotland', 'ni']) assert.ok(!keys(n).includes('rightToRent'), n);
  assert.ok(keys('wales').includes('rentSmart') && keys('wales').includes('writtenStatement'));
  assert.ok(keys('scotland').includes('landlordReg') && keys('scotland').includes('prtTerms'));
  assert.ok(keys('ni').includes('landlordReg') && keys('ni').includes('tin'));
});

test('registration intervals: Rent Smart Wales 5 years, Scotland and NI registers 3 years', () => {
  assert.equal(NATION_ITEMS('wales').find(i => i.key === 'rentSmart').months, 60);
  assert.equal(NATION_ITEMS('scotland').find(i => i.key === 'landlordReg').months, 36);
  assert.equal(NATION_ITEMS('ni').find(i => i.key === 'landlordReg').months, 36);
});

test('EPC minimum E applies in England and Wales only', () => {
  assert.equal(NATION_ITEMS('england').find(i => i.key === 'epc').minimum, 'E');
  assert.equal(NATION_ITEMS('wales').find(i => i.key === 'epc').minimum, 'E');
  assert.equal(NATION_ITEMS('scotland').find(i => i.key === 'epc').minimum, null);
  assert.equal(NATION_ITEMS('ni').find(i => i.key === 'epc').minimum, null);
});

test('an EPC rated below the minimum needs action even if it is in date', () => {
  const r = complianceScore({ epc: '2024-01-01', epcRating: 'F' }, '2026-11-18', 'england');
  const epc = r.items.find(i => i.key === 'epc');
  assert.equal(epc.status, 'action');
  assert.match(epc.note, /below the minimum E/);
  const scot = complianceScore({ epc: '2024-01-01', epcRating: 'F' }, '2026-11-18', 'scotland');
  assert.equal(scot.items.find(i => i.key === 'epc').status, 'ok');
});

test('not applicable is left out of the score; not sure shows as unable to verify', () => {
  const base = { eicr: '2025-01-01', epc: '2020-01-01', deposit: true, alarms: true, rightToRent: true, rraInfo: true, licence: 'na', legionella: true };
  const noGas = complianceScore({ ...base, gas: 'na' }, '2026-11-18', 'england');
  assert.equal(noGas.items.find(i => i.key === 'gas').status, 'na');
  assert.equal(noGas.score, 100);
  const unsure = complianceScore({ ...base, gas: 'unsure' }, '2026-11-18', 'england');
  assert.equal(unsure.items.find(i => i.key === 'gas').status, 'unverified');
  assert.equal(unsure.items.find(i => i.key === 'gas').statusLabel, 'Unable to verify');
  assert.ok(unsure.score < 100);
});

test('items that cannot be not applicable ignore an na answer', () => {
  const r = complianceScore({ eicr: 'na' }, '2026-11-18', 'england');
  assert.equal(r.items.find(i => i.key === 'eicr').status, 'missing');
});

test('good practice items are shown but not scored (Northern Ireland legionella)', () => {
  const leg = NATION_ITEMS('ni').find(i => i.key === 'legionella');
  assert.equal(leg.legal, false);
  const r = complianceScore({}, '2026-11-18', 'ni');
  assert.equal(r.counted, NATION_ITEMS('ni').filter(i => i.legal).length);
});

test('certificates due within 60 days show as expiring soon', () => {
  const r = complianceScore({ gas: '2025-12-20' }, '2026-11-18', 'wales');
  const gas = r.items.find(i => i.key === 'gas');
  assert.equal(gas.status, 'soon');
  assert.equal(STATUS_LABEL.soon, 'Expiring soon');
});

test('a nation that is not recognised falls back to England', () => {
  assert.deepEqual(keys('atlantis'), keys('england'));
});

test('every rule has a label, plain-English detail and an https source; rules are dated', () => {
  assert.match(VERIFIED, /2026/);
  for (const [n, r] of Object.entries(NATION_RULES)) {
    for (const i of r.items) {
      assert.ok(i.label && i.hint && i.detail, `${n}.${i.key} text`);
      assert.match(i.url, /^https:\/\//, `${n}.${i.key} url`);
      assert.ok(i.kind === 'yes' || (i.kind === 'date' && i.months > 0), `${n}.${i.key} kind`);
    }
    assert.ok(Array.isArray(r.upcoming), n);
  }
});

test('cleanCompliance keeps answers for keys used by any nation', () => {
  assert.deepEqual(cleanCompliance({ rentSmart: '2024-03-01', tin: true, landlordReg: 'unsure', epcRating: 'C' }),
    { rentSmart: '2024-03-01', tin: true, landlordReg: 'unsure', epcRating: 'C' });
});
