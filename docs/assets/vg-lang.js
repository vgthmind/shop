/* Bouton de langue : deux touches chromées FR | EN (en-tête, et bas du menu sur téléphone), même matière que le menu.
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
    'Home': 'Accueil', 'Products': 'Boutique', 'All': 'Tout', 'Tops': 'Hauts', 'Pants/Shorts': 'Pantalons/Shorts',
    'Accessories': 'Accessoires', 'Info & Terms': 'Infos & conditions', 'Track my order': 'Suivre ma commande', 'Cart': 'Panier', 'Cart (': 'Panier (',
    'Add to cart': 'Ajouter au panier', 'Sold out': 'Vendu', 'Sold Out': 'Vendu', 'Your cart is empty': 'Ton panier est vide', 'Search': 'Rechercher',
    'Unique piece': 'Pièce unique', 'UNIQUE PIECE': 'PIÈCE UNIQUE', 'Menu': 'Menu', 'Shop': 'Boutique',
    'Start a project': 'Proposer un projet', 'My request': 'Ma demande', 'Enter': 'Entrer',
    'Latest Drop': 'Dernier drop', '✦ Latest Drop': '✦ Dernier drop'
  };
  var EN = { 'Voir le post · @vgthmind': 'View the post · @vgthmind', 'Voir la piece portee · @vgthmind': 'See the piece worn · @vgthmind', 'Mentions légales': 'Legal notice', 'Confidentialité': 'Privacy', 'Produits': 'Products', 'PRODUITS': 'PRODUCTS', 'Boutique': 'Shop' };
  var SELECTORS = 'nav.sections a, #navigation-modal a, .navigation-modal a, footer a, .welcome_button, .add-to-cart-button, .product-status, .product-list-thumb-status, .unique-badge, .alert-message__text, .vg-back-link, .vg-cart-btn, h1.page-title, body.custom h1, .featured-title, .cart-header h1, .page_list a, .vg-crumbs a, .subheader .categories a, .vg-category-tile-label, .vg-enter, .ig-reel-label, main h1';

  // Attributs lus par les lecteurs d'écran / info-bulles (texte anglais d'origine -> français).
  var ATTR_FR = {
    'Open mobile navigation': 'Ouvrir le menu', 'Close navigation': 'Fermer le menu', 'Search': 'Rechercher', 'Close search dialog': 'Fermer la recherche',
    'Close search': 'Fermer la recherche', 'Submit search form': 'Lancer la recherche', 'Search results': 'Résultats de recherche', 'Search products…': 'Rechercher une pièce…',
    'Announcement message': 'Annonce', 'Close announcement message': "Fermer l'annonce", 'Breadcrumb': "Fil d'Ariane", 'Primary navigation': 'Navigation principale',
    'Secondary navigation': 'Navigation secondaire', 'Social links': 'Réseaux sociaux', 'View cart': 'Voir le panier', 'Home image carousel': "Images d'accueil",
    'Select a slide to show': 'Choisir une image', 'Next slide': 'Image suivante', 'Previous slide': 'Image précédente', 'Go to last slide': 'Aller à la dernière image',
    'Go to first slide': 'Aller à la première image', 'Slide left': 'Images précédentes', 'Slide right': 'Images suivantes', 'View previous image': 'Photo précédente',
    'View next image': 'Photo suivante', 'vgthmind Home': 'vgthmind, accueil', 'vgthmind — one-of-a-kind pieces made in France': 'vgthmind — pièces uniques fabriquées en France'
  };
  var ATTR_FR_RE = [
    [/^View image (\d+) of (\d+)$/, 'Voir la photo $1 sur $2'], [/^Open image (\d+) in image viewer$/, 'Agrandir la photo $1'],
    [/^Go to slide (\d+)$/, "Aller à l'image $1"], [/^(\d+) of (\d+)$/, '$1 sur $2'], [/^(.+) images$/, 'Photos de $1']
  ];
  var ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];
  function translateAttrs() {
    document.querySelectorAll('[aria-label],[title],[placeholder],[alt]').forEach(function (el) {
      if (el.closest('.vg-lang-toggle')) return;
      if (!el.__vgA) el.__vgA = {};
      ATTRS.forEach(function (a) {
        var v = el.getAttribute(a); if (v == null) return;
        var o = el.__vgA[a];
        if (o === undefined || (v !== o.en && v !== o.cur)) { o = el.__vgA[a] = { en: v }; }
        var fr = ATTR_FR[o.en];
        if (fr === undefined) for (var i = 0; i < ATTR_FR_RE.length && fr === undefined; i++) if (ATTR_FR_RE[i][0].test(o.en)) fr = o.en.replace(ATTR_FR_RE[i][0], ATTR_FR_RE[i][1]);
        o.fr = fr;
        var want = lang === 'fr' && fr ? fr : o.en;
        // Mode EN : nom anglais facultatif de la pièce (window.vgNamesEn, posé au build) à la place du nom français.
        if (lang === 'en' && window.vgNamesEn) for (var nm in window.vgNamesEn) if (want.indexOf(nm) !== -1) want = want.split(nm).join(window.vgNamesEn[nm]);
        o.cur = want; if (v !== want) el.setAttribute(a, want);
      });
    });
  }
  // Titres d'onglet : partie avant « | ». FR = textes anglais d'origine traduits, EN = textes français d'origine traduits.
  var TITLE_FR = { 'Start a project': 'Proposer un projet', 'Cart': 'Panier', 'Products': 'Boutique', 'All': 'Tout', 'Tops': 'Hauts', 'Pants/Shorts': 'Pantalons/Shorts', 'Accessories': 'Accessoires', 'My request': 'Ma demande', 'Latest Drop': 'Dernier drop' };
  var TITLE_EN = {
    'vgthmind — créations fabriquées en France': 'vgthmind — handmade in France', 'Boutique — créations vgthmind': 'Shop — vgthmind',
    'Infos & conditions de vente': 'Info & terms of sale', 'Mentions légales': 'Legal notice', 'Confidentialité': 'Privacy', 'Suivre ma commande': 'Track my order'
  };
  function translateTitle() {
    if (document.__vgTitle === undefined) document.__vgTitle = document.title;
    var parts = document.__vgTitle.split(' | '), head = parts[0], bi = head.split(' / ');
    if (bi.length === 2) head = lang === 'fr' ? bi[1] : bi[0];
    else head = (lang === 'fr' ? TITLE_FR[head] : TITLE_EN[head]) || head;
    // Fiche pièce avec nom anglais facultatif : l'onglet suit le titre de la page.
    var hEn = document.querySelector('main h1 [data-l="en"]'), hFr = document.querySelector('main h1 [data-l="fr"]');
    if (hEn && hFr && lang === 'en' && head === hFr.textContent) head = hEn.textContent;
    var t = head + (parts.length > 1 ? ' | ' + parts.slice(1).join(' | ') : '');
    if (document.title !== t) document.title = t;
  }
  // Prix : « 84,00 € » (texte d'origine) -> « €84.00 » en anglais. window.vgMoney(n) pour les scripts.
  function fmtMoney(n, l) {
    n = Math.round((Number(n) || 0) * 100) / 100;
    var o = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    return (l || lang) === 'fr' ? n.toLocaleString('fr-FR', o).replace(/[  ]/g, ' ') + ' €' : '€' + n.toLocaleString('en-GB', o);
  }
  window.vgMoney = function (n) { return fmtMoney(n); };
  var PRICE_RE = /(\d{1,3}(?:[   ]\d{3})*,\d{2})[  ]?(?:€|EUR)/g;
  function translatePrices() {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) {
      if (n.__vgP === undefined) { if (!/,\d{2}[  ]?(€|EUR)/.test(n.nodeValue)) continue; n.__vgP = n.nodeValue; }
      var v = n.__vgP.replace(PRICE_RE, function (m, a) { return fmtMoney(parseFloat(a.replace(/[   ]/g, '').replace(',', '.'))); });
      if (n.nodeValue !== v) n.nodeValue = v;
    }
  }

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
  }

  function apply() {
    root.setAttribute('data-vg-lang', lang); root.setAttribute('lang', lang);
    tagStacked(); tagDescription(); tagOrderResult(); splitTitles(); translateUi(); translateAttrs(); translateTitle(); translatePrices(); syncButton();
  }

  var groups = [];
  function syncButton() {
    groups.forEach(function (g) {
      ['fr', 'en'].forEach(function (l) {
        var b = g.querySelector('[data-b=' + l + ']');
        b.setAttribute('aria-pressed', String(lang === l)); b.setAttribute('aria-current', String(lang === l));
      });
      g.setAttribute('aria-label', lang === 'fr' ? 'Langue : français' : 'Language: English');
      var cap = g.parentNode && g.parentNode.querySelector('.vg-lang-menu-label');
      if (cap) cap.textContent = lang === 'fr' ? 'Langue' : 'Language';
    });
  }
  // Deux touches : la langue active est la touche relevée avec un point, l'autre est enfoncée.
  function makeKeys(full) {
    var g = document.createElement('div'); g.className = 'vg-lang-toggle vg-lang-keys' + (full ? ' vg-lang-keys--full' : ''); g.setAttribute('role', 'group');
    [['fr', full ? 'Français' : 'FR', 'Français'], ['en', full ? 'English' : 'EN', 'English']].forEach(function (d) {
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-b', d[0]); b.setAttribute('lang', d[0]); b.setAttribute('aria-label', d[2]); b.textContent = d[1];
      b.addEventListener('click', function () { if (lang !== d[0]) set(d[0]); });
      g.appendChild(b);
    });
    groups.push(g); return g;
  }
  function set(l) {
    lang = l; window.vgLang = l;
    try { localStorage.setItem(KEY, l); } catch (e) {}
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
    li.appendChild(makeKeys(false)); ul.insertBefore(li, ul.firstChild);
    // Bas du menu (téléphone) : même choix, noms complets.
    var nav = document.querySelector('#navigation-modal .overlay_content');
    if (nav && !nav.querySelector('.vg-lang-menu')) {
      var row = document.createElement('div'); row.className = 'vg-lang-menu';
      var cap = document.createElement('span'); cap.className = 'vg-lang-menu-label'; row.appendChild(cap); row.appendChild(makeKeys(true)); nav.appendChild(row);
    }
    syncButton();
  }

  function init() { addButton(); apply(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  // Contenus ajoutés après coup (Sold out, panier...).
  var t = null;
  new MutationObserver(function () { clearTimeout(t); t = setTimeout(function () { translateUi(); tagDescription(); translateAttrs(); translatePrices(); }, 120); })
    .observe(document.documentElement, { childList: true, subtree: true });
}());
