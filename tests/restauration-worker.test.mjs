// Restauration : n'ajoute que les entrées absentes ; commandes, stock et demandes déjà présents ne sont jamais modifiés.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(spec, ctx, next) { if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject {}', shortCircuit: true }; if (/^[.]{1,2}[/]/.test(spec) && !/[.][a-z]+$/.test(spec)) return next(spec + '.ts', ctx); return next(spec, ctx); }`));
const { restoreOrders, StockDO } = await import('../checkout-worker/index.ts');

const kv = () => { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, String(v)); } }; };
const A = 'cs_live_' + 'a'.repeat(20), B = 'cs_live_' + 'b'.repeat(20), C = 'cs_live_' + 'c'.repeat(20);

test('commandes : une commande déjà expédiée reste inchangée face à un fichier « en préparation » ; les absentes sont ajoutées', async () => {
  const HOLDS = kv();
  const actuel = { at: 200, tracking: '6A00000000001', notified: true };
  HOLDS.m.set('shipped:' + A, JSON.stringify(actuel));
  HOLDS.m.set('sref:' + A, 'VG-AAAAAA'); HOLDS.m.set('ref:VG-AAAAAA', A);
  const fichier = { preparing: { [A]: { at: 100 }, [B]: { at: 110 } }, shipped: { [C]: { at: 120, tracking: 'X' } }, refs: { [A]: 'VG-ZZZZZZ', [B]: 'VG-BBBBBB' } };
  const r = await restoreOrders({ HOLDS }, fichier);
  assert.deepEqual(r, { added: 3, skipped: 2 }); // B préparation, C expédiée, ref B ajoutés ; A préparation et ref A ignorés
  assert.equal(HOLDS.m.get('shipped:' + A), JSON.stringify(actuel));
  assert.equal(HOLDS.m.has('preparing:' + A), false, 'pas de statut « préparation » ajouté à une commande expédiée');
  assert.equal(HOLDS.m.get('sref:' + A), 'VG-AAAAAA');
  assert.equal(HOLDS.m.get('ref:VG-BBBBBB'), B);
  const r2 = await restoreOrders({ HOLDS }, fichier); // rejouer : rien de plus, aucun doublon
  assert.deepEqual(r2, { added: 0, skipped: 5 });
});

test('commandes : fichier plus avancé (expédiée) que le site (en préparation) : le site ne change pas', async () => {
  const HOLDS = kv(); HOLDS.m.set('preparing:' + A, JSON.stringify({ at: 5 }));
  const r = await restoreOrders({ HOLDS }, { shipped: { [A]: { at: 9, tracking: 'T' } } });
  assert.deepEqual(r, { added: 0, skipped: 1 }); assert.equal(HOLDS.m.has('shipped:' + A), false);
});

test('commandes : identifiants mal formés ignorés sans être comptés', async () => {
  const HOLDS = kv();
  const r = await restoreOrders({ HOLDS }, { shipped: { 'pas-un-id': { at: 1 }, [A]: 'texte' }, refs: { [A]: 'n-importe-quoi' } });
  assert.deepEqual(r, { added: 0, skipped: 0 }); assert.equal(HOLDS.m.size, 0);
});

test('stock : quantité remontée seulement si absente ; sinon ignorée et comptée', async () => {
  const store = new Map([['q:piece-a', 1], ['q:vendue', 0]]);
  const d = new StockDO(); d.ctx = { storage: { get: async (k) => store.get(k), put: async (k, v) => { store.set(k, v); } } };
  const r = await d.restoreStock({ 'piece-a': 7, vendue: 3, 'piece-d': 4, mauvais: 'x', 'a b': 2 });
  assert.deepEqual(r, { added: 1, skipped: 2 });
  assert.equal(store.get('q:piece-a'), 1); assert.equal(store.get('q:vendue'), 0); assert.equal(store.get('q:piece-d'), 4);
});
