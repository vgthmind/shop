// Banc d'essai visuel de l'admin : serveur de fichiers local + faux Worker + faux GitHub, avec de FAUSSES données.
// Aucun appel réseau réel : tout ce qui sort du serveur local est intercepté (voir `fakeNetwork`).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newRequest, applyAction, DEFAULT_SETTINGS, TYPE_LABELS, answerLines } from '../../checkout-worker/requests-core.ts';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

export function startServer(port = 0) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/admin\/(?!.*\.[a-z0-9]+$)([^/]+)$/, '/admin/$1.html');
      let f = path.join(ROOT, p);
      if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (!fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    }).listen(port, '127.0.0.1', () => resolve({ srv, base: 'http://127.0.0.1:' + srv.address().port }));
  });
}

const now = Date.now(), DAY = 86400000;
const addr = (n) => ({ line1: n + ' rue des Lilas', city: 'Vitry-sur-Seine', postal_code: '94400', country: 'FR' });
const order = (i, extra = {}) => ({
  id: 'cs_test_zz' + i, ref: 'VG-TEST0' + i, created: Math.floor((now - i * 2 * DAY) / 1000), livemode: false, total: 80 + i * 12.5, shipping: 6, discount: 0,
  name: 'Camille Test' + i, email: 'camille' + i + '@example.invalid', phone: '+33600000000', address: addr(i), items: [{ name: 'Hoodie démo avec un nom assez long pour tester les retours à la ligne', size: 'M', qty: 1, image: '' }], ...extra,
});
export const ORDERS = [
  order(1), order(2, { preparing: { at: Math.floor(now / 1000) - 3600 } }),
  order(3, { shipped: { at: Math.floor(now / 1000) - 86400, tracking: 'CW000000000FR', notified: true } }),
  order(4, { refunded: { full: true, amount: 105 }, invoice_no: 'W-2026-001' }), order(5, { kind: 'deposit', request: 'D-AAAAAA' }),
];

function requests() {
  const mk = (id, type, status, extra = {}) => {
    const r = newRequest({ type, lang: 'fr', client: { first: 'Alex', last: 'Démo', name: 'Alex Démo', email: 'alex@example.invalid', country: 'FR' }, fields: { piece: type === 'custom' ? 'hoodie' : type === 'surmesure' ? 'short' : '', mode: 'know', idea: 'Une idée de test pour vérifier l’affichage des longs textes dans la fiche de la demande.', budget: '200 €' }, photosConsent: true }, id, 'k'.repeat(16), now - DAY);
    r.status = status; Object.assign(r, extra); return r;
  };
  const a = mk('D-AAAAAA', 'custom', 'nouvelle');
  const b = mk('D-BBBBBB', 'custom', 'discussion');
  const c = mk('D-CCCCCC', 'surmesure', 'nouvelle');
  const q = applyAction(c, 'quote', { lines: [{ label: 'Short sur-mesure', qty: 1, unit: 120 }], depositPct: 30, delay: '4 semaines', number: 'DEV-2026-001' }, DEFAULT_SETTINGS, now);
  const quoted = q.ok ? q.rec : c;
  const d = mk('D-DDDDDD', 'collab', 'nouvelle', { fields: { collabType: 'Clip', links: 'https://example.invalid', idea: 'Collab test' } });
  return [a, b, quoted, d].map((r) => ({ ...r, typeLabel: TYPE_LABELS[r.type] || r.type, answers: answerLines(r, 'fr'), pageUrl: 'https://example.invalid/ma-demande/?id=' + r.id }));
}

const PRODUCTS_DIR = path.join(ROOT, 'data', 'products');
function ghContents(p) {
  const rel = p.replace(/^\/+/, '');
  const abs = path.join(ROOT, rel);
  if (!abs.startsWith(ROOT) || !fs.existsSync(abs)) return null;
  if (fs.statSync(abs).isDirectory()) return fs.readdirSync(abs).map((n) => ({ name: n, path: rel + '/' + n, type: 'file', sha: 'sha' + n.length }));
  return { name: path.basename(abs), path: rel, sha: 'shafile', encoding: 'base64', content: fs.readFileSync(abs).toString('base64') };
}

const STOCK = Object.fromEntries(fs.readdirSync(PRODUCTS_DIR).slice(0, 40).map((f, i) => [f.replace(/\.json$/, ''), { stock: i % 3, sold: i % 2 }]));
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(body) });

// Réponses du faux Worker par chemin. Tout chemin inconnu renvoie {} (la page doit rester propre).
export function workerReply(pathname) {
  const days = Array.from({ length: 7 }, (_, i) => ({ day: new Date(now - i * DAY).toISOString().slice(0, 10), views: 20 + i, visitors: 9 + i, pages: {}, sources: {} }));
  const table = {
    '/orders': { orders: ORDERS },
    '/orders/tracking': { ok: true, lp: 'ok', shipped: { at: Math.floor(now / 1000) - 86400, tracking: '6A12345678901', notified: true, track: { state: 'transit', label: 'Pris en charge', checked: Math.floor(now / 1000), ok: Math.floor(now / 1000), events: [] } } },
    '/admin/requests': { requests: requests(), settings: DEFAULT_SETTINGS, uploads: true, floors: {} },
    '/admin/requests/settings': { settings: DEFAULT_SETTINGS, floors: {} },
    '/admin/stock': { stock: STOCK },
    '/admin/shipping': { config: JSON.parse(fs.readFileSync(path.join(ROOT, 'admin', 'shipping-config.json'), 'utf8')) },
    '/admin/schedule': { schedule: [] },
    '/admin/promos': { promos: [{ id: 'p1', code: 'TEST10', off: '10 %', active: true, status: 'active', used: 2, max: 10, expires: '2026-12-31' }, { id: 'p2', code: 'VIEUX', off: '5 €', active: false, status: 'expired', used: 0 }] },
    '/admin/access': { enabled: false, configured: false },
    '/admin/compta/status': { configured: true, pending: 0, ok: 12 },
    '/admin/backups': { backups: ['backup:2026-10-26', 'backup:latest'] },
    '/admin/obackups': { backups: ['obackup:2026-10-26', 'obackup:latest'] },
    '/admin/traffic': { days, totals: { views: 140, visitors: 63 }, live: 2 },
    '/admin/traffic/live': { live: 2 },
    '/admin/invoice': { invoice: { number: 'TEST-VG-TEST01', ref: 'VG-TEST01', date: Math.floor(now / 1000), currency: 'EUR', test: true, seller: { name: 'vgthmind', line2: 'Vitry-sur-Seine, France', siret: '000 000 000 00000', email: 'contact@vgthmind.org' }, customer: { name: 'Camille Test', address: ['1 rue des Lilas', '94400 Vitry-sur-Seine'], country: 'France', email: 'camille@example.invalid' }, lines: [{ name: 'Hoodie démo', size: 'M', qty: 1, unit: 80, amount: 80 }], shipping: 6, discount: 0, total: 86, vat: 'TVA non applicable, art. 293 B du CGI', credit: { number: 'AV-TEST-01' } } },
  };
  return table[pathname] ?? {};
}

export async function fakeNetwork(context, base) {
  // Fausse session admin (30 jours) : la connexion n'est jamais demandée, aucun identifiant n'est saisi.
  await context.addInitScript(() => { try { localStorage.setItem('vg-admin-session', 'vgs.' + (Math.floor(Date.now() / 1000) + 86400 * 30) + '.fake'); localStorage.setItem('vg-admin-last', String(Date.now())); sessionStorage.setItem('vg-gh-token', JSON.stringify({ t: 'faux-jeton', at: Date.now() })); } catch (e) {} });
  await context.route(/^https?:\/\//, (route) => {
    const u = new URL(route.request().url());
    if (u.origin === base) return route.continue();
    if (route.request().method() === 'OPTIONS') return json(route, {});
    if (u.hostname.endsWith('workers.dev')) return json(route, workerReply(u.pathname));
    if (u.hostname === 'api.github.com') {
      const m = /^\/repos\/[^/]+\/[^/]+\/contents\/(.*)$/.exec(u.pathname);
      const hit = m ? ghContents(decodeURIComponent(m[1])) : null;
      return hit ? json(route, hit) : json(route, { message: 'Not Found' }, 404);
    }
    return route.abort(); // tout le reste (Stripe, outils, polices externes…) est coupé
  });
}
