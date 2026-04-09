// LetPub detail page parser - extracted from test_detail_v8.js
const https = require('https');

function fetchUrl(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' }
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, timeout).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function strip(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
function firstNum(text) { const m = text.match(/[\d.]+/); return m ? m[0] : ''; }
function firstPct(text) { const m = text.match(/[\d.]+%/); return m ? m[0] : ''; }

function nextTd(html, label) {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`<t[dD][^>]*>\\s*${esc}[\\s\\S]*?</t[dD]>\\s*<t[dD][^>]*>([\\s\\S]*?)</t[dD]>`, 'i');
  const m = html.match(regex);
  return m ? strip(m[1]) : '';
}

function getVisibleZone(html) {
  const spans = [...html.matchAll(/<span[^>]*style="([^"]*)"[^>]*>(\d)区<\/span>/gi)];
  for (const sp of spans) {
    if (!sp[1].includes('display:none') && !sp[1].includes('display: none')) {
      return sp[2] + '区';
    }
  }
  return '';
}

function extractPartitionCells(dataRow) {
  const cells = [];
  const regex = /<t[dD][^>]*padding:\s*8px[^>]*>/gi;
  let m;
  while ((m = regex.exec(dataRow)) !== null) {
    const contentStart = m.index + m[0].length;
    let depth = 1, p = contentStart, contentEnd = -1;
    while (p < dataRow.length) {
      const om = dataRow.substring(p).match(/<t[dD][^>]*>/i);
      const cm = dataRow.substring(p).match(/<\/t[dD]>/i);
      const nextOpen = om ? p + om.index : Infinity;
      const nextClose = cm ? p + cm.index : Infinity;
      if (nextClose < nextOpen) {
        depth--;
        if (depth === 0) { contentEnd = nextClose; break; }
        p = nextClose + 6;
      } else if (nextOpen < nextClose) {
        depth++;
        p = nextOpen + om[0].length;
      } else { break; }
    }
    if (contentEnd < 0) break;
    cells.push(dataRow.substring(contentStart, contentEnd));
  }
  return cells;
}

function parsePartitionDataRow(dataRow) {
  const result = {};
  const cells = extractPartitionCells(dataRow);
  if (cells.length < 4) return result;

  result.bigCategory = strip(cells[0]).replace(/\d区/g, '').trim();
  result.bigZone = getVisibleZone(cells[0]);

  const catMatch = cells[1].match(/<t[dD][^>]*style="padding:4px;">([\s\S]*?)<\/t[dD]>/i);
  result.smallCategory = catMatch ? strip(catMatch[1]) : strip(cells[1]).replace(/\d区/g, '').trim();
  result.smallZone = getVisibleZone(cells[1]);

  result.isTop = strip(cells[2]).includes('是');
  const reviewText = strip(cells[3]);
  result.isReview = reviewText.includes('是') && !reviewText.includes('N/A');

  return result;
}

function parseAllPartitions(html) {
  const result = {};
  const positions = [];
  let s = 0;
  while (true) {
    const idx = html.indexOf('大类学科</th>', s);
    if (idx < 0) break;
    positions.push(idx);
    s = idx + 10;
  }

  const versionKeys = ['xinrui', 'cas2025', 'cas2023'];

  for (let i = 0; i < positions.length && i < 3; i++) {
    const nextPos = i < positions.length - 1 ? positions[i + 1] : positions[i] + 5000;
    const section = html.substring(positions[i], nextPos);

    const headerEnd = section.indexOf('</tr>');
    if (headerEnd < 0) continue;

    const dataRowStart = section.indexOf('<tr', headerEnd);
    if (dataRowStart < 0) continue;

    let trDepth = 0, dataRowEndPos = -1, p = dataRowStart;
    while (p < section.length - 4) {
      if (section.substring(p, p + 3).toLowerCase() === '<tr') trDepth++;
      if (section.substring(p, p + 5).toLowerCase() === '</tr>') {
        trDepth--;
        if (trDepth === 0) { dataRowEndPos = p + 5; break; }
      }
      p++;
    }
    if (dataRowEndPos < 0) continue;

    const dataRow = section.substring(dataRowStart, dataRowEndPos);
    result[versionKeys[i]] = parsePartitionDataRow(dataRow);
  }

  return result;
}

function parseCiteScore(html) {
  const result = { citeScore: '', sjr: '', snip: '', citeScoreRankings: [] };

  const csThIdx = html.indexOf('>CiteScore</th>');
  if (csThIdx < 0) return result;

  const csSection = html.substring(csThIdx, csThIdx + 2000);
  const hEnd = csSection.indexOf('</tr>');
  if (hEnd < 0) return result;

  const dStart = csSection.indexOf('<tr', hEnd);
  if (dStart < 0) return result;
  const dEnd = csSection.indexOf('</tr>', dStart);
  if (dEnd < 0) return result;

  const dataRow = csSection.substring(dStart, dEnd + 5);

  const nums = [...dataRow.matchAll(/<t[dD][^>]*>\s*([\d.]+)\s*<\/t[dD]>/gi)];
  if (nums.length >= 3) {
    result.citeScore = nums[0][1];
    result.sjr = nums[1][1];
    result.snip = nums[2][1];
  }

  const rankThIdx = html.indexOf('>CiteScore排名</th>');
  if (rankThIdx >= 0) {
    const rankSection = html.substring(rankThIdx, rankThIdx + 3000);
    const rankRows = [...rankSection.matchAll(/<td[^>]*style="padding:4px;">([\s\S]*?)<\/td>\s*<td[^>]*style="padding:4px;">([\s\S]*?)<\/td>\s*<td[^>]*style="padding:4px;">([\s\S]*?)<\/td>/gi)];
    for (const m of rankRows) {
      if (strip(m[1]).includes('大类') || strip(m[1]).includes('小类') || strip(m[1]).includes('学科')) {
        result.citeScoreRankings.push({
          category: strip(m[1]),
          zone: strip(m[2]),
          rank: strip(m[3])
        });
      }
    }
  }

  return result;
}

function parseJCR(html) {
  const result = { wosZone: '', jif: [], jci: [] };

  const wosMatch = html.match(/WOS分区等级[：:]*[\s\S]*?<span[^>]*>(\d)区<\/span>/i);
  result.wosZone = wosMatch ? wosMatch[1] + '区' : '';

  const jifIdx = html.indexOf('按JIF指标学科分区');
  const jciIdx = html.indexOf('按JCI指标学科分区');
  if (jifIdx >= 0) {
    const jifEnd = jciIdx > jifIdx ? jciIdx : jifIdx + 3000;
    const jifSection = html.substring(jifIdx, jifEnd);
    const jifRows = [...jifSection.matchAll(/学科[：:]\s*([^<]+)<\/td>\s*<td[^>]*>\s*(\w+)\s*<\/td>\s*<td[^>]*>\s*(Q\d)\s*<\/td>\s*<td[^>]*>\s*(\d+\/\d+)/gi)];
    for (const m of jifRows) {
      result.jif.push({ subject: m[1].trim(), subset: m[2], quartile: m[3], rank: m[4] });
    }
  }

  if (jciIdx >= 0) {
    const jciSection = html.substring(jciIdx, jciIdx + 2000);
    const jciRows = [...jciSection.matchAll(/学科[：:]\s*([^<]+)<\/td>\s*<td[^>]*>\s*(\w+)\s*<\/td>\s*<td[^>]*>\s*(Q\d)\s*<\/td>\s*<td[^>]*>\s*(\d+\/\d+)/gi)];
    for (const m of jciRows) {
      result.jci.push({ subject: m[1].trim(), subset: m[2], quartile: m[3], rank: m[4] });
    }
  }

  return result;
}

async function parseDetail(journalid) {
  const url = `https://www.letpub.com.cn/index.php?journalid=${journalid}&page=journalapp&view=detail`;
  const html = await fetchUrl(url);
  
  // Check for rate limiting
  if (html.includes('速度过快') || html.includes('过于频繁') || html.length < 1000) {
    throw new Error('Rate limited by LetPub - need to wait');
  }
  
  const data = {
    journalid: String(journalid),
    letpubUrl: `https://www.letpub.com.cn/index.php?journalid=${journalid}&page=journalapp&view=detail`
  };

  const nameMatch = html.match(/期刊名字<\/span>[\s\S]*?alt="([^"]+)"/);
  data.name = nameMatch ? nameMatch[1] : '';

  data.issn = nextTd(html, '期刊ISSN');
  data.eissn = nextTd(html, 'E-ISSN');
  data.publisher = nextTd(html, '出版商');
  data.country = nextTd(html, '出版国家或地区');
  data.language = nextTd(html, '出版语言');
  data.periodicity = nextTd(html, '出版周期');
  data.researchArea = nextTd(html, '涉及的研究方向');
  data.isOA = nextTd(html, '是否OA开放访问');
  data.goldOARatio = firstPct(nextTd(html, 'Gold OA文章占比'));
  data.officialUrl = nextTd(html, '期刊官方网站').split(/\s/)[0];
  data.submissionUrl = nextTd(html, '期刊投稿网址').split(/\s/)[0];

  const sciCell = nextTd(html, 'SCI收录类型');
  if (sciCell.includes('SCIE')) data.sciType = 'SCIE';
  else if (sciCell.includes('SSCI')) data.sciType = 'SSCI';
  else if (sciCell.includes('ESCI')) data.sciType = 'ESCI';
  else if (html.includes('被最新的JCR期刊SCIE收录')) data.sciType = 'SCIE';
  else data.sciType = '';

  const ifRaw = nextTd(html, '2024-2025最新影响因子');
  data.impactFactor = firstNum(ifRaw.split(/span/i)[0]);

  const rtIfSection = nextTd(html, '实时影响因子');
  const rtIfMatch = rtIfSection.match(/截止[^：:]*[：:]\s*([\d.]+)/);
  data.realtimeIF = rtIfMatch ? rtIfMatch[1] : '';
  if (!data.realtimeIF) {
    const rt2 = rtIfSection.match(/([\d.]+)\s*$/);
    data.realtimeIF = rt2 ? rt2[1] : '';
  }

  data.fiveYearIF = firstNum(nextTd(html, '五年影响因子'));
  data.jciValue = firstNum(nextTd(html, 'JCI期刊引文指标'));

  const hIdxMatch = html.match(/h-index[\s\S]*?<\/t[dD]>\s*<t[dD][^>]*>\s*(\d+)\s*</i);
  data.hIndex = hIdxMatch ? hIdxMatch[1] : '';

  const csData = parseCiteScore(html);
  data.citeScore = csData.citeScore;
  data.sjr = csData.sjr;
  data.snip = csData.snip;
  data.citeScoreRankings = csData.citeScoreRankings;

  data.selfCitationRate = firstPct(nextTd(html, '2024-2025自引率'));

  data.reviewSpeed = nextTd(html, '平均审稿速度').replace(/网友分享经验[：:]?\s*/, '').trim();
  data.acceptanceRate = nextTd(html, '平均录用比例').replace(/网友分享经验[：:]?\s*/, '').trim();

  const artPattern = html.match(/<t[dD][^>]*>年文章数[\s\S]*?<\/t[dD]>\s*<t[dD][^>]*colspan="2"[^>]*>([\s\S]*?)<\/t[dD]>/i);
  if (artPattern) {
    const numM = artPattern[1].match(/^\s*(\d+)/);
    data.articleCount = numM ? numM[1] : '';
  } else {
    data.articleCount = '';
  }

  const scoreMatch = html.match(/LetPub评分[\s\S]*?font-size:24px[^>]*>([\d.]+)/i);
  data.letpubScore = scoreMatch ? scoreMatch[1] : '';

  const partitions = parseAllPartitions(html);
  Object.assign(data, partitions);

  const jcrData = parseJCR(html);
  data.wosZone = jcrData.wosZone;
  data.jif = jcrData.jif;
  data.jci = jcrData.jci;

  return data;
}

module.exports = { fetchUrl, parseDetail };
