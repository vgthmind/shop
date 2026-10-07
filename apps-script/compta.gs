/**
 * Réception des ventes et remboursements de la boutique, dans CE Google Sheet.
 * À coller dans Extensions > Apps Script (Code.gs), puis :
 *  1. Paramètres du projet > Propriétés du script > ajouter  SECRET = une longue phrase au hasard
 *     (la même valeur que le secret Cloudflare COMPTA_SECRET).
 *  2. Déployer > Nouveau déploiement > Application Web : Exécuter en tant que « moi »,
 *     Accès « Tout le monde ». Copier l'adresse « /exec » : c'est le secret COMPTA_URL.
 *  Ne mets ni le SECRET ni l'adresse /exec dans le dépôt GitHub (public).
 * Aucune donnée client n'arrive ici : seulement n° de commande, désignation, montants.
 * Rejouable : chaque ligne a une clé (dernière colonne) ; renvoyer la même ligne la met à jour.
 */
var SALES = 'Ventes';
var REFUNDS = 'Remboursements';
var SALE_COLUMNS = ['Date', 'N° de pièce (commande)', 'Désignation', 'Nature', 'Mode de règlement',
  'Pièces TTC', 'Frais de port', 'Remise', 'Total encaissé', 'ID paiement Stripe', 'Clé'];
var REFUND_COLUMNS = ['Date', 'N° de pièce (commande)', 'ID paiement Stripe', 'Montant remboursé', 'Motif', 'Clé'];
var MAX_AGE_SECONDS = 15 * 60;

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (!verify_(String(body.ts), String(body.payload), String(body.sig))) return out_({ ok: false, error: 'signature' });
    var rec = JSON.parse(body.payload);
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (rec.type === 'sale') upsert_(SALES, SALE_COLUMNS, rec.key, saleRow_(rec));
      else if (rec.type === 'refund') upsert_(REFUNDS, REFUND_COLUMNS, rec.key, refundRow_(rec));
      else return out_({ ok: false, error: 'type' });
    } finally { lock.releaseLock(); }
    return out_({ ok: true });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function saleRow_(rec) {
  var r = rec.row;
  return [r.date, r.ref, r.designation, r.nature, r.method, r.items, r.shipping, r.discount, r.total, r.payment_intent, rec.key];
}
function refundRow_(rec) {
  var r = rec.row;
  return [r.date, r.ref, r.payment_intent, r.amount, r.reason, rec.key];
}

// Signature HMAC-SHA256 hexadécimale de  ts + '.' + payload  avec la propriété SECRET.
function verify_(ts, payload, sig) {
  var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!secret || !/^\d+$/.test(ts) || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > MAX_AGE_SECONDS) return false;
  var bytes = Utilities.computeHmacSha256Signature(ts + '.' + payload, secret);
  var hex = bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  var diff = hex.length ^ sig.length; // comparaison sans arrêt anticipé
  for (var i = 0; i < hex.length && i < sig.length; i++) diff |= hex.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

// Met à jour la ligne de même clé (dernière colonne), sinon l'ajoute.
function upsert_(name, columns, key, values) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, columns.length).setValues([columns]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  var keyCol = columns.length, last = sh.getLastRow(), row = 0;
  if (last > 1) {
    var keys = sh.getRange(2, keyCol, last - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) if (String(keys[i][0]) === key) { row = i + 2; break; }
  }
  if (!row) row = last + 1;
  sh.getRange(row, 1, 1, columns.length).setValues([values]);
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
