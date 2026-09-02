const fs = require('fs');
const path = require('path');
const { atomicWriteJSON, readJSON } = require('./lib/runtime');
const { evaluateCatalogEntry } = require('./lib/catalog_policy');
const { normalizeISSN, normalizeName } = require('./lib/identity');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_DIR = path.join(__dirname, 'output');

function relationKey(relation) {
  return [
    normalizeName(relation.full),
    normalizeName(relation.abbr),
    relation.domain || '',
    relation.level || ''
  ].join('|');
}

function expectedCCFRelations(source) {
  const relations = [];
  for (const [domain, entries] of Object.entries(source || {})) {
    for (const entry of entries) relations.push({ ...entry, domain });
  }
  return relations;
}

function actualCCFRelations(entries) {
  const relations = [];
  for (const entry of entries.filter(item => item.isCCF === true)) {
    if (Array.isArray(entry.ccfRelations) && entry.ccfRelations.length) {
      relations.push(...entry.ccfRelations);
    } else if (entry.ccfFull) {
      relations.push({
        full: entry.ccfFull,
        abbr: entry.ccfAbbr,
        domain: entry.ccfDomain,
        level: entry.ccfLevel
      });
    }
  }
  return relations;
}

function validateDataset(input, context = {}) {
  const errors = [];
  const warnings = [];
  const ccfSource = context.ccfSource || {};
  const baseline = context.baseline || [];
  const scrapeReport = context.scrapeReport || null;
  const maxDropRatio = context.maxDropRatio ?? 0.2;
  if (!Array.isArray(input)) {
    return { ok: false, errors: [{ code: 'invalid_root', message: 'dataset root must be an array' }], warnings, stats: {} };
  }

  const journalIDs = new Map();
  const serials = new Map();
  let ccfCount = 0;
  let nonCCFCount = 0;
  for (const [index, entry] of input.entries()) {
    for (const field of ['journalid', 'name', 'type', 'isCCF']) {
      if (entry[field] === undefined || entry[field] === null || entry[field] === '') {
        errors.push({ code: 'missing_required_field', index, field });
      }
    }
    if (entry.type !== 'journal') errors.push({ code: 'invalid_type', index, actual: entry.type });
    if (entry.isCCF === true) ccfCount += 1;
    else if (entry.isCCF === false) {
      nonCCFCount += 1;
      const decision = evaluateCatalogEntry(entry);
      if (!decision.accepted) errors.push({ code: 'ineligible_non_ccf', index, journalid: entry.journalid, ...decision });
    } else {
      errors.push({ code: 'invalid_is_ccf', index, actual: entry.isCCF });
    }
    const id = entry.journalid ? String(entry.journalid) : '';
    if (id) {
      if (journalIDs.has(id)) errors.push({ code: 'duplicate_journalid', journalid: id, indexes: [journalIDs.get(id), index] });
      else journalIDs.set(id, index);
    }
    for (const field of ['issn', 'eissn']) {
      if (!entry[field]) continue;
      const normalized = normalizeISSN(entry[field]);
      if (!normalized || !/^\d{4}-[\dX]{4}$/.test(normalized)) {
        errors.push({ code: 'invalid_issn', index, field, value: entry[field] });
        continue;
      }
      if (!serials.has(normalized)) serials.set(normalized, []);
      serials.get(normalized).push({ index, field, journalid: id });
    }
  }
  for (const [serial, uses] of serials) {
    const identities = new Set(uses.map(use => use.journalid || 'index:' + use.index));
    if (identities.size > 1) errors.push({ code: 'issn_identity_conflict', serial, uses });
  }

  const expected = expectedCCFRelations(ccfSource);
  const actualKeys = new Set(actualCCFRelations(input).map(relationKey));
  const baselineKeys = new Set(actualCCFRelations(baseline.map(entry => ({
    ...entry,
    isCCF: entry.isCCF ?? true
  }))).map(relationKey));
  const lostBaselineRelations = [...baselineKeys].filter(key => !actualKeys.has(key));
  if (lostBaselineRelations.length) errors.push({
    code: 'lost_baseline_ccf_relations',
    count: lostBaselineRelations.length,
    relationKeys: lostBaselineRelations
  });
  const missingRelations = expected.filter(relation => !actualKeys.has(relationKey(relation)));
  const pendingTasks = Number(scrapeReport?.counts?.pending || 0);
  if (missingRelations.length) {
    const issue = {
      code: 'missing_ccf_relations',
      count: missingRelations.length,
      relations: missingRelations
    };
    if (pendingTasks === 0) errors.push(issue);
    else warnings.push({ ...issue, code: 'pending_ccf_relations' });
  }

  if (scrapeReport) {
    const counts = scrapeReport.counts || {};
    const counted = Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
    if (counted !== scrapeReport.totalTasks || scrapeReport.closed !== true) {
      errors.push({ code: 'task_counts_not_closed', totalTasks: scrapeReport.totalTasks, counted, counts });
    }
  } else {
    warnings.push({ code: 'missing_scrape_report' });
  }

  if (baseline.length && input.length < baseline.length * (1 - maxDropRatio)) {
    errors.push({
      code: 'abnormal_entry_drop',
      baselineCount: baseline.length,
      candidateCount: input.length,
      maxDropRatio
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      total: input.length,
      ccf: ccfCount,
      nonCCF: nonCCFCount,
      expectedCCFRelations: expected.length,
      actualCCFRelations: actualKeys.size,
      uniqueJournalIDs: journalIDs.size,
      identityConflicts: errors.filter(error => /conflict|duplicate/.test(error.code)).length
    }
  };
}

function parseArgs(argv) {
  const args = { publish: false, fixture: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--publish') args.publish = true;
    else if (arg === '--fixture') args.fixture = true;
    else if (arg.startsWith('--') && index + 1 < argv.length) args[arg.slice(2)] = argv[++index];
  }
  return args;
}

function pathsForArgs(args, env = process.env) {
  if (args.fixture) {
    const root = path.join(__dirname, 'fixtures', 'validation');
    return {
      input: path.join(root, 'valid_staging.json'),
      baseline: path.join(root, 'baseline.json'),
      ccf: path.join(root, 'ccf_source.json'),
      scrapeReport: path.join(root, 'scrape_report.json'),
      discoveryReport: path.join(root, 'discovery_report.json'),
      report: args.report || path.join(OUTPUT_DIR, 'validation_fixture_report.json'),
      formal: args.formal || path.join(DATA_DIR, 'letpub_full.json')
    };
  }
  return {
    input: args.input || env.STAGING_FILE || path.join(OUTPUT_DIR, 'letpub_full.staging.json'),
    baseline: args.baseline || env.BASELINE_FILE || path.join(DATA_DIR, 'letpub_full.json'),
    ccf: args.ccf || env.CCF_SOURCE_FILE || path.join(DATA_DIR, 'all_journals_correct.json'),
    scrapeReport: args['scrape-report'] || env.SCRAPE_REPORT_FILE || path.join(OUTPUT_DIR, 'scrape_report.json'),
    discoveryReport: args['discovery-report'] || env.DISCOVERY_REPORT_FILE || path.join(OUTPUT_DIR, 'discovery_report.json'),
    report: args.report || env.VALIDATION_REPORT_FILE || path.join(OUTPUT_DIR, 'validation_report.json'),
    formal: args.formal || env.FORMAL_DATA_FILE || path.join(DATA_DIR, 'letpub_full.json')
  };
}

function runValidation(options = {}) {
  const input = readJSON(options.input, null);
  if (input === null) {
    const result = { ok: false, errors: [{ code: 'missing_input', file: options.input }], warnings: [], stats: {} };
    if (options.report) atomicWriteJSON(options.report, result);
    return result;
  }
  const result = validateDataset(input, {
    baseline: readJSON(options.baseline, []),
    ccfSource: readJSON(options.ccf, {}),
    scrapeReport: readJSON(options.scrapeReport, null),
    maxDropRatio: options.maxDropRatio
  });
  const discoveryReport = options.discoveryReport ? readJSON(options.discoveryReport, null) : null;
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    input: options.input,
    publishRequested: Boolean(options.publish),
    published: false,
    discoverySourceComplete: discoveryReport?.sourceComplete === true,
    ...result
  };
  if (result.ok && options.publish) {
    if (discoveryReport?.sourceComplete !== true) {
      report.ok = false;
      report.errors.push({ code: 'cannot_publish_without_complete_discovery' });
    }
    if (Number(readJSON(options.scrapeReport, {})?.counts?.pending || 0) > 0) {
      report.ok = false;
      report.errors.push({ code: 'cannot_publish_with_pending_tasks' });
    }
  }
  if (report.ok && options.publish) {
    if (!options.formal) throw new Error('formal output path is required for --publish');
    atomicWriteJSON(options.formal, input);
    report.published = true;
    report.formal = options.formal;
  }
  if (options.report) atomicWriteJSON(options.report, report);
  return report;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.fixture && args.publish) throw new Error('--fixture cannot be combined with --publish');
  const paths = pathsForArgs(args);
  const report = runValidation({
    ...paths,
    publish: args.publish,
    maxDropRatio: args['max-drop-ratio'] == null ? undefined : Number(args['max-drop-ratio'])
  });
  console.log(JSON.stringify({ ok: report.ok, published: report.published, stats: report.stats, errorCount: report.errors.length }));
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  actualCCFRelations,
  expectedCCFRelations,
  parseArgs,
  pathsForArgs,
  relationKey,
  runValidation,
  validateDataset
};
