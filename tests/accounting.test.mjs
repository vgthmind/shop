import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHmac } from 'node:crypto';
import { buildSaleRecord, buildRefundRecord, buildEnvelope, sign, SALE_COLUMNS, REFUND_COLUMNS, parisDate } from '../checkout-worker/accounting-core.js';
import { send, recordSale, recordRefund, replayPending, accountingRoutes } from '../checkout-worker/accounting.ts';

const session = {
  id: 'cs_live_abc', created: Date.UTC(2026, 9, 6, 22, 30) / 1000, livemode: true, payment_status: 'paid', payment_intent: 'pi_123',
  amount_total: 3050, shipping_cost: { amount_total: 800 }, total_details: { amount_discount: 200 },
  customer_details: { email: 'cliente@example.com', name: 'Camille Durand', phone: '+33600000000', address: { country: 'FR' } },
  shipping_details: { name: 'Camille Durand', address: { line1: '1 rue Secrète', city: 'Lyon', country: 'FR' } },
  line_items: { data: [{ description: 'CD vgtape', quantity: 1 }, { description: 'Cache-cou', quantity: 2 }] },
};
const refund = { id: 're_1', created: session.created, amount: 1000, reason: 'requested_by_customer', payment_intent: 'pi_123', livemode: true };

test('vente : montants, date de Paris, désignation', () => {
  const r = buildSaleRecord(session, { ref: 'VG-ABC123', lineItems: session.line_items.data });
  assert.equal(r.key, 'cs_live_abc'); assert.equal(r.row.date, '2026-10-07');
  assert.equal(r.row.total, 30.5); assert.equal(r.row.shipping, 8); assert.equal(r.row.items, 22.5); assert.equal(r.row.discount, 2);
  assert.equal(r.row.designation, 'CD vgtape ; Cache-cou ×2'); assert.equal(r.row.ref, 'VG-ABC123');
  assert.equal(parisDate(session.created), '2026-10-07');
});
test('aucune donnée client dans les lignes envoyées', () => {
  const s = JSON.stringify([buildSaleRecord(session, { ref: 'VG-1', lineItems: session.line_items.data }), buildRefundRecord(refund)]);
  for (const secret of ['cliente@example.com', 'Camille', 'Durand', '+3360', 'rue Secrète', 'Lyon']) assert.ok(!s.includes(secret), secret);
});
test('remboursement', () => {
  const r = buildRefundRecord(refund, { ref: 'VG-1' });
  assert.equal(r.key, 're_1'); assert.equal(r.row.amount, 10); assert.equal(r.row.reason, 'Demande du client'); assert.equal(r.row.payment_intent, 'pi_123');
});
test('enveloppe signée : le secret n\'est jamais envoyé, la signature est vérifiable', async () => {
  const rec = buildSaleRecord(session);
  const env = JSON.parse(await buildEnvelope('mon-secret-très-long', rec, 1_800_000_000_000));
  assert.ok(!JSON.stringify(env).includes('mon-secret'));
  assert.equal(env.ts, '1800000000');
  assert.equal(env.sig, createHmac('sha256', 'mon-secret-très-long').update(env.ts + '.' + env.payload).digest('hex'));
  assert.equal(JSON.parse(env.payload).key, 'cs_live_abc');
});

// --- file d'attente / rejeu (KV et fetch simulés) ---
function fakeKV() {
  const m = new Map();
  return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); },
    list: async ({ prefix = '', limit = 1000 } = {}) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).slice(0, limit).map((name) => ({ name })) }) };
}
function withFetch(handler, fn) {
  const real = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return handler(url, init, calls.length); };
  return Promise.resolve(fn(calls)).finally(() => { globalThis.fetch = real; });
}
const okRes = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
const mkEnv = (over = {}) => ({ HOLDS: fakeKV(), COMPTA_URL: 'https://script.example/exec', COMPTA_SECRET: 's3cret-s3cret', ...over });

test('envoi réussi, puis doublon ignoré, puis rejeu forcé', async () => {
  const env = mkEnv();
  await withFetch(okRes, async (calls) => {
    assert.equal(await recordSale(env, session, 'VG-1'), 'sent');
    assert.equal(await recordSale(env, session, 'VG-1'), 'skipped');
    assert.equal(await recordSale(env, session, 'VG-1', true), 'sent');
    assert.equal(calls.length, 2);
  });
  assert.ok(env.HOLDS.m.has('compta:ok:cs_live_abc')); assert.ok(!env.HOLDS.m.has('compta:q:cs_live_abc'));
});
test('échec : mis en file sans donnée client, puis rejoué', async () => {
  const env = mkEnv();
  await withFetch(() => new Response('boom', { status: 500 }), async () => {
    assert.equal(await recordSale(env, session, 'VG-1'), 'queued');
  });
  const queued = env.HOLDS.m.get('compta:q:cs_live_abc'); assert.ok(queued); assert.ok(!/Camille|example\.com/.test(queued));
  await withFetch(okRes, async () => { assert.deepEqual(await replayPending(env), { sent: 1, failed: 0 }); });
  assert.ok(!env.HOLDS.m.has('compta:q:cs_live_abc'));
});
test('exception réseau = mise en file (jamais d\'erreur remontée)', async () => {
  const env = mkEnv();
  await withFetch(() => { throw new Error('réseau'); }, async () => { assert.equal(await recordRefund(env, refund, 'VG-1'), 'queued'); });
});
test('non configuré ou commande de test : rien n\'est envoyé', async () => {
  await withFetch(okRes, async (calls) => {
    assert.equal(await recordSale({ HOLDS: fakeKV() }, session, 'VG-1'), 'skipped');
    assert.equal(await recordSale(mkEnv(), { ...session, livemode: false }, 'VG-1'), 'skipped');
    assert.equal(await recordSale(mkEnv({ COMPTA_TEST: '1' }), { ...session, livemode: false }, 'VG-1'), 'sent');
    assert.equal(await recordSale(mkEnv(), { ...session, payment_status: 'unpaid' }, 'VG-1'), 'skipped');
    assert.equal(calls.length, 1);
  });
});
test('routes admin : statut et resynchronisation', async () => {
  const env = mkEnv(); const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s });
  const helpers = { paidSessions: async () => [session], refunds: async () => [refund], refFor: async () => 'VG-1' };
  await withFetch(okRes, async () => {
    const r = await accountingRoutes(new Request('http://x/admin/compta/resync', { method: 'POST' }), env, '/admin/compta/resync', json, helpers);
    assert.deepEqual(await r.json(), { sent: 2, queued: 0, skipped: 0 });
    const st = await accountingRoutes(new Request('http://x/admin/compta/status'), env, '/admin/compta/status', json, helpers);
    assert.deepEqual(await st.json(), { configured: true, pending: 0, done: 2 });
    assert.equal(await accountingRoutes(new Request('http://x/orders'), env, '/orders', json, helpers), null);
  });
});

// --- le script Apps Script, exécuté tel quel avec des services Google simulés ---
function runScript(secret = 'S3CRET-phrase') {
  const sheets = {};
  const mkSheet = (name) => {
    const rows = []; const sh = sheets[name] = { rows };
    return {
      getLastRow: () => rows.length, setFrozenRows() {},
      getRange: (r, c, nr = 1, nc = 1) => ({
        setValues(v) { v.forEach((line, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; line.forEach((x, j) => { rows[r - 1 + i][c - 1 + j] = x; }); }); return this; },
        setFontWeight() { return this; },
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] ?? '')),
      }),
    };
  };
  const made = {};
  const ctx = {
    console, Date, JSON, Math, String, Number,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => secret }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { computeHmacSha256Signature: (msg, key) => [...createHmac('sha256', key).update(msg).digest()].map((b) => (b > 127 ? b - 256 : b)) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n) => made[n] || null, insertSheet: (n) => (made[n] = mkSheet(n)) }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
  };
  vm.createContext(ctx); vm.runInContext(readFileSync(new URL('../apps-script/compta.gs', import.meta.url), 'utf8'), ctx);
  return { post: (body) => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).text), sheets };
}

test('Apps Script : crée les onglets, accepte une signature valide, upsert par clé', async () => {
  const app = runScript('S3CRET-phrase');
  const sale = JSON.parse(await buildEnvelope('S3CRET-phrase', buildSaleRecord(session, { ref: 'VG-1', lineItems: session.line_items.data }), Date.now()));
  assert.deepEqual(app.post(sale), { ok: true });
  assert.deepEqual(app.post(sale), { ok: true }); // rejeu : pas de doublon
  assert.equal(app.sheets.Ventes.rows.length, 2);
  assert.deepEqual(app.sheets.Ventes.rows[0], SALE_COLUMNS);
  assert.equal(app.sheets.Ventes.rows[1][8], 30.5); assert.equal(app.sheets.Ventes.rows[1][10], 'cs_live_abc');
  const rf = JSON.parse(await buildEnvelope('S3CRET-phrase', buildRefundRecord(refund, { ref: 'VG-1' }), Date.now()));
  assert.deepEqual(app.post(rf), { ok: true });
  assert.deepEqual(app.sheets.Remboursements.rows[0], REFUND_COLUMNS); assert.equal(app.sheets.Remboursements.rows[1][3], 10);
});
test('Apps Script : refuse mauvaise signature, mauvais secret, message trop ancien, JSON invalide', async () => {
  const app = runScript('S3CRET-phrase');
  const good = JSON.parse(await buildEnvelope('S3CRET-phrase', buildSaleRecord(session), Date.now()));
  assert.equal(app.post({ ...good, sig: 'ab'.repeat(32) }).ok, false);
  assert.equal(app.post({ ...good, payload: good.payload.replace('30.5', '3000') }).ok, false);
  assert.equal(app.post(JSON.parse(await buildEnvelope('autre-secret', buildSaleRecord(session), Date.now()))).ok, false);
  assert.equal(app.post(JSON.parse(await buildEnvelope('S3CRET-phrase', buildSaleRecord(session), Date.now() - 3600_000))).ok, false);
  assert.equal(app.post('pas du json').ok, false);
  assert.equal(app.sheets.Ventes, undefined);
});
