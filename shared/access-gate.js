// Logique pure du mode d'accès (utilisée par functions/_middleware.js, testée dans tests/access.test.mjs).
// Pages qui restent toujours accessibles, même site fermé ou sous code :
//  - l'admin et sa connexion ; les fichiers que le Worker (webhook, mails, panier) et les pages lisent : assets, products.json, site-config.json ;
//  - le suivi client par lien secret : /demande/?id=…&k=… (lien des mails), /suivi/ (suivi de commande) ;
//  - le retour de Stripe : /merci, /paiement-annule ; robots.txt (qui dit « noindex » aux moteurs).
// Le webhook Stripe et les mails ne passent pas par ce site (ils parlent au Worker) : ils ne sont jamais concernés.
export function isHome(pathname) { return pathname === '/' || pathname === '/index.html'; }

export function isExempt(pathname, search) {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/admin' || p.startsWith('/admin/')) return true;
  if (p.startsWith('/assets/')) return true;
  if (['/favicon.ico', '/site.webmanifest', '/robots.txt', '/products.json', '/site-config.json', '/merci', '/paiement-annule', '/suivi', '/acces'].includes(p)) return true;
  if (/^\/(apple-touch-icon|favicon)[\w.-]*$/.test(p)) return true;
  if (p === '/demande') { const q = new URLSearchParams(search || ''); return !!(q.get('id') && q.get('k')); }
  return false;
}

// 'pass' = laisser passer ; 'home' = servir l'accueil avec l'écran d'accès ; 'redirect' = renvoyer vers l'accueil.
export function decide({ pathname, search, method, mode, ok }) {
  if (mode !== 'closed' && mode !== 'code') return 'pass';
  if (isExempt(pathname, search)) return 'pass';
  if (mode === 'code' && ok) return 'pass';
  if (isHome(pathname) && (method === 'GET' || method === 'HEAD')) return 'home';
  return 'redirect';
}

// Données lues par le script de l'écran d'accueil (assets/vg-src/vg-transitions-dev.js) : window.VG_GATE.
export function gateScript(cfg) {
  const data = { mode: cfg.mode, msg_fr: cfg.msg_fr, msg_en: cfg.msg_en };
  const LS = new RegExp(String.fromCharCode(0x2028), 'g'), PS = new RegExp(String.fromCharCode(0x2029), 'g'); // séparateurs de ligne : interdits dans un script en ligne
  const json = JSON.stringify(data).replace(/</g, String.fromCharCode(92) + 'u003c').replace(LS, String.fromCharCode(92) + 'u2028').replace(PS, String.fromCharCode(92) + 'u2029');
  return '<meta name="robots" content="noindex, nofollow, noarchive">'
    + '<style>html{overflow:hidden!important}body>*:not(.vg-splash):not(.vg-trail-node):not(.vg-trail-streak):not(.vg-cursor-spark):not(script):not(style):not(link){visibility:hidden!important}</style>'
    + '<script>window.VG_GATE=' + json + ';</script>';
}

export const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

export function readCookie(header, name) {
  const m = new RegExp('(?:^|; )' + name + '=([^;]*)').exec(header || '');
  try { return m ? decodeURIComponent(m[1]) : ''; } catch (e) { return ''; }
}
