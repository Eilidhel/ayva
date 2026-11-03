// The colour theme, picked on the watch page (dock.js). Loaded in <head> so
// the page is drawn in its colours from the start, without a flash of the
// default ones. Kept per device, in this browser or app.
var AyvaTheme = (function () {
  var KEY = 'ayva-theme';
  var NAMES = ['quince', 'sea', 'leaf', 'plum', 'rose', 'light'];

  function get() {
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

  apply(get());
  return { names: NAMES, get: get, set: set };
})();
