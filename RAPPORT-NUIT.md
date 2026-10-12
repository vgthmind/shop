# Rapport de la nuit — 12 → 13 octobre 2026

Les mots techniques sont expliqués entre parenthèses. Tout ce qui suit est **prêt mais PAS en ligne** : voir « Pourquoi rien n'est déployé ».

## 1. Ce qui est en ligne
- **134cdee** (le correctif du pop de catégorie, poussé par toi sur `main`) : il est bien dans le dépôt. Le Worker (le petit serveur de paiement chez Cloudflare) n'est pas touché par ce commit, je ne l'ai donc pas redéployé : version actuelle inchangée (cf99b2d4, retour arrière possible : `npx wrangler@4 rollback 4e16e2f1-115e-4758-a696-2581a6a38198`).
- Rien d'autre : je n'ai rien poussé sur `main` cette nuit.

## 2. Pourquoi rien n'est déployé
Depuis l'environnement où je travaille, les adresses `vgthmind-shop.pages.dev` et `…workers.dev` sont **bloquées** (erreur 403) : je ne peux donc ni voir le site en ligne ni vérifier un déploiement après coup. Tu m'avais demandé de vérifier après chaque déploiement ; ne pouvant pas, j'ai pris l'option la plus prudente : tout est sur la branche `claude/keen-hypatia-ikrv7l` (dernier commit 8987277), prêt à être mis sur `main`. Quand tu veux : dis-moi « déploie la branche de la nuit » ; je la fusionne dans `main`, Cloudflare reconstruit, et on vérifie ensemble sur ton iPhone. Retour arrière du site : « annule le déploiement de la nuit » (je fais un `git revert`, c'est-à-dire un commit qui défait les changements).
Tous les essais ci-dessous ont été faits **sur une copie locale** du site (navigateur Chromium simulant un PC et un iPhone 13), avec un faux Worker.

## 3. Fait cette nuit (sur la branche, pas en ligne)
**Pop de catégorie / pièces vendues.** J'ai vérifié à l'écran (copie locale, stock simulé : seulement 3 pièces disponibles, 24 essais sur « Tout » et « Hauts »). Avec 134cdee seul : **18 essais sur 24 ont encore choisi une pièce vendue** quand la souris est déjà posée sur le bouton de catégorie au moment où la page s'ouvre (le choix est fait avant l'arrivée du stock). Correctif ajouté par-dessus 134cdee (commit 6980047) : le choix est revérifié au clic et au survol. Résultat : 0 pièce vendue sur 24, y compris sur « Tout ». Les pièces qui tournent autour de la pièce centrale ne peuvent plus être des pièces vendues non plus.
**Panier et fiche produit** (tes demandes 1) :
- Pièce unique déjà au panier + nouveau clic sur « Ajouter au panier » : message « Déjà dans ton panier (pièce unique). Voir le panier » (plus de redirection inutile). Même logique pour une petite série au maximum.
- Bouton « Retirer » : même style chromé que les autres boutons.
- Choix du pays : champ « Rechercher un pays » au-dessus de la liste (sans accent ni majuscule ; un seul résultat = choisi tout seul) et cadre bien visible tant que le pays n'est pas choisi.
- Photo du jean coupée : les photos du panier ne sont plus recadrées (la pièce entière est visible).
- **Frais de port Belgique / États-Unis** : dans la configuration du dépôt, ils sont **déjà différents** (Belgique 15 €, États-Unis 29 €). Vérifié avec la grille La Poste 2026 : zone A (Belgique) 14,99 € pour 500 g, 19,39 € pour 1 kg ; zone C (États-Unis) 35,19 € pour 500 g, 39,19 € pour 1 kg ; Royaume-Uni 18,99 €. Sources : <https://www.laposte.fr/professionnel/tarif-colissimo> et <https://www.tarif-lettre.com/tarif-colissimo-international-2026>. J'ai ajouté un test qui verrouille ça. **Si tu as vu le même prix en ligne**, c'est que la grille enregistrée dans l'admin (page Expédition) ne correspond plus au fichier du dépôt : ouvre Admin → Expédition → simulateur, essaie Belgique puis États-Unis ; si c'est identique, dis-le-moi, je corrige. (Note : avec le forfait de 29 €, tu perds ~6 € par envoi aux États-Unis : 35,19 € de coût réel pour 500 g. C'est une décision de prix à toi, je n'y ai pas touché.)
- **Lettre verte suivie** : les prix « timbre » de la grille (2,02 / 3,60 / 5,74 / 7,91 / 9,79 / 11,64 €) sont confirmés par une source tierce ; les prix « en ligne » (1,99 / 3,47 / 5,68 …) n'ont pas pu être confirmés sur le site officiel (autre source donne d'autres chiffres). Le client paie un forfait de 4 € de toute façon : ça ne change que ta marge.
**Contact** : bug corrigé — les messages d'état (« Message envoyé », « Merci de compléter… ») s'affichaient **toujours en anglais** (le script lisait la langue trop tôt). Maintenant dans la langue du site.
**Studio de détourage sur iPhone** : bouton « ⤢ Avant / après » : plein écran, une barre que tu glisses du doigt (original à gauche, détouré à droite), choix du fond (beige, noir, blanc, damier). J'ai aussi corrigé un défaut : la page du Studio était **plus large que l'écran** sur iPhone (le menu « Moteur de détourage » débordait). Le détourage côté Cloudflare : pas touché, comme demandé.
**Convertir un reel sans terminal** : fait **dans l'admin**. Admin → Vidéos d'ouverture : choisis n'importe quelle vidéo (même .mov iPhone, même lourde) ; si elle est trop lourde, trop longue ou pas en MP4, elle est convertie toute seule en petit MP4 muet (8 s max, 720 px, moins de 3 Mo) puis envoyée. Même chose pour la vidéo du reel dans « Nouvelle pièce » (jusqu'à 30 s). La conversion dure le temps de la vidéo (8 s de vidéo ≈ 8 s) : garder l'écran allumé. **Limite** : ça utilise l'enregistreur du navigateur ; testé ici seulement avec une vidéo de test (ce Chromium n'écrit pas de MP4) → **à essayer sur ton iPhone** (Safari récent) et sur ton PC (Chrome).
**Performances** : la page d'accueil pesait 11,8 Mo sur PC (4,5 Mo sur iPhone) : les tuiles de catégories chargeaient les photos PNG d'origine. Maintenant des WebP allégés : **5,5 Mo sur PC, ~2,1 Mo sur iPhone**. Le reel d'une fiche ne démarre plus qu'au moment où il apparaît à l'écran (avant : téléchargé tout de suite, 3 à 5 Mo).
**Accessibilité** : test automatique (axe, règles WCAG A/AA) sur 10 pages : 2 défauts trouvés et corrigés (fenêtre de recherche fermée mais encore « atteignable au clavier » ; lien « ← Boutique » trop pâle). Résultat : 0 défaut sur les 10 pages. Textes alternatifs : aucune image sans `alt`. Aucune photo cassée, aucun défilement horizontal sur les pages publiques (PC et iPhone, FR).

## 4. Vérifié, rien à corriger
Fiche produit (PC et iPhone) : flèches, zoom plein écran (flèche clavier, Échap), reel, description, pièce unique. Panier : plusieurs pièces, quantité sur la série (CD VGTAPE), total, panier conservé après fermeture/réouverture, panier vide. Pages légales : présentes (CGV/livraison/retours = une seule page « Infos & conditions de vente »). Admin : 15 pages ouvertes sans erreur de script ni débordement. Textes anglais oubliés en mode français : aucun (hors noms de pièces comme « Custom Hoodie »). Pièce sur demande : limites de fichiers (10 Mo/photo, 8 photos, 1 vidéo 50 Mo) avec message clair. 206 tests passent ; **9 tests échouent depuis le départ** (serveur de détourage, `detourage-server.test.mjs` : liés à l'environnement de cette machine, pas à mes changements : même résultat avec ou sans eux).

## 5. Pas pu faire seul
- **Paiement Stripe en mode test** (carte acceptée/refusée, Canada, stock, double achat) : je ne peux pas atteindre le Worker ni saisir de carte. Ce qui est déjà testé par programme : stock, pièce unique qui passe « Sold out », double achat simultané = un seul gagnant, annulation, mails (`tests/stock-flow.test.mjs`). Liste à faire toi-même plus bas.
- **Admin « pièce test de A à Z »** : demande ta connexion GitHub, impossible pour moi. Calcul des frais d'envoi testé (36 tests).

## 6. À vérifier par toi sur iPhone (après déploiement)
1. Accueil : clic sur « Tout » puis une catégorie plusieurs fois : jamais une pièce « Sold out ».
2. Une pièce unique : « Ajouter au panier » deux fois → message « Déjà dans ton panier ».
3. Panier : bouton Retirer chromé ; pays : tape « bel » → Belgique choisie ; photo du jean entière.
4. Studio détourage → une photo → « ⤢ Avant / après » : glisser la barre, changer le fond, Fermer.
5. Admin → Vidéos d'ouverture : choisir une vidéo de l'iPhone (.mov ou MP4 lourd) : barre « Conversion … % », puis ajoutée. (Garde l'écran allumé.)
6. Contact : envoyer un message vide → message d'erreur en français.

## 7. Ce qui attend une action ou une décision de toi (pas à pas)
1. **Dire « déploie la branche de la nuit »** (ou « non, pas tout ») : je fusionne sur `main`, on vérifie ensemble.
2. **Test de paiement Stripe (mode test, avec moi)** — dis « prépare le test de paiement » ; puis tu tapes toi-même : carte `4242 4242 4242 4242` (acceptée) ; carte `4000 0000 0000 0002` (refusée : le panier doit rester) ; adresse au Canada avec `4242…` ; vérifier que le stock baisse et que la pièce unique passe « Sold out » ; ouvrir le site sur 2 appareils et payer la même pièce unique en même temps (un seul doit réussir) ; la page de confirmation « Merci ».
3. **Frais Belgique / États-Unis** : voir §3 (simulateur de l'admin). Si identiques, me le dire.
4. **Prix États-Unis** : garder 29 € (perte ~6 €) ou monter ? Décision à toi (j'ai laissé 29 €).
5. **Textes légaux à relire** (je n'y ai pas touché) : la page Confidentialité dit « GitHub (hébergement du site) » alors que le site est maintenant chez Cloudflare Pages ; la page Infos dit « Livraison via Colissimo » alors que les petites pièces partent en Lettre suivie (France) ; pas de page « Cookies » séparée (la Confidentialité dit « aucun cookie de suivi »).
6. Le bouton « PROPOSER UN PROJET » passe sur une 2e ligne du menu sur PC (écran 1280 px) : choix de design à toi.
