# ETAT
- Fait : audit lecture seule (étape 1). Stock (Durable Object, réservation, décrément après paiement, sold out à 0), admin stock, worker checkout déployé, frais de port par produit (fr/intl, Canada = intl).
- Reste : vérifier paiement test de bout en bout (secrets, webhook Stripe, GITHUB_CLIENT_ID vide), emails de commande, codes promo, tarif Canada propre, domaine propre, Stripe live.
- Nettoyage : oauth-worker/ doublon et README checkout périmé ; jeton admin du navigateur à fiabiliser.
- Prochain pas : test de paiement Stripe en mode test, puis emails de commande.
