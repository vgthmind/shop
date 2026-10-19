// Refonte de l'admin (ADMIN-PLAN.md) : 5 entrées, un seul endroit par action, anciennes adresses redirigées, rien de cassé.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const ADMIN = new URL('../admin/', import.meta.url);
const read = (p) => readFileSync(new URL(p, ADMIN), 'utf8');
const pages = readdirSync(ADMIN).filter((f) => f.endsWith('.html'));
const { onRequest } = await import('../functions/admin/_middleware.js');
const go = async (path, headers = {}) => onRequest({ request: new Request('https://site.test' + path, { headers }), next: async () => new Response('page') });

test('pages supprimées : plus aucun fichier en double (stock, poids et ports, drop, rapide, plus, éditeur Sveltia, aide en double)', () => {
  for (const f of ['stock.html', 'pieces.html', 'drop.html', 'rapide.html', 'plus.html', 'index.html', 'studio-photo.html', 'trafic.html', 'expedition.html', 'export.html', 'ouverture.html', 'etat.html', 'aide.html', 'promos.html', 'config.yml', 'AIDE.md'])
    assert.ok(!existsSync(new URL(f, ADMIN)), f + ' ne doit plus exister');
  for (const f of ['menu.html', 'commandes.html', 'demandes.html', 'catalogue.html', 'nouvelle-piece.html', 'reglages.html', 'connexion.html']) assert.ok(existsSync(new URL(f, ADMIN)), f);
});

test('anciennes adresses : redirection permanente vers la bonne page (avec ou sans .html, paramètres gardés), même sans être connecté', async () => {
  const MAP = {
    '/admin/': '/admin/menu.html', '/admin': '/admin/menu.html', '/admin/index.html': '/admin/menu.html',
    '/admin/stock': '/admin/catalogue.html', '/admin/stock.html': '/admin/catalogue.html',
    '/admin/pieces': '/admin/catalogue.html#/noweight', '/admin/drop.html': '/admin/catalogue.html#/programmer',
    '/admin/rapide': '/admin/nouvelle-piece.html', '/admin/studio-photo.html': '/admin/nouvelle-piece.html',
    '/admin/plus': '/admin/reglages.html', '/admin/trafic': '/admin/reglages-visites.html', '/admin/expedition.html': '/admin/reglages-livraison.html',
    '/admin/export': '/admin/reglages-compta.html', '/admin/ouverture': '/admin/reglages-videos.html', '/admin/etat': '/admin/reglages-sante.html',
    '/admin/aide.html': '/admin/reglages-aide.html', '/admin/promos': '/admin/reglages-promos.html'
  };
  for (const [from, to] of Object.entries(MAP)) {
    const r = await go(from);
    assert.equal(r.status, 301, from);
    assert.equal(r.headers.get('Location'), 'https://site.test' + to, from);
    const target = to.split('#')[0].replace(/^\/admin\//, '');
    assert.ok(existsSync(new URL(target, ADMIN)), 'la cible existe : ' + target);
  }
  assert.equal((await go('/admin/trafic.html?x=1')).headers.get('Location'), 'https://site.test/admin/reglages-visites.html?x=1');
  // les pages conservées gardent leur adresse (l'appli iPhone installée s'ouvre toujours sur menu.html) : pas de redirection, mais le garde de connexion
  for (const keep of ['/admin/menu.html', '/admin/commandes.html', '/admin/demandes.html', '/admin/catalogue.html', '/admin/apercu/ch_0002/']) {
    const r = await go(keep, { Accept: 'text/html' });
    assert.equal(r.status, 302, keep);
    assert.match(r.headers.get('Location'), /\/admin\/connexion\?next=/);
  }
  assert.equal((await go('/admin/connexion')).status, 200);
  assert.equal((await go('/admin/manifest.webmanifest')).status, 200);
  assert.equal((await go('/admin/config.yml', { Accept: 'text/html' })).status, 302, 'la config Sveltia n\'est plus publique');
});

test('l\'appli installée : manifeste inchangé (start_url menu.html), service worker v15, pages listées existantes', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.start_url, './menu.html'); assert.equal(m.scope, './');
  const sw = read('sw.js');
  assert.match(sw, /var CACHE = 'vg-admin-v15'/);
  const shell = JSON.parse(/var SHELL = (\[[^\]]*\]);/.exec(sw)[1].replace(/'/g, '"'));
  for (const f of shell) assert.ok(existsSync(new URL(f, ADMIN)), 'sw.js liste ' + f);
  for (const f of ['menu.html', 'commandes.html', 'demandes.html', 'catalogue.html', 'reglages.html']) assert.ok(shell.includes(f), f + ' hors ligne');
});

test('menu : 5 entrées sur toutes les pages (sauf connexion), « Voir la boutique » en haut à droite, aucun lien vers une page supprimée', () => {
  const ui = read('vg-admin-ui.js');
  assert.ok(ui.includes('Voir la boutique'));
  for (const f of pages.filter((p) => p !== 'connexion.html')) {
    const html = read(f);
    assert.ok(html.includes('vg-admin-ui.js'), f + ' charge le menu commun');
    for (const gone of ['stock.html', 'pieces.html', 'drop.html', 'rapide.html', 'plus.html', 'studio-photo.html', 'trafic.html', 'expedition.html', 'export.html', 'ouverture.html', 'etat.html', 'aide.html', 'promos.html', 'index.html'])
      assert.ok(!new RegExp('href="' + gone.replace('.', '\\.') + '[#"?]').test(html), f + ' pointe encore vers ' + gone);
    // lien interne vers une page .html : elle doit exister
    for (const m of html.matchAll(/href="([a-z0-9-]+\.html)(?:[#?][^"]*)?"/g)) assert.ok(existsSync(new URL(m[1], ADMIN)), f + ' -> ' + m[1]);
  }
});

test('un seul endroit : sauvegardes, installer l\'appli, connexion', () => {
  const sav = read('reglages-sauvegardes.html');
  assert.ok(sav.includes('/admin/backup') && sav.includes('/admin/obackup') && sav.includes('/admin/obackup-restore'), 'stock ET commandes dans Réglages > Sauvegardes');
  assert.ok(!read('commandes.html').includes('obackup'), 'plus de sauvegarde dans Commandes');
  assert.ok(read('reglages.html').includes('id="installer"'));
  assert.ok(!read('menu.html').includes('beforeinstallprompt'), 'l\'installation n\'est expliquée qu\'une fois');
  assert.ok(read('vg-admin-ui.js').includes('/admin/connexion?next='), 'sans session : page de connexion unique');
  const sets = read('reglages-demandes.html');
  assert.ok(sets.includes('id="prix"') && sets.includes('id="facturation"') && sets.includes('s-sellerAddress') && sets.includes('/admin/requests/settings'));
  assert.ok(!read('demandes.html').includes('s-sellerAddress'), 'adresse et prix retirés de Demandes');
});

test('Accueil : à faire, 4 chiffres avec période, courbe, pièces qui rapportent, une seule action « + Nouvelle pièce »', () => {
  const m = read('menu.html');
  for (const id of ['today', 'k-vis', 'k-n', 'k-conv', 'k-ca', 'chart', 'top', 'health', 'per']) assert.ok(m.includes('id="' + id + '"'), id);
  for (const p of ['7', '30', 'month', 'year']) assert.ok(m.includes('data-p="' + p + '"'), p);
  assert.ok(m.includes('href="nouvelle-piece.html"'));
});

test('Pièces : Programmer (plusieurs pièces + texte Instagram) et sélection du stock dans la grille', () => {
  const c = read('catalogue.html');
  for (const id of ['v-drop', 'd-grid', 'd-when', 'd-txt', 'd-go']) assert.ok(c.includes('id="' + id + '"'), id);
  assert.ok(c.includes("data-act=\"minus\"") && c.includes("data-act=\"plus\""), 'stock +/− sur chaque carte');
  assert.ok(c.includes('#/noweight') && c.includes('#/soldout'));
});

const F = require('../admin/piece-form.js');
test('assistant : « Enregistrer en brouillon » exige seulement nom et prix et crée la pièce masquée', () => {
  const cats = ['pants', 'merch'];
  assert.match(F.buildDraft({ name: '', price: 10 }, cats).error, /nom/);
  assert.match(F.buildDraft({ name: 'Short', price: '' }, cats).error, /prix/);
  assert.match(F.buildDraft({ name: 'Short', price: 0 }, cats).error, /prix/);
  const r = F.buildDraft({ name: 'Short bleu', price: '60', quantity: '', categories: ['pants', 'inconnue'], weight_g: '', mode: 'colis' }, cats, '2026-10-19T10:00:00.000Z');
  assert.ok(!r.error, r.error);
  const p = r.product;
  assert.equal(p.hidden, true); assert.equal(p.slug, 'short-bleu'); assert.equal(p.price, 60); assert.equal(p.quantity, 1);
  assert.deepEqual(p.categories, ['pants']); assert.equal(p.description, ''); assert.equal('weight_g' in p, false); assert.equal(p.unique, true);
  // une fiche complète du même formulaire reste exigeante (la publication directe ne change pas)
  assert.match(F.buildPiece({ name: 'Short', price: 60, quantity: 1, categories: ['pants'], weight_g: 400, mode: 'colis' }, cats).error, /description/);
});
test('assistant : étapes Photos, Détourage, Fiche, Poids et ports, Publier ; bouton brouillon à chaque étape', () => {
  assert.ok(read('piece-wizard.js').includes("'Poids et ports'"));
  const h = read('nouvelle-piece.html');
  assert.ok(h.includes('id="bDraft"') && h.indexOf('id="bDraft"') > h.indexOf('id="stepNav"'));
  assert.ok(read('studio-photo.js').includes('collectDraft'));
});

test('assistant : le détourage ne se lance jamais tout seul ; choix par photo (Détourer / Garder telle quelle / Revenir à l\'original)', () => {
  const js = read('studio-photo.js'), h = read('nouvelle-piece.html');
  const add = /async function addFiles[\s\S]*?\r?\n  }\r?\n/.exec(js)[0];
  assert.ok(!add.includes('runQueue()'), 'ajouter une photo ne lance rien');
  assert.ok(add.includes("status: 'new'"));
  for (const id of ['bCutAll', 'bKeepAll']) assert.ok(h.includes('id="' + id + '"'), id);
  assert.ok(js.includes("Revenir à l'original") && js.includes('Garder telle quelle') && js.includes('✂ Détourer'));
});

test('assistant : plus d\'alerte « Quitter sans enregistrer ? » une fois le brouillon ou la publication enregistré', () => {
  const js = read('studio-photo.js');
  assert.ok(js.includes('photos.length && !savedOnline'));
  assert.equal((js.match(/savedOnline = true/g) || []).length, 2, 'brouillon ET publication');
  assert.ok(/async function addFiles[\s\S]{0,60}savedOnline = false/.test(js));
});
