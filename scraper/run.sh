#!/bin/bash
# Compatibility wrapper. Prefer: npm run scrape
cd "$(dirname "$0")"
mkdir -p output
NODE_OPTIONS="--max-old-space-size=512" node batch_scrape.js
