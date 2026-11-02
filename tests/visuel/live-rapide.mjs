// Contrôle rapide en ligne (lecture seule) : pages publiques + connexion admin, PC et iPhone. Usage : node tests/visuel/live-rapide.mjs [site]
import { launch, VIEWS } from './audit.mjs';
const site = process.argv[2] || 'https://www.vgthmind.org';
const b = await launch(); if (!b) process.exit(2);
let bad = 0;
for (const [view, opts] of Object.entries(VIEWS)) {
  const ctx = await b.newContext(opts); const page = await ctx.newPage(); const errs = []; const fails = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 100))); page.on('requestfailed', (r) => fails.push(r.url().slice(0, 80)));
  for (const p of ['/', '/product/ch_0002/', '/admin/connexion', '/admin/reglages-sauvegardes.html']) {
    const r = await page.goto(site + p, { waitUntil: 'networkidle' });
    const x = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, broken: [...document.images].filter((i) => i.complete && !i.naturalWidth).length, t: document.title }));
    console.log(view, p, '->', page.url().replace(site, ''), r.status(), JSON.stringify(x)); if (x.over > 1 || x.broken) bad++;
  }
  console.log(view, 'erreurs JS :', errs.length ? errs : 'aucune', '| requêtes échouées :', fails.length ? fails : 'aucune'); bad += errs.length;
  await ctx.close();
}
await b.close(); process.exit(bad ? 1 : 0);
