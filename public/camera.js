// Showing this phone's camera on the computer. The camera goes to the
// computer over a WebRTC connection of its own (like the microphone, see
// mic.js); the computer shows it in a window. It accepts it only from a
// remembered, proven device whose "Can show its camera" box is ticked there,
// and tells this page so (caps.mayCamera). Browsers allow the camera only on
// https pages, or in the Ayva app; Android stops it while the app or browser
// is not on screen.

var Camera = (function () {
  var buttons = [$('cameraBtn'), $('cameraWaitBtn')];
  var flipButtons = [$('cameraFlipBtn'), $('cameraFlipWaitBtn')];
  var cpc = null;
  var stream = null;
  var state = 'off'; // off | starting | on
  var allowed = false;
  var facing = 'environment'; // the back camera first

  function supported() {
    return !APP && window.isSecureContext && !!navigator.mediaDevices && !!navigator.mediaDevices.getUserMedia;
  }

  function send(data) {
    if (signal) signal.send({ type: 'signal', data: data });
  }

  function update() {
    var show = supported() && (state !== 'off' || (allowed && joined));
    buttons[0].hidden = !show || !pc;
    buttons[1].hidden = !show || !!pc;
    buttons.forEach(function (b) {
      b.textContent = t(state === 'on' ? 'cameraOff' : state === 'starting' ? 'cameraStarting' : 'cameraOn');
      b.className = state === 'on' ? 'danger' : 'secondary';
      b.disabled = state === 'starting';
    });
    flipButtons[0].hidden = state !== 'on' || !pc;
    flipButtons[1].hidden = state !== 'on' || !!pc;
  }

  function setAllowed(on) {
    allowed = !!on;
    update();
  }

  function open() {
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    });
  }

  function start() {
    if (state !== 'off' || !allowed) return;
    state = 'starting';
    update();
    open().then(function (s) {
      if (state !== 'starting') {
        s.getTracks().forEach(function (track) { track.stop(); });
        return;
      }
      stream = s;
      var peer = new RTCPeerConnection(iceConfig());
      cpc = peer;
      s.getVideoTracks().forEach(function (track) {
        // Text and faces stay sharp; a weak link lowers the frame rate first.
        track.contentHint = 'detail';
        peer.addTrack(track, s);
      });
      peer.onicecandidate = function (e) {
        if (e.candidate) send({ kind: 'camera-candidate', candidate: e.candidate });
      };
      peer.onconnectionstatechange = function () {
        if (cpc !== peer) return;
        if (peer.connectionState === 'connected' && state === 'starting') {
          state = 'on';
          update();
          notice(t('cameraLive'));
        } else if (peer.connectionState === 'failed') {
          stop(t('cameraFailed'));
        }
      };
      return peer.createOffer()
        .then(function (offer) { return peer.setLocalDescription(offer); })
        .then(function () { send({ kind: 'camera-offer', sdp: peer.localDescription }); });
    }).catch(function (err) {
      stop(t(err && err.name === 'NotAllowedError' ? 'cameraBlocked' : 'cameraFailed'));
    });
  }

  // Front and back. Many phones open only one camera at a time, so the old
  // one is let go before the other is opened.
  function flip() {
    if (state !== 'on' || !cpc) return;
    var sender = cpc.getSenders().filter(function (s) { return s.track && s.track.kind === 'video'; })[0];
    if (!sender) return;
    facing = facing === 'environment' ? 'user' : 'environment';
    flipButtons.forEach(function (b) { b.disabled = true; });
    stream.getTracks().forEach(function (track) { track.stop(); });
    open().then(function (s) {
      if (state !== 'on') {
        s.getTracks().forEach(function (track) { track.stop(); });
        return;
      }
      stream = s;
      var track = s.getVideoTracks()[0];
      track.contentHint = 'detail';
      return sender.replaceTrack(track);
    }).catch(function () {
      stop(t('cameraFailed'));
    }).then(function () {
      flipButtons.forEach(function (b) { b.disabled = false; });
    });
  }

  // Ends showing the camera; message (optional) says why.
  function stop(message) {
    if (state === 'off') return;
    if (cpc) send({ kind: 'camera-stop' });
    if (cpc) cpc.close();
    cpc = null;
    if (stream) stream.getTracks().forEach(function (track) { track.stop(); });
    stream = null;
    state = 'off';
    update();
    if (message) notice(message);
  }

  // Messages from the computer about the camera connection.
  function handle(data) {
    if (data.kind === 'camera-answer' && cpc) {
      var peer = cpc;
      peer.setRemoteDescription(data.sdp)
        .then(function () { flushCandidates(peer); })
        .catch(function () { stop(t('cameraFailed')); });
    } else if (data.kind === 'camera-candidate' && cpc) {
      addCandidate(cpc, data.candidate);
    } else if (data.kind === 'camera-refused') {
      stop(t('cameraRefused'));
    } else if (data.kind === 'camera-stop') {
      stop(t('cameraEnded'));
    } else if (data.kind === 'camera-ask') {
      // Asked from the computer's Watch section.
      if (!supported() || !allowed) send({ kind: 'camera-cant' });
      else if (state === 'off') askFromComputer(t('askCamera'), start);
    }
  }

  buttons.forEach(function (b) {
    b.onclick = function () {
      if (state === 'off') start();
      else stop();
    };
  });
  flipButtons.forEach(function (b) { b.onclick = flip; });

  return { update: update, setAllowed: setAllowed, stop: stop, handle: handle };
})();
