'use strict';

const { app, BrowserWindow, Menu, ipcMain, dialog, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');

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

function resolveBundledFile(...segments) {
  const candidates = [];
  const appPath = app.getAppPath();
  candidates.push(path.join(appPath, ...segments));
  candidates.push(path.join(__dirname, '..', ...segments));
  if (app.isPackaged) {
    // When packaged, files under asarUnpack live at:
    // <resources>/app.asar.unpacked/<path>
    // while app.getAppPath() points at <resources>/app.asar
    candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', ...segments));
  }
  const hit = candidates.find((p) => fs.existsSync(p));
  return hit || null;
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

	ipcMain.handle('exam:captureFullPageScreenshot', async () => {
		if (!mainWindow || mainWindow.isDestroyed()) {
			throw new Error('Main window is not available');
		}
		const wc = mainWindow.webContents;
		const dbg = wc.debugger;
		let attachedHere = false;
		try {
			if (!dbg.isAttached()) {
				dbg.attach('1.3');
				attachedHere = true;
			}
			await dbg.sendCommand('Page.enable');
			await dbg.sendCommand('Emulation.clearDeviceMetricsOverride');
			const metrics = await dbg.sendCommand('Page.getLayoutMetrics');
			const contentSize = metrics && metrics.contentSize ? metrics.contentSize : null;
			if (!contentSize || !contentSize.width || !contentSize.height) {
				throw new Error('Unable to determine content size for screenshot');
			}

			const width = Math.max(1, Math.ceil(contentSize.width));
			const height = Math.max(1, Math.ceil(contentSize.height));

			await dbg.sendCommand('Emulation.setDeviceMetricsOverride', {
				mobile: false,
				width,
				height,
				deviceScaleFactor: 1,
				screenWidth: width,
				screenHeight: height,
				positionX: 0,
				positionY: 0,
				scale: 1,
			});

			// Give Chromium time to relayout/repaint at the new virtual viewport.
			try {
				await dbg.sendCommand('Runtime.evaluate', {
					expression: 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))',
					awaitPromise: true,
				});
			} catch {
				// ignore
			}
			await new Promise((r) => setTimeout(r, 80));

			const result = await dbg.sendCommand('Page.captureScreenshot', {
				format: 'png',
				fromSurface: true,
				clip: {
					x: 0,
					y: 0,
					width,
					height,
					scale: 1,
				},
			});
			await dbg.sendCommand('Emulation.clearDeviceMetricsOverride');
			const data = result && result.data ? String(result.data) : '';
			if (!data) {
				throw new Error('Empty screenshot result');
			}
			return { dataUrl: `data:image/png;base64,${data}` };
		} finally {
			try {
				try {
					await dbg.sendCommand('Emulation.clearDeviceMetricsOverride');
				} catch {
					// ignore
				}
				if (attachedHere && dbg.isAttached()) {
					dbg.detach();
				}
			} catch {
				// ignore
			}
		}
	});

	ipcMain.handle('exam:captureViewportScreenshot', async () => {
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
