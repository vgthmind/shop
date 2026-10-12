import { test as baseTest, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';

const require = createRequire(import.meta.url);
const tunnel = require('../detourage-server/tunnel.js');
// Le serveur a besoin de onnxruntime-node (installé sur le PC de vgthmind, pas dans tous les environnements) : sans lui, on saute ces essais.
let hasOnnx = true;
try { require.resolve('onnxruntime-node', { paths: [new URL('../detourage-server/', import.meta.url).pathname] }); } catch (e) { hasOnnx = false; }
const test = (name, fn) => baseTest(name, { skip: hasOnnx ? false : 'onnxruntime-node absent (dépendance du serveur de détourage)' }, fn);

const ORIGIN = 'https://vgthmind.github.io';
const TOKEN = 'abcdefghijklmnopqrstuvwx';
let proc, port = 17860 + Math.floor(Math.random() * 1000);

// Requête brute (fetch interdit de fixer Host / les en-têtes Cf-*).
function call(method, path, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    r.on('error', reject); r.end(body);
  });
}
const local = { Origin: ORIGIN, Host: `localhost:${port}` };
const viaTunnel = (extra = {}) => ({ Origin: ORIGIN, Host: 'abc-def.trycloudflare.com', 'Cf-Connecting-Ip': '1.2.3.4', ...extra });

before(async () => {
  if (!hasOnnx) return;
  const dir = mkdtempSync(join(tmpdir(), 'vgdet-'));
  proc = spawn(process.execPath, ['detourage-server/server.js'], {
    cwd: new URL('..', import.meta.url), stdio: 'ignore',
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DETOURAGE_TOKEN: TOKEN, MODEL_PATH: join(dir, 'absent.onnx'), TOKEN_FILE: join(dir, 'absent.token') },
  });
  for (let i = 0; i < 50; i++) { try { await call('GET', '/health', local); return; } catch (e) { await new Promise((r) => setTimeout(r, 200)); } }
  throw new Error('serveur de test non démarré');
});
after(() => proc && proc.kill());

test('depuis ce PC : pas de mot de passe demandé (le modèle absent répond 503, pas 401)', async () => {
  assert.equal((await call('POST', '/cut', local, 'x')).status, 503);
});

test('par le tunnel sans mot de passe : refusé 401', async () => {
  assert.equal((await call('POST', '/cut', viaTunnel(), 'x')).status, 401);
});

test('par le tunnel avec un mauvais mot de passe : refusé 401', async () => {
  assert.equal((await call('POST', '/cut', viaTunnel({ 'X-VG-Token': TOKEN + 'x' }), 'x')).status, 401);
  assert.equal((await call('POST', '/cut', viaTunnel({ 'X-VG-Token': 'court' }), 'x')).status, 401);
});

test('en-têtes Cloudflare même avec Host localhost : traité comme extérieur', async () => {
  assert.equal((await call('POST', '/cut', { ...local, 'Cf-Connecting-Ip': '9.9.9.9' }, 'x')).status, 401);
});

test('par le tunnel avec le bon mot de passe : accepté (503 = modèle absent dans ce test)', async () => {
  assert.equal((await call('POST', '/cut', viaTunnel({ 'X-VG-Token': TOKEN }), 'x')).status, 503);
});

test('mauvais site (origine) : refusé 403 même avec le bon mot de passe', async () => {
  assert.equal((await call('POST', '/cut', viaTunnel({ Origin: 'https://evil.example', 'X-VG-Token': TOKEN }), 'x')).status, 403);
});

test('requête de pré-vérification du navigateur : autorise l’en-tête du mot de passe', async () => {
  const r = await new Promise((resolve) => http.request({ host: '127.0.0.1', port, method: 'OPTIONS', path: '/cut', headers: viaTunnel() }, (res) => { res.resume(); resolve(res); }).end());
  assert.equal(r.statusCode, 204);
  assert.match(String(r.headers['access-control-allow-headers']), /X-VG-Token/);
});

test('essais au hasard : 429 après 20 refus (même avec le bon mot de passe ensuite)', async () => {
  for (let i = 0; i < 25; i++) await call('POST', '/cut', viaTunnel(), 'x');
  assert.equal((await call('POST', '/cut', viaTunnel({ 'X-VG-Token': TOKEN }), 'x')).status, 429);
  assert.equal((await call('POST', '/cut', local, 'x')).status, 503); // le PC lui-même n'est pas bloqué
});

test('lanceur : mot de passe créé puis conservé, lien et adresse du tunnel', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'vgtok-')), '.token');
  const t1 = tunnel.ensureToken(f), t2 = tunnel.ensureToken(f);
  assert.equal(t1, t2); assert.match(t1, /^[A-Za-z0-9_-]{16,128}$/);
  writeFileSync(f, 'xx'); assert.notEqual(tunnel.ensureToken(f), 'xx'); // fichier abîmé : refait
  assert.equal(tunnel.findTunnelUrl('INF |  https://quiet-owl-1234.trycloudflare.com  |'), 'https://quiet-owl-1234.trycloudflare.com');
  assert.equal(tunnel.findTunnelUrl('POST https://api.trycloudflare.com/tunnel'), null);
  assert.equal(tunnel.findTunnelUrl('POST https://api.trycloudflare.com/tunnel\nINF https://calm-fox-9.trycloudflare.com'), 'https://calm-fox-9.trycloudflare.com');
  const link = tunnel.buildLink('https://vgthmind.github.io/shop/admin/studio-photo.html', 'https://quiet-owl-1234.trycloudflare.com', t1);
  assert.ok(link.includes('#srv=https%3A%2F%2Fquiet-owl-1234.trycloudflare.com&k=' + t1));
  assert.ok(!tunnel.linkPage('a"<b').includes('a"<b'));
});
