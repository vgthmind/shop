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
import { checkoutShipping } from './shipping-worker';
import { recordSale, replayPending, accountingConfigured } from './accounting';
import { handleContact } from './contact';
import { checkTurnstile } from './turnstile';
import { trafficRoutes } from './traffic';
import { promoRoutes } from './promos';
import { accessRoutes, closedRefusal } from './access';
import { buildInvoice, parisYear } from './invoice';
export { TrafficDO } from './traffic';
import { requestRoutes, requestsCron, backupRequests, onRequestPaid, onShipped, requestInvoiceParts, type ReqDeps } from './requests';
export { RequestsDO } from './requests';
import { customerEmail, sellerEmail, shippedEmail, REPLY_TO, CONTACT_EMAIL, FONT, esc, langFor, countryName, type MailItem, type OrderData } from './emails';

interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete?: boolean; cursor?: string }>;
}

interface Env {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  GITHUB_CLIENT_ID?: string; // OAuth App (public)
  GITHUB_CLIENT_SECRET?: string; // OAuth App (secret)
  SESSION_SECRET?: string; // signe les sessions admin (30 jours)
  RESEND_API_KEY?: string; // secret : cle Resend
  TURNSTILE_SECRET?: string; // secret : clé secrète Cloudflare Turnstile (absent = anti-robot désactivé)
  ALERT_EMAIL?: string; // secret : adresse qui recoit l'alerte de commande
  MAIL_FROM?: string; // expediteur sur domaine verifie ; vide = pas d'email client
  GITHUB_TOKEN?: string; // ancien systeme : n'est plus utilise, a supprimer
  ALLOWED_ORIGIN: string; // https://vgthmind.github.io
  SITE_BASE: string; // https://vgthmind.github.io/shop
  COMPTA_URL?: string; COMPTA_SECRET?: string; COMPTA_TEST?: string; // secrets : envoi des ventes vers le Sheet (accounting.ts)
  DEPLOY_HOOK_URL?: string; // secret : Deploy Hook Cloudflare Pages (mise en ligne programmée)
  CATALOG_BASE?: string; // https://vgthmind-shop.pages.dev : source du catalogue et de la grille d'envoi
  LIVE_MODE?: string; // "1" seulement le jour du passage en live
  ADMIN_GITHUB_LOGIN: string; // seul compte GitHub admin
  HOLDS: KV; // commandes expediees, sauvegardes du stock, etats OAuth
  STOCK: any; // DurableObjectNamespace<StockDO>
  TRAFFIC: any; // DurableObjectNamespace<TrafficDO>
  REQUESTS?: any; // DurableObjectNamespace<RequestsDO> (pièces sur demande)
  FILES?: any; // R2 : fichiers joints des demandes (absent tant que R2 n'est pas activé)
  WORKER_BASE?: string; // adresse publique de ce Worker (liens des photos dans les mails)
}

interface ShippingLine { amount_alone: number; country?: { code: string } }
interface Product {
  permalink: string;
  name: string;
  name_en?: string; // nom anglais facultatif (mode EN du site, Stripe, mails EN)
  price: number;
  url: string;
  description?: string;
  quantity?: number;
  status?: string; // 'coming-soon' = visible mais pas encore en vente
  images: { url: string }[];
  shipping: ShippingLine[];
}
interface Item { slug: string; qty: number }
interface Hold { items: Item[]; expires: number; sid?: string } // sid = session Stripe ouverte pour ce panier

const MAX_ITEMS = 20;
const SESSION_MINUTES = 30; // minimum Stripe
const HOLD_MS = (SESSION_MINUTES + 2) * 60 * 1000;
const BACKUP_DAYS = 180;

// Pays livres (liste blanche, decision du 2026-10-13) : zones de la grille (UE, Royaume-Uni, Suisse, Norvege,
// Canada, Etats-Unis, outre-mer) + Japon et Australie au tarif « reste du monde ». Pas de Russie ni de Bielorussie.
// La France est geree a part (region « fr »).
const STRIPE_COUNTRIES = (
  'AT BE BG HR CY CZ DK EE FI DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE ' // Union europeenne (hors France)
  + 'GB CH NO MC ' // Royaume-Uni, Suisse, Norvege, Monaco (zone France de la grille)
  + 'CA US JP AU ' // Canada, Etats-Unis, Japon, Australie
  + 'GP MQ GF RE YT PM MF BL NC PF WF' // outre-mer
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

  // Ouvrir le paiement ne bloque personne : on vérifie seulement qu'il reste assez de stock, et on note la session
  // ouverte (h:<panier>) pour pouvoir l'expirer si quelqu'un d'autre paie la pièce en premier (voir confirm).
  async reserve(cartId: string, items: Item[], defaults: Record<string, number>) {
    const { storage, stock } = await this.state();
    const problems: { slug: string; reason: string; available?: number }[] = [];
    for (const it of items) {
      const s = stock.has(it.slug) ? stock.get(it.slug)! : (defaults[it.slug] ?? 0);
      if (s <= 0) problems.push({ slug: it.slug, reason: 'vendue' });
      else if (it.qty > s) problems.push({ slug: it.slug, reason: 'stock', available: s });
    }
    if (problems.length) return { ok: false, problems };
    await storage.put('h:' + cartId, { items, expires: Date.now() + HOLD_MS });
    return { ok: true, problems };
  }

  // Retient la session Stripe créée pour ce panier.
  async attach(cartId: string, sid: string) {
    const storage = (this as any).ctx.storage;
    const h: Hold | undefined = await storage.get('h:' + cartId);
    if (h) await storage.put('h:' + cartId, { ...h, sid });
  }

  async release(cartId: string) {
    await (this as any).ctx.storage.delete('h:' + cartId);
  }

  // Commande payee : stock decompte une seule fois par session Stripe. Le premier paiement gagne :
  // - si la pièce n'est plus disponible (deux paiements à la même seconde), rien n'est décompté et `oversold` liste
  //   les pièces concernées (le Worker rembourse alors la commande et s'excuse par mail) ;
  // - sinon les autres sessions encore ouvertes qui ne peuvent plus être servies sont rendues dans `rivals` (à expirer).
  async confirm(sessionId: string, cartId: string, items: Item[], defaults: Record<string, number>) {
    const { storage, stock, holds } = await this.state();
    const none: { cartId: string; sid: string }[] = [];
    const done: any = await storage.get('d:' + sessionId);
    if (done) return { already: true, oversold: done.oversold ? (done.slugs as string[]) : [], rivals: none };
    const left = (slug: string) => (stock.has(slug) ? stock.get(slug)! : (defaults[slug] ?? 0));
    const oversold = items.filter((it) => left(it.slug) < it.qty).map((it) => it.slug);
    if (cartId) await storage.delete('h:' + cartId);
    if (oversold.length) {
      await storage.put('d:' + sessionId, { t: Date.now(), oversold: true, slugs: oversold });
      return { already: false, oversold, rivals: none };
    }
    for (const it of items) {
      const s = left(it.slug);
      await storage.put('q:' + it.slug, Math.max(0, s - it.qty));
      stock.set(it.slug, Math.max(0, s - it.qty));
    }
    await storage.put('d:' + sessionId, { t: Date.now() });
    const rivals: { cartId: string; sid: string }[] = [];
    for (const [cart, h] of holds) {
      if (cart === cartId) continue;
      if (h.items.some((x) => left(x.slug) < x.qty)) {
        await storage.delete('h:' + cart);
        if (h.sid) rivals.push({ cartId: cart, sid: h.sid });
      }
    }
    return { already: false, oversold: [] as string[], rivals };
  }

  // Numéro de facture W-AAAA-NNN : attribué une fois par commande (même session = même numéro), compteur par année.
  async invoiceNumber(sessionId: string, year: number) {
    const storage = (this as any).ctx.storage;
    const have = await storage.get('i:' + sessionId);
    if (have) return have as string;
    const n = ((await storage.get('ic:' + year)) || 0) + 1;
    await storage.put('ic:' + year, n);
    const num = `W-${year}-${String(n).padStart(3, '0')}`;
    await storage.put('i:' + sessionId, num);
    return num;
  }

  // Numeros de facture deja attribues (lecture seule) : { session -> W-AAAA-NNN }.
  async invoiceNumbers(ids: string[]) {
    const storage = (this as any).ctx.storage;
    const out: Record<string, string> = {};
    for (const id of ids) { const v = await storage.get('i:' + id); if (v) out[id] = v as string; }
    return out;
  }

  // Supprime des entrées de stock (pièces de test, pièces disparues).
  async deleteStock(slugs: string[]) {
    const storage = (this as any).ctx.storage;
    for (const slug of slugs) await storage.delete('q:' + slug);
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

// ALLOWED_ORIGIN = liste séparée par des virgules (github.io, .pages.dev, vgthmind.org) : on renvoie
// l'origine de la requête si elle est dans la liste, sinon la première.
function allowedOrigins(env: Env): string[] {
  return String(env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
}
function pickOrigin(request: Request, env: Env): string {
  const o = request.headers.get('Origin') || '';
  const list = allowedOrigins(env);
  return list.includes(o) ? o : list[0] || '';
}
// Adresse du site pour les retours Stripe : l'ancien site garde son /shop, les autres sont à la racine.
function siteBaseFor(request: Request, env: Env): string {
  const o = pickOrigin(request, env);
  return !o || o === new URL(env.SITE_BASE).origin ? env.SITE_BASE : o;
}

// Adresse publique du site = UN réglage : « site_url » dans data/shop-settings.json (le build le publie dans
// /site-config.json). Le Worker le relit toutes les 5 min ; la valeur SITE_BASE de wrangler.toml ne sert que de secours.
// Le jour de la bascule vers vgthmind.org : changer site_url, reconstruire le site, rien à redéployer ici.
let siteCache: { v: string; t: number } | null = null;
async function withSiteBase(env: Env): Promise<Env> {
  try {
    if (!siteCache || Date.now() - siteCache.t > 300000) {
      const r = await fetch(`${(env.CATALOG_BASE || env.SITE_BASE).replace(/\/$/, '')}/site-config.json`, { cf: { cacheTtl: 300 } } as any);
      if (r.ok) {
        const j: any = await r.json();
        if (j && typeof j.site_url === 'string' && /^https:\/\/[a-z0-9.-]+(\/[\w./-]*)?$/i.test(j.site_url)) siteCache = { v: j.site_url.replace(/\/$/, ''), t: Date.now() };
      }
    }
  } catch (e) { /* secours : SITE_BASE de wrangler.toml */ }
  return siteCache ? { ...env, SITE_BASE: siteCache.v } : env;
}

function stockStub(env: Env) {
  return env.STOCK.get(env.STOCK.idFromName('main'));
}

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    env = await withSiteBase(env);
    const cors = {
      'Access-Control-Allow-Origin': pickOrigin(request, env),
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, authorization',
      Vary: 'Origin',
    };
    const json: JsonFn = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cors } });

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const path = new URL(request.url).pathname;

    try {
      // Sans cle Stripe.
      // /status dit quelles clés sont posées, le mode, le stock : réservé à l'admin connecté (page admin « État »).
      if (path === '/status') {
        if (!(await isAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
        return await status(env, cors);
      }
      if (path === '/access' || path === '/access/enter') { const ar = await accessRoutes(request, env, path, json); if (ar) return ar; }
      if (path === '/stock' && request.method === 'GET') return await publicStock(env, cors);
      if (path === '/t') { const r = await trafficRoutes(request, env, path, json); if (r) return r; }
      // Connexions : seules les ÉCHECS comptent (compte refusé, code refusé, session expirée), 12 par IP et 15 min ; une connexion réussie ne compte jamais.
      if ((path === '/auth' || path === '/callback') && (Number(await env.HOLDS.get('rl:loginfail:' + (request.headers.get('CF-Connecting-IP') || 'x'))) || 0) >= 12) return json({ error: 'Trop de tentatives de connexion, réessaie dans 15 minutes.' }, 429);
      if (path === '/auth/claim' && request.method === 'GET') return await oauthClaim(request, env, json);
      if (path === '/auth') return await oauthStart(request, env);
      if (path === '/callback') return await oauthCallback(request, env);
      if (path.startsWith('/admin/')) {
        if (!(await isAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
        if (path === '/admin/renew' && request.method === 'POST') return json({ session: await makeSession(env) });
        if (path === '/admin/logout' && request.method === 'POST') {
          // Seule la session de cet appareil est révoquée (se déconnecter sur l'iPhone ne coupe pas le PC).
          const sig = /^Bearer vgs\.\d{1,12}\.([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization') || '');
          if (sig) await env.HOLDS.put('rv:' + sig[1], '1', { expirationTtl: SESSION_TTL + 3600 });
          return json({ ok: true });
        }
        if (path === '/admin/access') { const ar = await accessRoutes(request, env, path, json); if (ar) return ar; }
        if (path === '/admin/stock' && request.method === 'GET') return json(await adminStock(env));
        if (path === '/admin/stock' && request.method === 'POST') {
          const body: any = await request.json().catch(() => ({}));
          if (!body || typeof body.stock !== 'object') return json({ error: 'Requête invalide.' }, 400);
          await stockStub(env).setStock(body.stock);
          return json(await adminStock(env));
        }
        if (path === '/admin/stock/delete' && request.method === 'POST') {
          const body: any = await request.json().catch(() => ({}));
          if (!body || !Array.isArray(body.slugs)) return json({ error: 'Requête invalide.' }, 400);
          await stockStub(env).deleteStock(body.slugs.filter((x: unknown) => typeof x === 'string').slice(0, 50));
          return json(await adminStock(env));
        }
        if (path === '/admin/compta/status' && request.method === 'GET') {
          const q = await env.HOLDS.list({ prefix: 'compta:q:' });
          const ok = await env.HOLDS.list({ prefix: 'compta:ok:' });
          return json({ configured: accountingConfigured(env as any), pending: q.keys.length, done: ok.keys.length });
        }
        if (path === '/admin/compta/replay' && request.method === 'POST') return json(await replayPending(env as any, 100));
        if (path === '/admin/schedule' && request.method === 'GET') return json({ schedule: await readSchedule(env), hook: !!env.DEPLOY_HOOK_URL, leadSeconds: LEAD_S });
        if (path === '/admin/schedule' && request.method === 'POST') {
          const body: any = await request.json().catch(() => ({}));
          const slug = String(body && body.slug || '').slice(0, 100);
          const at = Date.parse(String(body && body.at || ''));
          if (!slug || !Number.isFinite(at)) return json({ error: 'Pièce ou date invalide.' }, 400);
          const list = (await readSchedule(env)).filter((e) => e.slug !== slug);
          list.push({ slug, at: new Date(at).toISOString() });
          await env.HOLDS.put(SCHEDULE_KEY, JSON.stringify(list));
          return json({ schedule: list, hook: !!env.DEPLOY_HOOK_URL, leadSeconds: LEAD_S });
        }
        if (path === '/admin/schedule/cancel' && request.method === 'POST') {
          const body: any = await request.json().catch(() => ({}));
          const list = (await readSchedule(env)).filter((e) => e.slug !== String(body && body.slug || ''));
          await env.HOLDS.put(SCHEDULE_KEY, JSON.stringify(list));
          return json({ schedule: list });
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
        if (path === '/admin/obackups' && request.method === 'GET') {
          const list = await env.HOLDS.list({ prefix: 'obackup:' });
          return json({ backups: list.keys.map((k) => k.name).sort().reverse() });
        }
        if (path === '/admin/obackup' && request.method === 'GET') {
          const k = new URL(request.url).searchParams.get('key') || 'obackup:latest';
          if (!/^obackup:[\w-]+$/.test(k)) return json({ error: 'Clé invalide.' }, 400);
          const v = await env.HOLDS.get(k);
          return v ? new Response(v, { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="commandes-${k.slice(8)}.json"`, ...cors } }) : json({ error: 'Introuvable.' }, 404);
        }
        if (path === '/admin/obackup' && request.method === 'POST') return json(await backupOrders(env));
        if (path === '/admin/obackup-restore' && request.method === 'POST') {
          const body: any = await request.json().catch(() => null);
          if (!body || typeof body !== 'object') return json({ error: 'Fichier invalide.' }, 400);
          return json({ ok: true, restored: await restoreOrders(env, body) });
        }
        if (path.startsWith('/admin/promos')) {
          const sk = stripeKey(env);
          return await promoRoutes(request, path, sk.ok ? (m, pa, pr) => stripeCall(sk.value, m, pa, pr) : null, json) as Response;
        }
        const tr = await trafficRoutes(request, env, path, json); if (tr) return tr;
        const ra = await requestRoutes(request, env, reqDeps(env), path, json, true); if (ra) return ra;
        if (path === '/admin/invoice' && request.method === 'GET') {
          const sk = stripeKey(env);
          if (!sk.ok) return json({ error: sk.error }, 503);
          return await invoiceFor(env, sk.value, String(new URL(request.url).searchParams.get('id') || ''), json);
        }
        return json({ error: 'Not found' }, 404);
      }

      // Prix de livraison d'un panier pour un pays (affichage du panier) : meme calcul que le paiement.
      if (path === '/shipping/quote' && request.method === 'POST') return await shippingQuote(request, env, json);

      // Formulaire de contact (sans cle Stripe).
      // Site « Fermé » (Réglages > Accès au site) : plus de nouveau paiement panier ni de nouvelle demande. Restent ouverts : le webhook Stripe,
      // l'acompte, le solde et le suivi des demandes déjà en cours (liens secrets). « Accès par code » ne bloque rien ici.
      if ((path === '/checkout' || path === '/requests') && request.method === 'POST') { const cl = await closedRefusal(env); if (cl) return json(cl, 503); }
      if (path === '/contact' && request.method === 'POST') {
        if (!env.RESEND_API_KEY || !env.MAIL_FROM) return json({ error: 'unavailable' }, 503);
        const body: any = await request.json().catch(() => null);
        if (!(await checkTurnstile(env.TURNSTILE_SECRET, body && body.cf, request.headers.get('CF-Connecting-IP') || 'x'))) return json({ error: 'captcha' }, 403);
        const r = await handleContact(body, { kv: env.HOLDS, from: env.MAIL_FROM, ip: request.headers.get('CF-Connecting-IP') || 'x', send: (f, t, su, h, tx, rt) => resendSend(env, f, t, su, h, tx, rt) });
        return json(r.data, r.status);
      }

      // Pièces sur demande (formulaire, page « Ma demande », acompte, validation, solde).
      const rp = await requestRoutes(request, env, reqDeps(env), path, json, false); if (rp) return rp;

      // Avec cle Stripe.
      const key = stripeKey(env);
      if (!key.ok) return json({ error: key.error }, 503);
      if (path === '/checkout' && request.method === 'POST') return await checkout(request, env, key.value, json);
      if (path === '/session' && request.method === 'GET') return await session(request, env, key.value, json, ctx);
      if (path === '/release' && request.method === 'POST') return await release(request, env, key.value, json);
      if (path === '/webhook' && request.method === 'POST') return await webhook(request, env, json);
      if (path === '/orders' && request.method === 'GET') return await listOrders(request, env, key.value, json);
      if (path === '/track' && request.method === 'POST') return await trackOrder(request, env, key.value, json);
      if (path === '/invoice' && request.method === 'POST') return await trackOrder(request, env, key.value, json, true);
      if (path === '/orders/preparing' && request.method === 'POST') return await markPreparing(request, env, json);
      if (path === '/orders/refund' && request.method === 'POST') return await refundOrder(request, env, key.value, json);
      if (path === '/orders/shipped' && request.method === 'POST') return await markShipped(request, env, json);
      if (path === '/orders/shipped-mail' && request.method === 'POST') return await sendShippedMail(request, env, key.value, json);
    } catch (e: any) {
      await alertAdmin(env, 'worker-' + path, `Le Worker a planté sur ${path}`, String(e && e.stack ? e.stack : e).slice(0, 1500));
      return json({ error: 'Erreur interne. Réessaie dans un instant ; si ça continue, écris à contact@vgthmind.org.' }, 500); // le détail part par mail d'alerte, jamais au navigateur
    }
    return json({ error: 'Not found' }, 404);
  },

  // Sauvegarde quotidienne du stock (cron dans wrangler.toml).
  // Toutes les heures : relances et conservation des demandes ; la nuit (03:30 UTC) : sauvegardes.
  async scheduled(event: any, env: Env, ctx: any) {
    env = await withSiteBase(env);
    // Chaque minute : mises en ligne programmées (rien d'autre).
    if (event && event.cron === '* * * * *') {
      ctx.waitUntil(publishCron(env).catch((e) => alertAdmin(env, 'publish-cron', 'Mise en ligne programmée en erreur', String(e && e.stack ? e.stack : e))));
      return;
    }
    if (!event || !event.cron || event.cron === '30 3 * * *') {
      // Pièces de test oubliées dans le stock (2026-10-12) : retirées une fois pour toutes.
      ctx.waitUntil(Promise.resolve().then(() => stockStub(env).deleteStock(['zz-test-fictif', 'zz-test-live-k7q4x2m9', 'testtt', 'testttjaheh', 'test', 'test-2', 't-est-masquee'])).catch(() => {}));
      ctx.waitUntil(backupStock(env));
      ctx.waitUntil(backupOrders(env));
      ctx.waitUntil(backupRequests(env as any).catch((e) => alertAdmin(env, 'req-backup', 'Sauvegarde des demandes en erreur', String(e && e.stack ? e.stack : e))));
      if (accountingConfigured(env as any)) ctx.waitUntil(replayPending(env as any, 100).catch(() => {})); // ventes restées en file (script Google injoignable)
    }
    ctx.waitUntil(requestsCron(env as any, reqDeps(env)).catch((e) => alertAdmin(env, 'req-cron', 'Cron des demandes en erreur', String(e && e.stack ? e.stack : e))));
  },
};

// --- Mise en ligne programmée ---------------------------------------------------------------------------------
// La fiche porte `publish_at` (date ISO) et reste masquée dans le dépôt ; le site la publie quand une construction a lieu
// à partir de LEAD_S + marge avant l'heure (generator/build-catalog.js, PUBLISH_LEAD_MS). Ici : à H - LEAD_S, on déclenche
// la construction du site (Deploy Hook Cloudflare Pages, secret DEPLOY_HOOK_URL). Le site met ~45 s à se publier.
const SCHEDULE_KEY = 'publish:schedule';
const LEAD_S = 60;
interface ScheduleEntry { slug: string; at: string; fired?: string }
async function readSchedule(env: Env): Promise<ScheduleEntry[]> {
  const raw = await env.HOLDS.get(SCHEDULE_KEY);
  if (!raw) return [];
  try { const l = JSON.parse(raw); return Array.isArray(l) ? l : []; } catch (e) { return []; }
}
export async function publishCron(env: Env, now = Date.now()): Promise<{ fired: number }> {
  const list = await readSchedule(env);
  if (!list.length) return { fired: 0 };
  const due = list.filter((e) => !e.fired && Date.parse(e.at) - LEAD_S * 1000 <= now && now <= Date.parse(e.at) + 30 * 60 * 1000);
  let fired = 0;
  if (due.length) {
    if (!env.DEPLOY_HOOK_URL) {
      await alertAdmin(env, 'publish-nohook', 'Mise en ligne programmée impossible', "Le secret DEPLOY_HOOK_URL n'est pas posé : la pièce programmée ne sera pas publiée à l'heure. Voir A-FAIRE.");
    } else {
      const r = await fetch(env.DEPLOY_HOOK_URL, { method: 'POST' }).catch(() => null);
      if (r && r.ok) { for (const e of due) e.fired = new Date(now).toISOString(); fired = due.length; }
      else await alertAdmin(env, 'publish-hook', 'Mise en ligne programmée : la construction du site ne démarre pas', 'Le Deploy Hook Cloudflare a répondu ' + (r ? r.status : 'rien') + ' ; nouvel essai à la minute suivante.');
    }
  }
  // Ménage : entrées déclenchées depuis plus d'un jour, ou ratées depuis plus de 30 min.
  const keep = list.filter((e) => !(e.fired && now - Date.parse(e.fired) > 86400_000) && !(!e.fired && now > Date.parse(e.at) + 30 * 60 * 1000));
  if (due.length || keep.length !== list.length) await env.HOLDS.put(SCHEDULE_KEY, JSON.stringify(keep));
  return { fired };
}

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
  // Catalogue publié : celui de Cloudflare Pages (CATALOG_BASE), reconstruit à chaque modification dans l'admin.
  // Deux essais : pendant une reconstruction du site, products.json peut manquer quelques secondes
  // (le webhook Stripe renvoyait alors 500 et la livraison comptait comme échouée).
  const url = `${env.CATALOG_BASE || env.SITE_BASE}/products.json`;
  let res: Response | null = null;
  for (let i = 0; i < 2 && !(res && res.ok); i++) {
    if (i) await new Promise((r) => setTimeout(r, 800));
    res = await fetch(url, i ? undefined : ({ cf: { cacheTtl: 60, cacheEverything: true } } as any)).catch(() => null);
  }
  if (!res || !res.ok) throw new Error('Catalogue indisponible');
  return res.json();
}
function catalogDefaults(catalog: Product[]): Record<string, number> {
  const d: Record<string, number> = {};
  for (const p of catalog) d[p.permalink] = Number.isInteger(p.quantity) ? (p.quantity as number) : 1;
  return d;
}

async function publicStock(env: Env, cors: Record<string, string>): Promise<Response> {
  const catalog = await loadCatalog(env);
  const all = await stockStub(env).snapshot(catalogDefaults(catalog));
  // Seulement les pièces du catalogue publié (ni pièces de test, ni pièces masquées).
  const stock: Record<string, number> = {};
  for (const p of catalog) if (p.permalink in all) stock[p.permalink] = all[p.permalink];
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

// Sauvegarde de l'état des commandes (expédiée / en préparation / numéros VG-…) : le détail des commandes reste chez Stripe.
async function ordersState(env: Env) {
  const out: { shipped: Record<string, unknown>; preparing: Record<string, unknown>; refs: Record<string, string> } = { shipped: {}, preparing: {}, refs: {} };
  const plan: [string, 'shipped' | 'preparing' | 'refs'][] = [['shipped:', 'shipped'], ['preparing:', 'preparing'], ['sref:', 'refs']];
  for (const [prefix, bucket] of plan) {
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const r = await env.HOLDS.list({ prefix, cursor });
      for (const k of r.keys) {
        const v = await env.HOLDS.get(k.name);
        if (v == null) continue;
        const id = k.name.slice(prefix.length);
        (out[bucket] as any)[id] = bucket === 'refs' ? v : JSON.parse(v);
      }
      if (r.list_complete !== false || !r.cursor) break;
      cursor = r.cursor;
    }
  }
  return out;
}

async function backupOrders(env: Env) {
  const date = new Date().toISOString().slice(0, 10);
  const state = await ordersState(env);
  const value = JSON.stringify({ date, ...state }, null, 1);
  await env.HOLDS.put(`obackup:${date}`, value, { expirationTtl: BACKUP_DAYS * 86400 });
  await env.HOLDS.put('obackup:latest', value);
  return { ok: true, date, shipped: Object.keys(state.shipped).length, preparing: Object.keys(state.preparing).length, refs: Object.keys(state.refs).length };
}

// Restauration : n'écrit que des entrées bien formées (identifiants Stripe, numéros VG-XXXXXX).
async function restoreOrders(env: Env, data: any) {
  let n = 0;
  for (const bucket of ['shipped', 'preparing'] as const) {
    for (const [id, v] of Object.entries((data && data[bucket]) || {})) {
      if (!isSessionId(id) || typeof v !== 'object' || !v) continue;
      await env.HOLDS.put(bucket + ':' + id, JSON.stringify(v)); n++;
    }
  }
  for (const [id, ref] of Object.entries((data && data.refs) || {})) {
    if (!isSessionId(id) || !/^VG-[A-Z0-9]{6}$/.test(String(ref))) continue;
    await env.HOLDS.put('sref:' + id, String(ref)); await env.HOLDS.put('ref:' + ref, id); n++;
  }
  return n;
}

// --- Frais de livraison (affichage du panier) ---
async function shippingQuote(request: Request, env: Env, json: JsonFn): Promise<Response> {
  const body: any = await request.json().catch(() => ({}));
  const country = /^[A-Za-z]{2}$/.test(String(body.country || '')) ? String(body.country).toUpperCase() : '';
  if (!country) return json({ ok: false, error: 'country_required', message: 'Choisis ton pays de livraison.' });
  if (country !== 'FR' && !STRIPE_COUNTRIES.includes(country)) return json({ ok: false, error: 'country_not_served', message: 'Pays non livré : ' + country });
  const wanted = new Map<string, number>();
  for (const it of Array.isArray(body.items) ? body.items : []) {
    const slug = String(it && (it as any).slug);
    wanted.set(slug, Math.min(99, (wanted.get(slug) || 0) + Math.max(1, Math.floor(Number((it as any).qty) || 1))));
  }
  if (wanted.size === 0 || wanted.size > MAX_ITEMS) return json({ error: 'Requête invalide.' }, 400);
  let catalog: Product[];
  try { catalog = await loadCatalog(env); } catch (e) { return json({ ok: false, error: 'catalog_unavailable', message: 'Catalogue indisponible.' }, 502); }
  const bySlug = new Map(catalog.map((p) => [p.permalink, p]));
  const products: Product[] = [];
  for (const slug of wanted.keys()) {
    const p = bySlug.get(slug);
    if (!p) return json({ ok: false, error: 'introuvable', message: 'Pièce introuvable : ' + slug, slugs: [slug] });
    if (country !== 'FR' && !intlLine(p)) return json({ ok: false, error: 'france_uniquement', message: 'Livraison en France uniquement : ' + slug, slugs: [slug] });
    products.push(p);
  }
  const q = await checkoutShipping(env as any, products as any, wanted, country === 'FR' ? 'fr' : 'intl', country);
  return json(q.ok ? { ok: true, cents: q.cents, total: q.cents / 100, free: q.free, source: q.source, country: q.country } : q);
}

// --- Paiement --------------------------------------------------------------
async function checkout(request: Request, env: Env, key: string, json: JsonFn): Promise<Response> {
  // Un robot pourrait ouvrir des sessions en boucle et bloquer le stock : 12 sessions / 15 min / IP.
  if (!(await allow(env, 'rl:co:' + (request.headers.get('CF-Connecting-IP') || 'x'), 12, 900))) return json({ error: 'Trop de tentatives, réessaie dans quelques minutes. / Too many attempts, try again in a few minutes.' }, 429);
  let body: { items?: unknown; region?: unknown; cart_id?: unknown; country?: unknown; lang?: unknown };
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
  const country = /^[A-Za-z]{2}$/.test(String(body.country || '')) ? String(body.country).toUpperCase() : '';
  if (country && country !== 'FR' && !STRIPE_COUNTRIES.includes(country)) return json({ error: 'Pays non livré : ' + country, code: 'country_not_served' }, 409);
  // Pays choisi dans le panier (prioritaire) : FR = France, sinon international POUR CE PAYS. Sans pays : ancien champ « region ».
  const region: 'fr' | 'intl' = country ? (country === 'FR' ? 'fr' : 'intl') : body.region === 'intl' ? 'intl' : 'fr';
  const cartId = /^[A-Za-z0-9-]{8,64}$/.test(String(body.cart_id || '')) ? String(body.cart_id) : 'anon-' + crypto.randomUUID();

  let catalog: Product[];
  try { catalog = await loadCatalog(env); } catch (e) { return json({ error: 'Catalogue indisponible, réessaie dans un instant.' }, 502); }
  const bySlug = new Map(catalog.map((p) => [p.permalink, p]));

  const products: Product[] = [];
  const problems: { slug: string; reason: string; available?: number }[] = [];
  for (const slug of slugs) {
    const p = bySlug.get(slug);
    if (!p) problems.push({ slug, reason: 'introuvable' });
    else if (p.status === 'coming-soon') problems.push({ slug, reason: 'bientot' });
    else if (region === 'intl' && !intlLine(p)) problems.push({ slug, reason: 'france_uniquement' });
    else products.push(p);
  }
  if (problems.length) return json({ error: 'Panier à mettre à jour.', problems }, 409);

  // Reservation atomique (Durable Object) AVANT la page de paiement.
  const items: Item[] = products.map((p) => ({ slug: p.permalink, qty: wanted.get(p.permalink) || 1 }));
  const stub = stockStub(env);
  const held = await stub.reserve(cartId, items, catalogDefaults(catalog));
  if (!held.ok) return json({ error: 'Panier à mettre à jour.', problems: held.problems }, 409);

  // Port : pieces a port fixe = regle d'avant (le plus eleve du panier) ; pieces du studio = grille (poids,
  // mode, colis). Voir shipping-worker.ts. Jamais 0 € par erreur : sans poids ni port, on refuse.
  const quote = await checkoutShipping(env as any, products as any, wanted, region, country);
  if (!quote.ok) {
    await stub.release(cartId);
    return json({ error: quote.message, code: quote.error, slugs: quote.slugs }, quote.error === 'config_unavailable' ? 502 : 409);
  }
  const shipping = quote.cents / 100;

  const origin = new URL(env.CATALOG_BASE || env.SITE_BASE).origin;
  const slugList = products.map((p) => p.permalink).join(',').slice(0, 500);
  const itemList = items.map((it) => `${it.slug}:${it.qty}`).join(',').slice(0, 500);
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  // Langue choisie sur le site (bouton FR / EN) : page Stripe, noms des pieces et mails suivent ce choix.
  const siteLang = body.lang === 'fr' || body.lang === 'en' ? (body.lang as 'fr' | 'en') : '';
  params.set('locale', siteLang || 'auto');
  const back = siteBaseFor(request, env);
  params.set('success_url', `${back}/merci/?session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${back}/paiement-annule/?session_id={CHECKOUT_SESSION_ID}`);
  params.set('expires_at', String(Math.floor(Date.now() / 1000) + SESSION_MINUTES * 60 + 30));
  params.set('phone_number_collection[enabled]', 'true');
  params.set('allow_promotion_codes', 'true');
  // Une seule langue sur la page Stripe : celle du site (français si on ne la connaît pas). Adresse = réglage central.
  const cgv = `${env.SITE_BASE}/infos-conditions-generales/`;
  // Case a cocher obligatoire (necessite l'adresse des CGV dans Stripe > Reglages > Informations publiques ; sinon repli ci-dessous).
  params.set('consent_collection[terms_of_service]', 'required');
  params.set('custom_text[terms_of_service_acceptance][message]', siteLang === 'en'
    ? `I accept the [terms of sale](${cgv}).`
    : `J'accepte les [conditions de vente](${cgv}).`);
  if (OUTRE_MER.includes(country)) {
    params.set('custom_text[shipping_address][message]', siteLang === 'en'
      ? 'Local taxes (octroi de mer) may be charged on delivery.'
      : 'Des taxes locales (octroi de mer) peuvent être demandées à la réception du colis.');
  }
  if (siteLang) params.set('metadata[lang]', siteLang);
  params.set('metadata[slugs]', slugList);
  params.set('metadata[items]', itemList);
  params.set('metadata[region]', region);
  if (country) params.set('metadata[country]', country);
  params.set('metadata[cart_id]', cartId);
  params.set('payment_intent_data[metadata][slugs]', slugList);
  products.forEach((p, i) => {
    params.set(`line_items[${i}][quantity]`, String(wanted.get(p.permalink) || 1));
    params.set(`line_items[${i}][price_data][currency]`, 'eur');
    params.set(`line_items[${i}][price_data][unit_amount]`, String(Math.round(p.price * 100)));
    params.set(`line_items[${i}][price_data][product_data][name]`, siteLang === 'en' && p.name_en ? p.name_en : p.name);
    params.set(`line_items[${i}][price_data][product_data][metadata][slug]`, p.permalink);
    const img = p.images && p.images[0] && p.images[0].url;
    if (img) params.set(`line_items[${i}][price_data][product_data][images][0]`, origin + encodeURI(img));
  });
  // Stripe preselectionne le 1er pays de la liste quand celui du client n'y
  // est pas : le Canada et les voisins d'abord.
  const FIRST = ['CA', 'BE', 'CH', 'LU', 'DE', 'GB', 'US'];
  // Le pays choisi AVANT le paiement est le seul accepte pour l'adresse (sinon : port de la France, livraison au Canada).
  const countries = country ? [country] : region === 'fr' ? ['FR'] : [...FIRST, ...STRIPE_COUNTRIES.filter((c) => !FIRST.includes(c))];
  countries.forEach((c, i) => params.set(`shipping_address_collection[allowed_countries][${i}]`, c));
  params.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
  params.set('shipping_options[0][shipping_rate_data][display_name]', region === 'fr' ? 'Livraison France' : 'Livraison internationale');
  params.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(Math.round(shipping * 100)));
  params.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'eur');

  let stripe = await stripeCall(key, 'POST', '/v1/checkout/sessions', params);
  if (!stripe.ok && /terms of service/i.test(String(stripe.data.error?.message || ''))) {
    // Adresse des CGV pas encore renseignee dans Stripe : on garde la phrase d'acceptation, sans case a cocher (a corriger dans Stripe).
    params.delete('consent_collection[terms_of_service]');
    params.delete('custom_text[terms_of_service_acceptance][message]');
    params.set('custom_text[submit][message]', siteLang === 'en'
      ? `By paying, you accept the [terms of sale](${cgv}).`
      : `En payant, tu acceptes les [conditions de vente](${cgv}).`);
    stripe = await stripeCall(key, 'POST', '/v1/checkout/sessions', params);
    await alertAdmin(env, 'cgv-url', 'Stripe : adresse des CGV manquante', "La case à cocher des CGV est désactivée tant que l'adresse des conditions de vente n'est pas renseignée dans Stripe (Réglages > Informations publiques).");
  }
  if (!stripe.ok) {
    await stub.release(cartId);
    return json({ error: stripe.data.error?.message || 'Erreur Stripe' }, 502);
  }
  try { await stub.attach(cartId, stripe.data.id); } catch (e) { /* sans elle, la session ne pourra pas être expirée si quelqu'un d'autre paie avant */ }
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
    discount: (s.total_details?.amount_discount || 0) / 100,
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
  // Pièces de cette session devenues indisponibles entre-temps (vendues à quelqu'un d'autre) : la page « Paiement annulé » le dit.
  let sold: string[] = [];
  try {
    const items = String(got.data.metadata?.items || '').split(',').filter(Boolean).map((x: string) => { const [slug, q] = x.split(':'); return { slug, qty: Math.max(1, Number(q) || 1) }; });
    if (items.length && got.data.payment_status !== 'paid') {
      const snap = await stockStub(env).snapshot(catalogDefaults(await loadCatalog(env)));
      sold = items.filter((it) => (snap[it.slug] ?? 0) < it.qty).map((it) => it.slug);
    }
  } catch (e) { /* le message est un plus */ }
  return json({ ok: true, sold });
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
  if (event.type === 'payment_intent.payment_failed' || event.type === 'checkout.session.async_payment_failed') {
    const why = s.last_payment_error?.message || s.last_payment_error?.code || 'raison inconnue';
    const amount = ((s.amount ?? s.amount_total ?? 0) / 100).toFixed(2);
    await alertAdmin(env, 'payment-failed:' + s.id, 'Un paiement Stripe a échoué', `Montant : ${amount} ${String(s.currency || 'eur').toUpperCase()}\nRaison : ${why}\nObjet Stripe : ${s.id}\nMode : ${event.livemode ? 'réel' : 'test'}`);
    return json({ received: true });
  }
  if (event.type === 'charge.refunded') {
    await processRefund(env, s); // s = la charge
    return json({ received: true });
  }
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

// Remboursement : on retrouve la commande (session) par le paiement, on la marque « remboursee » (KV) et on previent
// l'admin. La piece n'est PAS remise en stock automatiquement (elle n'est pas forcement revenue) : page Stock.
async function processRefund(env: Env, charge: any) {
  const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : '';
  const k = stripeKey(env);
  if (!pi || !k.ok) return;
  const found = await stripeCall(k.value, 'GET', `/v1/checkout/sessions?payment_intent=${encodeURIComponent(pi)}&limit=1`);
  const session = found.ok && found.data.data && found.data.data[0];
  if (!session) return;
  const full = charge.amount_refunded >= charge.amount;
  const amount = (charge.amount_refunded || 0) / 100;
  await env.HOLDS.put('refunded:' + session.id, JSON.stringify({ at: Math.floor(Date.now() / 1000), amount, full }));
  await alertAdmin(env, 'refund:' + session.id + ':' + charge.amount_refunded, full ? 'Commande remboursée' : 'Commande remboursée en partie', `Montant remboursé : ${amount.toFixed(2)} ${String(charge.currency || 'eur').toUpperCase()}
Objet Stripe : ${session.id}
La pièce n'est pas remise en vente automatiquement : page Stock de l'admin.`);
}

// Commande payee -> stock decompte (une seule fois par session, que l'appel
// vienne du webhook ou de la page Merci).
async function processPaid(env: Env, s: any) {
  const meta = s.metadata || {};
  // Pièce sur demande : l'acompte n'est pas une commande (rien à expédier) ; le solde suit le circuit normal ci-dessous.
  if (meta.kind === 'deposit' || meta.kind === 'balance') await onRequestPaid(env as any, reqDeps(env), s, (env.WORKER_BASE || '').replace(/\/$/, ''));
  if (meta.kind === 'deposit') {
    if (s.livemode) await stockStub(env).invoiceNumber(s.id, parisYear(s.created || Math.floor(Date.now() / 1000))).catch(() => {});
    return;
  }
  const items: Item[] = meta.items
    ? String(meta.items).split(',').filter(Boolean).map((x: string) => {
      const [slug, q] = x.split(':');
      return { slug, qty: Math.max(1, Number(q) || 1) };
    })
    : String(meta.slugs || '').split(',').filter(Boolean).map((slug: string) => ({ slug, qty: 1 }));
  const catalog = await loadCatalog(env);
  const conf = await stockStub(env).confirm(s.id, meta.cart_id || '', items, catalogDefaults(catalog));
  // Pièce déjà vendue à quelqu'un d'autre une seconde plus tôt : remboursement automatique + mail d'excuse, rien d'autre.
  if (conf.oversold.length) { await refundOversold(env, s, conf.oversold); return; }
  // Premier paiement réussi : les autres sessions Stripe ouvertes pour cette pièce sont expirées.
  for (const r of conf.rivals) {
    try { await stripeCall(env.STRIPE_SECRET_KEY || '', 'POST', `/v1/checkout/sessions/${r.sid}/expire`, new URLSearchParams()); } catch (e) { /* si elle est en train d'être payée, le remboursement automatique prend le relais */ }
  }
  await sendOrderEmails(env, s).catch((e) => alertAdmin(env, 'mail-' + s.id, "Un mail de commande n'est pas parti", `Commande ${s.id} : ${String(e && e.message ? e.message : e)}`)); // un échec d'email ne bloque jamais la commande
  if (s.livemode) await stockStub(env).invoiceNumber(s.id, parisYear(s.created || Math.floor(Date.now() / 1000))).catch(() => {});
  // Compta : une ligne par commande payée dans le Sheet (seulement si COMPTA_URL et COMPTA_SECRET sont posés ; commandes de test ignorées).
  if (accountingConfigured(env as any)) {
    await recordSale(env as any, s, await assignRef(env, String(s.id))).catch((e) => alertAdmin(env, 'compta-' + s.id, "Une vente n'est pas partie vers la compta", `Commande ${s.id} : ${String(e && e.message ? e.message : e)}`));
  }
}

// Deux clients ont payé la même pièce à la même seconde : le premier garde la pièce, le second est remboursé
// automatiquement (Stripe ne rembourse qu'une fois grâce à la clé d'idempotence) et reçoit un mail d'excuse.
// Une erreur ici remonte (500) pour que Stripe rejoue le webhook ; ce qui est déjà fait n'est pas refait.
async function refundOversold(env: Env, s: any, slugs: string[]) {
  const doneKey = 'oversold:' + s.id;
  const st = JSON.parse((await env.HOLDS.get(doneKey)) || '{}');
  if (st.refund && st.mail && st.alert) return;
  const key = env.STRIPE_SECRET_KEY || '';
  const save = () => env.HOLDS.put(doneKey, JSON.stringify(st), { expirationTtl: 60 * 60 * 24 * 365 });
  if (!st.refund) {
    const pi = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent && s.payment_intent.id;
    if (!pi) {
      await alertAdmin(env, 'oversold-nopi-' + s.id, 'Paiement double sans remboursement possible', `Session ${s.id} : pas de paiement à rembourser trouvé. À traiter à la main dans Stripe.`);
      throw new Error('payment_intent introuvable pour ' + s.id);
    }
    const p = new URLSearchParams({ payment_intent: pi });
    p.set('metadata[reason]', 'piece_vendue_entre_temps');
    p.set('metadata[session]', s.id);
    const r = await stripeCall(key, 'POST', '/v1/refunds', p, { 'Idempotency-Key': 'vg-oversold-' + s.id });
    if (!r.ok) {
      await alertAdmin(env, 'oversold-refund-' + s.id, 'Remboursement automatique en échec', `Session ${s.id} : ${r.data && r.data.error ? r.data.error.message : 'erreur Stripe'}. À rembourser à la main dans Stripe.`);
      throw new Error('remboursement refusé pour ' + s.id);
    }
    st.refund = 1; await save();
  }
  const full = await stripeCall(key, 'GET', `/v1/checkout/sessions/${s.id}?expand[]=line_items`);
  const o = full.ok ? full.data : s;
  const email = (o.customer_details && o.customer_details.email) || '';
  const lang: 'fr' | 'en' = o.metadata?.lang === 'fr' || o.metadata?.lang === 'en' ? o.metadata.lang : langFor((o.customer_details && o.customer_details.address && o.customer_details.address.country) || '');
  const names = ((o.line_items && o.line_items.data) || []).map((li: any) => String(li.description)).filter(Boolean);
  const amount = ((o.amount_total || 0) / 100).toFixed(2);
  const from = (env.MAIL_FROM || '').trim();
  if (!st.mail && from && email && env.RESEND_API_KEY) {
    const list = names.length ? names.join(', ') : slugs.join(', ');
    const fr = lang === 'fr';
    const subject = fr ? 'Ta commande vgthmind : pièce vendue entre-temps, remboursement' : 'Your vgthmind order: piece sold in the meantime, refund';
    const text = fr
      ? `Bonjour,\n\nDésolé : « ${list} » a été payée par quelqu'un d'autre quelques secondes avant toi, et c'était une pièce unique.\nTon paiement de ${amount} € est remboursé intégralement, automatiquement (il apparaît sur ton relevé sous quelques jours, selon ta banque). Tu n'as rien à faire.\n\nSi tu veux une pièce similaire ou une création sur mesure, écris-moi : ${CONTACT_EMAIL}.\n\nvgthmind`
      : `Hello,\n\nI'm sorry: "${list}" was paid for by someone else a few seconds before you, and it was a one-of-a-kind piece.\nYour payment of €${amount} is fully refunded, automatically (it shows on your statement within a few days, depending on your bank). You don't need to do anything.\n\nIf you'd like something similar or a made-to-measure piece, write to me: ${CONTACT_EMAIL}.\n\nvgthmind`;
    const html = `<div style="font-family:${FONT};font-size:15px;line-height:1.6;color:#171717">` + text.split('\n\n').map((para) => `<p>${esc(para).replace(/\n/g, '<br>')}</p>`).join('') + '</div>';
    if (await resendSend(env, from, email, subject, html, text, REPLY_TO)) { st.mail = 1; await save(); }
    else await alertAdmin(env, 'oversold-mail-' + s.id, "Le mail d'excuse n'est pas parti", `Session ${s.id} : écris à ${email} pour t'excuser (remboursement fait).`);
  } else if (!from || !email) st.mail = 1;
  if (!st.alert) {
    await alertAdmin(env, 'oversold-' + s.id, 'Pièce payée deux fois : le second client a été remboursé', `Pièce(s) : ${slugs.join(', ')}\nSession remboursée : ${s.id}\nMontant : ${amount} €\nClient : ${email || 'inconnu'}\nMode : ${s.livemode ? 'réel' : 'test'}`);
    st.alert = 1;
  }
  await save();
}

// --- Emails de commande (Resend) ---------------------------------------------
// Alerte pour l'admin (ALERT_EMAIL) ; confirmation au client seulement si un
// domaine verifie est configure (MAIL_FROM). Une seule fois par commande.
async function resendSend(env: Env, from: string, to: string, subject: string, html: string, text: string, replyTo?: string, attachments?: { filename: string; content: string }[]) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}), ...(attachments && attachments.length ? { attachments } : {}) }),
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
    const p = catalog.find((c) => c.permalink === prod?.metadata?.slug) || (prod ? undefined : catalog.find((c) => c.name === li.description));
    const size = /\b(?:[Ss]ize|[Tt]aille|SIZE|TAILLE)\s+([A-Z]{1,4}|\d{1,3}(?:[./-]\d{1,3})?)\b/.exec(p?.description || '');
    const catImg = !prod && p && p.images && p.images[0] ? new URL(env.SITE_BASE).origin + encodeURI(p.images[0].url) : '';
    return {
      name: String(li.description),
      size: size ? size[1] : '',
      qty: li.quantity,
      amount: money(li.amount_total),
      ...(li.quantity > 1 ? { unit: money(Math.round(li.amount_total / li.quantity)) } : {}),
      image: (prod && prod.images && prod.images[0]) || catImg,
    };
  });
}

// forSeller : montants a l'ancienne (« 25,00 EUR »), mail vendeur toujours en francais.
async function buildOrder(env: Env, o: any, forSeller = false): Promise<OrderData> {
  const ship = (o.collected_information && o.collected_information.shipping_details) || o.shipping_details || {};
  const a = ship.address || {};
  // Langue du mail : celle choisie sur le site au moment du paiement ; anciennes commandes : selon le pays.
  const mailLang = o.metadata?.lang === 'fr' || o.metadata?.lang === 'en' ? o.metadata.lang : langFor(a.country || o.customer_details?.address?.country || '');
  // 84,00 € en français, €84.00 en anglais (autre devise : code après le montant).
  const cur = String(o.currency || 'eur').toUpperCase();
  const money = (c: number) => {
    const v = (c / 100).toFixed(2);
    if (forSeller || cur !== 'EUR') return v.replace('.', ',') + ' ' + cur;
    return mailLang === 'fr' ? v.replace('.', ',') + ' €' : '€' + v;
  };
  const ref = await assignRef(env, String(o.id));
  return {
    ref,
    requestId: /^D-[A-Z0-9]{6}$/.test(String(o.metadata?.request || '')) ? String(o.metadata.request) : '',
    name: ship.name || o.customer_details?.name || '',
    email: o.customer_details?.email || '',
    phone: o.customer_details?.phone || '',
    country: a.country || o.customer_details?.address?.country || '',
    lang: mailLang as 'fr' | 'en',
    address: [ship.name || o.customer_details?.name, a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' '), a.state, countryName(a.country, mailLang)].filter(Boolean),
    items: await mailItems(env, o.line_items?.data || [], money),
    shipping: money(o.shipping_cost?.amount_total || 0),
    discount: o.total_details?.amount_discount ? money(o.total_details.amount_discount) : '',
    total: money(o.amount_total),
    test: !o.livemode,
    stripeUrl: `https://dashboard.stripe.com/${o.livemode ? '' : 'test/'}payments/${typeof o.payment_intent === 'string' ? o.payment_intent : ''}`,
    cgvUrl: `${env.SITE_BASE}/infos-conditions-generales`,
    orderUrl: `${env.SITE_BASE}/suivi/?o=${encodeURIComponent(ref)}&l=${mailLang}`,
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
    const m = sellerEmail(await buildOrder(env, full.data, true));
    const ok = await resendSend(env, customerFrom || 'vgthmind <onboarding@resend.dev>', alertTo, m.subject, m.html, m.text, REPLY_TO);
    if (ok) done.alert = 1;
    else await alertAdmin(env, 'mail-seller-' + s.id, "Le mail de commande (vendeur) n'est pas parti", `Commande ${s.id} : Resend a refusé l'envoi.`);
  }
  if (needClient && order.email) {
    const m = customerEmail(order);
    const ok = await resendSend(env, customerFrom, order.email, m.subject, m.html, m.text, REPLY_TO);
    if (ok) done.client = 1;
    else await alertAdmin(env, 'mail-client-' + s.id, "Le mail de confirmation client n'est pas parti", `Commande ${s.id} (${order.ref}) : Resend a refusé l'envoi vers le client.`);
  }
  await env.HOLDS.put(doneKey, JSON.stringify(done), { expirationTtl: 60 * 60 * 24 * 90 });
}

// --- OAuth GitHub (connexion admin, protocole Decap/Sveltia) ----------------
async function oauthStart(request: Request, env: Env): Promise<Response> {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return new Response('Connexion GitHub pas encore configurée.', { status: 503 });
  const state = crypto.randomUUID();
  // Le site qui ouvre la fenêtre de connexion (site_id = son nom d'hôte, envoyé par Sveltia et
  // vg-admin-auth.js) : la réponse ne sera remise qu'à lui, s'il est dans ALLOWED_ORIGIN.
  const siteId = new URL(request.url).searchParams.get('site_id') || '';
  const opener = allowedOrigins(env).find((o) => new URL(o).hostname === siteId) || allowedOrigins(env)[0] || '';
  await env.HOLDS.put('oauth:' + state, opener, { expirationTtl: 600 });
  // Connexion de l'admin maison depuis un iPhone / une appli installée : la fenêtre GitHub n'a pas toujours de lien avec la page
  // d'origine (pas de postMessage). La page garde donc un code secret (lc) ; la session est déposée sous ce code et la page
  // la réclame (/auth/claim, une seule fois). `return` = page de connexion où revenir si la fenêtre ne peut pas se fermer.
  const q = new URL(request.url).searchParams;
  const lc = /^[a-f0-9]{32}$/.test(q.get('lc') || '') ? String(q.get('lc')) : '';
  let ret = '';
  try { const u = new URL(q.get('return') || ''); if (allowedOrigins(env).includes(u.origin) && u.pathname.startsWith('/admin/')) ret = u.origin + u.pathname + u.search; } catch (e) { /* pas de page de retour */ }
  // mode=page : appli installée sur l'écran d'accueil, connexion dans la même page (retour direct par redirection, sans fenêtre à part).
  const pageMode = q.get('mode') === 'page' && !!ret;
  if (lc || ret) await env.HOLDS.put('oauthx:' + state, JSON.stringify({ lc, ret, page: pageMode }), { expirationTtl: 600 });
  const redirect = new URL('/callback', request.url).toString();
  const url = 'https://github.com/login/oauth/authorize?' + new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: redirect,
    // 'repo' (et plus 'public_repo') : le dépôt vgthmind/shop devient privé (accord de vgthmind du 2026-10-12).
    scope: 'repo',
    state,
    allow_signup: 'false',
  });
  return Response.redirect(url, 302);
}

async function oauthCallback(request: Request, env: Env): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const state = params.get('state') || '';
  const code = params.get('code') || '';
  const stored = state ? await env.HOLDS.get('oauth:' + state) : null;
  // Anciennes connexions commencées avant ce changement : valeur '1' = premier site de la liste.
  const opener = stored && stored !== '1' && allowedOrigins(env).includes(stored) ? stored : allowedOrigins(env)[0] || '';
  let x: { lc?: string; ret?: string; page?: boolean } = {};
  try { x = JSON.parse((state && (await env.HOLDS.get('oauthx:' + state))) || '{}') || {}; } catch (e) { x = {}; }
  if (state) await env.HOLDS.delete('oauthx:' + state);
  const page = (status: 'success' | 'error', content: object) => {
    const msg = `authorization:github:${status}:${JSON.stringify(content)}`;
    const origin = JSON.stringify(opener);
    const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Connexion</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f2ec;color:#171717;font:20px/1.5 system-ui,-apple-system,sans-serif;text-align:center}main{padding:24px;max-width:340px}b{display:block;font-size:44px;margin-bottom:8px}a{display:inline-block;margin-top:18px;padding:16px 26px;border-radius:14px;background:#171717;color:#fff;text-decoration:none;font-weight:600}</style><main><b>${status === 'success' ? '✓' : '✕'}</b><p>${status === 'success' ? 'Tu es connecté.<br>Touche « OK » ou « Terminé » en haut pour revenir à l’admin.' : 'Connexion refusée. Ferme cette fenêtre et réessaie.'}</p>${status === 'success' && x.ret ? '<a id="back">Revenir à l’admin</a>' : ''}</main><script>
(function () {
  var msg = ${JSON.stringify(msg)};
  var RET = ${JSON.stringify(x.ret ? x.ret + (status === 'success' ? (x.ret.indexOf('?') < 0 ? '?' : '&') + 'done=1' : '') : '')};
  function receive(e) {
    if (e.origin !== ${origin}) return;
    window.opener.postMessage(msg, e.origin);
    window.removeEventListener('message', receive, false);
    setTimeout(function () { window.close(); }, 300);
  }
  window.addEventListener('message', receive, false);
  if (window.opener) window.opener.postMessage('authorizing:github', ${origin});
  // Pas de fenêtre d'origine (iPhone, appli installée) : on tente de fermer, sinon retour à la page de connexion,
  // qui retrouve la session par son code.
  setTimeout(function () { try { window.close(); } catch (e) {} }, 1500);
  var back = document.getElementById('back'); if (back && RET) back.setAttribute('href', RET);
})();
</script>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  };
  const failKey = 'rl:loginfail:' + (request.headers.get('CF-Connecting-IP') || 'x');
  const fail = async (message: string) => { // un échec de connexion seulement : compté pour la limite
    const n = Number(await env.HOLDS.get(failKey)) || 0;
    await env.HOLDS.put(failKey, String(n + 1), { expirationTtl: 900 });
    return page('error', { message });
  };
  if (!state || !stored) return fail('Session de connexion expirée, réessaie.');
  await env.HOLDS.delete('oauth:' + state);
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'vgthmind-shop-checkout' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!data.access_token) return fail(data.error_description || 'GitHub a refusé la connexion.');
  // Seul le compte admin peut se connecter.
  const user: any = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${data.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'vgthmind-shop-checkout' },
  }).then((r) => r.json()).catch(() => ({}));
  if (String(user.login || '').toLowerCase() !== String(env.ADMIN_GITHUB_LOGIN).toLowerCase()) {
    return fail('Ce compte GitHub n\'a pas accès à cet admin.');
  }
  // `token` reste pour Sveltia (il en a besoin pour publier sur GitHub) ; les
  // pages Stock/Commandes n'utilisent que `session`.
  const session = await makeSession(env);
  if (x.lc) await env.HOLDS.put('lc:' + x.lc, session, { expirationTtl: 600 }); // seulement la session, jamais le jeton GitHub
  if (x.page && x.ret) return new Response(null, { status: 302, headers: { Location: x.ret + (x.ret.indexOf('?') < 0 ? '?' : '&') + 'done=1', 'Cache-Control': 'no-store' } });
  return page('success', { token: data.access_token, provider: 'github', session });
}

// La page de connexion réclame la session déposée sous son code secret (une seule lecture).
async function oauthClaim(request: Request, env: Env, json: JsonFn): Promise<Response> {
  if (!(await allow(env, 'rl:claim:' + (request.headers.get('CF-Connecting-IP') || 'x'), 300, 900))) return json({ error: 'Trop de demandes.' }, 429);
  const code = new URL(request.url).searchParams.get('code') || '';
  if (!/^[a-f0-9]{32}$/.test(code)) return json({ error: 'Code invalide.' }, 400);
  const session = await env.HOLDS.get('lc:' + code);
  if (!session) return json({ pending: true });
  await env.HOLDS.delete('lc:' + code);
  return json({ session });
}

// --- /status -----------------------------------------------------------------
async function status(env: Env, cors: Record<string, string> = {}): Promise<Response> {
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
  lines.push(`${ok(!!env.RESEND_API_KEY && !!env.MAIL_FROM)}RESEND_API_KEY posée et expéditeur réglé (mails de commande et de contact)`);
  lines.push(`${ok(!!env.ALERT_EMAIL)}ALERT_EMAIL posée (alertes de commande et d'erreur)`);
  lines.push(`${ok(!!env.DEPLOY_HOOK_URL)}DEPLOY_HOOK_URL posée (mise en ligne programmée des drops)`);
  lines.push(`${ok(!!env.COMPTA_URL && !!env.COMPTA_SECRET)}COMPTA_URL + COMPTA_SECRET posées (ventes envoyées au Sheet de compta)${env.COMPTA_TEST ? ' : MODE ESSAI (COMPTA_TEST), à retirer après le test' : ''}`);
  lines.push(`${ok(!!env.FILES)}Stockage R2 des demandes de projet lié`);
  try {
    const catalog = await loadCatalog(env);
    const snap = await stockStub(env).snapshot(catalogDefaults(catalog));
    lines.push(`OK stock (Durable Object) : ${Object.keys(snap).length} pièces, ${Object.values(snap).filter((n) => n <= 0).length} en Sold out`);
  } catch (e: any) { lines.push('-- stock : ' + (e && e.message ? e.message : e)); }
  const latest = await env.HOLDS.get('backup:latest');
  lines.push(`${ok(!!latest)}dernière sauvegarde du stock : ${latest ? JSON.parse(latest).date : 'aucune'}`);
  lines.push(`   mode : ${env.LIVE_MODE === '1' ? 'LIVE' : 'test uniquement'}`);
  return new Response(lines.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...cors } });
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
const SESSION_TTL = 60 * 60 * 12; // 12 h, renouvelée tant que l'admin sert (déconnexion auto après 30 min d'inactivité côté navigateur)

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
  if (!timingSafeEqual(m[2], await sessionSig(env, exp))) return false;
  // « Se déconnecter » révoque CETTE session (rv:<signature>) ; l'ancienne révocation globale (admin:revoked : toutes les
  // sessions émises avant ce moment) ne sert plus que pour les sessions d'avant le 13/10/2026 soir.
  try {
    if (await env.HOLDS.get('rv:' + m[2])) return false;
    const revoked = Number(await env.HOLDS.get('admin:revoked')) || 0;
    if (revoked && exp - SESSION_TTL <= revoked) return false;
  } catch (e) { /* KV indisponible : la signature suffit */ }
  return true;
}

async function listOrders(request: Request, env: Env, key: string, json: JsonFn): Promise<Response> {
  if (!(await isAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  // Stripe refuse plus de 4 niveaux d'expansion (data.line_items.data.price.product = 5) : produit non déplié ici,
  // la pièce est retrouvée dans le catalogue par son nom (mailItems).
  // Jusqu a 3 pages de 100 (300 commandes) : au-dela, trop de lectures KV pour une execution.
  const sessions: any[] = [];
  let after = '';
  for (let page = 0; page < 3; page++) {
    const r = await stripeCall(key, 'GET', '/v1/checkout/sessions?status=complete&limit=100&expand[]=data.line_items&expand[]=data.payment_intent.latest_charge' + (after ? '&starting_after=' + after : ''));
    if (!r.ok) return json({ error: frStripeError(r.data.error, 'Impossible de lire les commandes chez Stripe.') }, 502);
    sessions.push(...(r.data.data || []));
    if (!r.data.has_more) break;
    after = r.data.data[r.data.data.length - 1].id;
  }
  // Remboursements : une seule lecture KV (liste des cles refunded:<session>), pas une par commande.
  const refunds = new Map<string, any>();
  try {
    const l = await env.HOLDS.list({ prefix: 'refunded:' });
    for (const k of l.keys) { const v = await env.HOLDS.get(k.name); if (v) refunds.set(k.name.slice(9), JSON.parse(v)); }
  } catch (e) {}
  // Rattrapage : l'état « remboursée » vient aussi de Stripe lui-même (si le webhook a tardé ou raté, la commande est mise à jour ici).
  for (const x of sessions) {
    const pi = x.payment_intent;
    if (pi && typeof pi === 'object') {
      const ch = pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
      if (ch && ch.amount_refunded > 0) {
        const cur = refunds.get(x.id);
        const eur = ch.amount_refunded / 100;
        if (!cur || Math.round(cur.amount * 100) !== ch.amount_refunded) {
          const v = { at: Math.floor(Date.now() / 1000), amount: eur, full: ch.amount_refunded >= ch.amount };
          refunds.set(x.id, v);
          try { await env.HOLDS.put('refunded:' + x.id, JSON.stringify(v)); } catch (e) {}
        }
      }
      x.payment_intent = pi.id;
    }
  }
  let invNums: Record<string, string> = {};
  try { invNums = await stockStub(env).invoiceNumbers(sessions.filter((x) => x.livemode).map((x) => x.id)); } catch (e) {}
  const orders = [];
  let catalog: Product[] = [];
  try { catalog = await loadCatalog(env); } catch (e) {}
  for (const s of sessions) {
    if (s.payment_status !== 'paid') continue;
    const ship = (s.collected_information && s.collected_information.shipping_details) || s.shipping_details || {};
    const [shipped, preparing, ref] = await Promise.all([env.HOLDS.get('shipped:' + s.id), env.HOLDS.get('preparing:' + s.id), assignRef(env, s.id)]);
    orders.push({
      id: s.id,
      ref,
      kind: s.metadata?.kind || 'order', // 'deposit' = acompte d'une demande (rien à expédier, mais compté dans l'export compta)
      request: s.metadata?.request || '',
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
      refunded: refunds.get(s.id) || null,
      invoice_no: invNums[s.id] || '',
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
  await onShipped(env as any, reqDeps(env), body.id, value.tracking, new URL(request.url).origin).catch(() => {});
  return json({ ok: true, shipped: value });
}

// « En preparation » : pose a la main depuis l'admin (bouton a cote de « expediee »).
// Remboursement depuis Commandes (admin). Sans montant : tout ce qui reste à rembourser. Le webhook charge.refunded
// marque ensuite la commande « remboursée » (avoir, alerte), exactement comme pour un remboursement fait dans Stripe.
// Messages d'erreur Stripe en français, compréhensibles (jamais le texte anglais brut).
function frStripeError(err: any, fallback: string): string {
  const code = (err && err.code) || '';
  const msg = String((err && err.message) || '');
  if (code === 'charge_already_refunded' || /already been refunded/i.test(msg)) return 'Cette commande est déjà remboursée en totalité chez Stripe.';
  if (/greater than|more than|exceeds|remaining/i.test(msg) && /refund/i.test(msg)) return 'Le montant dépasse ce qu’il reste à rembourser sur cette commande.';
  if (/No such (payment_intent|charge|checkout)/i.test(msg)) return 'Stripe ne retrouve pas ce paiement (commande d’un autre mode, test ou réel ?).';
  if (/insufficient/i.test(msg)) return 'Le solde Stripe ne permet pas ce remboursement pour l’instant.';
  if (/permission|restricted/i.test(msg)) return 'La clé Stripe n’a pas le droit de rembourser : à régler dans Stripe.';
  return fallback + (msg ? ' (détail Stripe : ' + msg + ')' : '');
}

async function refundOrder(request: Request, env: Env, key: string, json: JsonFn): Promise<Response> {
  if (!(await isAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
  let body: any = {};
  try { body = await request.json(); } catch (e) {}
  const id = String(body.id || '');
  if (!isSessionId(id)) return json({ error: 'Identifiant invalide.' }, 400);
  const prev = JSON.parse((await env.HOLDS.get('refunded:' + id)) || 'null');
  if (prev && prev.full) return json({ error: 'Cette commande est déjà remboursée en totalité.' }, 409);
  const s = await stripeCall(key, 'GET', '/v1/checkout/sessions/' + id);
  if (!s.ok) return json({ error: frStripeError(s.data.error, 'Commande introuvable chez Stripe.') }, 502);
  const pi = typeof s.data.payment_intent === 'string' ? s.data.payment_intent : s.data.payment_intent && s.data.payment_intent.id;
  if (!pi) return json({ error: 'Aucun paiement à rembourser sur cette commande.' }, 400);
  const p = new URLSearchParams({ payment_intent: pi });
  let cents = 0;
  if (body.amount !== undefined && body.amount !== null && body.amount !== '') {
    const eur = Number(String(body.amount).replace(',', '.'));
    cents = Math.round(eur * 100);
    if (!isFinite(eur) || cents < 1 || cents > (s.data.amount_total || 0)) return json({ error: 'Montant invalide (entre 0,01 € et le total de la commande).' }, 400);
    p.set('amount', String(cents));
  }
  p.set('metadata[reason]', 'admin_commandes');
  p.set('metadata[session]', id);
  const r = await stripeCall(key, 'POST', '/v1/refunds', p, { 'Idempotency-Key': 'vg-adminrefund-' + id + '-' + cents + '-' + Math.floor(Date.now() / 60000) });
  const totalEur = (s.data.amount_total || 0) / 100;
  if (!r.ok) {
    // Déjà remboursée chez Stripe (clic en double, remboursement fait dans Stripe) : on met simplement la commande à jour.
    if (r.data.error && r.data.error.code === 'charge_already_refunded') {
      await env.HOLDS.put('refunded:' + id, JSON.stringify({ at: Math.floor(Date.now() / 1000), amount: prev ? Math.max(prev.amount, totalEur) : totalEur, full: true }));
      return json({ ok: true, already: true, amount: totalEur, full: true });
    }
    return json({ error: frStripeError(r.data.error, 'Remboursement refusé par Stripe.') }, 502);
  }
  // État écrit tout de suite (le webhook charge.refunded le confirmera avec les chiffres exacts de Stripe).
  const done = Math.round(((prev ? prev.amount : 0) + (r.data.amount || 0) / 100) * 100) / 100;
  await env.HOLDS.put('refunded:' + id, JSON.stringify({ at: Math.floor(Date.now() / 1000), amount: done, full: done >= totalEur }));
  return json({ ok: true, refund: r.data.id, amount: (r.data.amount || 0) / 100, total: done, full: done >= totalEur, status: r.data.status });
}

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
async function trackOrder(request: Request, env: Env, key: string, json: JsonFn, asInvoice = false): Promise<Response> {
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

  if (asInvoice) return await invoiceFor(env, key, sessionId, json, s);
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
    discount: (s.total_details?.amount_discount || 0) / 100,
    total: s.amount_total / 100,
    refunded: !!(await env.HOLDS.get('refunded:' + sessionId)),
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
  const newTracking = String(body.tracking || '').trim().slice(0, 100);
  if (newTracking) shipped.tracking = newTracking; // numéro saisi au moment d'envoyer le mail (oubli à « Marquer expédiée »)
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

// Facture d'une commande payée (client via /invoice avec numéro + e-mail, admin via /admin/invoice).
async function invoiceFor(env: Env, key: string, sessionId: string, json: JsonFn, loaded?: any): Promise<Response> {
  const r = await invoiceData(env, key, sessionId, loaded);
  return r.ok ? json({ ok: true, invoice: r.invoice }) : json({ error: r.error }, r.status || 400);
}

// Facture d'un paiement : commande, acompte d'une demande (« Facture d'acompte ») ou solde (prix total − acompte).
// Numéro W-AAAA-NNN unique et suivi pour tous les paiements réels (même compteur).
async function invoiceData(env: Env, key: string, sessionId: string, loaded?: any): Promise<{ ok: boolean; invoice?: any; error?: string; status?: number }> {
  if (!isSessionId(sessionId)) return { ok: false, error: 'Identifiant invalide.', status: 400 };
  let s = loaded;
  if (!s) {
    const full = await stripeCall(key, 'GET', `/v1/checkout/sessions/${sessionId}?${SESSION_EXPAND}`);
    if (!full.ok) return { ok: false, error: full.data.error?.message || 'Erreur Stripe', status: 502 };
    s = full.data;
  }
  if (s.payment_status !== 'paid') return { ok: false, error: 'Commande non payée.', status: 400 };
  const kind = s.metadata?.kind;
  // Adresse de l'émetteur : saisie par vgthmind dans Réglages (données du Worker, jamais dans le dépôt) ; vide = non affichée.
  let sellerAddress = '';
  try { sellerAddress = String((await env.REQUESTS.get(env.REQUESTS.idFromName('main')).settings()).sellerAddress || '').trim(); } catch (e) {}
  const seller = { sellerAddress };
  const num = async (id: string, created: number, testRef: string) => (s.livemode ? await stockStub(env).invoiceNumber(id, parisYear(created)) : 'TEST-' + testRef);
  if (kind === 'deposit' || kind === 'balance') {
    const req = String(s.metadata.request || '');
    const ref = kind === 'deposit' ? req : await assignRef(env, sessionId);
    const number = await num(sessionId, s.created, kind === 'deposit' ? req + '-A' : ref);
    const depNumber = kind === 'balance' ? String(s.metadata.deposit_invoice || '') || (s.livemode && isSessionId(String(s.metadata.deposit_session || '')) ? await stockStub(env).invoiceNumber(s.metadata.deposit_session, parisYear(Number(s.metadata.deposit_date) || s.created)) : 'TEST-' + req + '-A') : '';
    const parts = requestInvoiceParts(s, depNumber);
    const inv: any = buildInvoice(s, parts.lines as any, { number, ref, ...seller });
    inv.title = parts.title; inv.titleEn = parts.titleEn; inv.deductions = parts.deductions; inv.notes = parts.notes; inv.kind = kind;
    return { ok: true, invoice: inv };
  }
  const ref = await assignRef(env, sessionId);
  const number = await num(sessionId, s.created, ref);
  const lines = (await mailItems(env, s.line_items?.data || [], (c) => String(c / 100))).map((i) => ({ name: i.name, size: i.size, qty: i.qty || 1, unit: i.unit ? Number(i.unit) : 0, amount: Number(i.amount) }));
  const inv: any = buildInvoice(s, lines as any, { number, ref, ...seller });
  // Commande remboursée (webhook charge.refunded) : avoir lié à la facture, total ou partiel.
  const rf = await env.HOLDS.get('refunded:' + sessionId);
  if (rf) {
    const r = JSON.parse(rf);
    inv.credit = { number: (s.livemode ? 'AV-' : 'TEST-AV-') + number.replace(/^TEST-/, ''), original: number, at: r.at, amount: Number(r.amount) || 0, full: !!r.full };
  }
  return { ok: true, invoice: inv };
}

// Dépendances du module « pièces sur demande » (requests.ts), pour éviter les imports croisés.
function reqDeps(env: Env): ReqDeps {
  return {
    stripeKey: () => { const k = stripeKey(env); return k.ok ? k.value : null; },
    stripe: stripeCall,
    send: (f, t, su, h, tx, rt, at) => resendSend(env, f, t, su, h, tx, rt, at),
    alert: (k, su, d) => alertAdmin(env, k, su, d),
    shipping: (product, country) => checkoutShipping(env as any, [product], new Map([[product.permalink, 1]]), country === 'FR' ? 'fr' : 'intl', country),
    invoice: async (sessionId) => { const k = stripeKey(env); return k.ok ? invoiceData(env, k.value, sessionId) : { ok: false, error: k.error, status: 503 }; },
    catalog: () => loadCatalog(env),
  };
}

// Limite d'appels : max appels par fenêtre (secondes) pour une clé. Renvoie false quand la limite est atteinte.
async function allow(env: Env, key: string, max: number, windowSec: number): Promise<boolean> {
  const n = Number(await env.HOLDS.get(key)) || 0;
  if (n >= max) return false;
  await env.HOLDS.put(key, String(n + 1), { expirationTtl: Math.max(60, windowSec) });
  return true;
}

// Alerte mail à ALERT_EMAIL (une seule fois par type d'incident et par 10 min, pour ne pas inonder la boîte).
async function alertAdmin(env: Env, kind: string, subject: string, detail: string) {
  try {
    const to = (env.ALERT_EMAIL || '').trim(), from = (env.MAIL_FROM || '').trim();
    if (!env.RESEND_API_KEY || !to || !from) return;
    const k = 'alert:' + kind.slice(0, 120);
    if (await env.HOLDS.get(k)) return;
    await env.HOLDS.put(k, '1', { expirationTtl: 600 });
    const html = '<p><b>' + subject.replace(/[<>&]/g, '') + '</b></p><pre style="white-space:pre-wrap">' + detail.replace(/[<>&]/g, '') + '</pre>';
    await resendSend(env, from, to, '[vgthmind ALERTE] ' + subject, html, subject + '\n\n' + detail);
  } catch (e) { /* une alerte ne doit jamais faire planter le reste */ }
}

// Moyens de paiement des pages Stripe (commandes, acomptes, soldes) : fixés ici et non par le tableau de bord Stripe.
// Carte (Apple Pay et Google Pay sont proposés automatiquement sur la carte) et Bancontact ; ni Klarna ni EPS.
export const PAYMENT_METHODS = ['card', 'bancontact'];
// Territoires d'outre-mer livrés au vrai tarif Colissimo Outre-mer : mention de l'octroi de mer sur la page de paiement.
const OUTRE_MER = ['GP', 'MQ', 'GF', 'RE', 'YT', 'PM', 'MF', 'BL', 'NC', 'PF', 'WF', 'TF'];

async function stripeCall(key: string, method: string, path: string, params?: URLSearchParams, extraHeaders?: Record<string, string>) {
  if (method === 'POST' && path === '/v1/checkout/sessions' && params && !params.has('payment_method_types[0]')) {
    PAYMENT_METHODS.forEach((m, i) => params.set(`payment_method_types[${i}]`, m));
  }
  const res = await fetch('https://api.stripe.com' + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded', ...(extraHeaders || {}) },
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
