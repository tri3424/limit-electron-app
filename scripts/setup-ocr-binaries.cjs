'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OFFLINE_DIR = path.join(ROOT, 'native', 'offline-ai');

function exists(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function getPlatformArchDir() {
  const p = process.platform;
  const a = process.arch;
  if (p === 'win32') return a === 'x64' ? 'windows-x64' : `windows-${a}`;
  if (p === 'linux') return a === 'x64' ? 'linux-x64' : `linux-${a}`;
  if (p === 'darwin') return a === 'arm64' ? 'macos-arm64' : a === 'x64' ? 'macos-x64' : `macos-${a}`;
  return `${p}-${a}`;
}

function listMissingOcrFiles(bundleDir) {
  const missing = [];
  const isWin = process.platform === 'win32';
  const pdftoppm = path.join(bundleDir, isWin ? 'pdftoppm.exe' : 'pdftoppm');
  const tesseract = path.join(bundleDir, isWin ? 'tesseract.exe' : 'tesseract');
  const tessdataEng = path.join(bundleDir, 'tessdata', 'eng.traineddata');

  if (!exists(pdftoppm)) missing.push(path.relative(ROOT, pdftoppm));
  if (!exists(tesseract)) missing.push(path.relative(ROOT, tesseract));
  if (!exists(tessdataEng)) missing.push(path.relative(ROOT, tessdataEng));
  return missing;
}

function inferIsWinFromTarget(dirName) {
	const t = String(dirName || '').toLowerCase();
	if (t.startsWith('windows-')) return true;
	if (t.startsWith('win32-')) return true;
	return false;
}

function listMissingOcrFilesForTarget(bundleDir, dirName) {
	const missing = [];
	const isWin = inferIsWinFromTarget(dirName);
	const pdftoppm = path.join(bundleDir, isWin ? 'pdftoppm.exe' : 'pdftoppm');
	const tesseract = path.join(bundleDir, isWin ? 'tesseract.exe' : 'tesseract');
	const tessdataEng = path.join(bundleDir, 'tessdata', 'eng.traineddata');

	if (!exists(pdftoppm)) missing.push(path.relative(ROOT, pdftoppm));
	if (!exists(tesseract)) missing.push(path.relative(ROOT, tesseract));
	if (!exists(tessdataEng)) missing.push(path.relative(ROOT, tessdataEng));
	return missing;
}

async function main() {
  const dirName =
    process.env.VALIDATE_OCR_TARGET && typeof process.env.VALIDATE_OCR_TARGET === 'string'
      ? process.env.VALIDATE_OCR_TARGET
      : getPlatformArchDir();
  const bundleDir = path.join(OFFLINE_DIR, dirName);
  const missing = process.env.VALIDATE_OCR_TARGET ? listMissingOcrFilesForTarget(bundleDir, dirName) : listMissingOcrFiles(bundleDir);

  if (missing.length) {
    const msg = `[ocr-validate] Missing bundled OCR files for ${dirName}:\n${missing.map((m) => `- ${m}`).join('\n')}`;
    if (process.env.VALIDATE_OCR_STRICT === '1' || process.env.VALIDATE_OCR_STRICT === 'true') {
      throw new Error(msg);
    }
    console.warn(msg);
    return;
  }

  console.log(`[ocr-validate] OCR bundle present for ${dirName}.`);
}

main().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err));
  process.exit(1);
});
