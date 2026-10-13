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
  // Lien « Détourage iPhone » (…/studio-photo.html#srv=<tunnel>&k=<mot de passe>) : retenu dès la première page ouverte, même si la
  // connexion s'intercale (le « # » se perdait). Le studio lit ces valeurs ; rien n'est envoyé à un site.
  try {
    var hp = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    var hs = (hp.get('srv') || '').trim().replace(/[/]$/, ''), hk = (hp.get('k') || '').trim();
    if (/^https:[/][/][a-z0-9-]+[.]trycloudflare[.]com$/i.test(hs)) localStorage.setItem('vg-detourage-url', hs);
    if (/^[A-Za-z0-9_-]{16,128}$/.test(hk)) localStorage.setItem('vg-detourage-token', hk);
  } catch (e) {}
  // Numéro de version de l'admin, affiché en petit en bas à gauche de chaque page : permet de vérifier qu'on a bien la dernière version.
  // À changer à chaque mise à jour de l'admin (aaaa-mm-jj + lettre).
  window.VG_ADMIN_VERSION = '2026-10-14-a';
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
  var IDLE_MS = 4 * 60 * 60 * 1000; // 4 h sans rien faire (chaque reconnexion = une autorisation GitHub : trop de demandes = « Reauthorization required »)
  function idle() { try { var t = Number(localStorage.getItem(LAST)) || 0; return t > 0 && Date.now() - t > IDLE_MS; } catch (e) { return false; } }
  // Cookie de session lu par le garde des pages /admin (functions/admin/_middleware.js) : même valeur que la session,
  // valable 30 min après la dernière activité (le garde refuse les pages admin sans lui).
  function setCookie(v) {
    try {
      document.cookie = 'vg-admin=' + (v ? encodeURIComponent(v) : '') + '; path=/; max-age=' + (v ? 14400 : 0) + '; SameSite=Strict' + (location.protocol === 'https:' ? '; Secure' : '');
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
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { renew(); if (window.vgAdminToken()) touch(); } });
  window.addEventListener('pageshow', function (e) { if (e.persisted) { renew(); if (window.vgAdminToken()) touch(); } });
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
  //      (10 min : le temps du code à deux facteurs) pour reprendre l'attente si la page est rechargée ou recréée pendant la connexion.
  var LC = 'vg-login-code', LC_MS = 10 * 60 * 1000;
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
      function finish(fn, v) { if (done) return; done = true; clearInterval(timer); document.removeEventListener('visibilitychange', wake); window.removeEventListener('focus', wake); window.removeEventListener('pageshow', wake); fn(v); }
      var busySince = 0;
      function check() {
        if (done) return;
        if (Date.now() > stop) { finish(reject, new Error('Connexion trop longue : touche « Se connecter » pour réessayer.')); return; }
        if (busy && Date.now() - busySince < 6000) return; // une demande est déjà en cours (sinon : elle est considérée comme perdue)
        busy = true; busySince = Date.now();
        var ctl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { busy = false; if (ctl) ctl.abort(); }, 6000);
        fetch(ENDPOINT + '/auth/claim?code=' + code, { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { clearTimeout(to); busy = false; if (d && d.session) finish(resolve, d.session); })
          .catch(function () { clearTimeout(to); busy = false; });
      }
      // Retour au premier plan (appli iPhone revenue de la fenêtre GitHub) : on repart de zéro, même si une demande était restée en suspens.
      function wake() { if (!document.hidden) { busy = false; check(); } }
      timer = setInterval(check, 1500);
      document.addEventListener('visibilitychange', wake);
      window.addEventListener('focus', wake); window.addEventListener('pageshow', wake);
      check();
    });
  }
  // Reprise après rechargement de la page pendant une connexion en cours (null s'il n'y en a pas).
  window.vgAdminResumeLogin = function () {
    var code = pendingCode();
    return code ? waitForSession(code).then(function (session) { acceptSession(session); return session; }) : null;
  };

  function installed() {
    try { return !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches)); } catch (e) { return false; }
  }
  window.vgAdminInstalled = installed;
  window.vgAdminLogin = function () {
    return new Promise(function (resolve, reject) {
      // Une connexion a démarré il y a moins de 90 s : on la reprend au lieu de redemander une autorisation à GitHub.
      try {
        var cur = (localStorage.getItem(LC) || '').split(':');
        if (cur[0] && Date.now() - Number(cur[1]) < 90000) { waitForSession(cur[0]).then(function (ss) { acceptSession(ss); resolve(ss); }, reject); return; }
      } catch (e) {}
      var code = randomCode();
      try { localStorage.setItem(LC, code + ':' + Date.now()); } catch (e) {}
      var inApp = installed();
      var url = ENDPOINT + '/auth?provider=github&site_id=' + encodeURIComponent(location.hostname) + '&lc=' + code
        + '&return=' + encodeURIComponent(location.origin + '/admin/connexion' + location.search) + (inApp ? '&mode=page' : '');
      // Appli installée : pas de fenêtre à part, la connexion se fait dans cette page et revient directement sur l'admin.
      if (inApp) { location.href = url; return; }
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

  // Bouton « Se déconnecter » en haut de chaque page (il défile avec la page : jamais au-dessus d'un bouton Enregistrer) sur toutes les pages de l'admin (sauf la page de connexion).
  function logoutButton() {
    try {
      if (/\/admin\/connexion/.test(location.pathname) || document.getElementById('vg-logout-global')) return;
      var st = document.createElement('style');
      st.textContent = '#logout{display:none!important}#vg-logout-global{font:600 13px/1 system-ui,sans-serif;padding:10px 14px;border-radius:999px;border:1px solid #6b6860;background:transparent;color:#171717;cursor:pointer;margin:6px 0}#vg-logout-bar{display:flex;justify-content:flex-end;padding:6px 12px 0}';
      document.head.appendChild(st);
      var b = document.createElement('button');
      b.type = 'button'; b.id = 'vg-logout-global'; b.textContent = 'Se déconnecter';
      b.addEventListener('click', function () {
        b.disabled = true; b.textContent = 'Déconnexion…';
        var done = false;
        function leave() { if (!done) { done = true; location.replace(SITE_URL + '/admin/connexion'); } }
        window.vgAdminLogout(true).then(leave); setTimeout(leave, 2500);
      });
      // Placé tout en bas de la page, dans le flux (aucun chevauchement possible, sur PC comme sur iPhone).
      var bar = document.createElement('div'); bar.id = 'vg-logout-bar'; bar.appendChild(b);
      bar.style.cssText = 'display:flex;justify-content:center;padding:28px 12px 56px';
      document.body.appendChild(bar);
    } catch (e) {}
  }
  if (document.body) logoutButton(); else document.addEventListener('DOMContentLoaded', logoutButton);

  // Appel au Worker avec le jeton ; 401 -> jeton oublié (à reconnecter).
  window.vgAdminApi = function (path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ Authorization: 'Bearer ' + window.vgAdminToken(), 'Content-Type': 'application/json' }, opts.headers || {});
    return fetch(ENDPOINT + path, opts).catch(function () { throw new Error('Pas de connexion au serveur : vérifie ton réseau et réessaie.'); }).then(function (r) {
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
