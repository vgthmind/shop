# Rapport de la nuit du 12 octobre 2026 (mis à jour le matin, avec tes décisions)

**Branche à fusionner si tu valides : `nuit-2026-10-12`** (dans le dépôt `vgthmind/shop`, et la même branche dans `vgthmind-chantier` pour la doc).
Rien n'est sur `main`, rien n'est déployé, rien n'est publié. Stripe reste en mode test.

---

## 👉 Ce que tu dois faire toi-même, dans cet ordre

1. **Lire ce rapport**, puis dire à Claude : « fusionne la branche `nuit-2026-10-12` dans `main` dans les deux dépôts ».
2. **Créer ton jeton GitHub** et le coller dans l'admin : suis `rapports-nuit/GUIDE-JETON-GITHUB.md` (5 min, iPhone ou PC). Sans lui, l'admin ne peut plus enregistrer.
3. **Redéployer le Worker** : sur ton PC, récupère la dernière version du dossier `vgthmind-shop`, double-clique sur `checkout-worker\Deployer-worker.bat`, attends « Deployed », puis ouvre `https://vgthmind-shop-checkout.vgthm66.workers.dev/status` : tout doit être « OK ».
4. **Fermer l'ancienne porte GitHub** : étape 3 du guide du jeton (révoquer l'ancienne autorisation).
5. **Supprimer l'ancien secret `GITHUB_TOKEN`** s'il apparaît encore dans `/status` (commande dans `rapports-nuit/securite-2026-10-12.md`).
6. **Faire les tests** de la partie « 🧪 À tester par toi » ci-dessous.
7. Plus tard, avant vgthmind.org : **choisir un médiateur** et **ajouter ton nom** dans les mentions légales (rappel écrit dans `chantier/JOUR-J.md`).

---

## ✅ Fait et testé

**Ce matin (tes décisions)**
- **Pages légales** : j'ai gardé « vgthmind », Vitry-sur-Seine et ton SIRET. Aucun prénom, nom, adresse ni téléphone. J'ai mis les valeurs standard d'un vendeur en ligne en France :
  - préparation 5 jours ouvrés maximum, puis 2 à 4 jours en France, 3 à 8 jours en Europe, 5 à 15 jours ailleurs ; livraison au plus tard 30 jours après la commande ;
  - droit de rétractation de 14 jours ; **frais de retour à la charge du client** ;
  - l'adresse de retour est envoyée par mail quand le client se rétracte (aucune adresse publiée) ;
  - données des clients gardées 3 ans après la dernière commande, messages 3 ans.
  - Chaque choix est noté en commentaire dans le code des pages.
  - **Seul « À REMPLIR » restant : le médiateur de la consommation** (dans les CGV, en anglais et en français).
  - Rappel ajouté dans `chantier/JOUR-J.md` : « Mentions légales : nom obligatoire en auto-entrepreneur + choisir un médiateur de la consommation ».
- **Anciennes pièces** : toutes les 27 passent sur la grille de port (CH_0002 compris). Elles avaient toutes un poids. Nouveau tableau, vérifié sur le vrai code du serveur :

  | Envoi | France | Belgique | Allemagne | Canada | États-Unis | Russie |
  |---|---|---|---|---|---|---|
  | Vêtement (CH_0002, pantalons, shorts…) | offert | 15 € | 15 € | 29 € | 29 € | refusé |
  | Petite pièce plate (CD VGTAPE, cache-cou) | 4 € | 15 € | 15 € | 29 € | 29 € | refusé |
  | Sacoche, SC_0008 | offert | France seulement | France seulement | France seulement | France seulement | France seulement |

  Attention : beaucoup de poids sont encore « estimés » (550 g par défaut). Un poids faux peut donner un mauvais prix de port quand plusieurs pièces partent ensemble.
- **Mail « expédiée »** : reste automatique au clic sur « Marquer expédiée ».
- **Tuile de catégorie sur l'accueil** : reste à la demande.
- **Tutoiement partout sur le site et dans les mails** : c'était déjà presque le cas. Corrigé le titre du formulaire de rétractation dans le mail, et un « Zoomez » dans le studio photo. Le vouvoiement reste seulement dans les CGV, les mentions légales, la confidentialité et la page Livraison & retours.
- **Optimisations visuelles** (comparées avant/après sur PC et iPhone, aucune différence visible, donc toutes gardées) :
  - le gros bloc de style est maintenant un fichier gardé en mémoire par le navigateur : environ 10 Ko de moins à télécharger par page (50 Ko avant compression) à partir de la 2e page vue ;
  - icône d'onglet : 125 Ko → 48 Ko (identique à l'œil à toutes les tailles d'onglet) ;
  - photo d'accueil : 22 % plus légère (572 → 449 Ko sur iPhone), grain identique à l'œil.
- **Jeton GitHub de l'admin limité à la boutique** :
  - Catalogue, Poids & ports et Nouvelle pièce demandent, une fois par appareil, un jeton que tu crées toi-même et qui n'ouvre **que** le dépôt de la boutique ;
  - un jeton « classique » (qui ouvre tous tes dépôts) est refusé avec un message clair ;
  - la connexion « Se connecter avec GitHub » ne donne plus aucun droit d'écriture : elle sert seulement à prouver que c'est toi (pour le stock et les commandes) ;
  - bouton **« Oublier le jeton sur cet appareil »** dans le Tableau de bord ;
  - guide clic par clic : `rapports-nuit/GUIDE-JETON-GITHUB.md`. Il est aussi lié depuis l'admin.
- **Mises à jour de bibliothèques** (une par une, tests après chacune) :
  - ✅ `sharp` (fabrique les tailles de photos) : 0.34 → 0.35. Les photos produites sont identiques au pixel près.
  - ✅ `wrangler` (sert à déployer le Worker) : 3 → 4. Essai de déploiement « à blanc » réussi, sans avertissement.
  - ❌ Moteur de détourage (`onnxruntime`) : **pas fait**. Impossible de télécharger le modèle de détourage depuis ce serveur pour vérifier qu'un vrai détourage donne le même résultat.
  - ❌ `sharp` dans le serveur de détourage : **annulé**. Ton lanceur n'installe les bibliothèques qu'une fois, donc la mise à jour ne serait jamais arrivée sur ton PC, et elle demande une version de Node plus récente.
- **Tests** : **184 tests automatiques, tous OK** (ceux du serveur de détourage marchent maintenant ici aussi).
- **iPhone** : chaque page du site et de l'admin vérifiée sur iPhone 13 et iPhone SE (le plus petit écran) : voir le résultat en bas de cette partie.

**Cette nuit (déjà dans le rapport précédent)**
- **Admin** : page Catalogue (pièces, prix, taille, statut Publiée / Brouillon / Masquée / Archivée, dupliquer, actions groupées, ordre, catégories, « Annuler cet enregistrement »), Tableau de bord, Studio « Nouvelle pièce » (taille, brouillon), Commandes (payée / expédiée, lien La Poste, mail automatique), Trafic en temps réel (actif au prochain déploiement), Sold out.
- **Boutique** : pages légales complètes + page « Livraison & retours », mails FR/EN (confirmation avec formulaire de rétractation, expédition avec suivi), anciennes adresses BigCartel `/product/<pièce>`, images de partage Instagram / WhatsApp, passage à vgthmind.org prêt (un seul réglage).
- **Lien de suivi** : `https://www.laposte.fr/outils/suivre-vos-envois?code=<numéro>`.
- **Checklist « Jour J »** : `vgthmind-chantier/chantier/JOUR-J.md`.

**Vérification iPhone (débordement en largeur)** : les 85 pages (boutique, fiches, catégories, panier, pages légales, toutes les pages admin) testées sur iPhone 13 et iPhone SE : **aucune ne dépasse**.

---

## 🔒 Sécurité

Le détail est dans `rapports-nuit/securite-2026-10-12.md`.

**Corrigé ce matin**
- Le jeton GitHub de l'admin ne peut plus toucher à tes autres projets (portfolio compris). Avant, il pouvait écrire dans tous tes dépôts publics.
- Le serveur de paiement n'envoie plus jamais de jeton GitHub au navigateur.

**Déjà bien fait (cette nuit)** : prix, port et stock recalculés par le serveur ; pas de double vente ; messages Stripe vérifiés ; routes admin protégées ; sessions de 7 jours ; déconnexion après 12 h sans activité ; photos contrôlées ; aucun mot de passe ni clé dans le code ou l'historique.

**Reste à faire, du plus urgent au moins urgent**
1. **Redéployer le Worker** (toi, 5 min) : sans ça, aucune correction côté serveur n'est active.
2. **Révoquer l'ancienne autorisation GitHub** (toi, 2 min) : étape 3 du guide du jeton.
3. **Supprimer l'ancien secret `GITHUB_TOKEN`** s'il apparaît encore dans `/status` (toi, 2 min).
4. **Si un appareil est perdu ou volé** : supprimer son jeton sur GitHub (fin du guide), changer `SESSION_SECRET` (procédure dans le rapport sécurité).
5. **Limiter les abus** sur les pages publiques du Worker (limitation Cloudflare). À faire par une session Claude.

---

## ⚡ Optimisation

- **Fait ce matin** : style en fichier gardé en mémoire, icône d'onglet allégée, photo d'accueil allégée (détails plus haut). Aucune différence à l'œil sur PC ni sur iPhone.
- **Fait cette nuit** : carrousel chargé seulement là où il sert, scripts du panier seulement sur le panier, logo partagé, moins de recalculs au défilement, code mort retiré, fichiers inutiles déplacés dans `_a_supprimer/` (rien d'effacé).
- **Reste possible** : mettre en pause les particules de l'accueil quand on a défilé plus bas (côté thème, chantier BigCartel).

---

## 🧪 À tester par toi (clic par clic)

**0. Mettre en ligne** : étapes 1 à 5 de « Ce que tu dois faire » tout en haut.

**1. Jeton GitHub (iPhone, puis PC)**
1. Ouvre `https://vgthmind.github.io/shop/admin/catalogue.html` → « Se connecter avec GitHub ».
2. La fenêtre « Jeton GitHub de la boutique » apparaît : colle ton jeton → Valider. Le catalogue se charge.
3. Change le prix d'une pièce → Enregistrer → « Enregistré ✓ » → puis « Annuler cet enregistrement ».
4. Ferme l'onglet, rouvre la page : il ne te redemande pas le jeton.
5. Tableau de bord → « Oublier le jeton sur cet appareil » → rouvre le Catalogue : il te le redemande. Recolle-le.
6. Éditeur avancé (Sveltia) → « Sign In Using Access Token » → colle le jeton : la liste des pièces s'affiche.

**2. Frais d'envoi**
- Ajoute CH_0002 au panier → choisis France (offert), Belgique (15 €), Canada (29 €). Compare avec le tableau plus haut.
- Ajoute la sacoche et choisis la Belgique : un message dit qu'elle part uniquement en France.

**3. Pages légales**
- Pied de page → « Livraison & retours », « Mentions légales », « Confidentialité », « Info & Terms » : relis les délais et les valeurs choisies. Dis-moi si tu veux en changer une.

**4. Visuel** (après la mise en ligne)
- Ouvre l'accueil, puis Products, puis une fiche : tout doit être exactement comme avant (couleurs, polices, transitions). L'icône dans l'onglet doit être la même.

**5. Commande et mails** (comme dans le rapport de la nuit)
1. Achète une pièce de test (carte `4242 4242 4242 4242`, date future, code au hasard).
2. Vérifie le mail de confirmation (il te tutoie, avec le formulaire de rétractation).
3. Admin → Commandes → « Marquer expédiée » → faux numéro `6A12345678901` → le mail « expédiée » arrive avec le bouton de suivi.

**6. Catalogue, Trafic, Partage** : tests 1, 4 et 6 du rapport de la nuit (toujours valables).

---

## ❓ Questions / décisions à valider

1. **Valeurs légales choisies** (délais, retour à la charge du client, 3 ans de conservation) : elles te vont ? Une relecture par un juriste reste conseillée, surtout pour l'exception « sur-mesure ».
2. **Médiateur de la consommation** : à choisir avant vgthmind.org (obligatoire, payant). Dis-moi lequel et je l'ajoute.
3. **Poids des anciennes pièces** : beaucoup sont « estimés ». Tu veux les peser et les corriger dans Poids & ports ? (Important maintenant qu'elles sont toutes sur la grille.)
4. **Moteur de détourage** : on garde la version actuelle (elle marche). Une mise à jour ne se fera que sur ton PC, avec un essai sur une vraie photo. On la fait un jour ?
5. **Brouillon** (rappel) : une pièce remise en brouillon avec du stock reste achetable par son lien direct. Mets son stock à 0 en même temps (bouton Sold out).
