#!/usr/bin/env sh
set -eu
node scripts/install-offline.mjs

echo "Offline dependencies extracted. Now run: npm install && npm start"
