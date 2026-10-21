/* Mesure d'audience maison (sans cookie, sans identifiant, rien n'est garde dans
   le navigateur). Envoie au Worker : la page, d'ou on vient (domaine du referent
   et ?utm_source), et un battement toutes les 60 s (20 au plus par page ouverte) tant que la page est visible
   (pour « visiteurs en ce moment »). Rien n'est envoye pour l'admin connecte,
   les pages /admin, ni quand le navigateur demande de ne pas etre suivi (DNT). */
(function () {
  'use strict';
  var ENDPOINT = 'https://vgthmind-shop-checkout.vgthm66.workers.dev';
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
  if (/(^|\/)admin(\/|$)/.test(location.pathname)) return;
  // Visites de test : navigateur automatisé, page dans un cadre (audit), serveur local, ou « ?notrack=1 » (mémorisé dans ce navigateur).
  try { if (/[?&]notrack=1/.test(location.search)) localStorage.setItem('vg-notrack', '1'); if (localStorage.getItem('vg-notrack') === '1') return; } catch (e) {}
  if (navigator.webdriver || window.top !== window.self) return;
  if (/^(localhost|127\.0\.0\.1|\[::1\])$|\.(localhost|test)$/.test(location.hostname)) return;
  // Session admin (meme origine que la boutique) : mes visites ne comptent pas.
  try {
    var s = localStorage.getItem('vg-admin-session') || '';
    if (s && Number(s.split('.')[1]) > Date.now() / 1000) return;
  } catch (e) {}

  var utm = '';
  try { var q = new URLSearchParams(location.search); utm = q.get('utm_source') || q.get('ref') || ''; } catch (e) {}

  function refOwn() { try { return new URL(document.referrer).hostname === location.hostname; } catch (e) { return false; } }

  function send(hb) {
    var body = JSON.stringify({ p: location.pathname, r: hb || refOwn() ? '' : document.referrer, u: utm, hb: !!hb });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT + '/t', body)) return;
    } catch (e) {}
    try { fetch(ENDPOINT + '/t', { method: 'POST', body: body, keepalive: true, mode: 'no-cors' }); } catch (e) {}
  }

  send(false);
  var beats = 0;
  var timer = setInterval(function () { if (document.visibilityState === 'visible' && ++beats <= 20) send(true); else if (beats > 20) clearInterval(timer); }, 60000);
})();
