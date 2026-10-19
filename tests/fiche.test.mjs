import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const F = require('../admin/fiche-core.js');
const S = require('../admin/fiche-save.js');
const CATS = ['tops', 'customsupcycling', 'pantsshorts', 'merch', 'accessories'];
const NOW = Date.parse('2026-10-14T10:00:00Z');
const HOODIE = { name: 'CH_0002', slug: 'ch_0002', price: 84, description: 'Airbrushed Hoodie\r\nBlack\r\n\r\nHoodie customisé\r\nNoir', images: ['/assets/products/ch_0002/0.png'], categories: ['tops'], latest_drop: true, unique: true, in_stock: true, position: 1, created_at: '2026-07-12T14:37:20.000Z', stripe_payment_link: '', weight_g: 550, mode: 'colis', alone: false, weight_estimated: true, color_hex: '#1a1a1a', color_name: 'noir', reel_url: 'https://www.instagram.com/reel/Dad/' };
const opt = (o) => Object.assign({ categoryPermalinks: CATS, photoCount: 1, now: NOW }, o);

test('fiche inchangée : enregistrer sans toucher ne modifie rien (aucun champ perdu)', () => {
  for (const f of readdirSync(new URL('../data/products/', import.meta.url)).filter((x) => x.endsWith('.json'))) {
    const p = JSON.parse(readFileSync(new URL('../data/products/' + f, import.meta.url), 'utf8').replace(/^﻿/, ''));
    p.slug = f.replace(/\.json$/, '');
    const r = F.buildPiece(p, F.toForm(p, NOW), opt({ photoCount: (p.images || []).length }));
    assert.ok(!r.error, f + ' : ' + r.error);
    const norm = (o) => { const q = { ...o }; if (q.archived === false) delete q.archived; if (q.name_en === '') delete q.name_en; if (Array.isArray(q.keywords) && !q.keywords.length) delete q.keywords; return q; };
    assert.deepEqual(r.product, norm(p), f); // seuls les champs vides (archived:false, name_en:'', keywords:[]) disparaissent
  }
});

test('description : séparée en anglais / français, relue telle quelle si on n\'y touche pas', () => {
  const d = F.splitDescription(HOODIE.description);
  assert.equal(d.en, 'Airbrushed Hoodie\r\nBlack'); assert.equal(d.fr, 'Hoodie customisé\r\nNoir');
  const form = F.toForm(HOODIE, NOW); form.desc_fr = 'Hoodie noir';
  assert.equal(F.buildPiece(HOODIE, form, opt()).product.description, 'Airbrushed Hoodie\r\nBlack\r\n\r\nHoodie noir');
  assert.equal(F.splitDescription('Un seul texte').en, 'Un seul texte');
  const ta = Object.assign(F.toForm(HOODIE, NOW), { desc_en: 'Airbrushed Hoodie\nBlack', desc_fr: 'Hoodie customisé\nNoir' }); // ce que rend une zone de texte (\n)
  assert.equal(F.buildPiece(HOODIE, ta, opt()).product.description, HOODIE.description, 'description d\'origine gardée telle quelle');
});

test('champs modifiés : nom, prix (virgule), catégories, poids, couleur, mots-clés', () => {
  const form = Object.assign(F.toForm(HOODIE, NOW), { name: 'CH_0002 bis', price: '89,5', categories: ['tops', 'merch'], weight_g: '600', color: 'bleu', keywords: 'Hoodie, Sweat ,' });
  const p = F.buildPiece(HOODIE, form, opt()).product;
  assert.equal(p.name, 'CH_0002 bis'); assert.equal(p.price, 89.5); assert.deepEqual(p.categories, ['tops', 'merch']);
  assert.equal(p.weight_g, 600); assert.equal('weight_estimated' in p, false); assert.equal(p.color_name, 'bleu'); assert.deepEqual(p.keywords, ['hoodie', 'sweat']);
  assert.equal(p.slug, 'ch_0002');
});

test('erreurs claires : nom, prix, catégorie inconnue, catégorie manquante en ligne, photo, lien', () => {
  const form = F.toForm(HOODIE, NOW);
  assert.match(F.buildPiece(HOODIE, { ...form, name: ' ' }, opt()).error, /nom/);
  assert.match(F.buildPiece(HOODIE, { ...form, price: '0' }, opt()).error, /Prix/);
  assert.match(F.buildPiece(HOODIE, { ...form, categories: ['zzz'] }, opt()).error, /inconnue/);
  assert.match(F.buildPiece(HOODIE, { ...form, categories: [] }, opt()).error, /catégorie/);
  assert.ok(F.buildPiece(HOODIE, { ...form, categories: [], status: 'preview' }, opt()).product, 'masquée sans catégorie : permis');
  assert.match(F.buildPiece(HOODIE, form, opt({ photoCount: 0 })).error, /photo/);
  assert.match(F.buildPiece(HOODIE, { ...form, reel_url: 'http://x.fr' }, opt()).error, /Instagram/);
});

test('statuts : en ligne, masquée, programmée, bientôt disponible, archivée (et retour)', () => {
  const form = F.toForm(HOODIE, NOW);
  const pv = F.buildPiece(HOODIE, { ...form, status: 'preview' }, opt()).product;
  assert.equal(pv.hidden, true); assert.equal(F.statusOf(pv, NOW), 'preview');
  const sc = F.buildPiece(HOODIE, { ...form, status: 'scheduled', publish_at: '2026-10-20 18:00' }, opt()).product;
  assert.equal(sc.publish_at, '2026-10-20T16:00:00.000Z'); assert.equal(F.statusOf(sc, NOW), 'scheduled');
  assert.match(F.buildPiece(HOODIE, { ...form, status: 'scheduled', publish_at: '2026-10-14 12:02' }, opt()).error, /5 minutes/);
  assert.match(F.buildPiece(HOODIE, { ...form, status: 'scheduled', publish_at: 'demain' }, opt()).error, /Date/);
  const cs = F.buildPiece(HOODIE, { ...form, status: 'coming' }, opt()).product;
  assert.equal(cs.coming_soon, true); assert.equal('hidden' in cs, false);
  const ar = F.buildPiece(HOODIE, { ...form, status: 'archived' }, opt()).product;
  assert.equal(ar.archived, true);
  const back = F.buildPiece(ar, { ...F.toForm(ar, NOW), status: 'live' }, opt()).product;
  assert.equal('archived' in back, false); assert.equal(F.statusOf(back, NOW), 'live');
  // programmation déjà enregistrée et inchangée : pas de refus même si l'heure approche
  const keep = F.buildPiece(sc, F.toForm(sc, Date.parse('2026-10-20T15:58:00Z')), opt({ now: Date.parse('2026-10-20T15:58:00Z') }));
  assert.ok(keep.product, keep.error);
});

test('nouvelle pièce : adresse fabriquée depuis le nom, refus d\'un doublon, valeurs de départ', () => {
  const form = { name: 'Pantalon Évasé', price: '120', status: 'preview', categories: ['pantsshorts'], desc_en: '', desc_fr: 'Beau', weight_g: '', mode: 'colis', stock: 1 };
  const r = F.buildPiece({}, form, opt({ isNew: true, existingSlugs: ['ch_0002'], position: 28, photoCount: 0 }));
  assert.ok(!r.error, r.error);
  assert.equal(r.product.slug, 'pantalon-evase'); assert.equal(r.product.position, 28); assert.equal(r.product.quantity, 1);
  assert.equal(r.product.hidden, true); assert.equal(r.product.in_stock, true); assert.equal(r.product.created_at, '2026-10-14T10:00:00.000Z');
  assert.match(F.buildPiece({}, { ...form, name: 'CH_0002' }, opt({ isNew: true, existingSlugs: ['ch_0002'] })).error, /existe déjà/);
  assert.match(F.buildPiece({}, { ...form, status: 'live' }, opt({ isNew: true, existingSlugs: [] })).error, /Poids/);
});

test('photos : ordre et suppression', () => {
  assert.deepEqual(F.moveItem(['a', 'b', 'c'], 2, -1), ['a', 'c', 'b']);
  assert.deepEqual(F.moveItem(['a', 'b'], 0, -1), ['a', 'b']);
  assert.deepEqual(F.removeItem(['a', 'b', 'c'], 1), ['a', 'c']);
});

test('pièce rapide : brouillon masqué copié sur le modèle, poids à confirmer', () => {
  const r = F.quickPiece(HOODIE, { name: 'CH 0009', price: '' }, { existingSlugs: ['ch-0009'], position: 30, now: NOW });
  assert.equal(r.product.slug, 'ch-0009-2'); assert.equal(r.product.price, 84); assert.equal(r.product.hidden, true);
  assert.deepEqual(r.product.categories, ['tops']); assert.equal(r.product.weight_g, 550); assert.equal(r.product.weight_estimated, true);
  assert.equal(r.product.quantity, 1); assert.equal(r.product.unique, true);
  assert.ok(F.quickPiece(null, { name: 'X', price: '10' }).product);
  assert.ok(F.quickPiece(null, { name: '', price: '10' }).error);
});

test('drop : programme toutes les pièces cochées à la même minute ; refuse sans catégorie, sans photo ou trop proche', () => {
  const a = { ...HOODIE, hidden: true }, b = { ...HOODIE, slug: 'b', name: 'B', hidden: true }, c = { ...HOODIE, slug: 'c', name: 'C', categories: [] };
  const iso = '2026-10-17T16:00:00.000Z';
  const r = F.planDrop([a, b, c], ['ch_0002', 'b'], iso, NOW);
  assert.deepEqual(Object.keys(r.changes), ['ch_0002', 'b']);
  assert.ok(Object.values(r.changes).every((p) => p.hidden === true && p.publish_at === iso));
  assert.match(F.planDrop([a, b, c], ['c'], iso, NOW).error, /catégorie/);
  assert.match(F.planDrop([{ ...a, images: [] }], ['ch_0002'], iso, NOW).error, /photo/);
  assert.match(F.planDrop([a], ['ch_0002'], '2026-10-14T10:03:00.000Z', NOW).error, /5 minutes/);
  assert.match(F.planDrop([a], [], iso, NOW).error, /Coche/);
});

test('texte Instagram du drop : liste, prix, adresses', () => {
  const t = F.dropText([{ name: 'CH_0002', slug: 'ch_0002', price: 84 }, { name: 'Cache-cou', slug: 'cache-cou', price: 30.5 }], 'https://www.vgthmind.com/', 'samedi 17 octobre à 18 h');
  assert.match(t, /NOUVEAU DROP — samedi 17 octobre à 18 h/); assert.match(t, /• CH_0002 — 84 €/); assert.match(t, /• Cache-cou — 30,50 €/);
  assert.match(t, /https:\/\/www\.vgthmind\.com\/product\/cache-cou/);
});

test('raccourcis d\'heure (Paris) : ce soir 18 h seulement s\'il est encore loin, demain, samedi', () => {
  // mercredi 14 oct. 2026, 12 h à Paris (10 h UTC)
  const d = F.quickDates(NOW);
  assert.deepEqual(d.map((x) => [x.label, x.text]), [['Ce soir 18 h', '2026-10-14 18:00'], ['Demain 18 h', '2026-10-15 18:00'], ['Samedi 18 h', '2026-10-17 18:00']]);
  const late = F.quickDates(Date.parse('2026-10-14T15:58:00Z')); // 17 h 58 à Paris : plus de « ce soir »
  assert.equal(late[0].label, 'Demain 18 h');
  const sat = F.quickDates(Date.parse('2026-10-17T20:00:00Z')); // samedi soir : le prochain samedi
  assert.ok(sat.some((x) => x.text === '2026-10-24 18:00'));
});

test('pièces sans poids', () => {
  assert.deepEqual(F.missingWeight([{ slug: 'a' }, { slug: 'b', weight_g: 300 }, { slug: 'c', weight_g: 0 }]).map((p) => p.slug), ['a', 'c']);
});

// ---------- enregistrement ----------
function fakeGh({ exists = false, patchFails = 0 } = {}) {
  const calls = [];
  const gh = async (m, p, body) => {
    calls.push({ m, p, body });
    if (p.startsWith('/contents/')) { if (exists) return { sha: 'x' }; const e = new Error('Not Found'); e.status = 404; throw e; }
    if (p.startsWith('/git/ref/')) return { object: { sha: 'h1' } };
    if (p.startsWith('/git/commits/')) return { tree: { sha: 't1' } };
    if (p === '/git/blobs') return { sha: 'b' + calls.length };
    if (p === '/git/trees') return { sha: 't2' };
    if (p === '/git/commits') return { sha: 'c2' };
    if (m === 'PATCH') { if (patchFails) { const e = new Error('x'); e.status = 422; throw e; } return {}; }
    throw new Error('inattendu ' + p);
  };
  return { gh, calls };
}

test('enregistrement : un commit avec la fiche et les nouvelles photos, ordre final respecté', async () => {
  const { gh, calls } = fakeGh();
  const r = await S.saveFiche(gh, { slug: 'a', isNew: true, product: { name: 'A', images: ['x'] }, images: ['/assets/products/a/0.webp', { data: new Uint8Array([1, 2, 3]), ext: 'webp' }, '/assets/products/a/2.webp'] });
  assert.equal(r.commit, 'c2');
  assert.equal(r.product.images.length, 3); assert.match(r.product.images[1], /^\/assets\/products\/a\/v[a-z0-9]+-1\.webp$/);
  assert.equal(r.product.images[0], '/assets/products/a/0.webp');
  const tree = calls.find((c) => c.p === '/git/trees').body.tree.map((t) => t.path);
  assert.equal(tree.length, 2); assert.equal(tree[1], 'data/products/a.json'); assert.match(tree[0], /^assets\/products\/a\/v/);
  assert.equal(calls.filter((c) => c.m === 'PATCH').length, 1);
});

test('enregistrement : refuse une pièce nouvelle déjà existante, une adresse invalide, un dépôt qui a bougé', async () => {
  await assert.rejects(() => S.saveFiche(fakeGh({ exists: true }).gh, { slug: 'a', isNew: true, product: {}, images: [] }), /existe déjà/);
  await assert.rejects(() => S.saveFiche(fakeGh().gh, { slug: '../a', product: {}, images: [] }), /invalide/);
  await assert.rejects(() => S.saveFiche(fakeGh({ patchFails: 1 }).gh, { slug: 'a', product: {}, images: [] }), /Rien n'a été enregistré/);
});

test('pages : la grille charge les modules, propose Nouvelle pièce (assistant), Programmer, et plus aucun doublon', () => {
  const html = readFileSync(new URL('../admin/catalogue.html', import.meta.url), 'utf8');
  for (const f of ['catalogue-core.js', 'pieces-save.js', 'studio-publish.js', 'fiche-core.js', 'fiche-save.js', 'piece-form.js', 'pieces-view.js', 'shipping-calc.js']) assert.ok(html.includes(f), f);
  for (const a of ['reglages-promos.html', 'nouvelle-piece.html', '#/programmer']) assert.ok(html.includes(a), a);
  for (const gone of ['stock.html', 'pieces.html', 'index.html', 'drop.html', 'rapide.html', 'studio-photo.html', 'Sveltia']) assert.ok(!html.includes(gone), gone + ' ne doit plus être cité');
  assert.match(html, /Enregistrer/); assert.match(html, /Nouvelle pièce/); assert.match(html, /Épuisée/);
  const menu = readFileSync(new URL('../admin/menu.html', import.meta.url), 'utf8');
  assert.match(menu, /href="nouvelle-piece\.html"/);
  for (const gone of ['drop.html', 'rapide.html', 'stock.html', 'trafic.html']) assert.ok(!menu.includes(gone), gone);
});
