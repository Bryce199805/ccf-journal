const test = require('node:test');
const assert = require('node:assert/strict');
const { extractWOSScienceEvidence, inspectAuthenticatedPage } = require('./auth_canary');

test('auth canary detects the anonymous WOS login gate', () => {
  const result = inspectAuthenticatedPage(
    '<a href="?journalid=3567&page=journalapp&view=detail">期刊名字</a>'
      + '<div>注<span>册</span>　或 <b>登录</b>\u200b 后，<i>查看</i>WOS分区等级</div>'
  );
  assert.equal(result.structureValid, true);
  assert.equal(result.loginGateVisible, true);
  assert.equal(result.wosStatus, 'auth_required');
  assert.equal(result.authenticatedContentAvailable, false);
});

test('new WOS JCR heading accepts directly associated values only', () => {
  const valid = inspectAuthenticatedPage('<a href="?page=journalapp&view=detail">期刊ISSN</a>'
    + '<table><tr><td>WOS期刊JCR分区</td><td>2区</td></tr></table>');
  assert.equal(valid.wosStatus, 'available');
  const noValue = inspectAuthenticatedPage('<a href="?page=journalapp&view=detail">期刊ISSN</a>'
    + '<div>WOS期刊JCR分区</div><div>中科院升级版分区1区</div>');
  assert.equal(noValue.wosStatus, 'source_missing');
  assert.equal(noValue.authStatus, 'unknown');
});

test('auth canary accepts a structured page without a login gate', () => {
  const result = inspectAuthenticatedPage(
    '<a href="?journalid=3567&page=journalapp&view=detail">期刊名字</a>'
      + '<div>WOS分区等级：1区</div>'
  );
  assert.equal(result.structureValid, true);
  assert.equal(result.authenticatedContentAvailable, true);
  assert.equal(result.authStatus, 'authenticated');
  assert.equal(result.wosSectionPresent, true);
});

test('detail page with a public login form is not classified as a login page', () => {
  const result = inspectAuthenticatedPage(
    '<a href="?journalid=3567&page=journalapp&view=detail">期刊ISSN</a>'
      + '<form action="?page=login"><input type="password"></form>'
      + '<div>WOS分区等级：2区</div>'
  );
  assert.equal(result.loginFormPresent, true);
  assert.equal(result.hasJournalDetailContent, true);
  assert.equal(result.loginPage, false);
  assert.equal(result.authStatus, 'authenticated');
});

test('HTTP-shaped detail page without login gate or WOS block has unknown auth state', () => {
  const result = inspectAuthenticatedPage(
    '<a href="?journalid=3567&page=journalapp&view=detail">期刊ISSN</a>'
      + '<div>期刊名字 INFORMATION SCIENCES</div>'
  );
  assert.equal(result.loginPage, false);
  assert.equal(result.loginGateVisible, false);
  assert.equal(result.authenticatedContentAvailable, false);
  assert.equal(result.authStatus, 'unknown');
});

test('WOS heading without a zone or explicit availability statement is unknown', () => {
  const result = inspectAuthenticatedPage(
    '<a href="?journalid=3567&page=journalapp&view=detail">期刊ISSN</a>'
      + '<div>期刊名字 INFORMATION SCIENCES</div><div>WOS分区等级：</div>'
  );
  assert.equal(result.wosSectionPresent, true);
  assert.equal(result.wosStatus, 'source_missing');
  assert.equal(result.authStatus, 'unknown');
  assert.equal(result.authenticatedContentAvailable, false);
});

test('WOS evidence keeps only sanitized visible scientific text', () => {
  const html = '<a href="?journalid=3567&page=journalapp&view=detail">期刊ISSN</a>'
    + '<script>WOS分区等级：1区 cookie=must-not-appear</script>'
    + '<form><input type="password" value="private"></form>'
    + '<table><tr><td>WOS分区等级</td><td><span onmouseover="show(\'tooltip 1区 Q1 > not visible\')">2区</span></td></tr>'
    + '<tr><td>按JIF指标学科分区</td><td>Computer Science</td><td>Q1</td></tr></table>';
  const report = inspectAuthenticatedPage(html);
  assert.equal(report.authStatus, 'authenticated');
  assert.equal(report.wosStatus, 'available');
  assert.ok(report.wosScienceEvidence.length >= 2);
  const serialized = JSON.stringify(extractWOSScienceEvidence(html));
  assert.match(serialized, /2区/);
  assert.match(serialized, /JIF/);
  assert.doesNotMatch(serialized, /must-not-appear|private|cookie|tooltip|not visible/);
});

test('WOS context is captured after a long nested title row without treating generic JCR text as WOS data', () => {
  const filler = '期刊介绍 '.repeat(100);
  const html = '<table><tr><td>期刊名字 INFORMATION SCIENCES 此期刊被最新的JCR期刊SCIE收录</td>'
    + `<td>${filler}<table><tr><td>WOS分区等级：</td><td>3区</td></tr></table></td></tr></table>`;
  const evidence = extractWOSScienceEvidence(html);
  const contexts = evidence.filter(item => item.source === 'visible_science_context');
  assert.ok(contexts.some(item => item.text.startsWith('WOS分区等级')));
  assert.ok(contexts.some(item => item.text.includes('3区')));
  assert.equal(evidence.some(item => item.text.includes('此期刊被最新的JCR期刊SCIE收录')), false);
});

test('nested hidden WOS markup and attribute tooltip text are excluded while form body remains visible', () => {
  const html = '<a href="?journalid=3567&page=journalapp&view=detail">期刊ISSN</a>'
    + '<form><table><tr><td>WOS分区等级</td><td><span data-tip="fake 1区 >">4区</span></td></tr></table>'
    + '<div hidden><div>WOS分区等级：1区</div></div></form>'
    + '<div style="display:none"><span>WOS分区等级：3区</span></div>';
  const result = inspectAuthenticatedPage(html);
  assert.equal(result.authStatus, 'authenticated');
  assert.equal(result.wosStatus, 'available');
  const evidence = JSON.stringify(result.wosScienceEvidence);
  assert.match(evidence, /4区/);
  assert.doesNotMatch(evidence, /1区|3区|fake/);
});

test('full login page requires a login form and lacks journal content', () => {
  const result = inspectAuthenticatedPage(
    '<html><form action="?page=login"><input type="password" name="password"></form>登录</html>'
  );
  assert.equal(result.loginPage, true);
  assert.equal(result.authStatus, 'login_required');
});
