/* Connexion des pages admin maison (Stock, Commandes) : « Se connecter avec
   GitHub », même relais OAuth que Sveltia (Worker /auth -> /callback, seul
   le compte vgthmind est accepté). Le Worker rend une session signée de 30 jours,
   gardée dans ce navigateur (localStorage, pas de cookie : Safari bloque les
   cookies tiers) et renouvelée à chaque visite. Le jeton GitHub n'est pas gardé. */
(function () {
  'use strict';
  var ENDPOINT = 'https://vgthmind-shop-checkout.vgthm66.workers.dev';
  window.VG_ENDPOINT = ENDPOINT;
  // Adresse du site = réglage central (site_url dans data/shop-settings.json), écrite ici par generator/build.js.
  var SITE_URL = '__VG_SITE_URL__';
  if (SITE_URL.indexOf('__') === 0) SITE_URL = location.origin; // source non construite (essais locaux)
  // Admin ouvert depuis une autre adresse que le site (ancien aperçu github.io, favori d'avant…) : renvoi vers la bonne,
  // où la connexion est exigée. Rien n'est affiché ni chargé ici.
  try {
    if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && location.origin !== new URL(SITE_URL).origin) {
      var rest = /\/admin\/(.*)$/.exec(location.pathname);
      location.replace(SITE_URL + '/admin/' + (rest ? rest[1] : '') + location.search + location.hash);
      return;
    }
  } catch (e) {}
  // Numéro de version de l'admin, affiché en petit en bas à gauche de chaque page : permet de vérifier qu'on a bien la dernière version.
  // À changer à chaque mise à jour de l'admin (aaaa-mm-jj + lettre).
  window.VG_ADMIN_VERSION = '2026-10-13-k';
  function showVersion() {
    try {
      var d = document.createElement('div'); d.id = 'vg-admin-version'; d.textContent = 'Admin v' + window.VG_ADMIN_VERSION;
      d.style.cssText = 'position:fixed;left:8px;bottom:6px;z-index:5;font:11px/1 system-ui,sans-serif;color:#555;background:rgba(255,255,255,.8);padding:3px 6px;border-radius:6px;pointer-events:none';
      document.body.appendChild(d);
    } catch (e) {}
  }
  if (document.body) showVersion(); else document.addEventListener('DOMContentLoaded', showVersion);

  var KEY = 'vg-admin-session';
  var LAST = 'vg-admin-last'; // derniere activite (deconnexion automatique apres 30 min sans rien faire)
  var IDLE_MS = 30 * 60 * 1000;
  function idle() { try { var t = Number(localStorage.getItem(LAST)) || 0; return t > 0 && Date.now() - t > IDLE_MS; } catch (e) { return false; } }
  // Cookie de session lu par le garde des pages /admin (functions/admin/_middleware.js) : même valeur que la session,
  // valable 30 min après la dernière activité (le garde refuse les pages admin sans lui).
  function setCookie(v) {
    try {
      document.cookie = 'vg-admin=' + (v ? encodeURIComponent(v) : '') + '; path=/; max-age=' + (v ? 1800 : 0) + '; SameSite=Strict' + (location.protocol === 'https:' ? '; Secure' : '');
    } catch (e) {}
  }
  function touch() {
    try {
      localStorage.setItem(LAST, String(Date.now()));
      var s = localStorage.getItem(KEY) || '';
      if (s && Number(s.split('.')[1]) > Date.now() / 1000) setCookie(s);
    } catch (e) {}
  }

  // Session signee par le Worker (30 jours, renouvelee), vide si absente ou expiree.
  window.vgAdminToken = function () {
    try {
      var s = localStorage.getItem(KEY) || '';
      var exp = Number(s.split('.')[1]);
      if (s && idle()) { window.vgAdminLogout(); return ''; }
      return exp > Date.now() / 1000 ? s : '';
    } catch (e) { return ''; }
  };

  // Renouvelle la session si elle a plus d'un jour (sans bloquer la page).
  function renew() {
    var s = window.vgAdminToken();
    if (!s || Number(s.split('.')[1]) - Date.now() / 1000 > 11 * 3600 + 3000) return; // session de 12 h : renouvelee des qu'elle a plus de 10 min
    fetch(ENDPOINT + '/admin/renew', { method: 'POST', headers: { Authorization: 'Bearer ' + s } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.session) localStorage.setItem(KEY, d.session); })
      .catch(function () {});
  }
  try { if (localStorage.getItem(KEY) && idle()) { localStorage.removeItem(KEY); localStorage.removeItem('vg-admin-token'); setCookie(''); } } catch (e) {}
  renew();
  touch();
  ['click', 'keydown', 'touchstart', 'scroll', 'input'].forEach(function (ev) {
    var last = 0;
    window.addEventListener(ev, function () { if (Date.now() - last > 10000) { last = Date.now(); if (window.vgAdminToken()) touch(); } }, { passive: true });
  });
  setInterval(function () { if (localStorage.getItem(KEY) && idle()) { window.vgAdminLogout(); location.reload(); } }, 60000);

  // Admin installable (PWA) : manifeste + service worker.
  try {
    var l = document.createElement('link'); l.rel = 'manifest'; l.href = 'manifest.webmanifest'; document.head.appendChild(l);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  } catch (e) {}

  // Connexion GitHub. Deux chemins pour récupérer la session, le premier qui répond gagne :
  //   1. la fenêtre GitHub renvoie la session à cette page (postMessage) : ordinateur ;
  //   2. la page garde un code secret (lc) ; le Worker dépose la session sous ce code et la page la réclame (/auth/claim) :
  //      iPhone / appli installée, où la fenêtre GitHub n'a aucun lien avec la page d'origine. Ce code est aussi gardé
  //      (3 min) pour reprendre l'attente si la page est rechargée ou recréée pendant la connexion.
  var LC = 'vg-login-code', LC_MS = 3 * 60 * 1000;
  function randomCode() {
    var a = new Uint8Array(16); (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function pendingCode() {
    try { var v = (localStorage.getItem(LC) || '').split(':'); return v[0] && Date.now() - Number(v[1]) < LC_MS ? v[0] : ''; } catch (e) { return ''; }
  }
  function acceptSession(session) {
    try { localStorage.setItem(KEY, session); localStorage.removeItem(LC); } catch (e) {}
    touch();
  }
  // Attend la session déposée sous ce code. Résout avec la session, ou rejette au bout de 3 min.
  function waitForSession(code) {
    return new Promise(function (resolve, reject) {
      var stop = Date.now() + LC_MS, busy = false, done = false, timer;
      function finish(fn, v) { if (done) return; done = true; clearInterval(timer); document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check); window.removeEventListener('pageshow', check); fn(v); }
      function check() {
        if (done || busy) return;
        if (Date.now() > stop) { finish(reject, new Error('Connexion trop longue : réessaie.')); return; }
        busy = true;
        fetch(ENDPOINT + '/auth/claim?code=' + code, { cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { busy = false; if (d && d.session) finish(resolve, d.session); })
          .catch(function () { busy = false; });
      }
      timer = setInterval(check, 1500);
      document.addEventListener('visibilitychange', check);
      window.addEventListener('focus', check); window.addEventListener('pageshow', check);
      check();
    });
  }
  // Reprise après rechargement de la page pendant une connexion en cours (null s'il n'y en a pas).
  window.vgAdminResumeLogin = function () {
    var code = pendingCode();
    return code ? waitForSession(code).then(function (session) { acceptSession(session); return session; }) : null;
  };

  window.vgAdminLogin = function () {
    return new Promise(function (resolve, reject) {
      var code = randomCode();
      try { localStorage.setItem(LC, code + ':' + Date.now()); } catch (e) {}
      var url = ENDPOINT + '/auth?provider=github&site_id=' + encodeURIComponent(location.hostname) + '&lc=' + code
        + '&return=' + encodeURIComponent(location.origin + '/admin/connexion' + location.search);
      var popup = window.open(url, 'vg-github-login', 'width=600,height=720');
      var settled = false;
      function ok(session) { if (settled) return; settled = true; window.removeEventListener('message', onMessage); acceptSession(session); resolve(session); }
      function ko(err) { if (settled) return; settled = true; window.removeEventListener('message', onMessage); try { localStorage.removeItem(LC); } catch (e) {} reject(err); }
      if (!popup) { location.href = url; return; } // fenêtre bloquée : connexion dans cette même fenêtre, reprise au retour
      function onMessage(e) {
        if (e.origin !== ENDPOINT) return;
        var data = String(e.data || '');
        if (data === 'authorizing:github') { try { popup.postMessage(data, e.origin); } catch (err) {} return; }
        var m = /^authorization:github:(success|error):(.*)$/.exec(data);
        if (!m) return;
        var payload = {};
        try { payload = JSON.parse(m[2]); } catch (err) {}
        if (m[1] === 'success' && payload.session) ok(payload.session);
        else ko(new Error(payload.message || 'Connexion refusée.'));
      }
      window.addEventListener('message', onMessage);
      waitForSession(code).then(ok, ko); // chemin 2 : session réclamée avec le code
    });
  };

  // Déconnexion : oublie la session ici, vide les pages gardées hors ligne et fait révoquer la session par le Worker
  // (elle ne sert alors plus nulle part, même si quelqu'un l'avait copiée). Renvoie une promesse (fin de la révocation).
  // remote=true (bouton) : révocation par le Worker ; sinon (inactivité, session refusée) simple oubli local.
  window.vgAdminLogout = function (remote) {
    var s = '';
    try { s = localStorage.getItem(KEY) || ''; localStorage.removeItem(KEY); localStorage.removeItem('vg-admin-token'); localStorage.removeItem(LAST); localStorage.removeItem(LC); } catch (e) {}
    setCookie('');
    try { if (window.caches) caches.keys().then(function (ks) { ks.forEach(function (k) { caches.delete(k); }); }); } catch (e) {}
    if (!s || remote !== true) return Promise.resolve();
    return fetch(ENDPOINT + '/admin/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + s }, keepalive: true }).catch(function () {});
  };

  // Bouton « Se déconnecter » visible sur toutes les pages de l'admin (sauf la page de connexion).
  function logoutButton() {
    try {
      if (/\/admin\/connexion/.test(location.pathname) || document.getElementById('vg-logout-global')) return;
      var st = document.createElement('style');
      st.textContent = '#logout{display:none!important}#vg-logout-global{position:fixed;top:8px;right:8px;z-index:2147483646;font:600 13px/1 system-ui,sans-serif;padding:9px 14px;border-radius:999px;border:1px solid #171717;background:#171717;color:#fff;cursor:pointer}';
      document.head.appendChild(st);
      var b = document.createElement('button');
      b.type = 'button'; b.id = 'vg-logout-global'; b.textContent = 'Se déconnecter';
      b.addEventListener('click', function () {
        b.disabled = true; b.textContent = 'Déconnexion…';
        var done = false;
        function leave() { if (!done) { done = true; location.replace(SITE_URL + '/admin/connexion'); } }
        window.vgAdminLogout(true).then(leave); setTimeout(leave, 2500);
      });
      document.body.appendChild(b);
    } catch (e) {}
  }
  if (document.body) logoutButton(); else document.addEventListener('DOMContentLoaded', logoutButton);

  // Appel au Worker avec le jeton ; 401 -> jeton oublié (à reconnecter).
  window.vgAdminApi = function (path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ Authorization: 'Bearer ' + window.vgAdminToken(), 'Content-Type': 'application/json' }, opts.headers || {});
    return fetch(ENDPOINT + path, opts).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) {
          if (r.status === 401) window.vgAdminLogout();
          var e = new Error(d.error || r.status); e.status = r.status; throw e;
        }
        return d;
      });
    });
  };
})();
