// A grip in the bottom-right corner of Ayva's own windows (the main window
// and a phone's screen) that makes the window bigger or smaller when dragged:
// Windows' own border is only a pixel or two wide and hard to catch. Only in
// the desktop app, where a page may resize its window; a browser tab can't.
// Loaded by share.html; share.js wires the same into each phone window, which
// also gets the theme's accent colour from here.

function addResizeGrip(win) {
  var doc = win.document;
  // Ayva's own windows take the theme's accent (a phone's window has no theme of its own).
  var accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  if (accent && win !== window) doc.documentElement.style.setProperty('--accent', accent);
  if (!/Electron\//.test(win.navigator.userAgent) || doc.getElementById('resizeGrip')) return;
  var grip = doc.createElement('div');
  grip.id = 'resizeGrip';
  grip.className = 'resize-grip';
  grip.title = typeof t === 'function' ? t('resizeGrip') : '';
  doc.body.appendChild(grip);

  var start = null;
  var pending = null;
  grip.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    start = { x: e.screenX, y: e.screenY, w: win.outerWidth, h: win.outerHeight };
  });
  grip.addEventListener('pointermove', function (e) {
    if (!start) return;
    var w = Math.max(200, start.w + e.screenX - start.x);
    var h = Math.max(200, start.h + e.screenY - start.y);
    // One resize per frame; the window keeps its own minimum size.
    if (!pending) {
      win.requestAnimationFrame(function () {
        win.resizeTo(pending.w, pending.h);
        pending = null;
      });
    }
    pending = { w: w, h: h };
  });
  var stop = function () { start = null; };
  grip.addEventListener('pointerup', stop);
  grip.addEventListener('pointercancel', stop);
}
