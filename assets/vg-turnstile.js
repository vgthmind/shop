/* Cloudflare Turnstile (anti-robot gratuit, invisible). Clé publique = turnstile_site_key dans data/shop-settings.json
   (injectée par le build dans window.VG_TURNSTILE_KEY). Sans clé : le jeton est vide et le Worker décide (voir turnstile.ts). */
(function () {
  var key = window.VG_TURNSTILE_KEY, loading = null, wid = null, box = null;
  function load() {
    if (loading) return loading;
    loading = new Promise(function (ok, ko) {
      if (window.turnstile) return ok();
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true; s.onload = function () { ok(); }; s.onerror = function () { loading = null; ko(new Error('turnstile')); };
      document.head.appendChild(s);
    });
    return loading;
  }
  window.vgTurnstile = {
    enabled: !!key,
    // Résout avec un jeton (chaîne vide si Turnstile n'est pas activé sur ce site). Rejette si le script est bloqué.
    token: function () {
      if (!key) return Promise.resolve('');
      return load().then(function () {
        return new Promise(function (ok, ko) {
          if (!box) { box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(box); }
          var opts = { sitekey: key, execution: 'execute', appearance: 'interaction-only', callback: ok, 'error-callback': function () { ko(new Error('turnstile')); }, 'timeout-callback': function () { ko(new Error('turnstile')); } };
          if (wid !== null) { try { window.turnstile.remove(wid); } catch (e) {} } // un nouvel essai (après une erreur) repart d'un widget neuf
          wid = window.turnstile.render(box, opts);
          window.turnstile.execute(wid);
        });
      });
    }
  };
})();
