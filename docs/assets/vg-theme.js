/* Comportement du thème, écrit pour cette boutique (remplace theme.js et api.js
   de BigCartel : plus aucun fichier chargé depuis assets.bigcartel.com, plus de
   jQuery). Code à nous, sans dépendance sauf Splide (carrousel, MIT, hébergé
   dans assets/vendor/).

   Ce que fait ce fichier, et seulement cela (les pièces sont uniques : pas
   d'options de variantes ; le panier est géré par vg-shop-cart.js ; le zoom
   des photos par le Body, theme/custom/body.html) :
     1. variables CSS --*-rgb dérivées des couleurs du thème ;
     2. variable --vh, en-tête fixe, fondu du texte d'accueil, apparition du
        carrousel d'accueil, retrait de la classe de pré-chargement ;
     3. chargement différé des images (classes lazyload / lazyloading /
        lazyloaded, attributs data-srcset, data-src, data-sizes="auto") ;
     4. carrousel des fiches produit (Splide) + miniatures + flèches ;
     5. carrousel de l'accueil (Splide) ;
     6. fenêtres Recherche et Menu (ouverture, Échap, piège du focus). */
(function () {
  'use strict';
  var doc = document;
  var root = doc.documentElement;

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function opts() { return typeof themeOptions !== 'undefined' ? themeOptions : {}; }

  /* 1. Couleurs : #rrggbb / #rgb -> « r, g, b » (utilisé par theme.css : rgba(var(--text-color-rgb), .2)) */
  function hexToRgb(hex) {
    var h = String(hex || '').trim().replace(/^#/, '');
    if (h.length === 3) h = h.replace(/./g, '$&$&');
    // Couleur absente ou illisible (ex. text_color vide dans settings.json) : noir, comme avant.
    if (!/^[0-9a-f]{6}$/i.test(h)) return '0, 0, 0';
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)].join(', ');
  }
  function setColorVars() {
    if (typeof themeColors === 'undefined') return;
    Object.keys(themeColors).forEach(function (key) {
      var rgb = hexToRgb(themeColors[key]);
      if (rgb) root.style.setProperty('--' + key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() + '-rgb', rgb);
    });
  }
  setColorVars();

  /* 2. Mise en page au défilement */
  function setDocHeight() { root.style.setProperty('--vh', window.innerHeight / 100 + 'px'); }

  function announcementHeight() {
    var a = $('.announcement-message.visible');
    return a ? a.offsetHeight : 0;
  }
  function setHeaderPosition() {
    var header = $('header');
    if (!header) return;
    var height = getComputedStyle(root).getPropertyValue('--header-height');
    if ((window.pageYOffset || root.scrollTop || 0) >= announcementHeight()) {
      header.classList.add('fixed');
      doc.body.style.paddingTop = height;
    } else {
      header.classList.remove('fixed');
      doc.body.style.paddingTop = '0px';
    }
  }
  function resizeHomeWelcome() {
    var a = $('.announcement-message');
    var w = $('.welcome_image');
    if (a && w) w.style.height = 'calc(100svh - ' + a.offsetHeight + 'px)';
  }
  function animateHome() {
    var text = $('.welcome_text');
    var content = $('.content');
    var header = $('header');
    if (text) text.classList.toggle('fade_out', text.getBoundingClientRect().top <= 90);
    if (content && header) header.classList.toggle('background_overlay', content.getBoundingClientRect().top <= 195);
  }
  function onScroll() { animateHome(); setHeaderPosition(); }

  doc.addEventListener('DOMContentLoaded', function () {
    doc.body.classList.remove('preloader');
    $$('.contact-form input, .contact-form textarea').forEach(function (el) { el.removeAttribute('tabindex'); });
  });
  window.addEventListener('load', function () {
    doc.body.classList.remove('transition-preloader');
    setDocHeight();
    setHeaderPosition();
    resizeHomeWelcome();
    animateHome();
    var hc = $('.home-carousel');
    if (hc) hc.style.opacity = '1';
    // Fiche produit : peu d'images, on charge tout (diaporama et miniatures) une fois la page chargée.
    if ($('.product-images')) $$('.product-images img.lazyload').forEach(lazyLoad);
  });
  window.addEventListener('resize', function () { setDocHeight(); resizeHomeWelcome(); });
  window.addEventListener('scroll', onScroll, { passive: true });
  setDocHeight();

  /* 3. Images différées */
  var lazyObserver = null;
  var LAZY_MARGIN = '250px 200px';

  function lazyLoad(img) {
    if (img.__vgLazyDone) return;
    img.__vgLazyDone = true;
    if (lazyObserver) lazyObserver.unobserve(img);
    var set = img.getAttribute('data-srcset');
    var src = img.getAttribute('data-src');
    if (!set && !src) { finishLazy(img); return; }
    // Déjà promue par vg-transitions-dev.js : rien à charger, juste marquer la fin.
    if (img.getAttribute('srcset') && !src) {
      if (img.complete) finishLazy(img); else img.addEventListener('load', function () { finishLazy(img); }, { once: true });
      return;
    }
    if (set && !img.getAttribute('srcset')) {
      if (img.getAttribute('data-sizes') === 'auto') {
        // Largeur d'affichage visee : celle de l'image, ou de son bloc (diaporama) si l'image n'a pas
        // encore sa taille finale (miniature de 400 px avant chargement de la grande), jamais plus que l'ecran.
        var w = Math.round(img.getBoundingClientRect().width);
        if (img.closest('.splide, .welcome_image')) {
          for (var el = img.parentElement, n = 0; el && n < 5; el = el.parentElement, n++) w = Math.max(w, el.clientWidth);
        }
        w = w || window.innerWidth;
        img.setAttribute('sizes', Math.min(w, window.innerWidth) + 'px');
      } else if (img.getAttribute('data-sizes')) {
        img.setAttribute('sizes', img.getAttribute('data-sizes'));
      }
    }
    img.classList.add('lazyloading');
    var done = function () { finishLazy(img); };
    if (img.complete && img.currentSrc && !set && !src) done();
    else {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }
    if (src) img.setAttribute('src', src);
    if (set && !img.getAttribute('srcset')) img.setAttribute('srcset', set);
  }
  function finishLazy(img) {
    img.classList.remove('lazyload', 'lazyloading');
    img.classList.add('lazyloaded');
    img.dispatchEvent(new CustomEvent('lazyloaded', { bubbles: true }));
  }
  function watchLazy(img) {
    if (img.__vgLazySeen || img.classList.contains('lazyloaded')) return;
    img.__vgLazySeen = true;
    // vg-transitions-dev.js peut déjà avoir promu l'image (srcset posé) : on se contente de la marquer à la fin du chargement.
    if (img.getAttribute('srcset') && img.getAttribute('data-srcset')) {
      img.__vgLazyDone = true;
      if (img.complete) finishLazy(img); else img.addEventListener('load', function () { finishLazy(img); }, { once: true });
      return;
    }
    if (lazyObserver) lazyObserver.observe(img); else lazyLoad(img);
  }
  function scanLazy(ctx) { $$('img.lazyload', ctx).forEach(watchLazy); }

  if ('IntersectionObserver' in window) {
    lazyObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) lazyLoad(e.target); });
    }, { rootMargin: LAZY_MARGIN });
  }
  scanLazy();
  if ('MutationObserver' in window) {
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        Array.prototype.forEach.call(m.addedNodes, function (n) {
          if (n.nodeType !== 1) return;
          if (n.matches && n.matches('img.lazyload')) watchLazy(n);
          else if (n.querySelectorAll) scanLazy(n);
        });
      });
    }).observe(doc.documentElement, { childList: true, subtree: true });
  }

  /* 4. Fiche produit : carrousel, miniatures, flèches */
  var splide = null;
  function updateSlideContainer() {
    var list = $('.product-thumbnails--list');
    if (!list || !splide) return;
    var overflow = Math.round(list.scrollWidth) > Math.round(list.getBoundingClientRect().width);
    list.classList.toggle('is-overflow', overflow);
    $$('.thumb-scroller').forEach(function (b) { b.classList.toggle('hidden', !overflow); });
    $$('.current-slide-number').forEach(function (n) { n.textContent = String(splide.index + 1); });
  }

  function initProductCarousel() {
    var box = $('.product-carousel');
    if (!box || typeof Splide === 'undefined') return;
    var o = opts();
    var arrows = true;
    var type = 'loop';
    if (window.innerWidth > 767 && o.desktopProductPageImages !== 'carousel') { type = 'fade'; arrows = false; }
    splide = new Splide(box, {
      rewind: true,
      keyboard: true,
      arrows: arrows,
      type: type,
      pagination: false,
      lazyLoad: 'sequential',
      mediaQuery: 'min',
      breakpoints: {
        767: { destroy: o.desktopProductPageImages !== 'carousel' && o.desktopProductPageImages !== 'thumbnails' },
      },
    });
    var thumbs = $$('.product-thumbnails--item');
    var current = null;
    thumbs.forEach(function (t, i) { t.addEventListener('click', function () { splide.go(i); }); });
    splide.on('resize', updateSlideContainer);
    splide.on('mounted move', function () {
      updateSlideContainer();
      var list = $('.product-thumbnails--list');
      var item = thumbs[splide.index];
      if (list && item) {
        var half = Math.round(list.getBoundingClientRect().width / 2);
        if (item.offsetLeft !== half) list.scrollTo({ left: item.offsetLeft - half, behavior: 'smooth' });
      }
      if (item) {
        if (current) { current.classList.remove('is-active'); current.removeAttribute('aria-current'); }
        item.classList.add('is-active');
        item.setAttribute('aria-current', 'true');
        current = item;
      }
    });
    splide.mount();

    var prev = $('.previous-slide');
    var next = $('.next-slide');
    if (prev) prev.addEventListener('click', function () { splide.go(splide.index - 1); });
    if (next) next.addEventListener('click', function () { splide.go(splide.index + 1); });

    var list = $('.product-thumbnails--list');
    $$('.thumb-scroller').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!list) return;
        var dir = b.getAttribute('data-direction');
        var step = list.getBoundingClientRect().width;
        var left = Math.round(list.scrollLeft);
        list.scrollTo({ left: dir === 'left' ? left - step : left + step, behavior: 'smooth' });
      });
    });
    if (list) {
      list.addEventListener('scroll', function () {
        var left = Math.round(list.scrollLeft);
        var first = $('.product-thumbnails--item');
        var max = Math.round(list.scrollWidth) - Math.round(list.getBoundingClientRect().width);
        var l = $('.thumb-scroller--left');
        var r = $('.thumb-scroller--right');
        if (l) { if (first && left < first.offsetWidth) l.setAttribute('disabled', 'true'); else l.removeAttribute('disabled'); }
        if (r) { if (left >= max) r.setAttribute('disabled', 'true'); else r.removeAttribute('disabled'); }
      }, { passive: true });
    }
    window.addEventListener('resize', updateSlideContainer);
  }

  /* 5. Accueil : carrousel */
  function initHomeCarousel() {
    var box = $('.home-carousel');
    if (!box || typeof Splide === 'undefined') return;
    new Splide(box, { arrows: false, type: 'slide', keyboard: true }).mount();
  }

  /* 6. Fenêtres Recherche et Menu */
  var FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  function makeModal(modal, openBtn, closeBtn, o) {
    if (!modal) return;
    var isOpen = function () { return modal.getAttribute('aria-hidden') === 'false'; };
    function onKey(e) { if (e.key === 'Escape') close(); }
    function onOutside(e) { if (e.target === modal) close(); }
    function trap(e) {
      if (e.key !== 'Tab') return;
      var f = $$(FOCUSABLE, modal);
      if (!f.length) return;
      var first = f[0];
      var last = f[f.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    function open() {
      if (isOpen()) return;
      if (o.input && !$(o.input, modal)) return;
      modal.setAttribute('aria-hidden', 'false');
      doc.body.classList.add('overlay-open');
      doc.addEventListener('keydown', onKey);
      if (o.outside) doc.addEventListener('click', onOutside);
      modal.addEventListener('keydown', trap);
      // La fenêtre apparaît en fondu (invisible au début : le champ ne prend
      // pas encore le focus) : 1er élément tout de suite, champ de recherche à la fin de la transition.
      var first = $$(FOCUSABLE, modal)[0];
      if (first) first.focus();
      var field = o.input && $(o.input, modal);
      if (field) {
        var focusField = function () { if (isOpen()) field.focus(); };
        modal.addEventListener('transitionend', focusField, { once: true });
        setTimeout(focusField, 450);
      }
    }
    function close() {
      if (!isOpen()) return;
      modal.setAttribute('aria-hidden', 'true');
      doc.body.classList.remove('overlay-open');
      doc.removeEventListener('keydown', onKey);
      doc.removeEventListener('click', onOutside);
      modal.removeEventListener('keydown', trap);
      if (openBtn) openBtn.focus();
    }
    if (openBtn) openBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
  }
  function initModals() {
    makeModal($('#search-modal'), $('.open-search-button'), $('.close-modal'), { input: 'input[type="search"]', outside: true });
    makeModal($('#navigation-modal'), $('.open-mobile-navigation'), $('.close_overlay'), {});
  }

  function init() {
    initProductCarousel();
    initHomeCarousel();
    initModals();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})();
