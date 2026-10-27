const { app, BrowserWindow, protocol, net, session, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');

const APP_ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
]);

// Bitta nusxa ishlashi uchun
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function serveAppFile(request) {
  const { pathname } = new URL(request.url);
  const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const file = path.normalize(path.join(APP_ROOT, rel));
  if (!file.startsWith(APP_ROOT + path.sep)) {
    return new Response('Forbidden', { status: 403 });
  }
  return net.fetch(pathToFileURL(file).toString()).then(
    (res) =>
      new Response(res.body, {
        status: res.status,
        headers: {
          'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          // SharedArrayBuffer (ko'p oqimli hisoblash) uchun kerak
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Resource-Policy': 'same-origin'
        }
      }),
    () => new Response('Not found', { status: 404 })
  );
}

// Maxfiylik: dastur hech qanday tashqi tarmoq so'rovini yubormaydi
function lockDownNetwork(ses) {
  ses.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*'] },
    (_details, callback) => callback({ cancel: true })
  );
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#0f172a',
    title: '3x4 Foto Studio',
    icon: path.join(APP_ROOT, 'icon.png'),
    webPreferences: {
      preload: path.join(APP_ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) e.preventDefault();
  });
  win.loadURL('app://bundle/index.html');
  return win;
}

ipcMain.handle('save-file', async (event, { data, defaultName, filters }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Saqlash',
    defaultPath: path.join(app.getPath('pictures'), defaultName),
    filters
  });
  if (canceled || !filePath) return { ok: false };
  await fs.writeFile(filePath, Buffer.from(data));
  return { ok: true, filePath };
});

ipcMain.handle('show-in-folder', (_e, filePath) => {
  if (typeof filePath === 'string') shell.showItemInFolder(filePath);
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  lockDownNetwork(session.defaultSession);
  protocol.handle('app', serveAppFile);
  const win = createWindow();
  app.on('second-instance', () => {
    if (win.isMinimized()) win.restore();
    win.focus();
  });
});

app.on('window-all-closed', () => app.quit());
