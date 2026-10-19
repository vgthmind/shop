// Prépare (ou annule) les réglages du jour J, sans rien pousser ni déployer : modifie seulement 2 fichiers en local.
//   node outils/preparer-bascule.mjs                         aperçu des changements (n'écrit rien)
//   node outils/preparer-bascule.mjs --apply                 site public : shop-settings.json (public true, site_url) + SITE_BASE du Worker
//   node outils/preparer-bascule.mjs --apply --live-seul     SEULEMENT LIVE_MODE = "1" (essai à 1 € avec la vraie carte, site encore en test)
//   node outils/preparer-bascule.mjs --apply --live          site public + LIVE_MODE = "1" (clés Stripe live acceptées ; mails sans [TEST])
//   node outils/preparer-bascule.mjs --apply --retour        remet les valeurs de TEST (retour arrière avant poussée)
//   --site=https://www.vgthmind.org   adresse définitive (défaut)
// Ensuite : npm run build, npm test, (toi) Deployer-worker.bat puis git push. Rien de cela n'est fait ici.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_SITE = 'https://vgthmind-shop.pages.dev';

// Pur : renvoie les nouveaux contenus des deux fichiers. Testé dans tests/bascule.test.mjs.
export function transform({ settings, toml }, { site, live, liveSeul, retour }) {
  if (liveSeul && !retour) return { settings, toml: toml.replace(/^(LIVE_MODE\s*=\s*)"[^"]*"/m, '$1"1"') };
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(site)) throw new Error('--site doit ressembler à https://www.vgthmind.org (sans / final)');
  const s = JSON.parse(settings);
  const target = retour ? TEST_SITE : site;
  s.public = !retour;
  s.site_url = target;
  const origins = (/^ALLOWED_ORIGIN\s*=\s*"([^"]*)"/m.exec(toml) || [])[1] || '';
  if (!retour && !origins.split(',').map((x) => x.trim()).includes(site)) throw new Error('ALLOWED_ORIGIN du Worker n\'accepte pas ' + site + ' : ajoute-le dans checkout-worker/wrangler.toml avant la bascule.');
  let t = toml.replace(/^(SITE_BASE\s*=\s*)"[^"]*"/m, `$1"${target}"`);
  if (retour) t = t.replace(/^(LIVE_MODE\s*=\s*)"[^"]*"/m, '$1"0"');
  else if (live) t = t.replace(/^(LIVE_MODE\s*=\s*)"[^"]*"/m, '$1"1"');
  return { settings: JSON.stringify(s, null, 2) + '\n', toml: t };
}

function main() {
  const args = process.argv.slice(2);
  const site = ((args.find((a) => a.startsWith('--site=')) || '').slice(7) || 'https://www.vgthmind.org').replace(/\/$/, '');
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = { settings: path.join(root, 'data', 'shop-settings.json'), toml: path.join(root, 'checkout-worker', 'wrangler.toml') };
  const cur = { settings: fs.readFileSync(files.settings, 'utf8'), toml: fs.readFileSync(files.toml, 'utf8') };
  const eol = cur.settings.includes('\r\n') ? '\r\n' : '\n';
  const next = transform({ settings: cur.settings.replace(/\r\n/g, '\n'), toml: cur.toml.replace(/\r\n/g, '\n') }, { site, live: args.includes('--live'), liveSeul: args.includes('--live-seul'), retour: args.includes('--retour') });
  for (const k of Object.keys(files)) {
    const a = cur[k].replace(/\r\n/g, '\n').split('\n'), b = next[k].split('\n');
    const diff = b.map((l, i) => (a[i] !== l ? `  - ${a[i]}\n  + ${l}` : '')).filter(Boolean);
    console.log(path.relative(root, files[k]) + (diff.length ? '' : ' : inchangé'));
    diff.forEach((d) => console.log(d));
  }
  if (!args.includes('--apply')) { console.log('\nAperçu : rien n\'est écrit (ajoute --apply).'); return; }
  for (const k of Object.keys(files)) fs.writeFileSync(files[k], eol === '\r\n' ? next[k].replace(/\n/g, '\r\n') : next[k]);
  console.log('\nÉcrit en local. Rien n\'est poussé ni déployé.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) { try { main(); } catch (e) { console.error('Erreur : ' + e.message); process.exit(1); } }
