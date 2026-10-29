const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  applyCandidateJournalAbbreviations,
  consolidateJournalAliases,
  constructJournalAbbreviation,
  mergeFetchedSnapshot,
  pruneRemovedCCFCatalogEntries,
  parseSearchResults,
  resolveCandidateJournalAbbreviations,
  runBatch,
  serialAliasMatch,
  validateResolvedIdentity
} = require('./batch_scrape');

test('constructs uppercase initialisms without using LetPub search abbreviations', () => {
  assert.equal(constructJournalAbbreviation('Journal of Artificial Intelligence Research'), 'JAIR');
  assert.equal(constructJournalAbbreviation('Soft Robotics'), 'SR');
  assert.equal(constructJournalAbbreviation('VIRTUAL REALITY'), 'VR');
  assert.equal(constructJournalAbbreviation('IEEE COMMUNICATIONS MAGAZINE'), 'ICM');
  assert.equal(constructJournalAbbreviation('EPJ Data Science'), 'EPJDS');
  assert.equal(
    constructJournalAbbreviation('Foundations and Trends in Computer Graphics and Vision'),
    'FTCGV'
  );
  assert.equal(constructJournalAbbreviation('Automatica'), 'Automatica');
  const [candidate] = resolveCandidateJournalAbbreviations([{
    journalid: '1', full: 'Journal of Artificial Intelligence Research', abbr: 'J ARTIF INTELL RES'
  }]);
  assert.equal(candidate.journalAbbr, 'JAIR');
  assert.equal(candidate.journalAbbrSource, 'generated');
  assert.equal(candidate.journalAbbrSourceUrl, '');
});

test('applies neutral LetPub abbreviations to existing Non-CCF records', () => {
  const candidates = resolveCandidateJournalAbbreviations(
    [{ journalid: '101', full: 'Computer Journal', abbr: 'Computer Journal' }],
    { 101: { abbr: 'Comput J', source: 'standard', sourceUrl: 'https://example.test/abbr' } }
  );
  const result = applyCandidateJournalAbbreviations([{
    journalid: '101', name: 'Computer Journal', isCCF: false
  }, {
    journalid: '500', name: 'CCF Journal', isCCF: true, ccfAbbr: 'CCFJ'
  }], candidates);
  assert.equal(result[0].journalAbbr, 'Comput J');
  assert.equal(result[0].journalAbbrSource, 'standard');
  assert.equal(result[0].journalAbbrSourceUrl, 'https://example.test/abbr');
  assert.equal(result[1].journalAbbr, undefined);
});

test('production abbreviation overrides retain a source and prefer the official TDSC acronym', () => {
  const overrides = JSON.parse(fs.readFileSync(path.join(__dirname, 'journal_abbr_overrides.json'), 'utf8'));
  assert.deepEqual(overrides['3378'], {
    abbr: 'TDSC',
    source: 'official',
    sourceUrl: 'https://open.ieee.org/wp-content/uploads/IEEE-Title-List-May-2025.pdf'
  });
  assert.deepEqual(overrides['3558'], {
    abbr: 'INFORMATICA',
    source: 'official',
    sourceUrl: 'https://journals.sagepub.com/home/inf'
  });
  assert.deepEqual(overrides['5774'], {
    abbr: 'MECHATRONICS',
    source: 'official',
    sourceUrl: 'https://www.journals.elsevier.com/mechatronics/'
  });
  assert.deepEqual(overrides['27254'], {
    abbr: 'Drones',
    source: 'official',
    sourceUrl: 'https://www.mdpi.com/journal/drones'
  });
  for (const [journalid, override] of Object.entries(overrides)) {
    assert.ok(override.abbr, `${journalid} must have an abbreviation`);
    assert.ok(['official', 'community', 'standard', 'common'].includes(override.source),
      `${journalid} must have a recognized source type`);
    assert.match(override.sourceUrl, /^https:\/\//, `${journalid} must cite an HTTPS source`);
  }
});

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
    conflictFile: path.join(directory, 'conflicts.json'),
    identityQuarantineFile: path.join(directory, 'quarantine.json'),
    ccfTitleAliasesFile: path.join(directory, 'ccf-title-aliases.json')
  };
  fs.writeFileSync(files.ccfFile, JSON.stringify({
    人工智能: [{ level: 'A', abbr: 'CCFJ', full: 'CCF JOURNAL', publisher: 'Example', url: 'https://example.invalid/ccfj' }],
    交叉领域: [{ level: 'B', abbr: 'CCFJ', full: 'CCF JOURNAL', publisher: 'Example', url: 'https://example.invalid/ccfj' }]
  }));
  fs.writeFileSync(files.legacyIdentityFile, JSON.stringify({ CCFJ: {
    name: 'CCF JOURNAL', issn: '5555-5555'
  } }));
  fs.writeFileSync(files.candidatesFile, JSON.stringify(candidates));
  fs.writeFileSync(files.ccfTitleAliasesFile, JSON.stringify({ aliases: [], excludedHistoricalCandidates: [] }));
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
    success: 3,
    rejected: 1,
    not_found: 0,
    parse_failed: 0,
    rate_limited: 0
  });
  assert.equal(first.report.closed, true);
  assert.equal(first.results.length, 3);
  const acceptedNonCCF = first.results.find(entry => entry.journalid === '101');
  assert.equal(acceptedNonCCF.catalogSource, 'cas-computer-science-1-3');
  assert.equal(acceptedNonCCF.inclusionReason, '中科院计算机科学大类1/2/3区');
  const ccf = first.results.find(entry => entry.journalid === '500');
  assert.equal(ccf.isCCF, true);
  assert.equal(ccf.ccfRelations.length, 2);
  const rejected = Object.values(first.progress.tasks).filter(task => task.status === 'rejected');
  assert.deepEqual(rejected.map(task => task.policy.actualBigCategory), ['工程技术']);
  assert.deepEqual(rejected.map(task => task.policy.actualBigZone), ['1区']);

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
  assert.equal(repeated.results.length, 3);
});

test('CCF-only mode excludes candidate work and preserves existing Non-CCF records', async t => {
  const files = makeWorkspace(t, [
    { journalid: '101', full: 'Computer One', issn: '1111-1111' }
  ]);
  const baseline = JSON.parse(fs.readFileSync(files.baselineFile, 'utf8'));
  baseline.push({ journalid: '777', name: 'Existing Non-CCF', isCCF: false, impactFactor: 4.2 });
  fs.writeFileSync(files.baselineFile, JSON.stringify(baseline));
  const fetched = [];
  const result = await runBatch({
    ...files,
    ccfOnly: true,
    offline: true,
    delayMs: 0,
    jitterMs: 0,
    fetchDetailImpl: async journalid => {
      fetched.push(String(journalid));
      return { ok: true, body: detail('ccf_missing_partition.html') };
    }
  });
  assert.equal(result.report.totalTasks, 1);
  assert.ok(result.tasks.every(task => task.isCCF));
  assert.deepEqual(fetched, ['500']);
  assert.ok(result.results.some(entry => entry.journalid === '777'
    && entry.isCCF === false && entry.impactFactor === 4.2));
});

test('Non-CCF-only mode leaves CCF rows untouched and counts only candidate tasks', async t => {
  const files = makeWorkspace(t, [
    { journalid: '101', full: 'Computer One', issn: '1111-1111' }
  ]);
  const fetched = [];
  const result = await runBatch({
    ...files,
    nonCcfOnly: true,
    offline: true,
    delayMs: 0,
    jitterMs: 0,
    fetchDetailImpl: async journalid => {
      fetched.push(String(journalid));
      return { ok: true, body: detail('non_ccf_zone1_reordered.html') };
    }
  });
  assert.equal(result.report.scope, 'nonccf_only');
  assert.equal(result.report.totalTasks, 1);
  assert.ok(result.tasks.every(task => !task.isCCF));
  assert.deepEqual(fetched, ['101']);
  assert.ok(result.results.some(entry => entry.isCCF === true));
});

test('excludes candidates documented as historical serials from Non-CCF collection', async t => {
  const files = makeWorkspace(t, [
    { journalid: '9779', full: 'Old Journal Title', issn: '2329-9290' },
    { journalid: '101', full: 'Computer One', issn: '1111-1111' }
  ]);
  fs.writeFileSync(files.ccfTitleAliasesFile, JSON.stringify({
    aliases: [],
    excludedHistoricalCandidates: [{
      candidateLetPubJournalid: '9779',
      historicalISSN: '2329-9290',
      candidateRejectedAsCurrent: true
    }]
  }));
  const fetched = [];
  const result = await runBatch({
    ...files,
    nonCcfOnly: true,
    offline: true,
    delayMs: 0,
    jitterMs: 0,
    fetchDetailImpl: async journalid => {
      fetched.push(String(journalid));
      return { ok: true, body: detail('non_ccf_zone1_reordered.html') };
    }
  });
  assert.deepEqual(fetched, ['101']);
  assert.deepEqual(result.report.excludedHistoricalCandidateTaskKeys, ['nonccf:9779']);
  assert.equal(result.report.totalTasks, 1);
});

test('forced public canary refreshes one selected success while leaving other fresh entries alone', async t => {
  const files = makeWorkspace(t, [
    { journalid: '101', full: 'Computer One', issn: '1111-1111' },
    { journalid: '103', full: 'Computer Three', issn: '3333-3333' }
  ]);
  const timestamp = new Date().toISOString();
  fs.writeFileSync(files.progressFile, JSON.stringify({
    schemaVersion: 1,
    tasks: {
      'nonccf:101': {
        status: 'success', updatedAt: timestamp, detailParserVersion: 4,
        detailAccessMode: 'authenticated', identityCheck: { valid: true }
      }
    }
  }));
  const fetched = [];
  const result = await runBatch({
    ...files,
    nonCcfOnly: true,
    refreshDays: 365,
    forceTaskKeys: ['nonccf:101'],
    detailAccessMode: 'anonymous',
    offline: true,
    maxJournals: 1,
    delayMs: 0,
    jitterMs: 0,
    fetchDetailImpl: async journalid => {
      fetched.push(String(journalid));
      return { ok: true, body: detail('non_ccf_zone1_reordered.html') };
    }
  });
  assert.deepEqual(result.report.selectedTaskKeys, ['nonccf:101']);
  assert.deepEqual(fetched, ['101']);
  assert.equal(result.progress.tasks['nonccf:101'].detailAccessMode, 'anonymous');
  assert.equal(result.progress.tasks['nonccf:103'].status, 'pending');
});

test('retries rejected former computer science zone 3 under the new inclusion policy', async t => {
  const files = makeWorkspace(t, [
    { journalid: '103', full: 'Computer Three', issn: '3333-3333' }
  ]);
  fs.writeFileSync(files.progressFile, JSON.stringify({
    schemaVersion: 1,
    tasks: {
      'nonccf:103': {
        status: 'rejected',
        reason: 'cas_big_zone_not_1_or_2',
        policy: {
          accepted: false,
          reason: 'cas_big_zone_not_1_or_2',
          actualBigCategory: '计算机科学',
          actualBigZone: '3区'
        },
        identityCheck: { valid: true },
        updatedAt: '2026-09-02T00:00:00Z'
      }
    }
  }));
  const result = await runBatch({
    ...files,
    nonCcfOnly: true,
    offline: true,
    delayMs: 0,
    jitterMs: 0,
    fetchDetailImpl: async () => ({ ok: true, body: detail('non_ccf_zone3.html') })
  });
  assert.equal(result.report.attemptedThisRun, 1);
  assert.equal(result.progress.tasks['nonccf:103'].catalogPolicyVersion, 2);
  assert.equal(result.progress.tasks['nonccf:103'].status, 'success');
});

test('uses a unique exact-title search result only as a lead for detail identity validation', async () => {
  const { resolveJournal } = require('./batch_scrape');
  const task = { isCCF: true, full: 'ACM TRANSACTIONS ON COMPUTER SYSTEMS' };
  const result = await resolveJournal(task, async () => ({
    ok: true,
    body: '<a href="?journalid=27">ACM TRANSACTIONS ON COMPUTER SYSTEMS</a>'
      + '<a href="?journalid=27">文章</a>'
  }));
  assert.deepEqual(result, { ok: true, journalid: '27', method: 'exact_title_candidate' });

  const ambiguous = await resolveJournal(task, async () => ({
    ok: true,
    body: '<a href="?journalid=27">ACM TRANSACTIONS ON COMPUTER SYSTEMS</a>'
      + '<a href="?journalid=28">ACM TRANSACTIONS ON COMPUTER SYSTEMS</a>'
  }));
  assert.equal(ambiguous.status, 'not_found');
  assert.equal(ambiguous.reason, 'identity_conflict');

  const annotatedTask = {
    isCCF: true,
    full: 'ENGINEERING Information Technology & Electronic Engineering（原 Frontiers of Information Technology & Electronic Engineering）'
  };
  let requestedURL = '';
  const annotated = await resolveJournal(annotatedTask, async url => {
    requestedURL = url;
    return {
      ok: true,
      body: '<a href="?journalid=3500">ENGINEERING Information Technology & Electronic Engineering</a>'
    };
  });
  assert.equal(annotated.journalid, '3500');
  assert.ok(decodeURIComponent(requestedURL).includes('searchname=ENGINEERING Information Technology & Electronic Engineering'));
  assert.equal(require('./batch_scrape').validateResolvedIdentity(annotatedTask, {
    name: 'ENGINEERING Information Technology & Electronic Engineering'
  }).valid, true);
});

test('search network failures are retryable parse failures, including cached legacy not-found states', async () => {
  const { resolveJournal, selectTasksForRun } = require('./batch_scrape');
  const task = { key: 'ccf:EXAMPLE|', isCCF: true, full: 'Example Journal',
    issn: '1234-5678', hasAuthoritativeIdentity: true };
  const resolution = await resolveJournal(task, async () => ({ ok: false, kind: 'network_error' }));
  assert.deepEqual(resolution, { ok: false, status: 'parse_failed', reason: 'network_error' });
  const progress = { tasks: { [task.key]: { status: 'not_found', reason: 'network_error',
    identityMatcherVersion: 7, updatedAt: new Date().toISOString() } } };
  assert.deepEqual(selectTasksForRun([task], progress, {
    forceRefresh: false, refreshDays: 3650, maxJournals: Infinity
  }), [task]);
});

test('disambiguates a small authoritative serial result set only when exactly one detail validates', async () => {
  const { resolveJournal } = require('./batch_scrape');
  const html = detail('current_nested_metadata.html');
  const task = { isCCF: true, full: 'CURRENT COMPUTER JOURNAL', eissn: '8765-4321', hasAuthoritativeIdentity: true };
  const requestFor = matchingIds => async url => {
    const id = new URL(url).searchParams.get('journalid');
    if (!id) return { ok: true, body: '<a href="?journalid=1">Recommended A</a><a href="?journalid=2">Recommended B</a>' };
    return { ok: true, body: matchingIds.includes(id) ? html : html.replaceAll('CURRENT COMPUTER JOURNAL', 'UNRELATED JOURNAL') };
  };
  const unique = await resolveJournal(task, requestFor(['2']));
  assert.equal(unique.ok, true);
  assert.equal(unique.journalid, '2');
  assert.equal(unique.method, 'verified_detail_candidate');
  assert.equal(unique.prefetchedResponse.body, html);
  const ambiguous = await resolveJournal(task, requestFor(['1', '2']));
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.reason, 'identity_conflict');
  assert.deepEqual(ambiguous.candidates, ['1', '2']);
});

test('decodes HTML entities in LetPub search anchor titles before exact identity matching', () => {
  assert.deepEqual(parseSearchResults(
    '<a href="?journalid=100">A &amp; B &#38; &#x26;</a>'
  ), [{ journalid: '100', name: 'A & B & &' }]);
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

test('halts after consecutive rate limits and preserves the remaining checkpoint', async t => {
  const files = makeWorkspace(t, [
    { journalid: '101', full: 'Computer One', issn: '1111-1111' },
    { journalid: '102', full: 'Computer Two', issn: '2222-2222' },
    { journalid: '103', full: 'Computer Three', issn: '3333-3333' }
  ]);
  const events = [];
  const result = await runBatch({
    ...files,
    offline: true,
    delayMs: 0,
    jitterMs: 0,
    maxConsecutiveRateLimits: 2,
    fetchDetailImpl: async () => ({ ok: false, kind: 'rate_limited' }),
    onProgress: event => events.push(event)
  });

  assert.equal(result.report.attemptedThisRun, 2);
  assert.equal(result.report.haltedEarly, true);
  assert.equal(result.report.haltedReason, 'consecutive_rate_limits');
  assert.equal(result.report.closed, false);
  assert.equal(result.report.counts.rate_limited, 2);
  assert.equal(result.report.counts.pending, 2);
  assert.equal(events.length, 2);
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

test('same-ISSN LetPub aliases are merged while unrelated titles remain separate', () => {
  const conflicts = [];
  const entries = consolidateJournalAliases([
    {
      journalid: '27329',
      name: 'Proceedings of the ACM on Programming Languages',
      issn: '2475-1421',
      isCCF: false
    },
    {
      journalid: '39329',
      name: 'Proceedings of the ACM on Programming Languages-PACMPL',
      issn: '2475-1421',
      isCCF: false
    },
    {
      journalid: 'other',
      name: 'Different Journal',
      issn: '2475-1421',
      isCCF: false
    }
  ], conflicts);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].journalid, '27329');
  assert.deepEqual(entries[0].letpubJournalidAliases, ['39329']);
  assert.equal(conflicts[0].type, 'letpub_journalid_alias_merged');
  assert.equal(serialAliasMatch(entries[0], entries[1]), false);
});

test('same journal split into print and online LetPub records is consolidated', () => {
  const conflicts = [];
  const entries = consolidateJournalAliases([{
    journalid: '43985',
    name: 'Blockchain Research and Applications',
    issn: '2666-9536',
    officialUrl: 'https://publisher.example/blockchain/',
    wosZone: '',
    isCCF: false
  }, {
    journalid: '39893',
    name: 'Blockchain-Research and Applications',
    issn: '2096-7209',
    officialUrl: 'https://publisher.example/blockchain',
    wosZone: '1区',
    jif: [{ subject: 'Computer Science', quartile: 'Q1', rank: '1/10' }],
    isCCF: false
  }], conflicts);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].journalid, '39893');
  assert.equal(entries[0].issn, '2096-7209');
  assert.equal(entries[0].eissn, '2666-9536');
  assert.deepEqual(entries[0].letpubJournalidAliases, ['43985']);
  assert.equal(conflicts[0].type, 'letpub_title_source_alias_merged');
});

test('aliases discovered by separate tasks are consolidated at the end of a run', async t => {
  const files = makeWorkspace(t, [
    { journalid: '101', full: 'Blockchain Research and Applications', issn: '1111-1111' },
    { journalid: '102', full: 'Blockchain-Research and Applications', issn: '2222-2222' }
  ]);
  const source = detail('non_ccf_zone1_reordered.html');
  const aliasHTML = (name, issn) => source
    .replace('COMPUTER ONE', name)
    .replace('1111-1111', issn)
    .replace('1111-111X', issn)
    .replace('</table>', '<tr><td>期刊官方网站</td><td><a href="https://example.org/blockchain/">website</a></td></tr></table>');
  const html = {
    500: detail('ccf_missing_partition.html'),
    101: aliasHTML('Blockchain Research and Applications', '1111-1111'),
    102: aliasHTML('Blockchain-Research and Applications', '2222-2222')
  };

  const result = await runBatch({
    ...files,
    offline: true,
    delayMs: 0,
    jitterMs: 0,
    fetchDetailImpl: async journalid => ({ ok: true, body: html[journalid] })
  });
  const aliases = result.results.filter(entry => /Blockchain/.test(entry.name));
  assert.equal(aliases.length, 1);
  assert.deepEqual(new Set([aliases[0].issn, aliases[0].eissn]), new Set(['1111-1111', '2222-2222']));
  assert.equal(aliases[0].letpubJournalidAliases.length, 1);
});

test('a CCF journal reuses its unique staging identity before falling back to name search', async t => {
  const files = makeWorkspace(t, []);
  fs.writeFileSync(files.baselineFile, '[]');
  fs.writeFileSync(files.stagingFile, JSON.stringify([{
    journalid: '500',
    name: 'CCF JOURNAL',
    issn: '5555-5555',
    isCCF: true,
    ccfRelations: [{ domain: '人工智能', level: 'A', abbr: 'CCFJ', full: 'CCF JOURNAL' }, { domain: '交叉领域', level: 'B', abbr: 'CCFJ', full: 'CCF JOURNAL' }]
  }]));
  let resolvedID = null;
  const result = await runBatch({
    ...files,
    offline: true,
    delayMs: 0,
    jitterMs: 0,
    fetchDetailImpl: async journalid => {
      resolvedID = journalid;
      return { ok: true, body: detail('ccf_missing_partition.html') };
    }
  });
  assert.equal(resolvedID, '500');
  assert.equal(result.progress.tasks['ccf:CCF JOURNAL|CCFJ'].status, 'success');
});

test('fresh snapshot clears stale volatile fields while retaining identity', () => {
  const merged = mergeFetchedSnapshot({
    journalid: '1',
    issn: '1111-1111',
    fiveYearIF: '9.9',
    jciValue: '2.2',
    officialUrl: 'not-a-url',
    wosZone: '1区',
    jif: [{ subject: 'Old' }]
  }, {
    journalid: '1',
    fiveYearIF: '',
    jciValue: '',
    officialUrl: '',
    wosZone: '',
    wosStatus: 'not_indexed',
    wosReason: 'not_in_latest_jcr',
    jif: []
  });
  assert.equal(merged.issn, '1111-1111');
  assert.equal(merged.fiveYearIF, '');
  assert.equal(merged.jciValue, '');
  assert.equal(merged.officialUrl, '');
  assert.equal(merged.wosZone, '');
  assert.deepEqual(merged.jif, []);
  assert.equal(merged.wosStatus, 'not_indexed');
});

test('removed conference-like CCF source entries are pruned from journal staging', () => {
  const entries = pruneRemovedCCFCatalogEntries([{
    name: 'Real Journal', isCCF: true,
    ccfRelations: [{ full: 'Real Journal', abbr: 'RJ', domain: 'AI', level: 'A' }]
  }, {
    name: 'Old Conference', isCCF: true,
    ccfRelations: [{ full: 'Old Conference', abbr: 'OC', domain: 'AI', level: 'C' }]
  }, {
    name: 'Non CCF Journal', isCCF: false
  }], [{
    isCCF: true,
    full: 'Real Journal',
    abbr: 'RJ'
  }]);
  assert.deepEqual(entries.map(entry => entry.name), ['Real Journal', 'Non CCF Journal']);
});

test('CCF catalog abbreviation edits preserve matching details and replace official relations', () => {
  const [entry] = pruneRemovedCCFCatalogEntries([{
    journalid: '500', name: 'Real Journal', isCCF: true, impactFactor: 5,
    ccfRelations: [{ full: 'Real Journal', abbr: 'OLD', domain: 'AI', level: 'A' }]
  }], [{
    isCCF: true,
    full: 'Real Journal',
    abbr: '',
    ccfRelations: [{ full: 'Real Journal', abbr: '', domain: 'AI', level: 'A' }]
  }]);
  assert.equal(entry.journalid, '500');
  assert.equal(entry.impactFactor, 5);
  assert.deepEqual(entry.ccfRelations, [{ full: 'Real Journal', abbr: '', domain: 'AI', level: 'A' }]);
});

test('initializing a fresh successful CCF task never downgrades its provider WOS or quartile values', async t => {
  const files = makeWorkspace(t, []);
  const snapshot = {
    journalid: '500', name: 'CCF JOURNAL', issn: '5555-5555', isCCF: true,
    ccfRelations: [{ full: 'CCF JOURNAL', abbr: 'CCFJ', domain: 'AI', level: 'A' }],
    letpubMatchStatus: 'verified', wosStatus: 'available', wosZone: '2区',
    jif: [{ subject: 'Computer Science', quartile: 'Q2' }],
    jci: [{ subject: 'Computer Science', quartile: 'Q3' }]
  };
  fs.writeFileSync(files.baselineFile, JSON.stringify([snapshot]));
  fs.writeFileSync(files.stagingFile, JSON.stringify([snapshot]));
  fs.writeFileSync(files.progressFile, JSON.stringify({ schemaVersion: 1, tasks: {
    'ccf:CCF JOURNAL|CCFJ': { status: 'success', identityCheck: { valid: true },
      detailParserVersion: 4, detailAccessMode: 'authenticated', updatedAt: new Date().toISOString() }
  } }));
  const result = await runBatch({ ...files, ccfOnly: true, offline: true, detailAccessMode: 'authenticated' });
  assert.equal(result.report.attemptedThisRun, 0);
  const retained = result.results.find(entry => entry.journalid === '500');
  assert.equal(retained.letpubMatchStatus, 'verified');
  assert.equal(retained.wosStatus, 'available');
  assert.equal(retained.wosZone, '2区');
  assert.deepEqual(retained.jif, snapshot.jif);
  assert.deepEqual(retained.jci, snapshot.jci);
});

test('normalizes invalid serial placeholders and stale WOS zones in preserved records', () => {
  const { normalizeBaseline } = require('./batch_scrape');
  const [entry] = normalizeBaseline([{
    journalid: '44867', name: 'A Journal', isCCF: true,
    issn: 'N/A', eissn: '2769-6480', wosStatus: 'not_indexed', wosZone: '3区'
  }]);
  assert.equal(entry.issn, '');
  assert.equal(entry.eissn, '2769-6480');
  assert.equal(entry.wosZone, '');
});

test('curated CCF title aliases provide serial identity and retain a detail-name validation alias', () => {
  const { buildTasks } = require('./batch_scrape');
  const [task] = buildTasks({ AI: [{
    full: 'The Journal of Strategic Information Systems',
    abbr: 'JSIS', level: 'C'
  }] }, [], {}, [{
    legacyFull: 'Journal of Strategic Information Systems',
    officialFull: 'The Journal of Strategic Information Systems',
    letpubIdentity: {
      journalid: '5185', issn: '0963-8687', eissn: '',
      name: 'JOURNAL OF STRATEGIC INFORMATION SYSTEMS'
    }
  }]);
  assert.equal(task.journalid, '5185');
  assert.equal(task.issn, '0963-8687');
  assert.deepEqual(task.identityAliases, [
    'Journal of Strategic Information Systems', 'JOURNAL OF STRATEGIC INFORMATION SYSTEMS'
  ]);
  const identityCheck = require('./batch_scrape').validateResolvedIdentity(task, {
    name: 'JOURNAL OF STRATEGIC INFORMATION SYSTEMS', issn: '0963-8687', journalid: '5185'
  });
  assert.equal(identityCheck.valid, true);
  const [migrated] = pruneRemovedCCFCatalogEntries([{
    journalid: '5185', name: 'JOURNAL OF STRATEGIC INFORMATION SYSTEMS', isCCF: true,
    ccfRelations: [{ full: 'Journal of Strategic Information Systems', abbr: 'JSIS' }]
  }], [task]);
  assert.equal(migrated.journalid, '5185');
  assert.equal(migrated.ccfRelations[0].full, 'The Journal of Strategic Information Systems');
});

test('official CCF identity hints supply ISSN search keys and publisher-title validation aliases', () => {
  const { buildTasks, ccfPlaceholder } = require('./batch_scrape');
  const [task] = buildTasks({ AI: [{
    full: 'Journal of Systems Architecture: Embedded Software Design', abbr: 'JSA', level: 'B'
  }] }, [], {}, [], [{
    officialFull: 'Journal of Systems Architecture: Embedded Software Design',
    issn: '1383-7621', eissn: '1873-6165', publisherTitle: 'Journal of Systems Architecture'
  }]);
  assert.equal(task.journalid, '');
  assert.equal(task.issn, '1383-7621');
  assert.equal(task.eissn, '1873-6165');
  assert.deepEqual(task.identityAliases, ['Journal of Systems Architecture']);
  assert.equal(require('./batch_scrape').validateResolvedIdentity(task, {
    name: 'Journal of Systems Architecture', issn: '1383-7621', eissn: '1873-6165'
  }).valid, true);
  const placeholder = ccfPlaceholder({
    ...task,
    identitySourceUrl: 'https://dblp.org/db/journals/jsa/index.html',
    ccfRelations: [{ full: task.full, abbr: task.abbr, domain: 'AI', level: 'B' }]
  });
  assert.equal(placeholder.issn, '1383-7621');
  assert.equal(placeholder.eissn, '1873-6165');
  assert.equal(placeholder.identitySourceUrl, 'https://dblp.org/db/journals/jsa/index.html');
  assert.equal(placeholder.journalid, '');
  assert.equal(placeholder.impactFactor, undefined);
});

test('official identity hints replace stale legacy serials when their field is unavailable', () => {
  const { buildTasks } = require('./batch_scrape');
  const [task] = buildTasks({ AI: [{
    full: 'ACM Transactions on Recommender Systems', abbr: 'TORS', level: 'B'
  }] }, [], { TORS: {
    journalid: '9999', issn: '2833-0072', eissn: '2833-0073'
  } }, [], [{
    officialFull: 'ACM Transactions on Recommender Systems',
    issn: null, eissn: '2770-6699', publisherTitle: 'Transactions on Recommender Systems'
  }]);
  assert.equal(task.journalid, '');
  assert.equal(task.issn, '');
  assert.equal(task.eissn, '2770-6699');
});

test('authoritative corrected serial hints requeue old CL and ambiguous PLOS not-found states', () => {
  const { buildTasks, selectTasksForRun } = require('./batch_scrape');
  const source = { Systems: [
    { full: 'Computer Languages, Systems and Structures', abbr: 'CL', level: 'B' },
    { full: 'PLOS Computational Biology', abbr: '', level: 'B' }
  ] };
  const hints = [
    { officialFull: 'Computer Languages, Systems and Structures', issn: '1477-8424', eissn: '1873-6866' },
    { officialFull: 'PLOS Computational Biology', eissn: '1553-7358', publisherTitle: 'PLOS Computational Biology' }
  ];
  const tasks = buildTasks(source, [], {
    CL: { name: 'Computational Linguistics', issn: '0891-2017', journalid: '1986' }
  }, [], hints);
  const cl = tasks.find(task => task.abbr === 'CL');
  const plos = tasks.find(task => task.full === 'PLOS Computational Biology');
  assert.equal(cl.issn, '1477-8424');
  assert.equal(cl.eissn, '1873-6866');
  const now = new Date().toISOString();
  const progress = { tasks: {
    [cl.key]: { status: 'not_found', identityMatcherVersion: 6, updatedAt: now,
      reason: 'resolved_identity_mismatch', identityCheck: { expected: { issn: '0891-2017' } } },
    [plos.key]: { status: 'not_found', identityMatcherVersion: 6, updatedAt: now,
      reason: 'identity_conflict', candidates: ['6771', '8953', '10628'] }
  } };
  assert.deepEqual(selectTasksForRun([cl, plos], progress, {
    forceRefresh: false, refreshDays: 3650, maxJournals: Infinity
  }), [cl, plos]);
});

test('legacy abbreviation identity is ignored when its recorded title differs from the CCF title', () => {
  const { buildTasks } = require('./batch_scrape');
  const [task] = buildTasks({ Systems: [{
    full: 'Computer Languages, Systems and Structures', abbr: 'CL', level: 'B'
  }] }, [], { CL: {
    name: 'Computational Linguistics', issn: '0891-2017', journalid: '1986'
  } });
  assert.equal(task.issn, '');
  assert.equal(task.journalid, '');
});

test('authoritative identity hints do not inherit a conflicting baseline journalid', () => {
  const { hydrateKnownIdentity } = require('./batch_scrape');
  const task = {
    key: 'ccf:CCF JOURNAL|CCFJ', isCCF: true, full: 'CCF JOURNAL',
    issn: '9999-9999', eissn: '', journalid: '', hasAuthoritativeIdentity: true
  };
  const conflicting = hydrateKnownIdentity(task, [{
    journalid: '500', name: 'CCF JOURNAL', issn: '1111-1111', isCCF: true,
    ccfRelations: [{ full: 'CCF JOURNAL', abbr: 'CCFJ' }]
  }]);
  assert.equal(conflicting.journalid, '');
  const matching = hydrateKnownIdentity(task, [{
    journalid: '501', name: 'CCF JOURNAL', issn: '9999-9999', isCCF: true,
    ccfRelations: [{ full: 'CCF JOURNAL', abbr: 'CCFJ' }]
  }]);
  assert.equal(matching.journalid, '501');
});

test('promotes a matching Non-CCF row into CCF only when validated identity shares a serial or journalid', () => {
  const { upsertCCFResult } = require('./batch_scrape');
  const task = {
    key: 'ccf:BLOCKCHAIN RESEARCH AND APPLICATIONS|BCRA',
    isCCF: true, full: 'Blockchain: Research and Applications', abbr: 'BCRA',
    hasAuthoritativeIdentity: true, issn: '2096-7209', eissn: '2666-9536',
    ccfRelations: [{ full: 'Blockchain: Research and Applications', abbr: 'BCRA', domain: 'AI', level: 'B' }]
  };
  const existing = [{
    journalid: '39893', name: 'Blockchain-Research and Applications',
    issn: '2096-7209', eissn: '2666-9536', isCCF: false, impactFactor: '3.1'
  }];
  const incoming = {
    journalid: '39893', name: 'Blockchain: Research and Applications',
    issn: '2096-7209', eissn: '2666-9536', isCCF: true,
    ccfRelations: task.ccfRelations, impactFactor: '3.1'
  };
  assert.equal(upsertCCFResult(existing, task, incoming, []).ok, true);
  assert.equal(existing.length, 1);
  assert.equal(existing[0].isCCF, true);
  assert.equal(existing[0].impactFactor, '3.1');

  const unrelated = [{ ...existing[0], isCCF: false, ccfRelations: [], journalid: '50000', issn: '1111-1111', eissn: '' }];
  assert.equal(upsertCCFResult(unrelated, task, incoming, []).ok, true);
  assert.equal(unrelated.length, 2, 'name similarity without strong identity must not promote');
});

test('revalidates and quarantines a successful CCF row whose current authoritative serial changed', async t => {
  const files = makeWorkspace(t, []);
  const baseline = [{
    journalid: '500', name: 'CCF JOURNAL', issn: '5555-5555', isCCF: true,
    ccfRelations: [{ full: 'CCF JOURNAL', abbr: 'CCFJ', domain: 'AI', level: 'A' }],
    impactFactor: '7.1', letpubMatchStatus: 'verified'
  }];
  fs.writeFileSync(files.baselineFile, JSON.stringify(baseline));
  fs.writeFileSync(files.stagingFile, JSON.stringify(baseline));
  const hintsFile = path.join(path.dirname(files.baselineFile), 'hints.json');
  fs.writeFileSync(hintsFile, JSON.stringify({ items: [{
    officialFull: 'CCF JOURNAL', issn: '9999-9999', eissn: null,
    publisherTitle: 'CCF JOURNAL'
  }] }));
  fs.writeFileSync(files.progressFile, JSON.stringify({
    schemaVersion: 1,
    tasks: {
      'ccf:CCF JOURNAL|CCFJ': {
        status: 'success',
        updatedAt: new Date().toISOString(),
        identityMatcherVersion: 6,
        detailParserVersion: 4,
        partitionParserVersion: 2,
        identityCheck: { valid: true, actual: {
          name: 'CCF JOURNAL', issn: '5555-5555', journalid: '500'
        } }
      }
    }
  }));
  const result = await runBatch({
    ...files,
    ccfIdentityHintsFile: hintsFile,
    ccfOnly: true,
    offline: true,
    maxJournals: 0,
    delayMs: 0,
    jitterMs: 0,
    resolveJournalImpl: async () => ({ ok: false, status: 'not_found', reason: 'not_found' })
  });
  assert.equal(result.tasks[0].hasAuthoritativeIdentity, true);
  assert.equal(result.report.attemptedThisRun, 0);
  const placeholder = result.results.find(entry => entry.isCCF && entry.ccfFull === 'CCF JOURNAL');
  assert.equal(result.identityQuarantine[0].snapshot.journalid, '500');
  assert.equal(result.identityQuarantine[0].snapshot.impactFactor, '7.1');
  assert.equal(placeholder.letpubMatchStatus, 'unmatched');
  assert.equal(placeholder.journalid, '');
  assert.equal(result.progress.tasks['ccf:CCF JOURNAL|CCFJ'].status, 'pending');
  assert.equal(result.progress.tasks['ccf:CCF JOURNAL|CCFJ'].identityCheck, undefined);
});

test('same-name LetPub candidate supplies the current identity for a CCF journal', async t => {
  const files = makeWorkspace(t, [{
    journalid: '999',
    full: 'CCF JOURNAL',
    issn: '5555-5555'
  }]);
  const result = await runBatch({
    ...files,
    offline: true,
    delayMs: 0,
    jitterMs: 0,
    fetchDetailImpl: async journalid => {
      assert.equal(journalid, '999');
      return { ok: true, body: detail('ccf_missing_partition.html') };
    }
  });
  assert.equal(result.report.totalTasks, 1);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].isCCF, true);
  assert.equal(result.results[0].journalid, '999');
  assert.equal(result.conflicts.some(conflict => conflict.type === 'candidate_is_ccf'), true);
});

test('CCF identity accepts safe title variants with a matching serial', () => {
  const cases = [
    ['The VLDB Journal', 'VLDB JOURNAL'],
    ['Computers & Graphics', 'COMPUTERS & GRAPHICS-UK'],
    ['Proceedings of the ACM on Interactive Mobile Wearable and Ubiquitous Technologies',
      'Proceedings of the ACM on Interactive Mobile Wearable and Ubiquitous Technologies-IMWUT'],
    ['World Wide Web Journal', 'WORLD WIDE WEB-INTERNET AND WEB INFORMATION SYSTEMS']
  ];
  for (const [full, name] of cases) {
    const check = validateResolvedIdentity(
      { isCCF: true, full, issn: '1234-5678' },
      { name, issn: '1234-5678' }
    );
    assert.equal(check.valid, true, `${full} should match ${name}`);
    assert.equal(check.nameCompatible, true);
  }
  const mismatch = validateResolvedIdentity(
    { isCCF: true, full: 'Information Systems', issn: '0020-0255' },
    { name: 'Information Sciences', issn: '0020-0255' }
  );
  assert.equal(mismatch.valid, false);
});

test('finite canary selects CCF plus accepted and rejected Non-CCF tasks', async t => {
  const files = makeWorkspace(t, [
    { journalid: '101', full: 'Computer One', issn: '1111-1111' },
    { journalid: '103', full: 'Computer Four', issn: '6666-6666' },
    { journalid: '102', full: 'Computer Two', issn: '2222-2222' }
  ]);
  const html = {
    500: detail('ccf_missing_partition.html'),
    101: detail('non_ccf_zone1_reordered.html'),
    103: detail('non_ccf_zone4.html')
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
    { journalid: '103', full: 'Computer Four', issn: '6666-6666' }
  ]);
  const html = {
    500: detail('ccf_missing_partition.html'),
    101: detail('non_ccf_zone1_reordered.html'),
    103: detail('non_ccf_zone4.html')
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
    fetchDetailImpl: async journalid => ({ ok: true, body: html[journalid] })
  });
  assert.equal(first.report.attemptedThisRun, 2);
  assert.equal(first.progress.tasks['nonccf:103'].status, 'success');
  assert.equal(first.progress.tasks['nonccf:103'].reason, 'cas_computer_science_zone_1_or_2_or_3');
  assert.equal(first.progress.tasks['nonccf:103'].partitionParserVersion, 2);

  let fetched = false;
  const second = await runBatch({
    ...files,
    offline: true,
    maxJournals: 2,
    delayMs: 0,
    jitterMs: 0,
    fetchDetailImpl: async () => {
      fetched = true;
      throw new Error('fresh current-version rejection must not retry');
    }
  });
  assert.equal(second.report.attemptedThisRun, 0);
  assert.equal(fetched, false);
});

test('retries a successful task once after the detail parser is upgraded', () => {
  const task = { key: 'nonccf:101', isCCF: false };
  const selected = require('./batch_scrape').selectTasksForRun([task], {
    tasks: {
      'nonccf:101': {
        status: 'success',
        identityCheck: { valid: true },
        detailParserVersion: 1,
        updatedAt: new Date().toISOString()
      }
    }
  }, {
    forceRefresh: false,
    refreshDays: 30,
    maxJournals: Infinity
  });
  assert.deepEqual(selected, [task]);
});

test('authenticated runs refresh successful records previously fetched anonymously', () => {
  const task = { key: 'nonccf:101', isCCF: false };
  const progress = {
    tasks: {
      'nonccf:101': {
        status: 'success',
        identityCheck: { valid: true },
        detailParserVersion: 4,
        detailAccessMode: 'anonymous',
        updatedAt: new Date().toISOString()
      }
    }
  };
  const baseConfig = { forceRefresh: false, refreshDays: 30, maxJournals: Infinity };
  assert.deepEqual(
    require('./batch_scrape').selectTasksForRun([task], progress, {
      ...baseConfig,
      detailAccessMode: 'anonymous'
    }),
    []
  );
  assert.deepEqual(
    require('./batch_scrape').selectTasksForRun([task], progress, {
      ...baseConfig,
      detailAccessMode: 'authenticated'
    }),
    [task]
  );
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

  let resolvedAgain = false;
  const repeated = await runBatch({
    ...files,
    offline: true,
    delayMs: 0,
    jitterMs: 0,
    resolveJournalImpl: async () => {
      resolvedAgain = true;
      throw new Error('fresh not_found task must not retry');
    }
  });
  assert.equal(repeated.report.attemptedThisRun, 0);
  assert.equal(resolvedAgain, false);
});
