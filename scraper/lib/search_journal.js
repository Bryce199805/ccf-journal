// Legacy search helpers. The active batch pipeline has its own throttled
// requester; these helpers intentionally never select a journal by name.
const { fetchUrl } = require('./letpub_parser');
const { isRateLimitedHTML } = require('./runtime');

function parseResults(html) {
  return [...String(html || '').matchAll(/journalid=(\d+)[^>]*>([^<]*)<\/a>/gi)]
    .map(match => ({ journalid: String(match[1]), name: match[2].trim() }));
}

async function searchByIssn(issn, { fetchImpl = fetchUrl } = {}) {
  if (!issn || issn === '-') return null;
  const url = 'https://www.letpub.com.cn/index.php?page=journalapp&view=search&searchissn='
    + encodeURIComponent(issn);
  const html = await fetchImpl(url);
  if (isRateLimitedHTML(html)) return null;
  const ids = [...new Set(parseResults(html).map(result => result.journalid))];
  return ids.length === 1 ? ids[0] : null;
}

async function inspectByName(fullName, { fetchImpl = fetchUrl } = {}) {
  if (!fullName) return [];
  const url = 'https://www.letpub.com.cn/index.php?page=journalapp&view=search&searchname='
    + encodeURIComponent(fullName);
  const html = await fetchImpl(url);
  return isRateLimitedHTML(html) ? [] : parseResults(html);
}

async function searchByName(fullName, _abbr, _retries, options) {
  await inspectByName(fullName, options);
  return null;
}

async function findJournalId(journal, options = {}) {
  for (const [field, value] of [['issn', journal.issn], ['eissn', journal.eissn]]) {
    const journalid = await searchByIssn(value, options);
    if (journalid) return { journalid, method: field, conflicts: [] };
  }
  const conflicts = await inspectByName(journal.full, options);
  return {
    journalid: null,
    method: conflicts.length ? 'name_conflict' : 'none',
    conflicts
  };
}

module.exports = { findJournalId, inspectByName, parseResults, searchByIssn, searchByName };
