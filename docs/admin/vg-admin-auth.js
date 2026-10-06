/* Connexion des pages admin maison (Stock, Commandes) : « Se connecter avec
   GitHub », même relais OAuth que Sveltia (Worker /auth -> /callback, seul
   le compte vgthmind est accepté). Le jeton reste dans ce navigateur
   (localStorage), comme celui de Sveltia, qu'on réutilise s'il existe. */
(function () {
  'use strict';
  var ENDPOINT = 'https://vgthmind-shop-checkout.vgthm66.workers.dev';
  window.VG_ENDPOINT = ENDPOINT;

  window.vgAdminToken = function () {
    try {
      var own = localStorage.getItem('vg-admin-token');
      if (own) return own;
      var sveltia = JSON.parse(localStorage.getItem('sveltia-cms.user') || 'null');
      if (sveltia && sveltia.token) return sveltia.token;
    } catch (e) {}
    return '';
  };

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
        if (m[1] === 'success' && payload.token) {
          try { localStorage.setItem('vg-admin-token', payload.token); } catch (err) {}
          resolve(payload.token);
        } else {
          reject(new Error(payload.message || 'Connexion refusée.'));
        }
      }
      window.addEventListener('message', onMessage);
    });
  };

  window.vgAdminLogout = function () {
    try { localStorage.removeItem('vg-admin-token'); } catch (e) {}
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
