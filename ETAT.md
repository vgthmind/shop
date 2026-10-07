# ETAT — boutique vgthmind/shop (Stripe test, LIVE_MODE = 0, ne pas changer)
Fait : lots 1 et 2 poussés. Lot 2 = page admin/pieces.html (« Poids & ports » : poids, mode, part seule, ports FR/UE/monde, modeAdvice) ; poids préremplis sur data/products ; 74 tests OK ; Worker/paiement intacts.
Reste : peser cd-vgtape (lettre, poids vide) ; short-ge0001 (400 g estimé) et les autres « estimés » à corriger dans la page ; régler « part seule » pièce par pièce ; puis lot 3 (fusion Ajout pièce + studio), lots 4-10.
Notes : lot 4 = quoteOrFallback ; règle US du 17 sept 2026 ; « Prix vgthmind » (Outre-mer étiqueté UE) ; relancer workflow "Build shop" (196e5ce). Reste (toi) : médiateur, adresse, CGV [crochets], tu/vous, TVA, Stripe live, DNS IONOS (jamais MX/SPF/DKIM), BASE_PATH='' + site_url + public:true.
Prochain pas : vérifier le rendu de https://vgthmind.github.io/shop/admin/pieces.html (connexion GitHub), puis lot 3.
