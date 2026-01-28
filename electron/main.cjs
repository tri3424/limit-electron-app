'use strict';

const { app, BrowserWindow, Menu, ipcMain, dialog, session, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const crypto = require('crypto');

let embedExtractorCache = {
	modelId: null,
	quantized: null,
	extractor: null,
};

const EMBED_MODEL_PREFERRED = 'sentence-transformers/multi-qa-mpnet-base-cos-v1';
const EMBED_MODEL_FALLBACK = 'Xenova/all-MiniLM-L6-v2';

function getEmbedBaseDir() {
	// Store inside the project during development, and inside resources when packaged
	if (app.isPackaged) {
		return path.join(process.resourcesPath, 'embedding');
	}
	// app.getAppPath() points to the project root in dev (or the asar in prod).
	return path.join(app.getAppPath(), 'embedding_data');
}

// Improve wheel/trackpad feel across the app (Chromium)
app.commandLine.appendSwitch('enable-smooth-scrolling');
app.commandLine.appendSwitch('smooth-scrolling');

// Single instance lock
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function sendEmbedProgress(progress) {
	try {
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send('embed:prepareProgress', progress);
		}
	} catch {
		// ignore
	}
}

function dirBytes(root) {
	try {
		if (!root || !fs.existsSync(root)) return 0;
		const st = fs.statSync(root);
		if (st.isFile()) return st.size;
		if (!st.isDirectory()) return 0;
		let total = 0;
		for (const name of fs.readdirSync(root)) {
			const p = path.join(root, name);
			try {
				const s = fs.statSync(p);
				if (s.isDirectory()) total += dirBytes(p);
				else if (s.isFile()) total += s.size;
			} catch {
				// ignore
			}
		}
		return total;
	} catch {
		return 0;
	}
}

function canWriteToDir(dirPath) {
	try {
		fs.mkdirSync(dirPath, { recursive: true });
		const p = path.join(dirPath, `.__limit_write_test_${Date.now()}_${Math.random().toString(16).slice(2)}.tmp`);
		fs.writeFileSync(p, 'ok');
		fs.unlinkSync(p);
		return true;
	} catch {
		return false;
	}
}

let mainWindow;
const isDev = !app.isPackaged;

function safeJsonLine(obj) {
	try {
		return JSON.stringify(obj);
	} catch {
		return JSON.stringify({ event: 'log_serialization_failed', ts: Date.now() });
	}
}

function getEmbedPaths() {
	const cacheDir = getEmbedBaseDir();
	const modelCacheDir = path.join(cacheDir, 'models');
	const tagIndexMetaPath = path.join(cacheDir, 'tag_index.json');
	const tagIndexBinPath = path.join(cacheDir, 'tag_vectors.f32');
	const feedbackPath = path.join(cacheDir, 'feedback.jsonl');
	const logPath = path.join(cacheDir, 'embed_log.jsonl');
	const manifestPath = path.join(cacheDir, 'embed_manifest.json');
	return { cacheDir, modelCacheDir, tagIndexMetaPath, tagIndexBinPath, feedbackPath, logPath, manifestPath };
}

function getLongAnswerModelDirCandidates() {
	const out = [];
	try {
		out.push(path.resolve(process.cwd(), 'models', 'embedding-model'));
	} catch {
		void 0;
	}
	try {
		out.push(path.join(app.getAppPath(), 'models', 'embedding-model'));
	} catch {
		void 0;
	}
	try {
		out.push(path.resolve(__dirname, '..', 'models', 'embedding-model'));
	} catch {
		void 0;
	}
	try {
		out.push(path.resolve(app.getAppPath(), '..', 'models', 'embedding-model'));
	} catch {
		void 0;
	}
	try {
		const { modelCacheDir } = getEmbedPaths();
		out.push(modelCacheDir);
	} catch {
		void 0;
	}
	return out.filter((p) => typeof p === 'string' && p.length > 0);
}

function pickFirstExistingDir(candidates) {
	for (const p of candidates) {
		try {
			if (!p) continue;
			if (!fs.existsSync(p)) continue;
			const st = fs.statSync(p);
			if (st.isDirectory()) return p;
		} catch {
			// ignore
		}
	}
	return null;
}

function pickLongAnswerModelDir(candidates, modelId) {
	for (const base of candidates) {
		try {
			if (!base) continue;
			if (!fs.existsSync(base)) continue;
			const st = fs.statSync(base);
			if (!st.isDirectory()) continue;
			const dir = path.join(base, modelId);
			const tok = path.join(dir, 'tokenizer.json');
			const cfg = path.join(dir, 'config.json');
			const onnx = path.join(dir, 'onnx', 'model.onnx');
			if (fs.existsSync(tok) && fs.existsSync(cfg) && fs.existsSync(onnx)) {
				return base;
			}
		} catch {
			// ignore
		}
	}
	return null;
}

function getDefaultModelCandidates() {
	// transformers.js may support different namespaces depending on runtime/build.
	// We try multi-qa-mpnet first, then fall back to MiniLM if not compatible/available.
	return [
		EMBED_MODEL_PREFERRED,
		'Xenova/multi-qa-mpnet-base-cos-v1',
		EMBED_MODEL_FALLBACK,
	];
}

function sha256File(p) {
	const h = crypto.createHash('sha256');
	const buf = fs.readFileSync(p);
	h.update(buf);
	return h.digest('hex');
}

function bestEffortDetectLicense(modelDir) {
	try {
		if (!modelDir || !fs.existsSync(modelDir)) return null;
		const candidates = ['README.md', 'readme.md', 'LICENSE', 'LICENSE.txt', 'license', 'license.txt'];
		for (const name of candidates) {
			const p = path.join(modelDir, name);
			if (!fs.existsSync(p)) continue;
			const s = fs.readFileSync(p, 'utf8');
			const m = s.match(/license\s*[:=]\s*([A-Za-z0-9_.-]+)/i);
			if (m && m[1]) return String(m[1]).trim();
			if (/apache\s*2\.0/i.test(s)) return 'Apache-2.0';
			if (/mit\b/i.test(s)) return 'MIT';
			if (/cc-by/i.test(s)) return 'CC-BY';
		}
	} catch {
		// ignore
	}
	return null;
}

function writeEmbedManifest(info) {
	const { cacheDir, tagIndexMetaPath, tagIndexBinPath, manifestPath } = getEmbedPaths();
	try {
		ensureDir(cacheDir);
		const obj = {
			schemaVersion: 1,
			createdAt: Date.now(),
			...info,
			cache: {
				tag_index_json: fs.existsSync(tagIndexMetaPath) ? { size: fs.statSync(tagIndexMetaPath).size, sha256: sha256File(tagIndexMetaPath) } : null,
				tag_vectors_f32: fs.existsSync(tagIndexBinPath) ? { size: fs.statSync(tagIndexBinPath).size, sha256: sha256File(tagIndexBinPath) } : null,
			},
		};
		fs.writeFileSync(manifestPath, JSON.stringify(obj, null, 2), { encoding: 'utf8', mode: 0o600 });
	} catch {
		// ignore
	}
}

function ensureDir(dirPath) {
	fs.mkdirSync(dirPath, { recursive: true });
}

function appendLogLine(lineObj) {
	const { cacheDir, logPath } = getEmbedPaths();
	try {
		ensureDir(cacheDir);
		const line = safeJsonLine({ ts: Date.now(), ...lineObj }) + '\n';
		fs.appendFileSync(logPath, line, { encoding: 'utf8', mode: 0o600 });
	} catch {
		// ignore
	}
}

function normalizeVector(vec) {
	let sum = 0;
	for (let i = 0; i < vec.length; i++) {
		const v = Number(vec[i] || 0);
		sum += v * v;
	}
	const norm = Math.sqrt(sum) || 1;
	for (let i = 0; i < vec.length; i++) vec[i] = Number(vec[i] || 0) / norm;
	return vec;
}

function coerceEmbeddingVector(out) {
	// transformers.js sometimes returns:
	// - number[]
	// - number[][]
	// - Tensor-like { data: Float32Array, dims/shape }
	// - TypedArray
	if (!out) return null;
	if (Array.isArray(out)) {
		let v = out;
		// Unwrap nested arrays until we hit a non-array leaf.
		while (Array.isArray(v) && v.length > 0 && Array.isArray(v[0])) v = v[0];
		if (!Array.isArray(v) || v.length === 0) return null;
		return v.map((x) => Number(x || 0));
	}
	if (out && typeof out === 'object') {
		const data = out.data;
		if (data && typeof data.length === 'number') {
			return Array.from(data, (x) => Number(x || 0));
		}
	}
	if (typeof out.length === 'number') {
		try {
			return Array.from(out, (x) => Number(x || 0));
		} catch {
			return null;
		}
	}
	return null;
}

function sanitizeTags(tags) {
	const out = [];
	const seen = new Set();
	for (const raw of Array.isArray(tags) ? tags : []) {
		const t = String(raw || '').trim();
		if (!t) continue;
		const key = t.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(t);
	}
	return out;
}

function cosineSimilarity(a, b) {
	const n = Math.min(a.length, b.length);
	let s = 0;
	for (let i = 0; i < n; i++) s += Number(a[i] || 0) * Number(b[i] || 0);
	return s;
}

function extractPlainText(html) {
	// Minimal, deterministic stripping without executing code.
	return String(html || '')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function computeInputHash(text) {
	return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function tokenizeForMatch(s) {
	return String(s || '')
		.toLowerCase()
		.replace(/[^a-z0-9+.#\-\s]/g, ' ')
		.split(/\s+/)
		.filter(Boolean);
}

function lexicalScore(text, tag) {
	const t = String(text || '').toLowerCase();
	const name = String(tag || '').toLowerCase().trim();
	if (!t || !name) return 0;
	if (t.includes(name)) return 1;
	const a = tokenizeForMatch(t);
	const b = tokenizeForMatch(name);
	if (!a.length || !b.length) return 0;
	const setA = new Set(a);
	let hit = 0;
	for (const tok of b) if (setA.has(tok)) hit++;
	return hit / b.length;
}

function readFeedbackBias(feedbackPath) {
	const biasByTag = new Map();
	try {
		if (!feedbackPath || !fs.existsSync(feedbackPath)) return biasByTag;
		const raw = fs.readFileSync(feedbackPath, 'utf8');
		const lines = raw.split(/\r?\n/);
		for (const line of lines) {
			const l = String(line || '').trim();
			if (!l) continue;
			let obj;
			try {
				obj = JSON.parse(l);
			} catch {
				continue;
			}
			const tagName = obj && obj.tagName ? String(obj.tagName).trim() : '';
			if (!tagName) continue;
			const action = obj && obj.action ? String(obj.action) : '';
			if (!action) continue;
			const key = tagName.toLowerCase();
			const cur = biasByTag.get(key) || { pos: 0, neg: 0 };
			if (action === 'accept' || action === 'add') cur.pos += 1;
			if (action === 'reject' || action === 'remove') cur.neg += 1;
			biasByTag.set(key, cur);
		}
	} catch {
		return biasByTag;
	}
	return biasByTag;
}

function loadTagIndex() {
	const { tagIndexMetaPath, tagIndexBinPath } = getEmbedPaths();
	if (!fs.existsSync(tagIndexMetaPath) || !fs.existsSync(tagIndexBinPath)) return null;
	const meta = JSON.parse(fs.readFileSync(tagIndexMetaPath, 'utf8'));
	if (!meta || !Array.isArray(meta.tags) || !Number.isFinite(meta.dims)) return null;
	const dims = Math.floor(meta.dims);
	const buf = fs.readFileSync(tagIndexBinPath);
	const floats = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
	return { meta, dims, floats };
}

async function getTransformers() {
	try {
		return await import('@huggingface/transformers');
	} catch {
		throw new Error('Missing @huggingface/transformers');
	}
}

async function getEmbeddingExtractor(params) {
	const modelId = String(params?.modelId || '').trim();
	const modelCacheDir = String(params?.modelCacheDir || '').trim();
	const allowDownload = params?.allowDownload === true;
	const quantized = params?.quantized === true;
	if (!modelId) throw new Error('Missing modelId');
	if (!modelCacheDir) throw new Error('Missing model cache directory');

	if (embedExtractorCache.extractor && embedExtractorCache.modelId === modelId && embedExtractorCache.quantized === quantized) {
		return embedExtractorCache.extractor;
	}

	const transformers = await getTransformers();
	transformers.env.allowRemoteModels = allowDownload;
	transformers.env.allowLocalModels = true;
	transformers.env.useBrowserCache = false;
	transformers.env.useFS = true;
	transformers.env.cacheDir = modelCacheDir;

	const extractor = await transformers.pipeline('feature-extraction', modelId, {
		local_files_only: !allowDownload,
		quantized,
	});
	embedExtractorCache = { modelId, quantized, extractor };
	return extractor;
}

async function chooseAndLoadModel(params) {
	const candidates = Array.isArray(params?.candidates) && params.candidates.length
		? params.candidates
		: getDefaultModelCandidates();
	const modelCacheDir = params?.modelCacheDir;
	const allowDownload = params?.allowDownload === true;

	const attempts = [];
	for (const modelId of candidates) {
		// Prefer quantized when available.
		for (const quantized of [true, false]) {
			try {
				const extractor = await getEmbeddingExtractor({ modelId, modelCacheDir, allowDownload, quantized });
				return { modelId, quantized, extractor };
			} catch (e) {
				attempts.push({ modelId, quantized, error: String(e && e.message ? e.message : e) });
			}
		}
	}
	const last = attempts.length ? attempts[attempts.length - 1] : null;
	throw new Error(last ? last.error : 'Failed to load embedding model');
}

async function embedTextLocalOnly(text, modelId, modelCacheDir) {
	const extractor = await getEmbeddingExtractor({ modelId, modelCacheDir, allowDownload: false });
	const out = await extractor(text, { pooling: 'mean', normalize: true });
	const vec = coerceEmbeddingVector(out);
	if (!vec || vec.length === 0) throw new Error('Embedding output invalid');
	return normalizeVector(vec);
}

function clamp01(x) {
	if (!Number.isFinite(x)) return 0;
	return Math.max(0, Math.min(1, x));
}

function mapSimilarityToScore10(sim01, mapping) {
	const minSim = mapping && Number.isFinite(mapping.minSimilarityForCredit)
		? Number(mapping.minSimilarityForCredit)
		: 0.35;
	const fullSim = mapping && Number.isFinite(mapping.fullCreditSimilarity)
		? Number(mapping.fullCreditSimilarity)
		: 0.82;
	const s = clamp01(Number(sim01));
	if (fullSim <= minSim) {
		return Math.round(s * 10 * 1000) / 1000;
	}
	if (s <= minSim) return 0;
	if (s >= fullSim) return 10;
	const t = (s - minSim) / (fullSim - minSim);
	return Math.round(t * 10 * 1000) / 1000;
}

function keywordMatchStats(adminText, studentText, keywords) {
	const out = [];
	const student = String(studentText || '').toLowerCase();
	let totalW = 0;
	let hitW = 0;
	const list = Array.isArray(keywords) ? keywords : [];
	for (const k of list) {
		const kw = k && k.keyword ? String(k.keyword).trim() : '';
		if (!kw) continue;
		const w = k && Number.isFinite(k.weight) ? Math.max(0, Number(k.weight)) : 1;
		const matched = student.includes(kw.toLowerCase());
		out.push({ keyword: kw, matched, weight: w });
		totalW += w;
		if (matched) hitW += w;
	}
	const score01 = totalW > 0 ? clamp01(hitW / totalW) : undefined;
	return { keywordMatches: out, keywordScore01: score01 };
}

function deterministicFeedbackFromMetadata(meta) {
	const score10 = Number(meta?.numericScore10 ?? 0);
	const sim = Number(meta?.similarity01 ?? 0);
	const matches = Array.isArray(meta?.keywordMatches) ? meta.keywordMatches : [];
	const missing = matches.filter((m) => m && !m.matched).slice(0, 2).map((m) => String(m.keyword));
	const praise = score10 >= 7
		? 'Good job — your answer captures the main idea.'
		: score10 >= 4
			? 'You have some correct elements, but the explanation is incomplete.'
			: 'Your answer does not yet match the expected explanation.';
	const missLine = missing.length
		? `Missing / unclear points: ${missing.join(', ')}.`
		: 'No missing keyword checks were detected.';
	const improve = sim >= 0.75
		? 'Improve by adding one clear concluding sentence that connects the key concepts.'
		: 'Improve by stating the core definition first, then support it with one concrete example or step.';
	return `${praise} ${missLine} ${improve}`.trim();
}

function getAppIconPath() {
	const candidates = [];
	if (app.isPackaged) {
		candidates.push(path.join(process.resourcesPath, 'icon.png'));
		candidates.push(path.join(process.resourcesPath, 'icon.ico'));
	}

	candidates.push(path.join(__dirname, '..', 'build', 'icon.png'));
	candidates.push(path.join(__dirname, '..', 'build', 'icon.ico'));

	for (const p of candidates) {
		try {
			if (p && fs.existsSync(p)) return p;
		} catch {
			// ignore
		}
	}

	return undefined;
}

function clampRect(rect, maxW, maxH) {
	const x = Math.max(0, Math.min(maxW - 1, Math.floor(rect.x)));
	const y = Math.max(0, Math.min(maxH - 1, Math.floor(rect.y)));
	const w = Math.max(1, Math.min(maxW - x, Math.floor(rect.width)));
	const h = Math.max(1, Math.min(maxH - y, Math.floor(rect.height)));
	return { x, y, width: w, height: h };
}

function isQuestionStartLine(text) {
	const t = String(text || '').trim();
	return /^\d{1,3}\s*[\).]/.test(t);
}

function isOptionStartLine(text) {
	const t = String(text || '').trim();
	return /^[A-Ea-e]\s*[\).]/.test(t);
}

function normalizeOptionLabel(text) {
	const t = String(text || '').trim();
	const m = t.match(/^([A-Ea-e])\s*[\).]/);
	return m ? m[1].toUpperCase() : null;
}

function createWindow() {
	const iconPath = getAppIconPath();
	const windowIcon = iconPath ? nativeImage.createFromPath(iconPath) : undefined;
	const hasValidIcon = !!(windowIcon && !windowIcon.isEmpty());
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'MathInk',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
		...(hasValidIcon ? { icon: windowIcon } : {}),
    autoHideMenuBar: true,
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[did-fail-load]', { errorCode, errorDescription, validatedURL });
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[render-process-gone]', details);
  });

	mainWindow.webContents.on('before-input-event', (_event, input) => {
		try {
			const key = String(input.key || '').toLowerCase();
			if (key === 'i' && input.control && input.shift && !input.alt && !input.meta) {
				if (mainWindow && !mainWindow.isDestroyed()) {
					mainWindow.webContents.toggleDevTools();
				}
			}
		} catch {
			// ignore
		}
	});

	const activeExportStreams = new Map();

	ipcMain.handle('data:beginExportJson', async (_event, payload) => {
		if (!mainWindow || mainWindow.isDestroyed()) {
			throw new Error('Main window is not available');
		}
		const defaultFileName = payload && typeof payload.defaultFileName === 'string' ? payload.defaultFileName : 'MathInk-backup.json';
		const pick = await dialog.showSaveDialog(mainWindow, {
			title: 'Export data',
			defaultPath: defaultFileName,
			filters: [{ name: 'JSON', extensions: ['json'] }],
		});
		if (pick.canceled || !pick.filePath) {
			return { canceled: true };
		}
		const exportId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
		const stream = fs.createWriteStream(pick.filePath, { encoding: 'utf8' });
		activeExportStreams.set(exportId, { stream, filePath: pick.filePath });
		return { canceled: false, exportId, filePath: pick.filePath };
	});

	ipcMain.handle('data:writeExportChunk', async (_event, payload) => {
		const exportId = payload && typeof payload.exportId === 'string' ? payload.exportId : '';
		const chunk = payload && typeof payload.chunk === 'string' ? payload.chunk : '';
		if (!exportId) throw new Error('Missing exportId');
		const entry = activeExportStreams.get(exportId);
		if (!entry || !entry.stream) throw new Error('Export not found');
		if (!chunk) return { ok: true };
		await new Promise((resolve, reject) => {
			entry.stream.write(chunk, 'utf8', (err) => (err ? reject(err) : resolve()));
		});
		return { ok: true };
	});

	ipcMain.handle('data:finishExportJson', async (_event, payload) => {
		const exportId = payload && typeof payload.exportId === 'string' ? payload.exportId : '';
		if (!exportId) throw new Error('Missing exportId');
		const entry = activeExportStreams.get(exportId);
		if (!entry || !entry.stream) throw new Error('Export not found');
		await new Promise((resolve, reject) => {
			entry.stream.end(() => resolve());
			entry.stream.on('error', reject);
		});
		activeExportStreams.delete(exportId);
		return { ok: true, filePath: entry.filePath };
	});

	ipcMain.handle('data:abortExportJson', async (_event, payload) => {
		const exportId = payload && typeof payload.exportId === 'string' ? payload.exportId : '';
		if (!exportId) throw new Error('Missing exportId');
		const entry = activeExportStreams.get(exportId);
		if (!entry || !entry.stream) return { ok: true };
		try {
			await new Promise((resolve) => {
				entry.stream.end(() => resolve());
			});
		} catch {
			// ignore
		}
		activeExportStreams.delete(exportId);
		try {
			if (entry.filePath && fs.existsSync(entry.filePath)) {
				fs.unlinkSync(entry.filePath);
			}
		} catch {
			// ignore
		}
		return { ok: true };
	});

  if (isDev) {
    // Vite dev server
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:8080');
  } else {
    // Load built index.html from Vite build
    const appPath = app.getAppPath();
    const candidateIndexPaths = [
      path.join(appPath, 'app-dist', 'index.html'),
      path.join(__dirname, '..', 'app-dist', 'index.html'),
    ];

    const indexPath = candidateIndexPaths.find((p) => fs.existsSync(p));
    if (!indexPath) {
      console.error('[startup] Could not find app-dist/index.html. Tried:', candidateIndexPaths);
      mainWindow.loadURL('data:text/plain;charset=utf-8,' + encodeURIComponent('MathInk failed to start: missing app-dist/index.html'));
      return;
    }

    mainWindow.loadFile(indexPath);
  }

  if (isDev) {
    // Open DevTools only during development
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  // Remove default application menu / toolbar
  Menu.setApplicationMenu(null);

	if (!isDev) {
		try {
			const s = session.defaultSession;
			s.webRequest.onBeforeRequest((details, callback) => {
				try {
					const u = new URL(details.url);
					const proto = u.protocol;
					if (proto === 'file:' || proto === 'app:' || proto === 'devtools:') {
						callback({ cancel: false });
						return;
					}
					if (proto === 'http:' || proto === 'https:' || proto === 'ws:' || proto === 'wss:') {
						const host = u.hostname;
						const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
						callback({ cancel: !isLocal });
						return;
					}
					callback({ cancel: true });
				} catch {
					callback({ cancel: true });
				}
			});
		} catch {
			// ignore
		}
	}

	createWindow();

	// Offline embedding / tagging IPC.
	ipcMain.handle('embed:modelStatus', async () => {
		const { cacheDir, modelCacheDir, tagIndexMetaPath, tagIndexBinPath } = getEmbedPaths();
		const hasCache = fs.existsSync(tagIndexMetaPath) && fs.existsSync(tagIndexBinPath);
		if (!hasCache) {
			return {
				ready: false,
				modelDir: modelCacheDir,
				cacheDir,
				reason: 'Tag embedding cache missing. Run Prepare in Settings.',
			};
		}
		const idx = loadTagIndex();
		const modelId = idx && idx.meta && typeof idx.meta.modelId === 'string' ? idx.meta.modelId : EMBED_MODEL_PREFERRED;
		try {
			await chooseAndLoadModel({ candidates: [modelId, EMBED_MODEL_FALLBACK], modelCacheDir, allowDownload: false });
			return { ready: true, modelDir: modelCacheDir, cacheDir };
		} catch (e) {
			const msg = String(e && e.message ? e.message : e);
			appendLogLine({ event: 'model_status_not_ready', modelId, error: msg, modelCacheDir });
			return {
				ready: false,
				modelDir: modelCacheDir,
				cacheDir,
				reason: `Embedding model not available locally (${modelId}). Run Prepare in Settings. Details: ${msg}`,
			};
		}
	});

	ipcMain.handle('embed:prepare', async (_event, payload) => {
		const requestedModelId = payload && typeof payload.modelId === 'string' && payload.modelId.trim()
			? payload.modelId.trim()
			: EMBED_MODEL_PREFERRED;
		const tags = sanitizeTags(payload && payload.tags);
		const acceptLicense = payload && payload.acceptLicense === true;
		const forceRebuildCache = payload && payload.forceRebuildCache === true;

		if (!acceptLicense) {
			return {
				ok: false,
				requiresConsent: true,
				licenseText: 'Model: sentence-transformers/multi-qa-mpnet-base-cos-v1 (preferred) with fallback Xenova/all-MiniLM-L6-v2. Accept the license in Settings to download and bundle locally.',
				reason: 'License acceptance required.',
			};
		}

		const { cacheDir, modelCacheDir, tagIndexMetaPath, tagIndexBinPath } = getEmbedPaths();
		ensureDir(cacheDir);
		ensureDir(modelCacheDir);

		appendLogLine({ event: 'prepare_start', requestedModelId, tags: tags.length });
		sendEmbedProgress({ step: 'init', message: 'Preparing offline embedding model...', progress: 0 });

		// Strict offline mode: never download during preparation.
		sendEmbedProgress({ step: 'verify', message: 'Verifying local model files...', progress: 0.05 });
		// Load from local cache only. transformers.js manages cached files.
		let extractor;
		let modelId = requestedModelId;
		let quantized = false;
		try {
			const loaded = await chooseAndLoadModel({
				candidates: [requestedModelId, ...getDefaultModelCandidates()],
				modelCacheDir,
				allowDownload: false,
			});
			extractor = loaded.extractor;
			modelId = loaded.modelId;
			quantized = loaded.quantized;
		} catch (e) {
			appendLogLine({ event: 'prepare_download_failed', error: String(e && e.message ? e.message : e) });
			return { ok: false, reason: 'Model not available locally. This app is configured for zero-network operation. Bundle the model into embedding_data/models (or packaged resources) and try again.' };
		}

		// Best-effort license verification: attempt to detect cached license.
		const detectedLicense = bestEffortDetectLicense(modelCacheDir);
		appendLogLine({ event: 'prepare_model_loaded', modelId, quantized, detectedLicense });
		sendEmbedProgress({ step: 'load', message: 'Model loaded locally. Building tag cache...', progress: 0.15 });

		if (!tags.length) {
			return { ok: false, reason: 'No tags provided to build cache.' };
		}

		// Build tag embedding cache.
		if (forceRebuildCache || !fs.existsSync(tagIndexMetaPath) || !fs.existsSync(tagIndexBinPath)) {
			sendEmbedProgress({ step: 'cache', message: 'Building tag embedding cache...', progress: 0.2 });
			const vectors = [];
			let dims = 0;
			for (let i = 0; i < tags.length; i++) {
				const t = tags[i];
				sendEmbedProgress({ step: 'cache', message: `Embedding tag ${i + 1}/${tags.length}`, progress: 0.2 + ((i + 1) / tags.length) * 0.7 });
				let out;
				try {
					out = await extractor(t, { pooling: 'mean', normalize: true });
				} catch (e) {
					appendLogLine({ event: 'prepare_tag_embed_failed', tag: t, error: String(e && e.message ? e.message : e) });
					return { ok: false, reason: `Failed to compute embedding for tag: ${t}` };
				}
				const vec = coerceEmbeddingVector(out);
				if (!vec || vec.length === 0) {
					appendLogLine({ event: 'prepare_tag_embed_invalid', tag: t });
					return { ok: false, reason: `Embedding output invalid for tag: ${t}` };
				}
				const arr = normalizeVector(vec);
				dims = dims || arr.length;
				if (arr.length !== dims) {
					appendLogLine({ event: 'prepare_tag_dims_mismatch', tag: t, got: arr.length, dims });
					return { ok: false, reason: `Embedding dims mismatch for tag: ${t}` };
				}
				vectors.push(arr);
			}

			if (!dims || vectors.length !== tags.length) {
				appendLogLine({ event: 'prepare_cache_failed', dims, vectors: vectors.length, tags: tags.length });
				return { ok: false, reason: 'Failed to compute tag embeddings for all tags.' };
			}

			const flat = new Float32Array(tags.length * dims);
			for (let i = 0; i < tags.length; i++) {
				flat.set(Float32Array.from(vectors[i]), i * dims);
			}

			fs.writeFileSync(tagIndexBinPath, Buffer.from(flat.buffer), { mode: 0o600 });
			fs.writeFileSync(
				tagIndexMetaPath,
				JSON.stringify({ schemaVersion: 1, modelId, quantized, dims, tags, createdAt: Date.now() }, null, 2),
				{ encoding: 'utf8', mode: 0o600 },
			);
			writeEmbedManifest({ modelId, quantized, detectedLicense, acceptedLicense: true });
			sendEmbedProgress({ step: 'done', message: 'Prepared for offline tag suggestions.', progress: 1 });
			appendLogLine({ event: 'prepare_done', modelId, dims, tags: tags.length });
			return { ok: true };
		}
		sendEmbedProgress({ step: 'done', message: 'Offline tagging ready.', progress: 1 });
		appendLogLine({ event: 'prepare_done', modelId });
		return { ok: true, modelDir: modelCacheDir, cacheDir };
	});

	ipcMain.handle('embed:rebuildCache', async (_event, payload) => {
		const modelId = payload && typeof payload.modelId === 'string' && payload.modelId.trim()
			? payload.modelId.trim()
			: EMBED_MODEL_PREFERRED;
		const tags = sanitizeTags(payload && payload.tags);
		if (!tags.length) return { ok: false, reason: 'No tags provided.' };
		const { cacheDir, modelCacheDir, tagIndexMetaPath, tagIndexBinPath } = getEmbedPaths();
		ensureDir(cacheDir);
		ensureDir(modelCacheDir);

		sendEmbedProgress({ step: 'cache', message: 'Rebuilding tag embedding cache...', progress: 0 });

		let extractor;
		let selectedModelId = modelId;
		let quantized = false;
		try {
			const loaded = await chooseAndLoadModel({ candidates: [modelId, EMBED_MODEL_FALLBACK], modelCacheDir, allowDownload: false });
			extractor = loaded.extractor;
			selectedModelId = loaded.modelId;
			quantized = loaded.quantized;
		} catch {
			return { ok: false, reason: 'Model not available locally. Run Prepare first.' };
		}

		const vectors = [];
		let dims = 0;
		for (let i = 0; i < tags.length; i++) {
			const t = tags[i];
			sendEmbedProgress({ step: 'cache', message: `Embedding tag ${i + 1}/${tags.length}`, progress: ((i + 1) / tags.length) });
			let out;
			try {
				out = await extractor(t, { pooling: 'mean', normalize: true });
			} catch (e) {
				appendLogLine({ event: 'rebuild_tag_embed_failed', tag: t, error: String(e && e.message ? e.message : e) });
				return { ok: false, reason: `Failed to compute embedding for tag: ${t}` };
			}
			const vec = coerceEmbeddingVector(out);
			if (!vec || vec.length === 0) {
				appendLogLine({ event: 'rebuild_tag_embed_invalid', tag: t });
				return { ok: false, reason: `Embedding output invalid for tag: ${t}` };
			}
			const arr = normalizeVector(vec);
			dims = dims || arr.length;
			if (arr.length !== dims) {
				appendLogLine({ event: 'rebuild_tag_dims_mismatch', tag: t, got: arr.length, dims });
				return { ok: false, reason: `Embedding dims mismatch for tag: ${t}` };
			}
			vectors.push(arr);
		}
		if (!dims || vectors.length !== tags.length) {
			return { ok: false, reason: 'Failed to compute tag embeddings for all tags.' };
		}
		const flat = new Float32Array(tags.length * dims);
		for (let i = 0; i < tags.length; i++) {
			flat.set(Float32Array.from(vectors[i]), i * dims);
		}
		fs.writeFileSync(tagIndexBinPath, Buffer.from(flat.buffer), { mode: 0o600 });
		fs.writeFileSync(
			tagIndexMetaPath,
			JSON.stringify({ schemaVersion: 1, modelId: selectedModelId, quantized, dims, tags, createdAt: Date.now() }, null, 2),
			{ encoding: 'utf8', mode: 0o600 },
		);
		writeEmbedManifest({ modelId: selectedModelId, quantized, rebuiltCache: true });
		sendEmbedProgress({ step: 'done', message: 'Tag cache rebuilt.', progress: 1 });
		return { ok: true };
	});

	ipcMain.handle('embed:suggestTags', async (_event, payload) => {
		const { cacheDir, modelCacheDir } = getEmbedPaths();
		const availableTags = payload && Array.isArray(payload.availableTags) ? payload.availableTags.map(String) : [];
		const topK = payload && Number.isFinite(payload.topK) ? Math.max(1, Math.floor(payload.topK)) : 4;
		// Score is cosine mapped to [0, 1].
		const minScore = payload && Number.isFinite(payload.minScore) ? Number(payload.minScore) : 0.6;
		const questionHtml = payload && typeof payload.questionHtml === 'string' ? payload.questionHtml : '';
		const explanationHtml = payload && typeof payload.explanationHtml === 'string' ? payload.explanationHtml : '';
		const optionsHtml = payload && Array.isArray(payload.optionsHtml) ? payload.optionsHtml.map(String) : [];
		const matchingHeadingHtml = payload && typeof payload.matchingHeadingHtml === 'string' ? payload.matchingHeadingHtml : '';
		const matchingLeftHtml = payload && Array.isArray(payload.matchingLeftHtml) ? payload.matchingLeftHtml.map(String) : [];
		const matchingRightHtml = payload && Array.isArray(payload.matchingRightHtml) ? payload.matchingRightHtml.map(String) : [];

		const segments = [];
		const stem = extractPlainText(questionHtml);
		if (stem) segments.push({ kind: 'stem', text: stem });
		const expl = extractPlainText(explanationHtml);
		if (expl) segments.push({ kind: 'explanation', text: expl });
		for (let i = 0; i < optionsHtml.length; i++) {
			const opt = extractPlainText(optionsHtml[i]);
			if (opt) segments.push({ kind: 'option', text: opt });
		}
		const mh = extractPlainText(matchingHeadingHtml);
		if (mh) segments.push({ kind: 'matching_heading', text: mh });
		for (const l of matchingLeftHtml) {
			const x = extractPlainText(l);
			if (x) segments.push({ kind: 'matching_left', text: x });
		}
		for (const r of matchingRightHtml) {
			const x = extractPlainText(r);
			if (x) segments.push({ kind: 'matching_right', text: x });
		}

		const combined = segments.map((s) => s.text).join('\n\n').trim();

		if (!combined) {
			appendLogLine({ event: 'suggest_empty_input' });
			return { ready: true, suggestions: [], reason: 'Empty input.' };
		}

		const idx = loadTagIndex();
		if (!idx) {
			appendLogLine({ event: 'suggest_missing_cache', cacheDir });
			return {
				ready: false,
				suggestions: [],
				reason: 'Tag embedding cache missing. Run one-time preparation.',
			};
		}

		let queryVec;
		try {
			const modelId = idx && idx.meta && typeof idx.meta.modelId === 'string' ? idx.meta.modelId : EMBED_MODEL_PREFERRED;
			queryVec = await embedTextLocalOnly(combined, modelId, modelCacheDir);
		} catch (e) {
			appendLogLine({ event: 'suggest_embed_failed', error: String(e && e.message ? e.message : e) });
			const msg = String(e && e.message ? e.message : e);
			return {
				ready: false,
				suggestions: [],
				reason: msg && msg.toLowerCase().includes('missing @huggingface/transformers')
					? 'Embedding engine missing dependency. Reinstall app dependencies.'
					: `Embedding model not ready. Run one-time preparation. Details: ${msg}`,
			};
		}

		// Embed per segment to capture topic/subtopic evidence.
		const segmentVecs = [];
		try {
			const modelId = idx && idx.meta && typeof idx.meta.modelId === 'string' ? idx.meta.modelId : EMBED_MODEL_PREFERRED;
			for (const s of segments) {
				if (!s.text) continue;
				const v = await embedTextLocalOnly(s.text, modelId, modelCacheDir);
				segmentVecs.push({ kind: s.kind, vec: v });
			}
		} catch {
			// If segment embeddings fail for any reason, fall back to combined query vector only.
			segmentVecs.length = 0;
		}

		const { meta, dims, floats } = idx;
		const tags = meta.tags.map(String);
		const allowed = new Set(availableTags.map((t) => String(t)));
		const scored = [];
		for (let i = 0; i < tags.length; i++) {
			const name = tags[i];
			if (allowed.size && !allowed.has(name)) continue;
			const off = i * dims;
			const tv = floats.subarray(off, off + dims);
			let best = -1;
			let bestKind = 'combined';
			if (segmentVecs.length) {
				for (const s of segmentVecs) {
					const cos = Number(cosineSimilarity(s.vec, tv));
					const score01 = Math.max(0, Math.min(1, (cos + 1) / 2));
					if (score01 > best) {
						best = score01;
						bestKind = s.kind;
					}
				}
			} else {
				const cos = Number(cosineSimilarity(queryVec, tv));
				best = Math.max(0, Math.min(1, (cos + 1) / 2));
			}
			if (best < minScore) continue;
			scored.push({ tagName: name, score: Number(best), evidence: bestKind });
		}
		scored.sort((a, b) => b.score - a.score);
		const suggestions = scored.slice(0, topK);
		return { ready: true, suggestions, modelId: meta.modelId, dims };
	});

	ipcMain.handle('embed:recordFeedback', async (_event, payload) => {
		const { cacheDir, feedbackPath } = getEmbedPaths();
		ensureDir(cacheDir);
		const record = {
			ts: typeof payload?.ts === 'number' ? payload.ts : Date.now(),
			action: String(payload?.action || ''),
			tagName: String(payload?.tagName || ''),
			score: typeof payload?.score === 'number' ? payload.score : undefined,
			questionId: payload?.questionId ? String(payload.questionId) : undefined,
			inputTextHash: payload?.inputTextHash ? String(payload.inputTextHash) : undefined,
		};
		fs.appendFileSync(feedbackPath, safeJsonLine(record) + '\n', { encoding: 'utf8', mode: 0o600 });
		appendLogLine({ event: 'feedback', action: record.action, tagName: record.tagName });
		return { ok: true };
	});

	ipcMain.handle('embed:diagnostics', async () => {
		const { cacheDir, modelCacheDir, tagIndexMetaPath, tagIndexBinPath, logPath } = getEmbedPaths();
		const hasModel = modelCacheDir && fs.existsSync(modelCacheDir);
		const hasCache = fs.existsSync(tagIndexMetaPath) && fs.existsSync(tagIndexBinPath);
		const statSafe = (p) => {
			try {
				return fs.existsSync(p) ? fs.statSync(p).size : 0;
			} catch {
				return 0;
			}
		};
		return {
			ready: !!(hasModel && hasCache),
			modelDir: hasModel ? modelCacheDir : undefined,
			cacheDir,
			modelBytes: hasModel ? dirBytes(modelCacheDir) : 0,
			cacheBytes: statSafe(tagIndexMetaPath) + statSafe(tagIndexBinPath),
			logPath: fs.existsSync(logPath) ? logPath : undefined,
		};
	});

	// Long answer grading IPC.
	ipcMain.handle('longAnswer:modelStatus', async () => {
		const modelId = EMBED_MODEL_FALLBACK;
		const candidates = getLongAnswerModelDirCandidates();
		const modelCacheDir = pickLongAnswerModelDir(candidates, modelId);
		if (!modelCacheDir) {
			return {
				ready: false,
				reason: `Long answer embedding model directory not found for ${modelId}. Run npm install without SKIP_MODEL_DOWNLOAD or bundle models. Tried: ${candidates.join(' | ')}`,
			};
		}
		try {
			// Long answers intentionally use the fallback model only to avoid
			// local-only failures when the larger preferred model isn't present.
			await chooseAndLoadModel({ candidates: [modelId], modelCacheDir, allowDownload: false });
			return { ready: true };
		} catch (e) {
			const msg = String(e && e.message ? e.message : e);
			return { ready: false, reason: msg };
		}
	});

	ipcMain.handle('longAnswer:embedText', async (_event, payload) => {
		const text = payload && typeof payload.text === 'string' ? payload.text : '';
		if (!text.trim()) return { ok: false, reason: 'Empty text' };
		const modelId = payload && typeof payload.modelId === 'string' && payload.modelId.trim()
			? payload.modelId.trim()
			: EMBED_MODEL_FALLBACK;
		const candidates = getLongAnswerModelDirCandidates();
		const modelCacheDir = pickLongAnswerModelDir(candidates, modelId);
		if (!modelCacheDir) return { ok: false, reason: `Model directory not found for ${modelId}. Tried: ${candidates.join(' | ')}` };
		try {
			const vec = await embedTextLocalOnly(text, modelId, modelCacheDir);
			return { ok: true, vector: vec, dims: vec.length, modelId };
		} catch (e) {
			return { ok: false, reason: String(e && e.message ? e.message : e) };
		}
	});

	ipcMain.handle('longAnswer:computeScoreAndMetadata', async (_event, payload) => {
		const adminAnswerText = payload && typeof payload.adminAnswerText === 'string' ? payload.adminAnswerText : '';
		const studentAnswerText = payload && typeof payload.studentAnswerText === 'string' ? payload.studentAnswerText : '';
		const adminEmbedding = payload && Array.isArray(payload.adminEmbedding) ? payload.adminEmbedding : null;
		const keywords = payload && Array.isArray(payload.keywords) ? payload.keywords : [];
		const scoreMapping = payload && typeof payload.scoreMapping === 'object' ? payload.scoreMapping : undefined;
		if (!adminAnswerText.trim()) return { ok: false, reason: 'Missing adminAnswerText' };
		if (!studentAnswerText.trim()) return { ok: false, reason: 'Missing studentAnswerText' };

		const modelId = payload && typeof payload.modelId === 'string' && payload.modelId.trim()
			? payload.modelId.trim()
			: EMBED_MODEL_FALLBACK;
		const modelCacheDir = pickFirstExistingDir(getLongAnswerModelDirCandidates());
		if (!modelCacheDir) return { ok: false, reason: 'Model directory not found' };

		let adminVec = adminEmbedding;
		try {
			if (!adminVec) {
				adminVec = await embedTextLocalOnly(adminAnswerText, modelId, modelCacheDir);
			}
			const studentVec = await embedTextLocalOnly(studentAnswerText, modelId, modelCacheDir);
			const cos = Number(cosineSimilarity(adminVec, studentVec));
			const similarity01 = clamp01((cos + 1) / 2);
			const numericScore10 = mapSimilarityToScore10(similarity01, scoreMapping);

			const kw = keywordMatchStats(adminAnswerText, studentAnswerText, keywords);
			const keywordScore01 = typeof kw.keywordScore01 === 'number' ? kw.keywordScore01 : undefined;
			const finalScore01 = clamp01(similarity01 * 0.85 + (keywordScore01 ?? 0) * 0.15);
			return {
				ok: true,
				similarity01,
				numericScore10,
				finalScore01,
				keywordScore01,
				keywordMatches: kw.keywordMatches,
			};
		} catch (e) {
			return { ok: false, reason: String(e && e.message ? e.message : e) };
		}
	});

	ipcMain.handle('longAnswer:generateFeedbackParagraph', async (_event, payload) => {
		const adminAnswerText = payload && typeof payload.adminAnswerText === 'string' ? payload.adminAnswerText : '';
		const studentAnswerText = payload && typeof payload.studentAnswerText === 'string' ? payload.studentAnswerText : '';
		const similarity01 = payload && Number.isFinite(payload.similarity01) ? Number(payload.similarity01) : 0;
		const keywordMatches = payload && Array.isArray(payload.keywordMatches) ? payload.keywordMatches : [];
		const numericScore10 = payload && Number.isFinite(payload.numericScore10)
			? Number(payload.numericScore10)
			: mapSimilarityToScore10(similarity01, undefined);
		if (!adminAnswerText.trim() || !studentAnswerText.trim()) {
			return { ok: false, reason: 'Missing answers' };
		}
		const feedback = deterministicFeedbackFromMetadata({ similarity01, numericScore10, keywordMatches });
		return { ok: true, feedback, usedModel: false };
	});

	ipcMain.handle('songs:saveAudioFile', async (_event, payload) => {
		const fileName = payload && typeof payload.fileName === 'string' ? payload.fileName : '';
		const dataBase64 = payload && typeof payload.dataBase64 === 'string' ? payload.dataBase64 : '';
		if (!fileName || !dataBase64) {
			throw new Error('Missing fileName or dataBase64');
		}

		const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
		const songsDir = path.join(app.getPath('userData'), 'songs');
		fs.mkdirSync(songsDir, { recursive: true });
		const outPath = path.join(songsDir, `${Date.now()}-${safeName}`);

		const buffer = Buffer.from(dataBase64, 'base64');
		fs.writeFileSync(outPath, buffer);
		return {
			filePath: outPath,
			fileUrl: pathToFileURL(outPath).href,
		};
	});

	ipcMain.handle('songs:readAudioFile', async (_event, payload) => {
		const filePath = payload && typeof payload.filePath === 'string' ? payload.filePath : '';
		if (!filePath) {
			throw new Error('Missing filePath');
		}
		const songsDir = path.join(app.getPath('userData'), 'songs');
		const resolved = path.resolve(filePath);
		const resolvedSongsDir = path.resolve(songsDir);
		if (!resolved.startsWith(resolvedSongsDir + path.sep) && resolved !== resolvedSongsDir) {
			throw new Error('Refusing to read file outside songs directory');
		}
		if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
			throw new Error('File not found');
		}
		const buffer = fs.readFileSync(resolved);
		return { dataBase64: buffer.toString('base64') };
	});

	ipcMain.handle('songs:deleteAudioFile', async (_event, payload) => {
		const filePath = payload && typeof payload.filePath === 'string' ? payload.filePath : '';
		if (!filePath) {
			throw new Error('Missing filePath');
		}
		const songsDir = path.join(app.getPath('userData'), 'songs');
		const resolved = path.resolve(filePath);
		const resolvedSongsDir = path.resolve(songsDir);
		if (!resolved.startsWith(resolvedSongsDir + path.sep) && resolved !== resolvedSongsDir) {
			throw new Error('Refusing to delete file outside songs directory');
		}
		if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
			fs.unlinkSync(resolved);
		}
		return { ok: true };
	});

	ipcMain.handle('data:exportJsonToFile', async (_event, payload) => {
		if (!mainWindow || mainWindow.isDestroyed()) {
			throw new Error('Main window is not available');
		}
		const defaultFileName = payload && typeof payload.defaultFileName === 'string' ? payload.defaultFileName : 'MathInk-backup.json';
		const dataText = payload && typeof payload.dataText === 'string' ? payload.dataText : '';
		if (!dataText) throw new Error('Missing dataText');
		const pick = await dialog.showSaveDialog(mainWindow, {
			title: 'Export data',
			defaultPath: defaultFileName,
			filters: [{ name: 'JSON', extensions: ['json'] }],
		});
		if (pick.canceled || !pick.filePath) {
			return { canceled: true };
		}
		fs.writeFileSync(pick.filePath, dataText, 'utf8');
		return { canceled: false, filePath: pick.filePath };
	});

  ipcMain.handle('exam:captureAppScreenshot', async (_event, payload) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      throw new Error('Main window is not available');
    }

    const attemptId = payload && typeof payload.attemptId === 'string' ? payload.attemptId : 'unknown';
    const questionId = payload && typeof payload.questionId === 'string' ? payload.questionId : undefined;
    const rect = payload && payload.rect && typeof payload.rect === 'object' ? payload.rect : undefined;
    const ts = Date.now();

    const baseDir = path.join(app.getPath('userData'), 'proctoring', attemptId);
    fs.mkdirSync(baseDir, { recursive: true });

    const fileName = questionId ? `${ts}-${questionId}.png` : `${ts}.png`;
    const filePath = path.join(baseDir, fileName);

    const captureRect =
      rect &&
      Number.isFinite(rect.x) &&
      Number.isFinite(rect.y) &&
      Number.isFinite(rect.width) &&
      Number.isFinite(rect.height) &&
      rect.width > 0 &&
      rect.height > 0
        ? { x: Math.max(0, Math.floor(rect.x)), y: Math.max(0, Math.floor(rect.y)), width: Math.floor(rect.width), height: Math.floor(rect.height) }
        : undefined;

    const image = await mainWindow.webContents.capturePage(captureRect);
    const pngBuffer = image.toPNG();
    fs.writeFileSync(filePath, pngBuffer);

    return { filePath, ts, attemptId, questionId };
	});

	ipcMain.handle('exam:captureViewportScreenshot', async () => {
		if (!mainWindow || mainWindow.isDestroyed()) {
			throw new Error('Main window is not available');
		}
		const image = await mainWindow.webContents.capturePage();
		const pngBuffer = image.toPNG();
		return { dataUrl: `data:image/png;base64,${pngBuffer.toString('base64')}` };
	});

	ipcMain.handle('exam:captureFullPageScreenshot', async () => {
		// Best-effort: capture the current window surface.
		// (Scroll-stitching is handled in the renderer for the quiz runner.)
		if (!mainWindow || mainWindow.isDestroyed()) {
			throw new Error('Main window is not available');
		}
		const image = await mainWindow.webContents.capturePage();
		const pngBuffer = image.toPNG();
		return { dataUrl: `data:image/png;base64,${pngBuffer.toString('base64')}` };
	});

});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
