# ETAT — boutique vgthmind/shop (Stripe test, LIVE_MODE = 0, ne pas changer)
Branche nuit/corrections (non fusionnée) : site SANS aucun script BigCartel (assets/vg-theme.js + Splide), polices/icônes hébergées, images allégées, SEO/alt/lang corrigés. Détails : rapports-nuit/6 ; correctifs Worker/CGV/panier à appliquer à la main : rapports-nuit/5.
Reste avant bascule : médiateur, adresse activité, validation juriste (rétractation/CGV), grille de frais d'envoi, remboursements (Worker), coupon test + Stripe live, shop.vgthmind.org (DNS IONOS, jamais MX/SPF/DKIM), BASE_PATH='' + site_url + public:true.
Reste côté dépendances : 18 reels vidéo + fichiers téléchargés au build viennent encore du dépôt vgthmind.github.io.
Règles : français simple, secrets jamais dans le chat ni le dépôt (public). Worker : checkout-worker/. Après admin/ ou theme/ : node generator/build.js.
Prochain pas : relire la branche nuit/corrections (tester sur ton iPhone), la fusionner, puis appliquer rapports-nuit/5.
