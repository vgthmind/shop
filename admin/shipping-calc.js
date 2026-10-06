/* Calcul des frais d'envoi (module pur, sans dependance, sans reseau).
   Meme fichier pour 3 usages :
     - Worker  : import { quoteShipping } from '../admin/shipping-calc.js'
     - Admin   : <script src="shipping-calc.js"> -> window.VGShipping
     - Tests   : node --test tests/
   Les sommes sont calculees en CENTIMES (entiers), jamais en flottants.

   Entree  : quoteShipping(config, cart, country)
     config  : voir admin/shipping-config.json
     cart    : { items: [{ slug, qty }], subtotal } ; subtotal en euros (prix des pieces,
               avant remise) ; sert seulement a la livraison offerte
     country : code pays ISO a 2 lettres (« FR », « CA »…)
   Sortie  : { ok:true, zone, zoneName, currency, total (euros), totalCents, free,
               parcels:[{ items:[{slug,qty?,weight_g,size}], pieces, weight_g, priceCents, price }] }
          ou { ok:false, error:'country_not_served'|'empty_cart'|'bad_config', message } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VGShipping = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULT_SLOTS = { petit: 1, moyen: 1, gros: 3 };
  var DEFAULT_WEIGHTS = { petit: 150, moyen: 500, gros: 1500 };

  function cents(euros) { return Math.round(Number(euros || 0) * 100); }
  function toInt(v, d) { v = Math.floor(Number(v)); return isFinite(v) && v > 0 ? v : d; }

  // Poids et « place » d'une piece : reglage propre a la piece, sinon valeur du format.
  function pieceInfo(config, slug) {
    var meta = (config.items && config.items[slug]) || {};
    var sizes = config.sizes || {};
    var size = meta.size && (sizes[meta.size] || DEFAULT_SLOTS[meta.size]) ? meta.size : (config.default_size || 'moyen');
    var def = sizes[size] || {};
    var weight = toInt(meta.weight_g, 0) || toInt(def.weight_g, 0) || DEFAULT_WEIGHTS[size] || 500;
    var slots = toInt(meta.slots, 0) || toInt(def.slots, 0) || DEFAULT_SLOTS[size] || 1;
    return { slug: slug, weight_g: weight, size: size, slots: slots };
  }

  // Une piece par unite, triees de la plus lourde a la plus legere, puis rangees
  // « premier colis qui peut encore la prendre » (limites : pieces et poids).
  function pack(config, items) {
    var maxSlots = toInt(config.max_pieces_per_parcel, 1000);
    var maxWeight = toInt(config.max_weight_g_per_parcel, 0); // 0 = pas de limite
    var tare = Math.max(0, Math.floor(Number(config.parcel_tare_g) || 0));
    var units = [];
    items.forEach(function (it) {
      var info = pieceInfo(config, it.slug);
      for (var i = 0; i < Math.max(1, toInt(it.qty, 1)); i++) units.push(info);
    });
    units.sort(function (a, b) { return b.weight_g - a.weight_g || b.slots - a.slots; });
    var parcels = [];
    units.forEach(function (u) {
      var target = null;
      for (var i = 0; i < parcels.length; i++) {
        var p = parcels[i];
        if (p.slots + u.slots <= maxSlots && (!maxWeight || p.goods + u.weight_g <= maxWeight)) { target = p; break; }
      }
      if (!target) { target = { units: [], slots: 0, goods: 0 }; parcels.push(target); }
      target.units.push(u); target.slots += u.slots; target.goods += u.weight_g;
    });
    parcels.forEach(function (p) { p.weight_g = p.goods + tare; });
    return parcels;
  }

  function findZone(config, country) {
    var c = String(country || '').toUpperCase(), star = null;
    var zones = config.zones || [];
    for (var i = 0; i < zones.length; i++) {
      var list = zones[i].countries || [];
      if (list.indexOf(c) !== -1) return zones[i];
      if (list.indexOf('*') !== -1) star = zones[i];
    }
    return star; // zone « reste du monde » ; null = pays non livre
  }

  // Tarif d'un colis : premiere tranche dont max_g >= poids ; au-dela de la derniere,
  // prix de la derniere + extra_per_kg par kilo (entame) supplementaire.
  function bracketPriceCents(zone, weight) {
    var b = (zone.brackets || []).slice().sort(function (x, y) { return x.max_g - y.max_g; });
    if (!b.length) return null;
    for (var i = 0; i < b.length; i++) if (weight <= b[i].max_g) return cents(b[i].price);
    var last = b[b.length - 1];
    var extra = Math.ceil((weight - last.max_g) / 1000) * cents(zone.extra_per_kg || 0);
    return cents(last.price) + extra;
  }

  function quoteShipping(config, cart, country) {
    if (!config || !Array.isArray(config.zones)) return { ok: false, error: 'bad_config', message: 'Grille invalide.' };
    var items = ((cart && cart.items) || []).filter(function (it) { return it && it.slug; });
    if (!items.length) return { ok: false, error: 'empty_cart', message: 'Panier vide.' };
    var zone = findZone(config, country);
    if (!zone) return { ok: false, error: 'country_not_served', message: 'Pays non livré : ' + country };

    var parcels = pack(config, items).map(function (p) {
      var priceCents = bracketPriceCents(zone, p.weight_g);
      return {
        items: p.units.map(function (u) { return { slug: u.slug, weight_g: u.weight_g, size: u.size }; }),
        pieces: p.units.length, weight_g: p.weight_g,
        priceCents: priceCents, price: priceCents / 100,
      };
    });
    if (parcels.some(function (p) { return p.priceCents === null; })) {
      return { ok: false, error: 'bad_config', message: 'Zone sans tranche de poids : ' + zone.id };
    }
    var totalCents = parcels.reduce(function (s, p) { return s + p.priceCents; }, 0);

    var fs = config.free_shipping || {};
    var free = false;
    if (fs.enabled && Number(cart.subtotal) >= Number(fs.threshold)) {
      var only = fs.zones;
      free = !only || !only.length || only.indexOf(zone.id) !== -1;
    }
    if (free) totalCents = 0;
    return {
      ok: true, zone: zone.id, zoneName: zone.name || zone.id, currency: config.currency || 'EUR',
      free: free, parcels: parcels, totalCents: totalCents, total: totalCents / 100,
    };
  }

  return { quoteShipping: quoteShipping, pack: pack, findZone: findZone, pieceInfo: pieceInfo };
}));
