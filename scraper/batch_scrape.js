const path = require('path');
const {
  atomicWriteJSON,
  fetchWithRetry,
  jitter,
  readJSON,
  sleep
} = require('./lib/runtime');
const { evaluateCatalogEntry, isFresh } = require('./lib/catalog_policy');
const { findStrongMatches, normalizeISSN, normalizeName, strongMatch } = require('./lib/identity');
const { DETAIL_PARSER_VERSION, PARTITION_PARSER_VERSION, parseDetailHTML } = require('./lib/letpub_parser');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_DIR = path.join(__dirname, 'output');
const TERMINAL_STATUSES = new Set(['success', 'rejected']);
const CACHEABLE_STATUSES = new Set(['success', 'rejected', 'not_found']);
const ALL_STATUSES = ['pending', 'success', 'rejected', 'not_found', 'parse_failed', 'rate_limited'];
const IDENTITY_MATCHER_VERSION = 3;
const FETCHED_SNAPSHOT_FIELDS = new Set([
  'letpubUrl', 'fetchedAt', 'publisher', 'country', 'language', 'periodicity',
  'researchArea', 'isOA', 'goldOARatio', 'officialUrl', 'submissionUrl',
  'impactFactor', 'realtimeIF', 'selfCitationRate', 'fiveYearIF', 'jciValue',
  'hIndex', 'citeScore', 'sjr', 'snip', 'citeScoreRankings', 'reviewSpeed',
  'acceptanceRate', 'articleCount', 'sciType', 'letpubScore', 'xinrui',
  'casPartitions', 'latestCASYear', 'latestCAS', 'wosZone', 'wosStatus',
  'wosReason', 'jif', 'jci'
]);

function defaultConfig(env = process.env) {
  return {
    ccfFile: env.CCF_SOURCE_FILE || path.join(DATA_DIR, 'all_journals_correct.json'),
    legacyIdentityFile: env.LEGACY_IDENTITY_FILE || path.join(DATA_DIR, 'all_letpub_data.json'),
    candidatesFile: env.NON_CCF_FILE || env.DISCOVERY_CANDIDATES_FILE || path.join(OUTPUT_DIR, 'non_ccf_candidates.json'),
    abbrOverridesFile: env.JOURNAL_ABBR_OVERRIDES_FILE || path.join(__dirname, 'journal_abbr_overrides.json'),
    baselineFile: env.BASELINE_FILE || path.join(DATA_DIR, 'letpub_full.json'),
    stagingFile: env.STAGING_FILE || path.join(OUTPUT_DIR, 'letpub_full.staging.json'),
    progressFile: env.SCRAPE_PROGRESS_FILE || path.join(OUTPUT_DIR, 'scrape_progress.json'),
    reportFile: env.SCRAPE_REPORT_FILE || path.join(OUTPUT_DIR, 'scrape_report.json'),
    conflictFile: env.IDENTITY_CONFLICT_FILE || path.join(OUTPUT_DIR, 'identity_conflicts.json'),
    maxJournals: env.MAX_JOURNALS ? Number(env.MAX_JOURNALS) : Infinity,
    canaryCCFJournals: Number(env.CANARY_CCF_JOURNALS || 1),
    forceRefresh: env.FORCE_REFRESH === '1',
    refreshDays: Number(env.REFRESH_DAYS || 30),
    delayMs: Number(env.SCRAPE_DELAY_MS || 12000),
    jitterMs: Number(env.SCRAPE_JITTER_MS || 1000),
    timeoutMs: Number(env.SCRAPE_TIMEOUT_MS || 20000),
    retries: Number(env.SCRAPE_RETRIES || 3),
    backoffMs: Number(env.SCRAPE_BACKOFF_MS || env.SCRAPE_DELAY_MS || 12000),
    maxConsecutiveRateLimits: Number(env.MAX_CONSECUTIVE_RATE_LIMITS || 3),
    cookie: env.LETPUB_COOKIE || '',
    detailAccessMode: env.LETPUB_COOKIE ? 'authenticated' : 'anonymous'
  };
}

function ccfRelations(source) {
  const grouped = new Map();
  for (const [domain, entries] of Object.entries(source)) {
    for (const entry of entries) {
      const relation = {
        domain,
        level: entry.level || '',
        abbr: entry.abbr || '',
        full: entry.full || '',
        publisher: entry.publisher || '',
        url: entry.url || ''
      };
      const key = normalizeName(entry.full) + '|' + normalizeName(entry.abbr);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(relation);
    }
  }
  return grouped;
}

function buildTasks(ccfSource, candidates, legacyIdentities = {}) {
  const grouped = ccfRelations(ccfSource);
  const tasks = [];
  const abbrCounts = new Map();
  for (const relations of grouped.values()) {
    const key = normalizeName(relations[0].abbr);
    abbrCounts.set(key, (abbrCounts.get(key) || 0) + 1);
  }
  for (const [groupKey, relations] of grouped) {
    const primary = relations[0];
    const legacy = abbrCounts.get(normalizeName(primary.abbr)) === 1 ? legacyIdentities[primary.abbr] || {} : {};
    tasks.push({
      key: 'ccf:' + groupKey,
      isCCF: true,
      full: primary.full,
      abbr: primary.abbr,
      issn: normalizeISSN(legacy.issn),
      eissn: normalizeISSN(legacy.eissn),
      journalid: legacy.journalid ? String(legacy.journalid) : '',
      ccfRelations: relations
    });
  }
  for (const candidate of candidates) {
    tasks.push({
      key: 'nonccf:' + String(candidate.journalid || normalizeISSN(candidate.issn) || normalizeName(candidate.full)),
      isCCF: false,
      full: candidate.full || '',
      abbr: candidate.abbr || '',
      journalAbbr: candidate.journalAbbr || candidate.abbr || '',
      journalAbbrSource: candidate.journalAbbrSource || (candidate.abbr ? 'letpub_search' : ''),
      journalAbbrSourceUrl: candidate.journalAbbrSourceUrl || '',
      issn: normalizeISSN(candidate.issn),
      eissn: normalizeISSN(candidate.eissn),
      journalid: candidate.journalid ? String(candidate.journalid) : '',
      detailUrl: candidate.detailUrl || '',
      sourcePage: candidate.sourcePage || null,
      ccfRelations: []
    });
  }
  return tasks;
}

function hydrateKnownIdentity(task, baseline) {
  if (task.journalid) return task;
  if (task.isCCF) {
    const catalogMatches = [...new Map(baseline
      .filter(entry => entry.journalid && matchesCCFCatalog(entry, task))
      .map(entry => [String(entry.journalid), entry])).values()];
    if (catalogMatches.length === 1) {
      const entry = catalogMatches[0];
      return {
        ...task,
        journalid: String(entry.journalid),
        issn: task.issn || normalizeISSN(entry.issn),
        eissn: task.eissn || normalizeISSN(entry.eissn)
      };
    }
  }
  const matches = [...new Map(findStrongMatches(task, baseline).map(match => {
    const entry = match.entry;
    const identity = entry.journalid
      ? 'journalid:' + String(entry.journalid)
      : 'serial:' + [normalizeISSN(entry.issn), normalizeISSN(entry.eissn)].filter(Boolean).sort().join('|');
    return [identity, match];
  })).values()];
  if (matches.length === 1) {
    const entry = matches[0].entry;
    return {
      ...task,
      journalid: entry.journalid ? String(entry.journalid) : '',
      issn: task.issn || normalizeISSN(entry.issn),
      eissn: task.eissn || normalizeISSN(entry.eissn)
    };
  }
  return task;
}

function normalizeBaseline(entries) {
  return entries.map(entry => {
    const isCCF = entry.isCCF ?? true;
    const ccfRelations = entry.ccfRelations || (entry.ccfFull ? [{
      domain: entry.ccfDomain || '',
      level: entry.ccfLevel || '',
      abbr: entry.ccfAbbr || '',
      full: entry.ccfFull || '',
      publisher: entry.ccfPublisher || '',
      url: entry.ccfUrl || ''
    }] : []);
    return {
      ...entry,
      type: entry.type || 'journal',
      isCCF,
      journalid: entry.journalid ? String(entry.journalid) : '',
      name: entry.name || (isCCF ? entry.ccfFull || ccfRelations[0]?.full || '' : ''),
      ccfRelations
    };
  });
}

const ABBREVIATION_STOP_WORDS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'on', 'the', 'to', 'with']);
const PRESERVED_ACRONYMS = new Set(['CAAI', 'EPJ', 'IACR', 'ISA', 'OA', 'VLDB']);

function constructJournalAbbreviation(fullName) {
  const words = String(fullName || '').match(/[A-Za-z0-9]+/g) || [];
  if (words.length <= 1) return words[0] || '';
  return words.flatMap(word => {
    const lower = word.toLowerCase();
    if (ABBREVIATION_STOP_WORDS.has(lower)) return [];
    if (PRESERVED_ACRONYMS.has(word.toUpperCase())) return [word.toUpperCase()];
    return [word[0].toUpperCase()];
  }).join('');
}

function resolveCandidateJournalAbbreviations(candidates, overrides = {}) {
  return candidates.map(candidate => {
    const override = overrides[String(candidate.journalid || '')];
    if (override?.abbr) {
      return {
        ...candidate,
        journalAbbr: override.abbr,
        journalAbbrSource: override.source || 'curated',
        journalAbbrSourceUrl: override.sourceUrl || ''
      };
    }
    return {
      ...candidate,
      journalAbbr: constructJournalAbbreviation(candidate.full),
      journalAbbrSource: 'generated',
      journalAbbrSourceUrl: ''
    };
  });
}

function applyCandidateJournalAbbreviations(entries, candidates) {
  const byJournalID = new Map(candidates
    .filter(candidate => candidate.journalid && candidate.journalAbbr)
    .map(candidate => [String(candidate.journalid), candidate]));
  return entries.map(entry => {
    if (entry.isCCF || !entry.journalid) return entry;
    const candidate = byJournalID.get(String(entry.journalid));
    if (!candidate) return entry;
    return {
      ...entry,
      journalAbbr: candidate.journalAbbr,
      journalAbbrSource: candidate.journalAbbrSource,
      journalAbbrSourceUrl: candidate.journalAbbrSourceUrl
    };
  });
}

function matchesCCFCatalog(entry, task) {
  if (!task.isCCF) return false;
  const taskFull = normalizeName(task.full);
  const taskAbbr = normalizeName(task.abbr);
  const relations = entry.ccfRelations?.length ? entry.ccfRelations : [{
    full: entry.ccfFull,
    abbr: entry.ccfAbbr
  }];
  return relations.some(relation =>
    normalizeName(relation.full) === taskFull
    && normalizeName(relation.abbr) === taskAbbr
  );
}

function ccfPlaceholder(task) {
  return resultEntry(task, {
    journalid: '',
    letpubUrl: '',
    name: task.full,
    issn: '',
    eissn: '',
    letpubMatchStatus: 'unmatched',
    wosStatus: 'detail_not_found',
    wosReason: 'letpub_detail_not_found'
  });
}

function pruneRemovedCCFCatalogEntries(entries, ccfTasks) {
  const current = new Map(ccfTasks.map(task => [
    normalizeName(task.full) + '|' + normalizeName(task.abbr),
    task
  ]));
  const kept = [];
  for (const entry of entries) {
    if (entry.isCCF !== true) {
      kept.push(entry);
      continue;
    }
    const relations = (entry.ccfRelations?.length ? entry.ccfRelations : [{
      full: entry.ccfFull,
      abbr: entry.ccfAbbr,
      domain: entry.ccfDomain,
      level: entry.ccfLevel,
      publisher: entry.ccfPublisher,
      url: entry.ccfUrl
    }]).filter(relation => current.has(
      normalizeName(relation.full) + '|' + normalizeName(relation.abbr)
    ));
    if (!relations.length) continue;
    const first = relations[0];
    kept.push({
      ...entry,
      ccfRelations: relations,
      ccfDomain: first.domain || '',
      ccfLevel: first.level || '',
      ccfAbbr: first.abbr || '',
      ccfFull: first.full || '',
      ccfPublisher: first.publisher || '',
      ccfUrl: first.url || ''
    });
  }
  return kept;
}

function ensureCCFPlaceholder(results, task, { detachIdentity = false } = {}) {
  let indexes = results
    .map((entry, index) => matchesCCFCatalog(entry, task) ? index : -1)
    .filter(index => index >= 0);
  if (indexes.length === 0) {
    const strongMatches = findStrongMatches(task, results);
    if (strongMatches.length === 1) indexes = [strongMatches[0].index];
  }
  if (indexes.length === 0) {
    const namedMatches = results
      .map((entry, index) => ({ entry, index }))
      .filter(item => item.entry.isCCF === true
        && normalizeName(item.entry.name || item.entry.ccfFull) === normalizeName(task.full));
    if (namedMatches.length === 1) indexes = [namedMatches[0].index];
  }
  const placeholder = ccfPlaceholder(task);
  if (indexes.length === 0) {
    results.push(placeholder);
    return results.length - 1;
  }
  const index = indexes[0];
  if (detachIdentity) {
    results[index] = placeholder;
  } else {
    results[index] = mergePreserving(results[index], resultEntry(task, {}));
    if (!results[index].name) results[index].name = task.full;
    if (!results[index].journalid) {
      results[index].letpubMatchStatus = 'unmatched';
      results[index].wosStatus = 'detail_not_found';
      results[index].wosReason = 'letpub_detail_not_found';
    }
  }
  return index;
}

function validateResolvedIdentity(task, detail) {
  const expectedName = normalizeName(task.full);
  const actualName = normalizeName(detail.name);
  const expectedSerials = new Set([normalizeISSN(task.issn), normalizeISSN(task.eissn)].filter(Boolean));
  const actualSerials = new Set([normalizeISSN(detail.issn), normalizeISSN(detail.eissn)].filter(Boolean));
  const nameMatches = Boolean(expectedName && actualName && expectedName === actualName);
  const comparableSerials = expectedSerials.size > 0 && actualSerials.size > 0;
  const serialMatches = comparableSerials
    && [...expectedSerials].some(serial => actualSerials.has(serial));
  const nameCompatible = nameMatches || catalogNamesCompatible(task, detail, serialMatches);
  const reasons = [];
  if (task.isCCF && expectedName && !nameCompatible) reasons.push('name_mismatch');
  if (comparableSerials && !serialMatches) reasons.push('serial_mismatch');
  return {
    valid: reasons.length === 0,
    reason: reasons.length ? 'resolved_identity_mismatch' : 'identity_verified',
    reasons,
    expected: {
      name: task.full || null,
      issn: task.issn || null,
      eissn: task.eissn || null,
      journalid: task.journalid || null
    },
    actual: {
      name: detail.name || null,
      issn: detail.issn || null,
      eissn: detail.eissn || null,
      journalid: detail.journalid || null
    },
    nameMatches,
    nameCompatible,
    serialMatches: comparableSerials ? serialMatches : null
  };
}

function parseSearchResults(html) {
  const results = [];
  for (const match of String(html || '').matchAll(/journalid=(\d+)[^>]*>([^<]*)<\/a>/gi)) {
    results.push({ journalid: String(match[1]), name: match[2].trim() });
  }
  return results;
}

function createThrottledFetcher(config) {
  const sleepImpl = config.sleepImpl || sleep;
  const random = config.random || Math.random;
  let lastRequestAt = null;
  return async function throttledFetch(url) {
    if (lastRequestAt != null) {
      const elapsed = Date.now() - lastRequestAt;
      const wait = jitter(config.delayMs, config.jitterMs, random) - elapsed;
      if (wait > 0) await sleepImpl(wait);
    }
    lastRequestAt = Date.now();
    return fetchWithRetry(url, {
      fetchImpl: config.fetchImpl,
      retries: config.retries,
      timeoutMs: config.timeoutMs,
      backoffMs: config.backoffMs,
      jitterMs: config.jitterMs,
      random,
      sleepImpl,
      cookie: config.cookie
    });
  };
}

async function resolveJournal(task, request) {
  if (task.journalid) return { ok: true, journalid: task.journalid, method: 'known_journalid' };
  for (const [field, value] of [['issn', task.issn], ['eissn', task.eissn]]) {
    if (!value) continue;
    const url = 'https://www.letpub.com.cn/index.php?page=journalapp&view=search&searchissn=' + encodeURIComponent(value);
    const response = await request(url);
    if (!response.ok) return { ok: false, status: response.kind === 'rate_limited' ? 'rate_limited' : 'not_found', reason: response.kind };
    const ids = [...new Set(parseSearchResults(response.body).map(entry => entry.journalid))];
    if (ids.length === 1) return { ok: true, journalid: ids[0], method: field };
    if (ids.length > 1) return { ok: false, status: 'not_found', reason: 'identity_conflict', candidates: ids };
  }
  if (task.full) {
    const url = 'https://www.letpub.com.cn/index.php?page=journalapp&view=search&searchname=' + encodeURIComponent(task.full);
    const response = await request(url);
    if (!response.ok) return { ok: false, status: response.kind === 'rate_limited' ? 'rate_limited' : 'not_found', reason: response.kind };
    const candidates = parseSearchResults(response.body);
    return {
      ok: false,
      status: 'not_found',
      reason: candidates.length ? 'name_only_conflict' : 'not_found',
      candidates
    };
  }
  return { ok: false, status: 'not_found', reason: 'no_searchable_identity' };
}

function mergePreserving(existing, incoming) {
  const merged = { ...(existing || {}) };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === '' || value == null) continue;
    merged[key] = value;
  }
  return merged;
}

function mergeFetchedSnapshot(existing, incoming) {
  const merged = mergePreserving(existing, incoming);
  for (const field of FETCHED_SNAPSHOT_FIELDS) {
    if (Object.hasOwn(incoming || {}, field)) merged[field] = incoming[field];
  }
  return merged;
}

function serialsOf(entry) {
  return new Set([normalizeISSN(entry?.issn), normalizeISSN(entry?.eissn)].filter(Boolean));
}

function aliasNamesMatch(left, right) {
  const a = normalizeName(left?.name || left?.full || left?.ccfFull);
  const b = normalizeName(right?.name || right?.full || right?.ccfFull);
  if (!a || !b) return false;
  if (a === b) return true;
  const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
  const suffix = longer.startsWith(shorter + ' ') ? longer.slice(shorter.length + 1) : '';
  return /^[A-Z]{2,10}$/.test(suffix);
}

function catalogNamesCompatible(left, right, serialMatches = false) {
  const a = normalizeName(left?.name || left?.full || left?.ccfFull);
  const b = normalizeName(right?.name || right?.full || right?.ccfFull);
  if (!a || !b) return false;
  if (a === b || aliasNamesMatch(left, right)) return true;
  if (!serialMatches) return false;
  const withoutArticle = value => value.replace(/^THE /, '');
  if (withoutArticle(a) === withoutArticle(b)) return true;
  if (withoutArticle(a).startsWith(withoutArticle(b) + ' ')
    || withoutArticle(b).startsWith(withoutArticle(a) + ' ')) return true;
  const aTokens = new Set(withoutArticle(a).split(' '));
  const bTokens = new Set(withoutArticle(b).split(' '));
  const common = [...aTokens].filter(token => bTokens.has(token)).length;
  return common >= 3 && common / Math.min(aTokens.size, bTokens.size) >= 0.6;
}

function serialAliasMatch(left, right) {
  const leftSerials = serialsOf(left);
  const rightSerials = serialsOf(right);
  return aliasNamesMatch(left, right)
    && [...leftSerials].some(serial => rightSerials.has(serial));
}

function mergeJournalAliases(canonical, alias) {
  const canonicalID = canonical.journalid ? String(canonical.journalid) : '';
  const aliasIDs = [
    ...(canonical.letpubJournalidAliases || []),
    ...(alias.letpubJournalidAliases || []),
    alias.journalid ? String(alias.journalid) : ''
  ].filter(id => id && id !== canonicalID);
  const merged = {
    ...mergePreserving(alias, canonical),
    letpubJournalidAliases: [...new Set(aliasIDs)]
  };
  const serials = [canonical.issn, canonical.eissn, alias.issn, alias.eissn]
    .map(normalizeISSN)
    .filter(Boolean);
  merged.issn = normalizeISSN(canonical.issn) || serials[0] || '';
  const canonicalEISSN = normalizeISSN(canonical.eissn);
  merged.eissn = canonicalEISSN && canonicalEISSN !== merged.issn
    ? canonicalEISSN
    : serials.find(serial => serial !== merged.issn) || '';
  return merged;
}

function normalizedExternalURL(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return (url.hostname + url.pathname).replace(/\/+$/, '').toLowerCase();
  } catch {
    return '';
  }
}

function sameTitleSourceAliasMatch(left, right) {
  const sameTitle = normalizeName(left?.name) && normalizeName(left?.name) === normalizeName(right?.name);
  const leftURL = normalizedExternalURL(left?.officialUrl);
  const rightURL = normalizedExternalURL(right?.officialUrl);
  return Boolean(sameTitle && leftURL && leftURL === rightURL);
}

function aliasQuality(entry) {
  return Number(Boolean(entry?.isCCF)) * 100
    + Number(Boolean(entry?.wosZone)) * 10
    + Number(Array.isArray(entry?.jif) && entry.jif.length > 0) * 5
    + Number(Array.isArray(entry?.jci) && entry.jci.length > 0) * 5
    + Number(Boolean(entry?.sciType));
}

function consolidateJournalAliases(entries, conflicts = []) {
  const results = [...entries];
  for (let left = 0; left < results.length; left += 1) {
    for (let right = results.length - 1; right > left; right -= 1) {
      const serialAlias = serialAliasMatch(results[left], results[right]);
      const titleSourceAlias = sameTitleSourceAliasMatch(results[left], results[right]);
      if (!serialAlias && !titleSourceAlias) continue;
      const canonicalIndex = aliasQuality(results[right]) > aliasQuality(results[left]) ? right : left;
      const aliasIndex = canonicalIndex === left ? right : left;
      const canonical = results[canonicalIndex];
      const alias = results[aliasIndex];
      const merged = mergeJournalAliases(canonical, alias);
      conflicts.push({
        type: titleSourceAlias ? 'letpub_title_source_alias_merged' : 'letpub_journalid_alias_merged',
        canonicalJournalid: merged.journalid || null,
        aliasJournalid: alias.journalid || null,
        serials: [...serialsOf(merged)]
      });
      results.splice(aliasIndex, 1);
      if (aliasIndex === left) {
        results[right - 1] = merged;
        left -= 1;
        break;
      }
      results[left] = merged;
    }
  }
  return results;
}

function resultEntry(task, detail) {
  if (!task.isCCF) {
    return {
      ...detail,
      journalAbbr: task.journalAbbr || task.abbr || '',
      journalAbbrSource: task.journalAbbrSource || (task.abbr ? 'letpub_search' : ''),
      journalAbbrSourceUrl: task.journalAbbrSourceUrl || '',
      type: 'journal',
      isCCF: false,
      catalogSource: 'cas-computer-science-1-2',
      inclusionReason: '中科院计算机科学大类1/2区',
      ccfRelations: []
    };
  }
  const first = task.ccfRelations[0];
  return {
    ...detail,
    type: 'journal',
    isCCF: true,
    catalogSource: 'ccf',
    inclusionReason: 'CCF推荐目录',
    ccfRelations: task.ccfRelations,
    ccfDomain: first.domain,
    ccfLevel: first.level,
    ccfAbbr: first.abbr,
    ccfFull: first.full,
    ccfPublisher: first.publisher,
    ccfUrl: first.url
  };
}

function upsertResult(results, incoming, conflicts) {
  const matches = findStrongMatches(incoming, results);
  if (matches.length > 1) {
    conflicts.push({
      type: 'strong_identity_conflict',
      incoming: { journalid: incoming.journalid, issn: incoming.issn, eissn: incoming.eissn, name: incoming.name },
      matchedIndexes: matches.map(match => match.index)
    });
    return { ok: false, reason: 'strong_identity_conflict' };
  }
  if (matches.length === 1) {
    const index = matches[0].index;
    results[index] = mergeFetchedSnapshot(results[index], incoming);
    return { ok: true, index, method: matches[0].match.method };
  }
  const aliasMatches = results
    .map((entry, index) => ({ entry, index }))
    .filter(item => serialAliasMatch(incoming, item.entry));
  if (aliasMatches.length === 1) {
    const index = aliasMatches[0].index;
    results[index] = mergeFetchedSnapshot(mergeJournalAliases(results[index], incoming), incoming);
    conflicts.push({
      type: 'letpub_journalid_alias_merged',
      canonicalJournalid: results[index].journalid || null,
      aliasJournalid: incoming.journalid || null,
      serials: [...serialsOf(results[index])]
    });
    return { ok: true, index, method: 'serial_alias' };
  }
  const name = normalizeName(incoming.name || incoming.ccfFull);
  const nameMatches = results
    .map((entry, index) => ({ entry, index }))
    .filter(item => name && normalizeName(item.entry.name || item.entry.ccfFull) === name);
  if (nameMatches.length) {
    conflicts.push({
      type: 'name_only_conflict',
      name,
      incomingJournalid: incoming.journalid || null,
      matchedIndexes: nameMatches.map(match => match.index)
    });
  }
  results.push(incoming);
  return { ok: true, index: results.length - 1, method: 'append' };
}

function upsertCCFResult(results, task, incoming, conflicts) {
  const indexes = results
    .map((entry, index) => matchesCCFCatalog(entry, task) ? index : -1)
    .filter(index => index >= 0);
  if (indexes.length > 1) {
    conflicts.push({
      type: 'ccf_catalog_conflict',
      taskKey: task.key,
      matchedIndexes: indexes
    });
    return { ok: false, reason: 'ccf_catalog_conflict' };
  }
  if (indexes.length === 1) {
    let index = indexes[0];
    const duplicateIndexes = results
      .map((entry, entryIndex) => ({ entry, entryIndex }))
      .filter(item => item.entryIndex !== index
        && item.entry.isCCF === false
        && normalizeName(item.entry.name) === normalizeName(task.full))
      .map(item => item.entryIndex);
    let merged = mergeFetchedSnapshot(results[index], incoming);
    for (const duplicateIndex of duplicateIndexes) {
      merged = mergeFetchedSnapshot(mergePreserving(results[duplicateIndex], merged), incoming);
      conflicts.push({
        type: 'named_non_ccf_promoted_to_ccf',
        taskKey: task.key,
        journalid: merged.journalid || null
      });
    }
    results[index] = merged;
    for (const duplicateIndex of duplicateIndexes.sort((a, b) => b - a)) {
      results.splice(duplicateIndex, 1);
      if (duplicateIndex < index) index -= 1;
    }
    return { ok: true, index, method: duplicateIndexes.length ? 'ccf_name_promotion' : 'ccf_catalog' };
  }
  results.push(incoming);
  return { ok: true, index: results.length - 1, method: 'append_ccf' };
}

function removeStrongIdentity(results, target) {
  return results.filter(entry => !strongMatch(entry, target).matched);
}

function statusCounts(tasks) {
  const counts = Object.fromEntries(ALL_STATUSES.map(status => [status, 0]));
  for (const task of Object.values(tasks)) counts[task.status] = (counts[task.status] || 0) + 1;
  return counts;
}

function shouldRunTask(task, state, config) {
  if (state.status === 'success' && state.detailParserVersion !== DETAIL_PARSER_VERSION) return true;
  if (
    state.status === 'success'
    && config.detailAccessMode === 'authenticated'
    && state.detailAccessMode !== 'authenticated'
  ) return true;
  if (state.status === 'not_found' && state.identityMatcherVersion !== IDENTITY_MATCHER_VERSION) return true;
  if (
    state.status === 'rejected'
    && state.reason === 'missing_cas_partition'
    && state.partitionParserVersion !== PARTITION_PARSER_VERSION
  ) return true;
  if (TERMINAL_STATUSES.has(state.status) && state.identityCheck?.valid !== true) return true;
  const fresh = CACHEABLE_STATUSES.has(state.status) && isFresh(state, config.refreshDays);
  return config.forceRefresh || !fresh;
}

function selectTasksForRun(tasks, progress, config) {
  const runnable = tasks.filter(task => shouldRunTask(task, progress.tasks[task.key], config));
  if (!Number.isFinite(config.maxJournals)) return runnable;
  const limit = Math.max(0, Math.floor(config.maxJournals));
  if (limit === 0) return [];
  const ccf = runnable.filter(task => task.isCCF);
  const nonCCF = runnable.filter(task => !task.isCCF);
  const ccfQuota = Math.min(ccf.length, limit, Math.max(1, Math.floor(config.canaryCCFJournals)));
  const selected = [...ccf.slice(0, ccfQuota), ...nonCCF.slice(0, limit - ccfQuota)];
  if (selected.length < limit) {
    const selectedKeys = new Set(selected.map(task => task.key));
    selected.push(...runnable.filter(task => !selectedKeys.has(task.key)).slice(0, limit - selected.length));
  }
  return selected;
}

function canaryCoverage(tasks, progress) {
  const coveredTasks = tasks.filter(task => progress.tasks[task.key].canaryAttempted === true);
  const ccfTasks = coveredTasks.filter(task => task.isCCF);
  const nonCCFTasks = coveredTasks.filter(task => !task.isCCF);
  const acceptedNonCCF = nonCCFTasks.filter(task => progress.tasks[task.key].status === 'success');
  const rejectedNonCCF = nonCCFTasks.filter(task => progress.tasks[task.key].status === 'rejected');
  return {
    selectedCCF: ccfTasks.length,
    selectedNonCCF: nonCCFTasks.length,
    acceptedNonCCF: acceptedNonCCF.length,
    rejectedNonCCF: rejectedNonCCF.length,
    ccfTaskKeys: ccfTasks.map(task => task.key),
    acceptedNonCCFTaskKeys: acceptedNonCCF.map(task => task.key),
    rejectedNonCCFTaskKeys: rejectedNonCCF.map(task => task.key),
    adequate: ccfTasks.length > 0 && acceptedNonCCF.length > 0 && rejectedNonCCF.length > 0
  };
}

async function runBatch(options = {}) {
  const config = { ...defaultConfig(options.env), ...options };
  if (!config.offline && config.delayMs < 12000) throw new Error('SCRAPE_DELAY_MS must be at least 12000 outside offline tests');
  const now = config.now || (() => new Date().toISOString());
  const ccfSource = readJSON(config.ccfFile, null);
  if (!ccfSource) throw new Error('CCF source file is missing: ' + config.ccfFile);
  const candidateOverrides = readJSON(config.abbrOverridesFile, {});
  const candidates = resolveCandidateJournalAbbreviations(
    readJSON(config.candidatesFile, []),
    candidateOverrides
  );
  const legacyIdentities = readJSON(config.legacyIdentityFile, {});
  const baseline = normalizeBaseline(readJSON(config.baselineFile, []));
  const conflicts = readJSON(config.conflictFile, []);
  let results = consolidateJournalAliases(
    normalizeBaseline(readJSON(config.stagingFile, baseline)),
    conflicts
  );
  const rawTasks = buildTasks(ccfSource, candidates, legacyIdentities);
  results = applyCandidateJournalAbbreviations(results, candidates);
  const identitySources = [...baseline, ...results];
  const hydratedTasks = rawTasks.map(task => hydrateKnownIdentity(task, identitySources));
  const ccfTasks = hydratedTasks.filter(task => task.isCCF);
  results = pruneRemovedCCFCatalogEntries(results, ccfTasks);
  const legacyCCFIdentities = ccfTasks.map(task => ({ ...task }));
  const namedCCFOwners = new Map();
  for (const candidate of hydratedTasks.filter(task => !task.isCCF)) {
    const matches = ccfTasks.filter(ccf => normalizeName(ccf.full) === normalizeName(candidate.full));
    if (matches.length !== 1) continue;
    const owner = matches[0];
    owner.journalid = candidate.journalid || owner.journalid;
    owner.issn = candidate.issn || owner.issn;
    owner.eissn = candidate.eissn || owner.eissn;
    namedCCFOwners.set(candidate.key, owner);
  }
  const tasks = hydratedTasks.filter(task => {
    if (task.isCCF) return true;
    const strongCCF = [...ccfTasks, ...legacyCCFIdentities].find(ccf =>
      strongMatch(task, ccf).matched || serialAliasMatch(task, ccf)
    );
    if (strongCCF) {
      conflicts.push({ type: 'candidate_is_ccf', taskKey: task.key, ccfTaskKey: strongCCF.key });
      return false;
    }
    const namedOwner = namedCCFOwners.get(task.key);
    if (namedOwner) {
      conflicts.push({ type: 'candidate_is_ccf_name', taskKey: task.key, ccfTaskKey: namedOwner.key });
      return false;
    }
    const namedCCF = ccfTasks.filter(ccf => normalizeName(ccf.full) === normalizeName(task.full));
    if (namedCCF.length) {
      conflicts.push({
        type: 'source_name_only_conflict',
        taskKey: task.key,
        ccfTaskKeys: namedCCF.map(ccf => ccf.key)
      });
    }
    return true;
  });
  const progress = readJSON(config.progressFile, { schemaVersion: 1, tasks: {} });
  for (const task of tasks) {
    if (!progress.tasks[task.key]) progress.tasks[task.key] = { status: 'pending', updatedAt: now() };
    if (task.isCCF) ensureCCFPlaceholder(results, task);
  }
  const request = config.request || createThrottledFetcher(config);
  const selectedTasks = selectTasksForRun(tasks, progress, config);
  const partialRun = Number.isFinite(config.maxJournals);
  let attempted = 0;
  let consecutiveRateLimits = 0;
  let haltedReason = null;
  const recordOutcome = status => {
    consecutiveRateLimits = status === 'rate_limited' ? consecutiveRateLimits + 1 : 0;
    if (consecutiveRateLimits < config.maxConsecutiveRateLimits) return false;
    haltedReason = 'consecutive_rate_limits';
    return true;
  };

  for (const task of selectedTasks) {
    const state = progress.tasks[task.key];
    attempted += 1;
    if (partialRun) state.canaryAttempted = true;
    state.status = 'pending';
    state.updatedAt = now();
    atomicWriteJSON(config.progressFile, progress);

    const resolution = config.resolveJournalImpl
      ? await config.resolveJournalImpl(task)
      : await resolveJournal(task, request);
    if (!resolution.ok) {
      state.status = resolution.status || 'not_found';
      state.reason = resolution.reason || state.status;
      state.candidates = resolution.candidates || [];
      state.updatedAt = now();
      if (state.status === 'not_found' && state.reason !== 'network_error') {
        state.identityMatcherVersion = IDENTITY_MATCHER_VERSION;
      }
      if (state.reason.includes('conflict')) conflicts.push({ type: state.reason, taskKey: task.key, candidates: state.candidates });
      if (task.isCCF) ensureCCFPlaceholder(results, task);
      atomicWriteJSON(config.stagingFile, results);
      atomicWriteJSON(config.progressFile, progress);
      atomicWriteJSON(config.conflictFile, conflicts);
      if (config.onProgress) config.onProgress({ key: task.key, status: state.status, attempted, total: selectedTasks.length });
      if (recordOutcome(state.status)) break;
      continue;
    }

    const journalid = String(resolution.journalid);
    const detailURL = 'https://www.letpub.com.cn/index.php?journalid=' + journalid + '&page=journalapp&view=detail';
    const response = config.fetchDetailImpl
      ? await config.fetchDetailImpl(journalid, task)
      : await request(detailURL);
    if (!response.ok) {
      state.status = response.kind === 'rate_limited' ? 'rate_limited' : 'parse_failed';
      state.reason = response.kind;
      state.journalid = journalid;
      state.updatedAt = now();
      atomicWriteJSON(config.progressFile, progress);
      if (config.onProgress) config.onProgress({ key: task.key, status: state.status, attempted, total: selectedTasks.length });
      if (recordOutcome(state.status)) break;
      continue;
    }

    let detail;
    try {
      detail = parseDetailHTML(journalid, response.body, { fetchedAt: now() });
    } catch (error) {
      state.status = error.code === 'RATE_LIMITED' ? 'rate_limited' : 'parse_failed';
      state.reason = error.message;
      state.journalid = journalid;
      state.updatedAt = now();
      atomicWriteJSON(config.progressFile, progress);
      if (config.onProgress) config.onProgress({ key: task.key, status: state.status, attempted, total: selectedTasks.length });
      if (recordOutcome(state.status)) break;
      continue;
    }
    const identityCheck = validateResolvedIdentity(task, detail);
    state.identityCheck = identityCheck;
    state.identityMatcherVersion = IDENTITY_MATCHER_VERSION;
    if (!identityCheck.valid) {
      state.status = 'not_found';
      state.reason = identityCheck.reason;
      state.journalid = null;
      state.updatedAt = now();
      conflicts.push({
        type: 'resolved_identity_mismatch',
        taskKey: task.key,
        resolutionMethod: resolution.method,
        ...identityCheck
      });
      if (task.isCCF) ensureCCFPlaceholder(results, task, { detachIdentity: true });
      atomicWriteJSON(config.stagingFile, results);
      atomicWriteJSON(config.progressFile, progress);
      atomicWriteJSON(config.conflictFile, conflicts);
      if (config.onProgress) config.onProgress({ key: task.key, status: state.status, attempted, total: selectedTasks.length });
      recordOutcome(state.status);
      continue;
    }
    const decision = evaluateCatalogEntry(detail, { isCCF: task.isCCF });
    state.partitionParserVersion = PARTITION_PARSER_VERSION;
    state.detailParserVersion = DETAIL_PARSER_VERSION;
    state.detailAccessMode = config.detailAccessMode;
    state.journalid = journalid;
    state.method = resolution.method;
    state.policy = decision;
    state.updatedAt = now();
    if (!decision.accepted) {
      state.status = 'rejected';
      state.reason = decision.reason;
      results = removeStrongIdentity(results, detail);
      atomicWriteJSON(config.stagingFile, results);
      atomicWriteJSON(config.progressFile, progress);
      if (config.onProgress) config.onProgress({ key: task.key, status: state.status, attempted, total: selectedTasks.length });
      recordOutcome(state.status);
      continue;
    }
    const incoming = resultEntry(task, {
      ...detail,
      letpubMatchStatus: 'verified',
      scrapeSchemaVersion: DETAIL_PARSER_VERSION
    });
    const saved = task.isCCF
      ? upsertCCFResult(results, task, incoming, conflicts)
      : upsertResult(results, incoming, conflicts);
    if (!saved.ok) {
      state.status = 'parse_failed';
      state.reason = saved.reason;
    } else {
      state.status = 'success';
      state.reason = decision.reason;
    }
    atomicWriteJSON(config.stagingFile, results);
    atomicWriteJSON(config.progressFile, progress);
    atomicWriteJSON(config.conflictFile, conflicts);
    if (config.onProgress) config.onProgress({ key: task.key, status: state.status, attempted, total: selectedTasks.length });
    recordOutcome(state.status);
  }

  results = consolidateJournalAliases(results, conflicts);
  const uniqueConflicts = [...new Map(conflicts.map(conflict => [JSON.stringify(conflict), conflict])).values()];
  conflicts.splice(0, conflicts.length, ...uniqueConflicts);
  const currentStates = Object.fromEntries(tasks.map(task => [task.key, progress.tasks[task.key]]));
  const counts = statusCounts(currentStates);
  const countsClosed = Object.values(counts).reduce((sum, value) => sum + value, 0) === tasks.length;
  const mode = partialRun ? 'partial' : 'full';
  const coverage = mode === 'partial' ? canaryCoverage(tasks, progress) : null;
  const report = {
    schemaVersion: 1,
    generatedAt: now(),
    totalTasks: tasks.length,
    attemptedThisRun: attempted,
    selectedTaskKeys: selectedTasks.map(task => task.key),
    mode,
    canaryCoverage: coverage,
    counts,
    countsClosed,
    closed: countsClosed && counts.pending === 0 && counts.parse_failed === 0 && counts.rate_limited === 0,
    haltedEarly: Boolean(haltedReason),
    haltedReason,
    consecutiveRateLimits,
    stagingFile: config.stagingFile,
    progressFile: config.progressFile,
    conflictCount: conflicts.length,
    detailAccessMode: config.detailAccessMode,
    detailParserVersion: DETAIL_PARSER_VERSION
  };
  atomicWriteJSON(config.stagingFile, results);
  atomicWriteJSON(config.progressFile, progress);
  atomicWriteJSON(config.conflictFile, conflicts);
  atomicWriteJSON(config.reportFile, report);
  return { results, progress, conflicts, report, tasks };
}

async function main() {
  const result = await runBatch({
    onProgress: event => console.log(
      '[' + event.attempted + '/' + event.total + '] ' + event.status + ' ' + event.key
    )
  });
  console.log(JSON.stringify(result.report));
  if (result.report.counts.rate_limited > 0) process.exitCode = 2;
  else if (result.report.mode === 'partial' && !result.report.canaryCoverage.adequate) process.exitCode = 3;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  ALL_STATUSES,
  applyCandidateJournalAbbreviations,
  constructJournalAbbreviation,
  buildTasks,
  ccfRelations,
  defaultConfig,
  mergePreserving,
  mergeFetchedSnapshot,
  consolidateJournalAliases,
  normalizeBaseline,
  parseSearchResults,
  pruneRemovedCCFCatalogEntries,
  resolveCandidateJournalAbbreviations,
  resolveJournal,
  runBatch,
  selectTasksForRun,
  statusCounts,
  serialAliasMatch,
  sameTitleSourceAliasMatch,
  upsertResult,
  validateResolvedIdentity
};
