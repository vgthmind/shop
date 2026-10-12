# Rapport de la nuit du 12 octobre 2026

**Branche à fusionner si tu valides : `nuit-2026-10-12`** (dans le dépôt `vgthmind/shop`, et la même branche dans `vgthmind-chantier` pour la doc).
Rien n'est sur `main`, rien n'est déployé, rien n'est publié. Stripe reste en mode test.

---

## ✅ Fait et testé

**Admin**
- **Page « Catalogue »** (nouvelle, la plus simple, marche sur iPhone) : toutes les pièces avec photo, prix, stock (Sold out en rouge) et statut. Recherche et filtres (catégorie, stock, pièce unique, statut). Toucher une pièce ouvre sa fiche : nom, prix, **taille**, description, catégories, Latest Drop, badge UNIQUE PIECE, pastille couleur, reel, **ordre des photos** (glisser, ou ← → sur téléphone), stock.
  - Statuts : Publiée / **Brouillon** (visible seulement par son lien, pour l'aperçu, jamais achetable) / Masquée / Archivée.
  - **Dupliquer** une pièce, **actions groupées** (publier, masquer, brouillon, catégorie +/−, Sold out, archiver), **réordonner** la boutique, **catégories** (créer, renommer, réordonner).
  - Les modifications sont **gardées sur l'appareil** jusqu'à « Enregistrer », avec une confirmation avant chaque action définitive et un bouton **« Annuler cet enregistrement »**.
  - Testé : 9 tests automatiques, et la page entière dans un vrai navigateur (iPhone et PC).
- **Tableau de bord** de l'admin : toutes les pages, Stripe, les statistiques Cloudflare, le suivi La Poste, et tes liens **Comptabilité / Facturier** (à coller une fois, gardés sur l'appareil).
- **Studio « Nouvelle pièce »** : champ **Taille**, option **« Publier en brouillon »**, plus de débordement sur iPhone.
- **Commandes** : statut « payée » / « expédiée », numéro de suivi transformé en **lien La Poste cliquable**, **mail « expédiée » envoyé tout seul** quand tu marques la commande expédiée.
- **Trafic en temps réel** : branché (balise sans cookie et compteur « visiteurs en ce moment »). Il s'active au prochain déploiement du Worker.
- **Sold out** : stock à 0 → « Sold out » et bouton d'achat caché, vérifié dans le navigateur.

**Boutique**
- **Pages légales** : mentions légales, CGV (rétractation 14 jours, exception pour les pièces sur-mesure ou personnalisées, garanties, médiateur, droit applicable), confidentialité, et **nouvelle page « Livraison & retours »** (délais, douane, retours, remboursement, formulaire de rétractation). Liens en pied de page. Contact : **contact@vgthmind.org**. Tout ce que je ne pouvais pas savoir est marqué **« À REMPLIR »**.
- **Mails** (FR/EN) : confirmation de commande avec la rétractation détaillée et le formulaire, et mail d'expédition avec numéro et lien de suivi. Expéditeur commande@vgthmind.org, réponses vers contact@vgthmind.org.
- **Anciennes adresses** : `/product/<pièce>` (celle de BigCartel) marche, et `/products/<pièce>` renvoie vers la fiche.
- **Partage Instagram / WhatsApp** : une image propre par pièce (fond beige, bon format, ~45 Ko).
- **Domaine vgthmind.org** : le jour J, un seul réglage suffit (`site_url`). Le site se met à la racine et le fichier de domaine (CNAME) est créé tout seul. Simulé avec succès.
- **Frais d'envoi** : la grille de l'admin reste la seule source (aucune API La Poste). Un emplacement est prévu pour brancher une API plus tard.

**Vérifications faites**
- 170 tests automatiques passent. Les 9 qui échouent sont ceux du serveur de détourage : il ne peut pas tourner sur ce serveur, mais il marche sur ton PC.
- **Frais d'envoi** calculés sur le vrai catalogue (Worker inaccessible d'ici, test fait sur son code) :

  | Envoi | France | Belgique | Allemagne | Canada | États-Unis | Russie |
  |---|---|---|---|---|---|---|
  | Pièce du studio de 800 g | offert | 15 € | 15 € | 29 € | 29 € | refusé |
  | CH_0002 (ancien port fixe, gardé) | 5 € | 25 € | 25 € | 25 € | 25 € | refusé |

- **Lien de suivi** : `https://www.laposte.fr/outils/suivre-vos-envois?code=<numéro>`, testé dans la page Commandes et dans le mail.
- **Mobile (iPhone)** : aucune page ne dépasse en largeur. Testé : boutique, fiche, panier avec choix du pays, pages légales, et toutes les pages admin.

**Checklist « Jour J »** : `vgthmind-chantier/chantier/JOUR-J.md`. Toutes les étapes pour passer de BigCartel à vgthmind.org (IONOS, Stripe en réel, mails, vérifications, retour arrière), à viser début mars 2027.

---

## 🔒 Sécurité

Le détail complet est dans `rapports-nuit/securite-2026-10-12.md`.

**Déjà bien fait**
- Prix, frais d'envoi et stock sont recalculés par le serveur : un client ne peut rien trafiquer.
- Une pièce à 0 en stock ne peut pas être commandée, et pas de double vente.
- Les messages de Stripe sont vérifiés.
- Toutes les routes admin exigent une connexion.
- Aucune donnée client dans le dépôt.

**Corrigé cette nuit**
- Serveur de paiement : en-têtes de sécurité, sessions admin de 7 jours au lieu de 30, connexion GitHub mieux protégée, vérification Stripe plus stricte, pièce à 0 € refusée, 3 paiements en cours au maximum par visiteur (impossible de bloquer toutes les pièces), requêtes trop grosses refusées, adresse IP plus jamais stockée.
- Admin : déconnexion automatique après 12 h sans activité, protection contre l'affichage dans un autre site, règles de sécurité (CSP) sur les pages admin, contrôle d'intégrité du script Sveltia.
- Photos : seulement des images (pas de SVG piégé), avec une taille maximale, et seulement des vraies vidéos MP4 pour les reels. Le serveur de détourage n'accepte plus que des JPEG, PNG et WebP.
- **Mots de passe et clés : aucun** dans le code ni dans tout l'historique. Rien à régénérer.

**Reste à faire, du plus urgent au moins urgent**
1. **Redéployer le Worker** (toi, 5 min) : sans ça, aucune correction côté serveur, ni le mail automatique, ni le trafic ne sont actifs. Étapes dans « À tester » ci-dessous.
2. **Supprimer l'ancien secret `GITHUB_TOKEN`** s'il apparaît encore dans `/status` (toi, 2 min ; commande dans le rapport sécurité).
3. **Si un appareil est perdu ou volé** : changer `SESSION_SECRET` et révoquer l'application GitHub (procédure dans le rapport, à garder sous la main).
4. **Jeton GitHub de l'admin** : il peut écrire dans tous tes dépôts publics. C'est une décision à prendre plus tard (expliquée dans le rapport).
5. **Limiter les abus** sur les pages publiques du Worker (limitation Cloudflare). À faire par une session Claude.
6. **Mises à jour de bibliothèques** (`sharp`, `wrangler`, moteur de détourage) : elles ne sont pas « sans risque », donc pas faites. À faire par une session Claude avec une vérification visuelle.
7. **Durées de conservation** des données clients : à remplir dans la page Confidentialité.

---

## ⚡ Optimisation

**Nettoyé ou allégé, sans aucun changement visuel** (captures PC + iPhone de 8 pages comparées avant/après : identiques au pixel près)
- Le carrousel (Splide, 30 Ko) n'est chargé que sur l'accueil et les fiches.
- Les scripts de livraison et le style du panier ne sont chargés que sur le panier et ses pages.
- Le logo du splash et de la transition est le même fichier que celui de l'en-tête : 105 Ko de moins au premier clic.
- Panier : l'écouteur du changement de pays ne se démultiplie plus. Avant, chaque changement de pays doublait le travail.
- Défilement : moins de recalculs à chaque mouvement.
- Commentaires répétés dans chaque page retirés, et fichiers de test plus publiés.
- Code mort retiré : une fonction du Worker et une constante en double.
- Fichiers inutiles **déplacés dans `_a_supprimer/`** (rien n'est effacé, liste dans `_a_supprimer/LISEZMOI.md`) : `assets/theme/bc/cover.png` (988 Ko, jamais utilisé), `assets/theme/bc/logo-illustration.png` (doublon exact du logo), `data/products.json` (fiche d'exemple du 1er prototype).
- Essayé puis abandonné : convertir les grandes photos PNG en WebP sans perte. Le gain n'est que de 0,6 % (34,4 → 34,2 Mo) et les fichiers ne sont pas identiques à l'octet. Pas la peine.

**Améliorations proposées, à valider à l'œil (non faites)**
- Mettre le gros bloc de style (Custom CSS, ~64 Ko dans chaque page) dans un fichier gardé en cache : environ 10 Ko de moins par page à partir de la 2e page vue. Petit risque sur les transitions, donc à vérifier en vidéo.
- Alléger l'icône d'onglet (`favicon.svg`, 125 Ko) : à vérifier dans l'onglet.
- Photo d'accueil un peu plus compressée (−25 à −35 %), avec une légère perte de qualité.
- Les particules de l'accueil continuent de tourner quand on a défilé plus bas. Les mettre en pause hors écran se règle côté thème (chantier BigCartel).

---

## 🧪 À tester par toi (clic par clic)

**0. Mettre la nuit en ligne (une fois que tu valides)**
1. Dis à Claude : « fusionne la branche `nuit-2026-10-12` dans `main` dans les deux dépôts ».
2. Sur ton PC, ouvre le dossier `vgthmind-shop` et récupère la dernière version (comme d'habitude, ou demande à Claude la commande).
3. Double-clique sur `checkout-worker\Deployer-worker.bat` et attends « Deployed ».
4. Ouvre `https://vgthmind-shop-checkout.vgthm66.workers.dev/status` : tout doit être « OK ».
5. Attends 2 minutes que le site se reconstruise.

**1. Catalogue (sur iPhone et sur PC)**
1. Ouvre `https://vgthmind.github.io/shop/admin/tableau.html` → **Catalogue** → « Se connecter avec GitHub » (une seule fois).
2. Vérifie que tu vois toutes les pièces avec leur photo, leur prix et leur stock.
3. Touche une pièce → change son prix → « Terminé ». La barre en bas dit « 1 modification en attente ».
4. Clique **Enregistrer**. Le message « Enregistré ✓ » s'affiche.
5. Clique **Annuler cet enregistrement** : le prix revient comme avant.
6. Ouvre une pièce → **Dupliquer** → change le nom de la copie → Enregistrer. Attends 2 minutes → « Voir sur le site ↗ » : la page existe mais n'est pas achetable (brouillon).
7. Coche 2 pièces → « Masquer » → Enregistrer, puis remets-les en « Publier ».
8. « Catégories… » → crée une catégorie de test → Enregistrer. Elle apparaît dans le menu du site au bout de 2 minutes. Retire-la ensuite en lui enlevant ses pièces (ou demande à Claude).

**2. Commande et mails**
1. Achète une pièce de test (carte `4242 4242 4242 4242`, n'importe quelle date future et n'importe quel code).
2. Vérifie que le mail de confirmation arrive (en mode test Stripe, seulement sur une adresse de ton équipe Stripe) et qu'il contient le formulaire de rétractation. S'il n'arrive pas : le domaine vgthmind.org doit être vérifié dans Resend, et la clé Resend posée dans le Worker (voir `chantier/JOUR-J.md`, partie e-mails).
3. Admin → **Commandes** → « Marquer expédiée » → tape un faux numéro (ex. `6A12345678901`).
4. Vérifie que le message « mail envoyé » s'affiche, que le mail arrive avec le bouton de suivi, et que le numéro est un lien La Poste dans la page.

**3. Frais d'envoi**
- Panier → choisis tour à tour France, Belgique, Canada : compare avec le tableau plus haut.

**4. Trafic**
- Ouvre le site dans 2 onglets (sans être connecté à l'admin dans ce navigateur, sinon tes visites ne comptent pas, c'est voulu), puis Admin → **Trafic** : « visiteurs en ce moment » = 2.

**5. Pages légales**
- Pied de page → « Livraison & retours », « Mentions légales », « Confidentialité », et « Info & Terms » : relis-les et remplis (ou donne-moi) tout ce qui est « À REMPLIR ».

**6. Partage**
- Envoie-toi le lien d'une pièce sur WhatsApp : l'aperçu doit montrer la pièce sur fond beige. Note : il ne marchera vraiment qu'une fois le site public.

---

## ❓ Questions / décisions à valider

1. **Pages légales**, tout ce qui est « À REMPLIR » : nom et prénom légaux, adresse, téléphone, numéro RM, médiateur de la consommation (à choisir et à payer), délais de fabrication et de livraison, **frais de retour** (à ta charge ou à celle du client ?), durées de conservation. Une relecture par un juriste reste conseillée (surtout pour l'exception « sur-mesure »).
2. **Frais d'envoi des anciennes pièces** : elles gardent leur port fixe d'avant (ex. CH_0002 à 5 € en France, 25 € ailleurs). Veux-tu qu'elles passent toutes sur la grille de l'admin (France offerte, UE 15 €, monde 29 €) ?
3. **Mail « expédiée »** : il part maintenant tout seul quand tu marques une commande expédiée. Tu préfères qu'il te demande confirmation avant ?
4. **Nouvelle catégorie** : elle apparaît dans le menu, mais sa tuile sur l'accueil (photo, place) se fait à la demande. Ça te va ?
5. **Brouillon** : une pièce déjà vendue au moins une fois et remise en brouillon peut rester achetable par son lien direct si elle a encore du stock. Pour être sûr, mets son stock à 0 en même temps (bouton Sold out).
6. **Tutoiement ou vouvoiement** : les CGV vouvoient, les mails tutoient. On harmonise ?
7. **Optimisations visuelles** proposées ci-dessus (style en cache, icône d'onglet, photo d'accueil) : on les fait ?
8. **Jeton GitHub de l'admin** (point 4 de la sécurité) : on le restreint au seul dépôt de la boutique ? Ça demande de recréer la connexion d'une autre façon.

Prochaine étape conseillée : remplir les « À REMPLIR » et faire le test 0 → 2.
