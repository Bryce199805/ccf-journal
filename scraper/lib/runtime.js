const fs = require('fs');
const path = require('path');
const https = require('https');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function jitter(baseMs, jitterMs, random = Math.random) {
  return baseMs + Math.floor(Math.max(0, jitterMs) * random());
}

function readJSON(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function atomicWriteJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function hasNormalJournalPageStructure(html) {
  const source = String(html || '');
  return /journalid=\d+/i.test(source)
    || /期刊(?:名字|ISSN)/.test(source)
    || /当前第\s*\d+\s*页[，,]\s*共\s*\d+\s*页/.test(source)
    || /page=journalapp/i.test(source) && /view=(?:search|detail)/i.test(source);
}

function isRateLimitedHTML(html) {
  const source = String(html || '');
  const explicitRateLimit = /(?:访问|请求|操作)(?:速度)?(?:过快|过于频繁|频繁)|速度过快|请勿频繁(?:访问|请求|操作)/i
    .test(source);
  if (explicitRateLimit) return true;

  const hasCaptchaText = /captcha|验证码/i.test(source);
  const hasChallengePageFeature = /(?:人机|安全|访问)验证|verify\s+(?:that\s+)?you\s+are\s+human|checking\s+your\s+browser|challenge-platform|cf-chl|g-recaptcha|hcaptcha|turnstile/i
    .test(source);
  return hasCaptchaText
    && hasChallengePageFeature
    && !hasNormalJournalPageStructure(source);
}

function letPubRequestHeaders(url, {
  userAgent = 'ccf-directory-scraper/1.0',
  cookie = process.env.LETPUB_COOKIE || ''
} = {}) {
  const headers = { 'User-Agent': userAgent };
  const target = new URL(url);
  const isLetPub = target.protocol === 'https:'
    && (target.hostname === 'letpub.com.cn' || target.hostname.endsWith('.letpub.com.cn'));
  const normalizedCookie = String(cookie || '').trim();
  if (/\r|\n/.test(normalizedCookie)) throw new Error('LETPUB_COOKIE must not contain newlines');
  if (normalizedCookie && isLetPub) headers.Cookie = normalizedCookie;
  return headers;
}

function requestHTML(url, {
  timeoutMs = 20000,
  userAgent = 'ccf-directory-scraper/1.0',
  cookie = process.env.LETPUB_COOKIE || ''
} = {}) {
  return new Promise((resolve, reject) => {
    let headers;
    try {
      headers = letPubRequestHeaders(url, { userAgent, cookie });
    } catch (error) {
      reject(error);
      return;
    }
    const req = https.get(url, { headers }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        requestHTML(new URL(response.headers.location, url).toString(), { timeoutMs, userAgent, cookie })
          .then(resolve, reject);
        return;
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ statusCode: response.statusCode || 0, body, url }));
      response.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout after ${timeoutMs}ms`)));
  });
}

async function fetchWithRetry(url, options = {}) {
  const {
    fetchImpl = requestHTML,
    retries = 3,
    timeoutMs = 20000,
    backoffMs = 2000,
    jitterMs = 500,
    random = Math.random,
    sleepImpl = sleep
  } = options;
  let last = { ok: false, kind: 'network_error', error: 'not attempted', attempts: 0, url };
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetchImpl(url, {
        timeoutMs,
        cookie: options.cookie,
        userAgent: options.userAgent
      });
      const body = typeof response === 'string' ? response : response.body;
      const statusCode = typeof response === 'string' ? 200 : response.statusCode;
      if (statusCode === 429 || isRateLimitedHTML(body)) {
        last = { ok: false, kind: 'rate_limited', statusCode, body, attempts: attempt, url };
      } else if (statusCode >= 400) {
        last = { ok: false, kind: 'http_error', statusCode, body, attempts: attempt, url };
      } else {
        return { ok: true, statusCode, body, attempts: attempt, url };
      }
    } catch (error) {
      last = { ok: false, kind: 'network_error', error: error.message, attempts: attempt, url };
    }
    if (attempt < retries) {
      await sleepImpl(jitter(backoffMs * (2 ** (attempt - 1)), jitterMs, random));
    }
  }
  return last;
}

module.exports = {
  atomicWriteJSON,
  fetchWithRetry,
  hasNormalJournalPageStructure,
  isRateLimitedHTML,
  jitter,
  letPubRequestHeaders,
  readJSON,
  requestHTML,
  sleep
};
