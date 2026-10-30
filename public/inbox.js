// Files and clipboard on the viewer side, over the "transfer" data channel.
// Receives what the computer sends (shown in a small inbox with Save / Copy),
// and sends files or text to the computer. The computer accepts those only
// while remote control is on.

var Inbox = (function () {
  var transfer = null;
  var parts = [];

  function setOpen(open) {
    document.body.classList.toggle('transfer-on', open);
    if (!open) $('sendSheet').hidden = true;
  }

  function attach(dc) {
    transfer = new Transfer(dc, {
      message: function (msg) {
        if (msg.t === 'clip' && typeof msg.text === 'string') addText(msg.text);
        else if (msg.t === 'refused') note(t('refusedByComputer'));
      },
      fileStart: function (meta) {
        parts = [];
        note(t('receivingFile').replace('{name}', meta.name));
      },
      fileChunk: function (meta, buf) {
        parts.push(buf);
      },
      fileEnd: function (meta) {
        var blob = new Blob(parts, { type: meta.type || 'application/octet-stream' });
        parts = [];
        addFile(meta.name, blob);
      },
    });
    dc.onopen = function () {
      // The TV app can't save files, so it doesn't offer to receive them.
      transfer.send({ t: 'hello', files: !APP });
      setOpen(true);
    };
    dc.onclose = function () {
      if (transfer && transfer.dc === dc) detach();
    };
  }

  function detach() {
    transfer = null;
    parts = [];
    setOpen(false);
  }

  // ---- Inbox (things received from the computer) ----

  function item(text, actionLabel, action) {
    var box = $('inbox');
    var row = document.createElement('div');
    row.className = 'inbox-item';
    var label = document.createElement('div');
    label.className = 'inbox-text';
    label.textContent = text;
    row.appendChild(label);
    if (actionLabel) {
      var b = document.createElement('button');
      b.className = 'small-btn';
      b.textContent = actionLabel;
      b.onclick = function () { action(b); };
      row.appendChild(b);
    }
    var close = document.createElement('button');
    close.className = 'secondary small-btn';
    close.textContent = '✕';
    close.onclick = function () { box.removeChild(row); };
    row.appendChild(close);
    box.insertBefore(row, box.firstChild);
    while (box.children.length > 4) box.removeChild(box.lastChild);
    return row;
  }

  function note(text) {
    var row = item(text);
    setTimeout(function () { if (row.parentNode) row.parentNode.removeChild(row); }, 4000);
  }

  function addFile(name, blob) {
    var url = URL.createObjectURL(blob);
    item(name + ' · ' + formatSize(blob.size), t('save'), function () {
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  }

  function addText(text) {
    var preview = text.length > 80 ? text.slice(0, 80) + '…' : text;
    item(t('clipFromComputer') + ': ' + preview, t('copy'), function (b) {
      copyText(text).then(function () { b.textContent = t('copied'); });
    });
  }

  // ---- Sending to the computer ----

  $('sendBtn').onclick = function () {
    $('sendSheet').hidden = !$('sendSheet').hidden;
  };

  $('pickFilesBtn').onclick = function () { $('filesInput').click(); };

  // All files picked together go as one batch: the computer puts them in one
  // folder named after the date and time.
  $('filesInput').onchange = function () {
    var files = Array.prototype.slice.call(this.files);
    this.value = '';
    $('sendSheet').hidden = true;
    if (!transfer || !files.length) return;
    var tr = transfer;
    var row = item(t('sendingBatch').replace('{done}', 0).replace('{total}', files.length));
    var label = row.querySelector('.inbox-text');
    var done = 0;
    tr.send({ t: 'batch-start', count: files.length });
    var all = files.map(function (file) {
      return tr.sendFile(file, function (fraction) {
        label.textContent = t('sendingBatch').replace('{done}', done).replace('{total}', files.length)
          + ' · ' + file.name + ' ' + Math.round(fraction * 100) + '%';
      }).then(function () { done++; });
    });
    Promise.all(all).then(function () {
      tr.send({ t: 'batch-end' });
      label.textContent = t('sentBatch').replace('{total}', files.length);
    }).catch(function () {
      label.textContent = t('batchFailed').replace('{done}', done).replace('{total}', files.length);
    });
  };

  $('sendTextBtn').onclick = function () {
    var text = $('sendText').value;
    if (!transfer || !text) return;
    transfer.send({ t: 'clip', text: text.slice(0, 100000) });
    $('sendText').value = '';
    $('sendSheet').hidden = true;
    note(t('clipSentToComputer'));
  };

  return { attach: attach, detach: detach };
})();
