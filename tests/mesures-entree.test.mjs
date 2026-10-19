// Guide de mesure (tailles habituelles non numérotées, numéros du schéma = numéros des lignes) et clips de l'écran d'entrée (une catégorie couture + une peinture au moins).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {}, document: { currentScript: null } };
vm.runInNewContext(fs.readFileSync(new URL('../assets/vg-mesures.js', import.meta.url), 'utf8'), ctx);
const M = ctx.window.VGMeasures;

test('mesures : la taille habituelle est demandée mais jamais numérotée ni sur le schéma', () => {
  for (const cat of ['haut', 'bas']) {
    assert.deepEqual([...M.sizes(cat)], ['usual']);
    assert.ok(!M.numbered(cat).includes('usual'));
    assert.ok(M.list(cat).includes('usual'), 'toujours dans la liste envoyée au Worker');
  }
  for (const cat of ['cou', 'acc']) assert.deepEqual([...M.sizes(cat)], []);
});

test('mesures : les numéros du schéma vont de 1 au nombre de mesures numérotées, sans trou', () => {
  for (const cat of ['haut', 'bas', 'cou', 'acc']) {
    const nums = new Set([...M.svg(cat, true).matchAll(/<text x="[\d.]+" y="[\d.]+">(\d+)<\/text>/g)].map((m) => +m[1]));
    assert.deepEqual([...nums].sort((a, b) => a - b), [...M.numbered(cat)].map((_, i) => i + 1), cat);
  }
});

test('mesures : consigne et textes propres à la catégorie (rien sur le dos et les bras pour un pantalon)', () => {
  assert.match(M.note('haut', true), /dos et les bras/);
  assert.doesNotMatch(M.note('bas', true), /dos|bras/);
  assert.doesNotMatch(M.note('cou', true), /dos|bras/);
  assert.match(M.def('usual', 'bas')[3], /pantalons ou shorts/);
});

test('écran d\'entrée : clips couture et peinture présents, aucun extrait de jeu vidéo ni de pièce portée seule', () => {
  const dir = new URL('../assets/media/splash/', import.meta.url);
  const files = fs.readdirSync(dir).filter((f) => /\.mp4$/i.test(f));
  assert.ok(files.filter((f) => /couture/i.test(f)).length >= 2, 'au moins 2 clips couture');
  assert.ok(files.filter((f) => !/couture/i.test(f)).length >= 2, 'au moins 2 clips peinture');
  for (const retire of ['reel-custom-tee-shirt-col-en-v.mp4', 'clip_1.mp4', 'reel-cd-vgtape.mp4', 'reel-ch_0004.mp4', 'reel-sma_0001.mp4', 'reel-sma_0003.mp4']) assert.ok(!files.includes(retire), retire + ' doit rester retiré');
});

test('mesures : listes validées (haut, bas) et noms clairs', () => {
  assert.deepEqual([...M.ess('haut')], ['height', 'usual', 'chest', 'waist', 'hips', 'arm', 'len']);
  assert.deepEqual([...M.opt('haut')], ['shoulders', 'shl', 'back', 'wrist', 'armc']);
  assert.deepEqual([...M.ess('bas')], ['usual', 'waist', 'hips', 'inseam', 'floor']);
  assert.ok(M.opt('bas').includes('height') && !M.ess('bas').includes('height'));
  assert.equal(M.def('height', 'haut')[1], 'Hauteur (cm)');
  assert.equal(M.def('usual', 'haut')[1], 'Taille habituelle (S, M, L…)');
  assert.equal(M.def('waist', 'bas')[1], 'Tour de taille');
  assert.equal(M.def('waist', 'haut')[1], 'Tour de taille');
  const all = JSON.stringify(M.DEFS);
  assert.ok(!/ceinture/i.test(all), 'plus de « ceinture »');
  const txt = M.compile({ mcat: 'haut', mv: { height: '178', usual: 'M' }, mu: {} }, true);
  assert.match(txt, /^Hauteur : 178 cm$/m);
  assert.match(txt, /^Taille habituelle : M$/m);
});

test('mesures : le schéma ne montre que les mesures de la catégorie (haut : longueur souhaitée et tour de bras avec leurs numéros)', () => {
  const svg = M.svg('haut', true);
  for (const k of ['len', 'armc', 'chest']) assert.ok(svg.includes('data-m="' + k + '"'), k);
  assert.ok(!svg.includes('data-m="thigh"'));
  assert.ok(!M.svg('bas', true).includes('data-m="len"'));
});
