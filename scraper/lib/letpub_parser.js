const { isRateLimitedHTML, requestHTML } = require('./runtime');

// Bump this when partition extraction changes in a way that requires retrying
// entries previously rejected because no CAS partition was found.
const PARTITION_PARSER_VERSION = 2;
const DETAIL_PARSER_VERSION = 4;

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

function elementContentAt(html, start, tag) {
  const source = String(html || '');
  const token = new RegExp('<' + tag + '\\b[^>]*>|<\\/' + tag + '>', 'gi');
  token.lastIndex = start;
  const opening = token.exec(source);
  if (!opening || opening.index !== start || opening[0].startsWith('</')) return null;
  const contentStart = token.lastIndex;
  let depth = 1;
  let match;
  while ((match = token.exec(source))) {
    if (match[0].startsWith('</')) depth -= 1;
    else depth += 1;
    if (depth === 0) {
      return { raw: source.slice(contentStart, match.index), end: token.lastIndex };
    }
  }
  return null;
}

function siblingCellPairs(html) {
  const source = String(html || '');
  const lower = source.toLowerCase();
  const pairs = [];
  const closing = /<\/t[dh]>/gi;
  let match;
  while ((match = closing.exec(source))) {
    const tdStart = lower.lastIndexOf('<td', match.index);
    const thStart = lower.lastIndexOf('<th', match.index);
    const labelStart = Math.max(tdStart, thStart);
    if (labelStart < 0) continue;
    const labelTag = lower.startsWith('<th', labelStart) ? 'th' : 'td';
    const labelOpeningEnd = source.indexOf('>', labelStart);
    if (labelOpeningEnd < 0 || labelOpeningEnd > match.index) continue;
    const nestedCell = Math.max(
      lower.lastIndexOf('<td', match.index - 1),
      lower.lastIndexOf('<th', match.index - 1)
    );
    if (nestedCell > labelStart) continue;
    const label = strip(source.slice(labelOpeningEnd + 1, match.index));
    if (!label || label.length > 500) continue;
    const sibling = /\s*<t[dh]\b[^>]*>/iy;
    sibling.lastIndex = closing.lastIndex;
    const siblingOpening = sibling.exec(source);
    if (!siblingOpening) continue;
    const valueStart = siblingOpening.index + siblingOpening[0].search(/<t[dh]/i);
    const valueTag = lower.startsWith('<th', valueStart) ? 'th' : 'td';
    const value = elementContentAt(source, valueStart, valueTag);
    if (value) pairs.push([label, value.raw]);
  }
  return pairs;
}

function nextCellMatching(html, pattern) {
  for (const [label, rawValue] of [...siblingCellPairs(html), ...tableCellPairs(html)]) {
    pattern.lastIndex = 0;
    if (pattern.test(label)) return strip(rawValue);
  }
  return '';
}

function nextCellRawMatching(html, pattern) {
  for (const [label, rawValue] of [...siblingCellPairs(html), ...tableCellPairs(html)]) {
    pattern.lastIndex = 0;
    if (pattern.test(label)) return rawValue;
  }
  return '';
}

function nextCell(html, label) {
  const escaped = label.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  return nextCellMatching(html, new RegExp('^' + escaped + '(?:[：:]|\\s|$)', 'i'));
}

function nextCellRaw(html, label) {
  const escaped = label.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  return nextCellRawMatching(html, new RegExp('^' + escaped + '(?:[：:]|\\s|$)', 'i'));
}

function extractExternalLink(raw, { allowEmail = false } = {}) {
  const source = decodeHTML(String(raw || ''));
  const candidates = [
    ...[...source.matchAll(/href=["']([^"']+)["']/gi)].map(match => match[1]),
    ...[...source.matchAll(/https?:\/\/[^\s"'<>]+/gi)].map(match => match[0])
  ];
  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate.trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) continue;
      if (parsed.hostname === 'letpub.com.cn' || parsed.hostname.endsWith('.letpub.com.cn')) continue;
      return parsed.toString();
    } catch {
      // Ignore malformed links and continue looking in the same value cell.
    }
  }
  if (allowEmail) {
    const email = strip(source).match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
    if (email) return 'mailto:' + email[0];
  }
  return '';
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

function partitionTableFromContainer(container) {
  for (const table of extractBalancedElements(container, 'table')) {
    if (!/大类学科/.test(strip(table))) continue;
    const partition = parsePartitionTable(table);
    if (partition) return partition;
  }
  return parsePartitionTable(container);
}

function classifyPartition(label, partition, result) {
  const context = strip(label);
  if (!partition || !context) return false;
  if (/新锐/.test(context)) {
    result.xinrui = partition;
    return true;
  }
  if (/WOS|JCR|趋势|相关期刊|预警/i.test(context)) return false;
  const year = [...context.matchAll(/(20\d{2})\s*年?/g)].at(-1)?.[1];
  const isCAS = /中科院|CAS|基础版|升级版|期刊分区表/i.test(context);
  if (!isCAS || !year) return false;
  result.casPartitions[year] = partition;
  return true;
}

function parseLabeledPartitionCells(html, result) {
  const source = String(html || '');
  const lower = source.toLowerCase();
  const markers = /新锐期刊分区表|中科院[^<]{0,80}分区|期刊分区表/gi;
  const visitedCells = new Set();
  let marker;
  while ((marker = markers.exec(source))) {
    const tdStart = lower.lastIndexOf('<td', marker.index);
    const thStart = lower.lastIndexOf('<th', marker.index);
    const cellStart = Math.max(tdStart, thStart);
    if (cellStart < 0 || visitedCells.has(cellStart)) continue;
    const openEnd = source.indexOf('>', cellStart);
    const tag = lower.slice(cellStart + 1, cellStart + 3) === 'th' ? 'th' : 'td';
    const cellEnd = lower.indexOf('</' + tag + '>', marker.index);
    if (openEnd < 0 || openEnd > marker.index || cellEnd < 0) continue;
    visitedCells.add(cellStart);
    const label = strip(source.slice(openEnd + 1, cellEnd));
    if (label.length > 240 || !/新锐|中科院|CAS|基础版|升级版|期刊分区表/i.test(label)) continue;

    const siblingStart = lower.indexOf('<td', cellEnd + tag.length + 3);
    if (siblingStart < 0) continue;
    const siblingOpenEnd = source.indexOf('>', siblingStart);
    const tableStart = lower.indexOf('<table', siblingOpenEnd);
    if (siblingOpenEnd < 0 || tableStart < 0 || tableStart - siblingOpenEnd > 600) continue;
    const table = extractBalancedElements(source.slice(tableStart), 'table')[0];
    classifyPartition(label, parsePartitionTable(table), result);
  }
}

function parseAllPartitions(html) {
  const result = { casPartitions: {}, xinrui: null };

  // LetPub's live HTML contains malformed outer table nesting, so anchor on a
  // short section-label cell and then parse the balanced inner table in its
  // adjacent value cell.
  parseLabeledPartitionCells(html, result);

  // Current LetPub pages put the section label in the first cell of an outer
  // row and the actual partition table inside the second cell. Walking the
  // outer rows preserves that relationship even when the tables are nested.
  for (const row of extractBalancedElements(html, 'tr')) {
    const cells = topLevelCells(row);
    if (cells.length < 2) continue;
    const label = strip(cells[0]);
    if (!/新锐|中科院|CAS|基础版|升级版|期刊分区表|WOS|JCR/i.test(label)) continue;
    classifyPartition(label, partitionTableFromContainer(cells[1]), result);
  }

  // Retain support for older layouts where a heading precedes a standalone
  // partition table instead of sharing an outer table row.
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
      .filter(label => label.length < 160 && /新锐|中科院|CAS|基础版|升级版|期刊分区表|JCR/i.test(label));
    const context = labels.at(-1) || strip(before.slice(-250));
    classifyPartition(context, partition, result);
  }
  const latestCASYear = Object.keys(result.casPartitions).sort().at(-1) || null;
  return {
    xinrui: result.xinrui,
    casPartitions: result.casPartitions,
    latestCASYear,
    latestCAS: latestCASYear ? result.casPartitions[latestCASYear] : null
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

function classifyWOSAvailability(html, parsedJCR) {
  const source = String(html || '');
  if (parsedJCR.wosZone) return { wosStatus: 'available', wosReason: 'partition_present' };
  if (/此期刊未被最新的JCR期刊引证报告收录/i.test(source)) {
    return { wosStatus: 'not_indexed', wosReason: 'not_in_latest_jcr' };
  }
  if (/注册或登录后[\s\S]{0,500}(?:查看)?WOS分区等级/i.test(source)) {
    return { wosStatus: 'auth_required', wosReason: 'login_gate' };
  }
  if (/WOS分区等级[：:]?[\s\S]{0,300}?(?:0\s*区|暂无按学科分区信息)/i.test(source)) {
    return { wosStatus: 'partition_unavailable', wosReason: 'no_partition_data' };
  }
  return { wosStatus: 'source_missing', wosReason: 'wos_section_absent' };
}

function parseScopusMetrics(html) {
  const result = { citeScore: '', sjr: '', snip: '', citeScoreRankings: [] };
  const header = String(html || '').match(
    /<th\b[^>]*>\s*CiteScore\s*<\/th>\s*<th\b[^>]*>\s*SJR\s*<\/th>\s*<th\b[^>]*>\s*SNIP\s*<\/th>[\s\S]*?<\/tr>\s*<tr\b[^>]*>([\s\S]*?)<\/tr>/i
  );
  if (!header) return result;
  const cells = topLevelCells('<tr>' + header[1] + '</tr>').map(strip);
  result.citeScore = firstNum(cells[0]);
  result.sjr = firstNum(cells[1]);
  result.snip = firstNum(cells[2]);
  const rankingHeader = String(html).indexOf('>CiteScore排名</th>');
  if (rankingHeader >= 0) {
    const rankingTableStart = String(html).indexOf('<table', rankingHeader);
    const rankingTable = rankingTableStart >= 0
      ? extractBalancedElements(String(html).slice(rankingTableStart), 'table')[0]
      : '';
    for (const row of extractBalancedElements(rankingTable, 'tr').slice(1)) {
      const rankingCells = topLevelCells(row).map(strip);
      if (rankingCells.length < 3 || !/大类|小类/.test(rankingCells[0])) continue;
      result.citeScoreRankings.push({
        category: rankingCells[0],
        zone: rankingCells[1],
        rank: rankingCells[2]
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
    officialUrl: extractExternalLink(nextCellRaw(html, '期刊官方网站')),
    submissionUrl: extractExternalLink(nextCellRaw(html, '期刊投稿网址'), { allowEmail: true }),
    impactFactor: firstNum(nextCellMatching(html, /最新影响因子/)),
    realtimeIF: firstNum(nextCell(html, '实时影响因子').replace(/^.*?[：:]/, '')),
    selfCitationRate: firstPct(nextCellMatching(html, /自引率/)),
    fiveYearIF: firstNum(nextCell(html, '五年影响因子')),
    jciValue: firstNum(nextCell(html, 'JCI期刊引文指标')),
    hIndex: firstNum(nextCellMatching(html, /h-index/i)),
    citeScore: firstNum(nextCellMatching(html, /^CiteScore(?:\s|$)/i)),
    sjr: firstNum(nextCellMatching(html, /^SJR(?:\s|$)/i)),
    snip: firstNum(nextCellMatching(html, /^SNIP(?:\s|$)/i)),
    citeScoreRankings: [],
    reviewSpeed: nextCell(html, '平均审稿速度').replace(/网友分享经验[：:]?\s*/, '').trim(),
    acceptanceRate: nextCell(html, '平均录用比例').replace(/网友分享经验[：:]?\s*/, '').trim(),
    articleCount: firstNum(nextCellMatching(html, /年文章数/))
  };
  if (!data.impactFactor) {
    const titleIF = String(html).match(/<title\b[^>]*>[\s\S]*?影响因子\s*([\d.]+)\s*分/i);
    data.impactFactor = titleIF ? titleIF[1] : '';
  }
  Object.assign(data, Object.fromEntries(
    Object.entries(parseScopusMetrics(html)).filter(([, value]) => value)
  ));
  const sci = nextCell(html, 'SCI收录类型');
  data.sciType = ['SCIE', 'SSCI', 'ESCI'].find(type => sci.includes(type)) || '';
  if (!data.sciType) {
    const currentJCR = String(html).match(/被最新的JCR期刊\s*(SCIE|SSCI|ESCI)\s*收录/i);
    data.sciType = currentJCR ? currentJCR[1].toUpperCase() : '';
  }
  const scoreMatch = html.match(/LetPub评分[\s\S]{0,500}?font-size\s*:\s*24px[^>]*>([\d.]+)/i);
  data.letpubScore = scoreMatch ? scoreMatch[1] : '';
  const partitions = parseAllPartitions(html);
  Object.assign(data, partitions);
  for (const [year, partition] of Object.entries(partitions.casPartitions)) data['cas' + year] = partition;
  const jcr = parseJCR(html);
  Object.assign(data, jcr, classifyWOSAvailability(html, jcr));
  if (!data.name && !data.issn && !data.eissn) throw new LetPubParseError('detail page identity fields are missing');
  return data;
}

async function parseDetail(journalid, providedHTML = null, options = {}) {
  const url = 'https://www.letpub.com.cn/index.php?journalid=' + journalid + '&page=journalapp&view=detail';
  const html = providedHTML == null ? await fetchUrl(url, options.timeoutMs) : providedHTML;
  return parseDetailHTML(journalid, html, options);
}

module.exports = {
  DETAIL_PARSER_VERSION,
  PARTITION_PARSER_VERSION,
  LetPubParseError,
  LetPubRateLimitError,
  fetchUrl,
  classifyWOSAvailability,
  extractExternalLink,
  parseAllPartitions,
  parseDetail,
  parseDetailHTML,
  parsePartitionTable,
  parseScopusMetrics,
  extractBalancedElements,
  strip
};
