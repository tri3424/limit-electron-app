import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { stat, rename, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ROOT = resolve(process.cwd());
const MODELS_DIR = join(ROOT, 'models');
const EMBED_DIR = join(MODELS_DIR, 'embedding-model');
const MANIFEST_PATH = join(EMBED_DIR, 'manifest.json');

const EMBED_MODEL = {
  repo: 'Xenova/all-MiniLM-L6-v2',
  files: [
    'config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    // Transformers.js expects ONNX weights in onnx/
    'onnx/model.onnx',
  ],
};

const EMBED_MODEL_DIR = join(EMBED_DIR, EMBED_MODEL.repo);

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function sha256File(p) {
  const h = createHash('sha256');
  h.update(readFileSync(p));
  return h.digest('hex');
}

function readManifest() {
  try {
    if (!existsSync(MANIFEST_PATH)) return null;
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function validateManifest(manifest) {
  try {
    if (!manifest || manifest.schemaVersion !== 1) return false;
    if (manifest.repo !== EMBED_MODEL.repo) return false;
    if (!manifest.files || typeof manifest.files !== 'object') return false;
    for (const rel of EMBED_MODEL.files) {
      const p = join(EMBED_MODEL_DIR, rel);
      if (!existsSync(p)) return false;
      const st = statSync(p);
      if (!st.isFile() || st.size <= 0) return false;
      const rec = manifest.files[rel];
      if (!rec || typeof rec.sha256 !== 'string') return false;
      const got = sha256File(p);
      if (got !== rec.sha256) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function downloadToFile(url, outPath) {
  ensureDir(dirname(outPath));

  // If already present and non-empty, keep it.
  if (existsSync(outPath)) {
    const s = await stat(outPath);
    if (s.isFile() && s.size > 0) return;
  }

  const tmpPath = `${outPath}.tmp`;
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'mathink-postinstall' } });
    if (!res.ok || !res.body) {
      throw new Error(`Download failed: ${url} (status ${res.status})`);
    }
    const nodeStream = Readable.fromWeb(res.body);
    await pipeline(nodeStream, createWriteStream(tmpPath));

    const st = await stat(tmpPath);
    if (!st.isFile() || st.size <= 0) {
      throw new Error(`Downloaded file is empty: ${outPath}`);
    }
    await rename(tmpPath, outPath);
  } catch (e) {
    try {
      await unlink(tmpPath);
    } catch {
      // ignore
    }
    throw e;
  }
}

async function writeManifest() {
  const files = {};
  for (const rel of EMBED_MODEL.files) {
    const p = join(EMBED_MODEL_DIR, rel);
    // eslint-disable-next-line no-await-in-loop
    const s = await stat(p);
    files[rel] = { size: s.size, sha256: sha256File(p) };
  }
  const manifest = {
    schemaVersion: 1,
    createdAt: Date.now(),
    repo: EMBED_MODEL.repo,
    files,
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
}

async function main() {
  if (process.env.SKIP_MODEL_DOWNLOAD === 'true') {
    // eslint-disable-next-line no-console
    console.log('[postinstall-models] SKIP_MODEL_DOWNLOAD=true; skipping model downloads.');
    return;
  }

  ensureDir(EMBED_MODEL_DIR);

  const manifest = readManifest();
  if (manifest && validateManifest(manifest)) {
    // eslint-disable-next-line no-console
    console.log('[postinstall-models] Embedding model already present and verified.');
    return;
  }

  // eslint-disable-next-line no-console
  console.log('[postinstall-models] Downloading embedding model for long answers...');

  for (const rel of EMBED_MODEL.files) {
    const outPath = join(EMBED_MODEL_DIR, rel);
    const url = `https://huggingface.co/${EMBED_MODEL.repo}/resolve/main/${rel}?download=true`;
    // eslint-disable-next-line no-console
    console.log(`[postinstall-models] ${EMBED_MODEL.repo}/${rel}`);
    // eslint-disable-next-line no-await-in-loop
    await downloadToFile(url, outPath);
  }

  await writeManifest();

  // eslint-disable-next-line no-console
  console.log('[postinstall-models] Done.');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[postinstall-models] Failed:', err);
  process.exit(1);
});
