/* Page admin « Pièces » (grille + fiche) : logique pure (sans réseau, sans DOM), testée dans tests/fiche.test.mjs.
   Une fiche = data/products/<slug>.json. Tout ce que la fiche ne montre pas est gardé tel quel (on part de la fiche d'origine).
   Statuts : live (en ligne) · preview (masquée, page accessible par son adresse) · scheduled (masquée + publish_at) ·
   coming (« bientôt disponible », visible mais pas achetable) · archived (retirée du site). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./catalogue-core.js'), require('./piece-form.js'), require('./pieces-view.js'));
  else root.VGFiche = factory(root.VGCatalogue, root.VGPieceForm, root.VGPieces);
}(typeof self !== 'undefined' ? self : this, function (Cat, Form, View) {
  'use strict';

  var STATUSES = [
    { id: 'live', label: 'En ligne' },
    { id: 'preview', label: 'Masquée (aperçu, non listée)' },
    { id: 'scheduled', label: 'Programmée' },
    { id: 'coming', label: 'Bientôt disponible (visible, non achetable)' },
    { id: 'archived', label: 'Archivée (retirée du site)' }
  ];

  // ---------- description : le site stocke « anglais, ligne vide, français » dans un seul texte ----------
  function splitDescription(desc) {
    var t = String(desc || ''), parts = t.split(/\r?\n\r?\n/);
    if (parts.length === 2 && parts[0].trim() && parts[1].trim()) return { en: parts[0].trim(), fr: parts[1].trim(), clean: true };
    return { en: t, fr: '', clean: parts.length < 2 }; // forme inhabituelle : tout dans la 1re case, rien n'est réécrit tant qu'on n'y touche pas
  }

  // ---------- statut ----------
  function statusOf(p, now) { var s = Cat.state(p, now); return s === 'preview' ? 'preview' : s; }

  // Applique un statut à une fiche (copie). publishAtIso : date ISO UTC, seulement pour « scheduled ».
  function applyStatus(p, status, publishAtIso) {
    var q = Object.assign({}, p);
    delete q.archived; delete q.coming_soon;
    if (status === 'live') { delete q.hidden; delete q.publish_at; }
    else if (status === 'coming') { delete q.hidden; delete q.publish_at; q.coming_soon = true; }
    else if (status === 'preview') { q.hidden = true; delete q.publish_at; }
    else if (status === 'scheduled') { q.hidden = true; q.publish_at = publishAtIso; }
    else if (status === 'archived') { q.archived = true; }
    return q;
  }

  // ---------- images ----------
  function moveItem(list, i, dir) {
    var j = i + dir, out = list.slice();
    if (i < 0 || i >= out.length || j < 0 || j >= out.length) return out;
    var t = out[i]; out[i] = out[j]; out[j] = t; return out;
  }
  function removeItem(list, i) { var out = list.slice(); out.splice(i, 1); return out; }

  // ---------- fiche : lecture ----------
  // La saisie de la page, à partir d'une fiche enregistrée.
  function toForm(p, now) {
    var d = splitDescription(p.description), color = '';
    if (p.color_hex || p.color_name) {
      var c = Form.COLORS.filter(function (x) { return (x.name || x.id) === p.color_name; })[0];
      color = c ? c.id : 'autre';
    }
    return {
      name: p.name || '', name_en: p.name_en || '', slug: p.slug || '', price: p.price == null ? '' : String(p.price),
      desc_en: d.en, desc_fr: d.fr, categories: (p.categories || []).slice(), latest_drop: p.latest_drop === true,
      status: statusOf(p, now), publish_at: p.publish_at || '', unique: p.unique !== false,
      color: color, color_other: color === 'autre' ? (p.color_name || '') : '', color_hex: p.color_hex || '',
      reel_url: p.reel_url || '', weight_g: p.weight_g ? String(p.weight_g) : '', mode: p.mode === 'lettre' ? 'lettre' : 'colis', alone: p.alone === true,
      keywords: (p.keywords || []).join(', '), ships_intl: p.ships_intl !== false, stripe_payment_link: p.stripe_payment_link || '',
      images: (p.images || []).filter(function (u) { return typeof u === 'string'; })
    };
  }

  function parseKeywords(s) {
    return String(s || '').split(/[,;\n]/).map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
  }
  function parsePrice(v) {
    var n = Number(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.'));
    return isFinite(n) ? n : NaN;
  }

  // ---------- fiche : écriture ----------
  // base : fiche d'origine ({} pour une nouvelle). form : saisie (voir toForm). opts : { isNew, categoryPermalinks, existingSlugs,
  // photoCount (photos après modifications), position, now (ms) }. Renvoie { product } ou { error }.
  // `images` n'est pas touché ici : l'enregistrement (fiche-save.js) range les photos et écrit la liste finale.
  function buildPiece(base, form, opts) {
    opts = opts || {};
    var now = opts.now || Date.now(), isNew = opts.isNew === true;
    var name = String(form.name || '').trim();
    if (!name) return { error: 'Donne un nom à la pièce.' };
    var price = parsePrice(form.price);
    if (!isFinite(price) || price <= 0) return { error: 'Prix invalide (nombre supérieur à 0).' };
    price = Math.round(price * 100) / 100;

    var slug = base.slug;
    if (isNew) {
      slug = Form.slugify(form.slug || name);
      if (!slug) return { error: 'Nom (adresse) invalide.' };
      if ((opts.existingSlugs || []).indexOf(slug) !== -1) return { error: 'Une pièce « ' + slug + ' » existe déjà : change le nom.' };
    }

    var status = form.status || 'preview';
    var showable = status === 'live' || status === 'scheduled' || status === 'coming';
    var cats = (form.categories || []).filter(function (c) { return c !== 'all' && c !== 'latest-drop'; });
    var valid = opts.categoryPermalinks || cats;
    var badCat = cats.filter(function (c) { return valid.indexOf(c) === -1; });
    if (badCat.length) return { error: 'Catégorie inconnue : ' + badCat.join(', ') };
    if (showable && !cats.length) return { error: 'Choisis au moins une catégorie avant de mettre la pièce en ligne.' };

    var iso = null;
    if (status === 'scheduled') {
      var raw = String(form.publish_at || '').trim();
      iso = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(raw) ? raw : Cat.parisToIso(raw); // ISO UTC, ou heure de Paris « AAAA-MM-JJ HH:MM » (ou …THH:MM)
      if (!iso) return { error: 'Date de mise en ligne non comprise (exemple : 2026-11-06 18:00).' };
      var unchanged = base.publish_at && Date.parse(base.publish_at) === Date.parse(iso);
      if (!unchanged && Date.parse(iso) < now + 5 * 60 * 1000) return { error: 'Choisis une heure au moins 5 minutes dans le futur.' };
    }

    var en = String(form.desc_en || ''), fr = String(form.desc_fr || '');
    var original = splitDescription(base.description);
    var lf = function (t) { return String(t).replace(/\r\n/g, '\n'); }; // une zone de texte rend toujours des retours à la ligne « \n »
    var description = (lf(en) === lf(original.en) && lf(fr) === lf(original.fr) && base.description != null) ? base.description : Form.joinDescription(en, fr);
    if (showable && !String(description).trim()) return { error: 'Ajoute une description (anglais et/ou français) avant la mise en ligne.' };

    var reel = String(form.reel_url || '').trim(), re = View.reelError(reel);
    if (re) return { error: re };
    var stripe = String(form.stripe_payment_link || '').trim();

    var wRaw = form.weight_g;
    var hasWeight = !(wRaw === '' || wRaw === null || wRaw === undefined);
    if (!hasWeight && showable && isNew) return { error: 'Poids manquant : sans lui, les frais de port ne se calculent pas (section Livraison).' };
    if (showable && !(opts.photoCount > 0)) return { error: 'Ajoute au moins une photo avant la mise en ligne.' };

    var p = Object.assign({}, base);
    p.name = name; p.price = price; p.slug = slug; p.description = description;
    if (String(form.name_en || '').trim() && String(form.name_en).trim() !== name) p.name_en = String(form.name_en).trim(); else delete p.name_en;
    p.categories = cats;
    p.latest_drop = form.latest_drop === true;
    p.unique = form.unique !== false;
    var kw = parseKeywords(form.keywords); if (kw.length) p.keywords = kw; else delete p.keywords;
    if (reel) p.reel_url = reel; else delete p.reel_url;
    if (stripe || 'stripe_payment_link' in base || isNew) p.stripe_payment_link = stripe;
    if (form.ships_intl === false) p.ships_intl = false; else if ('ships_intl' in base) p.ships_intl = true;

    if (form.color === 'autre') {
      var other = String(form.color_other || '').trim();
      if (!other) return { error: 'Couleur « autre » : écris laquelle.' };
      p.color_name = other; p.color_hex = /^#[0-9a-f]{6}$/i.test(form.color_hex || '') ? form.color_hex.toLowerCase() : '#9a9a9a';
    } else if (form.color) {
      var c = Form.colorById(form.color);
      if (!c) return { error: 'Couleur inconnue.' };
      var keep = base.color_name === (c.name || c.id) && /^#[0-9a-f]{6}$/i.test(base.color_hex || ''); // couleur inchangée : pastille d'origine gardée
      p.color_name = c.name || c.id; p.color_hex = keep ? base.color_hex : c.hex;
    } else { delete p.color_name; delete p.color_hex; }

    var w = View.applyEdit(p, { weight_g: hasWeight ? Number(wRaw) : '', mode: form.mode || 'colis', alone: form.alone === true });
    if (w.error) return { error: w.error };
    p = w.product;

    if (isNew) {
      p.in_stock = true; p.position = opts.position == null ? 0 : opts.position;
      p.created_at = new Date(now).toISOString();
      var q = Number(form.stock);
      p.quantity = isFinite(q) && q >= 0 && Math.floor(q) === q ? q : 1;
    }
    p = applyStatus(p, status, iso);
    return { product: p };
  }

  // ---------- pièce rapide : une pièce « brouillon » copiée sur une pièce modèle ----------
  // model : fiche modèle (ou null). input : { name, price }. Renvoie { product } ou { error }.
  function quickPiece(model, input, opts) {
    opts = opts || {};
    model = model || {};
    var name = String(input.name || '').trim();
    if (!name) return { error: 'Donne un nom à la pièce.' };
    var price = parsePrice(input.price != null && input.price !== '' ? input.price : model.price);
    if (!isFinite(price) || price <= 0) return { error: 'Prix invalide (nombre supérieur à 0).' };
    var slug = Form.slugify(name);
    if (!slug) return { error: 'Nom invalide.' };
    var taken = opts.existingSlugs || [], n = slug, i = 2;
    while (taken.indexOf(n) !== -1) n = slug + '-' + (i++);
    var p = {
      name: name, slug: n, price: Math.round(price * 100) / 100, description: '', images: [],
      categories: (model.categories || []).slice(), latest_drop: false, unique: true, in_stock: true, hidden: true,
      position: opts.position == null ? 0 : opts.position, created_at: new Date(opts.now || Date.now()).toISOString(),
      stripe_payment_link: '', quantity: 1, mode: model.mode === 'lettre' ? 'lettre' : 'colis', alone: model.alone === true
    };
    if (model.weight_g) { p.weight_g = model.weight_g; p.weight_estimated = true; } // repris du modèle : à confirmer
    return { product: p };
  }

  // ---------- drop : plusieurs pièces programmées à la même minute ----------
  // slugs : pièces cochées. Renvoie { changes: { slug: fiche } } ou { error }.
  function planDrop(pieces, slugs, iso, now) {
    now = now || Date.now();
    if (!slugs.length) return { error: 'Coche au moins une pièce.' };
    if (!iso || isNaN(Date.parse(iso))) return { error: 'Choisis la date et l\'heure du drop.' };
    if (Date.parse(iso) < now + 5 * 60 * 1000) return { error: 'Choisis une heure au moins 5 minutes dans le futur.' };
    var by = {}; pieces.forEach(function (p) { by[p.slug] = p; });
    var changes = {}, problems = [];
    slugs.forEach(function (s) {
      var p = by[s];
      if (!p) { problems.push(s + ' : introuvable'); return; }
      if (!(p.categories || []).length) { problems.push((p.name || s) + ' : aucune catégorie'); return; }
      if (!(p.images || []).length) { problems.push((p.name || s) + ' : aucune photo'); return; }
      changes[s] = applyStatus(p, 'scheduled', iso);
    });
    if (problems.length) return { error: 'À corriger avant de programmer : ' + problems.join(' · ') + '.' };
    return { changes: changes };
  }

  function eur(n) { return (Math.round(n * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: Math.round(n * 100) % 100 ? 2 : 0, maximumFractionDigits: 2 }) + ' €'; }

  // Texte Instagram prêt à copier. whenLabel : « samedi 18 octobre à 18 h ».
  function dropText(pieces, siteUrl, whenLabel) {
    var base = String(siteUrl || '').replace(/\/$/, '');
    var lines = ['NOUVEAU DROP — ' + whenLabel, ''];
    pieces.forEach(function (p) { lines.push('• ' + (p.name || p.slug) + ' — ' + eur(p.price)); });
    lines.push('', 'Disponible sur ' + base.replace(/^https?:\/\//, ''));
    pieces.forEach(function (p) { lines.push(base + '/product/' + encodeURIComponent(p.slug)); });
    return lines.join('\n');
  }

  // Raccourcis d'heure (heure de Paris) : « Ce soir 18 h », « Demain 18 h », « Samedi 18 h ». Texte « AAAA-MM-JJ HH:MM ».
  function parisDate(ms) {
    var o = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' })
      .formatToParts(new Date(ms)).forEach(function (x) { o[x.type] = x.value; });
    return o;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function quickDates(now) {
    now = now || Date.now();
    var out = [], base = Date.UTC(+parisDate(now).year, +parisDate(now).month - 1, +parisDate(now).day), day;
    function at(offset) { var d = new Date(base + offset * 86400000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' 18:00'; }
    function future(text) { var iso = Cat.parisToIso(text); return iso && Date.parse(iso) > now + 5 * 60 * 1000; }
    if (future(at(0))) out.push({ label: 'Ce soir 18 h', text: at(0) });
    if (future(at(1))) out.push({ label: 'Demain 18 h', text: at(1) });
    var wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parisDate(now).weekday);
    for (day = 0; day < 8; day++) if ((wd + day) % 7 === 6 && future(at(day)) && out.every(function (o) { return o.text !== at(day); })) { out.push({ label: 'Samedi 18 h', text: at(day) }); break; }
    return out;
  }

  // Pièces sans poids (les pièces du catalogue public, products.json, portent weight_g quand il est connu).
  function missingWeight(list) { return (list || []).filter(function (p) { return !View.weightOf(p); }); }

  return {
    STATUSES: STATUSES, splitDescription: splitDescription, statusOf: statusOf, applyStatus: applyStatus, moveItem: moveItem, removeItem: removeItem,
    toForm: toForm, buildPiece: buildPiece, quickPiece: quickPiece, planDrop: planDrop, dropText: dropText, quickDates: quickDates,
    missingWeight: missingWeight, parsePrice: parsePrice, parseKeywords: parseKeywords
  };
}));
