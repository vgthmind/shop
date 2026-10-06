/* Connexion des pages admin maison (Stock, Commandes) : « Se connecter avec
   GitHub », même relais OAuth que Sveltia (Worker /auth -> /callback, seul
   le compte vgthmind est accepté). Le Worker rend une session signée de 30 jours,
   gardée dans ce navigateur (localStorage, pas de cookie : Safari bloque les
   cookies tiers) et renouvelée à chaque visite. Le jeton GitHub n'est pas gardé. */
(function () {
  'use strict';
  var ENDPOINT = 'https://vgthmind-shop-checkout.vgthm66.workers.dev';
  window.VG_ENDPOINT = ENDPOINT;

  var KEY = 'vg-admin-session';

  // Session signee par le Worker (30 jours, renouvelee), vide si absente ou expiree.
  window.vgAdminToken = function () {
    try {
      var s = localStorage.getItem(KEY) || '';
      var exp = Number(s.split('.')[1]);
      return exp > Date.now() / 1000 ? s : '';
    } catch (e) { return ''; }
  };

  // Renouvelle la session si elle a plus d'un jour (sans bloquer la page).
  function renew() {
    var s = window.vgAdminToken();
    if (!s || Number(s.split('.')[1]) - Date.now() / 1000 > 29 * 86400) return;
    fetch(ENDPOINT + '/admin/renew', { method: 'POST', headers: { Authorization: 'Bearer ' + s } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.session) localStorage.setItem(KEY, d.session); })
      .catch(function () {});
  }
  renew();

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
})();
