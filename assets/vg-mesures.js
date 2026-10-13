/* Guide de mesure du formulaire « Proposer un projet » : catégories, mesures (termes du métier), schéma SVG.
   Croquis de mode à la main (8 têtes, androgyne, sans visage : trait de crayon irrégulier, hachures légères) ; par-dessus,
   les lignes de mesure nettes : pointillés (tours) ou flèches (longueurs) + numéro. window.VGMeasures.hl() met la mesure en évidence
   (trait plein, badge chromé, halo argenté flou) quand le client touche le champ. Mêmes clés/libellés côté Worker (requests-core.ts). */
(function () {
  'use strict';
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

  // --- Croquis : 8 têtes (tête = 42 u), épaules et hanches proches, bras légèrement écartés, sans visage -------------------------
  // Demi-silhouette de face (côté droit, centre x = 100), reprise en miroir pour le côté gauche.
  var HALF = 'M106.5,47 L106.5,62 C114,64 124,67 131,71 C136,80 140,98 141,118 L143,136 L152,190 L155,214 L149,215 L145,191 L131,136 C130,120 128,106 128,94 C127,108 124,122 124.5,134 C125,150 129,163 129.5,177 C131,200 128,235 123,262 C121,285 118,305 117,330 C118,338 121,342 126,344 L109,344 L109,331 C110,305 111,285 111,262 C110,235 106,205 100,176';
  var LIGHT_HALF = 'M107,66 Q118,68 128,71 M111,259 q6,5 11,0 M113,265 q5,3 9,0 M131,134 q4,3 7,1 M112,96 q8,6 16,0 M113,287 C116,293 117,300 116,309 M100,64 L100,70';
  var SHADE_HALF = 'M128,96 C127,108 124.5,122 125,134 C125.5,150 129.5,163 130,177 L125,177 C124.5,163 120.5,150 120,134 C119.5,122 122,108 123,96 Z M136,76 C139,86 141,100 141.5,118 L143.5,136 L152.5,190 L148,190 L139,137 C138,120 136,100 132,80 Z M129.5,178 C131.5,200 128.5,235 123.5,262 L119,262 C124,235 126,203 124.5,178 Z M123,262 C121,285 118,305 117,330 L113,330 C114,305 117,285 119,262 Z';
  var HEAD = 'M100,8 C111,8 115,18 115,28 C115,40 109,50 100,51 C91,50 85,40 85,28 C85,18 89,8 100,8 Z';
  var HEAD_SIDE = 'M99,8 C110,8 117,16 117,27 C117,40 111,50 103,51 C93,50 86,42 86,30 C86,16 91,8 99,8 Z';
  function pen(d, extra) { return '<path class="ol" d="' + d + '"' + (extra || '') + '/><path class="ol2" d="' + d + '" transform="translate(.5,.35)"/>'; }
  function mirrorG(inner) { return '<g>' + inner + '</g><g transform="translate(200,0) scale(-1,1)">' + inner + '</g>'; }
  function front() { return '<g class="pencil">' + pen(HEAD) + mirrorG(pen(HALF) + '<path class="lt" d="' + LIGHT_HALF + '"/><path class="ht" d="' + SHADE_HALF + '"/>') + '</g>'; }
  function back() { return '<g class="pencil">' + pen(HEAD) + mirrorG(pen(HALF) + '<path class="lt" d="M107,66 Q118,68 128,71 M111,259 q6,5 11,0 M131,134 q4,3 7,1 M106,84 q9,4 15,18 M113,287 C116,293 117,300 116,309"/><path class="ht" d="' + SHADE_HALF + '"/>')
    + '<path class="lt" d="M100,62 L100,176 M93,64 q7,-3 14,0"/></g>'; }
  var PROFILE = 'M90,62 C85,68 83,82 83,98 C83,116 86,128 86,140 C86,154 81,166 81,180 C81,196 86,208 87,226 C88,246 86,256 86,266 C85,284 84,300 88,330 L88,338 L84,343 L118,343 L113,335 L109,332 C107,310 109,290 111,266 C112,250 112,238 111,220 C111,205 114,196 113,180 C113,166 112,154 112,140 C112,128 116,114 116,98 C116,84 113,72 108,62';
  var ARM_SIDE = 'M94,72 C97,100 99,120 99,136 L103,188 L106,214 L112,212 L110,186 L108,136 C108,120 107,98 106,74';
  function profile() {
    return '<g class="pencil">' + pen(HEAD_SIDE) + pen('M93,46 L90,62 M106,47 L108,62') + pen(PROFILE) + pen(ARM_SIDE)
      + '<path class="lt" d="M85,262 q6,5 12,3 M96,263 q5,3 10,0 M87,288 C91,294 92,302 90,310 M100,150 L104,186"/>'
      + '<path class="ht" d="M83,98 C83,116 86,128 86,140 L90,140 C90,128 87,116 87,98 Z M81,180 C81,196 86,208 87,226 L92,226 C91,208 86,196 86,180 Z M86,266 C85,284 84,300 88,330 L92,330 C89,300 89,284 90,266 Z M96,74 C99,100 100,120 100,136 L103,136 C103,120 102,100 99,74 Z"/></g>';
  }
  // Gros plan tête + cou + haut des épaules (figure agrandie ×2,4 ; traits de même épaisseur grâce à vector-effect).
  var NECK_UP = 'M93.5,46 L93.5,62 C86,64 76,67 69,71 C64,76 61,85 60,96 M106.5,46 L106.5,62 C114,64 124,67 131,71 C136,76 139,85 140,96';
  var NECK_UP_SIDE = 'M92.5,46 L90,62 C84,64 77,68 70,72 C65,77 62,85 61,96 M106,47 L108,62 C115,64 124,67 131,71 C136,76 139,85 140,96';
  function closeFront() {
    return '<g class="pencil s" transform="translate(-140,1) scale(2.4)">' + pen(HEAD, ' vector-effect="non-scaling-stroke"').replace('class="ol2"', 'class="ol2 s"') + pen(NECK_UP, ' vector-effect="non-scaling-stroke"').replace('class="ol2"', 'class="ol2 s"')
      + '<path class="lt s" d="M93,66 Q82,68 72,71 M107,66 Q118,68 128,71 M100,62 L100,69"/><path class="ht" d="M93.5,50 L106.5,50 C103,56 97,56 93.5,50 Z M93.5,56 L93.5,62 L88,63 Z M106.5,56 L106.5,62 L112,63 Z"/></g>';
  }
  function closeSide() {
    return '<g class="pencil s" transform="translate(-140,1) scale(2.4)">' + pen(HEAD_SIDE).replace('class="ol"', 'class="ol s"').replace('class="ol2"', 'class="ol2 s"') + pen(NECK_UP_SIDE).replace('class="ol"', 'class="ol s"').replace('class="ol2"', 'class="ol2 s"')
      + '<path class="ht" d="M93,50 L104,52 C100,57 96,57 92,52 Z M92,54 L91,62 L86,63 Z"/></g>';
  }
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
    var ARM = 'M137,73 C143,82 146,100 147,118 L149,136 L158,190';
    if (cat === 'haut') {
      v = view(0, T.f, front() + hgt + g('chest', ring(N.chest, 100, 96, 29, 5)) + g('waist', ring(N.waist, 100, 134, 24.5, 4.5)) + g('hips', ring(N.hips, 100, 178, 30, 5))
        + g('arm', parrow(ARM) + bd(N.arm, 153, 136)) + g('wrist', ring(N.wrist, 148.5, 188, 6, 2, 176, 188)))
        + view(230, T.b, back() + g('shoulders', arrow(72, 90, 128, 90) + bd(N.shoulders, 100, 90)) + g('shl', arrow(93.5, 62, 69, 71) + bd(N.shl, 70, 56)) + g('back', arrow(100, 62, 100, 134) + bd(N.back, 100, 116)));
    } else if (cat === 'bas') {
      v = view(0, T.f, front() + hgt + g('waist', ring(N.waist, 100, 134, 24.5, 4.5)) + g('hips', ring(N.hips, 100, 178, 30, 5)) + g('thigh', ring(N.thigh, 82, 228, 12.5, 3.5, 50, 228))
        + g('calf', ring(N.calf, 85, 298, 7.5, 2.5, 50, 298)) + g('hem', arrow(76, 326, 94, 326) + bd(N.hem, 56, 326)))
        + view(230, T.p, profile() + ext(113, 134, 192, 134) + ext(114, 178, 192, 178) + ext(111, 262, 192, 262) + ext(118, 343, 156, 343)
          + g('floor', arrow(132, 134, 132, 343) + bd(N.floor, 132, 238)) + g('inseam', arrow(150, 178, 150, 343) + bd(N.inseam, 150, 262))
          + g('rise', arrow(168, 134, 168, 178) + bd(N.rise, 168, 156)) + g('knee', arrow(186, 134, 186, 262) + bd(N.knee, 186, 198)));
    } else if (cat === 'cou') {
      vb = '0 0 430 262';
      v = view(0, T.f, closeFront() + g('head', ring(N.head, 100, 54, 36, 7)) + g('neck', ring(N.neck, 100, 139, 19, 5)), 252)
        + view(230, T.p, closeSide() + g('head', ring(N.head, 98, 54, 35, 6)) + g('neck', ring(N.neck, 100, 139, 18, 4.5))
          + ext(100, 21, 184, 21) + ext(112, 122, 184, 122) + g('hh', arrow(170, 21, 170, 122) + bd(N.hh, 170, 72))
          + g('nh', ext(116, 153, 156, 153) + arrow(144, 153, 144, 124) + bd(N.nh, 144, 138)), 252);
    } else if (cat === 'acc') {
      vb = '0 0 430 200';
      v = '<rect class="ol" x="110" y="36" width="200" height="110" rx="8"/><path class="lt" d="M110,62 L310,62"/>'
        + g('aw', arrow(110, 172, 310, 172) + bd(N.aw, 210, 172)) + g('ah', arrow(340, 36, 340, 146) + bd(N.ah, 340, 91));
    }
    return '<svg class="vgm-svg" viewBox="' + vb + '" role="img" aria-label="' + (fr ? 'Schéma : où mesurer' : 'Diagram: where to measure') + '"><defs>'
      + '<marker id="vgm-a" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1 L7,4 L1,7" fill="none" stroke="#171717" stroke-width="1.1"/></marker>'
      + '<linearGradient id="vgm-chrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfbfc"/><stop offset=".48" stop-color="#cfd1d6"/><stop offset="1" stop-color="#ececef"/></linearGradient>'
      + '<filter id="vgm-halo" filterUnits="userSpaceOnUse" x="-100" y="-100" width="700" height="700"><feGaussianBlur stdDeviation="3.4"/></filter>'
      + '<filter id="vgm-pencil" filterUnits="userSpaceOnUse" x="-50" y="-50" width="600" height="600"><feTurbulence type="fractalNoise" baseFrequency=".32" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.4"/></filter>'
      + '<filter id="vgm-pencil-s" filterUnits="userSpaceOnUse" x="-50" y="-50" width="600" height="600"><feTurbulence type="fractalNoise" baseFrequency=".32" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale=".55"/></filter>' + '<pattern id="vgm-hatch" width="2.6" height="2.6" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><line x1="0" y1="0" x2="0" y2="2.6" stroke="#171717" stroke-width=".55" stroke-opacity=".55"/></pattern></defs>' + v + '</svg>';
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
