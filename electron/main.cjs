'use strict';

const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Improve wheel/trackpad feel across the app (Chromium)
app.commandLine.appendSwitch('enable-smooth-scrolling');
app.commandLine.appendSwitch('smooth-scrolling');

// Single instance lock
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow;
const isDev = !app.isPackaged;

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
