# Checklist courte : deux tests à faire (après « déploie la branche de la nuit »)

## A. Test de paiement 4242 (mode test, aucun vrai argent) : ~5 min
Avant : l'état du système affiche `mode : test uniquement` (Admin → État du système).
1. Tu m'écris **« prépare le test de paiement »**. Je publie une pièce fictive à 10 € (poids 800 g, colis, quantité 1) et je te donne son lien. Attends 1 à 2 min.
2. iPhone, Safari : ouvre le lien → **Ajouter au panier** → panier → choisis **Belgique** → le port affiché doit être **15 €**, total **25 €** → **Payer**.
3. Page Stripe : carte `4242 4242 4242 4242`, date future, CVC `123`, nom et adresse en Belgique → payer.
4. Tu dois arriver sur la page « Merci » avec ta référence.
5. Tu m'écris **« c'est payé »**. Je contrôle : stock à 0 (« Sold out » sur la fiche), mail client (FR ou EN selon la langue du site) et mail vendeur reçus, ligne dans Admin → Commandes, facture, puis **je supprime la pièce fictive**.
Variantes utiles (facultatives) : carte refusée `4000 0000 0000 0002` (le panier doit rester intact, aucune pièce décomptée) ; France (livraison offerte pour un colis) ; un 2e appareil qui essaie la même pièce unique pendant que le 1er paie (message « quelqu'un est en train de payer »).
Je ne tape jamais le numéro de carte : c'est toi.

## B. Test de l'éditeur « Modifier une fiche » (iPhone) : ~3 min
But : vérifier qu'enregistrer une fiche n'efface ni le badge, ni la couleur, ni le reel.
1. Admin → **Catalogue** (ou le tableau de bord) : note, pour **CH_0002**, ce qu'affiche sa fiche : badge « Pièce unique », pastille de couleur (noir), reel/vidéo. Prends une capture.
2. Admin → **Modifier une fiche** → connecte-toi avec GitHub si demandé → ouvre **CH_0002**.
3. Change **une seule virgule** dans la description → **Enregistrer** (Publish).
4. Attends 1 à 2 minutes (reconstruction du site), recharge la fiche **en vidéo ou capture** : le badge, la pastille et le reel doivent être **identiques** à l'étape 1.
5. Remets la virgule d'origine et enregistre à nouveau.
6. Tu m'écris **« éditeur OK »** ou **« éditeur : il a effacé X »** (je regarde alors le fichier `data/products/ch_0002.json` : s'il manque `unique`, `color_*` ou `reel_url`, je corrigerai).
Variante (aperçu) : sur une pièce en aperçu ou programmée, répète l'étape 3 : elle doit **rester** en aperçu / programmée (ne pas se retrouver en ligne).
