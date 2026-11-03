// Windows/macOS/Linux desktop app: runs the server inside the app and shows
// the share page in a window with its own screen/window picker.

const fs = require('fs');
const path = require('path');
const {
  app, BrowserWindow, desktopCapturer, ipcMain, session, shell, Menu, screen, globalShortcut,
  clipboard, Notification, Tray,
} = require('electron');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { start } = require('../server');
const input = require('./input');
const { Tunnel } = require('./tunnel');
const { Cloud } = require('./cloud');
const { Turn } = require('./turn');
const { Adb } = require('./adb');
const { Receiver } = require('./files');
const { Updater } = require('./updater');

const FIRST_PORT = Number(process.env.PORT) || 3000;
const LAST_PORT = 3010;
// Emergency switch: turns remote control off from the keyboard, even while
// someone else is moving the mouse.
const CONTROL_OFF_SHORTCUT = 'CommandOrControl+Alt+K';
const PRIVACY_OFF_SHORTCUT = 'CommandOrControl+Alt+P';

let win = null;
let server = null;
let selected = { sourceId: null, audio: true, displayId: null };
let screenDisplayIds = {}; // source id -> display id, for screen sources

// ---- Remote control ----
// The share page receives control messages from viewers over WebRTC and
// passes them here; they only take effect while control is switched on.

let controlEnabled = false;
const pressedKeys = new Set();
const pressedButtons = new Set();

function releaseAll() {
  for (const code of pressedKeys) input.key(code, false);
  for (const b of pressedButtons) input.button(b, false);
  pressedKeys.clear();
  pressedButtons.clear();
}

function setControl(on) {
  controlEnabled = !!on && input.supported;
  if (!controlEnabled) releaseAll();
  if (controlEnabled) input.init();
}

// Physical-pixel rectangle of the shared screen, or null when a window is shared.
function sharedScreenRect() {
  if (!selected.displayId) return null;
  const display = screen.getAllDisplays().find((d) => String(d.id) === selected.displayId);
  if (!display) return null;
  return process.platform === 'win32' ? screen.dipToScreenRect(null, display.bounds) : display.bounds;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function handleControl(msg) {
  if (!controlEnabled || !msg || typeof msg !== 'object') return;
  switch (msg.t) {
    case 'move':
      input.moveBy(clamp(Number(msg.dx) || 0, -2000, 2000), clamp(Number(msg.dy) || 0, -2000, 2000));
      break;
    case 'abs': {
      const rect = sharedScreenRect();
      if (!rect) return;
      const x = clamp(Number(msg.x) || 0, 0, 1);
      const y = clamp(Number(msg.y) || 0, 0, 1);
      input.moveTo(rect.x + x * (rect.width - 1), rect.y + y * (rect.height - 1));
      break;
    }
    case 'button':
      if (!['left', 'right', 'middle'].includes(msg.b)) return;
      input.button(msg.b, !!msg.down);
      if (msg.down) pressedButtons.add(msg.b);
      else pressedButtons.delete(msg.b);
      break;
    case 'click':
      if (!['left', 'right', 'middle'].includes(msg.b)) return;
      input.button(msg.b, true);
      input.button(msg.b, false);
      break;
    case 'wheel':
      input.wheel(clamp(Number(msg.dx) || 0, -1200, 1200), clamp(Number(msg.dy) || 0, -1200, 1200));
      break;
    case 'key':
      if (!input.isKnownKey(msg.code)) return;
      if (msg.down === undefined) {
        input.key(msg.code, true);
        input.key(msg.code, false);
      } else {
        input.key(msg.code, !!msg.down);
        if (msg.down) pressedKeys.add(msg.code);
        else pressedKeys.delete(msg.code);
      }
      break;
    case 'text':
      if (typeof msg.s === 'string') input.text(msg.s.slice(0, 500));
      break;
    case 'release':
      releaseAll();
      break;
  }
}

function fromOurWindow(event) {
  return win && event.sender === win.webContents;
}

ipcMain.handle('control-supported', () => input.supported);

ipcMain.handle('set-control', (event, on) => {
  if (!fromOurWindow(event)) return false;
  setControl(on);
  return controlEnabled;
});

ipcMain.on('control-input', (event, msg) => {
  if (fromOurWindow(event)) handleControl(msg);
});

// ---- Files and clipboard from viewers ----
// Accepted only while remote control is on. Saved by desktop/files.js into
// Desktop\Ayva\<date and time>\, one folder per send.

let receiver = null; // created once the app is ready (needs the Desktop path)

function filesRoot() {
  if (!receiver) receiver = new Receiver(path.join(app.getPath('desktop'), 'Ayva'));
  return receiver;
}

ipcMain.on('file-begin', (event, id, name, size, batchKey) => {
  if (fromOurWindow(event) && controlEnabled) filesRoot().begin(id, name, size, batchKey);
});

ipcMain.on('file-chunk', (event, id, data) => {
  if (fromOurWindow(event)) filesRoot().chunk(id, data);
});

ipcMain.handle('file-end', (event, id) => (fromOurWindow(event) ? filesRoot().end(id) : null));

ipcMain.handle('batch-end', (event, batchKey) => (fromOurWindow(event) ? filesRoot().endBatch(batchKey) : null));

ipcMain.on('open-folder', (event, dir) => {
  // Only folders Ayva itself made under Desktop\Ayva.
  if (fromOurWindow(event) && filesRoot().owns(dir)) shell.openPath(path.resolve(String(dir)));
});

ipcMain.handle('set-clipboard', (event, text) => {
  if (!fromOurWindow(event) || !controlEnabled) return false;
  clipboard.writeText(String(text).slice(0, 100000));
  return true;
});

ipcMain.handle('get-clipboard', (event) => (fromOurWindow(event) ? clipboard.readText() : ''));

// Windows notification; clicking it brings the window back, or opens the
// folder / shows the file it is about.
ipcMain.on('notify', (event, title, body, filePath) => {
  if (!fromOurWindow(event) || !Notification.isSupported()) return;
  const n = new Notification({ title: String(title), body: String(body), icon: path.join(__dirname, 'icon.png') });
  n.on('click', () => {
    if (filePath && fs.existsSync(filePath)) {
      if (fs.statSync(filePath).isDirectory()) shell.openPath(filePath);
      else shell.showItemInFolder(filePath);
    } else {
      showWindow();
    }
  });
  n.show();
  if (win && !win.isFocused()) win.flashFrame(true);
});

// ---- Fixed address (Cloudflare Workers in the user's account) ----

let cloud = null;

ipcMain.handle('cloud-status', () => (cloud ? cloud.status() : { configured: false }));

ipcMain.handle('cloud-setup', async (event, apiToken, password) => {
  if (!fromOurWindow(event)) return { error: 'denied' };
  try {
    const status = await cloud.setup(apiToken, password, (step) => {
      if (win) win.webContents.send('cloud-progress', step);
    });
    return { status };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('cloud-remove', async (event) => {
  if (!fromOurWindow(event)) return false;
  await cloud.remove();
  return true;
});

// ---- Controlling a phone over ADB (see adb.js) ----

let adb = null;

ipcMain.handle('adb-status', () => (adb ? adb.status() : { installed: false }));

ipcMain.handle('adb-download', async (event) => {
  if (!fromOurWindow(event)) return { error: 'denied' };
  try {
    await adb.download((fraction) => { if (win) win.webContents.send('adb-progress', fraction); });
    return { ok: true };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('adb-pair', (event, host, port, code) => {
  if (!fromOurWindow(event)) return { ok: false, error: 'denied' };
  return adb.pair(String(host), String(port), String(code));
});

ipcMain.handle('adb-start', (event, serial, host) => {
  if (!fromOurWindow(event)) return { ok: false, error: 'denied' };
  return adb.startInput(String(serial), String(host || ''));
});

ipcMain.on('adb-input', (event, serial, line) => {
  if (fromOurWindow(event)) adb.input(String(serial), line);
});

ipcMain.on('adb-stop', (event, serial) => {
  if (fromOurWindow(event)) adb.stopInput(String(serial));
});

// ---- Backup route (Cloudflare TURN in the user's account, see turn.js) ----

let turn = null;

ipcMain.handle('turn-status', () => (turn ? turn.status() : { configured: false }));

ipcMain.handle('turn-setup', async (event, keyId, apiToken) => {
  if (!fromOurWindow(event)) return { error: 'denied' };
  try {
    return { status: await turn.setup(keyId, apiToken) };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('turn-remove', (event) => {
  if (!fromOurWindow(event)) return false;
  turn.remove();
  return true;
});

ipcMain.handle('turn-credentials', async (event, ttl) => {
  if (!fromOurWindow(event)) return null;
  try {
    return await turn.credentials(ttl);
  } catch (err) {
    return null;
  }
});

ipcMain.handle('turn-revoke', async (event, username) => {
  if (!fromOurWindow(event)) return false;
  try {
    await turn.revoke(username);
    return true;
  } catch (err) {
    return false;
  }
});

// ---- Internet access ----
// A Cloudflare quick tunnel makes the server reachable from anywhere. Viewers
// coming through it must present a fresh random access key (part of the link),
// which changes every time internet access is switched on.

let tunnel = null;
let accessKey = null;

function stopInternet() {
  accessKey = null;
  if (tunnel) tunnel.stop();
}

ipcMain.handle('internet-supported', () => process.platform === 'win32');

ipcMain.handle('internet-start', async (event) => {
  if (!fromOurWindow(event)) return { error: 'denied' };
  if (!tunnel) {
    tunnel = new Tunnel(app.getPath('userData'));
    tunnel.onExit = () => {
      accessKey = null;
      if (win) win.webContents.send('internet-stopped');
    };
  }
  try {
    await tunnel.ensureBinary((fraction) => {
      if (win) win.webContents.send('internet-progress', fraction);
    });
    const url = await tunnel.start(server.port);
    accessKey = crypto.randomBytes(18).toString('base64url');
    return { url, key: accessKey };
  } catch (err) {
    stopInternet();
    return { error: err.message };
  }
});

ipcMain.handle('internet-stop', (event) => {
  if (fromOurWindow(event)) stopInternet();
});

ipcMain.handle('make-qr', (_event, text) =>
  QRCode.toDataURL(String(text), { margin: 1, width: 360, errorCorrectionLevel: 'M' }));

// While sharing, leave this window out of screen captures (Windows 10 2004+
// excludes it entirely), so codes and links never reach the stream.
ipcMain.on('hide-from-capture', (event, on) => {
  if (fromOurWindow(event)) win.setContentProtection(!!on);
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// Notifications show this name; it must match the installer's shortcut (build.appId).
if (process.platform === 'win32') app.setAppUserModelId('io.github.ayva.desktop');

app.on('second-instance', () => showWindow());

async function startServer() {
  for (let port = FIRST_PORT; port <= LAST_PORT; port++) {
    try {
      return await start({ port, getAccessKey: () => accessKey });
    } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err;
    }
  }
  throw new Error('No free port between ' + FIRST_PORT + ' and ' + LAST_PORT);
}

ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: false,
  });
  screenDisplayIds = {};
  for (const s of sources) {
    if (s.id.startsWith('screen:') && s.display_id) screenDisplayIds[s.id] = String(s.display_id);
  }
  return sources
    .filter((s) => !s.thumbnail.isEmpty())
    .map((s) => ({
      id: s.id,
      name: s.name,
      isScreen: s.id.startsWith('screen:'),
      thumbnail: s.thumbnail.toDataURL(),
    }));
});

ipcMain.handle('select-source', (_event, choice) => {
  const sourceId = String(choice.sourceId);
  // Pointing at a spot on the picture ("absolute" mouse) needs to know which
  // screen the picture is; for a shared window only relative moves work.
  selected = { sourceId, audio: !!choice.audio, displayId: screenDisplayIds[sourceId] || null };
  return { absolute: !!selected.displayId, sourceId };
});

// The computer's screens, left to right, for a phone to choose from.
ipcMain.handle('list-screens', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
  const displays = screen.getAllDisplays();
  const primary = String(screen.getPrimaryDisplay().id);
  return sources
    .map((s) => {
      const d = displays.find((x) => String(x.id) === String(s.display_id));
      return {
        id: s.id,
        primary: String(s.display_id) === primary,
        x: d ? d.bounds.x : 0,
        size: d ? Math.round(d.size.width * d.scaleFactor) + '×' + Math.round(d.size.height * d.scaleFactor) : '',
      };
    })
    .sort((a, b) => a.x - b.x)
    .map(({ id, primary, size }) => ({ id, primary, size }));
});

// A remembered device asked to start sharing (the share page checks that the
// user allows this): share the main screen without the picker. Screen capture
// needs a user gesture, so the page's capture runs as if from a click.
// With sourceId (a phone picked another screen) it switches to that screen,
// keeping the sound setting.
ipcMain.handle('remote-start', async (event, audio, sourceId) => {
  if (!fromOurWindow(event)) return { error: 'denied' };
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
  const primary = String(screen.getPrimaryDisplay().id);
  const source = (sourceId && sources.find((s) => s.id === sourceId))
    || sources.find((s) => String(s.display_id) === primary) || sources[0];
  if (!source) return { error: 'no screen' };
  const withAudio = audio === undefined || audio === null ? selected.audio : !!audio;
  selected = { sourceId: source.id, audio: withAudio, displayId: source.display_id ? String(source.display_id) : null };
  const started = await win.webContents.executeJavaScript('remoteCapture(' + !!selected.displayId + ')', true);
  return started ? { ok: true, sourceId: source.id } : { error: 'capture failed' };
});

// ---- Privacy mode ----
// While a phone uses this computer, its screens can go dark here: a black
// window on every display, left out of screen capture (Windows 10 2004+), so
// the stream still shows the desktop. It ignores the mouse, so clicks from the
// phone reach the windows below. Ctrl+Alt+P turns it off at the computer.

let privacyWindows = [];

// WDA_EXCLUDEFROMCAPTURE needs Windows 10 2004 (build 19041); before that the
// black windows would cover the stream too.
const privacySupported = process.platform === 'win32'
  && Number(require('os').release().split('.')[2] || 0) >= 19041;

function privacyPage() {
  const text = TR()
    ? 'Bu bilgisayar şu anda Ayva ile uzaktan kullanılıyor.<br>Ekranı geri açmak için Ctrl+Alt+P\'ye bas.'
    : 'This computer is being used remotely with Ayva.<br>Press Ctrl+Alt+P to bring the screen back.';
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(
    '<!doctype html><html><body style="margin:0;height:100vh;background:#000;color:#777;'
    + 'font:16px system-ui,sans-serif;display:flex;align-items:flex-end;justify-content:center;'
    + 'cursor:none;user-select:none"><p style="margin:0 0 6vh;text-align:center;line-height:1.6">'
    + text + '</p></body></html>');
}

function setPrivacy(on) {
  privacyWindows.forEach((w) => { if (!w.isDestroyed()) w.destroy(); });
  privacyWindows = [];
  if (!on || !privacySupported) return false;
  for (const d of screen.getAllDisplays()) {
    const w = new BrowserWindow({
      x: d.bounds.x,
      y: d.bounds.y,
      width: d.bounds.width,
      height: d.bounds.height,
      frame: false,
      show: false,
      focusable: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      backgroundColor: '#000000',
      webPreferences: { javascript: false },
    });
    w.setContentProtection(true);
    w.setIgnoreMouseEvents(true);
    w.setAlwaysOnTop(true, 'screen-saver');
    w.setBounds(d.bounds);
    w.loadURL(privacyPage());
    w.showInactive();
    // Again once shown: the capture exclusion only sticks to a visible window.
    w.setContentProtection(true);
    privacyWindows.push(w);
  }
  return true;
}

ipcMain.handle('privacy-supported', () => privacySupported);

// A diagnostic recording (see share.js) goes to Desktop\Ayva, like received files.
ipcMain.handle('save-diagnostic', (event, name, data) => {
  if (!fromOurWindow(event) || !(data instanceof ArrayBuffer || ArrayBuffer.isView(data))) return null;
  const dir = path.join(app.getPath('desktop'), 'Ayva');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, path.basename(String(name)).replace(/[^\w.-]/g, '_'));
  fs.writeFileSync(file, Buffer.from(data instanceof ArrayBuffer ? data : data.buffer));
  return file;
});
ipcMain.handle('set-privacy', (event, on) => (fromOurWindow(event) ? setPrivacy(!!on) : privacyWindows.length > 0));

// A screen plugged in or out while dark: cover the new layout. (screen is
// only usable once the app is ready.)
function watchDisplays() {
  ['display-added', 'display-removed', 'display-metrics-changed'].forEach((name) => {
    screen.on(name, () => { if (privacyWindows.length) setPrivacy(true); });
  });
}

// ---- Running in the background ----
// Closing the window hides it to the tray icon; the server keeps running, so
// TVs and phones can still find this computer. "Quit" in the tray menu exits.

const TR = () => app.getLocale().toLowerCase().startsWith('tr'); // only valid once the app is ready
const STARTED_HIDDEN = process.argv.includes('--hidden'); // launched with Windows
let tray = null;
let quitting = false;
let toldAboutTray = false;
const updater = new Updater(TR, () => {
  updateTrayMenu();
  if (win) win.webContents.send('update-state', updater.status());
});

ipcMain.handle('update-status', () => updater.status());
ipcMain.on('update-check', (event) => { if (fromOurWindow(event)) updater.check(true); });
ipcMain.on('update-install', (event) => { if (fromOurWindow(event)) updater.install(); });

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function startsWithWindows() {
  return app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin;
}

function setStartWithWindows(on) {
  app.setLoginItemSettings({ openAtLogin: !!on, args: ['--hidden'] });
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  const updateItem = updater.menuItem();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: TR() ? 'Ayva\'yı aç' : 'Open Ayva', click: showWindow },
    {
      label: TR() ? 'Windows açılınca başlat' : 'Start with Windows',
      type: 'checkbox',
      checked: startsWithWindows(),
      click: (item) => setStartWithWindows(item.checked),
    },
    ...(updateItem ? [updateItem] : []),
    { type: 'separator' },
    { label: TR() ? 'Çıkış' : 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.png'));
  tray.setToolTip('Ayva');
  tray.on('click', showWindow);
  updateTrayMenu();
}

ipcMain.handle('get-start-with-windows', () => startsWithWindows());
ipcMain.handle('set-start-with-windows', (event, on) => {
  if (fromOurWindow(event)) setStartWithWindows(on);
  return startsWithWindows();
});

function createWindow(port) {
  win = new BrowserWindow({
    width: 1000,
    height: 760,
    minWidth: 520,
    minHeight: 480,
    show: !STARTED_HIDDEN,
    backgroundColor: '#16130e',
    title: 'Ayva',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // getDisplayMedia() in the page ends up here; answer with the source the
  // user picked in our own picker.
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    const source = sources.find((s) => s.id === selected.sourceId);
    if (!source) {
      callback({});
      return;
    }
    // System audio capture ("loopback") is supported on Windows.
    const audio = selected.audio && process.platform === 'win32' ? 'loopback' : undefined;
    callback(audio ? { video: source, audio } : { video: source });
  });

  // Links to the outside world open in the normal browser. The one window the
  // page opens itself shows a phone's screen; the page draws into it.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'http://localhost:' + port + '/mirror.html') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 420,
          height: 820,
          minWidth: 200,
          minHeight: 200,
          backgroundColor: '#000000',
          title: 'Ayva',
          icon: path.join(__dirname, 'icon.png'),
          autoHideMenuBar: true,
          // Partly covered by another window, Windows can report it hidden,
          // which would stop its display refreshes and the picture with them.
          webPreferences: { backgroundThrottling: false },
        },
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // A phone's screen or camera shows up even while Ayva itself is minimized
  // or in the tray (a window opened from a minimized one starts minimized).
  win.webContents.on('did-create-window', (child) => {
    const bringUp = () => {
      if (child.isDestroyed()) return;
      if (child.isMinimized()) child.restore();
      child.show();
    };
    bringUp();
    child.once('ready-to-show', bringUp);
    child.webContents.once('did-finish-load', bringUp);
  });

  win.loadURL('http://localhost:' + port + '/share?app=1');

  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!toldAboutTray && Notification.isSupported()) {
      toldAboutTray = true;
      new Notification({
        title: 'Ayva',
        body: TR()
          ? 'Ayva arka planda çalışmaya devam ediyor. Çıkmak için saat yanındaki simgeye sağ tıkla.'
          : 'Ayva keeps running in the background. Right-click the tray icon to quit.',
        icon: path.join(__dirname, 'icon.png'),
      }).show();
    }
  });
  win.on('closed', () => { win = null; });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  // Encrypted DNS lets Chromium use Encrypted Client Hello, so the address
  // being visited isn't sent in the clear. Some networks block workers.dev by
  // that name; with this, the fixed address keeps working there.
  app.configureHostResolver({
    secureDnsMode: 'automatic',
    secureDnsServers: ['https://cloudflare-dns.com/dns-query', 'https://dns.google/dns-query'],
  });
  try {
    server = await startServer();
  } catch (err) {
    const { dialog } = require('electron');
    dialog.showErrorBox('Ayva', 'Could not start: ' + err.message);
    app.quit();
    return;
  }
  cloud = new Cloud(app.getPath('userData'), path.join(__dirname, '..', 'public'), app.getVersion());
  turn = new Turn(app.getPath('userData'));
  adb = new Adb(app.getPath('userData'));
  // Keep the pages at the fixed address in step with this version of Ayva.
  cloud.updateIfNeeded().catch(() => {});
  createWindow(server.port);
  createTray();
  updater.start();

  globalShortcut.register(CONTROL_OFF_SHORTCUT, () => {
    setControl(false);
    if (win) win.webContents.send('control-forced-off');
  });
  watchDisplays();
  globalShortcut.register(PRIVACY_OFF_SHORTCUT, () => {
    setPrivacy(false);
    if (win) win.webContents.send('privacy-forced-off');
  });
});

app.on('before-quit', () => { quitting = true; });

app.on('will-quit', () => {
  setPrivacy(false);
  releaseAll();
  stopInternet();
  if (adb) adb.stopAll();
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (server) server.close();
  app.quit();
});
