// Frais d'envoi cote Worker (module NON BRANCHE : voir rapports-nuit/envoi.md).
// Le calcul vit dans admin/shipping-calc.js (meme fichier que le simulateur
// de la page admin et que les tests). Ici : lecture de la grille, prix
// recalcule a partir du CATALOGUE publie (jamais des montants du navigateur),
// et les routes /shipping/quote (public) + /admin/shipping (admin).
//
// Grille : KV « shipping:config » (ecrite par la page admin) ; a defaut,
// SITE_BASE/admin/shipping-config.json (fichier du depot, publie avec le site).

// @ts-ignore  (module JS sans types, UMD : esbuild le gere)
import calc from '../admin/shipping-calc.js';

const { quoteShipping, quoteOrFallback } = calc as {
  quoteShipping: (cfg: any, cart: any, country: string) => any;
  quoteOrFallback: (cfg: any, cart: any, country: string) => any;
};

interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}
interface ShipEnv { HOLDS: KVLike; SITE_BASE: string; CATALOG_BASE?: string; SESSION_SECRET?: string; ADMIN_GITHUB_LOGIN?: string }
interface CatalogLine { permalink: string; price: number }
type JsonFn = (data: unknown, status?: number) => Response;

const KEY = 'shipping:config';

// Le fichier de la grille est dans /admin/ du site, protégé par le garde (functions/admin/_middleware.js) :
// le Worker se présente avec une session d'admin qu'il signe lui-même (même format que isAdmin() dans index.ts).
async function adminCookie(env: ShipEnv): Promise<string> {
  if (!env.SESSION_SECRET) return '';
  const exp = Math.floor(Date.now() / 1000) + 300;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`vgs.${exp}.${String(env.ADMIN_GITHUB_LOGIN).toLowerCase()}`)));
  let b = '';
  for (const x of sig) b += String.fromCharCode(x);
  return `vgs.${exp}.${btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

export async function loadShippingConfig(env: ShipEnv): Promise<any> {
  const saved = await env.HOLDS.get(KEY);
  if (saved) { try { return JSON.parse(saved); } catch (e) { /* grille abimee : on retombe sur le fichier du depot */ } }
  const tok = await adminCookie(env);
  const res = await fetch(`${env.CATALOG_BASE || env.SITE_BASE}/admin/shipping-config.json`, { headers: tok ? { Cookie: 'vg-admin=' + encodeURIComponent(tok) } : {}, cf: { cacheTtl: 60 } } as any);
  if (!res.ok) throw new Error('Grille des frais d’envoi introuvable.');
  return res.json();
}

// Verification minimale d'une grille envoyee par l'admin.
export function checkShippingConfig(c: any): string | null {
  if (!c || typeof c !== 'object' || !Array.isArray(c.zones) || c.zones.length === 0) return 'Aucune zone.';
  for (const z of c.zones) {
    if (!z || typeof z.id !== 'string' || !Array.isArray(z.countries) || !Array.isArray(z.brackets) || z.brackets.length === 0) return 'Zone invalide : ' + (z && z.id);
    for (const b of z.brackets) if (!(b.max_g > 0) || !(b.price >= 0)) return 'Tranche invalide dans la zone ' + z.id;
  }
  if (c.items && typeof c.items !== 'object') return 'Pièces invalides.';
  return null;
}

// Prix de port d'un panier. `wanted` : slug -> quantite ; le sous-total vient du catalogue.
export async function shippingForCart(env: ShipEnv, catalog: CatalogLine[], wanted: Map<string, number>, country: string) {
  const config = await loadShippingConfig(env);
  const bySlug = new Map(catalog.map((p) => [p.permalink, p]));
  let subtotal = 0;
  const items: { slug: string; qty: number }[] = [];
  for (const [slug, qty] of wanted) {
    const p = bySlug.get(slug);
    if (!p) continue;
    subtotal += p.price * qty;
    items.push({ slug, qty });
  }
  return quoteShipping(config, { items, subtotal }, country);
}

// Routes. A appeler depuis le routeur de index.ts ; renvoie null si la route n'est pas la sienne.
//   GET  /shipping/config        grille (publique : la meme que ce qui est affiche au client)
//   POST /shipping/quote         { items:[{slug,qty}], country } -> { ok, total, parcels… }   (affichage du panier)
//   GET/POST /admin/shipping     lire / enregistrer la grille (deja protege par le garde /admin/)
export async function shippingRoutes(
  request: Request, env: ShipEnv, path: string, json: JsonFn,
  loadCatalog: () => Promise<CatalogLine[]>,
): Promise<Response | null> {
  if (path === '/shipping/config' && request.method === 'GET') return json(await loadShippingConfig(env));
  if (path === '/shipping/quote' && request.method === 'POST') {
    const body: any = await request.json().catch(() => ({}));
    const wanted = new Map<string, number>();
    for (const it of Array.isArray(body.items) ? body.items : []) {
      const slug = String(it && it.slug);
      wanted.set(slug, Math.min(99, (wanted.get(slug) || 0) + Math.max(1, Math.floor(Number(it && it.qty) || 1))));
    }
    const country = String(body.country || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(country) || wanted.size === 0 || wanted.size > 20) return json({ error: 'Requête invalide.' }, 400);
    return json(await shippingForCart(env, await loadCatalog(), wanted, country));
  }
  if (path === '/admin/shipping' && request.method === 'GET') return json(await loadShippingConfig(env));
  if (path === '/admin/shipping' && request.method === 'POST') {
    const body: any = await request.json().catch(() => null);
    const bad = checkShippingConfig(body && body.config);
    if (bad) return json({ error: bad }, 400);
    await env.HOLDS.put(KEY, JSON.stringify(body.config));
    return json({ ok: true });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Port du paiement. Appele par POST /checkout et POST /shipping/quote (index.ts) : MEME calcul, donc le prix
// affiche dans le panier est celui de Stripe.
//   - Le client choisit son pays AVANT de payer ; on calcule le port exact pour ce pays sur la grille
//     (zones La Poste, poids TOTAL du panier, un seul colis quand c'est possible, forfaits par palier de pays).
//   - Toutes les pieces passent par la grille : plus aucun port fixe herite de BigCartel (shipping_fr / shipping_intl).
//   - Jamais 0 € par erreur : une piece sans poids est refusee (missing_weight). Pays non livre : refus.
//   - Sans pays : France si region « fr » ; « intl » sans pays = erreur « country_required ».
export interface CheckoutProduct {
  permalink: string;
  price: number;
  weight_g?: number;
  mode?: string;
  alone?: boolean;
  shipping_derived?: boolean; // port affiche calcule par le build (informatif)
  shipping: { amount_alone: number; country?: { code: string } }[];
}
export type CheckoutShipping =
  | { ok: true; cents: number; source: 'grid'; country: string | null; free: boolean }
  | { ok: false; error: string; message: string; slugs?: string[] };

export async function checkoutShipping(
  env: ShipEnv, products: CheckoutProduct[], wanted: Map<string, number>, region: 'fr' | 'intl', country?: string,
): Promise<CheckoutShipping> {
  const cc = country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : '';
  if (cc) region = cc === 'FR' ? 'fr' : 'intl';
  if (region === 'intl' && !cc) return { ok: false, error: 'country_required', message: 'Choisis ton pays de livraison.' };
  let config: any = null;
  try { config = await loadShippingConfig(env); } catch (e) { config = null; }
  if (!config) return { ok: false, error: 'config_unavailable', message: 'Grille des frais d’envoi indisponible.' };
  const items = products.map((p) => ({ slug: p.permalink, qty: wanted.get(p.permalink) || 1, weight_g: p.weight_g, mode: p.mode, alone: p.alone === true }));
  const subtotal = products.reduce((s, p) => s + p.price * (wanted.get(p.permalink) || 1), 0);
  const r: any = quoteShipping(config, { items, subtotal }, cc || 'FR');
  if (!r.ok) return { ok: false, error: r.error, message: r.message, slugs: r.slugs };
  return { ok: true, cents: r.totalCents, source: 'grid', country: cc || 'FR', free: !!r.free };
}
