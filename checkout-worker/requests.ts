// « Pièce sur demande » côté Worker : stockage (Durable Object RequestsDO), fichiers joints (R2 « FILES »),
// paiements Stripe (acompte puis solde), mails, relances (cron) et durées de conservation.
// Les règles (statuts, montants, délais, texte de la mention) sont dans requests-core.ts.
//
// Routes publiques (le client n'a que son lien : id D-XXXXXX + jeton secret k) :
//   GET  /requests/settings          prix « à partir de », photos des cartes, envoi de fichiers possible ou non
//   POST /requests                   formulaire -> { id, k, uploads }
//   PUT  /requests/file?id&k&name    un fichier joint (corps = le fichier) ; POST /requests/confirm { id, k } à la fin
//   POST /requests/view              { id, k } -> vue client (page « Ma demande »)
//   GET  /requests/photo?id&k&i      photo de la pièce finie ; GET /requests/card?f=… photo de carte changée dans l'admin
//   POST /requests/deposit           { id, k, accept: true } -> paiement Stripe de l'acompte
//   POST /requests/validate | /requests/retouch { text } | /requests/balance-quote { country } | /requests/balance { country }
//   POST /requests/invoice           { id, k, which: 'deposit' | 'balance' }
// Routes admin (/admin/requests…) : liste, actions, photos de la pièce finie, fichiers, réglages, suppression.
import { DurableObject } from 'cloudflare:workers';
import {
  applyAction, parseSubmission, newRequest, mergeSettings, checkSettings, priceFloors, dueStep, retention, clientView, fileKind,
  FILE_LIMITS, DRAFT_GRACE_MS, DAY, PAID_TYPES, CARD_KEYS, TYPE_LABELS, answerLines, type Settings, type Effect, natureOf,
} from './requests-core';
import { receivedEmail, newRequestAlert, quoteEmail, quoteAcceptedEmail, depositPaidEmail, validationEmail, balanceRequestEmail, replyEmail, type ReqMailCtx } from './request-emails';
import { CONTACT_EMAIL, alertList } from './emails';
import { checkTurnstile } from './turnstile';
import { quotePdf, toBase64, type QuotePdfInput } from './quote-pdf';

type JsonFn = (data: unknown, status?: number) => Response;
export interface ReqEnv {
  REQUESTS?: any; // DurableObjectNamespace<RequestsDO>
  FILES?: any; // R2 bucket (absent tant que R2 n'est pas activé : formulaire sans envoi de fichiers)
  HOLDS: { get(k: string): Promise<string | null>; put(k: string, v: string, o?: { expirationTtl?: number }): Promise<void> };
  SITE_BASE: string;
  WORKER_BASE?: string;
  MAIL_FROM?: string;
  ALERT_EMAIL?: string;
  ALERT_EMAIL_2?: string;
  RESEND_API_KEY?: string;
  TURNSTILE_SECRET?: string;
  LIVE_MODE?: string;
}
export interface ReqDeps {
  stripeKey: () => string | null;
  stripe: (key: string, method: string, path: string, params?: URLSearchParams) => Promise<{ ok: boolean; data: any }>;
  send: (from: string, to: string, subject: string, html: string, text: string, replyTo?: string, attachments?: { filename: string; content: string }[]) => Promise<boolean>;
  alert: (kind: string, subject: string, detail: string) => Promise<void>;
  shipping: (product: any, country: string) => Promise<any>;
  invoice: (sessionId: string) => Promise<{ ok: boolean; invoice?: any; error?: string; status?: number }>;
  catalog: () => Promise<any[]>;
}

// --- Durable Object : une instance (« main »), appels traités l'un après l'autre (actions atomiques) ---
export class RequestsDO extends DurableObject {
  private st() { return (this as any).ctx.storage; }
  async create(rec: any) {
    if (await this.st().get('r:' + rec.id)) return false;
    await this.st().put('r:' + rec.id, rec);
    return true;
  }
  async get(id: string) { return (await this.st().get('r:' + id)) || null; }
  async list() { return [...(await this.st().list({ prefix: 'r:' })).values()]; }
  async remove(id: string) { await this.st().delete('r:' + id); }
  // Numéro de devis DEV-AAAA-NNN (compteur de l'année civile de Paris, jamais réutilisé).
  async nextQuote(now: number) {
    const y = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric' }).format(new Date(now));
    const n = ((await this.st().get('qseq:' + y)) || 0) + 1;
    await this.st().put('qseq:' + y, n);
    return `DEV-${y}-${String(n).padStart(3, '0')}`;
  }
  // Restauration : ne recrée que les demandes absentes (jamais d'écrasement d'une demande existante).
  async restoreMissing(recs: any[]) { let n = 0; for (const r of recs) { if (r && typeof r.id === 'string' && /^[A-Za-z0-9_-]{3,40}$/.test(r.id) && !(await this.st().get('r:' + r.id))) { await this.st().put('r:' + r.id, r); n++; } } return n; }
  async settings(): Promise<Settings> { return mergeSettings(await this.st().get('settings')); }
  async setSettings(v: Settings) { await this.st().put('settings', v); }
  async act(id: string, action: string, data: any, now: number) {
    const rec = await this.st().get('r:' + id);
    if (!rec) return { ok: false, error: 'not_found', status: 404 };
    if (action === 'quote' && !rec.quoteNumber) data = { ...(data || {}), number: await this.nextQuote(now) };
    const r = applyAction(rec, action, data || {}, await this.settings(), now);
    if (r.ok) await this.st().put('r:' + id, r.rec);
    return r;
  }
}

const stub = (env: ReqEnv) => env.REQUESTS.get(env.REQUESTS.idFromName('main'));
const ID_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const isId = (id: string) => /^D-[A-Z0-9]{6}$/.test(id);
const isTok = (k: string) => /^[A-Za-z0-9_-]{32}$/.test(k);
function randomId() { const b = crypto.getRandomValues(new Uint8Array(6)); return 'D-' + [...b].map((x) => ID_CHARS[x % ID_CHARS.length]).join(''); }
function randomTok() { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, '-').replace(/\//g, '_'); }
function hex(n = 8) { return [...crypto.getRandomValues(new Uint8Array(n))].map((x) => x.toString(16).padStart(2, '0')).join(''); }
const workerBase = (env: ReqEnv, request?: Request) => (env.WORKER_BASE || (request ? new URL(request.url).origin : '')).replace(/\/$/, '');
const isTest = (env: ReqEnv) => env.LIVE_MODE !== '1';

export function mailCtx(env: ReqEnv, rec: any, wb: string): ReqMailCtx {
  const page = `${env.SITE_BASE}/demande/?id=${encodeURIComponent(rec.id)}&k=${encodeURIComponent(rec.k)}`;
  return {
    pageUrl: page, adminUrl: `${env.SITE_BASE}/admin/demandes.html?id=${encodeURIComponent(rec.id)}`, cgvUrl: `${env.SITE_BASE}/infos-conditions-generales`,
    photoUrls: rec.finals.map((_f: any, i: number) => `${wb}/requests/photo?id=${encodeURIComponent(rec.id)}&k=${encodeURIComponent(rec.k)}&i=${i}`), test: isTest(env),
  };
}

// Devis en PDF (joint au mail, téléchargeable par le client et dans l'admin).
export async function quotePdfFor(env: ReqEnv, rec: any): Promise<Uint8Array | null> {
  const q = rec.quote;
  if (!q) return null;
  const settings: any = await stub(env).settings();
  const input: QuotePdfInput = {
    lang: rec.lang === 'fr' ? 'fr' : 'en', number: q.number || rec.id, version: q.version || 1, issuedAt: q.sentAt, validUntil: q.validUntil || q.sentAt + 30 * DAY,
    seller: { address: String(settings.sellerAddress || '').trim() }, client: { name: rec.client.name, email: rec.client.email, country: rec.client.country },
    requestId: rec.id, title: q.title, lines: q.lines || [{ label: q.title, qty: 1, unit: q.total, amount: q.total }], total: q.total, deposit: q.deposit, depositPct: q.depositPct,
    vatAfter: (env as any).VAT_MENTION_2027, optionalDeposit: !!q.optionalDeposit, delay: q.delay, message: q.message || '', acceptedAt: q.acceptedAt || 0, pageUrl: mailCtx(env, rec, '').pageUrl, test: isTest(env),
  };
  return quotePdf(input);
}
const pdfName = (rec: any) => `Devis-${rec.quote.number}${rec.quote.version > 1 ? '-v' + rec.quote.version : ''}.pdf`;

// Mails et alertes produits par une action (après l'enregistrement de la demande).
export async function runEffects(env: ReqEnv, deps: ReqDeps, rec: any, effects: Effect[], wb: string) {
  const from = (env.MAIL_FROM || '').trim();
  const ctx = mailCtx(env, rec, wb);
  const settings = await stub(env).settings();
  for (const e of effects) {
    try {
      let m: { subject: string; html: string; text: string } | null = null;
      let to = rec.client.email;
      let attachments: { filename: string; content: string }[] | undefined;
      if (e.kind === 'mail:received') m = receivedEmail(rec, ctx);
      else if (e.kind === 'mail:new') { m = newRequestAlert(rec, ctx); to = alertList(env); }
      else if (e.kind === 'mail:quote' || e.kind === 'mail:quoteReminder') {
        m = quoteEmail(rec, ctx, e.kind === 'mail:quoteReminder');
        const pdf = await quotePdfFor(env, rec);
        if (pdf) attachments = [{ filename: pdfName(rec), content: toBase64(pdf) }];
      } else if (e.kind === 'mail:quoteAccepted') m = quoteAcceptedEmail(rec, ctx);
      else if (e.kind === 'mail:depositPaid') m = depositPaidEmail(rec, ctx);
      else if (e.kind === 'mail:validation' || e.kind === 'mail:validationReminder') {
        const left = Math.max(0, settings.retouchesIncluded - (rec.validation?.retouchesUsed || 0));
        m = validationEmail(rec, ctx, { retouchesLeft: left, forfeitDays: settings.forfeitDays }, e.kind === 'mail:validationReminder');
      } else if (e.kind === 'mail:balanceRequest') { m = balanceRequestEmail(rec, ctx);
      } else if (e.kind === 'mail:reply') m = replyEmail(rec, ctx, e.data.subject, e.data.message);
      else if (e.kind === 'alert') { await deps.alert(`req:${rec.id}:${e.data.subject}`, e.data.subject, `${e.data.detail}\n\nAdmin : ${ctx.adminUrl}`); continue; }
      else if (e.kind === 'deleteFile') { if (env.FILES) await env.FILES.delete(e.data.key); continue; }
      if (!m) continue;
      if (!env.RESEND_API_KEY || !from || !to) continue;
      const ok = await deps.send(from, to, m.subject, m.html, m.text, CONTACT_EMAIL, attachments);
      if (!ok) await deps.alert(`req-mail:${rec.id}:${e.kind}`, `Un mail de demande n'est pas parti (${rec.id})`, `Type : ${e.kind}\nDestinataire : ${to}\nResend a refusé l'envoi.`);
    } catch (err: any) {
      await deps.alert(`req-fx:${rec.id}:${e.kind}`, `Erreur sur la demande ${rec.id}`, String(err && err.stack ? err.stack : err).slice(0, 1200));
    }
  }
}

async function act(env: ReqEnv, deps: ReqDeps, id: string, action: string, data: any, wb: string) {
  const r = await stub(env).act(id, action, data, Date.now());
  if (r.ok && r.effects.length) await runEffects(env, deps, r.rec, r.effects, wb);
  return r;
}

async function allow(env: ReqEnv, key: string, max: number, ttl: number) {
  const n = Number(await env.HOLDS.get(key)) || 0;
  if (n >= max) return false;
  await env.HOLDS.put(key, String(n + 1), { expirationTtl: Math.max(60, ttl) });
  return true;
}

// Demande du client, retrouvée par son lien (id + jeton). Même réponse pour « inconnue » et « mauvais jeton ».
async function own(env: ReqEnv, id: string, k: string) {
  if (!isId(id) || !isTok(k)) return null;
  const rec = await stub(env).get(id);
  if (!rec) return null;
  let diff = rec.k.length ^ k.length;
  for (let i = 0; i < Math.min(rec.k.length, k.length); i++) diff |= rec.k.charCodeAt(i) ^ k.charCodeAt(i);
  return diff === 0 ? rec : null;
}

function cardUrl(env: ReqEnv, wb: string, v: string) {
  if (v.startsWith('card:')) return `${wb}/requests/card?f=${encodeURIComponent(v.slice(5))}`;
  if (v.startsWith('/')) return env.SITE_BASE.replace(/\/$/, '') + v;
  return v;
}

// --- Stripe ---------------------------------------------------------------------------------------
async function depositCheckout(env: ReqEnv, deps: ReqDeps, rec: any, key: string) {
  const q = rec.quote, fr = rec.lang === 'fr';
  if (rec.deposit && rec.deposit.session) { // un seul paiement d'acompte ouvert à la fois
    const old = await deps.stripe(key, 'GET', `/v1/checkout/sessions/${rec.deposit.session}`);
    if (old.ok && old.data.payment_status === 'paid') return { paidAlready: true };
    if (old.ok && old.data.status === 'open') await deps.stripe(key, 'POST', `/v1/checkout/sessions/${rec.deposit.session}/expire`, new URLSearchParams());
  }
  const page = mailCtx(env, rec, '').pageUrl;
  const p = new URLSearchParams();
  p.set('mode', 'payment');
  p.set('locale', fr ? 'fr' : 'en');
  p.set('customer_email', rec.client.email);
  p.set('billing_address_collection', 'required');
  p.set('success_url', page + '&paid=deposit');
  p.set('cancel_url', page);
  p.set('expires_at', String(Math.floor(Date.now() / 1000) + 60 * 60));
  p.set('line_items[0][quantity]', '1');
  p.set('line_items[0][price_data][currency]', 'eur');
  p.set('line_items[0][price_data][unit_amount]', String(Math.round(q.deposit * 100)));
  p.set('line_items[0][price_data][product_data][name]', (fr ? `Acompte ${q.depositPct} % · ` : `Deposit ${q.depositPct}% · `) + q.title);
  p.set('line_items[0][price_data][product_data][description]', fr ? `Demande ${rec.id} · devis ${q.number || ''} · prix total ${q.total} €` : `Request ${rec.id} · quote ${q.number || ''} · total price €${q.total}`);
  p.set('custom_text[submit][message]', q.optionalDeposit ? (fr ? 'Acompte facultatif, non remboursable une fois le travail commencé (sauf refus ou abandon par vgthmind).' : 'Optional deposit, non-refundable once work has started (unless vgthmind declines or abandons the order).') : (fr ? 'Acompte (et non arrhes) : commande ferme. Pièce personnalisée : pas de droit de rétractation.' : 'Deposit ("acompte", not "arrhes"): firm order. Personalised piece: no right of withdrawal.'));
  const meta: Record<string, string> = { vg: '1', kind: 'deposit', nature: natureOf(rec), request: rec.id, total: String(q.total), pct: String(q.depositPct), title: q.title.slice(0, 400), quote: String(q.number || '') };
  for (const [k, v] of Object.entries(meta)) { p.set(`metadata[${k}]`, v); p.set(`payment_intent_data[metadata][${k}]`, v); }
  const r = await deps.stripe(key, 'POST', '/v1/checkout/sessions', p);
  if (!r.ok) return { error: r.data.error?.message || 'Erreur Stripe' };
  await stub(env).act(rec.id, 'depositSession', { session: r.data.id }, Date.now());
  return { url: r.data.url };
}

function balanceProduct(rec: any) {
  return { permalink: 'demande-' + rec.id, price: rec.quote.total, weight_g: rec.quote.weight_g, mode: 'colis', alone: false, shipping_derived: true, shipping: [] };
}

async function balanceCheckout(env: ReqEnv, deps: ReqDeps, rec: any, key: string, country: string) {
  const q = rec.quote, fr = rec.lang === 'fr';
  const ship = await deps.shipping(balanceProduct(rec), country);
  if (!ship.ok) return { error: ship.message || 'Pays non livré.', code: ship.error };
  if (rec.balance && rec.balance.session) {
    const old = await deps.stripe(key, 'GET', `/v1/checkout/sessions/${rec.balance.session}`);
    if (old.ok && old.data.payment_status === 'paid') return { paidAlready: true };
    if (old.ok && old.data.status === 'open') await deps.stripe(key, 'POST', `/v1/checkout/sessions/${rec.balance.session}/expire`, new URLSearchParams());
  }
  const depInvoice = rec.deposit.session ? await deps.invoice(rec.deposit.session).catch(() => null) : null;
  const balance = Math.round((q.total - q.deposit) * 100);
  const p = new URLSearchParams();
  p.set('mode', 'payment');
  p.set('locale', fr ? 'fr' : 'en');
  p.set('customer_email', rec.client.email);
  p.set('success_url', `${env.SITE_BASE}/merci/?session_id={CHECKOUT_SESSION_ID}`);
  p.set('cancel_url', mailCtx(env, rec, '').pageUrl);
  p.set('expires_at', String(Math.floor(Date.now() / 1000) + 60 * 60));
  p.set('phone_number_collection[enabled]', 'true');
  p.set('line_items[0][quantity]', '1');
  p.set('line_items[0][price_data][currency]', 'eur');
  p.set('line_items[0][price_data][unit_amount]', String(balance));
  p.set('line_items[0][price_data][product_data][name]', (fr ? 'Solde · ' : 'Balance · ') + q.title);
  p.set('line_items[0][price_data][product_data][description]', fr ? `Demande ${rec.id} · prix total ${q.total} €, acompte de ${q.deposit} € déduit` : `Request ${rec.id} · total price €${q.total}, €${q.deposit} deposit deducted`);
  p.set('line_items[0][price_data][product_data][metadata][request]', rec.id);
  p.set('shipping_address_collection[allowed_countries][0]', country);
  p.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
  p.set('shipping_options[0][shipping_rate_data][display_name]', country === 'FR' ? 'Livraison France' : 'Livraison internationale');
  p.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(ship.cents));
  p.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'eur');
  const meta: Record<string, string> = {
    vg: '1', kind: 'balance', nature: natureOf(rec), request: rec.id, total: String(q.total), deposit: String(q.deposit), deposit_session: String(rec.deposit.session || ''),
    deposit_invoice: depInvoice && depInvoice.ok ? String(depInvoice.invoice.number) : '', deposit_date: String(Math.floor((rec.deposit.paidAt || Date.now()) / 1000)),
    title: q.title.slice(0, 400), country,
  };
  for (const [k, v] of Object.entries(meta)) { p.set(`metadata[${k}]`, v); p.set(`payment_intent_data[metadata][${k}]`, v); }
  const r = await deps.stripe(key, 'POST', '/v1/checkout/sessions', p);
  if (!r.ok) return { error: r.data.error?.message || 'Erreur Stripe' };
  await stub(env).act(rec.id, 'balanceSession', { session: r.data.id, shipping: ship.cents / 100, country }, Date.now());
  return { url: r.data.url };
}

// Paiement Stripe d'une demande (webhook, page de la demande ou page Merci) : idempotent.
export async function onRequestPaid(env: ReqEnv, deps: ReqDeps, s: any, wb: string) {
  const meta = s.metadata || {};
  if (!isId(String(meta.request || '')) || s.payment_status !== 'paid' || !env.REQUESTS) return;
  if (meta.kind === 'deposit') await act(env, deps, meta.request, 'depositPaid', { session: s.id, amount: (s.amount_total || 0) / 100 }, wb);
  if (meta.kind === 'balance') {
    await act(env, deps, meta.request, 'balancePaid', { session: s.id, amount: (s.amount_total || 0) / 100, shipping: (s.shipping_cost?.amount_total || 0) / 100 }, wb);
    await env.HOLDS.put('reqsess:' + s.id, meta.request);
  }
}

// Commande expédiée (onglet Commandes) : la demande liée passe en « Envoyée ».
export async function onShipped(env: ReqEnv, deps: ReqDeps, sessionId: string, tracking: string, wb: string) {
  const id = await env.HOLDS.get('reqsess:' + sessionId);
  if (id && env.REQUESTS) await act(env, deps, id, 'shipped', { tracking }, wb);
}

// Lignes de facture d'un paiement de demande (acompte ou solde), à partir de la session Stripe seule
// (les factures restent justes même après l'effacement de la demande).
export function requestInvoiceParts(s: any, depositInvoiceNumber: string) {
  const m = s.metadata || {};
  const total = Number(m.total) || 0;
  const paid = (s.amount_total || 0) / 100;
  const shipping = (s.shipping_cost?.amount_total || 0) / 100;
  if (m.kind === 'deposit') {
    const pct = Number(m.pct) || 0;
    return {
      title: 'Facture d’acompte', titleEn: 'Deposit invoice',
      lines: [{ name: `Acompte de ${pct} % sur commande personnalisée : ${m.title} (demande ${m.request})`, qty: 1, unit: paid, amount: paid }],
      deductions: [],
      notes: [`Acompte (et non arrhes, article L214-1 du Code de la consommation) à valoir sur le prix total de ${total.toFixed(2).replace('.', ',')} €. Solde de ${(total - paid).toFixed(2).replace('.', ',')} € (+ port) à régler après validation de la pièce sur photos, avant l’envoi.`,
        'Pièce personnalisée : pas de droit de rétractation (article L221-28 3° du Code de la consommation).'],
      ref: String(m.request),
    };
  }
  const dep = Number(m.deposit) || 0;
  const depDate = m.deposit_date ? new Date(Number(m.deposit_date) * 1000).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : '';
  return {
    title: 'Facture', titleEn: 'Invoice',
    lines: [{ name: `Pièce personnalisée : ${m.title} (demande ${m.request})`, qty: 1, unit: total, amount: total }],
    deductions: [{ label: `Acompte déjà versé${depDate ? ' le ' + depDate : ''}${depositInvoiceNumber ? ' (facture ' + depositInvoiceNumber + ')' : ''}`, amount: dep }],
    notes: [`Prix total ${total.toFixed(2).replace('.', ',')} € − acompte ${dep.toFixed(2).replace('.', ',')} € = solde ${(total - dep).toFixed(2).replace('.', ',')} €${shipping ? ` + livraison ${shipping.toFixed(2).replace('.', ',')} €` : ''}.`],
    ref: '',
  };
}

// --- Sauvegarde nocturne des demandes (KV « rbackup:<date> », 30 jours : même durée que le plus court délai de conservation, pas de données gardées au-delà) ---
const RBACKUP_DAYS = 30;
export async function backupRequests(env: ReqEnv) {
  if (!env.REQUESTS) return { ok: false, count: 0 };
  const S = stub(env), date = new Date().toISOString().slice(0, 10);
  const list = (await S.list()).filter((r: any) => r.status !== 'brouillon');
  const value = JSON.stringify({ date, requests: list, settings: await S.settings() });
  await env.HOLDS.put(`rbackup:${date}`, value, { expirationTtl: RBACKUP_DAYS * 86400 });
  await env.HOLDS.put('rbackup:latest', value, { expirationTtl: RBACKUP_DAYS * 86400 });
  return { ok: true, date, count: list.length };
}

// --- Routes ---------------------------------------------------------------------------------------
export async function requestRoutes(request: Request, env: ReqEnv, deps: ReqDeps, path: string, json: JsonFn, isAdmin: boolean): Promise<Response | null> {
  const isPublic = path === '/requests' || path.startsWith('/requests/');
  const isAdm = path === '/admin/requests' || path.startsWith('/admin/requests/');
  if (!isPublic && !isAdm) return null;
  if (!env.REQUESTS) return json({ error: 'unavailable' }, 503);
  const wb = workerBase(env, request);
  const url = new URL(request.url);
  const q = (k: string) => String(url.searchParams.get(k) || '');
  const body = async () => (request.method === 'POST' ? ((await request.json().catch(() => null)) as any) || {} : {});
  const ip = request.headers.get('CF-Connecting-IP') || 'x';

  if (isAdm) {
    if (!isAdmin) return json({ error: 'Non autorisé.' }, 401);
    const S = stub(env);
    if (path === '/admin/requests/backups' && request.method === 'GET') {
      const l = await (env.HOLDS as any).list({ prefix: 'rbackup:' });
      return json({ backups: l.keys.map((k: any) => k.name).sort().reverse() });
    }
    if (path === '/admin/requests/backup' && request.method === 'GET') {
      const k = q('key') || 'rbackup:latest';
      if (!/^rbackup:[\w-]+$/.test(k)) return json({ error: 'Clé invalide.' }, 400);
      const v = await env.HOLDS.get(k);
      return v ? new Response(v, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } }) : json({ error: 'Introuvable.' }, 404);
    }
    if (path === '/admin/requests/backup' && request.method === 'POST') return json(await backupRequests(env));
    if (path === '/admin/requests/restore' && request.method === 'POST') {
      const b = await body();
      if (!b || !Array.isArray(b.requests)) return json({ error: 'Fichier invalide.' }, 400);
      return json({ ok: true, restored: await S.restoreMissing(b.requests) });
    }
    if (path === '/admin/requests' && request.method === 'GET') {
      const list = (await S.list()).filter((r: any) => r.status !== 'brouillon' || Date.now() - r.created > 5 * 60 * 1000);
      list.sort((a: any, b: any) => b.updated - a.updated);
      for (const r of list) { r.typeLabel = TYPE_LABELS[r.type] || r.type; r.answers = answerLines(r, 'fr'); r.pageUrl = mailCtx(env, r, wb).pageUrl; if (r.balance && r.balance.session) r.orderRef = (await env.HOLDS.get('sref:' + r.balance.session)) || ''; }
      return json({ requests: list, settings: await S.settings(), uploads: !!env.FILES, siteBase: env.SITE_BASE });
    }
    if (path === '/admin/requests/act' && request.method === 'POST') {
      const b = await body();
      const allowed = ['status', 'notes', 'quote', 'cancelQuote', 'sendValidation', 'requestBalance', 'reply', 'removeFinal'];
      if (!isId(String(b.id || '')) || !allowed.includes(b.action)) return json({ error: 'Requête invalide.' }, 400);
      if (b.action === 'reply' && (!env.RESEND_API_KEY || !env.MAIL_FROM)) return json({ error: "Envoi d'email non configuré." }, 503);
      const r = await act(env, deps, b.id, b.action, b, wb);
      if (r.ok) Object.assign(r.rec, { typeLabel: TYPE_LABELS[r.rec.type] || r.rec.type, answers: answerLines(r.rec, 'fr'), pageUrl: mailCtx(env, r.rec, wb).pageUrl });
      return r.ok ? json({ ok: true, request: r.rec }) : json({ error: r.error }, r.status || 400);
    }
    if (path === '/admin/requests/quote.pdf' && request.method === 'GET') {
      const rec = isId(q('id')) ? await S.get(q('id')) : null;
      const pdf = rec ? await quotePdfFor(env, rec) : null;
      return pdf ? new Response(pdf, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${pdfName(rec)}"`, 'Cache-Control': 'private, no-store', 'Access-Control-Allow-Origin': '*' } }) : json({ error: 'Aucun devis.' }, 404);
    }
    if (path === '/admin/requests/final' && request.method === 'PUT') {
      if (!env.FILES) return json({ error: 'Stockage des fichiers (R2) pas encore activé.' }, 503);
      const id = q('id'), type = String(request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(), size = Number(request.headers.get('content-length')) || 0;
      if (!isId(id) || fileKind(type) !== 'photo' || !(size > 0) || size > FILE_LIMITS.photoBytes) return json({ error: 'Photo seulement (JPEG, PNG, WebP, HEIC), 10 Mo maximum.' }, 400);
      const key = `req/${id}/final-${hex()}`;
      await env.FILES.put(key, request.body, { httpMetadata: { contentType: type } });
      const r = await stub(env).act(id, 'addFinal', { key, name: q('name'), type, size }, Date.now());
      if (!r.ok) { await env.FILES.delete(key); return json({ error: r.error }, r.status || 400); }
      Object.assign(r.rec, { typeLabel: TYPE_LABELS[r.rec.type] || r.rec.type, answers: answerLines(r.rec, 'fr'), pageUrl: mailCtx(env, r.rec, wb).pageUrl });
      return json({ ok: true, request: r.rec });
    }
    if (path === '/admin/requests/file' && request.method === 'GET') {
      const id = q('id'), key = q('key');
      if (!env.FILES || !isId(id) || !key.startsWith(`req/${id}/`)) return json({ error: 'Introuvable.' }, 404);
      const obj = await env.FILES.get(key);
      if (!obj) return json({ error: 'Fichier effacé ou introuvable.' }, 404);
      return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'private, no-store', 'Access-Control-Allow-Origin': '*' } });
    }
    if (path === '/admin/requests/delete' && request.method === 'POST') {
      const b = await body();
      const rec = isId(String(b.id || '')) ? await S.get(b.id) : null;
      if (!rec) return json({ error: 'Introuvable.' }, 404);
      if (env.FILES) for (const f of [...rec.files, ...rec.finals]) await env.FILES.delete(f.key);
      await S.remove(rec.id);
      return json({ ok: true });
    }
    if (path === '/admin/requests/settings' && request.method === 'GET') {
      let floors = {};
      try { floors = priceFloors(await deps.catalog()); } catch (e) {}
      return json({ settings: await S.settings(), floors, cardKeys: CARD_KEYS });
    }
    if (path === '/admin/requests/settings' && request.method === 'POST') {
      const b = await body();
      let floors = {};
      try { floors = priceFloors(await deps.catalog()); } catch (e) { return json({ error: 'Catalogue indisponible : impossible de vérifier les prix boutique.' }, 502); }
      const r = checkSettings(b.settings, floors);
      if (!r.ok) return json({ error: r.errors.join(' · '), errors: r.errors }, 400);
      await S.setSettings(r.value);
      return json({ ok: true, settings: r.value, floors });
    }
    if (path === '/admin/requests/card' && request.method === 'PUT') {
      if (!env.FILES) return json({ error: 'Stockage des fichiers (R2) pas encore activé.' }, 503);
      const c = q('c'), type = String(request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(), size = Number(request.headers.get('content-length')) || 0;
      if (!CARD_KEYS.includes(c) || !['image/jpeg', 'image/png', 'image/webp'].includes(type) || !(size > 0) || size > 3 * 1024 * 1024) return json({ error: 'Photo JPEG, PNG ou WebP, 3 Mo maximum (une photo de 1200 px de large suffit).' }, 400);
      const h = hex();
      await env.FILES.put(`cards/${c}/${h}`, request.body, { httpMetadata: { contentType: type } });
      return json({ ok: true, value: `card:${c}:${h}`, url: `${wb}/requests/card?f=${encodeURIComponent(c + ':' + h)}` });
    }
    return json({ error: 'Not found' }, 404);
  }

  // --- Public ---
  const S = stub(env);
  if (path === '/requests/settings' && request.method === 'GET') {
    const s = await S.settings();
    const cards: Record<string, string> = {};
    for (const [k, v] of Object.entries(s.cards || {})) if (v) cards[k] = cardUrl(env, wb, v);
    return new Response(JSON.stringify({ prices: s.prices, depositPct: s.depositPct, retouchesIncluded: s.retouchesIncluded, forfeitDays: s.forfeitDays, leadWeeks: s.leadWeeks, cards, uploads: !!env.FILES, limits: FILE_LIMITS }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60', 'Access-Control-Allow-Origin': '*' },
    });
  }
  if (path === '/requests/card' && request.method === 'GET') {
    const m = /^([a-z.]+):([a-f0-9]{8,32})$/.exec(q('f'));
    if (!env.FILES || !m || !CARD_KEYS.includes(m[1])) return new Response('Not found', { status: 404 });
    const obj = await env.FILES.get(`cards/${m[1]}/${m[2]}`);
    if (!obj) return new Response('Not found', { status: 404 });
    return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable', 'Access-Control-Allow-Origin': '*' } });
  }
  if (path === '/requests' && request.method === 'POST') {
    const b = await body();
    // Robots : champ piège rempli ou formulaire rempli en moins de 3 s -> « ok » sans rien enregistrer.
    if (String(b.website || '').trim() || !Number.isFinite(Number(b.t)) || Number(b.t) < 3000) return json({ ok: true, id: 'D-000000', k: '0'.repeat(32), uploads: false });
    if (!(await checkTurnstile(env.TURNSTILE_SECRET, b.cf, ip))) return json({ error: 'captcha' }, 403);
    const v = parseSubmission(b, (await S.settings()).leadWeeks);
    if (!v.ok) return json({ error: 'invalid', fields: v.fields }, 400);
    const hour = Math.floor(Date.now() / 3600000), day = Math.floor(Date.now() / 86400000);
    if (!(await allow(env, `rl:req:${ip}:${hour}`, 3, 3700)) || !(await allow(env, `rl:req:day:${day}`, 30, 90000))) return json({ error: 'rate_limited' }, 429);
    let rec: any = null;
    for (let i = 0; i < 5 && !rec; i++) { const c = newRequest(v.value, randomId(), randomTok(), Date.now()); if (await S.create(c)) rec = c; }
    if (!rec) return json({ error: 'busy' }, 503);
    return json({ ok: true, id: rec.id, k: rec.k, uploads: !!env.FILES, limits: FILE_LIMITS });
  }
  if (path === '/requests/file' && request.method === 'PUT') {
    const rec = await own(env, q('id'), q('k'));
    if (!rec) return json({ error: 'not_found' }, 404);
    if (!env.FILES) return json({ error: 'uploads_off' }, 503);
    const type = String(request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(), size = Number(request.headers.get('content-length')) || 0;
    const kind = fileKind(type);
    if (!kind) return json({ error: 'type' }, 415);
    if (!(size > 0) || size > (kind === 'photo' ? FILE_LIMITS.photoBytes : FILE_LIMITS.videoBytes)) return json({ error: 'limit' }, 413);
    if (!(await allow(env, `rl:reqfile:${rec.id}`, FILE_LIMITS.photos + FILE_LIMITS.videos + 4, 7200))) return json({ error: 'limit' }, 429);
    const key = `req/${rec.id}/${kind}-${hex()}`;
    await env.FILES.put(key, request.body, { httpMetadata: { contentType: type } });
    const r = await S.act(rec.id, 'addFile', { key, name: q('name'), type, size }, Date.now());
    if (!r.ok) { await env.FILES.delete(key); return json({ error: r.error }, r.status || 400); }
    return json({ ok: true, files: r.rec.files.length });
  }
  if (path === '/requests/photo' && request.method === 'GET') {
    const rec = await own(env, q('id'), q('k'));
    const f = rec && rec.finals[Number(q('i'))];
    if (!f || !env.FILES) return new Response('Not found', { status: 404 });
    const obj = await env.FILES.get(f.key);
    if (!obj) return new Response('Not found', { status: 404 });
    return new Response(obj.body, { headers: { 'Content-Type': f.type || 'image/jpeg', 'Cache-Control': 'private, max-age=3600', 'Access-Control-Allow-Origin': '*' } });
  }
  if (path === '/requests/quote.pdf' && request.method === 'GET') {
    const rec = await own(env, q('id'), q('k'));
    const pdf = rec ? await quotePdfFor(env, rec) : null;
    return pdf ? new Response(pdf, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${pdfName(rec)}"`, 'Cache-Control': 'private, no-store', 'Access-Control-Allow-Origin': '*' } }) : new Response('Not found', { status: 404 });
  }
  if (!path.startsWith('/requests/') || request.method !== 'POST') return null;
  const b = await body();
  const rec = await own(env, String(b.id || ''), String(b.k || ''));
  if (!rec) return json({ error: 'not_found' }, 404);
  if (!(await allow(env, `rl:reqact:${ip}`, 60, 900))) return json({ error: 'rate_limited' }, 429);
  const settings = await S.settings();
  const key = deps.stripeKey();

  if (path === '/requests/confirm') {
    const r = await act(env, deps, rec.id, 'confirm', {}, wb);
    return r.ok ? json({ ok: true }) : json({ error: r.error }, r.status || 400);
  }
  if (path === '/requests/view') {
    let cur = rec;
    // Filet de sécurité si le webhook tarde : l'état du paiement est relu chez Stripe (jamais cru du navigateur).
    if (key && cur.status === 'devis' && cur.deposit && cur.deposit.session && !cur.deposit.paidAt) {
      const s = await deps.stripe(key, 'GET', `/v1/checkout/sessions/${cur.deposit.session}`);
      if (s.ok && s.data.payment_status === 'paid') { await onRequestPaid(env, deps, s.data, wb); cur = (await S.get(rec.id)) || cur; }
    }
    return json({ ok: true, request: clientView(cur, settings), payments: !!key });
  }
  if (path === '/requests/accept') { // location / collab : le client accepte le devis (l'acompte facultatif se paie ensuite via /requests/deposit)
    const r = await act(env, deps, rec.id, 'acceptQuote', { accept: b.accept === true, ip }, wb);
    return r.ok ? json({ ok: true, request: clientView(r.rec, settings) }) : json({ error: r.error }, r.status || 400);
  }
  if (path === '/requests/deposit') {
    if (!key) return json({ error: 'payments_off' }, 503);
    const r = await stub(env).act(rec.id, 'acceptDeposit', { accept: b.accept === true, ip }, Date.now());
    if (!r.ok) return json({ error: r.error }, r.status || 400);
    const out = await depositCheckout(env, deps, r.rec, key);
    return out.url ? json({ url: out.url }) : json({ error: out.error || 'already_paid' }, out.paidAlready ? 409 : 502);
  }
  if (path === '/requests/validate') {
    const r = await act(env, deps, rec.id, 'validate', {}, wb);
    return r.ok ? json({ ok: true, request: clientView(r.rec, settings) }) : json({ error: r.error }, r.status || 400);
  }
  if (path === '/requests/retouch') {
    const r = await act(env, deps, rec.id, 'retouch', { text: b.text }, wb);
    return r.ok ? json({ ok: true, extra: !!(r.info && r.info.extra), request: clientView(r.rec, settings) }) : json({ error: r.error }, r.status || 400);
  }
  if (path === '/requests/balance-quote' || path === '/requests/balance') {
    if (rec.status !== 'validation' || !rec.validation || !rec.validation.validatedAt || !rec.quote) return json({ error: 'not_validated' }, 409);
    const country = /^[A-Za-z]{2}$/.test(String(b.country || '')) ? String(b.country).toUpperCase() : '';
    if (!country) return json({ error: 'country_required' }, 400);
    if (path === '/requests/balance-quote') {
      const ship = await deps.shipping(balanceProduct(rec), country);
      return ship.ok ? json({ ok: true, shipping: ship.cents / 100, balance: Math.round((rec.quote.total - rec.quote.deposit) * 100) / 100, free: !!ship.free }) : json({ ok: false, error: ship.error, message: ship.message });
    }
    if (!key) return json({ error: 'payments_off' }, 503);
    const out = await balanceCheckout(env, deps, rec, key, country);
    return out.url ? json({ url: out.url }) : json({ error: out.error || 'already_paid', code: (out as any).code }, out.paidAlready ? 409 : 400);
  }
  if (path === '/requests/invoice') {
    const sess = b.which === 'balance' ? rec.balance?.paidAt && rec.balance.session : rec.deposit?.paidAt && rec.deposit.session;
    if (!sess) return json({ error: 'not_paid' }, 404);
    const r = await deps.invoice(sess);
    return r.ok ? json({ ok: true, invoice: r.invoice }) : json({ error: r.error }, r.status || 502);
  }
  return null;
}

// --- Cron (toutes les heures) : formulaires restés en cours d'envoi, relances, alertes, conservation ---
export async function requestsCron(env: ReqEnv, deps: ReqDeps) {
  if (!env.REQUESTS) return;
  const S = stub(env), now = Date.now(), wb = workerBase(env);
  const settings = await S.settings();
  for (const rec of await S.list()) {
    try {
      if (rec.status === 'brouillon') { if (now - rec.created > DRAFT_GRACE_MS) await act(env, deps, rec.id, 'confirm', {}, wb); continue; }
      const due = dueStep(rec, settings, now);
      if (due) await act(env, deps, rec.id, 'reminder', due, wb);
      const keep = retention(rec, now);
      if (keep.deleteFiles.length && env.FILES) for (const k of keep.deleteFiles) await env.FILES.delete(k);
      if (keep.deleteAll) await S.remove(rec.id);
      else if (keep.deleteFiles.length) await S.act(rec.id, 'filesPurged', { keys: keep.deleteFiles }, now);
    } catch (e: any) {
      await deps.alert('req-cron:' + rec.id, `Relance automatique en erreur (${rec.id})`, String(e && e.stack ? e.stack : e).slice(0, 1200));
    }
  }
}
