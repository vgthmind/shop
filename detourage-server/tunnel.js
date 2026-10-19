/* Lanceur « Détourage iPhone » : démarre le serveur de détourage ET le tunnel Cloudflare, puis fabrique le lien à ouvrir sur l'iPhone.
   - Tunnel « rapide » Cloudflare (cloudflared) : gratuit, sans compte, sans carte. L'adresse change à chaque lancement.
   - Le serveur n'écoute que sur ce PC (127.0.0.1) ; de l'extérieur il faut le mot de passe (fichier .token, créé ici au premier lancement).
   - Le lien contient l'adresse et le mot de passe dans la partie après « # » : elle n'est jamais envoyée à un site.
   Variables (tests) : CLOUDFLARED_BIN, SERVER_JS, NO_OPEN=1, NO_CLIP=1, PORT, STUDIO_URL. */
'use strict';
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const DIR = __dirname;
const PORT = Number(process.env.PORT) || 7860;
const TOKEN_FILE = path.join(DIR, '.token');
const LINK_FILE = path.join(DIR, 'lien-iphone.html');
const CLOUDFLARED = process.env.CLOUDFLARED_BIN || path.join(DIR, 'cloudflared.exe');
// « api.trycloudflare.com » est le service de Cloudflare, cité dans ses messages : ce n'est pas notre tunnel.
const URL_RE = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/i;

function ensureToken(file) {
  try { const t = fs.readFileSync(file, 'utf8').trim(); if (/^[A-Za-z0-9_-]{16,128}$/.test(t)) return t; } catch (e) { /* à créer */ }
  const t = crypto.randomBytes(24).toString('base64url');
  fs.writeFileSync(file, t + '\n');
  return t;
}

function studioUrl() {
  if (process.env.STUDIO_URL) return process.env.STUDIO_URL;
  let base = 'https://vgthmind-shop.pages.dev'; // l'admin est sur Cloudflare Pages (plus sur github.io)
  try { base = JSON.parse(fs.readFileSync(path.join(DIR, '..', 'data', 'shop-settings.json'), 'utf8')).site_url || base; } catch (e) { /* valeur par défaut */ }
  return base.replace(/\/$/, '') + '/admin/nouvelle-piece.html';
}

function buildLink(studio, tunnelUrl, token) {
  return studio + '#srv=' + encodeURIComponent(tunnelUrl) + '&k=' + encodeURIComponent(token);
}

function findTunnelUrl(text) { const m = URL_RE.exec(String(text)); return m ? m[0] : null; }

function linkPage(link) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return '<!doctype html><meta charset="utf-8"><title>Détourage iPhone</title><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<body style="font:16px system-ui;max-width:640px;margin:32px auto;padding:0 16px"><h1>Détourage iPhone prêt</h1>'
    + '<p>Envoie ce lien à ton iPhone (Messages à toi-même, Notes, AirDrop), puis ouvre-le <b>dans Safari</b>. Il est déjà copié.</p>'
    + '<p><textarea id="l" readonly style="width:100%;height:9em;font:13px monospace">' + esc(link) + '</textarea></p>'
    + '<p><button onclick="l.select();document.execCommand(\'copy\');this.textContent=\'Copié ✓\'" style="font-size:18px;padding:10px 18px">Copier le lien</button></p>'
    + '<p style="color:#555">Ne partage ce lien avec personne : il donne accès au détourage de ton PC. L’adresse change à chaque lancement ; laisse la fenêtre noire ouverte.</p></body>';
}

function waitHealth(port, ms) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    (function tick() {
      const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 2000 }, (res) => { res.resume(); resolve(); });
      req.on('error', () => (Date.now() - t0 > ms ? reject(new Error('Le serveur de détourage ne démarre pas.')) : setTimeout(tick, 500)));
      req.on('timeout', () => req.destroy());
    })();
  });
}

async function main() {
  if (!fs.existsSync(CLOUDFLARED)) { console.error('cloudflared introuvable : ' + CLOUDFLARED); process.exit(2); }
  const token = ensureToken(TOKEN_FILE);
  const env = Object.assign({}, process.env, { HOST: '127.0.0.1', PORT: String(PORT) });
  delete env.DETOURAGE_OPEN;
  // Port 7860 déjà pris (ancien serveur, ou « Lancer-detourage.bat » ouvert) : on le dit clairement AVANT de démarrer.
  const busy = await new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/health', timeout: 3000 }, (res) => { res.resume(); resolve('repond'); });
    req.on('timeout', () => { req.destroy(); resolve('bloque'); });
    req.on('error', (e) => resolve(e && e.code === 'ECONNREFUSED' ? '' : 'bloque'));
  });
  if (busy) {
    console.error('\nERREUR : le port ' + PORT + ' est deja occupe (' + (busy === 'repond' ? 'un serveur de detourage est deja lance, probablement « Lancer-detourage.bat »' : 'un ancien serveur bloque') + ').');
    console.error('Double-clique sur « Arreter-detourage.bat » (meme dossier), puis relance « Lancer-detourage-iphone.bat ».');
    process.exit(1);
  }
  const server = spawn(process.execPath, [process.env.SERVER_JS || path.join(DIR, 'server.js')], { cwd: DIR, env, stdio: ['ignore', 'inherit', 'inherit'] });
  let tunnel = null;
  const stop = () => { try { server.kill(); } catch (e) { /* déjà arrêté */ } try { if (tunnel) tunnel.kill(); } catch (e) { /* idem */ } };
  process.on('exit', stop); process.on('SIGINT', () => process.exit(0)); process.on('SIGTERM', () => process.exit(0));
  server.on('exit', (c) => { console.error('Le serveur de détourage s’est arrêté (code ' + c + '). Si « Lancer-detourage.bat » est déjà ouvert, double-clique sur « Arreter-detourage.bat » puis relance.'); process.exit(1); });
  await waitHealth(PORT, 60000);
  console.log('Serveur de détourage démarré. Ouverture du tunnel…');

  tunnel = spawn(CLOUDFLARED, ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:' + PORT], { cwd: DIR, stdio: ['ignore', 'pipe', 'pipe'] });
  tunnel.on('exit', (c) => { console.error('Le tunnel s’est arrêté (code ' + c + '). Ferme cette fenêtre et relance.'); process.exit(1); });
  let announced = false;
  let seen = '';
  const onData = (buf) => {
    if (announced) return;
    seen = (seen + buf).slice(-4000); // l'adresse peut arriver coupée en deux morceaux
    const url = findTunnelUrl(seen);
    if (!url) return;
    announced = true;
    const link = buildLink(studioUrl(), url, token);
    fs.writeFileSync(LINK_FILE, linkPage(link));
    if (process.env.NO_CLIP !== '1') spawnSync('clip', [], { input: link, shell: true });
    console.log('\n=== PRÊT ===\nLe lien pour l’iPhone est copié. Une page s’ouvre avec le lien.\nLaisse cette fenêtre ouverte pendant que tu travailles sur l’iPhone.\n');
    console.log('LIEN: ' + link);
    if (process.env.NO_OPEN !== '1') spawn('cmd', ['/c', 'start', '', LINK_FILE], { stdio: 'ignore', detached: true }).unref();
  };
  tunnel.stdout.on('data', onData); tunnel.stderr.on('data', onData);
  setTimeout(() => { if (!announced) { console.error('Le tunnel n’a pas donné d’adresse après 60 s : vérifie la connexion internet, puis relance.'); process.exit(1); } }, 60000);
}

module.exports = { ensureToken, buildLink, findTunnelUrl, linkPage };
if (require.main === module) main().catch((e) => { console.error(e.message || e); process.exit(1); });
