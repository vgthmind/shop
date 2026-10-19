#!/usr/bin/env node
// Static site generator: renders the real BigCartel Liquid templates
// (theme/*.html, copied verbatim from the BigCartel DRAFT snapshot of
// 2026-10-05, see README) against our own catalog data (data/catalog.json),
// then adds what BigCartel itself injects around them (Custom CSS + Head code
// before </head>, Body code before </body>) from theme/custom/.
//
// Everything this site needs because it is NOT BigCartel (sub-folder base
// path, static JSON endpoints, noindex) is applied HERE, at build time, so
// theme/*.html and theme/custom/* stay byte-identical to the draft.
//
// Usage: node generator/build.js

'use strict';
const fs = require('fs');
const path = require('path');
const liquid = require('./liquid');
const filters = require('./filters');
const translations = require('./translations');

const ROOT = path.join(__dirname, '..');
const THEME_DIR = path.join(ROOT, 'theme');
const CUSTOM_DIR = path.join(THEME_DIR, 'custom');
const PAGES_DIR = path.join(THEME_DIR, 'pages');
const DATA_DIR = path.join(ROOT, 'data');
// OUT_DIR (env) : dossier de sortie alternatif (essais de bascule, tests) ; par défaut docs/.
const OUT_DIR = process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : path.join(ROOT, 'docs');

// The real BigCartel templates hardcode root-absolute links (/, /products,
// /product/<slug>...) because BigCartel always serves a store from its domain
// root. This preview is a GitHub Pages PROJECT page (vgthmind.github.io/shop/),
// so links in the HTML get a /shop prefix here, and assets/vg-shop-shim.js
// handles what scripts build at runtime. A future move to a dedicated domain
// is just BASE_PATH = '' and a rebuild. Override with env BASE_PATH.
// Cloudflare Pages (variable CF_PAGES posée par Cloudflare) sert le site à la racine.
const ON_CF_PAGES = !!process.env.CF_PAGES;
const BASE_PATH = process.env.BASE_PATH !== undefined ? process.env.BASE_PATH : (ON_CF_PAGES ? '' : '/shop');
// Launch switch (data/shop-settings.json): "public": true removes the noindex
// tags and opens robots.txt; site_url = where the shop is served (sitemap).
// « site_url » est LE réglage central de l'adresse du site (liens de l'admin, CGV envoyée à Stripe, aperçus de
// partage, mails, sitemap) : le fichier fait foi, la variable SITE_URL de l'environnement n'est qu'un secours
// quand le fichier ne le donne pas. Jour de la bascule : changer site_url ici (https://vgthmind.org), rien d'autre.
const SHOP_SETTINGS = Object.assign({ public: false, site_url: 'https://vgthmind.github.io/shop' },
  process.env.SITE_URL ? { site_url: process.env.SITE_URL } : {},
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'shop-settings.json'), 'utf8')),
  process.env.SITE_URL_FORCE ? { site_url: process.env.SITE_URL_FORCE } : {}, // essais seulement (tests de bascule)
  process.env.SHOP_PUBLIC ? { public: process.env.SHOP_PUBLIC === '1' } : {});
// Vidéos (reels, clips des transitions, studio) : copiées dans assets/media/ (le site ne dépend
// plus du portfolio). Hors du dépôt docs/ (.gitignore) : seul le build Cloudflare les publie.
// L'ancien aperçu GitHub Pages (/shop) garde les adresses du portfolio jusqu'à son arrêt.
const LOCAL_MEDIA = ON_CF_PAGES || process.env.LOCAL_MEDIA === '1';
// Sortie par défaut (docs/, sans CF_PAGES ni OUT_DIR) = redirections vers site_url ; BUILD_FULL=1 force le site complet.
const REDIRECT_STUB = process.env.REDIRECT_STUB === '1' || (!ON_CF_PAGES && !process.env.OUT_DIR && process.env.LOCAL_MEDIA !== '1' && process.env.BUILD_FULL !== '1');

// Same file the BigCartel draft loads (Body <script src> + Layout preload).
// A copy is served by this site, wrapped so it sees location.pathname without
// the /shop prefix (see wrapScript) - the code itself is not modified.
// Sources : assets/vg-src/ (copiées du portfolio le 2026-10-12 ; c'est ICI qu'on
// les modifie désormais, le portfolio n'est plus lu).
const DEV_JS_SRC = path.join(__dirname, '..', 'assets', 'vg-src', 'vg-transitions-dev.js');
const DEV_KEYWORDS_SRC = path.join(__dirname, '..', 'assets', 'vg-src', 'search-keywords.json');
const LOCAL_DEV_JS = '/assets/vg/vg-transitions-dev.js';
// Same for the CSS (copied as is; its url()s are absolute).
const DEV_CSS_SRC = path.join(__dirname, '..', 'assets', 'vg-src', 'vg-transitions-dev.css');
const LOCAL_DEV_CSS = '/assets/vg/vg-transitions-dev.css';
let DEV_CSS_VERSION = '0'; // content hash, set in main()

// Comportement du thème : notre propre code (assets/vg-theme.js) + Splide
// (assets/vendor/, MIT). Plus rien n'est chargé depuis assets.bigcartel.com ni
// depuis un CDN de jQuery : le Layout appelle {{ theme | theme_js_url }} et
// {{ 'api' | theme_js_url }} ; la 2e balise (api.js, jQuery) est retirée à la
// construction (voir ownScripts()), la 1re devient Splide + vg-theme.js.
const OWN_THEME_JS = '/assets/vg-theme.js';
const NO_API_JS = '/assets/vg-no-api.js'; // marqueur : la balise est supprimée
filters.setThemeJsUrls({ theme: OWN_THEME_JS, api: NO_API_JS });

// Scripts du Layout remplacés par les nôtres : jQuery (cdnjs) et api.js ne
// servent plus (aucun code du site ne les utilise), le script « Product.find »
// de la fiche produit non plus (pièces uniques, pas d'options). Le script du
// thème devient Splide + vg-theme.js.
function ownScripts(html) {
  return html
    .replace(/[ \t]*<script src="\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jquery\/[^"]*"><\/script>\r?\n?/g, '')
    .replace(/[ \t]*<script src="[^"]*vg-no-api\.js[^"]*"><\/script>\r?\n?/g, '')
    .replace(/[ \t]*<script>\s*\/\/ Detect if this is back\/forward navigation[\s\S]*?<\/script>\r?\n?/g, '')
    .replace(/(<link rel="preload" as="script" href=")\/assets\/vg-theme\.js(")/, `$1${BASE_PATH}/assets/vg-theme.js$2`)
    .replace(/<script src="(\/assets\/vg-theme\.js)"><\/script>/g, '<script src="/assets/vendor/splide.min.js"></script>\n  <script src="$1"></script>');
}

// Pages bilingues (« English » puis « Français » separes par un <p class="vg-lang-sep">) :
// chaque paragraphe recoit lang="en" ou lang="fr" (lecteurs d'ecran, correcteurs,
// traduction). La page reste <html lang="en"> ; aucune structure HTML ajoutee.
function tagLanguages(content) {
  if (typeof content !== 'string' || content.indexOf('vg-lang-sep') === -1) return content;
  const parts = content.split(/(<p class="vg-lang-sep">[\s\S]*?<\/p>)/);
  let lang = '';
  return parts.map((part) => {
    if (/^<p class="vg-lang-sep">/.test(part)) {
      lang = /English/i.test(part) ? 'en' : /Fran(?:&ccedil;|ç)ais/i.test(part) ? 'fr' : '';
      return part;
    }
    return lang ? part.replace(/<p(?=[\s>])(?![^>]*\blang=)/g, `<p lang="${lang}"`) : part;
  }).join('');
}

// Polices hebergees ici (assets/fonts/, licence SIL OFL) au lieu de Google Fonts :
// le Custom CSS du brouillon commence par un @import vers fonts.googleapis.com,
// remplace a la construction par les @font-face locaux (sous-ensemble latin,
// qui couvre le francais). Plus d'appel a Google a chaque page.
const FONT_FACES = [
  ['Space Grotesk', 500, 'space-grotesk-latin-500'], ['Space Grotesk', 700, 'space-grotesk-latin-700'],
  ['Inter', 400, 'inter-latin-400'], ['Inter', 500, 'inter-latin-500'],
  ['IBM Plex Mono', 400, 'ibm-plex-mono-latin-400'], ['IBM Plex Mono', 500, 'ibm-plex-mono-latin-500'],
].map(([family, weight, file]) => `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url('/assets/fonts/${file}-normal.woff2') format('woff2');}`).join('\n');
function localFonts(css) {
  return css.replace(/@import url\('https:\/\/fonts\.googleapis\.com[^)]*\);?/, FONT_FACES);
}

// Front-end cart (step 3, see assets/vg-shop-cart.js) - minimal styling in
// the site's chrome/beige palette, additive like the rest of this file,
// never part of theme/custom/custom-css.css (byte-identical to the draft).
const CART_CSS = `
.vg-cart-unavailable{font-size:.85em;opacity:.7;margin-top:4px;}
.vg-cart-qty{margin-right:10px;padding:4px 8px;border-radius:999px;border:1px solid rgba(0,0,0,.18);background:rgba(255,255,255,.6);font:inherit;}
.vg-cart-rendered .cart-footer{display:flex;flex-direction:column;align-items:flex-end;gap:6px;}
.vg-cart-region{display:flex;align-items:center;gap:10px;margin-bottom:6px;}
.vg-cart-region select{padding:6px 12px;border-radius:999px;border:1px solid rgba(0,0,0,.18);background:rgba(255,255,255,.6);font:inherit;}
.vg-cart-line{display:flex;justify-content:space-between;gap:16px;padding:2px 0;}
.vg-cart-total{font-weight:600;}
.vg-cart-rendered .cart-subtotal__amount,.vg-cart-rendered .cart-item-price span{white-space:nowrap;}
.vg-cart-rendered .cart-subtotal{flex-wrap:nowrap;}
.vg-cart-rendered .cart-submit{margin-top:10px;}
.vg-cart-note{font-size:.85em;opacity:.75;margin-top:12px;text-align:right;}
.vg-cart-checkout-all[disabled]{opacity:.45;cursor:not-allowed;}
.vg-cart-msg{margin-top:12px;padding:10px 14px;border-radius:12px;background:rgba(255,255,255,.55);border:1px solid rgba(0,0,0,.12);}
.vg-cart-msg[hidden],.vg-order-summary[hidden]{display:none;}
.vg-order-summary{max-width:640px;margin:16px 0 24px;}
.vg-order-summary ul{list-style:none;padding:0;margin:0;}
.vg-track{max-width:640px;}
.vg-track [hidden]{display:none !important;}
.vg-track-lang{text-align:right;font-size:.85em;opacity:.7;margin:0 0 8px;}
.vg-track-lang a{text-decoration:none;}
.vg-track-lang a[aria-current=true]{font-weight:700;text-decoration:underline;}
.vg-track-intro{margin:0 0 24px;}
.vg-track input{width:100%;height:50px;box-sizing:border-box;background:rgba(255,255,255,.55);border:1px solid rgba(0,0,0,.18);border-radius:8px;color:#171717;padding:8px 12px;font:inherit;font-size:16px;transition:border-color .2s ease;}
.vg-track input::placeholder{color:rgba(0,0,0,.35);}
.vg-track input:focus{border-color:#171717;outline:none;}
.vg-track .vg-track-submit{display:block;margin:0 auto;max-width:320px;}
.vg-track-parcel a.button,.vg-track-parcel a.button:hover{text-decoration:none !important;display:inline-block;width:auto;padding-left:28px;padding-right:28px;}
.vg-track-msg{margin-top:20px;padding:10px 14px;border-radius:12px;background:rgba(255,255,255,.55);border:1px solid rgba(0,0,0,.12);}
.vg-track-submit[aria-busy=true]{opacity:.6;cursor:progress;}
.vg-track-result{animation:vg-track-in .32s ease-out both;}
@keyframes vg-track-in{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
.vg-track-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin:0 0 28px;}
.vg-track-ref{font-weight:700;letter-spacing:.06em;}
.vg-track-date{font-size:.9em;opacity:.7;}
.vg-track-steps,.vg-track-steps li{list-style:none;}
.vg-track-steps li::marker{content:"";}
.vg-track-steps{display:grid;grid-template-columns:repeat(3,1fr);list-style:none;margin:0 0 12px;padding:0;position:relative;}
.vg-track-steps li{position:relative;text-align:center;padding-top:34px;font-size:.9em;opacity:.55;}
.vg-track-steps li::before{content:"";position:absolute;top:8px;left:calc(50% - 9px);width:18px;height:18px;border-radius:50%;border:2px solid #171717;background:transparent;box-sizing:border-box;z-index:1;}
.vg-track-steps li::after{content:"";position:absolute;top:16px;left:calc(-50% + 9px);width:calc(100% - 18px);height:2px;background:rgba(0,0,0,.2);}
.vg-track-steps li:first-child::after{display:none;}
.vg-track-steps li.is-done{opacity:1;}
.vg-track-steps li.is-done::before{background:#171717;}
.vg-track-steps li.is-done::after{background:#171717;}
.vg-track-steps li.is-current{opacity:1;font-weight:700;}
.vg-track-steps li.is-current::before{box-shadow:0 0 0 4px rgba(0,0,0,.2);}
.vg-track-steps small{display:block;font-weight:400;opacity:.7;margin-top:2px;}
.vg-track-status{margin:0 0 32px;text-align:center;}
.vg-track-h{font-size:1em;font-weight:700;margin:32px 0 8px;text-align:left !important;text-transform:uppercase;letter-spacing:.04em;}
.vg-track-result .cart-item .cart-item-image-link img{object-fit:contain;object-position:center;background:transparent;}
.vg-track-unit{font-size:.8rem;opacity:.65;margin-top:2px;}
.vg-track-result .cart-items,.vg-track-result ul{padding:0;margin:0;list-style:none;}
.vg-track-result .cart-footer .cart-subtotal,.vg-track-result .cart-footer .cart-subtotal__label,.vg-track-result .cart-footer .cart-subtotal__amount{font-family:inherit !important;font-size:1rem !important;letter-spacing:normal !important;text-transform:none !important;font-weight:400 !important;}
.vg-track-result .cart-footer .vg-cart-total,.vg-track-result .cart-footer .vg-cart-total span{font-weight:700 !important;}
.vg-track-result .cart-footer .cart-subtotal{width:100%;justify-content:space-between;gap:16px;}
.vg-track-address{white-space:pre-line;margin:0;text-align:left !important;}
.vg-track-result h2.vg-track-h{text-align:left !important;}
.vg-track-parcel{margin-top:32px;padding:18px 20px;border:1px solid rgba(0,0,0,.2);border-radius:var(--border-radius);text-align:center;}
.vg-track-parcel p{margin:0 0 14px;}
.vg-track-parcel strong{letter-spacing:.04em;word-break:break-all;}
.vg-track-parcel .button{margin:0 auto;}
.vg-track-again{margin-top:32px;text-align:center;}
.vg-track-again .button{display:block;margin:0 auto;max-width:320px;}
.vg-track-result .cart-items{margin:0;}
.vg-track-result .cart-item{grid-template-columns:auto 1fr auto;}
.vg-track-result .cart-item .cart-item-detail{padding-right:0;}
.vg-track-result .cart-footer{display:flex;flex-direction:column;align-items:stretch;gap:6px;margin-top:16px;}
.vg-track-result .cart-subtotal{flex-wrap:nowrap;}
`.trim();

// Images que le thème/Body/dev JS chargent depuis le compte BigCartel
// (assets.bigcartel.com/theme_images|product_images, liés au compte) :
// servies depuis /shop/ pour que la boutique ne dépende plus de BigCartel.
// (theme.js / api.js sont remplacés par assets/vg-theme.js, voir ownScripts().)
// cover+clean.png est déjà en 404 chez BigCartel :
// remplacé par la 1re photo locale du CD.
const SITE_ORIGIN_URL = new URL(SHOP_SETTINGS.site_url).origin; // suit site_url (bascule de domaine)
const BC_IMAGE_MAP = [
  [/https:\/\/assets\.bigcartel\.com\/theme_images\/142638069\/Cover\.png(\?[^"'\s)]*)?/g, () => `${SITE_ORIGIN_URL}${BASE_PATH}/assets/theme/bc/cover-og.jpg`],
  [/https:\/\/assets\.bigcartel\.com\/theme_images\/122404563\/Illustration_sans_titre\+_1_\.PNG(\?[^"'\s)]*)?/g, () => `${BASE_PATH}/assets/theme/bc/logo-illustration.png`],
  // Icones des transitions / du menu : etaient servies par le depot vgthmind.github.io
  // (cart-icon.png pesait 100 Ko, info-icon.png 373 Ko) ; copies allegees dans assets/theme/icons/.
  [/https:\/\/vgthmind\.github\.io\/assets\/bigcartel\/((?:cart|products|info|contact|studio|suivi)-icon\.png)/g, (m, f) => `${BASE_PATH}/assets/theme/icons/${f}`],
  [/https:\/\/assets\.bigcartel\.com\/product_images\/405517188\/cover\+clean\.png(\?[^"'\s)]*)?/g, () => `${BASE_PATH}/assets/products/cd-vgtape/0.png`],
  // Vidéos (reels, clip_N.mp4, dossier studio/) : copies dans assets/media/ (voir LOCAL_MEDIA).
  ...(LOCAL_MEDIA ? [[/https:\/\/vgthmind\.github\.io\/assets\/bigcartel\/(reels\/|clip_\d+\.mp4|studio\/)/g, (m, f) => `${BASE_PATH}/assets/media/${f}`]] : []),
];
function localizeBigCartelImages(text) {
  if (typeof text !== 'string' || (text.indexOf('assets.bigcartel.com') === -1 && text.indexOf('/assets/bigcartel/') === -1)) return text;
  return BC_IMAGE_MAP.reduce((t, [re, to]) => t.replace(re, to), text);
}

// Pièces masquées : config (couleur, reel) injectée dans leur seule fiche, jamais dans le fichier public.
const HIDDEN_CONFIG = {};

// ICON_V : a changer pour forcer les navigateurs a recharger les icones (le cache d'onglet est tetu).
const ICON_V = 3;
const FAVICON_LINKS = [
  `<link rel="icon" href="${BASE_PATH}/assets/theme/favicon.svg?v=${ICON_V}" type="image/svg+xml">`,
  `<link rel="icon" href="${BASE_PATH}/assets/theme/favicon-32.png?v=${ICON_V}" type="image/png" sizes="32x32">`,
  `<link rel="icon" href="${BASE_PATH}/assets/theme/favicon-16.png?v=${ICON_V}" type="image/png" sizes="16x16">`,
  `<link rel="shortcut icon" href="${BASE_PATH}/favicon.ico?v=${ICON_V}">`,
  `<link rel="apple-touch-icon" sizes="180x180" href="${BASE_PATH}/assets/theme/apple-touch-icon.png?v=${ICON_V}">`,
  `<link rel="manifest" href="${BASE_PATH}/site.webmanifest?v=${ICON_V}">`,
].join('\n');

// Custom pages of the draft, in its order (they make the header nav:
// PRODUCTS comes from the layout, then these).
const CUSTOM_PAGES = [
  { name: 'Info & Terms', url: '/infos-conditions-generales', permalink: 'infos-conditions-generales' },
  { name: 'Contact', url: '/contact-914a3d', permalink: 'contact-914a3d' },
  { name: 'Studio', url: '/studio', permalink: 'studio' },
  // Pièce sur demande / production / collab : parcours étape par étape (theme/pages/sur-demande.html + assets/vg-demande.js).
  { name: 'Got a project?', url: '/sur-demande', permalink: 'sur-demande' },
];
// Pages legales : liens du pied de page uniquement (required_pages du gabarit),
// pas dans le menu du haut.
const LEGAL_PAGES = [
  { name: 'Mentions légales', url: '/mentions-legales', permalink: 'mentions-legales' },
  { name: 'Confidentialité', url: '/confidentialite', permalink: 'confidentialite' },
];
// Stripe Checkout return pages (success_url / cancel_url of checkout-worker/).
const SHOP_PAGES_DIR = path.join(__dirname, 'shop-pages');
const SHOP_PAGES = [
  { name: 'Thank you / Merci', url: '/merci', permalink: 'merci' },
  { name: 'Payment cancelled / Paiement annulé', url: '/paiement-annule', permalink: 'paiement-annule' },
  // Suivi de commande (numero + e-mail) : lien discret du pied de page, jamais dans le sitemap, toujours noindex.
  { name: 'Track my order', url: '/suivi', permalink: 'suivi' },
  // Page privée d'une demande (lien secret du mail : devis, acompte, validation sur photos, solde). Jamais indexée.
  { name: 'My request', url: '/demande', permalink: 'demande' },
  // GitHub Pages sert 404.html pour toute adresse inconnue sous /shop/.
  { name: 'Page not found / Page introuvable', url: '/404', permalink: '404', out: '404.html' },
];

function rel(...p) { return path.join(...p); }
function read(p) { return fs.readFileSync(p, 'utf8'); }

// --- base path ---------------------------------------------------------
function prefixUrls(html) {
  // Pass 1: root-relative URL right after a " or ' (href="/...", src="/...",
  // action="/...", a srcset's first URL, data-*='["/..."]'). "//" (CDN,
  // protocol-relative) is left alone.
  html = html.replace(/(["'])(\s*)\/(?!\/)/g, (m, q, ws) => `${q}${ws}${BASE_PATH}/`);
  // Pass 2: a srcset's later comma-separated URLs.
  html = html.replace(/srcset="[^"]*/g, (m) => m.replace(/,(\s*)\/(?!\/)/g, (mm, sp) => `,${sp}${BASE_PATH}/`));
  return html;
}

// Applies prefixUrls to the markup but NOT inside inline <script> bodies
// (their '/'-strings are code - split('/'), regexes, '/' === pathname - and
// are handled at runtime by the shim instead). A <script src="/..."> tag
// itself is still prefixed.
function withBasePath(html) {
  if (!BASE_PATH) return html;
  const out = [];
  const re = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi;
  let last = 0; let m;
  while ((m = re.exec(html))) {
    out.push(prefixUrls(html.slice(last, m.index)));
    out.push(prefixUrls(m[1]), m[2], m[3]);
    last = re.lastIndex;
  }
  out.push(prefixUrls(html.slice(last)));
  return out.join('');
}

// Runs a script with the shim's location (pathname seen without /shop).
// `window.location` is read through the same wrapper; nothing else changes.
function wrapScript(code) {
  if (!BASE_PATH) return code;
  return '(function (location) {\n' + code.replace(/\bwindow\.location\b/g, 'location') + '\n}).call(window, window.__vgLoc || window.location);';
}

function wrapInlineScripts(html) {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, body) => {
    if (/\bsrc\s*=/.test(attrs) || !body.trim()) return m;
    return `<script${attrs}>${wrapScript(body)}</script>`;
  });
}

// --- data --------------------------------------------------------------
function loadCatalog() {
  const p = rel(DATA_DIR, 'catalog.json');
  if (!fs.existsSync(p)) throw new Error(`Missing ${p} - run generator/build-catalog.js first.`);
  const c = JSON.parse(read(p));
  // BigCartel's Liquid exposes product.has_default_option (one option, no
  // option groups -> hidden input, no "Select variant" dropdown); its
  // products.json doesn't.
  for (const pr of c.products) {
    if (pr.has_default_option === undefined) pr.has_default_option = !pr.has_option_groups && (pr.options || []).length === 1;
  }
  return c;
}

const STORE_SETTINGS = JSON.parse(read(rel(THEME_DIR, 'settings.json')));

function baseTheme() {
  // settings.json plus the theme.* keys real templates read that BigCartel
  // does NOT put in settings.json (uploaded image assets).
  // Same images as the draft (BigCartel theme_images 122404563 / 142638069),
  // downloaded once into assets/theme/.
  return Object.assign({}, STORE_SETTINGS, {
    images: { logo_image: { url: '/assets/theme/logo.png', width: 1600, height: 1200 } },
    image_sets: { slideshow: [{ url: '/assets/theme/cover.png', width: 2000, height: 1273 }] },
  });
}

function baseContext(catalog) {
  return {
    theme: baseTheme(),
    store: catalog.store,
    t: translations,
    cart: { item_count: 0, total: 0, items: [] },
    pages: { custom_pages: CUSTOM_PAGES, subscribe_page: null, required_pages: LEGAL_PAGES.concat(SHOP_PAGES.filter((p) => p.permalink === 'suivi')) },
    categories: { active: catalog.categories },
    __imageMap: catalog.imageMap || {},
  };
}

// Description pour les moteurs de recherche et les aperçus de partage : la fiche
// est « anglais, ligne vide, français » ; on garde le 1er paragraphe (anglais),
// ligne par ligne séparées par des virgules, sans tirets de liste, puis la
// mention « pièce unique ». (Avant : tout le texte collé sans ponctuation.)
function seoDescription(product, withFrench) {
  const paras = String(product.description || '').split(/\r?\n\s*\r?\n/);
  const flat = (t) => String(t || '').split(/\r?\n/).map((l) => l.replace(/^[\s-]+/, '').replace(/[\s.]+$/, '').trim()).filter(Boolean).join(', ');
  const en = flat(paras[0]);
  const fr = flat(paras[1]);
  if (withFrench) return ((fr || en) + '. Pièce unique faite en France par vgthmind.').slice(0, 300);
  // Aperçu de partage : une seule langue (français ; l'anglais seulement si la fiche n'a pas de texte français).
  return fr ? (fr + '. Pièce unique faite en France par vgthmind.').slice(0, 300) : (en + '. One-of-a-kind piece made in France by vgthmind.').slice(0, 300);
}

// products.json / product/<slug>.js as BigCartel serves them, with our local
// photos (prefixed: these are data, not passed through withBasePath).
function localizeProduct(p, imageMap) {
  const q = JSON.parse(JSON.stringify(p));
  for (const img of q.images || []) {
    if (imageMap[img.url]) img.url = BASE_PATH + imageMap[img.url];
  }
  if (q.image && imageMap[q.image.url]) q.image.url = BASE_PATH + imageMap[q.image.url];
  return q;
}

// --- head / body injections (what BigCartel adds around the templates) ---
function headContent(page, product, imageMap) {
  if (!product) return '';
  // Aperçu de partage : JPG carré 1200x1200 < 300 Ko (generator/resize-images.js), adresse encodée (accents).
  const img = product.permalink ? SITE_ORIGIN_URL + BASE_PATH + '/assets/products-og/' + encodeURIComponent(product.permalink) + '.jpg' : '';
  const ogTitle = `${product.name} | vgthmind`;
  const hid = product.hidden && HIDDEN_CONFIG[product.permalink] ? `<script>window.__vgConfigExtra=${JSON.stringify({ [product.permalink]: HIDDEN_CONFIG[product.permalink] }).replace(/</g, '\\u003c')};</script>` : '';
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const desc = esc(seoDescription(product, false));
  return [
    hid,
    `<meta name="description" content="${desc}">`,
    `<meta property="og:type" content="product">`,
    `<meta property="og:title" content="${esc(ogTitle)}">`,
    `<meta property="og:description" content="${desc}">`,
    img ? `<meta property="og:image" content="${esc(img)}">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="1200">` : '',
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(ogTitle)}">`,
    `<meta name="twitter:description" content="${desc}">`,
    img ? `<meta name="twitter:image" content="${esc(img)}">` : '',
  ].join('\n    ');
}

// The real Layout's own custom code (theme/custom - see injectAround) always
// prints a STORE-WIDE description/og:description/og:image/twitter:* first
// (it has no per-product data to work with). For a product page this
// generator's own headContent() above prints the real, product-specific
// versions of the very same tags right after - keeping both would leave two
// <meta property="og:description"> etc. in the page, and which one a given
// crawler/share-preview picks is not guaranteed to be "the last one". Drop
// the generic occurrence of each tag headContent() overrides so there is
// only ever one of each - theme/custom/head.html itself is untouched.
const PRODUCT_META_OVERRIDES = ['name="description"', 'property="og:description"', 'property="og:image"', 'property="og:image:type"', 'property="og:image:width"', 'property="og:image:height"', 'name="twitter:description"', 'name="twitter:image"'];
function stripGenericMeta(html, names) {
  for (const n of names) {
    html = html.replace(new RegExp(`<meta ${n}[^>]*>\\n?`), '');
  }
  return html;
}

function injectAround(html, parts, product, relPath) {
  // Head: noindex + Custom CSS + Head code, right before </head> (where
  // BigCartel puts them). The shim goes first in <head>, before any script.
  const shim = `<script>window.__VG_BASE = ${JSON.stringify(BASE_PATH)};\n${parts.shim}</script>`;
  html = html.replace(/<head>/i, (m) => `${m}\n${shim}`);
  // Favicon : les memes fichiers que vgthmind.bigcartel.com (copies dans
  // assets/theme/ ; BigCartel les sert hors gabarit).
  html = html.replace(/<\/head>/i, (m) => `${FAVICON_LINKS}\n${m}`);
  // Cloudflare Web Analytics (sans cookie) : actif dès que le jeton public
  // est renseigné dans data/shop-settings.json (cf_analytics_token).
  const cfToken = String(SHOP_SETTINGS.cf_analytics_token || '').trim();
  if (/^[a-f0-9]{32}$/i.test(cfToken)) {
    // Le DERNIER </body> : un commentaire du Layout contient aussi ce texte
    // (le 1er remplacement y glissait le script, inactif).
    const end = html.lastIndexOf('</body>');
    const beacon = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${cfToken}"}'></script>\n`;
    if (end !== -1) html = html.slice(0, end) + beacon + html.slice(end);
  }
  // See headContent()/PRODUCT_META_OVERRIDES above: a product page already
  // got its real description/og/twitter tags from {{ head_content }}
  // (rendered into `html` by layout.html before this function runs) -
  // drop the store-wide ones the Layout's own custom code prints first, so
  // share previews/crawlers see the product's own, not the generic ones.
  if (product) html = stripGenericMeta(html, PRODUCT_META_OVERRIDES);
  // The real layout has no <html> tag (BigCartel's neither), so no page
  // language: Safari iPhone guesses one and offers "Translation available"
  // on every load. Declare English (the shop's main language) and opt out of
  // translation (the pages already have their own English / French parts).
  html = html.replace(/<!DOCTYPE html>/i, (m) => `${m}\n<html lang="en" translate="no">`);
  html = ownScripts(html);
  // The layout's own transition boot (arrival check: flag href vs current
  // path) must see the same /shop-less path as vg-transitions-dev.js.
  // Only that script: the theme's other inline scripts declare globals
  // (themeColors, themeOptions...) that theme.js reads.
  html = html.replace(/<script>(\s*\(function \(\) \{\s*window\.addEventListener\('pageshow'[\s\S]*?)<\/script>/, (m, body) => {
    if (!/vg-transition-boot/.test(body)) return m;
    return `<script>${wrapScript(body)}</script>`;
  });
  // SEO : adresse canonique + og:url (+ og:title hors fiches), et données
  // structurées Product (prix, stock) pour Google. Rien sur les pages
  // techniques (merci, paiement-annule, 404, contact).
  let seoTags = '';
  // Pages techniques (merci, suivi, demande, paiement annulé) : pas d'adresse canonique, mais un titre de partage.
  if (relPath && /^(merci|paiement-annule|suivi|demande\/)/.test(relPath)) {
    const t0 = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
    const escT = (v) => String(v || '').trim().replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    if (t0) seoTags = '<meta property="og:title" content="' + escT(t0) + '">\n<meta property="og:type" content="website">\n<meta name="twitter:card" content="summary_large_image">';
  }
  if (relPath && !/^(merci|paiement-annule|suivi|demande\/|404|contact\/)/.test(relPath)) {
    const escA = (v) => String(v || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const pagePath = '/' + relPath.replace(/index\.html$/, '').replace(/\/$/, '');
    const url = SHOP_SETTINGS.site_url.replace(/\/$/, '') + (pagePath === '/' ? '/' : pagePath);
    seoTags = `<link rel="canonical" href="${escA(url)}">\n<meta property="og:url" content="${escA(url)}">`;
    if (!product) {
      const t = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
      if (t) seoTags += `\n<meta property="og:title" content="${escA(t.trim())}">\n<meta property="og:type" content="website">\n<meta name="twitter:card" content="summary_large_image">`;
    } else {
      const imgs = (product.images || []).map((im) => im.url).filter(Boolean).slice(0, 4)
        .map((u) => (u.charAt(0) === '/' ? SHOP_SETTINGS.site_url.replace(/\/$/, '') + u : u));
      const ld = {
        '@context': 'https://schema.org', '@type': 'Product', name: product.name,
        description: seoDescription(product, true).slice(0, 500),
        sku: product.permalink,
        image: imgs, brand: { '@type': 'Brand', name: 'vgthmind' },
        // Le stock reel vit dans le Worker (Durable Object) et change a chaque vente sans reconstruction du
        // site : on n'affiche donc que ce qui est sur (« epuise » a la construction) ; « en stock » est omis
        // plutot que faux apres la 1re vente.
        offers: Object.assign({ '@type': 'Offer', url, priceCurrency: 'EUR', price: String(product.price) },
          product.quantity === 0 ? { availability: 'https://schema.org/OutOfStock' } : {}),
      };
      seoTags += `\n<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`;
    }
  }
  const headExtra = [
    seoTags,
    // Prototype: hidden from search engines until data/shop-settings.json
    // says "public": true (launch day, see README).
    SHOP_SETTINGS.public && !/^(suivi|demande)\//.test(relPath || '') ? '' : '<meta name="robots" content="noindex, nofollow">',
    // Stock réel lu au chargement (assets/vg-shop-cart.js) : « Add to cart »
    // masqué le temps de la réponse (2,6 s max, puis affiché quoi qu'il arrive).
    '<script>(function(d){d.classList.add("vg-stock-pending");setTimeout(function(){d.classList.remove("vg-stock-pending")},2600)})(document.documentElement)</script>'
      + '<style>.vg-stock-pending #add-to-cart-form{visibility:hidden}</style>',
    `<style>\n${parts.customCss}\n</style>`,
    parts.headCode,
    // vg-transitions-dev.css hides the menu's Home link with
    // a[href="/"]; here that link is /shop/, so Home stayed in the mobile
    // menu, which then grew taller than the screen on iPhone and its
    // bottom (categories) scrolled past the glass background. Same rule,
    // its "/" gets the /shop prefix from withBasePath like every URL here.
    BASE_PATH ? '<style>body #navigation-modal .page_list li:has(> a[href="/"]){display:none !important;}</style>' : '',
    // The "← Produits" link is in the HTML from the start (see page()); its
    // style, taken from the Body, must be there from the first paint too.
    `<style>\n${(parts.bodyCode.match(/^\.vg-back-link[^{\n]*\{[^}\n]*\}$/gm) || []).join('\n')}\n</style>`,
    // Front-end cart (step 3, see assets/vg-shop-cart.js) - additive, not
    // part of the real draft's Custom CSS.
    `<style>${CART_CSS}</style>`,
  ].join('\n');
  html = html.replace(/<\/head>/i, () => `${headExtra}\n</head>`);
  // The Layout's <link rel="preload"> must name the file the Body really
  // runs (our wrapped copy), as on BigCartel. Left on vgthmind.github.io it
  // preloaded a file nobody runs: our copy was only fetched after jQuery /
  // api.js / theme.js, so on iPhone the Body scripts (the "← Produits" link
  // above the product title...) ran well after the arrival and the title
  // and price jumped.
  html = html.replace(
    /(<link rel="preload" as="script" href=")https:\/\/vgthmind\.github\.io\/assets\/bigcartel\/vg-transitions-dev\.js[^"]*(")/,
    (m, a, b) => `${a}${LOCAL_DEV_JS}${b}`);
  html = html.replace(
    /https:\/\/vgthmind\.github\.io\/assets\/bigcartel\/vg-transitions-dev\.css\?v=[^"]*/g,
    () => `${LOCAL_DEV_CSS}?v=${DEV_CSS_VERSION}`);
  // Body code before </body>, its dev-JS <script src> pointed at our wrapped copy.
  const body = wrapInlineScripts(parts.bodyCode).replace(
    /<script src="https:\/\/vgthmind\.github\.io\/assets\/bigcartel\/vg-transitions-dev\.js[^"]*"><\/script>/,
    `<script src="${LOCAL_DEV_JS}"></script>`);
  // Front-end cart, after the Body/dev-JS scripts (step 3, see
  // assets/vg-shop-cart.js - not part of the real draft).
  // + the country picker of the cart (vg-shipping-picker.js: price from the Worker, same calculation as the payment).
  const cartScript = '<script src="/assets/vg-shop-cart.js" defer></script>\n<script src="/assets/vg-shipping-view.js" defer></script>\n<script src="/assets/vg-shipping-picker.js" defer></script>';
  const i = html.lastIndexOf('</body>');
  return html.slice(0, i) + body + '\n' + cartScript + '\n' + html.slice(i);
}

// Pages de redirection de l'ancien aperçu GitHub Pages : index.html + 404.html (GitHub sert 404.html pour toute adresse
// inconnue du dossier), qui renvoient /shop/<chemin>?<requête>#<ancre> vers <site_url>/<chemin>?<requête>#<ancre>.
// Chemin inconnu (hors pages du site) = accueil. Désinscrit aussi le service worker et vide les caches de l'ancien admin.
// Bandeau « Version de test » sur toutes les pages de la boutique tant que data/shop-settings.json n'a pas "public": true
// (même interrupteur que le noindex : il disparaît à la bascule, sans rien d'autre à faire). Ne gêne aucun clic.
const TEST_BANNER = '<div id="vg-test-banner" role="note" style="position:fixed;left:0;right:0;bottom:0;z-index:2147483000;padding:5px 10px calc(5px + env(safe-area-inset-bottom));background:rgba(23,23,23,.88);color:#f4f2ec;font:11px/1.35 IBM Plex Mono,ui-monospace,monospace;letter-spacing:.03em;text-align:center;pointer-events:none">Version de test : aucun paiement réel, carte de test 4242 4242 4242 4242</div><style>.vg-splash{z-index:2147482999!important}</style>';
function testBanner(html, relPath) {
  if (SHOP_SETTINGS.public || typeof html !== 'string' || !/\.html$/.test(relPath || '') || /^admin\//.test(relPath)) return html;
  const i = html.lastIndexOf('</body>');
  return i === -1 ? html : html.slice(0, i) + TEST_BANNER + '\n' + html.slice(i);
}

function writeRedirectStub(catalog) {
  const site = SHOP_SETTINGS.site_url.replace(/\/$/, '');
  const top = ['products', 'cart', 'contact', 'contact-914a3d', 'merci', 'paiement-annule', 'suivi', 'demande', 'studio', 'sur-demande',
    'confidentialite', 'infos-conditions-generales', 'mentions-legales', 'admin', 'site.webmanifest', 'favicon.ico', 'products.xml', 'products.json', 'sitemap.xml'];
  const cfg = {
    site,
    top,
    product: catalog.products.map((x) => x.permalink),
    category: catalog.categories.map((x) => x.permalink),
  };
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, follow"><title>vgthmind</title>
<link rel="canonical" href="${site}/">
<noscript><meta http-equiv="refresh" content="0; url=${site}/"></noscript>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f2ec;color:#171717;font:16px/1.5 system-ui,-apple-system,sans-serif}a{color:inherit}</style></head>
<body><p>Le site a déménagé : <a id="go" href="${site}/">${site.replace(/^https?:\/\//, '')}</a></p>
<script>
(function () {
  var C = ${JSON.stringify(cfg)};
  var path = location.pathname.replace(/^\\/shop(?=\\/|$)/, '') || '/';
  var seg = path.split('/').filter(Boolean);
  var ok = true;
  if (!seg.length) ok = true;
  else if (seg[0] === 'product') ok = seg.length === 1 || C.product.indexOf(decodeURIComponent(seg[1])) !== -1;
  else if (seg[0] === 'category') ok = seg.length === 1 || C.category.indexOf(decodeURIComponent(seg[1])) !== -1;
  else if (seg.length) ok = C.top.indexOf(seg[0]) !== -1;
  var dest = ok ? C.site + path + location.search + location.hash : C.site + '/';
  document.getElementById('go').href = dest;
  var done = false;
  function go() { if (!done) { done = true; location.replace(dest); } }
  // Ancien admin installé sur cet appareil : service worker et pages gardées hors ligne supprimés.
  var jobs = [];
  try { if (navigator.serviceWorker) jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); })); } catch (e) {}
  try { if (window.caches) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })); } catch (e) {}
  Promise.all(jobs).then(go, go); setTimeout(go, 700);
})();
</script></body></html>
`;
  fs.writeFileSync(rel(OUT_DIR, 'index.html'), html);
  fs.writeFileSync(rel(OUT_DIR, '404.html'), html);
  fs.writeFileSync(rel(OUT_DIR, '.nojekyll'), '');
}

async function main() {
  const catalog = loadCatalog();
  const imageMap = catalog.imageMap || {};
  const T = (n) => read(rel(THEME_DIR, n));
  const layoutSrc = T('layout.html');
  const src = { home: T('home.html'), products: T('products.html'), product: T('product.html'), contact: T('contact.html'), cart: T('cart.html') };
  const parts = {
    shim: read(rel(ROOT, 'assets', 'vg-shop-shim.js')),
    customCss: localFonts(read(rel(CUSTOM_DIR, 'custom-css.css'))),
    // Noms anglais facultatifs (nom français -> nom anglais) : assets/vg-lang.js les utilise pour les textes alternatifs en mode EN.
    headCode: read(rel(CUSTOM_DIR, 'head.html')) + '\n<script>window.vgNamesEn=' + JSON.stringify(Object.fromEntries(catalog.products.filter((p) => !p.hidden && p.name_en && p.name_en !== p.name).map((p) => [p.name, p.name_en]))).replace(/</g, '\\u003c') + ';</script>',
    // The Body reads products-config.json (portfolio) for, among others,
    // unique_mode: served from /shop/ with "force-no" added for the pieces
    // the admin gives more than one in stock (no "Unique piece" badge).
    bodyCode: read(rel(CUSTOM_DIR, 'body.html')).replace(
      "fetch('https://vgthmind.github.io/assets/bigcartel/products-config.json')",
      "fetch('/assets/vg/products-config.json')"),
  };
  // Colour, reel and badge now live in each data/products/<slug>.json (written
  // by the admin piece wizard): no more portfolio-hosted products-config.json.
  const productsConfig = {};
  for (const p of catalog.products) {
    const entry = {};
    if (p.color_hex) entry.couleur_hex = p.color_hex;
    if (p.color_name) entry.couleur_nom = p.color_name;
    if (p.reel_url) entry.reel_url = p.reel_url;
    if (p.reel_video) entry.reel_video = BASE_PATH + p.reel_video;
    if (p.unique === false || (p.quantity || 0) > 1) entry.unique_mode = 'force-no';
    if (Object.keys(entry).length) { if (p.hidden) HIDDEN_CONFIG[p.permalink] = entry; else productsConfig[p.permalink] = entry; }
  }

  const devJs = read(DEV_JS_SRC);
  const devCss = read(DEV_CSS_SRC);
  DEV_CSS_VERSION = require('crypto').createHash('sha1').update(devCss).digest('hex').slice(0, 10);
  const keywords = read(DEV_KEYWORDS_SRC);

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Ancien aperçu GitHub Pages (vgthmind.github.io/shop/, dossier docs/ commité) : plus de copie du site ni de l'admin,
  // seulement des pages qui renvoient chaque ancienne adresse vers la même page de site_url (sinon l'accueil).
  // Le vrai site est construit par Cloudflare (CF_PAGES) ; OUT_DIR / LOCAL_MEDIA = essais et tests (site complet).
  if (REDIRECT_STUB) {
    writeRedirectStub(catalog);
    console.log(`Redirections écrites dans ${OUT_DIR} (vers ${SHOP_SETTINGS.site_url}) : ${catalog.products.length} pièces connues`);
    return;
  }

  const base = baseContext(catalog);
  const write = (relPath, html) => {
    const dest = rel(OUT_DIR, relPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, testBanner(localizeBigCartelImages(html), relPath));
  };
  // page_title is assigned at the top of the real layout (before
  // <!DOCTYPE html>), but page templates (products.html, cart.html) print it
  // too: compute it with the layout's own preamble first.
  const preamble = layoutSrc.slice(0, layoutSrc.indexOf('<!DOCTYPE'));
  const withTitle = (ctx) => Object.assign(ctx, { page_title: liquid.render(preamble + '{{ page_title }}', ctx, filters).trim() });
  const page = (relPath, templateSrc, ctx, product) => {
    withTitle(ctx);
    let pageContent = liquid.render(templateSrc, ctx, filters);
    // The Body adds a "← Produits" link above the title of category and
    // product pages, but only once its scripts run (after jQuery / api.js /
    // theme.js): on iPhone that is after the arrival, and the title and price
    // jumped. Same link, in the HTML from the start (the Body script sees it
    // and adds nothing).
    if (/^(category|product)\//.test(relPath)) {
      pageContent = pageContent.replace(/<h1\b/, '<a class="vg-back-link" href="/products">← Boutique</a>$&');
    }
    const layoutCtx = Object.assign({}, ctx, { page_content: pageContent, head_content: headContent(ctx.page, product, imageMap) });
    const html = liquid.render(layoutSrc, layoutCtx, filters);
    write(relPath, withBasePath(injectAround(html, parts, product, relPath)));
  };

  page('index.html', src.home, Object.assign({}, base, {
    page: { name: 'Home', permalink: 'home', category: 'home', full_url: '/' },
    // home.html: {% paginate products from products.current by theme.featured_products %}
    products: { current: catalog.products.filter((p) => !p.hidden) },
  }));
  page('products/index.html', src.products, Object.assign({}, base, {
    page: { name: 'Products', permalink: 'products', category: 'products', full_url: '/products' },
    products: { current: catalog.products.filter((p) => !p.hidden) },
  }));
  for (const cat of catalog.categories) {
    // "all" is a real page too (/category/all) - every product's categories
    // list already includes it (see generator/build-catalog.js), and the
    // nav (categories.active, theme/layout.html) links to it like any
    // other category: skipping it here left a 404'ing "ALL" link in the
    // header/footer/mobile menu on every single page (found by checking
    // every generated href against the actual docs/ output, not assumed).
    const filtered = catalog.products.filter((p) => (p.categories || []).some((c) => c.permalink === cat.permalink));
    page(`category/${cat.permalink}/index.html`, src.products, Object.assign({}, base, {
      page: { name: cat.name, permalink: cat.permalink, category: 'products', full_url: `/category/${cat.permalink}` },
      products: { current: filtered },
    }));
  }
  // Pièce masquée (sans date) : pas de fiche du tout (/product/<nom> renvoie vers /products). Programmée : fiche « Coming soon », non listée.
  const noPage = (p) => p.hidden && !p.scheduled;
  for (const p of catalog.products) {
    if (noPage(p)) continue;
    page(`product/${p.permalink}/index.html`, src.product, Object.assign({}, base, {
      page: { name: p.name, permalink: p.permalink, category: 'product', full_url: `/product/${p.permalink}` },
      product: p,
    }), p);
  }
  // /contact (formulaire natif BigCartel, sans backend ici) : renvoie vers
  // la vraie page Contact (Instagram + e-mail), celle de la navigation.
  const contactUrl = `${BASE_PATH}/contact-914a3d`;
  write('contact/index.html', '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex">'
    + `<meta http-equiv="refresh" content="0;url=${contactUrl}"><link rel="canonical" href="${contactUrl}">`
    + FAVICON_LINKS
    + `<title>Contact | vgthmind</title><a href="${contactUrl}">Contact</a>`);
  page('cart/index.html', src.cart, Object.assign({}, base, {
    page: { name: 'Cart', permalink: 'cart', category: 'cart', full_url: '/cart' },
  }));
  // Custom pages (Info & Terms, Contact, Studio): the layout renders
  // page_content itself for category 'custom' (no page template).
  // + the checkout return pages (not in the draft, not in the nav): same
  // rendering, content in generator/shop-pages/, filled by vg-shop-cart.js.
  const pageSources = [
    ...CUSTOM_PAGES.map((cp) => Object.assign({ file: rel(PAGES_DIR, cp.permalink + '.html') }, cp)),
    ...LEGAL_PAGES.map((lp) => Object.assign({ file: rel(PAGES_DIR, lp.permalink + '.html') }, lp)),
    ...SHOP_PAGES.map((sp) => Object.assign({ file: rel(SHOP_PAGES_DIR, sp.permalink + '.html') }, sp)),
  ];
  for (const cp of pageSources) {
    const content = tagLanguages(read(cp.file));
    const ctx = Object.assign({}, base, {
      page: { name: cp.name, permalink: cp.permalink, category: 'custom', full_url: cp.url },
    });
    const layoutCtx = Object.assign({}, ctx, { page_content: content, head_content: '' });
    write(cp.out || `${cp.permalink}/index.html`, withBasePath(injectAround(liquid.render(layoutSrc, layoutCtx, filters), parts, undefined, cp.out || `${cp.permalink}/index.html`)));
  }

  // Static stand-ins for BigCartel's JSON endpoints read by the scripts:
  // /products.json (Body: home category tiles; dev JS: pops, section 3),
  // /product/<slug>.js (read by assets/vg-shop-cart.js on add-to-cart),
  // /cart.js (our own cart lives in localStorage instead, see
  // vg-shop-cart.js; this stays empty/unused, kept in case a script asks).
  const localized = catalog.products.map((p) => localizeProduct(p, imageMap));
  // Pièces masquées (aperçu) : pas dans products.json (recherche, panier, pièces similaires) ; leur fiche et product/<slug>.js restent.
  write('products.json', JSON.stringify(localized.filter((p) => !p.hidden)));
  for (const p of localized) { if (p.hidden && !p.scheduled) continue; write(`product/${p.permalink}.js`, JSON.stringify(p)); }
  write('cart.js', JSON.stringify({ item_count: 0, items: [], price: 0, total: 0, shipping: null, discount: null }));

  // Assets: theme.css is a Liquid template too (theme.* colours/fonts).
  fs.mkdirSync(rel(OUT_DIR, 'assets', 'vg'), { recursive: true });
  write('assets/theme.css', liquid.render(T('theme.css'), base, filters));
  // Seul ajout au code du fichier : sized() (taille ?w= demandée au CDN
  // BigCartel) passe d'abord par window.__vgSized (shim : variante WebP
  // locale). Si le motif change côté portfolio, la copie reste telle quelle.
  const SIZED_HOOK = /function sized\(url, px\) \{\r?\n/;
  if (!SIZED_HOOK.test(devJs)) console.warn('build: sized() introuvable dans vg-transitions-dev.js, photos des pops en taille d\'origine');
  const devJsHooked = devJs.replace(SIZED_HOOK,
    (m) => `${m}    if (window.__vgSized) { var vgS = window.__vgSized(url, px); if (vgS) return vgS; }\n`);
  write('assets/vg/vg-transitions-dev.js', wrapScript(devJsHooked));
  write('assets/vg/vg-transitions-dev.css', devCss);
  write('assets/vg/products-config.json', JSON.stringify(productsConfig, null, 1));
  // Clips de l'écran d'ouverture : tous les .mp4 du dossier assets/media/splash/ (ajout depuis l'admin « Vidéos d'ouverture »).
  const splashDir = rel(ROOT, 'assets', 'media', 'splash');
  const splashList = fs.existsSync(splashDir) ? fs.readdirSync(splashDir).filter((f) => /.mp4$/i.test(f)).sort().map((f) => BASE_PATH + '/assets/media/splash/' + encodeURIComponent(f)) : [];
  write('assets/vg/splash.json', JSON.stringify(splashList));
  // Mots-clés de recherche : fichier commun du portfolio + ceux saisis dans
  // l'admin pour chaque pièce (champ « Mots-clés de recherche »).
  const mergedKeywords = JSON.parse(keywords);
  // Aucun mot-clé (ni clé) pour une pièce masquée ou absente du catalogue : la recherche ne doit pas la révéler.
  const hiddenSlugs = new Set(catalog.products.filter((p) => p.hidden).map((p) => p.permalink));
  for (const k of Object.keys(mergedKeywords)) if (hiddenSlugs.has(k) || k.charAt(0) === '_') delete mergedKeywords[k];
  for (const p of catalog.products) {
    const extra = (p.search_keywords || []).map((k) => String(k).trim()).filter(Boolean);
    if (extra.length) mergedKeywords[p.permalink] = [...new Set([...(mergedKeywords[p.permalink] || []), ...extra])];
  }
  write('assets/vg/search-keywords.json', JSON.stringify(mergedKeywords, null, 1));
  fs.copyFileSync(rel(ROOT, 'assets', 'vg-shop-cart.js'), rel(OUT_DIR, 'assets', 'vg-shop-cart.js'));
  fs.copyFileSync(rel(ROOT, 'assets', 'vg-shipping-view.js'), rel(OUT_DIR, 'assets', 'vg-shipping-view.js'));
  fs.copyFileSync(rel(ROOT, 'assets', 'vg-shipping-picker.js'), rel(OUT_DIR, 'assets', 'vg-shipping-picker.js'));
  fs.copyFileSync(rel(ROOT, 'assets', 'vg-theme.js'), rel(OUT_DIR, 'assets', 'vg-theme.js'));
  for (const f of ['vg-invoice.js', 'vg-traffic.js', 'vg-lang.js', 'vg-demande.js', 'vg-mesures.js', 'vg-ma-demande.js']) { if (fs.existsSync(rel(ROOT, 'assets', f))) fs.copyFileSync(rel(ROOT, 'assets', f), rel(OUT_DIR, 'assets', f)); }
  if (fs.existsSync(rel(ROOT, 'assets', 'mesures'))) { fs.mkdirSync(rel(OUT_DIR, 'assets', 'mesures'), { recursive: true }); for (const f of fs.readdirSync(rel(ROOT, 'assets', 'mesures'))) fs.copyFileSync(rel(ROOT, 'assets', 'mesures', f), rel(OUT_DIR, 'assets', 'mesures', f)); } // silhouettes du guide de mesure
  fs.cpSync(rel(ROOT, 'assets', 'vendor'), rel(OUT_DIR, 'assets', 'vendor'), { recursive: true });
  fs.cpSync(rel(ROOT, 'assets', 'fonts'), rel(OUT_DIR, 'assets', 'fonts'), { recursive: true });
  // Photos des cartes du parcours « Proposer un projet » (WebP 400 / 800 px, tirées de la boutique et du portfolio).
  if (fs.existsSync(rel(ROOT, 'assets', 'demande'))) fs.cpSync(rel(ROOT, 'assets', 'demande'), rel(OUT_DIR, 'assets', 'demande'), { recursive: true });
  const productImagesSrc = rel(ROOT, 'assets', 'products');
  if (fs.existsSync(productImagesSrc)) fs.cpSync(productImagesSrc, rel(OUT_DIR, 'assets', 'products'), { recursive: true });
  // Product photo widths (generator/resize-images.js), used by `constrain`.
  const sizedSrc = rel(ROOT, 'assets', 'products-sized');
  if (fs.existsSync(sizedSrc)) fs.cpSync(sizedSrc, rel(OUT_DIR, 'assets', 'products-sized'), { recursive: true });
  const themeSizedSrc = rel(ROOT, 'assets', 'theme-sized');
  if (fs.existsSync(themeSizedSrc)) fs.cpSync(themeSizedSrc, rel(OUT_DIR, 'assets', 'theme-sized'), { recursive: true });
  fs.cpSync(rel(ROOT, 'assets', 'theme'), rel(OUT_DIR, 'assets', 'theme'), { recursive: true });
  const ogSrc = rel(ROOT, 'assets', 'products-og');
  if (fs.existsSync(ogSrc)) fs.cpSync(ogSrc, rel(OUT_DIR, 'assets', 'products-og'), { recursive: true });
  if (LOCAL_MEDIA) fs.cpSync(rel(ROOT, 'assets', 'media'), rel(OUT_DIR, 'assets', 'media'), { recursive: true });
  // Boutique pas encore publique : aucun moteur de recherche ne doit garder une page (en plus du noindex et de robots.txt).
  fs.writeFileSync(rel(OUT_DIR, '_headers'), fs.readFileSync(rel(ROOT, 'generator', '_headers'), 'utf8') + (SHOP_SETTINGS.public ? '' : '\n/*\n  X-Robots-Tag: noindex, nofollow\n'));
  // Anciennes adresses BigCartel : /product/<ancien nom> -> /product/<permalink> (301). Les 27 adresses de l'ancienne
  // boutique existent à l'identique ; on ajoute les variantes que l'ancien site acceptait ou que d'anciens liens
  // (Instagram, mails) peuvent contenir : nom de la pièce, sans accents, tirets/underscores échangés.
  // Toute autre adresse /product/... inconnue est renvoyée vers /products par functions/product/[[path]].js.
  if (BASE_PATH === '') {
    const strip = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
    const slug = (s) => strip(s).toLowerCase().replace(/[^a-z0-9_]+/g, '-').replace(/^-+|-+$/g, '');
    const real = new Set(catalog.products.map((p) => p.permalink));
    const seen = new Set();
    const lines = [];
    for (const p of catalog.products) {
      const names = [p.permalink, p.name, p.name_en].filter(Boolean);
      const forms = new Set();
      for (const n of names) {
        const a = slug(n);
        forms.add(a); forms.add(a.replace(/_/g, '-')); forms.add(a.replace(/-/g, '_'));
      }
      if (p.hidden && !p.scheduled) continue; // pas de fiche : rien vers quoi rediriger
      for (const f of forms) {
        if (!f || real.has(f) || seen.has(f)) continue;
        seen.add(f);
        lines.push(`/product/${f} /product/${encodeURI(p.permalink)}/ 301`, `/product/${f}/ /product/${encodeURI(p.permalink)}/ 301`);
      }
    }
    fs.writeFileSync(rel(OUT_DIR, '_redirects'), '# Généré par generator/build.js : anciennes adresses BigCartel.\n' + lines.join('\n') + '\n');
  }
  // /favicon.ico a la racine du site (certains navigateurs le demandent d'office).
  fs.copyFileSync(rel(ROOT, 'assets', 'theme', 'favicon.ico'), rel(OUT_DIR, 'favicon.ico'));
  // Manifest du site (icones 192/512 + maskable) : lie depuis FAVICON_LINKS.
  fs.writeFileSync(rel(OUT_DIR, 'site.webmanifest'), JSON.stringify({
    name: 'vgthmind', short_name: 'vgthmind', start_url: `${BASE_PATH}/`, scope: `${BASE_PATH}/`, display: 'browser',
    background_color: '#0b0b0b', theme_color: '#0b0b0b',
    icons: [
      { src: `${BASE_PATH}/assets/theme/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${BASE_PATH}/assets/theme/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${BASE_PATH}/assets/theme/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2) + '\n');
  // robots.txt: the prototype's "Disallow: /" until launch; then only the
  // admin is blocked, plus the sitemap. (Only effective once the shop is at
  // the root of its own domain - under /shop/, the noindex tag does the job.)
  write('robots.txt', SHOP_SETTINGS.public
    ? `User-agent: *\nDisallow: ${BASE_PATH}/admin/\nSitemap: ${SHOP_SETTINGS.site_url}/sitemap.xml\n`
    : read(rel(ROOT, 'robots.txt')));
  // Admin (Sveltia CMS) : servi tel quel sous /shop/admin/ (page + config +
  // pages maison), jamais passé par le préfixe /shop (Sveltia lit
  // config.yml à côté de la page).
  fs.cpSync(rel(ROOT, 'admin'), rel(OUT_DIR, 'admin'), { recursive: true });
  {
    // Adresse du site (réglage central) dans le script de connexion : page de connexion après « Se déconnecter », et renvoi
    // vers le bon site si l'admin est ouvert depuis une autre adresse (ancien aperçu, favori…).
    const authPath = rel(OUT_DIR, 'admin', 'vg-admin-auth.js');
    fs.writeFileSync(authPath, fs.readFileSync(authPath, 'utf8').split('__VG_SITE_URL__').join(SHOP_SETTINGS.site_url.replace(/\/$/, '')));
  }
  // Adresse du site pour le Worker (/site-config.json) et pour le lien « voir le site » de Sveltia.
  write('site-config.json', JSON.stringify({ site_url: SHOP_SETTINGS.site_url.replace(/\/$/, '') }) + '\n');
  {
    const cfgPath = rel(OUT_DIR, 'admin', 'config.yml');
    const su = SHOP_SETTINGS.site_url.replace(/\/$/, '');
    fs.writeFileSync(cfgPath, fs.readFileSync(cfgPath, 'utf8').replace(/^(site_url|display_url):.*\r?\n/gm, '').replace(/\s*$/, '\n') + `site_url: ${su}\ndisplay_url: ${su}\n`);
  }
  // Catégories pour l'assistant « nouvelle pièce » (le dépôt devient privé : plus de lecture directe sur GitHub).
  fs.copyFileSync(rel(DATA_DIR, 'categories.json'), rel(OUT_DIR, 'admin', 'categories.json'));

  // sitemap.xml - inert for now (robots.txt still has "Disallow: /" until
  // this is the official shop, see robots.txt), ready for launch day: a
  // crawler that ignores robots.txt entirely still gets correct, absolute
  // URLs rather than nothing.
  const SITE_ORIGIN = new URL(SHOP_SETTINGS.site_url).origin;
  // Catalogue date, not today's: an unchanged shop rebuilds identically.
  const today = String(catalog.fetched_at || new Date().toISOString()).slice(0, 10);
  const urls = [
    `${BASE_PATH}/`, `${BASE_PATH}/products`,
    ...catalog.categories.map((c) => `${BASE_PATH}/category/${c.permalink}`),
    ...catalog.products.filter((p) => !p.hidden).map((p) => `${BASE_PATH}${p.url}`),
    ...CUSTOM_PAGES.map((cp) => `${BASE_PATH}${cp.url}`),
    ...LEGAL_PAGES.map((lp) => `${BASE_PATH}${lp.url}`),
  ];
  const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) => `  <url><loc>${SITE_ORIGIN}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')
    + '\n</urlset>\n';
  write('sitemap.xml', sitemap);

  // products.xml : flux produits (RSS 2.0 + espace « g: » de Google Merchant Center, lu aussi par le catalogue Meta
  // Instagram/Facebook), pour remplacer le /products.xml de l'ancienne boutique. Statique : la disponibilité vient du
  // catalogue publié (le stock en direct est dans le Worker) ; une pièce « bientôt disponible » est marquée indisponible.
  const xe = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const feedItems = catalog.products.filter((p) => !p.hidden).map((p) => {
    const desc = String(p.description || '').split(/\r?\n\s*\r?\n/)[0].replace(/\s+/g, ' ').trim() || p.name;
    const og = SITE_ORIGIN + BASE_PATH + '/assets/products-og/' + encodeURIComponent(p.permalink) + '.jpg';
    return '    <item>\n'
      + `      <g:id>${xe(p.permalink)}</g:id>\n      <title>${xe(p.name)}</title>\n      <description>${xe(desc)}</description>\n`
      + `      <link>${xe(SITE_ORIGIN + BASE_PATH + p.url)}</link>\n      <g:image_link>${xe(og)}</g:image_link>\n`
      + `      <g:availability>${p.status === 'coming-soon' ? 'out of stock' : 'in stock'}</g:availability>\n`
      + `      <g:price>${Number(p.price).toFixed(2)} EUR</g:price>\n      <g:condition>new</g:condition>\n      <g:brand>vgthmind</g:brand>\n      <g:identifier_exists>no</g:identifier_exists>\n`
      + '    </item>';
  });
  write('products.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n'
    + `    <title>vgthmind</title>\n    <link>${xe(SITE_ORIGIN + BASE_PATH + '/')}</link>\n    <description>vgthmind</description>\n`
    + feedItems.join('\n') + '\n  </channel>\n</rss>\n');

  // GitHub Pages: serve files and folders starting with "_" too, no Jekyll.
  write('.nojekyll', '');

  console.log(`Built ${catalog.products.length} products, ${catalog.categories.length} categories, ${CUSTOM_PAGES.length} pages into ${OUT_DIR}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
