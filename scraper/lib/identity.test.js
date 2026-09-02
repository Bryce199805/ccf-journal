const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeISSN, normalizeName, strongMatch } = require('./identity');

test('normalizes serials and names', () => {
  assert.equal(normalizeISSN(' 1234 567X '), '1234-567X');
  assert.equal(normalizeISSN('bad'), '');
  assert.equal(normalizeName('Data & Knowledge-Engineering'), 'DATA AND KNOWLEDGE ENGINEERING');
});

test('identity priority is journalid, ISSN, EISSN; name is never strong', () => {
  assert.equal(strongMatch({ journalid: '1' }, { journalid: '1' }).method, 'journalid');
  assert.equal(strongMatch({ journalid: '1', issn: '1234-5678' }, { journalid: '2', issn: '1234-5678' }).matched, false);
  assert.equal(strongMatch({ issn: '1234-5678' }, { eissn: '12345678' }).method, 'issn');
  assert.equal(strongMatch({ name: 'Same Name' }, { name: 'Same Name' }).matched, false);
});
