function normalizeISSN(value) {
  const compact = String(value || '').toUpperCase().replace(/[^0-9X]/g, '');
  return compact.length === 8 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : '';
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9\u4e00-\u9fff]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function identityKeys(entry) {
  return {
    journalid: entry?.journalid ? String(entry.journalid) : '',
    issn: normalizeISSN(entry?.issn),
    eissn: normalizeISSN(entry?.eissn),
    name: normalizeName(entry?.name || entry?.full || entry?.ccfFull)
  };
}

function strongMatch(left, right) {
  const a = identityKeys(left);
  const b = identityKeys(right);
  if (a.journalid && b.journalid) {
    return a.journalid === b.journalid
      ? { matched: true, method: 'journalid' }
      : { matched: false, method: null, conflict: 'journalid_mismatch' };
  }
  if (a.issn && (a.issn === b.issn || a.issn === b.eissn)) return { matched: true, method: 'issn' };
  if (a.eissn && (a.eissn === b.issn || a.eissn === b.eissn)) return { matched: true, method: 'eissn' };
  return { matched: false, method: null };
}

function findStrongMatches(target, entries) {
  return entries
    .map((entry, index) => ({ entry, index, match: strongMatch(target, entry) }))
    .filter(item => item.match.matched);
}

module.exports = { findStrongMatches, identityKeys, normalizeISSN, normalizeName, strongMatch };
