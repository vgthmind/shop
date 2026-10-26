# Checklist de tests à faire à la main (PC + iPhone)

Mise à jour : 2026-10-26 (soir). Un point = une action + le résultat attendu. Version cochable : « Tests à faire à la main (PC + iPhone) » dans Bureau\TAFF\Outils Taff.
Déjà validés par vgthmind le 26/10 et retirés : connexion iPhone, compta (liens, lignes 3×+7 / 3×−7), stock, essai 1 €, adresse sur facture, pages de l'admin après la CSP, Stripe webhooks, Better Stack, clés R2, programmation de pièce, éditeur, demande, Instagram, code promo, Search Console.

## A. Impression (corrigée : script d'impression avec le nonce de la page)
1. **PC** : Admin → Commandes → une commande → « Facture » → dans la page qui s'ouvre, « Imprimer / Enregistrer en PDF ».
   → Attendu : La fenêtre d'impression s'ouvre. La facture affiche « vgthmind », l'adresse sans la ville en double, le SIRET, et un prix unitaire égal au montant (plus de 0,00 €). Pareil avec « Voir l'avoir » sur une commande remboursée.
2. **PC** : Commandes → une commande → « Bon de commande (imprimer) » → « Imprimer ».
   → Attendu : La fenêtre d'impression s'ouvre.
3. **iPhone** : Mêmes deux boutons depuis l'appli admin.
   → Attendu : L'impression / le partage s'ouvre (si une fenêtre est bloquée, autorise les pop-ups pour ce site).

## B. Admin : nouvelle pièce et boutons
4. **PC** : Admin → Pièces → Nouvelle pièce → va à l'étape 5 (ou touche « Enregistrer en brouillon »).
   → Attendu : Le bloc « Statut de la pièce » est visible avec 3 choix : Masquée (coché par défaut), Programmée (date + heure), En ligne maintenant. Le bouton s'appelle « Enregistrer la pièce » et rappelle le statut dans la confirmation. Rien n'est en ligne si tu laisses « Masquée ».
5. **PC** : Choisis « Programmée » à +10 minutes et regarde le texte sous la date, puis enregistre.
   → Attendu : Le texte « Visible vers HH:MM » s'affiche ; la pièce apparaît à cette heure environ (la reconstruction du site dure environ 1 minute, mesurée à 65 secondes) ; la fiche dans Pièces montre « Programmée · … · visible vers HH:MM ». Si l'heure réelle est très différente, note-la.
6. **PC** : Dans l'admin, touche un bouton d'enregistrement ou d'action (ex. « Marquer en préparation », « Enregistrer »), puis dans le détourage : « Garder », « Annuler », « Relancer ».
   → Attendu : Le bouton affiche « En cours… » avec une animation, puis « ✓ fait » (ou « ✕ Échec »), et un message apparaît en bas de l'écran avec le résultat ou l'erreur claire.
7. **iPhone** : Même test des boutons sur iPhone (message en bas, au-dessus du menu).
   → Attendu : Le message en bas est visible et ne cache pas le menu.
8. **iPhone** : Admin → Réglages → Compta.
   → Attendu : « Ma comptabilité » est tout en haut de la page, avec « Comptabilité : livre des recettes » et « Facturation hors boutique » ; elle est aussi dans Réglages (tuile « Ma comptabilité »). Le lien s'ouvre.

## C. Acomptes et compta (après le double-clic sur le fichier Deployer-worker.bat du dossier checkout-worker)
9. **PC** : Admin → Commandes → bouton « Acomptes » (ou « Toutes »).
   → Attendu : L'acompte de 0,60 € du 26/10 apparaît (« Remboursée »), avec « Facture » et « Voir l'avoir ». Un acompte payé non remboursé a un bouton « Rembourser… ».
10. **PC** : Ma comptabilité (Ctrl+Maj+R) : cherche les lignes « Site vgthmind » du 26/10.
   → Attendu : L'acompte de 0,60 € apparaît en vente (+0,60 €) une seule fois, avec son remboursement (−0,60 €) : total 0 €. (La ligne est ajoutée toute seule dans l'heure qui suit la mise à jour du Worker.)
11. **PC** : À la prochaine vente réelle : Ma comptabilité (Ctrl+Maj+R).
   → Attendu : Une seule nouvelle ligne « Site vgthmind », montant = total payé par le client (port compris), à la bonne date.

## D. Sur demande : parcours complet (à refaire, petit prix, après la mise à jour du Worker)
12. **PC** : Crée une demande (ton adresse mail), un devis de 2 à 3 € avec acompte, accepte-le, paie l'acompte.
   → Attendu : Mails reçus ; l'acompte apparaît dans Commandes → Acomptes et, dans l'heure, dans Ma comptabilité.
13. **PC** : Admin → Demandes → la demande : regarde les deux boutons du solde.
   → Attendu : « Envoyer les photos et demander le solde » (le client valide puis paie) et « Demander le solde sans photos » (seulement le lien de paiement du solde). Le second envoie un mail « il ne reste que le solde ».
14. **PC** : Paie le solde.
   → Attendu : Le mail de confirmation contient un lien « Télécharger ta facture » ; il mène à la page de suivi avec le bouton de facture à l'écran.
15. **PC** : Admin → Commandes : rembourse l'acompte puis le solde (bouton « Rembourser… »).
   → Attendu : Les deux se remboursent depuis l'admin ; mails/alertes reçus ; 2 lignes « Remboursements » dans Ma comptabilité, chacune une seule fois.

## E. Codes promo
16. **PC** : Admin → Réglages → Codes promo : crée un code de test (ex. TESTVG), puis touche « Supprimer » et confirme.
   → Attendu : Une confirmation s'affiche ; le code disparaît de la liste et n'est plus accepté dans un panier.

## F. Sauvegarde
17. **PC** : Ouvre la boîte contact@ demain matin.
   → Attendu : Un mail de sauvegarde nocturne (3 h 30 UTC) avec le fichier JSON joint, ouvrable.
