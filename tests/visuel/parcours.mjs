// Parcours admin sur de fausses données : suivi de colis (Enregistrer, Actualiser, pastilles En transit / Livrée / Problème) et visionneuse photo/vidéo/PDF (« ← Retour »).
// Usage : node tests/visuel/parcours.mjs   (code 1 s'il y a un problème). Aucun appel réseau réel.
import { launch, VIEWS } from './audit.mjs';
import { startServer, fakeNetwork, workerReply } from './fixtures.mjs';

export async function runParcours() {
  const browser = await launch();
  if (!browser) return null;
  const { srv, base } = await startServer();
  const problems = [];
  try {
    for (const [view, opts] of Object.entries(VIEWS)) {
      const ctx = await browser.newContext(opts);
      await fakeNetwork(ctx, base);
      // Le faux Worker répond maintenant « livrée », puis « problème » : on vérifie la pastille à chaque fois.
      let state = 'delivered';
      await ctx.route(/workers\.dev\/orders\/tracking/, (route) => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
        const base0 = workerReply('/orders/tracking'), now = Math.floor(Date.now() / 1000);
        const shipped = { ...base0.shipped, track: { state, label: state === 'delivered' ? 'Livré' : 'Incident', checked: now, ok: now, events: [] } };
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, lp: 'ok', shipped }) });
      });
      const page = await ctx.newPage();
      const errs = []; page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
      await page.goto(base + '/admin/commandes.html'); await page.waitForTimeout(900);
      await page.locator('[data-f=done]').first().click(); await page.waitForTimeout(300);
      for (const [st, label] of [['delivered', 'Livrée'], ['problem', 'Problème']]) {
        state = st;
        const shipped = page.locator('.order', { has: page.locator('[data-trk-save]') }).first();
        if (!(await shipped.locator('.trk-in').isVisible())) { await shipped.locator('.sum').click(); await page.waitForTimeout(250); }
        await shipped.locator('.trk-in').fill('6A12345678901').catch(() => {});
        await shipped.locator('[data-trk-save], [data-trk-refresh]').first().click(); await page.waitForTimeout(500);
        const txt = await page.locator('.order', { has: page.locator('[data-trk-refresh]') }).first().innerText().catch(() => '');
        if (!new RegExp(label).test(txt)) problems.push(`[${view}] suivi : pastille « ${label} » absente`);
        const msg = await page.evaluate(() => (document.getElementById('msg') || {}).textContent || '');
        if (!/Suivi enregistré/.test(msg)) problems.push(`[${view}] suivi : message « ${msg.slice(0, 50)} »`);
        const card2 = page.locator('.order', { has: page.locator('[data-trk-refresh]') }).first();
        if (!(await card2.locator('[data-trk-refresh]').isVisible())) { await card2.locator('.sum').click(); await page.waitForTimeout(250); }
        const refresh = card2.locator('[data-trk-refresh]');
        await refresh.click(); await page.waitForTimeout(400);
        if (!new RegExp(label).test(await page.locator('.order', { has: page.locator('[data-trk-refresh]') }).first().innerText().catch(() => ''))) problems.push(`[${view}] Actualiser : pastille « ${label} » perdue`);
      }
      // Visionneuse : image, vidéo, PDF (adresse blob:) ; « ← Retour » en haut, ≥ 44 px, ferme l'onglet.
      await page.goto(base + '/admin/demandes.html'); await page.waitForTimeout(900);
      for (const kind of ['image', 'video', 'pdf']) {
        const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 6000 }), page.evaluate((k) => window.VGInvoice.openViewer('blob:fake-' + k, k), kind)]).catch(() => [null]);
        if (!pop) { problems.push(`[${view}] visionneuse ${kind} : aucun onglet ouvert`); continue; }
        await pop.waitForTimeout(400);
        const r = await pop.evaluate(() => { const b = document.getElementById('vg-back'), r = b && b.getBoundingClientRect(); return { back: !!b, top: r ? Math.round(r.top) : null, h: r ? Math.round(r.height) : 0, over: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
        if (!r.back) problems.push(`[${view}] visionneuse ${kind} : « ← Retour » absent`);
        else { if (r.h < 44) problems.push(`[${view}] visionneuse ${kind} : bouton Retour ${r.h} px`); if (r.top > 40) problems.push(`[${view}] visionneuse ${kind} : Retour pas en haut`);
          await pop.locator('#vg-back').click(); await page.waitForTimeout(600); if (!pop.isClosed()) problems.push(`[${view}] visionneuse ${kind} : Retour ne ferme pas l'onglet`); }
        if (r.over > 1) problems.push(`[${view}] visionneuse ${kind} : débordement ${r.over} px`);
        if (!pop.isClosed()) await pop.close();
      }
      errs.forEach((e) => problems.push(`[${view}] erreur JS : ${e}`));
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
  return problems;
}
if (process.argv[1] && /parcours\.mjs$/.test(process.argv[1])) {
  const p = await runParcours();
  if (p === null) { console.log('Aucun navigateur trouvé.'); process.exit(2); }
  p.forEach((x) => console.log(x)); console.log(p.length ? p.length + ' problème(s)' : 'Parcours : aucun problème'); process.exit(p.length ? 1 : 0);
}
