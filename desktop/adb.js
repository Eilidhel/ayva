// Controlling a phone from its window here, over ADB (Android's Wireless
// debugging). Android lets an app touch other apps only through an
// accessibility service, which Google Play Protect blocks for apps installed
// outside the Play Store; ADB is the other way, the one scrcpy uses.
//
// Google's adb program may not be shipped with Ayva (Android SDK License
// 3.4), so it is downloaded from Google when the user asks, into Ayva's own
// data folder. The phone is paired once with the code from its Wireless
// debugging screen; adb then finds it on the network by itself (mDNS). To
// touch, Ayva starts InputServer (a class inside the Ayva Android app) on the
// phone with the shell's rights and writes one command per line to it.
//
// adb gives the paired computer a lot of power over the phone, so only fixed,
// checked commands are ever run: nothing a page sends goes to a shell.

const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { net } = require('electron');

const DOWNLOAD_URL = 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip';
const TERMS_URL = 'https://developer.android.com/studio/releases/platform-tools';
const APP_ID = 'io.github.ayva.tv';

const HOST = /^(\d{1,3}\.){3}\d{1,3}$/;
const SERIAL = /^[A-Za-z0-9._:-]{1,64}$/;
const INPUT_LINE = /^((down|move|up) [01](\.\d{1,6})? [01](\.\d{1,6})?|scroll [01](\.\d{1,6})? [01](\.\d{1,6})? -?\d{1,2}(\.\d{1,3})?|key (back|home|recents|enter|del|fdel|tab|up|down|left|right|mhome|mend|pgup|pgdn|a|c|x|z|y)( ctrl)?( shift)?|(text|paste) [A-Za-z0-9+/]{1,16384}={0,2})$/;

class Adb {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.exe = path.join(dataDir, 'platform-tools', 'adb.exe');
    this.inputs = {}; // phone serial -> { proc, ready }
    this.transports = {}; // adb transport name -> phone serial (ro.serialno)
  }

  status() {
    return { installed: fs.existsSync(this.exe), termsUrl: TERMS_URL };
  }

  // Google's platform-tools zip, unpacked with Windows' own tar.
  async download(progress) {
    const zip = path.join(this.dataDir, 'platform-tools.zip');
    const res = await net.fetch(DOWNLOAD_URL, { signal: AbortSignal.timeout(300000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const total = Number(res.headers.get('content-length')) || 0;
    const chunks = [];
    let got = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      got += value.length;
      if (total) progress(got / total);
    }
    fs.writeFileSync(zip, Buffer.concat(chunks));
    try {
      await new Promise((resolve, reject) => {
        execFile('tar', ['-xf', zip, '-C', this.dataDir], { windowsHide: true }, (err) => (err ? reject(err) : resolve()));
      });
    } finally {
      fs.rmSync(zip, { force: true });
    }
    if (!fs.existsSync(this.exe)) throw new Error('adb.exe missing after unpacking');
  }

  run(args, timeout = 15000) {
    return new Promise((resolve) => {
      execFile(this.exe, args, { windowsHide: true, timeout }, (err, stdout, stderr) => {
        resolve({ ok: !err, out: String(stdout || '') + String(stderr || '') });
      });
    });
  }

  // "adb pair <ip>:<port> <code>", then waits for the phone to show up.
  async pair(host, port, code) {
    if (!HOST.test(host) || !/^\d{1,5}$/.test(String(port)) || !/^\d{6}$/.test(String(code))) {
      return { ok: false, error: 'input' };
    }
    const r = await this.run(['pair', host + ':' + port, String(code)], 30000);
    if (!/Successfully paired/i.test(r.out)) return { ok: false, error: 'pair', detail: r.out.trim().slice(0, 200) };
    const found = await this.find(host, 15000);
    return found ? { ok: true, serial: found.serial, model: found.model } : { ok: false, error: 'connect' };
  }

  // The phone's adb connection (finding it on the network if needed).
  async find(host, waitMs) {
    const until = Date.now() + waitMs;
    for (;;) {
      for (const t of await this.devices()) {
        const serial = await this.serialOf(t);
        if (!serial) continue;
        // Named "<ip>:<port>" when connected by address, "adb-…._adb-tls-connect._tcp" when found by adb.
        const here = !host || t.indexOf(host + ':') === 0 || await this.hostOf(t) === host;
        if (!here) continue;
        const model = (await this.run(['-s', t, 'shell', 'getprop', 'ro.product.model'])).out.trim();
        return { transport: t, serial, model: model.slice(0, 60) };
      }
      if (host) await this.connectByMdns(host);
      if (Date.now() > until) return null;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  async devices() {
    const r = await this.run(['devices']);
    return r.out.split(/\r?\n/)
      .map((l) => l.split('\t'))
      .filter((p) => p.length === 2 && p[1].trim() === 'device')
      .map((p) => p[0].trim());
  }

  async serialOf(transport) {
    if (this.transports[transport]) return this.transports[transport];
    const s = (await this.run(['-s', transport, 'shell', 'getprop', 'ro.serialno'])).out.trim();
    if (!SERIAL.test(s)) return null;
    this.transports[transport] = s;
    return s;
  }

  async hostOf(transport) {
    const r = await this.run(['-s', transport, 'shell', 'ip', '-4', '-o', 'addr', 'show', 'wlan0']);
    const m = /inet (\d+\.\d+\.\d+\.\d+)/.exec(r.out);
    return m ? m[1] : null;
  }

  // Paired phones announce themselves as _adb-tls-connect; the port changes
  // when Wireless debugging is turned off and on.
  async connectByMdns(host) {
    const r = await this.run(['mdns', 'services']);
    for (const line of r.out.split(/\r?\n/)) {
      if (!/_adb-tls-connect/.test(line)) continue;
      const m = /(\d+\.\d+\.\d+\.\d+):(\d+)/.exec(line);
      if (m && (!host || m[1] === host)) await this.run(['connect', m[1] + ':' + m[2]]);
    }
  }

  async transportFor(serial, host) {
    for (const t of await this.devices()) {
      if (await this.serialOf(t) === serial) return t;
    }
    const found = await this.find(HOST.test(host || '') ? host : null, 8000);
    return found && found.serial === serial ? found.transport : null;
  }

  // Starts InputServer on the phone (if not running already).
  async startInput(serial, host) {
    if (!SERIAL.test(serial || '')) return { ok: false, error: 'input' };
    const running = this.inputs[serial];
    if (running && running.ready) return { ok: true };
    if (!fs.existsSync(this.exe)) return { ok: false, error: 'missing' };
    const t = await this.transportFor(serial, host);
    if (!t) return { ok: false, error: 'connect' };
    const pm = (await this.run(['-s', t, 'shell', 'pm', 'path', APP_ID])).out;
    const apk = /package:(\/data\/app\/[\w\-.=~+/]+\/base\.apk)/.exec(pm);
    if (!apk) return { ok: false, error: 'app' };
    const proc = spawn(this.exe, ['-s', t, 'shell', 'CLASSPATH=' + apk[1] + ' app_process / ' + APP_ID + '.InputServer'],
      { windowsHide: true });
    const entry = { proc, ready: false };
    this.inputs[serial] = entry;
    const done = () => { if (this.inputs[serial] === entry) delete this.inputs[serial]; };
    proc.on('exit', done);
    proc.on('error', done);
    const ok = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 10000);
      proc.stdout.on('data', (d) => {
        if (/^ok/m.test(String(d))) {
          clearTimeout(timer);
          resolve(true);
        }
      });
      proc.on('exit', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
    if (!ok) {
      proc.kill();
      done();
      return { ok: false, error: 'start' };
    }
    entry.ready = true;
    return { ok: true };
  }

  input(serial, line) {
    const entry = this.inputs[serial];
    if (!entry || !entry.ready || typeof line !== 'string' || !INPUT_LINE.test(line)) return;
    entry.proc.stdin.write(line + '\n');
  }

  stopInput(serial) {
    const entry = this.inputs[serial];
    if (!entry) return;
    delete this.inputs[serial];
    try {
      entry.proc.stdin.end();
    } catch (e) { /* already gone */ }
    setTimeout(() => entry.proc.kill(), 1000);
  }

  // On quit: nothing left running on the phone or in the background here.
  stopAll() {
    Object.keys(this.inputs).forEach((s) => this.stopInput(s));
    if (fs.existsSync(this.exe)) execFile(this.exe, ['kill-server'], { windowsHide: true }, () => {});
  }
}

module.exports = { Adb };
