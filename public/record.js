// Recording the stream on this device (phone or browser). The video is made
// right here and saved from the inbox; nothing extra goes over the network.
// The computer is told, so the person there can see who is recording.

var Recorder = (function () {
  var btn = $('recordBtn');
  var supported = !APP && typeof MediaRecorder !== 'undefined';
  // MP4 first: phones' galleries and players take it without trouble.
  var TYPES = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  var rec = null;
  var chunks = [];
  var startedAt = 0;
  var clock = null;

  function pickType() {
    for (var i = 0; i < TYPES.length; i++) {
      if (MediaRecorder.isTypeSupported(TYPES[i])) return TYPES[i];
    }
    return '';
  }

  function hasPicture() {
    var s = $('video').srcObject;
    return !!s && s.getVideoTracks().some(function (track) { return track.readyState === 'live'; });
  }

  function elapsed() {
    var s = Math.floor((Date.now() - startedAt) / 1000);
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  function update() {
    btn.hidden = !supported || !(rec || hasPicture());
    btn.textContent = rec ? t('recordStop') + ' ' + elapsed() : t('record');
    btn.className = rec ? 'danger' : 'secondary';
  }

  function tellComputer(on) {
    if (signal) signal.send({ type: 'signal', data: { kind: 'recording', on: on } });
  }

  function start() {
    if (rec || !hasPicture()) return;
    var type = pickType();
    try {
      // About 30 MB per minute: long recordings stay within a phone's memory.
      var options = { videoBitsPerSecond: 4000000, audioBitsPerSecond: 128000 };
      if (type) options.mimeType = type;
      rec = new MediaRecorder(new MediaStream($('video').srcObject.getTracks()), options);
    } catch (e) {
      rec = null;
      notice(t('recordFailed'));
      return;
    }
    chunks = [];
    var current = rec;
    rec.ondataavailable = function (e) {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    rec.onstop = function () { finish(current); };
    rec.start(1000);
    startedAt = Date.now();
    clock = setInterval(update, 1000);
    tellComputer(true);
    update();
  }

  function stop() {
    if (rec && rec.state !== 'inactive') rec.stop();
  }

  function finish(done) {
    if (rec !== done) return;
    rec = null;
    clearInterval(clock);
    tellComputer(false);
    update();
    var type = (done.mimeType || 'video/webm').split(';')[0];
    var blob = new Blob(chunks, { type: type });
    chunks = [];
    if (!blob.size) return;
    var d = new Date();
    var pad = function (n) { return ('0' + n).slice(-2); };
    var name = 'Ayva ' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
      + ' ' + pad(d.getHours()) + '.' + pad(d.getMinutes()) + (type === 'video/mp4' ? '.mp4' : '.webm');
    Inbox.addFile(name, blob);
    notice(t('recordSaved'));
  }

  btn.onclick = function () {
    if (rec) stop();
    else start();
  };

  return { update: update, stop: stop };
})();
