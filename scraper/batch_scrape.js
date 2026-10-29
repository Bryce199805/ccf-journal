const path = require('path');
const {
  atomicWriteJSON,
  fetchWithRetry,
  jitter,
  readJSON,
  sleep
} = require('./lib/runtime');
const catalogPolicy = require('./lib/catalog_policy');
const { evaluateCatalogEntry, isFresh } = catalogPolicy;
const POLICY_VERSION = catalogPolicy.POLICY_VERSION || 1;
const { findStrongMatches, normalizeISSN, normalizeName, strongMatch } = require('./lib/identity');
const { DETAIL_PARSER_VERSION, PARTITION_PARSER_VERSION, parseDetailHTML, strip } = require('./lib/letpub_parser');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_DIR = path.join(__dirname, 'output');
const TERMINAL_STATUSES = new Set(['success', 'rejected']);
const CACHEABLE_STATUSES = new Set(['success', 'rejected', 'not_found']);
const ALL_STATUSES = ['pending', 'success', 'rejected', 'not_found', 'parse_failed', 'rate_limited'];
const IDENTITY_MATCHER_VERSION = 7;
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
    ccfTitleAliasesFile: env.CCF_TITLE_ALIASES_FILE || path.join(__dirname, 'ccf_title_aliases.json'),
    ccfIdentityHintsFile: env.CCF_IDENTITY_HINTS_FILE || path.join(__dirname, 'ccf_identity_hints.json'),
    baselineFile: env.BASELINE_FILE || path.join(DATA_DIR, 'letpub_full.json'),
    stagingFile: env.STAGING_FILE || path.join(OUTPUT_DIR, 'letpub_full.staging.json'),
    progressFile: env.SCRAPE_PROGRESS_FILE || path.join(OUTPUT_DIR, 'scrape_progress.json'),
    reportFile: env.SCRAPE_REPORT_FILE || path.join(OUTPUT_DIR, 'scrape_report.json'),
    conflictFile: env.IDENTITY_CONFLICT_FILE || path.join(OUTPUT_DIR, 'identity_conflicts.json'),
    identityQuarantineFile: env.IDENTITY_QUARANTINE_FILE || path.join(OUTPUT_DIR, 'ccf_identity_quarantine.json'),
    maxJournals: env.MAX_JOURNALS ? Number(env.MAX_JOURNALS) : Infinity,
    canaryCCFJournals: Number(env.CANARY_CCF_JOURNALS || 1),
    forceRefresh: env.FORCE_REFRESH === '1',
    ccfOnly: env.CCF_ONLY === '1',
    nonCcfOnly: env.NON_CCF_ONLY === '1',
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

function buildTasks(ccfSource, candidates, legacyIdentities = {}, ccfTitleAliases = [], ccfIdentityHints = []) {
  const grouped = ccfRelations(ccfSource);
  const tasks = [];
  const aliasesByOfficialFull = new Map((ccfTitleAliases || []).map(alias => [
    normalizeName(alias.officialFull), alias
  ]));
  const hintsByOfficialFull = new Map((ccfIdentityHints || []).map(hint => [
    normalizeName(hint.officialFull), hint
  ]));
  const abbrCounts = new Map();
  for (const relations of grouped.values()) {
    const key = normalizeName(relations[0].abbr);
    abbrCounts.set(key, (abbrCounts.get(key) || 0) + 1);
  }
  for (const [groupKey, relations] of grouped) {
    const primary = relations[0];
    const legacyCandidate = legacyIdentities[primary.abbr] || {};
    const legacyTitleMatches = ['name', 'full', 'ccfFull'].some(field =>
      normalizeName(legacyCandidate[field]) === normalizeName(primary.full));
    const legacy = abbrCounts.get(normalizeName(primary.abbr)) === 1 && legacyTitleMatches
      ? legacyCandidate : {};
    const titleAlias = aliasesByOfficialFull.get(normalizeName(primary.full));
    const verifiedIdentity = titleAlias?.letpubIdentity || {};
    const identityHint = hintsByOfficialFull.get(normalizeName(primary.full)) || {};
    const authoritativeIdentity = titleAlias ? verifiedIdentity
      : identityHint.officialFull ? identityHint : legacy;
    tasks.push({
      key: 'ccf:' + groupKey,
      isCCF: true,
      full: primary.full,
      abbr: primary.abbr,
      issn: normalizeISSN(authoritativeIdentity.issn),
      eissn: normalizeISSN(authoritativeIdentity.eissn),
      journalid: authoritativeIdentity.journalid ? String(authoritativeIdentity.journalid) : '',
      identityAliases: [...new Set([
        titleAlias?.legacyFull,
        verifiedIdentity.name,
        identityHint.publisherTitle
      ].filter(Boolean))],
      hasAuthoritativeIdentity: Boolean(titleAlias || identityHint.officialFull),
      identitySourceUrl: identityHint.sourceUrl || identityHint.catalogUrl
        || titleAlias?.officialSource?.ccfUrl || verifiedIdentity.officialUrl || '',
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
      .filter(entry => entry.journalid && matchesCCFCatalog(entry, task)
        && (!task.hasAuthoritativeIdentity || strongMatch(task, entry).matched))
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
      issn: normalizeISSN(entry.issn),
      eissn: normalizeISSN(entry.eissn),
      wosZone: entry.wosStatus && entry.wosStatus !== 'available' ? '' : (entry.wosZone || ''),
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
  const relations = entry.ccfRelations?.length ? entry.ccfRelations : [{
    full: entry.ccfFull,
    abbr: entry.ccfAbbr
  }];
  const aliasNames = new Set((task.identityAliases || []).map(normalizeName));
  return relations.some(relation => normalizeName(relation.full) === taskFull
    || aliasNames.has(normalizeName(relation.full)));
}

function ccfSearchTitle(fullName) {
  return String(fullName || '').replace(/\s*[（(]\s*(?:原|formerly(?:\s+known\s+as)?|previously\s+known\s+as)[\s\S]*$/i, '').trim();
}

function ccfPlaceholder(task) {
  return resultEntry(task, {
    journalid: '',
    letpubUrl: '',
    name: task.full,
    issn: task.hasAuthoritativeIdentity ? task.issn || '' : '',
    eissn: task.hasAuthoritativeIdentity ? task.eissn || '' : '',
    identitySourceUrl: task.hasAuthoritativeIdentity ? task.identitySourceUrl || '' : '',
    letpubMatchStatus: 'unmatched',
    wosStatus: 'detail_not_found',
    wosReason: 'letpub_detail_not_found'
  });
}

function pruneRemovedCCFCatalogEntries(entries, ccfTasks) {
  const current = new Map();
  for (const task of ccfTasks) {
    current.set(normalizeName(task.full), task);
    for (const alias of task.identityAliases || []) current.set(normalizeName(alias), task);
  }
  const kept = [];
  for (const entry of entries) {
    if (entry.isCCF !== true) {
      kept.push(entry);
      continue;
    }
    const oldRelations = entry.ccfRelations?.length ? entry.ccfRelations : [{
      full: entry.ccfFull,
      abbr: entry.ccfAbbr,
      domain: entry.ccfDomain,
      level: entry.ccfLevel,
      publisher: entry.ccfPublisher,
      url: entry.ccfUrl
    }];
    const currentTask = oldRelations.map(relation => current.get(normalizeName(relation.full))).find(Boolean);
    const relations = currentTask?.ccfRelations || (currentTask ? [{
      full: currentTask.full,
      abbr: currentTask.abbr,
      domain: currentTask.ccfDomain || '',
      level: currentTask.level || '',
      publisher: currentTask.publisher || '',
      url: currentTask.url || ''
    }] : []);
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
  } else if (results[index].journalid) {
    const ccfFields = ['ccfRelations', 'ccfDomain', 'ccfLevel', 'ccfAbbr', 'ccfFull', 'ccfPublisher', 'ccfUrl'];
    results[index] = { ...results[index], isCCF: true,
      ...Object.fromEntries(ccfFields.map(field => [field, placeholder[field]])) };
  } else {
    results[index] = mergePreserving(results[index], placeholder);
    if (!results[index].name) results[index].name = task.full;
    if (!results[index].journalid) {
      results[index].letpubMatchStatus = 'unmatched';
      results[index].wosStatus = 'detail_not_found';
      results[index].wosReason = 'letpub_detail_not_found';
    }
  }
  return index;
}

function quarantineMismatchedCCFEntries(results, task, conflicts, identityQuarantine, timestamp) {
  if (!task.isCCF || !task.hasAuthoritativeIdentity) return results;
  const expected = [...new Set([normalizeISSN(task.issn), normalizeISSN(task.eissn)].filter(Boolean))];
  if (!expected.length) return results;
  return results.filter(entry => {
    if (!matchesCCFCatalog(entry, task)) return true;
    const actual = [...serialsOf(entry)];
    if (!actual.length || expected.some(serial => actual.includes(serial))) return true;
    conflicts.push({
      type: 'authoritative_ccf_serial_mismatch_quarantined',
      taskKey: task.key,
      expectedSerials: expected,
      actualSerials: actual,
      journalid: entry.journalid || null
    });
    identityQuarantine.push({
      taskKey: task.key,
      quarantinedAt: timestamp,
      reason: 'authoritative_ccf_serial_mismatch',
      expectedOfficialFull: task.full,
      expectedSerials: expected,
      actualSerials: actual,
      snapshot: entry
    });
    return false;
  });
}

function validateResolvedIdentity(task, detail) {
  const expectedName = normalizeName(task.full);
  const actualName = normalizeName(detail.name);
  const expectedSerials = new Set([normalizeISSN(task.issn), normalizeISSN(task.eissn)].filter(Boolean));
  const actualSerials = new Set([normalizeISSN(detail.issn), normalizeISSN(detail.eissn)].filter(Boolean));
  const nameMatches = Boolean(expectedName && actualName && (
    expectedName === actualName
    || (task.isCCF && normalizeName(ccfSearchTitle(task.full)) === actualName)
    || (task.isCCF && (task.identityAliases || []).some(alias => normalizeName(alias) === actualName))
  ));
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
    results.push({ journalid: String(match[1]), name: strip(match[2]) });
  }
  return results;
}

async function verifyAmbiguousCandidates(task, ids, request) {
  if (!task.hasAuthoritativeIdentity || ids.length > 5) return null;
  const matches = [];
  for (const journalid of ids) {
    const response = await request(`https://www.letpub.com.cn/index.php?journalid=${journalid}&page=journalapp&view=detail`);
    if (!response.ok) {
      if (response.terminalKind || response.kind === 'rate_limited') {
        return { ok: false, status: response.kind === 'rate_limited' || response.terminalKind === 'rate_limited'
          ? 'rate_limited' : 'not_found', reason: response.terminalKind || response.kind, candidates: ids };
      }
      continue;
    }
    try {
      const detail = parseDetailHTML(journalid, response.body, { fetchedAt: new Date().toISOString() });
      if (validateResolvedIdentity(task, detail).valid) matches.push({ journalid, response });
    } catch { /* An unparsable candidate cannot verify identity. */ }
  }
  if (matches.length !== 1) return null;
  return { ok: true, journalid: matches[0].journalid, method: 'verified_detail_candidate',
    prefetchedResponse: matches[0].response };
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
    if (!response.ok) return { ok: false,
      status: response.kind === 'rate_limited' ? 'rate_limited'
        : ['network_error', 'server_error'].includes(response.kind) ? 'parse_failed' : 'not_found',
      reason: response.kind };
    const ids = [...new Set(parseSearchResults(response.body).map(entry => entry.journalid))];
    if (ids.length === 1) return { ok: true, journalid: ids[0], method: field };
    if (ids.length > 1) {
      const verified = await verifyAmbiguousCandidates(task, ids, request);
      if (verified) return verified;
      return { ok: false, status: 'not_found', reason: 'identity_conflict', candidates: ids };
    }
  }
  if (task.full) {
    const searchTitle = task.isCCF ? ccfSearchTitle(task.full) : task.full;
    const url = 'https://www.letpub.com.cn/index.php?page=journalapp&view=search&searchname=' + encodeURIComponent(searchTitle);
    const response = await request(url);
    if (!response.ok) return { ok: false,
      status: response.kind === 'rate_limited' ? 'rate_limited'
        : ['network_error', 'server_error'].includes(response.kind) ? 'parse_failed' : 'not_found',
      reason: response.kind };
    const candidates = parseSearchResults(response.body);
    // A search result with an exact official title is a safe lead, not a
    // verified identity. Fetch the detail page and let validateResolvedIdentity
    // confirm its title (and serials when available) before saving any data.
    const exactTitleIds = [...new Set(candidates
      .filter(candidate => normalizeName(candidate.name) === normalizeName(searchTitle))
      .map(candidate => candidate.journalid))];
    if (exactTitleIds.length === 1) {
      return { ok: true, journalid: exactTitleIds[0], method: 'exact_title_candidate' };
    }
    if (exactTitleIds.length > 1) {
      return { ok: false, status: 'not_found', reason: 'identity_conflict', candidates: exactTitleIds };
    }
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
      catalogSource: 'cas-computer-science-1-3',
      inclusionReason: '中科院计算机科学大类1/2/3区',
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
  const duplicateIndexes = results
    .map((entry, entryIndex) => ({ entry, entryIndex }))
    .filter(item => item.entry.isCCF === false && safeRecordIdentityMatch(incoming, item.entry))
    .map(item => item.entryIndex);
  if (duplicateIndexes.length > 1) {
    conflicts.push({ type: 'ccf_non_ccf_identity_conflict', taskKey: task.key, matchedIndexes: duplicateIndexes });
    return { ok: false, reason: 'ccf_non_ccf_identity_conflict' };
  }
  if (indexes.length === 1) {
    let index = indexes[0];
    const promotedIndexes = duplicateIndexes.filter(duplicateIndex => duplicateIndex !== index);
    let merged = mergeFetchedSnapshot(results[index], incoming);
    for (const duplicateIndex of promotedIndexes) {
      merged = mergeFetchedSnapshot(mergePreserving(results[duplicateIndex], merged), incoming);
      conflicts.push({
        type: 'ccf_identity_promoted_from_non_ccf',
        taskKey: task.key,
        journalid: merged.journalid || null
      });
    }
    results[index] = merged;
    for (const duplicateIndex of promotedIndexes.sort((a, b) => b - a)) {
      results.splice(duplicateIndex, 1);
      if (duplicateIndex < index) index -= 1;
    }
    return { ok: true, index, method: promotedIndexes.length ? 'ccf_identity_promotion' : 'ccf_catalog' };
  }
  if (duplicateIndexes.length === 1) {
    const index = duplicateIndexes[0];
    results[index] = mergeFetchedSnapshot(mergePreserving(results[index], incoming), incoming);
    conflicts.push({ type: 'ccf_identity_promoted_from_non_ccf', taskKey: task.key, journalid: incoming.journalid || null });
    return { ok: true, index, method: 'ccf_identity_promotion' };
  }
  results.push(incoming);
  return { ok: true, index: results.length - 1, method: 'append_ccf' };
}

function removeStrongIdentity(results, target) {
  return results.filter(entry => !strongMatch(entry, target).matched);
}

function safeRecordIdentityMatch(left, right) {
  const leftId = left?.journalid ? String(left.journalid) : '';
  const rightId = right?.journalid ? String(right.journalid) : '';
  const leftSerials = serialsOf(left);
  const rightSerials = serialsOf(right);
  const serialMatch = [...leftSerials].some(serial => rightSerials.has(serial));
  if (leftId && rightId && leftId !== rightId) return false;
  if (leftId && rightId && leftId === rightId) {
    return !leftSerials.size || !rightSerials.size || serialMatch;
  }
  return serialMatch;
}

function statusCounts(tasks) {
  const counts = Object.fromEntries(ALL_STATUSES.map(status => [status, 0]));
  for (const task of Object.values(tasks)) counts[task.status] = (counts[task.status] || 0) + 1;
  return counts;
}

function shouldRunTask(task, state, config) {
  if (config.forceTaskKeys?.includes(task.key)) return true;
  if (state.status === 'not_found' && ['network_error', 'server_error'].includes(state.reason)) return true;
  if (task.isCCF && task.hasAuthoritativeIdentity && state.status === 'success'
    && state.identityCheck?.actual
    && !validateResolvedIdentity(task, state.identityCheck.actual).valid) return true;
  if (state.status === 'success' && state.detailParserVersion !== DETAIL_PARSER_VERSION) return true;
  if (
    state.status === 'success'
    && config.detailAccessMode === 'authenticated'
    && state.detailAccessMode !== 'authenticated'
    && !(config.nonCcfOnly && isFresh(state, config.refreshDays))
  ) return true;
  if (state.status === 'not_found' && state.identityMatcherVersion !== IDENTITY_MATCHER_VERSION) return true;
  if (
    state.status === 'rejected'
    && !task.isCCF
    && state.reason === 'cas_big_zone_not_1_or_2'
    && state.policy?.actualBigCategory === '计算机科学'
    && state.policy?.actualBigZone === '3区'
    && state.catalogPolicyVersion !== POLICY_VERSION
  ) return true;
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
  let runnable = tasks.filter(task => shouldRunTask(task, progress.tasks[task.key], config));
  const forcedOrder = new Map((config.forceTaskKeys || []).map((key, index) => [key, index]));
  if (forcedOrder.size) runnable = runnable.sort((left, right) =>
    (forcedOrder.get(left.key) ?? Number.MAX_SAFE_INTEGER)
      - (forcedOrder.get(right.key) ?? Number.MAX_SAFE_INTEGER));
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
    adequate: nonCCFTasks.length > 0 && acceptedNonCCF.length > 0
      && (ccfTasks.length === 0 || rejectedNonCCF.length > 0)
  };
}

async function runBatch(options = {}) {
  const config = { ...defaultConfig(options.env), ...options };
  if (!config.offline && config.delayMs < 12000) throw new Error('SCRAPE_DELAY_MS must be at least 12000 outside offline tests');
  const now = config.now || (() => new Date().toISOString());
  const ccfSource = readJSON(config.ccfFile, null);
  if (!ccfSource) throw new Error('CCF source file is missing: ' + config.ccfFile);
  const candidateOverrides = readJSON(config.abbrOverridesFile, {});
  const titleAliasDocument = readJSON(config.ccfTitleAliasesFile, { aliases: [] });
  const identityHintsDocument = readJSON(config.ccfIdentityHintsFile, { items: [] });
  const candidates = config.ccfOnly ? [] : resolveCandidateJournalAbbreviations(
    readJSON(config.candidatesFile, []),
    candidateOverrides
  );
  const historicalCandidates = (titleAliasDocument.excludedHistoricalCandidates || [])
    .filter(record => record.candidateRejectedAsCurrent === true);
  const historicalIds = new Set(historicalCandidates
    .map(record => String(record.candidateLetPubJournalid || '')).filter(Boolean));
  const historicalSerials = new Set(historicalCandidates
    .flatMap(record => [record.historicalISSN, record.historicalEISSN])
    .map(normalizeISSN).filter(Boolean));
  const excludedHistoricalCandidateTaskKeys = [];
  const legacyIdentities = readJSON(config.legacyIdentityFile, {});
  const baseline = normalizeBaseline(readJSON(config.baselineFile, []));
  const conflicts = readJSON(config.conflictFile, []);
  const identityQuarantine = readJSON(config.identityQuarantineFile, []);
  let results = consolidateJournalAliases(
    normalizeBaseline(readJSON(config.stagingFile, baseline)),
    conflicts
  );
  const rawTasks = buildTasks(
    ccfSource,
    candidates,
    legacyIdentities,
    titleAliasDocument.aliases || [],
    identityHintsDocument.items || []
  );
  results = applyCandidateJournalAbbreviations(results, candidates);
  const identitySources = [...baseline, ...results];
  const hydratedTasks = rawTasks.map(task => hydrateKnownIdentity(task, identitySources));
  const ccfTasks = hydratedTasks.filter(task => task.isCCF);
  if (!config.nonCcfOnly) results = pruneRemovedCCFCatalogEntries(results, ccfTasks);
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
  const eligibleTasks = hydratedTasks.filter(task => {
    if (task.isCCF) return true;
    if (historicalIds.has(String(task.journalid || ''))
      || [task.issn, task.eissn].map(normalizeISSN).some(serial => serial && historicalSerials.has(serial))) {
      excludedHistoricalCandidateTaskKeys.push(task.key);
      return false;
    }
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
  const tasks = config.nonCcfOnly
    ? eligibleTasks.filter(task => !task.isCCF)
    : eligibleTasks;
  const progress = readJSON(config.progressFile, { schemaVersion: 1, tasks: {} });
  for (const task of tasks) {
    if (!progress.tasks[task.key] && task.isCCF) {
      const priorNames = [task.full, ...(task.identityAliases || [])].map(normalizeName);
      const priorKeys = Object.keys(progress.tasks).filter(key => priorNames.some(name =>
        key.startsWith('ccf:' + name + '|')
      ));
      if (priorKeys.length === 1) progress.tasks[task.key] = { ...progress.tasks[priorKeys[0]] };
    }
    if (!progress.tasks[task.key]) progress.tasks[task.key] = { status: 'pending', updatedAt: now() };
    const state = progress.tasks[task.key];
    if (!task.isCCF && state.status === 'rejected' && state.policy
      && state.catalogPolicyVersion !== POLICY_VERSION
      && state.policy.latestCASYear && state.policy.actualBigCategory && state.policy.actualBigZone) {
      const reevaluated = evaluateCatalogEntry({ casPartitions: {
        [state.policy.latestCASYear]: {
          bigCategory: state.policy.actualBigCategory,
          bigZone: state.policy.actualBigZone
        }
      } });
      state.policy = reevaluated;
      state.catalogPolicyVersion = POLICY_VERSION;
      state.reason = reevaluated.reason;
      if (reevaluated.accepted) state.status = 'pending';
    }
    if (task.isCCF && task.hasAuthoritativeIdentity && state.status === 'success'
      && state.identityCheck?.actual
      && !validateResolvedIdentity(task, state.identityCheck.actual).valid) {
      results = quarantineMismatchedCCFEntries(results, task, conflicts, identityQuarantine, now());
      state.status = 'pending';
      delete state.identityCheck;
      delete state.journalid;
      delete state.method;
      delete state.policy;
      atomicWriteJSON(config.identityQuarantineFile, identityQuarantine);
    }
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
    if (task.isCCF && task.hasAuthoritativeIdentity && state.status !== 'success') {
      delete state.journalid;
      delete state.method;
    }
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
      if (state.status === 'parse_failed' && ['network_error', 'server_error'].includes(state.reason)) {
        delete state.identityMatcherVersion;
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
    const response = resolution.prefetchedResponse || (config.fetchDetailImpl
      ? await config.fetchDetailImpl(journalid, task)
      : await request(detailURL));
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
      if (task.isCCF && task.hasAuthoritativeIdentity) {
        results = quarantineMismatchedCCFEntries(results, task, conflicts, identityQuarantine, now());
        atomicWriteJSON(config.identityQuarantineFile, identityQuarantine);
        ensureCCFPlaceholder(results, task);
      } else if (task.isCCF) ensureCCFPlaceholder(results, task, { detachIdentity: true });
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
    if (!task.isCCF) state.catalogPolicyVersion = POLICY_VERSION;
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
    scope: config.ccfOnly ? 'ccf_only' : config.nonCcfOnly ? 'nonccf_only' : 'all',
    excludedHistoricalCandidateTaskKeys,
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
    identityQuarantineFile: config.identityQuarantineFile,
    identityQuarantinedCount: identityQuarantine.length,
    detailAccessMode: config.detailAccessMode,
    detailParserVersion: DETAIL_PARSER_VERSION
  };
  atomicWriteJSON(config.stagingFile, results);
  atomicWriteJSON(config.progressFile, progress);
  atomicWriteJSON(config.conflictFile, conflicts);
  atomicWriteJSON(config.reportFile, report);
  return { results, progress, conflicts, report, tasks, identityQuarantine };
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
  ccfPlaceholder,
  ccfRelations,
  defaultConfig,
  hydrateKnownIdentity,
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
  upsertCCFResult,
  validateResolvedIdentity
};
