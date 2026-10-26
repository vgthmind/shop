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
const FORM = { type: 'custom', lang: 'fr', firstName: 'Alex', lastName: 'Martin', email: 'Alex@Example.com', country: 'FR', piece: 'hoodie', mode: 'know', idea: 'Un hoodie peint à l’aéro, thème océan', colors: 'bleu', size: 'M', t: 9000, photosConsent: true };
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

const isoIn = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
test('formulaire : prénom ET nom obligatoires, date souhaitée selon le délai minimum du type', async () => {
  const noLast = await submit({ ...FORM, lastName: '' });
  assert.deepEqual(noLast.fields, ['lastName']);
  const tooSoon = await submit({ ...FORM, deadline: isoIn(5) });
  assert.deepEqual(tooSoon.fields, ['deadline']);
  const smSoon = await submit({ ...FORM, type: 'surmesure', piece: 'pantalon', measures: '90 cm', deadline: isoIn(17) });
  assert.deepEqual(smSoon.fields, ['deadline'], 'sur-mesure : 3 semaines minimum');
  assert.equal((await submit({ ...FORM, type: 'surmesure', piece: 'pantalon', measures: '90 cm', deadline: isoIn(22) })).ok, true);
  const ok = await submit({ ...FORM, deadline: isoIn(15) });
  assert.equal(ok.ok, true);
  const rec = await getReq(ok.id) || (await call('/requests/confirm', { id: ok.id, k: ok.k }), await getReq(ok.id));
  assert.equal(rec.client.name, 'Alex Martin');
  const loc = await submit({ ...FORM, type: 'production', prodKind: 'location', projectType: 'Clip', dates: 'nov', deadline: isoIn(5) });
  assert.deepEqual(loc.fields, ['deadline'], 'location : 2 semaines minimum');
  const crea = await submit({ ...FORM, type: 'production', prodKind: 'creation', projectType: 'Clip', dates: 'nov', deadline: isoIn(1) });
  assert.equal(crea.ok, true, 'création : pas de date minimum, champ ignoré');
  const pub = await J(await call('/requests/settings', null, 'GET'));
  assert.deepEqual(pub.leadWeeks, { location: { min: 2, max: 2 }, custom: { min: 2, max: 3 }, surmesure: { min: 3, max: 4 } });
});

test('mesures par catégorie : sur-mesure obligatoire (sauf « je ne sais pas » ou « en parler »), custom facultatif, lignes ⚠ à redemander', async () => {
  const SM = { ...FORM, type: 'surmesure', piece: 'pantalon', mcat: 'bas', mv: { height: '178', usual: 'M', waist: '80', hips: '98', inseam: '80', floor: '104' } };
  const noWaist = await submit({ ...SM, mv: { ...SM.mv, waist: '' } });
  assert.deepEqual(noWaist.fields, ['measures'], 'une mesure manque');
  const bad = await submit({ ...SM, mv: { ...SM.mv, hips: 'grand' } });
  assert.deepEqual(bad.fields, ['measures'], 'valeur non numérique');
  const full = await submit({ ...SM, mapprox: true, mother: 'Taille haute' });
  assert.equal(full.ok, true);
  const rec = await getReq(full.id) || (await call('/requests/confirm', { id: full.id, k: full.k }), await getReq(full.id));
  assert.match(rec.fields.measures, /Catégorie : Pantalon \/ short/);
  assert.match(rec.fields.measures, /^⚠ Mesures approximatives$/m);
  assert.match(rec.fields.measures, /Tour de bassin : 98 cm/);
  assert.match(rec.fields.measures, /Autre précision : Taille haute/);
  const unk = await submit({ ...SM, mv: { ...SM.mv, inseam: '' }, mu: { inseam: true } });
  assert.equal(unk.ok, true);
  const r2 = await getReq(unk.id) || (await call('/requests/confirm', { id: unk.id, k: unk.k }), await getReq(unk.id));
  assert.match(r2.fields.measures, /^⚠ Longueur d’entrejambe : je ne sais pas$/m);
  const optOnly = await submit({ ...SM, mv: { ...SM.mv, thigh: 'beaucoup' } });
  assert.deepEqual(optOnly.fields, ['measures'], 'une mesure « si tu peux » remplie doit rester un nombre');
  const talk = await submit({ ...SM, mv: {}, mtalk: true });
  assert.equal(talk.ok, true, 'je préfère en parler : jamais bloquant');
  const noCat = await submit({ ...SM, mcat: '', mv: {} });
  assert.deepEqual(noCat.fields, ['measures']);
});

test('mesures par catégorie : custom facultatif, jamais de « je ne sais pas »', async () => {
  const custom = await submit({ ...FORM, mcat: 'haut', mv: { chest: '95' } });
  assert.equal(custom.ok, true, 'custom : le reste est facultatif');
  const rc = await getReq(custom.id) || (await call('/requests/confirm', { id: custom.id, k: custom.k }), await getReq(custom.id));
  assert.match(rc.fields.measures, /Tour de poitrine : 95 cm/);
  assert.doesNotMatch(rc.fields.measures, /Carrure/);
  const customUnk = await submit({ ...FORM, mcat: 'haut', mv: {}, mu: { chest: true } });
  assert.equal((await getReq(customUnk.id) || (await call('/requests/confirm', { id: customUnk.id, k: customUnk.k }), await getReq(customUnk.id))).fields.measures.includes('je ne sais pas'), false, 'custom : pas de « je ne sais pas »');
});

test('mesures : cache-cou et accessoire sans taille ni taille portée ; accessoire = largeur et hauteur séparées', async () => {
  const cou = await submit({ ...FORM, type: 'surmesure', piece: 'haut', mcat: 'cou', mv: { head: '57', neck: '38' } });
  assert.equal(cou.ok, true, 'cache-cou : pas de taille demandée');
  const rc = await getReq(cou.id) || (await call('/requests/confirm', { id: cou.id, k: cou.k }), await getReq(cou.id));
  assert.doesNotMatch(rc.fields.measures, /Taille/);
  assert.match(rc.fields.measures, /Tour d’encolure : 38 cm/);
  assert.doesNotMatch(rc.fields.measures, /Hauteur/, 'les « si tu peux » vides ne sont pas écrites');
  const accBad = await submit({ ...FORM, type: 'surmesure', piece: 'haut', mcat: 'acc', mv: { aw: '20' } });
  assert.deepEqual(accBad.fields, ['measures'], 'la hauteur manque');
  const acc = await submit({ ...FORM, type: 'surmesure', piece: 'haut', mcat: 'acc', mv: { aw: '20', ah: '12' } });
  assert.equal(acc.ok, true);
  const ra = await getReq(acc.id) || (await call('/requests/confirm', { id: acc.id, k: acc.k }), await getReq(acc.id));
  assert.match(ra.fields.measures, /Largeur souhaitée : 20 cm/);
  assert.match(ra.fields.measures, /Hauteur souhaitée : 12 cm/);
});

test('mesures : haut = longueur souhaitée obligatoire + tour de bras facultatif ; bas = hauteur facultative ; noms clairs (Tour de taille, Taille habituelle, Hauteur)', async () => {
  const H = { ...FORM, type: 'surmesure', piece: 'haut', mcat: 'haut', mv: { height: '178', usual: 'M', chest: '95', waist: '80', hips: '98', arm: '62' } };
  assert.deepEqual((await submit(H)).fields, ['measures'], 'longueur souhaitée manquante');
  const ok = await submit({ ...H, mv: { ...H.mv, len: '68', armc: '31' } });
  assert.equal(ok.ok, true);
  const r = await getReq(ok.id) || (await call('/requests/confirm', { id: ok.id, k: ok.k }), await getReq(ok.id));
  for (const re of [/Hauteur : 178 cm/, /Taille habituelle : M/, /Tour de taille : 80 cm/, /Longueur souhaitée : 68 cm/, /Tour de bras : 31 cm/]) assert.match(r.fields.measures, re);
  assert.doesNotMatch(r.fields.measures, /ceinture/i);
  const B = { ...FORM, type: 'surmesure', piece: 'pantalon', mcat: 'bas', mv: { usual: 'M', waist: '80', hips: '98', inseam: '80', floor: '104' } };
  assert.equal((await submit(B)).ok, true, 'bas : la hauteur n’est plus obligatoire');
});

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
  assert.equal((await J(await call('/requests/deposit', { id, k, accept: true }))).status, 409, 'pas de devis : pas de paiement');
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

// --- Devis pro : numéro, versions, lignes, validité, PDF, acceptation, verrouillage ---
const hexOf = (t) => [...t].map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('');
const pdfText = async (path) => { const r = await call(path, null, 'GET', path.startsWith('/admin') ? { authorization: 'Bearer ' + adminTok() } : {}); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/pdf'); return Buffer.from(await r.arrayBuffer()).toString('latin1'); };

test('devis pro : numéro DEV-AAAA-NNN, lignes de détail, validité, PDF joint au mail et téléchargeable', async () => {
  const { id, k } = await submit(); await call('/requests/confirm', { id, k });
  const q = await admin('/admin/requests/act', { id, action: 'quote', title: 'Hoodie océan', delay: '3 semaines', validDays: 15, lines: [{ label: 'Hoodie zippé', qty: 1, unit: 120 }, { label: 'Peinture aérographe', qty: 2, unit: 40 }] });
  assert.equal(q.ok, true);
  assert.match(q.request.quote.number, /^DEV-\d{4}-001$/);
  assert.equal(q.request.quote.version, 1);
  assert.equal(q.request.quote.total, 200, 'total = somme des lignes');
  assert.equal(q.request.quote.deposit, 60);
  assert.ok(Math.abs(q.request.quote.validUntil - Date.now() - 15 * DAY) < 5000);
  const m = mails.at(-1);
  assert.match(m.subject, /Ton devis vgthmind DEV-\d{4}-001 \(D-/);
  assert.equal(m.attachments.length, 1);
  assert.match(m.attachments[0].filename, /^Devis-DEV-\d{4}-001\.pdf$/);
  const bin = Buffer.from(m.attachments[0].content, 'base64').toString('latin1');
  assert.ok(bin.startsWith('%PDF-1.4') && bin.trimEnd().endsWith('%%EOF'));
  const win = (t) => [...t].map((ch) => (ch === 'é' ? 'e9' : ch.charCodeAt(0).toString(16).padStart(2, '0'))).join('');
  for (const t of ['vgthmind', 'TVA non applicable, art. 293 B du CGI', 'SIRET', 'Hoodie zippé', 'Alex Martin', 'pas de droit de rétractation']) assert.ok(bin.includes(win(t)), 'PDF : ' + t);
  assert.equal((await pdfText('/requests/quote.pdf?id=' + id + '&k=' + k)).slice(0, 5), '%PDF-');
  assert.equal((await pdfText('/admin/requests/quote.pdf?id=' + id)).slice(0, 5), '%PDF-');
  assert.equal((await call('/requests/quote.pdf?id=' + id + '&k=' + 'x'.repeat(32), null, 'GET')).status, 404, 'lien secret obligatoire');
  const v = await view(id, k);
  assert.match(v.consent, /^J'accepte le devis DEV-\d{4}-001 et les conditions générales de vente\./);
  assert.equal(v.quote.lines.length, 2);
  // Renvoi : même numéro, version 2, avant acceptation.
  const q2 = await admin('/admin/requests/act', { id, action: 'quote', delay: '4 semaines', total: 220 });
  assert.equal(q2.request.quote.number, q.request.quote.number);
  assert.equal(q2.request.quote.version, 2);
  assert.match(mails.at(-1).subject, /DEV-\d{4}-001 v2/);
  // Deux demandes : deux numéros différents.
  const o = await submit(); await call('/requests/confirm', { id: o.id, k: o.k });
  const qo = await admin('/admin/requests/act', { id: o.id, action: 'quote', total: 90, delay: '2 semaines' });
  assert.match(qo.request.quote.number, /-002$/);
});

test('devis pro : annulation d’un devis non accepté, puis v2 ; devis accepté = verrouillé ; devis expiré = refusé', async () => {
  const { id, k } = await submit(); await call('/requests/confirm', { id, k });
  await admin('/admin/requests/act', { id, action: 'quote', total: 100, delay: '2 semaines' });
  const c = await admin('/admin/requests/act', { id, action: 'cancelQuote' });
  assert.equal(c.ok, true); assert.equal(c.request.quote, null); assert.equal(c.request.status, 'discussion');
  assert.equal((await J(await call('/requests/deposit', { id, k, accept: true }))).status, 409, 'plus de devis à payer');
  const q = await admin('/admin/requests/act', { id, action: 'quote', total: 120, delay: '2 semaines' });
  assert.equal(q.request.quote.version, 2);
  // Le client accepte (case + clic sur « payer ») : plus aucune modification.
  await call('/requests/deposit', { id, k, accept: true });
  assert.equal((await admin('/admin/requests/act', { id, action: 'quote', total: 10, delay: 'x' })).status, 400);
  // Accepté mais acompte non payé : seule l'annulation est permise, puis un nouveau devis.
  const cc = await admin('/admin/requests/act', { id, action: 'cancelQuote' });
  assert.equal(cc.ok, true); assert.equal(cc.request.quote, null); assert.equal(cc.request.deposit, null); assert.equal(cc.request.status, 'discussion');
  const q3 = await admin('/admin/requests/act', { id, action: 'quote', total: 90, delay: '2 semaines' });
  assert.equal(q3.request.quote.version, 3);
  const dp = await J(await call('/requests/deposit', { id, k, accept: true }));
  await webhook('checkout.session.completed', pay(dp.url.split('/').pop()));
  assert.match((await admin('/admin/requests/act', { id, action: 'cancelQuote' })).error, /ne peut plus/, 'acompte payé : plus d’annulation');
  // Expiré : refus côté serveur.
  const e = await submit(); await call('/requests/confirm', { id: e.id, k: e.k });
  await admin('/admin/requests/act', { id: e.id, action: 'quote', total: 100, delay: '2 semaines', validDays: 1 });
  const realNow = Date.now; Date.now = () => realNow() + 2 * DAY;
  try {
    const d = await J(await call('/requests/deposit', { id: e.id, k: e.k, accept: true }));
    assert.equal(d.status, 409); assert.equal(d.error, 'quote_expired');
    assert.equal((await view(e.id, e.k)).quote.expired, true);
  } finally { Date.now = realNow; }
});

test('devis pro : montants toujours calculés côté serveur (lignes ou total invalides refusés)', async () => {
  const { id, k } = await submit(); await call('/requests/confirm', { id, k });
  assert.equal((await admin('/admin/requests/act', { id, action: 'quote', delay: 'x', lines: [{ label: 'a', qty: 1, unit: -5 }] })).status, 400);
  assert.equal((await admin('/admin/requests/act', { id, action: 'quote', delay: 'x', total: 0 })).status, 400);
  assert.equal((await admin('/admin/requests/act', { id, action: 'quote', delay: 'x', total: 100, validDays: 400 })).status, 400);
  await admin('/admin/requests/act', { id, action: 'quote', delay: 'x', total: 100 });
  const dep = await J(await call('/requests/deposit', { id, k, accept: true, amount: 1, total: 1 }));
  assert.equal(created.at(-1).get('line_items[0][price_data][unit_amount]'), '3000', 'acompte = 30 % du devis, jamais du navigateur');
  assert.ok(dep.url);
});

test('devis pro : location / collab, acompte facultatif — acceptation sans payer, ou acompte payé', async () => {
  const mk = async () => { const x = await submit({ ...FORM, type: 'collab', collabType: 'Vidéo', links: 'youtube.com/@x', idea: 'Une vidéo making-of ensemble' }); await call('/requests/confirm', { id: x.id, k: x.k }); return x; };
  // a) sans acompte : le client accepte, la demande passe en « en cours », alerte + confirmation
  let { id, k } = await mk();
  const q = await admin('/admin/requests/act', { id, action: 'quote', title: 'Clip', delay: '2 semaines', lines: [{ label: 'Location pièce clip', qty: 1, unit: 300 }], depositPct: 0 });
  assert.equal(q.ok, true); assert.equal(q.request.quote.deposit, 0);
  assert.equal((await J(await call('/requests/deposit', { id, k, accept: true }))).status, 409, 'pas d’acompte prévu');
  mails.length = 0;
  assert.equal((await J(await call('/requests/accept', { id, k }))).status, 400, 'case obligatoire');
  const a = await J(await call('/requests/accept', { id, k, accept: true }));
  assert.equal(a.ok, true); assert.equal(a.request.status, 'fabrication');
  assert.ok(mails.some((m) => m.to[0] === 'alex@example.com' && /Devis accepté/.test(m.subject)));
  assert.ok(mails.some((m) => /Devis accepté : D-/.test(m.subject)), 'alerte pour vgthmind');
  assert.equal((await admin('/admin/requests/act', { id, action: 'quote', total: 1, delay: 'x' })).status, 400, 'accepté : verrouillé');
  // b) avec acompte facultatif de 20 % : payé via Stripe, puis « en cours »
  ({ id, k } = await mk());
  await admin('/admin/requests/act', { id, action: 'quote', total: 300, delay: '2 semaines', depositPct: 20 });
  const dep = await J(await call('/requests/deposit', { id, k, accept: true }));
  assert.equal(created.at(-1).get('line_items[0][price_data][unit_amount]'), '6000');
  await webhook('checkout.session.completed', pay(dep.url.split('/').pop()));
  assert.equal((await getReq(id)).status, 'fabrication');
});

test('solde demandé sans photos : acompte requis, validation implicite, mail avec le lien, le client peut ensuite payer', async () => {
  const early = await untilDeposit();
  const { id, k } = early;
  const r = await admin('/admin/requests/act', { id, action: 'requestBalance' });
  assert.equal(r.status, 200);
  const m = mails.at(-1);
  assert.match(m.subject, /il ne reste que le solde/);
  assert.equal((await getReq(id)).status, 'validation');
  const q = await J(await call('/requests/balance-quote', { id, k, country: 'FR' }));
  assert.equal(q.ok, true);
});
