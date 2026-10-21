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
  { permalink: 'nomen', name: 'Pantalon rouge', name_en: 'Red trousers', price: 50, url: '/p/nomen', images: [], quantity: 3, shipping: line(0, 29), weight_g: 300, mode: 'colis', alone: false, shipping_derived: true },
  { permalink: 'serie', name: 'Série', price: 20, url: '/p/serie', images: [], quantity: 3, shipping: line(0, 29), weight_g: 300, mode: 'colis', alone: false, shipping_derived: true },
];
const WH = 'whsec_test123';

let worker, StockDO, env, sessions, mails, stripeCreated, refunds;
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
    if (url === 'https://api.stripe.com/v1/refunds') { const b = new URLSearchParams(opt.body); refunds.push(b); return new Response(JSON.stringify({ id: 're_' + refunds.length })); }
    if (url === 'https://api.resend.com/emails') { mails.push(JSON.parse(opt.body)); return new Response('{}'); }
    const m = /^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions(?:\/([^/?]+))?(\/expire)?/.exec(url);
    if (m && !m[1] && /payment_intent=/.test(url)) { const pi = decodeURIComponent(/payment_intent=([^&]+)/.exec(url)[1]); return new Response(JSON.stringify({ data: [...sessions.values()].filter((x) => (x.full || x).payment_intent === pi).map((x) => x.full || x) })); }
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
  sessions = new Map(); mails = []; stripeCreated = []; refunds = [];
  const raw = new StockDO(); raw.ctx = { storage: fakeStorage() };
  // Un Durable Object traite les appels l'un après l'autre (« input gates » de Cloudflare) : on le simule avec une file.
  let queue = Promise.resolve();
  const dos = new Proxy(raw, { get: (o, k) => (typeof o[k] === 'function' ? (...a) => { const r = queue.then(() => o[k](...a)); queue = r.catch(() => {}); return r; } : o[k]) });
  env = {
    STRIPE_SECRET_KEY: 'rk_test_abc', STRIPE_WEBHOOK_SECRET: WH, SITE_BASE: 'http://site.invalid', ALLOWED_ORIGIN: 'http://site.invalid', ADMIN_GITHUB_LOGIN: 'x',
    RESEND_API_KEY: 're_x', ALERT_EMAIL: 'alex-vendeur@example.com', MAIL_FROM: 'vgthmind <commande@vgthmind.org>', LIVE_MODE: '0',
    HOLDS: makeKV(), STOCK_CACHE_MS: '0', STOCK: { idFromName: () => 'main', get: () => dos },
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

test('pièce unique : mettre au panier / ouvrir le paiement ne bloque personne, le premier à PAYER gagne et l’autre session est expirée', async () => {
  const a = await checkout('cart-aaaaaaaa');
  const b = await checkout('cart-bbbbbbbb', 'uniq', 'FR');
  assert.ok(a.url && b.url, 'les deux peuvent ouvrir le paiement');
  assert.equal(stripeCreated.length, 2);
  await webhook('checkout.session.completed', pay(b.id, { country: 'FR', ship: 0, total: 1000 }));
  assert.equal((await stock()).uniq, 0);
  assert.equal(sessions.get(a.id).status, 'expired', 'la session de l’autre client est expirée');
  assert.equal(refunds.length, 0);
  const c = await checkout('cart-cccccccc', 'uniq', 'FR');
  assert.equal(c.status, 409); assert.equal(c.problems[0].reason, 'vendue');
});

test('deux paiements à la même seconde : le second est remboursé automatiquement, mail d’excuse, pas de commande', async () => {
  const a = await checkout('cart-aaaaaaaa');
  const b = await checkout('cart-bbbbbbbb', 'uniq', 'FR');
  const fa = pay(a.id), fb = pay(b.id, { country: 'FR', ship: 0, total: 1000 });
  fb.payment_intent = 'pi_second';
  const [ra, rb] = await Promise.all([webhook('checkout.session.completed', fa), webhook('checkout.session.completed', fb)]);
  assert.equal(ra.status, 200); assert.equal(rb.status, 200);
  assert.equal((await stock()).uniq, 0);
  assert.equal(refunds.length, 1, 'un seul remboursement');
  const ref = refunds[0];
  assert.ok(['pi_test', 'pi_second'].includes(ref.get('payment_intent')));
  const sorry = mails.filter((m) => m.to[0] === 'client@example.com' && /rembours|refund/i.test(m.subject));
  assert.equal(sorry.length, 1, 'mail d’excuse au client remboursé');
  assert.match(sorry[0].text, /rembours|refunded/i);
  const orderMails = mails.filter((m) => /Nouvelle commande|Order|Commande/i.test(m.subject) && !/rembours|refund/i.test(m.subject));
  assert.equal(orderMails.length, 2, 'mails de commande (vendeur + client) pour le seul premier paiement');
  assert.ok(mails.some((m) => m.to[0] === 'alex-vendeur@example.com' && /deux fois/i.test(m.subject)), 'alerte vendeur');
  // webhook rejoué : pas de 2e remboursement ni de 2e mail
  const loser = ref.get('metadata[session]');
  await webhook('checkout.session.completed', sessions.get(loser).full);
  assert.equal(refunds.length, 1);
  assert.equal(mails.filter((m) => /rembours|refund/i.test(m.subject) && m.to[0] === 'client@example.com').length, 1);
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

test('série : 3 en stock, 2 clients (2 + 2) peuvent tous deux ouvrir le paiement ; quand l’un paie, la session de l’autre (plus assez de stock) est expirée', async () => {
  const a = await checkout('cart-aaaaaaaa', 'serie', 'FR', 2);
  const b = await checkout('cart-bbbbbbbb', 'serie', 'FR', 2);
  assert.ok(a.url && b.url);
  await webhook('checkout.session.completed', pay(a.id, { country: 'FR', ship: 0, total: 4000 }));
  assert.equal((await stock()).serie, 1);
  assert.equal(sessions.get(b.id).status, 'expired');
});

test('série : si le stock reste suffisant pour l’autre client, sa session n’est PAS expirée', async () => {
  const a = await checkout('cart-aaaaaaaa', 'serie', 'FR', 1);
  const b = await checkout('cart-bbbbbbbb', 'serie', 'FR', 1);
  await webhook('checkout.session.completed', pay(a.id, { country: 'FR', ship: 0, total: 2000 }));
  assert.equal((await stock()).serie, 2);
  assert.equal(sessions.get(b.id).status, 'open');
});

test('abandon : /release (page « annulé ») expire la session ; la pièce reste en vente', async () => {
  const a = await checkout('cart-aaaaaaaa');
  const r = await (await call('/release', { id: a.id })).json();
  assert.equal(sessions.get(a.id).status, 'expired'); assert.deepEqual(r.sold, []);
  assert.ok((await checkout('cart-bbbbbbbb', 'uniq', 'FR')).url);
  assert.equal((await stock()).uniq, 1);
});

test('/release après une vente à un autre : dit quelles pièces ont été vendues entre-temps', async () => {
  const a = await checkout('cart-aaaaaaaa');
  const b = await checkout('cart-bbbbbbbb', 'uniq', 'FR');
  await webhook('checkout.session.completed', pay(b.id, { country: 'FR', ship: 0, total: 1000 }));
  const r = await (await call('/release', { id: a.id })).json();
  assert.deepEqual(r.sold, ['uniq']);
});

test('abandon : session Stripe expirée (webhook) ne change pas le stock', async () => {
  const a = await checkout('cart-aaaaaaaa');
  await webhook('checkout.session.expired', { id: a.id, metadata: sessions.get(a.id).metadata });
  assert.ok((await checkout('cart-bbbbbbbb', 'uniq', 'FR')).url);
  assert.equal((await stock()).uniq, 1);
});

test('/release ne touche pas une session déjà payée', async () => {
  const a = await checkout('cart-aaaaaaaa');
  pay(a.id);
  await call('/release', { id: a.id });
  assert.equal(sessions.get(a.id).status, 'complete');
});

test('webhook : signature fausse refusée, rien décompté', async () => {
  const a = await checkout('cart-aaaaaaaa');
  const r = await worker.fetch(new Request('http://w.invalid/webhook', { method: 'POST', body: JSON.stringify({ type: 'checkout.session.completed', data: { object: pay(a.id) } }), headers: { 'stripe-signature': 't=1,v1=abc' } }), env, {});
  assert.equal(r.status, 400); assert.equal((await stock()).uniq, 1);
});

test('mail de commande Belgique : bon pays, port 20 € (vrai tarif zone A 19,39 arrondi, 938 g -> 1 kg), total 30 € ; expéditeur commande@, réponse contact@ ; vendeur et client', async () => {
  const a = await checkout('cart-aaaaaaaa', 'uniq', 'BE');
  assert.equal(stripeCreated[0].get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '2000');
  assert.equal(stripeCreated[0].get('shipping_address_collection[allowed_countries][0]'), 'BE');
  await webhook('checkout.session.completed', pay(a.id, { country: 'BE', ship: 2000, total: 3000 }));
  assert.equal(mails.length, 2);
  const client = mails.find((m) => m.to[0] === 'client@example.com'), seller = mails.find((m) => m.to[0] === 'alex-vendeur@example.com');
  for (const m of mails) { assert.match(m.from, /commande@vgthmind.org/); assert.equal(m.reply_to, 'contact@vgthmind.org'); }
  assert.match(seller.subject, /\[TEST\] Nouvelle commande 30,00 EUR — Belgique/);
  assert.match(seller.text, /20,00 EUR/); assert.match(seller.text, /30,00 EUR/);
  assert.match(client.text, /20,00\s€/); assert.match(client.text, /30,00\s€/); assert.match(client.text, /Bruxelles/);
  await webhook('checkout.session.completed', sessions.get(a.id).full); // webhook rejoué : pas de 2e envoi
  assert.equal(mails.length, 2);
});

test('mail de commande Canada : port 30 (1 pièce), total 40', async () => {
  const a = await checkout('cart-aaaaaaaa', 'uniq', 'CA');
  assert.equal(stripeCreated[0].get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '3000');
  await webhook('checkout.session.completed', pay(a.id, { country: 'CA', ship: 3000, total: 4000 }));
  const client = mails.find((m) => m.to[0] === 'client@example.com'), seller = mails.find((m) => m.to[0] === 'alex-vendeur@example.com');
  assert.match(seller.subject, /40,00 EUR — Canada/); assert.match(client.text, /€30.00/); assert.match(client.text, /€40.00/);
});

// --- Langue choisie sur le site : page Stripe, nom de la pièce, mails ---
const lineName = (b) => b.get('line_items[0][price_data][product_data][name]');
const checkoutLang = async (lang, slug = 'nomen', country = 'BE') => {
  const r = await call('/checkout', { items: [{ slug, qty: 1 }], country, cart_id: 'cart-lang-' + String(lang) + slug, ...(lang ? { lang } : {}) });
  return { ...(await r.json()) };
};

test('langue EN : page Stripe en anglais, nom anglais de la pièce, langue gardée dans la session', async () => {
  const j = await checkoutLang('en'); assert.ok(j.url);
  const b = stripeCreated[0];
  assert.equal(b.get('locale'), 'en'); assert.equal(lineName(b), 'Red trousers'); assert.equal(b.get('metadata[lang]'), 'en');
});

test('langue FR : page Stripe en français, nom français', async () => {
  assert.ok((await checkoutLang('fr')).url);
  const b = stripeCreated[0];
  assert.equal(b.get('locale'), 'fr'); assert.equal(lineName(b), 'Pantalon rouge');
});

test('langue EN sans nom anglais : le nom français reste ; sans langue : locale auto (ancien panier)', async () => {
  assert.ok((await checkoutLang('en', 'serie')).url);
  assert.equal(lineName(stripeCreated[0]), 'Série');
  stripeCreated.length = 0;
  assert.ok((await checkoutLang(undefined)).url);
  assert.equal(stripeCreated[0].get('locale'), 'auto'); assert.equal(lineName(stripeCreated[0]), 'Pantalon rouge');
  assert.equal(stripeCreated[0].get('metadata[lang]'), null);
  stripeCreated.length = 0;
  assert.ok((await checkoutLang('de', 'serie')).url); // valeur inconnue ignorée
  assert.equal(stripeCreated[0].get('locale'), 'auto');
});

test('mails de commande : langue du site, pas celle du pays (Belgique + EN = anglais ; Canada + FR = français)', async () => {
  const j = await checkoutLang('en', 'uniq', 'BE');
  pay(j.url.split('/').pop(), { country: 'BE' });
  assert.equal((await webhook('checkout.session.completed', sessions.get(j.url.split('/').pop()).full)).status, 200);
  let client = mails.find((m) => m.to[0] === 'client@example.com');
  assert.match(client.subject, /^Thank you/); assert.match(client.html, /lang="en"/); assert.match(client.html, /[?&](amp;)?l=en/); assert.match(client.html, />€25.00</);

  mails = [];
  const k = await checkoutLang('fr', 'serie', 'CA');
  const id = k.url.split('/').pop(); pay(id, { country: 'CA' });
  assert.equal((await webhook('checkout.session.completed', sessions.get(id).full)).status, 200);
  client = mails.find((m) => m.to[0] === 'client@example.com');
  assert.match(client.subject, /^Merci/); assert.match(client.html, /25,00 €/);
});

test('mails de commande : sans langue dans la session (ancienne commande) = selon le pays, comme avant', async () => {
  const j = await checkoutLang(undefined, 'uniq', 'BE');
  const id = j.url.split('/').pop(); pay(id, { country: 'BE' });
  assert.equal((await webhook('checkout.session.completed', sessions.get(id).full)).status, 200);
  assert.match(mails.find((m) => m.to[0] === 'client@example.com').subject, /^Merci/);
});

test('moyens de paiement : carte + Bancontact seulement (ni Klarna ni EPS) ; phrase CGV dans une seule langue, lien au réglage central', async () => {
  await call('/checkout', { items: [{ slug: 'uniq', qty: 1 }], country: 'BE', cart_id: 'cart-pm-fr', lang: 'fr' });
  await call('/checkout', { items: [{ slug: 'nomen', qty: 1 }], country: 'BE', cart_id: 'cart-pm-en', lang: 'en' });
  const [fr, en] = stripeCreated;
  for (const b of [fr, en]) {
    assert.equal(b.get('payment_method_types[0]'), 'card'); assert.equal(b.get('payment_method_types[1]'), 'bancontact'); assert.equal(b.get('payment_method_types[2]'), null);
  }
  assert.equal(fr.get('consent_collection[terms_of_service]'), 'required');
  assert.equal(fr.get('custom_text[terms_of_service_acceptance][message]'), "J'accepte les [conditions de vente](http://site.invalid/infos-conditions-generales/).");
  assert.equal(en.get('custom_text[terms_of_service_acceptance][message]'), 'I accept the [terms of sale](http://site.invalid/infos-conditions-generales/).');
});

test('admin : « Se déconnecter » révoque la session côté Worker (même copiée ailleurs, elle ne marche plus) ; sans session = 401', async () => {
  env.SESSION_SECRET = 'secret-de-test';
  const mk = (iatOffset = 0) => {
    const exp = Math.floor(Date.now() / 1000) + 12 * 3600 + iatOffset;
    const sig = createHmac('sha256', env.SESSION_SECRET).update(`vgs.${exp}.x`).digest('base64url');
    return `vgs.${exp}.${sig}`;
  };
  const api = (path, tok, method = 'GET') => worker.fetch(new Request('http://w.invalid' + path, { method, headers: tok ? { Authorization: 'Bearer ' + tok } : {} }), env, { waitUntil: () => {} });
  const old = mk();
  assert.equal((await api('/admin/stock', old)).status, 200);
  assert.equal((await api('/admin/stock', '')).status, 401);
  assert.equal((await api('/admin/stock', 'vgs.9999999999.' + 'a'.repeat(43))).status, 401);
  const otherDevice = mk(3); // connexion simultanée sur un autre appareil (iPhone / PC)
  assert.equal((await api('/admin/stock', otherDevice)).status, 200);
  assert.equal((await api('/admin/logout', old, 'POST')).status, 200);
  assert.equal((await api('/admin/stock', old)).status, 401, 'la session copiée est refusée');
  assert.equal((await api('/admin/stock', otherDevice)).status, 200, 'se déconnecter ici ne coupe pas l’autre appareil');
  assert.equal((await api('/admin/stock', mk(5))).status, 200, 'une nouvelle connexion (émise après) fonctionne');
  assert.equal((await api('/admin/stock', mk(1))).status, 200, 'une connexion une seconde plus tard fonctionne (plus de révocation globale par date)');
});

test('grille des ports lue sur le site : le jeton interne du Worker reste accepté après une déconnexion de l’admin', async () => {
  env.SESSION_SECRET = 'secret-de-test';
  const mem = new Map([['admin:revoked', String(Math.floor(Date.now() / 1000) - 5)]]); // quelqu'un s'est déconnecté il y a 5 s
  const kv = { get: async (k) => (mem.has(k) ? mem.get(k) : null), put: async (k, v) => { mem.set(k, v); }, delete: async () => {}, list: async () => ({ keys: [] }) };
  const real = globalThis.fetch; let token = '';
  globalThis.fetch = async (url, opt = {}) => {
    if (String(url).endsWith('/admin/shipping-config.json')) { token = decodeURIComponent(/vg-admin=([^;]+)/.exec((opt.headers || {}).Cookie || '')[1]); return new Response(JSON.stringify(config)); }
    return real(url, opt);
  };
  try {
    const env2 = { ...env, HOLDS: kv };
    const r = await worker.fetch(new Request('http://w.invalid/shipping/quote', { method: 'POST', body: JSON.stringify({ items: [{ slug: 'uniq', qty: 1 }], country: 'FR' }) }), env2, { waitUntil: () => {} });
    assert.equal((await r.json()).ok, true);
    const renew = await worker.fetch(new Request('http://w.invalid/admin/renew', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }), env2, { waitUntil: () => {} });
    assert.equal(renew.status, 200, 'le garde des pages /admin accepte le jeton interne');
  } finally { globalThis.fetch = real; }
});

test('code promo : ligne « Remise » dans le mail client (FR et EN) quand Stripe a appliqué une remise', async () => {
  const j = await checkoutLang('fr', 'uniq', 'BE');
  const id = j.url.split('/').pop(); const full = pay(id, { country: 'BE' });
  full.total_details = { amount_discount: 500 };
  assert.equal((await webhook('checkout.session.completed', full)).status, 200);
  const client = mails.find((m) => m.to[0] === 'client@example.com');
  assert.match(client.html, /Remise/); assert.match(client.html, /- 5,00\s€/); assert.match(client.text, /Remise : - 5,00\s€/);
});

test('remboursement : charge.refunded marque la commande « remboursée » (KV) et prévient l’admin, sans remettre en stock', async () => {
  const j = await checkoutLang('fr', 'uniq', 'BE');
  const id = j.url.split('/').pop(); const full = pay(id, { country: 'BE' });
  await webhook('checkout.session.completed', full);
  const before = await stock();
  mails = [];
  const r = await webhook('charge.refunded', { id: 'ch_1', payment_intent: 'pi_test', amount: 2500, amount_refunded: 2500, currency: 'eur' });
  assert.equal(r.status, 200);
  const saved = JSON.parse(await env.HOLDS.get('refunded:' + id));
  assert.equal(saved.full, true); assert.equal(saved.amount, 25);
  assert.ok(mails.some((m) => /rembours/i.test(m.subject)));
  assert.deepEqual(await stock(), before);
});

test('avoir : une commande remboursée donne une facture avec un avoir lié (total), côté client (/invoice) et admin', async () => {
  const j = await checkoutLang('fr', 'uniq', 'BE');
  const id = j.url.split('/').pop(); const full = pay(id, { country: 'BE' });
  await webhook('checkout.session.completed', full);
  const ref = /o=(VG-[A-Z0-9]{6})/.exec(mails.find((m) => m.to[0] === 'client@example.com').html)[1];
  let r = await (await call('/invoice', { ref, email: 'client@example.com' })).json();
  assert.equal(r.ok, true); assert.equal(r.invoice.credit, undefined);
  await webhook('charge.refunded', { id: 'ch_1', payment_intent: 'pi_test', amount: 2500, amount_refunded: 2500, currency: 'eur' });
  r = await (await call('/invoice', { ref, email: 'client@example.com' })).json();
  assert.equal(r.invoice.credit.full, true); assert.equal(r.invoice.credit.amount, 25); assert.match(r.invoice.credit.number, /^TEST-AV-/);
  const t = await (await call('/track', { ref, email: 'client@example.com' })).json();
  assert.equal(t.refunded, true);
});

test('compte Stripe partagé (Big Cartel) : objets étrangers ignorés (200, rien d’autre) ; nos sessions portent la marque vg=1 et restent traitées', async () => {
  const a = await checkout('cart-aaaaaaaa');
  assert.equal(stripeCreated[0].get('metadata[vg]'), '1');
  assert.equal(stripeCreated[0].get('payment_intent_data[metadata][vg]'), '1');
  // session payée étrangère : ni stock, ni mail, ni alerte
  mails = [];
  const foreign = { ...pay(a.id), id: 'cs_test_bigcartel', metadata: {} };
  assert.equal((await webhook('checkout.session.completed', foreign)).status, 200);
  assert.equal((await stock()).uniq, 1); assert.equal(mails.length, 0);
  // paiement échoué étranger : pas d'alerte
  assert.equal((await webhook('payment_intent.payment_failed', { id: 'pi_bc', amount: 500, currency: 'eur', metadata: {} })).status, 200);
  assert.equal(mails.length, 0);
  // remboursement étranger (session inconnue, ou session étrangère) : rien
  assert.equal((await webhook('charge.refunded', { id: 'ch_bc', payment_intent: 'pi_inconnu', amount: 500, amount_refunded: 500, currency: 'eur' })).status, 200);
  sessions.set('cs_test_bc2', { id: 'cs_test_bc2', payment_intent: 'pi_bc2', metadata: {} });
  assert.equal((await webhook('charge.refunded', { id: 'ch_bc2', payment_intent: 'pi_bc2', amount: 500, amount_refunded: 500, currency: 'eur' })).status, 200);
  assert.equal(await env.HOLDS.get('refunded:cs_test_bc2'), null); assert.equal(mails.length, 0);
  // notre session : toujours traitée (stock décompté)
  await webhook('checkout.session.completed', sessions.get(a.id).full || pay(a.id));
  assert.equal((await stock()).uniq, 0);
  assert.ok(mails.length > 0);
});
