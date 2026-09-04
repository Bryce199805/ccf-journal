const path = require('path');
const {
  atomicWriteJSON,
  fetchWithRetry,
  jitter,
  readJSON,
  sleep
} = require('./lib/runtime');

const OUTPUT_DIR = path.join(__dirname, 'output');
const DISCOVERY_STRATEGY = 'issn-bidirectional-v2';
const DEFAULT_SCOPES = [
  { id: 'issn_asc', sort: 'issn', order: 'asc' },
  { id: 'issn_desc', sort: 'issn', order: 'desc' }
];

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

function discoveryURL(page, scope = DEFAULT_SCOPES[0]) {
  const params = new URLSearchParams({
    page: 'journalapp',
    view: 'search',
    searchcategory1: '计算机科学',
    searchsort: scope.sort || 'issn',
    searchsortorder: scope.order || 'asc',
    currentsearchpage: String(page)
  });
  return 'https://www.letpub.com.cn/index.php?' + params.toString();
}

function parseSearchPage(html, sourcePage = 1) {
  const pageMatch = String(html || '').match(/当前第\s*(\d+)\s*页[，,]\s*共\s*(\d+)\s*页/i);
  const fallbackTotal = String(html || '').match(/共\s*(\d+)\s*页/i);
  const currentPage = pageMatch ? Number(pageMatch[1]) : null;
  const totalPages = pageMatch ? Number(pageMatch[2]) : (fallbackTotal ? Number(fallbackTotal[1]) : null);
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
  return { currentPage, totalPages: totalPages || 1, journals, noResults, structureValid };
}

function defaultConfig(env = process.env) {
  const requestedMax = env.DISCOVERY_MAX_PAGES ? Number(env.DISCOVERY_MAX_PAGES) : Infinity;
  return {
    candidatesFile: env.DISCOVERY_CANDIDATES_FILE || path.join(OUTPUT_DIR, 'non_ccf_candidates.json'),
    partialFile: env.DISCOVERY_PARTIAL_FILE || path.join(OUTPUT_DIR, 'non_ccf_candidates.partial.json'),
    progressFile: env.DISCOVERY_PROGRESS_FILE || path.join(OUTPUT_DIR, 'discovery_progress.json'),
    reportFile: env.DISCOVERY_REPORT_FILE || path.join(OUTPUT_DIR, 'discovery_report.json'),
    maxPages: Number.isFinite(requestedMax) && requestedMax > 0 ? Math.floor(requestedMax) : Infinity,
    maxSourcePages: Number(env.DISCOVERY_SOURCE_PAGE_CAP || 50),
    scopes: DEFAULT_SCOPES,
    delayMs: Number(env.DISCOVERY_DELAY_MS || 12000),
    jitterMs: Number(env.DISCOVERY_JITTER_MS || 1000),
    timeoutMs: Number(env.DISCOVERY_TIMEOUT_MS || 20000),
    retries: Number(env.DISCOVERY_RETRIES || 3),
    backoffMs: Number(env.DISCOVERY_BACKOFF_MS || env.DISCOVERY_DELAY_MS || 12000),
    cookie: env.LETPUB_COOKIE || ''
  };
}

function newProgress(scopes, previousSchemaVersion = null) {
  return {
    schemaVersion: 2,
    strategy: DISCOVERY_STRATEGY,
    migratedFromSchemaVersion: previousSchemaVersion,
    category: '计算机科学',
    scopes: Object.fromEntries(scopes.map(scope => [scope.id, { totalPages: null, pageSize: null, pages: {} }]))
  };
}

function deduplicateRows(rows) {
  const byJournalID = new Map();
  for (const row of rows) {
    const id = String(row.journalid || '');
    if (!id) continue;
    const source = { scope: row.sourceScope || '', page: row.sourcePage || null };
    const existing = byJournalID.get(id);
    if (!existing) {
      byJournalID.set(id, { ...row, discoverySources: [source] });
      continue;
    }
    if (!existing.discoverySources.some(item => item.scope === source.scope && item.page === source.page)) {
      existing.discoverySources.push(source);
    }
  }
  return [...byJournalID.values()];
}

function pageSlots(progress, scopes, maxSourcePages) {
  const slots = [];
  for (const scope of scopes) {
    const state = progress.scopes[scope.id];
    const total = Math.min(state.totalPages || 1, maxSourcePages);
    for (let page = 1; page <= total; page += 1) slots.push({ scope, page });
  }
  return slots;
}

async function runDiscovery(options = {}) {
  const config = { ...defaultConfig(options.env), ...options };
  const scopes = config.scopes || DEFAULT_SCOPES;
  const now = config.now || (() => new Date().toISOString());
  const sleepImpl = config.sleepImpl || sleep;
  const random = config.random || Math.random;
  const previous = readJSON(config.progressFile, null);
  const reusable = previous?.schemaVersion === 2 && previous?.strategy === DISCOVERY_STRATEGY;
  const progress = reusable ? previous : newProgress(scopes, previous?.schemaVersion ?? null);
  for (const scope of scopes) {
    if (!progress.scopes[scope.id]) progress.scopes[scope.id] = { totalPages: null, pageSize: null, pages: {} };
  }
  let rows = reusable ? readJSON(config.partialFile, []) : [];
  let fetchedThisRun = 0;
  let visitedSlots = 0;

  for (const scope of scopes) {
    const scopeState = progress.scopes[scope.id];
    let page = 1;
    let targetPages = Math.min(scopeState.totalPages || 1, config.maxSourcePages);
    while (page <= targetPages && visitedSlots < config.maxPages) {
      visitedSlots += 1;
      const saved = scopeState.pages[page];
      if (saved?.status === 'success') {
        page += 1;
        continue;
      }
      if (fetchedThisRun > 0) await sleepImpl(jitter(config.delayMs, config.jitterMs, random));
      const url = discoveryURL(page, scope);
      const response = await fetchWithRetry(url, {
        fetchImpl: config.fetchImpl,
        retries: config.retries,
        timeoutMs: config.timeoutMs,
        backoffMs: config.backoffMs,
        jitterMs: config.jitterMs,
        random,
        sleepImpl,
        cookie: config.cookie
      });
      fetchedThisRun += 1;
      if (!response.ok) {
        scopeState.pages[page] = {
          status: 'failed', failureType: response.kind, error: response.error || null,
          attempts: response.attempts, url, updatedAt: now()
        };
      } else {
        const parsed = parseSearchPage(response.body, page);
        const fingerprint = parsed.journals.map(entry => entry.journalid).join(',');
        const duplicatePage = Object.entries(scopeState.pages).find(([otherPage, entry]) =>
          Number(otherPage) !== page && fingerprint && entry.status === 'success' && entry.fingerprint === fingerprint
        );
        let failureType = null;
        if (!parsed.structureValid) failureType = 'structure_anomaly';
        else if (parsed.currentPage != null && parsed.currentPage !== page) failureType = 'page_mismatch';
        else if (duplicatePage) failureType = 'duplicate_page';
        if (failureType) {
          scopeState.pages[page] = {
            status: 'failed', failureType, responsePage: parsed.currentPage,
            duplicateOf: duplicatePage ? Number(duplicatePage[0]) : null,
            attempts: response.attempts, url, updatedAt: now()
          };
        } else {
          scopeState.totalPages = parsed.totalPages;
          scopeState.pageSize = Math.max(scopeState.pageSize || 0, parsed.journals.length);
          targetPages = Math.min(parsed.totalPages, config.maxSourcePages);
          rows = rows.filter(entry => !(entry.sourceScope === scope.id && entry.sourcePage === page));
          rows.push(...parsed.journals.map(entry => ({ ...entry, sourceScope: scope.id })));
          scopeState.pages[page] = {
            status: 'success', candidateCount: parsed.journals.length, fingerprint,
            responsePage: parsed.currentPage, attempts: response.attempts, url, updatedAt: now()
          };
        }
      }
      atomicWriteJSON(config.progressFile, progress);
      atomicWriteJSON(config.partialFile, rows);
      const candidates = deduplicateRows(rows);
      if (config.onProgress) config.onProgress({
        scope: scope.id,
        page,
        totalPages: targetPages,
        status: scopeState.pages[page].status,
        candidateCount: candidates.length
      });
      page += 1;
    }
    if (visitedSlots >= config.maxPages) break;
  }

  const allSlots = pageSlots(progress, scopes, config.maxSourcePages);
  const requestedSlots = Number.isFinite(config.maxPages) ? allSlots.slice(0, config.maxPages) : allSlots;
  const failedPages = requestedSlots
    .filter(({ scope, page }) => progress.scopes[scope.id].pages[page]?.status === 'failed')
    .map(({ scope, page }) => scope.id + ':' + page);
  const successfulPages = requestedSlots.filter(({ scope, page }) =>
    progress.scopes[scope.id].pages[page]?.status === 'success'
  ).length;
  const requestedComplete = requestedSlots.length > 0
    && successfulPages === requestedSlots.length
    && failedPages.length === 0;
  const scopesKnown = scopes.every(scope => Number.isFinite(progress.scopes[scope.id].totalPages));
  const scopeTotals = scopes.map(scope => progress.scopes[scope.id].totalPages).filter(Number.isFinite);
  const totalsAgree = scopeTotals.length > 0 && new Set(scopeTotals).size === 1;
  const sourceTotalPages = totalsAgree ? scopeTotals[0] : null;
  const sourceScanComplete = scopesKnown && allSlots.every(({ scope, page }) =>
    progress.scopes[scope.id].pages[page]?.status === 'success'
  );
  const candidates = deduplicateRows(rows);
  const pageSize = Math.max(...scopes.map(scope => progress.scopes[scope.id].pageSize || 0), 0);
  const minimumExpected = sourceTotalPages && pageSize
    ? ((sourceTotalPages - 1) * pageSize) + 1
    : null;
  const fitsBidirectionalWindow = sourceTotalPages != null
    && sourceTotalPages <= config.maxSourcePages * scopes.length;
  const coverageComplete = sourceTotalPages != null
    && (sourceTotalPages <= config.maxSourcePages || (fitsBidirectionalWindow && candidates.length >= minimumExpected));
  const sourceComplete = sourceScanComplete && totalsAgree && coverageComplete;
  const complete = requestedComplete && (Number.isFinite(config.maxPages) || sourceComplete);
  const report = {
    schemaVersion: 2,
    strategy: DISCOVERY_STRATEGY,
    category: '计算机科学',
    complete,
    sourceComplete,
    scope: sourceComplete ? 'full' : 'canary',
    sourceTotalPages,
    sourcePageCap: config.maxSourcePages,
    requestedPages: requestedSlots.length,
    successfulPages,
    failedPages,
    candidateCount: candidates.length,
    minimumExpected,
    totalsAgree,
    coverageComplete,
    scopes: Object.fromEntries(scopes.map(scope => [scope.id, {
      totalPages: progress.scopes[scope.id].totalPages,
      scannedPages: Object.values(progress.scopes[scope.id].pages).filter(page => page.status === 'success').length
    }])),
    generatedAt: now()
  };
  atomicWriteJSON(config.reportFile, report);
  if (complete) atomicWriteJSON(config.candidatesFile, candidates);
  return { candidates, progress, report };
}

async function main() {
  const result = await runDiscovery({
    onProgress: event => console.log(
      '[' + event.scope + ' ' + event.page + '/' + event.totalPages + '] '
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

module.exports = {
  DEFAULT_SCOPES,
  DISCOVERY_STRATEGY,
  deduplicateRows,
  defaultConfig,
  discoveryURL,
  parseSearchPage,
  runDiscovery
};
