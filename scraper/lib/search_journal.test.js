const test = require('node:test');
const assert = require('node:assert/strict');
const { findJournalId, inspectByName, searchByIssn } = require('./search_journal');

const searchHTML = '<a href="?journalid=1">Same Name</a><a href="?journalid=2">Same Name</a>';

test('ISSN lookup accepts only a unique journalid', async () => {
  assert.equal(await searchByIssn('1111-1111', { fetchImpl: async () => '<a href="?journalid=1">One</a>' }), '1');
  assert.equal(await searchByIssn('1111-1111', { fetchImpl: async () => searchHTML }), null);
});

test('name lookup produces conflicts but never chooses a result', async () => {
  const options = { fetchImpl: async () => searchHTML };
  assert.equal((await inspectByName('Same Name', options)).length, 2);
  assert.deepEqual(await findJournalId({ full: 'Same Name' }, options), {
    journalid: null,
    method: 'name_conflict',
    conflicts: [
      { journalid: '1', name: 'Same Name' },
      { journalid: '2', name: 'Same Name' }
    ]
  });
});
