'use strict';

const { app, BrowserWindow, Menu, ipcMain, dialog, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

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
