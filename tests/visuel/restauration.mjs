// Restauration depuis le fichier du mail de nuit : faux Worker, fausses données, aucun réseau réel.
// Usage : node tests/visuel/restauration.mjs
import { launch, VIEWS } from './audit.mjs';
import { startServer, fakeNetwork } from './fixtures.mjs';

const FILE = {
  date: '2026-11-01',
  stock: { date: '2026-11-01', stock: { 'piece-a': 1, 'piece-b': 5, 'piece-d': 3 } },
  orders: { date: '2026-11-01', shipped: { cs_live_fake1: { at: 1 } }, preparing: {}, refs: { cs_live_fake1: 'VG-ABC123' } },
  requests: { date: '2026-11-01', requests: [{ id: 'D-FAKE01', name: 'Faux Client' }, { id: 'D-FAKE02', name: 'Autre Faux' }] },
};
const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(body) });

const browser = await launch();
if (!browser) { console.log('Aucun navigateur.'); process.exit(2); }
const { srv, base } = await startServer();
const problems = [];
try {
  for (const [view, opts] of Object.entries(VIEWS)) {
    const ctx = await browser.newContext(opts);
    await fakeNetwork(ctx, base);
    const posts = {};
    await ctx.route(/workers\.dev\/admin\/(stock|obackup-restore|requests\/restore)$/, (route) => {
      const r = route.request(); if (r.method() === 'OPTIONS') return json(route, {});
      if (r.method() === 'GET') return json(route, { stock: { 'piece-a': { stock: 1 }, 'piece-b': { stock: 2 }, 'piece-c': { stock: 0 } } });
      const u = new URL(r.url()).pathname; posts[u] = JSON.parse(r.postData() || 'null');
      return json(route, u.endsWith('/stock') ? { stock: {} } : { ok: true, restored: u.includes('requests') ? 2 : 2 });
    });
    const page = await ctx.newPage(); page.on('dialog', (d) => d.accept());
    const errs = []; page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
    await page.goto(base + '/admin/reglages-sauvegardes.html'); await page.waitForTimeout(900);
    const buf = Buffer.from(JSON.stringify(FILE));
    await page.locator('#restore').setInputFiles({ name: 'vgthmind-sauvegarde-2026-11-01.json', mimeType: 'application/json', buffer: buf }); await page.waitForTimeout(600);
    const sm = await page.locator('#smsg').innerText();
    const st = posts['/admin/stock'] && posts['/admin/stock'].stock;
    if (!st || JSON.stringify(st) !== JSON.stringify({ 'piece-b': 5, 'piece-d': 3 })) problems.push(`[${view}] stock : envoyé ${JSON.stringify(st)} (attendu piece-b 5 et piece-d 3 seulement)`);
    if (!/2 quantité/.test(sm)) problems.push(`[${view}] stock : message « ${sm} »`);
    await page.locator('#b-restore').setInputFiles({ name: 'f.json', mimeType: 'application/json', buffer: buf }); await page.waitForTimeout(700);
    const om = await page.locator('#bmsg').innerText();
    const o = posts['/admin/obackup-restore'];
    if (!o || !o.shipped || !o.shipped.cs_live_fake1 || o.stock || o.requests) problems.push(`[${view}] commandes : corps envoyé ${JSON.stringify(o)}`);
    const rq = posts['/admin/requests/restore'];
    if (!rq || rq.requests.length !== 2) problems.push(`[${view}] demandes : corps ${JSON.stringify(rq)}`);
    if (!/2 entrées restaurées ; 2 demande/.test(om)) problems.push(`[${view}] message commandes : « ${om} »`);
    // fichier invalide : message d'erreur clair, rien d'envoyé
    for (const k of Object.keys(posts)) delete posts[k];
    await page.locator('#restore').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('pas du json') }); await page.waitForTimeout(400);
    if (!/impossible/.test(await page.locator('#smsg').innerText()) || posts['/admin/stock']) problems.push(`[${view}] fichier invalide : pas de message d'échec`);
    await page.locator('#b-restore').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('pas du json') }); await page.waitForTimeout(400);
    console.log(`[${view}] msgs :`, sm, '|', om, '|', await page.locator('#bmsg').innerText());
    errs.forEach((e) => problems.push(`[${view}] erreur JS : ${e}`));
    await ctx.close();
  }
} finally { await browser.close(); srv.close(); }
problems.forEach((p) => console.log(p)); console.log(problems.length ? problems.length + ' problème(s)' : 'Restauration : aucun problème'); process.exit(problems.length ? 1 : 0);
