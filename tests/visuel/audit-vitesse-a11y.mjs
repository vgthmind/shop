// Audit vitesse + accessibilité des pages publiques en ligne (lecture seule). Usage : node tests/visuel/audit-vitesse-a11y.mjs [site]
import { launch, VIEWS } from './audit.mjs';
const site = process.argv[2] || 'https://www.vgthmind.org';
const PAGES = ['/', '/category/all/', '/product/ch_0002/', '/cart/', '/mentions-legales/', '/confidentialite/', '/infos-conditions-generales/', '/sur-demande/', '/contact//'];
const b = await launch(); if (!b) process.exit(2);
for (const [view, opts] of Object.entries(VIEWS)) {
  const ctx = await b.newContext(opts); const page = await ctx.newPage();
  for (const p of PAGES) {
    let bytes = 0, imgBytes = 0, big = [];
    page.removeAllListeners('response');
    page.on('response', async (r) => { try { const l = +(r.headers()['content-length'] || 0); bytes += l; if (/image\//.test(r.headers()['content-type'] || '')) { imgBytes += l; if (l > 250000) big.push(r.url().split('/').slice(-2).join('/') + ' ' + Math.round(l / 1024) + 'Ko'); } } catch {} });
    const t0 = Date.now(); const r = await page.goto(site + p, { waitUntil: 'networkidle' }); const ms = Date.now() - t0;
    const x = await page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); };
      const bgOf = (e) => { for (let n = e; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; const m = c.match(/[\d.]+/g); if (m && (m.length < 4 || +m[3] > .9)) return c; } return 'rgb(255,255,255)'; };
      const nolabel = [...document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]),select,textarea')].filter(vis).filter((e) => !(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.title).map((e) => e.outerHTML.slice(0, 80));
      const noalt = [...document.images].filter((i) => i.getAttribute('alt') === null).map((i) => i.src.slice(-40));
      const small = [...document.querySelectorAll('a,button,input,select,textarea,[role=button]')].filter(vis).map((e) => ({ e, r: e.getBoundingClientRect() })).filter(({ r }) => r.width < 44 || r.height < 44).map(({ e, r }) => (e.tagName + '.' + (e.className || '') + ' "' + (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 20) + '" ' + Math.round(r.width) + 'x' + Math.round(r.height)));
      const nameless = [...document.querySelectorAll('a,button')].filter(vis).filter((e) => !(e.textContent || '').trim() && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.title && !e.querySelector('img[alt]:not([alt=""])')).map((e) => e.outerHTML.slice(0, 80));
      const lowc = []; const seen = new Set();
      document.querySelectorAll('p,a,span,li,button,label,h1,h2,h3,small,div').forEach((e) => { if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return; if (!vis(e)) return; const s = getComputedStyle(e); const fg = lum(s.color), bg = lum(bgOf(e)); const cr = (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05); const fs = parseFloat(s.fontSize), bold = +s.fontWeight >= 700; const need = fs >= 24 || (fs >= 18.66 && bold) ? 3 : 4.5; const k = s.color + bgOf(e) + fs; if (cr < need && !seen.has(k)) { seen.add(k); lowc.push(cr.toFixed(2) + ' ' + e.tagName + ' "' + e.textContent.trim().slice(0, 25) + '" ' + s.color); } });
      const t = performance.getEntriesByType('navigation')[0]; const lcp = 0;
      return { lang: document.documentElement.lang, h1: document.querySelectorAll('h1').length, main: !!document.querySelector('main,[role=main]'), viewportZoomBlocked: /user-scalable=no|maximum-scale=1\b/.test(document.querySelector('meta[name=viewport]')?.content || ''), dcl: Math.round(t.domContentLoadedEventEnd), nolabel, noalt, nameless, small: small.slice(0, 8), nSmall: small.length, lowc: lowc.slice(0, 5), nLow: lowc.length, imgsNoSize: [...document.images].filter((i) => !i.getAttribute('width') && !i.getAttribute('height')).length, lazy: [...document.images].filter((i) => i.loading === 'lazy').length, nImgs: document.images.length };
    });
    // clavier : 30 tab, focus visible ?
    let noFocus = 0, tabs = 0; await page.evaluate(() => document.activeElement && document.activeElement.blur());
    for (let i = 0; i < 25; i++) { await page.keyboard.press('Tab'); const f = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const s = getComputedStyle(e); return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none' || e.matches(':focus-visible'); }); if (f === null) continue; tabs++; if (!f) noFocus++; }
    console.log(`${view} ${p} ${r.status()} ${ms}ms dcl=${x.dcl} ${Math.round(bytes / 1024)}Ko (img ${Math.round(imgBytes / 1024)}Ko) gros:${big.join(',') || '-'} | lang=${x.lang} h1=${x.h1} main=${x.main} zoomBloqué=${x.viewportZoomBlocked} | focus sans style ${noFocus}/${tabs} | imgs ${x.nImgs} lazy ${x.lazy} sansTaille ${x.imgsNoSize}`);
    for (const k of ['nolabel', 'noalt', 'nameless', 'small', 'lowc']) if (x[k].length) console.log('   ' + k + (k === 'small' ? ' (' + x.nSmall + ')' : k === 'lowc' ? ' (' + x.nLow + ')' : '') + ' :', JSON.stringify(x[k]));
  }
  await ctx.close();
}
await b.close();
