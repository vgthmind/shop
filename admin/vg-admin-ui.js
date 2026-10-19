/* Cadre commun de l'admin : feuille de style + menu à 5 entrées (barre en haut sur PC, en bas sur iPhone) avec pastilles
   « à traiter ». À charger après vg-admin-auth.js sur chaque page (sauf la connexion). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VGAdminUI = factory(root);
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var ENTRIES = [
    { id: 'dash', label: 'Accueil', short: 'Accueil', href: 'menu.html', icon: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z"/>' },
    { id: 'orders', label: 'Commandes', short: 'Commandes', href: 'commandes.html', icon: '<path d="M4 8h16l-1 12H5zM8 8V6a4 4 0 0 1 8 0v2"/>' },
    { id: 'requests', label: 'Demandes', short: 'Demandes', href: 'demandes.html', icon: '<path d="M4 5h16v11H9l-5 4z"/>' },
    { id: 'pieces', label: 'Pièces', short: 'Pièces', href: 'catalogue.html', icon: '<path d="M9 4 4 7l2 4 2-1v10h8V10l2 1 2-4-5-3a3.5 3.5 0 0 1-6 0z"/>' },
    { id: 'settings', label: 'Réglages', short: 'Réglages', href: 'reglages.html', icon: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>' }
  ];
  var SHOP_ICON = '<path d="M4 9h16l-1-4H5zM5 9v11h14V9M9 20v-6h6v6"/>';
  // Page de l'admin -> entrée du menu qui la contient. Toute page « reglages-… » appartient à Réglages.
  var OWNER = {
    'menu.html': 'dash', 'catalogue.html': 'pieces', 'nouvelle-piece.html': 'pieces',
    'commandes.html': 'orders', 'demandes.html': 'requests', 'reglages.html': 'settings'
  };
  function activeFor(pathname) {
    var file = String(pathname || '').split('?')[0].split('#')[0].split('/').pop() || 'menu.html';
    if (!/\.html$/.test(file)) file += '.html'; // l'hébergeur sert /admin/commandes sans .html
    return OWNER[file] || (/^reglages-/.test(file) ? 'settings' : null);
  }
  var api = { ENTRIES: ENTRIES, activeFor: activeFor };
  if (!root || !root.document) return api;

  var doc = root.document, CK = 'vg-admin-counts';

  function css() {
    var l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = 'vg-admin-ui.css?v=3'; doc.head.appendChild(l);
  }
  // À expédier / demandes à traiter : même calcul que l'ancien tableau de bord, gardé 60 s (une seule demande pour toutes les pages).
  api.counts = function () {
    try { var c = JSON.parse(root.sessionStorage.getItem(CK) || 'null'); if (c && Date.now() - c.t < 60000) return Promise.resolve(c); } catch (e) {}
    if (!root.vgAdminToken || !root.vgAdminToken()) return Promise.resolve({ orders: 0, requests: 0 });
    var out = { t: Date.now(), orders: 0, requests: 0 };
    return Promise.all([
      root.vgAdminApi('/orders').then(function (d) {
        out.orders = (d.orders || []).filter(function (o) { return !o.shipped && o.livemode && o.kind !== 'deposit' && !(o.refunded && o.refunded.full); }).length;
      }).catch(function () {}),
      root.vgAdminApi('/admin/requests').then(function (d) {
        out.requests = (d.requests || []).filter(function (r) { return r.status === 'nouvelle' || r.forfeited || (r.validation && r.status === 'validation' && r.validation.retouches.some(function (x) { return x.extra; })); }).length;
      }).catch(function () {})
    ]).then(function () { try { root.sessionStorage.setItem(CK, JSON.stringify(out)); } catch (e) {} return out; });
  };

  function nav() {
    var cur = activeFor(root.location.pathname);
    var h = doc.createElement('nav'); h.id = 'vg-nav'; h.setAttribute('aria-label', 'Menu de l\'admin');
    h.innerHTML = '<div class="in"><a class="brand" href="menu.html">vgthmind</a><ul>' + ENTRIES.map(function (e) {
      return '<li><a class="it" href="' + e.href + '" data-id="' + e.id + '"' + (e.id === cur ? ' aria-current="page"' : '') + ' title="' + e.label + '">'
        + '<svg viewBox="0 0 24 24" aria-hidden="true">' + e.icon + '</svg><span class="lb"></span><span class="nb" hidden></span></a></li>';
    }).join('') + '</ul><a class="shop" href="../" target="_blank" rel="noopener" title="Voir la boutique" aria-label="Voir la boutique"><svg viewBox="0 0 24 24" aria-hidden="true">' + SHOP_ICON + '</svg></a></div>';
    // Libellé complet sur PC, court sur iPhone (largeur d'écran).
    var mq = root.matchMedia ? root.matchMedia('(max-width: 759px)') : null;
    function labels() { ENTRIES.forEach(function (e) { h.querySelector('[data-id=' + e.id + '] .lb').textContent = mq && mq.matches ? e.short : e.label; }); }
    labels(); if (mq && mq.addEventListener) mq.addEventListener('change', labels);
    doc.body.insertBefore(h, doc.body.firstChild);
    // iPhone : le menu est en bas, l'icône « Voir la boutique » reste donc en haut à droite de la page.
    var top = doc.createElement('a'); top.id = 'vg-shop-m'; top.href = '../'; top.target = '_blank'; top.rel = 'noopener'; top.title = 'Voir la boutique'; top.setAttribute('aria-label', 'Voir la boutique');
    top.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + SHOP_ICON + '</svg>';
    doc.body.appendChild(top);
    // Anciens liens « ← Tableau de bord » en tête de page : masqués (le menu les remplace).
    Array.prototype.forEach.call(doc.querySelectorAll('main > nav, body > nav:not(#vg-nav)'), function (n) { if (n.id !== 'vg-nav' && n.querySelector('a[href="menu.html"]')) n.classList.add('vg-legacy-nav'); });
    api.counts().then(function (c) {
      [['orders', c.orders], ['requests', c.requests]].forEach(function (p) {
        var b = h.querySelector('[data-id=' + p[0] + '] .nb'); if (p[1]) { b.textContent = p[1]; b.hidden = false; }
      });
    });
  }

  // Une seule connexion pour tout l'admin : sans session, on passe par la page de connexion (qui revient ensuite ici), jamais de bouton « Se connecter » par page.
  function needLogin() {
    if (!root.vgAdminToken || root.vgAdminToken() || /[?&]demo=1/.test(root.location.search)) return false;
    root.location.replace('/admin/connexion?next=' + encodeURIComponent(root.location.pathname + root.location.search + root.location.hash));
    return true;
  }
  function start() { if (needLogin()) return; doc.body.classList.add('vg-ui'); css(); nav(); }
  if (/\/admin\/connexion/.test(root.location.pathname)) return api;
  if (doc.body) start(); else doc.addEventListener('DOMContentLoaded', start);
  return api;
}));
