// Cree une session Stripe Checkout pour TOUT le panier (plusieurs pieces a
// la fois), contournant la limite des Payment Links (un lien = un produit a
// prix fixe, voir chantier/ETAT.md "tache 2"). Pas deploye, aucun compte
// cree par cette session - code pret, a deployer le jour ou Jules veut un
// vrai paiement groupe plutot que les liens Stripe par piece.
//
// Appele par shop/assets/vg-shop-cart.js quand window.VG_SHOP_CHECKOUT_ENDPOINT
// est renseigne (voir ce fichier - vide par defaut, donc ce Worker n'est
// appele par rien tant qu'il n'est pas deploye ET configure cote front).
//
// Deploiement (une fois, voir aussi oauth-worker/README.md pour le detail
// wrangler/Cloudflare, identique ici) :
//   1. Compte Stripe (si pas deja fait), cle secrete (dashboard Stripe >
//      Developers > API keys) - jamais dans ce depot.
//   2. wrangler secret put STRIPE_SECRET_KEY
//   3. npx wrangler deploy - note l'URL affichee
//   4. Dans assets/vg-shop-cart.js (ou un <script> dedie), poser
//      window.VG_SHOP_CHECKOUT_ENDPOINT = "https://<ton-worker>.workers.dev"

addEventListener('fetch', (event: any) => {
  event.respondWith(handle(event.request));
});

// Inserted as a secret / var by wrangler - global bindings in the Workers
// runtime, same pattern as oauth-worker/index.ts (CLIENT_ID/CLIENT_SECRET).
// wrangler secret put STRIPE_SECRET_KEY ; ALLOWED_ORIGIN comes from the
// [vars] block in wrangler.toml.
// @ts-ignore
const stripeSecretKey: string = STRIPE_SECRET_KEY;
// @ts-ignore
const allowedOrigin: string = ALLOWED_ORIGIN;

interface CartItem {
  slug: string;
  name: string;
  price: number; // EUR
  shipping_fr?: number;
  shipping_intl?: number;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
  };
}

async function handle(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders() });
  if (!stripeSecretKey) return json({ error: 'STRIPE_SECRET_KEY non configuree sur ce Worker' }, 500);

  let body: { items: CartItem[]; region: 'fr' | 'intl' };
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'JSON invalide' }, 400);
  }
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return json({ error: 'Panier vide' }, 400);
  const region = body.region === 'intl' ? 'intl' : 'fr';

  // Memes regles que le panier cote front (assets/vg-shop-cart.js) : chaque
  // ligne de frais de port BigCartel importee a amount_with_others=0 -
  // combiner des pieces ne coute jamais plus que la plus chere a expedier
  // seule.
  const shipping = items.reduce((max, it) => {
    const amount = region === 'fr' ? (it.shipping_fr || 0) : (it.shipping_intl ?? it.shipping_fr ?? 0);
    return Math.max(max, amount);
  }, 0);

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', `${allowedOrigin}/shop/cart/?paid=1`);
  params.set('cancel_url', `${allowedOrigin}/shop/cart/`);
  items.forEach((it, i) => {
    params.set(`line_items[${i}][quantity]`, '1');
    params.set(`line_items[${i}][price_data][currency]`, 'eur');
    params.set(`line_items[${i}][price_data][unit_amount]`, String(Math.round(it.price * 100)));
    params.set(`line_items[${i}][price_data][product_data][name]`, it.name);
  });
  if (shipping > 0) {
    const i = items.length;
    params.set(`line_items[${i}][quantity]`, '1');
    params.set(`line_items[${i}][price_data][currency]`, 'eur');
    params.set(`line_items[${i}][price_data][unit_amount]`, String(Math.round(shipping * 100)));
    params.set(`line_items[${i}][price_data][product_data][name]`, region === 'fr' ? 'Livraison (France)' : 'Livraison (international)');
  }

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const data: any = await res.json();
  if (!res.ok) return json({ error: data.error?.message || 'Erreur Stripe' }, 502);
  return json({ url: data.url });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
