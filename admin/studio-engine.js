/* Studio photo — moteurs de détourage.
   Un moteur = { name, segment(canvas) -> Promise<{ alpha: Uint8ClampedArray, w, h }> } (alpha à la taille du canvas).

   - 'remote' : serveur de détourage vgthmind (BiRefNet lite, licence MIT ; code : detourage-server/, lancé sur le PC ou sur un hébergeur).
                Même qualité sur iPhone et sur PC. Aucune clé : le serveur n'accepte que les appels venant de ce site.
                Il s'endort après quelques jours sans visite : on le réveille (1 à 3 min) au lieu de planter.
   - 'simple' : dernier recours, choisi à la main : fond uni détecté sur les bords (jamais lancé automatiquement). */
(function (root) {
  'use strict';

  // Serveur de détourage : par défaut celui qui tourne sur ce PC (Lancer-detourage.bat, dossier detourage-server/).
  // Pour un autre serveur (tunnel pour l'iPhone, Cloud Run…) : champ « Serveur de détourage » de la page, mémorisé dans ce navigateur.
  var DEFAULT_URL = 'http://localhost:7860', KEY = 'vg-detourage-url';
  var SERVER_URL = DEFAULT_URL;
  try { SERVER_URL = (localStorage.getItem(KEY) || DEFAULT_URL).replace(/[/]$/, ''); } catch (x) {}
  // Lien du lanceur « iPhone » : ...studio-photo.html#srv=<adresse du tunnel>&k=<mot de passe>.
  // Le fragment (#...) ne part jamais vers un serveur ; on le range dans ce navigateur puis on l'efface de la barre d'adresse.
  var TOKEN_KEY = 'vg-detourage-token', TOKEN = '';
  try {
    var hp = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    var hs = (hp.get('srv') || '').trim().replace(/[/]$/, ''), hk = (hp.get('k') || '').trim();
    if (/^https:[/][/][a-z0-9-]+[.]trycloudflare[.]com$/i.test(hs)) { localStorage.setItem(KEY, hs); SERVER_URL = hs; }
    if (/^[A-Za-z0-9_-]{16,128}$/.test(hk)) localStorage.setItem(TOKEN_KEY, hk);
    if (hs || hk) history.replaceState(null, '', location.pathname + location.search);
    TOKEN = localStorage.getItem(TOKEN_KEY) || '';
  } catch (x) {}
  var WAKE_TIMEOUT_MS = null; // null = selon le serveur (court en local, long à distance)
  if (/^(localhost|127.0.0.1)$/.test(location.hostname)) { var qs = new URLSearchParams(location.search).get('space'); if (qs) SERVER_URL = qs; var wk = Number(new URLSearchParams(location.search).get('wake')); if (wk) WAKE_TIMEOUT_MS = wk * 1000; }
  function isLocalServer() { return /^https?:[/][/](localhost|127[.]0[.]0[.]1)(:|[/]|$)/.test(SERVER_URL); }
  function isTunnel() { return /^https:[/][/][a-z0-9-]+[.]trycloudflare[.]com(:|[/]|$)/i.test(SERVER_URL); }
  // local : 20 s ; tunnel du PC : 30 s (le PC répond tout de suite ou est éteint) ; hébergeur endormi : 6 min
  function wakeLimit() { return WAKE_TIMEOUT_MS || (isLocalServer() ? 20000 : isTunnel() ? 30000 : 6 * 60 * 1000); }
  function authHeaders(h) { h = h || {}; if (TOKEN && !isLocalServer()) h['X-VG-Token'] = TOKEN; return h; } // test local uniquement

  var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function unavailable(msg) { var err = new Error(msg); err.code = 'unavailable'; return err; }
  function sleep(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }
  function fetchTimeout(url, opt, ms) {
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, ms);
    opt = opt || {}; opt.signal = ctl.signal;
    return fetch(url, opt).finally(function () { clearTimeout(t); });
  }

  // Attend que le serveur réponde « prêt ». Endormi : l'appel le réveille ; on réessaie en affichant un message clair.
  var awakeUntil = 0;
  async function ensureAwake(onStatus) {
    if (Date.now() < awakeUntil) return;
    var t0 = Date.now(), shown = false;
    for (;;) {
      try {
        var r = await fetchTimeout(SERVER_URL + '/health', { cache: 'no-store', headers: authHeaders() }, 10000);
        var j = r.ok ? await r.json() : null;
        if (j && j.ready) { awakeUntil = Date.now() + 5 * 60 * 1000; return; }
        if (j && j.error) throw unavailable('Le serveur de détourage a un problème : ' + j.error);
      } catch (e) { if (e && e.code === 'unavailable') throw e; }
      if (Date.now() - t0 > wakeLimit()) {
        // Diagnostic : le serveur répond-il quand même (sans qu'on puisse lire la réponse) ? Alors c'est ce SITE qui est refusé, pas une panne.
        var answers = false;
        try { await fetchTimeout(SERVER_URL + '/health', { mode: 'no-cors', cache: 'no-store' }, 4000); answers = true; } catch (e2) { /* ne répond pas */ }
        if (answers) throw unavailable('Le serveur de détourage tourne, mais il refuse ce site (adresse ' + location.origin + '). Récupère la dernière version du dossier « detourage-server » sur ton PC (fichier server.js), ferme la fenêtre noire, puis relance « Lancer-detourage.bat ».');
        if (isLocalServer() && isIOS) throw unavailable('Sur iPhone, « localhost » désigne l’iPhone lui-même, pas ton PC. Sur le PC, double-clique sur « Lancer-detourage-iphone.bat », puis ouvre dans Safari le lien de la page qui s’affiche (fichier lien-iphone.html).');
        throw unavailable(isLocalServer() ? 'Le serveur de détourage ne répond pas sur ce PC : double-clique sur « Lancer-detourage.bat » (dossier detourage-server). S’il est déjà lancé et que ça ne marche pas, double-clique sur « Arreter-detourage.bat » puis relance « Lancer-detourage.bat ».' : isTunnel() ? 'Le PC ne répond pas. Vérifie qu’il est allumé, que la fenêtre « Détourage iPhone » est ouverte, puis rouvre le DERNIER lien envoyé (l’adresse change à chaque lancement).' : 'Le serveur de détourage ne répond pas.');
      }
      shown = true;
      onStatus(isLocalServer() ? 'Recherche du serveur de détourage sur ce PC…' : 'Réveil du serveur de détourage, 1 à 3 min (' + Math.round((Date.now() - t0) / 1000) + ' s)…');
      await sleep(5000);
    }
  }

  function remoteEngine(onStatus) {
    return {
      name: 'remote',
      async segment(canvas) {
        await ensureAwake(onStatus);
        onStatus('Détourage en cours…');
        var blob = await new Promise(function (ok) { canvas.toBlob(ok, 'image/jpeg', 0.92); });
        var r;
        try { r = await fetchTimeout(SERVER_URL + '/cut', { method: 'POST', headers: authHeaders({ 'Content-Type': 'image/jpeg' }), body: blob }, 180000); }
        catch (e) { awakeUntil = 0; throw unavailable('Le serveur de détourage ne répond pas.'); }
        if (r.status === 401 || r.status === 429) { awakeUntil = 0; throw unavailable(r.status === 401 ? 'Le PC refuse le mot de passe : rouvre le dernier lien « Détourage iPhone » envoyé depuis le PC.' : 'Trop d’essais refusés : réessaie dans une heure.'); }
        if (!r.ok) { awakeUntil = 0; throw unavailable('Le serveur de détourage a répondu une erreur (' + r.status + ').'); }
        var bmp = await createImageBitmap(await r.blob());
        var c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
        var cx = c.getContext('2d'); cx.drawImage(bmp, 0, 0, c.width, c.height);
        if (bmp.close) bmp.close();
        var px = cx.getImageData(0, 0, c.width, c.height).data, a = new Uint8ClampedArray(c.width * c.height);
        for (var k = 0; k < a.length; k++) a[k] = px[k * 4]; // masque gris : 255 = pièce
        return { alpha: a, w: c.width, h: c.height };
      }
    };
  }

  // ---- Repli : fond uni --------------------------------------------------
  function simpleEngine() {
    return {
      name: 'simple',
      async segment(canvas) {
        var w = canvas.width, h = canvas.height;
        var d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
        // Couleur du fond = médiane des pixels du cadre extérieur.
        var rs = [], gs = [], bs = [], x, y, i, step = Math.max(1, Math.floor(Math.max(w, h) / 200));
        function take(px, py) { i = (py * w + px) * 4; rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); }
        for (x = 0; x < w; x += step) { take(x, 0); take(x, h - 1); }
        for (y = 0; y < h; y += step) { take(0, y); take(w - 1, y); }
        var med = function (a) { a.sort(function (p, q) { return p - q; }); return a[a.length >> 1]; };
        var br = med(rs), bg = med(gs), bb = med(bs);
        var alpha = new Uint8ClampedArray(w * h), dist, t;
        for (i = 0; i < alpha.length; i++) {
          dist = Math.sqrt(Math.pow(d[i * 4] - br, 2) + Math.pow(d[i * 4 + 1] - bg, 2) + Math.pow(d[i * 4 + 2] - bb, 2));
          t = (dist - 18) / 40; // 0 sous 18, 1 au-dessus de 58
          alpha[i] = t <= 0 ? 0 : t >= 1 ? 255 : Math.round(t * 255);
        }
        return { alpha: alpha, w: w, h: h };
      }
    };
  }

  root.VGStudioEngine = {
    isIOS: isIOS,
    getUrl: function () { return SERVER_URL; },
    setUrl: function (u) { u = (u || '').trim().replace(/[/]$/, ''); SERVER_URL = u || DEFAULT_URL; awakeUntil = 0; try { if (u && u !== DEFAULT_URL) localStorage.setItem(KEY, u); else localStorage.removeItem(KEY); } catch (x) {} },
    create: function (kind, onStatus) {
      onStatus = onStatus || function () {};
      if (kind === 'simple') return simpleEngine();
      return remoteEngine(onStatus);
    }
  };
})(window);
