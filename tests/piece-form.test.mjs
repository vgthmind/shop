import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const F = require('../admin/piece-form.js');
const cats = ['tops', 'pantsshorts'];
const ok = { name: 'Test Hoodie', price: '80', quantity: 1, categories: ['tops'], color: 'noir', description_en: 'Black hoodie', description_fr: 'Hoodie noir', weight_g: 550, mode: 'colis' };

test('fiche valide : champs écrits, badge unique par défaut, couleur de la liste', () => {
  const r = F.buildPiece(Object.assign({}, ok, { unique: F.defaultUnique(1) }), cats, '2026-10-11T00:00:00.000Z');
  assert.equal(r.error, undefined);
  const p = r.product;
  assert.equal(p.slug, 'test-hoodie'); assert.equal(p.price, 80); assert.equal(p.unique, true); assert.equal(p.quantity, 1);
  assert.equal(p.color_name, 'noir'); assert.equal(p.color_hex, '#1a1a1a');
  assert.equal(p.description, 'Black hoodie\r\n\r\nHoodie noir'); assert.equal(p.weight_g, 550); assert.equal(p.mode, 'colis');
  assert.deepEqual(p.categories, ['tops']);
});

test('badge unique : coché si quantité 1, décochable, jamais coché d\'office au-delà', () => {
  assert.equal(F.defaultUnique(1), true); assert.equal(F.defaultUnique(2), false);
  assert.equal(F.buildPiece(Object.assign({}, ok, { unique: false }), cats).product.unique, false);
});

test('couleur « autre » : texte libre + pastille grise par défaut ; vide refusé', () => {
  const p = F.buildPiece(Object.assign({}, ok, { color: 'autre', color_other: 'Rose pâle' }), cats).product;
  assert.equal(p.color_name, 'Rose pâle'); assert.equal(p.color_hex, '#9a9a9a');
  assert.match(F.buildPiece(Object.assign({}, ok, { color: 'autre' }), cats).error, /autre/);
});

test('suggestion de couleur : description d\'abord (FR/EN), sinon moyenne de la photo détourée', () => {
  assert.deepEqual(F.suggestColor({ description: 'Pantalon denim bleu' }), { id: 'bleu', source: 'description' });
  assert.equal(F.suggestColor({ description: 'Airbrushed hoodie\r\nBlack' }).id, 'noir');
  const px = (r, g, b, a) => [r, g, b, a];
  const img = { data: new Uint8ClampedArray([...px(200, 30, 90, 255), ...px(190, 40, 80, 255), ...px(0, 0, 0, 0)]) };
  assert.deepEqual(F.suggestColor({ description: 'rien', image: img }), { id: 'rouge', source: 'photo' });
  assert.equal(F.suggestColor({ description: 'rien' }), null);
  assert.equal(F.suggestColor({ image: { data: new Uint8ClampedArray([0, 0, 0, 0]) } }), null);
});

test('reel : lien Instagram/YouTube seulement', () => {
  assert.equal(F.reelError(''), null);
  assert.equal(F.reelError('https://www.instagram.com/reel/Da8M1VzMmoS/'), null);
  assert.equal(F.reelError('https://youtu.be/abc'), null);
  assert.ok(F.reelError('http://instagram.com/reel/x/')); assert.ok(F.reelError('https://evil.example/reel/x/'));
  assert.equal(F.buildPiece(Object.assign({}, ok, { reel_url: 'https://www.instagram.com/reel/abc/' }), cats).product.reel_url, 'https://www.instagram.com/reel/abc/');
});

test('refus : nom, prix, quantité, catégorie, description, poids', () => {
  const bad = (o) => F.buildPiece(Object.assign({}, ok, o), cats).error;
  assert.ok(bad({ name: ' ' })); assert.ok(bad({ price: 0 })); assert.ok(bad({ quantity: 0 })); assert.ok(bad({ quantity: 1.5 }));
  assert.ok(bad({ categories: [] })); assert.ok(bad({ categories: ['zzz'] })); assert.ok(bad({ description_en: '', description_fr: '' }));
  assert.match(bad({ weight_g: '' }), /Poids/);
});

test('pièces existantes : couleur, pastille et reel présents dans data/products', () => {
  const dir = new URL('../data/products/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const withColor = files.filter((f) => { const p = JSON.parse(readFileSync(new URL(f, dir), 'utf8')); return p.color_hex && p.color_name; });
  assert.ok(withColor.length >= 25, 'couleurs migrées : ' + withColor.length);
  const cd = JSON.parse(readFileSync(new URL('cd-vgtape.json', dir), 'utf8'));
  assert.equal(cd.unique, false); // pas de badge sur le CD, comme sur BigCartel
});

test('lien Instagram : post, carrousel ou reel acceptés, modifiable plus tard sur une pièce existante', () => {
  const V = require('../admin/pieces-view.js');
  const base = { slug: 'a', weight_g: 300, mode: 'colis' };
  const add = V.applyEdit(base, { weight_g: 300, mode: 'colis', alone: false, reel_url: 'https://www.instagram.com/p/DPHLT6DjLHL/' });
  assert.equal(add.product.reel_url, 'https://www.instagram.com/p/DPHLT6DjLHL/');
  const keep = V.applyEdit(add.product, { weight_g: 300, mode: 'colis', alone: false });
  assert.equal(keep.product.reel_url, 'https://www.instagram.com/p/DPHLT6DjLHL/'); // champ absent = inchangé
  const clear = V.applyEdit(add.product, { weight_g: 300, mode: 'colis', alone: false, reel_url: '' });
  assert.equal('reel_url' in clear.product, false);
  assert.ok(V.applyEdit(base, { weight_g: 300, mode: 'colis', alone: false, reel_url: 'https://evil.example/p/x/' }).error);
});

test('blanc cassé : proposé d\'après « blanc cassé » / « off-white », pas confondu avec blanc', () => {
  assert.equal(F.suggestColor({ description: 'Sweatpants\r\nOff-white\r\nJogging\r\nBlanc cassé' }).id, 'blanc-casse');
  assert.equal(F.suggestColor({ description: 'Cache-cou en molleton blanc' }).id, 'blanc');
  const p = F.buildPiece(Object.assign({}, ok, { color: 'blanc-casse' }), cats).product;
  assert.equal(p.color_name, 'blanc cassé'); assert.equal(p.color_hex, '#e9e3d6');
});

test('corrections de vgthmind : ja_0001 blanc cassé, cd-vgtape ×5, cache-cou série épuisée', () => {
  const read = (s) => JSON.parse(readFileSync(new URL('../data/products/' + s + '.json', import.meta.url), 'utf8'));
  assert.equal(read('ja_0001').color_name, 'blanc cassé');
  assert.equal(read('cd-vgtape').quantity, 5); assert.equal(read('cd-vgtape').unique, false);
  assert.equal(read('cache-cou').unique, false); assert.equal(read('cache-cou').quantity, 0);
});

test('taille : écrite sur la fiche, ajoutée à la description au build sauf si déjà présente', () => {
  assert.equal(F.buildPiece(Object.assign({}, ok, { size: ' M ' }), cats).product.size, 'M');
  assert.equal(F.buildPiece(ok, cats).product.size, undefined);
  const { withSize } = require('../generator/build-catalog.js');
  assert.equal(withSize('Black hoodie\r\n\r\nHoodie noir', 'M'), 'Black hoodie\r\n\r\nHoodie noir\r\n\r\nSize M / Taille M');
  assert.equal(withSize('Hoodie\r\nSize L', 'M'), 'Hoodie\r\nSize L');
  assert.equal(withSize('Hoodie', ''), 'Hoodie');
});
