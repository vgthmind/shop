/* Sélecteur de pays du panier (avant paiement) + prix de livraison en direct.
   Module AUTONOME, non branché : voir rapports-nuit/compta-panier.md.
   Dépend de : vg-shipping-calc.js (copie de admin/shipping-calc.js) et
   vg-shipping-view.js, chargés avant. Ne modifie pas vg-shop-cart.js : il lit
   le panier (localStorage), s'insère dans .cart-footer, remplace les montants
   « Shipping » et « Total » affichés, bloque le bouton Checkout si le pays n'est
   pas livré. Le Worker recalcule le vrai prix (le navigateur n'est qu'un affichage).
   Expose window.VGShippingPicker.country() pour l'envoyer à POST /checkout. */
(function () {
  'use strict';
  var ENDPOINT = window.VG_SHOP_CHECKOUT_ENDPOINT !== undefined
    ? window.VG_SHOP_CHECKOUT_ENDPOINT
    : 'https://vgthmind-shop-checkout.vgthm66.workers.dev';
  var CART_KEY = 'vg-shop-cart-v1', COUNTRY_KEY = 'vg-shop-country';
  var calc = window.VGShipping, V = window.VGShippingView;
  if (!calc || !V) return;

  var lang = V.langOf((document.documentElement.lang || navigator.language || 'fr'));
  var config = null, cfgFailed = false, country = '';
  try { country = localStorage.getItem(COUNTRY_KEY) || ''; } catch (e) {}
  if (!/^[A-Z]{2}$/.test(country)) {
    var legacy = '';
    try { legacy = localStorage.getItem('vg-shop-region'); } catch (e) {}
    country = legacy === 'intl' ? '' : 'FR'; // ancien choix « International » : à préciser
  }

  function readCart() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { return []; } }

  function loadConfig() {
    var timeout = new Promise(function (r) { setTimeout(function () { r(null); }, 3000); });
    var worker = ENDPOINT ? fetch(ENDPOINT + '/shipping/config').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }) : Promise.resolve(null);
    return Promise.race([worker, timeout]).then(function (c) {
      if (c && Array.isArray(c.zones)) return c;
      return fetch('/admin/shipping-config.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    }).then(function (c) { config = c; cfgFailed = !c; schedule(); });
  }

  function view() {
    var v = V.buildView(calc, config, readCart(), country, lang);
    if (cfgFailed) { v.state = 'error'; v.blocked = true; v.message = V.text(lang).error; }
    return v;
  }

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  function build() {
    var t = V.text(lang), box = el('div', 'vg-ship-picker');
    var label = el('label', 'vg-ship-label', t.country); label.setAttribute('for', 'vg-ship-country');
    var sel = el('select'); sel.id = 'vg-ship-country';
    var ph = el('option', '', t.choose); ph.value = ''; sel.appendChild(ph);
    V.countryList(lang).forEach(function (c) { var o = el('option', '', c.name); o.value = c.code; sel.appendChild(o); });
    sel.value = country;
    sel.addEventListener('change', function () {
      country = sel.value;
      try { localStorage.setItem(COUNTRY_KEY, country); localStorage.setItem('vg-shop-region', country === 'FR' ? 'fr' : 'intl'); } catch (e) {}
      try { document.dispatchEvent(new CustomEvent('vg-shipping-change', { detail: { country: country } })); } catch (e) {}
      update();
    });
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
    setText(box.querySelector('.vg-ship-summary'), v.state === 'ok' ? v.summary : '');
    var err = box.querySelector('.vg-ship-error');
    setText(err, v.state === 'ok' ? '' : v.message); err.hidden = v.state === 'ok';
    var lines = footer.querySelectorAll('.vg-cart-line .cart-subtotal__amount'); // sous-total, port, total
    if (lines.length >= 3 && v.state === 'ok') { setText(lines[1], v.free ? V.money(0) : V.money(v.shipping)); setText(lines[2], V.money(v.total)); }
    var btn = footer.querySelector('.vg-cart-checkout-all');
    if (btn) { var must = v.blocked; if (btn.disabled !== must && btn.textContent.indexOf('…') === -1) btn.disabled = must; }
  }

  var pending = false;
  function schedule() { if (pending) return; pending = true; requestAnimationFrame(function () { pending = false; update(); }); }

  window.VGShippingPicker = {
    country: function () { return country; },
    ready: function () { return !!config && !view().blocked; },
  };

  function start() {
    var css = el('style');
    css.textContent = '.vg-ship-picker{display:flex;flex-direction:column;gap:6px;width:100%;max-width:420px;margin-bottom:8px}'
      + '.vg-ship-label{display:flex;flex-direction:column;gap:4px;font-size:.9em}'
      + '.vg-ship-picker select{width:100%;min-height:44px;padding:8px 14px;border-radius:999px;border:1px solid rgba(0,0,0,.18);background:rgba(255,255,255,.6);font:inherit;font-size:16px}'
      + '.vg-ship-summary,.vg-ship-note,.vg-ship-error{margin:0;font-size:.85em}.vg-ship-note{opacity:.65}'
      + '.vg-ship-error{color:#a23b2a;font-weight:600}.vg-ship-error[hidden]{display:none}';
    document.head.appendChild(css);
    loadConfig();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('storage', schedule);
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
