function availableCASPartitions(data) {
  const partitions = { ...(data?.casPartitions || {}) };
  for (const [key, value] of Object.entries(data || {})) {
    const match = key.match(/^cas(20\d{2})$/);
    if (match && value && !partitions[match[1]]) partitions[match[1]] = value;
  }
  return partitions;
}

function getLatestCASPartition(data) {
  const partitions = availableCASPartitions(data);
  const year = Object.keys(partitions).filter(key => /^20\d{2}$/.test(key)).sort().at(-1);
  if (!year) return null;
  return { year, ...partitions[year] };
}

function evaluateCatalogEntry(data, { isCCF = false } = {}) {
  const latest = getLatestCASPartition(data);
  if (isCCF) return {
    accepted: true,
    reason: 'ccf_always_preserved',
    latestCASYear: latest?.year || null,
    actualBigCategory: latest?.bigCategory || null,
    actualBigZone: latest?.bigZone || null
  };
  if (!latest) return {
    accepted: false,
    reason: 'missing_cas_partition',
    latestCASYear: null,
    actualBigCategory: null,
    actualBigZone: null
  };
  if (latest.bigCategory !== '计算机科学') return {
    accepted: false,
    reason: 'cas_big_category_not_computer_science',
    latestCASYear: latest.year,
    actualBigCategory: latest.bigCategory || null,
    actualBigZone: latest.bigZone || null
  };
  if (!['1区', '2区'].includes(latest.bigZone)) return {
    accepted: false,
    reason: 'cas_big_zone_not_1_or_2',
    latestCASYear: latest.year,
    actualBigCategory: latest.bigCategory,
    actualBigZone: latest.bigZone || null
  };
  return {
    accepted: true,
    reason: 'cas_computer_science_zone_1_or_2',
    latestCASYear: latest.year,
    actualBigCategory: latest.bigCategory,
    actualBigZone: latest.bigZone
  };
}

function isEligibleNonCCF(data) {
  return evaluateCatalogEntry(data).accepted;
}

function isFresh(completed, refreshDays = 30, now = Date.now()) {
  if (!completed?.updatedAt && !completed?.timestamp) return false;
  const timestamp = Date.parse(completed.updatedAt || completed.timestamp);
  return Number.isFinite(timestamp) && now - timestamp < refreshDays * 24 * 60 * 60 * 1000;
}

module.exports = { availableCASPartitions, evaluateCatalogEntry, getLatestCASPartition, isEligibleNonCCF, isFresh };
