// Checkout Worker de /shop/ :
//  - paiement : une session Stripe Checkout pour TOUT le panier (frais de
//    port compris) ; prix et port relus dans le catalogue publie
//    (SITE_BASE/products.json), jamais crus sur parole ;
//  - stock : un Durable Object (StockDO) garde la quantite de chaque piece et
//    les reservations en cours ; reserver / vendre est atomique (une seule
//    instance traite les demandes une par une) : pas de double vente ;
//  - admin : connexion GitHub (OAuth, ce Worker sert de relais), page Stock,
//    commandes, sauvegarde quotidienne du stock dans le KV.
//
// Mode test uniquement tant que LIVE_MODE != "1" (wrangler.toml). Aucun
// secret dans le depot (npx.cmd wrangler secret put …) :
//   STRIPE_SECRET_KEY      cle sk_test_
//   STRIPE_WEBHOOK_SECRET  whsec_ du webhook Stripe
//   GITHUB_CLIENT_SECRET   secret de l'OAuth App GitHub (connexion admin)
//
// Routes publiques :
//   POST /checkout  { items: [{slug, qty}], region: "fr"|"intl", cart_id } -> { url }
//   GET  /session?id=cs_…   resume d'une commande payee (page Merci)
//   POST /release   { id }  annulation : rend les pieces reservees
//   POST /webhook           evenements Stripe (signature verifiee)
//   GET  /stock             { stock: { slug: quantite } } (affichage du site)
//   GET  /auth, /callback   connexion GitHub (OAuth) de l'admin
//   GET  /status            controle de la configuration (sans les secrets)
//   POST /track             page /suivi : { ref, email } -> statut de la commande (limite d'essais)
// Routes admin (en-tete Authorization: Bearer <session signee par SESSION_SECRET>) :
//   POST /admin/renew       nouvelle session de 30 jours
//   GET/POST /admin/stock   lire / regler les quantites
//   GET  /admin/backups     liste des sauvegardes ; GET /admin/backup?key=…
//   POST /admin/backup      sauvegarde immediate
//   GET  /orders ; POST /orders/preparing ; POST /orders/shipped ; POST /orders/shipped-mail

import { DurableObject } from 'cloudflare:workers';
import { customerEmail, sellerEmail, shippedEmail, REPLY_TO, langFor, countryName, type MailItem, type OrderData } from './emails';

interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string; limit?: number }): Promise<{ keys: { name: string }[] }>;
}

interface Env {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  GITHUB_CLIENT_ID?: string; // OAuth App (public)
  GITHUB_CLIENT_SECRET?: string; // OAuth App (secret)
  SESSION_SECRET?: string; // signe les sessions admin (30 jours)
  RESEND_API_KEY?: string; // secret : cle Resend
  ALERT_EMAIL?: string; // secret : adresse qui recoit l'alerte de commande
  MAIL_FROM?: string; // expediteur sur domaine verifie ; vide = pas d'email client
  GITHUB_TOKEN?: string; // ancien systeme : n'est plus utilise, a supprimer
  ALLOWED_ORIGIN: string; // https://vgthmind.github.io
  SITE_BASE: string; // https://vgthmind.github.io/shop
  LIVE_MODE?: string; // "1" seulement le jour du passage en live
  ADMIN_GITHUB_LOGIN: string; // seul compte GitHub admin
  HOLDS: KV; // commandes expediees, sauvegardes du stock, etats OAuth
  STOCK: any; // DurableObjectNamespace<StockDO>
}

interface ShippingLine { amount_alone: number; country?: { code: string } }
interface Product {
  permalink: string;
  name: string;
  price: number;
  url: string;
  description?: string;
  quantity?: number;
  images: { url: string }[];
  shipping: ShippingLine[];
}
interface Item { slug: string; qty: number }
interface Hold { items: Item[]; expires: number }

const MAX_ITEMS = 20;
const SESSION_MINUTES = 30; // minimum Stripe
const HOLD_MS = (SESSION_MINUTES + 2) * 60 * 1000;
const BACKUP_DAYS = 180;

// Pays proposes pour « International » : tous ceux qu'accepte Stripe pour
// une adresse de livraison, sauf la France (decision de Jules, 2026-10-06).
const STRIPE_COUNTRIES = (
  'AC AD AE AF AG AI AL AM AO AQ AR AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ '
  + 'CA CD CF CG CH CI CK CL CM CN CO CR CV CW CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FO GA GB GD GE '
  + 'GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IS IT JE JM JO JP KE KG KH KI '
  + 'KM KN KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MK ML MM MN MO MQ MR MS MT MU MV MW MX MY '
  + 'MZ NA NC NE NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PY QA RE RO RS RU RW SA SB SC SD SE '
  + 'SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SZ TA TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ '
  + 'VA VC VE VG VN VU WF WS XK YE YT ZA ZM ZW ZZ'
).split(' ');

// ---------------------------------------------------------------------------
// Durable Object : stock + reservations. Une seule instance (« main ») ; ses
// methodes s'executent une par une, donc lire-verifier-ecrire est atomique.
// Stockage : q:<slug> = quantite reglee (absente : quantite du catalogue),
// h:<cart_id> = reservation en cours, d:<session> = commande deja comptee.
export class StockDO extends DurableObject {
  private async state() {
    const storage = (this as any).ctx.storage;
    const q: Map<string, number> = await storage.list({ prefix: 'q:' });
    const h: Map<string, Hold> = await storage.list({ prefix: 'h:' });
    const now = Date.now();
    const stock = new Map<string, number>();
    for (const [k, v] of q) stock.set(k.slice(2), v);
    const holds = new Map<string, Hold>();
    for (const [k, v] of h) {
      if (v.expires < now) await storage.delete(k);
      else holds.set(k.slice(2), v);
    }
    return { storage, stock, holds };
  }

  // Quantites pour l'affichage du site (et la sauvegarde).
  async snapshot(defaults: Record<string, number>) {
    const { stock } = await this.state();
    const out: Record<string, number> = {};
    for (const slug of Object.keys(defaults)) out[slug] = stock.has(slug) ? stock.get(slug)! : defaults[slug];
    for (const [slug, n] of stock) if (!(slug in out)) out[slug] = n;
    return out;
  }

  // Vue admin : quantite, si elle a ete reglee/vendue (sinon catalogue),
  // et ce qui est reserve par des paiements en cours.
  async adminView(defaults: Record<string, number>) {
    const { stock, holds } = await this.state();
    const held: Record<string, number> = {};
    for (const h of holds.values()) for (const it of h.items) held[it.slug] = (held[it.slug] || 0) + it.qty;
    const out: Record<string, { stock: number; fromCatalog: boolean; held: number }> = {};
    for (const slug of new Set([...Object.keys(defaults), ...stock.keys()])) {
      out[slug] = { stock: stock.has(slug) ? stock.get(slug)! : (defaults[slug] ?? 0), fromCatalog: !stock.has(slug), held: held[slug] || 0 };
    }
    return out;
  }

  async reserve(cartId: string, items: Item[], defaults: Record<string, number>) {
    const { storage, stock, holds } = await this.state();
    const problems: { slug: string; reason: string; available?: number }[] = [];
    for (const it of items) {
      const s = stock.has(it.slug) ? stock.get(it.slug)! : (defaults[it.slug] ?? 0);
      let others = 0;
      for (const [cart, h] of holds) if (cart !== cartId) for (const x of h.items) if (x.slug === it.slug) others += x.qty;
      if (s <= 0) problems.push({ slug: it.slug, reason: 'vendue' });
      else if (it.qty > s - others) {
        problems.push(others > 0 && it.qty <= s
          ? { slug: it.slug, reason: 'reservee' }
          : { slug: it.slug, reason: 'stock', available: Math.max(0, s - others) });
      }
    }
    if (problems.length) return { ok: false, problems };
    await storage.put('h:' + cartId, { items, expires: Date.now() + HOLD_MS });
    return { ok: true, problems };
  }

  async release(cartId: string) {
    await (this as any).ctx.storage.delete('h:' + cartId);
  }

  // Commande payee : stock decompte une seule fois par session Stripe.
  async confirm(sessionId: string, cartId: string, items: Item[], defaults: Record<string, number>) {
    const { storage, stock } = await this.state();
    if (await storage.get('d:' + sessionId)) return { already: true };
    for (const it of items) {
      const s = stock.has(it.slug) ? stock.get(it.slug)! : (defaults[it.slug] ?? 0);
      await storage.put('q:' + it.slug, Math.max(0, s - it.qty));
    }
    if (cartId) await storage.delete('h:' + cartId);
    await storage.put('d:' + sessionId, Date.now());
    return { already: false };
  }

  async setStock(values: Record<string, number>) {
    const storage = (this as any).ctx.storage;
    for (const [slug, n] of Object.entries(values)) {
      if (!/^[^\s]{1,100}$/.test(slug) || !Number.isFinite(Number(n))) continue;
      await storage.put('q:' + slug, Math.max(0, Math.min(9999, Math.floor(Number(n)))));
    }
  }
}

type JsonFn = (data: unknown, status?: number) => Response;

function stockStub(env: Env) {
  return env.STOCK.get(env.STOCK.idFromName('main'));
}

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, authorization',
      Vary: 'Origin',
    };
    const json: JsonFn = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const path = new URL(request.url).pathname;

    try {
      // Sans cle Stripe.
      if (path === '/status') return await status(env);
      if (path === '/stock' && request.method === 'GET') return await publicStock(env, cors);
      if (path === '/auth') return await oauthStart(request, env);
      if (path === '/callback') return await oauthCallback(request, env);
      if (path.startsWith('/admin/')) {
        if (!(await isAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
        if (path === '/admin/renew' && request.method === 'POST') return json({ session: await makeSession(env) });
        if (path === '/admin/stock' && request.method === 'GET') return json(await adminStock(env));
        if (path === '/admin/stock' && request.method === 'POST') {
          const body: any = await request.json().catch(() => ({}));
          if (!body || typeof body.stock !== 'object') return json({ error: 'Requête invalide.' }, 400);
          await stockStub(env).setStock(body.stock);
          return json(await adminStock(env));
        }
        if (path === '/admin/backups' && request.method === 'GET') {
          const list = await env.HOLDS.list({ prefix: 'backup:' });
          return json({ backups: list.keys.map((k) => k.name).sort().reverse() });
        }
        if (path === '/admin/backup' && request.method === 'GET') {
          const k = new URL(request.url).searchParams.get('key') || 'backup:latest';
          if (!/^backup:[\w-]+$/.test(k)) return json({ error: 'Clé invalide.' }, 400);
          const v = await env.HOLDS.get(k);
          return v ? new Response(v, { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="stock-${k.slice(7)}.json"`, ...cors } }) : json({ error: 'Introuvable.' }, 404);
        }
        if (path === '/admin/backup' && request.method === 'POST') return json(await backupStock(env));
        return json({ error: 'Not found' }, 404);
      }

      // Avec cle Stripe.
      const key = stripeKey(env);
      if (!key.ok) return json({ error: key.error }, 503);
      if (path === '/checkout' && request.method === 'POST') return await checkout(request, env, key.value, json);
      if (path === '/session' && request.method === 'GET') return await session(request, env, key.value, json, ctx);
      if (path === '/release' && request.method === 'POST') return await release(request, env, key.value, json);
      if (path === '/webhook' && request.method === 'POST') return await webhook(request, env, json);
      if (path === '/orders' && request.method === 'GET') return await listOrders(request, env, key.value, json);
      if (path === '/track' && request.method === 'POST') return await trackOrder(request, env, key.value, json);
      if (path === '/orders/preparing' && request.method === 'POST') return await markPreparing(request, env, json);
      if (path === '/orders/shipped' && request.method === 'POST') return await markShipped(request, env, json);
      if (path === '/orders/shipped-mail' && request.method === 'POST') return await sendShippedMail(request, env, key.value, json);
    } catch (e: any) {
      return json({ error: 'Erreur interne : ' + (e && e.message ? e.message : e) }, 500);
    }
    return json({ error: 'Not found' }, 404);
  },

  // Sauvegarde quotidienne du stock (cron dans wrangler.toml).
  async scheduled(_event: any, env: Env, ctx: any) {
    ctx.waitUntil(backupStock(env));
  },
};

function stripeKey(env: Env): { ok: true; value: string } | { ok: false; error: string } {
  const rawKey = env.STRIPE_SECRET_KEY || '';
  // Espaces, guillemets et 1 a 3 lettres tapees avant le collage (« y »
  // repondu a npx, vu le 2026-10-06) ignores.
  const key = rawKey.replace(/[\s​-‍﻿"'`]/g, '').replace(/^[a-z]{1,3}(?=(sk|rk)_test_)/, '');
  if (!key) return { ok: false, error: 'Paiement pas encore configuré.' };
  if (!/^(sk|rk)_test_/.test(key) && env.LIVE_MODE !== '1') {
    const known = (key.match(/^[a-z]{2,5}_(test|live)_/) || [''])[0].replace(/_$/, '');
    return { ok: false, error: `Paiement en mode test uniquement pour le moment (clé reçue : ${known || 'format inconnu'}).` };
  }
  return { ok: true, value: key };
}

// --- Catalogue -------------------------------------------------------------
async function loadCatalog(env: Env): Promise<Product[]> {
  const res = await fetch(`${env.SITE_BASE}/products.json`, { cf: { cacheTtl: 60, cacheEverything: true } } as any);
  if (!res.ok) throw new Error('Catalogue indisponible');
  return res.json();
}
function catalogDefaults(catalog: Product[]): Record<string, number> {
  const d: Record<string, number> = {};
  for (const p of catalog) d[p.permalink] = Number.isInteger(p.quantity) ? (p.quantity as number) : 1;
  return d;
}

async function publicStock(env: Env, cors: Record<string, string>): Promise<Response> {
  const catalog = await loadCatalog(env);
  const stock = await stockStub(env).snapshot(catalogDefaults(catalog));
  return new Response(JSON.stringify({ stock }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15', ...cors },
  });
}

async function adminStock(env: Env) {
  const catalog = await loadCatalog(env);
  const view = await stockStub(env).adminView(catalogDefaults(catalog));
  const names: Record<string, string> = {};
  for (const p of catalog) names[p.permalink] = p.name;
  const latest = await env.HOLDS.get('backup:latest');
  return { stock: view, names, lastBackup: latest ? JSON.parse(latest).date : null };
}

async function backupStock(env: Env) {
  const catalog = await loadCatalog(env);
  const stock = await stockStub(env).snapshot(catalogDefaults(catalog));
  const date = new Date().toISOString().slice(0, 10);
  const value = JSON.stringify({ date, stock }, null, 1);
  await env.HOLDS.put(`backup:${date}`, value, { expirationTtl: BACKUP_DAYS * 86400 });
  await env.HOLDS.put('backup:latest', value);
  return { ok: true, date, count: Object.keys(stock).length };
}

// --- Paiement --------------------------------------------------------------
async function checkout(request: Request, env: Env, key: string, json: JsonFn): Promise<Response> {
  let body: { items?: unknown; region?: unknown; cart_id?: unknown };
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Requête invalide.' }, 400);
  }
  // items : ["slug", …] ou [{ slug, qty }, …] (qty > 1 : petite serie).
  const wanted = new Map<string, number>();
  for (const it of Array.isArray(body.items) ? body.items : []) {
    const slug = String(typeof it === 'object' && it ? (it as any).slug : it);
    const q = typeof it === 'object' && it ? Math.floor(Number((it as any).qty) || 1) : 1;
    wanted.set(slug, Math.min(99, (wanted.get(slug) || 0) + Math.max(1, q)));
  }
  const slugs = [...wanted.keys()];
  if (slugs.length === 0) return json({ error: 'Panier vide.' }, 400);
  if (slugs.length > MAX_ITEMS) return json({ error: 'Trop de pièces dans le panier.' }, 400);
  const region = body.region === 'intl' ? 'intl' : 'fr';
  const cartId = /^[A-Za-z0-9-]{8,64}$/.test(String(body.cart_id || '')) ? String(body.cart_id) : 'anon-' + crypto.randomUUID();

  let catalog: Product[];
  try { catalog = await loadCatalog(env); } catch (e) { return json({ error: 'Catalogue indisponible, réessaie dans un instant.' }, 502); }
  const bySlug = new Map(catalog.map((p) => [p.permalink, p]));

  const products: Product[] = [];
  const problems: { slug: string; reason: string; available?: number }[] = [];
  for (const slug of slugs) {
    const p = bySlug.get(slug);
    if (!p) problems.push({ slug, reason: 'introuvable' });
    else if (region === 'intl' && !intlLine(p)) problems.push({ slug, reason: 'france_uniquement' });
    else products.push(p);
  }
  if (problems.length) return json({ error: 'Panier à mettre à jour.', problems }, 409);

  // Reservation atomique (Durable Object) AVANT la page de paiement.
  const items: Item[] = products.map((p) => ({ slug: p.permalink, qty: wanted.get(p.permalink) || 1 }));
  const stub = stockStub(env);
  const held = await stub.reserve(cartId, items, catalogDefaults(catalog));
  if (!held.ok) return json({ error: 'Panier à mettre à jour.', problems: held.problems }, 409);

  // Meme regle que BigCartel (amount_with_others = 0 partout) : la commande
  // paie une seule fois le tarif le plus eleve du panier pour sa zone.
  const shipping = Math.max(0, ...products.map((p) => {
    const line = region === 'fr' ? frLine(p) : intlLine(p);
    return line ? line.amount_alone : 0;
  }));

  const origin = new URL(env.SITE_BASE).origin;
  const slugList = products.map((p) => p.permalink).join(',').slice(0, 500);
  const itemList = items.map((it) => `${it.slug}:${it.qty}`).join(',').slice(0, 500);
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('locale', 'auto');
  params.set('success_url', `${env.SITE_BASE}/merci/?session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${env.SITE_BASE}/paiement-annule/?session_id={CHECKOUT_SESSION_ID}`);
  params.set('expires_at', String(Math.floor(Date.now() / 1000) + SESSION_MINUTES * 60 + 30));
  params.set('phone_number_collection[enabled]', 'true');
  params.set('allow_promotion_codes', 'true');
  params.set('custom_text[submit][message]',
    `En payant, tu acceptes les conditions de vente : ${env.SITE_BASE}/infos-conditions-generales — By paying you accept our terms.`);
  params.set('metadata[slugs]', slugList);
  params.set('metadata[items]', itemList);
  params.set('metadata[region]', region);
  params.set('metadata[cart_id]', cartId);
  params.set('payment_intent_data[metadata][slugs]', slugList);
  products.forEach((p, i) => {
    params.set(`line_items[${i}][quantity]`, String(wanted.get(p.permalink) || 1));
    params.set(`line_items[${i}][price_data][currency]`, 'eur');
    params.set(`line_items[${i}][price_data][unit_amount]`, String(Math.round(p.price * 100)));
    params.set(`line_items[${i}][price_data][product_data][name]`, p.name);
    params.set(`line_items[${i}][price_data][product_data][metadata][slug]`, p.permalink);
    const img = p.images && p.images[0] && p.images[0].url;
    if (img) params.set(`line_items[${i}][price_data][product_data][images][0]`, origin + encodeURI(img));
  });
  // Stripe preselectionne le 1er pays de la liste quand celui du client n'y
  // est pas : le Canada et les voisins d'abord.
  const FIRST = ['CA', 'BE', 'CH', 'LU', 'DE', 'GB', 'US'];
  const countries = region === 'fr' ? ['FR'] : [...FIRST, ...STRIPE_COUNTRIES.filter((c) => !FIRST.includes(c))];
  countries.forEach((c, i) => params.set(`shipping_address_collection[allowed_countries][${i}]`, c));
  params.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
  params.set('shipping_options[0][shipping_rate_data][display_name]', region === 'fr' ? 'Livraison France' : 'Livraison internationale');
  params.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(Math.round(shipping * 100)));
  params.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'eur');

  const stripe = await stripeCall(key, 'POST', '/v1/checkout/sessions', params);
  if (!stripe.ok) {
    await stub.release(cartId);
    return json({ error: stripe.data.error?.message || 'Erreur Stripe' }, 502);
  }
  return json({ url: stripe.data.url });
}

async function session(request: Request, env: Env, key: string, json: JsonFn, ctx: any): Promise<Response> {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!isSessionId(id)) return json({ error: 'Identifiant invalide.' }, 400);
  const stripe = await stripeCall(key, 'GET', `/v1/checkout/sessions/${id}?expand[]=line_items`);
  if (!stripe.ok) return json({ error: 'Commande introuvable.' }, 404);
  const s = stripe.data;
  // Filet de securite si le webhook tarde (la session vient de Stripe, pas
  // du navigateur : pas de falsification possible).
  if (s.payment_status === 'paid') ctx.waitUntil(processPaid(env, s).catch(() => {}));
  return json({
    paid: s.payment_status === 'paid',
    total: s.amount_total / 100,
    shipping: (s.shipping_cost?.amount_total || 0) / 100,
    email: s.customer_details?.email || '',
    items: (s.line_items?.data || []).map((li: any) => ({ name: li.description, amount: li.amount_total / 100 })),
    slugs: (s.metadata?.slugs || '').split(',').filter(Boolean),
  });
}

// Annulation : la session est expiree tout de suite et la reservation rendue.
async function release(request: Request, env: Env, key: string, json: JsonFn): Promise<Response> {
  let id = '';
  try { id = String(((await request.json()) as any).id || ''); } catch (e) {}
  if (!isSessionId(id)) return json({ error: 'Identifiant invalide.' }, 400);
  const got = await stripeCall(key, 'GET', `/v1/checkout/sessions/${id}`);
  if (!got.ok) return json({ ok: false });
  if (got.data.status === 'open') await stripeCall(key, 'POST', `/v1/checkout/sessions/${id}/expire`, new URLSearchParams());
  if (got.data.payment_status !== 'paid' && got.data.metadata?.cart_id) await stockStub(env).release(got.data.metadata.cart_id);
  return json({ ok: true });
}

async function webhook(request: Request, env: Env, json: JsonFn): Promise<Response> {
  const secret = cleanWebhookSecret(env);
  if (!secret) return json({ error: 'Webhook pas encore configuré.' }, 503);
  const payload = await request.text();
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  if (!(await verifyStripeSignature(payload, request.headers.get('stripe-signature') || '', secret))) {
    await env.HOLDS.put('webhook:last', `${stamp} — signature refusée (secret whsec_ à reposer)`);
    return json({ error: 'Signature invalide.' }, 400);
  }
  await env.HOLDS.put('webhook:last', `${stamp} — OK`);
  const event = JSON.parse(payload);
  const s = event.data && event.data.object;
  if (!s) return json({ received: true });
  if (event.type === 'checkout.session.expired') {
    if (s.metadata?.cart_id) await stockStub(env).release(s.metadata.cart_id);
    return json({ received: true });
  }
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
    return json({ received: true });
  }
  if (s.payment_status !== 'paid') return json({ received: true });
  await processPaid(env, s); // erreur -> 500 -> Stripe reessaie
  return json({ received: true });
}

// Commande payee -> stock decompte (une seule fois par session, que l'appel
// vienne du webhook ou de la page Merci).
async function processPaid(env: Env, s: any) {
  const meta = s.metadata || {};
  const items: Item[] = meta.items
    ? String(meta.items).split(',').filter(Boolean).map((x: string) => {
      const [slug, q] = x.split(':');
      return { slug, qty: Math.max(1, Number(q) || 1) };
    })
    : String(meta.slugs || '').split(',').filter(Boolean).map((slug: string) => ({ slug, qty: 1 }));
  const catalog = await loadCatalog(env);
  await stockStub(env).confirm(s.id, meta.cart_id || '', items, catalogDefaults(catalog));
  await sendOrderEmails(env, s).catch(() => {}); // un echec d'email ne bloque jamais la commande
}

// --- Emails de commande (Resend) ---------------------------------------------
// Alerte pour l'admin (ALERT_EMAIL) ; confirmation au client seulement si un
// domaine verifie est configure (MAIL_FROM). Une seule fois par commande.
async function resendSend(env: Env, from: string, to: string, subject: string, html: string, text: string, replyTo?: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  return res.ok;
}

const SESSION_EXPAND = 'expand[]=line_items&expand[]=line_items.data.price.product';

// Articles d'une session Stripe : nom, taille (lue dans la description du
// catalogue), quantite, prix, photo (URL publique absolue posee a la creation
// de la session sur le produit Stripe).
async function mailItems(env: Env, lineItems: any[], money: (c: number) => string, preloaded?: Product[]): Promise<MailItem[]> {
  let catalog: Product[] = preloaded || [];
  if (!preloaded) { try { catalog = await loadCatalog(env); } catch (e) {} }
  return lineItems.map((li: any) => {
    const prod = typeof li.price?.product === 'object' ? li.price.product : null;
    const p = catalog.find((c) => c.permalink === prod?.metadata?.slug);
    const size = /\b(?:[Ss]ize|[Tt]aille|SIZE|TAILLE)\s+([A-Z]{1,4}|\d{1,3}(?:[./-]\d{1,3})?)\b/.exec(p?.description || '');
    return {
      name: String(li.description),
      size: size ? size[1] : '',
      qty: li.quantity,
      amount: money(li.amount_total),
      ...(li.quantity > 1 ? { unit: money(Math.round(li.amount_total / li.quantity)) } : {}),
      image: (prod && prod.images && prod.images[0]) || '',
    };
  });
}

async function buildOrder(env: Env, o: any): Promise<OrderData> {
  const ship = (o.collected_information && o.collected_information.shipping_details) || o.shipping_details || {};
  const a = ship.address || {};
  const money = (c: number) => (c / 100).toFixed(2).replace('.', ',') + ' ' + String(o.currency || 'eur').toUpperCase();
  const ref = await assignRef(env, String(o.id));
  return {
    ref,
    name: ship.name || o.customer_details?.name || '',
    email: o.customer_details?.email || '',
    phone: o.customer_details?.phone || '',
    country: a.country || o.customer_details?.address?.country || '',
    address: [ship.name || o.customer_details?.name, a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' '), a.state, countryName(a.country, langFor(a.country || o.customer_details?.address?.country || ''))].filter(Boolean),
    items: await mailItems(env, o.line_items?.data || [], money),
    shipping: money(o.shipping_cost?.amount_total || 0),
    total: money(o.amount_total),
    test: !o.livemode,
    stripeUrl: `https://dashboard.stripe.com/${o.livemode ? '' : 'test/'}payments/${typeof o.payment_intent === 'string' ? o.payment_intent : ''}`,
    cgvUrl: `${env.SITE_BASE}/infos-conditions-generales`,
    orderUrl: `${env.SITE_BASE}/suivi/?o=${encodeURIComponent(ref)}&l=${langFor(a.country || o.customer_details?.address?.country || '')}`,
  };
}


async function sendOrderEmails(env: Env, s: any) {
  if (!env.RESEND_API_KEY || !env.STRIPE_SECRET_KEY) return;
  const alertTo = (env.ALERT_EMAIL || '').trim();
  const customerFrom = (env.MAIL_FROM || '').trim(); // ex. "vgthmind <commande@mondomaine.com>"
  const doneKey = 'mailed:' + s.id;
  const done = JSON.parse((await env.HOLDS.get(doneKey)) || '{}');
  const needAlert = !!alertTo && !done.alert;
  const needClient = !!customerFrom && !done.client;
  if (!needAlert && !needClient) return;

  const full = await stripeCall(env.STRIPE_SECRET_KEY, 'GET', `/v1/checkout/sessions/${s.id}?${SESSION_EXPAND}`);
  if (!full.ok) return;
  const order = await buildOrder(env, full.data);

  if (needAlert) {
    const m = sellerEmail(order);
    const ok = await resendSend(env, customerFrom || 'vgthmind <onboarding@resend.dev>', alertTo, m.subject, m.html, m.text, REPLY_TO);
    if (ok) done.alert = 1;
  }
  if (needClient && order.email) {
    const m = customerEmail(order);
    const ok = await resendSend(env, customerFrom, order.email, m.subject, m.html, m.text, REPLY_TO);
    if (ok) done.client = 1;
  }
  await env.HOLDS.put(doneKey, JSON.stringify(done), { expirationTtl: 60 * 60 * 24 * 90 });
}

// --- OAuth GitHub (connexion admin, protocole Decap/Sveltia) ----------------
async function oauthStart(request: Request, env: Env): Promise<Response> {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return new Response('Connexion GitHub pas encore configurée.', { status: 503 });
  const state = crypto.randomUUID();
  await env.HOLDS.put('oauth:' + state, '1', { expirationTtl: 600 });
  const redirect = new URL('/callback', request.url).toString();
  const url = 'https://github.com/login/oauth/authorize?' + new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: redirect,
    scope: 'public_repo',
    state,
    allow_signup: 'false',
  });
  return Response.redirect(url, 302);
}

async function oauthCallback(request: Request, env: Env): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const state = params.get('state') || '';
  const code = params.get('code') || '';
  const page = (status: 'success' | 'error', content: object) => {
    const msg = `authorization:github:${status}:${JSON.stringify(content)}`;
    const origin = JSON.stringify(env.ALLOWED_ORIGIN);
    const html = `<!doctype html><meta charset="utf-8"><title>Connexion</title><p>${status === 'success' ? 'Connecté, cette fenêtre va se fermer.' : 'Connexion refusée.'}</p><script>
(function () {
  var msg = ${JSON.stringify(msg)};
  function receive(e) {
    if (e.origin !== ${origin}) return;
    window.opener.postMessage(msg, e.origin);
    window.removeEventListener('message', receive, false);
    setTimeout(function () { window.close(); }, 300);
  }
  window.addEventListener('message', receive, false);
  if (window.opener) window.opener.postMessage('authorizing:github', ${origin});
})();
</script>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  };
  if (!state || !(await env.HOLDS.get('oauth:' + state))) return page('error', { message: 'Session de connexion expirée, réessaie.' });
  await env.HOLDS.delete('oauth:' + state);
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'vgthmind-shop-checkout' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!data.access_token) return page('error', { message: data.error_description || 'GitHub a refusé la connexion.' });
  // Seul le compte admin peut se connecter.
  const user: any = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${data.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'vgthmind-shop-checkout' },
  }).then((r) => r.json()).catch(() => ({}));
  if (String(user.login || '').toLowerCase() !== String(env.ADMIN_GITHUB_LOGIN).toLowerCase()) {
    return page('error', { message: 'Ce compte GitHub n\'a pas accès à cet admin.' });
  }
  // `token` reste pour Sveltia (il en a besoin pour publier sur GitHub) ; les
  // pages Stock/Commandes n'utilisent que `session`.
  return page('success', { token: data.access_token, provider: 'github', session: await makeSession(env) });
}

// --- /status -----------------------------------------------------------------
async function status(env: Env): Promise<Response> {
  const lines: string[] = [];
  const ok = (b: boolean) => (b ? 'OK ' : '-- ');
  const raw = env.STRIPE_SECRET_KEY || '';
  const key = raw.replace(/[\s​-‍﻿"'`]/g, '');
  const clean = /^(sk|rk)_(test|live)_/.test(key);
  lines.push(`${ok(!!raw)}STRIPE_SECRET_KEY posée`);
  if (raw) {
    lines.push(`${ok(clean)}format de la clé${clean ? ` (${key.slice(0, 7)}…)` : ' : caractères en trop, à reposer (le paiement marche quand même)'}`);
    try {
      const fixed = key.replace(/^[a-z]{1,3}(?=(sk|rk)_test_)/, '');
      const r = await fetch('https://api.stripe.com/v1/balance', { headers: { Authorization: `Bearer ${fixed}` } });
      lines.push(`${ok(r.ok)}clé acceptée par Stripe${r.ok ? '' : ` (HTTP ${r.status})`}`);
    } catch (e) { lines.push('-- clé : Stripe injoignable'); }
  }
  const wh = cleanWebhookSecret(env);
  const whRaw = env.STRIPE_WEBHOOK_SECRET || '';
  lines.push(`${ok(/^whsec_/.test(wh))}STRIPE_WEBHOOK_SECRET posée${wh && !/^whsec_/.test(wh) ? ' mais ne commence pas par whsec_ : à reposer' : ''}`
    + (whRaw ? ` (${wh.length} caractères${whRaw.length !== wh.length ? `, ${whRaw.length - wh.length} en trop ignorés : à reposer proprement` : ''})` : ''));
  const lastWh = await env.HOLDS.get('webhook:last');
  if (lastWh) lines.push(`   dernier appel du webhook : ${lastWh}`);
  lines.push(`${ok(!!env.GITHUB_CLIENT_ID)}GITHUB_CLIENT_ID (OAuth App) renseigné`);
  lines.push(`${ok(!!env.GITHUB_CLIENT_SECRET)}GITHUB_CLIENT_SECRET (OAuth App) posé`);
  if (env.GITHUB_TOKEN) lines.push('-- GITHUB_TOKEN encore posé : plus utilisé, à supprimer');
  try {
    const catalog = await loadCatalog(env);
    const snap = await stockStub(env).snapshot(catalogDefaults(catalog));
    lines.push(`OK stock (Durable Object) : ${Object.keys(snap).length} pièces, ${Object.values(snap).filter((n) => n <= 0).length} en Sold out`);
  } catch (e: any) { lines.push('-- stock : ' + (e && e.message ? e.message : e)); }
  const latest = await env.HOLDS.get('backup:latest');
  lines.push(`${ok(!!latest)}dernière sauvegarde du stock : ${latest ? JSON.parse(latest).date : 'aucune'}`);
  lines.push(`   mode : ${env.LIVE_MODE === '1' ? 'LIVE' : 'test uniquement'}`);
  return new Response(lines.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// --- Outils ------------------------------------------------------------------
// Signature Stripe : « t=…,v1=… », HMAC-SHA256 de « t.payload », 5 min max.
async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = header.split(',').map((kv) => kv.split('='));
  const t = (parts.find(([k]) => k === 't') || [])[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || sigs.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const cryptoKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(`${t}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return sigs.some((sig) => timingSafeEqual(sig, expected));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Session admin : « vgs.<expiration>.<signature> », signée par SESSION_SECRET,
// valable 30 jours, renouvelée via /admin/renew. Le navigateur la garde en
// localStorage et l'envoie en Authorization (pas de cookie tiers : Safari les bloque).
const SESSION_TTL = 60 * 60 * 24 * 30;

async function sessionSig(env: Env, exp: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const data = new TextEncoder().encode(`vgs.${exp}.${String(env.ADMIN_GITHUB_LOGIN).toLowerCase()}`);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
  let s = '';
  for (const b of sig) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function makeSession(env: Env): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  return `vgs.${exp}.${await sessionSig(env, exp)}`;
}

async function isAdmin(request: Request, env: Env): Promise<boolean> {
  if (!env.SESSION_SECRET) return false;
  const m = /^Bearer vgs\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization') || '');
  if (!m) return false;
  const exp = Number(m[1]);
  if (exp < Date.now() / 1000) return false;
  return timingSafeEqual(m[2], await sessionSig(env, exp));
}

async function listOrders(request: Request, env: Env, key: string, json: JsonFn): Promise<Response> {
  if (!(await isAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  const stripe = await stripeCall(key, 'GET', '/v1/checkout/sessions?status=complete&limit=100&expand[]=data.line_items&expand[]=data.line_items.data.price.product');
  if (!stripe.ok) return json({ error: stripe.data.error?.message || 'Erreur Stripe' }, 502);
  const orders = [];
  let catalog: Product[] = [];
  try { catalog = await loadCatalog(env); } catch (e) {}
  for (const s of stripe.data.data || []) {
    if (s.payment_status !== 'paid') continue;
    const ship = (s.collected_information && s.collected_information.shipping_details) || s.shipping_details || {};
    const [shipped, preparing, ref] = await Promise.all([env.HOLDS.get('shipped:' + s.id), env.HOLDS.get('preparing:' + s.id), assignRef(env, s.id)]);
    orders.push({
      id: s.id,
      ref,
      created: s.created,
      livemode: !!s.livemode,
      total: s.amount_total / 100,
      shipping: (s.shipping_cost?.amount_total || 0) / 100,
      discount: (s.total_details?.amount_discount || 0) / 100,
      email: s.customer_details?.email || '',
      phone: s.customer_details?.phone || '',
      name: ship.name || s.customer_details?.name || '',
      address: ship.address || null,
      items: (await mailItems(env, s.line_items?.data || [], (c) => String(c / 100), catalog)).map((i) => ({ ...i, amount: Number(i.amount), unit: i.unit ? Number(i.unit) : 0 })),
      shipped: shipped ? JSON.parse(shipped) : null,
      preparing: preparing ? JSON.parse(preparing) : null,
    });
  }
  return json({ orders });
}

async function markShipped(request: Request, env: Env, json: JsonFn): Promise<Response> {
  if (!(await isAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  let body: any = {};
  try { body = await request.json(); } catch (e) {}
  if (!isSessionId(String(body.id || ''))) return json({ error: 'Identifiant invalide.' }, 400);
  if (body.undo) {
    await env.HOLDS.delete('shipped:' + body.id);
    return json({ ok: true });
  }
  const value = { at: Math.floor(Date.now() / 1000), tracking: String(body.tracking || '').trim().slice(0, 100) };
  await env.HOLDS.put('shipped:' + body.id, JSON.stringify(value));
  return json({ ok: true, shipped: value });
}

// « En preparation » : pose a la main depuis l'admin (bouton a cote de « expediee »).
async function markPreparing(request: Request, env: Env, json: JsonFn): Promise<Response> {
  if (!(await isAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  let body: any = {};
  try { body = await request.json(); } catch (e) {}
  if (!isSessionId(String(body.id || ''))) return json({ error: 'Identifiant invalide.' }, 400);
  if (body.undo) {
    await env.HOLDS.delete('preparing:' + body.id);
    return json({ ok: true });
  }
  const value = { at: Math.floor(Date.now() / 1000) };
  await env.HOLDS.put('preparing:' + body.id, JSON.stringify(value));
  return json({ ok: true, preparing: value });
}

// --- Numero de commande court (VG-K7M4QX) + page de suivi ---------------------
// Alphabet sans 0/O, 1/I/L : se dicte et se recopie sans erreur (31^6 = 887 M).
const REF_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

async function refCandidate(sessionId: string, salt: number): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + sessionId)));
  let out = '';
  for (let i = 0; i < 6; i++) out += REF_CHARS[h[i] % REF_CHARS.length];
  return 'VG-' + out;
}

// Numero stable d'une commande. Index KV ref:<numero> -> session et
// sref:<session> -> numero. Si le numero est deja pris par UNE AUTRE commande
// (tres rare), on genere une variante au lieu d'ecraser l'ancienne.
async function assignRef(env: Env, sessionId: string): Promise<string> {
  const have = await env.HOLDS.get('sref:' + sessionId);
  if (have) return have;
  for (let salt = 0; salt < 25; salt++) {
    const cand = await refCandidate(sessionId, salt);
    const owner = await env.HOLDS.get('ref:' + cand);
    if (owner && owner !== sessionId) continue;
    await env.HOLDS.put('ref:' + cand, sessionId);
    await env.HOLDS.put('sref:' + sessionId, cand);
    return cand;
  }
  throw new Error('Numéro de commande indisponible.');
}

// Accepte « VG-k7m4qx », « k7m4qx », « VG K7M4QX »… -> « VG-K7M4QX » (ou '').
function normalizeRef(raw: string): string {
  const t = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^VG/, '');
  return /^[A-Z0-9]{6}$/.test(t) ? 'VG-' + t : '';
}

const TRACK_WINDOW = 15 * 60; // secondes
const TRACK_MAX_PER_IP = 15; // tentatives par IP et par fenetre
const TRACK_MAX_FAILS_PER_REF = 5; // echecs par numero et par fenetre
async function bump(env: Env, key: string): Promise<number> {
  const n = (Number(await env.HOLDS.get(key)) || 0) + 1;
  await env.HOLDS.put(key, String(n), { expirationTtl: TRACK_WINDOW });
  return n;
}

// Page /suivi : ne renvoie rien sans le bon couple numero + e-mail. Tous les
// echecs (numero inconnu, e-mail faux, commande non payee) donnent la meme reponse.
async function trackOrder(request: Request, env: Env, key: string, json: JsonFn): Promise<Response> {
  let body: any = {};
  try { body = await request.json(); } catch (e) {}
  const ip = request.headers.get('CF-Connecting-IP') || 'inconnue';
  const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
  const ref = normalizeRef(body.ref);
  const tooMany = () => json({ ok: false, error: 'rate' }, 429);
  const neutral = () => json({ ok: false }, 404);
  if ((await bump(env, 'rl:ip:' + ip)) > TRACK_MAX_PER_IP) return tooMany();
  if (!ref || !email) return neutral();
  if ((Number(await env.HOLDS.get('rl:ref:' + ref)) || 0) >= TRACK_MAX_FAILS_PER_REF) return tooMany();
  const fail = async () => { await bump(env, 'rl:ref:' + ref); return neutral(); };

  const sessionId = await env.HOLDS.get('ref:' + ref);
  if (!sessionId || !isSessionId(sessionId)) return fail();
  const full = await stripeCall(key, 'GET', `/v1/checkout/sessions/${sessionId}?${SESSION_EXPAND}`);
  const s = full.data;
  if (!full.ok || s.payment_status !== 'paid') return fail();
  if (String(s.customer_details?.email || '').trim().toLowerCase() !== email) return fail();

  const [shippedRaw, preparingRaw] = await Promise.all([env.HOLDS.get('shipped:' + sessionId), env.HOLDS.get('preparing:' + sessionId)]);
  const shipped = shippedRaw ? JSON.parse(shippedRaw) : null;
  const ship = (s.collected_information && s.collected_information.shipping_details) || s.shipping_details || {};
  const a = ship.address || {};
  const tracking = shipped ? String(shipped.tracking || '').trim() : '';
  return json({
    ok: true,
    ref,
    status: shipped ? 'shipped' : preparingRaw ? 'preparing' : 'received',
    created: s.created,
    shippedAt: shipped ? shipped.at : null,
    currency: String(s.currency || 'eur').toUpperCase(),
    items: (await mailItems(env, s.line_items?.data || [], (c) => String(c / 100))).map((i) => ({ ...i, amount: Number(i.amount), unit: i.unit ? Number(i.unit) : 0 })),
    address: [ship.name || s.customer_details?.name, a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' '), a.state].filter(Boolean),
    country: a.country || '',
    shipping: (s.shipping_cost?.amount_total || 0) / 100,
    total: s.amount_total / 100,
    tracking,
    trackUrl: tracking ? 'https://www.laposte.fr/outils/suivre-vos-envois?code=' + encodeURIComponent(tracking) : '',
  });
}

// Mail « expediee » HTML envoye au client (bouton admin), une fois par clic.
async function sendShippedMail(request: Request, env: Env, key: string, json: JsonFn): Promise<Response> {
  if (!(await isAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  let body: any = {};
  try { body = await request.json(); } catch (e) {}
  const id = String(body.id || '');
  if (!isSessionId(id)) return json({ error: 'Identifiant invalide.' }, 400);
  const from = (env.MAIL_FROM || '').trim();
  if (!env.RESEND_API_KEY || !from) return json({ error: "Envoi d'email non configuré." }, 503);
  const raw = await env.HOLDS.get('shipped:' + id);
  if (!raw) return json({ error: "Marque d'abord la commande « expédiée »." }, 400);
  const shipped = JSON.parse(raw);
  const full = await stripeCall(key, 'GET', `/v1/checkout/sessions/${id}?${SESSION_EXPAND}`);
  if (!full.ok) return json({ error: full.data.error?.message || 'Erreur Stripe' }, 502);
  const order = await buildOrder(env, full.data);
  if (!order.email) return json({ error: 'Pas d’email client sur cette commande.' }, 400);
  const m = shippedEmail(order, shipped.tracking || '');
  if (!(await resendSend(env, from, order.email, m.subject, m.html, m.text, REPLY_TO))) return json({ error: "L'envoi a échoué (Resend)." }, 502);
  shipped.notified = Math.floor(Date.now() / 1000);
  await env.HOLDS.put('shipped:' + id, JSON.stringify(shipped));
  return json({ ok: true, shipped });
}

async function stripeCall(key: string, method: string, path: string, params?: URLSearchParams) {
  const res = await fetch('https://api.stripe.com' + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params ? params.toString() : undefined,
  });
  return { ok: res.ok, data: (await res.json()) as any };
}

function isSessionId(id: string) {
  return /^cs_(test|live)_[A-Za-z0-9]+$/.test(id);
}
function frLine(p: Product) {
  return (p.shipping || []).find((s) => s.country && s.country.code === 'FR');
}
function intlLine(p: Product) {
  return (p.shipping || []).find((s) => !s.country);
}

// Secret de webhook : espaces, guillemets, caracteres invisibles et lettres
// tapees avant « whsec_ » ignores (meme souci que la cle, vu le 2026-10-06).
function cleanWebhookSecret(env: Env) {
  const raw = (env.STRIPE_WEBHOOK_SECRET || '').replace(/[\s​-‍﻿"'`]/g, '');
  const i = raw.indexOf('whsec_');
  const s = i > 0 && i <= 3 ? raw.slice(i) : raw;
  // Collé deux fois (vu le 2026-10-06 : 76 caractères = 2 × 38).
  const half = s.length / 2;
  if (s.length % 2 === 0 && s.slice(0, half) === s.slice(half) && s.startsWith('whsec_')) return s.slice(0, half);
  return s;
}
