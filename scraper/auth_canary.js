const { hasNormalJournalPageStructure, isRateLimitedHTML, requestHTML } = require('./lib/runtime');

function inspectAuthenticatedPage(html) {
  const source = String(html || '');
  const loginPage = /page=login/i.test(source) && /(?:password|密码)/i.test(source);
  const loginGateVisible = /注册或登录后[\s\S]{0,160}(?:查看)?WOS分区等级/i.test(source);
  return {
    structureValid: hasNormalJournalPageStructure(source),
    rateLimited: isRateLimitedHTML(source),
    loginPage,
    loginGateVisible,
    authenticatedContentAvailable: !loginPage && !loginGateVisible
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
  if (response.statusCode >= 400 || !inspection.structureValid || inspection.rateLimited) process.exitCode = 1;
  else if (!inspection.authenticatedContentAvailable) process.exitCode = 2;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { inspectAuthenticatedPage, main };
