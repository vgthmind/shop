// Chaque bouton de chaque page admin donne-t-il un retour visible (texte, classe, fenêtre) ? Faux Worker : réponses vides, donc un retour d'erreur compte aussi.
// Usage : node tests/visuel/boutons.mjs
import { launch, PAGES } from './audit.mjs';
import { startServer, fakeNetwork } from './fixtures.mjs';
const b = await launch(); if (!b) process.exit(2);
const { srv, base } = await startServer();
const none = [];
const SKIP = /déconnexion|se déconnecter|retour|menu|←/i;
for (const name of PAGES) {
  const ctx = await b.newContext({ viewport: { width: 1000, height: 900 } }); await fakeNetwork(ctx, base);
  const page = await ctx.newPage(); let dialogs = 0; page.on('dialog', (d) => { dialogs++; d.dismiss(); }); page.on('pageerror', () => {});
  await page.goto(base + '/admin/' + name + '.html'); await page.waitForTimeout(900);
  const n = await page.locator('button:visible, .vg-btn:visible').count();
  for (let i = 0; i < Math.min(n, 40); i++) {
    const el = page.locator('button:visible, .vg-btn:visible').nth(i);
    const label = ((await el.innerText().catch(() => '')) || (await el.getAttribute('aria-label').catch(() => '')) || '').trim().slice(0, 40);
    if (!label || SKIP.test(label) || (await el.evaluate((e) => e.tagName === 'A' || !!e.querySelector('input[type=file]') || e.closest('label') || e.disabled).catch(() => true))) continue;
    const before = await page.evaluate(() => document.body.innerText + '|' + document.body.innerHTML.length + '|' + document.querySelectorAll('[class]').length);
    dialogs = 0; const url0 = page.url();
    await el.click({ timeout: 1500, noWaitAfter: true }).catch(() => {}); await page.waitForTimeout(450);
    const after = await page.evaluate(() => document.body.innerText + '|' + document.body.innerHTML.length + '|' + document.querySelectorAll('[class]').length).catch(() => 'nav');
    if (after === before && !dialogs && page.url() === url0) none.push(`${name} : « ${label} » (aucun retour visible)`);
    if (page.url() !== url0) await page.goto(base + '/admin/' + name + '.html').then(() => page.waitForTimeout(500));
  }
  await ctx.close();
}
await b.close(); srv.close();
console.log(none.join('\n') || 'Tous les boutons donnent un retour'); console.log(none.length + ' sans retour');
