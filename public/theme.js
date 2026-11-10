// The colour theme, picked on the watch page (dock.js), in the computer's
// settings (sharenav.js) or in the Android app's Settings. Loaded in <head>
// so the page is drawn in its colours from the start, without a flash of the
// default ones. Kept per device, in this browser or app.
var AyvaTheme = (function () {
  var KEY = 'ayva-theme';
  var NAMES = ['quince', 'sea', 'leaf', 'plum', 'rose', 'midnight', 'violet', 'lime', 'ember',
    'light', 'lilac', 'fog', 'chalk', 'ivory'];

  // The Android app picks the theme in its own Settings and passes it here
  // (?theme=); the page then follows the app and offers no picker of its own.
  var fromApp = (/[?&]theme=([a-z]+)/.exec(location.search) || [])[1];
  var fixed = NAMES.indexOf(fromApp) >= 0;

  function get() {
    if (fixed) return fromApp;
    try {
      var v = localStorage.getItem(KEY);
      return NAMES.indexOf(v) > 0 ? v : 'quince';
    } catch (e) {
      return 'quince';
    }
  }

  function apply(name) {
    var root = document.documentElement;
    if (name === 'quince') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', name);
    // The browser's own bars take the page's background.
    var meta = document.querySelector('meta[name=theme-color]');
    var bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    if (meta && bg) meta.content = bg;
  }

  function set(name) {
    if (NAMES.indexOf(name) < 0) return;
    try {
      localStorage.setItem(KEY, name);
    } catch (e) { /* private mode: for this visit only */ }
    apply(name);
  }

  // A row of colour dots that picks the theme (t() from common.js, loaded by then).
  var SWATCH = { quince: '#f2c14e', sea: '#5cb3f0', leaf: '#8fd17c', plum: '#c49af2', rose: '#f29a8a',
    midnight: '#19f5d6', violet: '#8b5cff', lime: '#c6ff00', ember: '#ff5a1f',
    // Light themes: the page colour with a wedge of the accent.
    light: '#f7f3ea', lilac: 'linear-gradient(135deg, #f3f1f8 55%, #19d9be 55%)',
    fog: 'linear-gradient(135deg, #ececef 55%, #6a3df0 55%)',
    chalk: 'linear-gradient(135deg, #f1f2ee 55%, #b8f000 55%)',
    ivory: 'linear-gradient(135deg, #f6f1e7 55%, #e8551a 55%)' };

  function picker(row) {
    var mark = function () {
      var now = get();
      Array.prototype.forEach.call(row.children, function (b) {
        b.classList.toggle('on', b.dataset.theme === now);
        b.setAttribute('aria-pressed', b.dataset.theme === now ? 'true' : 'false');
      });
    };
    NAMES.forEach(function (name) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = SWATCH[name];
      b.title = t('theme_' + name);
      b.setAttribute('aria-label', t('theme_' + name));
      b.dataset.theme = name;
      b.onclick = function () {
        set(name);
        mark();
      };
      row.appendChild(b);
    });
    mark();
  }

  apply(get());
  return { names: NAMES, get: get, set: set, picker: picker, fixed: fixed };
})();
