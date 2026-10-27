// Contrôle visuel de l'admin (iPhone 390 px et PC 1440 px) avec de fausses données.
// Usage : node tests/visuel/audit.mjs [dossier-captures]   (sans dossier : pas de captures)
// Sortie : une ligne par problème ; code 1 s'il y en a. Navigateur : Edge ou Chrome déjà installé (aucun téléchargement).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, fakeNetwork } from './fixtures.mjs';

export const PAGES = ['menu', 'commandes', 'demandes', 'catalogue', 'nouvelle-piece', 'reglages', 'reglages-acces', 'reglages-aide', 'reglages-compta', 'reglages-demandes', 'reglages-livraison', 'reglages-promos', 'reglages-sante', 'reglages-sauvegardes', 'reglages-videos', 'reglages-visites'];
export const VIEWS = { phone: { viewport: { width: 390, height: 1300 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }, desktop: { viewport: { width: 1440, height: 900 } } };

export async function launch() {
  for (const channel of ['msedge', 'chrome']) { try { return await chromium.launch({ channel }); } catch (e) { /* suivant */ } }
  return null;
}

// Mesures faites dans la page : débordement horizontal, zones tactiles < 44 px, éléments qui sortent de l'écran, texte coupé.
export const measure = () => {
  const W = document.documentElement.clientWidth, out = { overflowX: document.documentElement.scrollWidth - W, small: [], outside: [], clipped: [] };
  const label = (e) => ((e.innerText || e.value || e.getAttribute('aria-label') || e.id || e.className || e.tagName) + '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const visible = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden]') && !e.closest('[aria-hidden=true]'); };
  document.querySelectorAll('button, a[href], summary, select, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), textarea, [role=button]').forEach((e) => {
    if (!visible(e) || e.closest('.thumb, .cardset') || e.classList.contains('brand')) return;
    const r = e.getBoundingClientRect();
    if (e.tagName === 'A' && getComputedStyle(e).display === 'inline' && !e.className) return; // lien dans une phrase
    if (r.height < 43.5) out.small.push(label(e) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    if (r.right > W + 1 || r.left < -1) out.outside.push(label(e));
    if (/BUTTON|A|SUMMARY/.test(e.tagName) && e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'visible') out.clipped.push(label(e));
  });
  document.querySelectorAll('main *, .vg-page *').forEach((e) => { if (e.children.length === 0 && visible(e) && e.getBoundingClientRect().right > W + 1 && !e.closest('table, pre, [style*=overflow], .scroll')) out.outside.push('texte:' + label(e)); });
  const nav = document.getElementById('vg-nav');
  if (nav && W < 760) { const nb = nav.getBoundingClientRect(); out.navBottom = Math.round(window.innerHeight - nb.bottom); out.navTop = Math.round(nb.top); }
  return out;
};

export async function auditPage(page, base, name, view, shotDir) {
  const problems = [];
  await page.goto(base + '/admin/' + name + '.html', { waitUntil: 'load' });
  await page.waitForTimeout(900);
  if (!page.url().includes('/admin/' + name)) { problems.push('redirigée vers ' + page.url()); return problems; }
  const m = await page.evaluate(measure);
  if (m.overflowX > 1) problems.push('débordement horizontal de ' + m.overflowX + ' px');
  if (m.small.length) problems.push('zone tactile < 44 px : ' + [...new Set(m.small)].slice(0, 8).join(' | '));
  if (m.outside.length) problems.push('sort de l’écran : ' + [...new Set(m.outside)].slice(0, 6).join(' | '));
  if (m.clipped.length) problems.push('texte coupé : ' + [...new Set(m.clipped)].slice(0, 6).join(' | '));
  if (view === 'phone' && m.navBottom != null && m.navBottom > 1) problems.push('menu du bas décollé de ' + m.navBottom + ' px');
  if (shotDir) await page.screenshot({ path: path.join(shotDir, `${view}-${name}.png`), fullPage: false });
  return problems;
}


// Vues ouvertes par un clic : détail d'une commande, d'une demande, et pages à part (facture, avoir, bon) qui doivent avoir « ← Retour ».
async function popupCheck(ctx, page, click, view, label, shotDir, needBack = true) {
  const problems = [];
  const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 6000 }), click()]);
  await pop.waitForLoadState('load').catch(() => {}); await pop.waitForTimeout(700);
  const r = await pop.evaluate(() => {
    const W = document.documentElement.clientWidth, back = document.getElementById('vg-back'), b = back && back.getBoundingClientRect();
    const small = [...document.querySelectorAll('button')].filter((e) => e.offsetWidth && e.getBoundingClientRect().height < 43.5).map((e) => (e.innerText || e.id).trim().slice(0, 30));
    return { cw: W, over: document.documentElement.scrollWidth - W, back: !!back, backTop: b ? Math.round(b.top) : null, backH: b ? Math.round(b.height) : 0, small };
  });
  if (r.over > 1) problems.push(label + ' : débordement horizontal de ' + r.over + ' px');
  if (view === 'phone' && r.cw > 430) problems.push(label + ' : page de ' + r.cw + ' px de large sur iPhone (balise viewport absente)');
  if (needBack && !r.back) problems.push(label + ' : bouton « ← Retour » absent');
  if (r.back && r.backH < 44) problems.push(label + ' : bouton Retour de ' + r.backH + ' px');
  if (r.back && r.backTop > 40) problems.push(label + ' : bouton Retour pas en haut (' + r.backTop + ' px)');
  if (r.small.length) problems.push(label + ' : zone tactile < 44 px : ' + r.small.join(' | '));
  if (shotDir) await pop.screenshot({ path: path.join(shotDir, view + '-' + label.replace(/W+/g, '-') + '.png') });
  await pop.close();
  return problems;
}
export async function auditViews(ctx, base, view, shotDir) {
  const problems = [];
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
  const snap = async (label, extra = []) => {
    const m = await page.evaluate(measure);
    if (m.overflowX > 1) problems.push(label + ' : débordement horizontal de ' + m.overflowX + ' px');
    if (m.small.length) problems.push(label + ' : zone tactile < 44 px : ' + [...new Set(m.small)].slice(0, 8).join(' | '));
    if (m.outside.length) problems.push(label + ' : sort de l’écran : ' + [...new Set(m.outside)].slice(0, 6).join(' | '));
    if (m.clipped.length) problems.push(label + ' : texte coupé : ' + [...new Set(m.clipped)].slice(0, 6).join(' | '));
    extra.forEach((e) => problems.push(label + ' : ' + e));
    if (shotDir) await page.screenshot({ path: path.join(shotDir, view + '-' + label.replace(/W+/g, '-') + '.png'), fullPage: false });
  };
  // Commandes : carte ouverte, facture, avoir, bon
  await page.goto(base + '/admin/commandes.html'); await page.waitForTimeout(900);
  await page.locator('.sum').first().click(); await page.waitForTimeout(400);
  await snap('commande-ouverte');
  // Commande expédiée : champ du numéro de suivi + « Enregistrer le suivi » / « Actualiser le colis » (taille, débordement, retour visuel après enregistrement)
  await page.locator('.sum').first().click(); await page.waitForTimeout(200);
  await page.locator('[data-f=done]').first().click(); await page.waitForTimeout(300);
  const shipped = page.locator('.order', { has: page.locator('[data-trk-save]') }).first();
  await shipped.locator('.sum').click(); await page.waitForTimeout(300);
  await snap('commande-expediee');
  const box = async (sel) => (await shipped.locator(sel).first().boundingBox().catch(() => null));
  for (const [sel, nom] of [['.trk-in', 'champ du numéro de suivi'], ['[data-trk-save]', 'Enregistrer le suivi']]) { const bb = await box(sel); if (!bb) problems.push(nom + ' : absent'); else if (bb.height < 43.5) problems.push(nom + ' : ' + Math.round(bb.height) + ' px'); }
  await shipped.locator('.trk-in').fill('6a 123 456 789 01'); await shipped.locator('[data-trk-save]').click(); await page.waitForTimeout(500);
  const fb = await page.evaluate(() => ({ msg: (document.getElementById('msg') || {}).textContent || '', toast: !!document.querySelector('#vg-toast.show') }));
  if (!/Suivi enregistré/.test(fb.msg)) problems.push('suivi : pas de message après enregistrement (« ' + fb.msg.slice(0, 60) + ' »)');
  if (!fb.toast) problems.push('suivi : pas de retour visuel (message en bas d’écran) après enregistrement');
  const shipped2 = page.locator('.order', { has: page.locator('[data-trk-refresh]') }).first();
  const rb = await shipped2.locator('[data-trk-refresh]').boundingBox().catch(() => null);
  if (!rb) problems.push('Actualiser le colis : absent après enregistrement'); else if (rb.height < 43.5) problems.push('Actualiser le colis : ' + Math.round(rb.height) + ' px');
  if (!/En transit/.test(await shipped2.innerText().catch(() => ''))) problems.push('suivi : état du colis « En transit » non affiché');
  await snap('commande-expediee-apres');
  await page.locator('[data-f=todo]').first().click(); await page.waitForTimeout(300);
  await page.locator('.sum').first().click(); await page.waitForTimeout(300);
  problems.push(...await popupCheck(ctx, page, () => page.locator('[data-invoice]').first().click(), view, 'facture', shotDir).catch((e) => ['facture : ' + e.message.slice(0, 100)]));
  problems.push(...await popupCheck(ctx, page, () => page.locator('[data-sheet], [data-bon], [data-print]').first().click(), view, 'bon-de-commande', shotDir).catch((e) => ['bon de commande : ' + e.message.slice(0, 100)]));
  await page.locator('button[data-f=refunded], [data-f=refunded]').first().click().catch(() => {}); await page.waitForTimeout(300);
  await page.locator('.sum').first().click().catch(() => {}); await page.waitForTimeout(300);
  problems.push(...await popupCheck(ctx, page, () => page.locator('[data-credit]').first().click(), view, 'avoir', shotDir).catch((e) => ['avoir : ' + e.message.slice(0, 100)]));
  // Demandes : une demande ouverte, et celle qui a un devis
  await page.goto(base + '/admin/demandes.html'); await page.waitForTimeout(900);
  await page.locator('[data-f=all], button:has-text("Toutes")').first().click().catch(() => {}); await page.waitForTimeout(300);
  const heads = page.locator('.req > header');
  const n = await heads.count();
  for (let i = 0; i < Math.min(n, 4); i++) { await heads.nth(i).click().catch(() => {}); await page.waitForTimeout(350); await snap('demande-' + (i + 1)); await heads.nth(i).click().catch(() => {}); }
  errs.forEach((e) => problems.push('erreur JS: ' + e));
  await page.close();
  return problems;
}

export async function runAudit(shotDir) {
  if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
  const browser = await launch();
  if (!browser) return null;
  const { srv, base } = await startServer();
  const all = [];
  try {
    for (const [view, opts] of Object.entries(VIEWS)) {
      const ctx = await browser.newContext(opts);
      await fakeNetwork(ctx, base);
      for (const name of PAGES) {
        const page = await ctx.newPage();
        const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
        const pr = await auditPage(page, base, name, view, shotDir).catch((e) => ['erreur: ' + e.message.slice(0, 120)]);
        errs.forEach((e) => pr.push('erreur JS: ' + e));
        pr.forEach((p) => all.push(`[${view}] ${name}: ${p}`));
        await page.close();
      }
      (await auditViews(ctx, base, view, shotDir).catch((e) => ['vues : ' + e.message.slice(0, 160)])).forEach((p) => all.push(`[${view}] ${p}`));
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
  return all;
}

async function main() {
  const all = await runAudit(process.argv[2] ? path.resolve(process.argv[2]) : null);
  if (all === null) { console.log('Aucun navigateur (Edge/Chrome) trouvé.'); process.exit(2); }
  all.forEach((p) => console.log(p));
  console.log(all.length ? `${all.length} problème(s)` : 'Admin visuel : aucun problème');
  process.exit(all.length ? 1 : 0);
}
if (process.argv[1] && /audit.mjs$/.test(process.argv[1])) main();
