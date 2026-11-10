// The computer's window in sections (Share, Watch, Devices, Remote access,
// History, Settings): the tabs across the top show one at a time and the
// window opens on the last one used. The "⋯"
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

  // Settings is a gear only; its name stays for screen readers and as a tooltip.
  var gear = document.querySelector('[data-nav="settings"]');
  gear.title = gear.textContent;
  gear.setAttribute('aria-label', gear.textContent);

  AyvaTheme.picker($('themes'));
  langPicker($('langSelect'));
  addResizeGrip(window);
})();
