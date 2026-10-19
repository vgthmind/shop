/* Sélecteur de pays du panier — partie PURE (textes FR/EN, prix, liste de pays),
   sans DOM ni réseau, testée par `npm test`. Utilisée par vg-shipping-picker.js.
   Dépend de VGShipping (admin/shipping-calc.js) : passé en paramètre `calc`. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VGShippingView = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Pays acceptés par Stripe pour une adresse de livraison (même liste que le Worker).
  var STRIPE = ('AD AE AF AG AI AL AM AO AR AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ '
    + 'CA CD CF CG CH CI CK CL CM CN CO CR CV CW CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FK FO FR GA GB GD GE '
    + 'GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IS IT JE JM JO JP KE KG KH KI '
    + 'KM KN KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MK ML MM MN MO MQ MR MS MT MU MV MW MX MY '
    + 'MZ NA NC NE NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PY QA RE RO RS RU RW SA SB SC SD SE '
    + 'SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ '
    + 'VA VC VE VG VN VU WF WS YE YT ZA ZM ZW').split(' ');
  var FIRST = ['FR', 'CA', 'BE', 'CH', 'LU', 'DE', 'GB', 'US'];
  // Outre-mer (Colissimo Outre-mer au vrai tarif) : des taxes locales peuvent être demandées à la réception.
  var OUTRE_MER = ['GP', 'MQ', 'GF', 'RE', 'YT', 'PM', 'MF', 'BL', 'NC', 'PF', 'WF', 'TF'];

  var TEXT = {
    fr: {
      country: 'Pays de livraison', shipping: 'Livraison', free: 'offerte', parcel: 'colis', parcels: 'colis',
      choose: 'Choisis ton pays', loading: 'Calcul…',
      notServed: function (n) { return 'Je ne livre pas encore en ' + n + '. Choisis un autre pays, ou écris-moi en DM Instagram : on trouvera une solution.'; },
      franceOnly: 'Une pièce de ton panier part uniquement en France. Retire-la pour livrer à l’étranger.',
      error: 'Frais de livraison indisponibles pour le moment, réessaie dans un instant.',
      note: 'Le montant définitif est confirmé au paiement.',
      freeFr: 'Livraison offerte en France dès 60 €.',
      customs: 'Des taxes locales (octroi de mer) peuvent être demandées à la réception du colis.'
    },
    en: {
      country: 'Shipping country', shipping: 'Shipping', free: 'free', parcel: 'parcel', parcels: 'parcels',
      choose: 'Choose your country', loading: 'Calculating…',
      notServed: function (n) { return 'I don\'t ship to ' + n + ' yet. Pick another country, or DM me on Instagram and we\'ll work something out.'; },
      franceOnly: 'One piece in your cart ships to France only. Remove it to ship abroad.',
      error: 'Shipping cost unavailable right now, please try again in a moment.',
      note: 'The final amount is confirmed at payment.',
      freeFr: 'Free shipping in France from €60.',
      customs: 'Local taxes (octroi de mer) may be charged on delivery.'
    }
  };

  // Phrase sous le prix de livraison ; pour l'outre-mer, la mention de l'octroi de mer s'y ajoute.
  function noteFor(country, lang) {
    var t = text(lang);
    var cc = String(country || '').toUpperCase();
    if (cc === 'FR') return t.note + ' ' + t.freeFr;
    return OUTRE_MER.indexOf(cc) !== -1 ? t.note + ' ' + t.customs : t.note;
  }

  function langOf(l) { return /^fr/i.test(String(l || '')) ? 'fr' : 'en'; }
  function text(lang) { return TEXT[langOf(lang)]; }
  // 15,00 € en français, €15.00 en anglais (même règle que assets/vg-lang.js).
  function money(n, lang) {
    var v = (Math.round((n || 0) * 100) / 100).toFixed(2);
    return langOf(lang) === 'fr' ? v.replace('.', ',') + ' €' : '€' + v;
  }

  function countryName(code, lang) {
    try {
      var n = new Intl.DisplayNames([langOf(lang)], { type: 'region' }).of(code);
      return n && n !== code ? n : '';
    } catch (e) { return ''; }
  }

  // Liste triée : pays habituels d'abord, puis ordre alphabétique de la langue.
  function countryList(lang) {
    var all = STRIPE.map(function (c) { return { code: c, name: countryName(c, lang) }; }).filter(function (c) { return c.name; });
    var first = FIRST.map(function (c) { return all.filter(function (x) { return x.code === c; })[0]; }).filter(Boolean);
    var rest = all.filter(function (c) { return FIRST.indexOf(c.code) === -1; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, langOf(lang)); });
    return first.concat(rest);
  }

  // État d'affichage du panier pour un pays. `cart` = [{slug, price, qty}] (format du panier).
  // Renvoie { state: 'choose'|'loading'|'ok'|'not_served'|'error', blocked, shipping, subtotal, total, message, summary }
  function buildView(calc, config, cart, country, lang) {
    var t = text(lang);
    var items = (cart || []).map(function (it) { return { slug: it.slug, qty: Math.max(1, Math.floor(it.qty || 1)) }; });
    var subtotal = (cart || []).reduce(function (s, it) { return s + (it.price || 0) * Math.max(1, Math.floor(it.qty || 1)); }, 0);
    var base = { subtotal: subtotal, shipping: 0, total: subtotal, message: '', summary: '' };
    if (!country) return Object.assign(base, { state: 'choose', blocked: true, message: t.choose });
    if (!config) return Object.assign(base, { state: 'loading', blocked: true, message: t.loading });
    if (!items.length) return Object.assign(base, { state: 'ok', blocked: false });
    var q = calc.quoteShipping(config, { items: items, subtotal: subtotal }, country);
    if (!q.ok && q.error === 'country_not_served') {
      return Object.assign(base, { state: 'not_served', blocked: true, message: t.notServed(countryName(country, lang) || country) });
    }
    if (!q.ok) return Object.assign(base, { state: 'error', blocked: true, message: t.error });
    var n = q.parcels.length;
    var summary = t.shipping + ' : ' + (q.free || q.total === 0 ? t.free : money(q.total, lang)) + (n > 1 ? ' (' + n + ' ' + t.parcels + ')' : '');
    return Object.assign(base, { state: 'ok', blocked: false, shipping: q.total, total: Math.round((subtotal + q.total) * 100) / 100, free: q.free, parcels: n, summary: summary, message: '', note: noteFor(country, lang) });
  }

  // Même état d'affichage, à partir de la réponse du Worker (POST /shipping/quote) : le prix affiché est celui de Stripe.
  // quote : null (en attente) | { ok:true, total } | { ok:false, error }.
  function fromQuote(quote, subtotal, country, lang) {
    var t = text(lang), base = { subtotal: subtotal, shipping: 0, total: subtotal, message: '', summary: '' };
    if (!country) return Object.assign(base, { state: 'choose', blocked: true, message: t.choose });
    if (!quote) return Object.assign(base, { state: 'loading', blocked: true, message: t.loading });
    if (quote.ok) {
      var ship = Number(quote.total) || 0;
      return Object.assign(base, { state: 'ok', blocked: false, shipping: ship, total: Math.round((subtotal + ship) * 100) / 100, free: ship === 0, summary: t.shipping + ' : ' + (ship === 0 ? t.free : money(ship, lang)), note: noteFor(country, lang) });
    }
    if (quote.error === 'country_not_served') return Object.assign(base, { state: 'not_served', blocked: true, message: t.notServed(countryName(country, lang) || country) });
    if (quote.error === 'france_uniquement') return Object.assign(base, { state: 'not_served', blocked: true, message: t.franceOnly });
    if (quote.error === 'country_required') return Object.assign(base, { state: 'choose', blocked: true, message: t.choose });
    return Object.assign(base, { state: 'error', blocked: true, message: t.error });
  }

  return { noteFor: noteFor, OUTRE_MER: OUTRE_MER, fromQuote: fromQuote, buildView: buildView, countryList: countryList, countryName: countryName, text: text, money: money, langOf: langOf, STRIPE: STRIPE };
}));
