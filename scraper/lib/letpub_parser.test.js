const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  LetPubParseError,
  LetPubRateLimitError,
  parseDetailHTML
} = require('./letpub_parser');

const fixtures = path.join(__dirname, '..', 'fixtures', 'details');
const fixture = name => fs.readFileSync(path.join(fixtures, name), 'utf8');

test('parses dynamic impact-factor label and semantic CAS years in changed order', () => {
  const detail = parseDetailHTML('101', fixture('non_ccf_zone1_reordered.html'), { fetchedAt: '2026-09-02T00:00:00Z' });
  assert.equal(detail.impactFactor, '9.8');
  assert.equal(detail.latestCASYear, '2025');
  assert.equal(detail.latestCAS.bigCategory, '计算机科学');
  assert.equal(detail.latestCAS.bigZone, '1区');
  assert.equal(detail.casPartitions['2023'].bigZone, '2区');
  assert.equal(detail.xinrui.bigCategory, '工程技术');
  assert.equal(detail.wosZone, '1区');
  assert.deepEqual(detail.jif[0], {
    subject: 'Computer Science',
    subset: 'SCIE',
    quartile: 'Q1',
    rank: '1/100'
  });
  assert.equal(detail.fetchedAt, '2026-09-02T00:00:00Z');
  assert.match(detail.letpubUrl, /journalid=101/);
});

test('distinguishes Xinrui from latest CAS when sections are reordered', () => {
  const detail = parseDetailHTML('102', fixture('non_ccf_zone2.html'));
  assert.equal(detail.latestCASYear, '2024');
  assert.equal(detail.latestCAS.bigZone, '2区');
  assert.equal(detail.xinrui.bigZone, '1区');
});

test('parses zones 3/4 and non-computer zone 1 for policy rejection', () => {
  assert.equal(parseDetailHTML('103', fixture('non_ccf_zone3.html')).latestCAS.bigZone, '3区');
  assert.equal(parseDetailHTML('106', fixture('non_ccf_zone4.html')).latestCAS.bigZone, '4区');
  assert.equal(parseDetailHTML('104', fixture('non_computer_zone1.html')).latestCAS.bigCategory, '工程技术');
});

test('CCF detail can parse without CAS fields', () => {
  const detail = parseDetailHTML('500', fixture('ccf_missing_partition.html'));
  assert.equal(detail.name, 'CCF JOURNAL');
  assert.equal(detail.latestCAS, null);
});

test('classifies rate-limit and malformed pages', () => {
  assert.throws(() => parseDetailHTML('1', fixture('rate_limited.html')), LetPubRateLimitError);
  assert.throws(() => parseDetailHTML('1', fixture('missing_fields.html')), LetPubParseError);
});
