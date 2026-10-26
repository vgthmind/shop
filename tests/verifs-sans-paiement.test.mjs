// Vérifications « sans paiement » (B2, B3, D3, C3, E2) : fausses données uniquement, aucun appel Stripe ni mail réel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, register } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(spec, ctx, next) { if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject {}', shortCircuit: true }; if (/^[.]{1,2}[/]/.test(spec) && !/[.][a-z]+$/.test(spec)) return next(spec + '.ts', ctx); return next(spec, ctx); }`));
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// ---- B2 : une pièce programmée n'apparaît pas avant l'heure prévue ----
test('B2 : la pièce reste « programmée » jusqu’à l’heure, le build la publie au plus ~75 s avant, le Worker le déclenche 60 s avant', async () => {
  const C = require('../admin/catalogue-core.js');
  const at = Date.parse('2026-11-06T17:00:00Z');
  const piece = { hidden: true, publish_at: new Date(at).toISOString() };
  assert.equal(C.state(piece, at - 1), 'scheduled', 'une milliseconde avant : pas en ligne');
  assert.equal(C.state(piece, at + 1000), 'preview', 'après l’heure : plus « programmée »');
  const bc = read('generator/build-catalog.js');
  const lead = Number(/PUBLISH_LEAD_MS = (\d+) \* 1000/.exec(bc)[1]);
  const leadWorker = Number(/LEAD_S = (\d+)/.exec(read('checkout-worker/index.ts'))[1]);
  assert.ok(lead >= leadWorker, 'le build accepte la pièce dès que le Worker le lance');
  assert.ok(lead <= 120, 'jamais plus de 2 min avant l’heure');
  assert.ok(/publishAt <= Date\.now\(\) \+ PUBLISH_LEAD_MS/.test(bc));
  const { publishCron } = await import('../checkout-worker/index.ts');
  const m = new Map();
  const kv = { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, String(v)); }, delete: async (k) => { m.delete(k); } };
  m.set('publish:schedule', JSON.stringify([{ slug: 'a', at: new Date(at).toISOString() }]));
  let calls = 0; const real = globalThis.fetch; globalThis.fetch = async () => { calls++; return new Response('{}'); };
  try {
    const env = { HOLDS: kv, DEPLOY_HOOK_URL: 'https://hook.invalid/x', SITE_BASE: 'http://x', ALLOWED_ORIGIN: 'http://x', ADMIN_GITHUB_LOGIN: 'x' };
    assert.equal((await publishCron(env, at - 61_000)).fired, 0);
    assert.equal((await publishCron(env, at - 59_000)).fired, 1);
    assert.equal((await publishCron(env, at + 1_000)).fired, 0);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = real; }
});

// ---- B3 : « En cours… » puis « ✓ Fait » sur tous les boutons d'action ----
function fakeBtn() {
  const attrs = new Map(); const cls = new Set();
  return { isConnected: true, disabled: false, innerHTML: 'Rembourser', textContent: 'Rembourser',
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null), setAttribute: (k, v) => attrs.set(k, String(v)), removeAttribute: (k) => attrs.delete(k), hasAttribute: (k) => attrs.has(k),
    classList: { add: (c) => cls.add(c), remove: (...c) => c.forEach((x) => cls.delete(x)), contains: (c) => cls.has(c) } };
}
function loadUI() {
  const doc = { getElementById: () => null, createElement: () => ({ setAttribute() {}, className: '' }), addEventListener() {}, body: null, documentElement: { appendChild() {} }, head: { appendChild() {} } };
  const root = { document: doc, location: { pathname: '/admin/connexion', search: '' }, setTimeout: () => 0, clearTimeout() {}, sessionStorage: { getItem: () => null, setItem() {} } };
  const src = read('admin/vg-admin-ui.js');
  const mod = { exports: null };
  // Le fichier se charge comme un module CommonJS ; la branche « navigateur » est activée en lui passant notre faux `root` via `self`.
  new Function('module', 'self', 'this_', src.replace(/\}\(typeof self !== 'undefined' \? self : this, function/, '}(self, function').replace("if (typeof module === 'object' && module.exports) module.exports = factory();\n  else root.VGAdminUI = factory(root);", 'module.exports = factory(root);'))(mod, root);
  return mod.exports;
}
test('B3 : un bouton passe par « En cours… » puis « ✓ Fait » (ou « ✕ Échec »)', async () => {
  const api = loadUI();
  const b = fakeBtn(); let done;
  const p = new Promise((r) => { done = r; });
  api.track(b, p, { silent: true });
  assert.equal(b.textContent, 'En cours…'); assert.ok(b.classList.contains('vg-busy')); assert.equal(b.getAttribute('aria-busy'), 'true');
  done(); await p; await new Promise((r) => setImmediate(r));
  assert.equal(b.textContent, '✓ Fait'); assert.ok(b.classList.contains('vg-ok')); assert.ok(!b.classList.contains('vg-busy'));
  const b2 = fakeBtn(); const bad = Promise.reject(new Error('Stripe indisponible')); bad.catch(() => {});
  api.track(b2, bad, { silent: true }); await new Promise((r) => setImmediate(r));
  assert.equal(b2.textContent, '✕ Échec'); assert.ok(b2.classList.contains('vg-err'));
});
test('B3 : toutes les pages de l’admin chargent le cadre commun et leurs écritures passent par vgAdminApi', () => {
  const pages = readdirSync(new URL('../admin/', import.meta.url)).filter((f) => f.endsWith('.html') && f !== 'connexion.html');
  assert.ok(pages.length >= 15);
  for (const f of pages) {
    const s = read('admin/' + f);
    assert.match(s, /vg-admin-ui\.js/, f + ' : cadre commun absent');
    assert.match(s, /vg-admin-auth\.js/, f + ' : session absente');
    assert.ok(s.indexOf('vg-admin-auth.js') < s.indexOf('vg-admin-ui.js'), f + ' : le cadre doit venir après la session');
  }
  assert.match(read('admin/vg-admin-ui.js'), /root\.vgAdminApi = function[^]*api\.track\(lastClick\.el, p\)/, 'écritures POST/PUT rattachées au dernier bouton cliqué');
});

// ---- D3 : mail de confirmation = lien « Télécharger ta facture » valide ----
test('D3 : le mail de confirmation (FR et EN, html et texte) contient le lien facture vers /suivi, que la page sait traiter', async () => {
  const { customerEmail } = await import('../checkout-worker/emails.ts');
  const o = { ref: 'VG-ABC123', name: 'Alex Martin', email: 'a@b.fr', phone: '', country: 'FR', address: ['1 rue A'], items: [{ name: 'Hoodie', qty: 1, amount: '140,00 €' }], shipping: '0,00 €', total: '140,00 €', discount: '' };
  for (const lang of ['fr', 'en']) {
    const m = customerEmail({ ...o, lang, orderUrl: 'https://www.vgthmind.org/suivi/?o=VG-ABC123&l=' + lang });
    const label = lang === 'fr' ? 'Télécharger ta facture' : 'Download your invoice';
    const href = /<a href="([^"]*#facture)"[^>]*>([^<]*)<\/a>/.exec(m.html);
    assert.ok(href, lang + ' : lien #facture absent');
    assert.equal(href[2], label);
    const url = new URL(href[1].replace(/&amp;/g, '&'));
    assert.equal(url.origin + url.pathname, 'https://www.vgthmind.org/suivi/'); assert.equal(url.searchParams.get('o'), 'VG-ABC123'); assert.equal(url.hash, '#facture');
    assert.ok(m.text.includes(label + ' : https://www.vgthmind.org/suivi/?o=VG-ABC123&l=' + lang + '#facture'));
  }
  const cart = read('assets/vg-shop-cart.js');
  assert.match(cart, /\^#facture\$/); assert.match(cart, /vg-track-invoice/);
});

// ---- C3 : une commande = une seule ligne de compta, au bon montant ----
test('C3 : acompte, solde et commande avec livraison = une ligne chacun (clé = session), jamais en double, montants exacts', async () => {
  const core = await import('../checkout-worker/accounting-core.js');
  const { recordSale } = await import('../checkout-worker/accounting.ts');
  const m = new Map();
  const env = { HOLDS: { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); }, list: async () => ({ keys: [] }) }, COMPTA_URL: 'https://script.example/exec', COMPTA_SECRET: 's3cret-s3cret-s3cret' };
  const sessions = [
    { id: 'cs_live_acompte', created: 1_790_000_000, livemode: true, amount_total: 4500, metadata: { kind: 'deposit', nature: 'goods', request: 'D-AAAAAA' }, line_items: { data: [{ description: 'Acompte 30 %', quantity: 1 }] } },
    { id: 'cs_live_solde', created: 1_790_900_000, livemode: true, amount_total: 10500 + 800, shipping_cost: { amount_total: 800 }, metadata: { kind: 'balance', nature: 'goods', request: 'D-AAAAAA' }, line_items: { data: [{ description: 'Solde', quantity: 1 }] } },
    { id: 'cs_live_cmd', created: 1_791_000_000, livemode: true, amount_total: 14000 + 1800, shipping_cost: { amount_total: 1800 }, total_details: { amount_discount: 0 }, metadata: {}, line_items: { data: [{ description: 'Hoodie', quantity: 1 }] } },
  ];
  const sent = []; const real = globalThis.fetch;
  globalThis.fetch = async (u, init) => { sent.push(JSON.parse(JSON.parse(init.body).payload)); return new Response(JSON.stringify({ ok: true })); };
  try {
    for (const s of sessions) { await recordSale(env, s, s.metadata.request || 'VG-X'); await recordSale(env, s, s.metadata.request || 'VG-X'); }
  } finally { globalThis.fetch = real; }
  assert.equal(sent.length, 3, 'rejeu du webhook = aucune seconde ligne');
  assert.deepEqual(sent.map((p) => p.key), ['cs_live_acompte', 'cs_live_solde', 'cs_live_cmd']);
  assert.deepEqual(sent.map((p) => p.row.total), [45, 113, 158]);
  assert.deepEqual(sent.map((p) => p.row.shipping), [0, 8, 18]);
  assert.deepEqual(sent.map((p) => p.row.items), [45, 105, 140], 'pièces = total moins livraison');
  assert.deepEqual(core.SALE_COLUMNS.slice(5, 9), ['Pièces TTC', 'Frais de port', 'Remise', 'Total encaissé']);
});

// ---- E2 : « Vêtement fourni par le client » = Prestation de services ----
test('E2 : la case « Vêtement fourni par le client » mène à « Prestation de services » dans la compta', async () => {
  const adm = read('admin/demandes.html');
  assert.match(adm, /data-q="clientGarment"[^>]*>\s*Vêtement fourni par le client/);
  const rc = read('checkout-worker/requests-core.ts');
  assert.match(rc, /clientGarment: rec\.type === 'custom' && \(d\.clientGarment === true \|\| d\.clientGarment === 'true'\)/);
  const rq = read('checkout-worker/requests.ts');
  assert.equal((rq.match(/nature: natureOf\(rec\)/g) || []).length, 2, 'acompte ET solde portent la nature');
  const { natureOf } = await import('../checkout-worker/requests-core.ts');
  const { buildSaleRecord } = await import('../checkout-worker/accounting-core.js');
  const row = (rec) => buildSaleRecord({ id: 'cs_1', created: 1_790_000_000, livemode: true, amount_total: 5000, metadata: { nature: natureOf(rec) } }).row.nature;
  assert.equal(row({ type: 'custom', quote: { clientGarment: true } }), 'Prestation de services');
  assert.equal(row({ type: 'custom', quote: { clientGarment: false } }), 'Vente de marchandises');
  assert.equal(row({ type: 'production' }), 'Prestation de services');
  assert.equal(row({ type: 'collab' }), 'Prestation de services');
  assert.equal(row({ type: 'surmesure', quote: { clientGarment: true } }), 'Vente de marchandises', 'la case ne vaut que pour un custom');
});

// ---- Admin : bouton « Retour » sur les pages ouvertes à part (facture, avoir, bon, devis, photos) et zones tactiles ----
test('Retour : facture, avoir, bon, devis et visionneuse reçoivent un bouton « ← Retour » qui ferme l’onglet, sinon revient à l’admin', async () => {
  const fired = []; const fakeRoot = { location: { href: 'https://x/admin/commandes.html' }, setTimeout: (f) => { fired.push(f); return 0; }, alert() {} };
  const mod = { exports: null }; new Function('module', 'self', read('assets/vg-invoice.js').replace("}(typeof self !== 'undefined' ? self : this));", '}(self));'))(mod, fakeRoot);
  const inv = fakeRoot.VGInvoice;
  const mk = (closable) => {
    const added = []; let click = null; const timers = [];
    const w = { closed: false, location: { href: '' }, close() { if (closable) this.closed = true; },
      document: { body: { insertBefore: (el) => added.push(el), firstChild: null }, head: { appendChild() {} }, getElementById: () => null,
        createElement: () => ({ addEventListener: (_, f) => { click = f; } }) } };
    return { w, added, click: () => click(), timers };
  };
  const fire = fired;
  {
    const a = mk(true); inv.addBack(a.w); assert.equal(a.added.length, 1); assert.equal(a.added[0].textContent, '← Retour'); a.click(); fire.pop()();
    assert.equal(a.w.closed, true); assert.equal(a.w.location.href, '', 'onglet fermé : pas de navigation');
    const b = mk(false); inv.addBack(b.w); b.click(); fire.pop()();
    assert.equal(b.w.location.href, 'https://x/admin/commandes.html', 'appli iPhone : retour à la page de l’admin');
  }
  assert.match(read('admin/commandes.html'), /window\.VGInvoice\.addBack\(w\)/, 'bon de commande');
  assert.match(read('assets/vg-invoice.js'), /function bindPrint\(w, inv, lang, mode\) \{\s*addBack\(w\)/, 'facture et avoir');
  const d = read('admin/demandes.html');
  assert.equal((d.match(/VGInvoice\.openViewer\(/g) || []).length, 3, 'devis PDF, photo, vidéo');
  assert.doesNotMatch(d, /window\.open\(/);
});
test('Boutons : zone tactile ≥ 44 px pour tout le cadre commun, action dangereuse en rouge', () => {
  const css = read('admin/vg-admin-ui.css');
  assert.match(css, /body\.vg-ui :is\(button, \.btn, summary, select, input.*\) \{ min-height: 44px; \}/);
  assert.match(css, /nav\.vg-back a \{[^}]*min-height: 44px/);
  assert.match(css, /button\[data-del\], button\[data-refund\]/);
  assert.match(css, /\.vg-btn \{[^}]*min-height: 44px/);
});
