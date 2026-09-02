const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateCatalogEntry, getLatestCASPartition, isFresh } = require('./catalog_policy');

test('uses the newest available CAS year, independent of object order', () => {
  const data = {
    casPartitions: {
      2025: { bigCategory: '计算机科学', bigZone: '2区' },
      2023: { bigCategory: '计算机科学', bigZone: '1区' }
    }
  };
  assert.deepEqual(getLatestCASPartition(data), {
    year: '2025',
    bigCategory: '计算机科学',
    bigZone: '2区'
  });
});

test('returns structured admission and rejection reasons', () => {
  assert.equal(evaluateCatalogEntry({ cas2025: { bigCategory: '计算机科学', bigZone: '1区' } }).accepted, true);
  assert.equal(evaluateCatalogEntry({ cas2025: { bigCategory: '计算机科学', bigZone: '2区' } }).accepted, true);
  assert.equal(evaluateCatalogEntry({ cas2025: { bigCategory: '计算机科学', bigZone: '3区' } }).reason, 'cas_big_zone_not_1_or_2');
  assert.equal(evaluateCatalogEntry({ cas2025: { bigCategory: '工程技术', bigZone: '1区' } }).reason, 'cas_big_category_not_computer_science');
  assert.equal(evaluateCatalogEntry({}).reason, 'missing_cas_partition');
});

test('CCF is always preserved even without a partition', () => {
  assert.deepEqual(evaluateCatalogEntry({}, { isCCF: true }), {
    accepted: true,
    reason: 'ccf_always_preserved',
    latestCASYear: null,
    actualBigCategory: null,
    actualBigZone: null
  });
});

test('refresh timestamps expire', () => {
  const now = Date.parse('2026-09-02T00:00:00Z');
  assert.equal(isFresh({ updatedAt: '2026-08-20T00:00:00Z' }, 30, now), true);
  assert.equal(isFresh({ updatedAt: '2026-07-01T00:00:00Z' }, 30, now), false);
});
