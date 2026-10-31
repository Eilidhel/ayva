// Talking through the computer's speakers. This device's microphone goes to
// the computer over a WebRTC connection of its own, next to the one bringing
// the picture. The computer plays it only for remembered devices, or while
// remote control is on. Browsers allow the microphone only on https pages
// (the fixed address or an internet link), not on http://192.168.x.x.

var Mic = (function () {
  var btn = $('micBtn');
  var mpc = null;
  var stream = null;
  var state = 'off'; // off | starting | on

  function send(data) {
    if (signal) signal.send({ type: 'signal', data: data });
  }

  var VOICE = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  var HEADSET = /bluetooth|headset|hands-?free|airpods|buds|\bbt\b|sco/i;

  // A Bluetooth headset's microphone switches it to "phone call" mode, and on
  // Android that stops the stream's sound in the headset. So when a Bluetooth
  // headset is connected, talk through the phone's own microphone instead.
  // Device names are only known once the microphone was allowed, so the first
  // time the choice is made after opening it.
  function pickMic() {
    if (!navigator.mediaDevices.enumerateDevices) return Promise.resolve(null);
    return navigator.mediaDevices.enumerateDevices().then(function (devices) {
      var inputs = devices.filter(function (d) {
        return d.kind === 'audioinput' && d.label && d.deviceId !== 'default' && d.deviceId !== 'communications';
      });
      var headset = inputs.some(function (d) { return HEADSET.test(d.label); });
      var builtIn = inputs.filter(function (d) { return !HEADSET.test(d.label); })[0];
      return headset && builtIn ? builtIn.deviceId : null;
    }).catch(function () { return null; });
  }

  function openMic() {
    return pickMic().then(function (deviceId) {
      var audio = Object.assign({}, VOICE);
      if (deviceId) audio.deviceId = { exact: deviceId };
      return navigator.mediaDevices.getUserMedia({ audio: audio });
    }).then(function (s) {
      var track = s.getAudioTracks()[0];
      if (!track || !HEADSET.test(track.label)) return s;
      // Opened the headset after all (names were unknown before): switch.
      return pickMic().then(function (deviceId) {
        if (!deviceId) return s;
        s.getTracks().forEach(function (t) { t.stop(); });
        var audio = Object.assign({ deviceId: { exact: deviceId } }, VOICE);
        return navigator.mediaDevices.getUserMedia({ audio: audio });
      });
    });
  }

  function update() {
    btn.hidden = APP || !(state !== 'off' || peerAlive());
    btn.textContent = t(state === 'on' ? 'micOff' : state === 'starting' ? 'micStarting' : 'micOn');
    btn.className = state === 'on' ? 'danger' : 'secondary';
    btn.disabled = state === 'starting';
  }

  function start() {
    if (state !== 'off') return;
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      notice(t('micNeedsHttps'));
      return;
    }
    state = 'starting';
    update();
    openMic().then(function (s) {
      if (state !== 'starting') {
        s.getTracks().forEach(function (track) { track.stop(); });
        return;
      }
      stream = s;
      var peer = new RTCPeerConnection(iceConfig());
      mpc = peer;
      s.getAudioTracks().forEach(function (track) { peer.addTrack(track, s); });
      peer.onicecandidate = function (e) {
        if (e.candidate) send({ kind: 'mic-candidate', candidate: e.candidate });
      };
      peer.onconnectionstatechange = function () {
        if (mpc !== peer) return;
        if (peer.connectionState === 'connected' && state === 'starting') {
          state = 'on';
          update();
          notice(t('micLive'));
        } else if (peer.connectionState === 'failed') {
          stop(t('micFailed'));
        }
      };
      return peer.createOffer()
        .then(function (offer) { return peer.setLocalDescription(offer); })
        .then(function () { send({ kind: 'mic-offer', sdp: peer.localDescription }); });
    }).catch(function (err) {
      stop(t(err && err.name === 'NotAllowedError' ? 'micBlocked' : 'micFailed'));
    });
  }

  // Ends the microphone connection; message (optional) says why.
  function stop(message) {
    if (state === 'off') return;
    if (mpc) send({ kind: 'mic-stop' });
    if (mpc) mpc.close();
    mpc = null;
    if (stream) stream.getTracks().forEach(function (track) { track.stop(); });
    stream = null;
    state = 'off';
    update();
    if (message) notice(message);
  }

  // Messages from the computer about the microphone connection.
  function handle(data) {
    if (data.kind === 'mic-answer' && mpc) {
      var peer = mpc;
      peer.setRemoteDescription(data.sdp)
        .then(function () { flushCandidates(peer); })
        .catch(function () { stop(t('micFailed')); });
    } else if (data.kind === 'mic-candidate' && mpc) {
      addCandidate(mpc, data.candidate);
    } else if (data.kind === 'mic-refused') {
      stop(t('micRefused'));
    }
  }

  btn.onclick = function () {
    if (state === 'off') start();
    else stop();
  };

  return { update: update, stop: stop, handle: handle };
})();
