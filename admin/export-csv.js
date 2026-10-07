/* Export CSV des ventes pour le livre des recettes (module pur, sans DOM).
   Format compatible Excel FR : séparateur « ; », décimale « , », dates JJ/MM/AAAA,
   fin de ligne CRLF, UTF-8 AVEC BOM. Aucune donnée client (ni nom, ni email, ni adresse).
   Utilisé par admin/export.html et par `npm test`. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VGExport = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COLUMNS = ['Date', 'N° de pièce (commande)', 'Désignation', 'Nature', 'Mode de règlement',
    'Pièces TTC', 'Frais de port', 'Remise', 'Total encaissé'];
  var BOM = '﻿';

  // Date de Paris d'un horodatage Stripe (secondes) : { y, m, d }.
  function parisParts(unixSeconds) {
    var s = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(unixSeconds * 1000));
    var p = s.split('-');
    return { y: +p[0], m: +p[1], d: +p[2] };
  }

  // period : { type: 'month'|'year'|'quarter', year, month (1-12), quarter (1-4) }
  function inPeriod(unixSeconds, period) {
    var t = parisParts(unixSeconds);
    if (t.y !== period.year) return false;
    if (period.type === 'year') return true;
    if (period.type === 'month') return t.m === period.month;
    if (period.type === 'quarter') return Math.ceil(t.m / 3) === period.quarter;
    return false;
  }

  function periodLabel(period) {
    if (period.type === 'year') return String(period.year);
    if (period.type === 'quarter') return period.year + '-T' + period.quarter;
    return period.year + '-' + ('0' + period.month).slice(-2);
  }

  function round2(n) { return Math.round(Number(n || 0) * 100) / 100; }
  function dec(n) { return round2(n).toFixed(2).replace('.', ','); }

  // Texte -> cellule CSV : guillemets doublés, et neutralisation des formules (= + - @) pour Excel.
  function cell(v) {
    var s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function saleRow(o) {
    var t = parisParts(o.created);
    var designation = (o.items || []).map(function (i) { return i.name + (i.qty > 1 ? ' ×' + i.qty : ''); }).join(' ; ');
    var shipping = round2(o.shipping), total = round2(o.total);
    return {
      date: ('0' + t.d).slice(-2) + '/' + ('0' + t.m).slice(-2) + '/' + t.y,
      ref: o.ref || '', designation: designation, nature: 'Vente de marchandises', method: 'Carte bancaire (Stripe)',
      items: round2(total - shipping), shipping: shipping, discount: round2(o.discount), total: total, created: o.created,
    };
  }

  // Commandes de la période (les commandes de test sont exclues sauf includeTest), triées par date.
  function select(orders, period, includeTest) {
    return (orders || []).filter(function (o) { return (includeTest || o.livemode) && inPeriod(o.created, period); })
      .sort(function (a, b) { return a.created - b.created; });
  }

  // CSV complet (avec BOM) + ligne TOTAL.
  function buildCsv(orders, period, includeTest) {
    var rows = select(orders, period, includeTest).map(saleRow);
    var sum = { items: 0, shipping: 0, discount: 0, total: 0 };
    var lines = [COLUMNS.map(cell).join(';')];
    rows.forEach(function (r) {
      ['items', 'shipping', 'discount', 'total'].forEach(function (k) { sum[k] += r[k]; });
      lines.push([r.date, r.ref, r.designation, r.nature, r.method, dec(r.items), dec(r.shipping), dec(r.discount), dec(r.total)].map(cell).join(';'));
    });
    lines.push(['TOTAL ' + periodLabel(period), '', rows.length + ' vente(s)', '', '', dec(sum.items), dec(sum.shipping), dec(sum.discount), dec(sum.total)].map(cell).join(';'));
    return { csv: BOM + lines.join('\r\n') + '\r\n', count: rows.length, total: round2(sum.total), filename: 'ventes-' + periodLabel(period) + '.csv' };
  }

  return { COLUMNS: COLUMNS, BOM: BOM, buildCsv: buildCsv, select: select, inPeriod: inPeriod, periodLabel: periodLabel, parisParts: parisParts };
}));
