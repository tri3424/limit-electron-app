'use strict';

const { app, BrowserWindow, Menu, ipcMain, dialog, session, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

// Improve wheel/trackpad feel across the app (Chromium)
app.commandLine.appendSwitch('enable-smooth-scrolling');
app.commandLine.appendSwitch('smooth-scrolling');

// Single instance lock
if (!app.requestSingleInstanceLock()) {
  app.quit();
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

function getOcrBundleDirName() {
	const p = process.platform;
	const a = process.arch;
	if (p === 'win32') return a === 'x64' ? 'windows-x64' : `windows-${a}`;
	if (p === 'linux') return a === 'x64' ? 'linux-x64' : `linux-${a}`;
	if (p === 'darwin') return a === 'arm64' ? 'macos-arm64' : a === 'x64' ? 'macos-x64' : `macos-${a}`;
	return `${p}-${a}`;
}

function resolveBundledFile(...segments) {
  const candidates = [];
  const appPath = app.getAppPath();
  const isNativeAsset = segments && segments[0] === 'native';
  if (app.isPackaged && isNativeAsset) {
    // Prefer unpacked location for native assets/binaries.
    // Executables cannot be spawned from inside app.asar.
    candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', ...segments));
  }

  candidates.push(path.join(appPath, ...segments));
  candidates.push(path.join(__dirname, '..', ...segments));
  if (app.isPackaged) {
    // When packaged, files under asarUnpack live at:
    // <resources>/app.asar.unpacked/<path>
    // while app.getAppPath() points at <resources>/app.asar
    if (!isNativeAsset) {
      candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', ...segments));
    }
  }
  const hit = candidates.find((p) => fs.existsSync(p));
  return hit || null;
}

function sha1(input) {
	return crypto.createHash('sha1').update(String(input)).digest('hex');
}

function runBinaryOrThrow(exePath, args, opts) {
	const res = spawnSync(exePath, args, {
		encoding: 'utf8',
		maxBuffer: 1024 * 1024 * 200,
		...opts,
	});
	if (res.error) throw res.error;
	if (res.status !== 0) {
		const details = [
			`Command failed: ${path.basename(exePath)} ${args.join(' ')}`,
			`exitCode=${res.status}`, 
			res.stderr ? `\n--- stderr ---\n${res.stderr}` : '',
			!res.stderr && res.stdout ? `\n--- stdout ---\n${res.stdout}` : '',
			!res.stderr && !res.stdout ? '\n(no output)' : '',
		].filter(Boolean);
		throw new Error(details.join('\n'));
	}
	return res;
}

function parseTesseractTsv(tsvText) {
	const lines = String(tsvText || '').split(/\r?\n/).filter(Boolean);
	if (!lines.length) return [];
	const header = lines[0].split('\t');
	const idx = (name) => header.indexOf(name);
	const out = [];
	for (let i = 1; i < lines.length; i++) {
		const cols = lines[i].split('\t');
		const text = (cols[idx('text')] || '').trim();
		if (!text) continue;
		const conf = Number(cols[idx('conf')]);
		out.push({
			block: Number(cols[idx('block_num')]),
			par: Number(cols[idx('par_num')]),
			line: Number(cols[idx('line_num')]),
			left: Number(cols[idx('left')]),
			top: Number(cols[idx('top')]),
			width: Number(cols[idx('width')]),
			height: Number(cols[idx('height')]),
			conf: Number.isFinite(conf) ? conf : -1,
			text,
		});
	}
	return out;
}

function groupWordsToLines(words) {
	const byKey = new Map();
	for (const w of words) {
		const key = `${w.block}-${w.par}-${w.line}`;
		const arr = byKey.get(key) || [];
		arr.push(w);
		byKey.set(key, arr);
	}
	const lines = [];
	for (const arr of byKey.values()) {
		arr.sort((a, b) => a.left - b.left);
		lines.push({
			text: arr.map((w) => w.text).join(' '),
			top: Math.min(...arr.map((w) => w.top)),
			bottom: Math.max(...arr.map((w) => w.top + w.height)),
			left: Math.min(...arr.map((w) => w.left)),
			right: Math.max(...arr.map((w) => w.left + w.width)),
		});
	}
	lines.sort((a, b) => a.top - b.top || a.left - b.left);
	return lines;
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

function segmentPageToQuestions(lines) {
	const blocks = [];
	let current = null;
	for (const ln of lines) {
		if (isQuestionStartLine(ln.text)) {
			if (current) blocks.push(current);
			current = { lines: [ln] };
			continue;
		}
		if (!current) {
			current = { lines: [ln] };
		} else {
			current.lines.push(ln);
		}
	}
	if (current) blocks.push(current);
	return blocks;
}

function splitQuestionBlockToParts(blockLines) {
	const stem = [];
	const options = {};
	let curOpt = null;
	for (const ln of blockLines) {
		const label = normalizeOptionLabel(ln.text);
		if (label) {
			curOpt = label;
			if (!options[curOpt]) options[curOpt] = { lines: [] };
			options[curOpt].lines.push(ln);
			continue;
		}
		if (curOpt) {
			options[curOpt].lines.push(ln);
		} else {
			stem.push(ln);
		}
	}
	return { stem, options };
}

function detectGapFiguresForLines(lines, pageW, pageH, minGapPx) {
	if (!Array.isArray(lines) || lines.length < 2) return [];
	const out = [];
	for (let i = 0; i < lines.length - 1; i++) {
		const a = lines[i];
		const b = lines[i + 1];
		const gap = b.top - a.bottom;
		if (gap >= minGapPx) {
			out.push({ x: 0, y: a.bottom + 2, width: pageW, height: gap - 4 });
		}
	}
	return out
		.map((r) => clampRect(r, pageW, pageH))
		.filter((r) => r.width >= 10 && r.height >= 10);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Limit',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
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
      mainWindow.loadURL('data:text/plain;charset=utf-8,' + encodeURIComponent('Limit failed to start: missing app-dist/index.html'));
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
		const defaultFileName = payload && typeof payload.defaultFileName === 'string' ? payload.defaultFileName : 'Limit-backup.json';
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

	ipcMain.handle('ocr:pickPdf', async () => {
		if (!mainWindow || mainWindow.isDestroyed()) {
			throw new Error('Main window is not available');
		}
		const pick = await dialog.showOpenDialog(mainWindow, {
			title: 'Select exam PDF',
			properties: ['openFile'],
			filters: [{ name: 'PDF', extensions: ['pdf'] }],
		});
		if (pick.canceled || !pick.filePaths || !pick.filePaths[0]) {
			return { canceled: true, pdfFilePath: '' };
		}
		return { canceled: false, pdfFilePath: pick.filePaths[0] };
	});

	ipcMain.handle('ocr:importExamPdf', async (_event, payload) => {
		if (!mainWindow || mainWindow.isDestroyed()) {
			throw new Error('Main window is not available');
		}

		const dpi = payload && Number.isFinite(payload.dpi) ? Math.max(150, Math.min(600, Math.floor(payload.dpi))) : 300;
		const pageStartRaw = payload && Number.isFinite(payload.pageStart) ? Math.floor(payload.pageStart) : null;
		const pageEndRaw = payload && Number.isFinite(payload.pageEnd) ? Math.floor(payload.pageEnd) : null;
		const pageStart = pageStartRaw && pageStartRaw > 0 ? pageStartRaw : null;
		const pageEnd = pageEndRaw && pageEndRaw > 0 ? pageEndRaw : null;

		let pdfFilePath = payload && typeof payload.pdfFilePath === 'string' ? payload.pdfFilePath : '';
		if (!pdfFilePath) {
			const pick = await dialog.showOpenDialog(mainWindow, {
				title: 'Select exam PDF',
				properties: ['openFile'],
				filters: [{ name: 'PDF', extensions: ['pdf'] }],
			});
			if (pick.canceled || !pick.filePaths || !pick.filePaths[0]) {
				return { documentId: '', pdfFilePath: '', pages: [] };
			}
			pdfFilePath = pick.filePaths[0];
		}

		const pdftoppmName = process.platform === 'win32' ? 'pdftoppm.exe' : 'pdftoppm';
		const tesseractName = process.platform === 'win32' ? 'tesseract.exe' : 'tesseract';
		const ocrDirName = getOcrBundleDirName();
		const pdftoppm = resolveBundledFile('native', 'offline-ai', ocrDirName, pdftoppmName);
		const tesseract = resolveBundledFile('native', 'offline-ai', ocrDirName, tesseractName);
		const tessdataEng = resolveBundledFile('native', 'offline-ai', ocrDirName, 'tessdata', 'eng.traineddata');
		const tessdataDir = resolveBundledFile('native', 'offline-ai', ocrDirName, 'tessdata');
		if (!pdftoppm || !tesseract || !tessdataEng || !tessdataDir) {
			throw new Error(
				`Missing bundled OCR files.\n\nExpected these files to exist locally (offline-first) under:\n- native/offline-ai/${ocrDirName}/\n\nRequired:\n- ${pdftoppmName}\n- ${tesseractName}\n- tessdata/eng.traineddata\n\nFix: place the OCR binaries + tessdata into native/offline-ai/${ocrDirName}/ and rebuild the installer.\nNote: electron-builder is configured to include native/** and unpack it via asarUnpack, but the files must exist at build time.`
			);
		}
		const stat = fs.statSync(pdfFilePath);
		const docId = sha1(`${pdfFilePath}::${stat.size}::${stat.mtimeMs}`);
		const baseDir = path.join(app.getPath('userData'), 'ocr-import', docId);
		fs.mkdirSync(baseDir, { recursive: true });

		const rasterPrefix = path.join(baseDir, 'page');
		const pdftoppmArgs = ['-r', String(dpi)];
		if (pageStart) pdftoppmArgs.push('-f', String(pageStart));
		if (pageEnd) pdftoppmArgs.push('-l', String(pageEnd));
		pdftoppmArgs.push('-png', pdfFilePath, rasterPrefix);
		runBinaryOrThrow(pdftoppm, pdftoppmArgs, { cwd: baseDir });

		const pagePngs = fs
			.readdirSync(baseDir)
			.filter((n) => /^page-\d+\.png$/i.test(n))
			.sort((a, b) => {
				const ai = Number(a.match(/page-(\d+)\.png/i)?.[1] || 0);
				const bi = Number(b.match(/page-(\d+)\.png/i)?.[1] || 0);
				return ai - bi;
			});

		const pages = [];
		const indexBase = pageStart ? pageStart - 1 : 0;
		for (let i = 0; i < pagePngs.length; i++) {
			const pngPath = path.join(baseDir, pagePngs[i]);
			const outBase = path.join(baseDir, `page-${i + 1}`);
			runBinaryOrThrow(tesseract, [pngPath, outBase, '--dpi', String(dpi), 'tsv'], {
				cwd: baseDir,
				env: { ...process.env, TESSDATA_PREFIX: tessdataDir },
			});
			const tsvPath = `${outBase}.tsv`;
			const tsvText = fs.existsSync(tsvPath) ? fs.readFileSync(tsvPath, 'utf8') : '';
			const words = parseTesseractTsv(tsvText);
			const lines = groupWordsToLines(words);
			const pageImg = nativeImage.createFromPath(pngPath);
			const size = pageImg.getSize();
			const pageW = size.width || 1;
			const pageH = size.height || 1;

			const qBlocks = segmentPageToQuestions(lines);
			const questions = [];
			const figuresDir = path.join(baseDir, 'figures');
			fs.mkdirSync(figuresDir, { recursive: true });

			for (let qi = 0; qi < qBlocks.length; qi++) {
				const qLines = qBlocks[qi].lines;
				const parts = splitQuestionBlockToParts(qLines);
				const stemText = parts.stem.map((l) => l.text).join('\n').trim();
				const allHeights = qLines.map((l) => Math.max(1, l.bottom - l.top));
				const medianH = allHeights.length ? allHeights.sort((a, b) => a - b)[Math.floor(allHeights.length / 2)] : 16;
				const minGapPx = Math.max(32, Math.floor(medianH * 1.8));

				const stemFigures = detectGapFiguresForLines(parts.stem, pageW, pageH, minGapPx);
				const questionImages = [];
				for (let fi = 0; fi < stemFigures.length; fi++) {
					const rect = stemFigures[fi];
					const cropped = pageImg.crop(rect);
					const filePath = path.join(figuresDir, `p${indexBase + i + 1}_q${qi + 1}_stem_${fi + 1}.png`);
					fs.writeFileSync(filePath, cropped.toPNG());
					questionImages.push(pathToFileURL(filePath).href);
				}

				const optionsOut = {};
				for (const key of Object.keys(parts.options)) {
					const optLines = parts.options[key].lines;
					const text = optLines.map((l) => l.text).join('\n').trim();
					const optFigures = detectGapFiguresForLines(optLines, pageW, pageH, minGapPx);
					const images = [];
					for (let fi = 0; fi < optFigures.length; fi++) {
						const rect = optFigures[fi];
						const cropped = pageImg.crop(rect);
						const filePath = path.join(figuresDir, `p${indexBase + i + 1}_q${qi + 1}_opt${key}_${fi + 1}.png`);
						fs.writeFileSync(filePath, cropped.toPNG());
						images.push(pathToFileURL(filePath).href);
					}
					optionsOut[key] = { text, images };
				}

				questions.push({
					number: undefined,
					text: stemText || qLines.map((l) => l.text).join('\n').trim(),
					questionImages,
					options: optionsOut,
				});
			}

			pages.push({
				pageIndex: indexBase + i,
				questions,
			});
		}

		return {
			documentId: docId,
			pdfFilePath,
			pages,
		};
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
