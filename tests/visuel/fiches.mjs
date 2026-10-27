// Fiches pièces : construit le site dans un dossier temporaire, ouvre chaque fiche dans Edge/Chrome (PC et iPhone) et vérifie
// qu'aucune erreur JavaScript ne casse la page, qu'aucun cadre Instagram n'est inséré, et que le lien Instagram s'affiche bien
// (vidéo + bouton pour un reel avec MP4, sinon un simple bouton « Voir sur Instagram »). Aucun appel réseau externe (tout est coupé).
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { launch, VIEWS } from './audit.mjs';
import { ROOT } from './fixtures.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };

export async function runFiches() {
  const browser = await launch();
  if (!browser) return null;
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-fiches-'));
  // Comme Cloudflare : le catalogue est regénéré depuis data/products avant la construction ; data/catalog.json est remis tel quel ensuite.
  const catPath = path.join(ROOT, 'data', 'catalog.json'), catBefore = fs.readFileSync(catPath);
  try {
    execFileSync(process.execPath, ['generator/build-catalog.js'], { cwd: ROOT, stdio: 'ignore' });
    execFileSync(process.execPath, ['generator/build.js'], { cwd: ROOT, env: { ...process.env, OUT_DIR: out, CF_PAGES: '1' }, stdio: 'ignore' });
  } finally { fs.writeFileSync(catPath, catBefore); }
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); let f = path.join(out, p);
    if (!f.startsWith(out)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const items = fs.readdirSync(path.join(ROOT, 'data', 'products')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'products', f), 'utf8'))).filter((p) => p.slug && !/^test/.test(p.slug));
  const problems = [];
  try {
    for (const [view, opts] of Object.entries(VIEWS)) {
      const ctx = await browser.newContext(opts);
      await ctx.route(/^https?:\/\//, (r) => (new URL(r.request().url()).origin === base ? r.continue() : r.abort()));
      for (const p of items) {
        const pg = await ctx.newPage(); const errs = [];
        pg.on('pageerror', (e) => errs.push(e.message.slice(0, 100)));
        await pg.goto(base + '/product/' + encodeURIComponent(p.slug) + '/', { waitUntil: 'load' }).catch((e) => errs.push('ouverture : ' + e.message.slice(0, 60)));
        await pg.waitForTimeout(700);
        const m = await pg.evaluate(() => ({ iframe: document.querySelectorAll('iframe[src*=instagram]').length, link: !!document.querySelector('.ig-reel-linkonly'), video: !!document.querySelector('video.ig-reel-video'), ext: !!document.querySelector('.ig-reel-extlink'), gray: !!document.querySelector('.ig-reel-embed:not(.ig-reel-has-video)'), over: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
        const tag = `[${view}] ${p.slug}`;
        errs.forEach((e) => problems.push(`${tag} : erreur JS : ${e}`));
        if (m.iframe) problems.push(`${tag} : cadre Instagram inséré`);
        if (m.gray) problems.push(`${tag} : cadre gris vide`);
        if (m.over > 1) problems.push(`${tag} : débordement horizontal de ${m.over} px`);
        if (p.reel_url && !(m.link || (m.video && m.ext))) problems.push(`${tag} : lien Instagram absent`);
        if (!p.reel_url && (m.link || m.video)) problems.push(`${tag} : bloc Instagram affiché sans lien`);
        if (/instagram\.com\/(?:p|tv)\//.test(p.reel_url || '') && !m.link) problems.push(`${tag} : un post devrait avoir seulement le bouton`);
        await pg.close();
      }
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); fs.rmSync(out, { recursive: true, force: true }); }
  return problems;
}
if (process.argv[1] && /fiches\.mjs$/.test(process.argv[1])) {
  const p = await runFiches();
  if (p === null) { console.log('Aucun navigateur trouvé.'); process.exit(2); }
  p.forEach((x) => console.log(x)); console.log(p.length ? p.length + ' problème(s)' : 'Fiches : aucun problème'); process.exit(p.length ? 1 : 0);
}
