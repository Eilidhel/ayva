// Remote control from the viewer side. Sends mouse/keyboard messages to the
// computer over the "control" data channel; the computer only acts on them
// while its user has switched control on, and tells us when that changes.
//
// Three ways to control, picked by device:
// - TV app: remote D-pad moves the cursor, OK clicks (hold for right click).
// - Touch screens: the picture works like a laptop touchpad, plus a keyboard.
// - Mouse: point and click on the picture, type on the keyboard.

var Control = (function () {
  var channel = null;
  var enabled = false;
  var absolute = false;
  var mode = APP ? 'remote'
    : ('ontouchstart' in window && window.matchMedia && matchMedia('(pointer: coarse)').matches) ? 'touch'
    : 'mouse';
  var layer = $('touchLayer');
  var toastTimer = null;

  function send(msg) {
    if (enabled && channel && channel.readyState === 'open') channel.send(JSON.stringify(msg));
  }

  function setState(on, abs) {
    var changed = on !== enabled;
    enabled = on;
    absolute = abs;
    document.body.classList.toggle('control-on', enabled);
    document.body.classList.toggle('control-' + mode, true);
    if (!enabled) {
      stopRemoteMotion();
      if (document.pointerLockElement) document.exitPointerLock();
      $('kbBar').hidden = true;
    }
    if (changed) toast(t(enabled ? 'controlEnabled' : 'controlDisabled'));
  }

  function toast(text) {
    var el = $('controlToast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3000);
  }

  function attach(dc) {
    channel = dc;
    dc.onmessage = function (e) {
      var msg;
      try { msg = JSON.parse(e.data); } catch (err) { return; }
      if (msg.t === 'state') setState(!!msg.enabled, !!msg.absolute);
    };
    dc.onclose = function () { if (channel === dc) setState(false, false); };
  }

  function detach() {
    channel = null;
    setState(false, false);
  }

  // ---- Shared: batch relative motion into one message per animation frame ----

  var pendingDx = 0;
  var pendingDy = 0;
  var moveScheduled = false;

  function queueMove(dx, dy) {
    pendingDx += dx;
    pendingDy += dy;
    if (moveScheduled) return;
    moveScheduled = true;
    requestAnimationFrame(function () {
      moveScheduled = false;
      var dx2 = Math.round(pendingDx);
      var dy2 = Math.round(pendingDy);
      pendingDx -= dx2;
      pendingDy -= dy2;
      if (dx2 || dy2) send({ t: 'move', dx: dx2, dy: dy2 });
    });
  }

  // ---- Touch: touchpad gestures ----

  var touch = {
    startTime: 0, lastX: 0, lastY: 0, lastT: 0, moved: 0, maxFingers: 0,
    lastTapTime: 0, lastTapX: 0, lastTapY: 0, dragging: false, wheelAcc: 0,
  };

  function avg(touches) {
    var x = 0, y = 0;
    for (var i = 0; i < touches.length; i++) { x += touches[i].clientX; y += touches[i].clientY; }
    return { x: x / touches.length, y: y / touches.length };
  }

  layer.addEventListener('touchstart', function (e) {
    if (!enabled || mode !== 'touch') return;
    e.preventDefault();
    var p = avg(e.touches);
    if (e.touches.length === 1) {
      touch.startTime = Date.now();
      touch.moved = 0;
      touch.maxFingers = 1;
      // Tap, then touch again and slide = drag (like a laptop touchpad).
      if (Date.now() - touch.lastTapTime < 300
        && Math.abs(p.x - touch.lastTapX) < 40 && Math.abs(p.y - touch.lastTapY) < 40) {
        touch.dragging = true;
        send({ t: 'button', b: 'left', down: true });
      }
    }
    touch.maxFingers = Math.max(touch.maxFingers, e.touches.length);
    touch.lastX = p.x;
    touch.lastY = p.y;
    touch.lastT = performance.now();
  }, { passive: false });

  layer.addEventListener('touchmove', function (e) {
    if (!enabled || mode !== 'touch') return;
    e.preventDefault();
    var p = avg(e.touches);
    var dx = p.x - touch.lastX;
    var dy = p.y - touch.lastY;
    var now = performance.now();
    var dt = Math.max(1, now - touch.lastT);
    touch.moved += Math.abs(dx) + Math.abs(dy);
    if (e.touches.length >= 2) {
      // Two fingers scroll, following the fingers like on a phone.
      touch.wheelAcc += dy * 3;
      var notches = Math.trunc(touch.wheelAcc / 40) * 40;
      if (notches) {
        send({ t: 'wheel', dx: 0, dy: notches });
        touch.wheelAcc -= notches;
      }
    } else {
      // Faster swipes travel further, so both precise and long moves work.
      var speed = Math.sqrt(dx * dx + dy * dy) / dt;
      var gain = 1.5 + Math.min(speed, 3) * 1.5;
      queueMove(dx * gain, dy * gain);
    }
    touch.lastX = p.x;
    touch.lastY = p.y;
    touch.lastT = now;
  }, { passive: false });

  layer.addEventListener('touchend', function (e) {
    if (!enabled || mode !== 'touch') return;
    e.preventDefault();
    if (e.touches.length > 0) return; // wait for the last finger
    var quick = Date.now() - touch.startTime < 250 && touch.moved < 12;
    if (touch.dragging) {
      send({ t: 'button', b: 'left', down: false });
      touch.dragging = false;
    } else if (quick && touch.maxFingers >= 2) {
      send({ t: 'click', b: 'right' });
    } else if (quick) {
      send({ t: 'click', b: 'left' });
      touch.lastTapTime = Date.now();
      touch.lastTapX = touch.lastX;
      touch.lastTapY = touch.lastY;
    }
    touch.wheelAcc = 0;
  }, { passive: false });

  // ---- Touch: keyboard ----
  // A hidden text field brings up the phone's keyboard. What the user types is
  // compared with what was there before, so autocorrect and word suggestions
  // turn into the right backspaces and letters on the computer. The field
  // starts with one space so that Backspace on an "empty" field is noticed.

  var kb = $('kbInput');
  var kbSent = '';

  function resetKeyboardField() {
    kb.value = ' ';
    kbSent = '';
  }

  kb.addEventListener('input', function () {
    var v = kb.value;
    if (v === '') {
      send({ t: 'key', code: 'Backspace' });
      resetKeyboardField();
      return;
    }
    var cur = v.charAt(0) === ' ' ? v.slice(1) : v;
    var p = 0;
    while (p < cur.length && p < kbSent.length && cur.charAt(p) === kbSent.charAt(p)) p++;
    for (var i = 0; i < kbSent.length - p; i++) send({ t: 'key', code: 'Backspace' });
    if (cur.length > p) send({ t: 'text', s: cur.slice(p) });
    kbSent = cur;
    if (kbSent.length > 200) resetKeyboardField();
  });

  kb.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      send({ t: 'key', code: 'Enter' });
      resetKeyboardField();
    }
  });

  $('kbBtn').onclick = function () {
    resetKeyboardField();
    $('kbBar').hidden = false;
    kb.focus();
  };

  // Keys a phone keyboard doesn't have.
  var bar = $('kbBar');
  [['Esc', 'Escape'], ['Tab', 'Tab'], ['←', 'ArrowLeft'], ['↑', 'ArrowUp'], ['↓', 'ArrowDown'],
    ['→', 'ArrowRight'], ['⌫', 'Backspace'], ['Win', 'MetaLeft']].forEach(function (k) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'secondary';
    b.textContent = k[0];
    // Keep focus in the text field so the phone keyboard stays open.
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    b.addEventListener('touchstart', function (e) {
      e.preventDefault();
      send({ t: 'key', code: k[1] });
    }, { passive: false });
    b.onclick = function () { send({ t: 'key', code: k[1] }); };
    bar.appendChild(b);
  });
  var hide = document.createElement('button');
  hide.type = 'button';
  hide.textContent = '✕';
  hide.onclick = function () { bar.hidden = true; kb.blur(); };
  bar.appendChild(hide);

  // ---- Mouse: point and click on the picture ----

  var BUTTON_NAMES = ['left', 'middle', 'right'];
  var pendingAbs = null;

  function videoPoint(e) {
    // The picture is letterboxed inside the element (object-fit: contain).
    var video = $('video');
    var r = video.getBoundingClientRect();
    var vw = video.videoWidth || 16;
    var vh = video.videoHeight || 9;
    var scale = Math.min(r.width / vw, r.height / vh);
    var w = vw * scale;
    var h = vh * scale;
    var x = (e.clientX - r.left - (r.width - w) / 2) / w;
    var y = (e.clientY - r.top - (r.height - h) / 2) / h;
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  }

  layer.addEventListener('mousemove', function (e) {
    if (!enabled || mode !== 'mouse') return;
    if (absolute) {
      var first = !pendingAbs;
      pendingAbs = videoPoint(e);
      if (first) {
        requestAnimationFrame(function () {
          send({ t: 'abs', x: pendingAbs.x, y: pendingAbs.y });
          pendingAbs = null;
        });
      }
    } else if (document.pointerLockElement === layer) {
      queueMove(e.movementX, e.movementY);
    }
  });

  layer.addEventListener('mousedown', function (e) {
    if (!enabled || mode !== 'mouse') return;
    e.preventDefault();
    // A shared window can't be pointed at directly: lock the pointer and move
    // the computer's cursor relatively instead (Esc releases it).
    if (!absolute && document.pointerLockElement !== layer) {
      layer.requestPointerLock();
      return;
    }
    if (absolute) {
      var p = videoPoint(e);
      send({ t: 'abs', x: p.x, y: p.y });
    }
    send({ t: 'button', b: BUTTON_NAMES[e.button] || 'left', down: true });
  });

  layer.addEventListener('mouseup', function (e) {
    if (!enabled || mode !== 'mouse') return;
    e.preventDefault();
    send({ t: 'button', b: BUTTON_NAMES[e.button] || 'left', down: false });
  });

  layer.addEventListener('contextmenu', function (e) {
    if (enabled) e.preventDefault();
  });

  layer.addEventListener('wheel', function (e) {
    if (!enabled || mode !== 'mouse') return;
    e.preventDefault();
    var unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1; // lines / pages -> pixels
    send({ t: 'wheel', dx: Math.round(e.deltaX * unit * 1.2), dy: Math.round(-e.deltaY * unit * 1.2) });
  }, { passive: false });

  window.addEventListener('keydown', function (e) {
    if (!enabled || mode !== 'mouse' || e.isComposing) return;
    if (e.target && e.target.tagName === 'INPUT') return;
    e.preventDefault();
    send({ t: 'key', code: e.code, down: true });
  });

  window.addEventListener('keyup', function (e) {
    if (!enabled || mode !== 'mouse') return;
    if (e.target && e.target.tagName === 'INPUT') return;
    e.preventDefault();
    send({ t: 'key', code: e.code, down: false });
  });

  // Switching away mid-shortcut must not leave Ctrl/Alt held on the computer.
  window.addEventListener('blur', function () {
    if (enabled && mode === 'mouse') send({ t: 'release' });
  });

  // ---- TV remote ----
  // Arrow keys glide the cursor and speed up while held; OK clicks, holding
  // OK right-clicks; media keys go to the computer's player.

  var held = {};
  var motionFrame = null;
  var okDownAt = 0;
  var REMOTE_DIRS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  var REMOTE_KEYS = {
    MediaPlayPause: 'MediaPlayPause', MediaPlay: 'MediaPlayPause', MediaPause: 'MediaPlayPause',
    MediaTrackNext: 'MediaTrackNext', MediaTrackPrevious: 'MediaTrackPrevious', MediaStop: 'MediaStop',
    MediaFastForward: 'ArrowRight', MediaRewind: 'ArrowLeft',
  };

  function remoteMotion() {
    var now = performance.now();
    var dx = 0, dy = 0;
    Object.keys(held).forEach(function (key) {
      var dir = REMOTE_DIRS[key];
      var secs = (now - held[key]) / 1000;
      var speed = Math.min(30, 4 + secs * 18); // px per frame
      dx += dir[0] * speed;
      dy += dir[1] * speed;
    });
    if (dx || dy) queueMove(dx, dy);
    motionFrame = Object.keys(held).length ? requestAnimationFrame(remoteMotion) : null;
  }

  function stopRemoteMotion() {
    held = {};
    if (motionFrame) cancelAnimationFrame(motionFrame);
    motionFrame = null;
  }

  window.addEventListener('keydown', function (e) {
    if (!enabled || mode !== 'remote') return;
    if (REMOTE_DIRS[e.key]) {
      e.preventDefault();
      if (!held[e.key]) {
        held[e.key] = performance.now();
        queueMove(REMOTE_DIRS[e.key][0] * 6, REMOTE_DIRS[e.key][1] * 6); // a single press nudges
      }
      if (!motionFrame) motionFrame = requestAnimationFrame(remoteMotion);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!okDownAt) okDownAt = Date.now();
    } else if (e.key === 'ChannelUp' || e.key === 'PageUp') {
      e.preventDefault();
      send({ t: 'wheel', dx: 0, dy: 240 });
    } else if (e.key === 'ChannelDown' || e.key === 'PageDown') {
      e.preventDefault();
      send({ t: 'wheel', dx: 0, dy: -240 });
    } else if (REMOTE_KEYS[e.key]) {
      e.preventDefault();
      send({ t: 'key', code: REMOTE_KEYS[e.key] });
    }
  });

  window.addEventListener('keyup', function (e) {
    if (mode !== 'remote') return;
    if (REMOTE_DIRS[e.key]) {
      delete held[e.key];
    } else if (e.key === 'Enter' && okDownAt) {
      var long = Date.now() - okDownAt > 600;
      okDownAt = 0;
      if (enabled) send({ t: 'click', b: long ? 'right' : 'left' });
    }
  });

  return { attach: attach, detach: detach };
})();
