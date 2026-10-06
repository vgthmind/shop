/* Panier front-end (prototype hors BigCartel, étape 3 du plan).
   Additif, comme le Body du brouillon : ne touche à aucun gabarit
   (theme/*.html reste l'octet-pour-octet du brouillon réel), s'appuie sur
   window.__vgLoc / le fetch patché par assets/vg-shop-shim.js (déjà
   injecté avant ce script) pour voir les chemins et les requêtes sans le
   prefixe /shop, comme vg-transitions-dev.js.

   BigCartel gère nativement le panier/paiement côté serveur (aucun
   backend ici) : ce module le remplace entièrement côté front avec
   localStorage, SANS toucher au script de transitions (vg-transitions-dev.js
   garde son animation "passive" sur #add-to-cart-form - ce module
   intercepte seulement l'événement submit, qui se déclenche après le
   click que ce script-là écoute, pour éviter tout conflit).

   Paiement : chaque pièce étant unique, pas de vrai panier multi-articles
   unifié pour l'instant (voir ETAT.md, tâche 2) - un lien de paiement
   Stripe par pièce (configuré dans l'admin, admin/config.yml). Si
   window.VG_SHOP_CHECKOUT_ENDPOINT est renseigné un jour (petite fonction
   serverless créant une session Stripe Checkout pour tout le panier -
   voir checkout-worker/), ce module l'utilise à la place. */
(function () {
  'use strict';
  var STORAGE_KEY = 'vg-shop-cart-v1';
  var loc = window.__vgLoc || window.location;

  function readCart() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) { return []; }
  }
  function writeCart(items) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (e) {}
    updateBadges(items);
  }

  function money(amount) {
    return (Math.round((amount || 0) * 100) / 100).toFixed(2).replace('.', ',') + ' EUR';
  }

  function updateBadges(items) {
    items = items || readCart();
    var n = items.length;
    document.querySelectorAll('.header-item-count, .cart-num-items').forEach(function (el) {
      el.textContent = String(n);
    });
    var subtotal = items.reduce(function (s, it) { return s + (it.price || 0); }, 0);
    document.querySelectorAll('.header-subtotal-amount').forEach(function (el) {
      el.textContent = money(subtotal);
    });
  }

  function addItem(product) {
    var items = readCart();
    if (items.some(function (it) { return it.slug === product.permalink; })) return items;
    var img = (product.images && product.images[0] && product.images[0].url) || (product.image && product.image.url) || '';
    items.push({
      slug: product.permalink,
      name: product.name,
      price: product.price,
      image: img,
      url: product.url,
      shipping: product.shipping || [],
      stripe_payment_link: product.stripe_payment_link || ''
    });
    writeCart(items);
    return items;
  }

  function removeItem(slug) {
    var items = readCart().filter(function (it) { return it.slug !== slug; });
    writeCart(items);
    return items;
  }

  // --- "Add to cart" : le click (capturé par vg-transitions-dev.js, qui
  // joue l'animation du panier sans empêcher la soumission) arrive avant
  // ce handler submit - on bloque seulement la vraie requête réseau (il
  // n'y a pas de backend pour la recevoir) et on ajoute au panier local.
  document.addEventListener('submit', function (e) {
    var form = e.target.closest && e.target.closest('#add-to-cart-form');
    if (!form) return;
    e.preventDefault();
    var slug = decodeURIComponent((loc.pathname || '').split('/').filter(Boolean).pop() || '');
    if (!slug) return;
    fetch('/product/' + slug + '.js')
      .then(function (r) { return r.json(); })
      .then(function (product) {
        addItem(product);
        setTimeout(function () { loc.href = '/cart'; }, 200);
      })
      .catch(function () { loc.href = '/cart'; });
  }, true);

  // --- Rendu du panier (remplace l'état "vide" statique de cart.html
  // quand le panier local contient quelque chose - ne touche jamais au
  // gabarit lui-même).
  function shippingFor(item, region) {
    var list = item.shipping || [];
    if (region === 'fr') {
      var fr = list.filter(function (s) { return s.country && s.country.code === 'FR'; })[0];
      return fr ? fr.amount_alone : 0;
    }
    var intl = list.filter(function (s) { return !s.country; })[0];
    return intl ? intl.amount_alone : (list[0] ? list[0].amount_alone : 0);
  }

  function renderCart() {
    var wrapper = document.querySelector('.cart-wrapper');
    if (!wrapper) return;
    var items = readCart();
    updateBadges(items);
    if (items.length === 0) return; // laisse l'etat "panier vide" du gabarit

    var region = 'fr';
    var root = document.createElement('div');
    root.className = 'vg-cart-rendered';

    function subtotal() { return items.reduce(function (s, it) { return s + (it.price || 0); }, 0); }
    // Les frais de port BigCartel de ce catalogue ont tous
    // amount_with_others=0 : combiner des pièces ne coûte jamais plus que
    // la pièce la plus chère à expédier seule (vérifié sur les 27 pièces
    // importées) - le panier reprend donc cette règle plutôt que de
    // sommer un frais par pièce.
    function shippingTotal() {
      return items.reduce(function (max, it) { return Math.max(max, shippingFor(it, region)); }, 0);
    }

    function draw() {
      root.innerHTML = '';
      var list = document.createElement('ul');
      list.className = 'vg-cart-items';
      items.forEach(function (it) {
        var li = document.createElement('li');
        li.className = 'vg-cart-item';
        var img = it.image ? '<img src="' + it.image + '" alt="" width="64" height="64">' : '';
        var payLink = it.stripe_payment_link
          ? '<a class="button minimal-button" href="' + it.stripe_payment_link + '" target="_blank" rel="noopener">Payer cette pièce</a>'
          : '<span class="vg-cart-unavailable">Indisponible au paiement en ligne pour l’instant — contacte-moi sur Instagram</span>';
        li.innerHTML = img
          + '<span class="vg-cart-item-name"><a href="' + it.url + '">' + it.name + '</a></span>'
          + '<span class="vg-cart-item-price">' + money(it.price) + '</span>'
          + payLink
          + '<button type="button" class="vg-cart-remove" data-slug="' + it.slug + '" aria-label="Retirer">×</button>';
        list.appendChild(li);
      });
      root.appendChild(list);

      var footer = document.createElement('div');
      footer.className = 'vg-cart-footer';
      footer.innerHTML =
        '<label class="vg-cart-region">Livraison : '
        + '<select class="vg-cart-region-select">'
        + '<option value="fr"' + (region === 'fr' ? ' selected' : '') + '>France</option>'
        + '<option value="intl"' + (region === 'intl' ? ' selected' : '') + '>International (Canada inclus)</option>'
        + '</select></label>'
        + '<div class="vg-cart-line">Sous-total : ' + money(subtotal()) + '</div>'
        + '<div class="vg-cart-line">Livraison : ' + money(shippingTotal()) + '</div>'
        + '<div class="vg-cart-line vg-cart-total">Total : ' + money(subtotal() + shippingTotal()) + '</div>'
        + (window.VG_SHOP_CHECKOUT_ENDPOINT
            ? '<button type="button" class="button vg-cart-checkout-all">Payer tout le panier</button>'
            : '')
        + '<p class="vg-cart-note">Chaque pièce étant unique, le paiement se fait pièce par pièce via son propre lien Stripe sécurisé ci-dessus.</p>';
      root.appendChild(footer);

      root.querySelectorAll('.vg-cart-remove').forEach(function (btn) {
        btn.addEventListener('click', function () {
          items = removeItem(btn.getAttribute('data-slug'));
          if (items.length === 0) { wrapper.querySelector('.vg-cart-rendered').remove(); location.reload(); return; }
          draw();
        });
      });
      root.querySelector('.vg-cart-region-select').addEventListener('change', function (e) {
        region = e.target.value;
        draw();
      });
      var checkoutBtn = root.querySelector('.vg-cart-checkout-all');
      if (checkoutBtn) {
        checkoutBtn.addEventListener('click', function () {
          checkoutBtn.disabled = true;
          checkoutBtn.textContent = 'Un instant...';
          fetch(window.VG_SHOP_CHECKOUT_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: items, region: region }),
          })
            .then(function (r) { return r.json(); })
            .then(function (data) {
              if (data.url) { window.location.href = data.url; return; }
              throw new Error(data.error || 'Erreur inconnue');
            })
            .catch(function (e) {
              checkoutBtn.disabled = false;
              checkoutBtn.textContent = 'Payer tout le panier';
              alert('Paiement groupé indisponible pour le moment (' + e.message + '). Utilise les liens par pièce ci-dessus.');
            });
        });
      }
    }
    draw();

    var native = wrapper.querySelector('form.cart-form, .alert-message');
    if (native) native.style.display = 'none';
    wrapper.appendChild(root);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();
  function onReady() {
    updateBadges();
    renderCart();
  }
})();
