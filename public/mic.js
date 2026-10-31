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
  // With headphones nothing echoes back into the microphone, so no canceller.
  var HEADPHONES = { echoCancellation: false, noiseSuppression: true, autoGainControl: true };
  // Plugged-in or wireless headphones. Not "Headset earpiece": Chrome's name
  // for every phone's own call speaker, which would turn the canceller off
  // with the sound coming out of the loudspeaker.
  var HEADSET = /bluetooth|wired|usb|headphone|hands-?free|airpods|buds|\bbt\b|sco/i;

  // On Android the echo canceller puts the phone in "phone call" mode: a
  // Bluetooth headset then switches to its call profile (the stream's sound
  // stops), and naming the phone's own microphone moves the sound to the
  // loudspeaker. Without the canceller the phone stays in media mode: the
  // sound keeps playing in the headphones and the phone's microphone is used.
  // Device names are only known once the microphone was allowed, so the first
  // time the check is made after opening it.
  function headphones() {
    if (!navigator.mediaDevices.enumerateDevices) return Promise.resolve(false);
    return navigator.mediaDevices.enumerateDevices().then(function (devices) {
      return devices.some(function (d) { return d.label && HEADSET.test(d.label); });
    }).catch(function () { return false; });
  }

  function openMic() {
    var withHeadphones;
    return headphones().then(function (h) {
      withHeadphones = h;
      return navigator.mediaDevices.getUserMedia({ audio: h ? HEADPHONES : VOICE });
    }).then(function (s) {
      if (withHeadphones) return s;
      return headphones().then(function (h) {
        if (!h) return s;
        s.getTracks().forEach(function (t) { t.stop(); });
        return navigator.mediaDevices.getUserMedia({ audio: HEADPHONES });
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
