# ETAT — boutique vgthmind/shop (Stripe test, LIVE_MODE = 0, ne pas changer)
nuit/integration fusionnée dans main et poussée (47 tests OK, build GitHub OK, site en ligne sans erreur JS). Rapport : rapports-nuit/0-integration.md. Worker non redéployé.
Branche suivi-colis = WIP suivi La Poste (apostrophes vg-shop-cart.js l.465, antislashs index.ts, clé LAPOSTE_OKAPI_KEY), en attente de validation de l'API.
Prochaine étape : appliquer rapports-nuit/5-correctifs-a-appliquer.md, puis branchements compta-panier.md (sélecteur de pays, build.js l.498/646), puis retest iPhone du panier. Reste (toi) : remplir brouillons légaux + juriste ; médiateur, adresse, grille d'envoi + pays bloqués, tu/vous, TVA ; coupon test + Stripe live ; DNS IONOS (jamais MX/SPF/DKIM) ; BASE_PATH='' + site_url + public:true.
Dépendances restantes : 18 reels + 4 fichiers du build sur vgthmind.github.io ; Sveltia (unpkg) sur /admin/ seulement.
Règles : français simple, secrets jamais dans le chat ni le dépôt (public). Worker : checkout-worker/. Après admin/ ou theme/ : node generator/build.js.
