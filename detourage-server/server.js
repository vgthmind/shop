/* Serveur de détourage vgthmind — BiRefNet « lite » (licence MIT) via onnxruntime-node.
   Aucune clé, aucun jeton. Seuls les sites listés dans ALLOWED_ORIGINS peuvent l'appeler depuis un navigateur.
   POST /cut  (corps = image JPEG/PNG/WebP)  ->  PNG gris (même taille) = masque : 255 = pièce, 0 = fond.
   GET  /health -> { ok, ready }                                                                          */
'use strict';
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const sharp = require('sharp');
const ort = require('onnxruntime-node');

const PORT = Number(process.env.PORT) || 7860;
const MODEL = process.env.MODEL_PATH || path.join(__dirname, 'models', 'model.onnx');
const ALLOWED = (process.env.ALLOWED_ORIGINS || 'https://vgthmind.github.io').split(',').map(function (s) { return s.trim().replace(/\/$/, ''); }).filter(Boolean);
const MAX_PER_DAY = Number(process.env.MAX_PER_DAY) || 100; // garde-fou de coût : au-delà, 429 jusqu'au lendemain (UTC)
const ALLOW_NO_ORIGIN = process.env.ALLOW_NO_ORIGIN === '1'; // tests locaux seulement
let day = '', used = 0;

// Accès par le tunnel (iPhone) : un mot de passe est EXIGÉ dès que la requête ne vient pas de ce PC.
// Mot de passe = variable DETOURAGE_TOKEN, sinon fichier .token à côté du serveur (créé par le lanceur).
// Sans mot de passe configuré, tout ce qui vient de l'extérieur est refusé (jamais ouvert par défaut).
const TOKEN_FILE = process.env.TOKEN_FILE || path.join(__dirname, '.token');
function loadToken() {
  if (process.env.DETOURAGE_TOKEN) return process.env.DETOURAGE_TOKEN.trim();
  try { return fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch (e) { return ''; }
}
const TOKEN = loadToken();
// Hébergeur (Cloud Run) : DETOURAGE_OPEN=1 = pas de mot de passe, seul le contrôle d'origine du site s'applique.
const OPEN = process.env.DETOURAGE_OPEN === '1';
function isLocalRequest(req) {
  if (OPEN) return true;
  const host = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]') return false;
  for (const h of ['cf-connecting-ip', 'cf-ray', 'x-forwarded-for', 'cf-visitor']) if (req.headers[h]) return false; // passé par le tunnel
  return true;
}
function tokenOk(req) {
  if (!TOKEN) return false;
  const given = Buffer.from(String(req.headers['x-vg-token'] || ''));
  const want = Buffer.from(TOKEN);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}
// Frein contre les essais au hasard : 20 refus par heure, puis tout est refusé jusqu'à l'heure suivante.
let failHour = '', fails = 0;
function tooManyFails() { const h = new Date().toISOString().slice(0, 13); if (h !== failHour) { failHour = h; fails = 0; } return fails >= 20; }
const MAX_BYTES = 12 * 1024 * 1024;
const SIZE = 1024, MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

let session = null, loadError = null;
ort.InferenceSession.create(MODEL, { executionProviders: ['cpu'], graphOptimizationLevel: 'all', intraOpNumThreads: Number(process.env.ORT_THREADS) || 4, enableCpuMemArena: false })
  .then(function (s) { session = s; console.log('Modèle prêt. Entrée :', s.inputNames, 'sortie :', s.outputNames); })
  .catch(function (e) { loadError = e; console.error('Chargement du modèle impossible :', e); });

let chain = Promise.resolve(); // un détourage à la fois (mémoire)
function enqueue(fn) { const p = chain.then(fn, fn); chain = p.catch(function () {}); return p; }

async function cut(buf) {
  const img = sharp(buf, { failOn: 'none' }).rotate(); // respecte l'orientation EXIF
  const meta = await img.clone().metadata();
  const w = meta.autoOrient ? meta.autoOrient.width : meta.width, h = meta.autoOrient ? meta.autoOrient.height : meta.height;
  // On complète l'image en CARRÉ (bords en miroir) au lieu de l'écraser : écrasée, la pièce est déformée et le modèle
  // garde du fond (drap) autour. Le masque est ensuite recadré à la taille d'origine.
  const side = Math.max(w, h), padL = Math.floor((side - w) / 2), padT = Math.floor((side - h) / 2);
  let sq = img.clone();
  if (side !== w || side !== h) {
    const ext = function (how) { return img.clone().extend({ left: padL, right: side - w - padL, top: padT, bottom: side - h - padT, extendWith: how }); };
    try { sq = sharp(await ext('mirror').toBuffer()); } catch (e) { sq = sharp(await ext('copy').toBuffer()); }
  }
  const raw = await sq.removeAlpha().resize(SIZE, SIZE, { fit: 'fill' }).raw().toBuffer();
  const n = SIZE * SIZE, f = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) f[c * n + i] = (raw[i * 3 + c] / 255 - MEAN[c]) / STD[c];
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', f, [1, 3, SIZE, SIZE]) });
  const d = out[session.outputNames[0]].data, m = Buffer.alloc(n);
  for (let i = 0; i < n; i++) m[i] = Math.round(255 / (1 + Math.exp(-d[i])));
  let mask = sharp(m, { raw: { width: SIZE, height: SIZE, channels: 1 } }).resize(side, side, { kernel: 'cubic' });
  if (side !== w || side !== h) mask = sharp(await mask.png().toBuffer()).extract({ left: padL, top: padT, width: w, height: h });
  return mask.toColourspace('b-w').png({ compressionLevel: 6 }).toBuffer();
}

function cors(req, res) {
  const o = req.headers.origin;
  if (o && ALLOWED.indexOf(o) >= 0) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-VG-Token');
    res.setHeader('Access-Control-Allow-Private-Network', 'true'); // site https -> serveur sur ce PC (Chrome)
    res.setHeader('Access-Control-Max-Age', '600');
  }
  return o ? ALLOWED.indexOf(o) >= 0 : ALLOW_NO_ORIGIN; // un navigateur envoie toujours Origin ; sans Origin : tests locaux seulement
}
function send(res, code, body, type) { res.writeHead(code, { 'Content-Type': type || 'application/json' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); }

http.createServer(function (req, res) {
  const ok = cors(req, res);
  if (req.method === 'OPTIONS') return send(res, ok ? 204 : 403, '');
  if (req.url.split('?')[0] === '/health') return send(res, 200, { ok: true, ready: !!session, error: loadError ? String(loadError.message || loadError) : null });
  if (req.method !== 'POST' || req.url.split('?')[0] !== '/cut') return send(res, 404, { error: 'not found' });
  if (!ok) return send(res, 403, { error: 'origine non autorisée' });
  if (!isLocalRequest(req)) {
    if (tooManyFails()) return send(res, 429, { error: 'trop d\'essais, réessaie dans une heure' });
    if (!tokenOk(req)) { fails++; return send(res, 401, { error: 'mot de passe du serveur refusé' }); }
  }
  var today = new Date().toISOString().slice(0, 10); if (today !== day) { day = today; used = 0; }
  if (used >= MAX_PER_DAY) return send(res, 429, { error: 'limite quotidienne atteinte' });
  if (!session) return send(res, 503, { error: 'modèle en cours de chargement' });
  const chunks = []; let size = 0, dead = false;
  req.on('data', function (c) { size += c.length; if (size > MAX_BYTES) { dead = true; send(res, 413, { error: 'image trop lourde' }); req.destroy(); } else chunks.push(c); });
  req.on('end', function () {
    if (dead) return;
    used++;
    enqueue(function () { return cut(Buffer.concat(chunks)); })
      .then(function (png) { send(res, 200, png, 'image/png'); })
      .catch(function (e) { console.error(e); send(res, 500, { error: String(e && e.message || e) }); });
  });
}).listen(PORT, process.env.HOST || '0.0.0.0', function () { console.log('Détourage à l\'écoute sur le port', PORT, '- origines :', ALLOWED.join(', ')); });
