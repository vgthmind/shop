// Stock + commande de bout en bout : vrai StockDO (stockage simulé), Stripe et Resend simulés.
// Couvre : pièce unique jamais vendue 2 fois, abandon du paiement, décompte APRÈS paiement seulement, sold out à 0, mail de commande.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const hooks = `
export async function resolve(spec, ctx, next) { if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject {}', shortCircuit: true }; if (/^[.]{1,2}[/]/.test(spec) && !/[.][a-z]+$/.test(spec)) return next(spec + '.ts', ctx); return next(spec, ctx); }`;
register('data:text/javascript,' + encodeURIComponent(hooks));

const config = JSON.parse(readFileSync(new URL('../admin/shipping-config.json', import.meta.url), 'utf8'));
const line = (fr, intl) => [{ amount_alone: fr, country: { code: 'FR' } }, ...(intl == null ? [] : [{ amount_alone: intl }])];
const catalog = [
  { permalink: 'uniq', name: 'Pièce unique', price: 10, url: '/p/uniq', images: [], quantity: 1, shipping: line(0, 29), weight_g: 800, mode: 'colis', alone: false, shipping_derived: true, description: 'Size M' },
  { permalink: 'serie', name: 'Série', price: 20, url: '/p/serie', images: [], quantity: 3, shipping: line(0, 29), weight_g: 300, mode: 'colis', alone: false, shipping_derived: true },
];
const WH = 'whsec_test123';

let worker, StockDO, env, sessions, mails, stripeCreated;
const fakeStorage = () => {
  const m = new Map();
  return {
    get: async (k) => m.get(k), put: async (k, v) => { m.set(k, v); }, delete: async (k) => m.delete(k),
    list: async ({ prefix }) => new Map([...m].filter(([k]) => k.startsWith(prefix))),
  };
};
const makeKV = () => {
  const m = new Map();
  return { get: async (k) => (k === 'shipping:config' ? JSON.stringify(config) : m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); }, list: async () => ({ keys: [] }) };
};

before(async () => {
  const mod = await import('../checkout-worker/index.ts');
  worker = mod.default; StockDO = mod.StockDO;
  globalThis.fetch = async (url, opt = {}) => {
    url = String(url);
    if (url.endsWith('/products.json')) return new Response(JSON.stringify(catalog));
    if (url === 'https://api.resend.com/emails') { mails.push(JSON.parse(opt.body)); return new Response('{}'); }
    const m = /^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions(?:\/([^/?]+))?(\/expire)?/.exec(url);
    if (m && opt.method === 'POST' && !m[1]) {
      const id = 'cs_test_' + (sessions.size + 1) + 'x'.repeat(10);
      const b = new URLSearchParams(opt.body);
      stripeCreated.push(b);
      sessions.set(id, { id, status: 'open', payment_status: 'unpaid', livemode: false, currency: 'eur', metadata: Object.fromEntries([...b].filter(([k]) => k.startsWith('metadata[')).map(([k, v]) => [k.slice(9, -1), v])) });
      return new Response(JSON.stringify({ id, url: 'https://stripe.test/' + id }));
    }
    if (m && m[1] && m[2]) { sessions.get(m[1]).status = 'expired'; return new Response('{}'); }
    if (m && m[1]) {
      const s = sessions.get(m[1]); if (!s) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify(s.full || s));
    }
    throw new Error('fetch inattendu ' + url);
  };
});

beforeEach(() => {
  sessions = new Map(); mails = []; stripeCreated = [];
  const raw = new StockDO(); raw.ctx = { storage: fakeStorage() };
  // Un Durable Object traite les appels l'un après l'autre (« input gates » de Cloudflare) : on le simule avec une file.
  let queue = Promise.resolve();
  const dos = new Proxy(raw, { get: (o, k) => (typeof o[k] === 'function' ? (...a) => { const r = queue.then(() => o[k](...a)); queue = r.catch(() => {}); return r; } : o[k]) });
  env = {
    STRIPE_SECRET_KEY: 'rk_test_abc', STRIPE_WEBHOOK_SECRET: WH, SITE_BASE: 'http://site.invalid', ALLOWED_ORIGIN: 'http://site.invalid', ADMIN_GITHUB_LOGIN: 'x',
    RESEND_API_KEY: 're_x', ALERT_EMAIL: 'alex-vendeur@example.com', MAIL_FROM: 'vgthmind <commande@vgthmind.org>', LIVE_MODE: '0',
    HOLDS: makeKV(), STOCK: { idFromName: () => 'main', get: () => dos },
  };
});

const call = (path, body, method = 'POST') => worker.fetch(new Request('http://w.invalid' + path, { method, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil: () => {} });
const stock = async () => (await (await call('/stock', null, 'GET')).json()).stock;
const checkout = async (cart, slug = 'uniq', country = 'BE', qty = 1) => {
  const r = await call('/checkout', { items: [{ slug, qty }], country, cart_id: cart });
  const j = await r.json();
  return { status: r.status, ...j, id: j.url && j.url.split('/').pop() };
};
const webhook = async (type, session) => {
  const payload = JSON.stringify({ type, data: { object: session } });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', WH).update(`${t}.${payload}`).digest('hex');
  return worker.fetch(new Request('http://w.invalid/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': `t=${t},v1=${sig}` } }), env, { waitUntil: () => {} });
};
// Session payée telle que Stripe la renvoie (pays, port et total de la commande).
const pay = (id, { country = 'BE', ship = 1500, total = 2500 } = {}) => {
  const s = sessions.get(id);
  s.status = 'complete'; s.payment_status = 'paid';
  s.full = {
    id, status: 'complete', payment_status: 'paid', livemode: false, currency: 'eur', metadata: s.metadata, amount_total: total, shipping_cost: { amount_total: ship },
    customer_details: { email: 'client@example.com', name: 'Alex Tremblay', address: { country } },
    collected_information: { shipping_details: { name: 'Alex Tremblay', address: { line1: '1 rue Test', city: 'Bruxelles', postal_code: '1000', country } } },
    payment_intent: 'pi_test', line_items: { data: [{ description: 'Pièce unique', quantity: 1, amount_total: 1000, price: { product: { metadata: { slug: 'uniq' }, images: [] } } }] },
  };
  return s.full;
};

test('pièce unique : deux clients en même temps, un seul passe', async () => {
  const [a, b] = await Promise.all([checkout('cart-aaaaaaaa'), checkout('cart-bbbbbbbb', 'uniq', 'FR')]);
  const ok = [a, b].filter((x) => x.url), ko = [a, b].filter((x) => !x.url);
  assert.equal(ok.length, 1); assert.equal(ko.length, 1);
  assert.equal(ko[0].status, 409); assert.equal(ko[0].problems[0].reason, 'reservee');
  assert.equal(stripeCreated.length, 1, 'une seule session Stripe créée');
});

test('le stock ne baisse PAS à la création du paiement, seulement après confirmation', async () => {
  const a = await checkout('cart-aaaaaaaa');
  assert.equal((await stock()).uniq, 1);
  const full = pay(a.id);
  assert.equal((await webhook('checkout.session.completed', full)).status, 200);
  assert.equal((await stock()).uniq, 0);
});

test('à 0 la pièce est vendue : nouveau client refusé (vendue), webhook rejoué = pas de double décompte', async () => {
  const a = await checkout('cart-aaaaaaaa', 'serie', 'FR', 3);
  const full = pay(a.id);
  await webhook('checkout.session.completed', full);
  await webhook('checkout.session.completed', full);
  assert.equal((await stock()).serie, 0);
  const c = await checkout('cart-cccccccc', 'serie', 'FR', 1);
  assert.equal(c.status, 409); assert.equal(c.problems[0].reason, 'vendue');
});

test('série : 3 en stock, 2 clients (2 + 2) -> le second est refusé (réservé par l’autre)', async () => {
  const a = await checkout('cart-aaaaaaaa', 'serie', 'FR', 2);
  const b = await checkout('cart-bbbbbbbb', 'serie', 'FR', 2);
  assert.ok(a.url); assert.equal(b.status, 409); assert.equal(b.problems[0].reason, 'reservee');
});

test('abandon : /release (page « annulé ») remet la pièce en vente', async () => {
  const a = await checkout('cart-aaaaaaaa');
  assert.equal((await checkout('cart-bbbbbbbb', 'uniq', 'FR')).status, 409);
  await call('/release', { id: a.id });
  assert.equal(sessions.get(a.id).status, 'expired');
  assert.ok((await checkout('cart-bbbbbbbb', 'uniq', 'FR')).url);
  assert.equal((await stock()).uniq, 1);
});

test('abandon : session Stripe expirée (webhook) remet la pièce en vente, stock inchangé', async () => {
  const a = await checkout('cart-aaaaaaaa');
  await webhook('checkout.session.expired', { id: a.id, metadata: sessions.get(a.id).metadata });
  assert.ok((await checkout('cart-bbbbbbbb', 'uniq', 'FR')).url);
  assert.equal((await stock()).uniq, 1);
});

test('abandon sans aucun signal : la réservation expire seule après 32 min', async () => {
  const real = Date.now; let t = real();
  Date.now = () => t;
  try {
    await checkout('cart-aaaaaaaa');
    t += 31 * 60 * 1000; assert.equal((await checkout('cart-bbbbbbbb', 'uniq', 'FR')).status, 409);
    t += 2 * 60 * 1000; assert.ok((await checkout('cart-bbbbbbbb', 'uniq', 'FR')).url);
  } finally { Date.now = real; }
});

test('/release ne libère pas une session déjà payée', async () => {
  const a = await checkout('cart-aaaaaaaa');
  pay(a.id);
  await call('/release', { id: a.id });
  assert.equal((await checkout('cart-bbbbbbbb', 'uniq', 'FR')).status, 409);
});

test('webhook : signature fausse refusée, rien décompté', async () => {
  const a = await checkout('cart-aaaaaaaa');
  const r = await worker.fetch(new Request('http://w.invalid/webhook', { method: 'POST', body: JSON.stringify({ type: 'checkout.session.completed', data: { object: pay(a.id) } }), headers: { 'stripe-signature': 't=1,v1=abc' } }), env, {});
  assert.equal(r.status, 400); assert.equal((await stock()).uniq, 1);
});

test('mail de commande Belgique : bon pays, port 15, total 25 ; expéditeur commande@, réponse contact@ ; vendeur et client', async () => {
  const a = await checkout('cart-aaaaaaaa', 'uniq', 'BE');
  assert.equal(stripeCreated[0].get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '1500');
  assert.equal(stripeCreated[0].get('shipping_address_collection[allowed_countries][0]'), 'BE');
  await webhook('checkout.session.completed', pay(a.id, { country: 'BE', ship: 1500, total: 2500 }));
  assert.equal(mails.length, 2);
  const client = mails.find((m) => m.to[0] === 'client@example.com'), seller = mails.find((m) => m.to[0] === 'alex-vendeur@example.com');
  for (const m of mails) { assert.match(m.from, /commande@vgthmind\.org/); assert.equal(m.reply_to, 'contact@vgthmind.org'); }
  assert.match(seller.subject, /\[TEST\] Nouvelle commande 25,00 EUR — Belgique/);
  assert.match(seller.text, /15,00 EUR/); assert.match(seller.text, /25,00 EUR/);
  assert.match(client.text, /15,00 EUR/); assert.match(client.text, /25,00 EUR/); assert.match(client.text, /Bruxelles/);
  await webhook('checkout.session.completed', sessions.get(a.id).full); // webhook rejoué : pas de 2e envoi
  assert.equal(mails.length, 2);
});

test('mail de commande Canada : port 29, total 39', async () => {
  const a = await checkout('cart-aaaaaaaa', 'uniq', 'CA');
  assert.equal(stripeCreated[0].get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '2900');
  await webhook('checkout.session.completed', pay(a.id, { country: 'CA', ship: 2900, total: 3900 }));
  const client = mails.find((m) => m.to[0] === 'client@example.com'), seller = mails.find((m) => m.to[0] === 'alex-vendeur@example.com');
  assert.match(seller.subject, /39,00 EUR — Canada/); assert.match(client.text, /29,00 EUR/); assert.match(client.text, /39,00 EUR/);
});
