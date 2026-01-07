'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OFFLINE_DIR = path.join(ROOT, 'native', 'offline-ai');

const expected = [
  { platform: 'win32', name: 'pdftoppm.exe' },
  { platform: 'win32', name: 'tesseract.exe' },
  { platform: 'linux', name: 'pdftoppm' },
  { platform: 'linux', name: 'tesseract' },
  { platform: 'darwin', name: 'pdftoppm' },
  { platform: 'darwin', name: 'tesseract' },
];

function exists(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function main() {
  const platform = process.platform;
  const required = expected.filter((e) => e.platform === platform);
  if (!required.length) return;

  if (process.env.SKIP_OCR_BINARY_CHECK === '1' || process.env.SKIP_OCR_BINARY_CHECK === 'true') {
    console.warn('[build] SKIP_OCR_BINARY_CHECK is set; skipping OCR binary presence check.');
    return;
  }

  const missing = [];
  for (const r of required) {
    const p = path.join(OFFLINE_DIR, r.name);
    if (!exists(p)) missing.push(`- ${path.relative(ROOT, p)}`);
  }

  if (missing.length) {
    const msg = [
      '[build] Missing bundled OCR binaries.',
      '',
      'These files are required for offline PDF OCR import to work in the packaged app:',
      ...missing,
      '',
      'Fix:',
      '1) Place the correct binaries into native/offline-ai/',
      '2) Rebuild the installer.',
      '',
      'Note: electron-builder is configured to include native/** and unpack it from asar, but the files must exist at build time.',
      '',
    ].join('\n');
    console.error(msg);
    process.exit(1);
  }

  console.log('[build] OCR binaries present.');
}

main();
