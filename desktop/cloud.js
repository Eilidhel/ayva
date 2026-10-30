// Sets up the fixed address: deploys the Ayva hub (cloud/worker.js) to the
// user's own Cloudflare account through the Cloudflare API, using an API token
// the user creates (template "Edit Cloudflare Workers") and pastes into Ayva.
//
// Each computer gets its own secret (HOST_<id>) in the worker, so several
// computers can share one account without knowing each other's tokens.
// The API token is kept encrypted with Windows' DPAPI (Electron safeStorage),
// only to update the worker when Ayva itself is updated.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { safeStorage, net } = require('electron');
const { buildWorker } = require('../cloud/build');

const API = 'https://api.cloudflare.com/client/v4';
const SCRIPT = 'ayva';
const COMPATIBILITY_DATE = '2024-09-23';

class Cloud {
  constructor(dataDir, publicDir, appVersion) {
    this.file = path.join(dataDir, 'cloud.json');
    this.publicDir = publicDir;
    this.appVersion = appVersion;
    this.config = this.load();
  }

  load() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (e) {
      return null;
    }
  }

  save() {
    fs.writeFileSync(this.file, JSON.stringify(this.config, null, 2));
  }

  // What the share page needs: the address and how this computer connects to it.
  status() {
    const c = this.config;
    if (!c) return { configured: false };
    const name = os.hostname();
    const wsUrl = c.url.replace(/^https:/, 'wss:') + '/?role=host'
      + '&id=' + encodeURIComponent(c.hostId)
      + '&token=' + encodeURIComponent(c.hostToken)
      + '&name=' + encodeURIComponent(name);
    // The QR link names this computer, so the phone goes straight to it.
    return { configured: true, url: c.url, link: c.url + '/#' + c.hostId, wsUrl, name };
  }

  async api(token, method, route, body, isForm) {
    const res = await fetch(API + route, {
      method,
      headers: Object.assign({ Authorization: 'Bearer ' + token }, isForm || !body ? {} : { 'Content-Type': 'application/json' }),
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* not JSON */ }
    if (!res.ok || !json || json.success === false) {
      const err = new Error((json && json.errors && json.errors[0] && json.errors[0].message) || ('HTTP ' + res.status));
      err.status = res.status;
      err.code = json && json.errors && json.errors[0] && json.errors[0].code;
      throw err;
    }
    return json.result;
  }

  async putSecret(token, accountId, name, text) {
    await this.api(token, 'PUT', `/accounts/${accountId}/workers/scripts/${SCRIPT}/secrets`,
      { name, text, type: 'secret_text' });
  }

  async uploadWorker(token, accountId, firstTime) {
    const metadata = {
      main_module: 'worker.js',
      compatibility_date: COMPATIBILITY_DATE,
      bindings: [{ type: 'durable_object_namespace', name: 'HUB', class_name: 'Hub' }],
      // Secrets are set separately and must survive code updates.
      keep_bindings: ['secret_text'],
    };
    if (firstTime) metadata.migrations = { new_tag: 'v1', new_sqlite_classes: ['Hub'] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('worker.js', new Blob([buildWorker(this.publicDir)], { type: 'application/javascript+module' }), 'worker.js');
    await this.api(token, 'PUT', `/accounts/${accountId}/workers/scripts/${SCRIPT}`, form, true);
  }

  async scriptExists(token, accountId) {
    try {
      await this.api(token, 'GET', `/accounts/${accountId}/workers/scripts/${SCRIPT}/settings`);
      return true;
    } catch (err) {
      if (err.status === 404) return false;
      throw err;
    }
  }

  async subdomain(token, accountId) {
    try {
      const r = await this.api(token, 'GET', `/accounts/${accountId}/workers/subdomain`);
      if (r && r.subdomain) return r.subdomain;
    } catch (err) {
      // "No subdomain yet" comes back as 404 or 400 depending on the account.
      if (err.status !== 404 && err.status !== 400 && err.code !== 10007) throw err;
    }
    // New accounts have no workers.dev subdomain yet: claim one.
    const wanted = 'ayva-' + crypto.randomBytes(3).toString('hex');
    const r = await this.api(token, 'PUT', `/accounts/${accountId}/workers/subdomain`, { subdomain: wanted });
    return r.subdomain || wanted;
  }

  // Waits until the new address answers (a new workers.dev name can take a
  // minute). Gives up after about 90 s: some networks block workers.dev, and
  // then waiting longer doesn't help.
  async waitUntilReachable(url, onStep) {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      try {
        // Chromium's network stack (not Node's), so it goes the same way as
        // the app's own connection: encrypted DNS and Encrypted Client Hello.
        const res = await net.fetch(url + '/config.json', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
        if (res.ok) return true;
      } catch (e) { /* not yet, or blocked */ }
      if (onStep) onStep('waiting');
      await new Promise((r) => setTimeout(r, 3000));
    }
    return false;
  }

  // apiToken: from the user. password: required the first time on an account,
  // optional later (given = change it). onStep(name) reports progress.
  async setup(apiToken, password, onStep) {
    const token = String(apiToken || '').trim();
    if (!token) throw new Error('token-missing');
    onStep('account');
    const accounts = await this.api(token, 'GET', '/accounts');
    if (!accounts || !accounts.length) throw new Error('no-account');
    const accountId = accounts[0].id;

    // New accounts have no workers.dev subdomain yet, and uploading needs one.
    onStep('address');
    const sub = await this.subdomain(token, accountId);

    onStep('upload');
    const exists = await this.scriptExists(token, accountId);
    if (!exists && !password) throw new Error('password-required');
    try {
      await this.uploadWorker(token, accountId, !exists);
    } catch (err) {
      // The migration may already have been applied by an earlier, interrupted setup.
      if (!/migration/i.test(err.message)) throw err;
      await this.uploadWorker(token, accountId, false);
    }

    onStep('secrets');
    const hostId = (this.config && this.config.hostId) || crypto.randomBytes(12).toString('hex');
    const hostToken = crypto.randomBytes(24).toString('base64url');
    await this.putSecret(token, accountId, 'HOST_' + hostId, hostToken);
    if (password) {
      if (String(password).length < 8) throw new Error('password-short');
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.createHash('sha256').update(salt + password).digest('hex');
      await this.putSecret(token, accountId, 'VIEWER_SECRET', salt + ':' + hash);
      // A new session key logs out every phone, so they need the new password.
      await this.putSecret(token, accountId, 'SESSION_KEY', crypto.randomBytes(32).toString('hex'));
    }

    await this.api(token, 'POST', `/accounts/${accountId}/workers/scripts/${SCRIPT}/subdomain`,
      { enabled: true, previews_enabled: false });
    const url = `https://${SCRIPT}.${sub}.workers.dev`;

    this.config = {
      url, accountId, hostId, hostToken,
      apiToken: safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(token).toString('base64') : null,
      deployedVersion: this.appVersion,
    };
    this.save();

    onStep('waiting');
    const reachable = await this.waitUntilReachable(url, onStep);
    return Object.assign(this.status(), { reachable });
  }

  // After Ayva is updated, refresh the pages served at the fixed address.
  async updateIfNeeded() {
    const c = this.config;
    if (!c || c.deployedVersion === this.appVersion || !c.apiToken) return;
    const token = safeStorage.decryptString(Buffer.from(c.apiToken, 'base64'));
    await this.uploadWorker(token, c.accountId, false);
    c.deployedVersion = this.appVersion;
    this.save();
  }

  // Disconnects this computer from the fixed address (others keep working).
  async remove() {
    const c = this.config;
    if (!c) return;
    if (c.apiToken) {
      try {
        const token = safeStorage.decryptString(Buffer.from(c.apiToken, 'base64'));
        await this.api(token, 'DELETE', `/accounts/${c.accountId}/workers/scripts/${SCRIPT}/secrets/HOST_${c.hostId}`);
      } catch (e) { /* already gone, or the token was revoked */ }
    }
    this.config = null;
    fs.rmSync(this.file, { force: true });
  }
}

module.exports = { Cloud };
