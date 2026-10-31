// Broadcaster: captures the screen and sends it to every connected viewer
// over its own WebRTC peer connection.

var QUALITY = {
  '1440p60': { width: 2560, height: 1440, fps: 60, bitrate: 15000000 },
  '1440p30': { width: 2560, height: 1440, fps: 30, bitrate: 10000000 },
  '1080p60': { width: 1920, height: 1080, fps: 60, bitrate: 9000000 },
  '1080p30': { width: 1920, height: 1080, fps: 30, bitrate: 6000000 },
  '720p60': { width: 1280, height: 720, fps: 60, bitrate: 5000000 },
  '720p30': { width: 1280, height: 720, fps: 30, bitrate: 3000000 },
};

var config = null;
var stream = null;
var viewers = {}; // viewer id -> RTCPeerConnection or null (joined but not streaming yet)
// Keep the same code across restarts so TVs can reconnect on their own.
var code = storageGet('ayva-code');

var savedQuality = storageGet('ayva-quality');
if (savedQuality && QUALITY[savedQuality]) $('quality').value = savedQuality;

function setStatus(text, isError) {
  $('status').textContent = text;
  $('status').className = 'status' + (isError ? ' error' : '');
}

var revealed = false; // codes shown un-blurred while sharing

function updateUi() {
  var live = !!stream;
  sendToHubs({ type: 'status', live: live });
  if (!live) revealed = false;
  document.body.classList.toggle('live', live);
  document.body.classList.toggle('revealed', revealed);
  $('revealBtn').hidden = !live;
  $('revealBtn').textContent = revealed ? t('hideCode') : t('showCode');
  $('liveBadge').className = 'badge' + (live ? ' live' : '');
  $('liveText').textContent = live ? t('streaming') : t('offline');
  $('startBtn').hidden = live;
  $('stopBtn').hidden = !live;
  $('switchBtn').hidden = !live;
  $('quality').disabled = live;
  $('controlBtn').hidden = !live || !controlSupported;
  $('privacyBtn').hidden = !live || !privacySupported || !(controlOn || deviceControl || privacyOn);
  $('privacyBtn').textContent = t(privacyOn ? 'privacyOff' : 'privacyOn');
  $('privacyBtn').className = privacyOn ? 'danger' : 'secondary';
  $('controlBtn').textContent = controlOn ? t('controlOff') : t('controlOn');
  $('controlBtn').className = controlOn ? 'danger' : 'secondary';
  var canSend = live && fileTargets().length > 0;
  $('sendFileBtn').hidden = !canSend;
  $('sendClipBtn').hidden = !canSend;
  var deviceControl = !controlOn && Object.keys(viewerInfo).some(controlAllowed);
  $('controlHint').hidden = !live || !(controlOn || deviceControl);
  $('controlHint').textContent = t(deviceControl ? 'controlHintDevices' : 'controlHint');
  if (privacyOn && live) {
    $('controlHint').hidden = false;
    $('controlHint').textContent = t('privacyHint');
  }
  $('viewerCount').textContent = Object.keys(viewers).length;
  if (live) setStatus('');
  else if (signal && signal.ws && signal.ws.readyState === WebSocket.OPEN) setStatus(t('notStreaming'));
}

function showCode() {
  $('code').textContent = code || '······';
  var links = $('links');
  links.innerHTML = '';
  if (!code) return;
  var bases = config && config.lanUrls && config.lanUrls.length ? config.lanUrls : [location.origin];
  bases.forEach(function (base) {
    var div = document.createElement('div');
    var span = document.createElement('span');
    span.className = 'link';
    span.textContent = base + '/' + code;
    div.appendChild(span);
    links.appendChild(div);
  });
}

function closePeer(id) {
  if (viewers[id]) viewers[id].close();
  viewers[id] = null;
  delete channels[id];
  delete transfers[id];
  delete receivesFiles[id];
}

// ---- Files and clipboard ----
// To viewers: always allowed (the user here chooses what to send).
// From viewers: only while remote control is on, i.e. only from devices the
// user already trusts with the mouse and keyboard.

var transfers = {}; // viewer id -> Transfer
var receivesFiles = {}; // viewer id -> true if it can save files (not the TV app)
var incomingParts = {}; // browser-only fallback: viewer id -> received chunks

function transferStatus(text) {
  $('transferStatus').textContent = text || '';
}

function fileTargets() {
  return Object.keys(transfers).filter(function (id) { return receivesFiles[id]; });
}

var fileCounter = 0;

// "N files saved to <folder>" with an Open folder button.
function showSavedFolder(result, who) {
  var box = $('transferStatus');
  box.innerHTML = '';
  var text = document.createElement('span');
  text.textContent = t('batchSaved').replace('{who}', who).replace('{count}', result.count)
    .replace('{folder}', result.dir) + ' ';
  var open = document.createElement('button');
  open.className = 'secondary small-btn';
  open.textContent = t('openFolder');
  open.onclick = function () { window.ayva.openFolder(result.dir); };
  box.appendChild(text);
  box.appendChild(open);
  window.ayva.notify(t('batchSavedTitle').replace('{count}', result.count), who, result.dir);
}

function openTransferChannel(id, pc) {
  var dc = pc.createDataChannel('transfer', { ordered: true });
  var who = function () { return deviceLabel(viewerInfo[id]); };
  // Files picked together on the phone arrive as one batch and go into one
  // dated folder; a lone file (older pages) is a batch of its own.
  var batch = null; // { key, total, done }

  function finishBatch(key) {
    window.ayva.batchEnd(key).then(function (result) {
      if (result) showSavedFolder(result, who());
    });
  }

  transfers[id] = new Transfer(dc, {
    message: function (msg) {
      if (msg.t === 'hello') {
        receivesFiles[id] = !!msg.files;
        updateUi();
      } else if (msg.t === 'batch-start') {
        if (!controlAllowed(id)) {
          transfers[id].send({ t: 'refused' });
          return;
        }
        batch = { key: id + ':batch:' + (++fileCounter), total: Number(msg.count) || 0, done: 0 };
      } else if (msg.t === 'batch-end') {
        if (batch && window.ayva) finishBatch(batch.key);
        batch = null;
      } else if (msg.t === 'clip' && typeof msg.text === 'string') {
        if (!controlAllowed(id)) {
          transfers[id].send({ t: 'refused' });
          return;
        }
        var text = msg.text.slice(0, 100000);
        var done = window.ayva ? window.ayva.setClipboard(text) : copyText(text);
        Promise.resolve(done).then(function () {
          transferStatus(t('clipReceived').replace('{who}', who()));
        });
      }
    },
    fileStart: function (meta) {
      meta.localId = id + ':file:' + (++fileCounter);
      meta.batch = batch;
      meta.batchKey = batch ? batch.key : meta.localId;
      meta.accepted = controlAllowed(id);
      if (!meta.accepted) {
        // Inside a batch the refusal was already sent at batch-start.
        if (!batch) transfers[id].send({ t: 'refused' });
        return;
      }
      transferStatus(batch
        ? t('receivingBatch').replace('{who}', who()).replace('{done}', batch.done).replace('{total}', batch.total)
        : t('receiving').replace('{name}', meta.name).replace('{who}', who()));
      if (window.ayva) window.ayva.fileBegin(meta.localId, String(meta.name), Number(meta.size) || 0, meta.batchKey);
      else incomingParts[meta.localId] = [];
    },
    fileChunk: function (meta, buf) {
      if (!meta.accepted) return;
      if (window.ayva) window.ayva.fileChunk(meta.localId, new Uint8Array(buf));
      else incomingParts[meta.localId].push(buf);
    },
    fileEnd: function (meta) {
      if (!meta.accepted) return;
      if (window.ayva) {
        window.ayva.fileEnd(meta.localId).then(function (saved) {
          if (!saved) {
            transferStatus(t('fileFailed').replace('{name}', meta.name));
            return;
          }
          if (meta.batch) {
            meta.batch.done++;
            // Once the batch has ended, the "saved to folder" message stays.
            if (meta.batch === batch) {
              transferStatus(t('receivingBatch').replace('{who}', who())
                .replace('{done}', meta.batch.done).replace('{total}', meta.batch.total));
            }
          } else {
            finishBatch(meta.batchKey); // a lone file: its folder is complete
          }
        });
      } else {
        // Plain browser: offer the file as a download link.
        var blob = new Blob(incomingParts[meta.localId], { type: meta.type || 'application/octet-stream' });
        delete incomingParts[meta.localId];
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = meta.name;
        a.textContent = meta.name;
        $('transferStatus').innerHTML = '';
        $('transferStatus').appendChild(a);
      }
    },
  });
  dc.onclose = function () {
    if (transfers[id] && transfers[id].dc === dc) {
      delete transfers[id];
      delete receivesFiles[id];
      updateUi();
      // The page on the other side was closed: no need to wait for a timeout.
      if (orphaned[id]) viewerLeft(id);
    }
  };
}

function sendFiles(files) {
  var targets = fileTargets();
  if (!targets.length || !files.length) return;
  Array.prototype.forEach.call(files, function (file) {
    targets.forEach(function (id) {
      transfers[id].sendFile(file, function (fraction) {
        transferStatus(t('sending').replace('{name}', file.name) + ' ' + Math.round(fraction * 100) + '%');
      }).then(function () {
        transferStatus(t('sent').replace('{name}', file.name));
      }).catch(function () {
        transferStatus(t('fileFailed').replace('{name}', file.name));
      });
    });
  });
}

function sendClipboard() {
  var read = window.ayva ? window.ayva.getClipboard() : navigator.clipboard.readText();
  Promise.resolve(read).then(function (text) {
    if (!text) {
      transferStatus(t('clipEmpty'));
      return;
    }
    fileTargets().forEach(function (id) { transfers[id].send({ t: 'clip', text: text.slice(0, 100000) }); });
    transferStatus(t('clipSent'));
  }).catch(function () { transferStatus(t('clipEmpty')); });
}

// ---- Remote control ----
// Each viewer gets a "control" data channel. Its messages are handed to the
// desktop app, which turns them into mouse/keyboard input, but only while the
// user has switched control on here, or for remembered devices the user marked
// "can control" (while sharing). Off by default, and on every restart.
// Ctrl+Alt+K stops both until sharing starts again.

var channels = {}; // viewer id -> RTCDataChannel
var controlSupported = false;
var controlOn = false; // the Allow control button: every viewer
var controlPaused = false; // Ctrl+Alt+K also holds back "can control" devices
var absolutePointer = false; // a whole screen is shared, so taps can point at a spot
var lastInput = {}; // viewer id -> time of the last control message

if (window.ayva && window.ayva.controlSupported) {
  window.ayva.controlSupported().then(function (ok) {
    controlSupported = !!ok;
    applyControl();
  });
  window.ayva.onControlForcedOff(function () {
    controlOn = false;
    controlPaused = true;
    applyControl();
  });
}

function controlAllowed(id) {
  return controlOn || (controlSupported && !!stream && !controlPaused && deviceRight(id, 'canControl'));
}

function controlState(id) {
  return JSON.stringify({ t: 'state', enabled: controlAllowed(id), absolute: absolutePointer });
}

function broadcastControlState() {
  Object.keys(channels).forEach(function (id) {
    var dc = channels[id];
    if (dc.readyState === 'open') dc.send(controlState(id));
  });
}

function setControl(on) {
  if (!controlSupported) return;
  controlOn = !!on;
  if (controlOn) controlPaused = false;
  applyControl();
}

// The desktop app takes input while anyone here may control; which viewer
// that is gets checked per message below.
function applyControl() {
  if (!controlSupported) {
    updateUi();
    renderDevices();
    return;
  }
  var needed = Object.keys(viewerInfo).some(controlAllowed) || controlOn;
  window.ayva.setControl(needed).then(function (enabled) {
    if (!enabled) controlOn = false;
    // Dark screens only make sense while someone is using the computer.
    if (privacyOn && !controlOn && !Object.keys(viewerInfo).some(controlAllowed)) setPrivacy(false);
    broadcastControlState();
    broadcastCaps();
    dropUnallowedMics();
    updateUi();
    renderDevices();
  });
}

function openControlChannel(id, pc) {
  var dc = pc.createDataChannel('control', { ordered: true });
  channels[id] = dc;
  dc.onopen = function () { dc.send(controlState(id)); };
  dc.onmessage = function (e) {
    if (!controlAllowed(id)) return;
    var msg;
    try { msg = JSON.parse(e.data); } catch (err) { return; }
    lastInput[id] = Date.now();
    window.ayva.sendControl(msg);
  };
}

function applyBitrate(pc) {
  var q = QUALITY[$('quality').value];
  pc.getSenders().forEach(function (sender) {
    if (!sender.track) return;
    var params = sender.getParameters();
    if (!params.encodings || !params.encodings.length) params.encodings = [{}];
    var enc = params.encodings[0];
    if (sender.track.kind === 'video') {
      enc.maxBitrate = q.bitrate;
      enc.maxFramerate = q.fps;
    } else {
      // Sound breaking up is far more noticeable than a softer picture,
      // so audio gets first claim on the network.
      enc.maxBitrate = 256000;
      enc.priority = 'high';
      enc.networkPriority = 'high';
    }
    sender.setParameters(params).catch(function () {});
  });
}

var connectSeq = {}; // viewer id -> latest connectViewer call, so a slow one is dropped

function connectViewer(id) {
  closePeer(id);
  if (!stream) return;
  var seq = connectSeq[id] = (connectSeq[id] || 0) + 1;
  // Viewers over the internet first get their backup-route credentials.
  turnFor(id).then(function (creds) {
    if (connectSeq[id] === seq && stream && viewerInfo[id]) openPeer(id, creds);
  });
}

function openPeer(id, creds) {
  var pc = new RTCPeerConnection(peerConfig(creds));
  viewers[id] = pc;
  if (creds) sendIce(id, creds);

  // Audio and video go out as separate streams so the TV doesn't lip-sync
  // them: on a slow decoder, syncing makes it stretch the sound to wait for
  // late frames, which is heard as crackling.
  stream.getVideoTracks().forEach(function (track) { pc.addTrack(track, new MediaStream([track])); });
  var sound = outgoingAudio();
  if (sound) pc.addTrack(sound, new MediaStream([sound]));
  if (controlSupported) openControlChannel(id, pc);
  openTransferChannel(id, pc);

  pc.onconnectionstatechange = function () {
    // A viewer we only know through its direct connection is gone once that ends.
    if (orphaned[id] && viewers[id] === pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed')) {
      viewerLeft(id);
    }
  };

  pc.onicecandidate = function (e) {
    if (e.candidate) viaSignal(id).send({ type: 'signal', to: id, data: { kind: 'candidate', candidate: e.candidate } });
  };

  pc.createOffer()
    .then(function (offer) {
      return pc.setLocalDescription({ type: offer.type, sdp: tuneOpus(offer.sdp) });
    })
    .then(function () {
      viaSignal(id).send({ type: 'signal', to: id, data: { kind: 'offer', sdp: pc.localDescription } });
    })
    .catch(function (err) { console.error('offer failed', err); });
}

// ---- Per-viewer playback stats (reported by each TV every 2 s) ----

var viewerStats = {};
var senderStats = {}; // viewer id -> this computer's capture/encode stats for that TV
var lastSender = {};

function sampleSenders() {
  Object.keys(viewers).forEach(function (id) {
    var peer = viewers[id];
    if (!peer || peer.connectionState !== 'connected') return;
    peer.getStats().then(function (report) {
      countRelay(id, report);
      var now = { out: null, source: null, codecs: {} };
      report.forEach(function (r) {
        if (r.type === 'outbound-rtp' && r.kind === 'video') now.out = r;
        else if (r.type === 'media-source' && r.kind === 'video') now.source = r;
        else if (r.type === 'codec') now.codecs[r.id] = r.mimeType;
      });
      var prev = lastSender[id];
      lastSender[id] = now;
      if (!prev || !now.out || !prev.out) return;
      var o = now.out;
      var seconds = (o.timestamp - prev.out.timestamp) / 1000 || 2;
      senderStats[id] = {
        captureFps: now.source ? now.source.framesPerSecond || 0 : 0,
        encodeFps: o.framesPerSecond || 0,
        width: o.frameWidth || 0,
        height: o.frameHeight || 0,
        mbps: (8 * (o.bytesSent - prev.out.bytesSent)) / seconds / 1e6,
        limit: o.qualityLimitationReason || 'none',
        encoder: o.encoderImplementation || '',
        encodeMs: o.framesEncoded > prev.out.framesEncoded
          ? (1000 * (o.totalEncodeTime - prev.out.totalEncodeTime)) / (o.framesEncoded - prev.out.framesEncoded)
          : 0,
      };
    }).catch(function () {});
  });
}

setInterval(sampleSenders, 2000);

function fmt(value, digits, unit, isBad) {
  return mark(value.toFixed(digits) + unit, isBad);
}

function mark(html, isBad) {
  return isBad ? '<span class="bad">' + html + '</span>' : html;
}

function renderStats() {
  var ids = Object.keys(viewerStats).filter(function (id) { return id in viewers; });
  $('statsPanel').hidden = !stream || !ids.length;
  $('stats').innerHTML = ids.map(function (id) {
    var s = viewerStats[id];
    var title = '<b>' + escapeHtml(deviceLabel(viewerInfo[id])) + '</b>';
    if (controlAllowed(id) && lastInput[id] && Date.now() - lastInput[id] < 3000) title += ' · ' + mark(t('controlling'), true);
    var parts = [title];
    var snd = senderStats[id];
    if (snd) {
      var targetFps = QUALITY[$('quality').value].fps;
      parts.push(t('statSend') + ': ' + t('statCapture') + ' ' + fmt(snd.captureFps, 0, ' fps', snd.captureFps < targetFps * 0.8)
        + ' · ' + t('statEncode') + ' ' + fmt(snd.encodeFps, 0, ' fps', snd.encodeFps < targetFps * 0.8)
        + ' ' + snd.width + 'x' + snd.height
        + ' · ' + fmt(snd.encodeMs, 1, ' ms', snd.encodeMs > 1000 / targetFps * 0.7)
        + ' · ' + fmt(snd.mbps, 1, ' Mbps', false)
        + ' · ' + t('statLimit') + ' ' + mark(escapeHtml(t('limit_' + snd.limit)), snd.limit !== 'none')
        + (snd.encoder ? ' (' + escapeHtml(snd.encoder) + ')' : ''));
    }
    if (s.video) {
      var v = s.video;
      var frameBudget = v.fps > 0 ? 1000 / v.fps : 33;
      var codec = (v.codec || '').replace(/^video\//, '') + (v.decoder ? ' (' + v.decoder + ')' : '');
      parts.push(t('statVideo') + ': ' + escapeHtml(codec) + ' ' + v.width + 'x' + v.height + ' '
        + fmt(v.fps, 0, ' fps', false) + ' · ' + t('statDecode') + ' '
        + fmt(v.decodeMs, 1, ' ms', v.decodeMs > frameBudget * 0.7) + ' · ' + t('statDropped') + ' '
        + fmt(v.dropped, 0, '', v.dropped > 2));
      if (v.receivedFps != null) {
        parts.push(t('statVideoNet') + ': ' + t('statArriving') + ' ' + fmt(v.receivedFps, 0, ' fps', false)
          + ' · ' + t('statFreezes') + ' ' + fmt(v.freezes, 0, '', v.freezes > 0)
          + (v.freezeMs > 0 ? ' (' + fmt(v.freezeMs, 0, ' ms', true) + ')' : '')
          + ' · jitter ' + fmt(v.jitterMs, 0, ' ms', v.jitterMs > 30));
      }
    }
    if (s.pacing) {
      var pace = s.pacing;
      parts.push(t('statPacing') + ': ' + t('statFrameGap') + ' ' + fmt(pace.medianMs, 0, ' ms', false)
        + ' · ' + t('statHitches') + ' ' + fmt(pace.hitches, 0, '/' + pace.frames, pace.hitches > pace.frames * 0.05)
        + ' · ' + t('statLongest') + ' ' + fmt(pace.maxMs, 0, ' ms', pace.maxMs > pace.medianMs * 3));
    }
    if (s.audio) {
      var a = s.audio;
      parts.push(t('statAudio') + ': ' + t('statLoss') + ' ' + fmt(a.lossPct, 1, '%', a.lossPct > 1)
        + ' · ' + t('statConcealed') + ' ' + fmt(a.concealedPct, 1, '%', a.concealedPct > 1)
        + ' · ' + t('statStretch') + ' ' + fmt(a.stretchPct, 1, '%', a.stretchPct > 2)
        + ' · jitter ' + fmt(a.jitterMs, 0, ' ms', a.jitterMs > 30));
    }
    if (s.playout) {
      var p = s.playout;
      var line = t('statPlayout') + ': ' + (p.path === 'webaudio' ? 'Web Audio' : t('statElement'));
      if (p.rate) line += ' · ' + p.rate + ' Hz';
      if (p.latencyMs) line += ' · ' + t('statBuffer') + ' ' + fmt(p.latencyMs, 0, ' ms', false);
      if (p.gapPct != null) line += ' · ' + t('statGaps') + ' ' + fmt(p.gapPct, 1, '%', p.gapPct > 0.5);
      parts.push(line);
    }
    if (s.rttMs != null) parts.push(t('statDelay') + ': ' + fmt(s.rttMs, 0, ' ms', s.rttMs > 100));
    return '<div class="stat-row">' + parts.join('<br>') + '</div>';
  }).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function handleViewerSignal(id, data) {
  if (!data) return;
  if (data.kind === 'stats') {
    if (data.stats && typeof data.stats === 'object') viewerStats[id] = data.stats;
    renderStats();
    return;
  }
  if (data.kind === 'request') {
    connectViewer(id);
    return;
  }
  if (data.kind === 'pin') {
    checkPin(id, data.hash);
    return;
  }
  if (data.kind === 'privacy') {
    if (mayPrivacy(id)) setPrivacy(!!data.on, id);
    else sendCaps(id);
    return;
  }
  if (data.kind === 'pick-screen') {
    pickScreen(id, data.id);
    return;
  }
  if (data.kind === 'start-share' || data.kind === 'stop-share') {
    remoteShare(id, data.kind === 'start-share');
    return;
  }
  if (data.kind === 'recording') {
    noteRecording(id, !!data.on);
    return;
  }
  if (data.kind === 'mic-offer') {
    micOffer(id, data.sdp);
    return;
  }
  if (data.kind === 'mic-candidate') {
    if (mics[id]) addCandidate(mics[id].pc, data.candidate);
    return;
  }
  if (data.kind === 'mic-stop') {
    closeMic(id);
    return;
  }
  var pc = viewers[id];
  if (!pc) return;
  if (data.kind === 'answer') {
    pc.setRemoteDescription(data.sdp)
      .then(function () { applyBitrate(pc); })
      .catch(function (err) { console.error('answer failed', err); });
  } else if (data.kind === 'candidate') {
    pc.addIceCandidate(data.candidate).catch(function () {});
  }
}

// ---- Devices: approval, list, kick ----
// Every new viewer is first a request. Remembered devices, and devices already
// approved since the app started, are let in by themselves; anything else
// waits until the user says yes here.

var viewerInfo = {}; // viewer id -> { name, deviceId, remote }
var requests = []; // waiting viewer-request messages
var approvedThisRun = {}; // deviceId -> true
var trusted = loadTrusted(); // remembered devices: [{ id, name }]
var askApproval = storageGet('ayva-ask-approval') !== '0';
$('askApproval').checked = askApproval;

function loadTrusted() {
  try {
    var list = JSON.parse(storageGet('ayva-trusted') || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function saveTrusted() {
  storageSet('ayva-trusted', JSON.stringify(trusted));
}

function trustedEntry(deviceId) {
  if (!deviceId) return null;
  for (var i = 0; i < trusted.length; i++) if (trusted[i].id === deviceId) return trusted[i];
  return null;
}

// Remembered and holding a device key. Devices remembered before keys existed
// stay listed but are asked about again, and get a key then.
function isTrusted(deviceId) {
  var d = trustedEntry(deviceId);
  return !!d && !!d.key;
}

// Names the user gave devices here ("Ahmet's phone"), by device id. They win
// over the name a device reports about itself ("Android Phone").
var deviceNames = loadDeviceNames();

function loadDeviceNames() {
  try {
    var map = JSON.parse(storageGet('ayva-device-names') || '{}');
    return map && typeof map === 'object' ? map : {};
  } catch (e) {
    return {};
  }
}

function setDeviceName(deviceId, name) {
  if (!deviceId) return;
  var clean = String(name || '').trim().slice(0, 40);
  if (clean) deviceNames[deviceId] = clean;
  else delete deviceNames[deviceId]; // empty: back to the device's own name
  storageSet('ayva-device-names', JSON.stringify(deviceNames));
  renderDevices();
  renderStats();
}

function deviceLabel(info) {
  return (info && info.deviceId && deviceNames[info.deviceId]) || (info && info.name) || t('unknownDevice');
}

function handleViewerRequest(req) {
  var known = req.deviceId && (isTrusted(req.deviceId) || approvedThisRun[req.deviceId]);
  if (!askApproval || known) {
    viaSignal(req.id).send({ type: 'approve', id: req.id });
    return;
  }
  requests.push(req);
  if (requests.length === 1) showNextRequest();
}

function showNextRequest() {
  var req = requests[0];
  $('approval').hidden = !req;
  if (!req) return;
  $('approvalText').textContent = (req.name || t('unknownDevice')) + ' · ' + t(req.remote ? 'viaInternet' : 'viaLan');
  $('approvalName').value = deviceLabel(req);
  $('approvalName').disabled = !req.deviceId;
  $('approvalRemember').checked = true;
  if (window.ayva && window.ayva.notify) window.ayva.notify(t('approvalTitle'), deviceLabel(req));
}

function answerRequest(approved) {
  var req = requests.shift();
  if (req) {
    if (approved) {
      var given = $('approvalName').value.trim();
      if (req.deviceId && given && given !== deviceLabel(req)) setDeviceName(req.deviceId, given);
      // Bound to the device's key once it proves itself (see checkProof).
      if (req.deviceId) {
        approvedThisRun[req.deviceId] = approvedThisRun[req.deviceId] || true;
        if ($('approvalRemember').checked && !isTrusted(req.deviceId)) rememberOnProof[req.deviceId] = deviceLabel(req);
      }
      viaSignal(req.id).send({ type: 'approve', id: req.id });
      logEvent('allowed', req);
    } else {
      viaSignal(req.id).send({ type: 'reject', id: req.id });
      logEvent('denied', req);
    }
  }
  showNextRequest();
  renderDevices();
}

// ---- Device keys ----
// A device id alone can be overheard or copied, so every viewer that gets in
// is first sent a one-time challenge and must sign it with its device key
// (devicekey.js). Nothing (picture, rights) reaches it before that. A device
// that was remembered or let in this run with a key must use the same key;
// one that fails is cut off and the user is told.

var proving = {}; // viewer id -> { msg, sig, nonce, timer }
var rememberOnProof = {}; // deviceId -> name: remember it once it shows a key
var PROOF_TIMEOUT_MS = 15000;

function randomHex(bytes) {
  return Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(bytes)), function (b) {
    return ('0' + b.toString(16)).slice(-2);
  }).join('');
}

function fromBase64(text) {
  var s = atob(text);
  var bytes = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

function startProof(msg, sig) {
  var nonce = randomHex(24);
  proving[msg.id] = {
    msg: msg,
    sig: sig,
    nonce: nonce,
    timer: setTimeout(function () { failProof(msg.id); }, PROOF_TIMEOUT_MS),
  };
  sig.send({ type: 'signal', to: msg.id, data: { kind: 'prove', nonce: nonce } });
}

function verifySignature(key, sig, origin, nonce) {
  if (typeof key !== 'string' || typeof sig !== 'string' || !crypto.subtle) return Promise.resolve(false);
  var algo = { name: 'ECDSA', namedCurve: 'P-256' };
  return crypto.subtle.importKey('spki', fromBase64(key), algo, false, ['verify']).then(function (k) {
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, fromBase64(sig),
      new TextEncoder().encode('ayva-device-proof:' + origin + ':' + nonce));
  }).catch(function () { return false; });
}

function originOf(url) {
  try { return new URL(url).origin.toLowerCase(); } catch (e) { return null; }
}

// A proof names the address the device was looking at. Only this computer's
// own addresses count: over the internet the fixed address or the current
// internet link, at home this computer's own server. A proof signed for a
// page anywhere else (a lookalike someone sent) is refused.
function proofOriginOk(origin, remote) {
  if (typeof origin !== 'string' || origin.length > 200) return false;
  var o = origin.toLowerCase();
  if (originOf(o) !== o) return false;
  if (remote) {
    return (!!cloudInfo && o === originOf(cloudInfo.url)) || (!!internet.url && o === originOf(internet.url));
  }
  var own = ((config && config.lanUrls) || []).map(originOf);
  own.push(originOf(location.origin), originOf('http://127.0.0.1:' + location.port));
  return own.indexOf(o) >= 0;
}

function checkProof(id, data) {
  var p = proving[id];
  if (!p) return;
  var deviceId = p.msg.deviceId;
  var entry = trustedEntry(deviceId);
  // The key this device must show, if one is known for it.
  var expected = (entry && entry.key) || (typeof approvedThisRun[deviceId] === 'string' ? approvedThisRun[deviceId] : null);
  var hasKey = typeof data.key === 'string' && data.key.length < 400;
  // A page from before proofs named their address (open since Ayva was
  // updated): refused, but it only needs reloading, so no alarm.
  if (hasKey && data.origin === undefined) {
    clearTimeout(p.timer);
    delete proving[id];
    transferStatus(t('proofOutdated').replace('{who}', deviceLabel(p.msg)));
    p.sig.send({ type: 'kick', id: id });
    return;
  }
  var check = hasKey && proofOriginOk(data.origin, !!p.msg.remote)
    ? verifySignature(data.key, data.sig, data.origin, p.nonce) : Promise.resolve(false);
  check.then(function (valid) {
    if (proving[id] !== p) return;
    if (expected ? !(valid && data.key === expected) : hasKey && !valid) {
      failProof(id);
      return;
    }
    clearTimeout(p.timer);
    delete proving[id];
    if (deviceId && valid) {
      if (approvedThisRun[deviceId]) approvedThisRun[deviceId] = data.key;
      if (deviceId in rememberOnProof) {
        if (entry) entry.key = data.key;
        else trusted.push({ id: deviceId, name: rememberOnProof[deviceId], key: data.key });
        saveTrusted();
      }
    } else if (deviceId in rememberOnProof) {
      transferStatus(t('cannotRemember').replace('{who}', deviceLabel(p.msg)));
    }
    delete rememberOnProof[deviceId];
    viewerAdmitted(p.msg, p.sig, p.nonce);
  });
}

// Wrong key, or no answer: the device is not who it says it is.
function failProof(id) {
  var p = proving[id];
  if (!p) return;
  clearTimeout(p.timer);
  delete proving[id];
  var text = t('proofFailed').replace('{who}', deviceLabel(p.msg));
  transferStatus(text);
  logEvent('proofFailed', p.msg);
  if (window.ayva && window.ayva.notify) window.ayva.notify(text, '');
  p.sig.send({ type: 'kick', id: id });
}

// The requester gave up (closed the page) before an answer.
function dropRequest(id) {
  var wasFirst = requests.length && requests[0].id === id;
  requests = requests.filter(function (r) { return r.id !== id; });
  if (wasFirst) showNextRequest();
}

function kick(id) {
  var info = viewerInfo[id];
  if (info && info.deviceId) delete approvedThisRun[info.deviceId];
  if (info) logEvent('kicked', info);
  viaSignal(id).send({ type: 'kick', id: id });
  // Also cut the direct connection, which works even without the server.
  viewerLeft(id);
}

function forget(deviceId) {
  trusted = trusted.filter(function (d) { return d.id !== deviceId; });
  delete approvedThisRun[deviceId];
  saveTrusted();
  renderDevices();
  broadcastCaps();
  applyControl();
}

// One line in a device list. deviceId (optional) adds a rename button that
// turns the name into a text field in place.
function deviceRow(label, tags, buttonText, onClick, deviceId) {
  var row = document.createElement('div');
  row.className = 'device';
  var name = document.createElement('div');
  name.className = 'device-name';
  name.textContent = label;
  tags.forEach(function (tag) {
    var span = document.createElement('span');
    span.className = 'tag' + (tag.cls ? ' ' + tag.cls : '');
    span.textContent = tag.text;
    name.appendChild(span);
  });
  row.appendChild(name);

  var actions = document.createElement('div');
  actions.className = 'row';
  if (deviceId) {
    var edit = document.createElement('button');
    edit.className = 'secondary small-btn';
    edit.textContent = '✎';
    edit.title = t('rename');
    edit.setAttribute('aria-label', t('rename'));
    edit.onclick = function () { startRename(row, name, actions, label, deviceId); };
    actions.appendChild(edit);
  }
  var b = document.createElement('button');
  b.className = 'secondary small-btn';
  b.textContent = buttonText;
  b.onclick = onClick;
  actions.appendChild(b);
  row.appendChild(actions);
  return row;
}

function startRename(row, name, actions, current, deviceId) {
  var input = document.createElement('input');
  input.className = 'rename-input';
  input.value = current;
  input.maxLength = 40;
  input.placeholder = t('renamePlaceholder');
  var save = document.createElement('button');
  save.className = 'small-btn';
  save.textContent = t('save');
  var done = function () { setDeviceName(deviceId, input.value); };
  save.onclick = done;
  input.onkeydown = function (e) {
    if (e.key === 'Enter') done();
    else if (e.key === 'Escape') renderDevices();
  };
  row.replaceChild(input, name);
  actions.innerHTML = '';
  actions.appendChild(save);
  input.focus();
  input.select();
}

function renderDevices() {
  var list = $('devices');
  list.innerHTML = '';
  var ids = Object.keys(viewerInfo);
  if (!ids.length) {
    var empty = document.createElement('div');
    empty.className = 'muted small';
    empty.textContent = t('noDevices');
    list.appendChild(empty);
  }
  ids.forEach(function (id) {
    var info = viewerInfo[id];
    var tags = [{ text: t(info.remote ? 'viaInternet' : 'viaLan'), cls: info.remote ? 'net' : '' }];
    if (isTrusted(info.deviceId)) tags.push({ text: t('remembered') });
    if (canRemoteStart(id)) tags.push({ text: t('canStartTag') });
    if (!controlOn && controlAllowed(id)) tags.push({ text: t('controlTag'), cls: 'alert' });
    if (info.recording) tags.push({ text: t('recordingTag'), cls: 'alert' });
    if (mics[id]) tags.push({ text: t('talkingTag'), cls: 'alert' });
    if (info.relayed) tags.push({ text: t('relayTag'), cls: 'net' });
    list.appendChild(deviceRow(deviceLabel(info), tags, t('kick'), function () { kick(id); }, info.deviceId));
  });

  $('trustedWrap').hidden = !trusted.length;
  var tl = $('trusted');
  tl.innerHTML = '';
  trusted.forEach(function (d) {
    var tags = d.key ? (d.pin ? [{ text: t('pinTag') }] : []) : [{ text: t('needsReapproval'), cls: 'alert' }];
    var row = deviceRow(deviceNames[d.id] || d.name, tags, t('forget'), function () { forget(d.id); }, d.id);
    if (d.key) {
      var actions = row.querySelector('.row');
      var pinBtn = document.createElement('button');
      pinBtn.className = 'secondary small-btn';
      pinBtn.textContent = 'PIN';
      pinBtn.title = t('pinHint');
      pinBtn.onclick = function () { startPinEdit(row, d); };
      actions.prepend(pinBtn);
      if (controlSupported) actions.prepend(permissionBox(d, 'canControl'));
      if (window.ayva && window.ayva.remoteStart) actions.prepend(permissionBox(d, 'canStart'));
    }
    tl.appendChild(row);
  });
}

// A per-device permission tick box: 'canStart' or 'canControl'.
function permissionBox(d, key) {
  var label = document.createElement('label');
  label.className = 'row small';
  label.style.gap = '6px';
  label.title = t(key + 'Hint');
  var box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = !!d[key];
  box.onchange = function () { setPermission(d.id, key, box.checked); };
  var text = document.createElement('span');
  text.textContent = t(key);
  label.appendChild(box);
  label.appendChild(text);
  return label;
}

function setPermission(deviceId, key, on) {
  trusted.forEach(function (d) { if (d.id === deviceId) d[key] = !!on; });
  saveTrusted();
  renderDevices();
  broadcastCaps();
  applyControl();
}

// ---- Starting and stopping from a remembered device (desktop app) ----
// Off for every device. The user ticks it here per remembered device (never
// for one merely let in this time); that device can then start sharing the
// main screen and stop it. Each time, this computer shows a notification.

// A right ticked for a remembered (keyed) device, unlocked by its PIN if it has one.
function deviceRight(id, right) {
  var info = viewerInfo[id];
  var d = info && isTrusted(info.deviceId) ? trustedEntry(info.deviceId) : null;
  return !!d && !!d[right] && (!d.pin || info.pinOk);
}

function canRemoteStart(id) {
  return !!(window.ayva && window.ayva.remoteStart) && deviceRight(id, 'canStart');
}

// Tells a viewer whether to offer the start/stop buttons, or to ask for the PIN.
function sendCaps(id) {
  var info = viewerInfo[id];
  var d = info && isTrusted(info.deviceId) ? trustedEntry(info.deviceId) : null;
  var pinNeeded = !!d && !!d.pin && !info.pinOk && !!(d.canStart || d.canControl);
  var pick = mayPickScreen(id) && screens.length > 1;
  viaSignal(id).send({ type: 'signal', to: id, data: {
    kind: 'caps',
    remoteStart: canRemoteStart(id),
    pinNeeded: pinNeeded,
    pinSalt: pinNeeded ? d.pin.salt : undefined,
    privacy: privacyOn,
    mayPrivacy: mayPrivacy(id),
    screens: pick ? screens.map(function (s, i) { return { id: s.id, name: screenLabel(s, i) }; }) : [],
    screen: pick ? currentSource : null,
  } });
}

// ---- PIN ----
// Optional, per remembered device. The device then has to enter it on each
// connection before its rights apply, so a stolen unlocked phone is not
// enough. Stored here as a salted hash; the device sends a hash bound to this
// connection's challenge. Five wrong tries lock the device out for 15 minutes.

var PIN_MAX_TRIES = 5;
var PIN_LOCK_MS = 15 * 60 * 1000;
var pinFails = {}; // deviceId -> { count, until }

function sha256Hex(text) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  });
}

function setPin(deviceId, pin) {
  var d = trustedEntry(deviceId);
  if (!d) return;
  var clean = String(pin || '').trim();
  var done = function () {
    saveTrusted();
    Object.keys(viewerInfo).forEach(function (id) {
      if (viewerInfo[id].deviceId === deviceId) viewerInfo[id].pinOk = false;
    });
    renderDevices();
    broadcastCaps();
    applyControl();
  };
  if (!clean) {
    delete d.pin;
    done();
    return;
  }
  var salt = randomHex(16);
  sha256Hex(salt + ':' + clean).then(function (hash) {
    d.pin = { salt: salt, hash: hash };
    done();
  });
}

function checkPin(id, hash) {
  var info = viewerInfo[id];
  var d = info && isTrusted(info.deviceId) ? trustedEntry(info.deviceId) : null;
  if (!d || !d.pin || info.pinOk || typeof hash !== 'string') return;
  var fails = pinFails[info.deviceId];
  var reply = function (data) { viaSignal(id).send({ type: 'signal', to: id, data: data }); };
  if (fails && fails.until > Date.now()) {
    reply({ kind: 'pin-result', ok: false, locked: true });
    return;
  }
  sha256Hex(info.nonce + ':' + d.pin.hash).then(function (expected) {
    if (!viewerInfo[id]) return;
    if (hash === expected) {
      delete pinFails[info.deviceId];
      info.pinOk = true;
      reply({ kind: 'pin-result', ok: true });
      sendCaps(id);
      applyControl();
      return;
    }
    if (!fails || fails.until) fails = { count: 0, until: 0 }; // a lock that ran out starts over
    pinFails[info.deviceId] = fails;
    fails.count++;
    var locked = fails.count >= PIN_MAX_TRIES;
    if (locked) {
      fails.until = Date.now() + PIN_LOCK_MS;
      fails.count = 0;
      var text = t('pinLockedHost').replace('{who}', deviceLabel(info));
      transferStatus(text);
      if (window.ayva && window.ayva.notify) window.ayva.notify(text, '');
    }
    logEvent(locked ? 'pinLocked' : 'pinWrong', info);
    reply({ kind: 'pin-result', ok: false, locked: locked });
  });
}

function startPinEdit(row, d) {
  var input = document.createElement('input');
  input.className = 'rename-input';
  input.type = 'password';
  input.inputMode = 'numeric';
  input.maxLength = 8;
  input.placeholder = t('pinPlaceholder');
  var save = document.createElement('button');
  save.className = 'small-btn';
  save.textContent = t('save');
  var done = function () {
    var pin = input.value.trim();
    if (pin && !/^\d{4,8}$/.test(pin)) {
      input.value = '';
      input.placeholder = t('pinRule');
      return;
    }
    setPin(d.id, pin);
  };
  save.onclick = done;
  input.onkeydown = function (e) {
    if (e.key === 'Enter') done();
    else if (e.key === 'Escape') renderDevices();
  };
  var actions = row.querySelector('.row');
  actions.innerHTML = '';
  actions.appendChild(input);
  actions.appendChild(save);
  if (d.pin) {
    var remove = document.createElement('button');
    remove.className = 'secondary small-btn';
    remove.textContent = t('pinRemove');
    remove.onclick = function () { setPin(d.id, ''); };
    actions.appendChild(remove);
  }
  input.focus();
}

function broadcastCaps() {
  Object.keys(viewerInfo).forEach(sendCaps);
}

function remoteShare(id, start) {
  if (!canRemoteStart(id)) {
    sendCaps(id);
    return;
  }
  var who = deviceLabel(viewerInfo[id]);
  if (!start) {
    if (!stream) return;
    logEvent('remoteStop', viewerInfo[id]);
    stopSharing();
    transferStatus(t('remoteStopped').replace('{who}', who));
    window.ayva.notify(t('remoteStopped').replace('{who}', who), '');
    return;
  }
  // Already live, or the user is picking a screen right now.
  if (stream || !$('picker').hidden) return;
  var info = viewerInfo[id];
  window.ayva.remoteStart($('pickerAudio').checked).then(function (result) {
    logEvent(result && result.ok ? 'remoteStart' : 'remoteFailed', info);
    if (result && result.ok) currentSource = result.sourceId;
    var text = result && result.ok ? t('remoteStarted').replace('{who}', who)
      : t('remoteStartFailed').replace('{who}', who) + (result && result.error ? result.error : '');
    transferStatus(text);
    window.ayva.notify(text, '');
  });
}

// Called by the desktop app (with a user gesture) after it picked the main screen.
function remoteCapture(absolute) {
  absolutePointer = !!absolute;
  return Promise.resolve(capture()).then(function () { return !!stream; });
}

// ---- Privacy mode and choosing the screen ----
// A device that may use this computer can darken its screens here (the stream
// goes on; see setPrivacy in desktop/main.js) and pick which screen is shared.

var privacySupported = false;
var privacyOn = false;
var screens = []; // [{ id, primary, size }] left to right, while sharing
var currentSource = null;

function mayPrivacy(id) {
  return privacySupported && !!stream && controlAllowed(id);
}

function mayPickScreen(id) {
  return !!stream && (canRemoteStart(id) || controlAllowed(id));
}

function screenLabel(s, i) {
  return t('screenName').replace('{n}', i + 1) + (s.primary ? ' (' + t('screenMain') + ')' : '') + (s.size ? ' · ' + s.size : '');
}

function setPrivacy(on, byId) {
  if (!window.ayva || !window.ayva.setPrivacy) return;
  window.ayva.setPrivacy(on).then(function (state) {
    var changed = privacyOn !== !!state;
    privacyOn = !!state;
    if (changed && privacyOn && byId && viewerInfo[byId]) {
      var text = t('privacyByDevice').replace('{who}', deviceLabel(viewerInfo[byId]));
      transferStatus(text);
      window.ayva.notify(text, '');
      logEvent('privacy', viewerInfo[byId]);
    }
    updateUi();
    broadcastCaps();
  });
}

function refreshScreens() {
  if (!window.ayva || !window.ayva.listScreens || !stream) {
    screens = [];
    return;
  }
  window.ayva.listScreens().then(function (list) {
    screens = list || [];
    broadcastCaps();
  });
}

function pickScreen(id, sourceId) {
  var index = -1;
  screens.forEach(function (s, i) { if (s.id === sourceId) index = i; });
  if (!mayPickScreen(id) || index < 0 || sourceId === currentSource) {
    sendCaps(id);
    return;
  }
  var info = viewerInfo[id];
  var name = screenLabel(screens[index], index);
  window.ayva.remoteStart(null, sourceId).then(function (result) {
    if (result && result.ok) {
      currentSource = result.sourceId;
      transferStatus(t('screenSwitched').replace('{who}', deviceLabel(info)).replace('{screen}', name));
      logEvent('screen', info, 0, name);
    }
    broadcastCaps();
  });
}

if (window.ayva && window.ayva.privacySupported) {
  window.ayva.privacySupported().then(function (ok) {
    privacySupported = !!ok;
    updateUi();
  });
  window.ayva.onPrivacyForcedOff(function () {
    privacyOn = false;
    updateUi();
    broadcastCaps();
  });
  $('privacyBtn').onclick = function () { setPrivacy(!privacyOn); };
}

// ---- Recording on a viewer ----
// A phone can record the stream on its own; it tells us, so the user here can
// see who is recording.

function noteRecording(id, on) {
  var info = viewerInfo[id];
  if (!info || !!info.recording === on) return;
  info.recording = on;
  renderDevices();
  if (on) logEvent('recording', info);
  if (on && window.ayva) window.ayva.notify(t('recordingTitle'), deviceLabel(info));
}

// ---- Microphone from a viewer ----
// A phone can talk through this computer's speakers over a connection of its
// own. Accepted from remembered devices, or from any device while remote
// control is on, and only while sharing.

var mics = {}; // viewer id -> { pc, audio }

function micAllowed(id) {
  var info = viewerInfo[id];
  return !!stream && !!info && (controlAllowed(id) || isTrusted(info.deviceId));
}

function micOffer(id, sdp) {
  closeMic(id);
  if (!micAllowed(id) || !sdp) {
    viaSignal(id).send({ type: 'signal', to: id, data: { kind: 'mic-refused' } });
    return;
  }
  logEvent('talking', viewerInfo[id]);
  var pc = new RTCPeerConnection(peerConfig(turnCreds[id]));
  var audio = new Audio();
  audio.autoplay = true;
  mics[id] = { pc: pc, audio: audio };
  playOn(audio);
  pc.ontrack = function (e) {
    audio.srcObject = e.streams[0] || new MediaStream([e.track]);
    audio.play().catch(function () {});
    echoAddVoice(id, e.track);
  };
  pc.onicecandidate = function (e) {
    if (e.candidate) viaSignal(id).send({ type: 'signal', to: id, data: { kind: 'mic-candidate', candidate: e.candidate } });
  };
  pc.onconnectionstatechange = function () {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      if (mics[id] && mics[id].pc === pc) closeMic(id);
    }
  };
  pc.setRemoteDescription(sdp)
    .then(function () {
      flushCandidates(pc);
      return pc.createAnswer();
    })
    .then(function (answer) { return pc.setLocalDescription(answer); })
    .then(function () {
      viaSignal(id).send({ type: 'signal', to: id, data: { kind: 'mic-answer', sdp: pc.localDescription } });
    })
    .catch(function () { closeMic(id); });
  renderDevices();
}

function closeMic(id) {
  var m = mics[id];
  if (!m) return;
  delete mics[id];
  echoRemoveVoice(id);
  m.pc.close();
  m.audio.srcObject = null;
  renderDevices();
}

// ---- Leaving the phone's own voice out of the stream ----
// The computer's sound is captured from the speakers' mix, so it includes the
// phone's voice as played here, and the phone would hear itself a moment
// later. While a phone talks, the sound sent to viewers goes through
// echo-cut.js, which subtracts that voice and leaves everything else.
// The voice is then played from the same Web Audio graph the cleaner listens
// to, not from its <audio> element: over Wi-Fi the received voice is
// stretched now and then to ride out jitter, and the element and Web Audio
// did that at different moments, so the copy to subtract no longer matched.
// The element stays (muted): Chrome only feeds a remote track to Web Audio
// while an element holds it.

var echo = null; // { ctx, node, input, out, mix, play, voices: { id: { track, source } }, ready }

function outgoingAudio() {
  var input = stream && stream.getAudioTracks()[0];
  if (!input) return null;
  return echo && echo.ready && echo.input === input ? echo.out : input;
}

function setOutgoingAudio() {
  var track = outgoingAudio();
  Object.keys(viewers).forEach(function (id) {
    var pc = viewers[id];
    if (!pc) return;
    pc.getSenders().forEach(function (sender) {
      if (sender.track && sender.track.kind === 'audio' && sender.track !== track) {
        sender.replaceTrack(track).catch(function () {});
      }
    });
  });
}

function startEcho() {
  var input = stream && stream.getAudioTracks()[0];
  if (echo || !input || !window.AudioWorkletNode) return;
  var ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
  var e = echo = { ctx: ctx, input: input, voices: {}, ready: false };
  e.mix = ctx.createGain();
  e.play = ctx.createGain();
  e.play.connect(ctx.destination);
  playOnContext(ctx);
  ctx.audioWorklet.addModule('/echo-cut.js').then(function () {
    return ctx.resume();
  }).then(function () {
    // A stopped context would send silence: keep the plain sound then.
    if (echo !== e || ctx.state !== 'running') throw new Error('not running');
    e.node = new AudioWorkletNode(ctx, 'echo-cut', {
      numberOfInputs: 2,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: 'explicit',
    });
    e.node.port.onmessage = function (m) {
      if (echo !== e) return;
      if (m.data && m.data.recording) saveEchoRecording(m.data.recording, m.data.delay);
      else showEchoState(m.data);
    };
    ctx.createMediaStreamSource(new MediaStream([input])).connect(e.node, 0, 0);
    e.mix.connect(e.node, 0, 1);
    var dest = ctx.createMediaStreamDestination();
    dest.channelCount = 2;
    e.node.connect(dest);
    e.out = dest.stream.getAudioTracks()[0];
    e.ready = true;
    setOutgoingAudio();
    Object.keys(e.voices).forEach(playThroughEcho);
  }).catch(function () {
    if (echo === e) stopEcho();
  });
}

// What the cleaner reports once a second, shown under the output picker.
function showEchoState(s) {
  var el = $('echoState');
  if (!s || !Object.keys(mics).length) {
    el.hidden = true;
    $('echoRecordBtn').hidden = true;
    return;
  }
  el.hidden = false;
  $('echoRecordBtn').hidden = false;
  if (s.delay < 0) {
    el.textContent = t('echoSearching');
    return;
  }
  var ms = Math.round(s.delay / 48);
  // How much quieter the sound got only says something while the phone talks.
  var talking = s.voice > 1e-6 && s.captured > 1e-9;
  var db = talking ? Math.round(10 * Math.log10(s.captured / Math.max(s.sent, 1e-12))) : 0;
  el.textContent = talking && db > 0
    ? t('echoWorkingDb').replace('{ms}', ms).replace('{db}', db)
    : t('echoWorking').replace('{ms}', ms);
}

// ---- Diagnostic recording ----
// Ten seconds of the phone's voice, the computer's sound as captured and the
// sound sent back, as one 3-channel WAV the user saves. Only on request, and
// it never leaves this computer by itself.

function wav(channels, rate) {
  var n = channels[0].length;
  var k = channels.length;
  var buf = new ArrayBuffer(44 + n * k * 2);
  var v = new DataView(buf);
  var str = function (at, s) { for (var i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * k * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, k, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * k * 2, true); v.setUint16(32, k * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * k * 2, true);
  var at = 44;
  for (var i = 0; i < n; i++) {
    for (var c = 0; c < k; c++) {
      var x = Math.max(-1, Math.min(1, channels[c][i]));
      v.setInt16(at, x < 0 ? x * 0x8000 : x * 0x7fff, true);
      at += 2;
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

function saveEchoRecording(channels, delay) {
  $('echoRecordBtn').disabled = false;
  $('echoRecordBtn').textContent = t('echoRecord');
  var name = 'ayva-echo-' + new Date().toISOString().replace(/[:.]/g, '-') + '-delay' + delay + '.wav';
  wav(channels, 48000).arrayBuffer().then(function (data) {
    return window.ayva.saveDiagnostic(name, data);
  }).then(function (file) {
    if (!file) return;
    transferStatus(t('echoRecordSaved').replace('{file}', file));
    window.ayva.notify(t('echoRecordSaved').replace('{file}', file), '', file);
  });
}

$('echoRecordBtn').onclick = function () {
  if (!echo || !echo.node) return;
  this.disabled = true;
  this.textContent = t('echoRecording');
  echo.node.port.postMessage({ record: 48000 * 10 });
};

function stopEcho() {
  if (!echo) return;
  $('echoState').hidden = true;
  $('echoRecordBtn').hidden = true;
  var e = echo;
  echo = null;
  setOutgoingAudio();
  // Back to the plain elements for the voices still talking.
  Object.keys(mics).forEach(function (id) { mics[id].audio.muted = false; });
  e.ctx.close().catch(function () {});
}

// Once the cleaner runs: the voice plays from its graph, the element goes quiet.
function playThroughEcho(id) {
  var v = echo && echo.voices[id];
  if (!v || !echo.ready || v.playing) return;
  v.source.connect(echo.play);
  v.playing = true;
  if (mics[id]) mics[id].audio.muted = true;
}

function echoAddVoice(id, track) {
  if (!track || track.kind !== 'audio') return;
  startEcho();
  if (!echo) return;
  echoRemoveVoice(id);
  var source = echo.ctx.createMediaStreamSource(new MediaStream([track]));
  source.connect(echo.mix);
  echo.voices[id] = { track: track, source: source, playing: false };
  playThroughEcho(id);
}

// The cleaner stays on until sharing stops: switching the sound back and
// forth would make a small gap each time a phone stops talking.
function echoRemoveVoice(id) {
  if (!echo || !echo.voices[id]) return;
  echo.voices[id].source.disconnect();
  delete echo.voices[id];
}

// The output the user picked (a virtual cable lets Discord hear the phone).
var micOutput = storageGet('ayva-mic-output') || '';

function playOn(audio) {
  if (audio.setSinkId) audio.setSinkId(micOutput).catch(function () { audio.setSinkId(''); });
}

function playOnContext(ctx) {
  if (ctx.setSinkId) ctx.setSinkId(micOutput).catch(function () { ctx.setSinkId('').catch(function () {}); });
}

function listOutputs() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices || !('setSinkId' in HTMLMediaElement.prototype)) return;
  navigator.mediaDevices.enumerateDevices().then(function (devices) {
    var outputs = devices.filter(function (d) {
      return d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications';
    });
    var select = $('micOutput');
    select.innerHTML = '';
    var first = document.createElement('option');
    first.value = '';
    first.textContent = t('micOutputDefault');
    select.appendChild(first);
    outputs.forEach(function (d) {
      var o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || d.deviceId.slice(0, 8);
      select.appendChild(o);
    });
    // A device that was unplugged: fall back to the default until it is back.
    select.value = outputs.some(function (d) { return d.deviceId === micOutput; }) ? micOutput : '';
    $('micOutRow').hidden = !outputs.length;
  });
}

if (window.ayva) {
  listOutputs();
  if (navigator.mediaDevices) navigator.mediaDevices.addEventListener('devicechange', listOutputs);
  $('micOutput').onchange = function () {
    micOutput = this.value;
    storageSet('ayva-mic-output', micOutput);
    Object.keys(mics).forEach(function (id) { playOn(mics[id].audio); });
    if (echo) playOnContext(echo.ctx);
  };
}

// Control was switched off: only remembered devices may keep talking.
function dropUnallowedMics() {
  Object.keys(mics).forEach(function (id) {
    if (micAllowed(id)) return;
    closeMic(id);
    viaSignal(id).send({ type: 'signal', to: id, data: { kind: 'mic-refused' } });
  });
}

$('approveBtn').onclick = function () { answerRequest(true); };
$('rejectBtn').onclick = function () { answerRequest(false); };
$('askApproval').onchange = function () {
  askApproval = this.checked;
  storageSet('ayva-ask-approval', askApproval ? '1' : '0');
};
renderDevices();

// ---- Fixed address (desktop app) ----
// Once set up, this computer stays connected to its address on the user's
// Cloudflare account; phones open the same link (or QR) every time.

var cloudInfo = null; // from the app: { configured, url, link, wsUrl, name }

function applyCloudStatus(status) {
  cloudInfo = status && status.configured ? status : null;
  $('cloud').hidden = false;
  connectCloud(cloudInfo);
  renderCloud(false);
}

function renderCloud(connected) {
  var on = !!cloudInfo;
  $('cloudSetupBtn').hidden = on;
  $('cloudBox').hidden = !on;
  $('cloudState').className = 'muted small';
  $('cloudState').textContent = on ? t(connected ? 'cloudConnected' : 'cloudConnecting') : t('cloudNotSet');
  if (!on) return;
  $('cloudLink').textContent = cloudInfo.url;
  window.ayva.makeQr(cloudInfo.link).then(function (dataUrl) { $('cloudQr').src = dataUrl; });
}

var CLOUD_STEPS = { account: 'cloudStepAccount', upload: 'cloudStepUpload', secrets: 'cloudStepSecrets', address: 'cloudStepAddress', waiting: 'cloudStepWaiting' };
var CLOUD_ERRORS = { 'token-missing': 'cloudErrToken', 'password-required': 'cloudErrPasswordRequired', 'password-short': 'cloudErrPasswordShort', 'no-account': 'cloudErrAccount' };

function runCloudSetup() {
  var token = $('cloudToken').value.trim();
  var password = $('cloudPassword').value;
  if (!token) {
    $('cloudSetupStatus').textContent = t('cloudErrToken');
    return;
  }
  if (password !== $('cloudPassword2').value) {
    $('cloudSetupStatus').textContent = t('cloudErrMismatch');
    return;
  }
  if (password && password.length < 8) {
    $('cloudSetupStatus').textContent = t('cloudErrPasswordShort');
    return;
  }
  $('cloudGoBtn').disabled = true;
  $('cloudSetupStatus').className = 'progress';
  $('cloudSetupStatus').textContent = t('cloudStepAccount');
  window.ayva.cloudSetup(token, password).then(function (result) {
    $('cloudGoBtn').disabled = false;
    if (result.error) {
      $('cloudSetupStatus').className = 'status error';
      $('cloudSetupStatus').textContent = t(CLOUD_ERRORS[result.error] || 'cloudErrGeneric') +
        (CLOUD_ERRORS[result.error] ? '' : ' ' + result.error);
      return;
    }
    $('cloudSetupStatus').className = 'status';
    // Don't keep secrets in the form.
    $('cloudToken').value = '';
    $('cloudPassword').value = '';
    $('cloudPassword2').value = '';
    $('cloudModal').hidden = true;
    applyCloudStatus(result.status);
  });
}

// The address exists but this network can't reach it (some providers block
// workers.dev): say so instead of "connecting…" forever.
var cloudReachTimer = null;

function watchCloudReach(sig) {
  clearTimeout(cloudReachTimer);
  cloudReachTimer = setTimeout(function () {
    if (cloudSignal === sig && sig.ws && sig.ws.readyState !== WebSocket.OPEN) {
      $('cloudState').className = 'error small';
      $('cloudState').textContent = t('cloudUnreachable');
    }
  }, 20000);
}

if (window.ayva && window.ayva.cloudSetup) {
  window.ayva.onCloudProgress(function (step) {
    $('cloudSetupStatus').textContent = t(CLOUD_STEPS[step] || 'cloudStepUpload');
  });
  $('cloudSetupBtn').onclick = function () {
    $('cloudSetupStatus').textContent = '';
    $('cloudModal').hidden = false;
    $('cloudToken').focus();
  };
  $('cloudCancelBtn').onclick = function () { $('cloudModal').hidden = true; };
  $('cloudGoBtn').onclick = runCloudSetup;
  $('copyCloudBtn').onclick = function () {
    navigator.clipboard.writeText(cloudInfo.link).then(function () { $('cloudState').textContent = t('linkCopied'); });
  };
  $('cloudRemoveBtn').onclick = function () {
    if (!confirm(t('cloudRemoveConfirm'))) return;
    window.ayva.cloudRemove().then(function () { applyCloudStatus(null); });
  };
}

// ---- Internet access (desktop app) ----
// Opens a Cloudflare tunnel and shows a link + QR code that work from any
// network. The link carries a random access key; it changes every time.

var internet = { state: 'off', url: null, key: null };

function internetLink() {
  if (!internet.url || !code) return '';
  return internet.url + '/watch.html#' + code + '-' + internet.key;
}

function renderInternet() {
  var btn = $('internetBtn');
  btn.disabled = internet.state === 'starting';
  btn.className = internet.state === 'on' ? 'danger' : 'secondary';
  btn.textContent = internet.state === 'on' ? t('internetOff')
    : internet.state === 'starting' ? t('internetStarting') : t('internetOn');
  $('internetBox').hidden = internet.state !== 'on';
  if (internet.state !== 'on') return;
  var link = internetLink();
  $('internetLink').textContent = link;
  window.ayva.makeQr(link).then(function (dataUrl) { $('internetQr').src = dataUrl; });
}

function startInternet() {
  internet.state = 'starting';
  $('internetStatus').textContent = t('internetConnecting');
  renderInternet();
  window.ayva.startInternet().then(function (result) {
    if (result.error) {
      internet.state = 'off';
      $('internetStatus').textContent = t('internetFailed') + result.error;
    } else {
      internet = { state: 'on', url: result.url, key: result.key };
      $('internetStatus').textContent = '';
    }
    renderInternet();
  });
}

function stopInternet() {
  window.ayva.stopInternet();
  internet = { state: 'off', url: null, key: null };
  $('internetStatus').textContent = '';
  renderInternet();
}

if (window.ayva && window.ayva.internetSupported) {
  window.ayva.internetSupported().then(function (ok) {
    $('internet').hidden = !ok;
    renderInternet();
  });
  window.ayva.onInternetProgress(function (fraction) {
    $('internetStatus').textContent = t('internetDownloading') + ' ' + Math.round(fraction * 100) + '%';
  });
  window.ayva.onInternetStopped(function () {
    internet = { state: 'off', url: null, key: null };
    $('internetStatus').textContent = t('internetStopped');
    renderInternet();
  });
  $('internetBtn').onclick = function () {
    if (internet.state === 'on') stopInternet();
    else if (internet.state === 'off') startInternet();
  };
  $('copyLinkBtn').onclick = function () {
    navigator.clipboard.writeText(internetLink()).then(function () {
      $('internetStatus').textContent = t('linkCopied');
    });
  };
}

// The desktop app has no browser picker, so it shows its own.
function openPicker() {
  var list = $('sources');
  list.innerHTML = '';
  $('picker').hidden = false;
  window.ayva.getSources().then(function (sources) {
    // Screens first, then windows.
    sources.sort(function (a, b) { return (b.isScreen ? 1 : 0) - (a.isScreen ? 1 : 0); });
    var screenCount = sources.filter(function (s) { return s.isScreen; }).length;
    sources.forEach(function (source, i) {
      var b = document.createElement('button');
      b.className = 'source';
      var img = document.createElement('img');
      img.src = source.thumbnail;
      img.alt = '';
      var label = document.createElement('span');
      label.textContent = source.isScreen
        ? t('entireScreen') + (screenCount > 1 ? ' ' + (i + 1) : '')
        : source.name;
      b.appendChild(img);
      b.appendChild(label);
      b.onclick = function () {
        $('picker').hidden = true;
        window.ayva.selectSource(source.id, $('pickerAudio').checked).then(function (result) {
          absolutePointer = !!(result && result.absolute);
          currentSource = result && result.sourceId;
          return capture();
        });
      };
      list.appendChild(b);
    });
  });
}

function startSharing() {
  if (window.ayva) openPicker();
  else capture();
}

// Swap in a newly picked screen/window without dropping the viewers: the new
// tracks replace the old ones on every connection, no reconnect needed.
function replaceSource(next) {
  var old = stream;
  stream = next;
  old.getTracks().forEach(function (track) {
    track.onended = null; // stopping it must not end the whole share
    track.stop();
  });
  Object.keys(viewers).forEach(function (id) {
    var pc = viewers[id];
    if (!pc) return;
    var needsReconnect = false;
    var kinds = {};
    pc.getTransceivers().forEach(function (tr) {
      var kind = tr.receiver.track.kind;
      kinds[kind] = true;
      var track = next.getTracks().filter(function (t) { return t.kind === kind; })[0] || null;
      tr.sender.replaceTrack(track).catch(function () { needsReconnect = true; });
    });
    // Sound appeared where there was none: that needs a fresh connection.
    if (next.getAudioTracks().length && !kinds.audio) needsReconnect = true;
    if (needsReconnect) connectViewer(id);
  });
  broadcastControlState(); // pointing at the picture may have become (un)available
  // The cleaner listened to the old sound; start it again on the new one.
  if (echo) {
    var voices = echo.voices;
    stopEcho();
    Object.keys(voices).forEach(function (id) { echoAddVoice(id, voices[id].track); });
  }
}

function capture() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    setStatus(t('unsupported'), true);
    return;
  }
  var key = $('quality').value;
  var q = QUALITY[key];
  storageSet('ayva-quality', key);

  return navigator.mediaDevices.getDisplayMedia({
    // "max" matters: with only "ideal", a 1440p screen is sent at full size,
    // which TV boxes struggle to decode.
    video: {
      width: { ideal: q.width, max: q.width },
      height: { ideal: q.height, max: q.height },
      frameRate: { ideal: q.fps, max: q.fps },
      // The cursor must be in the picture for remote control to make sense.
      cursor: 'always',
    },
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
      sampleRate: 48000,
    },
    systemAudio: 'include',
    selfBrowserSurface: 'exclude',
  }).then(function (s) {
    var switching = !!stream;
    if (switching) replaceSource(s);
    else stream = s;
    var video = s.getVideoTracks()[0];
    // 60 FPS presets favour smooth motion, the rest keep text sharp.
    if ('contentHint' in video) video.contentHint = q.fps >= 60 ? 'motion' : 'detail';
    // Some capture paths (e.g. the desktop app's picker) skip the constraints above.
    video.applyConstraints({
      width: { max: q.width },
      height: { max: q.height },
      frameRate: { max: q.fps },
    }).catch(function () {});
    video.onended = stopSharing;
    // Keep this window (codes, links, the preview itself) out of the stream.
    if (window.ayva && window.ayva.hideFromCapture) window.ayva.hideFromCapture(true);
    $('preview').srcObject = s;
    if (!switching) Object.keys(viewers).forEach(connectViewer);
    refreshScreens();
    applyControl();
  }).catch(function (err) {
    if (err && err.name === 'NotAllowedError') return; // user cancelled the picker
    setStatus(t('shareFailed') + (err && err.message ? err.message : err), true);
  });
}

function stopSharing() {
  if (!stream) return;
  controlOn = false;
  controlPaused = false;
  if (window.ayva && window.ayva.hideFromCapture) window.ayva.hideFromCapture(false);
  stream.getTracks().forEach(function (track) { track.stop(); });
  stream = null;
  Object.keys(mics).forEach(closeMic);
  stopEcho();
  screens = [];
  currentSource = null;
  if (privacyOn) setPrivacy(false);
  $('preview').srcObject = null;
  viewerStats = {};
  renderStats();
  Object.keys(viewers).forEach(function (id) {
    closePeer(id);
    viaSignal(id).send({ type: 'signal', to: id, data: { kind: 'stopped' } });
  });
  applyControl();
}

// ---- Signaling ----
// Two connections can be open at once: the local server (home network, TV
// app, quick tunnel) and, when set up, the fixed address on Cloudflare. Each
// viewer is answered over the connection it came from.

var signal; // local server
var cloudSignal = null; // fixed address (Cloudflare hub), if set up
var viewerSignal = {}; // viewer id -> the connection it came through

function viaSignal(id) {
  return viewerSignal[id] || signal;
}

function sendToHubs(msg) {
  if (signal) signal.send(msg);
  if (cloudSignal) cloudSignal.send(msg);
}

// A viewer whose server connection dropped while the picture kept flowing
// directly. It stays until its direct connection ends too.
var orphaned = {}; // viewer id -> true

function peerAlive(id) {
  return !!viewers[id] && viewers[id].connectionState === 'connected';
}

function signalingLost(id) {
  if (!peerAlive(id)) {
    viewerLeft(id);
    return;
  }
  orphaned[id] = true;
  delete viewerSignal[id];
  dropRequest(id);
}

function viewerLeft(id) {
  var info = viewerInfo[id];
  if (info) logEvent('left', info, Date.now() - info.joinedAt);
  dropTurn(id);
  delete connectSeq[id];
  delete orphaned[id];
  dropRequest(id);
  closeMic(id);
  delete viewerInfo[id];
  renderDevices();
  closePeer(id);
  // A viewer that leaves mid-drag must not leave a button or key held down.
  if (controlSupported) window.ayva.sendControl({ t: 'release' });
  delete lastInput[id];
  delete viewers[id];
  delete viewerStats[id];
  delete senderStats[id];
  delete lastSender[id];
  delete viewerSignal[id];
  applyControl();
  renderStats();
}

// Viewers will rejoin with new ids once the connection is back.
function dropViewersOf(sig) {
  Object.keys(viewerSignal).forEach(function (id) {
    if (viewerSignal[id] === sig) signalingLost(id);
  });
  requests = requests.filter(function (r) { return viewerSignal[r.id] !== sig; });
  showNextRequest();
}

function handleHubMessage(msg, sig) {
  if (msg.type === 'viewer-request') {
    viewerSignal[msg.id] = sig;
    handleViewerRequest(msg);
  } else if (msg.type === 'viewer-joined') {
    startProof(msg, sig);
  } else if (msg.type === 'viewer-left') {
    if (proving[msg.id]) {
      clearTimeout(proving[msg.id].timer);
      delete proving[msg.id];
    }
    signalingLost(msg.id);
  } else if (msg.type === 'signal') {
    if (proving[msg.from]) {
      if (msg.data && msg.data.kind === 'proof') checkProof(msg.from, msg.data);
    } else if (msg.from in viewerInfo) {
      handleViewerSignal(msg.from, msg.data);
    }
  }
}

// Let in and proven: from here on it gets the picture and its rights.
function viewerAdmitted(msg, sig, nonce) {
  viewerSignal[msg.id] = sig;
  viewerInfo[msg.id] = {
    name: msg.name, deviceId: msg.deviceId, remote: msg.remote, nonce: nonce, pinOk: false, joinedAt: Date.now(),
  };
  logEvent('joined', viewerInfo[msg.id]);
  viewers[msg.id] = null;
  connectViewer(msg.id);
  sendCaps(msg.id);
  applyControl();
}

// ---- Backup route (Cloudflare TURN) ----
// Only for viewers coming over the internet, and only when a TURN key is set
// up in the desktop app (desktop/turn.js keeps the key). Each such viewer gets
// its own short-lived credentials, renewed before they run out and revoked
// when it leaves. What goes over the relay is counted against a monthly limit,
// so the free allowance is never exceeded by Ayva.

var TURN_TTL_S = 4 * 3600;
var TURN_RENEW_MS = 3 * 3600 * 1000;
var turnReady = false;
var turnCreds = {}; // viewer id -> { iceServers, username, timer }
var relayBytes = {}; // viewer id -> { pair, bytes } last counted on a relayed path
var turnHideIp = storageGet('ayva-turn-hide-ip') === '1';
var turnLimitGb = Number(storageGet('ayva-turn-limit')) || 800;
var turnUsage = loadTurnUsage();

function thisMonth() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
}

function loadTurnUsage() {
  try {
    var u = JSON.parse(storageGet('ayva-turn-usage') || 'null');
    if (u && u.month === thisMonth() && typeof u.bytes === 'number') return u;
  } catch (e) { /* start over */ }
  return { month: thisMonth(), bytes: 0 };
}

function turnFull() {
  if (turnUsage.month !== thisMonth()) turnUsage = { month: thisMonth(), bytes: 0 };
  return turnUsage.bytes >= turnLimitGb * 1e9;
}

function turnFor(id) {
  var info = viewerInfo[id];
  if (!turnReady || !info || !info.remote || turnFull()) return Promise.resolve(null);
  if (turnCreds[id]) return Promise.resolve(turnCreds[id]);
  return window.ayva.turnCredentials(TURN_TTL_S).then(function (c) {
    if (!c || !Array.isArray(c.iceServers)) return null;
    if (!viewerInfo[id] || turnCreds[id]) {
      window.ayva.turnRevoke(c.username);
      return turnCreds[id] || null;
    }
    c.timer = setTimeout(function () { renewTurn(id); }, TURN_RENEW_MS);
    turnCreds[id] = c;
    return c;
  }).catch(function () { return null; });
}

// New credentials before the old ones run out; the old ones are revoked once
// both ends have moved over.
function renewTurn(id) {
  var old = turnCreds[id];
  if (!old) return;
  delete turnCreds[id];
  turnFor(id).then(function (c) {
    if (c) {
      if (viewers[id]) viewers[id].setConfiguration(peerConfig(c));
      sendIce(id, c);
    }
    setTimeout(function () { window.ayva.turnRevoke(old.username); }, 60000);
  });
}

function dropTurn(id) {
  var c = turnCreds[id];
  delete turnCreds[id];
  delete relayBytes[id];
  if (!c) return;
  clearTimeout(c.timer);
  window.ayva.turnRevoke(c.username);
}

function peerConfig(creds) {
  var cfg = { iceServers: config.iceServers.concat(creds ? creds.iceServers : []) };
  // Only relay addresses leave this computer, so the viewer never sees its IP.
  if (creds && turnHideIp) cfg.iceTransportPolicy = 'relay';
  return cfg;
}

function sendIce(id, creds) {
  viaSignal(id).send({ type: 'signal', to: id, data: { kind: 'ice', iceServers: creds.iceServers } });
}

// Cloudflare counts what it relays; this counts the same bytes on this side.
function countRelay(id, report) {
  var pair = null;
  report.forEach(function (r) {
    if (r.type === 'transport' && r.selectedCandidatePairId) pair = report.get(r.selectedCandidatePairId);
  });
  var relayed = !!pair && [pair.localCandidateId, pair.remoteCandidateId].some(function (cid) {
    var c = report.get(cid);
    return !!c && c.candidateType === 'relay';
  });
  var info = viewerInfo[id];
  if (info && !!info.relayed !== relayed) {
    info.relayed = relayed;
    renderDevices();
  }
  if (!pair) return;
  var bytes = (pair.bytesSent || 0) + (pair.bytesReceived || 0);
  var last = relayBytes[id];
  relayBytes[id] = { pair: pair.id, bytes: bytes };
  if (relayed && last && last.pair === pair.id && bytes > last.bytes) addTurnUsage(bytes - last.bytes);
}

function addTurnUsage(bytes) {
  var wasFull = turnFull();
  turnUsage.bytes += bytes;
  storageSet('ayva-turn-usage', JSON.stringify(turnUsage));
  if (!wasFull && turnFull()) {
    transferStatus(t('turnLimitTitle'));
    if (window.ayva && window.ayva.notify) window.ayva.notify(t('turnLimitTitle'), '');
  }
  renderTurn();
}

function gb(bytes) {
  return (bytes / 1e9).toFixed(bytes < 1e10 ? 1 : 0);
}

function renderTurn() {
  $('turnState').textContent = t(!turnReady ? 'turnOff' : turnFull() ? 'turnFull' : 'turnOnShort');
  $('turnForm').hidden = turnReady;
  $('turnSettings').hidden = !turnReady;
  var used = gb(turnUsage.month === thisMonth() ? turnUsage.bytes : 0);
  $('turnInfo').textContent = !turnReady ? t('turnIntro')
    : t(turnFull() ? 'turnOverLimit' : 'turnOn').replace('{used}', used).replace('{limit}', turnLimitGb);
}

if (window.ayva && window.ayva.turnStatus) {
  $('turn').hidden = false;
  $('turnKeyId').placeholder = t('turnKeyId');
  $('turnToken').placeholder = t('turnToken');
  $('turnHideIp').checked = turnHideIp;
  $('turnLimit').value = turnLimitGb;
  window.ayva.turnStatus().then(function (s) {
    turnReady = !!(s && s.configured);
    renderTurn();
  });
  renderTurn();

  $('turnForm').onsubmit = function (e) {
    e.preventDefault();
    $('turnSaveBtn').disabled = true;
    $('turnError').textContent = t('turnChecking');
    window.ayva.turnSetup($('turnKeyId').value, $('turnToken').value).then(function (r) {
      $('turnSaveBtn').disabled = false;
      $('turnToken').value = '';
      $('turnError').textContent = r && r.error ? t(r.error) || r.error : '';
      if (r && r.status) {
        $('turnKeyId').value = '';
        turnReady = true;
        renderTurn();
      }
    });
  };

  $('turnRemoveBtn').onclick = function () {
    window.ayva.turnRemove().then(function () {
      turnReady = false;
      Object.keys(turnCreds).forEach(dropTurn);
      renderTurn();
    });
  };

  // Takes effect for the next connection.
  $('turnHideIp').onchange = function () {
    turnHideIp = this.checked;
    storageSet('ayva-turn-hide-ip', turnHideIp ? '1' : '0');
  };

  $('turnLimit').onchange = function () {
    var v = Math.round(Number(this.value));
    if (!(v >= 1)) v = 800;
    this.value = v;
    turnLimitGb = v;
    storageSet('ayva-turn-limit', String(v));
    renderTurn();
  };
}

// ---- Connection history ----
// Who connected, when, and what they did. Kept on this computer only, under
// the name the device had at the time.

var HISTORY_MAX = 300;
var HISTORY_TEXT = {
  joined: 'histJoined', left: 'histLeft', allowed: 'histAllowed', denied: 'histDenied',
  kicked: 'histKicked', proofFailed: 'histProofFailed', pinWrong: 'histPinWrong',
  pinLocked: 'histPinLocked', remoteStart: 'remoteStarted', remoteStop: 'remoteStopped',
  remoteFailed: 'histRemoteFailed', recording: 'histRecording', talking: 'histTalking',
  privacy: 'histPrivacy', screen: 'histScreen',
};
var HISTORY_ALERT = { denied: true, proofFailed: true, pinWrong: true, pinLocked: true };
var connHistory = [];
try {
  connHistory = JSON.parse(storageGet('ayva-history') || '[]');
  if (!Array.isArray(connHistory)) connHistory = [];
} catch (e) {
  connHistory = [];
}

function logEvent(event, info, ms, what) {
  var entry = { at: Date.now(), e: event, who: deviceLabel(info) };
  if (what) entry.what = what;
  if (event === 'joined') entry.via = info && info.remote ? 'internet' : 'lan';
  if (ms) entry.ms = ms;
  connHistory.push(entry);
  if (connHistory.length > HISTORY_MAX) connHistory = connHistory.slice(-HISTORY_MAX);
  storageSet('ayva-history', JSON.stringify(connHistory));
  renderHistory();
}

function durationText(ms) {
  var m = Math.round((ms || 0) / 60000);
  if (m < 1) return t('durShort');
  if (m < 60) return t('durMin').replace('{m}', m);
  return t('durHour').replace('{h}', Math.floor(m / 60)).replace('{m}', m % 60);
}

function renderHistory() {
  var box = $('history');
  box.innerHTML = '';
  $('historyClear').hidden = !connHistory.length;
  if (!connHistory.length) {
    var empty = document.createElement('div');
    empty.className = 'muted small';
    empty.textContent = t('historyEmpty');
    box.appendChild(empty);
    return;
  }
  connHistory.slice(-100).reverse().forEach(function (h) {
    var row = document.createElement('div');
    row.className = 'history-row' + (HISTORY_ALERT[h.e] ? ' alert' : '');
    var when = document.createElement('span');
    when.className = 'muted';
    when.textContent = new Date(h.at).toLocaleString(LANG === 'tr' ? 'tr-TR' : 'en-GB', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    var what = document.createElement('span');
    what.textContent = t(HISTORY_TEXT[h.e] || 'unknownDevice')
      .replace('{who}', h.who)
      .replace('{via}', t(h.via === 'internet' ? 'viaInternet' : 'viaLan'))
      .replace('{time}', durationText(h.ms))
      .replace('{screen}', h.what || '')
      .replace(/\.$/, '');
    row.appendChild(when);
    row.appendChild(what);
    box.appendChild(row);
  });
}

$('historyClear').onclick = function () {
  if (!confirm(t('historyClearAsk'))) return;
  connHistory = [];
  storageSet('ayva-history', '[]');
  renderHistory();
};

renderHistory();

function connectCloud(info) {
  if (cloudSignal) cloudSignal.stop();
  cloudSignal = null;
  if (!info || !info.wsUrl) return;
  var sig = new Signal({
    url: info.wsUrl,
    open: function () {
      sig.send({ type: 'host', name: info.name, live: !!stream });
    },
    message: function (msg) {
      if (msg.type === 'hosted') renderCloud(true);
      else handleHubMessage(msg, sig);
    },
    close: function () {
      dropViewersOf(sig);
      renderCloud(false);
    },
  });
  cloudSignal = sig;
  watchCloudReach(sig);
}

loadConfig().then(function (cfg) {
  config = cfg;
  showCode();
  var sig = new Signal({
    open: function () {
      sig.send({ type: 'host', code: code });
    },
    message: function (msg) {
      if (msg.type === 'hosted') {
        code = msg.code;
        storageSet('ayva-code', code);
        sig.send({ type: 'status', live: !!stream });
        showCode();
        if (internet.state === 'on') renderInternet(); // the link contains the code
        updateUi();
      } else {
        handleHubMessage(msg, sig);
      }
    },
    close: function () {
      dropViewersOf(sig);
      setStatus(t('disconnected'), true);
    },
  });
  signal = sig;
  setStatus(t('connecting'));
  updateUi();
  if (window.ayva && window.ayva.cloudStatus) window.ayva.cloudStatus().then(applyCloudStatus);
});

$('startBtn').onclick = startSharing;
$('switchBtn').onclick = startSharing; // while live, picking a source switches to it
$('sendFileBtn').onclick = function () { $('sendFileInput').click(); };
$('sendFileInput').onchange = function () {
  sendFiles(this.files);
  this.value = '';
};
$('sendClipBtn').onclick = sendClipboard;
$('stopBtn').onclick = stopSharing;
$('pickerCancel').onclick = function () { $('picker').hidden = true; };
$('controlBtn').onclick = function () { setControl(!controlOn); };
$('revealBtn').onclick = function () {
  revealed = !revealed;
  updateUi();
};
if (window.ayva) $('audioTip').textContent = t('tvAppTip');
// ---- Version and updates ----
// The installed app updates itself from GitHub Releases (desktop/updater.js);
// this row shows where that stands and offers to check or install.

function renderUpdate(s) {
  if (!s) return;
  $('updateRow').hidden = false;
  var key = !s.supported ? 'updVersion'
    : { latest: 'updLatest', checking: 'updChecking', downloading: 'updDownloading', ready: 'updReady', error: 'updError' }[s.state] || 'updVersion';
  $('updateText').textContent = t(key).replace('{v}', s.current).replace('{new}', s.version || '');
  var btn = $('updateBtn');
  btn.hidden = !s.supported || s.state === 'checking' || s.state === 'downloading';
  btn.textContent = t(s.state === 'ready' ? 'updInstall' : 'updCheck');
  btn.className = s.state === 'ready' ? 'small-btn' : 'secondary small-btn';
  btn.onclick = function () {
    if (s.state === 'ready') window.ayva.installUpdate();
    else window.ayva.checkUpdates();
  };
}

if (window.ayva && window.ayva.updateStatus) {
  window.ayva.updateStatus().then(renderUpdate);
  window.ayva.onUpdateState(renderUpdate);
}

if (window.ayva && window.ayva.getStartWithWindows) {
  $('startWithWindowsRow').hidden = false;
  window.ayva.getStartWithWindows().then(function (on) { $('startWithWindows').checked = !!on; });
  $('startWithWindows').onchange = function () {
    window.ayva.setStartWithWindows(this.checked);
  };
}
