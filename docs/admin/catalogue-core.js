/* Page admin « Catalogue » : logique pure (sans réseau, sans DOM), testée dans tests/catalogue.test.mjs.
   Statut d'une pièce (champs de data/products/<slug>.json) :
     publiée   : visible dans la boutique
     brouillon : draft:true  -> page accessible par son lien (aperçu), absente des listes, pas achetable
     masquée   : hidden:true -> page + paiement par lien direct, absente des listes (comme avant)
     archivée  : archived:true -> retirée du site, fiche gardée (historique des commandes)
   Stock : vit dans le Worker (page Stock) ; ici seulement lu / mis à 0 (Sold out). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VGCatalogue = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STATUSES = [
    { id: 'publiee', label: 'Publiée' },
    { id: 'brouillon', label: 'Brouillon' },
    { id: 'masquee', label: 'Masquée' },
    { id: 'archivee', label: 'Archivée' }
  ];
  var FIXED_CATS = ['latest-drop', 'all']; // catégories automatiques : ni renommées, ni déplacées, ni cochées à la main

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function statusOf(p) {
    if (p.archived === true) return 'archivee';
    if (p.draft === true) return 'brouillon';
    if (p.hidden === true) return 'masquee';
    return 'publiee';
  }

  function withStatus(p, st) {
    var q = clone(p);
    delete q.archived; delete q.draft; delete q.hidden;
    if (st === 'archivee') q.archived = true;
    else if (st === 'brouillon') { q.draft = true; q.hidden = true; }
    else if (st === 'masquee') q.hidden = true;
    return q;
  }

  // Stock connu (Worker) ou, à défaut, quantité de départ de la fiche.
  function stockOf(p, stock) {
    if (stock && stock[p.slug] !== undefined) {
      var s = stock[p.slug];
      return typeof s === 'object' && s ? Number(s.stock) : Number(s);
    }
    if (Number.isInteger(p.quantity)) return p.quantity;
    return p.in_stock === false ? 0 : 1;
  }

  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  // f : { q, cat, stock: ''|'in'|'out', unique: ''|'yes'|'no', status: ''|<id>|'actives' }
  function filter(list, f, stock) {
    f = f || {};
    var q = norm(f.q).trim();
    return list.filter(function (p) {
      if (q && norm(p.name + ' ' + p.slug + ' ' + (p.description || '')).indexOf(q) === -1) return false;
      if (f.cat && (p.categories || []).indexOf(f.cat) === -1 && !(f.cat === 'latest-drop' && p.latest_drop)) return false;
      var n = stockOf(p, stock);
      if (f.stock === 'in' && n <= 0) return false;
      if (f.stock === 'out' && n > 0) return false;
      if (f.unique === 'yes' && p.unique === false) return false;
      if (f.unique === 'no' && p.unique !== false) return false;
      var st = statusOf(p);
      if (f.status === 'actives' && st === 'archivee') return false;
      if (f.status && f.status !== 'actives' && st !== f.status) return false;
      return true;
    });
  }

  function byPosition(list) {
    return list.slice().sort(function (a, b) {
      return (Number(a.position) || 0) - (Number(b.position) || 0) || String(a.name).localeCompare(String(b.name));
    });
  }

  // Déplace `slug` à l'index `to` de la liste triée ; renvoie { slug: nouvelle position } pour les pièces qui changent.
  // Positions espacées de 10 (1, 11, 21…) pour laisser de la place aux insertions.
  function reorder(list, slug, to) {
    var sorted = byPosition(list), from = -1, i;
    for (i = 0; i < sorted.length; i++) if (sorted[i].slug === slug) from = i;
    if (from === -1) return {};
    to = Math.max(0, Math.min(sorted.length - 1, to));
    var moved = sorted.splice(from, 1)[0];
    sorted.splice(to, 0, moved);
    var out = {};
    sorted.forEach(function (p, k) { var pos = 1 + k * 10; if (Number(p.position) !== pos) out[p.slug] = pos; });
    return out;
  }

  function move(arr, from, to) {
    var a = arr.slice();
    if (from < 0 || from >= a.length) return a;
    to = Math.max(0, Math.min(a.length - 1, to));
    a.splice(to, 0, a.splice(from, 1)[0]);
    return a;
  }

  function slugify(s) {
    return norm(s).replace(/[^a-z0-9_]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function freeSlug(base, taken) {
    var set = {}; taken.forEach(function (t) { set[t] = true; });
    if (!set[base]) return base;
    for (var n = 2; ; n++) if (!set[base + '-' + n]) return base + '-' + n;
  }

  // Copie d'une pièce : brouillon, mêmes photos, stock de départ 1, sans reel vidéo propre.
  function duplicate(p, takenSlugs, now) {
    var q = withStatus(p, 'brouillon');
    q.slug = freeSlug(slugify(p.slug + '-copie'), takenSlugs);
    q.name = String(p.name || p.slug) + ' (copie)';
    q.created_at = now || new Date().toISOString();
    q.quantity = 1;
    q.position = (Number(p.position) || 0) + 1;
    q.stripe_payment_link = '';
    delete q.reel_video;
    return q;
  }

  // Vérifie une fiche avant enregistrement. Renvoie un message d'erreur clair ou null.
  function check(p, catPermalinks) {
    if (!String(p.name || '').trim()) return 'Le nom est vide.';
    if (!/^[^\s\/\\.][^\s\/\\]*$/.test(p.slug || '')) return 'Adresse (slug) invalide.';
    var price = Number(p.price);
    if (!isFinite(price) || price <= 0) return 'Prix invalide (un nombre supérieur à 0).';
    if (!Array.isArray(p.images) || !p.images.length) return 'Il faut au moins une photo.';
    var cats = (p.categories || []).filter(function (c) { return FIXED_CATS.indexOf(c) === -1; });
    var bad = cats.filter(function (c) { return catPermalinks.indexOf(c) === -1; });
    if (bad.length) return 'Catégorie inconnue : ' + bad.join(', ');
    if (!cats.length && statusOf(p) === 'publiee') return 'Choisis au moins une catégorie (ou mets la pièce en brouillon / masquée).';
    if (p.reel_url && !/^https:\/\/(?:www\.|m\.)?(instagram\.com|youtube\.com|youtu\.be)\/\S+$/i.test(p.reel_url)) return 'Lien du reel : adresse Instagram ou YouTube en https://.';
    if (p.color_hex && !/^#[0-9a-f]{6}$/i.test(p.color_hex)) return 'Teinte de pastille invalide (#rrggbb).';
    return null;
  }

  // Actions groupées : renvoie les fiches modifiées { slug: fiche }.
  // action : { type: 'status', value } | { type: 'addCat', value } | { type: 'removeCat', value } | { type: 'drop', value: bool }
  function bulk(list, slugs, action) {
    var out = {};
    list.forEach(function (p) {
      if (slugs.indexOf(p.slug) === -1) return;
      var q;
      if (action.type === 'status') q = withStatus(p, action.value);
      else if (action.type === 'addCat') {
        q = clone(p); q.categories = (q.categories || []).slice();
        if (q.categories.indexOf(action.value) === -1) q.categories.push(action.value);
      } else if (action.type === 'removeCat') {
        q = clone(p); q.categories = (q.categories || []).filter(function (c) { return c !== action.value; });
      } else if (action.type === 'drop') { q = clone(p); q.latest_drop = action.value === true; }
      else return;
      if (JSON.stringify(q) !== JSON.stringify(p)) out[p.slug] = q;
    });
    return out;
  }

  // --- Catégories (data/categories.json) -------------------------------
  function editableCats(cats) { return cats.filter(function (c) { return FIXED_CATS.indexOf(c.permalink) === -1; }); }

  function addCategory(cats, name) {
    name = String(name || '').trim();
    if (!name) return { error: 'Donne un nom à la catégorie.' };
    var perm = slugify(name).replace(/[-_]/g, '');
    if (!perm) return { error: 'Nom invalide.' };
    if (cats.some(function (c) { return c.permalink === perm || norm(c.name) === norm(name); })) return { error: 'Cette catégorie existe déjà.' };
    var id = cats.reduce(function (m, c) { return Math.max(m, Number(c.id) || 0); }, 0) + 1;
    return { categories: cats.concat([{ id: id, name: name, permalink: perm, url: '/category/' + perm }]) };
  }

  // Renommer change le nom affiché seulement : l'adresse (/category/…) reste, pour ne casser aucun lien.
  function renameCategory(cats, perm, name) {
    name = String(name || '').trim();
    if (!name) return { error: 'Le nom ne peut pas être vide.' };
    if (FIXED_CATS.indexOf(perm) !== -1) return { error: 'Catégorie automatique : pas renommable.' };
    if (cats.some(function (c) { return c.permalink !== perm && norm(c.name) === norm(name); })) return { error: 'Une autre catégorie porte déjà ce nom.' };
    return { categories: cats.map(function (c) { return c.permalink === perm ? Object.assign({}, c, { name: name }) : c; }) };
  }

  // Déplace une catégorie parmi les catégories modifiables (Latest Drop et All restent en tête).
  function moveCategory(cats, perm, delta) {
    var fixed = cats.filter(function (c) { return FIXED_CATS.indexOf(c.permalink) !== -1; });
    var ed = editableCats(cats), i = -1;
    ed.forEach(function (c, k) { if (c.permalink === perm) i = k; });
    if (i === -1) return { categories: cats };
    return { categories: fixed.concat(move(ed, i, i + delta)) };
  }

  // Vignette (admin servi sous /shop/admin/) : WebP 320 px si présent, sinon l'original.
  function thumbUrls(p) {
    var u = (p.images || [])[0] || '';
    if (!/^\/assets\/products\//.test(u)) return { src: u, fallback: u };
    var rel = u.replace(/^\/assets\/products\//, '');
    return { src: '../assets/products-sized/320/' + encodeURI(rel.replace(/\.[^./]+$/, '.webp')), fallback: '../assets/products/' + encodeURI(rel) };
  }

  return {
    STATUSES: STATUSES, FIXED_CATS: FIXED_CATS, statusOf: statusOf, withStatus: withStatus, stockOf: stockOf, filter: filter,
    byPosition: byPosition, reorder: reorder, move: move, slugify: slugify, freeSlug: freeSlug, duplicate: duplicate, check: check,
    bulk: bulk, editableCats: editableCats, addCategory: addCategory, renameCategory: renameCategory, moveCategory: moveCategory,
    thumbUrls: thumbUrls
  };
}));
