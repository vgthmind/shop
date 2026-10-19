// Usage : node outils/worker-local.mjs   (puis construire le site avec CF_PAGES=1 OUT_DIR=<dossier>, le servir sur le port 8796 avec les adresses du Worker
// remplacées par http://localhost:8787 ; voir ETAT-DETAIL.md). Pages de paiement : http://localhost:8787/mock/stripe/<session> ; état : /mock/state.
// Worker RÉEL (checkout-worker/index.ts) lancé en local, en mémoire : faux Stripe (mode test), faux Resend, faux KV / Durable Objects / R2.
// Rien n'est envoyé à Cloudflare, Stripe ni Resend. Le site local (port 8796) parle à ce Worker (port 8787).
import { register } from 'node:module';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const hooks = `
export async function resolve(spec, ctx, next) { if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject {}', shortCircuit: true }; if (/^[.]{1,2}[/]/.test(spec) && !/[.][a-z]+$/.test(spec)) return next(spec + '.ts', ctx); return next(spec, ctx); }`;
register('data:text/javascript,' + encodeURIComponent(hooks));

const ROOT = new URL('../', import.meta.url).href.replace('file:///', '');
const SITE = process.env.SITE || 'http://localhost:8796';
const PORT = 8787, WORKER = 'http://localhost:' + PORT;
const WH = 'whsec_local';
const mod = await import(new URL('../checkout-worker/index.ts', import.meta.url).href);
const worker = mod.default;
const config = JSON.parse(readFileSync(new URL('../admin/shipping-config.json', import.meta.url), 'utf8'));

const fakeStorage = () => { const m = new Map(); return { get: async (k) => m.get(k), put: async (k, v) => { m.set(k, v); }, delete: async (k) => m.delete(k), list: async ({ prefix }) => new Map([...m].filter(([k]) => k.startsWith(prefix))), _m: m }; };
const queued = (raw) => { let q = Promise.resolve(); return new Proxy(raw, { get: (o, k) => (typeof o[k] === 'function' ? (...a) => { const r = q.then(() => o[k](...a)); q = r.catch(() => {}); return r; } : o[k]) }); };
const mkDO = (Cls) => { const raw = new Cls(); raw.ctx = { storage: fakeStorage() }; return queued(raw); };
const kvm = new Map();
const HOLDS = { get: async (k) => (k === 'shipping:config' ? JSON.stringify(config) : kvm.has(k) ? kvm.get(k) : null), put: async (k, v) => { kvm.set(k, v); }, delete: async (k) => { kvm.delete(k); }, list: async ({ prefix = '' } = {}) => ({ keys: [...kvm.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }) };
const files = new Map();
const FILES = { put: async (k, body, o) => { const buf = Buffer.from(await new Response(body).arrayBuffer()); files.set(k, { buf, type: o?.httpMetadata?.contentType }); }, get: async (k) => { const f = files.get(k); return f ? { body: f.buf, httpMetadata: { contentType: f.type }, size: f.buf.length } : null; }, delete: async (k) => { files.delete(k); }, list: async () => ({ objects: [] }) };
const stockDO = mkDO(mod.StockDO), reqDO = mkDO(mod.RequestsDO);
const env = {
  STRIPE_SECRET_KEY: 'rk_test_local', STRIPE_WEBHOOK_SECRET: WH, SITE_BASE: SITE, CATALOG_BASE: SITE, ALLOWED_ORIGIN: SITE, ADMIN_GITHUB_LOGIN: 'x',
  RESEND_API_KEY: 're_local', ALERT_EMAIL: 'vendeur@example.com', MAIL_FROM: 'vgthmind <commande@vgthmind.org>', LIVE_MODE: '0', WORKER_BASE: WORKER,
  HOLDS, STOCK: { idFromName: () => 'main', get: () => stockDO }, REQUESTS: { idFromName: () => 'main', get: () => reqDO }, FILES,
};
const ctx = { waitUntil: () => {} };

// --- faux Stripe / Resend ---
const sessions = new Map(), mails = [], created = [], refunds = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opt = {}) => {
  url = String(url);
  if (url === 'https://api.resend.com/emails') { mails.push(JSON.parse(opt.body)); return new Response('{"id":"mail_1"}'); }
  if (url === 'https://api.stripe.com/v1/refunds') { refunds.push(Object.fromEntries(new URLSearchParams(opt.body))); return new Response(JSON.stringify({ id: 're_1' })); }
  const m = /^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions(?:\/([^/?]+))?(\/expire)?/.exec(url);
  if (m) {
    if (!m[1] && opt.method === 'POST') {
      const id = 'cs_test_' + (sessions.size + 1) + 'local'.padEnd(12, 'x');
      const b = new URLSearchParams(opt.body); created.push(Object.fromEntries(b));
      const meta = Object.fromEntries([...b].filter(([k]) => k.startsWith('metadata[')).map(([k, v]) => [k.slice(9, -1), v]));
      sessions.set(id, { id, status: 'open', payment_status: 'unpaid', livemode: false, currency: 'eur', metadata: meta, params: b });
      return new Response(JSON.stringify({ id, url: WORKER + '/mock/stripe/' + id }));
    }
    if (!m[1] && /payment_intent=/.test(url)) return new Response(JSON.stringify({ data: [...sessions.values()].filter((x) => x.full && url.includes(x.full.payment_intent)).map((x) => x.full) }));
    if (m[1] && m[2]) { sessions.get(m[1]).status = 'expired'; return new Response('{}'); }
    if (m[1]) { const s = sessions.get(m[1]); if (!s) return new Response('{}', { status: 404 }); return new Response(JSON.stringify(s.full || s)); }
  }
  if (url.startsWith('https://api.stripe.com/')) return new Response(JSON.stringify({ error: { message: 'faux Stripe : non géré ' + url } }), { status: 404 });
  return realFetch(url, opt);
};

async function markPaid(id, country, method) {
  const s = sessions.get(id), b = s.params;
  const lines = []; for (let i = 0; b.has(`line_items[${i}][price_data][unit_amount]`); i++) lines.push({ description: b.get(`line_items[${i}][price_data][product_data][name]`), quantity: Number(b.get(`line_items[${i}][quantity]`) || 1), amount_total: Number(b.get(`line_items[${i}][price_data][unit_amount]`)) * Number(b.get(`line_items[${i}][quantity]`) || 1), price: { product: { metadata: { slug: b.get(`line_items[${i}][price_data][product_data][metadata][slug]`) }, images: [] } } });
  const ship = Number(b.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]') || 0);
  const total = lines.reduce((a, l) => a + l.amount_total, 0) + ship;
  s.status = 'complete'; s.payment_status = 'paid';
  s.full = { id, status: 'complete', payment_status: 'paid', livemode: false, currency: 'eur', metadata: s.metadata, amount_total: total, shipping_cost: { amount_total: ship }, total_details: { amount_discount: 0 },
    customer_details: { email: 'client@example.com', name: 'Alex Test', address: { country } },
    collected_information: { shipping_details: { name: 'Alex Test', address: { line1: '1 rue Test', city: country === 'BE' ? 'Bruxelles' : 'Lille', postal_code: country === 'BE' ? '1000' : '59000', country } } },
    payment_intent: 'pi_' + id, payment_method_types: [method], line_items: { data: lines }, created: Math.floor(Date.now() / 1000), success_url: b.get('success_url') };
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: s.full } });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', WH).update(`${t}.${payload}`).digest('hex');
  const r = await worker.fetch(new Request(WORKER + '/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': `t=${t},v1=${sig}` } }), env, ctx);
  return r.status;
}

http.createServer(async (q, res) => {
  try {
    const u = new URL(q.url, WORKER);
    const chunks = []; for await (const c of q) chunks.push(c);
    const body = Buffer.concat(chunks);
    if (u.pathname.startsWith('/mock/stripe/')) {
      const id = u.pathname.split('/').pop(), s = sessions.get(id);
      const types = [...s.params].filter(([k]) => k.startsWith('payment_method_types[')).map(([, v]) => v);
      res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
      return res.end(`<!doctype html><meta name=viewport content="width=device-width"><body style="font:16px system-ui;padding:20px"><h1>Faux Stripe (test)</h1><p id=pm>Moyens proposés : ${types.join(', ')}</p><p>Total : ${(Number(s.params.get('line_items[0][price_data][unit_amount]') || 0) / 100)} €+</p>
<a id=pay-card href="/mock/pay?id=${id}&country=FR&method=card">Payer par carte 4242 (France)</a><br><a id=pay-bc href="/mock/pay?id=${id}&country=BE&method=bancontact">Payer par Bancontact (Belgique)</a><br><a id=cancel href="${s.params.get('cancel_url')}">Annuler</a>`);
    }
    if (u.pathname === '/mock/pay') {
      const id = u.searchParams.get('id'); const st = await markPaid(id, u.searchParams.get('country') || 'FR', u.searchParams.get('method') || 'card');
      const url = sessions.get(id).params.get('success_url').replace('{CHECKOUT_SESSION_ID}', id);
      res.writeHead(302, { Location: url, 'X-Webhook-Status': String(st) }); return res.end();
    }
    if (u.pathname === '/mock/state') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ mails: mails.map((m) => ({ to: m.to, subject: m.subject, reply_to: m.reply_to, from: m.from, text: String(m.text || '').slice(0, 600) })), created: created.map((c) => ({ types: Object.entries(c).filter(([k]) => k.startsWith('payment_method_types')).map(([, v]) => v), country: Object.entries(c).filter(([k]) => /allowed_countries/.test(k)).map(([, v]) => v).join(','), success: c.success_url, mode: c.mode })), refunds, files: [...files].map(([k, v]) => [k, v.buf.length, v.type]), requests: await reqDO.list() })); }
    const r = await worker.fetch(new Request(WORKER + q.url, { method: q.method, headers: q.headers, body: ['GET', 'HEAD'].includes(q.method) ? undefined : body }), env, ctx);
    const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
    res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { console.error(e); res.writeHead(500); res.end(String(e)); }
}).listen(PORT, () => console.log('Worker local sur ' + PORT));
