// Devis en PDF, fabriqué sans bibliothèque (Helvetica standard du PDF, encodage WinAnsi) : le même fichier est joint au mail
// du devis et téléchargeable depuis la page du client et l'admin. Aucune donnée n'est gardée : il est recalculé à chaque demande.
import { SELLER, VAT_MENTION } from './invoice';

// Largeurs Helvetica (millièmes d'em) pour les caractères 32 à 126.
const W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const WIN: Record<string, number> = { '€': 0x80, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '–': 0x96, '—': 0x97, '…': 0x85, '•': 0x95, ' ': 0x20, ' ': 0xa0 };
function code(ch: string): number {
  if (WIN[ch] !== undefined) return WIN[ch];
  const c = ch.charCodeAt(0);
  return c < 256 ? c : 0x3f;
}
function width(text: string, size: number, bold: boolean): number {
  let w = 0;
  for (const ch of text) { const c = code(ch); w += c >= 32 && c <= 126 ? W[c - 32] : 556; }
  return (w * size * (bold ? 1.06 : 1)) / 1000;
}
const hexStr = (text: string) => '<' + [...text].map((ch) => code(ch).toString(16).padStart(2, '0')).join('') + '>';

export interface QuotePdfInput {
  lang: 'fr' | 'en';
  number: string; version: number;
  issuedAt: number; validUntil: number;
  seller: { address: string };
  client: { name: string; email: string; country: string };
  requestId: string;
  title: string;
  lines: { label: string; qty: number; unit: number; amount: number }[];
  total: number; deposit: number; depositPct: number; optionalDeposit: boolean;
  delay: string; message: string;
  acceptedAt?: number;
  pageUrl: string;
  test?: boolean;
}

const T = {
  fr: {
    quote: 'DEVIS', date: 'Date', valid: 'Valable jusqu’au', client: 'Client', request: 'Demande', desc: 'Désignation', qty: 'Qté', unit: 'Prix unit.', amount: 'Montant',
    total: 'Total', deposit: (p: number) => `Acompte (${p} %)`, depositOpt: (p: number) => `Acompte facultatif (${p} %)`, balance: 'Solde à régler après validation de la pièce (+ port)', balanceOpt: 'Reste à régler',
    delay: 'Délai', note: 'Remarques', cond: 'Conditions',
    c1: 'Devis valable jusqu’à la date indiquée ci-dessus. Toute modification donne lieu à une nouvelle version du devis.',
    c2: 'L’acompte (et non des arrhes, art. L214-1 du Code de la consommation) rend la commande ferme. Il n’est pas remboursable une fois la fabrication commencée, sauf si vgthmind refuse ou abandonne la commande.',
    c2o: 'L’acompte, facultatif, n’est pas remboursable une fois le travail commencé, sauf si vgthmind refuse ou abandonne la commande.',
    c3: 'Pièce personnalisée, réalisée selon la demande du client : pas de droit de rétractation (art. L221-28 3° du Code de la consommation). Le solde est réglé après validation de la pièce sur photos, avant l’envoi ; le port est ajouté selon le pays de livraison.',
    c4: 'Conditions générales de vente : voir le site vgthmind (page « Infos / Conditions générales »). Acceptation du devis en ligne, depuis la page de la demande.',
    accept: 'Pour accepter', acceptBody: 'Ouvre le lien ci-dessous, relis le devis, coche « j’accepte le devis et les conditions générales de vente »' ,
    accepted: (d: string) => `Accepté en ligne le ${d}`, test: 'DEVIS DE TEST', version: 'version',
  },
  en: {
    quote: 'QUOTE', date: 'Date', valid: 'Valid until', client: 'Customer', request: 'Request', desc: 'Description', qty: 'Qty', unit: 'Unit price', amount: 'Amount',
    total: 'Total', deposit: (p: number) => `Deposit (${p}%)`, depositOpt: (p: number) => `Optional deposit (${p}%)`, balance: 'Balance, due after you approve the piece (+ shipping)', balanceOpt: 'Remaining balance',
    delay: 'Lead time', note: 'Notes', cond: 'Terms',
    c1: 'This quote is valid until the date above. Any change creates a new version of the quote.',
    c2: 'The deposit ("acompte", not "arrhes", art. L214-1 of the French Consumer Code) makes the order firm. It is non-refundable once production has started, unless vgthmind declines or abandons the order.',
    c2o: 'The deposit is optional; once paid, it is non-refundable once work has started, unless vgthmind declines or abandons the order.',
    c3: 'Personalised piece made to the customer’s request: no right of withdrawal (art. L221-28 3° of the French Consumer Code). The balance is paid after you approve the piece from photos, before shipping; shipping is added according to the delivery country.',
    c4: 'Terms of sale: see the vgthmind website (“Info / Terms of sale” page). The quote is accepted online, from the request page.',
    accept: 'To accept', acceptBody: 'Open the link below, read the quote again and tick “I accept the quote and the terms of sale”',
    accepted: (d: string) => `Accepted online on ${d}`, test: 'TEST QUOTE', version: 'version',
  },
};

const eur = (n: number, lang: string) => (Math.round(n * 100) / 100).toFixed(2).replace('.', lang === 'fr' ? ',' : '.') + ' €';
const day = (ms: number, lang: string) => new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { timeZone: 'Europe/Paris', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(ms));

function wrap(text: string, size: number, max: number, bold = false): string[] {
  const out: string[] = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? line + ' ' + word : word;
      if (width(test, size, bold) <= max || !line) line = test;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

export function quotePdf(q: QuotePdfInput): Uint8Array {
  const t = T[q.lang];
  const pages: string[] = [];
  let ops: string[] = [];
  let y = 800;
  const M = 50, R = 545, H = 842;
  const text = (s: string, x: number, yy: number, size = 10, bold = false, gray = 0) => { ops.push(`${gray} g BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(1)} ${yy.toFixed(1)} Td ${hexStr(s)} Tj ET`); };
  const right = (s: string, x: number, yy: number, size = 10, bold = false) => text(s, x - width(s, size, bold), yy, size, bold);
  const rule = (yy: number, gray = 0.8) => { ops.push(`${gray} G 0.6 w ${M} ${yy} m ${R} ${yy} l S`); };
  const newPage = () => { pages.push(ops.join('\n')); ops = []; y = 800; };
  const need = (h: number) => { if (y - h < 60) newPage(); };
  const para = (s: string, size = 9, bold = false, gray = 0.25, gap = 12) => { if (!s) return; for (const l of wrap(s, size, R - M, bold)) { need(gap); text(l, M, y, size, bold, gray); y -= gap; } };

  // En-tête : vgthmind (pas de nom ni prénom), adresse, SIRET, mention TVA.
  text('vgthmind', M, y, 22, true);
  const sellerLines = [q.seller.address, SELLER.city, `SIRET ${SELLER.siret}`, SELLER.email].filter(Boolean);
  let sy = y - 16; for (const l of sellerLines) { text(l, M, sy, 9, false, 0.3); sy -= 11; }
  const ref = `${q.number}${q.version > 1 ? ' v' + q.version : ''}`;
  right(t.quote, R, y, 22, true);
  right(ref, R, y - 18, 11, true);
  right(`${t.date} : ${day(q.issuedAt, q.lang)}`, R, y - 32, 9);
  right(`${t.valid} ${day(q.validUntil, q.lang)}`, R, y - 44, 9);
  if (q.test) right(t.test, R, y - 58, 9, true);
  y = Math.min(sy, y - 64) - 14; rule(y); y -= 20;

  // Client
  text(t.client.toUpperCase(), M, y, 8, true, 0.45); y -= 13;
  text(q.client.name, M, y, 11, true); y -= 13;
  text(q.client.email, M, y, 9, false, 0.3); y -= 11;
  text(`${t.request} ${q.requestId} · ${q.title}`, M, y, 9, false, 0.3); y -= 24;

  // Tableau
  const cQ = 380, cU = 455, cA = R;
  text(t.desc.toUpperCase(), M, y, 8, true, 0.45); right(t.qty.toUpperCase(), cQ, y, 8, true); right(t.unit.toUpperCase(), cU, y, 8, true); right(t.amount.toUpperCase(), cA, y, 8, true);
  y -= 6; rule(y, 0.3); y -= 14;
  for (const l of q.lines) {
    const lab = wrap(l.label, 10, cQ - M - 50);
    need(lab.length * 13 + 8);
    lab.forEach((s, i) => { text(s, M, y - i * 13, 10); });
    right(String(l.qty), cQ, y, 10); right(eur(l.unit, q.lang), cU, y, 10); right(eur(l.amount, q.lang), cA, y, 10);
    y -= lab.length * 13 + 4; rule(y + 3, 0.9); y -= 8;
  }
  need(90); y -= 4;
  const row = (label: string, value: string, bold = false, size = 10) => { text(label, 330, y, size, bold); right(value, cA, y, size, bold); y -= 15; };
  row(t.total, eur(q.total, q.lang), true, 12);
  if (q.deposit > 0) {
    row(q.optionalDeposit ? t.depositOpt(q.depositPct) : t.deposit(q.depositPct), eur(q.deposit, q.lang));
    wrap(q.optionalDeposit ? t.balanceOpt : t.balance, 8, 170).forEach((l, i) => { text(l, 330, y, 8, false, 0.4); if (i === 0) right(eur(q.total - q.deposit, q.lang), cA, y, 10); y -= 11; });
    y -= 3;
  }
  text(VAT_MENTION, 330, y, 8, true, 0.3); y -= 22;

  need(40);
  text(t.delay.toUpperCase(), M, y, 8, true, 0.45); y -= 13; para(q.delay, 10, false, 0, 13); y -= 8;
  if (q.message) { need(40); text(t.note.toUpperCase(), M, y, 8, true, 0.45); y -= 13; para(q.message, 10, false, 0, 13); y -= 8; }

  need(120);
  text(t.cond.toUpperCase(), M, y, 8, true, 0.45); y -= 13;
  para(t.c1); y -= 2; para(q.deposit > 0 ? (q.optionalDeposit ? t.c2o : t.c2) : ''); y -= 2;
  if (!q.optionalDeposit) { para(t.c3); y -= 2; }
  para(t.c4); y -= 10;

  need(60);
  if (q.acceptedAt) { text(t.accepted(day(q.acceptedAt, q.lang)), M, y, 10, true, 0.1); y -= 14; }
  else { text(t.accept.toUpperCase(), M, y, 8, true, 0.45); y -= 13; para(`${t.acceptBody} : ${q.pageUrl}`, 9, false, 0.25); }

  pages.push(ops.join('\n'));

  // Assemblage du fichier PDF.
  const objs: string[] = [];
  const n = pages.length;
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${pages.map((_p, i) => `${5 + i * 2} 0 R`).join(' ')}] /Count ${n} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((content, i) => {
    objs[5 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`;
    objs[6 + i * 2] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) { offsets[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + offsets.slice(1).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info << /Title ${hexStr(`${t.quote} ${ref}`)} /Producer (vgthmind) >> >>\nstartxref\n${xref}\n%%EOF\n`;
  // Le contenu est en ASCII pur (chaînes hexadécimales) : un octet par caractère.
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
