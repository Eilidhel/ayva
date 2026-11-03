// The computer's window in sections (Share, Watch, Devices, Remote access,
// History, Settings): the rail on the left shows one at a time, the window
// opens on the last one used, and the rail can fold to icons only. The "⋯"
// menu next to the sharing buttons holds the less frequent actions and
// closes after one is picked.

(function () {
  var KEY = 'ayva-section';
  var buttons = document.querySelectorAll('[data-nav]');
  var sections = document.querySelectorAll('[data-section]');

  function show(name) {
    var found = false;
    Array.prototype.forEach.call(sections, function (s) {
      s.hidden = s.dataset.section !== name;
      if (!s.hidden) found = true;
    });
    if (!found) return show('share');
    Array.prototype.forEach.call(buttons, function (b) {
      b.classList.toggle('on', b.dataset.nav === name);
      b.setAttribute('aria-current', b.dataset.nav === name ? 'page' : 'false');
    });
    storageSet(KEY, name);
    document.querySelector('.main').scrollTop = 0;
  }

  Array.prototype.forEach.call(buttons, function (b) {
    b.onclick = function () { show(b.dataset.nav); };
  });
  show(storageGet(KEY) || 'share');

  var menu = $('shareMore');
  var summary = menu.querySelector('summary');
  summary.setAttribute('aria-label', t('more'));
  summary.title = t('more');
  // The list opens toward the side with room: the ⋯ button may wrap to the
  // start of a new line in a narrow window, where a list opening to the left
  // would be cut off.
  var list = menu.querySelector('.menu-list');
  menu.addEventListener('toggle', function () {
    if (!menu.open) return;
    var box = menu.getBoundingClientRect();
    var room = document.querySelector('.main').getBoundingClientRect();
    menu.classList.toggle('open-left', box.right - room.left >= list.offsetWidth);
  });
  list.addEventListener('click', function (e) {
    if (e.target.closest('button')) menu.open = false;
  });
  document.addEventListener('click', function (e) {
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  });

  // The rail folds to icons only (each keeps its name as a tooltip), remembered.
  var toggle = $('railToggle');
  function fold(on) {
    document.body.classList.toggle('rail-folded', on);
    var label = t(on ? 'railOpen' : 'railFold');
    toggle.title = label;
    toggle.setAttribute('aria-label', label);
    Array.prototype.forEach.call(buttons, function (b) { b.title = on ? b.textContent : ''; });
  }
  toggle.onclick = function () {
    var on = !document.body.classList.contains('rail-folded');
    storageSet('ayva-rail-folded', on ? '1' : '0');
    fold(on);
  };
  fold(storageGet('ayva-rail-folded') === '1');

  AyvaTheme.picker($('themes'));
  langPicker($('langSelect'));
  addResizeGrip(window);
})();
