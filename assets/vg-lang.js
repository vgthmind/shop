/* Bouton de langue EN | FR (même design, mêmes adresses).
   - Langue : choix gardé dans ce navigateur (localStorage « vg-lang »), sinon langue du navigateur, anglais par défaut.
   - Le HTML garde toujours les deux langues : on n'en cache qu'une (CSS : [data-l="fr"] / [data-l="en"]).
   - Pages « anglais puis français » (séparées par .vg-lang-sep) et fiches pièce (1er paragraphe EN, 2e FR) : étiquetées ici.
   - Textes du site (menu, pied de page, boutons) : petit dictionnaire EN <-> FR.
   - window.vgLang et window.vgL(en, fr) sont utilisés par le panier (vg-shop-cart.js). */
(function () {
  'use strict';
  var KEY = 'vg-lang';
  function detect() {
    var l = '';
    try { l = localStorage.getItem(KEY) || ''; } catch (e) {}
    if (l === 'fr' || l === 'en') return l;
    return /^fr/i.test((navigator.languages && navigator.languages[0]) || navigator.language || '') ? 'fr' : 'en';
  }
  var lang = detect();
  window.vgLang = lang;
  window.vgL = function (en, fr) { return lang === 'fr' ? fr : en; };
  var root = document.documentElement;
  root.setAttribute('data-vg-lang', lang); root.setAttribute('lang', lang);

  // Texte d'interface : { texte anglais d'origine : traduction française } et inversement pour les textes français d'origine.
  var FR = {
    'Home': 'Accueil', 'Products': 'Boutique', 'Latest Drop': 'Nouveautés', 'All': 'Tout', 'Tops': 'Hauts', 'Pants/Shorts': 'Pantalons/Shorts',
    'Accessories': 'Accessoires', 'Info & Terms': 'Infos & conditions', 'Track my order': 'Suivre ma commande', 'Cart': 'Panier', 'Cart (': 'Panier (',
    'Add to cart': 'Ajouter au panier', 'Sold out': 'Vendu', 'Sold Out': 'Vendu', 'Your cart is empty': 'Ton panier est vide', 'Search': 'Rechercher',
    'Unique piece': 'Pièce unique', 'UNIQUE PIECE': 'PIÈCE UNIQUE', 'Menu': 'Menu', 'Shop': 'Boutique',
    'Start a project': 'Proposer un projet', 'My request': 'Ma demande'
  };
  var EN = { 'Mentions légales': 'Legal notice', 'Confidentialité': 'Privacy', 'Produits': 'Products', 'PRODUITS': 'PRODUCTS' };
  var SELECTORS = 'nav.sections a, #navigation-modal a, .navigation-modal a, footer a, .welcome_button, .add-to-cart-button, .product-status, .product-list-thumb-status, .unique-badge, .alert-message__text, .vg-back-link, .vg-cart-btn, h1.page-title, body.custom h1, .featured-title, .cart-header h1, .page_list a';

  function textNodes(el) {
    var out = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    while (w.nextNode()) if (w.currentNode.nodeValue.trim()) out.push(w.currentNode);
    return out;
  }
  function translateUi() {
    document.querySelectorAll(SELECTORS).forEach(function (el) {
      textNodes(el).forEach(function (n) {
        if (n.__vgO === undefined) n.__vgO = n.nodeValue;
        var o = n.__vgO, core = o.trim().replace(/^[←→+\s]+/, ''), pre = o.slice(0, o.indexOf(core)), post = o.slice(o.indexOf(core) + core.length);
        var tr = lang === 'fr' ? FR[core] : EN[core];
        n.nodeValue = tr ? pre + tr + post : o;
      });
    });
  }

  // Pages empilées : éléments entre deux .vg-lang-sep (« English » / « Français ») étiquetés en/fr.
  function tagStacked() {
    document.querySelectorAll('.vg-lang-sep').forEach(function (sep) {
      var t = (sep.textContent || '').trim().toLowerCase();
      var l = /^english/.test(t) ? 'en' : /^fran/.test(t) ? 'fr' : '';
      if (!l) return;
      sep.setAttribute('data-l-sep', '1');
      for (var n = sep.nextElementSibling; n && !n.classList.contains('vg-lang-sep'); n = n.nextElementSibling) {
        if (!n.hasAttribute('data-l') && n.tagName !== 'STYLE' && n.tagName !== 'SCRIPT') n.setAttribute('data-l', l);
      }
    });
    // Si la page a ses deux langues étiquetées, les titres « English / Français » sont inutiles.
    if (document.querySelector('[data-l-sep]')) root.setAttribute('data-vg-stacked', '1');
  }
  // Fiche pièce : description = bloc anglais puis bloc français (1er et dernier paragraphe).
  function tagDescription() {
    var d = document.querySelector('.product-description');
    if (!d || d.querySelector('[data-l]')) return;
    var ps = d.querySelectorAll(':scope > p');
    if (ps.length >= 2) { ps[0].setAttribute('data-l', 'en'); for (var i = 1; i < ps.length; i++) ps[i].setAttribute('data-l', 'fr'); }
  }
  // Pages « Merci » / « Paiement annulé » / 404 : paragraphes par paires (anglais puis français).
  function tagOrderResult() {
    var box = document.querySelector('.vg-order-result');
    if (!box || box.__vgPairs) return;
    box.__vgPairs = true;
    var ps = [].slice.call(box.children).filter(function (e) { return e.tagName === 'P' && !e.querySelector('.button') && !e.hasAttribute('data-l'); });
    ps.forEach(function (p, i) { p.setAttribute('data-l', i % 2 === 0 ? 'en' : 'fr'); });
  }
  // Pages techniques « Thank you / Merci » : titre découpé.
  function splitTitles() {
    var id = document.body && document.body.id;
    if (['merci', 'paiement-annule', '404'].indexOf(id) === -1) return;
    var h = document.querySelector('main h1');
    if (h) {
      if (h.__vgO === undefined) h.__vgO = h.textContent;
      var p = h.__vgO.split(' / ');
      if (p.length === 2) h.textContent = lang === 'fr' ? p[1] : p[0];
    }
    var tp = (document.title || '').split(' | ')[0];
    if (!document.__vgTitle) document.__vgTitle = document.title;
    var parts = document.__vgTitle.split(' | '), bi = parts[0].split(' / ');
    if (bi.length === 2) document.title = (lang === 'fr' ? bi[1] : bi[0]) + (parts[1] ? ' | ' + parts.slice(1).join(' | ') : '');
  }

  function apply() {
    root.setAttribute('data-vg-lang', lang); root.setAttribute('lang', lang);
    tagStacked(); tagDescription(); tagOrderResult(); splitTitles(); translateUi(); syncButton();
  }

  var btn;
  function syncButton() {
    if (!btn) return;
    btn.querySelector('[data-b=en]').setAttribute('aria-current', String(lang === 'en'));
    btn.querySelector('[data-b=fr]').setAttribute('aria-current', String(lang === 'fr'));
    btn.setAttribute('aria-label', lang === 'fr' ? 'Langue : français. Passer en anglais' : 'Language: English. Switch to French');
  }
  function set(l) {
    lang = l; window.vgLang = l;
    try { localStorage.setItem(KEY, l); localStorage.setItem('vg-track-lang', l); } catch (e) {}
    // Pages dont le contenu est écrit par JavaScript (panier, merci, suivi) : on recharge pour tout retraduire.
    if (document.querySelector('.cart-wrapper, [data-vg-track], #vg-order-result, .vg-order-result')) { location.reload(); return; }
    apply();
    // Pages qui se retraduisent seules sans perdre la saisie (parcours « Proposer un projet », « Ma demande »).
    try { document.dispatchEvent(new CustomEvent('vg:lang', { detail: l })); } catch (e) {}
  }
  function addButton() {
    var ul = document.querySelector('nav.utility ul');
    if (!ul || document.querySelector('.vg-lang-toggle')) return;
    var li = document.createElement('li'); li.className = 'vg-lang-li';
    btn = document.createElement('button'); btn.type = 'button'; btn.className = 'vg-lang-toggle';
    btn.innerHTML = '<span data-b="en">EN</span><i aria-hidden="true">|</i><span data-b="fr">FR</span>';
    btn.addEventListener('click', function () { set(lang === 'fr' ? 'en' : 'fr'); });
    li.appendChild(btn); ul.insertBefore(li, ul.firstChild);
    syncButton();
  }

  function init() { addButton(); apply(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  // Contenus ajoutés après coup (Sold out, panier...).
  var t = null;
  new MutationObserver(function () { clearTimeout(t); t = setTimeout(function () { translateUi(); tagDescription(); }, 120); })
    .observe(document.documentElement, { childList: true, subtree: true });
}());
