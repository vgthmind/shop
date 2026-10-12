// Pièce sur demande, de bout en bout : vrai RequestsDO (stockage simulé), Stripe, Resend et R2 simulés.
// Formulaire + anti-spam, fichiers, devis, mention obligatoire avant l'acompte, acompte payé (webhook), photos et
// validation, retouches incluses / sur devis, solde avec port, circuit des commandes, factures, relances, conservation.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const hooks = `
export async function resolve(spec, ctx, next) { if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject {}', shortCircuit: true }; if (/^[.]{1,2}[/]/.test(spec) && !/[.][a-z]+$/.test(spec)) return next(spec + '.ts', ctx); return next(spec, ctx); }`;
register('data:text/javascript,' + encodeURIComponent(hooks));

const config = JSON.parse(readFileSync(new URL('../admin/shipping-config.json', import.meta.url), 'utf8'));
const catalog = [
  { permalink: 'tee', name: 'Custom Tee-shirt col en v', price: 65, status: 'active', categories: [{ permalink: 'tops' }, { permalink: 'customsupcycling' }], images: [], shipping: [] },
  { permalink: 'ch', name: 'CH_0004', price: 104, status: 'active', categories: [{ permalink: 'tops' }, { permalink: 'customsupcycling' }], images: [], shipping: [] },
  { permalink: 'hood', name: 'Custom Hoodie', price: 120, status: 'active', categories: [{ permalink: 'tops' }, { permalink: 'customsupcycling' }], images: [], shipping: [] },
  { permalink: 'pant', name: 'Pantalon FF001', price: 170, status: 'active', categories: [{ permalink: 'pantsshorts' }], images: [], shipping: [] },
  { permalink: 'short', name: 'Short SG001', price: 85, status: 'active', categories: [{ permalink: 'pantsshorts' }], images: [], shipping: [] },
  { permalink: 'ch2', name: 'CH_0002', price: 84, status: 'active', categories: [{ permalink: 'tops' }], images: [], shipping: [] }, // comme la boutique : haut cousu le moins cher
  { permalink: 'ls', name: 'Longsleeve TD002', price: 210, status: 'active', categories: [{ permalink: 'tops' }], images: [], shipping: [] },
];
const WH = 'whsec_test123', SECRET = 'sess-secret';
const DAY = 86400000;

let worker, RequestsDO, StockDO, env, sessions, mails, created, r2;
const fakeStorage = () => {
  const m = new Map();
  return { get: async (k) => m.get(k), put: async (k, v) => { m.set(k, structuredClone(v)); }, delete: async (k) => m.delete(k), list: async ({ prefix }) => new Map([...m].filter(([k]) => k.startsWith(prefix))) };
};
const queued = (raw) => { let q = Promise.resolve(); return new Proxy(raw, { get: (o, k) => (typeof o[k] === 'function' ? (...a) => { const r = q.then(() => o[k](...a)); q = r.catch(() => {}); return r; } : o[k]) }); };
const makeKV = () => {
  const m = new Map();
  return { get: async (k) => (k === 'shipping:config' ? JSON.stringify(config) : m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); }, list: async () => ({ keys: [] }) };
};

before(async () => {
  const mod = await import('../checkout-worker/index.ts');
  worker = mod.default; RequestsDO = mod.RequestsDO; StockDO = mod.StockDO;
  globalThis.fetch = async (url, opt = {}) => {
    url = String(url);
    if (url.endsWith('/products.json')) return new Response(JSON.stringify(catalog));
    if (url === 'https://api.resend.com/emails') { mails.push(JSON.parse(opt.body)); return new Response('{}'); }
    const m = /^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions(?:\/([^/?]+))?(\/expire)?/.exec(url);
    if (m && opt.method === 'POST' && !m[1]) {
      const id = 'cs_test_' + (sessions.size + 1) + 'r'.repeat(12);
      const b = new URLSearchParams(opt.body);
      created.push(b);
      const metadata = Object.fromEntries([...b].filter(([k]) => /^metadata\[/.test(k)).map(([k, v]) => [k.slice(9, -1), v]));
      sessions.set(id, { id, status: 'open', payment_status: 'unpaid', livemode: false, currency: 'eur', created: Math.floor(Date.now() / 1000), metadata, params: b });
      return new Response(JSON.stringify({ id, url: 'https://stripe.test/' + id }));
    }
    // Comme Stripe : plus de 4 niveaux d'expansion = refus (bug réel du 2026-10-12 sur /orders).
    if (/expand\[\]=[^&]*(\.[^.&]+){4,}/.test(decodeURIComponent(url))) return new Response(JSON.stringify({ error: { message: 'You cannot expand more than 4 levels of a property.' } }), { status: 400 });
    if (m && !m[1] && opt.method !== 'POST') return new Response(JSON.stringify({ data: [...sessions.values()].filter((s) => s.status === 'complete') }));
    if (m && m[1] && m[2]) { sessions.get(m[1]).status = 'expired'; return new Response('{}'); }
    if (m && m[1]) { const s = sessions.get(m[1]); return s ? new Response(JSON.stringify(s)) : new Response('{}', { status: 404 }); }
    throw new Error('fetch inattendu ' + url);
  };
});

beforeEach(() => {
  sessions = new Map(); mails = []; created = []; r2 = new Map();
  const rq = new RequestsDO(); rq.ctx = { storage: fakeStorage() };
  const st = new StockDO(); st.ctx = { storage: fakeStorage() };
  const reqs = queued(rq), stock = queued(st);
  env = {
    STRIPE_SECRET_KEY: 'rk_test_abc', STRIPE_WEBHOOK_SECRET: WH, SITE_BASE: 'http://site.invalid/shop', ALLOWED_ORIGIN: 'http://site.invalid', ADMIN_GITHUB_LOGIN: 'x', SESSION_SECRET: SECRET,
    RESEND_API_KEY: 're_x', ALERT_EMAIL: 'alex-vendeur@example.com', MAIL_FROM: 'vgthmind <commande@vgthmind.org>', LIVE_MODE: '0', WORKER_BASE: 'https://w.invalid',
    HOLDS: makeKV(), STOCK: { idFromName: () => 'main', get: () => stock }, REQUESTS: { idFromName: () => 'main', get: () => reqs },
    FILES: {
      put: async (k, body, o) => { r2.set(k, { bytes: new Uint8Array(await new Response(body).arrayBuffer()), type: o?.httpMetadata?.contentType }); },
      get: async (k) => (r2.has(k) ? { body: r2.get(k).bytes, httpMetadata: { contentType: r2.get(k).type } } : null),
      delete: async (k) => { r2.delete(k); },
    },
  };
});

const adminTok = () => { const exp = Math.floor(Date.now() / 1000) + 3600; return `vgs.${exp}.` + createHmac('sha256', SECRET).update(`vgs.${exp}.x`).digest('base64url'); };
const call = (path, body, method = 'POST', headers = {}) => worker.fetch(new Request('http://w.invalid' + path, { method, body: body == null ? undefined : typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body), headers }), env, { waitUntil: () => {} });
const J = async (r) => ({ status: r.status, ...(await r.json()) });
const admin = (path, body, method = 'POST', headers = {}) => call(path, body, method, { authorization: 'Bearer ' + adminTok(), ...headers }).then(J);
const webhook = async (type, s) => {
  const payload = JSON.stringify({ type, data: { object: s } }), t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', WH).update(`${t}.${payload}`).digest('hex');
  return worker.fetch(new Request('http://w.invalid/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': `t=${t},v1=${sig}` } }), env, { waitUntil: () => {} });
};
const pay = (id, extra = {}) => {
  const s = sessions.get(id);
  const amount = Number(s.params.get('line_items[0][price_data][unit_amount]'));
  const ship = Number(s.params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]') || 0);
  Object.assign(s, { status: 'complete', payment_status: 'paid', amount_total: amount + ship, shipping_cost: { amount_total: ship },
    customer_details: { email: 'alex@example.com', name: 'Alex', address: { country: 'FR', line1: '1 rue A', postal_code: '75001', city: 'Paris' } },
    line_items: { data: [{ description: s.params.get('line_items[0][price_data][product_data][name]'), quantity: 1, amount_total: amount, price: { product: { metadata: {}, images: [] } } }] }, ...extra });
  return s;
};
const FORM = { type: 'custom', lang: 'fr', name: 'Alex', email: 'Alex@Example.com', country: 'FR', piece: 'hoodie', mode: 'know', idea: 'Un hoodie peint à l’aéro, thème océan', colors: 'bleu', size: 'M', t: 9000, photosConsent: true };
const submit = async (f = FORM) => J(await call('/requests', f));
const view = async (id, k) => (await J(await call('/requests/view', { id, k }))).request;
const getReq = async (id) => (await admin('/admin/requests', null, 'GET')).requests.find((r) => r.id === id);

// Parcours custom jusqu'à l'acompte payé.
async function untilDeposit() {
  const { id, k } = await submit();
  await call('/requests/confirm', { id, k });
  const q = await admin('/admin/requests/act', { id, action: 'quote', total: 200, delay: '3 semaines', message: 'Fond bleu nuit.' });
  assert.equal(q.ok, true);
  const dep = await J(await call('/requests/deposit', { id, k, accept: true }));
  const sid = dep.url.split('/').pop();
  await webhook('checkout.session.completed', pay(sid));
  return { id, k, sid };
}

test('formulaire : robots ignorés, champs obligatoires par branche, champs d’une autre branche jetés', async () => {
  const bot = await submit({ ...FORM, website: 'spam' });
  assert.equal(bot.ok, true);
  assert.equal((await admin('/admin/requests', null, 'GET')).requests.length, 0);
  const fast = await submit({ ...FORM, t: 500 });
  assert.equal(fast.id, 'D-000000');
  const bad = await submit({ ...FORM, piece: 'robe', mode: '' });
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.fields.sort(), ['mode', 'piece']);
  const sm = await submit({ ...FORM, type: 'surmesure', piece: 'pantalon', measures: '' });
  assert.deepEqual(sm.fields, ['measures']);
  const prod = await submit({ ...FORM, type: 'production', prodKind: 'location', projectType: 'Clip', dates: '12-14 nov', place: 'Paris', idea: '' });
  assert.equal(prod.ok, true);
  const rec = await getReq(prod.id) || (await call('/requests/confirm', { id: prod.id, k: prod.k }), await getReq(prod.id));
  assert.equal(rec.fields.piece, undefined, 'champ de la branche « pièce » jeté');
  assert.equal(rec.fields.prodKind, 'location');
});

test('formulaire : 3 demandes par heure et par connexion', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await submit()).ok, true);
  assert.equal((await submit()).status, 429);
});

test('fichiers : photos et vidéo acceptées dans les limites, le reste refusé ; mails à la fin de l’envoi', async () => {
  const { id, k } = await submit();
  const put = (type, size, name = 'a.jpg') => call(`/requests/file?id=${id}&k=${k}&name=${name}`, new Uint8Array(4), 'PUT', { 'content-type': type, 'content-length': String(size) }).then(J);
  assert.equal((await put('image/jpeg', 1000)).ok, true);
  assert.equal((await put('application/pdf', 1000)).status, 415);
  assert.equal((await put('image/png', 11 * 1024 * 1024)).status, 413);
  assert.equal((await put('video/mp4', 40 * 1024 * 1024, 'v.mp4')).ok, true);
  assert.equal((await put('video/mp4', 1000, 'v2.mp4')).status, 413, 'une seule vidéo');
  assert.equal((await call(`/requests/file?id=${id}&k=${'x'.repeat(32)}&name=a`, new Uint8Array(4), 'PUT', { 'content-type': 'image/jpeg', 'content-length': '4' })).status, 404, 'mauvais jeton');
  assert.equal(r2.size, 2);
  assert.equal(mails.length, 0, 'pas de mail avant la fin de l’envoi');
  await call('/requests/confirm', { id, k });
  assert.equal(mails.length, 2);
  const client = mails.find((m) => m.to[0] === 'alex@example.com'), alert = mails.find((m) => m.to[0] === 'alex-vendeur@example.com');
  assert.match(client.subject, /bien reçue/);
  assert.match(client.html, /Sweat \/ hoodie/);
  assert.match(alert.subject, /Nouvelle demande D-.*Custom/);
  assert.match(alert.text, /2 fichier\(s\)/);
  await call('/requests/confirm', { id, k });
  assert.equal(mails.length, 2, 'confirmation en double sans nouveau mail');
});

test('acompte : la mention (acompte, L221-28 3°, L214-1, acompte conservé) est obligatoire avant le paiement', async () => {
  const { id, k } = await submit();
  await call('/requests/confirm', { id, k });
  assert.equal((await J(await call('/requests/deposit', { id, k, accept: true }))).status, 409, 'pas de devis : pas de paiement');
  await admin('/admin/requests/act', { id, action: 'quote', total: 200, delay: '3 semaines' });
  const quoteMail = mails.at(-1);
  assert.match(quoteMail.subject, /devis/);
  assert.match(quoteMail.text, /Acompte \(30 %\) à payer maintenant : 60,00 €/);
  const v = await view(id, k);
  assert.match(v.consent, /acompte et non d'arrhes \(article L214-1/);
  assert.match(v.consent, /L221-28 3°/);
  assert.match(v.consent, /30 jours après l'envoi des photos/);
  assert.match(v.consent, /remboursé intégralement/);
  assert.equal(v.notes, undefined, 'pas de notes privées côté client');
  assert.equal((await J(await call('/requests/deposit', { id, k }))).status, 400, 'case non cochée');
  const dep = await J(await call('/requests/deposit', { id, k, accept: true }));
  const p = created.at(-1);
  assert.equal(p.get('line_items[0][price_data][unit_amount]'), '6000');
  assert.equal(p.get('metadata[kind]'), 'deposit');
  assert.equal(p.get('billing_address_collection'), 'required');
  assert.ok(dep.url);
  const rec = await getReq(id);
  assert.ok(rec.deposit.acceptedAt);
  assert.match(rec.log.map((l) => l.what).join('\n'), /Mention acceptée/);
});

test('acompte payé (webhook) : fabrication lancée, mail, pas dans « à expédier », facture d’acompte', async () => {
  const { id, k, sid } = await untilDeposit();
  const rec = await getReq(id);
  assert.equal(rec.status, 'fabrication');
  assert.equal(rec.deposit.amount, 60);
  assert.ok(mails.some((m) => /Acompte reçu/.test(m.subject)));
  assert.ok(!mails.some((m) => /commande vgthmind est confirmée/.test(m.subject)), 'pas de mail de commande pour un acompte');
  const orders = (await admin('/orders', null, 'GET')).orders;
  assert.equal(orders.find((o) => o.id === sid).kind, 'deposit');
  const inv = (await J(await call('/requests/invoice', { id, k, which: 'deposit' }))).invoice;
  assert.equal(inv.title, 'Facture d’acompte');
  assert.equal(inv.number, `TEST-${id}-A`);
  assert.equal(inv.total, 60);
  assert.match(inv.lines[0].name, /Acompte de 30 %/);
  assert.match(inv.notes.join(' '), /et non arrhes/);
  assert.equal(inv.customer.address[0], '1 rue A', 'adresse de facturation');
  // Webhook rejoué : rien en double.
  const n = mails.length;
  await webhook('checkout.session.completed', sessions.get(sid));
  assert.equal(mails.length, n);
});

test('validation sur photos : 1 retouche incluse, la suivante sur devis (alerte), puis validation et solde', async () => {
  const { id, k } = await untilDeposit();
  assert.equal((await admin('/admin/requests/act', { id, action: 'sendValidation' })).status, 400, 'sans photo');
  const up = await admin(`/admin/requests/final?id=${id}&name=face.jpg`, new Uint8Array(8), 'PUT', { 'content-type': 'image/jpeg', 'content-length': '8' });
  assert.equal(up.ok, true);
  await admin('/admin/requests/act', { id, action: 'sendValidation' });
  const vm = mails.at(-1);
  assert.match(vm.subject, /valide-la sur photos/);
  assert.match(vm.html, /https:\/\/w\.invalid\/requests\/photo\?id=/);
  assert.match(vm.text, /Solde à payer après validation sur photos : 140,00 €/);
  const photo = await call(`/requests/photo?id=${id}&k=${(await getReq(id)).k}&i=0`, null, 'GET');
  assert.equal(photo.status, 200);
  assert.equal((await J(await call('/requests/balance', { id, k, country: 'FR' }))).status, 409, 'solde avant validation refusé');
  const r1 = await J(await call('/requests/retouch', { id, k, text: 'Plus de bleu sur la manche' }));
  assert.equal(r1.extra, false);
  assert.equal((await getReq(id)).status, 'fabrication');
  await admin('/admin/requests/act', { id, action: 'sendValidation' });
  assert.equal((await view(id, k)).validation.retouchesLeft, 0);
  const before = mails.length;
  const r2_ = await J(await call('/requests/retouch', { id, k, text: 'Encore un détail' }));
  assert.equal(r2_.extra, true);
  assert.equal((await getReq(id)).status, 'validation', 'retouche sur devis : statut inchangé');
  assert.ok(mails.slice(before).some((m) => /Retouche supplémentaire \(sur devis\)/.test(m.subject) && m.to[0] === 'alex-vendeur@example.com'));
  await call('/requests/validate', { id, k });
  const quote = await J(await call('/requests/balance-quote', { id, k, country: 'BE' }));
  assert.equal(quote.ok, true);
  assert.equal(quote.balance, 140);
  assert.ok(quote.shipping > 0);
  const bal = await J(await call('/requests/balance', { id, k, country: 'BE' }));
  const p = created.at(-1);
  assert.equal(p.get('metadata[kind]'), 'balance');
  assert.equal(p.get('line_items[0][price_data][unit_amount]'), '14000');
  assert.equal(p.get('shipping_address_collection[allowed_countries][0]'), 'BE');
  assert.equal(p.get('metadata[deposit_invoice]'), `TEST-${id}-A`);
  const sid = bal.url.split('/').pop();
  await webhook('checkout.session.completed', pay(sid));
  const rec = await getReq(id);
  assert.equal(rec.status, 'solde');
  assert.ok(mails.some((m) => /commande vgthmind est confirmée/.test(m.subject)), 'circuit normal : mail de commande');
  const order = (await admin('/orders', null, 'GET')).orders.find((o) => o.id === sid);
  assert.equal(order.kind, 'balance');
  const inv = (await admin('/admin/invoice?id=' + sid, null, 'GET')).invoice;
  assert.equal(inv.lines[0].amount, 200, 'prix total');
  assert.equal(inv.deductions[0].amount, 60);
  assert.match(inv.deductions[0].label, new RegExp(`facture TEST-${id}-A`));
  assert.equal(inv.total, 140 + quote.shipping);
  await admin('/orders/shipped', { id: sid, tracking: '6A123' });
  assert.equal((await getReq(id)).status, 'envoyee');
});

test('relances : devis à 7 j, alerte à 14 j ; validation : relance 7 j, alerte 14 j, acompte conservé à 30 j', async () => {
  const realNow = Date.now;
  try {
    const { id, k } = await submit();
    await call('/requests/confirm', { id, k });
    await admin('/admin/requests/act', { id, action: 'quote', total: 100, delay: '2 semaines' });
    const t0 = Date.now();
    const cron = async (days) => { Date.now = () => t0 + days * DAY; await worker.scheduled({ cron: '15 * * * *' }, env, { waitUntil: (p) => p }); await new Promise((r) => setTimeout(r, 5)); Date.now = realNow; };
    await cron(3); assert.equal(mails.filter((m) => /Rappel/.test(m.subject)).length, 0);
    await cron(7.1); assert.equal(mails.filter((m) => /Rappel : ton devis/.test(m.subject)).length, 1);
    await cron(8); assert.equal(mails.filter((m) => /Rappel : ton devis/.test(m.subject)).length, 1, 'une seule relance');
    await cron(14.1); assert.ok(mails.some((m) => /Devis sans réponse/.test(m.subject)));
  } finally { Date.now = realNow; }
});

test('relances après les photos : acompte conservé au bout de 30 j (alerte), délais modifiables', async () => {
  const realNow = Date.now;
  try {
    const { id } = await untilDeposit();
    await admin(`/admin/requests/final?id=${id}&name=f.jpg`, new Uint8Array(8), 'PUT', { 'content-type': 'image/jpeg', 'content-length': '8' });
    await admin('/admin/requests/act', { id, action: 'sendValidation' });
    const t0 = Date.now();
    const cron = async (days) => { Date.now = () => t0 + days * DAY; await worker.scheduled({ cron: '15 * * * *' }, env, { waitUntil: (p) => p }); await new Promise((r) => setTimeout(r, 5)); Date.now = realNow; };
    await cron(7.2); assert.ok(mails.some((m) => /Rappel : ta pièce attend/.test(m.subject)));
    await cron(14.2); assert.ok(mails.some((m) => /Validation \/ solde en attente/.test(m.subject)));
    await cron(30.2);
    assert.ok(mails.some((m) => /Acompte conservé/.test(m.subject)));
    assert.equal((await getReq(id)).forfeited, true);
  } finally { Date.now = realNow; }
});

test('réglages : prix sous le prix boutique équivalent refusés, délais et acompte modifiables, prix publics', async () => {
  const cur = await admin('/admin/requests/settings', null, 'GET');
  assert.equal(cur.settings.prices.custom.tshirt, 75);
  assert.equal(cur.floors['custom.hoodie'].price, 104, 'CH_ = hoodies');
  assert.equal(cur.floors['custom.autre'], undefined, 'pas de comparaison pour « Autre pièce »');
  assert.equal(cur.floors['surmesure.haut'].price, 84);
  assert.equal(cur.floors['surmesure.pantalon'].price, 170);
  const low = structuredClone(cur.settings); low.prices.custom.hoodie = 100;
  const bad = await admin('/admin/requests/settings', { settings: low });
  assert.equal(bad.status, 400);
  assert.match(bad.error, /CH_0004, 104 €/);
  const ok = structuredClone(cur.settings); ok.depositPct = 40; ok.retouchesIncluded = 2; ok.cards = { custom: '/assets/demande/x.webp' };
  assert.equal((await admin('/admin/requests/settings', { settings: ok })).ok, true);
  const pub = await J(await call('/requests/settings', null, 'GET'));
  assert.equal(pub.depositPct, 40);
  assert.equal(pub.cards.custom, 'http://site.invalid/shop/assets/demande/x.webp');
  assert.equal(pub.uploads, true);
});

test('production visuelle / collab : pas de paiement automatique ; réponse par mail depuis l’admin', async () => {
  const { id, k } = await submit({ ...FORM, type: 'collab', collabType: 'Vidéo YouTube', links: 'youtube.com/@x', idea: 'Une vidéo making-of ensemble' });
  await call('/requests/confirm', { id, k });
  assert.equal((await admin('/admin/requests/act', { id, action: 'quote', total: 100, delay: 'x' })).status, 400);
  assert.equal((await J(await call('/requests/deposit', { id, k, accept: true }))).status, 409);
  const r = await admin('/admin/requests/act', { id, action: 'reply', subject: 'Ta collab', message: 'Partant ! On s’appelle ?' });
  assert.equal(r.request.status, 'discussion');
  const m = mails.at(-1);
  assert.equal(m.to[0], 'alex@example.com');
  assert.equal(m.reply_to, 'contact@vgthmind.org');
  assert.match(m.text, /Partant/);
});

test('conservation : sans suite 12 mois = effacée ; terminée 6 mois = fichiers effacés sauf photos finales avec accord', async () => {
  const realNow = Date.now;
  try {
    const a = await submit({ ...FORM, photosConsent: false });
    await call('/requests/confirm', { id: a.id, k: a.k });
    const { id } = await untilDeposit(); // accord photos : oui
    await call(`/requests/file?id=${id}&k=${(await getReq(id)).k}&name=ref.jpg`, new Uint8Array(4), 'PUT', { 'content-type': 'image/jpeg', 'content-length': '4' });
    await admin(`/admin/requests/final?id=${id}&name=f.jpg`, new Uint8Array(8), 'PUT', { 'content-type': 'image/jpeg', 'content-length': '8' });
    await admin('/admin/requests/act', { id, action: 'status', status: 'terminee' });
    const t0 = Date.now();
    Date.now = () => t0 + 190 * DAY;
    await worker.scheduled({ cron: '15 * * * *' }, env, { waitUntil: (p) => p });
    await new Promise((r) => setTimeout(r, 5));
    Date.now = realNow;
    const rec = await getReq(id);
    assert.equal(rec.files.length, 0, 'fichiers du client effacés');
    assert.equal(rec.finals.length, 1, 'photo finale gardée (accord)');
    assert.ok([...r2.keys()].some((k) => k.includes('/final-')));
    Date.now = () => t0 + 400 * DAY;
    await worker.scheduled({ cron: '15 * * * *' }, env, { waitUntil: (p) => p });
    await new Promise((r) => setTimeout(r, 5));
    Date.now = realNow;
    const all = (await admin('/admin/requests', null, 'GET')).requests.map((r) => r.id);
    assert.ok(!all.includes(a.id), 'demande sans suite effacée');
  } finally { Date.now = realNow; }
});

test('sans R2 : formulaire accepté, envoi de fichiers indisponible (lien seulement)', async () => {
  delete env.FILES;
  const r = await submit({ ...FORM, link: 'https://wetransfer.com/x' });
  assert.equal(r.uploads, false);
  assert.equal((await call(`/requests/file?id=${r.id}&k=${r.k}&name=a`, new Uint8Array(4), 'PUT', { 'content-type': 'image/jpeg', 'content-length': '4' })).status, 503);
  assert.equal((await J(await call('/requests/settings', null, 'GET'))).uploads, false);
});
