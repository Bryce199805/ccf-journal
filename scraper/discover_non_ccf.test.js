const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseSearchPage, runDiscovery } = require('./discover_non_ccf');

const fixtures = path.join(__dirname, 'fixtures', 'search');
const fixture = name => fs.readFileSync(path.join(fixtures, name), 'utf8');
const singleScope = [{ id: 'test', sort: 'relevance', order: 'desc' }];

function searchPage(currentPage, totalPages, entries) {
  const rows = entries.map(entry =>
    `<tr><td>${entry.issn}</td><td><a href="index.php?journalid=${entry.id}&page=journalapp&view=detail">${entry.name}</a><font>${entry.name}</font></td></tr>`
  ).join('');
  return `<html><body>当前第${currentPage}页，共${totalPages}页<table>${rows}</table></body></html>`;
}

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
    scopes: singleScope,
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
  assert.deepEqual(first.report.failedPages, ['test:2']);
  assert.equal(fs.existsSync(files.candidatesFile), false);
  assert.equal(JSON.parse(fs.readFileSync(files.partialFile)).length, 2);

  const calls = [];
  const resumed = await runDiscovery({
    ...files,
    scopes: singleScope,
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
    scopes: singleScope,
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

test('bidirectional ISSN scans cover a source larger than its page cap', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ccf-discovery-bidirectional-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const files = {
    candidatesFile: path.join(directory, 'candidates.json'),
    partialFile: path.join(directory, 'partial.json'),
    progressFile: path.join(directory, 'progress.json'),
    reportFile: path.join(directory, 'report.json')
  };
  const pages = {
    asc: {
      1: [['1', '0001-0001'], ['2', '0001-0002']],
      2: [['3', '0001-0003'], ['4', '0001-0004']]
    },
    desc: {
      1: [['6', '0001-0006'], ['5', '0001-0005']],
      2: [['4', '0001-0004'], ['3', '0001-0003']]
    }
  };
  const result = await runDiscovery({
    ...files,
    maxSourcePages: 2,
    delayMs: 0,
    jitterMs: 0,
    retries: 1,
    sleepImpl: async () => {},
    fetchImpl: async url => {
      const parsedURL = new URL(url);
      const order = parsedURL.searchParams.get('searchsortorder');
      const page = Number(parsedURL.searchParams.get('currentsearchpage'));
      const entries = pages[order][page].map(([id, issn]) => ({ id, issn, name: 'Journal ' + id }));
      return { statusCode: 200, body: searchPage(page, 3, entries) };
    }
  });
  assert.equal(result.report.sourceComplete, true);
  assert.equal(result.report.candidateCount, 6);
  assert.equal(result.report.minimumExpected, 5);
  assert.equal(result.report.scopes.issn_asc.scannedPages, 2);
  assert.equal(result.report.scopes.issn_desc.scannedPages, 2);
  assert.equal(new Set(result.candidates.map(entry => entry.journalid)).size, 6);
});

test('rejects a page when LetPub clamps it to a different response page', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ccf-discovery-page-mismatch-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const files = {
    candidatesFile: path.join(directory, 'candidates.json'),
    partialFile: path.join(directory, 'partial.json'),
    progressFile: path.join(directory, 'progress.json'),
    reportFile: path.join(directory, 'report.json')
  };
  const result = await runDiscovery({
    ...files,
    scopes: singleScope,
    delayMs: 0,
    jitterMs: 0,
    retries: 1,
    sleepImpl: async () => {},
    fetchImpl: async url => {
      const requested = Number(new URL(url).searchParams.get('currentsearchpage'));
      const responsePage = requested === 2 ? 1 : requested;
      return {
        statusCode: 200,
        body: searchPage(responsePage, 2, [{ id: String(requested), issn: '0001-000' + requested, name: 'Journal ' + requested }])
      };
    }
  });
  assert.equal(result.report.complete, false);
  assert.deepEqual(result.report.failedPages, ['test:2']);
  assert.equal(result.progress.scopes.test.pages[2].failureType, 'page_mismatch');
  assert.equal(fs.existsSync(files.candidatesFile), false);
});
