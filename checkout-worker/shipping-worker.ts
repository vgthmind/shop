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

const { quoteShipping } = calc as { quoteShipping: (cfg: any, cart: any, country: string) => any };

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
