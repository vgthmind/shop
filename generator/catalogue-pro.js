// Catalogue pro (vgthmind.org/pro/) : page privée envoyée aux boutiques (dépôt-vente / achat), jamais liée par le site,
// jamais indexée. Construit pro/catalogue.json à partir :
//   - des fiches du site (data/products/*.json) : reprises automatiquement (nouvelle pièce = dans le catalogue) ;
//   - de data/catalogue-pro.json : « overrides » (gamme, statut « en boutique », masquer) et « extras » (pièces hors site :
//     collections, archives, sur-mesure). Ce fichier se modifie depuis l'admin (Réglages > Catalogue pro).
// La page lit ensuite le stock réel du Worker pour afficher « disponible » / « vendue » en direct.
'use strict';
const fs = require('fs');
const path = require('path');

const TYPE_OF_CAT = { tops: 'hauts', pantsshorts: 'bas', accessories: 'accessoires', merch: 'musique' };

function frPart(desc) {
  const parts = String(desc || '').replace(/\r/g, '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  const fr = parts.length > 1 ? parts.slice(1).join('\n') : parts[0] || '';
  return fr.replace(/\*?SOLD ?OUT\*?/gi, '').replace(/\n{2,}/g, '\n').trim();
}

function sitePhotos(root, slug, images) {
  return (images || []).map((src, i) => {
    const s = path.join(root, 'assets', 'products-sized', '540', slug, i + '.webp');
    const l = path.join(root, 'assets', 'products-sized', '800', slug, i + '.webp');
    return {
      s: fs.existsSync(s) ? `/assets/products-sized/540/${slug}/${i}.webp` : src,
      l: fs.existsSync(l) ? `/assets/products-sized/800/${slug}/${i}.webp` : src,
    };
  });
}

function extraPhotos(list) {
  return (list || []).map((src) => ({ s: String(src).replace(/(\.\w+)$/, '-s.webp').replace(/-s\.webp-s\.webp$/, '-s.webp'), l: src }));
}

function build(root) {
  const cfgPath = path.join(root, 'data', 'catalogue-pro.json');
  const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : { overrides: {}, extras: [] };
  const ov = cfg.overrides || {};
  const items = [];
  const dir = path.join(root, 'data', 'products');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const slug = p.slug || f.replace(/\.json$/, '');
    const o = ov[slug] || {};
    if (p.archived || o.masquer) continue;
    const boutique = o.statut === 'boutique';
    if (p.hidden && !p.scheduled && !boutique && !o.montrer) continue; // masquée sur le site et pas marquée « en boutique »
    const fr = frPart(p.description);
    const lines = fr.split('\n').map((s) => s.trim()).filter(Boolean);
    const cats = p.categories || [];
    items.push({
      id: slug, src: 'site', nom: o.nom || p.name, type: o.type || TYPE_OF_CAT[cats[0]] || 'accessoires',
      gamme: o.gamme || (cats.includes('customsupcycling') ? 'custom' : 'couture'),
      statut: boutique ? 'boutique' : (o.statut || (p.quantity === 0 || p.in_stock === false ? 'vendu' : 'dispo')),
      lieu: o.lieu || '', photos: sitePhotos(root, slug, p.images),
      description: o.description || lines.filter((l) => !/^taille|%/i.test(l)).join('\n'),
      tailles: o.tailles || lines.filter((l) => /^taille/i.test(l)).join(' · '),
      compo: o.compo || lines.filter((l) => /%/.test(l)).join(' · '),
      lien: o.lien || p.reel_url || '', page: `/product/${encodeURIComponent(slug)}/`,
      unique: !!p.unique, quantite: typeof p.quantity === 'number' ? p.quantity : null, position: p.position || 999,
      annee: o.annee || String(p.created_at || '').slice(0, 4), collection: o.collection || '',
    });
  }
  for (const x of cfg.extras || []) {
    if (!x || !x.id || x.masquer) continue;
    items.push(Object.assign({ position: 999 }, x, { src: 'extra', photos: extraPhotos(x.photos) }));
  }
  return {
    genere: new Date().toISOString(),
    intro: cfg.intro || '',
    liens: cfg.liens || {},
    items,
  };
}

// Écrit /pro/index.html (page) et /pro/catalogue.json (données) dans le dossier de sortie.
function write(root, outDir) {
  if (!fs.existsSync(path.join(root, 'pro', 'index.html'))) return;
  const out = path.join(outDir, 'pro');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'catalogue.json'), JSON.stringify(build(root)));
  let key = '';
  try { key = String(JSON.parse(fs.readFileSync(path.join(root, 'data', 'shop-settings.json'), 'utf8')).turnstile_site_key || ''); } catch (e) {}
  if (!/^[\w-]{10,60}$/.test(key)) key = '';
  fs.writeFileSync(path.join(out, 'index.html'), fs.readFileSync(path.join(root, 'pro', 'index.html'), 'utf8').replace('__TURNSTILE_KEY__', key));
  const assets = path.join(root, 'assets', 'catalogue-pro');
  if (fs.existsSync(assets)) fs.cpSync(assets, path.join(outDir, 'assets', 'catalogue-pro'), { recursive: true });
}

module.exports = { build, write, frPart };
