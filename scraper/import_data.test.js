const test = require('node:test');
const assert = require('node:assert/strict');
const { buildImportData } = require('./import_data');
const { mergeJournalCatalog } = require('./lib/catalog_merge');

test('identity retirements accompany a complete catalog without copying predecessor metrics', () => {
  const retirement = { journalid: 'old', issn: '1532-060X', expectedName: 'Previous Journal',
    legacyFull: 'Previous Journal', successorFull: 'Current Journal', successorIssn: '2047-7473' };
  const packet = buildImportData([
    { name: 'Current Journal', ccfFull: 'Current Journal', journalid: 'new', issn: '2047-7473' }
  ], {}, { Software: [{ full: 'Current Journal', level: 'C' }] },
  { retiredJournalIdentities: [retirement] });
  assert.deepEqual(packet.retiredJournalIdentities, [retirement]);
  assert.equal(packet.journals.length, 1);
  assert.equal(packet.journals[0].journalid, 'new');
  assert.equal(packet.journals[0].impactFactor, undefined);
});

test('audited renames preserve metrics while identity conflicts abort the import', () => {
  const source = { AI: [{ full: 'New Journal Name', level: 'B', abbr: '' }] };
  const aliases = [{ officialFull: 'New Journal Name', legacyFull: 'Old Journal Name', letpubIdentity: { journalid: '42', issn: '1234-5678' } }];
  const result = mergeJournalCatalog([
    { ccfFull: 'Old Journal Name', journalid: '42', issn: '1234-5678', impactFactor: 4.2 },
    { ccfFull: 'New Journal Name', name: 'New Journal Name', journalid: '', issn: '1234-5678', impactFactor: null },
  ], source, aliases);
  assert.equal(result.length, 1);
  assert.equal(result[0].ccfFull, 'New Journal Name');
  assert.equal(result[0].journalid, '42');
  assert.equal(result[0].impactFactor, 4.2);
  assert.throws(() => mergeJournalCatalog([
    { ccfFull: 'New Journal Name', journalid: '42' },
    { ccfFull: 'New Journal Name', journalid: '99' },
  ], source, aliases), /Ambiguous/);
});

test('current serial constraints reject a historical journal after its title is reused', () => {
  const source = { AI: [{ full: 'Reused Journal Title', level: 'B' }] };
  const hints = [{ officialFull: 'Reused Journal Title', eissn: '2998-4173' }];
  assert.throws(() => mergeJournalCatalog([
    { ccfFull: 'Reused Journal Title', journalid: 'old', issn: '1558-7916', impactFactor: 9 },
  ], source, [], hints), /serial identity conflict/);
  const current = mergeJournalCatalog([
    { ccfFull: 'Reused Journal Title', journalid: 'current', eissn: '2998-4173' },
  ], source, [], hints);
  assert.equal(current[0].journalid, 'current');
});

test('a verified CCF detail supersedes the same Non-CCF identity despite a title descriptor', () => {
  const result = mergeJournalCatalog([
    { ccfFull: 'Journal: An International Journal', journalid: '42', issn: '1234-5678', isCCF: true },
    { name: 'Journal', journalid: '42', issn: '1234-5678', isCCF: false },
  ], { Theory: [{ full: 'Journal: An International Journal', level: 'B' }] }, [], []);
  assert.equal(result.length, 1);
  assert.equal(result[0].isCCF, true);
});

test('official catalog supplies missing journals and updates all relations without losing metrics', () => {
  const metrics = [
    { ccfFull: 'Existing Journal', ccfAbbr: 'OLD', ccfLevel: 'C', impactFactor: 5, journalid: '1' },
    { name: 'Other Journal', isCCF: false, journalid: '2' },
    { ccfFull: 'Removed Journal', ccfAbbr: 'REMOVED' },
  ];
  const result = buildImportData(metrics, {}, {
    Networks: [{ full: 'Existing Journal', abbr: 'NEW', level: 'B' }, { full: 'Missing Journal', abbr: '', level: 'C' }],
    Security: [{ full: 'Existing Journal', abbr: 'NEW', level: 'A' }],
  });
  assert.equal(result.journalCatalogComplete, true);
  assert.equal(result.journals.length, 3);
  assert.equal(result.journals[0].impactFactor, 5);
  assert.equal(result.journals[0].journalid, '1');
  assert.equal(result.journals[0].ccfAbbr, 'NEW');
  assert.equal(result.journals[0].ccfLevel, 'A');
  assert.equal(result.journals[0].ccfRelations.length, 2);
  assert.equal(result.journals[1].name, 'Missing Journal');
  assert.equal(result.journals[1].isCCF, true);
  assert.equal(result.journals[1].lastScrapedAt, null);
  assert.equal(result.journals[2].isCCF, false);
  assert.throws(() => buildImportData(metrics, {}, {}), /empty/);
});

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
