const { hasNormalJournalPageStructure, requestHTML } = require('./lib/runtime');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

function extractSafePageSignals(html) {
  const result = spawnSync(process.env.PYTHON || 'python3', [path.join(__dirname, 'auth_canary_html.py')], {
    input: String(html || ''), encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 10000
  });
  if (result.error || result.status !== 0) throw new Error('Python HTML inspection failed');
  try { return JSON.parse(result.stdout); } catch { throw new Error('Python HTML inspection returned invalid signals'); }
}

function extractWOSScienceEvidence(html) {
  return extractSafePageSignals(html).wosScienceEvidence;
}

function inspectAuthenticatedPage(html) {
  const source = String(html || '');
  const signals = extractSafePageSignals(source);
  const hasLoginForm = signals.loginFormPresent;
  const hasJournalDetailContent = signals.hasJournalDetailContent;
  const structureValid = hasNormalJournalPageStructure(source);
  const loginPage = hasLoginForm && !hasJournalDetailContent && !structureValid;
  const loginGateVisible = signals.loginGateVisible;
  const wosSectionPresent = signals.wosSectionPresent;
  const wosStatus = signals.wosAvailable ? 'available' : signals.wosNotIndexed ? 'not_indexed'
    : signals.loginGateVisible ? 'auth_required' : signals.wosUnavailable ? 'partition_unavailable' : 'source_missing';
  const wosReason = signals.wosAvailable ? 'partition_present' : signals.wosNotIndexed ? 'not_in_latest_jcr'
    : signals.loginGateVisible ? 'login_gate' : signals.wosUnavailable ? 'no_partition_data' : 'wos_section_absent';
  const rateLimited = signals.rateLimited;
  let authStatus = 'unknown';
  if (loginPage || loginGateVisible) authStatus = 'login_required';
  else if (rateLimited) authStatus = 'rate_limited';
  else if (structureValid && ['available', 'not_indexed', 'partition_unavailable'].includes(wosStatus)) authStatus = 'authenticated';
  return {
    structureValid,
    rateLimited,
    loginPage,
    loginFormPresent: hasLoginForm,
    hasJournalDetailContent,
    loginGateVisible,
    wosSectionPresent,
    wosStatus,
    wosReason,
    wosScienceEvidence: signals.wosScienceEvidence,
    authStatus,
    authenticatedContentAvailable: authStatus === 'authenticated'
  };
}

async function main(env = process.env) {
  if (!env.LETPUB_COOKIE) throw new Error('LETPUB_COOKIE is not set');
  const journalid = String(env.LETPUB_AUTH_CANARY_JOURNALID || '3567');
  if (!/^\d+$/.test(journalid)) throw new Error('LETPUB_AUTH_CANARY_JOURNALID must be numeric');
  const url = 'https://www.letpub.com.cn/index.php?journalid=' + journalid + '&page=journalapp&view=detail';
  const response = await requestHTML(url, {
    timeoutMs: Number(env.LETPUB_AUTH_CANARY_TIMEOUT_MS || 20000),
    cookie: env.LETPUB_COOKIE
  });
  const inspection = inspectAuthenticatedPage(response.body);
  const report = { journalid, statusCode: response.statusCode, ...inspection };
  console.log(JSON.stringify(report));
  process.exitCode = 0;
  if (inspection.loginPage || inspection.loginGateVisible) process.exitCode = 2;
  else if (response.statusCode >= 400 || !inspection.structureValid || inspection.rateLimited) process.exitCode = 1;
  else if (inspection.authStatus !== 'authenticated') process.exitCode = 3;
  return report;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { extractWOSScienceEvidence, inspectAuthenticatedPage, main };
