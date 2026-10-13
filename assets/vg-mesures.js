/* Guide de mesure du formulaire « Proposer un projet » : catégories, mesures (termes du métier), schéma SVG.
   Croquis de mode à la main (8 têtes, androgyne, sans visage : trait de crayon irrégulier, hachures légères) ; par-dessus,
   les lignes de mesure nettes : pointillés (tours) ou flèches (longueurs) + numéro. window.VGMeasures.hl() met la mesure en évidence
   (trait plein, badge chromé, halo argenté flou) quand le client touche le champ. Mêmes clés/libellés côté Worker (requests-core.ts). */
(function () {
  'use strict';
  var IMG = (document.currentScript && document.currentScript.src ? document.currentScript.src.replace(/[^/]*$/, '') : '/assets/') + 'mesures/';
  var CATS = [['haut', 'Hoodie / jacket / top', 'Hoodie / veste / haut'], ['bas', 'Trousers / shorts', 'Pantalon / short'], ['cou', 'Neck gaiter', 'Cache-cou'], ['acc', 'Accessory', 'Accessoire']];
  // clé : [en, fr, aide en, aide fr, type] ; type : cm (nombre) ou txt
  var DEFS = {
    height: ['Height', 'Taille (cm)', 'Standing, feet together, from the floor to the top of the head.', 'Debout, pieds joints, du sol au sommet de la tête.', 'cm'],
    usual: ['Size you usually wear', 'Taille portée d’habitude', 'S, M, L… in the clothes that fit you well.', 'S, M, L… dans les vêtements qui te vont bien.', 'txt'],
    chest: ['Chest', 'Tour de poitrine', 'Around the chest at its fullest, tape flat under the arms.', 'Autour du torse, à l’endroit le plus fort, mètre bien à plat sous les bras.', 'cm'],
    waist: ['Waist', 'Tour de ceinture', 'Around the waist, at the narrowest point.', 'Autour de la taille, à l’endroit le plus creux.', 'cm'],
    hips: ['Hips', 'Tour de bassin', 'Around the hips at their fullest, tape flat.', 'Autour des hanches, à l’endroit le plus fort, mètre bien à plat.', 'cm'],
    arm: ['Arm length', 'Longueur de bras', 'From the shoulder tip down to the wrist, arm relaxed.', 'Du bout de l’épaule jusqu’au poignet, bras le long du corps.', 'cm'],
    shoulders: ['Back width', 'Carrure dos', 'Across the back, from one armhole crease to the other.', 'Dans le dos, d’un creux de bras à l’autre.', 'cm'],
    shl: ['Shoulder length', 'Longueur d’épaule', 'From the base of the neck to the shoulder tip.', 'De la base du cou jusqu’au bout de l’épaule.', 'cm'],
    back: ['Back waist length', 'Longueur taille dos', 'From the base of the neck (bony bump) down to the waist.', 'De la base du cou (l’os qui dépasse) jusqu’à la taille.', 'cm'],
    wrist: ['Wrist', 'Tour de poignet', 'Around the wrist, without squeezing.', 'Autour du poignet, sans serrer.', 'cm'],
    inseam: ['Inside leg', 'Longueur d’entrejambe', 'From the crotch down to the ankle, inside the leg.', 'De l’entrejambe jusqu’à la cheville, à l’intérieur de la jambe.', 'cm'],
    floor: ['Waist to floor', 'Hauteur taille à terre', 'From the waist down to the floor, along the side, feet flat.', 'De la taille jusqu’au sol, sur le côté, pieds à plat.', 'cm'],
    rise: ['Crotch depth', 'Hauteur de montant', 'From the waist down to the crotch, along the side.', 'De la taille jusqu’à l’entrejambe, sur le côté.', 'cm'],
    thigh: ['Thigh', 'Tour de cuisse', 'Around the top of the thigh, at its fullest.', 'Autour du haut de la cuisse, à l’endroit le plus fort.', 'cm'],
    calf: ['Calf', 'Tour de mollet', 'Around the calf, at its fullest.', 'Autour du mollet, à l’endroit le plus fort.', 'cm'],
    knee: ['Waist to knee', 'Hauteur taille au genou', 'From the waist down to the middle of the knee (useful for shorts).', 'De la taille jusqu’au milieu du genou (utile pour un short).', 'cm'],
    hem: ['Leg opening (wanted)', 'Largeur du bas souhaitée', 'Width of the hem, laid flat, in cm.', 'Largeur de l’ourlet à plat, en cm.', 'cm'],
    head: ['Head', 'Tour de tête', 'All around the head, above the eyebrows and ears.', 'Tout autour de la tête, au-dessus des sourcils et des oreilles.', 'cm'],
    neck: ['Neck', 'Tour d’encolure', 'Around the base of the neck, without squeezing.', 'Autour de la base du cou, sans serrer.', 'cm'],
    hh: ['Head height', 'Hauteur de tête', 'From the chin to the top of the head.', 'Du menton jusqu’au sommet de la tête.', 'cm'],
    nh: ['Wanted height', 'Hauteur souhaitée', 'From the base of the neck up to where you want it to end (chin, nose…).', 'De la base du cou jusqu’où tu veux que ça monte (menton, nez…).', 'cm'],
    aw: ['Width (cm)', 'Largeur (cm)', 'The width you want, in cm.', 'La largeur souhaitée, en cm.', 'cm'],
    ah: ['Height (cm)', 'Hauteur (cm)', 'The height you want, in cm.', 'La hauteur souhaitée, en cm.', 'cm'],
  };
  // Deux niveaux : essentielles (obligatoires en sur-mesure, avec « Je ne sais pas ») et « si tu peux » (toujours facultatives).
  var ESS = { haut: ['chest', 'waist', 'hips', 'arm'], bas: ['waist', 'hips', 'inseam', 'floor'], cou: ['head', 'neck'], acc: ['aw', 'ah'] };
  var OPT = { haut: ['shoulders', 'shl', 'back', 'wrist'], bas: ['rise', 'thigh', 'calf', 'knee', 'hem'], cou: ['hh', 'nh'], acc: [] };
  var UNIVERSAL = ['height', 'usual']; // seulement pour les pièces qui s’habillent (haut, bas)
  function ess(cat) { return cat && ESS[cat] ? (cat === 'haut' || cat === 'bas' ? UNIVERSAL : []).concat(ESS[cat]) : []; }
  function opt(cat) { return cat && OPT[cat] ? OPT[cat] : []; }
  function list(cat) { return ess(cat).concat(opt(cat)); }
  function catFor(kind, piece) { return piece === 'autre' ? '' : /^(short|pantalon)$/.test(piece) ? 'bas' : 'haut'; }

  // --- Silhouettes : planche dessinée par vgthmind (assets/mesures/*.webp, recadrée par vue). Le blanc du papier est rendu transparent (multiply).
  // Échelle 0,6 : figure de 8 têtes entre y = 8 (haut du crâne) et y = 344 (pieds), centrée sur x = 100.
  function img(n, x, y, w, h) { return '<image class="pic" href="' + IMG + n + '.webp" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>'; }
  var front = function () { return img('front', 43, 3.2, 114, 348); };
  var back = function () { return img('back', 47.2, 3.2, 105, 348); };
  var profile = function () { return img('side', 64, 3.2, 69, 348); };
  var closeFront = function () { return img('headf', 28.7, 10, 142.6, 207.7); };
  var closeSide = function () { return img('heads', 10, 10, 179.8, 207.7); };
  function bd(n, x, y) { return '<g class="bd"><circle class="hz hzf" cx="' + x + '" cy="' + y + '" r="14"/><circle class="b" cx="' + x + '" cy="' + y + '" r="9"/><text x="' + x + '" y="' + (y + 4) + '">' + n + '</text></g>'; }
  // Mesure : halo (visible quand « on ») + trait + badge ; leader quand le badge est décalé.
  function ring(n, cx, cy, rx, ry, bx, by) {
    var e = 'cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '"';
    var lead = bx != null ? '<line class="gd" x1="' + (bx > cx ? cx + rx : cx - rx) + '" y1="' + cy + '" x2="' + (bx > cx ? bx - 9 : bx + 9) + '" y2="' + by + '"/>' : '';
    return '<ellipse class="hz" ' + e + '/><ellipse class="ln" ' + e + '/>' + lead + bd(n, bx != null ? bx : cx, bx != null ? by : cy);
  }
  function arrow(x1, y1, x2, y2) { var a = 'x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"'; return '<line class="hz" ' + a + '/><line class="ar" ' + a + ' marker-start="url(#vgm-a)" marker-end="url(#vgm-a)"/>'; }
  function parrow(d, end) { return '<path class="hz" d="' + d + '"/><path class="ar" d="' + d + '" marker-start="url(#vgm-a)" marker-end="url(#vgm-a)"/>'; }
  function ext(x1, y1, x2, y2) { return '<line class="gd" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>'; }
  function g(id, inner) { return '<g class="m" data-m="' + id + '">' + inner + '</g>'; }
  function view(x0, title, body, ty) { return '<g transform="translate(' + x0 + ',0)">' + body + '<text class="vt" x="100" y="' + (ty || 366) + '">' + title + '</text></g>'; }

  function svg(cat, fr) {
    var l = list(cat), N = {}; l.forEach(function (k, i) { N[k] = i + 1; });
    var T = fr ? { f: 'Face', b: 'Dos', p: 'Profil' } : { f: 'Front', b: 'Back', p: 'Side' };
    var v = '', vb = '0 0 430 374';
    var hgt = N.height ? g('height', arrow(14, 8, 14, 344) + bd(N.height, 14, 176)) : '';
    var ARM = 'M141,76 L146,128 L147,184';
    if (cat === 'haut') {
      v = view(0, T.f, front() + hgt + g('chest', ring(N.chest, 100, 99, 32, 5)) + g('waist', ring(N.waist, 100, 136, 29, 4.5)) + g('hips', ring(N.hips, 100, 183, 32, 5))
        + g('arm', parrow(ARM) + bd(N.arm, 152, 130)) + g('wrist', ring(N.wrist, 139, 183, 5, 2, 170, 183)))
        + view(230, T.b, back() + g('shoulders', arrow(77, 99, 123, 99) + bd(N.shoulders, 100, 99)) + g('shl', arrow(94, 63, 60, 78) + bd(N.shl, 70, 58)) + g('back', arrow(100, 66, 100, 138) + bd(N.back, 100, 120)));
    } else if (cat === 'bas') {
      v = view(0, T.f, front() + hgt + g('waist', ring(N.waist, 100, 136, 29, 4.5)) + g('hips', ring(N.hips, 100, 183, 32, 5)) + g('thigh', ring(N.thigh, 87, 219, 12, 3.5, 44, 226))
        + g('calf', ring(N.calf, 87, 285, 10, 3, 44, 285)) + g('hem', arrow(76, 322, 98, 322) + bd(N.hem, 44, 322)))
        + view(230, T.p, profile() + ext(108, 138, 192, 138) + ext(108, 183, 192, 183) + ext(108, 249, 192, 249) + ext(120, 344, 156, 344)
          + g('floor', arrow(132, 138, 132, 344) + bd(N.floor, 132, 241)) + g('inseam', arrow(150, 183, 150, 344) + bd(N.inseam, 150, 263))
          + g('rise', arrow(168, 138, 168, 183) + bd(N.rise, 168, 160)) + g('knee', arrow(186, 138, 186, 249) + bd(N.knee, 186, 194)));
    } else if (cat === 'cou') {
      vb = '0 0 430 252';
      v = view(0, T.f, closeFront() + g('head', ring(N.head, 100, 97, 54, 9)) + g('neck', ring(N.neck, 100, 202, 34, 6)), 246)
        + view(230, T.p, closeSide() + g('head', ring(N.head, 106, 97, 73, 8)) + g('neck', ring(N.neck, 129, 201, 20, 5))
          + ext(100, 19, 192, 19) + ext(84, 187, 192, 187) + g('hh', arrow(188, 19, 188, 187) + bd(N.hh, 188, 103))
          + g('nh', ext(106, 215, 166, 215) + arrow(160, 215, 160, 187) + bd(N.nh, 182, 204)), 246);
    } else if (cat === 'acc') {
      vb = '0 0 430 200';
      v = '<rect class="ol" x="110" y="36" width="200" height="110" rx="8"/><path class="lt" d="M110,62 L310,62"/>'
        + g('aw', arrow(110, 172, 310, 172) + bd(N.aw, 210, 172)) + g('ah', arrow(340, 36, 340, 146) + bd(N.ah, 340, 91));
    }
    return '<svg class="vgm-svg" viewBox="' + vb + '" role="img" aria-label="' + (fr ? 'Schéma : où mesurer' : 'Diagram: where to measure') + '"><defs>'
      + '<marker id="vgm-a" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1 L7,4 L1,7" fill="none" stroke="#171717" stroke-width="1.1"/></marker>'
      + '<linearGradient id="vgm-chrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfbfc"/><stop offset=".48" stop-color="#cfd1d6"/><stop offset="1" stop-color="#ececef"/></linearGradient>'
      + '<filter id="vgm-halo" filterUnits="userSpaceOnUse" x="-100" y="-100" width="700" height="700"><feGaussianBlur stdDeviation="3.4"/></filter></defs>' + v + '</svg>';
  }
  // Met en évidence (ou non) la mesure `id` : sur le schéma et sur sa ligne.
  function hl(root, id, on) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-m="' + id + '"],[data-mrow="' + id + '"]'), function (e) { e.classList.toggle('on', !!on); });
  }
  // Texte des mesures (récapitulatif) : même format que celui construit par le Worker.
  function compile(st, fr) {
    var out = [], l = list(st.mcat), v = st.mv || {}, u = st.mu || {};
    if (st.mtalk) return fr ? '⚠ À discuter directement (mesures non saisies)' : '⚠ To be discussed directly (no measurements entered)';
    if (!l.length) return '';
    if (st.mapprox) out.push(fr ? '⚠ Mesures approximatives' : '⚠ Approximate measurements');
    l.forEach(function (k) {
      var d = DEFS[k], val = String(v[k] || '').trim(), name = d[fr ? 1 : 0].replace(' (cm)', '');
      if (u[k]) out.push('⚠ ' + name + ' : ' + (fr ? 'je ne sais pas' : 'don’t know'));
      else if (val) out.push(name + ' : ' + val + (d[4] === 'cm' ? ' cm' : ''));
    });
    if (st.mother && st.mother.trim()) out.push((fr ? 'Autre précision : ' : 'Other details: ') + st.mother.trim());
    return out.join('\n');
  }
  window.VGMeasures = { CATS: CATS, DEFS: DEFS, ESS: ESS, OPT: OPT, UNIVERSAL: UNIVERSAL, ess: ess, opt: opt, list: list, catFor: catFor, svg: svg, hl: hl, compile: compile };
})();
