/* Sélecteur de pays du panier (avant paiement) + prix de livraison en direct.
   Dépend de vg-shipping-view.js (chargé avant). Lit le panier (localStorage), s'insère dans .cart-footer,
   remplace les montants « Shipping » et « Total », bloque le bouton Checkout tant que le pays n'est pas
   choisi ou pas livré. Le prix vient du Worker (POST /shipping/quote) : même calcul que le paiement Stripe.
   Expose window.VGShippingPicker.country() : envoyé à POST /checkout, qui limite l'adresse à ce pays. */
(function () {
  'use strict';
  var ENDPOINT = window.VG_SHOP_CHECKOUT_ENDPOINT !== undefined
    ? window.VG_SHOP_CHECKOUT_ENDPOINT
    : 'https://vgthmind-shop-checkout.vgthm66.workers.dev';
  var CART_KEY = 'vg-shop-cart-v1', COUNTRY_KEY = 'vg-shop-country';
  var V = window.VGShippingView;
  if (!V || !ENDPOINT) return;

  var lang = V.langOf((document.documentElement.lang || navigator.language || 'fr'));
  var country = '', quote = null, quoteKey = '', quoteFailedAt = 0;
  try { country = localStorage.getItem(COUNTRY_KEY) || ''; } catch (e) {}
  if (!/^[A-Z]{2}$/.test(country)) {
    var legacy = '';
    try { legacy = localStorage.getItem('vg-shop-region'); } catch (e) {}
    country = legacy === 'intl' || !/^fr(-FR)?$/i.test(navigator.language || '') ? '' : 'FR'; // pas de pays par défaut hors navigateur français : le client choisit AVANT de payer
  }

  function readCart() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { return []; } }

  function cartSig(cart) { return country + '|' + cart.map(function (it) { return it.slug + ':' + (it.qty || 1); }).join(','); }

  // Demande le prix au Worker quand le pays ou le panier change (la dernière demande gagne).
  function requestQuote(cart) {
    var key = cartSig(cart);
    if (key === quoteKey && !(quote && quote.network && Date.now() - quoteFailedAt > 10000)) return;
    quoteKey = key; quote = null;
    var ctl = typeof AbortController === 'function' ? new AbortController() : null, t = ctl && setTimeout(function () { ctl.abort(); }, 8000);
    fetch(ENDPOINT + '/shipping/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl ? ctl.signal : undefined,
      body: JSON.stringify({ country: country, items: cart.map(function (it) { return { slug: it.slug, qty: Math.max(1, Math.floor(it.qty || 1)) }; }) })
    }).then(function (r) { return r.json(); })
      .then(function (q) { if (quoteKey === key) { quote = q; schedule(); } })
      .catch(function () { if (quoteKey === key) { quote = { ok: false, error: 'network', network: true }; quoteFailedAt = Date.now(); schedule(); } })
      .then(function () { if (t) clearTimeout(t); });
  }

  function view() {
    var cart = readCart(), subtotal = cart.reduce(function (s, it) { return s + (it.price || 0) * Math.max(1, Math.floor(it.qty || 1)); }, 0);
    if (country && cart.length) requestQuote(cart);
    return V.fromQuote(quote, subtotal, country, lang);
  }

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  function plain(x) { return String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }

  function build() {
    var t = V.text(lang), box = el('div', 'vg-ship-picker');
    var label = el('label', 'vg-ship-label', t.country); label.setAttribute('for', 'vg-ship-country');
    var sel = el('select'); sel.id = 'vg-ship-country';
    var all = V.countryList(lang);
    // Recherche par nom (sans accent, ni majuscule) : la liste se réduit ; un seul résultat = choisi tout de suite.
    function fill(q) {
      var keep = country, f = plain(q || '');
      sel.innerHTML = '';
      var ph = el('option', '', t.choose); ph.value = ''; sel.appendChild(ph);
      var n = 0, last = null;
      all.forEach(function (c) {
        var hit = !f || plain(c.name).indexOf(f) !== -1;
        if (!hit && c.code !== keep) return;
        var o = el('option', '', c.name); o.value = c.code; sel.appendChild(o);
        if (hit) { n++; last = c; }
      });
      sel.value = keep;
      return f && n === 1 && last ? last.code : '';
    }
    function choose(code) {
      country = code;
      try { localStorage.setItem(COUNTRY_KEY, country); localStorage.setItem('vg-shop-region', country === 'FR' ? 'fr' : 'intl'); } catch (e) {}
      try { document.dispatchEvent(new CustomEvent('vg-shipping-change', { detail: { country: country } })); } catch (e) {}
      update();
    }
    var search = el('input', 'vg-ship-search'); search.type = 'search'; search.id = 'vg-ship-search';
    search.placeholder = lang === 'fr' ? 'Rechercher un pays…' : 'Search a country…';
    search.setAttribute('aria-label', search.placeholder); search.autocomplete = 'off';
    search.addEventListener('input', function () {
      var only = fill(search.value);
      if (only && only !== country) choose(only);
    });
    fill('');
    sel.addEventListener('change', function () { choose(sel.value); });
    label.appendChild(search);
    label.appendChild(sel);
    box.appendChild(label);
    box.appendChild(el('p', 'vg-ship-summary'));
    var err = el('p', 'vg-ship-error'); err.setAttribute('role', 'alert'); box.appendChild(err);
    box.appendChild(el('p', 'vg-ship-note', t.note));
    return box;
  }

  function setText(node, s) { if (node && node.textContent !== s) node.textContent = s; }

  function update() {
    var footer = document.querySelector('.vg-cart-rendered .cart-footer');
    if (!footer) return;
    var box = footer.querySelector('.vg-ship-picker');
    if (!box) { box = build(); footer.insertBefore(box, footer.firstChild); }
    var v = view();
    var legacySel = footer.querySelector('.vg-cart-region'); // ancien choix France / International
    if (legacySel) legacySel.style.display = 'none';
    var sel = box.querySelector('select'); if (sel.value !== country) sel.value = country;
    box.classList.toggle('vg-ship-need', !country); // pays pas encore choisi : cadre bien visible
    setText(box.querySelector('.vg-ship-summary'), v.state === 'ok' ? v.summary : '');
    var err = box.querySelector('.vg-ship-error');
    setText(err, v.state === 'ok' ? '' : v.message); err.hidden = v.state === 'ok';
    var lines = footer.querySelectorAll('.vg-cart-line .cart-subtotal__amount'); // sous-total, port, total
    if (lines.length >= 3 && v.state === 'ok') { setText(lines[1], v.free ? V.money(0) : V.money(v.shipping)); setText(lines[2], V.money(v.total)); }
    // Pays non choisi / non livré : ne pas laisser le port du pays précédent affiché.
    else if (lines.length >= 3) { setText(lines[1], '—'); setText(lines[2], V.money(v.subtotal)); }
    var btn = footer.querySelector('.vg-cart-checkout-all');
    if (btn) { var must = v.blocked; if (btn.disabled !== must && btn.textContent.indexOf('…') === -1) btn.disabled = must; }
  }

  var pending = false;
  function schedule() { if (pending) return; pending = true; setTimeout(function () { pending = false; update(); }, 30); } // pas requestAnimationFrame : gelé dans un onglet en arrière-plan

  window.VGShippingPicker = {
    country: function () { return country; },
    ready: function () { return !view().blocked; },
  };

  function start() {
    var css = el('style');
    css.textContent = '.vg-ship-picker{display:flex;flex-direction:column;gap:6px;width:100%;max-width:420px;margin-bottom:8px}'
      + '.vg-ship-label{display:flex;flex-direction:column;gap:4px;font-size:.9em}'
      + '.vg-ship-picker select{width:100%;min-height:44px;padding:8px 14px;border-radius:999px;border:1px solid rgba(0,0,0,.18);background:rgba(255,255,255,.6);font:inherit;font-size:16px}'
      + '.vg-ship-summary,.vg-ship-note,.vg-ship-error{margin:0;font-size:.85em}.vg-ship-note{opacity:.65}'
      + '.vg-ship-search{width:100%;min-height:44px;padding:8px 14px;border-radius:999px;border:1px solid rgba(0,0,0,.18);background:#fff;font:inherit;font-size:16px}'
      + '.vg-ship-label{font-weight:600}.vg-ship-need select,.vg-ship-need .vg-ship-search{border:2px solid #3d4045;box-shadow:0 0 0 3px rgba(61,64,69,.15)}'
      + '.vg-ship-error{color:#a23b2a;font-weight:600}.vg-ship-error[hidden]{display:none}';
    document.head.appendChild(css);
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('storage', schedule);
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
