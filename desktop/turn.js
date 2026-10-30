// The relay ("backup route"): Cloudflare Realtime TURN in the user's own
// Cloudflare account, for networks where the picture cannot go straight from
// this computer to the viewer.
//
// The user creates a TURN key in the Cloudflare dashboard and pastes its id
// and API token into Ayva. The token is a long-term secret: it stays here,
// encrypted with Windows' DPAPI (Electron safeStorage), and never goes to a
// page or a viewer. Viewers only get short-lived credentials made from it,
// one set per viewer, revoked when that viewer leaves.

const fs = require('fs');
const path = require('path');
const { safeStorage, net } = require('electron');

const API = 'https://rtc.live.cloudflare.com/v1/turn/keys/';

class Turn {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'turn.json');
    this.config = null;
    try {
      this.config = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (e) { /* not set up */ }
  }

  status() {
    return { configured: !!this.config, keyId: this.config ? this.config.keyId : null };
  }

  token() {
    return safeStorage.decryptString(Buffer.from(this.config.token, 'base64'));
  }

  async call(keyId, token, route, body) {
    const res = await net.fetch(API + encodeURIComponent(keyId) + route, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const err = new Error('HTTP ' + res.status);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  // Checks the key by asking for a one-minute credential before keeping it.
  async setup(keyId, apiToken) {
    keyId = String(keyId || '').trim();
    const token = String(apiToken || '').trim();
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(keyId) || !token) throw new Error('turn-missing');
    if (!safeStorage.isEncryptionAvailable()) throw new Error('turn-no-encryption');
    let test;
    try {
      test = await this.call(keyId, token, '/credentials/generate-ice-servers', { ttl: 60 });
    } catch (err) {
      throw new Error(err.status === 401 || err.status === 403 || err.status === 404 ? 'turn-rejected' : 'turn-unreachable');
    }
    const relay = iceServers(test).find((s) => s.username);
    if (relay) this.call(keyId, token, '/credentials/' + encodeURIComponent(relay.username) + '/revoke').catch(() => {});
    this.config = { keyId, token: safeStorage.encryptString(token).toString('base64') };
    fs.writeFileSync(this.file, JSON.stringify(this.config, null, 2));
    return this.status();
  }

  remove() {
    this.config = null;
    fs.rmSync(this.file, { force: true });
  }

  // Short-lived credentials for one viewer: { iceServers, username }.
  async credentials(ttl) {
    if (!this.config) return null;
    const result = await this.call(this.config.keyId, this.token(), '/credentials/generate-ice-servers',
      { ttl: Math.max(60, Math.min(86400, ttl | 0)) });
    const servers = iceServers(result);
    const relay = servers.find((s) => s.username);
    return relay ? { iceServers: servers, username: relay.username } : null;
  }

  async revoke(username) {
    if (!this.config || !username) return;
    await this.call(this.config.keyId, this.token(), '/credentials/' + encodeURIComponent(username) + '/revoke');
  }
}

// Browsers block port 53, so those addresses would only time out.
function iceServers(result) {
  const list = result && Array.isArray(result.iceServers) ? result.iceServers : [];
  return list.map((s) => {
    const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => typeof u === 'string' && !/:53(\?|$)/.test(u));
    return Object.assign({}, s, { urls });
  }).filter((s) => s.urls.length);
}

module.exports = { Turn };
