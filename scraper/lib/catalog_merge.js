const { normalizeName, normalizeISSN, strongMatch } = require('./identity');
const { aliases: auditedAliases } = require('../ccf_title_aliases.json');
const { items: auditedHints } = require('../ccf_identity_hints.json');

// Official membership is independent of whether a metrics provider has a record.
function mergeJournalCatalog(metrics, source, aliases = auditedAliases, hints = auditedHints) {
  const groups = new Map();
  for (const [domain, entries] of Object.entries(source)) {
    for (const entry of entries) {
      const key = normalizeName(entry.full);
      if (!key || !['A', 'B', 'C'].includes(entry.level)) throw new Error('Invalid CCF journal');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ ...entry, domain });
    }
  }
  if (!groups.size) throw new Error('CCF journal catalog must not be empty');
  const used = new Set();
  const journals = [];
  for (const [key, relations] of groups) {
    const titleAliases = aliases.filter(alias => normalizeName(alias.officialFull) === key);
    const matches = metrics.map((entry, index) => ({ entry, index })).filter(({ entry }) => {
      const names = [entry.ccfFull, entry.name, ...(entry.ccfRelations || []).map(r => r.full)].map(normalizeName);
      if (names.includes(key)) return true;
      return titleAliases.some(alias => names.includes(normalizeName(alias.legacyFull))
        && strongMatch(entry, alias.letpubIdentity).matched);
    });
    const identified = matches.filter(({ entry }) => entry.journalid || entry.issn || entry.eissn);
    const hint = hints.find(item => normalizeName(item.officialFull) === key);
    const expectedSerials = [hint?.issn, hint?.eissn].map(normalizeISSN).filter(Boolean);
    if (expectedSerials.length) {
      for (const { entry } of identified) {
        const actualSerials = [entry.issn, entry.eissn].map(normalizeISSN).filter(Boolean);
        if (!actualSerials.some(serial => expectedSerials.includes(serial))) {
          throw new Error(`CCF serial identity conflict: ${relations[0].full}`);
        }
      }
    }
    if (identified.length > 1 && identified.some(({ entry }) => !strongMatch(identified[0].entry, entry).matched)) {
      throw new Error(`Ambiguous journal identity: ${relations[0].full}`);
    }
    // Catalog-only placeholders contribute no metrics and must not erase a
    // verified snapshot when a renamed journal is subsequently identified.
    const snapshotQuality = entry => Number(Boolean(entry.journalid)) * 2
      + Number(Boolean(entry.issn || entry.eissn));
    matches.sort((a, b) => snapshotQuality(a.entry) - snapshotQuality(b.entry));
    const existing = matches.reduce((result, { entry, index }) => {
      used.add(index);
      return { ...result, ...entry };
    }, {});
    const primary = [...relations].sort((a, b) => a.level.localeCompare(b.level))[0];
    journals.push({
      ...existing,
      name: existing.name || primary.full,
      isCCF: true, catalogSource: 'ccf', inclusionReason: 'CCF推荐目录',
      ccfDomain: primary.domain, ccfLevel: primary.level,
      ccfAbbr: primary.abbr || '', ccfFull: primary.full,
      ccfPublisher: primary.publisher || '', ccfUrl: primary.url || '',
      ccfRelations: relations,
    });
  }
  // Retain every existing non-CCF entry without changing its admission policy.
  metrics.forEach((entry, index) => {
    if (!used.has(index) && entry.isCCF === false
      && !journals.some(journal => journal.isCCF && strongMatch(journal, entry).matched)) {
      journals.push(entry);
    }
  });
  return journals;
}

module.exports = { mergeJournalCatalog };
