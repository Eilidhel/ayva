// The colour theme, picked on the watch page (dock.js), in the computer's
// settings (sharenav.js) or in the Android app's Settings. Loaded in <head>
// so the page is drawn in its colours from the start, without a flash of the
// default ones. Kept per device, in this browser or app.
var AyvaTheme = (function () {
  var KEY = 'ayva-theme';
  var NAMES = ['midnight', 'chalk', 'butter', 'sage'];

  // The Android app picks the theme in its own Settings and passes it here
  // (?theme=); the page then follows the app and offers no picker of its own.
  var fromApp = (/[?&]theme=([a-z]+)/.exec(location.search) || [])[1];
  var fixed = NAMES.indexOf(fromApp) >= 0;

  function get() {
    if (fixed) return fromApp;
    try {
      var v = localStorage.getItem(KEY);
      // Unset, or a theme that no longer exists: the default, Midnight.
      return NAMES.indexOf(v) >= 0 ? v : 'midnight';
    } catch (e) {
      return 'midnight';
    }
  }

  function apply(name) {
    var root = document.documentElement;
    if (name === 'midnight') root.removeAttribute('data-theme');
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
  // Each dot shows its theme's three colours: page, panels, accent.
  var SWATCH = {
    midnight: 'conic-gradient(#19f5d6 0 36deg, #2c1d55 36deg 144deg, #1b1035 144deg)',
    chalk: 'conic-gradient(#bfff00 0 36deg, #2a3439 36deg 144deg, #eef2f6 144deg)',
    butter: 'conic-gradient(#1f4fd8 0 36deg, #382a22 36deg 144deg, #f3dc88 144deg)',
    sage: 'conic-gradient(#ce5b22 0 36deg, #f1ead9 36deg 144deg, #9eaf8e 144deg)'
  };

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
