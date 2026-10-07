# ETAT — boutique vgthmind/shop (Stripe test, LIVE_MODE = 0, ne pas changer)
Branche nuit/integration = main + nuit/corrections + studio-photo + legal + envoi-trafic, fusionnées sans conflit, 47 tests OK, docs/ à jour. Rapport : rapports-nuit/0-integration.md. Rien sur main.
Reste (toi) : test iPhone réel puis fusion dans main ; appliquer rapports-nuit/5 + branchements compta-panier.md (build.js l.498/646) ; remplir brouillons légaux + juriste ; médiateur, adresse, grille d'envoi + pays bloqués, tu/vous, TVA ; coupon test + Stripe live ; DNS IONOS (jamais MX/SPF/DKIM) ; BASE_PATH='' + site_url + public:true.
Dépendances restantes : 18 reels + 4 fichiers du build sur vgthmind.github.io ; Sveltia (unpkg) sur /admin/ seulement.
Règles : français simple, secrets jamais dans le chat ni le dépôt (public). Worker : checkout-worker/. Après admin/ ou theme/ : node generator/build.js.
