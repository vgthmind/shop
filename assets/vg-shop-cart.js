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

   Paiement : tout le panier en une fois via le Checkout Worker
   (checkout-worker/, session Stripe Checkout créée côté serveur, qui relit
   prix, stock et frais de port dans le catalogue publié). Retour de Stripe
   sur /merci (panier vidé, récapitulatif) ou /paiement-annule (panier
   gardé). Les liens Stripe par pièce de l'admin ne servent plus que de
   repli si l'endpoint est vidé. */
(function () {
  'use strict';
  var STORAGE_KEY = 'vg-shop-cart-v1';
  var ENDPOINT = window.VG_SHOP_CHECKOUT_ENDPOINT !== undefined
    ? window.VG_SHOP_CHECKOUT_ENDPOINT
    : 'https://vgthmind-shop-checkout.vgthm66.workers.dev';
  var loc = window.__vgLoc || window.location;

  // Identifiant anonyme du panier : le Worker réserve les pièces 30 min
  // pour CE panier pendant un paiement (une autre personne ne peut pas les
  // payer en même temps), sans bloquer ce même visiteur s'il revient.
  function cartId() {
    var id = '';
    try { id = localStorage.getItem('vg-shop-cart-id') || ''; } catch (e) {}
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) {
      id = 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem('vg-shop-cart-id', id); } catch (e) {}
    }
    return id;
  }

  // --- Stock réel (Durable Object du Worker) : les pages sont générées avec
  // toutes les pièces disponibles ; ici on pose « Sold out » d'après le
  // stock réel. Worker injoignable (2,5 s max) : rien ne change, et le
  // paiement reste la vérification finale.
  var stockReady = (function () {
    if (!ENDPOINT || !window.fetch) return Promise.resolve(null);
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 2500); });
    var request = fetch(ENDPOINT + '/stock')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && d.stock ? d.stock : null; })
      .catch(function () { return null; });
    return Promise.race([request, timeout]);
  })();
  window.__vgStock = stockReady;

  function slugFromHref(href) {
    var m = /\/product\/([^\/?#]+)/.exec(href || '');
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }

  function applyStock(stock) {
    // Fiche produit.
    var slug = /\/product\//.test(loc.pathname || '') ? slugFromHref(loc.pathname) : '';
    if (slug && stock && stock[slug] !== undefined && stock[slug] <= 0) {
      var form = document.getElementById('add-to-cart-form');
      if (form) form.style.display = 'none';
      var sub = document.querySelector('.product-subheader');
      if (sub && !sub.querySelector('.product-status')) {
        var tag = document.createElement('span');
        tag.className = 'product-status status-secondary';
        tag.textContent = 'Sold out';
        sub.appendChild(tag);
      }
      document.documentElement.classList.add('vg-product-sold-out');
    }
    // Grilles (accueil, Products, catégories) : même étiquette que le thème.
    if (stock) {
      document.querySelectorAll('.product-list-thumb').forEach(function (thumb) {
        var a = thumb.querySelector('a.product-list-link');
        var s = a && slugFromHref(a.getAttribute('href'));
        if (!s || stock[s] === undefined || stock[s] > 0) return;
        thumb.classList.add('vg-sold-out');
        var info = thumb.querySelector('.product-list-thumb-info');
        if (info && !info.querySelector('.product-list-thumb-status')) {
          var d = document.createElement('div');
          d.className = 'product-list-thumb-status status-secondary';
          d.textContent = 'Sold out';
          info.appendChild(d);
        }
      });
    }
    document.documentElement.classList.remove('vg-stock-pending');
  }

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
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Quantité d'une ligne : 1 pour une pièce unique ; jusqu'au stock
  // (`max`, champ quantity de l'admin) pour une petite série.
  function qty(it) { return Math.max(1, it.qty || 1); }
  function lineTotal(it) { return (it.price || 0) * qty(it); }

  function updateBadges(items) {
    items = items || readCart();
    var n = items.reduce(function (s, it) { return s + qty(it); }, 0);
    document.querySelectorAll('.header-item-count, .cart-num-items').forEach(function (el) {
      el.textContent = String(n);
    });
    var subtotal = items.reduce(function (s, it) { return s + lineTotal(it); }, 0);
    document.querySelectorAll('.header-subtotal-amount').forEach(function (el) {
      el.textContent = money(subtotal);
    });
  }

  function addItem(product) {
    var items = readCart();
    var max = Math.max(1, product.quantity || 1);
    var existing = items.filter(function (it) { return it.slug === product.permalink; })[0];
    if (existing) {
      existing.max = max;
      existing.qty = Math.min(max, qty(existing) + 1);
      writeCart(items);
      return items;
    }
    var img = (product.images && product.images[0] && product.images[0].url) || (product.image && product.image.url) || '';
    items.push({
      slug: product.permalink,
      name: product.name,
      price: product.price,
      image: img,
      url: product.url,
      shipping: product.shipping || [],
      stripe_payment_link: product.stripe_payment_link || '',
      qty: 1,
      max: max
    });
    writeCart(items);
    return items;
  }

  function setQty(slug, n) {
    var items = readCart();
    items.forEach(function (it) { if (it.slug === slug) it.qty = Math.max(1, Math.min(it.max || 1, n)); });
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
    Promise.all([fetch('/product/' + slug + '.js').then(function (r) { return r.json(); }), stockReady])
      .then(function (res) {
        var product = res[0], stock = res[1];
        if (stock && stock[product.permalink] !== undefined) {
          if (stock[product.permalink] <= 0) { applyStock(stock); return; }
          product.quantity = stock[product.permalink];
        }
        addItem(product);
        setTimeout(function () { loc.href = '/cart'; }, 200);
      })
      .catch(function () { loc.href = '/cart'; });
  }, true);

  // --- Frais de port : ligne "FR" pour la France, ligne sans pays pour
  // l'international ; pas de ligne sans pays = pièce livrable en France
  // seulement (null).
  function shippingFor(item, region) {
    var list = item.shipping || [];
    var line = list.filter(function (s) {
      return region === 'fr' ? (s.country && s.country.code === 'FR') : !s.country;
    })[0];
    return line ? line.amount_alone : (region === 'fr' ? 0 : null);
  }

  // --- Rendu du panier (remplace l'état "vide" statique de cart.html
  // quand le panier local contient quelque chose - ne touche jamais au
  // gabarit lui-même).
  function renderCart() {
    var wrapper = document.querySelector('.cart-wrapper');
    if (!wrapper) return;
    var items = readCart();
    updateBadges(items);
    if (items.length === 0) { // laisse l'etat "panier vide" du gabarit
      var flash = '';
      try { flash = sessionStorage.getItem('vg-cart-flash') || ''; sessionStorage.removeItem('vg-cart-flash'); } catch (e) {}
      if (flash) {
        var p = document.createElement('p');
        p.className = 'vg-cart-msg';
        p.setAttribute('role', 'status');
        p.textContent = flash;
        wrapper.appendChild(p);
      }
      return;
    }

    var region = 'fr';
    try { region = localStorage.getItem('vg-shop-region') === 'intl' ? 'intl' : 'fr'; } catch (e) {}
    var message = '';
    var root = document.createElement('div');
    root.className = 'vg-cart-rendered';

    function subtotal() { return items.reduce(function (s, it) { return s + lineTotal(it); }, 0); }
    function franceOnly() { return items.filter(function (it) { return shippingFor(it, region) === null; }); }
    // Les frais de port BigCartel de ce catalogue ont tous
    // amount_with_others=0 : combiner des pièces ne coûte jamais plus que
    // la pièce la plus chère à expédier seule - même règle ici et dans le
    // Worker (qui fait foi).
    function shippingTotal() {
      return items.reduce(function (max, it) { return Math.max(max, shippingFor(it, region) || 0); }, 0);
    }

    function draw() {
      root.innerHTML = '';
      var blocked = franceOnly();
      // Même balisage que le gabarit panier BigCartel (cart.html) : le
      // thème et le Custom CSS déjà validés le stylent tel quel. Pas de
      // data-item-id ni de .qty-button : theme.js n'y branche rien.
      var list = document.createElement('ul');
      list.className = 'cart-items';
      items.forEach(function (it) {
        var li = document.createElement('li');
        li.className = 'cart-item';
        var note = '';
        if (blocked.indexOf(it) !== -1) {
          note = '<div class="vg-cart-unavailable">France only / livraison en France uniquement</div>';
        } else if (!ENDPOINT && it.stripe_payment_link) {
          note = '<a class="button minimal-button" href="' + esc(it.stripe_payment_link) + '" target="_blank" rel="noopener">Payer cette pièce</a>';
        }
        var qtySelect = (it.max || 1) > 1
          ? '<select class="vg-cart-qty" data-slug="' + esc(it.slug) + '" aria-label="Quantity / Quantité">'
            + Array.apply(null, Array(Math.min(it.max, 10))).map(function (_, i) {
              return '<option value="' + (i + 1) + '"' + (qty(it) === i + 1 ? ' selected' : '') + '>' + (i + 1) + '</option>';
            }).join('') + '</select>'
          : '';
        li.innerHTML =
          '<div class="cart-item-image-holder"><a class="cart-item-image-link" href="' + esc(it.url) + '">'
          + (it.image ? '<img src="' + esc(it.image) + '" alt="' + esc(it.name) + '">' : '') + '</a></div>'
          + '<div class="cart-item-detail"><a href="' + esc(it.url) + '"><div class="product-name">' + esc(it.name) + '</div></a>'
          + '<div class="option-name"><div class="cart-item-unit-price">' + money(it.price) + '</div></div>' + note + '</div>'
          + '<div class="cart-qty">' + qtySelect
          + '<button type="button" class="vg-cart-remove cart-remove-item--link button minimal-button" data-slug="' + esc(it.slug) + '">Remove<span class="visually-hidden"> ' + esc(it.name) + '</span></button></div>'
          + '<div class="cart-item-price"><span>' + money(lineTotal(it)) + '</span></div>';
        list.appendChild(li);
      });
      root.appendChild(list);

      var footer = document.createElement('div');
      footer.className = 'cart-footer';
      footer.innerHTML =
        '<label class="vg-cart-region">Shipping / Livraison '
        + '<select class="vg-cart-region-select">'
        + '<option value="fr"' + (region === 'fr' ? ' selected' : '') + '>France</option>'
        + '<option value="intl"' + (region === 'intl' ? ' selected' : '') + '>International</option>'
        + '</select></label>'
        + '<div class="cart-subtotal vg-cart-line"><span class="cart-subtotal__label">Subtotal:</span><span class="cart-subtotal__amount">' + money(subtotal()) + '</span></div>'
        + '<div class="cart-subtotal vg-cart-line"><span class="cart-subtotal__label">Shipping:</span><span class="cart-subtotal__amount">' + money(shippingTotal()) + '</span></div>'
        + '<div class="cart-subtotal vg-cart-line vg-cart-total" aria-live="polite"><span class="cart-subtotal__label">Total:</span><span class="cart-subtotal__amount">' + money(subtotal() + shippingTotal()) + '</span></div>'
        + (ENDPOINT
            ? '<div class="cart-submit"><button type="button" class="button button--checkout vg-cart-checkout-all"' + (blocked.length ? ' disabled' : '') + '>Checkout</button></div>'
            : '')
        + '<p class="vg-cart-msg" role="status" aria-live="polite"' + (message ? '' : ' hidden') + '>' + esc(message) + '</p>'
        + (blocked.length
            ? '<p class="vg-cart-note">Remove the France-only pieces to ship abroad. / Retire les pièces livrables en France uniquement pour une livraison à l\'étranger.</p>'
            : '')
        + '<p class="vg-cart-note">Secure payment by Stripe. / Paiement sécurisé par Stripe.</p>';
      root.appendChild(footer);

      root.querySelectorAll('.vg-cart-remove').forEach(function (btn) {
        btn.addEventListener('click', function () {
          items = removeItem(btn.getAttribute('data-slug'));
          message = '';
          if (items.length === 0) { root.remove(); location.reload(); return; }
          draw();
        });
      });
      root.querySelectorAll('.vg-cart-qty').forEach(function (sel) {
        sel.addEventListener('change', function () {
          items = setQty(sel.getAttribute('data-slug'), parseInt(sel.value, 10) || 1);
          message = '';
          draw();
        });
      });
      root.querySelector('.vg-cart-region-select').addEventListener('change', function (e) {
        region = e.target.value;
        try { localStorage.setItem('vg-shop-region', region); } catch (err) {}
        message = '';
        draw();
      });
      var checkoutBtn = root.querySelector('.vg-cart-checkout-all');
      if (checkoutBtn) checkoutBtn.addEventListener('click', function () { checkout(checkoutBtn); });
    }

    function checkout(btn) {
      btn.disabled = true;
      btn.textContent = 'Un instant…';
      fetch(ENDPOINT + '/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items.map(function (it) { return { slug: it.slug, qty: qty(it) }; }), region: region, cart_id: cartId() }),
      })
        .then(function (r) { return r.json().then(function (data) { return { status: r.status, data: data }; }); })
        .then(function (res) {
          if (res.data.url) { window.location.href = res.data.url; return; }
          if (res.status === 409 && res.data.problems) {
            // Pièces vendues entre-temps : retirées du panier, on le dit.
            var gone = res.data.problems.filter(function (p) { return p.reason === 'vendue' || p.reason === 'introuvable'; })
              .map(function (p) { return p.slug; });
            var held = res.data.problems.filter(function (p) { return p.reason === 'reservee'; })
              .map(function (p) { return p.slug; });
            var heldNames = items.filter(function (it) { return held.indexOf(it.slug) !== -1; }).map(function (it) { return it.name; });
            var names = items.filter(function (it) { return gone.indexOf(it.slug) !== -1; }).map(function (it) { return it.name; });
            gone.forEach(function (slug) { items = removeItem(slug); });
            // Petite série : il en reste moins que demandé -> quantité ramenée au stock.
            var short = res.data.problems.filter(function (p) { return p.reason === 'stock'; });
            short.forEach(function (p) {
              var cart = readCart();
              cart.forEach(function (it) { if (it.slug === p.slug) it.max = Math.max(1, p.available || 1); });
              writeCart(cart);
              items = setQty(p.slug, p.available || 1);
            });
            message = names.length
              ? 'Sorry, already sold / Désolé, déjà vendu : ' + names.join(', ') + '. Removed from your cart / Retiré du panier.'
              : heldNames.length
                ? 'Someone is paying for ' + heldNames.join(', ') + ' right now, try again in 30 min. / Quelqu’un est en train de payer ' + heldNames.join(', ') + ', réessaie dans 30 min.'
                : short.length
                  ? 'Fewer left than requested, quantity updated. / Il en reste moins que demandé, quantité ajustée.'
                  : 'France only / Livraison en France uniquement pour certaines pièces.';
            if (items.length === 0) { root.remove(); location.reload(); return; }
          } else {
            message = 'Payment unavailable right now / Paiement indisponible pour le moment (' + (res.data.error || 'erreur') + ').';
          }
          draw();
        })
        .catch(function () {
          message = 'Connection problem, try again / Problème de connexion, réessaie.';
          draw();
        });
    }

    draw();
    var native = wrapper.querySelector('form.cart-form, .alert-message');
    if (native) native.style.display = 'none';
    var header = wrapper.querySelector('.cart-header');
    if (header) header.classList.remove('cart-empty');
    wrapper.appendChild(root);

    // Pièces vendues / retirées depuis l'ajout au panier : retirées dès
    // l'ouverture du panier (catalogue publié + stock réel), comme BigCartel.
    Promise.all([
      fetch('/products.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      stockReady,
    ])
      .then(function (res) {
        var catalog = res[0], stock = res[1];
        if (!catalog) return;
        var live = {};
        catalog.forEach(function (p) { live[p.permalink] = p; });
        var left = function (slug) { return stock && stock[slug] !== undefined ? stock[slug] : null; };
        var gone = items.filter(function (it) {
          return !live[it.slug] || left(it.slug) === 0;
        });
        // Petite série : quantité ramenée au stock restant.
        items.forEach(function (it) {
          var n = left(it.slug);
          if (n && it.max !== n) {
            var cart = readCart();
            cart.forEach(function (c) { if (c.slug === it.slug) { c.max = Math.max(1, n); c.qty = Math.min(qty(c), c.max); } });
            writeCart(cart);
          }
        });
        items = readCart();
        if (!gone.length) { draw(); return; }
        gone.forEach(function (it) { items = removeItem(it.slug); });
        message = 'Sorry, no longer available / Désolé, plus disponible : '
          + gone.map(function (it) { return it.name; }).join(', ') + '.';
        if (items.length === 0) {
          try { sessionStorage.setItem('vg-cart-flash', message); } catch (e) {}
          root.remove(); location.reload(); return;
        }
        draw();
      })
      .catch(function () {});
  }

  // --- Retour de Stripe : /merci (payé : panier vidé + récapitulatif) et
  // /paiement-annule (rien à faire, le panier est intact).
  function renderOrderResult() {
    var id = (loc.search || '').match(/[?&]session_id=([^&]+)/);
    if (!id || !ENDPOINT) return;
    if (document.querySelector('[data-vg-order="cancel"]')) {
      // Rend tout de suite les pièces aux autres visiteurs.
      fetch(ENDPOINT + '/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: decodeURIComponent(id[1]) }),
      }).catch(function () {});
      return;
    }
    var box = document.querySelector('[data-vg-order="success"]');
    if (!box) return;
    fetch(ENDPOINT + '/session?id=' + encodeURIComponent(decodeURIComponent(id[1])))
      .then(function (r) { return r.json(); })
      .then(function (s) {
        if (!s.paid) return;
        var paidSlugs = s.slugs || [];
        var left = readCart().filter(function (it) { return paidSlugs.indexOf(it.slug) === -1; });
        writeCart(left);
        var summary = box.querySelector('.vg-order-summary');
        if (!summary) return;
        summary.innerHTML = '<ul class="vg-cart-items">'
          + (s.items || []).map(function (it) {
            return '<li class="vg-cart-line"><span>' + esc(it.name) + '</span><span>' + money(it.amount) + '</span></li>';
          }).join('')
          + '<li class="vg-cart-line"><span>Shipping / Livraison</span><span>' + money(s.shipping) + '</span></li>'
          + '<li class="vg-cart-line vg-cart-total"><span>Total</span><span>' + money(s.total) + '</span></li>'
          + '</ul>'
          + (s.email ? '<p class="vg-cart-note">Receipt sent to / Reçu envoyé à ' + esc(s.email) + '</p>' : '')
          + '<p class="vg-cart-note">No email from us? Check your spam folder. / Pas de mail de notre part ? Regarde dans tes spams.</p>';
        summary.hidden = false;
      })
      .catch(function () {});
  }

  // --- Page /suivi : numero + e-mail -> statut, articles, adresse, colis.
  // Le Worker (POST /track) ne repond que pour le bon couple ; echec = message neutre.
  var TRACK_TEXT = {
    fr: {
      title: 'Suivre ma commande', intro: 'Entre ton numéro de commande (dans ton e-mail de confirmation) et l\'adresse e-mail utilisée pour la commande.',
      ref: 'Numéro de commande', email: 'E-mail', submit: 'Suivre ma commande', loading: 'Recherche…',
      missing: 'Renseigne ton numéro de commande et ton e-mail.',
      notfound: 'Nous n\'avons pas trouvé de commande avec ces informations. Vérifie le numéro et l\'e-mail, puis réessaie.',
      rate: 'Trop de tentatives. Réessaie dans quelques minutes.', error: 'Un problème est survenu. Réessaie dans un instant.',
      order: 'Commande', placed: 'passée le', steps: ['Reçue', 'En préparation', 'Expédiée'],
      s_received: 'Ta commande est bien reçue.', s_preparing: 'Ta commande est en cours de préparation.', s_shipped: 'Ta commande est partie.',
      items: 'Articles', size: 'Taille', qty: 'Qté', each: 'l\'unité', shipping: 'Livraison', total: 'Total', address: 'Adresse de livraison',
      parcel: 'Numéro de suivi', ev_picked: 'Pris en charge', ev_transit: 'En transit', ev_out: 'En cours de livraison', ev_pickup: 'Disponible au point de retrait', ev_delivered: 'Livré', ev_issue: 'Incident de livraison, contactez-nous', noDetail: 'Le suivi détaillé n'est pas disponible pour le moment.', noEvents: 'Le colis n'a pas encore été pris en charge.', noTracking: 'Le numéro de suivi n\'est pas encore disponible.', again: 'Suivre une autre commande',
    },
    en: {
      title: 'Track my order', intro: 'Enter your order number (in your confirmation email) and the email address used for the order.',
      ref: 'Order number', email: 'Email', submit: 'Track my order', loading: 'Looking up…',
      missing: 'Enter your order number and your email.',
      notfound: 'We couldn\'t find an order with these details. Check the number and email, then try again.',
      rate: 'Too many attempts. Please try again in a few minutes.', error: 'Something went wrong. Please try again in a moment.',
      order: 'Order', placed: 'placed on', steps: ['Received', 'Being prepared', 'Shipped'],
      s_received: 'Your order has been received.', s_preparing: 'Your order is being prepared.', s_shipped: 'Your order is on its way.',
      items: 'Items', size: 'Size', qty: 'Qty', each: 'each', shipping: 'Shipping', total: 'Total', address: 'Delivery address',
      parcel: 'Tracking number', ev_picked: 'Picked up', ev_transit: 'In transit', ev_out: 'Out for delivery', ev_pickup: 'Available for pickup', ev_delivered: 'Delivered', ev_issue: 'Delivery issue, please contact us', noDetail: 'Detailed tracking isn't available right now.', noEvents: 'The parcel hasn't been picked up yet.', noTracking: 'The tracking number isn\'t available yet.', again: 'Track another order',
    },
  };

  function renderTracking() {
    var root = document.querySelector('[data-vg-track]');
    if (!root) return;
    var q = (loc.search || '');
    var fromUrl = function (k) { var m = q.match(new RegExp('[?&]' + k + '=([^&]*)')); return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : ''; };
    var lang = fromUrl('l') === 'fr' || fromUrl('l') === 'en' ? fromUrl('l')
      : (/^fr/i.test(navigator.language || '') ? 'fr' : 'en');
    try { var saved = localStorage.getItem('vg-track-lang'); if (!fromUrl('l') && (saved === 'fr' || saved === 'en')) lang = saved; } catch (e) {}
    var form = root.querySelector('form');
    var refInput = root.querySelector('#vg-track-ref');
    var emailInput = root.querySelector('#vg-track-email');
    var submit = root.querySelector('.vg-track-submit');
    var msg = root.querySelector('.vg-track-msg');
    var lookup = root.querySelector('.vg-track-lookup');
    var result = root.querySelector('.vg-track-result');
    var t;

    function applyLang(l) {
      lang = l; t = TRACK_TEXT[l];
      try { localStorage.setItem('vg-track-lang', l); } catch (e) {}
      document.documentElement.setAttribute('lang', l);
      root.querySelectorAll('[data-t]').forEach(function (el) { el.textContent = t[el.getAttribute('data-t')]; });
      root.querySelectorAll('[data-lang]').forEach(function (a) { a.setAttribute('aria-current', String(a.getAttribute('data-lang') === l)); });
      var h1 = document.querySelector('main h1'); if (h1) h1.textContent = t.title;
      document.title = t.title + ' | vgthmind';
      if (result.__data) drawResult(result.__data);
    }
    function countryLabel(code) {
      if (!code) return '';
      try { return new Intl.DisplayNames([lang], { type: 'region' }).of(String(code).toUpperCase()) || code; } catch (e) { return code; }
    }
    function showMsg(text) { msg.textContent = text; msg.hidden = !text; }
    function fmtDate(sec) {
      try { return new Date(sec * 1000).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
      catch (e) { return ''; }
    }

    function drawResult(d) {
      result.__data = d;
      var idx = d.status === 'shipped' ? 2 : d.status === 'preparing' ? 1 : 0;
      var steps = t.steps.map(function (label, i) {
        var cls = i < idx ? 'is-done' : i === idx ? 'is-done is-current' : '';
        var sub = i === 2 && d.shippedAt ? '<small>' + esc(fmtDate(d.shippedAt)) + '</small>' : (i === 0 && d.created ? '<small>' + esc(fmtDate(d.created)) + '</small>' : '');
        return '<li class="' + cls + '"' + (i === idx ? ' aria-current="step"' : '') + '>' + esc(label) + sub + '</li>';
      }).join('');
      var items = (d.items || []).map(function (it) {
        return '<li class="cart-item">'
          + '<div class="cart-item-image-holder"><span class="cart-item-image-link">' + (it.image ? '<img src="' + esc(it.image) + '" alt="' + esc(it.name) + '" decoding="async">' : '') + '</span></div>'
          + '<div class="cart-item-detail"><div class="product-name">' + esc(it.name) + '</div>'
          + '<div class="option-name">' + (it.size ? esc(t.size) + ' ' + esc(it.size) + ' · ' : '') + esc(t.qty) + ' ' + esc(it.qty || 1) + '</div>'
          + (it.unit ? '<div class="vg-track-unit">' + money(it.unit) + ' ' + esc(t.each) + '</div>' : '') + '</div>'
          + '<div class="cart-item-price"><span>' + money(it.amount) + '</span></div></li>';
      }).join('');
      var parcel = '';
      if (d.status === 'shipped') {
        var pc = d.parcel;
        var detail = '';
        if (!d.tracking) detail = '';
        else if (!pc) detail = '<p class="vg-track-note">' + esc(t.noDetail) + '</p>';
        else if (!pc.events || !pc.events.length) detail = '<p class="vg-track-note">' + esc(t.noEvents) + '</p>';
        else detail = '<ol class="vg-track-events">' + pc.events.map(function (e) {
          var ts = Date.parse(e.date + 'T12:00:00Z');
          var label = esc(t['ev_' + e.code] || t.ev_transit);
          if (e.code === 'issue') label = '<a href="../contact-914a3d">' + label + '</a>';
          return '<li><small>' + esc(isNaN(ts) ? '' : fmtDate(ts / 1000)) + '</small> ' + label + '</li>';
        }).join('') + '</ol>';
        parcel = '<div class="vg-track-parcel">'
          + (d.tracking ? '<p>' + esc(t.parcel) + '<br><strong>' + esc(d.tracking) + '</strong></p>' : '<p>' + esc(t.noTracking) + '</p>')
          + detail
          + '</div>';
      }
      result.innerHTML =
        '<div class="vg-track-head"><span class="vg-track-ref">' + esc(d.ref) + '</span>' + (d.created ? '<span class="vg-track-date">' + esc(t.placed) + ' ' + esc(fmtDate(d.created)) + '</span>' : '') + '</div>'
        + '<ol class="vg-track-steps">' + steps + '</ol>'
        + '<p class="vg-track-status">' + esc(t['s_' + d.status]) + '</p>'
        + '<h2 class="vg-track-h">' + esc(t.items) + '</h2>'
        + '<ul class="cart-items">' + items + '</ul>'
        + '<div class="cart-footer">'
        + '<div class="cart-subtotal vg-cart-line"><span class="cart-subtotal__label">' + esc(t.shipping) + ':</span><span class="cart-subtotal__amount">' + money(d.shipping) + '</span></div>'
        + '<div class="cart-subtotal vg-cart-line vg-cart-total"><span class="cart-subtotal__label">' + esc(t.total) + ':</span><span class="cart-subtotal__amount">' + money(d.total) + '</span></div></div>'
        + '<h2 class="vg-track-h">' + esc(t.address) + '</h2>'
        + '<p class="vg-track-address">' + esc((d.address || []).concat(countryLabel(d.country)).filter(Boolean).join('\n')) + '</p>'
        + parcel
        + '<p class="vg-track-again"><button type="button" class="button button--checkout vg-track-back">' + esc(t.again) + '</button></p>';
      lookup.hidden = true; result.hidden = false;
    }

    root.querySelectorAll('[data-lang]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); applyLang(a.getAttribute('data-lang')); });
    });
    result.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('.vg-track-back')) return;
      result.hidden = true; result.innerHTML = ''; result.__data = null; lookup.hidden = false;
      emailInput.value = ''; showMsg(''); refInput.focus();
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ref = refInput.value.trim(), email = emailInput.value.trim();
      if (!ref || !email) { showMsg(t.missing); return; }
      if (!ENDPOINT) { showMsg(t.error); return; }
      showMsg(''); submit.setAttribute('aria-busy', 'true'); submit.disabled = true; submit.textContent = t.loading;
      fetch(ENDPOINT + '/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: ref, email: email }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, d: d }; }); })
        .then(function (res) {
          if (res.d && res.d.ok) { drawResult(res.d); window.scrollTo(0, 0); return; }
          showMsg(res.status === 429 ? t.rate : res.status === 404 ? t.notfound : t.error);
        })
        .catch(function () { showMsg(t.error); })
        .then(function () { submit.removeAttribute('aria-busy'); submit.disabled = false; submit.textContent = t.submit; });
    });

    var pre = fromUrl('o'); if (pre) refInput.value = pre.slice(0, 14);
    applyLang(lang);
    // Numero deja rempli (lien du mail) : on va droit a l'e-mail.
    if (pre) emailInput.focus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();
  function onReady() {
    updateBadges();
    renderCart();
    renderOrderResult();
    renderTracking();
    stockReady.then(applyStock);
  }
})();
