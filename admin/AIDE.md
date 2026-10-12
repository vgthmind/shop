# Aide de l'admin `/shop/`

Adresses :
- Pièces : https://vgthmind.github.io/shop/admin/ → « Se connecter avec GitHub » (compte vgthmind).
- Stock : https://vgthmind.github.io/shop/admin/stock.html (bouton « Stock » en bas à droite de l'admin).
- Commandes & stats : https://vgthmind.github.io/shop/admin/commandes.html.
- Paiements, remboursements, codes promo : tableau de bord Stripe.

- **Catalogue** (le plus simple, aussi sur iPhone) : https://vgthmind.github.io/shop/admin/catalogue.html.

Après chaque enregistrement dans l'admin, le site se reconstruit tout seul (1 à 2 min).

## Catalogue (page conseillée)
- Toutes les pièces avec photo, prix, stock (Sold out en rouge) et statut. Recherche + filtres (catégorie, stock, pièces uniques, statut).
- Toucher une pièce : modifier nom, prix, taille, description, catégories, Latest Drop, badge UNIQUE PIECE, pastille couleur, reel, ordre des photos (glisser, ou ← →), statut, stock.
- Statuts : **Publiée** (en boutique) · **Brouillon** (visible seulement par son lien, pour l'aperçu, jamais achetable) · **Masquée** (achetable par lien direct, absente des listes) · **Archivée** (retirée du site, fiche gardée).
- **Dupliquer** : copie en brouillon (mêmes photos) pour une pièce proche.
- Cocher plusieurs pièces : publier, masquer, brouillon, ajouter/retirer une catégorie, Sold out, archiver, en un clic.
- Ordre de la boutique : glisser ⠿ (ordinateur) ou ↑ ↓ (téléphone), sans filtre actif.
- **Catégories…** : créer, renommer (l'adresse ne change pas), réordonner.
- Les modifications restent en attente (gardées sur l'appareil, même si la page se ferme) jusqu'à **Enregistrer** ; **Annuler cet enregistrement** remet tout comme avant. Le stock, lui, change tout de suite (avec « Annuler » dans le message).

## Ajouter une pièce
Pièces → Nouveau. Remplir nom, slug (adresse de la page, sans accents ni espaces, à ne plus changer ensuite), prix, description (anglais, ligne vide, français), photos (la 1re = photo principale ; photos détourées, fond transparent, ~1000 px), catégories, frais de port France / international. « Livrable hors de France » : décocher pour une pièce France uniquement. Enregistrer.

## Modifier une pièce
Ouvrir la pièce, changer, enregistrer. Glisser les photos pour changer leur ordre.

## Stock
- Le stock réel se règle dans la page **Stock** : chaque vente payée le baisse tout seul, à 0 la pièce passe en « Sold out » (fiche et grilles), pour toujours.
- Remettre en vente / ajouter des exemplaires : Stock → mettre le nombre → « Enregistrer » (visible sur le site sous 15 s).
- Nouvelle pièce : « Quantité de départ » dans la fiche (1 = pièce unique) ; ensuite tout se fait dans Stock.
- Petite série (quantité > 1) : le badge « Unique piece » disparaît.
- Pas de double vente : une pièce en cours de paiement est réservée 30 min ; personne d'autre ne peut la payer pendant ce temps.

## Sauvegarde et restauration du stock
- Sauvegarde automatique chaque nuit (gardée 180 jours), plus le bouton « Sauvegarder maintenant ».
- Récupérer une sauvegarde : page Stock → « Télécharger la dernière » ou une date de la liste (fichier `stock-AAAA-MM-JJ.json`). Garde de temps en temps une copie sur ton ordinateur.
- Restaurer : page Stock → « Restaurer depuis un fichier… » → choisir le fichier → les quantités qui changent sont surlignées → vérifier → « Enregistrer ».
- Sans la page (dépannage), dans PowerShell, dossier `C:\Users\vgthm\Downloads\vgthmind-shop\checkout-worker` : `npx.cmd wrangler kv key get backup:latest --binding HOLDS --remote` affiche la dernière sauvegarde.

## Retirer une pièce
Cocher « Retirée du site (archivée) » plutôt que Supprimer : la pièce disparaît du site, de la recherche et du paiement, mais sa fiche reste (historique des commandes).

## Commandes
Page Commandes : liste des paiements reçus (nom, adresse, pièces), statut « payée » / « expédiée ». « Marquer expédiée » → numéro de suivi → le mail « expédiée » (numéro + lien de suivi La Poste, en français ou anglais selon le pays) part tout seul au client. Le numéro devient un lien de suivi La Poste cliquable.

## Codes promo
Stripe → Catalogue de produits → Coupons → créer un coupon, puis un « code promotionnel » (ex. `VGT10`). Le champ « Ajouter un code promotionnel » apparaît tout seul sur la page de paiement.

## Recherche
Champ « Mots-clés de recherche » : mots en plus du nom et de la description (ex. hoodie, sweat, capuche).

## Connexion
« Se connecter avec GitHub » (même bouton sur toutes les pages de l'admin). Seul le compte GitHub vgthmind est accepté. Si GitHub te déconnecte (après une longue période sans connexion), reclique simplement sur le bouton.
