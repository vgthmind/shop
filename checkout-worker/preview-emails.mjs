// Apercu local des emails + de la page commandes de l'admin :
//   node --experimental-strip-types checkout-worker/preview-emails.mjs
// Ecrit apercu-emails/*.html (aucun envoi, aucune cle). Ouvrir index.html.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { customerEmail, sellerEmail, shippedEmail } from './emails.ts';

const img = (n) => `../docs/assets/products/${n}`; // en vrai : URL publique absolue
const items = [
  { name: 'CH_0002', size: 'M', qty: 1, amount: '84,00 EUR', image: img('ch_0002/0.png') },
  { name: 'CD_VGTAPE', size: '', qty: 2, amount: '30,00 EUR', image: img('cd-vgtape/0.png') },
];
const base = {
  ref: 'A1B2C3D4', name: 'Camille Martin', email: 'camille@example.com', phone: '+33 6 00 00 00 00',
  items, shipping: '9,90 EUR', total: '123,90 EUR', test: true,
  stripeUrl: 'https://dashboard.stripe.com/test/payments/pi_EXEMPLE',
  cgvUrl: 'https://vgthmind.org/infos-conditions-generales',
  orderUrl: 'https://vgthmind.org/merci/?session_id=cs_test_EXEMPLE',
};
const fr = { ...base, country: 'FR', address: ['Camille Martin', '12 rue des Lilas', '66000 Perpignan', 'FR'] };
const ca = { ...base, name: 'Alex Tremblay', country: 'CA', address: ['Alex Tremblay', '45 Rue Saint-Denis', 'Montréal QC H2X 1K4', 'CA'] };
const TRK = '6A12345678901';

const out = 'apercu-emails';
mkdirSync(out, { recursive: true });
const files = [
  ['client-fr', 'Client — confirmation FR', customerEmail(fr)],
  ['client-en', 'Client — confirmation EN (Canada)', customerEmail(ca)],
  ['expediee-fr', 'Client — « expédiée » FR', shippedEmail(fr, TRK)],
  ['expediee-en', 'Client — « expédiée » EN', shippedEmail(ca, TRK)],
  ['vendeur', 'Vendeur (pour toi)', sellerEmail(fr)],
];
for (const [f, , m] of files) {
  writeFileSync(`${out}/${f}.html`, m.html);
  writeFileSync(`${out}/${f}.txt`, `Objet : ${m.subject}\n\n${m.text}\n`);
}

// Page commandes de l'admin : la vraie page, avec de fausses donnees.
const orders = [
  { id: 'cs_test_1', created: 1791000000, livemode: false, total: 123.9, shipping: 9.9, discount: 0, email: fr.email, phone: fr.phone, name: fr.name,
    address: { line1: '12 rue des Lilas', postal_code: '66000', city: 'Perpignan', country: 'FR' },
    items: items.map((i) => ({ ...i, amount: parseFloat(i.amount) })), shipped: null },
  { id: 'cs_test_2', created: 1790900000, livemode: false, total: 93.9, shipping: 9.9, discount: 0, email: ca.email, name: ca.name,
    address: { line1: '45 Rue Saint-Denis', postal_code: 'H2X 1K4', city: 'Montréal', state: 'QC', country: 'CA' },
    items: [{ ...items[0], amount: 84 }], shipped: { at: 1791050000, tracking: TRK, notified: 1791050100 } },
];
const stub = `<script>window.vgAdminToken=function(){return 'x'};window.vgAdminLogout=function(){};window.vgAdminApi=function(){return Promise.resolve({orders:${JSON.stringify(orders)}})};</script>`;
const admin = readFileSync('admin/commandes.html', 'utf8')
  .replace('<script src="vg-admin-auth.js"></script>', stub)
  .replace('<head>', '<head><base href="../admin/">')
  .replace(/src="\.\.\/docs/g, 'src="../docs');
// les images de l'apercu pointent vers docs/ (chemin relatif au dossier apercu-emails)
writeFileSync(`${out}/admin-commandes.html`, admin.replace('<base href="../admin/">', ''));

const cell = ([f, title, m]) => `<div><h2>${title}</h2><p class="s">Objet : ${m.subject.replace(/</g, '&lt;')}</p><iframe src="${f}.html" width="390" height="900"></iframe><p><a href="${f}.txt">version texte de secours</a></p></div>`;
writeFileSync(`${out}/index.html`, `<!doctype html><meta charset="utf-8"><title>Aperçu emails</title><style>body{font:14px sans-serif;background:#ddd;margin:20px}.g{display:flex;gap:24px;flex-wrap:wrap}iframe{background:#fff;border:1px solid #999}h2{margin:0 0 4px;font-size:16px}.s{margin:0 0 8px;color:#444;max-width:390px}</style><h1>Aperçu des emails (largeur téléphone)</h1><div class="g">${files.map(cell).join('')}</div><h1>Admin — page Commandes</h1><iframe src="admin-commandes.html" width="900" height="900"></iframe>`);
console.log('OK -> ' + out + '/index.html');
