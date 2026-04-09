// Simplified batch scraper with proper rate limiting and real-time logging
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_DIR = path.join(__dirname, 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'letpub_full.json');
const PROGRESS_FILE = path.join(OUTPUT_DIR, 'scrape_progress.json');
const LOG_FILE = path.join(OUTPUT_DIR, 'scrape_realtime.log');

const DELAY_MS = 12000;     // 12 seconds between requests
const RATE_LIMIT_WAIT = 60000; // 60s wait if rate limited

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(msg) {
  const line = new Date().toISOString().substr(11, 8) + ' ' + msg;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return { completed: {}, errors: {} };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function loadOutput() {
  if (fs.existsSync(OUTPUT_FILE)) {
    return JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
  }
  return [];
}

// Simple fetch with rate limit detection
async function fetchWithRetry(url, retries = 3) {
  const https = require('https');
  for (let i = 0; i < retries; i++) {
    try {
      const html = await new Promise((resolve, reject) => {
        const req = https.get(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(data));
          res.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      
      if (html.includes('速度过快') || html.includes('过于频繁') || html.length < 500) {
        log(`  [RATE-LIMIT] Waiting ${RATE_LIMIT_WAIT/1000}s (attempt ${i+1}/${retries})`);
        await sleep(RATE_LIMIT_WAIT);
        continue;
      }
      return html;
    } catch (e) {
      log(`  [FETCH-ERR] ${e.message} (attempt ${i+1}/${retries})`);
      if (i < retries - 1) await sleep(DELAY_MS);
    }
  }
  return null;
}

async function findJournalId(issn, fullName, abbr) {
  // Step 1: Try ISSN search
  if (issn && issn !== '-') {
    log(`  Searching by ISSN: ${issn}`);
    const url = `https://www.letpub.com.cn/index.php?page=journalapp&view=search&searchissn=${encodeURIComponent(issn)}`;
    const html = await fetchWithRetry(url);
    if (html) {
      const matches = [...html.matchAll(/journalid=(\d+)/gi)];
      if (matches.length > 0) {
        return { journalid: matches[0][1], method: 'issn' };
      }
    }
    await sleep(DELAY_MS);
  }
  
  // Step 2: Try name search
  log(`  Searching by name: ${fullName}`);
  const url = `https://www.letpub.com.cn/index.php?page=journalapp&view=search&searchname=${encodeURIComponent(fullName)}`;
  const html = await fetchWithRetry(url);
  if (html) {
    const results = [...html.matchAll(/journalid=(\d+)[^>]*>([^<]*)<\/a>/gi)];
    const normalizedName = fullName.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // Exact match
    for (const m of results) {
      if (m[2].trim().toUpperCase().replace(/[^A-Z0-9]/g, '') === normalizedName) {
        return { journalid: m[1], method: 'name_exact' };
      }
    }
    // Partial match
    for (const m of results) {
      const rn = m[2].trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (rn.includes(normalizedName) || normalizedName.includes(rn)) {
        return { journalid: m[1], method: 'name_partial' };
      }
    }
    // Single result
    if (results.length === 1) {
      return { journalid: results[0][1], method: 'name_single' };
    }
    // First result as fallback
    if (results.length > 0) {
      return { journalid: results[0][1], method: 'name_first' };
    }
  }
  
  return { journalid: null, method: 'none' };
}

async function parseDetail(journalid) {
  const { parseDetail: parseDetailLib } = require('./lib/letpub_parser');
  const url = `https://www.letpub.com.cn/index.php?journalid=${journalid}&page=journalapp&view=detail`;
  const html = await fetchWithRetry(url);
  if (!html) return null;
  
  // Check rate limit
  if (html.includes('速度过快') || html.includes('过于频繁')) {
    return null;
  }
  
  // Use the existing parser
  return parseDetailLib(journalid);
}

async function main() {
  // Load source data
  const journalsByDomain = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'all_journals_correct.json'), 'utf8'));
  const oldLetpubData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'all_letpub_data.json'), 'utf8'));
  
  // Flatten journals
  const journals = [];
  for (const [domain, entries] of Object.entries(journalsByDomain)) {
    for (const entry of entries) {
      const oldData = oldLetpubData[entry.abbr] || {};
      journals.push({
        ...entry,
        domain,
        issn: oldData.issn || ''
      });
    }
  }
  
  log(`Total journals: ${journals.length}`);
  
  const progress = loadProgress();
  const results = loadOutput();
  const completedCount = Object.keys(progress.completed).length;
  log(`Already completed: ${completedCount}`);
  
  for (let i = 0; i < journals.length; i++) {
    const journal = journals[i];
    const key = journal.abbr;
    
    if (progress.completed[key]) continue;
    
    log(`[${i+1}/${journals.length}] Processing: ${key} (${journal.full})`);
    
    // Find journalid
    let journalid = null;
    let method = '';
    
    const searchResult = await findJournalId(journal.issn, journal.full, journal.abbr);
    journalid = searchResult.journalid;
    method = searchResult.method;
    
    if (!journalid) {
      log(`  [FAIL] journalid not found`);
      progress.errors[key] = { reason: 'not_found', issn: journal.issn, name: journal.full };
      saveProgress(progress);
      await sleep(DELAY_MS);
      continue;
    }
    
    log(`  [FOUND] journalid=${journalid} via ${method}`);
    await sleep(DELAY_MS);
    
    // Parse detail page
    let data = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        data = await parseDetail(journalid);
        if (data && data.name) break;
        log(`  [EMPTY] Attempt ${attempt+1} - no data, retrying...`);
        await sleep(RATE_LIMIT_WAIT);
      } catch (e) {
        log(`  [ERROR] Attempt ${attempt+1}: ${e.message}`);
        await sleep(DELAY_MS * (attempt + 1));
      }
    }
    
    if (!data) {
      log(`  [FAIL] Could not parse detail`);
      progress.errors[key] = { journalid, reason: 'parse_failed' };
      saveProgress(progress);
      await sleep(DELAY_MS);
      continue;
    }
    
    // Merge and save
    const entry = {
      ccfDomain: journal.domain || '',
      ccfLevel: journal.level,
      ccfAbbr: journal.abbr,
      ccfFull: journal.full,
      ccfPublisher: journal.publisher || '',
      ccfUrl: journal.url || '',
      type: 'journal',
      ...data
    };
    
    const existingIdx = results.findIndex(r => r.ccfAbbr === entry.ccfAbbr);
    if (existingIdx >= 0) results[existingIdx] = entry;
    else results.push(entry);
    
    progress.completed[key] = { journalid, method, timestamp: new Date().toISOString() };
    delete progress.errors[key];
    saveProgress(progress);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    
    log(`  [DONE] IF:${data.impactFactor || 'N/A'} CAS2025:${data.cas2025?.bigZone || 'N/A'} Xinrui:${data.xinrui?.bigZone || 'N/A'}`);
    
    await sleep(DELAY_MS);
  }
  
  // Final summary
  const finalProgress = loadProgress();
  const successCount = Object.keys(finalProgress.completed).length;
  const failCount = Object.keys(finalProgress.errors).length;
  
  log(`\n========== COMPLETE ==========`);
  log(`Successful: ${successCount}/${journals.length}`);
  log(`Failed: ${failCount}`);
  
  if (failCount > 0) {
    log('Failed journals:');
    for (const [abbr, info] of Object.entries(finalProgress.errors)) {
      log(`  ${abbr}: ${info.reason}`);
    }
  }
}

main().catch(e => log(`Fatal: ${e.message}`));
