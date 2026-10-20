// Suivi des colis via l'API Suivi La Poste (developer.laposte.fr, v2) : Colissimo et Lettre suivie.
// Fonctions pures (lecture de la réponse, choix du statut) + la relève des colis (appelée par le cron, deux fois par jour).
// La clé API est le secret Cloudflare LAPOSTE_API_KEY : jamais dans le code, le dépôt ou le navigateur.

export type TrackState = 'transit' | 'pickup' | 'delivered' | 'problem';
export interface TrackEvent { date: string; label: string; code?: string }
export interface TrackInfo {
  state: TrackState;
  label: string; // dernier libellé connu (français, tel que donné par La Poste)
  events: TrackEvent[]; // du plus récent au plus ancien
  checked: number; // dernière tentative (s)
  ok?: number; // dernière réponse valide (s)
  deliveredAt?: number; // s, posé une fois
  deliveredMailed?: number; // s, mail « livrée » parti
  alerted?: string; // état « problem » déjà signalé (libellé), pour ne pas alerter deux fois
}

export const SUIVI_URL = 'https://api.laposte.fr/suivi/v2/idships/';
export const MIN_GAP_S = 11 * 3600; // un colis n'est interrogé qu'une fois toutes les 11 h au plus (donc 2 fois par jour maximum)
export const MAX_AGE_S = 75 * 86400; // on arrête de suivre un colis expédié depuis plus de 75 jours
const MAX_PER_RUN = 60; // garde-fou de quota

// Numéro tel que saisi (espaces, minuscules) -> forme acceptée par l'API ; '' si invalide.
export function cleanTracking(raw: unknown): string {
  const t = String(raw || '').replace(/[\s.-]+/g, '').toUpperCase();
  return /^[A-Z0-9]{8,30}$/.test(t) ? t : '';
}

// Calé sur une vraie réponse (20/10/2026) : DI1 = livré ; DR1 = « en préparation chez l'expéditeur » (PAS une livraison) ; ET1/ET3/EP1/PC1 = transit.
// Retour / non distribuable / point retrait : codes non encore vus en réel, volontairement peu nombreux ; tout code inconnu = transit, sans alerte.
const DELIVERED_CODES = ['DI1'];
const PROBLEM_CODES = ['RE1', 'ND1', 'ND2'];
const PICKUP_CODES = ['AG1'];

// Statut d'après les champs de l'API (dernier événement + frise « timeline » : la dernière étape cochée = livré).
// Code inconnu = « en transit », sans alerte (jamais d'alerte sur une supposition).
export function stateOf(code: string, timeline?: any[]): TrackState {
  const c = String(code || '').toUpperCase();
  if (PROBLEM_CODES.includes(c)) return 'problem';
  if (DELIVERED_CODES.includes(c)) return 'delivered';
  const tl = Array.isArray(timeline) ? timeline.filter((t) => t && typeof t.id === 'number') : [];
  if (tl.length >= 3) { const lastStep = tl.reduce((m, t) => (t.id > m.id ? t : m)); if (lastStep.status === true) return 'delivered'; }
  if (PICKUP_CODES.includes(c)) return 'pickup';
  return 'transit';
}

// Version expurgée de la réponse brute (aucune donnée perso) : gardée une fois en KV pour caler les statuts sur la réalité.
export function sanitizeSample(data: any) {
  const sh = (data && data.shipment) || {};
  return {
    returnCode: data && data.returnCode, scope: data && data.scope,
    shipment: {
      product: sh.product, isFinal: sh.isFinal, entryDate: sh.entryDate,
      timeline: (Array.isArray(sh.timeline) ? sh.timeline : []).map((t: any) => ({ id: t.id, shortLabel: t.shortLabel, status: t.status, type: t.type, date: t.date })),
      event: (Array.isArray(sh.event) ? sh.event : []).slice(0, 20).map((e: any) => ({ code: e.code, label: e.label, date: e.date })),
    },
  };
}

// Réponse brute de l'API -> TrackInfo (sans les champs de suivi interne). null si la réponse n'est pas exploitable.
export function parseSuivi(data: any, now: number): Pick<TrackInfo, 'state' | 'label' | 'events'> | null {
  const sh = data && data.shipment;
  if (!sh || typeof sh !== 'object') return null;
  const raw: any[] = Array.isArray(sh.event) ? sh.event : [];
  const events: TrackEvent[] = raw
    .map((e) => ({ date: String(e.date || ''), label: String(e.label || '').slice(0, 300), code: String(e.code || '').toUpperCase() }))
    .filter((e) => e.label)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 25);
  if (!events.length) {
    // Colis connu mais encore sans événement (étiquette créée) : en transit, libellé de la frise si elle existe.
    const tl: any[] = Array.isArray(sh.timeline) ? sh.timeline : [];
    const cur = tl.filter((t) => t && t.status).pop();
    return { state: 'transit', label: String((cur && (cur.shortLabel || cur.longLabel)) || 'Colis annoncé, pas encore pris en charge').slice(0, 300), events: [] };
  }
  const last = events[0];
  return { state: stateOf(last.code || '', sh.timeline), label: last.label, events };
}

// Une interrogation. Jamais d'exception : { ok:false } si l'API ne répond pas ou refuse (le dernier statut connu est gardé).
export async function fetchSuivi(key: string, tracking: string, fetcher: typeof fetch = fetch): Promise<{ ok: boolean; status: number; data?: any }> {
  try {
    const res = await fetcher(SUIVI_URL + encodeURIComponent(tracking) + '?lang=fr_FR', { headers: { 'X-Okapi-Key': key, Accept: 'application/json' } });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, status: res.status, data: await res.json() };
  } catch (e) { return { ok: false, status: 0 }; }
}

export interface PollDeps {
  now: number;
  key: string;
  list(cursor?: string): Promise<{ keys: { name: string }[]; list_complete?: boolean; cursor?: string }>;
  get(name: string): Promise<string | null>;
  put(name: string, value: string): Promise<void>;
  fetcher?: typeof fetch;
  onDelivered(sessionId: string, shipped: any): Promise<boolean>; // envoie le mail client ; true si parti
  onProblem(sessionId: string, shipped: any, info: TrackInfo): Promise<void>; // alerte contact@
  onAuthError?(status: number): Promise<void>; // 401/403 : clé refusée ou expirée
  onSample?(sample: any): Promise<void>; // première réponse valide, expurgée
  onStatus?(status: number, returnCode: unknown): void; // code HTTP de chaque appel (bilan du cron)
}

// Relève : les commandes expédiées avec numéro, non livrées. Retourne un petit bilan (journal du cron).
export async function pollShipments(d: PollDeps) {
  const out = { checked: 0, updated: 0, failed: 0, delivered: 0, problems: 0 };
  let cursor: string | undefined;
  let authFail = 0;
  do {
    const page = await d.list(cursor);
    cursor = page.list_complete ? undefined : page.cursor;
    for (const k of page.keys) {
      if (out.checked >= MAX_PER_RUN) return out;
      const id = k.name.slice('shipped:'.length);
      const raw = await d.get(k.name);
      if (!raw) continue;
      let sh: any; try { sh = JSON.parse(raw); } catch (e) { continue; }
      const num = cleanTracking(sh.tracking);
      if (!num) continue;
      const prev: TrackInfo | undefined = sh.track;
      if (prev && prev.state === 'delivered') {
        // Livré mais mail pas parti (panne passagère) : on réessaie sans rappeler l'API.
        if (!prev.deliveredMailed && await d.onDelivered(id, sh).catch(() => false)) { prev.deliveredMailed = d.now; await d.put(k.name, JSON.stringify(sh)); }
        continue;
      }
      if (d.now - Number(sh.at || 0) > MAX_AGE_S) continue;
      if (prev && d.now - Number(prev.checked || 0) < MIN_GAP_S) continue;
      out.checked++;
      const r = await fetchSuivi(d.key, num, d.fetcher);
      if (d.onStatus) d.onStatus(r.status, r.ok && r.data ? r.data.returnCode : undefined);
      if (r.ok && d.onSample) await d.onSample(sanitizeSample(r.data)).catch(() => {});
      const info: TrackInfo = prev ? { ...prev, checked: d.now } : { state: 'transit', label: '', events: [], checked: d.now };
      const parsed = r.ok ? parseSuivi(r.data, d.now) : null;
      if (!parsed) {
        // 404 = numéro pas encore connu de La Poste (étiquette créée) : normal les premières heures, pas une panne.
        if (!r.ok && (r.status === 401 || r.status === 403)) authFail++;
        else if (!(r.ok === false && r.status === 404)) out.failed++;
        sh.track = info; await d.put(k.name, JSON.stringify(sh));
        continue;
      }
      Object.assign(info, parsed, { ok: d.now });
      out.updated++;
      if (info.state === 'delivered') {
        info.deliveredAt = prev?.deliveredAt || d.now;
        sh.track = info;
        out.delivered++;
        if (await d.onDelivered(id, sh).catch(() => false)) info.deliveredMailed = d.now;
      } else if (info.state === 'problem') {
        if (info.alerted !== info.label) { sh.track = info; await d.onProblem(id, sh, info).catch(() => {}); info.alerted = info.label; out.problems++; }
      } else if (info.alerted) delete info.alerted;
      sh.track = info;
      await d.put(k.name, JSON.stringify(sh));
    }
  } while (cursor);
  if (authFail && d.onAuthError) await d.onAuthError(401).catch(() => {});
  return out;
}

export const STATE_LABEL_FR: Record<TrackState, string> = { transit: 'En transit', pickup: 'En point retrait', delivered: 'Livrée', problem: 'Problème' };
