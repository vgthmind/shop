// Envoi de chaque vente / remboursement vers un Google Sheet via Apps Script
// (module NON BRANCHE : voir rapports-nuit/compta-panier.md).
//  - COMPTA_URL    secret Cloudflare : adresse « /exec » du script (ne va jamais dans le depot)
//  - COMPTA_SECRET secret Cloudflare : meme valeur que la propriete « SECRET » du script
//  - COMPTA_TEST   « 1 » pour envoyer aussi les commandes de test Stripe (sinon ignorees)
// Rejouable : chaque ligne a une cle unique (id de session / de remboursement) ;
// le script la met a jour au lieu de la dupliquer. Un envoi rate reste en file
// (KV compta:q:<cle>) et repart avec replayPending / POST /admin/compta/replay.
// @ts-ignore  (module JS sans types)
import * as core from './accounting-core.js';

const { buildSaleRecord, buildRefundRecord, buildEnvelope } = core as any;

interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string; limit?: number }): Promise<{ keys: { name: string }[] }>;
}
export interface AccEnv {
  HOLDS: KVLike; COMPTA_URL?: string; COMPTA_SECRET?: string; COMPTA_TEST?: string; STRIPE_SECRET_KEY?: string;
}
type JsonFn = (data: unknown, status?: number) => Response;
type Record_ = { type: string; key: string; livemode: boolean; row: any };

const Q = 'compta:q:', OK = 'compta:ok:';

export function accountingConfigured(env: AccEnv) { return !!(env.COMPTA_URL && env.COMPTA_SECRET); }

// POST signe ; true seulement si le script confirme { ok: true }.
async function post(env: AccEnv, rec: Record_): Promise<boolean> {
  try {
    const res = await fetch(env.COMPTA_URL as string, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: await buildEnvelope(env.COMPTA_SECRET as string, rec),
    });
    const data: any = await res.json().catch(() => null);
    return !!(res.ok && data && data.ok === true);
  } catch (e) { return false; }
}

// Envoie (ou met en file) une ligne. `force` : renvoyer meme si deja confirmee.
export async function send(env: AccEnv, rec: Record_, force = false): Promise<'sent' | 'queued' | 'skipped'> {
  if (!accountingConfigured(env)) return 'skipped';
  if (!rec.livemode && env.COMPTA_TEST !== '1') return 'skipped'; // jamais de test dans la compta
  if (!force && (await env.HOLDS.get(OK + rec.key))) return 'skipped';
  if (await post(env, rec)) {
    await env.HOLDS.put(OK + rec.key, new Date().toISOString());
    await env.HOLDS.delete(Q + rec.key);
    return 'sent';
  }
  await env.HOLDS.put(Q + rec.key, JSON.stringify(rec)); // pas de donnee client dans la file
  return 'queued';
}

// Lignes de la commande (designations) : celles de la session si fournies, sinon demandees a Stripe.
async function lineItemsOf(env: AccEnv, s: any): Promise<any[]> {
  if (s.line_items && s.line_items.data) return s.line_items.data;
  if (!env.STRIPE_SECRET_KEY) return [];
  try {
    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(s.id)}/line_items?limit=100`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
    const d: any = await r.json();
    return r.ok ? d.data || [] : [];
  } catch (e) { return []; }
}

// A appeler quand une commande est payee (processPaid). `ref` = numero VG-XXXXXX.
export async function recordSale(env: AccEnv, session: any, ref: string, force = false) {
  if (session.payment_status && session.payment_status !== 'paid') return 'skipped';
  return send(env, buildSaleRecord(session, { ref, lineItems: await lineItemsOf(env, session) }), force);
}

// A appeler sur l'evenement Stripe refund.created. `ref` : numero de commande si connu (sinon '').
export async function recordRefund(env: AccEnv, refund: any, ref: string, force = false) {
  return send(env, buildRefundRecord(refund, { ref }), force);
}

// Renvoie les lignes restees en file (cron ou bouton admin).
export async function replayPending(env: AccEnv, limit = 25) {
  const list = await env.HOLDS.list({ prefix: Q, limit });
  let sent = 0, failed = 0;
  for (const k of list.keys) {
    const raw = await env.HOLDS.get(k.name);
    if (!raw) continue;
    const r = await send(env, JSON.parse(raw), true);
    if (r === 'sent') sent++; else failed++;
  }
  return { sent, failed };
}

// Routes admin (a appeler APRES le garde isAdmin) :
//   GET  /admin/compta/status   { configured, pending, done }
//   POST /admin/compta/replay   renvoie la file
//   POST /admin/compta/resync   renvoie TOUTES les ventes (et remboursements) fournis par les assistants ; sans doublon grace a la cle
export async function accountingRoutes(
  request: Request, env: AccEnv, path: string, json: JsonFn,
  helpers: { paidSessions: () => Promise<any[]>; refunds: () => Promise<any[]>; refFor: (sessionId: string) => Promise<string> },
): Promise<Response | null> {
  if (!path.startsWith('/admin/compta/')) return null;
  if (path === '/admin/compta/status' && request.method === 'GET') {
    const [q, ok] = await Promise.all([env.HOLDS.list({ prefix: Q }), env.HOLDS.list({ prefix: OK })]);
    return json({ configured: accountingConfigured(env), pending: q.keys.length, done: ok.keys.length });
  }
  if (!accountingConfigured(env)) return json({ error: 'COMPTA_URL / COMPTA_SECRET non configurés.' }, 503);
  if (path === '/admin/compta/replay' && request.method === 'POST') return json(await replayPending(env, 100));
  if (path === '/admin/compta/resync' && request.method === 'POST') {
    const out = { sent: 0, queued: 0, skipped: 0 };
    for (const s of await helpers.paidSessions()) out[await recordSale(env, s, await helpers.refFor(String(s.id)), true)]++;
    for (const r of await helpers.refunds()) out[await recordRefund(env, r, '', true)]++;
    return json(out);
  }
  return json({ error: 'Not found' }, 404);
}
