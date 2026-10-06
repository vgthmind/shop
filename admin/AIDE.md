# Aide de l'admin `/shop/`

Adresses :
- Pièces : https://vgthmind.github.io/shop/admin/ → « Se connecter avec un jeton d'accès » (jeton GitHub, voir plus bas).
- Commandes : https://vgthmind.github.io/shop/admin/commandes.html (même jeton).
- Paiements, remboursements, codes promo : tableau de bord Stripe.

Après chaque enregistrement dans l'admin, le site se reconstruit tout seul (1 à 2 min).

## Ajouter une pièce
Pièces → Nouveau. Remplir nom, slug (adresse de la page, sans accents ni espaces, à ne plus changer ensuite), prix, description (anglais, ligne vide, français), photos (la 1re = photo principale ; photos détourées, fond transparent, ~1000 px), catégories, frais de port France / international. « Livrable hors de France » : décocher pour une pièce France uniquement. Enregistrer.

## Modifier une pièce
Ouvrir la pièce, changer, enregistrer. Glisser les photos pour changer leur ordre.

## Stock
- Pièce unique : « Quantité en stock » = 1 (par défaut). Elle passe toute seule en « Sold out » après un paiement.
- Petite série : mettre le nombre d'exemplaires ; il baisse à chaque vente, « Sold out » à 0. Le badge « Unique piece » disparaît pour ces pièces.
- À la main : décocher « En stock ».

## Retirer une pièce
Cocher « Retirée du site (archivée) » plutôt que Supprimer : la pièce disparaît du site, de la recherche et du paiement, mais sa fiche reste (historique des commandes).

## Commandes
Page Commandes : liste des paiements reçus (nom, adresse, pièces). « Marquer expédiée » → numéro de suivi → bouton « E-mail « expédiée » » qui prépare le message au client (anglais + français) dans ta messagerie.

## Codes promo
Stripe → Catalogue de produits → Coupons → créer un coupon, puis un « code promotionnel » (ex. `VGT10`). Le champ « Ajouter un code promotionnel » apparaît tout seul sur la page de paiement.

## Recherche
Champ « Mots-clés de recherche » : mots en plus du nom et de la description (ex. hoodie, sweat, capuche).

## Jeton GitHub (connexion à l'admin)
https://github.com/settings/personal-access-tokens/new → « Only select repositories » → `vgthmind/shop` → Repository permissions → Contents : Read and write → Generate. Le garder dans un gestionnaire de mots de passe ; ne jamais le coller ailleurs que dans l'admin.
