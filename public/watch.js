// Viewer (TV): joins a room by code and plays whatever the broadcaster sends.

// Opened by the TV app: the code comes from LAN discovery, sound can start
// right away and the app handles navigation, so the on-screen controls go.
var APP = /[?&]app=1/.test(location.search);
if (APP) {
  document.body.classList.add('app');
  $('video').muted = false;
}

var JITTER_BUFFER_MS = 200;

// ---- Sound output ----
// A media element plays WebRTC audio through a low-latency output with tiny
// buffers. Some TV boxes can't keep that fed and the sound crackles, even
// though the same stream is clean on a phone. In the TV app the sound goes
// through Web Audio instead, asking for a "playback" (large-buffer) output.
// Add &audio=element to the URL to compare with the default path.
var USE_WEB_AUDIO = APP && !/[?&]audio=element/.test(location.search)
  && !!(window.AudioContext || window.webkitAudioContext);
var audioCtx = null;
var audioSource = null;
var audioPath = 'element';

function playAudioTrack(track) {
  var video = $('video');
  if (!USE_WEB_AUDIO) return;
  try {
    if (!audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx({ latencyHint: 'playback' });
    }
    if (audioSource) audioSource.disconnect();
    audioSource = audioCtx.createMediaStreamSource(new MediaStream([track]));
    audioSource.connect(audioCtx.destination);
  } catch (e) {
    return;
  }
  // The element still has to hold the track for audio to flow into Web
  // Audio (a Chrome quirk), but muted so the sound isn't heard twice.
  video.muted = true;
  audioPath = 'webaudio';
  audioCtx.resume().catch(function () {});
  setTimeout(function () {
    if (audioCtx.state !== 'running') {
      // Not allowed to start without a key press: fall back to the element.
      stopWebAudio();
      video.muted = false;
    }
  }, 1500);
}

function stopWebAudio() {
  if (audioSource) audioSource.disconnect();
  audioSource = null;
  audioPath = 'element';
}

var config = null;
var signal = null;
var turnIce = []; // backup-route servers from the computer (viewers over the internet)

function iceConfig() {
  return { iceServers: config.iceServers.concat(turnIce) };
}
var pc = null;
var CLOUD = false; // opened at the fixed (Cloudflare) address: see cloud.js
var code = null; // room code, or in cloud mode the chosen computer's id
var joined = false;
var everJoined = false; // joined this code at least once, so a missing room means "restarting"
var retryTimer = null;
var wakeLock = null;

function showEntry(error) {
  code = null;
  joined = false;
  everJoined = false;
  clearTimeout(retryTimer);
  closePeer();
  if (CLOUD) {
    Cloud.backToList();
    return;
  }
  $('entry').classList.remove('hidden');
  $('waiting').classList.add('hidden');
  $('entryError').textContent = error || '';
  $('codeInput').value = storageGet('ayva-last-code') || '';
  $('codeInput').focus();
}

function showWaiting(text) {
  $('waiting').querySelector('.spinner').hidden = false;
  $('entry').classList.add('hidden');
  $('waiting').classList.remove('hidden');
  $('waitingText').textContent = text;
  // In cloud mode the "code" is an internal id; show the computer's name instead.
  var label = CLOUD ? Cloud.hostName(code) : code;
  $('waitingCodeLabel').textContent = t(CLOUD ? 'computerLabel' : 'yourCode');
  $('waitingCodeRow').hidden = !label;
  $('waitingCode').textContent = label || '';
}

// Is the picture still coming in directly from the computer?
function peerAlive() {
  return !!pc && pc.connectionState === 'connected';
}

// Short message at the top that doesn't cover the picture.
var noticeTimer = null;
function notice(text) {
  var el = $('controlToast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(function () { el.hidden = true; }, 4000);
}

function showVideo() {
  $('entry').classList.add('hidden');
  $('waiting').classList.add('hidden');
  requestWakeLock();
}

function closePeer() {
  // A recording in progress is finished and kept, not thrown away.
  if (typeof Recorder !== 'undefined') Recorder.stop();
  if (typeof Mic !== 'undefined') Mic.stop();
  if (pc) pc.close();
  pc = null;
  if (typeof Control !== 'undefined') Control.detach();
  if (typeof Inbox !== 'undefined') Inbox.detach();
  lastStats = null;
  frameGaps = [];
  lastFrameTime = 0;
  stopWebAudio();
  $('video').srcObject = null;
  $('unmuteBtn').hidden = true;
  updateExtras();
}

// Buttons whose visibility depends on whether the picture is coming in.
function updateExtras() {
  if (typeof Recorder !== 'undefined') Recorder.update();
  if (typeof Mic !== 'undefined') Mic.update();
  updateRemoteStart();
}

// ---- Starting / stopping the share from here ----
// Only offered when the computer says so: it allows this for remembered
// devices if its user turned the option on.

var canRemoteStart = false;
var startTimer = null;

function updateRemoteStart() {
  var startBtn = $('remoteStartBtn');
  var show = canRemoteStart && joined && !pc;
  if (startBtn.hidden && show && APP) setTimeout(function () { startBtn.focus(); }, 0);
  startBtn.hidden = !show;
  if (!show) {
    clearTimeout(startTimer);
    startBtn.disabled = false;
    startBtn.textContent = t('startShare');
  }
  $('remoteStopBtn').hidden = !canRemoteStart || !pc;
  var locked = pinSalt !== null && joined;
  $('unlockBtn').hidden = !locked || !!pc;
  $('pinBtn').hidden = !locked || !pc;
  if (!locked) $('pinOverlay').classList.add('hidden');
  if (typeof Mirror !== 'undefined') Mirror.update();
  if (typeof Camera !== 'undefined') Camera.update();
}

// ---- Proving who we are, and the PIN ----
// Right after it lets us in, the computer sends a one-time challenge. Signing
// it with this device's key (devicekey.js) shows a remembered device is the
// real one. Rights such as starting the share may also need a PIN.

var proofNonce = null;
var pinSalt = null; // set while the computer wants a PIN

function proveDevice(nonce) {
  proofNonce = String(nonce || '');
  DeviceKey.prove(proofNonce).then(function (proof) {
    signal.send({
      type: 'signal',
      data: proof ? { kind: 'proof', key: proof.key, sig: proof.sig, origin: proof.origin } : { kind: 'proof' },
    });
  });
}

function openPin() {
  $('pinError').textContent = '';
  $('pinInput').value = '';
  $('pinOverlay').classList.remove('hidden');
  $('pinInput').focus();
}

$('unlockBtn').onclick = openPin;
$('pinBtn').onclick = openPin;
$('pinCancel').onclick = function () { $('pinOverlay').classList.add('hidden'); };

// Only a hash bound to this connection's challenge goes over the network.
$('pinForm').onsubmit = function (e) {
  e.preventDefault();
  var pin = $('pinInput').value.trim();
  if (!pin || pinSalt === null) return;
  DeviceKey.sha256(pinSalt + ':' + pin).then(function (stored) {
    return stored && DeviceKey.sha256(proofNonce + ':' + stored);
  }).then(function (hash) {
    if (!hash) {
      $('pinError').textContent = t('pinUnavailable');
      return;
    }
    signal.send({ type: 'signal', data: { kind: 'pin', hash: hash } });
  });
};

function pinResult(data) {
  if (data.ok) {
    $('pinOverlay').classList.add('hidden');
    notice(t('pinAccepted'));
    return;
  }
  $('pinInput').value = '';
  $('pinError').textContent = data.locked ? t('pinLocked') : t('pinWrong');
}

$('remoteStartBtn').onclick = function () {
  var b = this;
  signal.send({ type: 'signal', data: { kind: 'start-share' } });
  b.disabled = true;
  b.textContent = t('remoteStarting');
  // No picture after a while (the computer couldn't start): allow another try.
  clearTimeout(startTimer);
  startTimer = setTimeout(function () {
    b.disabled = false;
    b.textContent = t('startShare');
  }, 15000);
};

// ---- Darkening the computer's screens, and picking the screen ----
// Offered by the computer to devices that may use it (see share.js).

var privacyState = false;

function updateComputerExtras(caps) {
  privacyState = !!caps.privacy;
  var btn = $('privacyBtn');
  btn.hidden = !caps.mayPrivacy;
  btn.textContent = t(privacyState ? 'privacyLighten' : 'privacyDarken');
  btn.className = privacyState ? 'danger' : 'secondary';

  var select = $('screenSelect');
  var list = Array.isArray(caps.screens) ? caps.screens : [];
  select.innerHTML = '';
  // Shown when the shared picture is not one of the screens (a single window).
  var title = document.createElement('option');
  title.value = '';
  title.disabled = true;
  title.textContent = t('pickScreen');
  select.appendChild(title);
  list.forEach(function (s) {
    var o = document.createElement('option');
    o.value = String(s.id);
    o.textContent = String(s.name);
    select.appendChild(o);
  });
  select.value = list.some(function (s) { return String(s.id) === caps.screen; }) ? caps.screen : '';
  select.hidden = list.length < 2;
}

$('privacyBtn').onclick = function () {
  signal.send({ type: 'signal', data: { kind: 'privacy', on: !privacyState } });
};

$('screenSelect').onchange = function () {
  signal.send({ type: 'signal', data: { kind: 'pick-screen', id: this.value } });
};

$('remoteStopBtn').onclick = function () {
  signal.send({ type: 'signal', data: { kind: 'stop-share' } });
};

var accessKey = null; // from internet links; required by the computer over the tunnel

// A stable random id lets the computer remember this device; the name is what
// the computer shows when asking whether to let it in.
var deviceId = storageGet('ayva-device-id');
if (!deviceId) {
  deviceId = Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(16)), function (b) {
    return ('0' + b.toString(16)).slice(-2);
  }).join('');
  storageSet('ayva-device-id', deviceId);
}

function deviceName() {
  var fromApp = /[?&]name=([^&#]+)/.exec(location.search); // the TV app passes its model
  if (fromApp) return decodeURIComponent(fromApp[1].replace(/\+/g, ' '));
  var ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android ' + t('device_phone') : 'Android ' + t('device_tablet');
  if (/Windows/.test(ua)) return 'Windows ' + t('device_browser');
  if (/Mac OS/.test(ua)) return 'Mac ' + t('device_browser');
  return t('device_browser');
}

function sendJoin() {
  signal.send({ type: 'join', code: code, key: accessKey, deviceId: deviceId, name: deviceName() });
}

function join(newCode) {
  code = newCode;
  storageSet('ayva-last-code', code);
  var hash = '#' + code + (accessKey ? '-' + accessKey : '');
  if (location.hash !== hash) history.replaceState(null, '', hash);
  showWaiting(t('connecting'));
  sendJoin();
}

function retryJoin() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(function () {
    if (code && !joined) sendJoin();
  }, 3000);
}

// Rejected, kicked or a dead link: stop retrying and say why.
function showFinal(text) {
  clearTimeout(retryTimer);
  code = null;
  joined = false;
  closePeer();
  showWaiting(text);
  $('waiting').querySelector('.spinner').hidden = true;
}

function handleOffer(sdp) {
  closePeer(); // also clears video.srcObject, so the new tracks start fresh
  pc = new RTCPeerConnection(iceConfig());
  updateRemoteStart();

  pc.ontrack = function (e) {
    // A slightly deeper buffer (~0.2 s) rides out Wi-Fi hiccups instead of
    // stretching and squeezing the sound to catch up.
    if ('jitterBufferTarget' in e.receiver) e.receiver.jitterBufferTarget = JITTER_BUFFER_MS;
    else if ('playoutDelayHint' in e.receiver) e.receiver.playoutDelayHint = JITTER_BUFFER_MS / 1000;

    // Audio and video arrive as separate streams (see share.js); play both
    // through the one element. Safari doesn't pick up tracks added to a
    // stream that is already playing, so hand it a fresh stream each time.
    var video = $('video');
    var tracks = video.srcObject ? video.srcObject.getTracks().filter(function (old) {
      return old.kind !== e.track.kind;
    }) : [];
    tracks.push(e.track);
    video.srcObject = new MediaStream(tracks);
    if (e.track.kind === 'audio') {
      playAudioTrack(e.track);
      $('unmuteBtn').hidden = !video.muted || audioPath === 'webaudio';
    }
    video.play().catch(function () {
      // Autoplay with sound was blocked: play muted and offer the button.
      if (audioPath !== 'webaudio') {
        video.muted = true;
        $('unmuteBtn').hidden = false;
      }
      video.play().catch(function () {
        // Not even muted (e.g. iPhone in Low Power Mode): needs a tap.
        $('playBtn').hidden = false;
        showVideo();
      });
    });
    // Tracks arrive with the offer, long before any frame. The picture is
    // shown when it starts playing (see the "playing" listener); until then
    // "Connecting to the stream…" stays up instead of a black screen.
    if (pc.connectionState === undefined) showVideo();
    updateExtras();
  };

  pc.onicecandidate = function (e) {
    if (e.candidate) signal.send({ type: 'signal', data: { kind: 'candidate', candidate: e.candidate } });
  };

  // The computer opens a "control" channel for remote control (control.js).
  pc.ondatachannel = function (e) {
    if (e.channel.label === 'control') Control.attach(e.channel);
    else if (e.channel.label === 'transfer') Inbox.attach(e.channel);
  };

  pc.onconnectionstatechange = function () {
    updateExtras();
    if (pc && pc.connectionState === 'failed') {
      showWaiting(t('peerFailed'));
      // If the server connection dropped meanwhile, we're no longer in the
      // room there: join again instead of asking for a new offer.
      if (joined) signal.send({ type: 'signal', data: { kind: 'request' } });
      else if (code) sendJoin();
    }
  };

  showWaiting(t('connectingPeer'));
  offerAt = Date.now();
  var current = pc;
  pc.setRemoteDescription(sdp)
    .then(function () {
      preferH264(current);
      return current.createAnswer();
    })
    .then(function (answer) {
      return current.setLocalDescription({ type: answer.type, sdp: tuneOpus(answer.sdp) });
    })
    .then(function () {
      signal.send({ type: 'signal', data: { kind: 'answer', sdp: current.localDescription } });
    })
    .catch(function (err) { console.error('answer failed', err); });
}

// TV boxes usually decode H.264 in hardware but VP8 (the WebRTC default) in
// software, which can max out a weak CPU and make the sound crackle.
function preferH264(peer) {
  if (!peer.getTransceivers || !window.RTCRtpReceiver || !RTCRtpReceiver.getCapabilities) return;
  var caps = RTCRtpReceiver.getCapabilities('video');
  if (!caps) return;
  var h264 = caps.codecs.filter(function (c) { return /h264/i.test(c.mimeType); });
  if (!h264.length) return;
  var rest = caps.codecs.filter(function (c) { return !/h264/i.test(c.mimeType); });
  peer.getTransceivers().forEach(function (tr) {
    if (tr.receiver.track.kind !== 'video' || !tr.setCodecPreferences) return;
    try { tr.setCodecPreferences(h264.concat(rest)); } catch (e) {}
  });
}

// ---- Playback stats, sent to the computer so problems can be diagnosed there ----

var lastStats = null;

// Frame pacing: averages can say "30 fps" while frames arrive unevenly
// (20 ms, then 50 ms...), which is what the eye sees as stutter. Record the
// gap between frames actually shown on screen.
var frameGaps = [];
var lastFrameTime = 0;

function watchFrames() {
  var video = $('video');
  if (!video.requestVideoFrameCallback) return;
  function onFrame(now) {
    if (lastFrameTime) frameGaps.push(now - lastFrameTime);
    lastFrameTime = now;
    video.requestVideoFrameCallback(onFrame);
  }
  video.requestVideoFrameCallback(onFrame);
}

function takeFramePacing() {
  var gaps = frameGaps;
  frameGaps = [];
  if (gaps.length < 5) return null;
  var sorted = gaps.slice().sort(function (a, b) { return a - b; });
  var median = sorted[Math.floor(sorted.length / 2)];
  // A frame that stays on screen 1.5x longer than usual reads as a hitch.
  var hitches = gaps.filter(function (g) { return g > median * 1.5; }).length;
  return { medianMs: median, maxMs: sorted[sorted.length - 1], hitches: hitches, frames: gaps.length };
}

function deviceType() {
  if (APP) return 'tv';
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'phone' : 'browser';
}

function num(v) {
  return typeof v === 'number' ? v : 0;
}

function collectStats() {
  if (!pc || pc.connectionState !== 'connected') return;
  var current = pc;
  current.getStats().then(function (report) {
    var now = { audio: null, video: null, codecs: {}, rtt: null };
    report.forEach(function (r) {
      if (r.type === 'inbound-rtp' && (r.kind === 'audio' || r.kind === 'video')) now[r.kind] = r;
      else if (r.type === 'codec') now.codecs[r.id] = r.mimeType;
      else if (r.type === 'media-playout') now.playout = r;
      else if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') now.rtt = r.currentRoundTripTime;
    });
    var prev = lastStats;
    lastStats = now;
    if (!prev) return;

    var out = {};
    if (now.audio && prev.audio) {
      var a = now.audio, pa = prev.audio;
      var samples = num(a.totalSamplesReceived) - num(pa.totalSamplesReceived);
      var lost = num(a.packetsLost) - num(pa.packetsLost);
      var received = num(a.packetsReceived) - num(pa.packetsReceived);
      out.audio = {
        lossPct: lost + received > 0 ? (100 * lost) / (lost + received) : 0,
        concealedPct: samples > 0 ? (100 * (num(a.concealedSamples) - num(pa.concealedSamples))) / samples : 0,
        stretchPct: samples > 0
          ? (100 * (num(a.insertedSamplesForDeceleration) - num(pa.insertedSamplesForDeceleration)
            + num(a.removedSamplesForAcceleration) - num(pa.removedSamplesForAcceleration))) / samples
          : 0,
        jitterMs: num(a.jitter) * 1000,
      };
    }
    if (now.video && prev.video) {
      var v = now.video, pv = prev.video;
      var frames = num(v.framesDecoded) - num(pv.framesDecoded);
      out.video = {
        codec: now.codecs[v.codecId] || '',
        decoder: v.decoderImplementation || '',
        width: v.frameWidth || 0,
        height: v.frameHeight || 0,
        fps: v.framesPerSecond || 0,
        decodeMs: frames > 0 ? (1000 * (num(v.totalDecodeTime) - num(pv.totalDecodeTime))) / frames : 0,
        dropped: num(v.framesDropped) - num(pv.framesDropped),
        // Frames arriving per second, before decoding: tells a slow sender
        // apart from a slow TV.
        receivedFps: (num(v.framesReceived) - num(pv.framesReceived)) / 2,
        freezes: num(v.freezeCount) - num(pv.freezeCount),
        freezeMs: 1000 * (num(v.totalFreezesDuration) - num(pv.totalFreezesDuration)),
        jitterMs: num(v.jitter) * 1000,
      };
    }
    // How the sound reaches the speakers, and whether the output ran dry
    // (synthesized = silence/filler played because no audio was ready).
    out.playout = {
      path: audioPath,
      rate: audioCtx ? audioCtx.sampleRate : 0,
      latencyMs: audioCtx ? 1000 * (num(audioCtx.baseLatency) + num(audioCtx.outputLatency)) : 0,
      gapPct: null,
    };
    if (now.playout && prev.playout) {
      var total = num(now.playout.totalSamplesDuration) - num(prev.playout.totalSamplesDuration);
      var synth = num(now.playout.synthesizedSamplesDuration) - num(prev.playout.synthesizedSamplesDuration);
      if (total > 0) out.playout.gapPct = (100 * synth) / total;
    }
    out.pacing = takeFramePacing();
    out.device = deviceType();
    out.rttMs = now.rtt != null ? now.rtt * 1000 : null;
    signal.send({ type: 'signal', data: { kind: 'stats', stats: out } });
  }).catch(function () {});
}

setInterval(collectStats, 2000);
watchFrames();

function handleHostSignal(data) {
  if (!data) return;
  if (data.kind === 'offer') {
    handleOffer(data.sdp);
  } else if (data.kind === 'candidate' && pc) {
    pc.addIceCandidate(data.candidate).catch(function () {});
  } else if (data.kind === 'stopped') {
    closePeer();
    showWaiting(t('waitingHost'));
  } else if (data.kind === 'ice') {
    // Comes before the offer, and again when the credentials are renewed.
    turnIce = Array.isArray(data.iceServers) ? data.iceServers.slice(0, 4) : [];
    if (pc) {
      try { pc.setConfiguration(iceConfig()); } catch (e) { /* kept the old ones */ }
    }
  } else if (data.kind === 'prove') {
    proveDevice(data.nonce);
  } else if (data.kind === 'caps') {
    canRemoteStart = !!data.remoteStart;
    pinSalt = data.pinNeeded ? String(data.pinSalt || '') : null;
    if (typeof Mirror !== 'undefined') Mirror.setAllowed(data.mayMirror);
    if (typeof Camera !== 'undefined') Camera.setAllowed(data.mayCamera);
    updateRemoteStart();
    updateComputerExtras(data);
  } else if (data.kind === 'pin-result') {
    pinResult(data);
  } else if (/^mic-/.test(data.kind)) {
    Mic.handle(data);
  } else if (/^screen-/.test(data.kind)) {
    Mirror.handle(data);
  } else if (/^camera-/.test(data.kind)) {
    Camera.handle(data);
  }
}

// ---- Connection details on the waiting screen ----
// When the picture takes more than a few seconds, show what the connection is
// doing, so a screenshot says where it is stuck.

var offerAt = 0;

// Only once a real frame is there: some WebViews report "playing" before any
// picture has arrived.
function showWhenPicture() {
  if (pc && $('video').videoWidth > 0) showVideo();
}
$('video').addEventListener('playing', showWhenPicture);
$('video').addEventListener('resize', showWhenPicture);

setInterval(function () {
  var detail = $('waitingDetail');
  if (!pc || $('waiting').classList.contains('hidden') || Date.now() - offerAt < 6000) {
    detail.textContent = '';
    return;
  }
  var peer = pc;
  peer.getStats().then(function (report) {
    var local = {};
    var remote = 0;
    var pairs = {};
    var inbound = null;
    report.forEach(function (r) {
      if (r.type === 'inbound-rtp' && r.kind === 'video') inbound = r;
      if (r.type === 'local-candidate') local[r.candidateType] = (local[r.candidateType] || 0) + 1;
      else if (r.type === 'remote-candidate') remote++;
      else if (r.type === 'candidate-pair') pairs[r.state] = (pairs[r.state] || 0) + 1;
    });
    var video = $('video');
    var parts = [
      'peer ' + peer.connectionState + ' / ice ' + peer.iceConnectionState,
      'local ' + (Object.keys(local).map(function (k) { return k + ' ' + local[k]; }).join(', ') || 'none'),
      'remote ' + remote,
      'pairs ' + (Object.keys(pairs).map(function (k) { return k + ' ' + pairs[k]; }).join(', ') || 'none'),
      'in ' + (inbound ? Math.round((inbound.bytesReceived || 0) / 1024) + ' KB, ' + (inbound.framesDecoded || 0) + ' frames' : 'none'),
      'video ' + video.readyState + (video.paused ? ' paused' : ' playing') + ' ' + video.videoWidth + 'x' + video.videoHeight,
    ];
    if (pc === peer) detail.textContent = parts.join(' · ');
  }).catch(function () {});
}, 2000);

function requestWakeLock() {
  if (!navigator.wakeLock || wakeLock) return;
  navigator.wakeLock.request('screen').then(function (lock) {
    wakeLock = lock;
    lock.addEventListener('release', function () { wakeLock = null; });
  }).catch(function () {});
}

document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible' && pc) requestWakeLock();
});

// ---- Code entry: on-screen keypad for TV remotes ----

(function buildKeypad() {
  var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
  keys.forEach(function (k) {
    var b = document.createElement('button');
    b.type = k === 'ok' ? 'submit' : 'button';
    b.textContent = k === 'del' ? '⌫' : k === 'ok' ? '✓' : k;
    if (k === 'del') b.setAttribute('aria-label', t('clear'));
    if (k !== 'ok') {
      b.onclick = function () {
        var input = $('codeInput');
        input.value = k === 'del' ? input.value.slice(0, -1) : (input.value + k).slice(0, 6);
      };
    }
    $('keypad').appendChild(b);
  });
})();

$('codeInput').addEventListener('input', function () {
  this.value = this.value.replace(/\D/g, '').slice(0, 6);
});

$('codeForm').onsubmit = function (e) {
  e.preventDefault();
  var value = $('codeInput').value.replace(/\D/g, '');
  if (value.length !== 6) {
    $('entryError').textContent = t('enterCode');
    return;
  }
  $('entryError').textContent = '';
  join(value);
};

// ---- Player controls ----

$('unmuteBtn').onclick = function () {
  $('video').muted = false;
  $('video').play().catch(function () {});
  this.hidden = true;
};

$('fullscreenBtn').onclick = function () {
  var el = document.documentElement;
  var video = $('video');
  if (document.fullscreenElement) document.exitFullscreen();
  else if (el.requestFullscreen) el.requestFullscreen().catch(function () {});
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  // iPhone Safari can't make a page full screen, only a video, in its own
  // player (fine for watching; remote control needs the normal view).
  else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
};

// ---- Keep the live picture moving ----
// Safari treats the stream like any video and pauses it on its own: when its
// full-screen player closes, in Low Power Mode, or when tracks change. A
// paused live stream looks frozen, so resume it right away; if Safari wants a
// tap first, the ▶ button (or any tap) does it.

function ensurePlaying() {
  var video = $('video');
  if (!video.srcObject || !video.paused) {
    $('playBtn').hidden = true;
    return;
  }
  video.play().then(function () {
    $('playBtn').hidden = true;
  }).catch(function () {
    $('playBtn').hidden = false;
  });
}

$('video').addEventListener('pause', function () { setTimeout(ensurePlaying, 200); });
$('video').addEventListener('webkitendfullscreen', function () { setTimeout(ensurePlaying, 200); });
$('playBtn').onclick = ensurePlaying;
// Any tap counts as the gesture Safari wants (capture: before the touchpad layer).
['touchend', 'click'].forEach(function (ev) {
  document.addEventListener(ev, function () {
    if ($('video').paused) ensurePlaying();
  }, true);
});
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') setTimeout(ensurePlaying, 300);
});

// "Hide buttons": only a small, faint ⋯ in the corner stays, to bring them back.
function setUiHidden(hidden) {
  document.body.classList.toggle('ui-hidden', hidden);
  $('showUiBtn').hidden = !hidden;
  storageSet('ayva-ui-hidden', hidden ? '1' : '0');
}
$('hideUiBtn').onclick = function () { setUiHidden(true); };
$('showUiBtn').onclick = function () { setUiHidden(false); };
$('showUiBtn').setAttribute('aria-label', t('showUi'));
if (!APP && storageGet('ayva-ui-hidden') === '1') setUiHidden(true);

$('changeBtn').onclick = function () {
  // Leaving the room is simplest by reconnecting the socket.
  history.replaceState(null, '', location.pathname);
  showEntry();
  if (signal.ws) signal.ws.close();
};

// Hide the controls and cursor when nothing moves.
var idleTimer = null;
function wake() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(function () { document.body.classList.add('idle'); }, 3000);
}
['mousemove', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, wake); });
wake();

// ---- Start ----

loadConfig().then(function (cfg) {
  config = cfg;
  CLOUD = !!cfg.cloud;
  signal = new Signal({
    open: function () {
      if (CLOUD) Cloud.onOpen(); // password/token first; Cloud rejoins after that
      else if (code && !peerAlive()) sendJoin();
    },
    message: function (msg) {
      if (CLOUD && Cloud.handle(msg)) return;
      if (msg.type === 'joined') {
        joined = true;
        everJoined = true;
        if (!pc) showWaiting(t('waitingHost'));
        updateRemoteStart();
      } else if (msg.type === 'pending') {
        showWaiting(t('waitingApproval'));
      } else if (msg.type === 'rejected') {
        showFinal(t('rejected'));
      } else if (msg.type === 'kicked') {
        showFinal(t('kicked'));
      } else if (msg.type === 'denied') {
        // Wrong or expired access key (internet access was restarted).
        showFinal(t('accessDenied'));
      } else if (msg.type === 'no-room') {
        // First attempt: tell the user. Joined before: the computer is probably restarting, keep trying.
        if (everJoined || APP) {
          retryJoin();
          if (APP) showWaiting(t('hostGone'));
        } else {
          showEntry(t('noRoom'));
        }
      } else if (msg.type === 'host-left') {
        joined = false;
        canRemoteStart = false; // the computer says again once it is back
        pinSalt = null;
        turnIce = [];
        Mirror.setAllowed(false);
        Mirror.stop(t('mirrorEnded'));
        Camera.setAllowed(false);
        Camera.stop(t('cameraEnded'));
        closePeer();
        showWaiting(t('hostGone'));
        retryJoin();
      } else if (msg.type === 'signal') {
        handleHostSignal(msg.data);
      }
    },
    close: function () {
      joined = false;
      updateRemoteStart();
      // The picture comes straight from the computer, not through the server:
      // if it's still flowing, keep showing it and just mention the hiccup.
      if (peerAlive()) notice(t('serverLostKeepWatching'));
      else if (code) showWaiting(t('disconnected'));
    },
  });

  if (CLOUD) {
    // Fixed address: links may name a computer (#<computer id>).
    var hostFromHash = location.hash.match(/^#([A-Za-z0-9_-]{6,64})$/);
    Cloud.start(hostFromHash ? hostFromHash[1] : null);
    return;
  }

  // Links look like #123456, or #123456-<access key> for internet access.
  var fromHash = location.hash.match(/^#?(\d{6})(?:-([A-Za-z0-9_-]+))?/);
  if (fromHash) {
    accessKey = fromHash[2] || null;
    join(fromHash[1]);
  } else {
    showEntry();
  }
});
