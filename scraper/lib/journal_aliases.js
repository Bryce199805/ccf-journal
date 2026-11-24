const { normalizeISSN, normalizeName } = require('./identity');

function mergePreserving(existing, incoming) {
  const merged = { ...(existing || {}) };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === '' || value == null) continue;
    merged[key] = value;
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

module.exports = {
  catalogNamesCompatible,
  consolidateJournalAliases,
  mergeJournalAliases,
  mergePreserving,
  sameTitleSourceAliasMatch,
  serialAliasMatch,
  serialsOf
};
