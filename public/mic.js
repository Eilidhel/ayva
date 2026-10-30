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
    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    }).then(function (s) {
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
