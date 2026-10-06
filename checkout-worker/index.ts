// Checkout Worker : cree une session Stripe Checkout pour TOUT le panier de
// /shop/ (plusieurs pieces payees en une fois, frais de port compris), puis
// traite le retour de Stripe (webhook) : piece vendue -> in_stock:false dans
// data/products/ (commit GitHub, l'Action reconstruit le site).
//
// Le navigateur n'envoie que des slugs + la zone de livraison : prix, stock
// et frais de port sont relus ici dans le catalogue publie
// (SITE_BASE/products.json), jamais crus sur parole.
//
// Mode test uniquement tant que LIVE_MODE != "1" (wrangler.toml) : une cle
// sk_live_ est refusee. Aucun secret dans le depot (wrangler secret put) :
//   STRIPE_SECRET_KEY      cle sk_test_ (obligatoire)
//   STRIPE_WEBHOOK_SECRET  whsec_ du webhook Stripe (pour /webhook)
//   GITHUB_TOKEN           jeton fine-grained, Contents RW sur vgthmind/shop
//
// Routes :
//   POST /checkout  { items: ["ch_0002", ...], region: "fr"|"intl", cart_id } -> { url }
//   GET  /session?id=cs_…  -> resume d'une session payee (page /shop/merci/)
//   POST /release   { id: "cs_…" } -> expire la session (page /shop/paiement-annule/)
//   POST /webhook   evenements Stripe (signature verifiee)

interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

interface Env {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO: string; // vgthmind/shop
  ALLOWED_ORIGIN: string; // https://vgthmind.github.io
  SITE_BASE: string; // https://vgthmind.github.io/shop
  LIVE_MODE?: string; // "1" seulement le jour du passage en live
  HOLDS: KV; // reservations des pieces pendant un paiement + commandes
}

interface ShippingLine { amount_alone: number; country?: { code: string } }
interface Product {
  permalink: string;
  name: string;
  price: number;
  status: string;
  url: string;
  images: { url: string }[];
  options: { sold_out: boolean }[];
  shipping: ShippingLine[];
}

const MAX_ITEMS = 20;
const SESSION_MINUTES = 30; // minimum Stripe
const HOLD_TTL = (SESSION_MINUTES + 2) * 60;
const SOLD_TTL = 6 * 3600; // le temps que le site reconstruit affiche « Sold out »

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

type JsonFn = (data: unknown, status?: number) => Response;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      Vary: 'Origin',
    };
    const json: JsonFn = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors } });

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const key = env.STRIPE_SECRET_KEY || '';
    if (!key) return json({ error: 'Paiement pas encore configuré.' }, 503);
    if (!key.startsWith('sk_test_') && env.LIVE_MODE !== '1') {
      return json({ error: 'Paiement en mode test uniquement pour le moment.' }, 503);
    }

    const path = new URL(request.url).pathname;
    try {
      if (path === '/checkout' && request.method === 'POST') return await checkout(request, env, key, json);
      if (path === '/session' && request.method === 'GET') return await session(request, key, json);
      if (path === '/release' && request.method === 'POST') return await release(request, env, key, json);
      if (path === '/webhook' && request.method === 'POST') return await webhook(request, env, json);
    } catch (e: any) {
      return json({ error: 'Erreur interne : ' + (e && e.message ? e.message : e) }, 500);
    }
    return json({ error: 'Not found' }, 404);
  },
};

async function checkout(request: Request, env: Env, key: string, json: JsonFn): Promise<Response> {
  let body: { items?: unknown; region?: unknown; cart_id?: unknown };
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Requête invalide.' }, 400);
  }
  const slugs = Array.isArray(body.items)
    ? [...new Set(body.items.map((s: any) => String(typeof s === 'object' && s ? s.slug : s)))]
    : [];
  if (slugs.length === 0) return json({ error: 'Panier vide.' }, 400);
  if (slugs.length > MAX_ITEMS) return json({ error: 'Trop de pièces dans le panier.' }, 400);
  const region = body.region === 'intl' ? 'intl' : 'fr';
  const cartId = /^[A-Za-z0-9-]{8,64}$/.test(String(body.cart_id || '')) ? String(body.cart_id) : 'anon-' + crypto.randomUUID();

  // Catalogue publie (cache Cloudflare 60 s ; une piece vendue entre-temps
  // est de toute facon bloquee par sa reservation « sold » ci-dessous).
  const res = await fetch(`${env.SITE_BASE}/products.json`, { cf: { cacheTtl: 60, cacheEverything: true } } as any);
  if (!res.ok) return json({ error: 'Catalogue indisponible, réessaie dans un instant.' }, 502);
  const catalog: Product[] = await res.json();
  const bySlug = new Map(catalog.map((p) => [p.permalink, p]));

  const products: Product[] = [];
  const problems: { slug: string; reason: string }[] = [];
  for (const slug of slugs) {
    const p = bySlug.get(slug);
    const hold = await env.HOLDS.get('hold:' + slug);
    if (!p) problems.push({ slug, reason: 'introuvable' });
    else if (p.status !== 'active' || (p.options || []).every((o) => o.sold_out) || hold === 'sold') problems.push({ slug, reason: 'vendue' });
    else if (hold && hold !== cartId) problems.push({ slug, reason: 'reservee' });
    else if (region === 'intl' && !intlLine(p)) problems.push({ slug, reason: 'france_uniquement' });
    else products.push(p);
  }
  if (problems.length) return json({ error: 'Panier à mettre à jour.', problems }, 409);

  // Meme regle que BigCartel (amount_with_others = 0 partout) : la commande
  // paie une seule fois le tarif le plus eleve du panier pour sa zone.
  const shipping = Math.max(0, ...products.map((p) => {
    const line = region === 'fr' ? frLine(p) : intlLine(p);
    return line ? line.amount_alone : 0;
  }));

  const origin = new URL(env.SITE_BASE).origin;
  const slugList = products.map((p) => p.permalink).join(',').slice(0, 500);
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('locale', 'auto');
  params.set('success_url', `${env.SITE_BASE}/merci/?session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${env.SITE_BASE}/paiement-annule/?session_id={CHECKOUT_SESSION_ID}`);
  // Session valable 30 min : borne la reservation d'une piece unique.
  params.set('expires_at', String(Math.floor(Date.now() / 1000) + SESSION_MINUTES * 60 + 30));
  params.set('phone_number_collection[enabled]', 'true');
  params.set('metadata[slugs]', slugList);
  params.set('metadata[region]', region);
  params.set('metadata[cart_id]', cartId);
  params.set('payment_intent_data[metadata][slugs]', slugList);
  products.forEach((p, i) => {
    params.set(`line_items[${i}][quantity]`, '1');
    params.set(`line_items[${i}][price_data][currency]`, 'eur');
    params.set(`line_items[${i}][price_data][unit_amount]`, String(Math.round(p.price * 100)));
    params.set(`line_items[${i}][price_data][product_data][name]`, p.name);
    params.set(`line_items[${i}][price_data][product_data][metadata][slug]`, p.permalink);
    const img = p.images && p.images[0] && p.images[0].url;
    if (img) params.set(`line_items[${i}][price_data][product_data][images][0]`, origin + encodeURI(img));
  });
  const countries = region === 'fr' ? ['FR'] : STRIPE_COUNTRIES;
  countries.forEach((c, i) => params.set(`shipping_address_collection[allowed_countries][${i}]`, c));
  params.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
  params.set('shipping_options[0][shipping_rate_data][display_name]', region === 'fr' ? 'Livraison France' : 'Livraison internationale');
  params.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(Math.round(shipping * 100)));
  params.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'eur');

  const stripe = await stripeCall(key, 'POST', '/v1/checkout/sessions', params);
  if (!stripe.ok) return json({ error: stripe.data.error?.message || 'Erreur Stripe' }, 502);
  for (const p of products) await env.HOLDS.put('hold:' + p.permalink, cartId, { expirationTtl: HOLD_TTL });
  return json({ url: stripe.data.url });
}

async function session(request: Request, key: string, json: JsonFn): Promise<Response> {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!isSessionId(id)) return json({ error: 'Identifiant invalide.' }, 400);
  const stripe = await stripeCall(key, 'GET', `/v1/checkout/sessions/${id}?expand[]=line_items`);
  if (!stripe.ok) return json({ error: 'Commande introuvable.' }, 404);
  const s = stripe.data;
  return json({
    paid: s.payment_status === 'paid',
    total: s.amount_total / 100,
    shipping: (s.shipping_cost?.amount_total || 0) / 100,
    email: s.customer_details?.email || '',
    items: (s.line_items?.data || []).map((li: any) => ({ name: li.description, amount: li.amount_total / 100 })),
    slugs: (s.metadata?.slugs || '').split(',').filter(Boolean),
  });
}

// Retour « annuler » de Stripe : la session est expiree tout de suite pour
// rendre les pieces aux autres visiteurs (sinon reservees jusqu'a 30 min).
async function release(request: Request, env: Env, key: string, json: JsonFn): Promise<Response> {
  let id = '';
  try { id = String(((await request.json()) as any).id || ''); } catch (e) {}
  if (!isSessionId(id)) return json({ error: 'Identifiant invalide.' }, 400);
  const got = await stripeCall(key, 'GET', `/v1/checkout/sessions/${id}`);
  if (!got.ok) return json({ ok: false });
  if (got.data.status === 'open') await stripeCall(key, 'POST', `/v1/checkout/sessions/${id}/expire`, new URLSearchParams());
  await releaseHolds(env, got.data.metadata || {});
  return json({ ok: true });
}

async function releaseHolds(env: Env, metadata: any) {
  const cartId = metadata.cart_id;
  for (const slug of String(metadata.slugs || '').split(',').filter(Boolean)) {
    if ((await env.HOLDS.get('hold:' + slug)) === cartId) await env.HOLDS.delete('hold:' + slug);
  }
}

async function webhook(request: Request, env: Env, json: JsonFn): Promise<Response> {
  const secret = env.STRIPE_WEBHOOK_SECRET || '';
  if (!secret) return json({ error: 'Webhook pas encore configuré.' }, 503);
  const payload = await request.text();
  if (!(await verifyStripeSignature(payload, request.headers.get('stripe-signature') || '', secret))) {
    return json({ error: 'Signature invalide.' }, 400);
  }
  const event = JSON.parse(payload);
  const s = event.data && event.data.object;
  if (!s) return json({ received: true });

  if (event.type === 'checkout.session.expired') {
    await releaseHolds(env, s.metadata || {});
    return json({ received: true });
  }
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
    return json({ received: true });
  }
  if (s.payment_status !== 'paid') return json({ received: true });

  const slugs: string[] = String((s.metadata || {}).slugs || '').split(',').filter(Boolean);
  for (const slug of slugs) await env.HOLDS.put('hold:' + slug, 'sold', { expirationTtl: SOLD_TTL });
  // Trace de la commande (future page admin « Commandes »), sans donnees
  // personnelles au-dela de ce que Stripe garde deja.
  await env.HOLDS.put(`order:${s.created}:${s.id}`, JSON.stringify({
    id: s.id, created: s.created, total: s.amount_total / 100, slugs,
    region: (s.metadata || {}).region, livemode: !!s.livemode, shipped: false,
  }));

  // Stock : chaque piece vendue passe en « Sold out » dans l'admin. Une
  // erreur ici renvoie 500 : Stripe reessaie le webhook plus tard.
  if (env.GITHUB_TOKEN) {
    for (const slug of slugs) await markSoldOut(env, slug, s.id);
  }
  return json({ received: true });
}

async function markSoldOut(env: Env, slug: string, sessionId: string) {
  const api = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/data/products/${encodeURIComponent(slug)}.json`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'vgthmind-shop-checkout',
  };
  const got = await fetch(api, { headers });
  if (got.status === 404) return; // piece renommee/supprimee entre-temps : rien a faire
  if (!got.ok) throw new Error(`GitHub GET ${slug}: ${got.status}`);
  const file: any = await got.json();
  const product = JSON.parse(fromBase64(file.content));
  if (product.in_stock === false) return; // deja fait (webhook rejoue)
  product.in_stock = false;
  const put = await fetch(api, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Vendu : ${product.name || slug} (commande Stripe ${sessionId.slice(0, 20)}…)`,
      content: toBase64(JSON.stringify(product, null, 2) + '\n'),
      sha: file.sha,
    }),
  });
  if (!put.ok) throw new Error(`GitHub PUT ${slug}: ${put.status}`);
}

// Signature Stripe : en-tete « t=…,v1=… », HMAC-SHA256 de « t.payload »,
// tolerance 5 min contre le rejeu.
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

function fromBase64(b64: string) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
function toBase64(text: string) {
  let bin = '';
  new TextEncoder().encode(text).forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
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
