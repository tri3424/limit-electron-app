'use strict';

const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Improve wheel/trackpad feel across the app (Chromium)
app.commandLine.appendSwitch('enable-smooth-scrolling');
app.commandLine.appendSwitch('smooth-scrolling');

// Single instance lock
if (!app.requestSingleInstanceLock()) {
  app.quit();
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

function runOfflineAiEmbedding(payload) {
  const text = payload && typeof payload.text === 'string' ? payload.text : '';
  const modelId = payload && typeof payload.modelId === 'string' ? payload.modelId : 'local-embed-v1';
  const seed = payload && Number.isFinite(payload.seed) ? String(payload.seed) : '0';
  const threads = payload && Number.isFinite(payload.threads) ? String(payload.threads) : '1';
  if (!text.trim()) {
    return Promise.resolve({ modelId, dims: 0, vector: [] });
  }

  const exePath = resolveBundledFile('native', 'offline-ai', 'offline_ai_embed.exe');
  const modelPath = resolveBundledFile('native', 'offline-ai', 'models', 'embedding.gguf');
  if (!exePath || !modelPath) {
    throw new Error('Offline AI runtime is missing. Ensure native/offline-ai is bundled in the installer.');
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      exePath,
      [
        '--model',
        modelPath,
        '--model-id',
        modelId,
        '--seed',
        seed,
        '--threads',
        threads,
        '--format',
        'json',
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += String(d);
    });
    child.stderr.on('data', (d) => {
      stderr += String(d);
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Offline AI process failed (code ${code}). ${stderr || ''}`.trim()));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        const dims = Number(parsed.dims) || 0;
        const vector = Array.isArray(parsed.vector) ? parsed.vector.map((x) => Number(x)) : [];
        resolve({ modelId: parsed.modelId || modelId, dims, vector });
      } catch (e) {
        reject(new Error(`Offline AI returned invalid JSON. ${String(e)}`));
      }
    });

    child.stdin.write(text);
    child.stdin.end();
  });
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

  ipcMain.handle('offlineAi:embed', async (_event, payload) => {
    return runOfflineAiEmbedding(payload);
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
