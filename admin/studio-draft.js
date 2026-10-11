/* Studio photo — brouillon sauvegardé dans ce navigateur (IndexedDB), pour ne pas perdre les photos et la fiche
   si la page se ferme (iPhone : Safari recharge souvent les onglets en arrière-plan).
   Rien ne quitte l'appareil. On garde les photos ORIGINALES (le détourage est refait à la reprise), la vidéo du reel
   et les champs de la fiche. Effacé après une publication réussie, ou à la demande, ou après 14 jours.
   create(backend) : backend = { get(key), set(key, value), del(key) } (promesses) ; par défaut IndexedDB. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VGStudioDraft = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEY = 'draft', MAX_AGE_MS = 14 * 24 * 3600 * 1000;

  function idbBackend() {
    var dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise(function (ok, ko) {
        var r = indexedDB.open('vg-studio', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
        r.onsuccess = function () { ok(r.result); };
        r.onerror = function () { ko(r.error); };
        r.onblocked = function () { ko(new Error('IndexedDB bloquée')); };
      });
      return dbp;
    }
    function run(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (ok, ko) {
          var tx = db.transaction('kv', mode), req = fn(tx.objectStore('kv'));
          tx.oncomplete = function () { ok(req && req.result); };
          tx.onerror = tx.onabort = function () { ko(tx.error || new Error('écriture refusée')); };
        });
      });
    }
    return {
      get: function (k) { return run('readonly', function (s) { return s.get(k); }); },
      set: function (k, v) { return run('readwrite', function (s) { return s.put(v, k); }); },
      del: function (k) { return run('readwrite', function (s) { return s['delete'](k); }); }
    };
  }

  // Champs qui comptent pour savoir si le brouillon vaut la peine d'être gardé (les cases cochées par défaut, non).
  var MEANINGFUL = ['fName', 'fPrice', 'fQty', 'fEn', 'fFr', 'fReel', 'fWeight', 'fColorOther'];
  function isEmpty(d) {
    if (!d) return true;
    var fields = d.fields || {}, filled = MEANINGFUL.some(function (k) { var v = fields[k]; return v !== '' && v !== null && v !== undefined; });
    return !(d.files && d.files.length) && !d.reel && !filled;
  }

  function create(backend, now) {
    var store = backend || idbBackend();
    now = now || function () { return Date.now(); };
    var lastError = null;
    return {
      isEmpty: isEmpty,
      // snapshot : { files: [File], reel: File|null, fields: {…} }. Vide -> le brouillon est supprimé.
      // Ne lève jamais : renvoie { ok:false, error } si le navigateur refuse (espace plein, navigation privée…).
      save: async function (snap) {
        try {
          if (isEmpty(snap)) { await store.del(KEY); return { ok: true, empty: true }; }
          await store.set(KEY, { v: 1, savedAt: now(), files: snap.files || [], reel: snap.reel || null, fields: snap.fields || {} });
          lastError = null; return { ok: true };
        } catch (e) { lastError = e; return { ok: false, error: (e && e.message) || String(e) }; }
      },
      // Renvoie le brouillon ou null (absent, trop vieux, abîmé, illisible).
      load: async function () {
        try {
          var d = await store.get(KEY);
          if (!d || d.v !== 1 || !(now() - d.savedAt < MAX_AGE_MS) || isEmpty(d)) { if (d) await store.del(KEY); return null; }
          return d;
        } catch (e) { return null; }
      },
      clear: async function () { try { await store.del(KEY); } catch (e) { /* rien à faire */ } },
      lastError: function () { return lastError; }
    };
  }

  return { create: create, isEmpty: isEmpty, MAX_AGE_MS: MAX_AGE_MS };
}));
