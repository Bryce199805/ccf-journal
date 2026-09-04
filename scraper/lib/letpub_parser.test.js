const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  classifyWOSAvailability,
  extractExternalLink,
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
  assert.equal(detail.wosStatus, 'available');
  assert.equal(detail.wosReason, 'partition_present');
  assert.deepEqual(detail.jif[0], {
    subject: 'Computer Science',
    subset: 'SCIE',
    quartile: 'Q1',
    rank: '1/100'
  });
  assert.equal(detail.fetchedAt, '2026-09-02T00:00:00Z');
  assert.match(detail.letpubUrl, /journalid=101/);
});

test('classifies WOS absence without treating zero as a real partition', () => {
  const notIndexed = '<div>（此期刊未被最新的JCR期刊引证报告收录）</div>'
    + '<div>WOS分区等级：0区 暂无按学科分区信息</div>';
  assert.deepEqual(classifyWOSAvailability(notIndexed, { wosZone: '' }), {
    wosStatus: 'not_indexed',
    wosReason: 'not_in_latest_jcr'
  });
  assert.deepEqual(classifyWOSAvailability(
    '<div>注册或登录后，查看WOS分区等级</div>',
    { wosZone: '' }
  ), { wosStatus: 'auth_required', wosReason: 'login_gate' });
  assert.deepEqual(classifyWOSAvailability(
    '<div>WOS分区等级：0区 暂无按学科分区信息</div>',
    { wosZone: '' }
  ), { wosStatus: 'partition_unavailable', wosReason: 'no_partition_data' });
  assert.deepEqual(classifyWOSAvailability('<div>期刊名字</div>', { wosZone: '' }), {
    wosStatus: 'source_missing',
    wosReason: 'wos_section_absent'
  });
});

test('extracts only safe external journal links and normalizes submission email', () => {
  assert.equal(
    extractExternalLink('<a href="https://publisher.example/journal?a=1&amp;b=2">Journal</a>'),
    'https://publisher.example/journal?a=1&b=2'
  );
  assert.equal(
    extractExternalLink('<a href="https://www.letpub.com.cn/ad">广告</a> 投稿规范预检（避免'),
    ''
  );
  assert.equal(
    extractExternalLink('Email: editor@example.org', { allowEmail: true }),
    'mailto:editor@example.org'
  );
  assert.equal(extractExternalLink('"'), '');
});

test('distinguishes Xinrui from latest CAS when sections are reordered', () => {
  const detail = parseDetailHTML('102', fixture('non_ccf_zone2.html'));
  assert.equal(detail.latestCASYear, '2024');
  assert.equal(detail.latestCAS.bigZone, '2区');
  assert.equal(detail.xinrui.bigZone, '1区');
});

test('parses current LetPub nested partition rows and ignores Xinrui/JCR sections', () => {
  const detail = parseDetailHTML('27254', fixture('current_nested_partitions.html'));
  assert.equal(detail.latestCASYear, '2025');
  assert.equal(detail.latestCAS.bigCategory, '计算机科学');
  assert.equal(detail.latestCAS.bigZone, '3区');
  assert.equal(detail.latestCAS.smallCategory, 'REMOTE SENSING 遥感');
  assert.equal(detail.latestCAS.smallZone, '3区');
  assert.equal(detail.casPartitions['2023'].bigCategory, '地球科学');
  assert.equal(detail.casPartitions['2023'].bigZone, '2区');
  assert.equal(detail.xinrui.bigZone, '1区');
  assert.equal(Object.hasOwn(detail.casPartitions, '2026'), false);
});

test('parses ordinary metadata from current nested LetPub table rows', () => {
  const detail = parseDetailHTML('900', fixture('current_nested_metadata.html'));
  assert.equal(detail.name, 'CURRENT COMPUTER JOURNAL');
  assert.equal(detail.issn, '1234-5678');
  assert.equal(detail.eissn, '8765-4321');
  assert.equal(detail.impactFactor, '15.500');
  assert.equal(detail.realtimeIF, '17.35');
  assert.equal(detail.publisher, 'Example Publisher');
  assert.equal(detail.country, 'NETHERLANDS');
  assert.equal(detail.language, 'English');
  assert.equal(detail.periodicity, 'Monthly');
  assert.equal(detail.researchArea, '工程技术-计算机科学');
  assert.equal(detail.isOA, 'No');
  assert.equal(detail.officialUrl, 'https://example.invalid/journal');
  assert.equal(detail.submissionUrl, 'https://example.invalid/submit');
  assert.equal(detail.citeScore, '21.4');
  assert.equal(detail.sjr, '3.2');
  assert.equal(detail.snip, '4.1');
  assert.deepEqual(detail.citeScoreRankings, [{
    category: '大类：Computer Science 小类：Artificial Intelligence',
    zone: 'Q1',
    rank: '1 / 100'
  }]);
  assert.equal(detail.reviewSpeed, '12 Weeks');
  assert.equal(detail.acceptanceRate, '25%');
  assert.equal(detail.latestCAS.bigZone, '1区');
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
