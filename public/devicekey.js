// This device's key, which proves to the computer that a remembered device is
// really the same device and not someone who copied or overheard its id.
// The private half never leaves the device: the Android app keeps it in the
// Android Keystore (window.AyvaKey); browsers keep a non-extractable WebCrypto
// key in IndexedDB. Plain http pages (http://192.168…) have neither, so such a
// browser can watch but cannot be remembered.
var DeviceKey = (function () {
  var PREFIX = 'ayva-device-proof:';
  var native = window.AyvaKey || null;
  var subtle = window.crypto && window.crypto.subtle;
  var pairPromise = null;

  function available() {
    return !!native || !!(subtle && window.indexedDB);
  }

  function toBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function fromBase64(text) {
    var s = atob(text);
    var bytes = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  }

  // Android signs in DER; the computer verifies the raw r|s form WebCrypto uses.
  function derToRaw(der) {
    var pos = 2;
    if (der[1] & 0x80) pos += der[1] & 0x7f;
    function readInt() {
      var len = der[pos + 1];
      var start = pos + 2;
      pos = start + len;
      var n = der.subarray(start, start + len);
      while (n.length > 32 && n[0] === 0) n = n.subarray(1);
      var out = new Uint8Array(32);
      out.set(n, 32 - n.length);
      return out;
    }
    var r = readInt();
    var s = readInt();
    var raw = new Uint8Array(64);
    raw.set(r, 0);
    raw.set(s, 32);
    return raw;
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('ayva-device', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('keys'); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function dbGet(db) {
    return new Promise(function (resolve, reject) {
      var req = db.transaction('keys').objectStore('keys').get('main');
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function dbPut(db, pair) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('keys', 'readwrite');
      tx.objectStore('keys').put(pair, 'main');
      tx.oncomplete = function () { resolve(pair); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  function browserPair() {
    if (!pairPromise) {
      pairPromise = openDb().then(function (db) {
        return dbGet(db).then(function (pair) {
          if (pair) return pair;
          return subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])
            .then(function (fresh) { return dbPut(db, fresh); });
        });
      });
      pairPromise.catch(function () { pairPromise = null; });
    }
    return pairPromise;
  }

  // Signs the computer's one-time challenge together with this page's address,
  // so the signature only counts at the computer's own addresses. Resolves
  // { key, sig, origin } (key: base64 SPKI, sig: base64 raw P-256) or null when
  // this device has no safe place for a key.
  function prove(nonce) {
    // In the Android app the page may be reached through 127.0.0.1; the app
    // then names the computer's real address.
    var origin = location.origin;
    if (native && native.proofOrigin) {
      try { origin = native.proofOrigin(); } catch (e) { return Promise.resolve(null); }
    }
    var message = PREFIX + origin + ':' + nonce;
    if (native) {
      try {
        // The app fills in the address itself (signProof); older apps only
        // have sign(), which signs what the page gives it.
        var der = native.signProof ? native.signProof(nonce) : native.sign(message);
        return Promise.resolve({
          key: native.publicKey(),
          sig: toBase64(derToRaw(fromBase64(der))),
          origin: origin,
        });
      } catch (e) {
        return Promise.resolve(null);
      }
    }
    if (!available()) return Promise.resolve(null);
    return browserPair().then(function (pair) {
      return Promise.all([
        subtle.exportKey('spki', pair.publicKey),
        subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(message)),
      ]);
    }).then(function (parts) {
      return { key: toBase64(parts[0]), sig: toBase64(parts[1]), origin: origin };
    }).catch(function () { return null; });
  }

  // Hex SHA-256 of a string, for the PIN. null where it is unavailable.
  function sha256(text) {
    if (native && native.sha256) {
      try { return Promise.resolve(native.sha256(text)); } catch (e) { return Promise.resolve(null); }
    }
    if (!subtle) return Promise.resolve(null);
    return subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    }).catch(function () { return null; });
  }

  return { available: available, prove: prove, sha256: sha256, PREFIX: PREFIX };
})();
