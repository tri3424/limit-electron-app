 'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const MODELS_DIR = path.join(ROOT, 'native', 'offline-ai', 'models');

const DEV_BOOTSTRAP = process.env.OFFLINE_AI_BOOTSTRAP === '1' || process.env.OFFLINE_AI_BOOTSTRAP === 'true';
const NODE_ENV = process.env.NODE_ENV || '';

if (!DEV_BOOTSTRAP || NODE_ENV === 'production') {
  process.exit(0);
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(filePath);
    s.on('data', (d) => h.update(d));
    s.on('error', reject);
    s.on('end', () => resolve(h.digest('hex')));
  });
}

function downloadToFile(url, outPath) {
  return new Promise((resolve, reject) => {
    const tmpPath = `${outPath}.tmp`;
    const f = fs.createWriteStream(tmpPath);

    const request = https.get(url, { headers: { 'User-Agent': 'limit-offline-ai-bootstrap' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        f.close(() => {
          try { fs.unlinkSync(tmpPath); } catch {}
          downloadToFile(res.headers.location, outPath).then(resolve, reject);
        });
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: ${url} (status ${res.statusCode})`));
        return;
      }

      res.pipe(f);
      f.on('finish', () => {
        f.close(() => {
          fs.renameSync(tmpPath, outPath);
          resolve();
        });
      });
    });

    request.on('error', (err) => {
      try { f.close(); } catch {}
      try { fs.unlinkSync(tmpPath); } catch {}
      reject(err);
    });

    f.on('error', (err) => {
      try { f.close(); } catch {}
      try { fs.unlinkSync(tmpPath); } catch {}
      reject(err);
    });
  });
}

async function ensureFile(params) {
  fs.mkdirSync(path.dirname(params.outPath), { recursive: true });

	const expectedSha = typeof params.sha256 === 'string' && params.sha256.trim() ? params.sha256.trim() : '';

  if (fs.existsSync(params.outPath)) {
    const cur = await sha256File(params.outPath);
    if (expectedSha && cur === expectedSha) {
      try { fs.chmodSync(params.outPath, 0o444); } catch {}
      return;
    }
		if (!expectedSha) {
			console.log(`[offline-ai] ${params.name} already exists at ${params.outPath}`);
			console.log(`[offline-ai] sha256(${params.name}) = ${cur}`);
			return;
		}
    fs.unlinkSync(params.outPath);
  }

  await downloadToFile(params.url, params.outPath);
  const got = await sha256File(params.outPath);
	if (!expectedSha) {
		console.log(`[offline-ai] Downloaded ${params.name} to ${params.outPath}`);
		console.log(`[offline-ai] sha256(${params.name}) = ${got}`);
		return;
	}

  if (got !== expectedSha) {
    try { fs.unlinkSync(params.outPath); } catch {}
    throw new Error(`SHA256 mismatch for ${params.outPath}. Expected ${expectedSha}, got ${got}`);
  }

  try { fs.chmodSync(params.outPath, 0o444); } catch {}
}

async function main() {
  const embedding = {
    name: 'embedding.gguf',
    url: 'https://huggingface.co/gpustack/bge-m3-GGUF/resolve/main/bge-m3-Q5_K_M.gguf?download=true',
    sha256: 'f93897db57c4385f1cde3f59234bececa234c0f9bafc646dfdaeebe7f65ea84d',
    outPath: path.join(MODELS_DIR, 'embedding.gguf'),
  };

  const wantsReasoning = process.env.OFFLINE_AI_REASONING_MODEL === '1' || process.env.OFFLINE_AI_REASONING_MODEL === 'true';
  const reasoningUrl = process.env.OFFLINE_AI_REASONING_MODEL_URL || '';
  const reasoningSha = process.env.OFFLINE_AI_REASONING_MODEL_SHA256 || '';
  const reasoning = wantsReasoning && reasoningUrl
    ? {
        name: 'reasoning.gguf',
        url: reasoningUrl,
        sha256: reasoningSha,
        outPath: path.join(MODELS_DIR, 'reasoning.gguf'),
      }
    : null;

  await ensureFile(embedding);

  if (reasoning) {
    await ensureFile(reasoning);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
