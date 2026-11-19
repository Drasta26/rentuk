// Documents: only safe file types and sizes; the document list survives backups.
const test = require('node:test');
const assert = require('node:assert/strict');
const { docFileOk, validateBackup, DOC_TYPES } = require('../lib.js');

test('only PDFs and photos up to 10 MB are accepted', () => {
  assert.equal(docFileOk({ type: 'application/pdf', size: 1000 }).ok, true);
  assert.equal(docFileOk({ type: 'image/jpeg', size: 1000 }).ok, true);
  assert.equal(docFileOk({ type: 'text/html', size: 1000 }).ok, false);
  assert.equal(docFileOk({ type: 'image/svg+xml', size: 1000 }).ok, false);
  assert.equal(docFileOk({ type: 'application/pdf', size: 11 * 1024 * 1024 }).ok, false);
  assert.equal(docFileOk({ type: 'application/pdf', size: 0 }).ok, false);
  assert.equal(docFileOk(null).ok, false);
});

test('backups keep a clean document list and drop unsafe entries', () => {
  const r = validateBackup({ documents: [
    { id: 'doc_1', propertyId: 'p1', name: 'Gas 2026.pdf', type: 'gas', mime: 'application/pdf', size: 2048, added: '2026-11-19' },
    { id: 'doc_2', propertyId: 'p1', name: 'x', type: 'weird', mime: 'text/html', size: 5 },
    { id: 'doc_3', propertyId: '<p>', name: 'y', type: 'gas', mime: 'application/pdf', size: 5 }] });
  assert.equal(r.data.documents.length, 1);
  assert.equal(r.data.documents[0].type, 'gas');
  assert.equal(r.skipped, 2);
});

test('document types include the main certificates', () => {
  for (const k of ['gas', 'eicr', 'epc', 'tenancy', 'deposit', 'inventory']) assert.ok(DOC_TYPES[k], k);
});
