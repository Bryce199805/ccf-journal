const { isRateLimitedHTML, requestHTML } = require('./runtime');

class LetPubRateLimitError extends Error {
  constructor(message = 'LetPub rate limit page') {
    super(message);
    this.name = 'LetPubRateLimitError';
    this.code = 'RATE_LIMITED';
  }
}

class LetPubParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LetPubParseError';
    this.code = 'PARSE_FAILED';
  }
}

async function fetchUrl(url, timeout = 15000) {
  const response = await requestHTML(url, { timeoutMs: timeout });
  return response.body;
}

function decodeHTML(value) {
  return String(value || '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function strip(html) {
  return decodeHTML(String(html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function firstNum(text) {
  const match = String(text || '').match(/\d+(?:\.\d+)?/);
  return match ? match[0] : '';
}

function firstPct(text) {
  const match = String(text || '').match(/\d+(?:\.\d+)?%/);
  return match ? match[0] : '';
}

function extractBalancedElements(html, tag) {
  const elements = [];
  const token = new RegExp('<' + tag + '\\b[^>]*>|<\\/' + tag + '>', 'gi');
  let depth = 0;
  let start = -1;
  let match;
  while ((match = token.exec(String(html || '')))) {
    if (!match[0].startsWith('</')) {
      if (depth === 0) start = match.index;
      depth += 1;
    } else if (depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) elements.push(String(html).slice(start, token.lastIndex));
    }
  }
  return elements;
}

function tableCellPairs(html) {
  const pairs = [];
  const rows = extractBalancedElements(html, 'tr');
  for (const row of rows) {
    const cells = topLevelCells(row);
    for (let index = 0; index + 1 < cells.length; index += 2) pairs.push([strip(cells[index]), cells[index + 1]]);
  }
  return pairs;
}

function nextCellMatching(html, pattern) {
  for (const [label, rawValue] of tableCellPairs(html)) {
    pattern.lastIndex = 0;
    if (pattern.test(label)) return strip(rawValue);
  }
  return '';
}

function nextCell(html, label) {
  const escaped = label.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  return nextCellMatching(html, new RegExp('^' + escaped + '(?:[：:]|\\s)*$', 'i'));
}

function visibleZone(cell) {
  const spans = [...String(cell || '').matchAll(/<span\b([^>]*)>([1-4])\s*区<\/span>/gi)];
  const visible = spans.find(match => !/display\s*:\s*none/i.test(match[1]));
  if (visible) return visible[2] + '区';
  const textMatch = strip(cell).match(/([1-4])\s*区/);
  return textMatch ? textMatch[1] + '区' : '';
}

function topLevelCells(row) {
  const cells = [];
  const token = /<t[dh]\b[^>]*>|<\/t[dh]>/gi;
  let depth = 0;
  let start = -1;
  let match;
  while ((match = token.exec(row))) {
    if (!match[0].startsWith('</')) {
      if (depth === 0) start = token.lastIndex;
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0 && start >= 0) cells.push(row.slice(start, match.index));
    }
  }
  return cells;
}

function parsePartitionTable(table) {
  const rows = extractBalancedElements(table, 'tr');
  const headerIndex = rows.findIndex(row => /大类学科/.test(strip(row)));
  if (headerIndex < 0) return null;
  const dataRow = rows.slice(headerIndex + 1).find(row => topLevelCells(row).length >= 2);
  if (!dataRow) return null;
  const cells = topLevelCells(dataRow);
  const bigCell = cells[0] || '';
  const smallCell = cells[1] || '';
  return {
    bigCategory: strip(bigCell).replace(/[1-4]\s*区/g, '').trim(),
    bigZone: visibleZone(bigCell),
    smallCategory: strip(smallCell).replace(/[1-4]\s*区/g, '').trim(),
    smallZone: visibleZone(smallCell),
    isTop: /(?:^|\s)是(?:\s|$)/.test(strip(cells[2] || '')),
    isReview: /(?:^|\s)是(?:\s|$)/.test(strip(cells[3] || '')) && !/N\/?A/i.test(strip(cells[3] || ''))
  };
}

function parseAllPartitions(html) {
  const casPartitions = {};
  let xinrui = null;
  const tables = extractBalancedElements(html, 'table');
  let searchFrom = 0;
  for (const table of tables) {
    if (!/大类学科/.test(strip(table))) continue;
    const partition = parsePartitionTable(table);
    if (!partition) continue;
    const tableIndex = html.indexOf(table, searchFrom);
    searchFrom = Math.max(searchFrom, tableIndex + table.length);
    const before = html.slice(Math.max(0, tableIndex - 1000), tableIndex);
    const labels = [...before.matchAll(/<(?:h[1-6]|caption|strong|b|div)\b[^>]*>([\s\S]*?)<\/(?:h[1-6]|caption|strong|b|div)>/gi)]
      .map(item => strip(item[1]))
      .filter(label => label.length < 160 && /新锐|中科院|CAS|基础版|升级版|JCR/i.test(label));
    const context = labels.at(-1) || strip(before.slice(-250));
    if (/新锐/.test(context)) {
      xinrui = partition;
      continue;
    }
    const years = [...context.matchAll(/(20\d{2})\s*年?/g)].map(item => item[1]);
    const year = years.at(-1);
    if (/中科院|CAS|基础版|升级版/i.test(context) && year) casPartitions[year] = partition;
  }
  const latestCASYear = Object.keys(casPartitions).sort().at(-1) || null;
  return {
    xinrui,
    casPartitions,
    latestCASYear,
    latestCAS: latestCASYear ? casPartitions[latestCASYear] : null
  };
}

function parseJCR(html) {
  const wosMatch = String(html || '').match(/WOS分区等级[：:]?[\s\S]{0,500}?([1-4])\s*区/i);
  const result = { wosZone: wosMatch ? wosMatch[1] + '区' : '', jif: [], jci: [] };
  for (const [title, field] of [['按JIF指标学科分区', 'jif'], ['按JCI指标学科分区', 'jci']]) {
    const start = html.indexOf(title);
    if (start < 0) continue;
    const otherTitle = field === 'jif' ? '按JCI指标学科分区' : '按JIF指标学科分区';
    const other = html.indexOf(otherTitle, start + title.length);
    const section = html.slice(start, other > start ? other : start + 4000);
    for (const row of extractBalancedElements(section, 'tr')) {
      const cells = topLevelCells(row).map(strip);
      if (cells.length < 4 || !/学科[：:]/.test(cells[0])) continue;
      result[field].push({
        subject: cells[0].replace(/^.*?学科[：:]\s*/, ''),
        subset: cells[1],
        quartile: cells[2],
        rank: cells[3]
      });
    }
  }
  return result;
}

function parseDetailHTML(journalid, html, { fetchedAt = new Date().toISOString() } = {}) {
  if (isRateLimitedHTML(html)) throw new LetPubRateLimitError();
  if (!html || !/(期刊名字|期刊ISSN|E-ISSN|中科院|影响因子)/.test(html)) {
    throw new LetPubParseError('detail page has no recognized LetPub fields');
  }
  const id = String(journalid);
  const nameMatch = html.match(/期刊名字<\/span>[\s\S]*?(?:alt|title)="([^"]+)"/i)
    || html.match(/期刊名字[\s\S]{0,300}?<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/i);
  const data = {
    journalid: id,
    letpubUrl: 'https://www.letpub.com.cn/index.php?journalid=' + id + '&page=journalapp&view=detail',
    fetchedAt,
    name: nameMatch ? strip(nameMatch[1]) : '',
    issn: nextCell(html, '期刊ISSN'),
    eissn: nextCell(html, 'E-ISSN'),
    publisher: nextCell(html, '出版商'),
    country: nextCell(html, '出版国家或地区'),
    language: nextCell(html, '出版语言'),
    periodicity: nextCell(html, '出版周期'),
    researchArea: nextCell(html, '涉及的研究方向'),
    isOA: nextCell(html, '是否OA开放访问'),
    goldOARatio: firstPct(nextCell(html, 'Gold OA文章占比')),
    officialUrl: nextCell(html, '期刊官方网站').split(/\s/)[0],
    submissionUrl: nextCell(html, '期刊投稿网址').split(/\s/)[0],
    impactFactor: firstNum(nextCellMatching(html, /最新影响因子/)),
    realtimeIF: firstNum(nextCell(html, '实时影响因子').replace(/^.*?[：:]/, '')),
    selfCitationRate: firstPct(nextCellMatching(html, /自引率/)),
    fiveYearIF: firstNum(nextCell(html, '五年影响因子')),
    jciValue: firstNum(nextCell(html, 'JCI期刊引文指标')),
    hIndex: firstNum(nextCellMatching(html, /h-index/i)),
    citeScore: firstNum(nextCell(html, 'CiteScore')),
    sjr: firstNum(nextCell(html, 'SJR')),
    snip: firstNum(nextCell(html, 'SNIP')),
    citeScoreRankings: [],
    reviewSpeed: nextCell(html, '平均审稿速度').replace(/网友分享经验[：:]?\s*/, '').trim(),
    acceptanceRate: nextCell(html, '平均录用比例').replace(/网友分享经验[：:]?\s*/, '').trim(),
    articleCount: firstNum(nextCellMatching(html, /年文章数/))
  };
  const sci = nextCell(html, 'SCI收录类型');
  data.sciType = ['SCIE', 'SSCI', 'ESCI'].find(type => sci.includes(type)) || '';
  const scoreMatch = html.match(/LetPub评分[\s\S]{0,500}?font-size\s*:\s*24px[^>]*>([\d.]+)/i);
  data.letpubScore = scoreMatch ? scoreMatch[1] : '';
  const partitions = parseAllPartitions(html);
  Object.assign(data, partitions);
  for (const [year, partition] of Object.entries(partitions.casPartitions)) data['cas' + year] = partition;
  Object.assign(data, parseJCR(html));
  if (!data.name && !data.issn && !data.eissn) throw new LetPubParseError('detail page identity fields are missing');
  return data;
}

async function parseDetail(journalid, providedHTML = null, options = {}) {
  const url = 'https://www.letpub.com.cn/index.php?journalid=' + journalid + '&page=journalapp&view=detail';
  const html = providedHTML == null ? await fetchUrl(url, options.timeoutMs) : providedHTML;
  return parseDetailHTML(journalid, html, options);
}

module.exports = {
  LetPubParseError,
  LetPubRateLimitError,
  fetchUrl,
  parseAllPartitions,
  parseDetail,
  parseDetailHTML,
  parsePartitionTable,
  extractBalancedElements,
  strip
};
