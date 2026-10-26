// Adresse de l'émetteur : saisie dans Réglages, gardée dans les données (jamais dans le dépôt), imprimée seulement sur factures et avoirs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, n) { if (/^[.]{1,2}[/]/.test(s) && !/[.][a-z]+$/.test(s)) return n(s + '.ts', c); return n(s, c); }`));
const core = await import('../checkout-worker/requests-core.ts');
const { buildInvoice, SELLER } = await import('../checkout-worker/invoice.ts');

const floors = {};
const valid = () => JSON.parse(JSON.stringify(core.DEFAULT_SETTINGS));

test('vide par défaut ; enregistrée telle quelle (espaces nettoyés) ; refus du HTML et des adresses trop longues', () => {
  assert.equal(core.DEFAULT_SETTINGS.sellerAddress, '');
  assert.equal(core.mergeSettings(null).sellerAddress, '');
  assert.equal(core.mergeSettings({ depositPct: 30 }).sellerAddress, '', 'anciens réglages sans adresse');
  let r = core.checkSettings({ ...valid(), sellerAddress: '  12 rue   des Lilas, 94400  ' }, floors);
  assert.equal(r.ok, true); assert.equal(r.value.sellerAddress, '12 rue des Lilas, 94400');
  assert.equal(core.mergeSettings(r.value).sellerAddress, '12 rue des Lilas, 94400');
  assert.equal(core.checkSettings({ ...valid(), sellerAddress: '<script>' }, floors).ok, false);
  assert.equal(core.checkSettings({ ...valid(), sellerAddress: 'x'.repeat(201) }, floors).ok, false);
  assert.equal(core.checkSettings({ ...valid(), sellerAddress: '' }, floors).value.sellerAddress, '');
});

test('facture : vgthmind, adresse (si remplie), ville, SIRET, e-mail ; jamais de nom ni de prénom ; vide = pas d\'adresse', () => {
  const s = { created: 1, livemode: false, currency: 'eur', customer_details: { name: 'Client Test', email: 'c@example.com', address: { country: 'FR' } }, amount_total: 1000 };
  const a = buildInvoice(s, [], { number: 'TEST-1', ref: 'VG-1', sellerAddress: '12 rue des Lilas' });
  assert.deepEqual(a.seller, { name: 'vgthmind', line2: '12 rue des Lilas, Vitry-sur-Seine, France', siret: SELLER.siret, email: 'contact@vgthmind.org' });
  const b = buildInvoice(s, [], { number: 'TEST-1', ref: 'VG-1', sellerAddress: '' });
  assert.equal(b.seller.line2, 'Vitry-sur-Seine, France');
  assert.deepEqual(Object.keys(a.seller).sort(), ['email', 'line2', 'name', 'siret']);
});

test('le dépôt ne contient aucune adresse d\'émetteur : plus de variable INVOICE_SELLER_ADDRESS', () => {
  const root = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
  const seen = [];
  (function walk(d) { for (const f of readdirSync(d)) { if (/^(node_modules|\.git|\.wrangler|tests)$/.test(f)) continue; const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|toml|js|mjs)$/.test(f) && /INVOICE_SELLER_ADDRESS\s*=/.test(readFileSync(p, 'utf8'))) seen.push(p); } })(path.join(root, 'checkout-worker'));
  assert.deepEqual(seen, []);
});

test('l\'adresse n\'est jamais renvoyée par la route publique /requests/settings', () => {
  const src = readFileSync(new URL('../checkout-worker/requests.ts', import.meta.url), 'utf8');
  const i = src.indexOf("path === '/requests/settings'");
  const block = src.slice(i, src.indexOf("path === '/requests/card'", i));
  assert.ok(block.length > 100 && !/sellerAddress/.test(block));
});

test('facture : la ville n\'est pas répétée si l\'adresse saisie la contient ; prix unitaire = montant quand la quantité est 1', () => {
  const s = { created: 1, livemode: false, currency: 'eur', customer_details: { name: 'Client', email: 'c@example.com', address: { country: 'FR' } }, amount_total: 100 };
  assert.equal(buildInvoice(s, [], { number: 'T', ref: 'R', sellerAddress: '18 Villa X, 94400 Vitry-Sur-Seine' }).seller.line2, '18 Villa X, 94400 Vitry-Sur-Seine');
  assert.equal(buildInvoice(s, [], { number: 'T', ref: 'R', sellerAddress: '12 rue des Lilas' }).seller.line2, '12 rue des Lilas, Vitry-sur-Seine, France');
  const src = readFileSync(new URL('../checkout-worker/index.ts', import.meta.url), 'utf8');
  assert.ok(/unit: i\.unit \? Number\(i\.unit\) : Math\.round\(\(Number\(i\.amount\) \/ \(i\.qty \|\| 1\)\) \* 100\) \/ 100/.test(src));
});
