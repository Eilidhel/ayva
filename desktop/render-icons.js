// Renders public/icon.svg into the PNG icons the apps need:
//   desktop/icon.png (512, transparent), the Android launcher icon, the
//   Android TV banner and the iPhone home-screen icon.
//   Run with: npx electron desktop/render-icons.js
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'public', 'icon.svg'), 'utf8');
const svgUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

const outputs = [
  {
    file: 'desktop/icon.png', width: 512, height: 512, transparent: true,
    html: `<img src="${svgUrl}" style="width:512px;height:512px">`,
  },
  {
    file: 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', width: 192, height: 192,
    html: `<div style="width:192px;height:192px;background:#3a2b66;border-radius:36px;display:flex;align-items:center;justify-content:center">
             <img src="${svgUrl}" style="width:150px;height:150px"></div>`,
  },
  {
    file: 'android/app/src/main/res/drawable-xhdpi/banner.png', width: 320, height: 180,
    html: `<div style="width:320px;height:180px;background:#3a2b66;display:flex;align-items:center;justify-content:center;gap:14px;font-family:'Segoe UI',sans-serif">
             <img src="${svgUrl}" style="width:96px;height:96px">
             <span style="color:#f2c14e;font-size:44px;font-weight:700;letter-spacing:0.5px">Ayva</span></div>`,
  },
  {
    // iPhone "Add to Home Screen" icon: full square, iOS rounds the corners.
    file: 'public/apple-touch-icon.png', width: 180, height: 180,
    html: `<div style="width:180px;height:180px;background:#3a2b66;display:flex;align-items:center;justify-content:center">
             <img src="${svgUrl}" style="width:140px;height:140px"></div>`,
  },
];

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {}); // keep going between icons; quit explicitly at the end
app.whenReady().then(async () => {
  for (const out of outputs) {
    const win = new BrowserWindow({
      // Opaque images render text without fringes; only the app icon needs transparency.
      width: out.width, height: out.height, show: false, frame: false, transparent: !!out.transparent,
      backgroundColor: out.transparent ? '#00000000' : '#3a2b66',
      webPreferences: { offscreen: true },
    });
    // Long data: URLs fail to load, so go through a temporary file.
    const page = `<html><body style="margin:0;background:transparent;overflow:hidden">${out.html}</body></html>`;
    const tmp = path.join(require('os').tmpdir(), 'ayva-icon-' + path.basename(out.file) + '.html');
    fs.writeFileSync(tmp, page);
    await win.loadFile(tmp);
    await new Promise((r) => setTimeout(r, 300));
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: out.width, height: out.height });
    const target = path.join(root, out.file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, image.resize({ width: out.width, height: out.height }).toPNG());
    console.log('wrote', out.file);
    win.destroy();
  }
  app.quit();
});
