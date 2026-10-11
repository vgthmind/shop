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
interface ShipEnv { HOLDS: KVLike; SITE_BASE: string }
interface CatalogLine { permalink: string; price: number }
type JsonFn = (data: unknown, status?: number) => Response;

const KEY = 'shipping:config';

export async function loadShippingConfig(env: ShipEnv): Promise<any> {
  const saved = await env.HOLDS.get(KEY);
  if (saved) { try { return JSON.parse(saved); } catch (e) { /* grille abimee : on retombe sur le fichier du depot */ } }
  const res = await fetch(`${env.SITE_BASE}/admin/shipping-config.json`, { cf: { cacheTtl: 60 } } as any);
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
//   - Le client choisit son pays AVANT de payer ; on calcule le port exact pour ce pays sur la grille.
//   - Pieces « anciennes » (port fixe sur la fiche : shipping_fr / shipping_intl) SEULES : regle d'avant, le port
//     fixe le plus eleve du panier, quel que soit le pays (France ou « international »).
//   - Des qu'une piece du studio (sans port fixe) est dans le panier : grille sur le POIDS TOTAL (colis partages),
//     anciennes pieces avec poids comprises. Une ancienne piece SANS poids garde son port fixe : le resultat est
//     alors le plus eleve entre la grille et ces ports fixes.
//   - Jamais 0 € par erreur : sans poids ni port, refus. Pays non livre (grille: zones, pays bloques) : refus.
//   - Sans pays : France si region « fr » ; « intl » sans pays = ancien comportement, seulement pour des
//     anciennes pieces seules ; sinon erreur « country_required ».
const { findZone } = calc as { findZone: (cfg: any, country: string) => any };

export interface CheckoutProduct {
  permalink: string;
  price: number;
  weight_g?: number;
  mode?: string;
  alone?: boolean;
  shipping_derived?: boolean; // port affiche calcule par le build : le Worker ne s'y fie pas
  shipping: { amount_alone: number; country?: { code: string } }[];
}
export type CheckoutShipping =
  | { ok: true; cents: number; source: 'legacy' | 'grid' | 'mixed'; country: string | null; free: boolean }
  | { ok: false; error: string; message: string; slugs?: string[] };

function fixedPort(p: CheckoutProduct, region: 'fr' | 'intl'): number | null {
  if (p.shipping_derived) return null;
  const line = (p.shipping || []).find((s) => (region === 'fr' ? s.country && s.country.code === 'FR' : !s.country));
  const v = line ? Number(line.amount_alone) : 0;
  return v > 0 ? v : null;
}

function served(config: any, country: string): boolean {
  const blocked = (config.blocked_countries || []).map((c: string) => String(c).toUpperCase());
  if (blocked.includes(country)) return false;
  const z = findZone(config, country);
  return !!z && z.enabled !== false;
}

export async function checkoutShipping(
  env: ShipEnv, products: CheckoutProduct[], wanted: Map<string, number>, region: 'fr' | 'intl', country?: string,
): Promise<CheckoutShipping> {
  const cc = country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : '';
  if (cc) region = cc === 'FR' ? 'fr' : 'intl';
  const fixed: { p: CheckoutProduct; cents: number }[] = [];
  const fresh: CheckoutProduct[] = [];
  for (const p of products) {
    const v = fixedPort(p, region);
    if (v === null) fresh.push(p); else fixed.push({ p, cents: Math.round(v * 100) });
  }
  const loadGrid = async () => { try { return await loadShippingConfig(env); } catch (e) { return null; } };

  if (fresh.length === 0) { // anciennes pieces seules : port fixe d'avant
    const legacy = fixed.length ? Math.max(...fixed.map((f) => f.cents)) : 0;
    if (cc && cc !== 'FR') { // meme ici, un pays refuse reste refuse (quand la grille est lisible)
      const config = await loadGrid();
      if (config && !served(config, cc)) return { ok: false, error: 'country_not_served', message: 'Pays non livré : ' + cc };
    }
    return { ok: true, cents: legacy, source: 'legacy', country: cc || null, free: false };
  }

  if (region === 'intl' && !cc) return { ok: false, error: 'country_required', message: 'Choisis ton pays de livraison.' };
  const config = await loadGrid();
  if (!config) return { ok: false, error: 'config_unavailable', message: 'Grille des frais d’envoi indisponible.' };

  const weightless = fixed.filter((f) => !(Number(f.p.weight_g) > 0));
  const inGrid = [...fresh, ...fixed.filter((f) => Number(f.p.weight_g) > 0).map((f) => f.p)];
  const gridItems = inGrid.map((p) => ({ slug: p.permalink, qty: wanted.get(p.permalink) || 1, weight_g: p.weight_g, mode: p.mode, alone: p.alone === true }));
  const subtotal = products.reduce((s, p) => s + p.price * (wanted.get(p.permalink) || 1), 0);
  const cart = { items: gridItems, subtotal };
  const legacyCents = weightless.length ? Math.max(...weightless.map((f) => f.cents)) : 0;

  const countries = cc ? [cc] : ['FR'];
  let r: any = null;
  for (const c of countries) r = quoteShipping(config, cart, c);
  if (!r.ok) return { ok: false, error: r.error, message: r.message, slugs: r.slugs };
  return { ok: true, cents: Math.max(r.totalCents, legacyCents), source: weightless.length ? 'mixed' : 'grid', country: cc || 'FR', free: !!r.free };
}
