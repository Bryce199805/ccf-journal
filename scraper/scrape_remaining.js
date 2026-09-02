// Legacy command kept for operators with old runbooks.
// It now uses the same staging/progress pipeline as npm run scrape and never
// writes data/letpub_full.json directly.
const { runBatch } = require('./batch_scrape');

runBatch()
  .then(result => {
    console.log(JSON.stringify(result.report));
    if (result.report.counts.rate_limited > 0) process.exitCode = 2;
  })
  .catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
