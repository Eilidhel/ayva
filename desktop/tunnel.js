// Internet access through a Cloudflare "quick tunnel": cloudflared connects
// out to Cloudflare and gets a random https://….trycloudflare.com address that
// forwards to the local server. No account, no router setup.
//
// cloudflared is downloaded from Cloudflare's GitHub releases on first use.

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

const DOWNLOAD_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
const URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const START_TIMEOUT_MS = 45000;

class Tunnel {
  constructor(dir) {
    this.binary = path.join(dir, 'cloudflared.exe');
    this.proc = null;
    this.url = null;
    this.onExit = null;
  }

  get supported() {
    return process.platform === 'win32';
  }

  // Downloads cloudflared if needed. onProgress(fraction 0..1).
  ensureBinary(onProgress) {
    if (fs.existsSync(this.binary)) return Promise.resolve();
    fs.mkdirSync(path.dirname(this.binary), { recursive: true });
    const partial = this.binary + '.download';
    return new Promise((resolve, reject) => {
      const get = (url, redirects) => {
        https.get(url, { headers: { 'User-Agent': 'ayva' } }, (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
            res.resume();
            get(new URL(res.headers.location, url).toString(), redirects + 1);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error('Download failed (HTTP ' + res.statusCode + ')'));
            return;
          }
          const total = Number(res.headers['content-length']) || 0;
          let received = 0;
          const file = fs.createWriteStream(partial);
          res.on('data', (chunk) => {
            received += chunk.length;
            if (total && onProgress) onProgress(received / total);
          });
          res.pipe(file);
          file.on('finish', () => {
            file.close(() => {
              fs.renameSync(partial, this.binary);
              resolve();
            });
          });
          file.on('error', reject);
        }).on('error', reject);
      };
      get(DOWNLOAD_URL, 0);
    });
  }

  // Starts the tunnel to http://localhost:<port>; resolves with the public URL.
  start(port) {
    if (this.proc) return Promise.resolve(this.url);
    return new Promise((resolve, reject) => {
      const proc = spawn(this.binary, ['tunnel', '--no-autoupdate', '--url', 'http://localhost:' + port], {
        windowsHide: true,
      });
      this.proc = proc;
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.stop();
        reject(new Error('Timed out waiting for the tunnel address'));
      }, START_TIMEOUT_MS);

      const scan = (buf) => {
        const match = buf.toString().match(URL_PATTERN);
        if (match && !settled) {
          settled = true;
          clearTimeout(timer);
          this.url = match[0];
          resolve(this.url);
        }
      };
      proc.stdout.on('data', scan);
      proc.stderr.on('data', scan); // cloudflared logs to stderr

      proc.on('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });
      proc.on('exit', () => {
        const wasRunning = this.proc === proc;
        this.proc = null;
        this.url = null;
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('cloudflared exited before the tunnel was ready'));
        } else if (wasRunning && this.onExit) {
          this.onExit();
        }
      });
    });
  }

  stop() {
    const proc = this.proc;
    this.proc = null;
    this.url = null;
    if (proc) proc.kill();
  }
}

module.exports = { Tunnel };
