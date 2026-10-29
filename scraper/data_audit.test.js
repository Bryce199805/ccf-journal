'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { batchConfig, ensureAuditStage, evidenceWrapper, createEvidenceRecorder,
  readScopedEvidence, waitForCookieUpdate, runAuto, authNetworkErrorKind, runAuthWithRetry,
  validateCanaryResume, readFrozenAuditInputs } = require('./run_data_audit');
const { createHash } = require('node:crypto');
const { fetchWithRetry } = require('./lib/runtime');

test('auth retry classifier recognizes transient network errors only', () => {
  for (const code of ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND']) {
    assert.equal(authNetworkErrorKind(Object.assign(new Error('network error'), { code })), code.toLowerCase());
  }
  assert.equal(authNetworkErrorKind(new Error('timeout after 60000ms')), 'timeout');
  assert.equal(authNetworkErrorKind(Object.assign(new Error('HTTP 403'), { code: 'AUTH_REQUIRED' })), '');
  assert.equal(authNetworkErrorKind(new Error('authentication unknown')), '');
});

test('auth retry backs off 30s and 60s, then stops after the third transient failure', async () => {
  const delays = [];
  const statuses = [];
  let attempts = 0;
  await assert.rejects(runAuthWithRetry(async () => {
    attempts += 1;
    throw Object.assign(new Error('network down'), { code: 'ECONNRESET' });
  }, { sleepImpl: async ms => delays.push(ms), onRetry: event => statuses.push(event) }), /network down/);
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [30000, 60000]);
  assert.deepEqual(statuses.map(row => row.phase), ['auth_retry', 'auth_retry', 'auth_retry_exhausted']);
  assert.deepEqual(statuses.map(row => row.reason), ['econnreset', 'econnreset', 'econnreset']);
});

test('auth retry does not retry unknown or explicit authentication failures', async () => {
  let attempts = 0;
  const error = Object.assign(new Error('explicit gate'), { code: 'AUTH_REQUIRED' });
  await assert.rejects(runAuthWithRetry(async () => { attempts += 1; throw error; }, {
    sleepImpl: async () => assert.fail('must not sleep'), onRetry: () => assert.fail('must not log retry')
  }), caught => caught === error);
  assert.equal(attempts, 1);
});

test('audit staging resumes for a matching scope without overwriting fetched state', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccf-data-audit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const staging = path.join(dir, 'audit.staging.json');
  const manifest = path.join(dir, 'manifest.json');
  const scope = { scopeKey: 'scope-a' };

  assert.equal(ensureAuditStage(staging, manifest, [{ journalid: '1' }], scope), 'initialized');
  fs.writeFileSync(staging, JSON.stringify([{ journalid: '1', fetchedAt: 'checkpoint' }]));
  assert.equal(ensureAuditStage(staging, manifest, [{ journalid: '1' }], scope), 'preserved');
  assert.deepEqual(JSON.parse(fs.readFileSync(staging, 'utf8')), [{ journalid: '1', fetchedAt: 'checkpoint' }]);
  assert.throws(() => ensureAuditStage(staging, manifest, [{ journalid: '2' }], { scopeKey: 'scope-b' }), /scope changed/);
  assert.deepEqual(JSON.parse(fs.readFileSync(staging, 'utf8')), [{ journalid: '1', fetchedAt: 'checkpoint' }]);
});

test('frozen audit inputs resume against their original scope even when live catalog changes', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccf-frozen-audit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const files = Object.fromEntries(['manifest', 'stage', 'ccf', 'candidates'].map(name =>
    [name, path.join(dir, `${name}.json`)]));
  const ccf = { Systems: [{ full: 'Computer Languages', abbr: 'CL' }] };
  const candidates = [{ journalid: '42' }];
  const baselineCount = 372;
  const scopeKey = createHash('sha256').update(JSON.stringify({ ccf, candidates, baselineCount })).digest('hex');
  fs.writeFileSync(files.manifest, JSON.stringify({ scopeKey }));
  fs.writeFileSync(files.stage, JSON.stringify([{ journalid: '42', fetchedAt: 'saved' }]));
  fs.writeFileSync(files.ccf, JSON.stringify(ccf));
  fs.writeFileSync(files.candidates, JSON.stringify(candidates));
  const frozen = readFrozenAuditInputs({ manifestFile: files.manifest, stageFile: files.stage,
    ccfFile: files.ccf, candidatesFile: files.candidates, baselineCount });
  assert.equal(frozen.scopeKey, scopeKey);
  assert.equal(frozen.stage[0].fetchedAt, 'saved');
  assert.throws(() => readFrozenAuditInputs({ manifestFile: files.manifest, stageFile: files.stage,
    ccfFile: files.ccf, candidatesFile: path.join(dir, 'missing.json'), baselineCount }), /incomplete/);
  fs.writeFileSync(files.candidates, JSON.stringify([{ journalid: '99' }]));
  assert.throws(() => readFrozenAuditInputs({ manifestFile: files.manifest, stageFile: files.stage,
    ccfFile: files.ccf, candidatesFile: files.candidates, baselineCount }), /checksum mismatch/);
});

test('audit batch writes all mutable scraper artifacts under audit-specific paths', () => {
  const config = batchConfig({ scopeKey: 'test-scope' }, 'not-a-real-cookie', [], [], { failure: null });
  for (const field of ['stagingFile', 'progressFile', 'reportFile', 'conflictFile', 'identityQuarantineFile']) {
    assert.match(config[field], /\/scraper\/output\/data_audit|\/scraper\/output\/audit\.staging/);
  }
  assert.equal(config.delayMs, 12000);
  assert.equal(config.retries, 3);
  assert.match(config.reportFile, /data_audit_batch_report\.json$/);
  assert.equal(config.detailAccessMode, 'authenticated');
  assert.equal(config.forceRefresh, false);
});

test('authenticated login response becomes a hard batch error without exposing the cookie', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccf-evidence-test-'));
  try {
  const secretCookie = 'session=never-print-this';
  const evidence = [];
  const requests = [];
  const authStatus = { failure: null };
  const evidenceFile = path.join(dir, 'evidence.json');
  const fetch = evidenceWrapper(secretCookie, evidence, authStatus, {
    requestImpl: async (_url, options) => {
      assert.equal(options.cookie, secretCookie);
      return { statusCode: 200, body: '<html><form action="?page=login"><input type="password"></form></html>' };
    },
    recordEvidence: createEvidenceRecorder({ file: evidenceFile, scopeKey: 'test-scope', sessionId: 'test-session', testOnly: true }),
    recordLastRequest: record => requests.push(record),
    throttle: async () => {}
  });
  const response = await fetch('https://www.letpub.com.cn/index.php?journalid=3567&page=journalapp&view=detail');
  assert.equal(response.statusCode, 401);
  assert.equal(authStatus.failure.loginPage, true);
  assert.equal(evidence.length, 1);
  assert.doesNotMatch(JSON.stringify(evidence), /never-print-this/);
  assert.equal(JSON.parse(fs.readFileSync(evidenceFile, 'utf8')).length, 1);
  assert.equal(requests.length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('detail request failure is cleared only after same URL succeeds on retry', async () => {
  const evidence = [];
  const authStatus = { failure: null };
  let calls = 0;
  const url = 'https://www.letpub.com.cn/index.php?page=journalapp&view=search&searchissn=0000-0000';
  const fetch = evidenceWrapper('cookie', evidence, authStatus, {
    requestImpl: async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
      return { statusCode: 200, body: '<a href="?page=journalapp&view=search">search result</a>' };
    },
    recordEvidence: record => { evidence.push(record); return record; },
    recordLastRequest: () => {}, throttle: async () => {}
  });
  const response = await fetchWithRetry(url, { fetchImpl: fetch, retries: 3,
    backoffMs: 0, jitterMs: 0, sleepImpl: async () => {} });
  assert.equal(response.ok, true);
  assert.equal(calls, 2);
  assert.equal(authStatus.failure, null);
});

test('same-session recovery does not clear explicit login gate from a different request', async () => {
  const evidence = [];
  const authStatus = { failure: null };
  const loginURL = 'https://www.letpub.com.cn/index.php?journalid=7&page=journalapp&view=detail';
  const searchURL = 'https://www.letpub.com.cn/index.php?page=journalapp&view=search&searchissn=0000-0000';
  let currentBody = '<div>注册或登录后查看WOS分区等级</div>';
  const fetch = evidenceWrapper('cookie', evidence, authStatus, {
    requestImpl: async url => ({ statusCode: 200,
      body: url === loginURL ? currentBody : '<a href="?page=journalapp&view=search">search result</a>' }),
    recordEvidence: record => { evidence.push(record); return record; },
    recordLastRequest: () => {}, throttle: async () => {}
  });
  await fetch(loginURL);
  assert.equal(authStatus.failure.reason, 'login_gate');
  currentBody = '<a href="?journalid=7&page=journalapp&view=detail">期刊ISSN</a>'
    + '<table><tr><td>WOS分区等级</td><td>1区</td></tr></table>';
  await fetch(loginURL);
  assert.equal(authStatus.failure.reason, 'login_gate');
  await fetch(searchURL);
  assert.equal(authStatus.failure.reason, 'login_gate');
});

test('HTTP 404 is a non-retryable task failure and does not mark the cookie invalid', async () => {
  const evidence = [];
  const authStatus = { failure: null };
  let calls = 0;
  const url = 'https://www.letpub.com.cn/index.php?journalid=7&page=journalapp&view=detail';
  const fetch = evidenceWrapper('cookie', evidence, authStatus, {
    requestImpl: async () => { calls += 1; return { statusCode: 404, body: 'not found' }; },
    recordEvidence: record => { evidence.push(record); return record; },
    recordLastRequest: () => {}, throttle: async () => {}
  });
  const response = await fetchWithRetry(url, { fetchImpl: fetch, retries: 3 });
  assert.equal(response.ok, false);
  assert.equal(response.kind, 'http_error');
  assert.equal(calls, 1);
  assert.equal(authStatus.failure.haltBatch, false);
  assert.equal(authStatus.failure.retryable, false);
  assert.equal(authStatus.failure.reason, 'http_error');
});

test('search response is not rejected for lacking detail-page structure', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccf-search-test-'));
  try {
    const evidence = [];
    const authStatus = { failure: null };
    const fetch = evidenceWrapper('fake', evidence, authStatus, {
      requestImpl: async () => ({ statusCode: 200, body: '<html><body>Empty search result.</body></html>' }),
      recordEvidence: createEvidenceRecorder({ file: path.join(dir, 'evidence.json'), scopeKey: 's', sessionId: 's', testOnly: true }),
      recordLastRequest: () => {},
      throttle: async () => {}
    });
    const response = await fetch('https://www.letpub.com.cn/index.php?page=journalapp&view=search&searchissn=0000-0000');
    assert.equal(response.statusCode, 200);
    assert.equal(authStatus.failure, null);
    assert.equal(evidence[0].urlType, 'search');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('evidence append is cumulative and excludes test or failed-auth sessions from summaries', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccf-evidence-store-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'evidence.json');
  const good = createEvidenceRecorder({ file, scopeKey: 'scope', sessionId: 'good' });
  good({ journalid: '3567', urlType: 'auth', authenticated: true });
  good({ journalid: '20', urlType: 'detail', parsed: { impactFactor: '1.2' } });
  createEvidenceRecorder({ file, scopeKey: 'scope', sessionId: 'bad' })({ journalid: '3567', urlType: 'auth', authenticated: false });
  createEvidenceRecorder({ file, scopeKey: 'scope', sessionId: 'bad' })({ journalid: '21', urlType: 'detail' });
  createEvidenceRecorder({ file, scopeKey: 'scope', sessionId: 'test', testOnly: true })({ journalid: '22', urlType: 'detail' });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).length, 5);
  assert.deepEqual(readScopedEvidence('scope', file).map(row => row.journalid), ['3567', '20']);
});

test('auto mode runs auth, throttle, canary, and full exactly once in order', async () => {
  const events = [];
  const result = await runAuto({}, 'cookie', 'session', {
    requireAuth: async () => events.push('auth'),
    waitForThrottle: async () => events.push('throttle'),
    runCanary: async () => { events.push('canary'); return { passed: true }; },
    onCanary: () => events.push('canary_summary'),
    runFull: async () => { events.push('full'); return { done: true }; }
  });
  assert.deepEqual(events, ['auth','throttle','canary','canary_summary','full']);
  assert.deepEqual(result, { canary: { passed: true }, full: { done: true }, sessionId: 'session' });
});

test('auto mode reuses a previously guarded canary session and does not repeat auth or canary', async () => {
  const events = [];
  const canary = { passed: true, sessionId: 'validated-session', generatedAt: 'now' };
  const result = await runAuto({}, 'cookie', 'new-session', {
    resumeCanary: canary,
    requireAuth: async () => events.push('auth'),
    runCanary: async () => { events.push('canary'); },
    onAuthReused: value => events.push(`reused:${value.sessionId}`),
    runFull: async (_scope, cookie, session, options) => {
      events.push(`full:${cookie}:${session}:${options.authContextValidated}`);
      return { done: true };
    }
  });
  assert.deepEqual(events, ['reused:validated-session','full:cookie:validated-session:true']);
  assert.equal(result.sessionId, 'validated-session');
});

test('a gate during reused full run reloads cookie then performs normal auth and canary checks', async () => {
  const events = [];
  const error = Object.assign(new Error('detail login gate'), { code: 'AUTH_REQUIRED' });
  let fullAttempts = 0;
  await runAuto({}, 'old-cookie', 'new-session', {
    waitForCookie: true,
    cookieMtimeMs: 10,
    resumeCanary: { passed: true, sessionId: 'canary-session' },
    onAuthReused: () => events.push('reuse'),
    requireAuth: async (cookie, session) => events.push(`auth:${cookie}:${session}`),
    waitForThrottle: async () => events.push('throttle'),
    runCanary: async (scope, cookie, session) => { events.push(`canary:${cookie}:${session}`); return { passed: true }; },
    runFull: async (scope, cookie) => {
      fullAttempts += 1;
      events.push(`full:${cookie}`);
      if (fullAttempts === 1) throw error;
      return { done: true };
    },
    waitForCookieUpdate: async () => { events.push('wait-cookie'); return 'new-cookie'; },
    getCookieMtime: () => 20,
    newSessionId: () => 'new-cookie-session',
    onCookieRequired: () => events.push('cookie-required'),
    onCookieReloaded: () => events.push('cookie-reloaded')
  });
  assert.deepEqual(events, ['reuse','full:old-cookie','cookie-required','wait-cookie','cookie-reloaded',
    'auth:new-cookie:new-cookie-session','throttle','canary:new-cookie:new-cookie-session',
    'full:new-cookie']);
});

test('canary resume guard requires same scope/version, identities, parsed WOS, auth evidence and old cookie', () => {
  const generatedAt = '2026-10-28T04:21:09.000Z';
  const sessionId = 'session-a';
  const scopeKey = 'scope-a';
  const detail = journalid => ({ journalid, urlType: 'detail', scopeKey, detailParserVersion: 4,
    sessionId, authObservation: { authStatus: 'authenticated' }, parsed: { wosStatus: 'available', wosZone: '1区' } });
  const canary = { passed: true, generatedAt, sessionId, ccf: { journalid: '1', identityValid: true },
    nonCCF: { journalid: '2', identityValid: true }, evidence: [detail('1'), detail('2')] };
  const auth = { journalid: '3567', urlType: 'auth', authenticated: true, sessionId, scopeKey,
    detailParserVersion: 4, authInspection: { authStatus: 'authenticated' } };
  const args = { canary, evidence: [auth], scopeKey, cookieMtimeMs: Date.parse(generatedAt) - 1000,
    nowMs: Date.parse(generatedAt) + 1000 };
  assert.equal(validateCanaryResume(args).valid, true);
  assert.equal(validateCanaryResume({ ...args, cookieMtimeMs: Date.parse(generatedAt) + 1 }).reason, 'cookie_newer_than_canary');
  assert.equal(validateCanaryResume({ ...args, evidence: [] }).reason, 'authenticated_evidence_missing');
  assert.equal(validateCanaryResume({ ...args, scopeKey: 'scope-b' }).reason, 'scope_or_parser_mismatch');
  assert.equal(validateCanaryResume({ ...args, canary: { ...canary, ccf: { journalid: '1', identityValid: false } } }).reason,
    'canary_identity_invalid');
  assert.equal(validateCanaryResume({ ...args, canary: { ...canary, evidence: [detail('1'), { ...detail('2'), parsed: { wosStatus: 'source_missing' } }] } }).reason,
    'canary_detail_evidence_invalid');
});

test('auto mode stops before full run when canary fails', async () => {
  const events = [];
  await assert.rejects(runAuto({}, 'cookie', 'session', {
    requireAuth: async () => events.push('auth'),
    waitForThrottle: async () => events.push('throttle'),
    runCanary: async () => { events.push('canary'); throw new Error('canary failed'); },
    runFull: async () => { events.push('full'); }
  }), /canary failed/);
  assert.deepEqual(events, ['auth','throttle','canary']);
});

test('auto wait mode reloads a changed cookie only after explicit auth-required', async () => {
  const events = [];
  const result = await runAuto({}, 'old-cookie', 'old-session', {
    waitForCookie: true,
    cookieMtimeMs: 10,
    requireAuth: async (cookie, session) => {
      events.push(`auth:${cookie}:${session}`);
      if (cookie === 'old-cookie') {
        const error = new Error('explicit gate');
        error.code = 'AUTH_REQUIRED';
        throw error;
      }
    },
    waitForCookieUpdate: async mtime => { events.push(`cookie_wait:${mtime}`); return 'new-cookie'; },
    getCookieMtime: () => 20,
    newSessionId: () => 'new-session',
    onCookieRequired: () => events.push('cookie_required'),
    onCookieReloaded: () => events.push('cookie_reloaded'),
    waitForThrottle: async () => events.push('throttle'),
    runCanary: async (scope, cookie, session) => { events.push(`canary:${cookie}:${session}`); return { passed: true }; },
    runFull: async (scope, cookie, session) => { events.push(`full:${cookie}:${session}`); return { done: true }; }
  });
  assert.deepEqual(events, ['auth:old-cookie:old-session','cookie_required','cookie_wait:10','cookie_reloaded',
    'auth:new-cookie:new-session','throttle','canary:new-cookie:new-session','full:new-cookie:new-session']);
  assert.equal(result.sessionId, 'new-session');
});

test('auto wait mode does not wait for unknown or network errors', async () => {
  let waited = false;
  const error = new Error('auth unknown');
  error.code = 'AUTH_UNKNOWN';
  await assert.rejects(runAuto({}, 'cookie', 'session', {
    waitForCookie: true,
    requireAuth: async () => { throw error; },
    waitForCookieUpdate: async () => { waited = true; return 'new'; }
  }), err => err === error);
  assert.equal(waited, false);
});

test('cookie waiter polls at five seconds and returns only after file mtime changes', async () => {
  const mtimes = [10, 10, 11];
  const waits = [];
  const cookie = await waitForCookieUpdate(10, {
    file: '/tmp/test-cookie',
    statImpl: () => ({ mtimeMs: mtimes.shift() }),
    readImpl: file => { assert.equal(file, '/tmp/test-cookie'); return 'PHPSESSID=new'; },
    sleepImpl: async ms => waits.push(ms)
  });
  assert.equal(cookie, 'PHPSESSID=new');
  assert.deepEqual(waits, [5000,5000]);
});
