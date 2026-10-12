// Codes promo (admin) : validation du formulaire, appels Stripe (coupon puis code), désactivation, liste.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, n) { if (/^[.]{1,2}[/]/.test(s) && !/[.][a-z]+$/.test(s)) return n(s + '.ts', c); return n(s, c); }`));
const { planPromo, endOfDayParis, promoRoutes, promoRow } = await import('../checkout-worker/promos.ts');

const NOW = Date.parse('2026-10-13T10:00:00Z');
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s });
const req = (method, path, body) => new Request('http://w.invalid' + path, { method, body: body ? JSON.stringify(body) : undefined });

test('fin de journée à Paris : été et hiver', () => {
  assert.equal(new Date(endOfDayParis('2026-07-14') * 1000).toISOString(), '2026-07-14T21:59:00.000Z');
  assert.equal(new Date(endOfDayParis('2026-12-31') * 1000).toISOString(), '2026-12-31T22:59:00.000Z');
  assert.equal(endOfDayParis('31/12/2026'), null);
});

test('formulaire : refus clairs', () => {
  assert.match(planPromo({ code: 'a', percent: 10 }, NOW).error, /Code/);
  assert.match(planPromo({ code: 'BONJOUR', percent: 10, amount: 5 }, NOW).error, /OU/);
  assert.match(planPromo({ code: 'BONJOUR' }, NOW).error, /OU/);
  assert.match(planPromo({ code: 'BONJOUR', percent: 150 }, NOW).error, /Pourcentage/);
  assert.match(planPromo({ code: 'BONJOUR', amount: 0.1 }, NOW).error, /Montant/);
  assert.match(planPromo({ code: 'BONJOUR', percent: 10, max: 0 }, NOW).error, /utilisations/);
  assert.match(planPromo({ code: 'BONJOUR', percent: 10, expires: '2026-01-01' }, NOW).error, /passée/);
  assert.match(planPromo({ code: 'BONJOUR', percent: 10, expires: 'demain' }, NOW).error, /AAAA/);
});

test('formulaire : % et montant fixe, options', () => {
  const a = planPromo({ code: 'bienvenue10', percent: 10, max: 50, min: 40, first: true, expires: '2026-12-31' }, NOW);
  assert.equal(a.coupon.get('percent_off'), '10'); assert.equal(a.coupon.get('duration'), 'once');
  const p = a.promo('co_123');
  assert.equal(p.get('code'), 'BIENVENUE10'); assert.equal(p.get('coupon'), 'co_123'); assert.equal(p.get('max_redemptions'), '50');
  assert.equal(p.get('restrictions[minimum_amount]'), '4000'); assert.equal(p.get('restrictions[minimum_amount_currency]'), 'eur');
  assert.equal(p.get('restrictions[first_time_transaction]'), 'true'); assert.ok(p.get('expires_at'));
  const b = planPromo({ code: 'MOINS5', amount: '5', percent: '' }, NOW);
  assert.equal(b.coupon.get('amount_off'), '500'); assert.equal(b.coupon.get('currency'), 'eur'); assert.equal(b.label, '-5,00 €');
});

test('routes : création (coupon puis code), liste, désactivation', async () => {
  const calls = [];
  const call = async (m, p, params) => {
    calls.push([m, p, params && params.toString()]);
    if (p === '/v1/coupons') return { ok: true, data: { id: 'co_1', percent_off: 10, valid: true } };
    if (p === '/v1/promotion_codes' && m === 'POST') return { ok: true, data: { id: 'promo_1', code: 'AAA', active: true, times_redeemed: 0, restrictions: {} } };
    if (p.startsWith('/v1/promotion_codes?')) return { ok: true, data: { data: [{ id: 'promo_1', code: 'AAA', active: true, times_redeemed: 2, max_redemptions: 5, coupon: { percent_off: 10, valid: true }, restrictions: { minimum_amount: 4000 } }] } };
    if (p === '/v1/promotion_codes/promo_1') return { ok: true, data: { id: 'promo_1', active: false } };
    throw new Error('appel inattendu ' + p);
  };
  let r = await promoRoutes(req('POST', '/admin/promos', { code: 'aaa', percent: 10 }), '/admin/promos', call, json, NOW);
  assert.equal(r.status, 200); assert.deepEqual(calls.map((c) => c[1]), ['/v1/coupons', '/v1/promotion_codes']);
  r = await promoRoutes(req('GET', '/admin/promos'), '/admin/promos', call, json, NOW);
  assert.deepEqual((await r.json()).promos[0], { id: 'promo_1', code: 'AAA', active: true, off: '-10 %', used: 2, max: 5, expires: null, min: 40, first: false });
  r = await promoRoutes(req('POST', '/admin/promos/toggle', { id: 'promo_1', active: false }), '/admin/promos/toggle', call, json, NOW);
  assert.equal((await r.json()).active, false);
  r = await promoRoutes(req('POST', '/admin/promos/toggle', { id: '../x', active: false }), '/admin/promos/toggle', call, json, NOW);
  assert.equal(r.status, 400);
  assert.equal(await promoRoutes(req('GET', '/admin/stock'), '/admin/stock', call, json, NOW), null);
});

test('routes : code refusé par Stripe = le coupon créé est supprimé ; sans clé = 503 ; entrée fausse = 400', async () => {
  const calls = [];
  const call = async (m, p) => { calls.push(m + ' ' + p); if (p === '/v1/coupons' && m === 'POST') return { ok: true, data: { id: 'co_9' } }; if (m === 'POST') return { ok: false, data: { error: { message: 'Code already exists' } } }; return { ok: true, data: {} }; };
  let r = await promoRoutes(req('POST', '/admin/promos', { code: 'DEJA', percent: 10 }), '/admin/promos', call, json, NOW);
  assert.equal(r.status, 502); assert.match((await r.json()).error, /already exists/);
  assert.ok(calls.includes('DELETE /v1/coupons/co_9'));
  r = await promoRoutes(req('GET', '/admin/promos'), '/admin/promos', null, json, NOW); assert.equal(r.status, 503);
  r = await promoRoutes(req('POST', '/admin/promos', { code: '!' }), '/admin/promos', call, json, NOW); assert.equal(r.status, 400);
  assert.equal(promoRow({ id: 'p', code: 'X', active: true, coupon: { valid: false } }).active, false);
});
