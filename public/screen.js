// Showing this phone's screen on the computer (the Ayva app on Android only).
// The app captures and encodes the screen in hardware (ScreenService, H.264)
// and hands each picture to this page through the AyvaScreen object. The page
// passes them on over a WebRTC data channel of its own, which the computer
// opens only for a remembered, proven device whose "Can show its screen" box
// is ticked there. The computer decodes them in a window (mirror.html).
//
// Pictures on the channel are split into chunks. Each chunk starts with one
// byte: 1 = key frame, 2 = first chunk, 4 = last chunk; the first chunk then
// has the picture's time in µs (8 bytes, big-endian) before the data. The
// phone's sound (ScreenAudio, Opus) goes as single messages with byte 8 and
// its time on the same clock, so the computer plays it in step.

var Mirror = (function () {
  var bridge = window.AyvaScreen || null;
  var buttons = [$('screenBtn'), $('screenWaitBtn')];
  // Battery saving may close the app in the background while it shows the
  // screen; when the app says its battery use is limited, a button leads to
  // its settings ("Unrestricted").
  var batteryButtons = [$('batteryBtn'), $('batteryWaitBtn')];
  var batteryLimited = false;
  var batteryNoticed = false;
  var state = 'off'; // off | asking (Android's question) | connecting | on
  var allowed = false; // the computer says this device may
  var peer = null;
  var dc = null;
  var skipping = false; // fell behind: wait for the next key frame

  var CHUNK = 16 * 1024;
  // About a third of a second at the starting rate: more waiting means the
  // network can't keep up, and on a crowded Wi-Fi it is better to lower the
  // rate early than to let pictures pile up (seen as stutter and delay).
  var MAX_BUFFERED = 256 * 1024;
  var START_RATE = 6000000;
  var MIN_RATE = 1000000;
  var rate = START_RATE;
  var lastDrop = 0;
  var skipped = 0; // pictures left out here since the last report
  var appSkipped = 0; // ...and in the app, before they reached this page
  var soundLevel = null; // the phone's sound lately, in dB ("none": not captured)
  // Pictures over the last report: made by the app's encoder, reaching this
  // page, and sent on; where they stop counting is where they get stuck.
  var encoded = 0, got = 0, sent = 0, statsAt = Date.now();

  function send(data) {
    if (signal) signal.send({ type: 'signal', data: data });
  }

  function update() {
    var show = !!bridge && (state !== 'off' || (allowed && joined));
    buttons[0].hidden = !show || !pc;
    buttons[1].hidden = !show || !!pc;
    buttons.forEach(function (b) {
      b.textContent = t(state === 'on' ? 'mirrorOff' : state === 'off' ? 'mirrorOn' : 'mirrorStarting');
      b.className = state === 'on' ? 'danger' : 'secondary';
      b.disabled = state === 'asking' || state === 'connecting';
    });
    var offerBattery = !!bridge && batteryLimited && (state !== 'off' || (allowed && joined));
    batteryButtons[0].hidden = !offerBattery || !pc;
    batteryButtons[1].hidden = !offerBattery || !!pc;
  }

  function setAllowed(on) {
    allowed = !!on;
    if (bridge && allowed) bridge.postMessage('battery?');
    update();
  }

  // Coming back from Android's settings: is battery use still limited?
  document.addEventListener('visibilitychange', function () {
    if (bridge && document.visibilityState === 'visible' && allowed) bridge.postMessage('battery?');
  });

  function start() {
    if (!bridge || !allowed || state !== 'off') return;
    state = 'asking';
    batteryNoticed = false;
    rate = START_RATE;
    update();
    bridge.postMessage('start');
  }

  // Ends showing the screen; message (optional) says why on this phone, reason
  // (default "phone") on the computer.
  function stop(message, reason) {
    if (state === 'off') return;
    reason = reason || 'phone';
    // Over the channel first: it arrives before the channel closes.
    if (dc && dc.readyState === 'open') {
      try { dc.send(JSON.stringify({ t: 'stop', reason: reason })); } catch (e) { /* closing anyway */ }
    }
    if (state === 'connecting' || state === 'on') send({ kind: 'screen-stop', reason: reason });
    if (peer) peer.close();
    peer = null;
    dc = null;
    if (bridge) bridge.postMessage('stop');
    state = 'off';
    update();
    if (message) notice(message);
  }

  // From the app: Android's answer, and the capture ending on its own (the
  // notification's Stop button, or the system stopping it).
  function fromApp(text) {
    if (text === 'on') {
      // Given up while Android was still asking: the capture isn't wanted any more.
      if (state !== 'asking') {
        if (state === 'off') bridge.postMessage('stop');
        return;
      }
      state = 'connecting';
      update();
      send({ kind: 'screen-request' });
    } else if (text === 'denied') {
      stop();
    } else if (text.indexOf('off:') === 0) {
      // notification, system, or app (asked for here: already off).
      stop(t('mirrorEnded'), text.slice(4));
    } else if (text === 'failed') {
      stop(t('mirrorFailed'), 'failed');
    } else if (text.indexOf('stats:') === 0) {
      // "<pictures skipped in the app>,<sound level in dB, or none>"
      var parts = text.slice(6).split(',');
      appSkipped += Number(parts[0]) || 0;
      soundLevel = parts[1] === undefined ? null : parts[1];
      encoded += Number(parts[2]) || 0;
    } else if (text === 'battery:limited' || text === 'battery:ok') {
      batteryLimited = text === 'battery:limited';
      // Said once each time the screen starts being shown.
      if (batteryLimited && state === 'on' && !batteryNoticed) {
        batteryNoticed = true;
        notice(t('batteryLimited'));
      }
      update();
    } else if (text === 'sound:pc-failed') {
      // Turning this phone's volume down silenced the captured sound too: it plays on both.
      if (dc && dc.readyState === 'open') dc.send(JSON.stringify({ t: 'sound-failed' }));
    } else if (text.indexOf('debug:') === 0) {
      nativeDebug = text.slice(6);
    } else if (text === 'screen:off' || text === 'screen:on') {
      // The phone's own screen: off means no new pictures until it is on again.
      if (dc && dc.readyState === 'open') dc.send(JSON.stringify({ t: 'phone-screen', on: text === 'screen:on' }));
    }
  }

  function sendPicture(buf) {
    if (state !== 'on' || !dc || dc.readyState !== 'open') return;
    var bytes = new Uint8Array(buf);
    if (bytes.length < 10) return;
    // Sound (flag 8): one small packet, sent as it is unless the link is badly behind.
    if (bytes[0] & 8) {
      if (dc.bufferedAmount <= MAX_BUFFERED * 2) {
        dc.send(bytes);
        times.sound = Date.now();
      }
      return;
    }
    var key = bytes[0] & 1;
    got++;
    times.fromApp = Date.now();
    if (dc.bufferedAmount > MAX_BUFFERED) {
      skipped++;
      if (!skipping) {
        skipping = true;
        slower();
        bridge.postMessage('key');
      }
      return;
    }
    if (skipping && !key) {
      skipped++;
      return;
    }
    skipping = false;
    var body = bytes.subarray(9);
    var off = 0;
    while (off < body.length) {
      var n = Math.min(CHUNK, body.length - off);
      var first = off === 0;
      var head = first ? 9 : 1;
      var msg = new Uint8Array(head + n);
      if (first) msg.set(bytes.subarray(0, 9));
      msg[0] = key | (first ? 2 : 0) | (off + n >= body.length ? 4 : 0);
      msg.set(body.subarray(off, off + n), head);
      dc.send(msg);
      if (first) {
        sent++;
        times.sent = Date.now();
      }
      off += n;
    }
  }

  // The network fell behind: a lower rate, raised again after a calm while.
  function slower() {
    rate = Math.max(MIN_RATE, Math.round(rate * 0.7));
    lastDrop = Date.now();
    bridge.postMessage('bitrate:' + rate);
  }

  // Also reports to the computer, which shows it under the picture. In the
  // background Android's WebView slows timers down, so this may come rarely.
  setInterval(function () {
    if (state !== 'on') return;
    bridge.postMessage('stats');
    if (dc && dc.readyState === 'open') {
      dc.send(JSON.stringify({
        t: 'stats', rate: rate, skipped: skipped, appSkipped: appSkipped, buffered: dc.bufferedAmount, sound: soundLevel,
        encoded: encoded, got: got, sent: sent, ms: Date.now() - statsAt,
      }));
    }
    skipped = 0;
    appSkipped = 0;
    encoded = 0;
    got = 0;
    sent = 0;
    statsAt = Date.now();
    if (rate >= START_RATE || Date.now() - lastDrop < 10000) return;
    rate = Math.min(START_RATE, Math.round(rate * 1.2));
    lastDrop = Date.now();
    bridge.postMessage('bitrate:' + rate);
  }, 2000);

  // The computer accepted and opens the channel.
  function answer(sdp) {
    if (state !== 'connecting' || peer) return;
    var p = new RTCPeerConnection(iceConfig());
    peer = p;
    p.ondatachannel = function (e) {
      if (peer !== p || e.channel.label !== 'screen') return;
      dc = e.channel;
      dc.binaryType = 'arraybuffer';
      dc.onopen = function () {
        if (peer !== p) return;
        state = 'on';
        skipping = false;
        update();
        notice(t('mirrorLive'));
        bridge.postMessage('key');
        bridge.postMessage('battery?'); // a notice if battery saving may close the app
      };
      // The computer asks for a key frame when it (re)starts decoding, and
      // says where the phone's sound should play.
      dc.onmessage = function (m) {
        if (typeof m.data !== 'string') return;
        if (m.data === 'key') {
          bridge.postMessage('key');
          return;
        }
        var cmd;
        try { cmd = JSON.parse(m.data); } catch (e) { return; }
        // Where the sound plays: on the computer only (this phone muted) or on both.
        if (cmd && cmd.t === 'sound') bridge.postMessage(cmd.where === 'both' ? 'sound:both' : 'sound:pc');
      };
      dc.onclose = function () {
        if (peer === p) stop(t('mirrorEnded'), 'connection');
      };
    };
    p.onicecandidate = function (e) {
      if (e.candidate) send({ kind: 'screen-candidate', candidate: e.candidate });
    };
    p.onconnectionstatechange = function () {
      if (peer === p && p.connectionState === 'failed') stop(t('mirrorFailed'), 'connection');
    };
    p.setRemoteDescription(sdp)
      .then(function () {
        flushCandidates(p);
        return p.createAnswer();
      })
      .then(function (a) { return p.setLocalDescription(a); })
      .then(function () { send({ kind: 'screen-answer', sdp: p.localDescription }); })
      .catch(function () { if (peer === p) stop(t('mirrorFailed')); });
  }

  // Messages from the computer about showing the screen.
  function handle(data) {
    if (data.kind === 'screen-offer') {
      answer(data.sdp);
    } else if (data.kind === 'screen-candidate' && peer) {
      addCandidate(peer, data.candidate);
    } else if (data.kind === 'screen-refused') {
      stop(t('mirrorRefused'));
    } else if (data.kind === 'screen-stop') {
      stop(t('mirrorEnded'));
    }
  }

  if (bridge) {
    bridge.onmessage = function (e) {
      if (typeof e.data === 'string') fromApp(e.data);
      else sendPicture(e.data);
    };
  }

  buttons.forEach(function (b) {
    b.onclick = function () {
      if (state === 'off') start();
      else stop();
    };
  });
  batteryButtons.forEach(function (b) {
    b.onclick = function () {
      notice(t('batteryHowTo'));
      bridge.postMessage('battery-settings');
    };
  });

  // Read over ADB in test builds (chrome://inspect) when the picture stops:
  // Mirror.debug() asks the app for its side and returns both, as of now.
  var nativeDebug = '';
  var times = { fromApp: 0, sent: 0, sound: 0 };
  function debug() {
    if (bridge) bridge.postMessage('debug');
    var now = Date.now();
    return {
      state: state, skipping: skipping, rate: rate, dc: dc ? dc.readyState : null,
      buffered: dc ? dc.bufferedAmount : null, peer: peer ? peer.connectionState : null,
      msSincePictureFromApp: times.fromApp ? now - times.fromApp : null,
      msSincePictureSent: times.sent ? now - times.sent : null,
      msSinceSoundSent: times.sound ? now - times.sound : null,
      visible: document.visibilityState, app: nativeDebug,
    };
  }

  return { update: update, setAllowed: setAllowed, stop: stop, handle: handle, debug: debug };
})();
