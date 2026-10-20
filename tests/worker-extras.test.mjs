// Worker : facture W-AAAA-NNN, alertes mail, limite de connexion admin.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const hooks = `
export async function resolve(spec, ctx, next) { if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject {}', shortCircuit: true }; if (/^[.]{1,2}[/]/.test(spec) && !/[.][a-z]+$/.test(spec)) return next(spec + '.ts', ctx); return next(spec, ctx); }`;
register('data:text/javascript,' + encodeURIComponent(hooks));

let worker, mails, kv, counter;
const SID = 'cs_test_' + 'a'.repeat(20);
const stripeSession = (over = {}) => ({
  id: SID, payment_status: 'paid', livemode: true, created: 1790000000, currency: 'eur', amount_total: 4000,
  customer_details: { email: 'ana@ex.fr', name: 'Ana' },
  collected_information: { shipping_details: { name: 'Ana', address: { line1: '1 rue X', postal_code: '75001', city: 'Paris', country: 'FR' } } },
  shipping_cost: { amount_total: 500 }, total_details: { amount_discount: 0 },
  line_items: { data: [{ quantity: 1, amount_total: 3500, price: { unit_amount: 3500, product: { name: 'CH_0002', metadata: { slug: 'ch_0002' } } } }] },
  ...over,
});
let session = stripeSession();

const mkKv = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, String(v)); }, delete: async (k) => { m.delete(k); }, list: async (o = {}) => ({ keys: [...m.keys()].filter((k) => k.startsWith(o.prefix || '')).map((name) => ({ name })), list_complete: true }), m }; };
const env = () => ({
  STRIPE_SECRET_KEY: 'sk_test_abc', SITE_BASE: 'http://site.invalid', ALLOWED_ORIGIN: 'http://site.invalid', ADMIN_GITHUB_LOGIN: 'x',
  RESEND_API_KEY: 're_x', ALERT_EMAIL: 'me@ex.fr', MAIL_FROM: 'v <c@vgthmind.org>', STRIPE_WEBHOOK_SECRET: 'whsec_test',
  HOLDS: kv,
  STOCK: { idFromName: () => 'main', get: () => ({ invoiceNumber: async () => `W-2026-${String(++counter).padStart(3, '0')}`, release: async () => {} }) },
});

before(async () => {
  worker = (await import('../checkout-worker/index.ts')).default;
  globalThis.fetch = async (url, opt = {}) => {
    url = String(url);
    if (url.endsWith('/products.json')) return new Response('[]');
    if (url.startsWith('https://api.stripe.com/v1/checkout/sessions/')) return new Response(JSON.stringify(session));
    if (url === 'https://api.resend.com/emails') { mails.push(JSON.parse(opt.body)); return new Response('{}', { status: mails.fail ? 500 : 200 }); }
    throw new Error('fetch inattendu ' + url);
  };
});
const reset = () => { mails = []; kv = mkKv(); counter = 0; session = stripeSession(); };

const post = (path, body, headers = {}) => worker.fetch(new Request('http://w.invalid' + path, { method: 'POST', body: JSON.stringify(body), headers }), env(), {});

async function signed(payload) {
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('whsec_test'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${t},v1=${sig}`;
}

test('facture client : numéro + e-mail, W-AAAA-NNN, mention 293 B, montants', async () => {
  reset();
  await kv.put('ref:VG-ABC234', SID);
  const r = await post('/invoice', { ref: 'VG-ABC234', email: 'ANA@ex.fr' });
  const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.ok, true);
  assert.match(j.invoice.number, /^W-2026-\d{3}$/);
  assert.equal(j.invoice.vat, 'TVA non applicable, art. 293 B du CGI');
  assert.equal(j.invoice.total, 40); assert.equal(j.invoice.shipping, 5); assert.equal(j.invoice.lines.length, 1);
  assert.equal(j.invoice.seller.siret, '952 025 369 00028');
});

test('facture client : mauvais e-mail = refus neutre, pas de facture', async () => {
  reset();
  await kv.put('ref:VG-ABC234', SID);
  const r = await post('/invoice', { ref: 'VG-ABC234', email: 'autre@ex.fr' });
  assert.equal(r.status, 404); assert.equal((await r.json()).invoice, undefined);
});

test('facture : commande de test = numéro TEST-<ref> (aucun numéro légal consommé)', async () => {
  reset(); session = stripeSession({ livemode: false });
  await kv.put('ref:VG-ABC234', SID);
  const j = await (await post('/invoice', { ref: 'VG-ABC234', email: 'ana@ex.fr' })).json();
  assert.match(j.invoice.number, /^TEST-VG-/); assert.equal(counter, 0); assert.equal(j.invoice.test, true);
});

test('alerte : paiement Stripe échoué = mail d’alerte à ALERT_EMAIL', async () => {
  reset();
  const payload = JSON.stringify({ type: 'payment_intent.payment_failed', livemode: false, data: { object: { id: 'pi_1', metadata: { vg: '1' }, amount: 4000, currency: 'eur', last_payment_error: { message: 'Carte refusée' } } } });
  const r = await post('/webhook', JSON.parse(payload) && undefined, {});
  assert.ok(r.status >= 400);
  const req = new Request('http://w.invalid/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': await signed(payload) } });
  const res = await worker.fetch(req, env(), {});
  assert.equal(res.status, 200);
  assert.equal(mails.length, 1); assert.equal(mails[0].to[0], 'me@ex.fr'); assert.match(mails[0].subject, /ALERTE/); assert.match(mails[0].text, /Carte refusée/);
});

test('alerte : la même alerte n’est pas renvoyée avant 10 min', async () => {
  reset();
  const payload = JSON.stringify({ type: 'payment_intent.payment_failed', data: { object: { id: 'pi_2', metadata: { vg: '1' }, amount: 100, currency: 'eur' } } });
  for (let i = 0; i < 2; i++) await worker.fetch(new Request('http://w.invalid/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': await signed(payload) } }), env(), {});
  assert.equal(mails.length, 1);
});

test('connexion admin : seuls les ÉCHECS comptent (12 par IP, puis 429) ; les connexions réussies ne bloquent jamais', async () => {
  reset();
  const h = { 'CF-Connecting-IP': '9.9.9.9' };
  const start = () => worker.fetch(new Request('http://w.invalid/auth', { headers: h }), env(), {});
  let last;
  for (let i = 0; i < 40; i++) last = await start(); // 40 départs de connexion (réussies ou non encore jugées) : jamais 429
  assert.notEqual(last.status, 429);
  const fail = () => worker.fetch(new Request('http://w.invalid/callback?state=inconnu&code=x', { headers: h }), env(), {}); // session expirée = échec
  for (let i = 0; i < 12; i++) assert.notEqual((await fail()).status, 429);
  assert.equal((await start()).status, 429);
  assert.equal((await fail()).status, 429);
  const other = await worker.fetch(new Request('http://w.invalid/auth', { headers: { 'CF-Connecting-IP': '8.8.8.8' } }), env(), {});
  assert.notEqual(other.status, 429); // une autre IP n'est pas touchée
});

test('sauvegarde nocturne des commandes : états expédiée / préparation / numéros', async () => {
  reset();
  await kv.put('shipped:' + SID, JSON.stringify({ at: 1, tracking: 'XY1' }));
  await kv.put('preparing:cs_test_' + 'b'.repeat(20), JSON.stringify({ at: 2 }));
  await kv.put('sref:' + SID, 'VG-ABC234');
  const e = env(); e.STOCK = { idFromName: () => 'm', get: () => ({ snapshot: async () => ({}) }) };
  const jobs = [];
  await worker.scheduled(null, e, { waitUntil: (p) => jobs.push(p) });
  await Promise.all(jobs);
  const b = JSON.parse(await kv.get('obackup:latest'));
  assert.equal(b.shipped[SID].tracking, 'XY1');
  assert.equal(Object.keys(b.preparing).length, 1);
  assert.equal(b.refs[SID], 'VG-ABC234');
  assert.ok(await kv.get('obackup:' + b.date));
});

test('remboursement depuis Commandes : refusé sans session admin', async () => {
  reset();
  const r = await worker.fetch(new Request('https://w.invalid/orders/refund', { method: 'POST', body: JSON.stringify({ id: SID }) }), env(), {});
  assert.equal(r.status, 401);
});
