// Viewer side of the fixed address (Cloudflare hub, see cloud/worker.js):
// password once, then a list of this account's computers to pick from.
// Loaded on every watch page; only active when /config.json says cloud: true.

var Cloud = (function () {
  var token = storageGet('ayva-cloud-token');
  var hosts = [];
  var authed = false;
  var wanted = null; // computer to join as soon as it's online (from the link or last time)

  function panel(name) {
    $('entry').classList.add('hidden');
    $('waiting').classList.add('hidden');
    $('cloudEntry').classList.remove('hidden');
    $('pwForm').hidden = name !== 'password';
    $('hostList').hidden = name !== 'hosts';
  }

  function hide() {
    $('cloudEntry').classList.add('hidden');
  }

  function showPassword(error) {
    panel('password');
    $('cloudTitle').textContent = t('enterPassword');
    $('cloudError').textContent = error || '';
    $('pwInput').value = '';
    $('pwInput').focus();
  }

  function showList() {
    panel('hosts');
    $('cloudError').textContent = '';
    $('cloudTitle').textContent = hosts.length ? t('pickComputer') : t('noComputers');
    var list = $('hostList');
    list.innerHTML = '';
    hosts.forEach(function (h) {
      var b = document.createElement('button');
      b.className = 'host-btn';
      b.textContent = h.name;
      var badge = document.createElement('span');
      badge.className = 'badge' + (h.live ? ' live' : '');
      badge.textContent = h.live ? t('streaming') : t('ready');
      b.appendChild(badge);
      b.onclick = function () { pick(h.id); };
      list.appendChild(b);
    });
  }

  function pick(id) {
    wanted = id;
    storageSet('ayva-cloud-last', id);
    hide();
    join(id);
  }

  function onOpen() {
    authed = false;
    signal.send({ type: 'auth', token: token });
  }

  // Returns true when the message was for the cloud entry.
  function handle(msg) {
    switch (msg.type) {
      case 'need-password':
        token = null;
        if (!authed) showPassword();
        return true;
      case 'wrong-password':
        showPassword(t('wrongPassword'));
        return true;
      case 'auth-blocked':
        showPassword(t('tooManyTries'));
        return true;
      case 'authed':
        authed = true;
        token = msg.token;
        storageSet('ayva-cloud-token', token);
        // Reconnected while watching: if the picture is still coming in
        // directly, leave it alone; otherwise join again.
        if (code && !peerAlive()) sendJoin();
        return true;
      case 'hosts':
        hosts = msg.hosts || [];
        if (code) return true; // already watching (or waiting for) a computer
        var target = wanted && hosts.filter(function (h) { return h.id === wanted; })[0];
        if (target) pick(target.id);
        else if (hosts.length === 1 && !wanted) pick(hosts[0].id);
        else showList();
        return true;
    }
    return false;
  }

  $('pwForm').onsubmit = function (e) {
    e.preventDefault();
    var password = $('pwInput').value;
    if (!password) return;
    $('cloudError').textContent = '';
    signal.send({ type: 'auth', password: password });
  };

  return {
    start: function (fromLink) {
      wanted = fromLink || storageGet('ayva-cloud-last');
      showWaiting(t('connecting'));
      // Some networks block workers.dev unless the browser uses secure DNS.
      // If the server hasn't answered after a while, say how to fix that.
      setTimeout(function () {
        if (!authed && !$('waiting').classList.contains('hidden')) showWaiting(t('cloudSlowTip'));
      }, 15000);
    },
    onOpen: onOpen,
    handle: handle,
    hostName: function (id) {
      var h = hosts.filter(function (x) { return x.id === id; })[0];
      return h ? h.name : '';
    },
    // "Change" while watching: back to the list of computers.
    backToList: function () {
      wanted = null;
      showList();
    },
  };
})();
