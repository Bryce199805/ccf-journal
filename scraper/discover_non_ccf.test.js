const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseSearchPage, runDiscovery } = require('./discover_non_ccf');

const fixtures = path.join(__dirname, 'fixtures', 'search');
const fixture = name => fs.readFileSync(path.join(fixtures, name), 'utf8');

test('parses dynamic pages, identity fields, detail URL and source page', () => {
  const parsed = parseSearchPage(fixture('page1.html'), 1);
  assert.equal(parsed.totalPages, 2);
  assert.equal(parsed.structureValid, true);
  assert.deepEqual(parsed.journals[0], {
    journalid: '101',
    full: 'Computer One',
    abbr: 'COMP ONE',
    issn: '1111-1111',
    eissn: '',
    detailUrl: 'https://www.letpub.com.cn/index.php?journalid=101&page=journalapp&view=detail',
    sourcePage: 1
  });
});

test('accepts a semantic empty result and rejects an abnormal page', () => {
  assert.equal(parseSearchPage(fixture('empty.html')).structureValid, true);
  assert.equal(parseSearchPage(fixture('empty.html')).journals.length, 0);
  assert.equal(parseSearchPage(fixture('abnormal.html')).structureValid, false);
});

test('checkpoints failed pages, resumes them, deduplicates, and is idempotent', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ccf-discovery-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const files = {
    candidatesFile: path.join(directory, 'candidates.json'),
    partialFile: path.join(directory, 'partial.json'),
    progressFile: path.join(directory, 'progress.json'),
    reportFile: path.join(directory, 'report.json')
  };
  const first = await runDiscovery({
    ...files,
    delayMs: 0,
    jitterMs: 0,
    retries: 1,
    sleepImpl: async () => {},
    fetchImpl: async url => ({
      statusCode: 200,
      body: url.includes('currentsearchpage=2') ? fixture('rate_limited.html') : fixture('page1.html')
    })
  });
  assert.equal(first.report.complete, false);
  assert.deepEqual(first.report.failedPages, [2]);
  assert.equal(fs.existsSync(files.candidatesFile), false);
  assert.equal(JSON.parse(fs.readFileSync(files.partialFile)).length, 2);

  const calls = [];
  const resumed = await runDiscovery({
    ...files,
    delayMs: 0,
    jitterMs: 0,
    retries: 1,
    sleepImpl: async () => {},
    fetchImpl: async url => {
      calls.push(url);
      return { statusCode: 200, body: fixture('page2.html') };
    }
  });
  assert.equal(resumed.report.complete, true);
  assert.equal(resumed.report.sourceComplete, true);
  assert.equal(resumed.candidates.length, 3);
  assert.equal(calls.length, 1);

  let unexpectedFetch = false;
  const repeated = await runDiscovery({
    ...files,
    delayMs: 0,
    jitterMs: 0,
    sleepImpl: async () => {},
    fetchImpl: async () => {
      unexpectedFetch = true;
      throw new Error('must not fetch completed pages');
    }
  });
  assert.equal(repeated.candidates.length, 3);
  assert.equal(unexpectedFetch, false);
});
