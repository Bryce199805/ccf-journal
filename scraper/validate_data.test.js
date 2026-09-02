const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runValidation, validateDataset } = require('./validate_data');

const validationFixtures = path.join(__dirname, 'fixtures', 'validation');
const load = name => JSON.parse(fs.readFileSync(path.join(validationFixtures, name), 'utf8'));

test('validates schema, Non-CCF policy, all CCF relations, and closed counts', () => {
  const result = validateDataset(load('valid_staging.json'), {
    baseline: load('baseline.json'),
    ccfSource: load('ccf_source.json'),
    scrapeReport: load('scrape_report.json')
  });
  assert.equal(result.ok, true);
  assert.equal(result.stats.total, 2);
  assert.equal(result.stats.expectedCCFRelations, 1);
});

test('detects journalid/ISSN conflicts, missing CCF relations, ineligible Non-CCF, and abnormal drops', () => {
  const invalid = [
    {
      journalid: 'same',
      name: 'A',
      type: 'journal',
      isCCF: false,
      issn: '1111-1111',
      cas2025: { bigCategory: '计算机科学', bigZone: '3区' }
    },
    {
      journalid: 'same',
      name: 'B',
      type: 'journal',
      isCCF: false,
      eissn: '1111-1111',
      cas2025: { bigCategory: '工程技术', bigZone: '1区' }
    },
    {
      journalid: 'different',
      name: 'C',
      type: 'journal',
      isCCF: false,
      issn: '1111-1111',
      cas2025: { bigCategory: '计算机科学', bigZone: '2区' }
    }
  ];
  const result = validateDataset(invalid, {
    baseline: Array.from({ length: 10 }, (_, index) => ({ journalid: String(index) })),
    ccfSource: load('ccf_source.json'),
    scrapeReport: { totalTasks: 3, closed: false, counts: { success: 1 } }
  });
  const codes = new Set(result.errors.map(error => error.code));
  assert.equal(result.ok, false);
  assert.equal(codes.has('duplicate_journalid'), true);
  assert.equal(codes.has('issn_identity_conflict'), true);
  assert.equal(codes.has('missing_ccf_relations'), true);
  assert.equal(codes.has('ineligible_non_ccf'), true);
  assert.equal(codes.has('task_counts_not_closed'), true);
  assert.equal(codes.has('abnormal_entry_drop'), true);
});

test('validation failure cannot overwrite the formal file', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ccf-validation-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const formal = path.join(directory, 'formal.json');
  const input = path.join(directory, 'invalid.json');
  const report = path.join(directory, 'report.json');
  fs.writeFileSync(formal, 'FORMAL-BYTES-MUST-STAY');
  const invalid = load('valid_staging.json');
  invalid[1].casPartitions['2025'].bigZone = '4区';
  fs.writeFileSync(input, JSON.stringify(invalid));
  const result = runValidation({
    input,
    baseline: path.join(validationFixtures, 'baseline.json'),
    ccf: path.join(validationFixtures, 'ccf_source.json'),
    scrapeReport: path.join(validationFixtures, 'scrape_report.json'),
    discoveryReport: path.join(validationFixtures, 'discovery_report.json'),
    report,
    formal,
    publish: true
  });
  assert.equal(result.ok, false);
  assert.equal(result.published, false);
  assert.equal(fs.readFileSync(formal, 'utf8'), 'FORMAL-BYTES-MUST-STAY');
});

test('valid full discovery and closed scrape can publish atomically', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ccf-publish-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const formal = path.join(directory, 'formal.json');
  const report = path.join(directory, 'report.json');
  fs.writeFileSync(formal, 'OLD');
  const result = runValidation({
    input: path.join(validationFixtures, 'valid_staging.json'),
    baseline: path.join(validationFixtures, 'baseline.json'),
    ccf: path.join(validationFixtures, 'ccf_source.json'),
    scrapeReport: path.join(validationFixtures, 'scrape_report.json'),
    discoveryReport: path.join(validationFixtures, 'discovery_report.json'),
    report,
    formal,
    publish: true
  });
  assert.equal(result.ok, true);
  assert.equal(result.published, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(formal)), load('valid_staging.json'));
});

test('incomplete discovery blocks publication even when data itself validates', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ccf-canary-publish-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const formal = path.join(directory, 'formal.json');
  const discovery = path.join(directory, 'discovery.json');
  fs.writeFileSync(formal, 'OLD');
  fs.writeFileSync(discovery, JSON.stringify({ complete: true, sourceComplete: false, scope: 'canary' }));
  const result = runValidation({
    input: path.join(validationFixtures, 'valid_staging.json'),
    baseline: path.join(validationFixtures, 'baseline.json'),
    ccf: path.join(validationFixtures, 'ccf_source.json'),
    scrapeReport: path.join(validationFixtures, 'scrape_report.json'),
    discoveryReport: discovery,
    report: path.join(directory, 'report.json'),
    formal,
    publish: true
  });
  assert.equal(result.ok, false);
  assert.equal(result.published, false);
  assert.equal(result.errors.some(error => error.code === 'cannot_publish_without_complete_discovery'), true);
  assert.equal(fs.readFileSync(formal, 'utf8'), 'OLD');
});
