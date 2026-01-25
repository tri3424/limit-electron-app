import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { stat, rename, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ROOT = resolve(process.cwd());
const OUT_BASE = join(ROOT, 'embedding_data', 'models');

const MODELS = [
  {
    repo: 'sentence-transformers/all-mpnet-base-v2',
    files: [
      'config.json',
      'tokenizer.json',
      'tokenizer_config.json',
      'onnx/model.onnx',
    ],
  },
  {
    repo: 'sentence-transformers/multi-qa-mpnet-base-cos-v1',
    files: [
      'config.json',
      'tokenizer.json',
      'tokenizer_config.json',
      'onnx/model.onnx',
    ],
  },
];

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
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
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'mathink-ci' } });
    if (!res.ok || !res.body) {
      throw new Error(`Download failed: ${url} (status ${res.status})`);
    }

    // Convert Web stream -> Node stream and pipe to file.
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

async function main() {
  ensureDir(OUT_BASE);

  for (const model of MODELS) {
    for (const rel of model.files) {
      const outPath = join(OUT_BASE, model.repo, rel);
      const url = `https://huggingface.co/${model.repo}/resolve/main/${rel}?download=true`;
      // eslint-disable-next-line no-console
      console.log(`[embed-models] ${model.repo}/${rel}`);
      await downloadToFile(url, outPath);
    }
  }

  // eslint-disable-next-line no-console
  console.log('[embed-models] Done.');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
