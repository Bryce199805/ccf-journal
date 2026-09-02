const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runBatch } = require('./batch_scrape');

const detailDirectory = path.join(__dirname, 'fixtures', 'details');
const detail = name => fs.readFileSync(path.join(detailDirectory, name), 'utf8');

function makeWorkspace(t, candidates) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ccf-batch-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const files = {
    ccfFile: path.join(directory, 'ccf.json'),
    legacyIdentityFile: path.join(directory, 'legacy.json'),
    candidatesFile: path.join(directory, 'candidates.json'),
    baselineFile: path.join(directory, 'formal.json'),
    stagingFile: path.join(directory, 'staging.json'),
    progressFile: path.join(directory, 'progress.json'),
    reportFile: path.join(directory, 'report.json'),
    conflictFile: path.join(directory, 'conflicts.json')
  };
  fs.writeFileSync(files.ccfFile, JSON.stringify({
    人工智能: [{ level: 'A', abbr: 'CCFJ', full: 'CCF JOURNAL', publisher: 'Example', url: 'https://example.invalid/ccfj' }],
    交叉领域: [{ level: 'B', abbr: 'CCFJ', full: 'CCF JOURNAL', publisher: 'Example', url: 'https://example.invalid/ccfj' }]
  }));
  fs.writeFileSync(files.legacyIdentityFile, JSON.stringify({ CCFJ: { issn: '5555-5555' } }));
  fs.writeFileSync(files.candidatesFile, JSON.stringify(candidates));
  fs.writeFileSync(files.baselineFile, JSON.stringify([{
    journalid: '500',
    name: 'CCF JOURNAL',
    issn: '5555-5555',
    type: 'journal',
    isCCF: true
  }]));
  return files;
}

test('processes CCF and Non-CCF, preserves all CCF relations, and records structured rejections', async t => {
  const files = makeWorkspace(t, [
    { journalid: '101', full: 'Computer One', issn: '1111-1111' },
    { journalid: '103', full: 'Computer Three', issn: '3333-3333' },
    { journalid: '104', full: 'Engineering One', issn: '4444-4444' }
  ]);
  const html = {
    500: detail('ccf_missing_partition.html'),
    101: detail('non_ccf_zone1_reordered.html'),
    103: detail('non_ccf_zone3.html'),
    104: detail('non_computer_zone1.html')
  };
  const first = await runBatch({
    ...files,
    offline: true,
    delayMs: 0,
    jitterMs: 0,
    fetchDetailImpl: async journalid => ({ ok: true, body: html[journalid] })
  });
  assert.deepEqual(first.report.counts, {
    pending: 0,
    success: 2,
    rejected: 2,
    not_found: 0,
    parse_failed: 0,
    rate_limited: 0
  });
  assert.equal(first.report.closed, true);
  assert.equal(first.results.length, 2);
  const ccf = first.results.find(entry => entry.journalid === '500');
  assert.equal(ccf.isCCF, true);
  assert.equal(ccf.ccfRelations.length, 2);
  const rejected = Object.values(first.progress.tasks).filter(task => task.status === 'rejected');
  assert.deepEqual(rejected.map(task => task.policy.actualBigCategory).sort(), ['工程技术', '计算机科学']);
  assert.deepEqual(rejected.map(task => task.policy.actualBigZone).sort(), ['1区', '3区']);

  let fetched = false;
  const repeated = await runBatch({
    ...files,
    offline: true,
    delayMs: 0,
    jitterMs: 0,
    fetchDetailImpl: async () => {
      fetched = true;
      throw new Error('fresh terminal tasks must be skipped');
    }
  });
  assert.equal(repeated.report.attemptedThisRun, 0);
  assert.equal(fetched, false);
  assert.equal(repeated.results.length, 2);
});

test('a parse failure never overwrites an existing valid record', async t => {
  const files = makeWorkspace(t, [{ journalid: '101', full: 'Computer One', issn: '1111-1111' }]);
  const baseline = JSON.parse(fs.readFileSync(files.baselineFile));
  baseline.push({
    journalid: '101',
    name: 'COMPUTER ONE',
    issn: '1111-1111',
    impactFactor: '8.8',
    type: 'journal',
    isCCF: false,
    casPartitions: { 2025: { bigCategory: '计算机科学', bigZone: '1区' } }
  });
  fs.writeFileSync(files.baselineFile, JSON.stringify(baseline));
  const result = await runBatch({
    ...files,
    offline: true,
    delayMs: 0,
    jitterMs: 0,
    fetchDetailImpl: async journalid => journalid === '101'
      ? { ok: true, body: detail('missing_fields.html') }
      : { ok: true, body: detail('ccf_missing_partition.html') }
  });
  assert.equal(result.progress.tasks['nonccf:101'].status, 'parse_failed');
  assert.equal(result.results.find(entry => entry.journalid === '101').impactFactor, '8.8');
});

test('MAX_JOURNALS leaves unattempted tasks pending and counts still close', async t => {
  const files = makeWorkspace(t, [
    { journalid: '101', full: 'Computer One', issn: '1111-1111' },
    { journalid: '102', full: 'Computer Two', issn: '2222-2222' }
  ]);
  const result = await runBatch({
    ...files,
    offline: true,
    maxJournals: 1,
    delayMs: 0,
    jitterMs: 0,
    fetchDetailImpl: async () => ({ ok: true, body: detail('ccf_missing_partition.html') })
  });
  assert.equal(result.report.attemptedThisRun, 1);
  assert.equal(result.report.counts.pending, 2);
  assert.equal(result.report.countsClosed, true);
  assert.equal(result.report.closed, false);
  assert.equal(result.report.mode, 'partial');
  assert.equal(result.report.canaryCoverage.adequate, false);
});

test('a discovered candidate with a strong CCF identity is not treated as Non-CCF', async t => {
  const files = makeWorkspace(t, [{ journalid: '500', full: 'CCF JOURNAL', issn: '5555-5555' }]);
  const result = await runBatch({
    ...files,
    offline: true,
    delayMs: 0,
    jitterMs: 0,
    fetchDetailImpl: async () => ({ ok: true, body: detail('ccf_missing_partition.html') })
  });
  assert.equal(result.report.totalTasks, 1);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].isCCF, true);
  assert.equal(result.conflicts.some(conflict => conflict.type === 'candidate_is_ccf'), true);
});

test('finite canary selects CCF plus accepted and rejected Non-CCF tasks', async t => {
  const files = makeWorkspace(t, [
    { journalid: '101', full: 'Computer One', issn: '1111-1111' },
    { journalid: '103', full: 'Computer Three', issn: '3333-3333' },
    { journalid: '102', full: 'Computer Two', issn: '2222-2222' }
  ]);
  const html = {
    500: detail('ccf_missing_partition.html'),
    101: detail('non_ccf_zone1_reordered.html'),
    103: detail('non_ccf_zone3.html')
  };
  const result = await runBatch({
    ...files,
    offline: true,
    maxJournals: 3,
    delayMs: 0,
    jitterMs: 0,
    fetchDetailImpl: async journalid => ({ ok: true, body: html[journalid] })
  });
  assert.deepEqual(result.report.selectedTaskKeys, [
    'ccf:CCF JOURNAL|CCFJ',
    'nonccf:101',
    'nonccf:103'
  ]);
  assert.equal(result.report.counts.pending, 1);
  assert.equal(result.report.closed, false);
  assert.deepEqual(result.report.canaryCoverage, {
    selectedCCF: 1,
    selectedNonCCF: 2,
    acceptedNonCCF: 1,
    rejectedNonCCF: 1,
    ccfTaskKeys: ['ccf:CCF JOURNAL|CCFJ'],
    acceptedNonCCFTaskKeys: ['nonccf:101'],
    rejectedNonCCFTaskKeys: ['nonccf:103'],
    adequate: true
  });
});

test('repeated canary resumes pending tasks and accumulates coverage', async t => {
  const files = makeWorkspace(t, [
    { journalid: '101', full: 'Computer One', issn: '1111-1111' },
    { journalid: '103', full: 'Computer Three', issn: '3333-3333' }
  ]);
  const html = {
    500: detail('ccf_missing_partition.html'),
    101: detail('non_ccf_zone1_reordered.html'),
    103: detail('non_ccf_zone3.html')
  };
  const first = await runBatch({
    ...files,
    offline: true,
    maxJournals: 2,
    delayMs: 0,
    jitterMs: 0,
    fetchDetailImpl: async journalid => ({ ok: true, body: html[journalid] })
  });
  assert.equal(first.report.canaryCoverage.adequate, false);
  assert.equal(first.report.counts.pending, 1);

  const resumed = await runBatch({
    ...files,
    offline: true,
    maxJournals: 2,
    delayMs: 0,
    jitterMs: 0,
    fetchDetailImpl: async journalid => ({ ok: true, body: html[journalid] })
  });
  assert.deepEqual(resumed.report.selectedTaskKeys, ['nonccf:103']);
  assert.equal(resumed.report.canaryCoverage.selectedCCF, 1);
  assert.equal(resumed.report.canaryCoverage.acceptedNonCCF, 1);
  assert.equal(resumed.report.canaryCoverage.rejectedNonCCF, 1);
  assert.equal(resumed.report.canaryCoverage.adequate, true);
  assert.equal(resumed.report.closed, true);
});

test('retries stale missing-partition rejections once after a parser upgrade', async t => {
  const files = makeWorkspace(t, [
    { journalid: '103', full: 'Computer Three', issn: '3333-3333' }
  ]);
  fs.writeFileSync(files.progressFile, JSON.stringify({
    schemaVersion: 1,
    tasks: {
      'nonccf:103': {
        status: 'rejected',
        reason: 'missing_cas_partition',
        partitionParserVersion: 1,
        identityCheck: { valid: true },
        updatedAt: '2026-09-02T00:00:00Z'
      }
    }
  }));
  const html = {
    500: detail('ccf_missing_partition.html'),
    103: detail('non_ccf_zone3.html')
  };
  const first = await runBatch({
    ...files,
    offline: true,
    maxJournals: 2,
    delayMs: 0,
    jitterMs: 0,
    now: () => '2026-09-02T01:00:00Z',
    fetchDetailImpl: async journalid => ({ ok: true, body: html[journalid] })
  });
  assert.equal(first.report.attemptedThisRun, 2);
  assert.equal(first.progress.tasks['nonccf:103'].status, 'rejected');
  assert.equal(first.progress.tasks['nonccf:103'].reason, 'cas_big_zone_not_1_or_2');
  assert.equal(first.progress.tasks['nonccf:103'].partitionParserVersion, 2);

  let fetched = false;
  const second = await runBatch({
    ...files,
    offline: true,
    maxJournals: 2,
    delayMs: 0,
    jitterMs: 0,
    now: () => '2026-09-02T02:00:00Z',
    fetchDetailImpl: async () => {
      fetched = true;
      throw new Error('fresh current-version rejection must not retry');
    }
  });
  assert.equal(second.report.attemptedThisRun, 0);
  assert.equal(fetched, false);
});

test('mismatched legacy journalid is detached from the wrong CCF catalog entry', async t => {
  const files = makeWorkspace(t, []);
  fs.writeFileSync(files.ccfFile, JSON.stringify({
    数据库: [
      { level: 'B', abbr: 'IS', full: 'Information Systems', publisher: 'Elsevier', url: '' },
      { level: 'B', abbr: 'INS', full: 'Information Sciences', publisher: 'Elsevier', url: '' }
    ]
  }));
  fs.writeFileSync(files.legacyIdentityFile, JSON.stringify({
    IS: { issn: '0020-0255' },
    INS: { issn: '0020-0255' }
  }));
  fs.writeFileSync(files.baselineFile, JSON.stringify([
    {
      journalid: '3567',
      name: 'INFORMATION SCIENCES',
      issn: '0020-0255',
      type: 'journal',
      isCCF: true,
      ccfAbbr: 'IS',
      ccfFull: 'Information Systems',
      ccfDomain: '数据库',
      ccfLevel: 'B'
    },
    {
      journalid: '3567',
      name: 'INFORMATION SCIENCES',
      issn: '0020-0255',
      type: 'journal',
      isCCF: true,
      ccfAbbr: 'INS',
      ccfFull: 'Information Sciences',
      ccfDomain: '数据库',
      ccfLevel: 'B'
    }
  ]));
  const result = await runBatch({
    ...files,
    offline: true,
    delayMs: 0,
    jitterMs: 0,
    resolveJournalImpl: async () => ({ ok: true, journalid: '3567', method: 'legacy_hint' }),
    fetchDetailImpl: async () => ({ ok: true, body: detail('information_sciences.html') })
  });
  const informationSystems = result.results.find(entry => entry.ccfAbbr === 'IS');
  const informationSciences = result.results.find(entry => entry.ccfAbbr === 'INS');
  assert.equal(informationSystems.name, 'Information Systems');
  assert.equal(informationSystems.journalid, '');
  assert.equal(informationSystems.letpubMatchStatus, 'unmatched');
  assert.equal(informationSciences.journalid, '3567');
  assert.equal(informationSciences.letpubMatchStatus, 'verified');
  assert.equal(result.progress.tasks['ccf:INFORMATION SYSTEMS|IS'].status, 'not_found');
  assert.equal(result.progress.tasks['ccf:INFORMATION SCIENCES|INS'].status, 'success');
  assert.equal(result.results.filter(entry => entry.journalid === '3567').length, 1);
  assert.equal(result.conflicts.some(conflict =>
    conflict.type === 'resolved_identity_mismatch'
    && conflict.taskKey === 'ccf:INFORMATION SYSTEMS|IS'
  ), true);
});

test('unmatched CCF remains as a catalog placeholder without a fabricated journalid', async t => {
  const files = makeWorkspace(t, []);
  fs.writeFileSync(files.ccfFile, JSON.stringify({
    数据库: [{ level: 'C', abbr: 'TORS', full: 'ACM Transactions on Recommender Systems', publisher: 'ACM', url: '' }]
  }));
  fs.writeFileSync(files.legacyIdentityFile, JSON.stringify({ TORS: { issn: '2833-0072' } }));
  fs.writeFileSync(files.baselineFile, JSON.stringify([{
    journalid: '',
    name: '',
    type: 'journal',
    isCCF: true,
    ccfAbbr: 'TORS',
    ccfFull: 'ACM Transactions on Recommender Systems',
    ccfDomain: '数据库',
    ccfLevel: 'C'
  }]));
  const result = await runBatch({
    ...files,
    offline: true,
    delayMs: 0,
    jitterMs: 0,
    resolveJournalImpl: async () => ({ ok: false, status: 'not_found', reason: 'not_found' })
  });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].name, 'ACM Transactions on Recommender Systems');
  assert.equal(result.results[0].journalid, '');
  assert.equal(result.results[0].letpubMatchStatus, 'unmatched');
  assert.equal(result.progress.tasks['ccf:ACM TRANSACTIONS ON RECOMMENDER SYSTEMS|TORS'].status, 'not_found');
});
