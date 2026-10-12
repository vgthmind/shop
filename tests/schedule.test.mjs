// Mise en ligne programmée : date de Paris -> UTC, état « programmée », construction du catalogue, cron du Worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, register } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const C = require('../admin/catalogue-core.js');

const hooks = `
export async function resolve(spec, ctx, next) { if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject {}', shortCircuit: true }; if (/^[.]{1,2}[/]/.test(spec) && !/[.][a-z]+$/.test(spec)) return next(spec + '.ts', ctx); return next(spec, ctx); }`;
register('data:text/javascript,' + encodeURIComponent(hooks));

test('heure de Paris -> UTC : hiver (UTC+1) et été (UTC+2)', () => {
  assert.equal(C.parisToIso('2026-11-06 18:00'), '2026-11-06T17:00:00.000Z');
  assert.equal(C.parisToIso('2026-07-10 18:00'), '2026-07-10T16:00:00.000Z');
  assert.equal(C.parisToIso('n importe quoi'), null);
});

test('état : programmée seulement si la date est à venir', () => {
  const now = Date.parse('2026-11-01T10:00:00Z');
  assert.equal(C.state({ hidden: true, publish_at: '2026-11-06T17:00:00.000Z' }, now), 'scheduled');
  assert.equal(C.state({ hidden: true, publish_at: '2026-10-01T17:00:00.000Z' }, now), 'preview');
  assert.equal(C.state({}, now), 'live');
  const p = C.schedule({ slug: 'a' }, '2026-11-06T17:00:00.000Z');
  assert.equal(p.hidden, true);
  assert.equal(C.setHidden(p, false).publish_at, undefined, 'publier maintenant efface la programmation');
});

test('build-catalog : la pièce passe en ligne ~75 s avant l’heure, pas avant', () => {
  const src = readFileSync(new URL('../generator/build-catalog.js', import.meta.url), 'utf8');
  assert.ok(src.includes('publishAt <= Date.now() + PUBLISH_LEAD_MS'));
  assert.ok(/PUBLISH_LEAD_MS = 75 \* 1000/.test(src));
  assert.ok(src.includes('realCats.length > 0'), 'jamais en ligne sans catégorie');
});

test('Worker : le cron déclenche le Deploy Hook une fois, à H - 60 s', async () => {
  const { publishCron } = await import('../checkout-worker/index.ts');
  const m = new Map();
  const kv = { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, String(v)); }, delete: async (k) => { m.delete(k); } };
  const at = Date.parse('2026-11-06T17:00:00Z');
  m.set('publish:schedule', JSON.stringify([{ slug: 'a', at: new Date(at).toISOString() }]));
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push([String(url), init && init.method]); return new Response('{}', { status: 200 }); };
  try {
    const env = { HOLDS: kv, DEPLOY_HOOK_URL: 'https://hook.invalid/x', SITE_BASE: 'http://x', ALLOWED_ORIGIN: 'http://x', ADMIN_GITHUB_LOGIN: 'x' };
    assert.deepEqual(await publishCron(env, at - 5 * 60_000), { fired: 0 }, 'trop tôt');
    assert.equal(calls.length, 0);
    assert.deepEqual(await publishCron(env, at - 50_000), { fired: 1 });
    assert.deepEqual(calls[0], ['https://hook.invalid/x', 'POST']);
    assert.deepEqual(await publishCron(env, at - 40_000), { fired: 0 }, 'une seule fois');
    assert.equal(calls.length, 1);
  } finally { globalThis.fetch = realFetch; }
});
