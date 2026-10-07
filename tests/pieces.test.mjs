import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const calc = require('../admin/shipping-calc.js');
const V = require('../admin/pieces-view.js');
const S = require('../admin/pieces-save.js');
const config = JSON.parse(readFileSync(new URL('../admin/shipping-config.json', import.meta.url), 'utf8'));

test('poids, mode et « part seule » enregistrés sur la fiche', () => {
  const r = V.applyEdit({ slug: 'a', name: 'A' }, { weight_g: 420, mode: 'colis', alone: true });
  assert.deepEqual(r.product, { slug: 'a', name: 'A', weight_g: 420, mode: 'colis', alone: true });
  const l = V.applyEdit({ slug: 'a' }, { weight_g: 48, mode: 'lettre', alone: false });
  assert.equal(l.product.mode, 'lettre'); assert.equal(l.product.alone, false);
});
test('poids vide retire le poids ; saisies invalides refusées', () => {
  assert.equal('weight_g' in V.applyEdit({ weight_g: 300, weight_estimated: true }, { weight_g: '', mode: 'colis', alone: false }).product, false);
  for (const bad of [0, -5, 12.5, 'abc']) assert.ok(V.applyEdit({}, { weight_g: bad, mode: 'colis', alone: false }).error, String(bad));
  assert.ok(V.applyEdit({}, { weight_g: 100, mode: 'avion', alone: false }).error);
});
test('« estimé » : retiré quand le poids change, gardé quand seul le mode change', () => {
  const p = { weight_g: 550, weight_estimated: true };
  assert.equal(V.applyEdit(p, { weight_g: 570, mode: 'colis', alone: false }).product.weight_estimated, undefined);
  assert.equal(V.applyEdit(p, { weight_g: 550, mode: 'colis', alone: true }).product.weight_estimated, true);
  assert.equal(V.weightState(p), 'estimated'); assert.equal(V.weightState({ weight_g: 570 }), 'ok');
});
test('pièce sans poids : état « missing », aucun port affiché, badge SANS POIDS dans la page', () => {
  for (const p of [{ slug: 'x' }, { slug: 'x', weight_g: 0 }, { slug: 'x', weight_g: '' }]) {
    const d = V.describe(calc, config, p);
    assert.equal(d.state, 'missing'); assert.deepEqual(d.zones, []); assert.equal(d.advice, null);
  }
  const html = readFileSync(new URL('../admin/pieces.html', import.meta.url), 'utf8');
  assert.match(html, /SANS POIDS/); assert.match(html, /tr\.nowt/);
});
test('ports par zone : France, UE, reste du monde (coût réel, payé, écart)', () => {
  const d = V.describe(calc, config, { slug: 'x', weight_g: 420, mode: 'colis' });
  assert.deepEqual(d.zones.map((z) => z.label), ['France', 'UE', 'Reste du monde']);
  const [fr, ue, monde] = d.zones;
  assert.deepEqual([fr.cost, fr.total, fr.gap], [9.29, 0, -9.29]);
  assert.deepEqual([ue.cost, ue.total], [19.39, 15]); assert.deepEqual([monde.cost, monde.total], [39.19, 29]);
});
test('modeAdvice : signal seulement si l\'autre mode est moins cher, avec les deux montants', () => {
  const colisCher = structuredClone(config); colisCher.zones.find((z) => z.id === 'FR').brackets[0].price = 2;
  const a = V.describe(calc, colisCher, { slug: 'x', weight_g: 48, mode: 'lettre' }).advice;
  assert.equal(a.better, 'colis'); assert.equal(a.colis_cost, 2); assert.equal(a.lettre_cost, 3.47);
  assert.equal(V.describe(calc, config, { slug: 'x', weight_g: 48, mode: 'lettre' }).advice, null); // lettre 3,47 < colis 5,49
  const b = V.describe(calc, config, { slug: 'x', weight_g: 48, mode: 'colis' }).advice;
  assert.equal(b.better, 'lettre'); assert.equal(b.lettre_cost, 3.47); assert.equal(b.colis_cost, 5.49);
  assert.equal(V.describe(calc, config, { slug: 'x', weight_g: 48, mode: 'colis', alone: true }).advice, null);
});

// Faux dépôt GitHub : enregistre les appels.
function fakeRepo(files) {
  const calls = [], blobs = {};
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
  const gh = async (method, path, body) => {
    calls.push({ method, path, body });
    let m;
    if ((m = /^\/contents\/data\/products\/(.+)\.json/.exec(path))) {
      if (!files[m[1]]) { const e = new Error('Not Found'); e.status = 404; throw e; }
      return { content: b64(files[m[1]]) };
    }
    if (path.startsWith('/git/ref/')) return { object: { sha: 'head1' } };
    if (path.startsWith('/git/commits/')) return { tree: { sha: 'tree0' } };
    if (path === '/git/blobs') { const id = 'blob' + Object.keys(blobs).length; blobs[id] = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')); return { sha: id }; }
    if (path === '/git/trees') return { sha: 'tree1' };
    if (path === '/git/commits') return { sha: 'commit1' };
    return {};
  };
  return { gh, calls, blobs };
}
test('enregistrement : un seul commit, fiches fusionnées (autres champs intacts)', async () => {
  const { gh, calls, blobs } = fakeRepo({ a: { name: 'A', price: 55, weight_g: 300, weight_estimated: true }, b: { name: 'B', price: 20 } });
  const r = await S.savePieces(gh, { a: { weight_g: 310, mode: 'colis', alone: true }, b: { weight_g: 48, mode: 'lettre', alone: false } });
  assert.deepEqual(r.saved, ['a', 'b']);
  assert.deepEqual(Object.values(blobs), [
    { name: 'A', price: 55, weight_g: 310, mode: 'colis', alone: true },
    { name: 'B', price: 20, weight_g: 48, mode: 'lettre', alone: false }]);
  assert.equal(calls.filter((c) => c.path === '/git/commits' && c.method === 'POST').length, 1);
  assert.deepEqual(calls.find((c) => c.method === 'PATCH').body, { sha: 'commit1', force: false });
});
test('enregistrement : saisie invalide ou pièce disparue = rien d\'écrit', async () => {
  const { gh, calls } = fakeRepo({ a: { name: 'A' } });
  await assert.rejects(S.savePieces(gh, { a: { weight_g: -3, mode: 'colis', alone: false } }), /Poids invalide/);
  await assert.rejects(S.savePieces(gh, { zz: { weight_g: 3, mode: 'colis', alone: false } }), /n'existe plus/);
  assert.equal(calls.some((c) => c.method !== 'GET'), false);
});
test('chargement : liste les fiches, slug = nom de fichier', async () => {
  const files = { b: { name: 'Beta' }, a: { name: 'Alpha', weight_g: 100 } };
  const gh = async (m, path) => path.startsWith('/contents/data/products?')
    ? Object.keys(files).map((k) => ({ name: k + '.json', path: 'data/products/' + k + '.json' })).concat([{ name: '.gitkeep', path: 'data/products/.gitkeep' }])
    : { content: Buffer.from(JSON.stringify(files[/products\/(.+)\.json/.exec(path)[1]])).toString('base64') };
  const list = await S.loadPieces(gh);
  assert.deepEqual(list.map((p) => p.slug), ['a', 'b']); assert.equal(list[0].weight_g, 100);
});
test('fiches du dépôt : poids, mode et part seule valides ; cache-cou en lettre', () => {
  const dir = new URL('../data/products/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const p = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    if (p.weight_g === undefined) continue;
    assert.ok(Number.isInteger(p.weight_g) && p.weight_g > 0, f);
    assert.ok(['colis', 'lettre'].includes(p.mode), f); assert.equal(typeof p.alone, 'boolean', f);
  }
  const cc = JSON.parse(readFileSync(new URL('cache-cou.json', dir), 'utf8'));
  assert.equal(cc.weight_g, 48); assert.equal(cc.mode, 'lettre'); assert.equal(cc.weight_estimated, undefined);
});
