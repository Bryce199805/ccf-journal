#!/usr/bin/env node
'use strict';

// Fixed, read-only identity follow-up for the six unresolved audit titles.
// It never writes progress, staging, formal data, or the shared audit evidence log.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { buildTasks, parseSearchResults, resolveJournal, validateResolvedIdentity } = require('./batch_scrape');
const { buildAuditScope, evidenceWrapper } = require('./run_data_audit');
const { DETAIL_PARSER_VERSION, parseDetailHTML } = require('./lib/letpub_parser');
const { fetchWithRetry, requestHTML, sleep } = require('./lib/runtime');
const { inspectAuthenticatedPage } = require('./auth_canary');
const { normalizeName } = require('./lib/identity');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'output');
const COOKIE_FILE = '/tmp/ccf-letpub-audit-session.cookie';
const EVIDENCE_FILE = path.join(OUT, 'data_audit_evidence.json');
const REPORT_FILE = path.join(OUT, 'data_audit_remaining_followup.json');
const AUTH_URL = 'https://www.letpub.com.cn/index.php?journalid=3567&page=journalapp&view=detail';
const MIN_DELAY_MS = 12000;
const PYTHON = process.env.PYTHON || 'python3';

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function writeReport(report) {
  const temp = `${REPORT_FILE}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, REPORT_FILE);
  fs.chmodSync(REPORT_FILE, 0o600);
}

function readCookie() {
  const stat = fs.statSync(COOKIE_FILE);
  if ((stat.mode & 0o077) !== 0) throw new Error('cookie_file_permissions_invalid');
  const cookie = fs.readFileSync(COOKIE_FILE, 'utf8').trim();
  if (!cookie || /[\r\n]/.test(cookie)) throw new Error('cookie_file_invalid');
  return cookie;
}

function visibleSearchResults(html) {
  const parsed = spawnSync(PYTHON, [path.join(__dirname, 'audit_search_html.py')], {
    input: String(html || ''), encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 10000
  });
  if (parsed.error || parsed.status !== 0) throw new Error('search_html_inspection_failed');
  const result = JSON.parse(parsed.stdout);
  return result.results;
}

function safeSearchHTML(rows) {
  const escape = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return rows.map(row => `<a href="?journalid=${row.journalid}">${escape(row.title)}</a>`).join('');
}

function summarizeEvidence(row) {
  return Object.fromEntries(['capturedAt','journalid','url','urlType','responseStatus','authObservation',
    'parsed','parseError','requestFailure','scopeKey','detailParserVersion','sessionId']
    .filter(key => row[key] !== undefined).map(key => [key, row[key]]));
}

function parseCookieCanary(response) {
  const inspection = inspectAuthenticatedPage(response.body);
  return {
    statusCode: response.statusCode,
    authStatus: inspection.authStatus,
    loginPage: inspection.loginPage,
    loginGateVisible: inspection.loginGateVisible,
    rateLimited: inspection.rateLimited,
    structureValid: inspection.structureValid,
    wosStatus: inspection.wosStatus
  };
}

async function main() {
  if (process.argv.length !== 2) throw new Error('fixed_no_arguments');
  const cookie = readCookie();
  const scope = buildAuditScope();
  const legacy = readJSON(path.join(ROOT, 'data', 'all_letpub_data.json'));
  const aliases = readJSON(path.join(__dirname, 'ccf_title_aliases.json')).aliases;
  const hints = readJSON(path.join(__dirname, 'ccf_identity_hints.json')).items;
  const tasks = buildTasks(scope.ccfSource, [], legacy, aliases, hints);
  const targets = [
    ['TORS', task => normalizeName(task.full) === normalizeName('ACM Transactions on Recommender Systems')],
    ['JATS', task => normalizeName(task.full) === normalizeName('ACM Journal on Autonomous Transportation Systems')],
    ['TELO', task => normalizeName(task.full) === normalizeName('ACM Transactions on Evolutionary Learning and Optimization')],
    ['TASLP', task => normalizeName(task.full).startsWith(normalizeName('IEEE Transactions on Audio, Speech and Language Processing'))],
    ['PLOS', task => normalizeName(task.full) === normalizeName('PLOS Computational Biology')],
    ['EITEE', task => normalizeName(task.full).startsWith(normalizeName('Engineering, Information Technology and Electronic Engineering'))]
  ];
  const selected = targets.map(([key, predicate]) => {
    const task = tasks.find(predicate);
    if (!task) throw new Error(`target_task_missing:${key}`);
    return { key, task };
  });
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    phase: 'targeted_remaining_identity_followup',
    scopeKey: scope.scopeKey,
    detailParserVersion: DETAIL_PARSER_VERSION,
    sessionId: randomUUID(),
    status: 'auth_check_pending',
    requestPolicy: { targetCount: selected.length, delayMs: MIN_DELAY_MS, retries: 3,
      onlyFixedTargets: true, sharedProgressWritten: false, sharedEvidenceWritten: false },
    auth: null,
    searchObservations: [],
    items: [],
    evidence: []
  };

  let lastRequestAt = 0;
  const throttle = async () => {
    if (lastRequestAt) {
      const wait = MIN_DELAY_MS - (Date.now() - lastRequestAt);
      if (wait > 0) await sleep(wait);
    }
    lastRequestAt = Date.now();
  };

  try {
    let authResponse = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await throttle();
      try {
        authResponse = await requestHTML(AUTH_URL, { timeoutMs: 25000, cookie });
      } catch {
        report.auth = { status: 'network_error', attempt };
        if (attempt < 3) await sleep(MIN_DELAY_MS * attempt);
        continue;
      }
      if (authResponse.statusCode >= 500) {
        report.auth = { status: 'server_error', attempt, responseStatus: authResponse.statusCode };
        if (attempt < 3) {
          await sleep(MIN_DELAY_MS * attempt);
          continue;
        }
        break;
      }
      report.auth = parseCookieCanary(authResponse);
      break;
    }
    if (!authResponse || report.auth?.authStatus !== 'authenticated'
        || report.auth?.statusCode >= 400 || report.auth?.rateLimited) {
      report.status = report.auth?.loginPage || report.auth?.loginGateVisible ? 'auth_required'
        : report.auth?.rateLimited ? 'rate_limited'
          : !authResponse && report.auth?.status === 'network_error' ? 'parse_failed'
            : report.auth?.authStatus === 'authenticated' ? 'auth_request_failed' : 'auth_unknown';
      writeReport(report);
      console.log(JSON.stringify({ phase: report.phase, status: report.status,
        reportFile: REPORT_FILE }));
      return;
    }

    const evidenceRows = [];
    const authStatus = { failure: null };
    const wrapped = evidenceWrapper(cookie, evidenceRows, authStatus, {
      scopeKey: scope.scopeKey,
      sessionId: report.sessionId,
      throttle,
      recordLastRequest: () => {},
      recordEvidence: row => ({ capturedAt: new Date().toISOString(), ...row })
    });
    const request = async url => {
      const response = await fetchWithRetry(url, {
        fetchImpl: wrapped, retries: 3, timeoutMs: 25000, backoffMs: MIN_DELAY_MS,
        jitterMs: 0, sleepImpl: sleep, cookie
      });
      if (authStatus.failure?.haltBatch) {
        const reason = authStatus.failure.reason;
        const error = new Error(reason === 'login_gate' ? 'AUTH_REQUIRED' : `HALT_${reason}`);
        error.code = reason === 'login_gate' ? 'AUTH_REQUIRED' : reason;
        throw error;
      }
      if (/[?&]view=search(?:&|$)/i.test(url) && response.ok) {
        const queryURL = new URL(url);
        const rows = visibleSearchResults(response.body);
        report.searchObservations.push({ queryType: queryURL.searchParams.has('searchissn') ? 'issn' : 'title',
          query: queryURL.searchParams.get('searchissn') || queryURL.searchParams.get('searchname') || '',
          results: rows });
        // The resolver consumes the standard HTML page shape; feed it sanitized
        // anchors built only from visible anchor titles and numeric journal IDs.
        response.body = safeSearchHTML(rows);
      }
      return response;
    };

    report.status = 'running';
    for (const { key, task } of selected) {
      const item = { key, expected: { title: task.full, issn: task.issn || '', eissn: task.eissn || '',
        publisherTitle: task.identityAliases.at(-1) || '' }, status: 'pending' };
      report.items.push(item);
      try {
        if (key === 'PLOS') {
          const searchURL = 'https://www.letpub.com.cn/index.php?page=journalapp&view=search&searchissn='
            + encodeURIComponent(task.eissn || task.issn);
          const found = await request(searchURL);
          if (!found.ok) {
            item.status = found.kind === 'network_error' || found.kind === 'server_error' ? 'parse_failed' : 'not_found';
            item.reason = found.kind;
          } else {
            const results = visibleSearchResults(found.body);
            item.searchResultIDs = results;
            const prior = readJSON(EVIDENCE_FILE).filter(row => row.scopeKey === scope.scopeKey
              && row.detailParserVersion === DETAIL_PARSER_VERSION && row.testOnly !== true
              && row.urlType === 'detail' && ['6771','8953','10628'].includes(String(row.journalid))
              && row.authObservation?.authStatus === 'authenticated' && row.parsed);
            const latest = new Map();
            for (const row of prior) {
              const old = latest.get(String(row.journalid));
              if (!old || row.capturedAt > old.capturedAt) latest.set(String(row.journalid), row);
            }
            item.cachedAuthenticatedDetails = [...latest.values()].map(row => {
              const detail = { ...row.parsed, journalid: String(row.journalid) };
              const fiveYearRow = (row.labelSnippets || []).find(snippet => snippet?.label === '五年IF')?.rowText || '';
              const fiveYearValue = fiveYearRow.match(/网友提供\)\s*([\d.]+)/)?.[1] || '';
              return { journalid: String(row.journalid), canonicalURL: row.url,
                capturedAt: row.capturedAt,
                identityCheck: validateResolvedIdentity(task, detail), parsed: row.parsed,
                communityReportedFiveYearIF: fiveYearValue
                  ? { value: fiveYearValue, year: null, source: 'letpub_user_contributed' } : null };
            });
            item.status = 'identity_conflict';
            item.reason = latest.size === 3 ? 'multiple_authenticated_provider_pages_for_same_title_and_serial'
              : 'existing_authenticated_candidate_evidence_incomplete';
          }
          continue;
        }

        let resolution = await resolveJournal(task, request);
        if (!resolution.ok && resolution.reason === 'not_found') {
          const publisherTitle = task.identityAliases.at(-1) || '';
          if (publisherTitle && normalizeName(publisherTitle) !== normalizeName(task.full)) {
            const publisherTask = { ...task, full: publisherTitle, issn: '', eissn: '', journalid: '' };
            const publisherResolution = await resolveJournal(publisherTask, request);
            if (publisherResolution.ok) resolution = { ...publisherResolution, method: 'publisher_title' };
            else if (publisherResolution.reason !== 'not_found') resolution = publisherResolution;
          }
        }
        if (!resolution.ok) {
          item.status = resolution.status || 'not_found';
          item.reason = resolution.reason;
          item.candidateIDs = resolution.candidates || [];
          continue;
        }
        const response = resolution.prefetchedResponse || await request(
          `https://www.letpub.com.cn/index.php?journalid=${resolution.journalid}&page=journalapp&view=detail`);
        if (!response.ok) {
          item.status = response.kind === 'network_error' || response.kind === 'server_error' ? 'parse_failed' : 'not_found';
          item.reason = response.kind;
          item.journalid = resolution.journalid;
          continue;
        }
        const detail = parseDetailHTML(resolution.journalid, response.body, { fetchedAt: new Date().toISOString() });
        item.journalid = String(resolution.journalid);
        item.canonicalURL = `https://www.letpub.com.cn/index.php?journalid=${resolution.journalid}&page=journalapp&view=detail`;
        item.method = resolution.method;
        item.actual = { name: detail.name, issn: detail.issn, eissn: detail.eissn };
        item.identityCheck = validateResolvedIdentity(task, detail);
        item.status = item.identityCheck.valid ? 'identity_verified' : 'identity_mismatch';
        item.parsed = Object.fromEntries(['publisher','officialUrl','impactFactor','realtimeIF','citeScore','hIndex',
          'articleCount','latestCASYear','latestCAS','wosZone','wosStatus','jif','jci'].map(field => [field, detail[field] ?? null]));
      } catch (error) {
        if (error.code === 'AUTH_REQUIRED' || error.code === 'login_gate'
            || ['rate_limited', 'detail_structure_error'].includes(error.code)) {
          item.status = error.code === 'AUTH_REQUIRED' || error.code === 'login_gate'
            ? 'auth_required' : error.code;
          item.reason = error.code === 'AUTH_REQUIRED' || error.code === 'login_gate'
            ? 'explicit_login_gate' : error.code;
          report.status = item.status;
          break;
        }
        item.status = error.code === 'network_error' ? 'parse_failed' : 'inspection_error';
        item.reason = error.code || 'inspection_error';
      } finally {
        report.evidence = evidenceRows.map(summarizeEvidence);
        writeReport(report);
        console.log(JSON.stringify({ phase: report.phase, checkpoint: key,
          status: item.status, journalid: item.journalid || null, reportFile: REPORT_FILE }));
      }
    }
    report.evidence = evidenceRows.map(summarizeEvidence);
    if (report.status === 'running') report.status = 'completed';
    writeReport(report);
    console.log(JSON.stringify({ phase: report.phase, status: report.status,
      items: report.items.map(item => ({ key: item.key, status: item.status, journalid: item.journalid || null })),
      reportFile: REPORT_FILE }));
  } finally { /* The cookie remains only in process memory. */ }
}

main().catch(error => {
  console.error(error.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : error.message);
  process.exitCode = 1;
});
