import { createWorker, type RecognizeResult } from 'tesseract.js';

export type OfflineOcrProgress = {
  status?: string;
  progress?: number;
};

export type OfflineOcrOptions = {
  lang?: string;
  onProgress?: (p: OfflineOcrProgress) => void;
};

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
    result = await worker.recognize(image);
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
