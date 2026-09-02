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
  assert.equal(result.report.closed, true);
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
