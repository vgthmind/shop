/* Assistant « Nouvelle pièce » : logique pure de l'étape Fiche (sans réseau, sans DOM), testée dans tests/piece-form.test.mjs.
   Champs écrits sur data/products/<slug>.json en plus de ceux du lot 2 (poids, mode, part seule) :
     color_name  une des couleurs de COLORS, ou un texte libre (« autre »)
     color_hex   pastille affichée sur le site (#rrggbb)
     reel_url    lien Instagram ou YouTube (pas de fichier envoyé)
     unique      false = pas de badge « UNIQUE PIECE » (coché d'office si la quantité de départ est 1)
     quantity    stock de départ (le stock réel vit dans le Worker) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./pieces-view.js'));
  else root.VGPieceForm = factory(root.VGPieces);
}(typeof self !== 'undefined' ? self : this, function (View) {
  'use strict';

  var COLORS = [
    { id: 'noir', label: 'Noir', hex: '#1a1a1a', words: ['noir', 'black'] },
    { id: 'blanc', label: 'Blanc', hex: '#f2f2f2', words: ['blanc', 'white'] },
    { id: 'blanc-casse', name: 'blanc cassé', label: 'Blanc cassé', hex: '#e9e3d6', words: ['blanc casse', 'off white', 'off-white', 'ecru'] },
    { id: 'gris', label: 'Gris', hex: '#8a8a8a', words: ['gris', 'grey', 'gray'] },
    { id: 'beige', label: 'Beige', hex: '#c19a6b', words: ['beige', 'cream', 'creme'] },
    { id: 'bleu', label: 'Bleu', hex: '#3d5a75', words: ['bleu', 'blue', 'denim', 'marine', 'navy'] },
    { id: 'rouge', label: 'Rouge', hex: '#b3315c', words: ['rouge', 'red', 'framboise', 'bordeaux'] },
    { id: 'vert', label: 'Vert', hex: '#7a7a52', words: ['vert', 'green', 'kaki', 'khaki'] },
    { id: 'multicolore', label: 'Multicolore', hex: '#c8a2c8', words: ['multicolore', 'multicolor', 'multicolour', 'multi-color'] }
  ];
  var DEFAULT_OTHER_HEX = '#9a9a9a';

  function colorById(id) { return COLORS.filter(function (c) { return c.id === id; })[0] || null; }

  function slugify(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9_]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function stripAccents(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  // Couleur d'après la description (premier mot trouvé, dans l'ordre de la phrase), ou null.
  function colorFromText(text) {
    var t = ' ' + stripAccents(text).replace(/[^a-z0-9]+/g, ' ') + ' ', best = null, at = 1e9, bestLen = 0;
    COLORS.forEach(function (c) {
      c.words.forEach(function (w) {
        var k = t.indexOf(' ' + stripAccents(w).replace(/[^a-z0-9]+/g, ' ') + ' ');
        if (k !== -1 && (k < at || (k === at && w.length > bestLen))) { at = k; best = c.id; bestLen = w.length; }
      });
    });
    return best;
  }

  // Couleur moyenne des pixels opaques d'une image { data, width, height } (RGBA), ou null si rien d'opaque.
  function averageRgb(img) {
    var d = img.data, r = 0, g = 0, b = 0, n = 0, i;
    for (i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : null;
  }

  function hexToRgb(h) { return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }); }

  // Liste courte la plus proche d'une couleur RGB (hors multicolore, qu'on ne devine pas d'un seul pixel moyen).
  function nearestColor(rgb) {
    var best = null, dist = Infinity;
    COLORS.forEach(function (c) {
      if (c.id === 'multicolore') return;
      var h = hexToRgb(c.hex), e = (h[0] - rgb[0]) * (h[0] - rgb[0]) + (h[1] - rgb[1]) * (h[1] - rgb[1]) + (h[2] - rgb[2]) * (h[2] - rgb[2]);
      if (e < dist) { dist = e; best = c.id; }
    });
    return best;
  }

  // Suggestion : le texte (description) prime sur la photo, car il nomme la couleur sans ambiguïté.
  // Renvoie { id, source: 'description' | 'photo' } ou null.
  function suggestColor(opts) {
    var byText = colorFromText(opts && opts.description);
    if (byText) return { id: byText, source: 'description' };
    var rgb = opts && opts.image ? averageRgb(opts.image) : null;
    return rgb ? { id: nearestColor(rgb), source: 'photo' } : null;
  }

  // Badge « UNIQUE PIECE » : coché d'office quand la quantité de départ est 1 ; l'admin peut le décocher.
  function defaultUnique(quantity) { return Number(quantity) === 1; }

  // Lien de reel accepté : Instagram ou YouTube, en https. Vide = pas de reel.
  var reelError = View.reelError;

  function joinDescription(en, fr) {
    en = String(en || '').trim(); fr = String(fr || '').trim();
    return en && fr ? en + '\r\n\r\n' + fr : en || fr;
  }

  // form : { name, slug, price, quantity, unique, categories[], latest_drop, color, color_other, description_en,
  //          description_fr, reel_url, size, weight_g, mode, alone }
  // categoryPermalinks : permaliens valides (data/categories.json). Renvoie { product } ou { error }.
  function buildPiece(form, categoryPermalinks, now) {
    var name = String(form.name || '').trim();
    if (!name) return { error: 'Donne un nom à la pièce.' };
    var slug = slugify(form.slug || name);
    if (!slug) return { error: 'Nom (slug) invalide.' };
    var price = Number(form.price);
    if (!isFinite(price) || price <= 0) return { error: 'Prix invalide (nombre supérieur à 0).' };
    var quantity = Number(form.quantity);
    if (!isFinite(quantity) || Math.floor(quantity) !== quantity || quantity < 1) return { error: 'Quantité de départ invalide (entier, au moins 1).' };
    var cats = (form.categories || []).filter(function (c) { return c !== 'all' && c !== 'latest-drop'; });
    if (!cats.length) return { error: 'Choisis au moins une catégorie.' };
    var bad = cats.filter(function (c) { return categoryPermalinks.indexOf(c) === -1; });
    if (bad.length) return { error: 'Catégorie inconnue : ' + bad.join(', ') };
    var description = joinDescription(form.description_en, form.description_fr);
    if (!description) return { error: 'Ajoute une description (anglais et/ou français).' };
    var reel = String(form.reel_url || '').trim(), re = reelError(reel);
    if (re) return { error: re };

    var color_name = '', color_hex = '';
    if (form.color === 'autre') {
      color_name = String(form.color_other || '').trim();
      if (!color_name) return { error: 'Couleur « autre » : écris laquelle.' };
      color_hex = /^#[0-9a-f]{6}$/i.test(form.color_hex || '') ? form.color_hex.toLowerCase() : DEFAULT_OTHER_HEX;
    } else if (form.color) {
      var c = colorById(form.color);
      if (!c) return { error: 'Couleur inconnue.' };
      color_name = c.name || c.id; color_hex = c.hex;
    }

    var base = {
      name: name, slug: slug, price: price, description: description, images: [],
      categories: cats, latest_drop: form.latest_drop === true, unique: form.unique !== false,
      in_stock: true, position: 0, created_at: now || new Date().toISOString(), stripe_payment_link: '',
      quantity: quantity
    };
    if (color_name) { base.color_name = color_name; base.color_hex = color_hex; }
    if (reel) base.reel_url = reel;
    if (form.draft === true) { base.draft = true; base.hidden = true; } // brouillon : aperçu par lien, pas achetable
    var size = String(form.size || '').trim().slice(0, 20);
    if (size) base.size = size;
    if (form.weight_g === "" || form.weight_g === null || form.weight_g === undefined) return { error: "Poids manquant (étape Ports)." };
    var w = View.applyEdit(base, { weight_g: form.weight_g, mode: form.mode || 'colis', alone: form.alone === true });
    if (w.error) return { error: w.error };
    return { product: w.product };
  }

  return { COLORS: COLORS, colorById: colorById, slugify: slugify, colorFromText: colorFromText, averageRgb: averageRgb, nearestColor: nearestColor, suggestColor: suggestColor, defaultUnique: defaultUnique, reelError: reelError, joinDescription: joinDescription, buildPiece: buildPiece };
}));
