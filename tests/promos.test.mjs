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
  assert.deepEqual((await r.json()).promos[0], { id: 'promo_1', code: 'AAA', active: true, status: 'on', off: '-10 %', used: 2, max: 5, expires: null, min: 40, first: false });
  r = await promoRoutes(req('POST', '/admin/promos/toggle', { id: 'promo_1', active: false }), '/admin/promos/toggle', call, json, NOW);
  assert.equal((await r.json()).active, false);
  r = await promoRoutes(req('POST', '/admin/promos/toggle', { id: '../x', active: false }), '/admin/promos/toggle', call, json, NOW);
  assert.equal(r.status, 400);
  assert.equal(await promoRoutes(req('GET', '/admin/stock'), '/admin/stock', call, json, NOW), null);
});

test('routes : code refusé par Stripe = le coupon créé est supprimé ; sans clé = 503 ; entrée fausse = 400', async () => {
  const calls = [];
  const call = async (m, p) => { calls.push(m + ' ' + p); if (p === '/v1/coupons' && m === 'POST') return { ok: true, data: { id: 'co_9' } }; if (m === 'POST') return { ok: false, data: { error: { message: 'Permission denied' } } }; return { ok: true, data: {} }; };
  let r = await promoRoutes(req('POST', '/admin/promos', { code: 'DEJA', percent: 10 }), '/admin/promos', call, json, NOW);
  assert.equal(r.status, 502); assert.match((await r.json()).error, /Permission denied/);
  assert.ok(calls.includes('DELETE /v1/coupons/co_9'));
  r = await promoRoutes(req('GET', '/admin/promos'), '/admin/promos', null, json, NOW); assert.equal(r.status, 503);
  r = await promoRoutes(req('POST', '/admin/promos', { code: '!' }), '/admin/promos', call, json, NOW); assert.equal(r.status, 400);
  assert.equal(promoRow({ id: 'p', code: 'X', active: true, coupon: { valid: false } }).active, false);
});

// Scénario complet avec un faux Stripe en mémoire : création de plusieurs types de codes, liste (statuts), désactivation,
// et décision au paiement d'après ce que le Worker a envoyé (la vraie décision est celle de Stripe Checkout).
test('scénario : %, montant, expiration, limite, désactivé, expiré, épuisé, inexistant, casse', async () => {
  const coupons = {}, promos = []; let n = 0;
  const call = async (m, p, params) => {
    const q = params ? Object.fromEntries(params) : {};
    if (m === 'GET') return { ok: true, data: { data: promos.map((x) => ({ ...x, coupon: coupons[x.coupon] })) } };
    if (m === 'POST' && p === '/v1/coupons') { const id = 'co_' + (++n); coupons[id] = { id, valid: true, percent_off: q.percent_off && Number(q.percent_off), amount_off: q.amount_off && Number(q.amount_off) }; return { ok: true, data: coupons[id] }; }
    if (m === 'POST' && p === '/v1/promotion_codes') {
      if (promos.some((x) => x.code.toLowerCase() === q.code.toLowerCase() && x.active)) return { ok: false, data: { error: { message: 'already exists' } } };
      const r = { id: 'promo_' + (++n), code: q.code, active: true, coupon: q.coupon, times_redeemed: 0, restrictions: {} };
      if (q.max_redemptions) r.max_redemptions = Number(q.max_redemptions);
      if (q.expires_at) r.expires_at = Number(q.expires_at);
      if (q['restrictions[minimum_amount]']) r.restrictions.minimum_amount = Number(q['restrictions[minimum_amount]']);
      promos.push(r); return { ok: true, data: r };
    }
    const mm = /^\/v1\/promotion_codes\/(promo_\w+)$/.exec(p);
    if (m === 'POST' && mm) { promos.find((x) => x.id === mm[1]).active = q.active === 'true'; return { ok: true, data: { id: mm[1], active: q.active === 'true' } }; }
    throw new Error('appel inattendu ' + m + ' ' + p);
  };
  const post = async (b) => promoRoutes(req('POST', '/admin/promos', b), '/admin/promos', call, json, NOW);
  assert.equal((await post({ code: 'pct10', percent: 10 })).status, 200);
  assert.equal((await post({ code: 'EUR5', amount: 5, min: 40 })).status, 200);
  assert.equal((await post({ code: 'ETE', percent: 15, expires: '2026-10-20' })).status, 200);
  assert.equal((await post({ code: 'DEUX', percent: 20, max: 2 })).status, 200);
  const dup = await post({ code: 'Pct10', percent: 5 });
  assert.equal(dup.status, 409, 'doublon refusé (casse ignorée)'); assert.match((await dup.json()).error, /existe déjà/);
  assert.equal((await post({ code: 'PASSE', percent: 5, expires: '2026-10-01' })).status, 400, 'date déjà passée refusée');
  const list = async (now) => (await (await promoRoutes(req('GET', '/admin/promos'), '/admin/promos', call, json, now)).json()).promos;
  const by = (l, c) => l.find((x) => x.code === c);
  let l = await list(NOW);
  assert.deepEqual(l.map((x) => x.status), ['on', 'on', 'on', 'on']);
  assert.equal(by(l, 'EUR5').off, '-5,00 €'); assert.equal(by(l, 'EUR5').min, 40); assert.equal(by(l, 'PCT10').off, '-10 %');
  // Désactivation puis réactivation.
  const id10 = by(l, 'PCT10').id;
  await promoRoutes(req('POST', '/admin/promos/toggle', { id: id10, active: false }), '/admin/promos/toggle', call, json, NOW);
  assert.equal(by(await list(NOW), 'PCT10').status, 'off');
  // Le code désactivé peut être recréé (Stripe n'impose l'unicité qu'aux codes actifs) ; ici on le réactive.
  await promoRoutes(req('POST', '/admin/promos/toggle', { id: id10, active: true }), '/admin/promos/toggle', call, json, NOW);
  assert.equal(by(await list(NOW), 'PCT10').status, 'on');
  // Le temps passe : « ETE » expire le 20/10 à minuit Paris ; « DEUX » atteint sa limite.
  promos.find((x) => x.code === 'DEUX').times_redeemed = 2;
  l = await list(Date.parse('2026-10-21T10:00:00Z'));
  assert.equal(by(l, 'ETE').status, 'expired'); assert.equal(by(l, 'ETE').active, false);
  assert.equal(by(l, 'DEUX').status, 'exhausted'); assert.equal(by(l, 'PCT10').status, 'on');
  // Décision au paiement d'après les réglages envoyés (casse ignorée, comme Stripe).
  const accepts = (code, cart, now) => {
    const r = promos.find((x) => x.code.toLowerCase() === code.trim().toLowerCase());
    if (!r) return 'inexistant';
    if (!r.active) return 'désactivé';
    if (r.expires_at && r.expires_at * 1000 <= now) return 'expiré';
    if (r.max_redemptions && r.times_redeemed >= r.max_redemptions) return 'épuisé';
    if (r.restrictions.minimum_amount && cart * 100 < r.restrictions.minimum_amount) return 'panier trop bas';
    return 'ok';
  };
  const T = Date.parse('2026-10-21T10:00:00Z');
  assert.equal(accepts('pct10', 100, T), 'ok'); assert.equal(accepts('PcT10', 100, T), 'ok'); assert.equal(accepts(' PCT10 ', 100, T), 'ok');
  assert.equal(accepts('eur5', 30, T), 'panier trop bas'); assert.equal(accepts('EUR5', 40, T), 'ok');
  assert.equal(accepts('ete', 100, NOW), 'ok'); assert.equal(accepts('ETE', 100, T), 'expiré');
  assert.equal(accepts('deux', 100, T), 'épuisé'); assert.equal(accepts('NOPE', 100, T), 'inexistant');
});

test('liste : un code expiré ou épuisé n\'est pas « désactivé » et ne se réactive pas', () => {
  const base = { id: 'p', code: 'X', active: false, coupon: { percent_off: 10, valid: true } };
  assert.equal(promoRow({ ...base, expires_at: 1000 }, NOW).status, 'expired');
  assert.equal(promoRow({ ...base, max_redemptions: 2, times_redeemed: 2 }, NOW).status, 'exhausted');
  assert.equal(promoRow(base, NOW).status, 'off');
  assert.equal(promoRow({ ...base, active: true }, NOW).status, 'on');
});
