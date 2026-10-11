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
// Port du paiement (lot 4). Appele par POST /checkout dans index.ts.
//   - Pieces « anciennes » (port fixe saisi sur la fiche : shipping_fr / shipping_intl) : regle d'avant,
//     le port le plus eleve du panier. Rien ne change pour elles.
//   - Pieces sans port fixe (ajoutees depuis le studio) : calcul sur la grille (poids, mode, colis).
//   - Panier mixte : le plus eleve des deux. Jamais 0 € par erreur : sans poids ni port, on refuse.
// `region` 'fr' -> France. 'intl' sans pays precise -> le pire cas des zones livrees (Stripe fixe le prix
// avant que le client donne son adresse) ; avec un pays valide -> le prix de ce pays.
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
  | { ok: true; cents: number; source: 'legacy' | 'grid' | 'mixed'; country: string | null }
  | { ok: false; error: string; message: string; slugs?: string[] };

function fixedPort(p: CheckoutProduct, region: 'fr' | 'intl'): number | null {
  if (p.shipping_derived) return null;
  const line = (p.shipping || []).find((s) => (region === 'fr' ? s.country && s.country.code === 'FR' : !s.country));
  const v = line ? Number(line.amount_alone) : 0;
  return v > 0 ? v : null;
}

export async function checkoutShipping(
  env: ShipEnv, products: CheckoutProduct[], wanted: Map<string, number>, region: 'fr' | 'intl', country?: string,
): Promise<CheckoutShipping> {
  const fixed: number[] = [];
  const gridItems: any[] = [];
  for (const p of products) {
    const v = fixedPort(p, region);
    if (v !== null) { fixed.push(Math.round(v * 100)); continue; }
    gridItems.push({ slug: p.permalink, qty: wanted.get(p.permalink) || 1, weight_g: p.weight_g, mode: p.mode, alone: p.alone === true, legacy: { fr: null, intl: null } });
  }
  const legacyCents = fixed.length ? Math.max(...fixed) : 0;
  if (gridItems.length === 0) return { ok: true, cents: legacyCents, source: 'legacy', country: null };

  let config: any;
  try { config = await loadShippingConfig(env); } catch (e) {
    return { ok: false, error: 'config_unavailable', message: 'Grille des frais d’envoi indisponible.' };
  }
  const subtotal = products.reduce((s, p) => s + p.price * (wanted.get(p.permalink) || 1), 0);
  const cart = { items: gridItems, subtotal };
  let countries: string[];
  if (region === 'fr') countries = ['FR'];
  else if (country && /^[A-Z]{2}$/.test(country)) countries = [country];
  else {
    countries = (config.zones || []).filter((z: any) => z.enabled !== false && z.id !== 'FR')
      .map((z: any) => z.sample_country || (z.countries || []).filter((c: string) => c !== '*' && c !== 'FR')[0] || 'US');
  }
  let best: { cents: number; country: string } | null = null;
  let lastError: any = null;
  for (const c of countries) {
    const r = quoteOrFallback(config, cart, c);
    if (r.ok) { if (!best || r.totalCents > best.cents) best = { cents: r.totalCents, country: c }; }
    else if (r.error === 'country_not_served') lastError = r;
    else return { ok: false, error: r.error, message: r.message, slugs: r.slugs };
  }
  if (!best) return { ok: false, error: (lastError && lastError.error) || 'country_not_served', message: (lastError && lastError.message) || 'Livraison impossible.', slugs: lastError && lastError.slugs };
  return { ok: true, cents: Math.max(best.cents, legacyCents), source: fixed.length ? 'mixed' : 'grid', country: region === 'fr' || country ? best.country : null };
}
