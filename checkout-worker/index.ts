// Checkout Worker : cree une session Stripe Checkout pour TOUT le panier de
// /shop/ (plusieurs pieces payees en une fois, frais de port compris).
//
// Le navigateur n'envoie que des slugs + la zone de livraison : prix, stock
// et frais de port sont relus ici dans le catalogue publie
// (SITE_BASE/products.json), jamais crus sur parole.
//
// Mode test uniquement tant que LIVE_MODE != "1" (wrangler.toml) : une cle
// sk_live_ est refusee. Aucune cle dans le depot : STRIPE_SECRET_KEY est un
// secret Cloudflare (`npx wrangler secret put STRIPE_SECRET_KEY`).
//
// Routes :
//   POST /checkout      { items: ["ch_0002", ...], region: "fr" | "intl" } -> { url }
//   GET  /session?id=…  -> resume d'une session payee (page /shop/merci/)

interface Env {
  STRIPE_SECRET_KEY?: string;
  ALLOWED_ORIGIN: string; // https://vgthmind.github.io
  SITE_BASE: string; // https://vgthmind.github.io/shop
  LIVE_MODE?: string; // "1" seulement le jour du passage en live
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
    } catch (e: any) {
      return json({ error: 'Erreur interne : ' + (e && e.message ? e.message : e) }, 500);
    }
    return json({ error: 'Not found' }, 404);
  },
};

async function checkout(request: Request, env: Env, key: string, json: JsonFn): Promise<Response> {
  let body: { items?: unknown; region?: unknown };
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

  // Catalogue publie (cache Cloudflare 60 s : une piece marquee vendue
  // dans l'admin est refusee ici au plus une minute apres le rebuild).
  const res = await fetch(`${env.SITE_BASE}/products.json`, { cf: { cacheTtl: 60, cacheEverything: true } } as any);
  if (!res.ok) return json({ error: 'Catalogue indisponible, réessaie dans un instant.' }, 502);
  const catalog: Product[] = await res.json();
  const bySlug = new Map(catalog.map((p) => [p.permalink, p]));

  const products: Product[] = [];
  const problems: { slug: string; reason: string }[] = [];
  for (const slug of slugs) {
    const p = bySlug.get(slug);
    if (!p) problems.push({ slug, reason: 'introuvable' });
    else if (p.status !== 'active' || (p.options || []).every((o) => o.sold_out)) problems.push({ slug, reason: 'vendue' });
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
  params.set('cancel_url', `${env.SITE_BASE}/paiement-annule/`);
  // Session valable 30 min (minimum Stripe) : borne la duree pendant
  // laquelle deux personnes peuvent payer la meme piece unique.
  params.set('expires_at', String(Math.floor(Date.now() / 1000) + 30 * 60 + 30));
  params.set('phone_number_collection[enabled]', 'true');
  params.set('metadata[slugs]', slugList);
  params.set('metadata[region]', region);
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
  return json({ url: stripe.data.url });
}

async function session(request: Request, key: string, json: JsonFn): Promise<Response> {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return json({ error: 'Identifiant invalide.' }, 400);
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

async function stripeCall(key: string, method: string, path: string, params?: URLSearchParams) {
  const res = await fetch('https://api.stripe.com' + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params ? params.toString() : undefined,
  });
  return { ok: res.ok, data: (await res.json()) as any };
}

function frLine(p: Product) {
  return (p.shipping || []).find((s) => s.country && s.country.code === 'FR');
}
function intlLine(p: Product) {
  return (p.shipping || []).find((s) => !s.country);
}
