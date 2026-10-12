# À faire de ton côté (pas à pas, sans terminal)

**Mise à jour du 12 octobre (soir).** Le Worker utilise maintenant ta clé Stripe **de test** (rk_test) : le paiement du site fonctionne en mode test (aucun vrai argent). Voir aussi `chantier/REDIRECTIONS.md` (anciennes adresses).

## 0. Le test de paiement avec la carte 4242 (2 minutes, à faire avec Claude)
Je n'ai pas le droit de saisir un numéro de carte, même de test. Tout le reste est testé et marche (port de 15 € pour la Belgique bien facturé, pièce réservée mais pas décomptée avant paiement, annulation = pièce de nouveau en vente, mails corrects).
1. Dis à Claude : « prépare le test de paiement ». Il publie une pièce fictive et te donne un lien Stripe (valable 30 minutes).
2. Ouvre le lien. Carte `4242 4242 4242 4242`, date future, CVC 123, pays Belgique ou France.
3. Après le paiement, dis « c'est payé » : Claude vérifie le stock (0 = Sold out), les deux mails, puis supprime la pièce.
Si Stripe refuse quelque chose, il n'y a aucune case à cocher : la clé a déjà toutes les permissions nécessaires (testé).

---

## D. « Proposer un projet » (pièces sur demande) : 3 choses à faire

### D1. Activer R2 (stockage des photos / vidéos des demandes), 5 minutes
Gratuit jusqu'à 10 Go stockés par mois (+ 1 million d'envois et 10 millions de lectures par mois). Une demande pèse au plus ~130 Mo, et les fichiers s'effacent tout seuls 6 mois après la fin de la demande : tu resteras très loin de la limite. Cloudflare demande quand même une carte bancaire pour ouvrir R2.
1. Va sur **dash.cloudflare.com** (même compte que le Worker), menu de gauche **R2 Object Storage** (parfois rangé sous « Stockage et bases de données »).
2. Clique **Activer R2** / **Purchase R2** (offre gratuite), ajoute ta carte si on te la demande. Tu ne payes rien sous les limites gratuites.
3. **Create bucket** : nom **`vgthmind-demandes`** (exactement), **Location** : laisse « Automatic » **ou** choisis la juridiction **« European Union (EU) »** (mieux pour le RGPD). Note bien ce que tu as choisi.
4. Ne rends **rien public** : pas de « Public access », pas de domaine, pas de jeton d'API à créer. Le Worker y accède tout seul.
5. Dis-moi **« R2 activé, juridiction EU »** (ou « Automatic ») : j'active le stockage dans le Worker et je redéploie. Tant que ce n'est pas fait, le formulaire marche quand même, mais le client ne peut envoyer qu'un lien (WeTransfer, Drive) et tu ne peux pas ajouter les photos de la pièce finie.

### D2. Alerte de facturation Cloudflare (2 minutes)
Pour être prévenu si un jour tu dépasses la partie gratuite (il n'y a pas de plafond de dépense chez Cloudflare) :
1. dash.cloudflare.com → **Notifications** (menu du compte) → **Add** (Ajouter).
2. Choisis **« Usage Based Billing »** (facturation à l'usage). Produit : **R2** (fais-en une pour « Storage » et une pour « Class A Operations » si on te propose de choisir), seuil : par ex. **5 Go** pour le stockage, **500 000** pour les opérations.
3. Destinataire : contact@vgthmind.org → **Save**.
4. En plus (bonne habitude) : **Manage Account → Billing** : vérifie de temps en temps « Usage » ; tant que c'est 0,00 $, tout va bien.
Si les noms de menus ont changé, cherche « Notifications » puis « billing » : c'est le même réglage.

### D3. Valider mes propositions
- Les photos des cartes du parcours (liste dans le résumé de Claude) : tu peux les changer à tout moment dans Admin → Demandes → Réglages.
- La section **5 bis** de `chantier/CGV-PROPOSITION.html` (passages surlignés en jaune).
- Ensuite, test complet en mode test avec Claude : demande custom → devis → acompte (carte `4242 4242 4242 4242`, c'est toi qui la tapes) → photos → validation → solde → expédition.

---

## A. Détourage depuis l'iPhone (tunnel Cloudflare)

Testé de bout en bout sur ce PC : le tunnel démarre, le détourage aboutit par l'adresse Cloudflare avec le mot de passe, et il est refusé sans le mot de passe.
Gratuit, sans carte bancaire, sans compte.

**Sur le PC :**
1. Ouvre le dossier `vgthmind-shop`, puis `detourage-server`.
2. Double-clique sur **`Lancer-detourage-iphone.bat`** (le programme de Cloudflare, `cloudflared.exe`, est déjà téléchargé).
3. Au bout de quelques secondes, le message **« PRÊT »** s'affiche et une page **« Détourage iPhone prêt »** s'ouvre avec un long lien. Il est **déjà copié**.
4. **Laisse la fenêtre noire ouverte** tant que tu travailles sur l'iPhone. La fermer arrête tout.
   - Si Windows demande une autorisation (pare-feu) : **Autoriser**.

**Sur l'iPhone :**
1. Envoie-toi le lien (Messages à toi-même, Notes, AirDrop ou e-mail).
2. Ouvre-le **dans Safari**. Le studio « Nouvelle pièce » s'ouvre ; le lien se range tout seul dans l'iPhone.
3. Connecte-toi à GitHub comme d'habitude, ajoute tes photos : le détourage part vers ton PC (environ 10 à 30 secondes par photo).

**À savoir :**
- **À chaque lancement, l'adresse change** : renvoie le nouveau lien à l'iPhone (30 secondes). L'ancien lien ne marche plus.
- Le PC doit être **allumé, connecté à internet, avec la fenêtre noire ouverte**. Sinon le studio affiche « Le PC ne répond pas… ».
- **Ne partage jamais ce lien** : il contient le mot de passe de ton serveur de détourage. Si tu l'as envoyé par erreur :
  supprime le fichier `detourage-server\.token` (fichier caché : dans l'explorateur, onglet « Affichage » → « Éléments masqués »), puis relance le `.bat` : nouveau mot de passe, l'ancien lien est mort.
- Sur le PC, le détourage continue de marcher comme avant avec `Lancer-detourage.bat` (sans mot de passe, tout reste sur le PC).
- Une adresse fixe est possible mais demande un nom de domaine géré par Cloudflare (le tien est chez IONOS) : à voir plus tard, rien à faire maintenant.

---

## B. Test conseillé du panier avec le choix du pays (5 minutes)

Le panier propose maintenant « Pays de livraison » : le client choisit son pays **avant** de payer, le prix de livraison s'affiche pour ce pays,
et l'adresse demandée sur la page de paiement est limitée à ce pays.

1. Dans le studio, crée une pièce fictive (prix 10 €, poids 800 g, mode « Colis ») et publie-la. Attends 1 à 2 minutes que le site se reconstruise.
2. Sur le site, ajoute-la au panier et ouvre le panier. Choisis tour à tour **France** (livraison offerte), **Belgique** (15 €), **Allemagne** (15 €), **Canada** (29 €), **Russie** (refusée, bouton bloqué).
3. Mets une **ancienne pièce** dans le panier : ses frais restent ceux d'avant (par exemple 5 € en France, 25 € ailleurs pour ch_0002).
4. Le paiement lui-même est toujours bloqué tant que le site est en mode test avec une clé « live » (message « Paiement en mode test uniquement ») : c'est le réglage actuel, ne change rien.
5. Archive/supprime la pièce fictive depuis la page « Pièces » (ou demande-le à Claude).

---

## C. Rien à faire, mais bon à savoir : brouillon automatique

Le studio sauvegarde sur l'appareil les photos ajoutées, la vidéo et la fiche en cours. Si tu quittes la page (ou si Safari la recharge),
un bandeau **« Brouillon retrouvé »** propose **Reprendre** ou **Effacer**. Les photos sont de nouveau détourées à la reprise.
Le brouillon est effacé après une publication réussie, ou au bout de 14 jours.

---

## À vérifier de ton côté
- La boîte **contact@vgthmind.org** existe et tu la lis : les réponses des clients aux mails de commande y arrivent maintenant (avant : ton adresse Gmail). Si elle n'existe pas encore, dis-le-moi pour revenir en arrière.
- Le brouillon des CGV (`rapports-nuit/brouillons/cgv.html`) donne encore l'adresse Gmail pour la rétractation : à harmoniser quand tu valides les CGV.
- Admin « Expédition » : nouveaux réglages « Lettre suivie proposée ? » et « pays acceptés » (France seule pour l'instant, comme avant).

## Ce qui reste de ton côté (inchangé)
Liens Instagram manquants, médiateur, adresse, CGV, TVA, passage Stripe live, DNS IONOS : voir `ETAT.md`.
