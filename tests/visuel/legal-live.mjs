// Pages légales en ligne en largeur iPhone : débordement, images, erreurs JS, restes de brouillon. Usage : node tests/visuel/legal-live.mjs [site]
import { launch, VIEWS } from './audit.mjs';
const site = process.argv[2] || 'https://www.vgthmind.org';
const b = await launch(); if (!b) process.exit(2);
const ctx = await b.newContext(VIEWS.phone); const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message.slice(0, 100)));
for (const p of ['/infos-conditions-generales/', '/mentions-legales/', '/confidentialite/', '/contact/', '/suivi/']) {
  await page.goto(site + p, { waitUntil: 'networkidle' });
  const r = await page.evaluate(() => {
    const t = document.body.innerText, w = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll('main *, table, pre')].filter((e) => e.getBoundingClientRect().right > w + 1).slice(0, 3).map((e) => e.tagName + '.' + e.className);
    const small = [...document.querySelectorAll('main p, main li')].filter((e) => parseFloat(getComputedStyle(e).fontSize) < 13).length;
    return { len: t.length, over: document.documentElement.scrollWidth - w, wide, small, draft: (t.match(/brouillon|à compléter|\[.{0,20}\]|lorem|TODO|XXX|undefined|NaN/gi) || []).slice(0, 5), h1: document.querySelectorAll('h1').length, broken: [...document.images].filter((i) => i.complete && !i.naturalWidth).length };
  });
  console.log(p, JSON.stringify(r));
}
console.log('erreurs JS :', errs.length ? errs : 'aucune'); await b.close();
