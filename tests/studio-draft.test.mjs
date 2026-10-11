import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const Draft = createRequire(import.meta.url)('../admin/studio-draft.js');
const mem = (opts = {}) => {
  const m = new Map();
  return { m, get: async (k) => m.get(k), del: async (k) => { m.delete(k); }, set: async (k, v) => { if (opts.fail) throw new Error('QuotaExceededError'); m.set(k, v); } };
};
const file = (n) => ({ name: n, size: 10, type: 'image/jpeg' });

test('sauvegarde puis reprise : photos, vidéo et fiche', async () => {
  const d = Draft.create(mem(), () => 1000);
  const r = await d.save({ files: [file('a.jpg'), file('b.jpg')], reel: { name: 'r.mp4' }, fields: { fName: 'CH_0009', fPrice: '45', cats: ['tops'] } });
  assert.equal(r.ok, true);
  const back = await d.load();
  assert.deepEqual(back.files.map((f) => f.name), ['a.jpg', 'b.jpg']);
  assert.equal(back.reel.name, 'r.mp4'); assert.equal(back.fields.fName, 'CH_0009'); assert.deepEqual(back.fields.cats, ['tops']);
});

test('rien de saisi (cases par défaut seulement) : pas de brouillon, et l’ancien est supprimé', async () => {
  const be = mem(), d = Draft.create(be, () => 1);
  await d.save({ files: [file('a.jpg')], fields: {} });
  assert.ok(be.m.has('draft'));
  const r = await d.save({ files: [], reel: null, fields: { fUnique: true, fDrop: true, fQty: '', fMode: 'colis', fName: '' } });
  assert.deepEqual([r.ok, r.empty], [true, true]); assert.equal(be.m.has('draft'), false);
});

test('une fiche remplie sans photo est gardée', async () => {
  const d = Draft.create(mem(), () => 1);
  await d.save({ files: [], fields: { fName: 'X' } });
  assert.equal((await d.load()).fields.fName, 'X');
});

test('brouillon de plus de 14 jours : ignoré et supprimé', async () => {
  let t = 0; const be = mem(), d = Draft.create(be, () => t);
  await d.save({ files: [file('a.jpg')], fields: {} });
  t = Draft.MAX_AGE_MS + 1;
  assert.equal(await d.load(), null); assert.equal(be.m.has('draft'), false);
});

test('stockage plein ou refusé : pas d’exception, message d’erreur', async () => {
  const d = Draft.create(mem({ fail: true }), () => 1);
  const r = await d.save({ files: [file('a.jpg')], fields: {} });
  assert.equal(r.ok, false); assert.match(r.error, /Quota/); assert.ok(d.lastError());
});

test('stockage illisible / contenu abîmé : load renvoie null', async () => {
  const bad = { get: async () => { throw new Error('boom'); }, set: async () => {}, del: async () => {} };
  assert.equal(await Draft.create(bad).load(), null);
  const old = mem(); old.m.set('draft', { v: 99, savedAt: 1, files: [file('a')] });
  assert.equal(await Draft.create(old, () => 2).load(), null);
});

test('effacer après publication', async () => {
  const be = mem(), d = Draft.create(be, () => 1);
  await d.save({ files: [file('a.jpg')], fields: {} }); await d.clear();
  assert.equal(await d.load(), null);
});
