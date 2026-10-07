/* Calcul des frais d'envoi (module pur, sans dependance, sans reseau).
   Meme fichier pour 3 usages :
     - Worker  : import { quoteShipping } from '../admin/shipping-calc.js'
     - Admin   : <script src="shipping-calc.js"> -> window.VGShipping
     - Tests   : node --test tests/
   Les sommes sont calculees en CENTIMES (entiers), jamais en flottants.

   Entree  : quoteShipping(config, cart, country)
     config  : voir admin/shipping-config.json
     cart    : { items: [{ slug, qty, weight_g?, mode?, alone? }], subtotal } ; subtotal en euros (prix des
               pieces, avant remise) ; sert seulement a la livraison offerte.
               weight_g = poids de la piece SANS emballage (g) ; mode = 'colis' (defaut) ou 'lettre' ;
               alone = true : la piece part SEULE (son propre colis). Si absents, lus dans config.items[slug].
     country : code pays ISO a 2 lettres (« FR », « CA »…)

   Colis reels (cout La Poste) :
     - piece « part seule » = 1 colis : poids + carton (packaging.carton_g) ;
     - pieces « peut partager » = rangees ensemble, poids additionnes + UN carton par colis ; nouveau colis
       si le poids max de la zone est depasse ;
     - lettre suivie : seulement si le pays est desservi en lettre (France), si TOUTES les pieces du panier sont
       en mode lettre et tiennent dans UNE lettre (nombre max de pieces, poids max, enveloppe incluse) ;
       sinon tout part en colis ;
     - la tranche s'applique telle quelle : 1re tranche dont max_g >= poids (pas de moyenne) ;
     - une zone « enabled: false » et les « blocked_countries » ne sont pas livres ;
     - piece sans poids : erreur « missing_weight » (jamais de poids invente) ; quoteOrFallback() retombe alors sur
       le port « historique » de la fiche (shipping_fr / shipping_intl), comme le site actuel, sans jamais renvoyer 0 € par erreur.

   Prix paye par le client (customer_pricing, par palier de pays) :
     - colis_free : livraison offerte (port integre au prix des pieces) ;
     - lettre_flat : forfait pour une lettre ;
     - first_flat : forfait pour le 1er colis (le plus lourd) ; basis « per_order » : les colis en plus coutent
       leur vrai tarif ; basis « per_parcel » : chaque colis paye le forfait.
   Sortie  : { ok:true, zone, tier, basis, cost (euros, vrai tarif La Poste), costCents, total (euros, paye
               par le client), totalCents, gap (euros, total - cost : > 0 gagne, < 0 perdu), gapCents, free,
               parcels:[{ kind:'colis'|'lettre', items:[{slug,weight_g}], pieces, goods_g, weight_g, priceCents,
               price, paidCents, paid }] }
          ou { ok:false, error:'country_not_served'|'empty_cart'|'bad_config'|'missing_weight'|'too_heavy', message } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VGShipping = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function cents(euros) { return Math.round(Number(euros || 0) * 100); }
  function toInt(v, d) { v = Math.floor(Number(v)); return isFinite(v) && v > 0 ? v : d; }
  function grams(v) { v = Math.floor(Number(v)); return isFinite(v) && v > 0 ? v : 0; }

  // Poids / mode / « part seule » d'une piece : valeur donnee avec le panier, sinon config.items[slug].
  function pieceInfo(config, it) {
    if (typeof it === 'string') it = { slug: it };
    var meta = (config.items && config.items[it.slug]) || {};
    var pick = function (k) { return it[k] !== undefined && it[k] !== null ? it[k] : meta[k]; };
    return {
      slug: it.slug, weight_g: toInt(pick('weight_g'), 0),
      mode: pick('mode') === 'lettre' ? 'lettre' : 'colis', alone: pick('alone') === true || pick('alone') === 1,
    };
  }

  function unitsOf(config, items) {
    var units = [];
    items.forEach(function (it) {
      var info = pieceInfo(config, it);
      for (var i = 0; i < Math.max(1, toInt(it.qty, 1)); i++) units.push(info);
    });
    return units;
  }

  // Range les unites « premier colis qui peut encore la prendre » (poids max, nombre de pieces max),
  // des plus lourdes aux plus legeres. tare_g = emballage, compte UNE fois par colis, dans la limite.
  function packUnits(limits, units) {
    var maxPieces = toInt(limits.max_pieces, 1000);
    var maxWeight = toInt(limits.max_weight_g, 0); // 0 = pas de limite
    var tare = grams(limits.tare_g);
    var sorted = units.slice().sort(function (a, b) { return b.weight_g - a.weight_g; });
    var parcels = [];
    sorted.forEach(function (u) {
      var target = null;
      for (var i = 0; i < parcels.length; i++) {
        var p = parcels[i];
        if (p.units.length + 1 <= maxPieces && (!maxWeight || p.goods + u.weight_g + tare <= maxWeight)) { target = p; break; }
      }
      if (!target) { target = { units: [], goods: 0 }; parcels.push(target); }
      target.units.push(u); target.goods += u.weight_g;
    });
    parcels.forEach(function (p) { p.weight_g = p.goods + tare; });
    return parcels;
  }

  // Un pays cite explicitement gagne toujours (meme si sa zone est desactivee : il ne retombe
  // PAS dans « reste du monde »). Sinon la zone « * ». null = pays non livre.
  function findIn(list, country) {
    var c = String(country || '').toUpperCase(), star = null;
    for (var i = 0; i < list.length; i++) {
      var cs = list[i].countries || [];
      if (cs.indexOf(c) !== -1) return list[i];
      if (cs.indexOf('*') !== -1) star = list[i];
    }
    return star;
  }
  function findZone(config, country) { return findIn(config.zones || [], country); }
  function findTier(config, country) { return findIn((config.customer_pricing && config.customer_pricing.tiers) || [], country); }

  // Premiere tranche dont max_g >= poids ; null si trop lourd pour la derniere.
  function bracketPriceCents(zone, weight) {
    var b = (zone.brackets || []).slice().sort(function (x, y) { return x.max_g - y.max_g; });
    for (var i = 0; i < b.length; i++) if (weight <= b[i].max_g) return cents(b[i].price);
    return null;
  }

  function pkg(config) {
    var p = config.packaging || {};
    return { carton_g: grams(p.carton_g), envelope_g: grams(p.envelope_g) };
  }

  function buildParcel(kind, p, priceCents) {
    return {
      kind: kind, items: p.units.map(function (u) { return { slug: u.slug, weight_g: u.weight_g }; }),
      pieces: p.units.length, goods_g: p.goods, weight_g: p.weight_g, priceCents: priceCents, price: priceCents / 100,
    };
  }

  // Colis reels : pieces « seules » = un colis chacune ; les autres rangees ensemble.
  function colisParcels(config, zone, units) {
    var carton = pkg(config).carton_g, maxW = toInt(zone.max_weight_g, 0);
    var packed = units.filter(function (u) { return u.alone; }).map(function (u) {
      return { units: [u], goods: u.weight_g, weight_g: u.weight_g + carton };
    });
    packed = packed.concat(packUnits({ max_weight_g: maxW, tare_g: carton }, units.filter(function (u) { return !u.alone; })));
    var out = [];
    for (var i = 0; i < packed.length; i++) {
      var pr = (!maxW || packed[i].weight_g <= maxW) ? bracketPriceCents(zone, packed[i].weight_g) : null;
      if (pr === null) return { error: 'too_heavy', weight_g: packed[i].weight_g };
      out.push(buildParcel('colis', packed[i], pr));
    }
    return { parcels: out };
  }

  // Une lettre : uniquement si tout le panier tient dans UNE lettre. null sinon.
  function lettreParcel(config, country, units) {
    var l = config.lettre;
    if (!l || !l.enabled || !Array.isArray(l.brackets) || !l.brackets.length) return null;
    if ((l.countries || []).indexOf(String(country || '').toUpperCase()) === -1) return null;
    if (!units.every(function (u) { return u.mode === 'lettre'; })) return null;
    var packed = packUnits({ max_pieces: l.max_pieces, max_weight_g: l.max_weight_g, tare_g: pkg(config).envelope_g }, units);
    if (packed.length !== 1) return null;
    var pr = bracketPriceCents(l, packed[0].weight_g);
    return pr === null ? null : buildParcel('lettre', packed[0], pr);
  }

  // Ce que paie le client, colis par colis (centimes). Le 1er colis = le plus lourd.
  function customerCents(config, tier, parcels) {
    if (!tier) return parcels.map(function (p) { return p.priceCents; }); // pas de palier : tarif reel
    var basis = (config.customer_pricing && config.customer_pricing.basis) === 'per_parcel' ? 'per_parcel' : 'per_order';
    var paid = parcels.map(function () { return 0; });
    parcels.forEach(function (p, i) { // parcels est deja trie du plus lourd au plus leger
      if (p.kind === 'lettre') paid[i] = cents(tier.lettre_flat);
      else if (tier.colis_free) paid[i] = 0;
      else if (basis === 'per_parcel' || i === 0) paid[i] = cents(tier.first_flat);
      else paid[i] = p.priceCents;
    });
    return paid;
  }

  function quoteShipping(config, cart, country) {
    if (!config || !Array.isArray(config.zones)) return { ok: false, error: 'bad_config', message: 'Grille invalide.' };
    var items = ((cart && cart.items) || []).filter(function (it) { return it && it.slug; });
    if (!items.length) return { ok: false, error: 'empty_cart', message: 'Panier vide.' };
    var blocked = (config.blocked_countries || []).map(function (c) { return String(c).toUpperCase(); });
    var zone = blocked.indexOf(String(country || '').toUpperCase()) !== -1 ? null : findZone(config, country);
    if (!zone || zone.enabled === false) return { ok: false, error: 'country_not_served', message: 'Pays non livré : ' + country };

    var units = unitsOf(config, items);
    var missing = [];
    units.forEach(function (u) { if (!u.weight_g && missing.indexOf(u.slug) === -1) missing.push(u.slug); });
    if (missing.length) return { ok: false, error: 'missing_weight', message: 'Poids manquant : ' + missing.join(', '), slugs: missing };

    var one = lettreParcel(config, country, units), parcels;
    if (one) parcels = [one];
    else {
      var all = colisParcels(config, zone, units);
      if (all.error) return { ok: false, error: 'too_heavy', message: 'Colis trop lourd pour la zone ' + zone.id + ' (' + all.weight_g + ' g).' };
      parcels = all.parcels;
    }
    parcels.sort(function (a, b) { return b.weight_g - a.weight_g; }); // 1er colis = le plus lourd

    var tier = findTier(config, country);
    var paid = customerCents(config, tier, parcels);
    var fs = config.free_shipping || {};
    var free = false;
    if (fs.enabled && Number(cart.subtotal) >= Number(fs.threshold)) {
      var only = fs.zones;
      free = !only || !only.length || only.indexOf(zone.id) !== -1;
    }
    if (free) paid = paid.map(function () { return 0; });
    parcels.forEach(function (p, i) { p.paidCents = paid[i]; p.paid = paid[i] / 100; });
    var costCents = parcels.reduce(function (s, p) { return s + p.priceCents; }, 0);
    var totalCents = paid.reduce(function (s, v) { return s + v; }, 0);
    return {
      ok: true, zone: zone.id, zoneName: zone.name || zone.id, tier: tier ? tier.id : null,
      basis: (config.customer_pricing && config.customer_pricing.basis) || 'per_order', currency: config.currency || 'EUR', free: free,
      parcels: parcels, costCents: costCents, cost: costCents / 100, totalCents: totalCents, total: totalCents / 100,
      gapCents: totalCents - costCents, gap: (totalCents - costCents) / 100,
    };
  }

  // Filet de securite tant que des pieces n'ont pas de poids : meme comportement que le site actuel
  // (le port le plus eleve des pieces du panier, France ou international). Utilise SEULEMENT si le
  // calcul normal repond « missing_weight » ; un pays refuse reste refuse. Jamais 0 € par erreur : si une
  // piece n'a pas non plus de port « historique », on renvoie l'erreur au lieu d'un port gratuit.
  // item.legacy = { fr: <EUR|null>, intl: <EUR|null> } (champs shipping_fr / shipping_intl de la fiche).
  function quoteOrFallback(config, cart, country) {
    var r = quoteShipping(config, cart, country);
    if (r.ok || r.error !== 'missing_weight') return r;
    var region = String(country || '').toUpperCase() === 'FR' ? 'fr' : 'intl', max = 0, bad = [];
    ((cart && cart.items) || []).forEach(function (it) {
      var v = it && it.legacy ? it.legacy[region] : null;
      if (v === null || v === undefined || !isFinite(Number(v)) || Number(v) <= 0) bad.push(it && it.slug);
      else max = Math.max(max, cents(v));
    });
    if (bad.length) return { ok: false, error: 'missing_weight', message: 'Poids et port manquants : ' + bad.join(', '), slugs: bad };
    var fs = config.free_shipping || {};
    var free = !!(fs.enabled && Number(cart.subtotal) >= Number(fs.threshold) && (!fs.zones || !fs.zones.length));
    return { ok: true, fallback: true, zone: null, tier: null, free: free, parcels: [], currency: config.currency || 'EUR',
      costCents: null, cost: null, gapCents: null, gap: null, totalCents: free ? 0 : max, total: free ? 0 : max / 100 };
  }

  // Une piece seule vers chaque zone livree (pour la fiche de la piece). item : { slug, weight_g, mode, alone }.
  // Pays d'essai : zone.sample_country, sinon le 1er pays cite, sinon « US ».
  // Renvoie [{ zone, name, country, ok, kind, cost, total, gap }]  (cost = La Poste, total = client, gap = total - cost).
  function quoteByZone(config, item) {
    var plain = Object.assign({}, config, { free_shipping: { enabled: false } });
    return (config.zones || []).filter(function (z) { return z.enabled !== false; }).map(function (z) {
      var country = z.sample_country || (z.countries || []).filter(function (c) { return c !== '*'; })[0] || 'US';
      var r = quoteShipping(plain, { items: [Object.assign({ qty: 1 }, item)], subtotal: 0 }, country);
      return r.ok
        ? { zone: z.id, name: z.name || z.id, country: country, ok: true, kind: r.parcels[0].kind, cost: r.cost, total: r.total, gap: r.gap }
        : { zone: z.id, name: z.name || z.id, country: country, ok: false, error: r.error, message: r.message };
    });
  }

  // Une piece en mode lettre : le colis (en France) serait-il moins cher ? A signaler dans l'admin.
  function modeAdvice(config, item) {
    if (!item || item.mode !== 'lettre') return null;
    var plain = Object.assign({}, config, { free_shipping: { enabled: false } });
    var as = function (mode) { return quoteShipping(plain, { items: [Object.assign({ qty: 1 }, item, { mode: mode })], subtotal: 0 }, 'FR'); };
    var l = as('lettre'), c = as('colis');
    if (!l.ok || !c.ok || l.parcels[0].kind !== 'lettre') return null;
    return { lettre_cost: l.cost, colis_cost: c.cost, colis_cheaper: c.costCents < l.costCents };
  }

  return { quoteShipping: quoteShipping, quoteOrFallback: quoteOrFallback, quoteByZone: quoteByZone, modeAdvice: modeAdvice, findZone: findZone, findTier: findTier, pieceInfo: pieceInfo };
}));
