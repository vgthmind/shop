/* Service worker de l'admin installable : garde les pages de l'admin en mémoire pour qu'elles s'ouvrent même
   avec une mauvaise connexion. Réseau d'abord (toujours la dernière version quand il y a du réseau).
   Ne touche jamais aux appels vers le Worker ou GitHub (commandes, stock...) : seulement les fichiers de /admin/. */
var CACHE = 'vg-admin-v9';
var SHELL = ['menu.html', 'aide.html', 'commandes.html', 'demandes.html', 'catalogue.html', 'stock.html', 'pieces.html', 'export.html', 'trafic.html', 'expedition.html', 'promos.html', 'vg-admin-auth.js', 'icon-192.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return Promise.all(SHELL.map(function (u) { return fetch(u).then(function (r) { if (r.ok && !r.redirected) return c.put(u, r); }).catch(function () {}); })); }));
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }));
  self.clients.claim();
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.indexOf('/admin/') === -1) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok && !res.redirected) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () { return caches.match(req).then(function (hit) { return hit || caches.match('menu.html'); }); }));
});
