/* Shim "sous-dossier" de la boutique hors BigCartel (injecté en tout premier
   dans <head> par generator/build.js, avant tout autre script).

   Les vrais gabarits BigCartel, le Body et vg-transitions-dev.js supposent un
   site servi à la RACINE d'un domaine (/products, /product/<slug>,
   location.pathname === '/studio'...). L'aperçu est une "project page" GitHub
   Pages servie sous /shop/. Plutôt que de retoucher chaque script :
   - fetch() et XMLHttpRequest : une URL qui commence par "/" (pas "//")
     reçoit le préfixe /shop ;
   - liens : getAttribute('href') renvoie la valeur SANS /shop (les scripts
     la comparent à '/products', '/cart'...), l'attribut réel garde /shop ;
     les liens créés en JavaScript (tuiles de catégories, lien retour...)
     reçoivent /shop dès leur insertion ;
   - window.__vgLoc : un "location" dont pathname est vu SANS /shop (et sans
     barre finale), passé au Body et à vg-transitions-dev.js (enveloppés par
     build.js) ; écrire href / assign / replace remet le préfixe.
   Le jour où la boutique est servie à la racine d'un domaine, BASE = '' et
   ce shim ne fait plus rien. */
(function () {
  var BASE = window.__VG_BASE || '';
  function fix(u) {
    if (!BASE || typeof u !== 'string') return u;
    if (u.charAt(0) !== '/' || u.charAt(1) === '/') return u;
    if (u === BASE || u.indexOf(BASE + '/') === 0) return u;
    return BASE + u;
  }
  window.__vgFixUrl = fix;

  // Photos produit demandées par vg-transitions-dev.js avec ?w=N (pops,
  // compagnons de la section 3 : comme sur le CDN BigCartel) -> la variante
  // WebP la plus proche (generator/resize-images.js), 800 px au plus, au
  // lieu du PNG d'origine (~400 Ko chacun). build.js branche sized() dessus.
  var SIZED = [24, 320, 540, 800];
  window.__vgSized = function (url, px) {
    var m = /^(?:https?:\/\/[^\/]+)?(\/[^?#]*?)?\/assets\/products\/([^?#]+)\.(png|jpe?g|webp)(?:[?#].*)?$/i.exec(String(url));
    if (!m) return null;
    var w = SIZED[SIZED.length - 1];
    for (var i = 0; i < SIZED.length; i++) { if (SIZED[i] >= px) { w = SIZED[i]; break; } }
    return BASE + '/assets/products-sized/' + w + '/' + m[2] + '.webp';
  };

  if (!BASE) { window.__vgLoc = window.location; return; }

  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      if (typeof input === 'string') input = fix(input);
      return origFetch.call(this, input, init);
    };
  }
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var args = Array.prototype.slice.call(arguments);
    args[1] = fix(url);
    return origOpen.apply(this, args);
  };

  // Les scripts lisent les liens avec getAttribute('href') et les comparent
  // à '/products', '/cart'... : ils voient la valeur SANS /shop, comme sur
  // BigCartel. L'attribut réel garde /shop (navigation native, clic milieu,
  // barre d'état corrects).
  // Sauf les liens vers un fichier (/shop/assets/... : photos du zoom) : le
  // Body s'en sert tel quel comme src d'image, ils gardent /shop.
  var ga = Element.prototype.getAttribute;
  Element.prototype.getAttribute = function (name) {
    var v = ga.call(this, name);
    if ((name === 'href' || name === 'action') && typeof v === 'string' && (v === BASE || v.indexOf(BASE + '/') === 0) && v.indexOf(BASE + '/assets/') !== 0) {
      return v.slice(BASE.length) || '/';
    }
    return v;
  };
  // Liens créés en JavaScript (tuiles de catégories, lien retour...) avec
  // une adresse racine : l'attribut réel reçoit /shop dès leur insertion.
  function prefixLinks(root) {
    if (!root || !root.querySelectorAll) return;
    var list = root.matches && root.matches('a[href^="/"]') ? [root] : [];
    list = list.concat(Array.prototype.slice.call(root.querySelectorAll('a[href^="/"]')));
    list.forEach(function (a) {
      var h = ga.call(a, 'href');
      var f = fix(h);
      if (f !== h) a.setAttribute('href', f);
    });
  }
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      if (m.type === 'attributes') prefixLinks(m.target);
      else m.addedNodes.forEach(function (n) { if (n.nodeType === 1) prefixLinks(n); });
    });
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });

  var L = window.location;
  function strip(p) {
    if (p === BASE || p.indexOf(BASE + '/') === 0) p = p.slice(BASE.length) || '/';
    if (p.length > 1 && p.charAt(p.length - 1) === '/') p = p.slice(0, -1);
    return p;
  }
  var loc = {
    get pathname() { return strip(L.pathname); },
    get href() { return L.href; },
    set href(v) { L.href = fix(v); },
    get search() { return L.search; },
    get hash() { return L.hash; },
    set hash(v) { L.hash = v; },
    get host() { return L.host; },
    get hostname() { return L.hostname; },
    get origin() { return L.origin; },
    get protocol() { return L.protocol; },
    get port() { return L.port; },
    assign: function (v) { L.assign(fix(v)); },
    replace: function (v) { L.replace(fix(v)); },
    reload: function () { L.reload(); },
    toString: function () { return L.href; }
  };
  window.__vgLoc = loc;
})();
