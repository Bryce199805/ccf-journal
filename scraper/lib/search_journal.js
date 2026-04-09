// Search LetPub for journalid by ISSN or name
const { fetchUrl } = require('./letpub_parser');

const RATE_LIMIT_WAIT = 30000; // 30s wait if rate limited

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isRateLimited(html) {
  return html.includes('速度过快') || html.includes('过于频繁') || html.length < 1000;
}

/**
 * Search LetPub by ISSN to find journalid
 * @param {string} issn
 * @param {number} retries - Number of retries on rate limit
 * @returns {string|null} journalid or null
 */
async function searchByIssn(issn, retries = 2) {
  if (!issn || issn === '-') return null;
  const url = `https://www.letpub.com.cn/index.php?page=journalapp&view=search&searchissn=${encodeURIComponent(issn)}`;
  const html = await fetchUrl(url);
  
  if (isRateLimited(html)) {
    if (retries > 0) {
      console.log(`[RATE-LIMIT] ISSN search ${issn} - waiting ${RATE_LIMIT_WAIT/1000}s (retries left: ${retries})`);
      await sleep(RATE_LIMIT_WAIT);
      return searchByIssn(issn, retries - 1);
    }
    return null;
  }
  
  const matches = [...html.matchAll(/journalid=(\d+)/gi)];
  return matches.length > 0 ? matches[0][1] : null;
}

/**
 * Search LetPub by name to find journalid
 * Tries to match the exact journal name from search results
 * @param {string} fullName - Full journal name
 * @param {string} abbr - Abbreviation (used as fallback)
 * @param {number} retries - Number of retries on rate limit
 * @returns {string|null} journalid or null
 */
async function searchByName(fullName, abbr, retries = 2) {
  // Try full name first
  const url = `https://www.letpub.com.cn/index.php?page=journalapp&view=search&searchname=${encodeURIComponent(fullName)}`;
  const html = await fetchUrl(url);
  
  if (isRateLimited(html)) {
    if (retries > 0) {
      console.log(`[RATE-LIMIT] Name search "${fullName}" - waiting ${RATE_LIMIT_WAIT/1000}s (retries left: ${retries})`);
      await sleep(RATE_LIMIT_WAIT);
      return searchByName(fullName, abbr, retries - 1);
    }
    return null;
  }
  
  // Extract all results with their names: journalid=XXX">NAME</a>
  const results = [...html.matchAll(/journalid=(\d+)[^>]*>([^<]*)<\/a>/gi)];
  
  if (results.length === 0) return null;
  
  // Try to find an exact or close match
  const normalizedName = fullName.toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (const m of results) {
    const resultName = m[2].trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (resultName === normalizedName) return m[1];
  }
  
  // Try partial match: result name contains the search name or vice versa
  for (const m of results) {
    const resultName = m[2].trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (resultName.includes(normalizedName) || normalizedName.includes(resultName)) return m[1];
  }
  
  // If only one result, use it
  if (results.length === 1) return results[0][1];
  
  // Try abbreviation as fallback
  if (abbr && abbr !== fullName) {
    await sleep(2000); // Small delay between searches
    const abbrUrl = `https://www.letpub.com.cn/index.php?page=journalapp&view=search&searchname=${encodeURIComponent(abbr)}`;
    const abbrHtml = await fetchUrl(abbrUrl);
    
    if (isRateLimited(abbrHtml)) {
      if (retries > 0) {
        console.log(`[RATE-LIMIT] Abbr search "${abbr}" - waiting ${RATE_LIMIT_WAIT/1000}s`);
        await sleep(RATE_LIMIT_WAIT);
        // Don't recurse on abbr, just return null
        return null;
      }
    }
    
    const abbrResults = [...abbrHtml.matchAll(/journalid=(\d+)[^>]*>([^<]*)<\/a>/gi)];
    const normalizedAbbr = abbr.toUpperCase().replace(/[^A-Z0-9]/g, '');
    for (const m of abbrResults) {
      const resultName = m[2].trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (resultName.includes(normalizedAbbr)) return m[1];
    }
  }
  
  // Return first result as last resort
  return results[0][1];
}

/**
 * Find journalid using ISSN (preferred) or name search
 * @param {object} journal - {issn, full, abbr}
 * @returns {{journalid: string|null, method: string}} method: 'issn'|'name'|'none'
 */
async function findJournalId(journal) {
  // Step 1: Try ISSN search (most reliable)
  const issn = journal.issn || '';
  if (issn && issn !== '-') {
    const id = await searchByIssn(issn);
    if (id) return { journalid: id, method: 'issn' };
  }
  
  // Small delay between ISSN and name search
  await sleep(2000);
  
  // Step 2: Try name search
  const id = await searchByName(journal.full, journal.abbr);
  if (id) return { journalid: id, method: 'name' };
  
  return { journalid: null, method: 'none' };
}

module.exports = { searchByIssn, searchByName, findJournalId };
