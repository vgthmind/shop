// Vérifie un site en ligne après la bascule (ou un aperçu local) : adresses de l'ancienne boutique, référencement, paiement autorisé.
//   node outils/verifier-site.mjs https://www.vgthmind.org            (site public : refuse noindex / Disallow)
//   node outils/verifier-site.mjs http://127.0.0.1:8102 --prive        (aperçu : accepte noindex)
// Ne fait que des lectures (GET / OPTIONS). Code de sortie 1 s'il y a un problème.
const origin = (process.argv[2] || '').replace(/\/$/, '');
const priv = process.argv.includes('--prive');
const worker = process.env.WORKER || 'https://vgthmind-shop-checkout.vgthm66.workers.dev';
if (!/^https?:\/\//.test(origin)) { console.error('Usage : node outils/verifier-site.mjs https://www.vgthmind.org [--prive]'); process.exit(2); }
const bad = [];
const ok = (m) => console.log('  ok  ' + m);
const ko = (m) => { bad.push(m); console.log('  KO  ' + m); };
const get = async (p, opt = {}) => { try { const r = await fetch(origin + p, { redirect: 'manual', ...opt }); return r; } catch (e) { return { status: 0, error: String(e.cause && e.cause.code || e.message), text: async () => '', headers: new Headers() }; } };

const products = await (async () => { const r = await get('/products.json'); if (r.status !== 200) { ko('/products.json : ' + (r.status || r.error)); return []; } ok('/products.json'); return r.json(); })();

console.log('Adresses de l\'ancienne boutique');
const paths = ['/', '/products', '/cart', '/contact', ...['all', 'latest-drop', 'tops', 'customsupcycling', 'pantsshorts', 'merch', 'accessories'].map((c) => '/category/' + c), ...products.map((p) => '/product/' + encodeURIComponent(p.permalink)),
  '/infos-conditions-generales', '/mentions-legales', '/confidentialite', '/sur-demande', '/suivi', '/sitemap.xml', '/robots.txt'];
for (const p of paths) {
  let r = await get(p);
  // /category/x -> /category/x/ (redirection de dossier) : on la suit une fois.
  if ([301, 302, 307, 308].includes(r.status)) { const loc = r.headers.get('location') || ''; if (loc.replace(origin, '').replace(/\/$/, '') === p.replace(/\/$/, '')) r = await get(loc.replace(origin, '')); }
  if (r.status === 200) { if (!process.env.QUIET) ok(p); } else ko(`${p} -> ${r.status || r.error}`);
}

console.log('Référencement');
const robots = await (await get('/robots.txt')).text();
if (!priv) {
  if (/^Disallow:\s*\/\s*$/m.test(robots)) ko('robots.txt bloque tout le site'); else ok('robots.txt ouvert');
  if (!new RegExp('Sitemap: ' + origin.replace(/[.]/g, '\\.') + '/sitemap.xml').test(robots)) ko('robots.txt : ligne Sitemap absente ou mauvais domaine'); else ok('Sitemap déclaré');
  const sm = await (await get('/sitemap.xml')).text();
  if (!sm.includes('<loc>' + origin + '/')) ko('sitemap.xml : adresses d\'un autre domaine'); else ok('sitemap.xml sur ' + origin);
  const home = await (await get('/')).text();
  if (/name="robots" content="noindex/i.test(home)) ko('accueil : noindex présent'); else ok('accueil sans noindex');
  const fiche = products[0] ? await (await get('/product/' + encodeURIComponent(products[0].permalink))).text() : '';
  if (fiche && !fiche.includes(`rel="canonical" href="${origin}/product/`)) ko('fiche : adresse canonique différente du domaine'); else ok('adresse canonique de la fiche');
  const admin = await get('/admin/menu.html');
  if (admin.status === 200 && !/Connexion/i.test(await admin.text())) ko('admin accessible sans connexion ?'); else ok('admin protégé (statut ' + admin.status + ')');
}

console.log('Paiement (le service de commande accepte ce site)');
try {
  const pre = await fetch(worker + '/shipping/quote', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  const allow = pre.headers.get('access-control-allow-origin');
  if (allow === origin || allow === '*') ok('Worker : origine acceptée'); else ko('Worker : origine refusée (ALLOWED_ORIGIN) : ' + allow);
  const q = await fetch(worker + '/shipping/quote', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ items: products[0] ? [{ slug: products[0].permalink, qty: 1 }] : [], country: 'FR' }) });
  const j = await q.json().catch(() => ({}));
  if (q.status === 200 && j.ok) ok('Worker : prix de livraison calculé'); else ko('Worker : /shipping/quote -> ' + q.status + ' ' + JSON.stringify(j).slice(0, 100));
} catch (e) { ko('Worker injoignable : ' + e.message); }

console.log(bad.length ? `\n${bad.length} problème(s).` : '\nTout est bon.');
process.exit(bad.length ? 1 : 0);
