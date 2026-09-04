const test = require('node:test');
const assert = require('node:assert/strict');
const { buildImportData } = require('./import_data');

test('import adapter accepts legacy journals and preserves current metadata', () => {
  const result = buildImportData([{
    ccfAbbr: 'OLD',
    impactFactor: '1.2'
  }, {
    journalid: '101',
    name: 'Current Journal',
    journalAbbr: 'CURR J',
    isCCF: false,
    fetchedAt: '2026-09-03T00:00:00Z',
    wosStatus: 'not_indexed',
    wosReason: 'not_in_latest_jcr',
    ccfRelations: []
  }], {
    AI: [{ abbr: 'CONF', full: 'Conference' }]
  });
  assert.equal(result.journals[0].isCCF, true);
  assert.equal(result.journals[0].catalogSource, 'ccf');
  assert.equal(result.journals[1].isCCF, false);
  assert.equal(result.journals[1].journalAbbr, 'CURR J');
  assert.equal(result.journals[1].lastScrapedAt, '2026-09-03T00:00:00Z');
  assert.equal(result.journals[1].wosStatus, 'not_indexed');
  assert.deepEqual(result.conferences[0], { domain: 'AI', abbr: 'CONF', full: 'Conference' });
});
