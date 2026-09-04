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

test('partial canary accepts pending tasks, requires coverage, and keeps closed false', () => {
  const scrapeReport = {
    mode: 'partial',
    totalTasks: 4,
    counts: {
      pending: 1,
      success: 2,
      rejected: 1,
      not_found: 0,
      parse_failed: 0,
      rate_limited: 0
    },
    countsClosed: true,
    closed: false,
    canaryCoverage: {
      selectedCCF: 1,
      selectedNonCCF: 2,
      acceptedNonCCF: 1,
      rejectedNonCCF: 1,
      adequate: true
    }
  };
  const result = validateDataset(load('valid_staging.json'), {
    baseline: load('baseline.json'),
    ccfSource: load('ccf_source.json'),
    scrapeReport
  });
  assert.equal(result.ok, true);

  const wrongClosed = validateDataset(load('valid_staging.json'), {
    baseline: load('baseline.json'),
    ccfSource: load('ccf_source.json'),
    scrapeReport: { ...scrapeReport, closed: true }
  });
  assert.equal(wrongClosed.errors.some(error => error.code === 'invalid_closed_flag'), true);

  const inadequate = validateDataset(load('valid_staging.json'), {
    baseline: load('baseline.json'),
    ccfSource: load('ccf_source.json'),
    scrapeReport: {
      ...scrapeReport,
      canaryCoverage: { ...scrapeReport.canaryCoverage, rejectedNonCCF: 0, adequate: false }
    }
  });
  assert.equal(inadequate.errors.some(error => error.code === 'incomplete_canary_coverage'), true);
});

test('CCF catalog placeholder may omit LetPub identity but must retain its display name', () => {
  const relation = {
    domain: '数据库',
    level: 'C',
    abbr: 'TORS',
    full: 'ACM Transactions on Recommender Systems'
  };
  const result = validateDataset([{
    journalid: '',
    name: relation.full,
    type: 'journal',
    isCCF: true,
    ccfRelations: [relation],
    letpubMatchStatus: 'unmatched'
  }], {
    baseline: [],
    ccfSource: { 数据库: [{ level: relation.level, abbr: relation.abbr, full: relation.full }] },
    scrapeReport: {
      mode: 'full',
      totalTasks: 1,
      counts: { pending: 0, success: 0, rejected: 0, not_found: 1, parse_failed: 0, rate_limited: 0 },
      countsClosed: true,
      closed: true
    }
  });
  assert.equal(result.ok, true);
});

test('partial canary reports a pre-existing duplicate journalid as a warning', () => {
  const relations = [
    { domain: '数据库', level: 'B', abbr: 'IS', full: 'Information Systems' },
    { domain: '数据库', level: 'B', abbr: 'INS', full: 'Information Sciences' }
  ];
  const input = relations.map(relation => ({
    journalid: '3567',
    name: 'INFORMATION SCIENCES',
    type: 'journal',
    isCCF: true,
    issn: '0020-0255',
    ccfRelations: [relation]
  }));
  const result = validateDataset(input, {
    baseline: input,
    ccfSource: {
      数据库: relations.map(({ domain: _domain, ...relation }) => relation)
    },
    scrapeReport: {
      mode: 'partial',
      totalTasks: 4,
      counts: { pending: 1, success: 2, rejected: 1, not_found: 0, parse_failed: 0, rate_limited: 0 },
      countsClosed: true,
      closed: false,
      canaryCoverage: {
        selectedCCF: 1,
        selectedNonCCF: 2,
        acceptedNonCCF: 1,
        rejectedNonCCF: 1,
        adequate: true
      }
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.some(warning =>
    warning.code === 'preexisting_duplicate_journalid' && warning.journalid === '3567'
  ), true);
});

test('full validation blocks sparse Non-CCF metadata and CCF name duplication', () => {
  const relation = { domain: '人工智能', level: 'A', abbr: 'SAME', full: 'Same Journal' };
  const input = [{
    journalid: '',
    name: relation.full,
    type: 'journal',
    isCCF: true,
    ccfRelations: [relation]
  }, ...Array.from({ length: 10 }, (_, index) => ({
    journalid: String(100 + index),
    name: index === 0 ? 'SAME JOURNAL' : `Computer Journal ${index}`,
    type: 'journal',
    isCCF: false,
    issn: `12${String(index).padStart(2, '0')}-5678`,
    casPartitions: { 2025: { bigCategory: '计算机科学', bigZone: '2区' } }
  }))];
  const result = validateDataset(input, {
    baseline: [],
    ccfSource: { 人工智能: [{ level: 'A', abbr: 'SAME', full: 'Same Journal' }] },
    scrapeReport: {
      mode: 'full',
      totalTasks: 11,
      counts: { pending: 0, success: 10, rejected: 0, not_found: 1, parse_failed: 0, rate_limited: 0 },
      countsClosed: true,
      closed: true
    }
  });
  assert.equal(result.errors.some(error => error.code === 'ccf_non_ccf_name_conflict'), true);
  assert.equal(result.errors.some(error =>
    error.code === 'metadata_completeness_below_threshold' && error.field === 'publisher'
  ), true);
});

test('authenticated full validation requires trustworthy WOS provenance', () => {
  const base = {
    journalid: '101',
    name: 'Computer Journal',
    type: 'journal',
    isCCF: false,
    issn: '1111-1111',
    publisher: 'Publisher',
    country: 'US',
    language: 'English',
    impactFactor: '1.2',
    citeScore: '2.3',
    casPartitions: { 2025: { bigCategory: '计算机科学', bigZone: '2区' } },
    scrapeSchemaVersion: 4,
    wosStatus: 'not_indexed',
    wosReason: 'not_in_latest_jcr',
    wosZone: ''
  };
  const context = {
    baseline: [],
    ccfSource: {},
    scrapeReport: {
      mode: 'full',
      detailAccessMode: 'authenticated',
      detailParserVersion: 4,
      totalTasks: 1,
      counts: { pending: 0, success: 1, rejected: 0, not_found: 0, parse_failed: 0, rate_limited: 0 },
      countsClosed: true,
      closed: true
    }
  };
  assert.equal(validateDataset([base], context).ok, true);
  const missing = validateDataset([{ ...base, wosStatus: undefined }], context);
  assert.equal(missing.errors.some(error => error.code === 'missing_wos_status'), true);
  const unresolved = validateDataset([{ ...base, wosStatus: 'source_missing' }], context);
  assert.equal(unresolved.errors.some(error => error.code === 'unresolved_wos_status'), true);
  const stale = validateDataset([{ ...base, scrapeSchemaVersion: 3 }], context);
  assert.equal(stale.errors.some(error => error.code === 'stale_scrape_schema'), true);
});

test('validation rejects malformed links, duplicate normalized titles, and conferences in journal data', () => {
  const input = [{
    journalid: '1', name: 'Same-Journal', type: 'journal', isCCF: false,
    officialUrl: '广告文案', submissionUrl: 'Email:',
    casPartitions: { 2025: { bigCategory: '计算机科学', bigZone: '1区' } }
  }, {
    journalid: '2', name: 'Same Journal', type: 'journal', isCCF: false,
    submissionUrl: 'mailto:editor@example.org',
    casPartitions: { 2025: { bigCategory: '计算机科学', bigZone: '2区' } }
  }, {
    journalid: '', name: 'Example Conference', ccfFull: 'Example Conference', ccfAbbr: 'EC',
    type: 'journal', isCCF: true, ccfRelations: []
  }];
  const result = validateDataset(input, { baseline: [], ccfSource: {} });
  assert.equal(result.errors.filter(error => error.code === 'invalid_url').length, 2);
  assert.equal(result.errors.some(error => error.code === 'duplicate_normalized_name'), true);
  assert.equal(result.errors.some(error => error.code === 'conference_in_journal_catalog'), true);
});

test('validation rejects CCF relations removed from the authoritative journal source', () => {
  const obsolete = { domain: 'AI', level: 'C', abbr: 'CONF', full: 'Obsolete Journal Entry' };
  const result = validateDataset([{
    journalid: '', name: obsolete.full, type: 'journal', isCCF: true,
    ccfRelations: [obsolete]
  }], {
    baseline: [{
      journalid: '', name: obsolete.full, type: 'journal', isCCF: true,
      ccfRelations: [obsolete]
    }],
    ccfSource: {},
    scrapeReport: {
      mode: 'full', totalTasks: 0, counts: {}, countsClosed: true, closed: true
    }
  });
  assert.equal(result.errors.some(error => error.code === 'unexpected_ccf_relations'), true);
  assert.equal(result.errors.some(error => error.code === 'lost_baseline_ccf_relations'), false);
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

test('partial canary cannot publish even with adequate coverage', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ccf-partial-publish-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const formal = path.join(directory, 'formal.json');
  const scrapeReport = path.join(directory, 'scrape.json');
  fs.writeFileSync(formal, 'OLD');
  fs.writeFileSync(scrapeReport, JSON.stringify({
    mode: 'partial',
    totalTasks: 3,
    counts: { pending: 0, success: 2, rejected: 1, not_found: 0, parse_failed: 0, rate_limited: 0 },
    countsClosed: true,
    closed: true,
    canaryCoverage: {
      selectedCCF: 1,
      selectedNonCCF: 2,
      acceptedNonCCF: 1,
      rejectedNonCCF: 1,
      adequate: true
    }
  }));
  const result = runValidation({
    input: path.join(validationFixtures, 'valid_staging.json'),
    baseline: path.join(validationFixtures, 'baseline.json'),
    ccf: path.join(validationFixtures, 'ccf_source.json'),
    scrapeReport,
    discoveryReport: path.join(validationFixtures, 'discovery_report.json'),
    report: path.join(directory, 'report.json'),
    formal,
    publish: true
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some(error => error.code === 'cannot_publish_partial_run'), true);
  assert.equal(fs.readFileSync(formal, 'utf8'), 'OLD');
});
