// Gabarits des emails de commande (client FR/EN, « expediee », vendeur).
// Fonctions pures, sans dependance : utilisees par le worker et l'apercu local.
// Style : celui de l'admin/du site (fond creme, encre noire, titres en
// capitales espacees, boutons « pilule »), police systeme (les polices web ne
// passent pas dans Gmail/Apple Mail), boutons en HTML et non en image.

export const INSTAGRAM_URL = 'https://instagram.com/vgthmind';
export const CONTACT_EMAIL = 'contact@vgthmind.org';
export const REPLY_TO = CONTACT_EMAIL;
export const TRACKING_URL = 'https://www.laposte.fr/outils/suivre-vos-envois?code=';

export type MailItem = {
  name: string;
  size?: string; // ex. "M"
  qty: number;
  amount: string; // total de la ligne (prix x quantite), deja formate
  unit?: string; // prix unitaire formate, seulement si quantite > 1
  image?: string; // URL publique absolue
};

export type OrderData = {
  ref: string;
  requestId?: string; // pièce sur demande : numéro de la demande (D-XXXXXX), affiché avec la référence de commande
  name: string;
  nameIncomplete?: boolean; // alerte vendeur : le nom de livraison ne tient qu'en un mot
  email: string;
  phone?: string;
  country: string; // code ISO a 2 lettres (ex. FR, CA)
  lang?: 'fr' | 'en'; // langue choisie sur le site au paiement ; absente (anciennes commandes) = selon le pays
  address: string[]; // lignes d'adresse, sans HTML
  items: MailItem[];
  shipping: string;
  discount?: string; // remise (code promo), deja formatee, vide si aucune
  total: string;
  test: boolean;
  stripeUrl: string;
  cgvUrl: string;
  orderUrl: string; // page « Suivre ma commande » (/suivi, numero prerempli)
};

export function esc(t: any) {
  return String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// Nom du pays en toutes lettres (« France », « Canada ») dans la langue voulue.
export function countryName(code: string, lang: string): string {
  const c = String(code || '').toUpperCase();
  if (!c) return '';
  try { return new Intl.DisplayNames([lang], { type: 'region' }).of(c) || c; } catch (e) { return c; }
}
// Pays francophones (France, DROM-COM, Monaco, Belgique, Luxembourg, Suisse) : e-mails en francais.
// Le Canada reste en anglais (Quebec / reste du pays non distinguables par pays).
const FR_COUNTRIES = ['FR', 'MC', 'BE', 'LU', 'CH', 'GP', 'MQ', 'GF', 'RE', 'YT', 'PM', 'BL', 'MF', 'NC', 'PF', 'WF'];
export const langFor = (country: string) => (FR_COUNTRIES.includes(String(country).toUpperCase()) ? 'fr' : 'en');

const T = {
  fr: {
    subject: (ref: string) => `Merci, ta commande vgthmind est confirmée (réf. ${ref})`,
    shippedSubject: (ref: string) => `Ta commande vgthmind est partie (réf. ${ref})`,
    hi: (n: string) => (n ? `Salut ${n},` : 'Salut,'),
    thanks: "Merci pour ta commande ! 🖤 Elle est bien reçue et je m'en occupe avec soin.",
    bye: 'À très vite,',
    shippedLead: 'Bonne nouvelle : ta commande est partie.',
    deliveredSubject: (ref: string) => `Ta commande vgthmind est livrée (réf. ${ref})`,
    deliveredLead: 'Ton colis vient d’être livré. J’espère que ta pièce te plaît ! Si quelque chose ne va pas, écris-moi en répondant à ce mail.',
    tracking: 'Numéro de suivi',
    order: 'Ta commande',
    size: 'Taille',
    qty: 'Qté',
    each: "l'unité",
    shipping: 'Livraison',
    discount: 'Remise',
    total: 'Total',
    shipTo: 'Livraison à',
    next: 'La suite',
    nextText: "Je prépare ta commande et je l'envoie. Je t'écris dès qu'elle part.",
    duties: '',
    help: 'Un souci, une question ? Réponds simplement à ce mail.',
    view: 'Voir ma commande',
    ref: 'Commande', request: 'Demande',
    withdrawal: "Les pièces de la boutique, y compris customisées, bénéficient du droit de rétractation de 14 jours. Les créations sur-mesure ou sur demande personnalisée (commande passée par message) ne sont ni reprises ni échangées, sauf défaut de fabrication (art. L221-28 3° du Code de la consommation). TVA non applicable, art. 293 B du CGI.",
    cgv: 'Conditions générales de vente',
    thanksEnd: 'Merci pour ton soutien,',
  },
  en: {
    subject: (ref: string) => `Thank you, your vgthmind order is confirmed (ref. ${ref})`,
    shippedSubject: (ref: string) => `Your vgthmind order has shipped (ref. ${ref})`,
    hi: (n: string) => (n ? `Hi ${n},` : 'Hi,'),
    thanks: "Thank you for your order! 🖤 It's been received and I'll take good care of it.",
    bye: 'See you soon,',
    shippedLead: 'Good news: your order has shipped.',
    deliveredSubject: (ref: string) => `Your vgthmind order has been delivered (ref. ${ref})`,
    deliveredLead: 'Your parcel has just been delivered. I hope you love your piece! If anything is wrong, just reply to this email.',
    tracking: 'Tracking number',
    order: 'Your order',
    size: 'Size',
    qty: 'Qty',
    each: 'each',
    shipping: 'Shipping',
    discount: 'Discount',
    total: 'Total',
    shipTo: 'Shipping to',
    next: 'What happens next',
    nextText: "I'm getting your order ready. I'll email you as soon as it ships.",
    duties: "Orders outside the EU: import duties, taxes and local fees, if any, are paid by you and aren't included in the price or shipping.",
    help: 'Questions? Just reply to this email.',
    view: 'View my order',
    ref: 'Order', request: 'Request',
    withdrawal: 'Pieces from the shop, including customised ones, have a 14-day right of withdrawal. Creations made to measure or to personal request (orders placed by message) are neither taken back nor exchanged, except in case of a manufacturing defect (art. L221-28 3° of the French Consumer Code). VAT not applicable, art. 293 B of the French Tax Code.',
    cgv: 'Terms of sale',
    thanksEnd: 'Thank you for your support,',
  },
};

export const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
export const INK = '#171717';
export const MUTED = '#6b6860';
export const LINE = '#e2ded3';
export const BG = '#f4f2ec';

export const para = (s: string, extra = '') => `<p style="margin:0 0 14px;font:15px/1.55 ${FONT};color:${INK};${extra}">${s}</p>`;
export const heading = (s: string) => `<p style="margin:28px 0 10px;font:bold 12px ${FONT};letter-spacing:2px;text-transform:uppercase;color:${MUTED}">${esc(s)}</p>`;
export const link = (href: string, s: string) => `<a href="${esc(href)}" style="color:${INK};text-decoration:underline">${s}</a>`;
export const button = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 4px"><tr><td style="border-radius:999px;background:${INK}">`
  + `<a href="${esc(href)}" style="display:inline-block;padding:13px 26px;border-radius:999px;background:${INK};color:#ffffff;font:bold 14px ${FONT};text-decoration:none">${esc(label)}</a></td></tr></table>`;

export function shell(lang: string, title: string, inner: string) {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)}</title></head>`
    + `<body style="margin:0;padding:0;background:${BG}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG}"><tr><td align="center" style="padding:20px 12px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border:1px solid ${LINE}">`
    + `<tr><td style="background:${INK};padding:18px 24px;font:bold 18px ${FONT};letter-spacing:4px;color:#ffffff">VGTHMIND</td></tr>`
    + `<tr><td style="padding:26px 24px 28px">${inner}</td></tr></table></td></tr></table></body></html>`;
}

// Lignes d'articles : miniature de taille fixe + nom, taille, quantite, prix.
function itemRows(items: MailItem[], t: (typeof T)['fr']) {
  return items.map((i) => {
    const meta = [i.size ? `${t.size} ${esc(i.size)}` : '', `${t.qty} ${esc(i.qty)}${i.unit ? ` (${esc(i.unit)} ${t.each})` : ''}`].filter(Boolean).join(' · ');
    const img = i.image
      ? `<table role="presentation" width="72" height="76" cellpadding="0" cellspacing="0" style="width:72px;height:76px;background:${BG}"><tr><td align="center" valign="middle" width="72" height="76" style="width:72px;height:76px;line-height:0;font-size:0"><img src="${esc(i.image)}" alt="${esc(i.name)}" style="display:inline-block;max-width:72px;max-height:76px;width:auto;height:auto;border:0"></td></tr></table>`
      : `<div style="width:72px;height:76px;background:${BG}"></div>`;
    return `<tr><td width="72" valign="top" style="padding:10px 14px 10px 0;border-bottom:1px solid ${LINE}">${img}</td>`
      + `<td valign="top" style="padding:10px 0;border-bottom:1px solid ${LINE};font:15px/1.4 ${FONT};color:${INK}"><b>${esc(i.name)}</b><br><span style="color:${MUTED};font-size:13px">${meta}</span></td>`
      + `<td valign="top" align="right" style="padding:10px 0 10px 10px;border-bottom:1px solid ${LINE};font:15px ${FONT};color:${INK};white-space:nowrap">${esc(i.amount)}</td></tr>`;
  }).join('');
}

function itemsTable(o: OrderData, t: (typeof T)['fr'], withTotals: boolean) {
  const totals = withTotals
    ? (o.discount ? `<tr><td colspan="2" style="padding:10px 0 0;font:14px ${FONT};color:${MUTED}">${t.discount}</td><td align="right" style="padding:10px 0 0;font:14px ${FONT};color:${MUTED};white-space:nowrap">- ${esc(o.discount)}</td></tr>` : '')
      + `<tr><td colspan="2" style="padding:10px 0 4px;font:14px ${FONT};color:${MUTED}">${t.shipping}</td><td align="right" style="padding:10px 0 4px;font:14px ${FONT};color:${MUTED};white-space:nowrap">${esc(o.shipping)}</td></tr>`
      + `<tr><td colspan="2" style="padding:4px 0;font:bold 16px ${FONT};color:${INK}">${t.total}</td><td align="right" style="padding:4px 0;font:bold 16px ${FONT};color:${INK};white-space:nowrap">${esc(o.total)}</td></tr>`
    : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${itemRows(o.items, t)}${totals}</table>`;
}

const itemLines = (o: OrderData, t: (typeof T)['fr']) =>
  o.items.map((i) => `- ${i.name}${i.size ? ` (${t.size} ${i.size})` : ''} · ${t.qty} ${i.qty}${i.unit ? ` (${i.unit} ${t.each})` : ''} · ${i.amount}`);

function signature(t: (typeof T)['fr']) {
  return para('vgthmind', 'margin:22px 0 4px;font-weight:bold')
    + para(`${link(INSTAGRAM_URL, 'instagram.com/vgthmind')} · ${link('mailto:' + CONTACT_EMAIL, CONTACT_EMAIL)}`);
}

function legalFooter(o: OrderData, t: (typeof T)['fr']) {
  return `<p style="margin:24px 0 0;padding-top:14px;border-top:1px solid ${LINE};font:12px/1.5 ${FONT};color:#777">${esc(t.withdrawal)} ${link(o.cgvUrl, esc(t.cgv))}</p>`;
}

export function customerEmail(o: OrderData) {
  const l = o.lang || langFor(o.country);
  const t = T[l];
  const first = (o.name || '').trim().split(/\s+/)[0] || '';
  const subject = t.subject(o.ref);
  const html = shell(l, subject,
    para(esc(t.hi(first))) + para(t.thanks)
    + `<p style="margin:0 0 4px;font:13px ${FONT};color:${MUTED}">${t.ref} ${esc(o.ref)}${o.requestId ? ` — ${t.request} ${esc(o.requestId)}` : ''}</p>`
    + heading(t.order) + itemsTable(o, t, true)
    + heading(t.shipTo) + para(o.address.map(esc).join('<br>'))
    + heading(t.next) + para(esc(t.nextText)) + (t.duties ? para(esc(t.duties), `color:${MUTED}`) : '')
    + button(o.orderUrl, t.view)
    + para(esc(t.help), 'margin-top:16px')
    + para(esc(t.bye), 'margin:22px 0 0') + signature(t).replace('margin:22px 0 4px', 'margin:0 0 4px') + legalFooter(o, t));
  const text = [
    t.hi(first), '', t.thanks, '', `${t.ref} ${o.ref}${o.requestId ? ` — ${t.request} ${o.requestId}` : ''}`, '',
    t.order.toUpperCase(), ...itemLines(o, t),
    ...(o.discount ? [`${t.discount} : - ${o.discount}`] : []), `${t.shipping} : ${o.shipping}`, `${t.total} : ${o.total}`, '',
    t.shipTo.toUpperCase(), ...o.address, '',
    t.next.toUpperCase(), t.nextText, ...(t.duties ? [t.duties] : []), '',
    `${t.view} : ${o.orderUrl}`, '', t.help, '',
    t.bye, 'vgthmind', `Instagram : ${INSTAGRAM_URL}`, CONTACT_EMAIL, '',
    `${t.withdrawal} ${t.cgv} : ${o.cgvUrl}`,
  ].join('\n');
  return { subject, html, text };
}

// Mail « expediee » : numero de suivi + « Voir ma commande » (/suivi), sans nom de transporteur ni lien vers lui.
export function shippedEmail(o: OrderData, tracking: string) {
  const l = o.lang || langFor(o.country);
  const t = T[l];
  const first = (o.name || '').trim().split(/\s+/)[0] || '';
  const subject = t.shippedSubject(o.ref);
  const html = shell(l, subject,
    para(esc(t.hi(first))) + para(t.shippedLead)
    + (tracking ? para(`${t.tracking} : <b>${esc(tracking)}</b>`) : '')
    + `<p style="margin:18px 0 4px;font:13px ${FONT};color:${MUTED}">${t.ref} ${esc(o.ref)}${o.requestId ? ` — ${t.request} ${esc(o.requestId)}` : ''}</p>`
    + heading(t.order) + itemsTable(o, t, false)
    + heading(t.shipTo) + para(o.address.map(esc).join('<br>'))
    + button(o.orderUrl, t.view)
    + para(esc(t.help), 'margin-top:8px')
    + para(esc(t.thanksEnd), 'margin:18px 0 0')
    + signature(t));
  const text = [
    t.hi(first), '', t.shippedLead,
    ...(tracking ? ['', `${t.tracking} : ${tracking}`] : []), '',
    `${t.ref} ${o.ref}${o.requestId ? ` — ${t.request} ${o.requestId}` : ''}`, ...itemLines(o, t), '',
    t.shipTo.toUpperCase(), ...o.address, '',
    `${t.view} : ${o.orderUrl}`, '', t.help, '', t.thanksEnd, 'vgthmind', `Instagram : ${INSTAGRAM_URL}`, CONTACT_EMAIL,
  ].join('\n');
  return { subject, html, text };
}

// Mail court « livrée » (envoyé une fois, quand La Poste annonce la livraison).
export function deliveredEmail(o: OrderData) {
  const l = o.lang || langFor(o.country);
  const t = T[l];
  const first = (o.name || '').trim().split(/\s+/)[0] || '';
  const subject = t.deliveredSubject(o.ref);
  const html = shell(l, subject,
    para(esc(t.hi(first))) + para(esc(t.deliveredLead))
    + `<p style="margin:18px 0 4px;font:13px ${FONT};color:${MUTED}">${t.ref} ${esc(o.ref)}</p>`
    + para(esc(t.thanksEnd), 'margin:18px 0 0')
    + signature(t));
  const text = [t.hi(first), '', t.deliveredLead, '', `${t.ref} ${o.ref}`, '', t.thanksEnd, 'vgthmind', `Instagram : ${INSTAGRAM_URL}`, CONTACT_EMAIL].join('\n');
  return { subject, html, text };
}

// Alerte vendeur : colis en difficulté (retour, adresse incorrecte, colis bloqué).
export function parcelProblemEmail(ref: string, name: string, tracking: string, label: string, events: { date: string; label: string }[]) {
  const subject = `Colis en difficulté : ${ref}`;
  const lines = events.slice(0, 6).map((e) => `${String(e.date).slice(0, 10)} : ${e.label}`);
  const html = shell('fr', subject,
    `<p style="margin:0 0 6px;font:bold 12px ${FONT};letter-spacing:2px;text-transform:uppercase;color:#b3261e">Colis en difficulté</p>`
    + para(`<b>${esc(label)}</b>`)
    + para(`Commande ${esc(ref)} · ${esc(name)}<br>Numéro de suivi : <b>${esc(tracking)}</b>`)
    + (lines.length ? para(lines.map(esc).join('<br>')) : '')
    + button(TRACKING_URL + encodeURIComponent(tracking), 'Voir le suivi La Poste'));
  const text = [subject, '', label, `Commande ${ref} — ${name}`, `Suivi : ${tracking}`, '', ...lines, '', TRACKING_URL + tracking].join('\n');
  return { subject, html, text };
}

// Nom de livraison à un seul mot (ou vide) : il manque le prénom ou le nom pour l'envoi.
export const isNameIncomplete = (name: string) => String(name || '').trim().split(/\s+/).filter(Boolean).length < 2;
const NAME_WARNING = '⚠ Nom incomplet : demander nom et prénom au client avant l\'envoi';

export function sellerEmail(o: OrderData) {
  const t = T.fr;
  const pays = countryName(o.country, 'fr');
  const subject = `${o.test ? '[TEST] ' : ''}Nouvelle commande ${o.total} — ${pays} (réf. ${o.ref})`;
  const row = (k: string, v: string) => `<tr><td valign="top" style="padding:6px 14px 6px 0;font:14px/1.45 ${FONT};color:${MUTED};white-space:nowrap">${k}</td><td valign="top" style="padding:6px 0;font:15px/1.45 ${FONT};color:${INK}">${v}</td></tr>`;
  const html = shell('fr', subject,
    `<p style="margin:0 0 6px;font:bold 12px ${FONT};letter-spacing:2px;text-transform:uppercase;color:${MUTED}">Nouvelle commande payée${o.test ? ' · mode TEST' : ''}</p>`
    + `<p style="margin:0 0 6px;font:bold 22px ${FONT};color:${INK}">${esc(o.total)}</p>`
    + `<p style="margin:0 0 4px;font:13px ${FONT};color:${MUTED}">Réf. ${esc(o.ref)}</p>`
    + (o.nameIncomplete ? `<p style="margin:10px 0 0;padding:8px 12px;background:#fdecea;border-left:4px solid #b3261e;font:bold 14px ${FONT};color:#b3261e">${esc(NAME_WARNING)}</p>` : '')
    + heading('Articles') + itemsTable(o, t, true)
    + heading('Client et livraison')
    + `<table role="presentation" cellpadding="0" cellspacing="0">`
    + row('Client', `${esc(o.name)}<br>${link('mailto:' + o.email, esc(o.email))}${o.phone ? '<br>' + esc(o.phone) : ''}`)
    + row('Livrer à', o.address.map(esc).join('<br>'))
    + row('Pays', esc(pays))
    + row('Frais de port', esc(o.shipping))
    + row('Langue du mail client', (o.lang || langFor(o.country)).toUpperCase())
    + `</table><div style="margin-top:20px">${button(o.stripeUrl, 'Ouvrir la commande dans Stripe')}</div>`);
  const text = [
    `Nouvelle commande payée${o.test ? ' (mode TEST)' : ''} - ${o.total} - réf. ${o.ref}`, '',
    ...(o.nameIncomplete ? [NAME_WARNING, ''] : []),
    'Articles :', ...itemLines(o, t),
    ...(o.discount ? [`Remise : - ${o.discount}`] : []), `Frais de port : ${o.shipping}`, `Total : ${o.total}`, '',
    `Client : ${o.name} / ${o.email}${o.phone ? ' / ' + o.phone : ''}`,
    'Livrer à :', ...o.address.map((x) => '  ' + x), `Pays : ${pays}`, '',
    `Stripe : ${o.stripeUrl}`,
  ].join('\n');
  return { subject, html, text };
}
