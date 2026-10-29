#!/usr/bin/env node
'use strict';

// Authenticated, isolated audit runner. It never writes the published dataset or
// the normal scraper progress/staging files.
const fs = require('fs');
const path = require('path');
const { runBatch, buildTasks, hydrateKnownIdentity } = require('./batch_scrape');
const { main: authCanary } = require('./auth_canary');
const { requestHTML, isRateLimitedHTML } = require('./lib/runtime');
const { DETAIL_PARSER_VERSION, parseDetailHTML, strip } = require('./lib/letpub_parser');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'output');
const COOKIE_FILE = '/tmp/ccf-letpub-audit-session.cookie';
const PUBLISHED = path.join(ROOT, 'data', 'letpub_full.json');
const BASELINE = '/tmp/ccf-zone3-baseline.json';
const CCF_SOURCE = path.join(ROOT, 'data', 'all_journals_correct.json');
const DIFF = path.join(OUT, 'ccf_catalog_diff.json');
const CATALOG_AUDIT = path.join(OUT, 'audit_catalog_identities.json');
const CANDIDATES = path.join(OUT, 'non_ccf_candidates.json');
const AUDIT_STAGE = path.join(OUT, 'audit.staging.json');
const METRICS = path.join(OUT, 'data_audit_metrics.json');
const AUDIT_PROGRESS = path.join(OUT, 'data_audit.progress.json');
const AUDIT_REPORT = path.join(OUT, 'data_audit_report.json');
const AUDIT_BATCH_REPORT = path.join(OUT, 'data_audit_batch_report.json');
const AUDIT_DIFF = path.join(OUT, 'data_audit.diff.json');
const AUDIT_CONFLICTS = path.join(OUT, 'data_audit_identity_conflicts.json');
const AUDIT_QUARANTINE = path.join(OUT, 'data_audit_identity_quarantine.json');
const AUDIT_MANIFEST = path.join(OUT, 'data_audit_manifest.json');
const LAST_REQUEST = path.join(OUT, 'data_audit_last_request.json');
const AUDIT_EVIDENCE = path.join(OUT, 'data_audit_evidence.json');
const AUDIT_CCF_SOURCE = path.join(OUT, 'data_audit_ccf_source.json');
const AUDIT_CANDIDATES = path.join(OUT, 'data_audit_candidates.json');
const AUTHED_CANARY = path.join(OUT, 'data_audit_canary.json');
const OLD_CCF_TITLES = path.join(OUT, 'data_audit_old_ccf_titles.json');
const MIN_DELAY_MS = 12000;
const AUTH_RETRY_DELAYS_MS = [30000, 60000];

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJSON(file, value) {
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
}
function norm(value) { return String(value || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ''); }

function readAuditEvidence(file = AUDIT_EVIDENCE) {
  return fs.existsSync(file) ? readJSON(file) : [];
}

function persistAuditEvidence(record, file = AUDIT_EVIDENCE) {
  const evidence = readAuditEvidence(file);
  const enriched = { capturedAt: new Date().toISOString(), ...record };
  const { createHash } = require('crypto');
  enriched.evidenceId = createHash('sha256').update(JSON.stringify([
    enriched.capturedAt, enriched.journalid || '', enriched.urlType || '', enriched.phase || ''
  ])).digest('hex');
  evidence.push(enriched);
  writeJSON(file, evidence);
  return enriched;
}

function createEvidenceRecorder({ file = AUDIT_EVIDENCE, scopeKey = '', sessionId = '', testOnly = false } = {}) {
  return record => persistAuditEvidence({ ...record, scopeKey,
    detailParserVersion: DETAIL_PARSER_VERSION, sessionId, testOnly }, file);
}

function readScopedEvidence(scopeKey, file = AUDIT_EVIDENCE) {
  const all = readAuditEvidence(file);
  const successfulSessions = new Set(all.filter(row => row.urlType === 'auth'
    && row.authenticated === true && row.scopeKey === scopeKey
    && row.detailParserVersion === DETAIL_PARSER_VERSION && row.testOnly !== true)
    .map(row => row.sessionId));
  return all.filter(row => row.scopeKey === scopeKey
    && row.detailParserVersion === DETAIL_PARSER_VERSION && row.testOnly !== true
    && successfulSessions.has(row.sessionId));
}

function appendReportRun(file, record) {
  const existing = fs.existsSync(file) ? readJSON(file) : null;
  const runs = Array.isArray(existing?.runs) ? existing.runs : existing ? [existing] : [];
  runs.push(record);
  writeJSON(file, { schemaVersion: 1, runs });
  return record;
}

function latestReportRun(file) {
  const document = readJSON(file);
  return Array.isArray(document.runs) ? document.runs.at(-1) : document;
}

function ensureAuditStage(stageFile, manifestFile, initialEntries, manifest) {
  if (fs.existsSync(stageFile) || fs.existsSync(manifestFile)) {
    if (!fs.existsSync(stageFile) || !fs.existsSync(manifestFile)) {
      throw new Error('Audit staging/manifest pair is incomplete; refusing to overwrite resumable state.');
    }
    if (readJSON(manifestFile).scopeKey !== manifest.scopeKey) {
      throw new Error('Audit scope changed since staging was initialized; preserve current progress and review the diff.');
    }
    return 'preserved';
  }
  writeJSON(stageFile, initialEntries);
  writeJSON(manifestFile, manifest);
  return 'initialized';
}

function readFrozenAuditInputs({ manifestFile, stageFile, ccfFile, candidatesFile, baselineCount }) {
  for (const file of [manifestFile, stageFile, ccfFile, candidatesFile]) {
    if (!fs.existsSync(file)) throw new Error('Frozen audit scope is incomplete; refusing to rebuild or expand it.');
  }
  const manifest = readJSON(manifestFile);
  const ccfSource = readJSON(ccfFile);
  const candidates = readJSON(candidatesFile);
  const { createHash } = require('crypto');
  const scopeKey = createHash('sha256').update(JSON.stringify({
    ccf: ccfSource, candidates, baselineCount
  })).digest('hex');
  if (!manifest.scopeKey || scopeKey !== manifest.scopeKey) {
    throw new Error('Frozen audit scope checksum mismatch; refusing to resume with changed inputs.');
  }
  return { manifest, ccfSource, candidates, stage: readJSON(stageFile), scopeKey };
}

function buildAuditScope() {
  const published = readJSON(PUBLISHED);
  const baseline = readJSON(BASELINE);
  const oldIDs = new Set(baseline.map(row => String(row.journalid || '')).filter(Boolean));
  const addedNonCCF = published.filter(row => row.isCCF === false && row.journalid && !oldIDs.has(String(row.journalid)));
  if (fs.existsSync(AUDIT_MANIFEST)) {
    const frozen = readFrozenAuditInputs({ manifestFile: AUDIT_MANIFEST, stageFile: AUDIT_STAGE,
      ccfFile: AUDIT_CCF_SOURCE, candidatesFile: AUDIT_CANDIDATES, baselineCount: baseline.length });
    const relations = Object.values(frozen.ccfSource).flat();
    return { published, baseline, addedNonCCF, relations, trueNewTitleCount: frozen.manifest.trueNewTitleCount,
      rawAddedTitleCount: frozen.manifest.rawAddedTitleCount, continuationCount: frozen.manifest.continuationCount,
      placeholderCount: frozen.manifest.placeholderCount, ccfSource: frozen.ccfSource,
      candidates: frozen.candidates, stage: frozen.stage, scopeKey: frozen.scopeKey };
  }
  const source = readJSON(CCF_SOURCE);
  const catalogAudit = readJSON(CATALOG_AUDIT);
  const trueAdded = new Set(catalogAudit.newCCF131MachineAudit.records.map(row => norm(row.title)));
  const rawAdded = new Set(readJSON(DIFF).added.map(row => norm(row.full)));
  const continuations = new Set(catalogAudit.continuations.items.map(row => norm(row.officialFull)));
  const newRelations = [];
  const allRelations = [];
  for (const [domain, entries] of Object.entries(source)) {
    for (const entry of entries) {
      const relation = { ...entry, domain };
      allRelations.push(relation);
      if (rawAdded.has(norm(entry.full)) || continuations.has(norm(entry.full))) newRelations.push(relation);
    }
  }
  const placeholderTitles = new Set(published.filter(row => row.isCCF && !row.journalid)
    .flatMap(row => [row.ccfFull, ...(row.ccfRelations || []).map(r => r.full)]).map(norm));
  const scopeRelations = [...new Map([...newRelations,
    ...allRelations.filter(r => placeholderTitles.has(norm(r.full)))
  ].map(r => [`${norm(r.full)}|${norm(r.abbr)}|${r.domain}|${r.level}`, r])).values()];
  const scopeNames = new Set(scopeRelations.map(row => norm(row.full)));
  const auditCCF = Object.fromEntries(Object.entries(source).map(([domain, entries]) => [domain,
    entries.filter(row => scopeNames.has(norm(row.full)))
  ]).filter(([, entries]) => entries.length));
  const auditCandidates = readJSON(CANDIDATES).filter(candidate => addedNonCCF.some(row => String(row.journalid) === String(candidate.journalid)));
  const scopeEntries = published.filter(row => row.isCCF === false && addedNonCCF.some(n => String(n.journalid) === String(row.journalid))
    || row.isCCF === true && (!row.journalid || (row.ccfRelations || [{ full: row.ccfFull }]).some(r => scopeNames.has(norm(r.full)))));
  const { createHash } = require('crypto');
  const scopeKey = createHash('sha256').update(JSON.stringify({ ccf: auditCCF,
    candidates: auditCandidates, baselineCount: baseline.length })).digest('hex');
  const manifest = { schemaVersion: 1, scopeKey, trueNewTitleCount: trueAdded.size,
    rawAddedTitleCount: rawAdded.size, continuationCount: continuations.size,
    placeholderCount: placeholderTitles.size, addedNonCCFCount: addedNonCCF.length,
    stageRecordCount: scopeEntries.length };
  ensureAuditStage(AUDIT_STAGE, AUDIT_MANIFEST, scopeEntries, manifest);
  writeJSON(AUDIT_CCF_SOURCE, auditCCF);
  writeJSON(AUDIT_CANDIDATES, auditCandidates);
  return { published, baseline, addedNonCCF, relations: scopeRelations, trueNewTitleCount: trueAdded.size,
    rawAddedTitleCount: rawAdded.size,
    continuationCount: continuations.size, placeholderCount: placeholderTitles.size,
    ccfSource: auditCCF,
    candidates: auditCandidates, stage: scopeEntries };
}

function readCookieFile(file = COOKIE_FILE) {
  const cookie = fs.readFileSync(file, 'utf8').trim();
  if (!cookie || /[\r\n]/.test(cookie)) throw new Error('Audit cookie is missing or malformed.');
  return cookie;
}

function getCookie({ fileOnly = false } = {}) {
  if (!fileOnly && process.env.LETPUB_COOKIE) {
    const cookie = process.env.LETPUB_COOKIE.trim();
    if (!cookie || /[\r\n]/.test(cookie)) throw new Error('Audit cookie is missing or malformed.');
    return cookie;
  }
  return readCookieFile();
}

function cookieFileMtime(file = COOKIE_FILE) {
  return fs.statSync(file).mtimeMs;
}

async function waitForCookieUpdate(previousMtimeMs, options = {}) {
  const file = options.file || COOKIE_FILE;
  const intervalMs = options.intervalMs ?? 5000;
  const statImpl = options.statImpl || (target => fs.statSync(target));
  const readImpl = options.readImpl || readCookieFile;
  const sleepImpl = options.sleepImpl || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  while (true) {
    const stat = statImpl(file);
    if (stat && stat.mtimeMs !== previousMtimeMs) return readImpl(file);
    await sleepImpl(intervalMs);
  }
}

function authNetworkErrorKind(error) {
  const codes = new Set(['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND']);
  let current = error;
  for (let depth = 0; current && depth < 4; depth += 1, current = current.cause) {
    const code = String(current.code || '').toUpperCase();
    if (codes.has(code)) return code.toLowerCase();
    if (/time\s*out|timed\s*out/i.test(String(current.message || ''))) return 'timeout';
  }
  return '';
}

async function runAuthWithRetry(authAttempt, { sleepImpl = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onRetry = record => console.log(JSON.stringify(record)) } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await authAttempt();
    } catch (error) {
      const reason = authNetworkErrorKind(error);
      if (!reason) throw error;
      const delayMs = AUTH_RETRY_DELAYS_MS[attempt - 1];
      if (delayMs === undefined) {
        onRetry({ phase: 'auth_retry_exhausted', attempt, maxAttempts: AUTH_RETRY_DELAYS_MS.length + 1, reason });
        throw error;
      }
      onRetry({ phase: 'auth_retry', attempt, nextAttempt: attempt + 1,
        maxAttempts: AUTH_RETRY_DELAYS_MS.length + 1, reason, delayMs });
      await sleepImpl(delayMs);
    }
  }
}

async function requireAuth(cookie, sessionId) {
  return runAuthWithRetry(() => requireAuthAttempt(cookie, sessionId));
}

async function requireAuthAttempt(cookie, sessionId) {
  await waitForThrottle();
  const scopeKey = fs.existsSync(AUDIT_MANIFEST) ? readJSON(AUDIT_MANIFEST).scopeKey : '';
  const recordEvidence = createEvidenceRecorder({ scopeKey, sessionId });
  const before = process.exitCode;
  process.exitCode = 0;
  const startedAt = new Date().toISOString();
  writeJSON(LAST_REQUEST, { startedAt, journalid: '3567', urlType: 'detail', phase: 'auth' });
  let report;
  let requestError = null;
  try {
    report = await authCanary({ ...process.env, LETPUB_COOKIE: cookie,
      LETPUB_AUTH_CANARY_JOURNALID: '3567',
      LETPUB_AUTH_CANARY_TIMEOUT_MS: process.env.LETPUB_AUTH_CANARY_TIMEOUT_MS || '60000' });
  } catch (error) {
    requestError = error;
  }
  const capturedAt = new Date().toISOString();
  const saved = recordEvidence({ journalid: '3567',
    url: 'https://www.letpub.com.cn/index.php?journalid=3567&page=journalapp&view=detail',
    urlType: 'auth', phase: 'auth', startedAt, capturedAt,
    responseStatus: report?.statusCode ?? null,
    authInspection: report ? {
      structureValid: report.structureValid,
      rateLimited: report.rateLimited,
      loginPage: report.loginPage,
      loginFormPresent: report.loginFormPresent,
      hasJournalDetailContent: report.hasJournalDetailContent,
      loginGateVisible: report.loginGateVisible,
      wosSectionPresent: report.wosSectionPresent,
      wosStatus: report.wosStatus,
      wosReason: report.wosReason,
      wosScienceEvidence: report.wosScienceEvidence,
      authStatus: report.authStatus,
      authenticatedContentAvailable: report.authenticatedContentAvailable
    } : null,
    authenticated: report?.authStatus === 'authenticated',
    requestFailure: requestError ? { reason: 'network_error', networkKind: authNetworkErrorKind(requestError) || 'other' } : null
  });
  writeJSON(LAST_REQUEST, { startedAt, completedAt: capturedAt, journalid: '3567', urlType: 'detail', phase: 'auth' });
  const code = process.exitCode || 0;
  process.exitCode = before || 0;
  if (requestError || code !== 0) {
    appendReportRun(AUDIT_REPORT, { generatedAt: new Date().toISOString(), phase: 'auth_checkpoint',
      sessionId, authStatus: report?.authStatus || 'network_error',
      authenticated: report?.authStatus === 'authenticated', evidenceId: saved.evidenceId,
      failure: requestError ? { reason: 'network_error', networkKind: authNetworkErrorKind(requestError) || 'other' }
        : { reason: report?.authStatus || 'request_or_structure_error', statusCode: report?.statusCode || null } });
  }
  if (requestError) throw requestError;
  if (code === 2) {
    const error = new Error('3567 returned explicit login-page/login-gate evidence; no detail batch was started.');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }
  if (code === 3) throw new Error('3567 authentication is unknown: usable WOS data was not visible; no detail batch was started.');
  if (code !== 0) throw new Error('3567 request or page structure failed; authentication was not determined and no detail batch was started.');
  return saved;
}

async function waitForThrottle() {
  if (!fs.existsSync(LAST_REQUEST)) return;
  const last = readJSON(LAST_REQUEST);
  const lastStart = Date.parse(last.startedAt || last.completedAt || '');
  if (!Number.isFinite(lastStart)) return;
  const remaining = MIN_DELAY_MS - (Date.now() - lastStart);
  if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
}

function evidenceWrapper(cookie, sink, authStatus, options = {}) {
  const requestImpl = options.requestImpl || requestHTML;
  const scopeKey = options.scopeKey || (fs.existsSync(AUDIT_MANIFEST) ? readJSON(AUDIT_MANIFEST).scopeKey : '');
  const recordEvidence = options.recordEvidence || createEvidenceRecorder({ scopeKey, sessionId: options.sessionId || '' });
  const recordLastRequest = options.recordLastRequest || (value => writeJSON(LAST_REQUEST, value));
  const throttle = options.throttle || waitForThrottle;
  return async (url, options = {}) => {
    const parsedURL = new URL(url);
    const isDetail = /[?&]view=detail(?:&|$)/i.test(url);
    await throttle();
    const startedAt = new Date().toISOString();
    recordLastRequest({ startedAt, journalid: parsedURL.searchParams.get('journalid') || '',
      urlType: isDetail ? 'detail' : 'search', phase: 'request' });
    let response;
    try {
      response = await requestImpl(url, { ...options, cookie });
    } catch (error) {
      const capturedAt = new Date().toISOString();
      const failure = { reason: 'network_error', message: error.message };
      const saved = recordEvidence({ journalid: parsedURL.searchParams.get('journalid') || '',
        url, urlType: isDetail ? 'detail' : 'search', startedAt, capturedAt, responseStatus: null,
        requestFailure: failure });
      sink.push(saved);
      authStatus.failure = { ...failure, retryable: true, url,
        journalid: parsedURL.searchParams.get('journalid') || '', urlType: isDetail ? 'detail' : 'search' };
      recordLastRequest({ startedAt, completedAt: capturedAt, journalid: authStatus.failure.journalid,
        urlType: authStatus.failure.urlType, failure: 'network_error' });
      throw error;
    }
    const capturedAt = new Date().toISOString();
    const inspected = require('./auth_canary').inspectAuthenticatedPage(response.body);
    const isRateLimited = isRateLimitedHTML(response.body);
    let reason = '';
    if (inspected.loginPage || inspected.loginGateVisible) reason = 'login_gate';
    else if (isRateLimited || inspected.rateLimited) reason = 'rate_limited';
    else if (response.statusCode >= 500 && response.statusCode < 600) reason = 'server_error';
    else if (response.statusCode >= 400) reason = 'http_error';
    else if (isDetail && !inspected.structureValid) reason = 'detail_structure_error';

    if (reason) {
      const failure = { reason, statusCode: response.statusCode,
        loginPage: inspected.loginPage, loginGateVisible: inspected.loginGateVisible,
        detailStructureValid: isDetail ? inspected.structureValid : undefined,
        retryable: reason === 'server_error',
        haltBatch: ['login_gate','rate_limited','detail_structure_error'].includes(reason), url };
      const saved = recordEvidence({ journalid: parsedURL.searchParams.get('journalid') || '',
        url, urlType: isDetail ? 'detail' : 'search', startedAt, capturedAt,
        responseStatus: response.statusCode, requestFailure: failure });
      sink.push(saved);
      authStatus.failure = { ...failure, journalid: parsedURL.searchParams.get('journalid') || '',
        urlType: isDetail ? 'detail' : 'search' };
      recordLastRequest({ startedAt, completedAt: capturedAt, journalid: authStatus.failure.journalid,
        urlType: authStatus.failure.urlType, failure: reason });
      // Keep the response body for diagnostics in memory, but ensure the batch
      // parser cannot accept a login or malformed detail page as journal data.
      return { ...response, statusCode: response.statusCode >= 400 ? response.statusCode : 401,
        retryable: failure.retryable,
        terminalKind: failure.retryable ? '' : reason };
    }
    // Clear only a transient failure for this exact URL after a valid response.
    if (authStatus.failure?.retryable && authStatus.failure.url === url) authStatus.failure = null;
    recordLastRequest({ startedAt, completedAt: capturedAt,
      journalid: parsedURL.searchParams.get('journalid') || '', urlType: isDetail ? 'detail' : 'search' });
    if (!isDetail) {
      const saved = recordEvidence({ journalid: parsedURL.searchParams.get('journalid') || '',
        url, urlType: 'search', startedAt, capturedAt, responseStatus: response.statusCode,
        authObservation: { authStatus: inspected.authStatus, loginPage: inspected.loginPage,
          loginGateVisible: inspected.loginGateVisible, wosStatus: inspected.wosStatus } });
      sink.push(saved);
      return response;
    }

    let parsed;
    let parseError = null;
    try {
      parsed = parseDetailHTML(parsedURL.searchParams.get('journalid'), response.body);
    } catch (error) {
      parseError = { name: error.name, code: error.code || '', message: error.message };
    }
    const labels = ['5年影响因子', '五年影响因子', '五年IF', '影响因子', 'CiteScore', 'H-index', '中科院', 'WOS', 'JCR'];
    const scientificHTML = String(response.body || '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ');
    const plain = strip(scientificHTML);
    const snippets = [];
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rowRE = new RegExp(`<tr\\b[^>]*>(?:(?!<tr\\b)[\\s\\S]){0,1800}${escaped}(?:(?!<tr\\b)[\\s\\S]){0,1800}<\\/tr\\s*>`, 'i');
      const match = rowRE.exec(scientificHTML);
      if (match) snippets.push({ label, rowText: strip(match[0]).slice(0, 700) });
      else {
        const at = plain.toLowerCase().indexOf(label.toLowerCase());
        if (at >= 0) snippets.push({ label, text: plain.slice(Math.max(0, at - 70), Math.min(plain.length, at + 190)) });
      }
    }
    const saved = recordEvidence({ journalid: String(parsed?.journalid || parsedURL.searchParams.get('journalid') || ''),
      url, urlType: 'detail', startedAt, capturedAt, responseStatus: response.statusCode,
      authObservation: { authStatus: inspected.authStatus, loginPage: inspected.loginPage,
        loginGateVisible: inspected.loginGateVisible, wosStatus: inspected.wosStatus },
      parsed: parsed ? Object.fromEntries(['name','issn','eissn','impactFactor','realtimeIF','fiveYearIF','citeScore','hIndex','articleCount','latestCASYear','latestCAS','wosZone','wosStatus','jif','jci','citeScoreRankings'].map(k => [k, parsed[k] ?? null])) : null,
      parseError, labelSnippets: snippets });
    sink.push(saved);
    return response;
  };
}

function chooseCanary(scope) {
  const taskRows = buildTasks(scope.ccfSource,
    scope.candidates.map(c => ({ ...c })), readJSON(path.join(ROOT, 'data', 'all_letpub_data.json')),
    readJSON(path.join(__dirname, 'ccf_title_aliases.json')).aliases,
    readJSON(path.join(__dirname, 'ccf_identity_hints.json')).items);
  const trueNewTitles = new Set(readJSON(CATALOG_AUDIT).newCCF131MachineAudit.records.map(row => norm(row.title)));
  const hydrated = taskRows.map(task => hydrateKnownIdentity(task, scope.stage));
  const ccfTask = hydrated.find(task => task.isCCF && trueNewTitles.has(norm(task.full)) && task.journalid
    && scope.stage.some(row => row.isCCF && String(row.journalid || '') === String(task.journalid)
      && row.letpubUrl && row.letpubMatchStatus === 'verified'
      && (row.ccfRelations || []).some(relation => norm(relation.full) === norm(task.full))));
  const nonTask = hydrated.find(task => !task.isCCF
    && scope.addedNonCCF.some(row => String(row.journalid) === String(task.journalid)));
  if (!ccfTask || !nonTask) throw new Error('Could not identify one matched new CCF and one new NonCCF canary.');
  return { ccf: ccfTask.key, nonccf: nonTask.key, taskRows: hydrated };
}

function batchConfig(scope, cookie, forceTaskKeys, evidence, authStatus, sessionId) {
  const scopeKey = scope.scopeKey || (fs.existsSync(AUDIT_MANIFEST) ? readJSON(AUDIT_MANIFEST).scopeKey : '');
  return {
    ccfFile: AUDIT_CCF_SOURCE, candidatesFile: AUDIT_CANDIDATES,
    baselineFile: BASELINE, stagingFile: AUDIT_STAGE, progressFile: AUDIT_PROGRESS,
    reportFile: AUDIT_BATCH_REPORT, conflictFile: AUDIT_CONFLICTS,
    identityQuarantineFile: AUDIT_QUARANTINE,
    ccfOnly: false, nonCcfOnly: false, refreshDays: 3650, forceRefresh: false,
    detailAccessMode: 'authenticated', cookie, delayMs: MIN_DELAY_MS, jitterMs: 0,
    timeoutMs: 25000, retries: 3, backoffMs: MIN_DELAY_MS,
    maxJournals: Infinity, forceTaskKeys,
    fetchImpl: evidenceWrapper(cookie, evidence, authStatus, { scopeKey, sessionId }),
    onProgress: event => {
      console.log(JSON.stringify({ phase: 'audit_progress', ...event }));
      if (authStatus.failure?.haltBatch) {
        const failureRun = { generatedAt: new Date().toISOString(), phase: 'batch_checkpoint',
          haltedForAuth: authStatus.failure.reason === 'login_gate',
          haltedReason: authStatus.failure.reason,
          requestFailure: authStatus.failure, lastCheckpoint: event,
          cumulativeEvidenceCount: readAuditEvidence().length };
        appendReportRun(AUDIT_REPORT, failureRun);
        const error = new Error(`Audit stopped after checkpoint: ${authStatus.failure.reason}.`);
        if (authStatus.failure.reason === 'login_gate') error.code = 'AUTH_REQUIRED';
        throw error;
      }
      if (authStatus.failure && !authStatus.failure.haltBatch && !authStatus.failure.reportedAtProgress) {
        appendReportRun(AUDIT_REPORT, { generatedAt: new Date().toISOString(), phase: 'task_request_failure',
          sessionId, requestFailure: { reason: authStatus.failure.reason, statusCode: authStatus.failure.statusCode,
            journalid: authStatus.failure.journalid, urlType: authStatus.failure.urlType }, lastCheckpoint: event });
        authStatus.failure.reportedAtProgress = true;
      }
    }
  };
}

async function runCanary(scope, cookie, sessionId) {
  const chosen = chooseCanary(scope);
  const evidence = [];
  const authStatus = { failure: null };
  const result = await runBatch({ ...batchConfig(scope, cookie, [chosen.ccf, chosen.nonccf], evidence, authStatus, sessionId), maxJournals: 2 });
  const ccfState = result.progress.tasks[chosen.ccf];
  const nonState = result.progress.tasks[chosen.nonccf];
  const ccfEntry = result.results.find(row => String(row.journalid || '') === String(ccfState?.journalid || ''));
  const nonEntry = result.results.find(row => String(row.journalid || '') === String(nonState?.journalid || ''));
  const detailEvidence = evidence.filter(row => row.urlType === 'detail' && row.parsed);
  const passed = !authStatus.failure && result.report.attemptedThisRun === 2
    && ccfState?.status === 'success' && ccfState.identityCheck?.valid === true
    && nonState?.status === 'success' && nonState.identityCheck?.valid === true
    && ccfState.detailAccessMode === 'authenticated' && nonState.detailAccessMode === 'authenticated'
    && detailEvidence.some(row => row.journalid === String(ccfState?.journalid || ''))
    && detailEvidence.some(row => row.journalid === String(nonState?.journalid || ''));
  const report = { generatedAt: new Date().toISOString(), sessionId, passed,
    scopeKey: readJSON(AUDIT_MANIFEST).scopeKey, detailParserVersion: DETAIL_PARSER_VERSION,
    selectedTaskKeys: [chosen.ccf, chosen.nonccf],
    ccf: { journalid: ccfState?.journalid || '', name: ccfEntry?.name || '', status: ccfState?.status || '', identityValid: ccfState?.identityCheck?.valid === true },
    nonCCF: { journalid: nonState?.journalid || '', name: nonEntry?.name || '', status: nonState?.status || '', identityValid: nonState?.identityCheck?.valid === true },
    evidence: detailEvidence, evidenceFile: AUDIT_EVIDENCE,
    cumulativeEvidenceCount: readScopedEvidence(readJSON(AUDIT_MANIFEST).scopeKey).length };
  appendReportRun(AUTHED_CANARY, report);
  if (!passed) throw new Error('Authenticated CCF/NonCCF data canary failed; see data_audit_canary.json.');
  return report;
}

async function runFull(scope, cookie, sessionId, { authContextValidated = false } = {}) {
  if (!fs.existsSync(AUTHED_CANARY)) throw new Error('A passing authenticated canary is required before --run.');
  const canary = latestReportRun(AUTHED_CANARY);
  if (!canary.passed || Date.now() - Date.parse(canary.generatedAt) > 24 * 60 * 60 * 1000) {
    throw new Error('A passing authenticated canary from the last 24 hours is required.');
  }
  if (!authContextValidated) await requireAuth(cookie, sessionId);
  // The auth-only page and the first detail request must also respect the site throttle.
  await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS));
  const evidence = [];
  const authStatus = { failure: null };
  const result = await runBatch(batchConfig(scope, cookie, [], evidence, authStatus, sessionId));
  const compareFields = ['impactFactor','realtimeIF','fiveYearIF','citeScore','hIndex','articleCount',
    'latestCASYear','latestCAS','casPartitions','citeScoreRankings','wosStatus','wosZone','jif','jci'];
  const diffs = [];
  for (const current of result.results) {
    const old = scope.stage.find(row => row.journalid && String(row.journalid) === String(current.journalid || ''))
      || (current.isCCF ? scope.stage.find(row => row.isCCF && (row.ccfRelations || []).some(a =>
        (current.ccfRelations || []).some(b => norm(a.full) === norm(b.full)))) : null);
    if (!old) continue;
    const changes = {};
    for (const field of compareFields) {
      if (JSON.stringify(old[field] ?? null) !== JSON.stringify(current[field] ?? null)) {
        changes[field] = { before: old[field] ?? null, after: current[field] ?? null };
      }
    }
    if (Object.keys(changes).length) diffs.push({ journalid: current.journalid || '', name: current.name || current.ccfFull || '', changes });
  }
  writeJSON(AUDIT_DIFF, { generatedAt: new Date().toISOString(), comparedFields: compareFields, changedRecordCount: diffs.length, records: diffs });
  const scopedEvidence = readScopedEvidence(readJSON(AUDIT_MANIFEST).scopeKey);
  const detailEvidence = scopedEvidence.filter(row => row.urlType === 'detail' && row.parsed);
  const fiveYearLabel = detailEvidence.filter(row => row.labelSnippets?.some(snippet => /^(?:5年影响因子|五年影响因子|五年IF)$/.test(snippet.label)));
  const fiveYearField = {
    parsedNonemptyCount: detailEvidence.filter(row => row.parsed?.fiveYearIF).length,
    labelObservedCount: fiveYearLabel.length,
    labelObservedValueBlank: fiveYearLabel.filter(row => !row.parsed?.fiveYearIF).map(row => row.journalid),
    labelNotObserved: detailEvidence.filter(row =>
      !fiveYearLabel.some(label => label.journalid === row.journalid)).map(row => row.journalid)
  };
  const allEvidence = scopedEvidence;
  const summary = { generatedAt: new Date().toISOString(), sessionId, report: result.report,
    attempts: evidence.length, cumulativeEvidenceCount: allEvidence.length,
    evidenceFile: AUDIT_EVIDENCE, fiveYearIF: fiveYearField, diffFile: AUDIT_DIFF };
  const metrics = readJSON(METRICS);
  const history = metrics.authenticatedAuditHistory || (metrics.authenticatedAudit ? [metrics.authenticatedAudit] : []);
  writeJSON(METRICS, { ...metrics, authenticatedAudit: summary, authenticatedAuditHistory: [...history, summary] });
  appendReportRun(AUDIT_REPORT, { phase: 'full_run', ...summary });
  return summary;
}

async function runAuto(scope, cookie, sessionId, steps = {}) {
  const authenticate = steps.requireAuth || requireAuth;
  const wait = steps.waitForThrottle || waitForThrottle;
  const canaryStep = steps.runCanary || runCanary;
  const fullStep = steps.runFull || runFull;
  const waitForUpdatedCookie = steps.waitForCookieUpdate || waitForCookieUpdate;
  let activeCookie = cookie;
  let activeSessionId = sessionId;
  let reusableCanary = steps.resumeCanary || null;
  while (true) {
    try {
      let canary;
      if (reusableCanary) {
        canary = reusableCanary;
        reusableCanary = null;
        activeSessionId = canary.sessionId;
        if (steps.onAuthReused) steps.onAuthReused(canary);
      } else {
        await authenticate(activeCookie, activeSessionId);
        await wait();
        canary = await canaryStep(scope, activeCookie, activeSessionId);
        if (steps.onCanary) steps.onCanary(canary);
      }
      const full = await fullStep(scope, activeCookie, activeSessionId, { authContextValidated: true });
      return { canary, full, sessionId: activeSessionId };
    } catch (error) {
      if (error.code !== 'AUTH_REQUIRED' || !steps.waitForCookie) throw error;
      if (steps.onCookieRequired) steps.onCookieRequired();
      activeCookie = await waitForUpdatedCookie(steps.cookieMtimeMs, {
        file: steps.cookieFile || COOKIE_FILE,
        intervalMs: 5000,
        ...(steps.cookieWaitOptions || {})
      });
      activeSessionId = steps.newSessionId ? steps.newSessionId() : require('crypto').randomUUID();
      if (steps.onCookieReloaded) steps.onCookieReloaded();
      const cookiePath = steps.cookieFile || COOKIE_FILE;
      steps.cookieMtimeMs = steps.getCookieMtime
        ? steps.getCookieMtime(cookiePath)
        : cookieFileMtime(cookiePath);
    }
  }
}

function validateCanaryResume({ canary, evidence = [], scopeKey, cookieMtimeMs, nowMs = Date.now() }) {
  if (!canary || canary.passed !== true) return { valid: false, reason: 'canary_not_passed' };
  const canaryTime = Date.parse(canary.generatedAt || '');
  if (!Number.isFinite(canaryTime) || nowMs - canaryTime < 0 || nowMs - canaryTime > 24 * 60 * 60 * 1000) {
    return { valid: false, reason: 'canary_expired' };
  }
  if (!Number.isFinite(cookieMtimeMs) || cookieMtimeMs > canaryTime) {
    return { valid: false, reason: 'cookie_newer_than_canary' };
  }
  if (!canary.ccf?.identityValid || !canary.nonCCF?.identityValid) {
    return { valid: false, reason: 'canary_identity_invalid' };
  }
  const details = (canary.evidence || []).filter(row => row.urlType === 'detail');
  const recordedScope = canary.scopeKey || details[0]?.scopeKey;
  const recordedParserVersion = canary.detailParserVersion ?? details[0]?.detailParserVersion;
  if (recordedScope !== scopeKey || recordedParserVersion !== DETAIL_PARSER_VERSION) {
    return { valid: false, reason: 'scope_or_parser_mismatch' };
  }
  if (details.length < 2 || details.some(row => row.scopeKey !== scopeKey
      || row.detailParserVersion !== DETAIL_PARSER_VERSION || row.sessionId !== canary.sessionId
      || row.authObservation?.authStatus !== 'authenticated'
      || !row.parsed || row.parsed.wosStatus !== 'available' || !row.parsed.wosZone)) {
    return { valid: false, reason: 'canary_detail_evidence_invalid' };
  }
  const detailIds = new Set(details.map(row => String(row.journalid)));
  if (!detailIds.has(String(canary.ccf.journalid)) || !detailIds.has(String(canary.nonCCF.journalid))) {
    return { valid: false, reason: 'canary_detail_identity_mismatch' };
  }
  const matchingAuth = evidence.some(row => row.urlType === 'auth' && row.authenticated === true
    && row.sessionId === canary.sessionId && row.scopeKey === scopeKey
    && row.detailParserVersion === DETAIL_PARSER_VERSION
    && row.authInspection?.authStatus === 'authenticated');
  if (!matchingAuth) return { valid: false, reason: 'authenticated_evidence_missing' };
  return { valid: true, reason: 'canary_and_auth_evidence_match' };
}

async function main(argv = process.argv.slice(2)) {
  const modes = ['--auth-only','--canary','--run','--auto','--resume-audit'];
  const operationalModes = modes.filter(arg => arg !== '--resume-audit');
  const mode = argv.find(arg => operationalModes.includes(arg))
    || (argv.includes('--resume-audit') ? '--resume-audit' : undefined);
  const waitForCookie = argv.includes('--wait-for-cookie');
  const resumeAudit = mode === '--resume-audit' || argv.includes('--resume-audit');
  const selectedModes = argv.filter(arg => operationalModes.includes(arg));
  if (!mode || selectedModes.length > 1
      || (mode === '--resume-audit' && selectedModes.length !== 0)
      || (argv.includes('--resume-audit') && mode !== '--auto' && mode !== '--resume-audit')) {
    throw new Error('Usage: node scraper/run_data_audit.js --auth-only|--canary|--run|--auto|--resume-audit [--wait-for-cookie]');
  }
  if (waitForCookie && mode !== '--auto' && mode !== '--resume-audit') throw new Error('--wait-for-cookie is valid only with --auto or --resume-audit.');
  const initialMtimeMs = waitForCookie || resumeAudit ? cookieFileMtime() : undefined;
  const cookie = getCookie({ fileOnly: waitForCookie || resumeAudit });
  const scope = buildAuditScope();
  const { randomUUID } = require('crypto');
  const sessionId = randomUUID();
  if (mode === '--auth-only') return requireAuth(cookie, sessionId);
  if (mode === '--canary') {
    await requireAuth(cookie, sessionId);
    await waitForThrottle();
    const report = await runCanary(scope, cookie, sessionId);
    console.log(JSON.stringify({ phase: 'canary', passed: report.passed,
      ccf: report.ccf, nonCCF: report.nonCCF, evidence: report.evidence.length }));
    return;
  }
  if (mode === '--auto' || mode === '--resume-audit') {
    let resumeCanary = null;
    if (resumeAudit) {
      const evidence = readAuditEvidence();
      const candidate = fs.existsSync(AUTHED_CANARY) ? latestReportRun(AUTHED_CANARY) : null;
      const guard = validateCanaryResume({ canary: candidate, evidence,
        scopeKey: readJSON(AUDIT_MANIFEST).scopeKey, cookieMtimeMs: initialMtimeMs });
      if (guard.valid) resumeCanary = candidate;
      else console.log(JSON.stringify({ phase: 'resume_audit_rejected', reason: guard.reason }));
    }
    const result = await runAuto(scope, cookie, sessionId, {
      waitForCookie,
      resumeCanary,
      cookieMtimeMs: initialMtimeMs,
      cookieFile: COOKIE_FILE,
      onCookieRequired: () => console.log(JSON.stringify({ phase: 'cookie_required', reason: 'explicit_login_gate' })),
      onCookieReloaded: () => console.log(JSON.stringify({ phase: 'cookie_reloaded' })),
      onAuthReused: canary => console.log(JSON.stringify({ phase: 'auth_reused_from_canary', sessionId: canary.sessionId,
        canaryGeneratedAt: canary.generatedAt })),
      onCanary: canary => console.log(JSON.stringify({ phase: 'canary', passed: canary.passed,
        ccf: canary.ccf, nonCCF: canary.nonCCF, evidence: canary.evidence.length }))
    });
    console.log(JSON.stringify({ phase: 'run', attempted: result.full.report.attemptedThisRun,
      counts: result.full.report.counts, cumulativeEvidence: result.full.cumulativeEvidenceCount }));
    return;
  }
  const summary = await runFull(scope, cookie, sessionId);
  console.log(JSON.stringify({ phase: 'run', attempted: summary.report.attemptedThisRun,
    counts: summary.report.counts, evidence: summary.attempts }));
}

if (require.main === module) main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { buildAuditScope, chooseCanary, ensureAuditStage, readFrozenAuditInputs, evidenceWrapper,
  createEvidenceRecorder, persistAuditEvidence, readScopedEvidence, batchConfig,
  authNetworkErrorKind, runAuthWithRetry, validateCanaryResume, waitForCookieUpdate, runAuto, main };
