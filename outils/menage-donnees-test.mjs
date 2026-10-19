// Ménage des données de TEST avant la mise en ligne. PAR DÉFAUT NE SUPPRIME RIEN : affiche ce qui serait supprimé et ce qui serait gardé.
//
//   node outils/menage-donnees-test.mjs --avant=2026-10-25                 (aperçu : lectures seulement)
//   node outils/menage-donnees-test.mjs --avant=2026-10-25 --kv            (aperçu, avec le stockage KV via wrangler)
//   node outils/menage-donnees-test.mjs --avant=2026-10-25 --kv --apply    (supprime pour de vrai, après relecture de l'aperçu)
//
// --avant=AAAA-MM-JJ : tout ce qui a été créé AVANT ce jour (heure de Paris, minuit) est du test (demandes, visites).
//                      À fixer au jour des derniers essais : une vraie demande reçue après ne sera jamais touchée.
// Session admin : variable VG_ADMIN_TOKEN (dans l'admin ouvert dans Chrome : F12, Console, copy(localStorage['vg-admin-session'])).
//                 Elle donne accès à ton admin : ne la colle nulle part ailleurs ; elle expire seule.
// Jamais touchés : pièces, photos des pièces, réglages (Demandes > Réglages, délais, prix), grille d'expédition, drops programmés,
//                  commandes RÉELLES (livemode = true), sauvegardes du stock (backup:*), sessions admin, compte Stripe lui-même.
// Les données de Stripe en mode test (commandes, codes promo, clients) se suppriment dans Stripe : Mode test > Développeurs > « Supprimer toutes les données de test ».
import { execFileSync } from 'node:child_process';
import readline from 'node:readline';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = (process.env.WORKER || 'https://vgthmind-shop-checkout.vgthm66.workers.dev').replace(/\/$/, '');

// Jour AAAA-MM-JJ -> minuit à Paris (ms). Heure d'été/hiver gérée par Intl.
export function parisMidnight(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], 0, 0, 0);
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const parisAt = (ts) => { const o = {}; fmt.formatToParts(new Date(ts)).forEach((x) => { o[x.type] = x.value; }); return Date.UTC(+o.year, +o.month - 1, +o.day, (+o.hour) % 24, +o.minute); };
  let ts = guess - (parisAt(guess) - guess);
  ts = guess - (parisAt(ts) - ts);
  return ts;
}

// Choisit ce qui est supprimé et ce qui est gardé. Pur (sans réseau) : testé dans tests/menage.test.mjs.
//   data : { orders, requests, stock, names, trafficDays, kvKeys, kvRefs }  ; cutoff : ms
export function plan(data, cutoff) {
  const orders = data.orders || [];
  const testOrders = orders.filter((o) => o.livemode === false);
  const realOrders = orders.filter((o) => o.livemode !== false);
  const requests = data.requests || [];
  const oldReq = requests.filter((r) => Number(r.created) < cutoff);
  const keepReq = requests.filter((r) => !(Number(r.created) < cutoff));
  // Stock : seules les lignes modifiées (par une vente de test ou à la main) ; effacer la ligne = retour à la quantité du catalogue.
  const testSlugs = new Set();
  const bySlugName = new Map(Object.entries(data.names || {}).map(([slug, name]) => [String(name), slug]));
  for (const o of testOrders) for (const it of o.items || []) { const slug = it.slug || bySlugName.get(String(it.name)); if (slug) testSlugs.add(slug); }
  for (const slug of Object.keys(data.stock || {})) if (/^test/i.test(slug)) testSlugs.add(slug);
  const stockReset = [...testSlugs].filter((s) => data.stock && data.stock[s] && data.stock[s].fromCatalog === false);
  const days = (data.trafficDays || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && parisMidnight(d) < cutoff);
  // KV : clés qui portent un identifiant de session de TEST (cs_test_…), états de connexion/limites, sauvegardes de commandes.
  const refTest = new Set((data.kvRefs || []).filter((r) => String(r.value).startsWith('cs_test_')).map((r) => r.key));
  const kvDelete = (data.kvKeys || []).filter((k) => /cs_test_/.test(k) || refTest.has(k) || /^(rl:|oauth:|oauthx:|lc:|obackup:)/.test(k));
  return { testOrders, realOrders, oldReq, keepReq, stockReset, days, kvDelete };
}

async function api(token, p, opts = {}) {
  const r = await fetch(WORKER + p, { ...opts, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${p} : ${r.status} ${d.error || ''}`);
  return d;
}

function wrangler(args) {
  return execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler@4', ...args], { cwd: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'checkout-worker'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' });
}

function testPieces(root) {
  const dir = path.join(root, 'data', 'products');
  const out = [];
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (!f.endsWith('.json')) continue;
    let p; try { p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
    if (/^test/i.test(String(p.slug || f.replace(/\.json$/, ''))) || /^(test|fiche test|nouvelle pièce test)/i.test(String(p.name || ''))) out.push({ file: 'data/products/' + f, slug: p.slug, name: p.name, images: (p.images || []).map((i) => String(i).replace(/^\//, '')) });
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const useKv = args.includes('--kv');
  const avant = (args.find((a) => a.startsWith('--avant=')) || '').slice(8);
  const cutoff = parisMidnight(avant);
  if (!cutoff) {
    const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    console.error('Il manque la date limite. Écris par exemple :\n  node outils/menage-donnees-test.mjs --avant=' + demain + ' --kv\n--avant = le lendemain du jour de ton dernier essai : tout ce qui a été créé AVANT ce jour est du test et pourra être supprimé ; ce qui arrive après n\'est jamais touché.');
    process.exit(2);
  }
  let token = process.env.VG_ADMIN_TOKEN || '';
  if (!token && process.stdin.isTTY) {
    // Pas de variable : on la demande ici (elle s'affiche à l'écran pendant que tu la colles : ferme la fenêtre PowerShell ensuite).
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    token = (await new Promise((r) => rl.question('Colle ici la session admin (Chrome, admin ouvert et connecté, F12, onglet Console : copy(localStorage[\'vg-admin-session\'])), puis Entrée : ', r))).trim();
    rl.close();
  }
  if (!token) { console.error('Il manque la session admin (variable VG_ADMIN_TOKEN, voir l\'en-tête du fichier).'); process.exit(2); }
  console.log(apply ? '=== SUPPRESSION RÉELLE ===' : '=== APERÇU : rien n\'est supprimé (ajoute --apply pour supprimer) ===');
  console.log('Test = créé avant le ' + avant + ' à minuit (Paris).\n');

  const data = {};
  try { data.orders = (await api(token, '/orders')).orders || []; } catch (e) {
    console.error(/401/.test(e.message) ? 'La session admin est refusée ou expirée : reconnecte-toi dans l\'admin, recopie-la, et recommence. Rien n\'a été supprimé.' : 'Impossible de lire les commandes (' + e.message + '). Rien n\'a été supprimé.');
    process.exit(1);
  }
  data.requests = (await api(token, '/admin/requests')).requests || [];
  const st = await api(token, '/admin/stock');
  data.stock = st.stock || {};
  data.names = st.names || {};
  try {
    const t = await api(token, '/admin/traffic?days=400');
    const set = new Set(); JSON.stringify(t, (k, v) => { if (/^\d{4}-\d{2}-\d{2}$/.test(k)) set.add(k); if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) set.add(v); return v; });
    data.trafficDays = [...set];
  } catch (e) { data.trafficDays = []; console.log('(Visites : lecture impossible, ' + e.message + ')'); }
  if (useKv) {
    try { wrangler(['--version']); } catch (e) { console.error('--kv demande wrangler (installé avec npx) et une connexion Cloudflare : dans le dossier checkout-worker, lance une fois « npx wrangler@4 login », puis recommence. Rien n\'a été supprimé.'); process.exit(1); }
    const keys = []; let cursor = '';
    for (let i = 0; i < 50; i++) {
      const out = JSON.parse(wrangler(['kv', 'key', 'list', '--binding', 'HOLDS', '--remote'].concat(cursor ? ['--cursor', cursor] : [])));
      const list = Array.isArray(out) ? out : out.keys || [];
      list.forEach((k) => keys.push(k.name));
      cursor = Array.isArray(out) ? '' : out.cursor || '';
      if (!cursor) break;
    }
    data.kvKeys = keys;
    data.kvRefs = [];
    for (const k of keys.filter((x) => /^ref:/.test(x))) data.kvRefs.push({ key: k, value: wrangler(['kv', 'key', 'get', k, '--binding', 'HOLDS', '--remote']).trim() });
  }
  const p = plan(data, cutoff);
  const pieces = testPieces(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));

  console.log('SUPPRIMÉ');
  console.log(` - Demandes de test (créées avant le ${avant}) : ${p.oldReq.length}` + (p.oldReq.length ? ' (' + p.oldReq.map((r) => r.id).join(', ') + ') + leurs fichiers R2' : ''));
  console.log(` - Stock : lignes à remettre à la quantité du catalogue : ${p.stockReset.length}` + (p.stockReset.length ? ' (' + p.stockReset.join(', ') + ')' : ''));
  console.log(` - Visites des jours de test à remettre à zéro : ${p.days.length}`);
  if (useKv) console.log(` - KV (états d'expédition/remboursement/numéros des commandes de test, limites, connexions en cours, sauvegardes de commandes) : ${p.kvDelete.length} clés`);
  console.log(` - Commandes de TEST (${p.testOrders.length}, ${p.testOrders.map((o) => o.ref).filter(Boolean).join(', ') || '—'}) : se suppriment dans Stripe (mode Test > Supprimer toutes les données de test), pas ici.`);
  console.log(' - Codes promo de test : même chose (ils partent avec les données de test de Stripe).');
  console.log(` - Pièces de test (${pieces.length}) : ${pieces.map((x) => x.slug).join(', ') || 'aucune'} : à retirer du dépôt (commandes ci-dessous).`);
  console.log('GARDÉ');
  console.log(` - Commandes RÉELLES : ${p.realOrders.length} (jamais touchées)`);
  console.log(` - Demandes créées à partir du ${avant} : ${p.keepReq.length}`);
  console.log(' - Pièces (hors pièces de test), photos, réglages (prix, délais, acompte, photos des cartes), grille d\'expédition, drops programmés, sauvegardes du stock, sessions admin.');
  if (pieces.length) {
    console.log('\nPièces de test : à lancer À LA MAIN dans vgthmind-shop, après relecture (puis npm run build, npm test, commit) :');
    for (const x of pieces) console.log('  git rm -r -q ' + x.file + ' ' + [...new Set(x.images.map((i) => i.replace(/\/[^/]*$/, '')))].filter((d) => fs.existsSync(d)).join(' '));
  }
  if (!apply) { console.log('\nAperçu terminé. Rien n\'a été supprimé.'); return; }

  console.log('\nSuppression en cours…');
  for (const r of p.oldReq) { await api(token, '/admin/requests/delete', { method: 'POST', body: JSON.stringify({ id: r.id }) }); console.log('  demande ' + r.id + ' supprimée'); }
  if (p.stockReset.length) { await api(token, '/admin/stock/delete', { method: 'POST', body: JSON.stringify({ slugs: p.stockReset }) }); console.log('  stock remis au catalogue : ' + p.stockReset.join(', ')); }
  for (const d of p.days) { await api(token, '/admin/traffic/reset', { method: 'POST', body: JSON.stringify({ day: d }) }); console.log('  visites du ' + d + ' remises à zéro'); }
  if (useKv && p.kvDelete.length) {
    const f = path.join(os.tmpdir(), 'vg-kv-delete-' + Date.now() + '.json');
    fs.writeFileSync(f, JSON.stringify(p.kvDelete));
    try { console.log(wrangler(['kv', 'bulk', 'delete', f, '--binding', 'HOLDS', '--remote', '--force']).trim()); } finally { fs.rmSync(f, { force: true }); }
  }
  // Nouvelle sauvegarde propre du stock (backup:latest) : repart d'un état sans test.
  try { await api(token, '/admin/backup', { method: 'POST' }); console.log('  sauvegarde du stock refaite'); } catch (e) { console.log('  (sauvegarde du stock à refaire à la main : ' + e.message + ')'); }
  console.log('\nTerminé. Reste à la main : Stripe (données de test), pièces de test (git rm ci-dessus), boîte contact@ (mails d\'essai).');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error('Erreur : ' + e.message); process.exit(1); });
