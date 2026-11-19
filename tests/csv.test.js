// Accountant CSV export: escaping, formula-injection protection and row building.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCsv, ledgerRows } = require('../lib.js');

test('buildCsv quotes commas and quotes and defuses spreadsheet formulas', () => {
  const out = buildCsv([['a,b', 'say "hi"', '=HYPERLINK("x")', '+cmd', '-12.50', '@SUM(A1)', 'plain']]);
  assert.equal(out, '"a,b","say ""hi""","\'=HYPERLINK(""x"")",\'+cmd,-12.50,\'@SUM(A1),plain\r\n');
});

test('ledgerRows lists rent in and costs out for the date range, oldest first', () => {
  const rows = ledgerRows([{ id: 'p', name: 'Flat 1' }],
    [{ propertyId: 'p', date: '2026-05-01', amount: 900, note: '' }, { propertyId: 'p', date: '2026-03-01', amount: 900 }],
    [{ propertyId: 'p', date: '2026-04-20', amount: 120.5, category: 'repairs', description: 'Tap' }],
    '2026-04-06', '2027-04-05');
  assert.deepEqual(rows, [
    ['Date', 'Property', 'Type', 'Category', 'Description', 'Amount (GBP)'],
    ['2026-04-20', 'Flat 1', 'Cost', 'repairs', 'Tap', '-120.50'],
    ['2026-05-01', 'Flat 1', 'Rent received', 'Rent', 'Rent payment', '900.00']]);
});

test('calendar events can repeat monthly for rent and set their own alert', () => {
  const { buildIcs } = require('../lib.js');
  const ics = buildIcs([{ uid: 'rent-p', date: '2026-12-01', title: 'Rent due', rrule: 'FREQ=MONTHLY;BYMONTHDAY=1', alarmDays: 1 },
    { uid: 'bad', date: '2026-12-02', title: 'X', rrule: 'FREQ=SECONDLY;COUNT=999999' }], '2026-11-19T10:00:00Z');
  assert.match(ics, /RRULE:FREQ=MONTHLY;BYMONTHDAY=1\r\n/);
  assert.match(ics, /TRIGGER:-P1D/);
  assert.ok(!ics.includes('SECONDLY'));
  assert.match(ics, /TRIGGER:-P14D/);
});
