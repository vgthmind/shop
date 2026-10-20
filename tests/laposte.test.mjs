// Suivi La Poste : lecture de la réponse, statuts, relève (API en panne, livraison, incident) et mails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const hooks = `
export async function resolve(spec, ctx, next) { if (/^[.]{1,2}[/]/.test(spec) && !/[.][a-z]+$/.test(spec)) return next(spec + '.ts', ctx); return next(spec, ctx); }`;
register('data:text/javascript,' + encodeURIComponent(hooks));
const { cleanTracking, stateOf, parseSuivi, pollShipments, MIN_GAP_S } = await import('../checkout-worker/laposte.ts');
const { deliveredEmail, parcelProblemEmail } = await import('../checkout-worker/emails.ts');

const resp = (events) => ({ shipment: { idShip: '6A1', event: events } });
const { sanitizeSample } = await import('../checkout-worker/laposte.ts');
const ev = (code, label, date) => ({ code, label, date });

test('cleanTracking : espaces et minuscules acceptés, invalide refusé', () => {
  assert.equal(cleanTracking(' 6a 123 456 789 01 '), '6A12345678901');
  assert.equal(cleanTracking('abc'), '');
  assert.equal(cleanTracking("1; DROP"), '');
});

test('statuts : champs de l API d abord, code inconnu = en transit', () => {
  const tl = (last) => [1, 2, 3, 4, 5].map((id) => ({ id, status: id < 5 || last }));
  assert.equal(stateOf('XXX', tl(true)), 'delivered');
  assert.equal(stateOf('XXX', tl(false)), 'transit');
  assert.equal(stateOf('DI1', undefined), 'delivered');
  assert.equal(stateOf('DR1', undefined), 'transit'); // DR1 = en préparation chez l'expéditeur (réponse réelle)
  assert.equal(stateOf('RE1', tl(false)), 'problem');
  assert.equal(stateOf('CODE-INCONNU', undefined), 'transit');
  assert.equal(stateOf('', []), 'transit');
});

test('parseSuivi : dernier événement en tête, réponse vide ou inconnue', () => {
  const p = parseSuivi(resp([ev('PCH', 'Pris en charge', '2026-10-20T09:00:00+02:00'), ev('DI1', 'Livré', '2026-10-22T10:00:00+02:00')]), 0);
  assert.equal(p.state, 'delivered'); assert.equal(p.events[0].code, 'DI1');
  assert.equal(parseSuivi({}, 0), null);
  assert.equal(parseSuivi(resp([]), 0).state, 'transit');
});

test('réponse réelle (colis livré, expurgée) : livré ; colis juste annoncé : transit', () => {
  const tl = [1, 2, 3, 4, 5].map((id) => ({ id, status: true }));
  const real = { shipment: { isFinal: true, timeline: tl, event: [{ code: 'DI1', label: 'Votre colis est livré.', date: '2026-06-25T13:49:01+02:00' }, { code: 'DR1', label: 'préparation chez votre expéditeur', date: '2026-06-23T11:03:50+02:00' }] } };
  assert.equal(parseSuivi(real, 0).state, 'delivered');
  const fresh = { shipment: { isFinal: false, timeline: tl.map((x) => ({ ...x, status: x.id === 1 && false })), event: [{ code: 'DR1', label: 'préparation chez votre expéditeur', date: '2026-10-20T10:00:00+02:00' }] } };
  assert.equal(parseSuivi(fresh, 0).state, 'transit');
});

function mk(initial, api) {
  const kv = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  const log = { delivered: [], problems: [], auth: 0, calls: 0 };
  const deps = {
    now: 1_800_000_000, key: 'K',
    list: async () => ({ keys: [...kv.keys()].filter((k) => k.startsWith('shipped:')).map((name) => ({ name })), list_complete: true }),
    get: async (n) => kv.get(n) ?? null, put: async (n, v) => { kv.set(n, v); },
    fetcher: async () => { log.calls++; return api(); },
    onDelivered: async (id) => { log.delivered.push(id); return true; },
    onProblem: async (id, s, info) => { log.problems.push(info.label); },
    onAuthError: async () => { log.auth++; },
  };
  return { kv, log, deps, get: (k) => JSON.parse(kv.get(k)) };
}
const ok = (events) => ({ ok: true, status: 200, json: async () => resp(events) });
const NOW = 1_800_000_000;

test('relève : livrée -> mail une seule fois, plus d\'appel ensuite', async () => {
  const m = mk({ 'shipped:cs_a': { at: NOW - 86400, tracking: '6A12345678901' } }, () => ok([ev('DI1', 'Livré', '2026-10-20')]));
  await pollShipments(m.deps);
  assert.deepEqual(m.log.delivered, ['cs_a']); assert.equal(m.get('shipped:cs_a').track.state, 'delivered');
  await pollShipments({ ...m.deps, now: NOW + 3 * MIN_GAP_S });
  assert.equal(m.log.calls, 1); assert.equal(m.log.delivered.length, 1);
});

test('relève : API en panne -> dernier statut gardé, rien ne casse', async () => {
  const prev = { state: 'transit', label: 'Pris en charge', events: [], checked: NOW - 2 * MIN_GAP_S, ok: NOW - 2 * MIN_GAP_S };
  const m = mk({ 'shipped:cs_a': { at: NOW - 86400, tracking: '6A12345678901', track: prev } }, () => ({ ok: false, status: 503 }));
  const r = await pollShipments(m.deps);
  assert.equal(r.failed, 1); assert.equal(m.get('shipped:cs_a').track.label, 'Pris en charge'); assert.equal(m.get('shipped:cs_a').track.checked, NOW);
  const m2 = mk({ 'shipped:cs_a': { at: NOW, tracking: '6A12345678901' } }, () => { throw new Error('réseau'); });
  await pollShipments({ ...m2.deps, fetcher: async () => { throw new Error('réseau'); } });
  assert.ok(m2.get('shipped:cs_a'));
});

test('relève : pas plus d\'un appel par colis et par 10 h', async () => {
  const m = mk({ 'shipped:cs_a': { at: NOW - 86400, tracking: '6A12345678901' } }, () => ok([ev('ET1', 'En transit', '2026-10-20')]));
  await pollShipments(m.deps); await pollShipments({ ...m.deps, now: NOW + 3600 });
  assert.equal(m.log.calls, 1);
  await pollShipments({ ...m.deps, now: NOW + MIN_GAP_S + 1 });
  assert.equal(m.log.calls, 2);
});

test('relève : incident -> une seule alerte par incident ; clé refusée -> alerte clé', async () => {
  const m = mk({ 'shipped:cs_a': { at: NOW - 86400, tracking: '6A12345678901' } }, () => ok([ev('ND1', 'Adresse incorrecte', '2026-10-20')]));
  await pollShipments(m.deps); await pollShipments({ ...m.deps, now: NOW + MIN_GAP_S + 1 });
  assert.equal(m.log.problems.length, 1);
  const m2 = mk({ 'shipped:cs_a': { at: NOW, tracking: '6A12345678901' } }, () => ({ ok: false, status: 401 }));
  await pollShipments(m2.deps); assert.equal(m2.log.auth, 1);
});

test('relève : sans numéro, ou expédié depuis trop longtemps -> ignoré', async () => {
  const m = mk({ 'shipped:cs_a': { at: NOW, tracking: '' }, 'shipped:cs_b': { at: NOW - 100 * 86400, tracking: '6A12345678901' } }, () => ok([]));
  await pollShipments(m.deps); assert.equal(m.log.calls, 0);
});

test('mails : livrée (FR/EN) et alerte incident, Reply-To géré côté Worker', () => {
  const o = { ref: 'VG-ABC123', name: 'Jeanne Dupont', email: 'a@b.fr', country: 'FR', address: [], items: [], shipping: '', total: '', test: false, stripeUrl: '', cgvUrl: '', orderUrl: 'https://x/suivi' };
  const fr = deliveredEmail(o); assert.match(fr.subject, /livrée/); assert.ok(fr.text.includes('Salut Jeanne'));
  assert.match(deliveredEmail({ ...o, country: 'CA' }).subject, /delivered/);
  const p = parcelProblemEmail('VG-ABC123', 'Jeanne', '6A12345678901', 'Adresse incorrecte', [{ date: '2026-10-20T10:00', label: 'Adresse incorrecte' }]);
  assert.match(p.subject, /VG-ABC123/); assert.ok(p.html.includes('6A12345678901'));
});

test('échantillon expurgé : ni contexte ni titulaire', () => {
  const raw = { returnCode: 200, shipment: { idShip: 'X', holder: 1, contextData: { addr: 'secret' }, isFinal: true, product: 'colissimo', event: [{ code: 'DR1', label: 'Livré', date: 'd', extra: 'secret' }], timeline: [{ id: 1, shortLabel: 'a', status: true, secret: 'x' }] } };
  const j = JSON.stringify(sanitizeSample(raw));
  assert.ok(!/secret|holder|contextData|idShip/.test(j));
});
