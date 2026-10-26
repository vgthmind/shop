# Checklist de tests à faire à la main (PC + iPhone)

Mise à jour : 2026-10-26. Un point = une action + le résultat attendu. Version cochable : « Tests à faire à la main (PC + iPhone) » dans Bureau\TAFF\Outils Taff.
Supprimés (obsolètes) : test de paiement 4242 (le site est en mode réel : les essais se font en réel, petit prix, remboursés) ; Admin Commandes + /suivi + mails expédiée/livrée (validés par vgthmind le 21/10).

## A. Connexion iPhone (appli de l'écran d'accueil)
1. **iPhone** : Ouvre l'appli admin de l'écran d'accueil → Menu → touche « Connexion » → GitHub → autorise.
   → Attendu : Tu reviens sur le Menu de l'appli, connecté. Pas de retour sur « Connexion requise », pas de boucle.
2. **iPhone** : En bas à gauche du Menu, lis le numéro de version.
   → Attendu : Format date-heure (AAAA-MM-JJ-hhmm, posé à chaque build), plus « v2026-10-14-h ».
3. **iPhone** : Ferme complètement l'appli, rouvre-la.
   → Attendu : Toujours connecté ; la version se met à jour toute seule. Si ça boucle : note le message affiché sous le bouton Connexion.

## B. Compta
4. **PC** : Admin → Réglages → tuile « Comptabilité » (https://www.vgthmind.org/admin/reglages), saisis le mot de passe.
   → Attendu : Le livre des recettes s'ouvre.
5. **iPhone** : Même chemin sur iPhone : Admin → Réglages → « Comptabilité ».
   → Attendu : Le livre des recettes s'ouvre, rien ne déborde.
6. **PC** : Admin → Réglages → Compta → « Ma comptabilité », puis Ctrl+Maj+R.
   → Attendu : Lignes canal « Site vgthmind » : 3 ventes à +7 € et 3 remboursements à −7 € (total 0 €), chacune une seule fois, date = jour du paiement.
7. **iPhone** : Admin → Réglages → Compta → « Ma comptabilité » (lien claude.ai, connecte-toi si demandé).
   → Attendu : La page s'ouvre et affiche les mêmes lignes « Site vgthmind ».
8. **PC** : À la prochaine vente réelle (dans l'heure qui suit) : regarde « Ma comptabilité » (Ctrl+Maj+R).
   → Attendu : Une seule nouvelle ligne « Site vgthmind », montant = total payé par le client, port compris, à la bonne date.

## C. Commandes, stock, factures
9. **PC** : Admin → Catalogue (https://www.vgthmind.org/admin/catalogue) : colonne stock.
   → Attendu : Les pièces vendues sont à 0 / « Sold out » ; le CD et le cache-cou ont leur vrai stock.
10. **PC** : Admin → Commandes → l'essai à 1 € → « Facture » puis « Avoir ».
   → Attendu : La facture et l'avoir s'ouvrent, avec le bon numéro et les bons montants.

## D. Sauvegarde et surveillance
11. **PC** : Ouvre la boîte contact@ le matin.
   → Attendu : Un mail de sauvegarde nocturne (3 h 30 UTC) avec le fichier JSON joint, ouvrable.
12. **PC** : Stripe → Développeurs → Webhooks → le endpoint du Worker.
   → Attendu : Les 2 anciens événements en échec sont compris (ou rejoués : 200) et aucun nouvel échec depuis.
13. **PC** : Better Stack : liste des moniteurs.
   → Attendu : Tous au vert ; une alerte de test arrive bien sur ton mail ou ton téléphone.
14. **PC** : Cloudflare → R2 → clés API.
   → Attendu : Seule la clé utilisée existe, sans expiration proche, avec les droits strictement nécessaires.

## E. Pièces et éditeur
15. **PC** : Admin → Catalogue (Pièces) : crée une pièce de test masquée, programmée dans 10 min ; regarde le site avant puis après l'heure ; archive-la ensuite.
   → Attendu : Invisible avant l'heure ; visible peu après (le temps de la reconstruction) ; plus rien une fois archivée.
16. **iPhone** : Admin → Modifier une fiche → ouvre une fiche → change une virgule → Enregistrer → attends 2 min → recharge la fiche → remets la virgule.
   → Attendu : Badge « Pièce unique », pastille de couleur et reel identiques à avant l'enregistrement. Une pièce programmée ou en aperçu le reste.

## F. Parcours « sur demande », Instagram, code promo
17. **PC** : Site → Sur demande : envoie une demande avec ta propre adresse mail.
   → Attendu : Mail de confirmation reçu ; la demande apparaît dans Admin → Demandes.
18. **PC** : Crée un devis de 2 à 3 € (acompte inclus), envoie-le, accepte-le, paie l'acompte, demande le solde, paie le solde.
   → Attendu : Un mail à chaque étape (devis avec PDF, acompte, solde + facture), statuts corrects dans l'admin.
19. **PC** : Rembourse l'acompte puis le solde (Admin → Commandes → Rembourser…) et regarde « Ma comptabilité ».
   → Attendu : Mails et alertes reçus ; 2 lignes « Remboursements » en négatif ; 2 lignes de ventes, sans doublon.
20. **iPhone** : Envoie-toi en DM Instagram le lien https://www.vgthmind.org/product/cache-cou/ puis celui de l'accueil.
   → Attendu : Fiche : photo carrée et titre « Cache-cou blanc en molleton, design aérographe | vgthmind ». Accueil : image générique. Ancien aperçu ? ajoute ?v=2 au lien.
21. **PC** : Admin → Réglages → Codes promo : crée « TESTVG » (10 %, 1 utilisation), essaie-le dans un panier jusqu'à Stripe sans payer, puis supprime-le.
   → Attendu : Remise visible dans le panier ; une fois supprimé, il n'est plus accepté. Erreur de droits : la clé Stripe n'a pas « Écriture » sur Coupons et Promotion Codes.

## G. Google Search Console
22. **PC** : Search Console → Indexation / Améliorations : pour « 404 », « Extraits de produits » et « Fiches de marchand », clique « Valider la correction ».
   → Attendu : Statut « Validation commencée » sur les trois (les résultats arrivent en quelques jours).
