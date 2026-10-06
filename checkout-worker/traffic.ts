// Statistiques de visites maison (module NON BRANCHE : voir rapports-nuit/trafic.md).
//  - POST /t            balise du navigateur (assets/vg-traffic.js) : page vue + battement
//  - GET  /admin/traffic?days=30   resume (admin)
//  - GET  /admin/traffic/live      { live } visiteurs en ce moment (admin)
// Vie privee : pas de cookie, pas d'IP ni d'identifiant stocke. Le « visiteur »
// est un hachage SHA-256(sel du jour | IP | navigateur) tronque ; le sel est
// tire au hasard chaque jour et SUPPRIME le lendemain, donc le hachage ne peut
// plus etre recalcule ni relie d'un jour a l'autre. Les hachages du jour ne
// servent qu'a ne pas compter deux fois le meme visiteur ; ils sont effaces a
// minuit. Restent seulement des compteurs (pages, provenance, pays, appareil).
import { DurableObject } from 'cloudflare:workers';
// @ts-ignore  (module JS sans types)
import * as core from './traffic-core.js';

const { cleanPath, cleanCountry, classifySource, deviceOf, isBot, dayKey, emptyDay, addView, Presence, summarize, MAX_VISITORS } = core as any;

const KEEP_DAYS = 400;
const FLUSH_MS = 10_000;
type JsonFn = (data: unknown, status?: number) => Response;
interface TrafficEnv { TRAFFIC: any; ALLOWED_ORIGIN: string }

export class TrafficDO extends DurableObject {
  private today = '';
  private day: any = null;
  private salt = '';
  private visitors = new Set<string>();
  private presence = new Presence();
  private loaded = false;

  private async load(now: number) {
    const storage = (this as any).ctx.storage;
    const key = dayKey(now);
    if (this.loaded && key === this.today) return storage;
    if (this.loaded) await this.flush(); // changement de jour : on ecrit l'ancien avant
    this.today = key;
    this.day = (await storage.get('d:' + key)) || emptyDay();
    this.visitors = new Set((await storage.get('v:' + key)) || []);
    this.salt = (await storage.get('salt:' + key)) || '';
    if (!this.salt) {
      this.salt = crypto.randomUUID() + crypto.randomUUID();
      await storage.put('salt:' + key, this.salt);
    }
    // Menage : sels et hachages des jours passes supprimes ; compteurs gardes KEEP_DAYS.
    const old = await storage.list({ prefix: 'salt:' });
    for (const k of old.keys()) if (k !== 'salt:' + key) await storage.delete(k);
    const vs = await storage.list({ prefix: 'v:' });
    for (const k of vs.keys()) if (k !== 'v:' + key) await storage.delete(k);
    const ds = [...(await storage.list({ prefix: 'd:' })).keys()].sort();
    for (const k of ds.slice(0, Math.max(0, ds.length - KEEP_DAYS))) await storage.delete(k);
    this.loaded = true;
    return storage;
  }

  private async flush() {
    if (!this.loaded) return;
    const storage = (this as any).ctx.storage;
    await storage.put('d:' + this.today, this.day);
    await storage.put('v:' + this.today, [...this.visitors]);
  }

  async alarm() { await this.flush(); }

  private async hash(ip: string, ua: string) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${this.salt}|${ip}|${ua}`));
    return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // evt : { ip, ua, country, path, ref, utm, hb } (l'IP n'est jamais ecrite).
  async hit(evt: { ip: string; ua: string; country: string; path: string; ref: string; utm: string; hb: boolean; own: string }) {
    const now = Date.now();
    const storage = await this.load(now);
    const id = await this.hash(evt.ip, evt.ua);
    this.presence.touch(id, now);
    if (evt.hb) return; // battement : « en ce moment » seulement, pas une page vue
    const isNew = !this.visitors.has(id);
    if (isNew && this.visitors.size < MAX_VISITORS) this.visitors.add(id);
    addView(this.day, {
      path: evt.path, isNewVisitor: isNew,
      source: classifySource({ referrer: evt.ref, utm: evt.utm, ua: evt.ua, ownHost: evt.own }),
      country: cleanCountry(evt.country), device: deviceOf(evt.ua),
    });
    if (!(await storage.getAlarm())) await storage.setAlarm(now + FLUSH_MS);
  }

  async live() { return this.presence.count(Date.now()); }

  async report(days: number) {
    const now = Date.now();
    await this.load(now);
    await this.flush();
    const storage = (this as any).ctx.storage;
    const out: Record<string, any> = {};
    for (let i = Math.min(Math.max(1, days), 365) - 1; i >= 0; i--) {
      const k = dayKey(now - i * 86400_000);
      out[k] = k === this.today ? this.day : (await storage.get('d:' + k)) || emptyDay();
    }
    return summarize(out, { live: this.presence.count(now), topN: 10 });
  }
}

function stub(env: TrafficEnv) { return env.TRAFFIC.get(env.TRAFFIC.idFromName('main')); }

// Routes ; renvoie null si ce n'est pas la sienne. /admin/* : appeler APRES le garde isAdmin.
export async function trafficRoutes(request: Request, env: TrafficEnv, path: string, json: JsonFn): Promise<Response | null> {
  if (path === '/t' && request.method === 'POST') {
    const empty = () => new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN } });
    if (request.headers.get('Origin') !== env.ALLOWED_ORIGIN) return empty();
    const ua = request.headers.get('User-Agent') || '';
    if (isBot(ua)) return empty();
    let body: any = {};
    try { body = JSON.parse((await request.text()).slice(0, 2000)); } catch (e) { return empty(); }
    const p = cleanPath(body.p);
    if (!p) return empty(); // admin, ou valeur invalide
    await stub(env).hit({
      ip: request.headers.get('CF-Connecting-IP') || '', ua,
      country: String((request as any).cf?.country || request.headers.get('CF-IPCountry') || ''),
      path: p, ref: String(body.r || '').slice(0, 300), utm: String(body.u || '').slice(0, 30), hb: body.hb === true, own: new URL(env.ALLOWED_ORIGIN).hostname,
    });
    return empty();
  }
  if (path === '/admin/traffic' && request.method === 'GET') {
    const days = Math.floor(Number(new URL(request.url).searchParams.get('days'))) || 30;
    return json(await stub(env).report(days));
  }
  if (path === '/admin/traffic/live' && request.method === 'GET') return json({ live: await stub(env).live() });
  return null;
}
