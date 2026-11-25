const { createHash } = require('node:crypto');

function snapshotDigest(rows) {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

module.exports = { snapshotDigest };
