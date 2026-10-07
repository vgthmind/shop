/* Page admin « Pièces » : logique pure (sans réseau, sans DOM), testée dans tests/pieces.test.mjs.
   Champs écrits sur data/products/<slug>.json :
     weight_g          poids de la pièce SANS emballage, en grammes (absent = pas de poids)
     mode              'colis' (défaut) ou 'lettre'
     alone             true = « part seule » (son propre colis)
     weight_estimated  true = poids pris par défaut selon le type de pièce, à confirmer (retiré dès que le poids est saisi) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VGPieces = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ZONES = [{ id: 'FR', label: 'France' }, { id: 'A', label: 'UE' }, { id: 'C', label: 'Reste du monde' }];

  function weightOf(p) { var w = Math.floor(Number(p && p.weight_g)); return isFinite(w) && w > 0 ? w : 0; }

  // 'missing' (pas de poids) | 'estimated' (poids par défaut du type) | 'ok'
  function weightState(p) {
    if (!weightOf(p)) return 'missing';
    return p.weight_estimated === true ? 'estimated' : 'ok';
  }

  function toItem(p) {
    return { slug: p.slug, qty: 1, weight_g: weightOf(p) || undefined, mode: p.mode === 'lettre' ? 'lettre' : 'colis', alone: p.alone === true };
  }

  // Ce que la page affiche pour une pièce : état du poids, ports par zone (FR / UE / reste du monde), conseil de mode.
  function describe(calc, config, p) {
    var state = weightState(p), out = { state: state, zones: [], advice: null };
    if (state === 'missing') return out;
    var item = toItem(p), byZone = calc.quoteByZone(config, item);
    ZONES.forEach(function (z) {
      var r = byZone.filter(function (x) { return x.zone === z.id; })[0];
      if (r) out.zones.push(Object.assign({ label: z.label }, r));
    });
    // Signal seulement quand l'AUTRE mode est strictement moins cher (France, hors « part seule » en lettre).
    var a = calc.modeAdvice(config, Object.assign({}, item, { mode: 'lettre' }));
    if (a && !item.alone) {
      if (item.mode === 'lettre' && a.colis_cheaper) out.advice = Object.assign({ better: 'colis' }, a);
      else if (item.mode === 'colis' && a.lettre_cost < a.colis_cost) out.advice = Object.assign({ better: 'lettre' }, a);
    }
    return out;
  }

  // Valide une saisie { weight_g, mode, alone } et renvoie { product, error }. Le poids vide retire le champ.
  function applyEdit(product, edit) {
    var p = Object.assign({}, product), raw = edit.weight_g;
    if (raw === '' || raw === null || raw === undefined) { delete p.weight_g; delete p.weight_estimated; }
    else {
      var w = Number(raw);
      if (!isFinite(w) || w <= 0 || Math.floor(w) !== w) return { error: 'Poids invalide (nombre entier de grammes, supérieur à 0).' };
      if (w !== weightOf(product)) delete p.weight_estimated; // poids retapé = confirmé
      p.weight_g = w;
    }
    if (edit.mode !== 'colis' && edit.mode !== 'lettre') return { error: 'Mode invalide (colis ou lettre).' };
    p.mode = edit.mode;
    p.alone = edit.alone === true;
    return { product: p };
  }

  return { ZONES: ZONES, weightOf: weightOf, weightState: weightState, describe: describe, applyEdit: applyEdit };
}));
