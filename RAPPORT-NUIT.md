# Rapport de la nuit — 12 → 13 octobre 2026 (2e nuit)

Les mots techniques sont expliqués entre parenthèses. **Rien n'a été poussé sur `main`, rien n'a été déployé** (ni site, ni Worker = le petit serveur de paiement chez Cloudflare). Tout est sur la branche `claude/keen-hypatia-ikrv7l` ; la bascule du domaine est sur la branche `bascule-prete`. Depuis mon environnement, les adresses `pages.dev`, `workers.dev` et `vgthmind.org` sont bloquées (403) : je ne peux donc ni voir le site en ligne, ni vérifier un déploiement, ni parler à Stripe. Tout a été essayé sur une copie locale (navigateur Chromium simulant un PC et un iPhone 13) avec un faux serveur de paiement.

## 1. En ligne ou pas
- **En ligne : rien de nouveau.** Version en ligne = celle d'avant (Worker `cf99b2d4`, retour arrière documenté dans ETAT.md).
- **Prêt, attend ton OK** : tout ce qui suit. Pour le mettre en ligne : « déploie la branche de la nuit ».

## 2. Audit page par page (PC et iPhone, FR et EN)
49 pages × 4 profils (PC/iPhone × FR/EN) ouvertes par un robot : accueil, boutique, 7 catégories, 27 fiches, panier, paiement (faux Stripe), merci / annulé, suivi, contact, « Proposer un projet », studio, mentions / confidentialité / CGV-livraison-retours, 404, recherche, 16 pages de l'admin. Vérifié : erreurs de script, images cassées, images sans texte alternatif, liens morts (138 liens internes), défilement horizontal, titres vides. **Résultat : propre.** Trouvé et corrigé :
- **Recherche** : en mode français, « SEARCH », « 7 RESULTS », « SEE ALL », « ONE OF A KIND », « navigate / open / close » restaient en anglais → traduits (« Rechercher », « 7 résultats », « Tout voir », « Pièce unique », « naviguer / ouvrir / fermer »).
- **Panier** : un texte « France only / livraison en France uniquement » affichait les deux langues à la fois → une seule, dans la langue du site.
- **Pastille « Ajouté au panier »** : repli en français même en mode anglais → corrigé.
- **Page 404** : les deux langues s'affichaient en même temps → une seule.
- **Page Infos** : disait « Livraison via Colissimo » alors que les petites pièces partent en lettre suivie → « via La Poste (Colissimo, ou lettre suivie pour les petites pièces en France) ».
- **Risque de perte de données (éditeur complet « Modifier une fiche »)** : sa configuration ne déclarait pas 5 champs présents sur toutes les pièces (pièce unique, couleur, reel…) ni « aperçu / programmée » : selon la version de l'éditeur, enregistrer une fiche aurait pu les effacer. Je les ai déclarés (cachés) + un test qui échoue si un champ manque à l'avenir. **À vérifier une fois sur ton iPhone** (A-FAIRE §9).
- Mails de commande (FR/EN, client, vendeur, expédiée) relus : corrects (montants, pays, droit de rétractation, lien de suivi dans la langue).

## 3. Admin complet (équivalent BigCartel et plus) : état
Déjà là et gardé (vérifié, ouvert sur iPhone sans erreur ni débordement) : nouvelle pièce avec badge « Pièce unique », pastilles couleur, reel, détourage ; quantités (0 = Sold out, permanent : le stock vit dans le Worker, aucun jeton à renouveler) ; statuts En ligne / Aperçu (= masquée) / Programmée / Archivée ; mise en ligne programmée à 18 h ; frais d'envoi calculés (poids emballé + Colissimo ou lettre suivie, tous les pays, panier de plusieurs pièces) ; lien direct vers ta Comptabilité et ta Facturation ; trafic en direct (sans cookie, ni identifiant, ignore « Ne pas me suivre » et tes propres visites) ; commandes, factures, demandes de projet, vidéos d'ouverture, sauvegardes.
**Ajouté cette nuit** :
- **Statut « Bientôt disponible »** (comme BigCartel) : la pièce est visible et listée avec « Coming soon / Bientôt disponible », sans bouton d'achat ; le serveur de paiement la refuse même si quelqu'un force la commande. Boutons « Marquer bientôt disponible » / « Ouvrir à la vente » dans Admin → Catalogue.
- **Codes promo** : nouvelle page Admin → **Codes promo** : créer un code (% ou €, nombre d'utilisations, panier minimum, date de fin, première commande), le désactiver, voir combien de fois il a servi. Les codes vivent dans Stripe ; le champ « code promotionnel » est déjà actif au paiement. Testé avec un faux Stripe (création, liste, désactivation, erreurs, annulation du coupon si le code est refusé). Il faudra ajouter deux droits à ta clé Stripe restreinte (Écriture « Coupons » et « Promotion Codes ») : sans eux, la page affiche un message clair.
- **État du système** : montre maintenant si Resend, l'alerte mail, le Deploy Hook (drops), la compta et le stockage R2 sont bien posés : tu colles un secret, tu rouvres la page, la ligne passe à « OK ».
- Mode d'emploi (aide.html) : section « statuts d'une pièce ».
- **Version admin à voir en bas à gauche : `Admin v2026-10-13-d`.**

## 4. Bascule du domaine (adresses identiques, rien ne casse)
- **Même structure d'adresses que BigCartel** (`/product/…`, `/category/…`, `/products`, `/cart`, `/contact`) : un test automatique construit le site « à la racine » et vérifie toutes les pièces du catalogue, les 7 catégories, l'absence de `/shop`, le sitemap en `www`, la balise canonical, l'ouverture aux moteurs de recherche (et que suivi/demandes restent cachés). Ton lien Instagram ne casse donc pas. Seul `/products.xml` (flux BigCartel) disparaît.
- **Branche `bascule-prete`** : le site devient public sur `www.vgthmind.org` (3 lignes changées), jamais fusionnée sans toi.
- **`chantier/BASCULE-JOUR-J.md`** : le plan pas à pas, à jour pour Cloudflare Pages (l'ancien plan parlait de GitHub Pages) : 2 clics côté Cloudflare, 1 ligne chez IONOS, le reste c'est moi ; retour d'urgence en 1 clic.
- **`outils/verifier-site.mjs`** : contrôle automatique après bascule (toutes les anciennes adresses, robots, sitemap, adresse sans « www » qui garde le chemin, et que le serveur de paiement accepte le domaine).
- Point à surveiller : les liens des mails (suivi, CGV) utilisent encore l'ancienne adresse `vgthmind.github.io/shop` tant que la bascule n'est pas faite (la branche de bascule corrige ça). Aucune vraie commande n'est concernée puisque le paiement est en mode test.

## 5. Tests
**218 tests passent, 0 échec, 9 sautés.** Nouveaux : bascule à la racine (3), codes promo (5), « bientôt disponible » (2 + paiement refusé), champs de l'éditeur, traductions de la recherche. Les 9 sautés = tests du serveur de détourage : ils échouaient depuis le début ici parce que sa bibliothèque (`onnxruntime-node`) n'est pas installée dans mon environnement (pas sur ton PC) ; ils se lancent tout seuls dès qu'elle est présente. Détourage, vidéos d'ouverture, paiement test et recherche de pays du panier : non touchés (relancés avec succès).

## 6. Pas pu faire seul / pourquoi
- **Paiement réel Stripe (test 4242, live)** : il faut ta carte et tes secrets, et je ne peux pas atteindre Stripe d'ici.
- **Compta, drops 18 h, Stripe live** : il me manque tes secrets (la liste exacte et les clics sont dans A-FAIRE.md ; tout le code est prêt).
- **Texte juridique** : TVA (CIBS / 293 B), médiateur, adresse de l'émetteur sur les factures, adresse de retour : décisions à toi (je n'ai rien inventé).
- **Tarif lettre suivie à l'international** : la lettre suivie reste proposée en France seulement (réglage « pays acceptés » de l'admin Expédition) ; Colissimo couvre tous les pays.
- **Serveur de détourage hébergé (Hugging Face)** : abandonné comme demandé, rien n'en a été poussé ; le détourage reste sur PC + tunnel iPhone.
- Une branche de plus (`bascule-prete`) et celle de la nuit peuvent générer des « aperçus » Cloudflare Pages (adresses de test non publiques) : sans conséquence.

## 7. Ce qui attend ton OK
1. « déploie la branche de la nuit » (site + Worker). 2. Textes juridiques (A-FAIRE §8). 3. « fusionne la bascule » (jour J, après Stripe live + test avec ta vraie carte).

## 8. Choix prudents pris sans te demander
Texte de livraison reformulé de façon factuelle ; pas touché aux mentions légales ni aux factures ; aucun changement de prix, de port, de stock, de commande ou de paiement (hors refus des pièces « bientôt disponibles ») ; rien sur `main` ; une « fausse » reconstruction accidentelle du dossier `docs/` en mode racine au début de la nuit a été refaite en mode normal (aucune trace dans les commits).

Rapport de la nuit précédente : `rapports-nuit/2026-10-12-au-13.md`.

## Complément (après ta demande « en attendant »)
- **`/products.xml`** : le dépôt ne montre aucun usage réel (ni catalogue Instagram/Facebook, ni Google Merchant) ; la seule trace est le lien « Product Feed » que BigCartel ajoute tout seul dans ses pages. Je n'ai pas accès à tes comptes Meta / Google : **à vérifier chez toi** (Meta Commerce Manager → Catalogue → Sources de données ; Google Merchant Center → Produits → Flux). Par prudence, le nouveau site génère le même `/products.xml` (flux RSS Google Merchant, lu aussi par Meta) : adresse inchangée, test automatique ajouté. Limite : la disponibilité du flux est celle du catalogue publié (le stock en direct reste dans le Worker).
- **Textes juridiques** : brouillons avec options (médiateur, adresse de retour, mention TVA) dans `chantier/TEXTES-JURIDIQUES-BROUILLON.md`. Rien appliqué, rien décidé. Je n'ai pas pu vérifier les listes officielles de médiateurs ni la date du CIBS : indiqué dans le fichier.
- **Checklist** des deux tests (paiement 4242, éditeur « Modifier une fiche » sur iPhone) : `chantier/CHECKLIST-TESTS.md`.
- **Détourage** : `onnxruntime-node` installé (1er essai en échec à cause du téléchargement d'une option GPU inutile, 2e essai avec `--ignore-scripts` réussi) : **les 9 tests du détourage passent** (dossier `node_modules` non versionné, lockfile remis tel quel). Rien du détourage n'a été modifié.
- Tout est sur la branche de la nuit ; `bascule-prete` n'est pas touchée (elle recevra ce complément à la fusion). Rien en ligne, rien fusionné.
