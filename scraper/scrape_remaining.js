// Targeted scraper for remaining journals (missing + bad data)
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'letpub_full.json');
const TODO_FILE = path.join(OUTPUT_DIR, 'todo_list.json');
const PROGRESS_FILE = path.join(OUTPUT_DIR, 'scrape_remaining_progress.json');
const LOG_FILE = path.join(OUTPUT_DIR, 'scrape_remaining.log');

const DELAY_MS = 12000;
const RATE_LIMIT_WAIT = 60000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(msg) {
  const line = new Date().toISOString().substr(11, 8) + ' ' + msg;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

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

async function findJournalId(issn, fullName) {
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
  
  log(`  Searching by name: ${fullName}`);
  const url = `https://www.letpub.com.cn/index.php?page=journalapp&view=search&searchname=${encodeURIComponent(fullName)}`;
  const html = await fetchWithRetry(url);
  if (html) {
    const results = [...html.matchAll(/journalid=(\d+)[^>]*>([^<]*)<\/a>/gi)];
    const normalizedName = fullName.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    for (const m of results) {
      if (m[2].trim().toUpperCase().replace(/[^A-Z0-9]/g, '') === normalizedName) {
        return { journalid: m[1], method: 'name_exact' };
      }
    }
    for (const m of results) {
      const rn = m[2].trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (rn.includes(normalizedName) || normalizedName.includes(rn)) {
        return { journalid: m[1], method: 'name_partial' };
      }
    }
    if (results.length === 1) {
      return { journalid: results[0][1], method: 'name_single' };
    }
    if (results.length > 0) {
      return { journalid: results[0][1], method: 'name_first' };
    }
  }
  return { journalid: null, method: 'none' };
}

async function parseDetailPage(journalid) {
  const { parseDetail } = require('./lib/letpub_parser');
  return parseDetail(journalid);
}

async function main() {
  const todoList = JSON.parse(fs.readFileSync(TODO_FILE, 'utf8'));
  const results = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
  
  let progress = {};
  if (fs.existsSync(PROGRESS_FILE)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  
  log(`Starting scrape of ${todoList.length} remaining journals`);
  log(`Current output: ${results.length} entries`);
  
  // Load ISSN data from old letpub data if available
  let oldData = {};
  const oldPath = path.join(__dirname, '..', 'data', 'all_letpub_data.json');
  if (fs.existsSync(oldPath)) {
    oldData = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
  }
  
  for (let i = 0; i < todoList.length; i++) {
    const item = todoList[i];
    const key = item.abbr;
    
    if (progress[key] && progress[key].success) {
      log(`[${i+1}/${todoList.length}] SKIP: ${key} (already done)`);
      continue;
    }
    
    log(`[${i+1}/${todoList.length}] Processing: ${key} (${item.full}) [${item.reason}]`);
    
    // For bad_data entries, we already have the journalid
    let journalid = item.journalid || null;
    let method = item.journalid ? 'cached_id' : '';
    
    // Find journalid if not known
    if (!journalid || journalid === '0') {
      const issn = oldData[key]?.issn || '';
      const searchResult = await findJournalId(issn, item.full);
      journalid = searchResult.journalid;
      method = searchResult.method;
    }
    
    if (!journalid || journalid === '0') {
      log(`  [FAIL] journalid not found`);
      progress[key] = { success: false, reason: 'not_found', timestamp: new Date().toISOString() };
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
      await sleep(DELAY_MS);
      continue;
    }
    
    log(`  [FOUND] journalid=${journalid} via ${method}`);
    if (method !== 'cached_id') await sleep(DELAY_MS);
    
    // Parse detail page
    let data = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        data = await parseDetailPage(journalid);
        if (data && data.name) break;
        log(`  [EMPTY] Attempt ${attempt+1} - no data, retrying...`);
        await sleep(RATE_LIMIT_WAIT);
      } catch (e) {
        log(`  [ERROR] Attempt ${attempt+1}: ${e.message}`);
        await sleep(DELAY_MS * (attempt + 1));
      }
    }
    
    if (!data || !data.name) {
      log(`  [FAIL] Could not parse detail for journalid=${journalid}`);
      progress[key] = { success: false, journalid, reason: 'parse_failed', timestamp: new Date().toISOString() };
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
      await sleep(DELAY_MS);
      continue;
    }
    
    // Merge and save
    const entry = {
      ccfDomain: item.domain || '',
      ccfLevel: item.level,
      ccfAbbr: item.abbr,
      ccfFull: item.full,
      ccfPublisher: item.publisher || '',
      ccfUrl: item.url || '',
      type: 'journal',
      ...data
    };
    
    const existingIdx = results.findIndex(r => r.ccfAbbr === entry.ccfAbbr);
    if (existingIdx >= 0) results[existingIdx] = entry;
    else results.push(entry);
    
    progress[key] = { success: true, journalid, method, timestamp: new Date().toISOString() };
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    
    log(`  [DONE] IF:${data.impactFactor || 'N/A'} CAS2025:${data.cas2025?.bigZone || 'N/A'} Xinrui:${data.xinrui?.bigZone || 'N/A'}`);
    
    await sleep(DELAY_MS);
  }
  
  // Summary
  const successCount = Object.values(progress).filter(p => p.success).length;
  const failCount = Object.values(progress).filter(p => !p.success).length;
  log(`\n========== COMPLETE ==========`);
  log(`Successful: ${successCount}/${todoList.length}`);
  log(`Failed: ${failCount}`);
}

main().catch(e => log(`Fatal: ${e.message}`));
