import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const C = createRequire(import.meta.url)('../admin/catalogue-core.js');

const P = (slug, extra = {}) => ({ slug, name: slug.toUpperCase(), price: 50, images: ['/assets/products/' + slug + '/0.png'], categories: ['tops'], position: 0, ...extra });
const cats = [
  { id: 1, name: 'Latest Drop', permalink: 'latest-drop', url: '/category/latest-drop' },
  { id: 2, name: 'All', permalink: 'all', url: '/category/all' },
  { id: 3, name: 'Tops', permalink: 'tops', url: '/category/tops' },
  { id: 4, name: 'Merch', permalink: 'merch', url: '/category/merch' },
];

test('statuts : publiée / brouillon / masquée / archivée, aller-retour propre', () => {
  const p = P('a');
  assert.equal(C.statusOf(p), 'publiee');
  for (const s of ['brouillon', 'masquee', 'archivee', 'publiee']) assert.equal(C.statusOf(C.withStatus(p, s)), s);
  assert.deepEqual(C.withStatus(C.withStatus(p, 'brouillon'), 'publiee'), p);
  assert.equal(C.withStatus(p, 'brouillon').hidden, true); // brouillon = aussi absente des listes
});

test('filtres : texte sans accents, catégorie, stock, unique, statut', () => {
  const list = [P('evasee', { name: 'Short évasé' }), P('b', { categories: ['merch'], unique: false }), P('c', { archived: true })];
  const stock = { evasee: { stock: 0 }, b: 3 };
  assert.deepEqual(C.filter(list, { q: 'evase' }).map((p) => p.slug), ['evasee']);
  assert.deepEqual(C.filter(list, { cat: 'merch' }).map((p) => p.slug), ['b']);
  assert.deepEqual(C.filter(list, { stock: 'out' }, stock).map((p) => p.slug), ['evasee']);
  assert.deepEqual(C.filter(list, { stock: 'in' }, stock).map((p) => p.slug), ['b', 'c']);
  assert.deepEqual(C.filter(list, { unique: 'no' }).map((p) => p.slug), ['b']);
  assert.deepEqual(C.filter(list, { status: 'actives' }).map((p) => p.slug), ['evasee', 'b']);
});

test('réordonner : positions recalculées, seules celles qui changent', () => {
  const list = [P('a', { position: 1 }), P('b', { position: 11 }), P('c', { position: 21 })];
  assert.deepEqual(C.reorder(list, 'c', 0), { c: 1, a: 11, b: 21 });
  assert.deepEqual(C.reorder(list, 'a', 0), {});
  assert.deepEqual(C.move(['x', 'y', 'z'], 2, 0), ['z', 'x', 'y']);
});

test('dupliquer : brouillon, adresse libre, mêmes photos', () => {
  const d = C.duplicate(P('a', { reel_video: '/x.mp4' }), ['a', 'a-copie'], '2026-10-12T00:00:00Z');
  assert.equal(d.slug, 'a-copie-2'); assert.equal(C.statusOf(d), 'brouillon');
  assert.deepEqual(d.images, ['/assets/products/a/0.png']); assert.equal(d.reel_video, undefined); assert.equal(d.quantity, 1);
});

test('vérification avant enregistrement : messages clairs', () => {
  const perms = cats.map((c) => c.permalink);
  assert.equal(C.check(P('a'), perms), null);
  assert.match(C.check(P('a', { price: 0 }), perms), /Prix/);
  assert.match(C.check(P('a', { images: [] }), perms), /photo/);
  assert.match(C.check(P('a', { categories: [] }), perms), /catégorie/);
  assert.equal(C.check(P('a', { categories: [], draft: true, hidden: true }), perms), null);
  assert.match(C.check(P('a', { reel_url: 'http://x.com' }), perms), /reel/);
});

test('actions groupées : masquer, ajouter/retirer une catégorie (seulement les pièces qui changent)', () => {
  const list = [P('a'), P('b', { categories: ['tops', 'merch'] })];
  assert.deepEqual(Object.keys(C.bulk(list, ['a', 'b'], { type: 'addCat', value: 'merch' })), ['a']);
  assert.deepEqual(C.bulk(list, ['b'], { type: 'removeCat', value: 'merch' }).b.categories, ['tops']);
  assert.equal(C.bulk(list, ['a'], { type: 'status', value: 'masquee' }).a.hidden, true);
});

test('catégories : créer, renommer (adresse inchangée), réordonner (Latest Drop / All restent en tête)', () => {
  const a = C.addCategory(cats, 'Robes & jupes');
  assert.equal(a.categories.at(-1).permalink, 'robesjupes'); assert.equal(a.categories.at(-1).id, 5);
  assert.match(C.addCategory(cats, 'tops').error, /existe/);
  const r = C.renameCategory(cats, 'tops', 'Hauts');
  assert.equal(r.categories[2].name, 'Hauts'); assert.equal(r.categories[2].url, '/category/tops');
  assert.match(C.renameCategory(cats, 'all', 'Tout').error, /automatique/);
  assert.deepEqual(C.moveCategory(cats, 'merch', -1).categories.map((c) => c.permalink), ['latest-drop', 'all', 'merch', 'tops']);
});

test('vignette : WebP 320 px, original en secours, accents encodés', () => {
  assert.deepEqual(C.thumbUrls(P('short-coupe-évasée')), { src: '../assets/products-sized/320/short-coupe-%C3%A9vas%C3%A9e/0.webp', fallback: '../assets/products/short-coupe-%C3%A9vas%C3%A9e/0.png' });
});
