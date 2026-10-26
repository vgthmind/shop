// Mails de « Pièce sur demande » (client FR/EN + alerte pour vgthmind). Même mise en page que les mails de commande.
import { esc, para, heading, button, link, shell, CONTACT_EMAIL, INSTAGRAM_URL, MUTED, LINE, FONT, INK, countryName } from './emails';
import { answerLines, TYPE_LABELS, STATUS_LABELS } from './requests-core';

export interface ReqMailCtx { pageUrl: string; adminUrl: string; cgvUrl: string; photoUrls?: string[]; test?: boolean }
type Mail = { subject: string; html: string; text: string };

const eur = (n: number, lang: string) => (Math.round(n * 100) / 100).toFixed(2).replace('.', lang === 'fr' ? ',' : '.') + ' €';
const T = {
  fr: {
    hi: (n: string) => (n ? `Salut ${n},` : 'Salut,'), bye: 'À très vite,', help: 'Une question ? Réponds simplement à ce mail.',
    view: 'Voir ma demande', yourReq: 'Ta demande', ref: 'Demande',
    received: (id: string) => `Ta demande vgthmind est bien reçue (${id})`,
    receivedLead: 'Merci ! Ta demande est bien reçue. Je la lis avec attention et je reviens vers toi en général sous 2 à 5 jours ouvrés, avec des questions ou un devis.',
    receivedPaid: 'Si on part ensemble : je t’envoie un devis (prix total et délai). Un acompte lance la fabrication, tu valides la pièce sur photos, puis tu payes le solde avant l’envoi.',
    receivedManual: 'Pour une production visuelle ou une collab, je te réponds directement par mail (devis, caution, contrat selon le projet).',
    quote: (id: string, no?: string) => `Ton devis vgthmind${no ? ' ' + no : ''} (${id})`,
    quoteLead: 'Voici le devis pour ta pièce :', quoteLeadOpt: 'Voici le devis pour ton projet :', valid: (d: string) => `Devis valable jusqu’au ${d}.`, pdf: 'Le devis est joint à ce mail en PDF.',
    depositOpt: (p: number) => `Acompte facultatif (${p} %)`, seeQuote: 'Voir le devis et l’accepter',
    quoteNoteOpt: 'L’acompte est facultatif ; versé, il n’est pas remboursable une fois le travail commencé, sauf si vgthmind refuse ou abandonne la commande.',
    accepted: (id: string) => `Devis accepté, merci ! (${id})`, acceptedLead: 'Merci, ton devis est bien accepté. Je lance le projet et je reviens vers toi pour la suite (caution, calendrier, détails).', total: 'Prix total', deposit: (p: number) => `Acompte (${p} %) à payer maintenant`, balance: 'Solde à payer après validation sur photos',
    delay: 'Délai de fabrication', shipping: 'Le port est ajouté au solde, selon ton pays.', payDeposit: 'Voir le devis et payer l’acompte',
    quoteNote: 'L’acompte rend la commande ferme et lance la fabrication. Pièce personnalisée : pas de droit de rétractation (article L221-28 3° du Code de la consommation).',
    quoteRemind: (id: string, no?: string) => `Rappel : ton devis vgthmind${no ? ' ' + no : ''} t’attend (${id})`, quoteRemindLead: 'Petit rappel : ton devis est toujours là. Tu peux le relire et payer l’acompte quand tu veux, ou me répondre si tu as des questions.',
    depositPaid: (id: string) => `Acompte reçu, la fabrication commence (${id})`,
    depositPaidLead: (a: string, d: string) => `Merci, ton acompte de ${a} est bien reçu : ta commande est ferme et je commence ta pièce. Délai prévu : ${d}. Je t’envoie des photos dès qu’elle est finie pour que tu la valides.`,
    invoice: 'Ta facture d’acompte est disponible sur la page de ta demande.',
    balanceReq: (id: string) => `Ta pièce est prête : il ne reste que le solde (${id})`,
    balanceReqLead: 'Ta pièce est finie ! Il ne reste plus que le solde à régler pour que je puisse l’envoyer.', payBalance: 'Régler le solde',
    validation: (id: string) => `Ta pièce est prête : valide-la sur photos (${id})`,
    validationLead: 'Ta pièce est finie ! Regarde les photos ci-dessous.', validate: 'Je valide et je paie le solde', retouch: 'Je demande une retouche',
    validationNote: (n: number, days: number) => `${n > 0 ? `${n} retouche${n > 1 ? 's' : ''} incluse${n > 1 ? 's' : ''} : explique ce que tu veux changer depuis la page de ta demande.` : 'Retouche supplémentaire : sur devis.'} Sans validation ni paiement du solde ${days} jours après ce mail (relance comprise), l’acompte reste acquis (voir les CGV).`,
    valRemind: (id: string) => `Rappel : ta pièce attend ta validation (${id})`, valRemindLead: 'Petit rappel : ta pièce est prête et attend ta validation (ou ta demande de retouche) et le paiement du solde avant l’envoi.',
    cgv: 'Conditions générales de vente',
  },
  en: {
    hi: (n: string) => (n ? `Hi ${n},` : 'Hi,'), bye: 'See you soon,', help: 'Questions? Just reply to this email.',
    view: 'View my request', yourReq: 'Your request', ref: 'Request',
    received: (id: string) => `Your vgthmind request is received (${id})`,
    receivedLead: 'Thank you! Your request is received. I’ll read it carefully and get back to you, usually within 2 to 5 working days, with questions or a quote.',
    receivedPaid: 'If we go ahead: I send you a quote (total price and lead time). A deposit starts the work, you approve the piece from photos, then you pay the balance before shipping.',
    receivedManual: 'For a visual production or a collab, I’ll reply to you directly by email (quote, deposit cheque, contract depending on the project).',
    quote: (id: string, no?: string) => `Your vgthmind quote${no ? ' ' + no : ''} (${id})`,
    quoteLead: 'Here is the quote for your piece:', quoteLeadOpt: 'Here is the quote for your project:', valid: (d: string) => `Quote valid until ${d}.`, pdf: 'The quote is attached to this email as a PDF.',
    depositOpt: (p: number) => `Optional deposit (${p}%)`, seeQuote: 'View the quote and accept it',
    quoteNoteOpt: 'The deposit is optional; once paid, it is non-refundable once work has started, unless vgthmind declines or abandons the order.',
    accepted: (id: string) => `Quote accepted, thank you! (${id})`, acceptedLead: 'Thank you, your quote is accepted. I’m starting the project and will get back to you for the next steps (deposit cheque, schedule, details).', total: 'Total price', deposit: (p: number) => `Deposit (${p}%) to pay now`, balance: 'Balance, paid after you approve the photos',
    delay: 'Making time', shipping: 'Shipping is added to the balance, depending on your country.', payDeposit: 'View the quote and pay the deposit',
    quoteNote: 'The deposit makes the order firm and starts the work. Personalised piece: no right of withdrawal (article L221-28 3° of the French Consumer Code).',
    quoteRemind: (id: string, no?: string) => `Reminder: your vgthmind quote${no ? ' ' + no : ''} is waiting (${id})`, quoteRemindLead: 'A quick reminder: your quote is still there. You can read it again and pay the deposit whenever you like, or reply with any questions.',
    depositPaid: (id: string) => `Deposit received, work begins (${id})`,
    depositPaidLead: (a: string, d: string) => `Thank you, your deposit of ${a} is received: your order is firm and I’m starting your piece. Expected time: ${d}. I’ll send you photos as soon as it’s finished so you can approve it.`,
    invoice: 'Your deposit invoice is available on your request page.',
    balanceReq: (id: string) => `Your piece is ready: only the balance is left (${id})`,
    balanceReqLead: 'Your piece is finished! Only the balance is left to pay so that I can ship it.', payBalance: 'Pay the balance',
    validation: (id: string) => `Your piece is ready: approve it from photos (${id})`,
    validationLead: 'Your piece is finished! Have a look at the photos below.', validate: 'I approve and pay the balance', retouch: 'I’d like a change',
    validationNote: (n: number, days: number) => `${n > 0 ? `${n} change${n > 1 ? 's' : ''} included: explain what you’d like changed from your request page.` : 'Extra changes: on quote.'} If you neither approve nor pay the balance ${days} days after this email (reminder included), the deposit is kept (see the terms of sale).`,
    valRemind: (id: string) => `Reminder: your piece is waiting for your approval (${id})`, valRemindLead: 'A quick reminder: your piece is ready and waiting for your approval (or change request) and the balance payment before shipping.',
    cgv: 'Terms of sale',
  },
};
const tr = (lang: string) => (lang === 'fr' ? T.fr : T.en);

function sign(lang: string) {
  const t = tr(lang);
  return para(esc(t.help), `margin-top:22px;color:${MUTED};font-size:14px`) + para(esc(t.bye), 'margin:18px 0 4px')
    + para('vgthmind', 'margin:0 0 4px;font-weight:bold') + para(`${link(INSTAGRAM_URL, 'instagram.com/vgthmind')} · ${link('mailto:' + CONTACT_EMAIL, CONTACT_EMAIL)}`);
}
function answersTable(rec: any, lang: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">`
    + answerLines(rec, lang).map(([k, v]) => `<tr><td valign="top" style="padding:7px 12px 7px 0;border-bottom:1px solid ${LINE};font:13px ${FONT};color:${MUTED};width:38%">${esc(k)}</td><td style="padding:7px 0;border-bottom:1px solid ${LINE};font:14px/1.45 ${FONT};color:${INK};white-space:pre-wrap">${esc(v)}</td></tr>`).join('')
    + `</table>`;
}
const answersText = (rec: any, lang: string) => answerLines(rec, lang).map(([k, v]) => `${k} : ${v}`).join('\n');
function amountsTable(rows: [string, string, boolean?][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">`
    + rows.map(([k, v, b]) => `<tr><td style="padding:7px 0;border-bottom:1px solid ${LINE};font:${b ? 'bold 16px' : '14px'} ${FONT};color:${INK}">${esc(k)}</td><td align="right" style="padding:7px 0;border-bottom:1px solid ${LINE};font:${b ? 'bold 16px' : '14px'} ${FONT};color:${INK};white-space:nowrap">${esc(v)}</td></tr>`).join('')
    + `</table>`;
}
const footer = (lang: string, c: ReqMailCtx) => `<p style="margin:24px 0 0;padding-top:14px;border-top:1px solid ${LINE};font:12px/1.5 ${FONT};color:#777">${link(c.cgvUrl, esc(tr(lang).cgv))}</p>`;
const testTag = (c: ReqMailCtx) => (c.test ? '[TEST] ' : '');

export function receivedEmail(rec: any, c: ReqMailCtx): Mail {
  const t = tr(rec.lang), paid = rec.type === 'custom' || rec.type === 'surmesure';
  const inner = para(esc(t.hi(rec.client.name))) + para(esc(t.receivedLead)) + para(esc(paid ? t.receivedPaid : t.receivedManual))
    + heading(`${t.yourReq} · ${rec.id}`) + answersTable(rec, rec.lang) + `<div style="height:18px"></div>` + button(c.pageUrl, t.view) + sign(rec.lang);
  const text = `${t.hi(rec.client.name)}\n\n${t.receivedLead}\n${paid ? t.receivedPaid : t.receivedManual}\n\n${t.ref} ${rec.id}\n${answersText(rec, rec.lang)}\n\n${t.view} : ${c.pageUrl}\n\n${t.help}\nvgthmind`;
  return { subject: testTag(c) + t.received(rec.id), html: shell(rec.lang, t.received(rec.id), inner), text };
}

export function newRequestAlert(rec: any, c: ReqMailCtx): Mail {
  const files = rec.files.length ? `${rec.files.length} fichier(s) joint(s) : ${rec.files.map((f: any) => f.name).join(', ')}` : 'Aucun fichier joint.';
  const who = `${rec.client.name} <${rec.client.email}> · ${countryName(rec.client.country, 'fr')} · langue ${rec.lang.toUpperCase()}`;
  const inner = para(`<b>Nouvelle demande ${esc(rec.id)}</b> : ${esc(TYPE_LABELS[rec.type] || rec.type)}`) + para(esc(who))
    + answersTable(rec, 'fr') + para(esc(files), `margin-top:14px;color:${MUTED};font-size:13px`) + para(rec.photosConsent ? 'Accord photos (site + réseaux) : oui' : 'Accord photos : non', `color:${MUTED};font-size:13px`)
    + button(c.adminUrl, 'Ouvrir dans l’admin');
  const text = `Nouvelle demande ${rec.id} : ${TYPE_LABELS[rec.type]}\n${who}\n\n${answersText(rec, 'fr')}\n\n${files}\nAccord photos : ${rec.photosConsent ? 'oui' : 'non'}\n\nAdmin : ${c.adminUrl}`;
  return { subject: `${testTag(c)}[vgthmind] Nouvelle demande ${rec.id} · ${TYPE_LABELS[rec.type]}`, html: shell('fr', 'Nouvelle demande', inner), text };
}

const quoteRef = (q: any) => `${q.number || ''}${q.version > 1 ? ' v' + q.version : ''}`.trim();
const dayFmt = (ms: number, lang: string) => new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ms));
function quoteBlock(rec: any) {
  const t: any = tr(rec.lang), q = rec.quote, l = rec.lang;
  const rows: [string, string, boolean?][] = [[t.total, eur(q.total, l), true]];
  if (q.deposit > 0) rows.push([q.optionalDeposit ? t.depositOpt(q.depositPct) : t.deposit(q.depositPct), eur(q.deposit, l)]);
  if (q.deposit > 0 && !q.optionalDeposit) rows.push([t.balance, eur(q.total - q.deposit, l)]);
  rows.push([t.delay, q.delay]);
  return amountsTable(rows);
}
export function quoteEmail(rec: any, c: ReqMailCtx, reminder = false): Mail {
  const t: any = tr(rec.lang), q = rec.quote, opt = !!q.optionalDeposit, no = quoteRef(q);
  const subject = reminder ? t.quoteRemind(rec.id, no) : t.quote(rec.id, no);
  const note = opt ? (q.deposit > 0 ? t.quoteNoteOpt : '') : t.quoteNote;
  const valid = q.validUntil ? t.valid(dayFmt(q.validUntil, rec.lang)) : '';
  const inner = para(esc(t.hi(rec.client.name))) + para(esc(reminder ? t.quoteRemindLead : opt ? t.quoteLeadOpt : t.quoteLead))
    + heading(`${q.title || rec.id}${no ? ' · ' + no : ''}`) + quoteBlock(rec) + (q.message && !reminder ? para(esc(q.message).replace(/\n/g, '<br>'), 'margin-top:16px') : '')
    + (opt ? '' : para(esc(t.shipping), `color:${MUTED};font-size:13px;margin-top:12px`)) + (valid ? para(esc(valid), `color:${MUTED};font-size:13px;margin-top:10px`) : '') + button(c.pageUrl, opt ? t.seeQuote : t.payDeposit)
    + (note ? para(esc(note), `color:${MUTED};font-size:13px;margin-top:14px`) : '') + para(esc(t.pdf), `color:${MUTED};font-size:13px`) + sign(rec.lang) + footer(rec.lang, c);
  const lines = [
    t.hi(rec.client.name), '', reminder ? t.quoteRemindLead : opt ? t.quoteLeadOpt : t.quoteLead,
    `${q.title}${no ? ' · ' + no : ''}`, `${t.total} : ${eur(q.total, rec.lang)}`,
    ...(q.deposit > 0 ? [`${opt ? t.depositOpt(q.depositPct) : t.deposit(q.depositPct)} : ${eur(q.deposit, rec.lang)}`] : []),
    ...(q.deposit > 0 && !opt ? [`${t.balance} : ${eur(q.total - q.deposit, rec.lang)}`] : []),
    `${t.delay} : ${q.delay}`,
    ...(q.message && !reminder ? ['', q.message] : []),
    ...(opt ? [] : ['', t.shipping]), ...(valid ? ['', valid] : []),
    '', `${opt ? t.seeQuote : t.payDeposit} : ${c.pageUrl}`, '', ...(note ? [note, ''] : []), t.pdf, '', 'vgthmind',
  ];
  const text = lines.join('\n');
  return { subject: testTag(c) + subject, html: shell(rec.lang, subject, inner), text };
}

export function depositPaidEmail(rec: any, c: ReqMailCtx): Mail {
  const t = tr(rec.lang), lead = t.depositPaidLead(eur(rec.deposit.amount, rec.lang), rec.quote.delay);
  const inner = para(esc(t.hi(rec.client.name))) + para(esc(lead)) + para(esc(t.invoice), `color:${MUTED};font-size:14px`) + button(c.pageUrl, t.view) + sign(rec.lang) + footer(rec.lang, c);
  return { subject: testTag(c) + t.depositPaid(rec.id), html: shell(rec.lang, t.depositPaid(rec.id), inner), text: `${t.hi(rec.client.name)}\n\n${lead}\n${t.invoice}\n${c.pageUrl}\n\nvgthmind` };
}

export function validationEmail(rec: any, c: ReqMailCtx, s: { retouchesLeft: number; forfeitDays: number }, reminder = false): Mail {
  const t = tr(rec.lang), subject = reminder ? t.valRemind(rec.id) : t.validation(rec.id);
  const photos = (c.photoUrls || []).slice(0, 8).map((u) => `<p style="margin:0 0 10px"><img src="${esc(u)}" alt="" width="532" style="display:block;width:100%;max-width:532px;height:auto;border:0;background:#f4f2ec"></p>`).join('');
  const balance = eur(rec.quote.total - rec.quote.deposit, rec.lang);
  const inner = para(esc(t.hi(rec.client.name))) + para(esc(reminder ? t.valRemindLead : t.validationLead)) + photos
    + amountsTable([[t.balance, balance, true]]) + para(esc(t.shipping), `color:${MUTED};font-size:13px;margin-top:10px`)
    + button(c.pageUrl + '#valider', t.validate) + `<div style="height:8px"></div>` + para(link(c.pageUrl + '#retouche', esc(t.retouch)))
    + para(esc(t.validationNote(s.retouchesLeft, s.forfeitDays)), `color:${MUTED};font-size:13px;margin-top:14px`) + sign(rec.lang) + footer(rec.lang, c);
  const text = `${t.hi(rec.client.name)}\n\n${reminder ? t.valRemindLead : t.validationLead}\n${(c.photoUrls || []).join('\n')}\n\n${t.balance} : ${balance}\n${t.shipping}\n\n${t.validate} : ${c.pageUrl}#valider\n${t.retouch} : ${c.pageUrl}#retouche\n\n${t.validationNote(s.retouchesLeft, s.forfeitDays)}\n\nvgthmind`;
  return { subject: testTag(c) + subject, html: shell(rec.lang, subject, inner), text };
}

// Solde demandé sans photos (vgthmind s'est arrangé avec le client hors du site) : pas de validation, juste le lien de paiement.
export function balanceRequestEmail(rec: any, c: ReqMailCtx): Mail {
  const t: any = tr(rec.lang), subject = t.balanceReq(rec.id), balance = eur(rec.quote.total - rec.quote.deposit, rec.lang);
  const inner = para(esc(t.hi(rec.client.name))) + para(esc(t.balanceReqLead)) + amountsTable([[t.balance, balance, true]]) + para(esc(t.shipping), `color:${MUTED};font-size:13px;margin-top:10px`)
    + button(c.pageUrl, t.payBalance) + sign(rec.lang) + footer(rec.lang, c);
  const text = `${t.hi(rec.client.name)}

${t.balanceReqLead}

${t.balance} : ${balance}
${t.shipping}

${t.payBalance} : ${c.pageUrl}

vgthmind`;
  return { subject: testTag(c) + subject, html: shell(rec.lang, subject, inner), text };
}

// Réponse écrite à la main depuis l'admin (location, collab, questions…).
export function replyEmail(rec: any, c: ReqMailCtx, subject: string, message: string): Mail {
  const t = tr(rec.lang);
  const inner = para(esc(message).replace(/\n/g, '<br>')) + `<div style="height:8px"></div>` + para(link(c.pageUrl, esc(`${t.view} (${rec.id})`)), 'font-size:14px') + sign(rec.lang);
  return { subject: testTag(c) + subject, html: shell(rec.lang, subject, inner), text: `${message}\n\n${t.view} : ${c.pageUrl}\n\nvgthmind\n${CONTACT_EMAIL}` };
}

// Location / collab : le client a accepté le devis.
export function quoteAcceptedEmail(rec: any, c: ReqMailCtx): Mail {
  const t: any = tr(rec.lang), no = quoteRef(rec.quote);
  const subject = t.accepted(rec.id);
  const inner = para(esc(t.hi(rec.client.name))) + para(esc(t.acceptedLead)) + heading(`${rec.quote.title || rec.id}${no ? ' · ' + no : ''}`) + quoteBlock(rec) + button(c.pageUrl, t.view) + sign(rec.lang) + footer(rec.lang, c);
  return { subject: testTag(c) + subject, html: shell(rec.lang, subject, inner), text: [t.hi(rec.client.name), '', t.acceptedLead, '', `${t.view} : ${c.pageUrl}`, '', 'vgthmind'].join('\n') };
}

export { STATUS_LABELS };
