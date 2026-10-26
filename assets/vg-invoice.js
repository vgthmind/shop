/* Facture imprimable / « Enregistrer en PDF » : prend l'objet `invoice` renvoyé par le Worker
   (POST /invoice pour le client, GET /admin/invoice pour l'admin) et ouvre une page prête à imprimer.
   Aucune donnée n'est gardée dans le navigateur. */
(function (root) {
  'use strict';
  var T = {
    fr: { title: 'Facture', no: 'N°', date: 'Date', seller: 'Émetteur', customer: 'Client', desc: 'Désignation', qty: 'Qté', unit: 'Prix unitaire', amount: 'Montant',
      shipping: 'Livraison', discount: 'Remise', total: 'Total payé', paid: 'Réglée par carte bancaire (Stripe).', siret: 'SIRET', order: 'Commande', size: 'Taille',
      credit: 'Avoir', creditOf: 'Avoir relatif à la facture N°', creditTotal: 'Total remboursé', creditMention: "Remboursé sur le moyen de paiement d'origine.",
      test: 'FACTURE DE TEST : aucune valeur', print: 'Imprimer / Enregistrer en PDF', share: 'Partager / Enregistrer le PDF', locale: 'fr-FR' },
    en: { title: 'Invoice', no: 'No.', date: 'Date', seller: 'Seller', customer: 'Customer', desc: 'Description', qty: 'Qty', unit: 'Unit price', amount: 'Amount',
      shipping: 'Shipping', discount: 'Discount', total: 'Total paid', paid: 'Paid by card (Stripe).', siret: 'SIRET', order: 'Order', size: 'Size',
      credit: 'Credit note', creditOf: 'Credit note for invoice No.', creditTotal: 'Total refunded', creditMention: 'Refunded to the original payment method.',
      test: 'TEST INVOICE: no value', print: 'Print / Save as PDF', share: 'Share / Save PDF', locale: 'en-GB' }
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // mode « credit » : l'avoir (inv.credit) d'une commande remboursée, montants en négatif.
  function creditView(inv, lang) {
    var c = inv.credit, copy = JSON.parse(JSON.stringify(inv)), L = T[lang] || T.fr;
    copy.number = c.number; copy.date = c.at; copy.title = 'Avoir'; copy.titleEn = 'Credit note'; copy.deductions = null; copy.discount = 0;
    if (c.full) { copy.lines = inv.lines.map(function (l) { return { name: l.name, size: l.size, qty: l.qty, unit: -l.unit, amount: -l.amount }; }); copy.shipping = -inv.shipping; copy.discount = inv.discount ? -inv.discount : 0; }
    else { copy.lines = [{ name: 'Remboursement partiel / Partial refund', qty: 1, unit: -c.amount, amount: -c.amount }]; copy.shipping = 0; }
    copy.total = -c.amount;
    copy.notes = [L.creditOf + ' ' + c.original + '.'];
    copy.paid = L.creditMention;
    copy.totalLabel = L.creditTotal;
    return copy;
  }

  // Nonce du script de la page (admin : CSP sans unsafe-inline) : la fenêtre ouverte hérite de la même CSP, son script d'impression doit le porter.
  function pageNonce() {
    try { var s = root.document && root.document.querySelector('script[nonce]'); return s ? (s.nonce || s.getAttribute('nonce') || '') : ''; } catch (e) { return ''; }
  }

  function html(inv, lang, mode) {
    if (mode === 'credit' && inv.credit) inv = creditView(inv, lang);
    var t = T[lang] || T.fr;
    var title = (lang === 'en' ? inv.titleEn : inv.title) || t.title; // « Facture d'acompte » pour une pièce sur demande
    var money = function (n) { return new Intl.NumberFormat(t.locale, { style: 'currency', currency: inv.currency || 'EUR' }).format(n || 0); };
    var date = new Date(inv.date * 1000).toLocaleDateString(t.locale, { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
    var rows = inv.lines.map(function (l) {
      return '<tr><td>' + esc(l.name) + (l.size ? '<br><small>' + t.size + ' ' + esc(l.size) + '</small>' : '') + '</td><td class="n">' + esc(l.qty) + '</td><td class="n">' + money(l.unit) + '</td><td class="n">' + money(l.amount) + '</td></tr>';
    }).join('');
    return '<!doctype html><html lang="' + (lang === 'en' ? 'en' : 'fr') + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">'
      + '<title>' + esc(title) + ' ' + esc(inv.number) + '</title><style>'
      + 'body{font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#171717;max-width:760px;margin:24px auto;padding:0 16px}'
      + 'h1{font-size:26px;margin:0 0 4px;letter-spacing:.04em;text-transform:uppercase}.top{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;border-bottom:2px solid #171717;padding-bottom:12px}'
      + '.parties{display:flex;gap:24px;flex-wrap:wrap;margin:18px 0}.parties div{flex:1 1 240px}.lbl{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b6860}'
      + 'table{width:100%;border-collapse:collapse;margin:12px 0}th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b6860;text-align:left;border-bottom:1px solid #171717;padding:6px 4px}'
      + 'td{padding:8px 4px;border-bottom:1px solid #ddd;vertical-align:top}.n{text-align:right;white-space:nowrap}small{color:#6b6860}'
      + '.tot td{border:0;padding:3px 4px}.grand td{font-weight:700;font-size:16px;border-top:2px solid #171717;padding-top:8px}.mention{margin-top:18px;font-size:12px;color:#444}'
      + '.test{background:#fde8e8;color:#a23b2a;border:1px solid #a23b2a;padding:6px 10px;margin:10px 0;font-weight:700;text-align:center}'
      + 'button{margin:0 8px 16px 0;padding:10px 16px;border-radius:999px;border:1px solid #171717;background:#171717;color:#fff;font:inherit;cursor:pointer}'
      + '.tot td.n:nth-child(2){white-space:normal;word-break:break-word}.tot td:first-child{padding:0}@media(max-width:560px){.tot td:first-child{display:none}body{margin:16px auto}}'
      + '@media print{button{display:none}body{margin:0}}</style></head><body>'
      + '<button id="vg-print" type="button">' + t.print + '</button><button id="vg-share" type="button">' + t.share + '</button>'
      + (inv.test ? '<div class="test">' + t.test + '</div>' : '')
      + '<div class="top"><div><h1>' + esc(title) + '</h1><div>' + t.no + ' ' + esc(inv.number) + '<br>' + t.date + ' : ' + esc(date) + '<br>' + t.order + ' ' + esc(inv.ref) + '</div></div>'
      + '<div style="text-align:right"><strong>' + esc(inv.seller.name) + '</strong><br>' + esc(inv.seller.line2) + '<br>' + t.siret + ' ' + esc(inv.seller.siret) + '<br>' + esc(inv.seller.email) + '</div></div>'
      + '<div class="parties"><div><div class="lbl">' + t.customer + '</div><strong>' + esc(inv.customer.name) + '</strong><br>' + inv.customer.address.map(esc).join('<br>') + (inv.customer.country ? '<br>' + esc(inv.customer.country) : '') + '<br>' + esc(inv.customer.email) + '</div></div>'
      + '<table><thead><tr><th>' + t.desc + '</th><th class="n">' + t.qty + '</th><th class="n">' + t.unit + '</th><th class="n">' + t.amount + '</th></tr></thead><tbody>' + rows + '</tbody></table>'
      + '<table class="tot"><tr><td></td><td class="n">' + t.shipping + '</td><td class="n" style="width:120px">' + money(inv.shipping) + '</td></tr>'
      + (inv.deductions || []).map(function (d) { return '<tr><td></td><td class="n">' + esc(d.label) + '</td><td class="n">−' + money(d.amount) + '</td></tr>'; }).join('')
      + (inv.discount ?'<tr><td></td><td class="n">' + t.discount + '</td><td class="n">−' + money(inv.discount) + '</td></tr>' : '')
      + '<tr class="grand"><td></td><td class="n">' + (inv.totalLabel || t.total) + '</td><td class="n">' + money(inv.total) + '</td></tr></table>'
      + '<p class="mention">' + (inv.notes || []).map(function (n) { return esc(n) + '<br>'; }).join('') + esc(inv.vat) + '<br>' + (inv.paid || t.paid) + '</p>'
      + '</body></html>';
  }

  // ---- PDF maison (Helvetica, A4) : pour « Partager / Enregistrer le PDF » (la feuille de partage iPhone), sans bibliothèque ni script externe ----
  var HW = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  var CP = { 8364: 128, 8217: 146, 8216: 145, 8220: 147, 8221: 148, 8211: 150, 8212: 151, 8230: 133, 8226: 149, 8722: 45, 160: 32, 8239: 32, 8201: 32, 8202: 32 };
  function pdfStr(s) { // texte → chaîne d'octets cp1252, échappée pour un littéral PDF
    var o = '';
    String(s == null ? '' : s).split('').forEach(function (ch) {
      var c = ch.charCodeAt(0), b = CP[c] != null ? CP[c] : (c < 256 ? c : 63);
      if (b < 32) b = 32;
      o += (b === 40 || b === 41 || b === 92) ? '\\' + String.fromCharCode(b) : String.fromCharCode(b);
    });
    return o;
  }
  function textW(s, size, bold) {
    var w = 0, base = String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (var i = 0; i < base.length; i++) { var c = base.charCodeAt(i); w += c >= 32 && c <= 126 ? HW[c - 32] : (c === 8217 ? 222 : (c === 8212 ? 1000 : 556)); }
    return w * size / 1000 * (bold ? 1.06 : 1);
  }
  function wrapText(s, width, size, bold) {
    var out = [];
    String(s == null ? '' : s).split('\n').forEach(function (par) {
      var line = '';
      par.split(' ').forEach(function (word) {
        var tryLine = line ? line + ' ' + word : word;
        if (line && textW(tryLine, size, bold) > width) { out.push(line); line = word; } else line = tryLine;
      });
      out.push(line);
    });
    return out;
  }
  // Petit moteur de mise en page : curseur vertical, retour à la ligne, saut de page.
  function Doc() { this.pages = []; this.y = 0; this.W = 595; this.H = 842; this.M = 42; this.add(); }
  Doc.prototype.add = function () { this.cur = []; this.pages.push(this.cur); this.y = this.H - this.M; };
  Doc.prototype.need = function (h) { if (this.y - h < this.M) this.add(); };
  // al : 'l' (x = bord gauche) ou 'r' (x = bord droit)
  Doc.prototype.put = function (s, x, y, size, bold, al, gray) {
    if (al === 'r') x -= textW(s, size, bold);
    this.cur.push('BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + (gray ? '0.42 g' : '0 g') + ' ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' Td (' + pdfStr(s) + ') Tj ET');
  };
  Doc.prototype.rule = function (y, w) { this.cur.push('0 G ' + (w || 0.6) + ' w ' + this.M + ' ' + y.toFixed(2) + ' m ' + (this.W - this.M) + ' ' + y.toFixed(2) + ' l S'); };
  // Écrit un paragraphe (retour à la ligne automatique) et fait avancer le curseur.
  Doc.prototype.para = function (s, x, width, size, bold, al, gray) {
    var self = this, lines = wrapText(s, width, size, bold), lh = size * 1.35;
    lines.forEach(function (l) { self.need(lh); self.y -= lh; self.put(l, al === 'r' ? x + width : x, self.y, size, bold, al, gray); });
  };
  Doc.prototype.gap = function (h) { this.y -= h; };
  Doc.prototype.bytes = function () {
    var objs = [], n = this.pages.length, kids = [], i;
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    for (i = 0; i < n; i++) kids.push((5 + i * 2) + ' 0 R');
    objs[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>';
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    for (i = 0; i < n; i++) {
      var content = this.pages[i].join('\n');
      objs[5 + i * 2] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + this.W + ' ' + this.H + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + (6 + i * 2) + ' 0 R >>';
      objs[6 + i * 2] = '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream';
    }
    var out = '%PDF-1.4\n', offs = [], k;
    for (k = 1; k < objs.length; k++) { offs[k] = out.length; out += k + ' 0 obj\n' + objs[k] + '\nendobj\n'; }
    var xref = out.length;
    out += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n';
    for (k = 1; k < objs.length; k++) out += ('0000000000' + offs[k]).slice(-10) + ' 00000 n \n';
    out += 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    var u = new Uint8Array(out.length);
    for (k = 0; k < out.length; k++) u[k] = out.charCodeAt(k) & 255;
    return u;
  };

  // Facture / avoir → PDF (mêmes données que html()).
  function pdf(inv, lang, mode) {
    if (mode === 'credit' && inv.credit) inv = creditView(inv, lang);
    var t = T[lang] || T.fr, d = new Doc(), L = d.M, R = d.W - d.M, CW = R - L;
    var title = (lang === 'en' ? inv.titleEn : inv.title) || t.title;
    var money = function (n) { return new Intl.NumberFormat(t.locale, { style: 'currency', currency: inv.currency || 'EUR' }).format(n || 0); };
    var date = new Date(inv.date * 1000).toLocaleDateString(t.locale, { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
    if (inv.test) { d.y -= 14; d.put(t.test, d.W / 2 - textW(t.test, 11, true) / 2, d.y, 11, true); d.gap(10); }
    var top = d.y;
    d.y -= 22; d.put(title.toUpperCase(), L, d.y, 20, true);
    d.para(t.no + ' ' + inv.number, L, 250, 10.5); d.para(t.date + ' : ' + date, L, 250, 10.5); d.para(t.order + ' ' + inv.ref, L, 250, 10.5);
    var leftEnd = d.y; d.y = top;
    d.para(inv.seller.name, R - 250, 250, 10.5, true, 'r');
    [inv.seller.line2, t.siret + ' ' + inv.seller.siret, inv.seller.email].forEach(function (s) { d.para(s, R - 250, 250, 10.5, false, 'r'); });
    d.y = Math.min(d.y, leftEnd); d.gap(6); d.rule(d.y, 1.4); d.gap(14);
    d.para(t.customer.toUpperCase(), L, 300, 8, false, 'l', true);
    d.para(inv.customer.name, L, 300, 10.5, true);
    inv.customer.address.concat(inv.customer.country ? [inv.customer.country] : [], [inv.customer.email]).forEach(function (s) { d.para(s, L, 300, 10.5); });
    d.gap(14);
    var cQty = R - 190, cUnit = R - 100, descW = cQty - 50 - L;
    d.need(40); d.y -= 11; d.put(t.desc.toUpperCase(), L, d.y, 8, false, 'l', true);
    d.put(t.qty.toUpperCase(), cQty, d.y, 8, false, 'r', true); d.put(t.unit.toUpperCase(), cUnit, d.y, 8, false, 'r', true); d.put(t.amount.toUpperCase(), R, d.y, 8, false, 'r', true);
    d.gap(5); d.rule(d.y, 0.8);
    inv.lines.forEach(function (l) {
      var rows = wrapText(l.name, descW, 10.5).concat(l.size ? [t.size + ' ' + l.size] : []);
      d.need(rows.length * 14 + 10); d.gap(5);
      var y0 = d.y - 14;
      rows.forEach(function (r, i) { d.put(r, L, y0 - i * 14, 10.5, false, 'l', l.size && i === rows.length - 1); });
      d.put(String(l.qty), cQty, y0, 10.5, false, 'r'); d.put(money(l.unit), cUnit, y0, 10.5, false, 'r'); d.put(money(l.amount), R, y0, 10.5, false, 'r');
      d.y = y0 - (rows.length - 1) * 14 - 6; d.rule(d.y, 0.3);
    });
    d.gap(8);
    var totals = [[t.shipping, money(inv.shipping)]]
      .concat((inv.deductions || []).map(function (x) { return [x.label, '-' + money(x.amount)]; }))
      .concat(inv.discount ? [[t.discount, '-' + money(inv.discount)]] : []);
    totals.forEach(function (r) {
      var lines = wrapText(r[0], 260, 10.5);
      d.need(lines.length * 14 + 4); d.y -= 14;
      lines.forEach(function (s, i) { d.put(s, R - 110, d.y - i * 14, 10.5, false, 'r'); });
      d.put(r[1], R, d.y, 10.5, false, 'r'); d.y -= (lines.length - 1) * 14 + 2;
    });
    d.gap(4); d.need(40); d.rule(d.y, 1.4); d.y -= 18;
    var gl = wrapText(inv.totalLabel || t.total, 260, 13, true);
    gl.forEach(function (s, i) { d.put(s, R - 110, d.y - i * 17, 13, true, 'r'); });
    d.put(money(inv.total), R, d.y, 13, true, 'r'); d.y -= (gl.length - 1) * 17;
    d.gap(20);
    (inv.notes || []).concat([inv.vat, inv.paid || t.paid]).forEach(function (s) { if (s) d.para(s, L, CW, 9, false, 'l', true); });
    return d.bytes();
  }

  // Bon de commande → PDF : { title, sub, dest:[lignes], items:[[texte, quantité]], foot:[lignes] }.
  function sheetPdf(o) {
    var d = new Doc(), L = d.M, R = d.W - d.M;
    d.para(o.title, L, R - L, 18, true); d.para(o.sub, L, R - L, 10, false, 'l', true); d.gap(12);
    var h = o.dest.length * 24 + 20; d.need(h);
    d.cur.push('0 G 1.5 w ' + L + ' ' + (d.y - h).toFixed(2) + ' ' + (R - L) + ' ' + h + ' re S');
    var yBox = d.y; d.gap(4); o.dest.forEach(function (s, i) { d.para(s, L + 12, R - L - 24, 17, i === 0); });
    d.y = Math.min(d.y, yBox - h) - 20;
    o.items.forEach(function (r) {
      d.need(30); var y0 = d.y;
      d.para(r[0], L, R - L - 70, 12); d.put(r[1], R, y0 - 16, 12, false, 'r'); d.gap(4); d.rule(d.y, 0.3);
    });
    d.gap(10); (o.foot || []).forEach(function (s) { d.para(s, L, R - L, 10, false, 'l', true); });
    return d.bytes();
  }

  // Ouvre la feuille de partage (iPhone : « Enregistrer dans Fichiers », Mail, AirDrop…) avec le PDF ; sinon téléchargement.
  function download(w, bytes, name) {
    var url = w.URL.createObjectURL(new w.Blob([bytes], { type: 'application/pdf' })), a = w.document.createElement('a');
    a.href = url; a.download = name; w.document.body.appendChild(a); a.click(); a.remove();
    return true;
  }
  function sharePdf(w, make, name) {
    var bytes;
    try { bytes = make(); } catch (e) { w.alert('Impossible de créer le PDF : ' + (e && e.message ? e.message : e)); return Promise.resolve(false); }
    var file = null, nav = w.navigator;
    try { file = new w.File([bytes], name, { type: 'application/pdf' }); } catch (e) { file = null; }
    if (file && nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
      return nav.share({ files: [file], title: name }).then(function () { return true; }, function (e) {
        if (e && e.name === 'AbortError') return false; // fermé par l'utilisateur
        return download(w, bytes, name);
      });
    }
    return Promise.resolve(download(w, bytes, name));
  }

  // Bouton d'impression branché depuis la page appelante (pas de script en ligne : la CSP et iOS le bloquent).
  function bindPrint(w, inv, lang, mode) {
    var b = w.document.getElementById('vg-print');
    if (b) b.addEventListener('click', function () { w.focus(); w.print(); });
    var sh = w.document.getElementById('vg-share');
    if (sh) sh.addEventListener('click', function () {
      sharePdf(w, function () { return pdf(inv, lang, mode); }, ((mode === 'credit' && inv.credit ? inv.credit.number : inv.number) || 'facture') + '.pdf');
    });
  }

  // Ouvre la facture dans un nouvel onglet (à appeler dans un clic : sinon le navigateur bloque la fenêtre).
  function open(inv, lang, mode) {
    var w = root.open('', '_blank');
    if (!w) { alert('Fenêtre bloquée : autorise les pop-ups pour ce site.'); return; }
    w.document.open(); w.document.write(html(inv, lang, mode)); w.document.close(); bindPrint(w, inv, lang, mode);
  }

  // Ouvre tout de suite une page vide (dans le clic : pas bloquée), puis y écrit la facture quand elle arrive.
  function openAsync(promise, lang, mode) {
    var w = root.open('', '_blank');
    if (!w) { alert('Fenêtre bloquée : autorise les pop-ups pour ce site.'); return Promise.resolve(false); }
    w.document.write('<p style="font:16px system-ui;padding:24px">…</p>');
    return promise.then(function (inv) { w.document.open(); w.document.write(html(inv, lang, mode)); w.document.close(); bindPrint(w, inv, lang, mode); return true; })
      .catch(function (e) { w.document.body.innerHTML = '<p style="font:16px system-ui;padding:24px">' + esc(e && e.message ? e.message : 'Erreur') + '</p>'; return false; });
  }

  root.VGInvoice = { bindPrint: bindPrint, pdf: pdf, sheetPdf: sheetPdf, sharePdf: sharePdf, html: html, open: open, openAsync: openAsync };
  if (typeof module === 'object' && module.exports) module.exports = root.VGInvoice;
}(typeof self !== 'undefined' ? self : this));
