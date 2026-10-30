// Ayva: static file server + WebRTC signaling over WebSocket.
// The video itself flows peer-to-peer between the sharing computer and the TVs;
// this server only introduces them to each other.
//
// It also answers LAN discovery requests over UDP so the TV app can find
// this computer without typing an address.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const dgram = require('dgram');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const DISCOVERY_PORT = Number(process.env.DISCOVERY_PORT) || 41234;
const DISCOVERY_REQUEST = 'AYVA_DISCOVER';
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_FAILED_JOINS = 20;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

// ICE servers: STUN by default. Set ICE_SERVERS (JSON array) or TURN_URL/TURN_USER/TURN_PASS
// to relay through a TURN server when peers cannot connect directly.
function iceServers() {
  if (process.env.ICE_SERVERS) {
    try {
      return JSON.parse(process.env.ICE_SERVERS);
    } catch (e) {
      console.error('ICE_SERVERS is not valid JSON, falling back to defaults.');
    }
  }
  const servers = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (process.env.TURN_URL) {
    servers.push({
      urls: process.env.TURN_URL.split(','),
      username: process.env.TURN_USER || '',
      credential: process.env.TURN_PASS || '',
    });
  }
  return servers;
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const addr of list || []) {
      if (addr.family === 'IPv4' && !addr.internal) out.push(addr.address);
    }
  }
  return out;
}

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

// Requests that come in through the Cloudflare tunnel (internet access) carry
// Cloudflare's headers; local network requests don't.
function viaTunnel(req) {
  return !!(req.headers['cf-connecting-ip'] || req.headers['cf-ray']);
}

function sameSecret(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// Wrong access keys over the internet: block that address for a while.
const MAX_KEY_FAILURES = 10;
const KEY_BLOCK_MS = 15 * 60 * 1000;
const keyFailures = new Map(); // ip -> { count, until }

function keyBlocked(ip) {
  const f = keyFailures.get(ip);
  if (!f) return false;
  if (f.until && Date.now() > f.until) {
    keyFailures.delete(ip);
    return false;
  }
  return f.count >= MAX_KEY_FAILURES;
}

function noteKeyFailure(ip) {
  const f = keyFailures.get(ip) || { count: 0, until: 0 };
  f.count++;
  if (f.count >= MAX_KEY_FAILURES) f.until = Date.now() + KEY_BLOCK_MS;
  keyFailures.set(ip, f);
}

function start(options) {
  const opts = options || {};
  const port = opts.port || DEFAULT_PORT;
  // Returns the current internet access key, or null when internet access is off.
  const getAccessKey = opts.getAccessKey || (() => null);

  // rooms: code -> { host: ws, viewers: Map<id, ws>, live: boolean }
  const rooms = new Map();

  function newCode() {
    let code;
    do {
      code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    } while (rooms.has(code));
    return code;
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === '/config.json') {
      // When the share page is opened as localhost, the TV needs this computer's LAN address instead.
      const host = (req.headers.host || '').split(':')[0];
      const local = host === 'localhost' || host === '127.0.0.1';
      const lanUrls = local ? lanAddresses().map((ip) => 'http://' + ip + ':' + port) : [];
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ iceServers: iceServers(), lanUrls }));
      return;
    }

    // Short viewer links: /123456 -> watch page with that code
    if (/^\/\d{6}$/.test(pathname)) {
      res.writeHead(302, { Location: '/watch.html#' + pathname.slice(1) });
      res.end();
      return;
    }

    if (pathname === '/') pathname = '/index.html';
    if (pathname === '/share') pathname = '/share.html';
    if (pathname === '/watch' || pathname === '/tv') pathname = '/watch.html';

    const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
    if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  });

  // ---- Signaling ----

  const wss = new WebSocketServer({ server, maxPayload: 256 * 1024 });

  wss.on('connection', (ws, req) => {
    ws.remote = viaTunnel(req);
    ws.ip = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '');
    ws.id = crypto.randomUUID();
    ws.role = null;
    ws.code = null;
    ws.failedJoins = 0;
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (e) {
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;

      switch (msg.type) {
        case 'host': {
          // Only this computer (or its local network) may share.
          if (ws.role || ws.remote) return;
          // Let a reconnecting host keep its previous code if nobody took it.
          const wanted = typeof msg.code === 'string' && /^\d{6}$/.test(msg.code) ? msg.code : null;
          const code = wanted && !rooms.has(wanted) ? wanted : newCode();
          // pending: viewers waiting for the host to approve them
          rooms.set(code, { host: ws, viewers: new Map(), pending: new Map(), live: false });
          ws.role = 'host';
          ws.code = code;
          send(ws, { type: 'hosted', code });
          break;
        }

        case 'status': {
          const room = rooms.get(ws.code);
          if (room && ws.role === 'host') room.live = !!msg.live;
          break;
        }

        case 'join': {
          if (ws.role) return;
          // Over the internet the 6-digit code isn't enough: the link's access key is required.
          if (ws.remote) {
            if (keyBlocked(ws.ip)) {
              send(ws, { type: 'denied' });
              ws.close();
              return;
            }
            if (!sameSecret(msg.key, getAccessKey())) {
              noteKeyFailure(ws.ip);
              send(ws, { type: 'denied' });
              return;
            }
          }
          const room = rooms.get(String(msg.code));
          if (!room) {
            ws.failedJoins++;
            send(ws, { type: 'no-room' });
            if (ws.failedJoins > MAX_FAILED_JOINS) ws.close();
            return;
          }
          // The host decides who may watch (it approves remembered devices by itself).
          ws.role = 'pending';
          ws.code = String(msg.code);
          ws.deviceId = typeof msg.deviceId === 'string' ? msg.deviceId.slice(0, 64) : '';
          ws.deviceName = typeof msg.name === 'string' ? msg.name.slice(0, 60) : '';
          room.pending.set(ws.id, ws);
          send(ws, { type: 'pending' });
          send(room.host, {
            type: 'viewer-request',
            id: ws.id,
            deviceId: ws.deviceId,
            name: ws.deviceName,
            remote: ws.remote,
          });
          break;
        }

        case 'approve':
        case 'reject':
        case 'kick': {
          const room = rooms.get(ws.code);
          if (!room || ws.role !== 'host') return;
          const id = String(msg.id);
          if (msg.type === 'approve') {
            const viewer = room.pending.get(id);
            if (!viewer) return;
            room.pending.delete(id);
            viewer.role = 'viewer';
            room.viewers.set(id, viewer);
            send(viewer, { type: 'joined' });
            send(ws, {
              type: 'viewer-joined',
              id,
              deviceId: viewer.deviceId,
              name: viewer.deviceName,
              remote: viewer.remote,
            });
          } else {
            const viewer = room.pending.get(id) || room.viewers.get(id);
            if (!viewer) return;
            send(viewer, { type: msg.type === 'kick' ? 'kicked' : 'rejected' });
            viewer.close();
          }
          break;
        }

        case 'signal': {
          const room = rooms.get(ws.code);
          if (!room) return;
          if (ws.role === 'host') {
            send(room.viewers.get(msg.to), { type: 'signal', data: msg.data });
          } else if (ws.role === 'viewer') {
            send(room.host, { type: 'signal', from: ws.id, data: msg.data });
          }
          break;
        }
      }
    });

    ws.on('close', () => {
      const room = rooms.get(ws.code);
      if (!room) return;
      if (ws.role === 'host' && room.host === ws) {
        for (const viewer of [...room.viewers.values(), ...room.pending.values()]) {
          send(viewer, { type: 'host-left' });
          viewer.role = null;
          viewer.code = null;
        }
        rooms.delete(ws.code);
      } else if (ws.role === 'viewer' || ws.role === 'pending') {
        room.viewers.delete(ws.id);
        room.pending.delete(ws.id);
        send(room.host, { type: 'viewer-left', id: ws.id });
      }
    });
  });

  // Drop dead connections (e.g. a TV that was switched off).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);
  wss.on('close', () => clearInterval(heartbeat));

  // ---- LAN discovery ----
  // The TV app broadcasts DISCOVERY_REQUEST; we answer the sender directly with
  // this computer's name, port and rooms.
  const name = opts.name || os.hostname();
  const discovery = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  discovery.on('message', (buf, rinfo) => {
    if (buf.toString().trim() !== DISCOVERY_REQUEST) return;
    const reply = JSON.stringify({
      app: 'ayva',
      v: 1,
      name,
      port,
      rooms: Array.from(rooms.entries()).map(([code, room]) => ({ code, live: room.live })),
    });
    discovery.send(reply, rinfo.port, rinfo.address);
  });
  discovery.on('error', (err) => {
    console.error('LAN discovery is off: ' + err.message);
    discovery.close();
  });
  discovery.bind(DISCOVERY_PORT);

  // The WebSocket server re-emits the HTTP server's errors; listen() failures
  // are reported through the promise below, so don't let them crash the app.
  wss.on('error', () => {});

  return new Promise((resolve, reject) => {
    server.once('error', (err) => {
      // Port taken: release everything so the caller can try another port.
      discovery.close();
      wss.close();
      reject(err);
    });
    server.listen(port, () => {
      resolve({
        port,
        close() {
          discovery.close();
          wss.close();
          server.close();
        },
      });
    });
  });
}

module.exports = { start, lanAddresses };

if (require.main === module) {
  start().then(({ port }) => {
    console.log('');
    console.log('  Ayva is running');
    console.log('');
    console.log('  1) On THIS computer open:   http://localhost:' + port + '/share');
    for (const ip of lanAddresses()) {
      console.log('  2) On your TV open:         http://' + ip + ':' + port + '/tv');
    }
    console.log('     or use the Ayva TV app, which finds this computer automatically.');
    console.log('');
    console.log('  For access over the internet, see README.md ("Internet access").');
    console.log('');
  }).catch((err) => {
    console.error(err.code === 'EADDRINUSE' ? 'Port is already in use. Is Ayva already running?' : err);
    process.exit(1);
  });
}
