/* Page admin « Catalogue » : logique pure (sans réseau, sans DOM), testée dans tests/catalogue.test.mjs.
   Une pièce = data/products/<slug>.json. Champs utilisés :
     archived  true = retirée du site (la fiche reste, historique des commandes)
     hidden    true = page accessible par son adresse mais ni listée, ni dans une catégorie, ni dans le plan du site
               (= aperçu avant publication : on vérifie la page réelle, puis « Publier »)
     position  ordre d'affichage (les plus petits d'abord) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VGCatalogue = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function slugify(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  // Ordre d'affichage : position, puis nom. Les archivées en dernier.
  function sorted(pieces) {
    return pieces.slice().sort(function (a, b) {
      if (!!a.archived !== !!b.archived) return a.archived ? 1 : -1;
      var pa = a.position == null ? 0 : a.position, pb = b.position == null ? 0 : b.position;
      return pa - pb || String(a.name || a.slug).localeCompare(String(b.name || b.slug));
    });
  }

  // Programmée = masquée avec une date de mise en ligne (publish_at) encore à venir.
  function state(p, now) {
    if (p.archived) return 'archived';
    if (!p.hidden) return p.coming_soon === true ? 'coming' : 'live';
    return p.publish_at && Date.parse(p.publish_at) > (now || Date.now()) ? 'scheduled' : 'preview';
  }

  // « 2026-11-06 18:00 » (heure de Paris) -> date ISO UTC, ou null si le texte est invalide.
  function parisToIso(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(String(str || '').trim());
    if (!m) return null;
    var guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    var fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    function parisAt(ts) {
      var o = {};
      fmt.formatToParts(new Date(ts)).forEach(function (x) { o[x.type] = x.value; });
      return Date.UTC(+o.year, +o.month - 1, +o.day, (+o.hour) % 24, +o.minute);
    }
    var ts = guess - (parisAt(guess) - guess);
    ts = guess - (parisAt(ts) - ts);
    var d = new Date(ts);
    return isNaN(d) ? null : d.toISOString();
  }
  function schedule(p, iso) { var q = Object.assign({}, p); q.hidden = true; q.publish_at = iso; return q; }

  // Déplace une pièce d'un cran (dir = -1 vers le haut, +1 vers le bas) parmi les pièces non archivées.
  // Renvoie { slug: nouvelleFiche } pour les seules fiches dont la position change (positions 1..n).
  function move(pieces, slug, dir) {
    var list = sorted(pieces).filter(function (p) { return !p.archived; });
    var i = list.map(function (p) { return p.slug; }).indexOf(slug), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return {};
    var t = list[i]; list[i] = list[j]; list[j] = t;
    var out = {};
    list.forEach(function (p, k) {
      if (p.position !== k + 1) out[p.slug] = Object.assign({}, p, { position: k + 1 });
    });
    return out;
  }

  // Nom + adresse libres ? (la copie ne doit jamais écraser une pièce existante)
  function freeSlug(pieces, base) {
    var taken = {}; pieces.forEach(function (p) { taken[p.slug] = 1; });
    var s = slugify(base) || 'piece', n = s, i = 2;
    while (taken[n]) n = s + '-' + (i++);
    return n;
  }

  // Copie d'une fiche (série : cache-cous...). La copie démarre EN APERÇU (hidden) : on vérifie, puis « Publier ».
  // Les photos sont partagées (mêmes fichiers) ; à remplacer ensuite dans l'admin « Pièces ».
  function duplicate(pieces, slug, newName, now) {
    var src = pieces.filter(function (p) { return p.slug === slug; })[0];
    if (!src) return { error: 'Pièce introuvable.' };
    newName = String(newName || '').trim();
    if (!newName) return { error: 'Donne un nom à la copie.' };
    var copy = Object.assign({}, src);
    delete copy.reel_video; delete copy.stripe_payment_link;
    var max = pieces.reduce(function (m, p) { return Math.max(m, p.position || 0); }, 0);
    copy.name = newName;
    copy.slug = freeSlug(pieces, newName);
    copy.hidden = true;
    delete copy.archived;
    copy.position = max + 1;
    copy.created_at = new Date(now || Date.now()).toISOString();
    return { slug: copy.slug, product: copy };
  }

  function setArchived(p, on) { var q = Object.assign({}, p); if (on) { q.archived = true; } else { delete q.archived; } return q; }
  // « Bientôt disponible » : la pièce est visible et listée, mais le bouton d'achat est remplacé par un libellé (comme chez BigCartel).
  function setComing(p, on) { var q = Object.assign({}, p); if (on) q.coming_soon = true; else delete q.coming_soon; return q; }
  function setHidden(p, on) { var q = Object.assign({}, p); if (on) q.hidden = true; else { delete q.hidden; delete q.publish_at; } return q; }

  return { slugify: slugify, sorted: sorted, state: state, move: move, freeSlug: freeSlug, duplicate: duplicate, setArchived: setArchived, setHidden: setHidden, setComing: setComing, schedule: schedule, parisToIso: parisToIso };
}));
