// Ménage des données de test (outils/menage-donnees-test.mjs) : la sélection ne doit jamais toucher du réel.
import test from 'node:test';
import assert from 'node:assert/strict';
const { plan, parisMidnight } = await import('../outils/menage-donnees-test.mjs');

const CUT = parisMidnight('2026-10-25');
const before = CUT - 86400000, after = CUT + 3600000;

test('minuit à Paris : été (UTC+2) et hiver (UTC+1)', () => {
  assert.equal(new Date(parisMidnight('2026-10-25')).toISOString(), '2026-10-24T22:00:00.000Z'); // le changement d'heure a lieu cette nuit-là, minuit est encore en heure d'été
  assert.equal(new Date(parisMidnight('2026-12-01')).toISOString(), '2026-11-30T23:00:00.000Z');
  assert.equal(parisMidnight('hier'), null);
});

test('commandes : seules les commandes de test sont désignées, les réelles sont gardées', () => {
  const p = plan({ orders: [{ id: 'cs_test_1', livemode: false, items: [{ name: 'Hoodie' }] }, { id: 'cs_live_1', livemode: true, items: [{ name: 'Hoodie' }] }] }, CUT);
  assert.deepEqual(p.testOrders.map((o) => o.id), ['cs_test_1']);
  assert.deepEqual(p.realOrders.map((o) => o.id), ['cs_live_1']);
});

test('demandes : seulement celles créées avant le jour limite', () => {
  const p = plan({ requests: [{ id: 'D-1', created: before }, { id: 'D-2', created: after }, { id: 'D-3', created: CUT }] }, CUT);
  assert.deepEqual(p.oldReq.map((r) => r.id), ['D-1']);
  assert.deepEqual(p.keepReq.map((r) => r.id), ['D-2', 'D-3']);
});

test('stock : seules les lignes modifiées des pièces vendues en test (ou nommées test*) sont remises au catalogue', () => {
  const stock = { 'ch_0002': { stock: 0, fromCatalog: false }, 'ch_0003': { stock: 0, fromCatalog: false }, 'ch_0004': { stock: 1, fromCatalog: true }, test: { stock: 0, fromCatalog: false }, 'test-2': { stock: 1, fromCatalog: true } };
  const p = plan({ stock, names: { ch_0002: 'Veste A', ch_0003: 'Veste B', ch_0004: 'Veste C' }, orders: [{ livemode: false, items: [{ name: 'Veste A' }] }, { livemode: true, items: [{ name: 'Veste B' }] }, { livemode: false, items: [{ name: 'Veste C' }] }] }, CUT);
  assert.deepEqual(p.stockReset.sort(), ['ch_0002', 'test'], 'Veste B (vente réelle) et Veste C (déjà au catalogue) ne bougent pas');
});

test('stock : une pièce « Vendu » sans commande qui l’explique est signalée, jamais remise en vente toute seule', () => {
  const stock = { a: { stock: 0, fromCatalog: false }, b: { stock: 0, fromCatalog: false }, c: { stock: 0, fromCatalog: false }, d: { stock: 2, fromCatalog: false } };
  const p = plan({ stock, names: { a: 'A', b: 'B', c: 'C', d: 'D' }, orders: [{ livemode: false, items: [{ name: 'A' }] }, { livemode: true, items: [{ name: 'B' }] }] }, CUT);
  assert.deepEqual(p.stockReset, ['a']);
  assert.deepEqual(p.stockUnknown, ['c'], 'B = vente réelle (expliquée), D a du stock : seule C est inexpliquée');
});

test('visites : seuls les jours avant la limite', () => {
  const p = plan({ trafficDays: ['2026-10-10', '2026-10-24', '2026-10-25', '2026-10-30', 'x'] }, CUT);
  assert.deepEqual(p.days, ['2026-10-10', '2026-10-24']);
});

test('KV : clés de session de test, états temporaires, sauvegardes de commandes ; jamais le stock, les sessions admin ni le planning des drops', () => {
  const kvKeys = ['shipped:cs_test_a', 'preparing:cs_test_a', 'sref:cs_test_a', 'refunded:cs_live_b', 'shipped:cs_live_b', 'ref:VG-AAA', 'ref:VG-BBB', 'rl:ref:VG-AAA', 'rl:loginfail:1.2.3.4', 'oauth:xyz', 'obackup:2026-10-20', 'obackup:latest', 'backup:latest', 'backup:2026-10-20', 'rv:abc', 'admin:revoked', 'publish:schedule', 'webhook:last', 'compta:q:cs_test_c', 'mailed:cs_test_a', 'oversold:cs_test_z'];
  const kvRefs = [{ key: 'ref:VG-AAA', value: 'cs_test_a' }, { key: 'ref:VG-BBB', value: 'cs_live_b' }];
  const { kvDelete } = plan({ kvKeys, kvRefs }, CUT);
  for (const k of ['shipped:cs_test_a', 'preparing:cs_test_a', 'sref:cs_test_a', 'ref:VG-AAA', 'rl:ref:VG-AAA', 'rl:loginfail:1.2.3.4', 'oauth:xyz', 'obackup:2026-10-20', 'obackup:latest', 'compta:q:cs_test_c', 'mailed:cs_test_a', 'oversold:cs_test_z']) assert.ok(kvDelete.includes(k), k + ' devrait être supprimée');
  for (const k of ['refunded:cs_live_b', 'shipped:cs_live_b', 'ref:VG-BBB', 'backup:latest', 'backup:2026-10-20', 'rv:abc', 'admin:revoked', 'publish:schedule', 'webhook:last']) assert.ok(!kvDelete.includes(k), k + ' doit être gardée');
});
