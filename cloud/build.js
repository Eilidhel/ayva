// Builds the Cloudflare Worker module (cloud/worker.js with the viewer pages
// embedded). Used by the desktop app when it deploys to the user's account,
// and from the command line for local testing: node cloud/build.js
const fs = require('fs');
const path = require('path');

// Only what a viewer needs. Sharing happens in the desktop app, never here.
const VIEWER_FILES = {
  '/watch.html': 'text/html; charset=utf-8',
  '/style.css': 'text/css; charset=utf-8',
  '/common.js': 'application/javascript; charset=utf-8',
  '/devicekey.js': 'application/javascript; charset=utf-8',
  '/watch.js': 'application/javascript; charset=utf-8',
  '/control.js': 'application/javascript; charset=utf-8',
  '/inbox.js': 'application/javascript; charset=utf-8',
  '/record.js': 'application/javascript; charset=utf-8',
  '/mic.js': 'application/javascript; charset=utf-8',
  '/screen.js': 'application/javascript; charset=utf-8',
  '/camera.js': 'application/javascript; charset=utf-8',
  '/cloud.js': 'application/javascript; charset=utf-8',
  '/icon.svg': 'image/svg+xml',
  '/apple-touch-icon.png': 'image/png',
  '/manifest.json': 'application/manifest+json',
};

function buildWorker(publicDir) {
  const template = fs.readFileSync(path.join(__dirname, 'worker.js'), 'utf8');
  const files = {};
  for (const [name, type] of Object.entries(VIEWER_FILES)) {
    files[name] = [type, fs.readFileSync(path.join(publicDir, name)).toString('base64')];
  }
  return template.replace('__AYVA_FILES__', JSON.stringify(files));
}

module.exports = { buildWorker };

if (require.main === module) {
  const out = path.join(__dirname, 'dist', 'worker.js');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buildWorker(path.join(__dirname, '..', 'public')));
  console.log('wrote', path.relative(process.cwd(), out));
}
