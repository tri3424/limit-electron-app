'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OFFLINE_DIR = path.join(ROOT, 'native', 'offline-ai');

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function rimraf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function copyFileSync(src, dest) {
  mkdirp(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDirRecursive(srcDir, destDir) {
  mkdirp(destDir);
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const e of entries) {
    const src = path.join(srcDir, e.name);
    const dest = path.join(destDir, e.name);
    if (e.isDirectory()) copyDirRecursive(src, dest);
    else if (e.isFile()) copyFileSync(src, dest);
  }
}

function findFirstFile(rootDir, predicate) {
  const stack = [rootDir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) {
        if (predicate(p)) return p;
      }
    }
  }
  return null;
}

function httpsGetJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: 'GET',
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: {
          'User-Agent': 'limit-ocr-bootstrap',
          Accept: 'application/vnd.github+json',
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (d) => (data += d));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            httpsGetJson(res.headers.location, headers).then(resolve, reject);
            return;
          }
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`GET ${url} failed: ${res.statusCode} ${res.statusMessage || ''}\n${data}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function downloadToFile(url, filePath) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: 'GET',
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: {
          'User-Agent': 'limit-ocr-bootstrap',
          Accept: '*/*',
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          downloadToFile(res.headers.location, filePath).then(resolve, reject);
          return;
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Download failed: ${res.statusCode} ${res.statusMessage || ''} for ${url}`));
          return;
        }

        mkdirp(path.dirname(filePath));
        const out = fs.createWriteStream(filePath);
        res.pipe(out);
        out.on('finish', () => out.close(resolve));
        out.on('error', reject);
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function runPwsh(script) {
  const res = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    encoding: 'utf8',
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`PowerShell failed:\n${script}\n\n${res.stderr || res.stdout || ''}`);
  }
  return res;
}

async function ensurePoppler(tempDir) {
  console.log('[ocr-bootstrap] Fetching Poppler (pdftoppm) ...');

  const rel = await httpsGetJson('https://api.github.com/repos/oschwartz10612/poppler-windows/releases/latest');
  const assets = Array.isArray(rel.assets) ? rel.assets : [];
  const asset = assets.find((a) => typeof a.name === 'string' && a.name.toLowerCase().endsWith('.zip'));
  if (!asset || !asset.browser_download_url) {
    throw new Error('[ocr-bootstrap] Could not find Poppler zip asset in latest release.');
  }

  const zipPath = path.join(tempDir, `poppler-${asset.name}`);
  await downloadToFile(asset.browser_download_url, zipPath);

  const extractDir = path.join(tempDir, 'poppler-extract');
  rimraf(extractDir);
  mkdirp(extractDir);

  runPwsh(`Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${extractDir}" -Force`);

  // In these zips, binaries typically live under <root>\\Library\\bin
  const pdftoppm = findFirstFile(extractDir, (p) => p.toLowerCase().endsWith('pdftoppm.exe'));
  if (!pdftoppm) {
    throw new Error('[ocr-bootstrap] pdftoppm.exe not found inside Poppler zip');
  }

  const popplerBinDir = path.dirname(pdftoppm);
  console.log(`[ocr-bootstrap] Copying Poppler binaries from ${popplerBinDir} -> ${OFFLINE_DIR}`);
  copyDirRecursive(popplerBinDir, OFFLINE_DIR);
}

async function ensureTesseract(tempDir) {
  console.log('[ocr-bootstrap] Fetching Tesseract ...');

  // UB Mannheim links to the official tesseract-ocr/tesseract release installer.
  const rel = await httpsGetJson('https://api.github.com/repos/tesseract-ocr/tesseract/releases/latest');
  const assets = Array.isArray(rel.assets) ? rel.assets : [];
  const asset = assets.find(
    (a) =>
      typeof a.name === 'string' &&
      /tesseract-ocr-w64-setup-.*\.exe$/i.test(a.name) &&
      typeof a.browser_download_url === 'string'
  );

  if (!asset || !asset.browser_download_url) {
    throw new Error('[ocr-bootstrap] Could not find tesseract-ocr-w64-setup-*.exe in latest tesseract release.');
  }

  const exePath = path.join(tempDir, asset.name);
  await downloadToFile(asset.browser_download_url, exePath);

  const installDir = path.join(tempDir, 'tesseract-install');
  rimraf(installDir);
  mkdirp(installDir);

  // Most NSIS installers support: /S (silent) and /D=<dir> (install dir) as the last argument.
  // We use PowerShell Start-Process to wait for completion.
  const escapedExe = exePath.replace(/'/g, "''");
  const escapedInstall = installDir.replace(/'/g, "''");
  runPwsh(`$p = Start-Process -FilePath '${escapedExe}' -ArgumentList @('/S','/D=${escapedInstall}') -Wait -PassThru; if ($p.ExitCode -ne 0) { throw ('Tesseract installer exited with code ' + $p.ExitCode) }`);

  const tesseractExe = path.join(installDir, 'tesseract.exe');
  if (!exists(tesseractExe)) {
    // Some installers nest into a subfolder; try to locate it.
    const located = findFirstFile(installDir, (p) => p.toLowerCase().endsWith('tesseract.exe'));
    if (!located) {
      throw new Error('[ocr-bootstrap] tesseract.exe not found after installing Tesseract');
    }
    console.log(`[ocr-bootstrap] Copying Tesseract folder from ${path.dirname(located)} -> ${OFFLINE_DIR}`);
    copyDirRecursive(path.dirname(located), OFFLINE_DIR);
    return;
  }

  console.log(`[ocr-bootstrap] Copying Tesseract folder from ${installDir} -> ${OFFLINE_DIR}`);
  copyDirRecursive(installDir, OFFLINE_DIR);
}

function hasOcrBinaries() {
  const pdftoppm = path.join(OFFLINE_DIR, 'pdftoppm.exe');
  const tesseract = path.join(OFFLINE_DIR, 'tesseract.exe');
  const tessdataEng = path.join(OFFLINE_DIR, 'tessdata', 'eng.traineddata');
  return exists(pdftoppm) && exists(tesseract) && exists(tessdataEng);
}

async function main() {
  if (process.platform !== 'win32') {
    console.log('[ocr-bootstrap] Non-Windows platform detected; skipping OCR binary bootstrap.');
    return;
  }

  if (process.env.SKIP_OCR_BOOTSTRAP === '1' || process.env.SKIP_OCR_BOOTSTRAP === 'true') {
    console.warn('[ocr-bootstrap] SKIP_OCR_BOOTSTRAP is set; skipping OCR binary bootstrap.');
    return;
  }

  mkdirp(OFFLINE_DIR);

  if (hasOcrBinaries()) {
    console.log('[ocr-bootstrap] OCR binaries already present; nothing to do.');
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'limit-ocr-'));
  try {
    await ensurePoppler(tempDir);
    await ensureTesseract(tempDir);
  } finally {
    rimraf(tempDir);
  }

  if (!hasOcrBinaries()) {
    throw new Error(
      '[ocr-bootstrap] OCR bootstrap completed but required files are still missing. Expected native/offline-ai/pdftoppm.exe, native/offline-ai/tesseract.exe, native/offline-ai/tessdata/eng.traineddata'
    );
  }

  console.log('[ocr-bootstrap] OCR binaries installed into native/offline-ai successfully.');
}

main().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err));
  process.exit(1);
});
