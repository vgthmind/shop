(function (location) {
(function () {
  var header = document.querySelector('.header');
  if (header) {
    var onScroll = function () {
      if (window.scrollY > 40) header.classList.add('vg-scrolled');
      else header.classList.remove('vg-scrolled');
    };
    document.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  var cartLink = document.querySelector('nav.utility a.cart-link');
  var countEl = document.querySelector('.header-item-count');
  if (cartLink && countEl) {
    var toast = document.createElement('div');
    toast.className = 'vg-toast';
    toast.textContent = 'Ajoute au panier';
    document.body.appendChild(toast);

    function vgCartCount() {
      var n = parseInt((countEl.textContent || '0').replace(/[^0-9]/g, ''), 10);
      return isNaN(n) ? 0 : n;
    }
    var lastCount = null;
    setTimeout(function () { lastCount = vgCartCount(); }, 400);
    var toastTimer = null;
    var mo = new MutationObserver(function () {
      if (lastCount === null) return;
      var n = vgCartCount();
      if (n > lastCount) {
        cartLink.classList.remove('vg-bump');
        void cartLink.offsetWidth;
        cartLink.classList.add('vg-bump');
        toast.classList.add('vg-show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toast.classList.remove('vg-show'); }, 2000);
      }
      lastCount = n;
    });
    mo.observe(countEl, { childList: true, subtree: true, characterData: true });
  }
})();

(function () {
  var VG_SPEED = 400;
  var VG_DEBUG = false;
  try { VG_DEBUG = localStorage.getItem('vg-debug') === '1'; } catch (e) {}
  function vgLog() {
    if (!VG_DEBUG) return;
    try { console.log.apply(console, ['[vg-transition]'].concat(Array.prototype.slice.call(arguments))); } catch (e) {}
  }

  var POP_MS = 200, ASPIRATE_MS = 300, ARRIVE_CAP_MS = 300, ARRIVE_MS = 350, SHRINK_MS = 180;
  var NAV_SEL = '.cart-link, nav.sections .navigation a, nav.primary_navigation .page_list a, footer nav.footernav a, a.button.view-all-products';

  document.querySelectorAll('.cart-link[title]').forEach(function (el) { el.removeAttribute('title'); });

  var prefetched = {};
  var productsPreloaded = false;
  document.addEventListener('mouseover', function (e) {
    var link = e.target.closest ? e.target.closest(NAV_SEL) : null;
    if (!link) return;
    var href = link.getAttribute('href') || '/cart';
    if (!prefetched[href]) {
      prefetched[href] = true;
      var l = document.createElement('link');
      l.rel = 'prefetch';
      l.href = href;
      document.head.appendChild(l);
      vgLog('prefetched', href);
    }
    // [2026-09-29] Plus de prechargement de photos ici : 6 photos en 1000 px
    // (plusieurs Mo) partaient au survol de PRODUCTS et se battaient avec le
    // chargement de la page elle-meme au moment du clic (transition vers
    // PRODUCTS de 2,5 a 3 s). La page Products charge ses vignettes elle-meme,
    // a la bonne taille.
  }, true);

  window.pageTransition = function (opts) {
    if (window.__vgTransitioning) { vgLog('blocked: transition in progress'); return; }
    window.__vgTransitioning = true;
    setTimeout(function () { window.__vgTransitioning = false; }, 3000);
    document.documentElement.classList.add('vg-managed');
    try { window.getSelection().removeAllRanges(); } catch (e) {}

    var href = opts.href;
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      vgLog('reduced motion: simple fade, no overlay');
      document.body.style.transition = 'opacity 150ms ease';
      document.body.style.opacity = '0';
      setTimeout(function () {
        window.__vgTransitioning = false;
        location.href = href;
      }, 150);
      return;
    }

    var w = opts.w || 280, h = opts.h || 280;
    // 'zt' = rotation a plat (z) vue de trois quarts : le plan entier est incline
    // une fois pour toutes (overlay), l'icone tourne dedans.
    var axis = opts.axis === 'y' ? 'y' : (opts.axis === 'zt' ? 'zt' : 'z');
    var persp = opts.persp || 1200;
    var popStart = Date.now();
    // SECTION 3 : x/y (px viewport) = point d'origine du clic. Absents pour
    // les transitions Section 2 (header/panier), qui restent centrees comme
    // avant (--vg-out-x/--vg-out-y et --vg-origin retombent sur leur valeur
    // CSS par defaut de 50%/50vw 50vh quand on ne les pose pas ici).
    var hasOrigin = opts.x != null && opts.y != null;
    // SECTION 3 : duree de depart (pop+aspiration) allongeable par opts pour
    // laisser le temps a l'orbite des compagnons de faire au moins un tour
    // complet (brief CLAUDE.md section 3) sans toucher aux durees de la
    // section 2 (header/panier, deja validees) qui gardent POP_MS/ASPIRATE_MS.
    var popMs = opts.popMs || POP_MS;
    var aspirateMs = opts.aspirateMs || ASPIRATE_MS;

    var overlay = document.createElement('div');
    overlay.id = 'vg-transition-out';
    var img = document.createElement('img');
    img.src = opts.icon;
    img.alt = '';
    img.style.width = w + 'px';
    img.style.height = h + 'px';
    img.style.setProperty('--vg-persp', persp + 'px');
    if (hasOrigin) {
      img.style.setProperty('--vg-out-x', opts.x + 'px');
      img.style.setProperty('--vg-out-y', opts.y + 'px');
    }
    var period = 360 / VG_SPEED;
    // SECTION 3 : l'icone part de la vignette AU REPOS (meme image, meme
    // taille : scale opts.grow = 1/1,15) et grossit jusqu'a x1,15, au lieu de
    // surgir de rien (scale 0) comme les icones du header.
    if (opts.grow) img.style.setProperty('--vg-s0', String(opts.grow));
    img.style.animationName = (opts.grow ? 'vg-out-grow, ' : 'vg-out-pop, ') + (axis === 'y' ? 'vg-out-spin-y' : 'vg-out-spin-z');
    img.style.animationDuration = popMs + 'ms, ' + period + 's';
    img.style.animationTimingFunction = (opts.grow ? 'cubic-bezier(.22,1,.36,1)' : 'cubic-bezier(.34,1.56,.64,1)') + ', linear';
    img.style.animationIterationCount = '1, infinite';
    img.style.animationFillMode = 'forwards, none';
    overlay.appendChild(img);
    if (axis === 'zt') {
      overlay.style.setProperty('transform-origin', (hasOrigin ? opts.x + 'px ' + opts.y + 'px' : '50% 50%'), 'important');
      overlay.style.setProperty('transform', 'perspective(' + persp + 'px) rotateX(16deg) rotateY(-14deg)', 'important');
    }
    document.documentElement.appendChild(overlay);

    vgLog('pop start', opts);
    if (opts.onPop) opts.onPop();

    setTimeout(function () {
      vgLog('aspirate start');
      document.documentElement.style.setProperty('--vg-persp', persp + 'px');
      if (hasOrigin) document.body.style.setProperty('--vg-origin', opts.x + 'px ' + opts.y + 'px');
      if (opts.s3) document.body.classList.add('vg-s3');
      document.body.classList.add('vg-aspirate');
      var elapsed = Date.now() - popStart;
      var liveAngle = (elapsed * VG_SPEED / 1000) % 360;
      var payload = { ts: Date.now(), href: href, icon: opts.icon, angle: liveAngle, speed: VG_SPEED, w: w, h: h, axis: axis, persp: persp };
      if (hasOrigin) { payload.x = opts.x; payload.y = opts.y; }
      try { sessionStorage.setItem('vg-transition', JSON.stringify(payload)); } catch (e) {}
      vgLog('flag written', payload);
      if (opts.onAspirate) opts.onAspirate();
      if (opts.passive) {
        setTimeout(function () {
          if (document.body.classList.contains('vg-aspirate')) {
            vgLog('passive submit did not navigate, reverting');
            document.body.classList.remove('vg-aspirate');
            if (overlay.parentNode) overlay.remove();
            try { sessionStorage.removeItem('vg-transition'); } catch (e) {}
            window.__vgTransitioning = false;
          }
        }, aspirateMs + 900);
      } else {
        // [2026-09-29] Le chargement de la page suivante demarre PENDANT
        // l'aspiration (apres 150 ms visibles) au lieu d'attendre sa fin :
        // l'ancienne page reste affichee et continue d'etre aspiree jusqu'a
        // ce que la nouvelle arrive, le temps serveur se superpose a
        // l'animation. Section 3 : toute la spirale reste visible (navDelay).
        var navDelay = opts.navDelay != null ? opts.navDelay : Math.min(aspirateMs, 150);
        setTimeout(function () {
          vgLog('navigating to', href);
          location.href = href;
        }, navDelay);
      }
    }, popMs);
  };

  function handleArrival() {
    var boot = window.__vgBoot;
    if (!boot) { vgLog('no boot state on arrival'); window.__vgTransitioning = false; return; }
    vgLog('arrival detected, liveAngle=', boot.liveAngle);
    // [2026-09-29 finale] Nouveau boot du <head> (Layout) : la page s'affiche
    // deja sous l'icone des le premier rendu (fondu sur place, sans attendre
    // les scripts du theme ni les images) et l'icone se retire toute seule.
    // L'ancienne entree en spirale (rotation + echelle du body, qui faisait
    // traverser l'ecran au titre) n'est plus jouee.
    if (boot.early) { vgLog('arrival handled by head boot'); return; }
    var overlay = boot.overlay || document.getElementById('vg-transition-boot');
    if (!overlay) { window.__vgTransitioning = false; return; }
    var played = false;
    function playArrival() {
      if (played) return; played = true;
      vgLog('playing arrival animation');
      document.documentElement.style.setProperty('--vg-persp', (boot.data.persp || 1200) + 'px');
      // SECTION 3 : la nouvelle page sort du point clique (celui du vetement
      // qui tourne encore), pas du centre.
      if (boot.data.x != null && boot.data.y != null) document.body.style.setProperty('--vg-origin', boot.data.x + 'px ' + boot.data.y + 'px');
      overlay.style.transition = 'background-color 250ms ease';
      overlay.style.setProperty('background-color', 'transparent', 'important');
      var finished = false;
      function finishArrival() {
        if (finished) return; finished = true;
        document.body.removeEventListener('animationend', onAnimEnd);
        vgLog('arrival animation done, shrinking logo');
        document.body.classList.remove('vg-arrive');
        var img = overlay.querySelector('img');
        if (img) {
          img.style.transition = 'scale ' + SHRINK_MS + 'ms ease-in, opacity ' + SHRINK_MS + 'ms ease-in';
          img.style.scale = '0';
          img.style.opacity = '0';
        }
        setTimeout(function () {
          vgLog('removing boot overlay');
          if (overlay.parentNode) overlay.remove();
          window.__vgTransitioning = false;
        }, SHRINK_MS + 20);
      }
      function onAnimEnd(e) {
        if (e.target !== document.body || e.animationName !== 'vg-arrive-in') return;
        finishArrival();
      }
      document.body.addEventListener('animationend', onAnimEnd);
      setTimeout(finishArrival, ARRIVE_MS + 150);
      document.body.classList.add('vg-arrive');
    }
    // [2026-09-29] L'arrivee demarre tout de suite, sans attendre aucune
    // image (brief : duree independante du chargement des images ; les
    // vignettes visibles recoivent de toute facon leur vraie resolution
    // immediatement, voir "arrivee nette" plus bas).
    playArrival();
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', handleArrival); } else { handleArrival(); }

  document.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('.cart-link') : null;
    if (!link) return;
    e.preventDefault();
    if (window.__vgTransitioning) return;
    var href = link.getAttribute('href') || '/cart';
    window.pageTransition({ icon: 'https://vgthmind.github.io/assets/bigcartel/cart-icon.png', href: href, w: 280, h: 280, axis: 'y', persp: 1200 });
  }, true);

  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('form.product-form button[type="submit"]') : null;
    if (!btn || btn.disabled) return;
    if (window.__vgTransitioning) return;
    window.pageTransition({ icon: 'https://vgthmind.github.io/assets/bigcartel/cart-icon.png', href: '/cart', w: 280, h: 280, axis: 'y', persp: 1200, passive: true });
  }, true);
})();

(function () {
  function vgClearSelection() {
    try { window.getSelection().removeAllRanges(); } catch (e) {}
  }
  function vgBounce(el) {
    if (!el) return;
    el.classList.remove('vg-pill-bounce');
    void el.offsetWidth;
    el.classList.add('vg-pill-bounce');
    setTimeout(function () { el.classList.remove('vg-pill-bounce'); }, 260);
  }

  document.addEventListener('click', function (e) {
    var logo = e.target.closest ? e.target.closest('.logo a, a.logo, header .logo') : null;
    if (!logo) return;
    var href = (logo.tagName === 'A') ? logo.getAttribute('href') : null;
    if (!href) {
      var innerLink = logo.querySelector ? logo.querySelector('a') : null;
      href = innerLink ? innerLink.getAttribute('href') : '/';
    }
    if (!href) href = '/';
    e.preventDefault();
    if (window.__vgTransitioning) return;
    vgClearSelection();
    if (location.pathname === href) { vgBounce(logo); return; }
    window.pageTransition({
      icon: "/shop/assets/theme/bc/logo-illustration.png",
      href: href,
      w: 280, h: 280, axis: 'y', persp: 1200
    });
  }, true);

  document.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('nav.sections .navigation a, nav.primary_navigation .page_list a, footer nav.footernav a, a.button.view-all-products') : null;
    if (!link) return;
    var href = link.getAttribute('href') || '';
    var icon = null;
    if (href === '/products' || href.indexOf('/products?') === 0) icon = 'https://vgthmind.github.io/assets/bigcartel/products-icon.png';
    else if (href.indexOf('/infos-conditions-generales') !== -1) icon = 'https://vgthmind.github.io/assets/bigcartel/info-icon.png';
    else if (href.indexOf('/contact') !== -1) icon = 'https://vgthmind.github.io/assets/bigcartel/contact-icon.png';
    // Page Studio : le logo vgthmind en version CHROMEE (distinct du logo
    // plat de l'accueil, qui garde sa propre transition).
    else if (href.indexOf('/studio') !== -1) icon = 'https://vgthmind.github.io/assets/bigcartel/studio-icon.png';
    // Page « Suivre ma commande » (lien discret du footer) : cube metal aux t-shirts.
    else if (href.indexOf('/suivi') !== -1) icon = 'https://vgthmind.github.io/assets/bigcartel/suivi-icon.png';
    if (!icon) return;
    e.preventDefault();
    if (window.__vgTransitioning) return;
    vgClearSelection();
    if (location.pathname === href) { vgBounce(link); return; }
    // Le cube de /suivi tourne a plat (axe z, comme les resultats de recherche) :
    // en culbute il s'aplatit en carte et ne se reconnait plus.
    var flat = href.indexOf('/suivi') !== -1;
    window.pageTransition({ icon: icon, href: href, w: 280, h: 280, axis: flat ? 'zt' : 'y', persp: flat ? 1000 : 1200 });
  }, true);

  function stripHeaderTitles() {
    document.querySelectorAll('.header a[title], nav.sections a[title], nav.primary_navigation a[title], footer nav.footernav a[title], ul.categories a[title]').forEach(function (el) {
      el.removeAttribute('title');
    });
  }
  stripHeaderTitles();
  document.addEventListener('DOMContentLoaded', stripHeaderTitles);
  setTimeout(stripHeaderTitles, 500);
  setTimeout(stripHeaderTitles, 1500);
})();

/* === SECTION 6 POINT 3 : panneau de recherche (V1 "carte verre") === */
/* Croix de fermeture : le bouton natif du theme (button.close-modal) est */
/* cache en CSS -- il etait rendu dans .wrapper, mal place, et faussait */
/* toute detection de visibilite. Une croix chromee est ajoutee SANS */
/* CONDITION dans .modal-content (qui porte la largeur du panneau, voir */
/* vg-transitions-dev.css ; sans elle .modal-content fait 1200px bord a */
/* bord -- mesure directe du 2026-09-28). */
/* Resultats en direct : filtrage local de /products.json pendant la */
/* frappe (deja charge une fois par la section 3, partage via */
/* window.__vgProducts). Vignettes detourees uniquement (NON_CUTOUT exclu), */
/* clavier haut/bas/Entree, Echap gere par le theme. Rien ne depend du */
/* seul survol : chaque resultat est un vrai lien, tactile compris. */
/* Sur telephone, la liste est bornee a la partie visible au-dessus du */
/* clavier (visualViewport) et defile a l'interieur. */
window.__VG_NON_CUTOUT = window.__VG_NON_CUTOUT || {
  'custom-hoodie': [2, 3],
  'ja_0001': [2, 3, 4],
  'pantalon-denim-bleu': [3, 4],
  'sacoche': [3, 4],
  'sma_0001': [2, 3, 4]
};
window.__vgProducts = window.__vgProducts || fetch('/products.json').then(function (r) { return r.json(); }).then(function (data) {
  return Array.isArray(data) ? data : ((data && data.products) || []);
}).catch(function () { return []; });

(function () {
  // Adresse de ce script (avec son ?v=) : sert a charger
  // search-keywords.json a cote de lui, avec le meme cache-busting.
  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';
  // Meme liste que le badge "piece unique" du Body (seule exception).
  var NOT_UNIQUE = ['cd-vgtape'];
  var HIDDEN_CATS = ['all', 'latest-drop'];
  var MAX_RESULTS = 12;

  function closeSearch() {
    // Reutilise le chemin de fermeture deja valide du theme (Echap).
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
  }

  function norm(s) {
    return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  // Mots-cles par produit (type de vetement...), fichier separe facile a
  // editer : assets/bigcartel/search-keywords.json (cle = permalink).
  var keywordsReady = (function () {
    try {
      var u = new URL('search-keywords.json', SCRIPT_SRC || location.href);
      if (SCRIPT_SRC) u.search = new URL(SCRIPT_SRC).search;
      return fetch(u.toString()).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
    } catch (e) { return Promise.resolve({}); }
  })();

  function tokens(s) {
    return norm(s).split(/[^a-z0-9]+/).filter(Boolean);
  }

  // Index par produit : mots du nom, des mots-cles, de la description.
  var indexCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  function indexOf(p, kw) {
    if (indexCache && indexCache.has(p)) return indexCache.get(p);
    var desc = (p.description || '').replace(/<[^>]*>/g, ' ');
    var tmp = document.createElement('textarea');
    tmp.innerHTML = desc;
    var idx = [
      tokens(p.name),
      tokens((kw[p.permalink] || []).join(' ')),
      tokens(tmp.value)
    ];
    if (indexCache) indexCache.set(p, idx);
    return idx;
  }

  // Rang d'un produit pour la requete : 0 = nom, 1 = mots-cles,
  // 2 = description, -1 = aucun. Chaque mot tape doit correspondre au
  // DEBUT d'un mot du produit ("sac" -> "sacoche", "short" -> "shorts") ;
  // le rang retenu est celui du mot le moins bien place. Pas de recherche
  // dans la categorie ("Pants/Shorts" ferait remonter tous les pantalons).
  function rank(qWords, idx) {
    var worst = 0;
    for (var i = 0; i < qWords.length; i++) {
      var w = qWords[i], best = -1;
      for (var f = 0; f < idx.length && best === -1; f++) {
        for (var t = 0; t < idx[f].length; t++) {
          if (idx[f][t].indexOf(w) === 0) { best = f; break; }
        }
      }
      if (best === -1) return -1;
      if (best > worst) worst = best;
    }
    return worst;
  }

  function cutoutThumb(p) {
    var bad = window.__VG_NON_CUTOUT[p.permalink] || [];
    var imgs = p.images || [];
    for (var i = 0; i < imgs.length; i++) {
      if (bad.indexOf(i) === -1 && imgs[i] && imgs[i].url) {
        try {
          var u = new URL(imgs[i].url, location.href);
          u.searchParams.set('w', '240');
          u.searchParams.set('h', '240');
          return u.toString();
        } catch (e) { return imgs[i].url; }
      }
    }
    return null;
  }

  function catLabel(p) {
    var cats = (p.categories || []).filter(function (c) { return HIDDEN_CATS.indexOf(c.permalink) === -1; });
    var parts = [];
    if (cats[0] && cats[0].name) parts.push(cats[0].name);
    if (p.status === 'sold-out') parts.push('Sold out');
    else if (NOT_UNIQUE.indexOf(p.permalink) === -1) parts.push('One of a kind');
    return parts.join(' · ');
  }

  function price(p) {
    var v = Number(p.default_price != null ? p.default_price : p.price);
    if (isNaN(v)) return '';
    return v.toFixed(2).replace('.', ',') + ' EUR';
  }

  function setup(modal) {
    if (modal.__vgSearchReady) return;
    modal.__vgSearchReady = true;
    var panel = modal.querySelector('.modal-content');
    var wrapper = modal.querySelector('.wrapper');
    var form = modal.querySelector('form.search-form');
    var input = modal.querySelector('input.search-input');

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'vg-search-close-fallback';
    closeBtn.setAttribute('aria-label', 'Close search');
    closeBtn.innerHTML = '<svg aria-hidden="true" viewBox="0 0 16 16" width="13" height="13"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>';
    closeBtn.addEventListener('click', closeSearch);
    (panel || modal).appendChild(closeBtn);

    if (!form || !input || !wrapper) return;
    input.setAttribute('placeholder', 'Search products…');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', 'vg-sr-list');
    input.setAttribute('aria-expanded', 'false');

    var box = document.createElement('div');
    box.className = 'vg-sr';
    box.hidden = true;
    box.innerHTML =
      '<div class="vg-sr-head"><span class="vg-sr-count" aria-live="polite"></span><a class="vg-sr-all" href="/products">See all</a></div>' +
      '<ul class="vg-sr-list" id="vg-sr-list" role="listbox" aria-label="Search results"></ul>' +
      '<div class="vg-sr-hint"><span><kbd>↑↓</kbd>navigate &nbsp; <kbd>Enter</kbd>open</span><span><kbd>Esc</kbd>close</span></div>';
    wrapper.appendChild(box);
    var countEl = box.querySelector('.vg-sr-count');
    var allLink = box.querySelector('.vg-sr-all');
    var list = box.querySelector('.vg-sr-list');

    var items = [];
    var active = -1;
    var reqId = 0;

    function fitToViewport() {
      // Borne la liste a ce qui reste visible au-dessus du clavier du
      // telephone (visualViewport) ; defile a l'interieur au-dela.
      if (box.hidden) return;
      var vv = window.visualViewport;
      var visibleBottom = vv ? (vv.offsetTop + vv.height) : window.innerHeight;
      var top = list.getBoundingClientRect().top;
      var reserve = window.matchMedia('(hover:none), (pointer:coarse)').matches ? 16 : 44;
      list.style.maxHeight = Math.max(140, Math.floor(visibleBottom - top - reserve)) + 'px';
    }

    function setActive(i) {
      if (items[active]) items[active].classList.remove('is-active');
      active = i;
      if (items[active]) {
        items[active].classList.add('is-active');
        input.setAttribute('aria-activedescendant', items[active].id);
        items[active].scrollIntoView({ block: 'nearest' });
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }

    function go(a) {
      var href = a.getAttribute('href');
      var icon = a.getAttribute('data-icon');
      if (typeof window.pageTransition === 'function' && icon && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        window.pageTransition({ icon: icon, href: href, w: 280, h: 280, axis: 'z', persp: 1000 });
      } else {
        location.href = href;
      }
    }

    function render(q, products, kw) {
      var nq = norm(q);
      list.innerHTML = '';
      items = [];
      active = -1;
      input.removeAttribute('aria-activedescendant');
      if (!nq) {
        box.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        return;
      }
      var words = tokens(q);
      // Tous les produits en ligne (products.json ne contient que ceux-la),
      // epuises compris mais affiches "Sold out" et classes apres les
      // disponibles. Ordre : nom, puis mots-cles, puis description.
      var scored = [];
      products.forEach(function (p, order) {
        var r = rank(words, indexOf(p, kw));
        if (r === -1) return;
        scored.push({ p: p, r: r, sold: p.status && p.status !== 'active' ? 1 : 0, o: order });
      });
      scored.sort(function (a, b) { return (a.r - b.r) || (a.sold - b.sold) || (a.o - b.o); });
      var matches = scored.map(function (x) { return x.p; });
      allLink.setAttribute('href', '/products?search=' + encodeURIComponent(q.trim()));
      box.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      if (!matches.length) {
        countEl.textContent = 'No results';
        allLink.style.visibility = 'hidden';
        fitToViewport();
        return;
      }
      allLink.style.visibility = '';
      countEl.textContent = matches.length + (matches.length > 1 ? ' results' : ' result');
      matches.slice(0, MAX_RESULTS).forEach(function (p, i) {
        var thumb = cutoutThumb(p);
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.className = 'vg-sr-item';
        a.id = 'vg-sr-' + i;
        a.setAttribute('role', 'option');
        a.href = p.url || ('/product/' + p.permalink);
        if (thumb) a.setAttribute('data-icon', thumb);
        var img = document.createElement('img');
        img.className = 'vg-sr-thumb';
        img.alt = '';
        img.decoding = 'async';
        if (thumb) img.src = thumb;
        var txt = document.createElement('span');
        txt.className = 'vg-sr-txt';
        var nm = document.createElement('span');
        nm.className = 'vg-sr-name';
        nm.textContent = (p.name || '').trim();
        var ct = document.createElement('span');
        ct.className = 'vg-sr-cat';
        ct.textContent = catLabel(p);
        txt.appendChild(nm);
        txt.appendChild(ct);
        var pr = document.createElement('span');
        pr.className = 'vg-sr-price';
        pr.textContent = price(p);
        a.appendChild(img);
        a.appendChild(txt);
        a.appendChild(pr);
        a.addEventListener('click', function (e) {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          go(a);
        });
        li.appendChild(a);
        list.appendChild(li);
        items.push(a);
      });
      fitToViewport();
    }

    function update() {
      var q = input.value;
      var id = ++reqId;
      Promise.all([window.__vgProducts, keywordsReady]).then(function (res) {
        if (id === reqId) render(q, res[0] || [], res[1] || {});
      });
    }

    input.addEventListener('input', update);
    input.addEventListener('keydown', function (e) {
      if (box.hidden || !items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(active < items.length - 1 ? active + 1 : 0);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(active > 0 ? active - 1 : items.length - 1);
      } else if (e.key === 'Enter' && active > -1) {
        e.preventDefault();
        go(items[active]);
      }
    });
    input.addEventListener('focus', function () { setTimeout(fitToViewport, 300); });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', fitToViewport);
      window.visualViewport.addEventListener('scroll', fitToViewport);
    }
    window.addEventListener('resize', fitToViewport);

    new MutationObserver(function () {
      if (modal.getAttribute('aria-hidden') === 'false') {
        if (input.value) update();
      }
    }).observe(modal, { attributes: true, attributeFilter: ['aria-hidden'] });
  }

  /* === MENU MOBILE (V1 plein ecran verre) : complements au DOM du theme === */
  /* Barre du haut avec le logo (la croix du theme reste a droite) et pied */
  /* de menu : recherche + panier. Le reste est du CSS sur les liens */
  /* existants, pour que les transitions de page continuent de marcher. */
  function setupMenu(nav) {
    if (nav.__vgMenuReady) return;
    nav.__vgMenuReady = true;
    var content = nav.querySelector('.overlay_content');
    if (!content) return;

    var headerLogo = document.querySelector('.header .logo img, header .logo img, .header img.store-logo');
    var bar = document.createElement('div');
    bar.className = 'vg-menu-bar';
    if (headerLogo) {
      var logo = headerLogo.cloneNode(true);
      logo.removeAttribute('srcset');
      logo.alt = '';
      bar.appendChild(logo);
    }
    content.insertBefore(bar, content.firstChild);

    var foot = document.createElement('div');
    foot.className = 'vg-menu-foot';
    var sBtn = document.createElement('button');
    sBtn.type = 'button';
    sBtn.className = 'vg-menu-search';
    sBtn.setAttribute('aria-label', 'Search');
    sBtn.innerHTML = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8"/></svg>';
    sBtn.addEventListener('click', function () {
      var close = nav.querySelector('.close_overlay');
      if (close) close.click();
      var open = document.querySelector('.open-search-button');
      if (open) setTimeout(function () { open.click(); }, 220);
    });
    foot.appendChild(sBtn);
    var cart = document.querySelector('.header .cart-link');
    if (cart) foot.appendChild(cart.cloneNode(true));
    content.appendChild(foot);
  }

  function init() {
    var modal = document.getElementById('search-modal');
    var nav = document.getElementById('navigation-modal');
    if (modal) setup(modal);
    if (nav) setupMenu(nav);
    if (modal && nav) return;
    var obs = new MutationObserver(function () {
      var m = document.getElementById('search-modal');
      var n = document.getElementById('navigation-modal');
      if (m) setup(m);
      if (n) setupMenu(n);
      if (m && n) obs.disconnect();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }
  // Ce script peut s'executer avant la fin du <body> (preload dans le
  // <head>) : on attend que les 2 modales existent.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* === SECTION 6 POINT 2 : sequence splash -> accueil (2 clips) === */
/* Reprend a l'identique le script auparavant colle dans le Body (meme */
/* logo, meme flag sessionStorage 'vg-splash-seen', meme tirage aleatoire */
/* de 2 clips parmi 4, meme duree totale ~2.2s). Corrige uniquement le */
/* defaut releve par vgthmind (0:03.0-0:03.8) : le script d'origine reassigne */
/* .src sur UN SEUL <video> partage entre les 2 clips, ce qui force le */
/* decodeur a se reinitialiser et produit une image noire le temps que le */
/* 2e clip charge. Ici, 2 <video> distincts se chargent en parallele et */
/* se fondent en fondu (crossfade CSS), donc plus jamais de noir entre les */
/* deux. Cette version REMPLACE entierement le script inline du Body : a */
/* l'application, supprimer le bloc <script> correspondant du Body (voir */
/* APPLIQUER_LOT_A.md), ce fichier prend le relais seul. */
(function () {
  if (location.pathname !== '/') return;
  var seen = false;
  try { seen = sessionStorage.getItem('vg-splash-seen'); } catch (err) {}
  if (seen) return;

  function boot() {
    var splash = document.createElement('div');
    splash.className = 'vg-splash';
    splash.innerHTML = '<img class="vg-splash-logo" src="/shop/assets/theme/bc/logo-illustration.png" alt="vgthmind"><div class="vg-enter">Enter</div>';
    document.body.appendChild(splash);
    var prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    splash.addEventListener('click', function () {
      try { sessionStorage.setItem('vg-splash-seen', '1'); } catch (err) {}
      var clips = [
        'https://vgthmind.github.io/assets/bigcartel/clip_1.mp4',
        'https://vgthmind.github.io/assets/bigcartel/clip_2.mp4',
        'https://vgthmind.github.io/assets/bigcartel/clip_3.mp4',
        'https://vgthmind.github.io/assets/bigcartel/clip_4.mp4'
      ];
      for (var si = clips.length - 1; si > 0; si--) {
        var sj = Math.floor(Math.random() * (si + 1));
        var stmp = clips[si]; clips[si] = clips[sj]; clips[sj] = stmp;
      }
      var sequence = clips.slice(0, 2);

      var vidA = document.createElement('video');
      var vidB = document.createElement('video');
      [vidA, vidB].forEach(function (v) {
        v.className = 'vg-splash-video';
        v.muted = true;
        v.playsInline = true;
        // Safari iOS : attributs HTML en plus des proprietes (lecture inline, sans son)
        v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
        v.defaultMuted = true;
        v.preload = 'auto';
        splash.appendChild(v);
      });
      splash.classList.add('vg-splash-playing');

      var finished = false;
      function finish() {
        if (finished) return;
        finished = true;
        splash.classList.add('vg-splash-out');
        document.documentElement.style.overflow = prevOverflow;
        setTimeout(function () { splash.remove(); }, 650);
      }

      var hardStop = setTimeout(finish, 2200);

      function playOn(vid, src, onStarted) {
        vid.src = src;
        vid.addEventListener('playing', function once() {
          vid.removeEventListener('playing', once);
          if (onStarted) onStarted();
        });
        vid.play().catch(finish);
      }

      // Precharge le 2e clip en parallele du 1er (pas de .src partage :
      // chaque <video> garde le sien toute sa vie, donc pas de reset).
      playOn(vidA, sequence[0], function () {
        vidA.classList.add('vg-active');
        setTimeout(function () {
          if (finished) return;
          playOn(vidB, sequence[1], function () {
            vidB.classList.add('vg-active');
            vidA.classList.remove('vg-active');
            setTimeout(finish, 500);
          });
        }, 500);
      });
    });
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', boot); } else { boot(); }
})();

/* === Rognage automatique du vide transparent des photos detourees === */
/* Pour que le VETEMENT lui-meme ait la meme taille a l'ecran quel que soit */
/* le cadrage de la photo (un hoodie photographie avec du vide autour ne */
/* doit pas paraitre plus petit qu'un short qui remplit son image). Chaque */
/* photo est analysee une seule fois, en petit (200 px), sur un canvas : */
/* rectangle des pixels non transparents, en fractions de l'image. Resultat */
/* garde en memoire + localStorage (cle = chemin de l'image, sans les */
/* parametres de taille). Le CDN d'images BigCartel autorise le CORS. */
/* Utilise par les sections 4 et 5 (pop), et plus tard la section 3. */
window.__vgTrim = window.__vgTrim || (function () {
  var KEY = 'vgTrim2';
  var mem = {};
  try { mem = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { mem = {}; }
  var pending = {};
  var saveT = null;
  function keyOf(url) { try { return new URL(url, location.href).pathname; } catch (e) { return url; } }
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      var keep = {};
      for (var k in mem) { if (mem[k]) keep[k] = mem[k]; }
      try { localStorage.setItem(KEY, JSON.stringify(keep)); } catch (e) {}
    }, 800);
  }
  function small(url) {
    try {
      var u = new URL(url, location.href);
      u.searchParams.set('w', '200');
      u.searchParams.set('h', '200');
      return u.toString();
    } catch (e) { return url; }
  }
  function analyse(im) {
    var W = im.naturalWidth, H = im.naturalHeight;
    if (!W || !H) return null;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    var px = g.getImageData(0, 0, W, H).data; // exception si CORS refuse
    var l = W, t = H, r = -1, b = -1, n = 0;
    for (var y = 0; y < H; y++) {
      var row = y * W * 4;
      for (var x = 0; x < W; x++) {
        if (px[row + x * 4 + 3] > 24) {
          n++;
          if (x < l) l = x;
          if (x > r) r = x;
          if (y < t) t = y;
          if (y > b) b = y;
        }
      }
    }
    if (r < 0) return null;
    // f = part du rectangle du vetement reellement remplie (1 = objet plein
    // et carre comme la pochette du CD, ~0,6 pour un pantalon).
    return { ar: W / H, l: l / W, t: t / H, r: (r + 1) / W, b: (b + 1) / H, f: n / ((r + 1 - l) * (b + 1 - t)) };
  }
  function get(url) {
    if (!url) return null;
    var k = keyOf(url);
    return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : undefined;
  }
  function load(url) {
    if (!url) return Promise.resolve(null);
    var k = keyOf(url);
    if (Object.prototype.hasOwnProperty.call(mem, k)) return Promise.resolve(mem[k]);
    if (pending[k]) return pending[k];
    pending[k] = new Promise(function (res) {
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.decoding = 'async';
      try { im.fetchPriority = 'low'; } catch (e) {}
      im.onload = function () {
        var box = null;
        try { box = analyse(im); } catch (e) { box = null; }
        mem[k] = box;
        delete pending[k];
        save();
        res(box);
      };
      im.onerror = function () { delete pending[k]; res(null); };
      im.src = small(url);
    });
    return pending[k];
  }
  // Rectangle du vetement quand l'image (rapport ar) est affichee en
  // "contain" dans un rectangle (left, top, width, height).
  function garment(box, rect) {
    var dw = Math.min(rect.width, rect.height * box.ar);
    var dh = dw / box.ar;
    var ox = rect.left + (rect.width - dw) / 2, oy = rect.top + (rect.height - dh) / 2;
    var gw = (box.r - box.l) * dw, gh = (box.b - box.t) * dh;
    // q = "poids visuel" relatif a la plus grande dimension : racine de la
    // surface reellement remplie / plus grande dimension (1 = carre plein).
    var big = Math.max(gw, gh), small = Math.min(gw, gh);
    var q = big ? Math.sqrt((box.f || 1) * small / big) : 1;
    return { cx: ox + box.l * dw + gw / 2, cy: oy + box.t * dh + gh / 2, w: gw, h: gh, size: big, q: q, dw: dw, dh: dh, ox: ox, oy: oy };
  }
  return { get: get, load: load, garment: garment };
})();

/* === SECTIONS 4 ET 5 : pop au survol (grilles produits, tuiles de */
/* l'accueil) === */
/* UN SEUL systeme de survol. Il remplace les 3 qui se chevauchaient : */
/* l'image d'origine grossie "en flux" (width:320px, qui debordait et */
/* passait sous le header), .vg-hover-swap (fondu PAR-DESSUS une base */
/* restee visible = fantome avec des PNG detoures), et le script du Body */
/* qui echangeait src/srcset (il memorisait un srcset encore vide avant */
/* lazysizes et ne le restaurait jamais = 2e photo coincee au repos). */
/* Principe : au survol, une superposition position:fixed, de taille */
/* identique en pixels pour tous (POP), au-dessus du header, contenant la */
/* photo de repos et la 2e photo detouree, en fondu enchaine (l'une */
/* disparait pendant que l'autre apparait). L'image d'origine est masquee */
/* pendant le pop. Souris uniquement (rien sur tactile), rien en */
/* prefers-reduced-motion. transform/opacity uniquement. */
/* [MAJ] Pop de l'image principale de la fiche produit : SUPPRIME (retour */
/* video de vgthmind, pas juste neutralise en CSS) -- trop sensible, gardait */
/* seulement les fleches/vignettes/zoom existants. Et sur les grilles/tuiles */
/* restantes, le declenchement etait trop sensible et parfois decale par */
/* rapport au vetement reel (meme bug de fond) : la zone de declenchement */
/* est maintenant la boite rognee __vgTrim (zone non transparente du */
/* vetement) reduite de 10% plutot que tout le rectangle de la vignette, */
/* avec un delai d'intention (~120ms de presence continue avant d'ouvrir), */
/* une suppression pendant le defilement (+ ~150ms apres), et une fermeture */
/* immediate si la fenetre defile/change de taille pendant qu'un pop est */
/* ouvert -- voir le bloc de declenchement en bas de cette IIFE. */
(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  var TARGETS = '.product-list-link, .vg-category-tile';
  var current = null;
  // Element actuellement sous la souris (suivi explicite : l'etat :hover
  // peut etre en retard d'un instant dans l'apercu mis a l'echelle).
  var overEl = null;
  // Liste produits deja arrivee (sinon le pop s'ouvre quand meme, avec
  // l'image affichee, et la 2e photo est ajoutee a l'arrivee des donnees :
  // /products.json est demande plusieurs fois au chargement et peut mettre
  // quelques secondes -- le 1er survol ne donnait alors rien).
  var productsNow = null;
  Promise.resolve(window.__vgProducts).then(function (p) { productsNow = p || []; });

  // Meme taille pour tous (tuiles de l'accueil, Latest Drop compris, et
  // grilles produits) : ~1,75x une vignette de grille desktop (~320px).
  // Facteurs de taille (tuiles : x la tuile normale ; grilles : x la taille
  // de base). Choix de vgthmind (2026-09-29) : tuiles 2,1x, grilles taille actuelle.
  var TILE_K = 2.1, GRID_K = 1;
  function popSize() {
    return Math.round(Math.min(560 * GRID_K, window.innerHeight * 0.72 * GRID_K, window.innerWidth * 0.5 * GRID_K));
  }

  var TRIM = window.__vgTrim;
  // Plus grande dimension du vetement dans la boite du pop (le reste sert a
  // l'ombre portee).
  var FILL = 0.9;
  // Egalisation du poids visuel (surface visible) : q median mesure sur le
  // catalogue le 2026-09-29 = 0,73 (min 0,60 sacoche SC_0008, max 0,99 CD).
  // Un objet plus "plein" que ca (pochette du CD, cache-cou, hoodie
  // compact) est reduit pour peser pareil ; un
  // objet plus fin (pantalon) garde la taille max (jamais plus grand que la
  // boite).
  var AREA_Q = 0.72;
  function gFor(box, S) {
    var G = TRIM.garment(box, { left: 0, top: 0, width: S, height: S });
    return FILL * S * Math.min(1, AREA_Q / (G.q || AREA_Q));
  }

  function headerBottom() {
    var hd = document.querySelector('.header');
    if (!hd) return 0;
    var b = hd.getBoundingClientRect().bottom;
    return b > 0 ? b : 0;
  }

  // Tuiles de l'accueil : meme taille de pop pour les 6 (Latest Drop
  // compris), calee sur les tuiles normales (~1,7x) sans que Latest Drop,
  // plus grande au repos, ne retrecisse (>= 1,15x sa taille au repos).
  function tileSize() {
    var sel = ' .vg-category-tile-img:not(.vg-category-tile-img-alt)';
    var sm = document.querySelector('.vg-category-tile:not(.vg-tile-featured)' + sel);
    var ft = document.querySelector('.vg-category-tile.vg-tile-featured' + sel);
    var dim = function (e) { if (!e) return 0; var r = e.getBoundingClientRect(); return Math.max(r.width, r.height); };
    var g = Math.max(dim(sm) * TILE_K, dim(ft) * 1.15 * TILE_K / 1.7);
    return Math.round(Math.min(600, (g || 480) / FILL));
  }

  // Recadre une image du pop (transform uniquement) : son vetement mesure g
  // px (plus grande dimension) et son centre tombe en (x, y) dans la boite
  // de cote S. L'image elle-meme remplit la boite en "contain".
  function frame(img, box, S, g, x, y) {
    var G = TRIM.garment(box, { left: 0, top: 0, width: S, height: S });
    if (!G.size) return;
    var m = g / G.size;
    var tx = (x - S / 2) - m * (G.cx - S / 2);
    var ty = (y - S / 2) - m * (G.cy - S / 2);
    img.style.setProperty('transform', 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) scale(' + m.toFixed(4) + ')', 'important');
  }

  function slugOf(href) {
    var m = (href || '').match(/\/product\/([^\/?#]+)/);
    if (!m) return null;
    try { return decodeURIComponent(m[1]).normalize('NFC'); } catch (e) { return m[1]; }
  }

  function findProduct(products, slug) {
    if (!slug) return null;
    for (var i = 0; i < products.length; i++) {
      var p = products[i].permalink || '';
      try { p = decodeURIComponent(p); } catch (e) {}
      if (p.normalize('NFC') === slug) return products[i];
    }
    return null;
  }

  function sized(url, px) {
    if (window.__vgSized) { var vgS = window.__vgSized(url, px); if (vgS) return vgS; }
    try {
      var u = new URL(url, location.href);
      u.searchParams.set('w', String(px));
      u.searchParams.set('h', String(px));
      return u.toString();
    } catch (e) { return url; }
  }

  // Index d'image a exclure (photos non detourees), partage avec la section 3.
  function cutoutIndexes(p) {
    var bad = (window.__VG_NON_CUTOUT || {})[p.permalink] || [];
    var out = [];
    (p.images || []).forEach(function (im, i) { if (im && im.url && bad.indexOf(i) === -1) out.push(i); });
    return out;
  }

  function bgUrl(el) {
    if (!el) return null;
    var m = (getComputedStyle(el).backgroundImage || '').match(/url\(["']?(.*?)["']?\)/);
    return m ? m[1] : null;
  }

  function samePath(a, b) {
    try { return new URL(a, location.href).pathname === new URL(b, location.href).pathname; } catch (e) { return a === b; }
  }

  // Decrit ce qui doit popper pour une cible : element source a masquer,
  // rectangle de depart, image de repos, 2e image, mode (taille fixe ou sur place).
  function describe(el, products) {
    if (el.classList.contains('vg-category-tile')) {
      var base = el.querySelector('.vg-category-tile-img:not(.vg-category-tile-img-alt)');
      var alt = el.querySelector('.vg-category-tile-img-alt');
      var a = bgUrl(base);
      if (!a) return null;
      var b2 = bgUrl(alt);
      // Categorie a un seul produit (ex. Merch) : pas de 2e image fournie
      // par la tuile, on prend la 2e photo detouree de ce meme produit.
      if (!b2) {
        for (var t = 0; t < products.length && !b2; t++) {
          var tp = products[t];
          if (!tp.images || !tp.images[0] || !samePath(tp.images[0].url, a)) continue;
          var ti = cutoutIndexes(tp);
          for (var u = 0; u < ti.length; u++) { if (ti[u] > 0) { b2 = sized(tp.images[ti[u]].url, 900); break; } }
        }
      }
      return { src: base, rectEl: base, a: a, b: b2, mode: 'fixed' };
    }
    if (el.classList.contains('product-list-link')) {
      var img = el.querySelector('img.product-list-image') || el.querySelector('.product-list-image-container img');
      if (!img) return null;
      var p = findProduct(products, slugOf(el.getAttribute('href')));
      var rest = img.currentSrc || img.src;
      var second = null;
      if (p) {
        var idx = cutoutIndexes(p);
        if (p.images && p.images[0]) rest = sized(p.images[0].url, 900);
        for (var k = 0; k < idx.length; k++) { if (idx[k] > 0) { second = sized(p.images[idx[k]].url, 900); break; } }
      }
      return { src: img, rectEl: img, a: rest, b: second, mode: 'fixed' };
    }
    return null;
  }

  function contentRect(img) {
    // Rectangle reellement occupe par l'image (object-fit:contain) ou par
    // le fond (background-size:contain) : evite de popper une boite vide.
    var r = img.getBoundingClientRect();
    var w = r.width, h = r.height, nw = img.naturalWidth, nh = img.naturalHeight;
    if (nw && nh && w && h) {
      var s = Math.min(w / nw, h / nh);
      var cw = nw * s, ch = nh * s;
      return { left: r.left + (w - cw) / 2, top: r.top + (h - ch) / 2, width: cw, height: ch };
    }
    return { left: r.left, top: r.top, width: w, height: h };
  }

  function open(el, d) {
    var boxA = TRIM.get(d.a);
    if (boxA === undefined) TRIM.load(d.a); // pour la prochaine fois
    var r;
    if (d.src.tagName === 'IMG') r = contentRect(d.src);
    else {
      r = d.rectEl.getBoundingClientRect();
      // Tuile : fond en "contain", rectangle reellement occupe par la photo.
      if (boxA) {
        var gt = TRIM.garment(boxA, r);
        r = { left: gt.ox, top: gt.oy, width: gt.dw, height: gt.dh };
      }
    }
    if (!r.width || !r.height) return;
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var size, s0, target = null;
    var isTile = el.classList.contains('vg-category-tile');
    // Jamais par-dessus les pills du header (tuiles ET grilles, demande de
    // vgthmind du 2026-09-29) et toujours entier dans la fenetre.
    var top = headerBottom() + 8;
    size = Math.min(isTile ? tileSize() : popSize(), window.innerHeight - top - 8, window.innerWidth - 16);
    s0 = Math.max(r.width, r.height) / size;
    if (boxA) {
      // Le vetement (pas la photo) a le meme poids visuel pour tous, et le
      // pop part exactement du vetement de la vignette.
      var gA = gFor(boxA, size);
      var gv = TRIM.garment(boxA, r);
      s0 = gv.size / gA;
      cx = gv.cx; cy = gv.cy;
      target = { g: gA, auto: true, x: size / 2, y: size / 2, frameA: true };
    }
    // Jamais coupe : le pop reste entierement dans la fenetre.
    var half = size / 2 + 8;
    cx = Math.min(Math.max(cx, half), window.innerWidth - half);
    cy = Math.min(Math.max(cy, top + size / 2), window.innerHeight - half);
    var box = document.createElement('div');
    box.className = 'vg-pop';
    box.style.width = size + 'px';
    box.style.height = size + 'px';
    box.style.left = cx + 'px';
    box.style.top = cy + 'px';
    box.style.setProperty('--vg-pop-s0', String(s0));
    var ia = document.createElement('img');
    ia.className = 'vg-pop-img vg-pop-a';
    ia.alt = '';
    ia.src = d.a;
    if (target && target.frameA) frame(ia, boxA, size, target.g, target.x, target.y);
    box.appendChild(ia);
    document.documentElement.appendChild(box);
    d.src.classList.add('vg-pop-hidden');
    var state = { el: el, d: d, box: box, t: null, ib: null, size: size, target: target };
    current = state;
    if (d.b) addSecond(state, d.b);
    // Lecture de style forcee : l'etat initial (petit) est pris en compte
    // avant d'ajouter .is-open, donc la transition part bien de la vignette.
    // (Pas de requestAnimationFrame : il ne tourne pas si l'onglet est
    // considere comme masque, le pop restait alors bloque petit.)
    void getComputedStyle(box).transform;
    box.classList.add('is-open');
    state.opened = true;
    if (state.ib) scheduleSwap(state, 140);
  }

  function addSecond(state, url) {
    if (state.ib) return;
    var ib = document.createElement('img');
    ib.className = 'vg-pop-img vg-pop-b';
    ib.alt = '';
    ib.src = url;
    state.box.appendChild(ib);
    state.ib = ib;
    // Recadrage de la 2e photo (invisible jusqu'au fondu) : le fondu attend
    // qu'il soit fait, pour ne jamais montrer un vetement qui change de taille.
    state.framed = !state.target ? Promise.resolve() : TRIM.load(url).then(function (bx) {
      if (bx && state.target) frame(ib, bx, state.size, state.target.auto ? gFor(bx, state.size) : state.target.g, state.target.x, state.target.y);
    });
    if (state.opened) scheduleSwap(state, 60);
  }

  function scheduleSwap(state, delay) {
    var go = function () { if (current === state) state.box.classList.add('is-swapped'); };
    var loaded = state.ib.complete ? Promise.resolve(true) : new Promise(function (res) {
      state.ib.addEventListener('load', function () { res(false); }, { once: true });
    });
    Promise.all([loaded, state.framed]).then(function (v) {
      if (current !== state) return;
      state.t = setTimeout(go, v[0] ? delay : 60);
    });
  }

  function close(instant) {
    var st = current;
    if (!st) return;
    current = null;
    clearTimeout(st.t);
    var done = function () {
      if (st.box.parentNode) st.box.remove();
      st.d.src.classList.remove('vg-pop-hidden');
    };
    if (instant) { done(); return; }
    st.box.classList.remove('is-swapped');
    st.box.classList.remove('is-open');
    setTimeout(done, 230);
  }

  // Prechargement des photos du pop (repos + 2e photo) quand le navigateur
  // est inactif : sans lui, la 2e photo mettait 1 a 2 s a apparaitre au
  // premier survol.
  var preloaded = {};
  function preloadAll() {
    Promise.resolve(window.__vgProducts).then(function (products) {
      var els = Array.prototype.slice.call(document.querySelectorAll('.product-list-link, .vg-category-tile'));
      var urls = [];
      els.forEach(function (el) {
        var d = describe(el, products || []);
        if (!d) return;
        [d.a, d.b].forEach(function (u) { if (u && !preloaded[u]) { preloaded[u] = true; urls.push(u); } });
      });
      var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 200); };
      (function next() {
        if (!urls.length) return;
        idle(function () {
          if (window.__vgTransitioning) return; // jamais pendant une transition
          urls.splice(0, 4).forEach(function (u) { var im = new Image(); im.decoding = 'async'; try { im.fetchPriority = 'low'; } catch (e) {} im.src = u; TRIM.load(u); });
          next();
        });
      })();
    });
  }
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    if (document.readyState === 'complete') setTimeout(preloadAll, 600);
    else window.addEventListener('load', function () { setTimeout(preloadAll, 600); });
    // Les tuiles de l'accueil sont creees apres coup par le Body.
    setTimeout(preloadAll, 3500);
  }

  function targetOf(t) {
    return t.closest ? t.closest(TARGETS) : null;
  }

  // [MAJ, retour video de vgthmind] Declenchement revu en entier : avant, tout
  // survol de la vignette (son rectangle complet, y compris le vide autour
  // d'un vetement detoure) ouvrait le pop instantanement -- trop sensible,
  // et le pop pouvait se retrouver decale si la page avait defile ou si la
  // fenetre avait change de taille entre-temps. Maintenant :
  // - zone de declenchement = la boite __vgTrim (vetement reellement
  //   visible, pas le rectangle de l'image) reduite de 10% vers l'interieur
  //   (OPEN_SCALE) -- un survol dans le vide autour du vetement ne declenche
  //   plus rien ;
  // - delai d'intention : il faut rester en continu dans cette zone ~120ms
  //   (INTENT_MS) avant que le pop parte (un simple passage ne suffit pas) ;
  // - suppression pendant le defilement + ~150ms apres (SCROLL_SUPPRESS_MS) ;
  // - position et fermeture recalculees en direct : open() relit toujours
  //   getBoundingClientRect() au moment ou le pop s'affiche (deja le cas),
  //   et un pop deja ouvert se ferme immediatement au moindre scroll/resize ;
  // - pour sortir, la meme zone reduite, avec une marge de tolerance
  //   (EXIT_MARGIN) pour ne pas clignoter pile au bord du vetement.
  var FINE = window.matchMedia('(hover: hover) and (pointer: fine)');
  var OPEN_SCALE = 0.9;
  var EXIT_MARGIN = 10; // px, tolerance de sortie autour de la zone reduite
  var INTENT_MS = 120;
  var SCROLL_SUPPRESS_MS = 150;
  var lastScrollTs = 0;
  var pendingTimer = null, pendingEl = null;

  function scrollSuppressed() { return (Date.now() - lastScrollTs) < SCROLL_SUPPRESS_MS; }

  function clearPending() {
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = null;
    pendingEl = null;
  }

  // Boite __vgTrim (zone non transparente) de l'element survole, en
  // coordonnees viewport -- meme calcul que open() pour la vignette elle-meme
  // (voir le bloc "Tuile : fond en contain" plus haut), reutilise ici pour
  // le test de position de la souris plutot que pour le placement du pop.
  function trimZone(el, products) {
    var d = describe(el, products || []);
    if (!d) return null;
    var r = (d.src.tagName === 'IMG') ? contentRect(d.src) : d.rectEl.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    var boxA = TRIM.get(d.a);
    if (boxA) {
      var gt = TRIM.garment(boxA, r);
      r = { left: gt.ox, top: gt.oy, width: gt.dw, height: gt.dh };
    }
    return { d: d, rect: r };
  }

  function shrinkRect(r, scale) {
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var w = r.width * scale, h = r.height * scale;
    return { left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, bottom: cy + h / 2 };
  }

  function expandRect(r, m) {
    return { left: r.left - m, top: r.top - m, right: r.right + m, bottom: r.bottom + m };
  }

  function pointInRect(x, y, r) {
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function tryOpen(el, d) {
    if (!el || !FINE.matches || window.__vgTransitioning || document.querySelector('.pswp--open')) return;
    var target = el;
    if (!d) d = describe(target, productsNow || []);
    if (!d) return;
    open(target, d);
    if (!productsNow && !d.b) {
      Promise.resolve(window.__vgProducts).then(function (products) {
        if (!current || current.el !== target) return;
        var d2 = describe(target, products || []);
        if (d2 && d2.b) addSecond(current, d2.b);
      });
    }
  }

  // Arme (ou reinitialise) le minuteur d'intention pour `el` si la souris
  // est dans sa zone reduite ; l'annule si elle en est sortie.
  function maybeArm(el, x, y) {
    if (scrollSuppressed()) { clearPending(); return; }
    var z = trimZone(el, productsNow || []);
    if (!z || !pointInRect(x, y, shrinkRect(z.rect, OPEN_SCALE))) { clearPending(); return; }
    if (pendingEl === el) return; // deja en train de patienter sur ce meme element
    clearPending();
    pendingEl = el;
    pendingTimer = setTimeout(function () {
      pendingTimer = null;
      var e2 = pendingEl;
      pendingEl = null;
      if (e2 !== el || overEl !== el || scrollSuppressed()) return;
      tryOpen(el, z.d);
    }, INTENT_MS);
  }

  function onPointerActivity(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (!overEl) { clearPending(); return; }
    if (current && current.el === overEl) {
      // Pop deja ouvert pour cet element : on le ferme seulement en sortant
      // de sa zone reduite (+ marge de tolerance), pas au bord du rectangle
      // complet de la vignette.
      var z = trimZone(overEl, productsNow || []);
      if (z && !pointInRect(e.clientX, e.clientY, expandRect(shrinkRect(z.rect, OPEN_SCALE), EXIT_MARGIN))) close(false);
      return;
    }
    maybeArm(overEl, e.clientX, e.clientY);
  }

  document.addEventListener('pointerover', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    var el = targetOf(e.target);
    overEl = el;
    if (current && el !== current.el) close(false);
    if (!el) clearPending();
    else onPointerActivity(e);
  }, true);

  document.addEventListener('pointermove', onPointerActivity, { passive: true, capture: true });

  document.addEventListener('pointerout', function (e) {
    var to = e.relatedTarget;
    if (overEl && (!to || !overEl.contains(to))) { overEl = null; clearPending(); }
    // Filet de secours seulement : le pointeur a quitte le document entier
    // (alt-tab, sortie par un bord de fenetre) sans declencher de nouveau
    // pointermove -- la sortie normale (bouger vers un voisin) est deja
    // geree par le test de zone ci-dessus, qui tolere de rester a
    // l'interieur du meme <a> (texte/prix) sans fermer le pop a tort.
    if (current && !to) close(false);
  }, true);

  // Au clic (section 3 / navigation), le pop disparait immediatement : la
  // transition doit partir de la vignette au repos.
  document.addEventListener('click', function () { overEl = null; clearPending(); close(true); }, true);
  // Jamais de pop decale : fermeture immediate au moindre scroll/resize
  // pendant qu'un pop est ouvert, et suppression des ouvertures pendant le
  // defilement + un court delai apres (SCROLL_SUPPRESS_MS).
  window.addEventListener('scroll', function () { lastScrollTs = Date.now(); clearPending(); close(true); }, { passive: true });
  window.addEventListener('resize', function () { clearPending(); close(true); }, { passive: true });
  window.addEventListener('blur', function () { clearPending(); close(true); });
})();

/* === SECTION 3 : clic produit/categorie (CLAUDE.md section 3) === */
/* Meme mecanique que pageTransition() (section 2) : l'"icone" qui */
/* tournoie est le vetement clique lui-meme, qui part de la vignette AU */
/* REPOS (meme image, meme taille, a sa place), grossit x1,15 et tournoie */
/* sur place ; la page est aspiree en spirale VERS ce point (aspiration */
/* dediee plus lente et visible, body.vg-s3) ; les autres vetements de la */
/* categorie / autres photos du produit orbitent autour (rayon et taille */
/* cales sur le vetement reel grace a window.__vgTrim, cercle garde dans */
/* l'ecran) puis sont aspires avec la page ; la page suivante sort du meme */
/* point pendant que le vetement tourne encore (script du <head>). */
/* Au clic : tout effet de survol est coupe (pop ferme, gris des voisins */
/* retire, html.vg-s3). Tactile : le tap lance directement la transition. */
/* prefers-reduced-motion : fondu simple (pageTransition), sans orbite. */
/* L'ancien systeme "swirl" (Body + Custom CSS) a ete retire le 2026-09-29. */
(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var GROW = 1.15;
  var S3_POP_MS = 260;      // grossissement x1,15 depuis la vignette
  var S3_ASPIRATE_MS = 650; // spirale visible ; total ~1,3-1,5 s avec l'arrivee
  var ORBIT_MS = S3_POP_MS + S3_ASPIRATE_MS;
  var NON_CUTOUT = window.__VG_NON_CUTOUT;
  var TRIM = window.__vgTrim;

  window.__vgProducts = window.__vgProducts || fetch('/products.json').then(function (r) { return r.json(); }).then(function (data) {
    return Array.isArray(data) ? data : ((data && data.products) || []);
  }).catch(function () { return []; });
  var productsNow = null;
  window.__vgProducts.then(function (p) { productsNow = p || []; });

  function slugFrom(href, kind) {
    var m = (href || '').match(kind === 'category' ? /\/category\/([^\/?#]+)/ : /\/product\/([^\/?#]+)/);
    if (!m) return null;
    try { return decodeURIComponent(m[1]).normalize('NFC'); } catch (e) { return m[1]; }
  }
  function samePermalink(p, slug) {
    var v = p || '';
    try { v = decodeURIComponent(v); } catch (e) {}
    return v.normalize('NFC') === slug;
  }
  function pathOf(u) { try { return new URL(u, location.href).pathname; } catch (e) { return (u || '').split('?')[0]; } }
  function cutoutUrls(product) {
    var bad = NON_CUTOUT[product.permalink] || [];
    var out = [];
    (product.images || []).forEach(function (im, i) { if (bad.indexOf(i) === -1 && im && im.url) out.push(im.url); });
    return out;
  }
  function companions(products, isCategory, slug, excludeUrl) {
    var ex = pathOf(excludeUrl), urls = [];
    if (isCategory) {
      products.forEach(function (p) {
        var inCat = (p.categories || []).some(function (c) { return c.permalink === slug; });
        if (!inCat) return;
        var u = cutoutUrls(p)[0];
        if (u && pathOf(u) !== ex) urls.push(u);
      });
    } else {
      var p = products.filter(function (pr) { return samePermalink(pr.permalink, slug); })[0];
      if (p) {
        urls = cutoutUrls(p).filter(function (u) { return pathOf(u) !== ex; });
        // Peu de photos (souvent 2 : face/dos) = un seul compagnon, a peine
        // visible : on complete avec des vetements de la meme categorie.
        if (urls.length < 4) {
          var cats = (p.categories || []).map(function (c) { return c.permalink; }).filter(function (c) { return c !== 'all' && c !== 'latest-drop'; });
          products.forEach(function (o) {
            if (urls.length >= 6 || o === p) return;
            if (!(o.categories || []).some(function (c) { return cats.indexOf(c.permalink) !== -1; })) return;
            var u = cutoutUrls(o)[0];
            if (u && pathOf(u) !== ex) urls.push(u);
          });
        }
      }
    }
    for (var i = urls.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = urls[i]; urls[i] = urls[j]; urls[j] = t; }
    return urls.slice(0, 6);
  }
  function small(url, px) {
    try { var u = new URL(url, location.href); u.searchParams.set('w', String(px)); u.searchParams.set('h', String(px)); return u.toString(); } catch (e) { return url; }
  }
  function bgUrl(el) {
    if (!el) return null;
    var m = (getComputedStyle(el).backgroundImage || '').match(/url\(["']?(.*?)["']?\)/);
    return m ? m[1] : null;
  }
  function headerBottom() {
    var hd = document.querySelector('.header');
    var b = hd ? hd.getBoundingClientRect().bottom : 0;
    return b > 0 ? b : 0;
  }

  // Rectangle reellement occupe par la photo de repos : <img> en contain
  // (grille) ou fond en contain (tuile).
  function restRect(el, url) {
    var r = el.getBoundingClientRect();
    var ar = null;
    if (el.tagName === 'IMG' && el.naturalWidth && el.naturalHeight) ar = el.naturalWidth / el.naturalHeight;
    else { var bx = TRIM && TRIM.get(url); if (bx) ar = bx.ar; }
    if (!ar || !r.width || !r.height) return { left: r.left, top: r.top, width: r.width, height: r.height };
    var w = Math.min(r.width, r.height * ar), h = w / ar;
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h };
  }

  // Orbite : un pivot de taille nulle au point clique tourne (au moins un
  // tour) ; chaque compagnon, place a "radius" du pivot, decrit un vrai
  // cercle autour du vetement ; le pivot retrecit vers 0 en fin
  // d'animation = aspires avec la page vers ce point. Rayon et taille
  // proportionnels au vetement REEL (rogne), cercle garde dans l'ecran.
  function spawnOrbit(urls, x, y, g) {
    if (reduceMotion || !urls.length) return;
    var n = urls.length;
    var tile = Math.max(44, Math.round(g * 0.42));
    var want = g * 0.5 + tile * 0.75;
    var room = Math.min(x, window.innerWidth - x, y - headerBottom(), window.innerHeight - y) - tile * 0.55;
    var radius = Math.max(g * 0.55, Math.min(want, room));
    for (var i = 0; i < n; i++) {
      var wrap = document.createElement('div');
      wrap.className = 'vg-orbit-wrap';
      wrap.style.left = x + 'px';
      wrap.style.top = y + 'px';
      var im = document.createElement('img');
      im.className = 'vg-orbit-tile';
      im.alt = '';
      im.src = small(urls[i], 300);
      im.style.width = tile + 'px';
      im.style.height = tile + 'px';
      im.style.left = (radius - tile / 2) + 'px';
      im.style.marginTop = (-tile / 2) + 'px';
      wrap.appendChild(im);
      document.documentElement.appendChild(wrap);
      var a0 = (i / n) * 360;
      var sweep = 380;
      if (wrap.animate) {
        wrap.animate([
          { transform: 'rotate(' + a0 + 'deg) scale(0.35)', opacity: 0, offset: 0 },
          { transform: 'rotate(' + (a0 + sweep * 0.14) + 'deg) scale(1)', opacity: 1, offset: 0.14 },
          { transform: 'rotate(' + (a0 + sweep * 0.78) + 'deg) scale(1)', opacity: 1, offset: 0.78 },
          { transform: 'rotate(' + (a0 + sweep) + 'deg) scale(0.04)', opacity: 0, offset: 1 }
        ], { duration: ORBIT_MS, easing: 'linear', fill: 'forwards' });
        // chaque compagnon tournoie aussi sur lui-meme
        im.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(' + (i % 2 ? -200 : 200) + 'deg)' }], { duration: ORBIT_MS, easing: 'linear', fill: 'forwards' });
      }
      (function (w) { setTimeout(function () { if (w.parentNode) w.remove(); }, ORBIT_MS + 80); })(wrap);
    }
  }

  // Prechargement au survol : page suivante + compagnons (sinon ils
  // arrivent vides pendant les premieres centaines de ms de l'orbite).
  var prefetched = {};
  document.addEventListener('mouseover', function (e) {
    var link = e.target.closest ? e.target.closest('.product-list-link, .vg-category-tile') : null;
    if (!link) return;
    var href = link.getAttribute('href');
    if (!href || prefetched[href]) return;
    prefetched[href] = true;
    var l = document.createElement('link');
    l.rel = 'prefetch';
    l.href = href;
    document.head.appendChild(l);
    Promise.resolve(window.__vgProducts).then(function (products) {
      var isCat = link.classList.contains('vg-category-tile');
      companions(products || [], isCat, slugFrom(href, isCat ? 'category' : 'product'), '').forEach(function (u) { var im = new Image(); im.src = small(u, 300); });
    });
  }, true);

  // Retour arriere (bfcache) : rien ne doit rester masque ni coupe.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    document.documentElement.classList.remove('vg-s3');
    if (document.body) document.body.classList.remove('vg-s3');
    document.querySelectorAll('.vg-pop-hidden').forEach(function (el) { el.classList.remove('vg-pop-hidden'); });
  });

  document.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('.product-list-link, .vg-category-tile') : null;
    if (!link) return;
    var href = link.getAttribute('href');
    if (!href || href.charAt(0) === '#' || link.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    if (window.__vgTransitioning) { e.preventDefault(); return; }
    var isCategory = link.classList.contains('vg-category-tile');
    var srcEl = isCategory
      ? link.querySelector('.vg-category-tile-img:not(.vg-category-tile-img-alt)')
      : (link.querySelector('img.product-list-image') || link.querySelector('.product-list-image-container img'));
    if (!srcEl) return;
    // Image de REPOS affichee (deja chargee = aucun saut, aucun flash).
    var icon = isCategory ? bgUrl(srcEl) : (srcEl.currentSrc || srcEl.src);
    if (!icon || icon.indexOf('w=20') !== -1) return; // placeholder flou : navigation normale
    e.preventDefault();
    try { window.getSelection().removeAllRanges(); } catch (err) {}
    // Coupe tout effet de survol (le pop est deja ferme par son propre
    // ecouteur de clic, enregistre avant celui-ci).
    document.documentElement.classList.add('vg-s3');

    var r = restRect(srcEl, icon);
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    var w = Math.round(r.width * GROW), h = Math.round(r.height * GROW);
    var g = Math.max(r.width, r.height) * GROW;
    var bx = TRIM && TRIM.get(icon);
    if (bx) g = TRIM.garment(bx, { left: 0, top: 0, width: w, height: h }).size;
    // La vignette d'origine disparait sous l'icone qui la remplace.
    srcEl.classList.add('vg-pop-hidden');

    var slug = slugFrom(href, isCategory ? 'category' : 'product');
    var urls = companions(productsNow || [], isCategory, slug, icon);
    window.pageTransition({
      icon: icon, href: href, x: x, y: y, w: w, h: h, axis: 'z', persp: 1000,
      grow: 1 / GROW, s3: true, popMs: S3_POP_MS, aspirateMs: S3_ASPIRATE_MS, navDelay: 150,
      onPop: function () { spawnOrbit(urls, x, y, g); }
    });
  }, true);
})();


/* === SECTION 6 : arrivee nette sur les pages (Products, fiche produit) === */
/* "Images floues/delavees a l'arrivee" (diagnostic 2026-09-29 sur le vrai */
/* brouillon) : (1) un script du Body (.vg-reveal, travail de nuit) met */
/* chaque produit et la fiche produit a opacity:0 et ne les fait apparaitre */
/* (0,6 s) qu'en entrant dans l'ecran -> juste apres une transition, toute */
/* la grille est delavee ; (2) les vignettes du theme demarrent en 20 px */
/* floutees (blur-up) jusqu'a ce que theme.js, charge tout a la fin, les */
/* promeuve. Ici : ce qui est DEJA visible a l'arrivee s'affiche tout de */
/* suite, net et opaque (le fondu au defilement reste pour la suite de la */
/* page), et les images visibles recoivent leur vraie resolution sans */
/* attendre theme.js. */
(function () {
  function inView(el) {
    var r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
  }
  function promote(img) {
    var set = img.getAttribute('data-srcset');
    if (!set || img.getAttribute('srcset')) return;
    var w = Math.round(img.getBoundingClientRect().width) || 320;
    img.setAttribute('sizes', w + 'px');
    img.setAttribute('srcset', set);
    var done = function () { img.classList.remove('lazyload', 'lazyloading'); img.classList.add('lazyloaded'); };
    if (img.complete && img.currentSrc && img.currentSrc.indexOf('w=20') === -1) done();
    else img.addEventListener('load', done, { once: true });
  }
  function run() {
    document.querySelectorAll('.product-list-image-container img.lazyload, .product-images img.lazyload').forEach(function (img) {
      if (inView(img)) promote(img);
    });
    document.querySelectorAll('.vg-reveal:not(.vg-visible)').forEach(function (el) {
      if (!inView(el)) return;
      el.classList.add('vg-instant', 'vg-visible');
      setTimeout(function () { el.classList.remove('vg-instant'); }, 50);
    });
  }
  run();
  // Le script .vg-reveal du Body s'arme au DOMContentLoaded (ecouteur
  // enregistre avant celui-ci) : on repasse juste apres lui.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('pageshow', run);
})();

/* === SECTION 6 : titres jamais sous le header, corrige a la source === */
/* (vgthmind, 2026-09-29 : la page ne doit JAMAIS bouger toute seule -- l'ancien */
/* recalage apres defilement est retire.) Le header est fixe et sa hauteur */
/* reelle depend du Custom CSS (22 px de marge haut/bas, 10 px une fois */
/* defile) : on la mesure (etat NON defile, suivi par ResizeObserver) dans */
/* --vg-header-h, que le CSS utilise pour le decalage du contenu */
/* (padding-top du body), scroll-padding-top et scroll-margin-top -> un */
/* titre n'arrive jamais sous le header, au chargement comme apres une ancre. */
(function () {
  var hd = document.querySelector('.header');
  if (!hd) return;
  var root = document.documentElement;
  function upd() {
    if (hd.classList.contains('vg-scrolled')) return;
    // offsetHeight = hauteur de mise en page, insensible aux transformations
    // (le body tourne/rapetisse pendant les transitions : getBoundingClientRect
    // renverrait la taille deformee).
    var h = hd.offsetHeight;
    if (h > 0) root.style.setProperty('--vg-header-h', h + 'px');
  }
  upd();
  if (window.ResizeObserver) new ResizeObserver(upd).observe(hd);
  window.addEventListener('resize', upd);
  window.addEventListener('load', upd);
})();

/* === Textes alternatifs + decodage asynchrone des images (2026-09-29) === */
/* Les gabarits par defaut du theme laissent alt="" sur les vignettes des */
/* grilles, les tuiles de categories et les miniatures de la fiche produit. */
/* On y met le nom du produit / de la categorie (titre du lien), sans */
/* toucher aux gabarits (ils restent ceux du theme, mis a jour par BigCartel). */
/* decoding="async" sur les images chargees en differe : jamais de blocage */
/* de l'affichage sur le decodage d'une image. */
(function () {
  function run() {
    document.querySelectorAll('a.product-list-link').forEach(function (a) {
      var n = a.querySelector('.product-list-thumb-name');
      var name = n ? n.textContent.trim() : (a.getAttribute('title') || '').trim();
      if (!name) return;
      a.querySelectorAll('img').forEach(function (im) { if (!im.getAttribute('alt')) im.alt = name; });
    });
    var h1 = document.querySelector('.product-container h1, main h1');
    var pname = h1 ? h1.textContent.trim() : '';
    if (pname) document.querySelectorAll('.product-thumbnails--item img').forEach(function (im, i) {
      if (!im.getAttribute('alt')) im.alt = pname + ' ' + (i + 1);
    });
    document.querySelectorAll('img.lazyload, img[loading="lazy"]').forEach(function (im) {
      if (!im.hasAttribute('decoding')) im.decoding = 'async';
    });
  }
  run();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
})();

/* === Videos en lecture automatique (Studio, fiches produit, splash) === */
/* Safari iOS : sans son + inline + autoplay + loop en attributs ET en */
/* proprietes (defaultMuted compris), play() rappele au chargement des */
/* donnees, a l'entree a l'ecran (appel de la page) et au premier toucher. */
/* Si iOS refuse (economie d'energie), la classe vg-reel-failed reste sur le */
/* conteneur (image fixe propre, le bouton natif est masque en CSS). */
window.vgAutoplay = function (v, box) {
  v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
  ['muted', 'playsinline', 'webkit-playsinline', 'autoplay', 'loop'].forEach(function (a) { v.setAttribute(a, ''); });
  function ok() { if (box) box.classList.remove('vg-reel-failed'); }
  function fail() { if (box && v.paused) box.classList.add('vg-reel-failed'); }
  v.vgTryPlay = function () {
    if (!v.src && !v.currentSrc) return;
    var pr; try { pr = v.play(); } catch (e) { fail(); return; }
    if (pr && pr.then) pr.then(ok, fail);
  };
  if (box) box.classList.add('vg-reel-failed'); // image fixe jusqu'a la 1re image jouee
  v.addEventListener('playing', ok);
  v.addEventListener('loadeddata', function () { v.vgTryPlay(); });
  document.addEventListener('touchstart', function () { if (v.paused) v.vgTryPlay(); }, { once: true, passive: true });
};
(function () {
  // Videos des fiches produit (lecteur de reels du Body, deja muted/autoplay/
  // loop) : meme traitement, en gardant leur barre de controle.
  function fix(v) {
    if (v.vgTryPlay) return;
    window.vgAutoplay(v, null);
    v.vgTryPlay();
  }
  if (!/^\/product\//.test(location.pathname)) return;
  var mo = new MutationObserver(scan);
  function scan() {
    var vs = document.querySelectorAll('video.ig-reel-video');
    vs.forEach(fix);
    if (vs.length) mo.disconnect();
  }
  mo.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(function () { mo.disconnect(); }, 15000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
})();

/* === PAGE STUDIO : video d'atelier (8,6 s, sans son, en boucle) === */
/* Montee a partir d'extraits des reels deja en ligne (aerographe, couture */
/* Juki, patron, CD VGTAPE ; ni robot ni visage). Inseree ici plutot que */
/* dans le contenu de la page (l'editeur BigCartel peut filtrer <video>). */
/* Legere (900 Ko) : chargee seulement quand elle entre a l'ecran ; en */
/* prefers-reduced-motion : image fixe, pas de lecture automatique. */
(function () {
  if (!/^\/studio\/?$/.test(location.pathname)) return;
  var BASE = 'https://vgthmind.github.io/assets/bigcartel/studio/';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function mount() {
    var main = document.querySelector('main');
    if (!main || main.querySelector('.vg-studio-reel')) return;
    var h1 = main.querySelector('h1');
    var box = document.createElement('div');
    box.className = 'vg-studio-reel';
    var poster = BASE + 'studio-atelier-poster.jpg';
    if (reduce) {
      var im = document.createElement('img');
      im.src = poster; im.alt = ''; im.loading = 'lazy';
      box.appendChild(im);
    } else {
      var v = document.createElement('video');
      v.setAttribute('aria-hidden', 'true');
      v.preload = 'none';
      v.poster = poster;
      // Image fixe propre (sans aucun bouton) si iOS refuse la lecture
      // automatique (mode economie d'energie) : affichee tant que la video
      // ne joue pas vraiment.
      var still = document.createElement('img');
      still.className = 'vg-reel-still'; still.src = poster; still.alt = '';
      box.appendChild(v);
      box.appendChild(still);
      window.vgAutoplay(v, box);
      var start = function () {
        if (!v.src) v.src = BASE + 'studio-atelier.mp4';
        v.vgTryPlay();
      };
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (es) {
          es.forEach(function (e) { if (e.isIntersecting) start(); else if (v.src) v.pause(); });
        }, { threshold: 0.2 }).observe(box);
      } else start();
    }
    if (h1 && h1.parentNode) h1.parentNode.insertBefore(box, h1.nextSibling);
    else main.insertBefore(box, main.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();


/* === Liens externes (Instagram, TikTok, YouTube...) : nouvel onglet === */
/* (2026-09-29, check final de vgthmind : "Voir sur Instagram" sur la fiche */
/* produit remplacait le site, page blanche ~2 s). Aucun de ces liens ne */
/* lance de transition. Surveille aussi les liens ajoutes apres coup */
/* (lecteur de reels du Body). */
(function () {
  function external(a) {
    if (!a.href || a.target === '_blank') return false;
    try {
      var u = new URL(a.href, location.href);
      if (!/^https?:$/.test(u.protocol)) return false;
      return u.host !== location.host;
    } catch (e) { return false; }
  }
  function mark(root) {
    (root.querySelectorAll ? root.querySelectorAll('a[href]') : []).forEach(function (a) {
      if (external(a)) { a.target = '_blank'; a.rel = 'noopener'; }
    });
  }
  mark(document);
  if (window.MutationObserver) {
    new MutationObserver(function (ms) {
      ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) { if (n.tagName === 'A' && external(n)) { n.target = '_blank'; n.rel = 'noopener'; } mark(n); } }); });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();

}).call(window, window.__vgLoc || window.location);