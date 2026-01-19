import { createWorker, type RecognizeResult } from 'tesseract.js';

export type OfflineOcrProgress = {
  status: string;
  progress: number;
};

export type OfflineOcrOptions = {
  lang?: string;
  onProgress?: (p: OfflineOcrProgress) => void;
  preprocess?: boolean;
};

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, n | 0));
}

function pixelLum(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function otsuThresholdFromHistogram(hist: Uint32Array, total: number): number {
  // Classic Otsu thresholding (0-255).
  let sumAll = 0;
  for (let i = 0; i < 256; i += 1) sumAll += i * hist[i]!;

  let sumB = 0;
  let wB = 0;
  let best = 127;
  let maxBetween = -1;

  for (let t = 0; t < 256; t += 1) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxBetween) {
      maxBetween = between;
      best = t;
    }
  }
  return best;
}

async function imageLikeToCanvas(image: File | Blob | string): Promise<HTMLCanvasElement> {
  let blob: Blob;
  if (typeof image === 'string') {
    // local data URL or blob URL
    if (/^data:/i.test(image) || /^blob:/i.test(image)) {
      blob = await fetch(image).then((r) => r.blob());
    } else {
      // fall back: let tesseract handle unknown string types
      // (should be prevented by caller for remote URLs)
      blob = await fetch(image).then((r) => r.blob());
    }
  } else {
    blob = image;
  }

  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, bitmap.width);
  canvas.height = Math.max(1, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context not available');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

async function preprocessForOcr(image: File | Blob | string): Promise<HTMLCanvasElement> {
  const canvas = await imageLikeToCanvas(image);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const hist = new Uint32Array(256);
  const data = img.data;
  let total = 0;
  let lumSum = 0;

  for (let i = 0; i < data.length; i += 4) {
    const lum = pixelLum(data[i]!, data[i + 1]!, data[i + 2]!);
    const l = clampByte(lum);
    hist[l] += 1;
    lumSum += l;
    total += 1;
  }

  // Approx median luminance (background proxy).
  const half = Math.max(1, Math.floor(total / 2));
  let acc = 0;
  let median = 255;
  for (let i = 0; i < 256; i += 1) {
    acc += hist[i]!;
    if (acc >= half) {
      median = i;
      break;
    }
  }

  // If background is dark-ish, invert first so we always binarize to black text on white.
  const shouldInvert = median < 128;

  // Recompute histogram on (possibly inverted) grayscale.
  hist.fill(0);
  for (let i = 0; i < data.length; i += 4) {
    let lum = pixelLum(data[i]!, data[i + 1]!, data[i + 2]!);
    let g = clampByte(lum);
    if (shouldInvert) g = 255 - g;
    hist[g] += 1;
  }

  const thr = otsuThresholdFromHistogram(hist, total);

  for (let i = 0; i < data.length; i += 4) {
    let lum = pixelLum(data[i]!, data[i + 1]!, data[i + 2]!);
    let g = clampByte(lum);
    if (shouldInvert) g = 255 - g;
    const v = g > thr ? 255 : 0;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

let sharedWorker: Awaited<ReturnType<typeof createWorker>> | null = null;
let sharedWorkerLang: string | null = null;

function getDocumentBaseUrl(): URL {
  // Always resolve relative asset URLs from the document URL, not from the worker URL.
  // This is critical for file:// packaged Electron apps where the worker runs from
  // vendor/ocr/worker.min.js and would otherwise resolve core/lang paths relative to itself.
  if (typeof window === 'undefined' || !window.location?.href) {
    return new URL('http://localhost/');
  }
  return new URL('.', window.location.href);
}

function getPublicBaseUrl(): string {
  // Vite sets BASE_URL; in Electron it may be "./" depending on config.
  // We normalize to ensure paths resolve relative to app origin.
  const base = (import.meta as any).env?.BASE_URL as string | undefined;
  if (!base) return '/';
  return base.endsWith('/') ? base : `${base}/`;
}

function getOfflineOcrAssetPaths() {
  const base = getPublicBaseUrl();
  const docBase = getDocumentBaseUrl();

  // These files must exist under public/vendor/ocr/ in the final offline bundle.
  // IMPORTANT: Use absolute URLs so the WebWorker does not resolve paths relative to itself.
  return {
    workerPath: new URL(`${base}vendor/ocr/worker.min.js`, docBase).href,
    // IMPORTANT: corePath should be a directory containing *all* core builds.
    corePath: new URL(`${base}vendor/ocr/core`, docBase).href,
    // IMPORTANT: langPath should NOT include a trailing slash.
    langPath: new URL(`${base}vendor/ocr/lang`, docBase).href.replace(/\/$/, ''),
  };
}

async function assertVendorAssetsPresent(lang: string): Promise<void> {
  const { workerPath, corePath, langPath } = getOfflineOcrAssetPaths();
  const langFile = `${langPath}/${lang}.traineddata`;

  // We check for the core directory existence by requesting one expected file.
  const coreProbe = `${corePath}/tesseract-core.wasm.js`;
  const [wRes, cRes, lRes] = await Promise.all([fetch(workerPath), fetch(coreProbe), fetch(langFile)]);
  if (!wRes.ok || !cRes.ok || !lRes.ok) {
    throw new Error(
      `Offline OCR assets missing. Required files:\n- ${workerPath}\n- ${coreProbe}\n- ${langFile}`
    );
  }

  // Detect placeholder files shipped in-repo.
  const [wText, cText] = await Promise.all([wRes.text(), cRes.text()]);
  if (wText.includes('Offline OCR worker asset missing') || cText.includes('Offline OCR core asset missing')) {
    throw new Error(
      `Offline OCR assets are placeholders. Replace them with real tesseract.js assets:\n- ${workerPath}\n- ${coreProbe}\n- ${langFile}`
    );
  }
}

async function getWorker(lang: string, onProgress?: (p: OfflineOcrProgress) => void) {
  const paths = getOfflineOcrAssetPaths();

  if (sharedWorker && sharedWorkerLang === lang) return sharedWorker;
  if (sharedWorker) {
    try {
      await sharedWorker.terminate();
    } catch {
      // ignore
    }
    sharedWorker = null;
    sharedWorkerLang = null;
  }

  // Strict offline: require vendor assets to exist locally.
  await assertVendorAssetsPresent(lang);

  // NOTE: Do not pass function callbacks (logger) into the worker options.
  // Some environments can trigger structured-clone failures.
  onProgress?.({ status: 'initializing', progress: 0 });

  // tesseract.js v5 signature: createWorker(langs, oem, options)
  // If we pass the options object as the first argument, the library will call `.map`
  // on it and throw "x.map is not a function".
  const worker = await createWorker(lang, 1, {
    langPath: paths.langPath,
    corePath: paths.corePath,
    workerPath: paths.workerPath,
    // Our traineddata is a plain file (not .gz)
    gzip: false,
    // Avoid Blob worker edge-cases; we serve the worker from our own origin.
    workerBlobURL: false,
  });

  onProgress?.({ status: 'ready', progress: 1 });

  sharedWorker = worker;
  sharedWorkerLang = lang;

  return worker;
}

export async function recognizeImageText(
  image: File | Blob | string,
  opts: OfflineOcrOptions = {}
): Promise<{ text: string; raw: RecognizeResult }> {
  const lang = opts.lang || 'eng';
  const worker = await getWorker(lang, opts.onProgress);

  // tesseract.js accepts string URLs, File/Blob.
  // We purposely do not accept remote URLs; caller should pass File/Blob or data URL.
  if (typeof image === 'string') {
    if (/^https?:\/\//i.test(image)) {
      throw new Error('Offline OCR does not allow remote URLs. Provide a File/Blob or a local data URL.');
    }
  }

  let result: RecognizeResult;
  try {
    opts.onProgress?.({ status: 'recognizing', progress: 0 });
    const preprocessed = opts.preprocess === false ? image : await preprocessForOcr(image);
    result = await worker.recognize(preprocessed);
    opts.onProgress?.({ status: 'done', progress: 1 });
  } catch (e: any) {
    const paths = getOfflineOcrAssetPaths();
    const msg =
      (e?.message ? String(e.message) : String(e)) +
      `\n\nOffline OCR assets must be present:\n- ${paths.workerPath}\n- ${paths.corePath}\n- ${paths.langPath}${lang}.traineddata`;
    throw new Error(msg);
  }

  return { text: result.data.text || '', raw: result };
}

export async function terminateOfflineOcrWorker(): Promise<void> {
  if (!sharedWorker) return;
  const w = sharedWorker;
  sharedWorker = null;
  sharedWorkerLang = null;
  await w.terminate();
}
