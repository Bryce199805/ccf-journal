#!/bin/bash
# Run batch scraper in background with unbuffered output
cd "$(dirname "$0")"
NODE_OPTIONS="--max-old-space-size=512" stdbuf -oL node batch_scrape.js >> output/scrape.log 2>&1
