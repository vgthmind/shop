# vgthmind — boutique (hors BigCartel)

Prototype autonome, gratuit, teste en parallele — **rien n'est encore publie
ni connecte au domaine vgthmind.org.** Rien ici n'affecte vgthmind.bigcartel.com,
qui reste la vraie boutique en ligne pour l'instant.

Ce depot est separe du portfolio (`vgthmind/vgthmind.github.io`) expres : le
domaine `vgthmind.org` doit un jour pointer directement ici (racine = boutique,
comme aujourd'hui avec BigCartel), sans toucher au portfolio qui garde sa
propre adresse `vgthmind.github.io`.

Objectif rappele (discute dans une conversation precedente) : sortir de BigCartel
en gardant Stripe (deja utilise), en gardant une interface simple pour ajouter des
pieces (proche de l'admin BigCartel, sans avoir a coder), sans payer d'hebergement
(juste le nom de domaine, comme aujourd'hui), et avec un niveau de securite
au moins aussi bon que BigCartel.

## ⚠️ A NE SURTOUT PAS OUBLIER avant le vrai lancement public

Ce prototype est actuellement **bloque volontairement** pour ne pas etre vu
avant d'etre pret (double protection) :
- `robots.txt` : `Disallow: /` (tout est bloque)
- `<meta name="robots" content="noindex, nofollow">` sur `index.html` et
  `product.html` (chacune marquee d'un commentaire "A ENLEVER" juste au-dessus)

**Au moment du vrai lancement (domaine branche, catalogue complet, tout
valide) :**
1. Enlever le `<meta name="robots" ...>` de `index.html` et `product.html`
   (PAS de `admin/index.html`, qui doit rester bloque en permanence).
2. Mettre a jour `robots.txt` (le fichier contient deja les 2 lignes a utiliser
   en commentaire, juste a les activer).

Sans ca, la boutique restera invisible pour Google/les moteurs de recherche
meme une fois en ligne.

## Architecture choisie

- **Site** : pages statiques (`index.html`, `product.html`), hebergees
  gratuitement sur GitHub Pages.
- **Gestion des pieces** : [Sveltia CMS](https://sveltiacms.app) (gratuit,
  open-source, successeur actif de Decap/Netlify CMS) — un formulaire web pour
  ajouter/modifier une piece (nom, prix, photos, description...), qui commit
  directement dans ce depot Git. Pas de base de donnees a gerer, pas de mot de
  passe a stocker nulle part.
- **Donnees produits** : un fichier JSON par piece dans `data/products/`.
  Une GitHub Action (`.github/workflows/build-products-index.yml`)
  regenere automatiquement `data/products.json` (le fichier que les pages
  lisent) a chaque modification — gratuit, inclus dans GitHub.
- **Paiement** : [Stripe Payment Links](https://stripe.com/payments/payment-links)
  — un lien de paiement cree en 2 clics par piece depuis ton dashboard Stripe
  existant (celui deja utilise via BigCartel), colle dans le champ correspondant
  de la fiche produit. Aucun code a ecrire, memes frais Stripe qu'aujourd'hui
  (2,9% + 0,30 EUR, pas de commission supplementaire).
- **Pieces uniques (stock = 1)** : Stripe gere ca nativement — sur le Payment
  Link, option "Limit the number of payments" mise a 1 : des qu'une piece est
  payee, le lien se desactive tout seul (plus besoin de gerer un stock a la main).

Cout total : 0 EUR/mois (uniquement le nom de domaine, comme actuellement).

**Precision utile :** la conversation precedente evoquait "un petit bout de
serveur pour les confirmations de commande" comme brique a assembler en plus.
En verifiant : ce n'est en fait **pas necessaire** pour le strict minimum —
Stripe envoie deja nativement un recu au client (a activer dans Customer
emails settings) et peut notifier le vendeur par email a chaque paiement
reussi (Personal details > notification preferences), sans code ni serveur.

**Limite honnete a garder en tete :** BigCartel gere nativement le panier
multi-articles avec frais de port combines. Les Payment Links Stripe sont
plutot penses "un lien = un achat" ; regrouper plusieurs pieces differentes
dans un seul paiement avec Stripe demande une verification plus poussee (pas
testee, a valider avant de considerer la migration complete).

## Securite

Contexte : un e-commerce francais s'est fait pirater recemment (mentionne par
le proprietaire), et une campagne plus large a compromis 119 sites marchands
entre juillet et septembre 2026 via des scripts espions injectes sur les
pages de paiement (vol de plus de 600 000 numeros de carte, technique dite
"Magecart" — script malveillant cache dans le code de la page ou tu tapes ton
numero de carte). Une marque francaise de streetwear (ARNtreal, ~100 000
comptes) a aussi ete piratee recemment — pas via sa plateforme e-commerce
elle-meme, mais via un systeme annexe fait maison (concours, affiliation).

### Pourquoi cette architecture resiste structurellement a ces deux scenarios

1. **Aucune page de paiement sur ce site.** Le bouton "Acheter" renvoie
   directement vers `buy.stripe.com` (page hebergee et securisee par
   Stripe — conformite PCI-DSS geree par eux, pas par nous). Aucun formulaire
   de carte bancaire n'existe jamais sur ce site. Un script malveillant
   injecte ici ne pourrait donc pas voler de numero de carte, puisqu'il n'y
   en a jamais sur cette page — contrairement a l'attaque de 2026 qui ciblait
   des sites ou le client tape sa carte directement.
2. **Aucune base de donnees, aucun compte client, aucun systeme fait maison.**
   Tout le contenu est dans des fichiers texte (JSON) commit dans ce depot
   GitHub. Il n'y a pas de mot de passe utilisateur stocke, pas de serveur
   perso a maintenir/patcher, pas de plugin tiers a mettre a jour — donc pas
   la faille "systeme annexe mal securise" qui a touche ARNtreal.
3. **Le seul secret sensible est un jeton d'acces GitHub**, limite (voir
   ci-dessous) a ce depot uniquement, jamais partage, jamais stocke dans le
   code.

### Ce qu'il faut quand meme absolument faire (cote humain, pas du code)

- **Active la double authentification (2FA)** sur ton compte GitHub, ton
  compte Stripe, et sur ton adresse email associee. C'est la protection la
  plus efficace contre 95% des piratages de compte (vol de mot de passe
  seul). GitHub : Settings > Password and authentication > Two-factor
  authentication. Stripe : Settings > Security > Two-step authentication.
- **Ne partage jamais le jeton GitHub** (voir section Connexion ci-dessous)
  avec qui que ce soit, ne le colle jamais dans un chat, un email, un
  document partage. Si tu penses qu'il a fuite : GitHub > Settings >
  Developer settings > Fine-grained tokens > le supprimer immediatement (ca
  ne prend pas plus de 30 secondes, et ca coupe l'acces instantanement).
- **Verifie regulierement** (une fois par mois par exemple) la liste des
  connexions actives sur GitHub (Settings > Sessions) et sur Stripe, pour
  reperer une connexion suspecte.

### Connexion a l'interface de gestion des pieces (une fois configuree)

Sveltia CMS propose une authentification par **jeton GitHub "fine-grained"**,
sans avoir besoin de deployer de serveur intermediaire :

1. Ouvrir `admin/index.html` sur le site publie.
2. Cliquer sur "Sign in with token".
3. Sveltia te redirige vers GitHub, avec les bonnes permissions deja
   pre-selectionnees (acces en lecture/ecriture, **uniquement sur ce depot**
   — pas sur tes autres depots GitHub).
4. Generer le jeton, le copier, le coller dans Sveltia.

C'est plus simple ET plus sur qu'une authentification OAuth classique via un
serveur intermediaire : un jeton "fine-grained" limite precisement a ce
depot, avec seulement la permission "Contents" (lecture/ecriture), au lieu
d'un jeton OAuth classique qui donnerait acces a TOUS tes depots GitHub. Le
code d'une approche alternative par serveur (`oauth-worker/`) reste dans le
depot au cas ou tu ajoutes un jour un collaborateur (utile seulement dans ce
cas precis), mais n'est pas necessaire pour un usage solo.

**Sur le jeton lui-meme :** GitHub permet de fixer une date d'expiration
(recommande : 1 an maximum, jamais "sans expiration") — a renouveler quand il
expire, ca prend 1 minute. Le jeton reste stocke uniquement dans ton
navigateur (jamais sur un serveur), donc uniquement expose si quelqu'un a un
acces physique/logiciel a ton navigateur deja connecte — raison de plus pour
la 2FA sur le compte GitHub lui-meme et de fermer ta session sur un
ordinateur partage.

### Durcissement applique dans le code (deja fait, teste)

- `js/shop.js` valide chaque URL (image, lien de paiement) avant de
  l'utiliser : seules les URLs `https://` (ou chemins internes commencant par
  `/`) sont acceptees, le lien de paiement est en plus verifie comme venant
  de `buy.stripe.com`. Teste avec un payload malveillant (`javascript:...`)
  qui est correctement rejete.
- Le contenu texte (nom, description) est toujours insere via `textContent`,
  jamais via `innerHTML` avec des donnees variables — empeche toute injection
  de code HTML/script depuis un champ produit.
- `robots.txt` + `<meta name="robots" content="noindex, nofollow">` sur
  toutes les pages tant que ce n'est pas la boutique officielle (voir
  l'avertissement tout en haut de ce fichier).

## Ce qui est deja fait et teste

- Structure du site + rendu liste/fiche produit : teste avec un navigateur
  reel (Playwright), capture d'ecran verifiee, aucune erreur console.
- Une piece d'exemple (`data/products/exemple-sacoche.json`, en utilisant de
  vraies photos hebergees sur `vgthmind.github.io`) pour verifier que tout
  s'affiche correctement. A supprimer ou modifier une fois que le vrai
  contenu arrive.
- Validation des URLs (voir section Securite) testee avec un payload
  malveillant simule — correctement bloque.

## Ce qu'il reste a faire (etapes qui necessitent TES comptes)

### 1. Autoriser les GitHub Actions a pousser des commits automatiquement

Sur GitHub (ce depot) : `Settings` > `Actions` > `General` > tout en bas,
section "Workflow permissions" > choisir **"Read and write permissions"** >
Save. (Sans ca, la regeneration automatique de `products.json` echouera
silencieusement.)

### 2. Activer la 2FA (securite, 5 minutes, a faire en premier)

Voir section Securite ci-dessus — GitHub et Stripe, avant tout le reste.

### 3. Activer GitHub Pages sur ce depot

`Settings` > `Pages` > Source : "Deploy from a branch" > Branch : `main` /
`/ (root)` > Save. Le site sera accessible sur une URL du style
`vgthmind.github.io/shop/` (nom exact selon GitHub) — pas encore le domaine
final, juste pour tester.

### 4. Se connecter a l'interface de gestion et creer les liens de paiement Stripe

- Ouvrir `admin/index.html` une fois Pages actif, se connecter par jeton (voir
  section Securite / Connexion ci-dessus).
- Pour chaque piece : dashboard Stripe > Payment Links > "+ New" > remplir
  nom/prix/photo > si piece unique, activer "Limit the number of payments" a
  1 > copier le lien genere > le coller dans le champ "Lien de paiement
  Stripe" de la fiche produit, via l'interface Sveltia.

### 5. Plus tard : brancher le nom de domaine vgthmind.org

Seulement une fois que tout est teste et valide, catalogue complet, et que tu
dis explicitement "oui, on bascule" :
1. Dans ce depot : `Settings` > `Pages` > Custom domain > taper `vgthmind.org`.
2. Chez IONOS (ton registrar actuel) : mettre a jour les enregistrements DNS
   du domaine pour pointer vers GitHub Pages (GitHub affiche les valeurs
   exactes a utiliser des que tu rentres le domaine a l'etape 1).
3. Ne pas oublier l'etape "A NE SURTOUT PAS OUBLIER" tout en haut de ce
   fichier (enlever le noindex, mettre a jour robots.txt) — sinon la boutique
   sera en ligne mais invisible sur Google.

## Ce qui manque encore avant de pouvoir migrer pour de vrai

- **Export du vrai catalogue BigCartel** (photos, descriptions, prix de chaque
  piece actuelle) — pas d'acces a l'admin BigCartel depuis cette session pour
  recuperer ca. BigCartel propose un export CSV natif pour les **commandes**
  (onglet Orders > Export CSV), mais pas d'export CSV natif clairement
  confirme pour le **catalogue produits** lui-meme. Le plus fiable restera
  probablement de repasser produit par produit depuis l'admin (ou via la
  conversation "Code", qui a l'acces navigateur).
- **Style visuel** : ce prototype a un design minimal fonctionnel, pas encore
  dans l'esthetique verre/chrome du site actuel (curseur custom, animations,
  etc.) — a faire une fois que la structure est validee.
- Decision finale : rester sur cette architecture "petites briques gratuites"
  vs. repartir sur une plateforme e-commerce clef en main payante (~3-5
  EUR/mois, moins de travail de montage). Rien n'engage encore a ce stade —
  c'est un prototype a tester a froid.
