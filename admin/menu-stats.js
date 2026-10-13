/* Calculs du tableau de bord (sans accès réseau, testés dans tests/menu-stats.test.mjs). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VGMenuStats = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DAY = 864e5;

  // Commandes réelles payées, pas encore expédiées, non remboursées en totalité (les acomptes de pièces sur demande ne s'expédient pas).
  function toShip(orders) {
    return (orders || []).filter(function (o) { return !o.shipped && o.livemode && o.kind !== 'deposit' && !(o.refunded && o.refunded.full); }).length;
  }
  // Nouvelles demandes, clients qui ont perdu leurs retouches incluses, retouches en plus à traiter.
  function requestsTodo(reqs) {
    return (reqs || []).filter(function (r) {
      return r.status === 'nouvelle' || r.forfeited || (r.validation && r.status === 'validation' && r.validation.retouches.some(function (x) { return x.extra; }));
    }).length;
  }
  // Prochain drop : toutes les pièces programmées à la même minute que la plus proche (à venir). null s'il n'y en a pas.
  function nextDrop(schedule, now) {
    var future = (schedule || []).map(function (e) { return { slug: e.slug, t: Date.parse(e.at) }; }).filter(function (e) { return e.t > now; }).sort(function (a, b) { return a.t - b.t; });
    if (!future.length) return null;
    var first = Math.floor(future[0].t / 60000);
    return { at: future[0].t, count: future.filter(function (e) { return Math.floor(e.t / 60000) === first; }).length };
  }
  // « dans 2 h », « demain à 18:00 », « le samedi 24 octobre à 18:00 ».
  function inWords(at, now) {
    var diff = at - now, h = Math.round(diff / 36e5);
    var hm = new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
    if (diff < 90 * 60000) return 'dans ' + Math.max(1, Math.round(diff / 60000)) + ' min';
    if (diff < 6 * 36e5) return 'dans ' + h + ' h';
    var day = function (t) { return new Date(t).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }); };
    if (day(at) === day(now)) return 'aujourd\'hui à ' + hm;
    if (day(at) === day(now + DAY)) return 'demain à ' + hm;
    return 'le ' + new Date(at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }) + ' à ' + hm;
  }
  // Chiffres des ventes : réelles (ou, à défaut, de test), remboursements déduits ; 30 derniers jours, par mois, pièces qui rapportent le plus.
  function salesStats(orders, now) {
    var all = (orders || []).filter(function (o) { return o.kind !== 'deposit'; });
    var live = all.filter(function (o) { return o.livemode; });
    var set = live.length ? live : all;
    var net = function (o) { var r = o.refunded ? (o.refunded.full ? o.total : Number(o.refunded.amount) || 0) : 0; return Math.max(0, (o.total || 0) - r); };
    var paid = set.filter(function (o) { return !(o.refunded && o.refunded.full); });
    var last = paid.filter(function (o) { return o.created * 1000 >= now - 30 * DAY; });
    var ca30 = last.reduce(function (s, o) { return s + net(o); }, 0);
    var months = {}, order = [], pieces = {};
    paid.forEach(function (o) {
      var key = new Date(o.created * 1000).toISOString().slice(0, 7);
      if (!months[key]) { months[key] = { key: key, label: new Date(o.created * 1000).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' }), n: 0, total: 0 }; order.push(key); }
      months[key].n++; months[key].total += net(o);
      (o.items || []).forEach(function (it) { pieces[it.name] = (pieces[it.name] || 0) + (Number(it.amount) || 0); });
    });
    return {
      test: !live.length && all.length > 0, n30: last.length, ca30: ca30, avg30: last.length ? ca30 / last.length : 0,
      months: order.sort().reverse().slice(0, 6).map(function (k) { return months[k]; }),
      top: Object.keys(pieces).sort(function (a, b) { return pieces[b] - pieces[a]; }).slice(0, 5).map(function (n) { return { name: n, amount: pieces[n] }; })
    };
  }
  // Pièces du catalogue public (products.json) sans poids : les ports ne peuvent pas être calculés.
  function noWeight(list) { return (list || []).filter(function (p) { return !(Math.floor(Number(p && p.weight_g)) > 0); }); }
  return { noWeight: noWeight, toShip: toShip, requestsTodo: requestsTodo, nextDrop: nextDrop, inWords: inWords, salesStats: salesStats };
}));
