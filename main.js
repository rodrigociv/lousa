const { app, BrowserWindow, dialog, ipcMain, net, shell } = require('electron');
const fs = require('fs');
const path = require('path');

/* Os textos ficam em Documentos/Lousa, fora do programa: atualizar o app não mexe neles. */
const dataDir = () => path.join(app.getPath('documents'), 'Lousa');
const dataFile = () => path.join(dataDir(), 'lousa.json');

function readData() {
  for (const file of [dataFile(), dataFile() + '.bak']) {
    try {
      const text = fs.readFileSync(file, 'utf8');
      JSON.parse(text);
      return text;
    } catch {}
  }
  return null;
}

function writeData(text) {
  fs.mkdirSync(dataDir(), { recursive: true });
  const file = dataFile(), tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
  fs.renameSync(tmp, file);
}

ipcMain.on('lousa:load', e => { e.returnValue = readData(); });
ipcMain.on('lousa:save', (e, text) => {
  try { writeData(text); e.returnValue = true; }
  catch { e.returnValue = false; }
});
ipcMain.handle('lousa:pdf', async (e, name) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('documents'), name + '.pdf'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (canceled || !filePath) return null;
  const pdf = await e.sender.printToPDF({ pageSize: 'A4', preferCSSPageSize: true });
  fs.writeFileSync(filePath, pdf);
  return filePath;
});

/* Aviso de versão nova: pergunta ao GitHub e só avisa; quem decide baixar é você. */
const REPO = require('./package.json').lousa?.repo;
const RELEASES = /^https:\/\/github\.com\//;

function isNewer(latest, current) {
  const a = latest.split('.').map(Number), b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

async function checkUpdate(win) {
  if (!REPO || !app.isPackaged) return;
  try {
    const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Lousa' }
    });
    if (!res.ok) return;
    const { tag_name: tag, html_url: url } = await res.json();
    const version = String(tag).replace(/^v/, '');
    if (isNewer(version, app.getVersion()) && RELEASES.test(url) && !win.isDestroyed()) {
      win.webContents.send('lousa:update', { version, url });
    }
  } catch {} /* sem internet, o app segue normalmente */
}

ipcMain.on('lousa:open', (e, url) => { if (RELEASES.test(url)) shell.openExternal(url); });

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#452510',
    autoHideMenuBar: true,
    title: 'Lousa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.once('did-finish-load', () => setTimeout(() => checkUpdate(win), 3000));
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
