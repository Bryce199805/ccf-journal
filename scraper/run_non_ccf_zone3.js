#!/usr/bin/env node
const fs = require('fs');
const { runBatch } = require('./batch_scrape');
const { main: checkAuthenticatedSession } = require('./auth_canary');

const COOKIE_FILE = '/tmp/ccf-letpub-zone3-session.cookie';
const PUBLIC_CANARY_TASK = 'nonccf:1920';

function fixedConfig({ cookie, detailAccessMode, maxJournals, forceTaskKeys = [] }) {
  return {
    nonCcfOnly: true,
    ccfOnly: false,
    refreshDays: 365,
    forceRefresh: false,
    delayMs: 12000,
    jitterMs: 0,
    timeoutMs: 20000,
    retries: 3,
    cookie,
    detailAccessMode,
    maxJournals,
    forceTaskKeys
  };
}

async function main() {
  const publicOnly = process.argv.includes('--public-only');
  let cookie = '';
  if (!publicOnly) {
    if (!fs.existsSync(COOKIE_FILE)) throw new Error('Authenticated session file is missing.');
    cookie = fs.readFileSync(COOKIE_FILE, 'utf8').trim();
    if (!cookie) throw new Error('Authenticated session file is empty.');
  }
  const detailAccessMode = publicOnly ? 'anonymous' : 'authenticated';

  if (process.argv.includes('--auth-only')) {
    await checkAuthenticatedSession({ ...process.env, LETPUB_COOKIE: cookie });
    return;
  }

  const canary = await runBatch(fixedConfig({
    cookie, detailAccessMode, maxJournals: 1,
    forceTaskKeys: publicOnly ? [PUBLIC_CANARY_TASK] : []
  }));
  const selectedKey = canary.report.selectedTaskKeys[0];
  const canaryState = selectedKey && canary.progress.tasks[selectedKey];
  const canaryEntry = canary.results.find(entry => entry.journalid
    && String(entry.journalid) === String(canaryState?.journalid));
  const canaryPassed = canary.report.scope === 'nonccf_only'
    && canary.report.attemptedThisRun === 1
    && canaryState?.status === 'success'
    && canaryState.identityCheck?.valid === true
    && canaryState.policy?.accepted === true
    && canaryState.policy?.actualBigCategory === '计算机科学'
    && canaryState.policy?.actualBigZone === '3区'
    && canaryState.detailAccessMode === detailAccessMode
    && (publicOnly || ['available', 'not_indexed', 'partition_unavailable'].includes(canaryEntry?.wosStatus));
  if (!canaryPassed) {
    console.log(JSON.stringify({
      phase: 'canary', passed: false, scope: canary.report.scope,
      attempted: canary.report.attemptedThisRun,
      selectedTaskKey: selectedKey || null,
      status: canaryState?.status || null,
      reason: canaryState?.reason || null,
      identityValid: canaryState?.identityCheck?.valid === true,
      detailAccessMode: canaryState?.detailAccessMode || null,
      actualBigCategory: canaryState?.policy?.actualBigCategory || null,
      actualBigZone: canaryState?.policy?.actualBigZone || null,
      wosStatus: canaryEntry?.wosStatus || null
    }));
    process.exitCode = 2;
    return;
  }

  console.log(JSON.stringify({
    phase: 'canary', passed: true, scope: canary.report.scope,
    selectedTaskKey: selectedKey,
    actualBigCategory: canaryState.policy.actualBigCategory,
    actualBigZone: canaryState.policy.actualBigZone,
    detailAccessMode
  }));

  // Each batch owns its throttle; preserve the minimum gap across batches too.
  await new Promise(resolve => setTimeout(resolve, 12000));
  const full = await runBatch({
    ...fixedConfig({ cookie, detailAccessMode, maxJournals: Infinity }),
    onProgress: event => console.log(JSON.stringify({ phase: 'progress', ...event }))
  });
  console.log(JSON.stringify({ phase: 'full', ...full.report }));
  if (full.report.scope !== 'nonccf_only' || !full.report.countsClosed || !full.report.closed) {
    process.exitCode = 3;
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
