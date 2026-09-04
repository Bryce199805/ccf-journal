const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectAuthenticatedPage } = require('./auth_canary');

test('auth canary detects the anonymous WOS login gate', () => {
  const result = inspectAuthenticatedPage(
    '<a href="?journalid=3567&page=journalapp&view=detail">期刊名字</a>'
      + '<div>注册或登录后，查看WOS分区等级</div>'
  );
  assert.equal(result.structureValid, true);
  assert.equal(result.loginGateVisible, true);
  assert.equal(result.authenticatedContentAvailable, false);
});

test('auth canary accepts a structured page without a login gate', () => {
  const result = inspectAuthenticatedPage(
    '<a href="?journalid=3567&page=journalapp&view=detail">期刊名字</a>'
      + '<div>WOS分区等级：Q1</div>'
  );
  assert.equal(result.structureValid, true);
  assert.equal(result.authenticatedContentAvailable, true);
});
