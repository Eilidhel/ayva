// Ayva hub on Cloudflare Workers: a fixed https address in the user's own
// Cloudflare account that introduces their computers to their phones and TVs
// from anywhere. Like server.js, it only relays signaling; video still goes
// directly between the devices over WebRTC.
//
// Who may do what:
// - Each computer connects with its own secret token (HOST_<id>), known only to
//   Ayva on that computer.
// - Viewers need the password chosen at setup (once; afterwards a session token).
// - Each computer still approves every new device itself (Allow / Deny).
//
// This file is a template: cloud/build.js puts the viewer pages into FILES.

import { DurableObject } from 'cloudflare:workers';

const FILES = __AYVA_FILES__; // path -> [content type, base64 body]
const ROUTES = { '/': '/watch.html', '/tv': '/watch.html', '/watch': '/watch.html' };
const MAX_PASSWORD_FAILURES = 10;
const PASSWORD_BLOCK_MS = 15 * 60 * 1000;

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const encoder = new TextEncoder();

function safeEqual(a, b) {
  const x = encoder.encode(String(a || ''));
  const y = encoder.encode(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.subtle.timingSafeEqual(x, y);
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(key, text) {
  const k = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, encoder.encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket') {
      // One hub per account keeps every computer and viewer in one place.
      const hub = env.HUB.get(env.HUB.idFromName('hub'));
      return hub.fetch(request);
    }

    if (url.pathname === '/config.json') {
      return Response.json(
        { cloud: true, iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }] },
        { headers: { 'Cache-Control': 'no-store', ...SECURITY_HEADERS } },
      );
    }

    const path = ROUTES[url.pathname] || url.pathname;
    const file = FILES[path];
    if (!file) return new Response('Not found', { status: 404, headers: SECURITY_HEADERS });
    return new Response(base64ToBytes(file[1]), {
      headers: { 'Content-Type': file[0], 'Cache-Control': 'no-cache', ...SECURITY_HEADERS },
    });
  },
};

// The hub keeps the WebSockets of all computers ("hosts") and viewers. It uses
// the hibernation API, so an idle connection costs nothing; per-socket state
// lives in its attachment.
export class Hub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Keep-alive pings are answered without waking the hub.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request) {
    const url = new URL(request.url);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    if (url.searchParams.get('role') === 'host') {
      // Each computer has its own secret, HOST_<id>, added when it was set up.
      const id = (url.searchParams.get('id') || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 64);
      if (!id || !safeEqual(url.searchParams.get('token'), this.env['HOST_' + id])) {
        return new Response('Forbidden', { status: 403 });
      }
      // A computer that reconnects replaces its old connection.
      for (const old of this.ctx.getWebSockets('host:' + id)) old.close(4000, 'replaced');
      this.ctx.acceptWebSocket(server, ['host', 'host:' + id]);
      server.serializeAttachment({
        role: 'host', id, name: (url.searchParams.get('name') || 'PC').slice(0, 60), live: false,
      });
    } else {
      const id = crypto.randomUUID();
      this.ctx.acceptWebSocket(server, ['viewer', 'viewer:' + id]);
      server.serializeAttachment({
        role: 'viewer', id, ip: request.headers.get('CF-Connecting-IP') || '',
        authed: false, host: null, state: 'idle', deviceId: '', name: '',
      });
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---- helpers ----

  send(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch (e) { /* closing */ }
  }

  hostSocket(id) {
    return this.ctx.getWebSockets('host:' + String(id))[0] || null;
  }

  viewerSocket(id) {
    return this.ctx.getWebSockets('viewer:' + String(id))[0] || null;
  }

  hostList(except) {
    return this.ctx.getWebSockets('host')
      .filter((ws) => ws !== except)
      .map((ws) => {
        const a = ws.deserializeAttachment();
        return { id: a.id, name: a.name, live: a.live };
      });
  }

  broadcastHosts(except) {
    const hosts = this.hostList(except);
    for (const ws of this.ctx.getWebSockets('viewer')) {
      if (ws.deserializeAttachment().authed) this.send(ws, { type: 'hosts', hosts });
    }
  }

  async passwordBlocked(ip) {
    const f = await this.ctx.storage.get('fail:' + ip);
    if (!f) return false;
    if (f.until && Date.now() > f.until) {
      await this.ctx.storage.delete('fail:' + ip);
      return false;
    }
    return f.count >= MAX_PASSWORD_FAILURES;
  }

  async notePasswordFailure(ip) {
    const f = (await this.ctx.storage.get('fail:' + ip)) || { count: 0, until: 0 };
    f.count++;
    if (f.count >= MAX_PASSWORD_FAILURES) f.until = Date.now() + PASSWORD_BLOCK_MS;
    await this.ctx.storage.put('fail:' + ip, f);
  }

  // Session token handed to a viewer after the right password, so it doesn't
  // have to send the password again. Changing the password invalidates it.
  sessionToken() {
    return hmacHex(this.env.SESSION_KEY, 'viewer:' + this.env.VIEWER_SECRET);
  }

  async checkPassword(password) {
    const [salt, hash] = String(this.env.VIEWER_SECRET || '').split(':');
    if (!salt || !hash || typeof password !== 'string') return false;
    return safeEqual(await sha256Hex(salt + password), hash);
  }

  // ---- messages ----

  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || typeof msg.type !== 'string') return;
    const a = ws.deserializeAttachment();
    if (a.role === 'host') await this.fromHost(ws, a, msg);
    else await this.fromViewer(ws, a, msg);
  }

  async fromHost(ws, a, msg) {
    switch (msg.type) {
      case 'host':
        if (typeof msg.name === 'string' && msg.name) a.name = msg.name.slice(0, 60);
        a.live = !!msg.live;
        ws.serializeAttachment(a);
        this.send(ws, { type: 'hosted' });
        this.broadcastHosts();
        break;
      case 'status':
        a.live = !!msg.live;
        ws.serializeAttachment(a);
        this.broadcastHosts();
        break;
      case 'approve': {
        const v = this.viewerSocket(msg.id);
        if (!v) return;
        const va = v.deserializeAttachment();
        if (va.host !== a.id || va.state !== 'pending') return;
        va.state = 'joined';
        v.serializeAttachment(va);
        this.send(v, { type: 'joined' });
        this.send(ws, { type: 'viewer-joined', id: va.id, deviceId: va.deviceId, name: va.name, remote: true });
        break;
      }
      case 'reject':
      case 'kick': {
        const v = this.viewerSocket(msg.id);
        if (!v) return;
        const va = v.deserializeAttachment();
        if (va.host !== a.id) return;
        this.send(v, { type: msg.type === 'kick' ? 'kicked' : 'rejected' });
        v.close(1000, msg.type);
        break;
      }
      case 'signal': {
        const v = this.viewerSocket(msg.to);
        if (!v) return;
        const va = v.deserializeAttachment();
        if (va.host === a.id && va.state === 'joined') this.send(v, { type: 'signal', data: msg.data });
        break;
      }
    }
  }

  async fromViewer(ws, a, msg) {
    if (msg.type === 'auth') {
      if (await this.passwordBlocked(a.ip)) {
        this.send(ws, { type: 'auth-blocked' });
        ws.close(1008, 'blocked');
        return;
      }
      const token = await this.sessionToken();
      let ok = typeof msg.token === 'string' && safeEqual(msg.token, token);
      if (!ok && typeof msg.password === 'string') {
        ok = await this.checkPassword(msg.password);
        if (!ok) await this.notePasswordFailure(a.ip);
      }
      if (!ok) {
        this.send(ws, { type: msg.password ? 'wrong-password' : 'need-password' });
        return;
      }
      a.authed = true;
      ws.serializeAttachment(a);
      this.send(ws, { type: 'authed', token });
      this.send(ws, { type: 'hosts', hosts: this.hostList() });
      return;
    }
    if (!a.authed) {
      this.send(ws, { type: 'need-password' });
      return;
    }

    switch (msg.type) {
      case 'join': {
        if (a.state !== 'idle') return;
        const hostId = String(msg.code || '');
        const host = this.hostSocket(hostId);
        if (!host) {
          this.send(ws, { type: 'no-room' });
          return;
        }
        a.host = hostId;
        a.state = 'pending';
        a.deviceId = typeof msg.deviceId === 'string' ? msg.deviceId.slice(0, 64) : '';
        a.name = typeof msg.name === 'string' ? msg.name.slice(0, 60) : '';
        ws.serializeAttachment(a);
        this.send(ws, { type: 'pending' });
        this.send(host, { type: 'viewer-request', id: a.id, deviceId: a.deviceId, name: a.name, remote: true });
        break;
      }
      case 'signal': {
        if (a.state !== 'joined') return;
        const host = this.hostSocket(a.host);
        if (host) this.send(host, { type: 'signal', from: a.id, data: msg.data });
        break;
      }
    }
  }

  async webSocketClose(ws) {
    this.gone(ws);
  }

  async webSocketError(ws) {
    this.gone(ws);
  }

  gone(ws) {
    const a = ws.deserializeAttachment();
    if (!a) return;
    if (a.role === 'host') {
      // Its viewers go back to choosing a computer (they rejoin when it returns).
      for (const v of this.ctx.getWebSockets('viewer')) {
        const va = v.deserializeAttachment();
        if (va.host !== a.id || this.ctx.getWebSockets('host:' + a.id).some((h) => h !== ws)) continue;
        va.host = null;
        va.state = 'idle';
        v.serializeAttachment(va);
        this.send(v, { type: 'host-left' });
      }
      this.broadcastHosts(ws);
    } else if (a.host) {
      const host = this.hostSocket(a.host);
      if (host) this.send(host, { type: 'viewer-left', id: a.id });
    }
  }
}
