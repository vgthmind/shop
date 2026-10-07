# ETAT — boutique vgthmind/shop (Stripe test, LIVE_MODE = 0, ne pas changer)
Fait : rapport 5 points 1, 2, 4, 10 commités et poussés (47 tests OK). Points 1 et 4 sont dans le Worker : NON déployés. Branche suivi-colis = WIP La Poste, en attente.
Lot Worker à faire ensemble (redéploiement + test en mode test) : points 3, 5, 6, 7, 8, 9 du rapport 5 + branchement compta (secrets COMPTA_URL/COMPTA_SECRET, Apps Script, événements Stripe).
Sélecteur de pays : NE PAS brancher avant mes vrais tarifs dans admin/shipping-config.json et le branchement du Worker sur la grille (envoi.md). Points CGV en [crochets] : attente du juriste.
Reste (toi) : médiateur, adresse, grille d'envoi + pays bloqués, tu/vous, TVA ; coupon test + Stripe live ; DNS IONOS (jamais MX/SPF/DKIM) ; BASE_PATH='' + site_url + public:true.
Règles : français simple, secrets jamais dans le chat ni le dépôt (public). Worker : checkout-worker/. Après admin/ ou theme/ : node generator/build.js.
