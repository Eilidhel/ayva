// The watch page's bottom bar and its "More" sheet. The few things used while
// watching stay in the bar (keyboard, talk, send); the rest is grouped in the
// sheet. What is running (a recording, this phone's screen or camera on the
// computer, a darkened computer screen) shows as a chip at the top, and a tap
// on the chip stops it. The buttons themselves keep their ids and are still
// driven by their own scripts (record.js, screen.js, camera.js, watch.js).

(function () {
  var sheet = $('moreSheet');

  function setOpen(open) {
    sheet.hidden = !open;
    document.body.classList.toggle('more-open', open);
  }

  $('moreBtn').onclick = function () { setOpen(sheet.hidden); };
  $('moreBackdrop').onclick = function () { setOpen(false); };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !sheet.hidden) setOpen(false);
  });
  // An action closes the sheet; picking a colour or a language doesn't.
  sheet.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (b && !b.closest('.themes')) setOpen(false);
  });
  $('screenSelect').addEventListener('change', function () { setOpen(false); });

  // ---- Chips for what is running ----

  var CHIPS = [
    ['recordBtn', 'chipRecording'],
    ['screenBtn', 'chipScreen'],
    ['cameraBtn', 'chipCamera'],
    ['privacyBtn', 'chipPrivacy'],
  ];
  var box = $('chips');

  function renderChips() {
    box.innerHTML = '';
    CHIPS.forEach(function (c) {
      var b = $(c[0]);
      if (!b || b.hidden || !b.classList.contains('danger')) return;
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      // The recording's running time, from the button ("● Stop recording 1:23").
      var time = /(\d+:\d\d)\s*$/.exec(b.textContent);
      chip.textContent = t(c[1]) + (time ? ' ' + time[1] : '');
      chip.title = b.textContent;
      chip.setAttribute('aria-label', b.textContent);
      chip.onclick = function () { b.click(); };
      box.appendChild(chip);
    });
  }

  var watcher = new MutationObserver(renderChips);
  CHIPS.forEach(function (c) {
    var b = $(c[0]);
    if (b) watcher.observe(b, { attributes: true, childList: true, characterData: true, subtree: true });
  });
  renderChips();

  // ---- Colour themes ----

  // In the Android app the colours are chosen in its Settings.
  if (AyvaTheme.fixed) $('themes').parentNode.hidden = true;
  else AyvaTheme.picker($('themes'));
  // The language too: there, or here in More → View.
  if (LANG_FIXED) $('langRow').hidden = true;
  else langPicker($('langSelect'));
})();
