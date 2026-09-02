const path = require('path');
const {
  atomicWriteJSON,
  fetchWithRetry,
  jitter,
  readJSON,
  sleep
} = require('./lib/runtime');

const OUTPUT_DIR = path.join(__dirname, 'output');

function decodeHTML(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function discoveryURL(page) {
  const params = new URLSearchParams({
    page: 'journalapp',
    view: 'search',
    searchcategory1: '计算机科学',
    searchsort: 'relevance',
    searchsortorder: 'desc',
    currentsearchpage: String(page)
  });
  return 'https://www.letpub.com.cn/index.php?' + params.toString();
}

function parseSearchPage(html, sourcePage = 1) {
  const pageMatch = String(html || '').match(/当前第\s*\d+\s*页[，,]\s*共\s*(\d+)\s*页/i)
    || String(html || '').match(/共\s*(\d+)\s*页/i);
  const totalPages = pageMatch ? Number(pageMatch[1]) : null;
  const journals = [];
  const rows = String(html || '').match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const link = row.match(/<a\b[^>]*href=["']([^"']*journalid=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const firstCell = row.match(/<td\b[^>]*>([\s\S]*?)<\/td>/i);
    const abbrMatch = row.match(/<font\b[^>]*>([\s\S]*?)<\/font>/i);
    const journalid = String(link[2]);
    const detailUrl = new URL(link[1], 'https://www.letpub.com.cn/').toString();
    journals.push({
      journalid,
      full: decodeHTML(link[3]),
      abbr: decodeHTML(abbrMatch?.[1]) || decodeHTML(link[3]),
      issn: decodeHTML(firstCell?.[1]),
      eissn: '',
      detailUrl,
      sourcePage
    });
  }
  const noResults = /没有找到|暂无结果|0\s*条记录|无符合条件/i.test(decodeHTML(html));
  const structureValid = Boolean(pageMatch || journals.length || noResults);
  return { totalPages: totalPages || 1, journals, noResults, structureValid };
}

function defaultConfig(env = process.env) {
  const requestedMax = env.DISCOVERY_MAX_PAGES ? Number(env.DISCOVERY_MAX_PAGES) : Infinity;
  return {
    candidatesFile: env.DISCOVERY_CANDIDATES_FILE || path.join(OUTPUT_DIR, 'non_ccf_candidates.json'),
    partialFile: env.DISCOVERY_PARTIAL_FILE || path.join(OUTPUT_DIR, 'non_ccf_candidates.partial.json'),
    progressFile: env.DISCOVERY_PROGRESS_FILE || path.join(OUTPUT_DIR, 'discovery_progress.json'),
    reportFile: env.DISCOVERY_REPORT_FILE || path.join(OUTPUT_DIR, 'discovery_report.json'),
    maxPages: Number.isFinite(requestedMax) && requestedMax > 0 ? Math.floor(requestedMax) : Infinity,
    delayMs: Number(env.DISCOVERY_DELAY_MS || 12000),
    jitterMs: Number(env.DISCOVERY_JITTER_MS || 1000),
    timeoutMs: Number(env.DISCOVERY_TIMEOUT_MS || 20000),
    retries: Number(env.DISCOVERY_RETRIES || 3),
    backoffMs: Number(env.DISCOVERY_BACKOFF_MS || env.DISCOVERY_DELAY_MS || 12000)
  };
}

async function runDiscovery(options = {}) {
  const config = { ...defaultConfig(options.env), ...options };
  const now = config.now || (() => new Date().toISOString());
  const sleepImpl = config.sleepImpl || sleep;
  const random = config.random || Math.random;
  const progress = readJSON(config.progressFile, {
    schemaVersion: 1,
    category: '计算机科学',
    totalPages: null,
    pages: {}
  });
  const savedCandidates = readJSON(config.partialFile, readJSON(config.candidatesFile, []));
  const byJournalID = new Map(savedCandidates.map(entry => [String(entry.journalid), entry]));
  let totalPages = progress.totalPages || 1;
  let page = 1;
  let fetchedThisRun = 0;

  while (page <= Math.min(totalPages, config.maxPages)) {
    if (progress.pages[page]?.status === 'success') {
      page += 1;
      continue;
    }
    if (fetchedThisRun > 0) await sleepImpl(jitter(config.delayMs, config.jitterMs, random));
    const url = discoveryURL(page);
    const response = await fetchWithRetry(url, {
      fetchImpl: config.fetchImpl,
      retries: config.retries,
      timeoutMs: config.timeoutMs,
      backoffMs: config.backoffMs,
      jitterMs: config.jitterMs,
      random,
      sleepImpl
    });
    fetchedThisRun += 1;
    if (!response.ok) {
      progress.pages[page] = {
        status: 'failed',
        failureType: response.kind,
        attempts: response.attempts,
        url,
        updatedAt: now()
      };
    } else {
      const parsed = parseSearchPage(response.body, page);
      if (!parsed.structureValid) {
        progress.pages[page] = {
          status: 'failed',
          failureType: 'structure_anomaly',
          attempts: response.attempts,
          url,
          updatedAt: now()
        };
      } else {
        totalPages = parsed.totalPages;
        progress.totalPages = totalPages;
        for (const [journalid, journal] of byJournalID) {
          if (journal.sourcePage === page) byJournalID.delete(journalid);
        }
        for (const journal of parsed.journals) byJournalID.set(journal.journalid, journal);
        progress.pages[page] = {
          status: 'success',
          candidateCount: parsed.journals.length,
          attempts: response.attempts,
          url,
          updatedAt: now()
        };
      }
    }
    atomicWriteJSON(config.progressFile, progress);
    atomicWriteJSON(config.partialFile, [...byJournalID.values()]);
    if (config.onProgress) config.onProgress({
      page,
      totalPages,
      status: progress.pages[page].status,
      candidateCount: byJournalID.size
    });
    page += 1;
  }

  const requestedPages = Math.min(totalPages, config.maxPages);
  const pageEntries = Array.from({ length: requestedPages }, (_, index) => progress.pages[index + 1]);
  const failedPages = pageEntries
    .map((entry, index) => entry?.status === 'failed' ? index + 1 : null)
    .filter(Boolean);
  const successfulPages = pageEntries.filter(entry => entry?.status === 'success').length;
  const complete = successfulPages === requestedPages && failedPages.length === 0;
  const sourceComplete = complete && requestedPages === totalPages;
  const report = {
    schemaVersion: 1,
    category: '计算机科学',
    complete,
    sourceComplete,
    scope: sourceComplete ? 'full' : 'canary',
    totalPages,
    requestedPages,
    successfulPages,
    failedPages,
    candidateCount: byJournalID.size,
    generatedAt: now()
  };
  atomicWriteJSON(config.reportFile, report);
  if (complete) atomicWriteJSON(config.candidatesFile, [...byJournalID.values()]);
  return { candidates: [...byJournalID.values()], progress, report };
}

async function main() {
  const result = await runDiscovery({
    onProgress: event => console.log(
      '[' + event.page + '/' + event.totalPages + '] '
      + event.status + ' candidates=' + event.candidateCount
    )
  });
  console.log(JSON.stringify(result.report));
  if (!result.report.complete) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { defaultConfig, discoveryURL, parseSearchPage, runDiscovery };
