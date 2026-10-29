const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  fetchWithRetry,
  hasNormalJournalPageStructure,
  isRateLimitedHTML,
  letPubRequestHeaders
} = require('./runtime');

const searchFixtures = path.join(__dirname, '..', 'fixtures', 'search');
const fixture = name => fs.readFileSync(path.join(searchFixtures, name), 'utf8');

test('normal journal page with comment captcha is not rate limited', async () => {
  const html = fixture('normal_with_comment_captcha.html');
  assert.equal(hasNormalJournalPageStructure(html), true);
  assert.equal(isRateLimitedHTML(html), false);
  const response = await fetchWithRetry('https://example.invalid/search', {
    retries: 1,
    fetchImpl: async () => ({ statusCode: 200, body: html })
  });
  assert.equal(response.ok, true);
});

test('ordinary captcha text alone is not a rate-limit signal', () => {
  assert.equal(isRateLimitedHTML('<p>评论区随机验证码 captcha</p>'), false);
});

test('explicit frequency warning remains rate limited', () => {
  assert.equal(isRateLimitedHTML(fixture('rate_limited.html')), true);
});

test('challenge features without normal journal structure are rate limited', () => {
  const html = '<html><title>安全验证</title><div class="g-recaptcha">请完成人机验证码</div></html>';
  assert.equal(hasNormalJournalPageStructure(html), false);
  assert.equal(isRateLimitedHTML(html), true);
});

test('HTTP 429 is rate limited regardless of response body', async () => {
  let attempts = 0;
  const response = await fetchWithRetry('https://example.invalid/search', {
    retries: 3,
    fetchImpl: async () => { attempts += 1; return { statusCode: 429, body: '<html>temporary response</html>' }; }
  });
  assert.equal(response.ok, false);
  assert.equal(response.kind, 'rate_limited');
  assert.equal(attempts, 1);
});

test('transient HTTP 5xx responses retry up to the configured attempt count', async () => {
  let attempts = 0;
  const delays = [];
  const response = await fetchWithRetry('https://example.invalid/detail', {
    retries: 3, backoffMs: 100, jitterMs: 0,
    sleepImpl: async ms => delays.push(ms),
    fetchImpl: async () => { attempts += 1; return { statusCode: 503, body: 'temporary server error' }; }
  });
  assert.equal(response.ok, false);
  assert.equal(response.kind, 'server_error');
  assert.equal(response.attempts, 3);
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [100, 200]);
});

test('explicit non-retryable wrapper failures stop immediately', async () => {
  let attempts = 0;
  const response = await fetchWithRetry('https://example.invalid/detail', {
    retries: 3,
    fetchImpl: async () => { attempts += 1; return { statusCode: 401, body: 'gate', retryable: false, terminalKind: 'login_gate' }; }
  });
  assert.equal(response.ok, false);
  assert.equal(response.kind, 'login_gate');
  assert.equal(response.attempts, 1);
  assert.equal(attempts, 1);
});

test('LetPub cookie is attached only to HTTPS LetPub hosts', () => {
  const cookie = 'PHPSESSID=test-session; preference=one';
  assert.equal(
    letPubRequestHeaders('https://www.letpub.com.cn/index.php', { cookie }).Cookie,
    cookie
  );
  assert.equal(letPubRequestHeaders('https://example.com/', { cookie }).Cookie, undefined);
  assert.equal(letPubRequestHeaders('http://www.letpub.com.cn/', { cookie }).Cookie, undefined);
});

test('cookie containing header injection characters is rejected', () => {
  assert.throws(
    () => letPubRequestHeaders('https://www.letpub.com.cn/', { cookie: 'a=b\r\nX-Test: bad' }),
    /must not contain newlines/
  );
});

test('fetchWithRetry forwards cookie without logging or returning it', async () => {
  let received;
  const response = await fetchWithRetry('https://www.letpub.com.cn/', {
    retries: 1,
    cookie: 'PHPSESSID=test-session',
    fetchImpl: async (_url, options) => {
      received = options.cookie;
      return { statusCode: 200, body: '<html>ok</html>' };
    }
  });
  assert.equal(received, 'PHPSESSID=test-session');
  assert.equal(response.ok, true);
  assert.equal(JSON.stringify(response).includes('test-session'), false);
});
