/* Connexion des pages admin maison (Stock, Commandes) : « Se connecter avec
   GitHub », même relais OAuth que Sveltia (Worker /auth -> /callback, seul
   le compte vgthmind est accepté). Le Worker rend une session signée de 7 jours,
   gardée dans ce navigateur (localStorage, pas de cookie : Safari bloque les
   cookies tiers) et renouvelée à chaque visite. Le jeton GitHub n'est pas gardé.
   Sécurité : déconnexion automatique après 12 h sans activité ; page refusée
   si un autre site l'affiche dans un cadre (clic piégé). */
(function () {
  'use strict';
  // Page admin dans un cadre d'un AUTRE site : on n'affiche rien.
  try {
    if (window.top !== window.self && window.top.location.origin !== location.origin) throw new Error('cadre');
  } catch (e) {
    document.documentElement.style.display = 'none';
    return;
  }
  var ENDPOINT = 'https://vgthmind-shop-checkout.vgthm66.workers.dev';
  window.VG_ENDPOINT = ENDPOINT;

  var KEY = 'vg-admin-session';
  var LAST = 'vg-admin-last'; // dernière activité (ms) sur une page admin
  var IDLE_MS = 12 * 60 * 60 * 1000;

  // Session signee par le Worker (30 jours, renouvelee), vide si absente ou expiree.
  window.vgAdminToken = function () {
    try {
      var s = localStorage.getItem(KEY) || '';
      var exp = Number(s.split('.')[1]);
      return exp > Date.now() / 1000 ? s : '';
    } catch (e) { return ''; }
  };

  // Renouvelle la session quand il lui reste moins de 6 jours (sessions de 7 jours : une fois par jour).
  function renew() {
    var s = window.vgAdminToken();
    if (!s || Number(s.split('.')[1]) - Date.now() / 1000 > 6 * 86400) return;
    fetch(ENDPOINT + '/admin/renew', { method: 'POST', headers: { Authorization: 'Bearer ' + s } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.session && window.vgAdminToken()) localStorage.setItem(KEY, d.session); })
      .catch(function () {});
  }

  window.vgAdminLogin = function () {
    return new Promise(function (resolve, reject) {
      var popup = window.open(ENDPOINT + '/auth?provider=github&site_id=' + encodeURIComponent(location.hostname),
        'vg-github-login', 'width=600,height=720');
      if (!popup) { reject(new Error('Fenêtre bloquée par le navigateur : autorise les pop-ups pour ce site.')); return; }
      function onMessage(e) {
        if (e.origin !== ENDPOINT) return;
        var data = String(e.data || '');
        if (data === 'authorizing:github') { popup.postMessage(data, e.origin); return; }
        var m = /^authorization:github:(success|error):(.*)$/.exec(data);
        if (!m) return;
        window.removeEventListener('message', onMessage);
        var payload = {};
        try { payload = JSON.parse(m[2]); } catch (err) {}
        if (m[1] === 'success' && payload.session) {
          try { localStorage.setItem(KEY, payload.session); } catch (err) {}
          touch();
          resolve(payload.session);
        } else {
          reject(new Error(payload.message || 'Connexion refusée.'));
        }
      }
      window.addEventListener('message', onMessage);
    });
  };

  window.vgAdminLogout = function () {
    try { localStorage.removeItem(KEY); localStorage.removeItem('vg-admin-token'); } catch (e) {}
  };

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

  // Déconnexion après IDLE_MS sans clic ni frappe sur une page admin (tous onglets confondus).
  function lastActive() { try { return Number(localStorage.getItem(LAST)) || 0; } catch (e) { return 0; } }
  function touch() { try { localStorage.setItem(LAST, String(Date.now())); } catch (e) {} }
  function idleCheck() {
    var last = lastActive();
    if (!window.vgAdminToken()) return false;
    if (!last) { touch(); return false; } // première visite depuis cette mise à jour : pas de déconnexion surprise
    if (Date.now() - last <= IDLE_MS) return false;
    window.vgAdminLogout();
    return true;
  }
  idleCheck();
  renew(); // après le contrôle d'inactivité : une session expirée par inactivité n'est jamais renouvelée
  var lastTouch = 0;
  function onActivity() { var n = Date.now(); if (n - lastTouch > 60000) { lastTouch = n; if (!idleCheck()) touch(); } }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (t) { window.addEventListener(t, onActivity, { passive: true, capture: true }); });
  // Onglet resté ouvert : les données affichées (clients, commandes) sont retirées de l'écran.
  setInterval(function () {
    if (!idleCheck()) return;
    document.body.innerHTML = '<main style="max-width:560px;margin:15vh auto;padding:0 16px;font:16px system-ui">'
      + '<p>Déconnecté après 12 h sans activité.</p><p><button type="button">Se reconnecter</button></p></main>';
    document.body.querySelector('button').addEventListener('click', function () { location.reload(); });
  }, 5 * 60 * 1000);
})();
