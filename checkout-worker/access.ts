// Mode d'accès au site : « Ouvert » / « Fermé » / « Accès par code », réglé depuis l'admin (Réglages > Accès au site).
// Réglage gardé dans KV (clé access:config), lu par la Function Pages functions/_middleware.js via GET /access.
//   GET  /access?c=<cookie>   public : { mode, msg_fr, msg_en, ok } (ok = le cookie d'accès est valable, seulement en mode « code »)
//   POST /access/enter        public : { code } -> { ok, token } (le cookie est posé par la Function, sur le domaine du site)
//   GET/POST /admin/access    admin  : lire / changer mode, code, messages
// Le code n'est jamais gardé en clair (SHA-256 + sel). Le cookie = « <époque>.<signature SESSION_SECRET> » : il cesse de valoir
// quand l'époque change, c'est-à-dire quand le code est modifié ou que le site passe en « Fermé ».
type JsonFn = (data: unknown, status?: number) => Response;
export type AccessMode = 'open' | 'closed' | 'code';
export interface AccessCfg { mode: AccessMode; salt: string; hash: string; epoch: number; msg_fr: string; msg_en: string; updated: number }
interface AccessEnv { HOLDS: { get(k: string): Promise<string | null>; put(k: string, v: string, o?: any): Promise<void> }; SESSION_SECRET?: string }

const KEY = 'access:config';
export const DEFAULT_MSG_FR = 'Boutique en pause, retour bientôt.';
export const DEFAULT_MSG_EN = 'Shop on pause, back soon.';
const MODES: AccessMode[] = ['open', 'closed', 'code'];
const MSG_MAX = 500;
const RL_MAX = 8; // codes faux par visiteur et par 15 minutes
const RL_ALL = 60; // et au total (le Worker reçoit l'adresse du visiteur de la Function Pages, qu'un appel direct pourrait falsifier)

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const b64url = (b: ArrayBuffer) => { let s = ''; for (const x of new Uint8Array(b)) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
function same(a: string, b: string): boolean { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
async function hashCode(salt: string, code: string): Promise<string> { return hex(await crypto.subtle.digest('SHA-256', enc.encode(salt + ':' + code))); }
async function signEpoch(env: AccessEnv, epoch: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode('vg-access.' + epoch)));
}

// Réglage gardé 20 s en mémoire du Worker (une lecture KV par instance et par 20 s au lieu d'une par requête) ; vidé dès qu'il change ici.
let accessCache: { cfg: AccessCfg; t: number; kv: unknown } | null = null;
export function resetAccessCache() { accessCache = null; }
export async function readAccess(env: AccessEnv): Promise<AccessCfg> {
  if (accessCache && accessCache.kv === env.HOLDS && Date.now() - accessCache.t < 20_000) return accessCache.cfg;
  const cfg = await readAccessKv(env);
  accessCache = { cfg, t: Date.now(), kv: env.HOLDS };
  return cfg;
}
async function readAccessKv(env: AccessEnv): Promise<AccessCfg> {
  let j: any = null;
  try { const raw = await env.HOLDS.get(KEY); if (raw) j = JSON.parse(raw); } catch (e) { /* KV indisponible : site ouvert */ }
  j = j && typeof j === 'object' ? j : {};
  return {
    mode: MODES.includes(j.mode) ? j.mode : 'open',
    salt: typeof j.salt === 'string' ? j.salt : '', hash: typeof j.hash === 'string' ? j.hash : '',
    epoch: Number.isFinite(j.epoch) ? j.epoch : 1,
    msg_fr: typeof j.msg_fr === 'string' && j.msg_fr.trim() ? j.msg_fr : DEFAULT_MSG_FR,
    msg_en: typeof j.msg_en === 'string' && j.msg_en.trim() ? j.msg_en : DEFAULT_MSG_EN,
    updated: Number(j.updated) || 0,
  };
}

async function tokenValid(env: AccessEnv, cfg: AccessCfg, token: string): Promise<boolean> {
  if (!env.SESSION_SECRET || cfg.mode !== 'code') return false;
  const m = /^(\d{1,13})\.([A-Za-z0-9_-]{43})$/.exec(token || '');
  if (!m || Number(m[1]) !== cfg.epoch) return false;
  return same(m[2], await signEpoch(env, cfg.epoch));
}

// Site fermé : réponse 503 pour les nouveaux paiements panier et les nouvelles demandes (null = ouvert ou sous code).
export async function closedRefusal(env: AccessEnv): Promise<Record<string, string> | null> {
  const cfg = await readAccess(env);
  if (cfg.mode !== 'closed') return null;
  return {
    error: 'closed', code: 'closed',
    message_fr: 'La boutique est fermée pour le moment : pas de nouvelle commande ni de nouvelle demande. ' + cfg.msg_fr,
    message_en: 'The shop is closed for now: no new orders or requests. ' + cfg.msg_en,
  };
}

export async function accessRoutes(request: Request, env: AccessEnv, path: string, json: JsonFn): Promise<Response | null> {
  const url = new URL(request.url);
  if (path === '/access' && request.method === 'GET') {
    const cfg = await readAccess(env);
    return json({ mode: cfg.mode, msg_fr: cfg.msg_fr, msg_en: cfg.msg_en, ok: await tokenValid(env, cfg, url.searchParams.get('c') || '') });
  }
  if (path === '/access/enter' && request.method === 'POST') {
    const cfg = await readAccess(env);
    if (cfg.mode !== 'code' || !cfg.hash) return json({ ok: false, error: 'Accès par code non activé.' }, 409);
    if (!env.SESSION_SECRET) return json({ ok: false, error: 'Service indisponible.' }, 503);
    const fwd = request.headers.get('X-Client-IP') || '';
    const ip = /^[0-9a-f:.]{3,45}$/i.test(fwd) ? fwd : (request.headers.get('CF-Connecting-IP') || 'x');
    const rl = 'rl:access:' + ip, rlAll = 'rl:access:all';
    if ((Number(await env.HOLDS.get(rl)) || 0) >= RL_MAX || (Number(await env.HOLDS.get(rlAll)) || 0) >= RL_ALL) return json({ ok: false, error: 'Trop d’essais, réessaie dans 15 minutes.' }, 429);
    const body: any = await request.json().catch(() => ({}));
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (code && code.length <= 64 && same(await hashCode(cfg.salt, code), cfg.hash)) return json({ ok: true, token: cfg.epoch + '.' + (await signEpoch(env, cfg.epoch)) });
    await env.HOLDS.put(rl, String((Number(await env.HOLDS.get(rl)) || 0) + 1), { expirationTtl: 900 });
    await env.HOLDS.put(rlAll, String((Number(await env.HOLDS.get(rlAll)) || 0) + 1), { expirationTtl: 900 });
    return json({ ok: false, error: 'Code incorrect.' }, 401);
  }
  if (path === '/admin/access') { // l'appelant a déjà vérifié la session admin
    if (request.method === 'GET') {
      const cfg = await readAccess(env);
      return json({ mode: cfg.mode, has_code: !!cfg.hash, msg_fr: cfg.msg_fr, msg_en: cfg.msg_en, updated: cfg.updated });
    }
    if (request.method === 'POST') {
      const b: any = await request.json().catch(() => ({}));
      const cfg = await readAccess(env);
      const next: AccessCfg = { ...cfg };
      if (b.mode !== undefined) { if (!MODES.includes(b.mode)) return json({ error: 'Mode inconnu.' }, 400); next.mode = b.mode; }
      let codeChanged = false;
      if (typeof b.code === 'string' && b.code.trim()) {
        const c = b.code.trim();
        if (c.length < 4 || c.length > 64) return json({ error: 'Le code doit faire entre 4 et 64 caractères.' }, 400);
        const salt = b64url(crypto.getRandomValues(new Uint8Array(12)).buffer);
        next.salt = salt; next.hash = await hashCode(salt, c); codeChanged = true;
      }
      for (const k of ['msg_fr', 'msg_en'] as const) {
        if (b[k] === undefined) continue;
        if (typeof b[k] !== 'string' || b[k].length > MSG_MAX) return json({ error: 'Message trop long (' + MSG_MAX + ' caractères au maximum).' }, 400);
        next[k] = b[k].trim() || (k === 'msg_fr' ? DEFAULT_MSG_FR : DEFAULT_MSG_EN);
      }
      if (next.mode === 'code' && !next.hash) return json({ error: 'Choisis d\'abord un code.' }, 400);
      // Les visiteurs déjà entrés sont déconnectés quand le code change ou quand le site est fermé.
      if (codeChanged || (next.mode === 'closed' && cfg.mode !== 'closed')) next.epoch = cfg.epoch + 1;
      next.updated = Date.now();
      await env.HOLDS.put(KEY, JSON.stringify(next));
      accessCache = null;
      return json({ ok: true, mode: next.mode, has_code: !!next.hash, msg_fr: next.msg_fr, msg_en: next.msg_en, updated: next.updated });
    }
  }
  return null;
}
