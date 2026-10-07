# Studio photo (détourage) — rapport de nuit

Branche : `nuit/studio-photo`. Rien déployé, aucun secret, aucun fichier existant sensible modifié.

## 1. État des lieux (ce qui existait)

- **Détourage : rien dans le dépôt.** Les photos de `assets/products/<slug>/<n>.png` sont déjà détourées à la main (fond transparent, ~1000 px), puis `generator/resize-images.js` fabrique des WebP 24/320/540/800 px (`assets/products-sized/`).
- **Publication d'une pièce** : admin Sveltia CMS (`admin/index.html`, `admin/config.yml`). Champ `images` = liste d'images ; dossier média `assets/products`, `public_folder: /assets/products`. Un enregistrement = un commit sur `main`, puis l'Action `build-shop.yml` reconstruit le site (1–2 min).
- Pages admin maison : `stock.html`, `commandes.html`, connexion via `vg-admin-auth.js` (Worker). Raccourcis dans le menu flottant de `admin/index.html`.
- **Fonds réels (vérifiés le 2026-10-07)** : fiches produit et grilles = **beige `#f4f2ec`** (`theme/layout.html` l.25 force `html,body{background-color:#f4f2ec}` ; `custom-css.css` : `--bg:#f4f2ec`, cadres photo `transparent`). Le réglage `background_color: #000000` de `theme/settings.json` est donc écrasé : **le site n'est pas noir**. Zoom plein écran des photos (PhotoSwipe) = **noir `#000000`**. E-mails (`checkout-worker/emails.ts`) : page `#f4f2ec`, carte `#ffffff`, vignette de l'article (72×76) sur **beige `#f4f2ec`**. Le premier prototype supposait « noir » : corrigé.
- `build.js` copie tout `admin/` vers `docs/admin/` (`fs.cpSync`) : un nouveau fichier dans `admin/` est publié sans modifier le générateur.

## 2. Comparatif des solutions de détourage

Contraintes : GitHub Pages (statique) + Worker Cloudflare. Les prix sont indicatifs (ma connaissance, **à revérifier** sur les sites).

| | A. Navigateur — BiRefNet « lite » (retenu) | B. Navigateur — ISNet / imgly (plan B léger) | C. Service payant — ex. Photoroom API (ou remove.bg) |
|---|---|---|---|
| Licence | MIT (modèle) + Apache-2.0 (transformers.js) → usage commercial OK | ISNet-general : Apache-2.0. Paquet `@imgly/background-removal` : **AGPL-3.0** (à éviter sans y réfléchir) | Conditions du service |
| Qualité vêtements | La meilleure des modèles libres : bords nets, bonne tenue sur franges et mailles, assez bon sur poils ; transparences (tulle, voile) → approximatif, retouche gomme/restaure utile | Correcte sur formes pleines, plus de halos et de bords « mous » ; franges/poils moyens | Très bonne, entraînée sur du produit/mode ; gère mieux les transparences et ombres portées ; reste imparfaite sur tulle |
| Halos | Un peu de liseré clair/sombre possible → corrigé par le défrangeage du studio (couleur des bords recalculée depuis l'intérieur) | Plus fréquent, même correction | Généralement peu |
| Coût | 0 € | 0 € | ~0,02–0,20 € par photo selon le service/forfait ; pièce à 5 photos = 0,10–1 € |
| Vitesse | 1re fois : télécharge le modèle (~50–230 Mo selon la version, mis en cache ensuite). Ensuite ~1–5 s/photo avec WebGPU, ~10–40 s en WASM (CPU). iPhone : lent, mémoire limitée | Modèle ~45 Mo, ~2–8 s/photo | 1–3 s/photo + réseau |
| Où ça tourne | Dans le navigateur de l'utilisateur (PC/iPhone) | idem | Serveur du prestataire, appelé via le Worker |
| Où sont les photos | **Nulle part ailleurs que sur ton appareil** jusqu'à la publication (puis dépôt GitHub public) | idem | **Envoyées à un tiers** (hébergement hors UE possible, durée de conservation selon contrat) ; à mentionner dans la page confidentialité si utilisé |
| Clé API | Aucune | Aucune | Oui, que tu crées toi-même ; elle va dans un secret du Worker (`wrangler secret put`), **jamais dans la page ni le dépôt** |
| Risque | iPhone ancien : mémoire insuffisante → plan B (B) ou photo plus petite | idem, moindre | Dépendance, facturation, quotas |

**Recommandation** : A par défaut (gratuit, privé, assez bon), avec la retouche manuelle pour finir. C en option plus tard, pour les pièces difficiles (franges, voiles), via un endpoint Worker (voir §4). B n'est pas implémenté ; la page choisit automatiquement la version quantifiée du modèle A quand WebGPU est absent (iPhone surtout).

Modèles écartés : **RMBG-1.4 / 2.0** (Bria) = licence non commerciale, impropre à une boutique ; **MODNet** = pensé pour portraits.

## 3. Prototype (livré)

Fichiers (tous nouveaux ; copiés dans `docs/admin/` par `node generator/build.js`) :
- `admin/studio-photo.html` — page (non liée au menu, `noindex`, déjà exclue par `robots.txt` via `/admin/`).
- `admin/studio-photo.js` — interface : ajout de plusieurs photos, file de détourage, original | détouré (fonds du site : beige, noir, blanc, damier), Valider / Garder l'original / Relancer, ordre (← →) et retrait, pinceau Gommer/Restaurer (taille réglable, Annuler, 8 niveaux), réglages de bords (seuils, contraction, anti-halo), export.
- `admin/studio-engine.js` — moteurs : **`model`** (vrai branchement BiRefNet-lite via transformers.js 3.8.1, chargé depuis jsDelivr/Hugging Face au moment de l'usage ; essaie WebGPU fp16 → WASM q8 → WASM complet ; si tout échoue → **repli automatique** sur `simple` + message), **`simple`** (fond uni, sans téléchargement), **`remote`** (emplacement du service payant, `REMOTE.enabled=false`, sans clé).
- `admin/studio-webp.js` + `admin/vendor/webp/` — encodeur WebP WebAssembly local (jSquash/libwebp, Apache-2.0/BSD) pour Safari/iPhone, qui n'encode pas le WebP via canvas.
- `admin/studio-publish.js` — publication (voir §4).
- `admin/studio-process.js` — fonctions pures (affinage du masque, anti-halo, boîte englobante, cadrage, ZIP) ; `admin/studio-process.test.mjs` = test Node.

Export : WebP (qualité réglée automatiquement pour rester sous le poids max choisi, 150 Ko par défaut), `0.webp, 1.webp…` dans un ZIP `<slug>/`, cadrage centré avec la même marge (4:5, 1:1 ou 3:4 ; 800/1000/1200 px), fond transparent ou beige/noir/blanc, option « même échelle pour toutes ». Sur iPhone : bouton « Partager / enregistrer » (feuille de partage → Fichiers/Photos). Safari ne sait pas encoder le WebP via canvas : repli sur l'encodeur WebAssembly local, puis PNG en dernier recours.

**Fonds proposés** : aperçu = beige du site (défaut), noir, blanc, damier (transparent). Export = transparent, beige, noir, blanc (même liste, constante `BGS` en tête de `studio-photo.js` ; une seule ligne à changer si le thème évolue).

**Retouche tactile** : un doigt gomme/restaure, deux doigts = zoom (jusqu'à ×8) et déplacement, les deux panneaux zooment ensemble ; souris : molette, ou espace / clic milieu / outil ✋. Boutons − + Ajuster. Case « Pinceau décalé au-dessus du doigt » (cochée par défaut sur écran tactile) pour voir ce qu'on retouche. Un 2e doigt qui arrive annule le trait commencé (pas de point parasite).

Vérifié (Chromium headless : bureau + émulation iPhone 13 tactile, vrais événements tactiles CDP ; moteur `simple`) :
- fonds : liste complète, aperçu beige = `rgb(244,242,236)`, export sur beige : coin de l'image = beige ;
- zoom molette ×8, gomme exacte sous zoom (alpha 255 → 0 au bon pixel), annuler ;
- iPhone : pas de défilement horizontal, trait au doigt décalé au-dessus du doigt, pincement ×3, déplacement à deux doigts, aucun trait parasite ;
- **encodeur WebP de secours** (forcé par `?webp=wasm`, comme Safari) : fichiers `RIFF…WEBP` valides lus par sharp, 1000×1250, ~5,7 Ko ; ZIP valide ; les dimensions sont lues correctement par `generator/image-size.js` (WebP avec alpha) ;
- publication contre un **faux GitHub** (voir §4) ; `node admin/studio-process.test.mjs` OK ; aucune erreur JS.
**Non vérifié** : le vrai modèle (réseau bloqué ici), l'iPhone réel (gestes émulés seulement), la qualité sur tes vêtements, la publication réelle sur GitHub.

### Tester le vrai modèle demain sur ton PC (Chrome ou Edge récent)

```
git fetch origin nuit/studio-photo
git checkout nuit/studio-photo
python -m http.server 8765        # ou : npx http-server -p 8765   (depuis la racine du dépôt)
```
Ouvrir **http://localhost:8765/admin/studio-photo.html** (pas de connexion nécessaire), choisir des photos : le moteur « Modèle IA » est celui par défaut. 1re fois : téléchargement du modèle (barre de progression dans la zone grise sous le choix du moteur), puis cache du navigateur. Pour forcer un autre modèle : `?model=` n'est pas prévu ; modifier `MODEL_ID` en tête de `studio-engine.js`.
Pour tester l'interface sans modèle : `http://localhost:8765/admin/studio-photo.html?engine=simple`.
Si le modèle se charge mais le détourage plante : ouvrir la console (F12) ; le message d'erreur dit le nom d'entrée/sortie attendu → ajuster `runModel` dans `studio-engine.js` (deux noms d'entrée essayés : `input_image`, `pixel_values`).
Sur iPhone : mettre le même dossier en ligne n'est pas nécessaire cette fois ; plus simple → après fusion sur `main`, ouvrir `https://vgthmind.github.io/shop/admin/studio-photo.html` dans Safari.

## 4. Publication — réutiliser le chemin de l'admin actuel (aucun nouveau jeton)

**Comment l'admin publie déjà** (lu dans `admin/index.html`, `admin/config.yml`, `checkout-worker/index.ts` l.553–620, `.github/workflows/build-shop.yml`) :
1. `/admin/` charge Sveltia CMS (`backend: github`, `repo: vgthmind/shop`, `branch: main`, `base_url` = le Worker, `auth_endpoint: auth`).
2. « Se connecter avec GitHub » ouvre une fenêtre `…workers.dev/auth` → GitHub (OAuth App, portée `public_repo`) → `/callback`. Le Worker vérifie que le compte est `ADMIN_GITHUB_LOGIN` (vgthmind) et renvoie au navigateur `{ token, provider, session }` (`index.ts` l.617–619 : « `token` reste pour Sveltia »). Le Worker ne garde pas ce jeton.
3. Sveltia écrit alors **directement dans GitHub depuis le navigateur** avec ce jeton : un commit sur `main` qui contient `data/products/<slug>.json` (champ `images`, chemins `/assets/products/<slug>/N.ext`) et les photos dans `assets/products/<slug>/` (`media_folder`).
4. L'Action « Build shop » (déclenchée par `data/products/**` et `assets/**`) lance `build-catalog.js`, `resize-images.js` (tailles 24/320/540/800 + suppression des variantes orphelines) et `build.js`, puis commit `docs/`. GitHub Pages publie.

**Proposition : le studio fait exactement la même chose, sans rien ajouter côté Worker ni secret.** C'est fait dans le nouveau fichier `admin/studio-publish.js` :
- même fenêtre `/auth` (même poignée de main que `vg-admin-auth.js`), on garde le `token` **en mémoire de l'onglet seulement** (ni localStorage, ni dépôt, ni Worker) ;
- un seul commit atomique par l'API Git de GitHub (blobs → arbre → commit → mise à jour de `main` sans `force`) : nouvelles photos + fiche `data/products/<slug>.json` avec `images` remplacé (autres champs intacts) + suppression des anciennes photos de la pièce (case « Remplacer ») ;
- noms de fichiers **uniques** (`v<horodatage>-<n>.webp`) : évite le piège du cache de `resize-images.js` (comparaison de dates, fragile en CI quand on réécrit `0.png`) et le cache du navigateur/GitHub Pages ;
- refuse de publier si la fiche n'existe pas (pas de duplication du formulaire : on crée la pièce dans Sveltia, on publie ses photos ici) ; si `main` a bougé pendant l'envoi : échec propre, rien de publié.

Testé ici seulement contre un **faux GitHub** (requêtes interceptées : arbre, suppression de `0.png`/`1.png`, JSON de la fiche, jeton = celui du Worker, jeton d'un autre site ignoré, commit sans `force`). **Jamais lancé sur le vrai dépôt.** Premier essai réel conseillé sur une pièce de test (ou en vérifiant le commit sur GitHub avant que l'Action ne passe).

**Lignes de branchement (aucune n'est appliquée dans un fichier interdit) :**
1. `admin/index.html` (non interdit, mais à ne changer que quand tu es d'accord), dans le `<nav>` flottant, après le lien Stock :
   `<a href="studio-photo.html" style="padding:8px 14px;border-radius:999px;background:#171717;color:#fff;text-decoration:none">Studio photo</a>`
   puis `node generator/build.js` et commit.
2. `admin/AIDE.md`, section « Ajouter une pièce » : remplacer « photos détourées, fond transparent, ~1000 px » par : « Photos : bouton Studio photo (détourage, cadrage, publication des photos de la pièce après l'avoir créée). »
3. **Rien** dans `checkout-worker/index.ts`, `emails.ts`, `vg-shop-cart.js`, ni les CGV : le chemin existant suffit. (Le plan « route `/admin/studio/publish` + `GITHUB_TOKEN` » du premier rapport est abandonné : il demandait un nouveau jeton.)
4. Facultatif, plus tard : proposer ce lien Studio depuis la fiche pièce Sveltia via `hint` du champ `images` dans `admin/config.yml` (texte seulement : « Détourer et cadrer avec le Studio photo : studio-photo.html »).
5. Service payant (option, jamais activé) : route Worker `/admin/studio/remove-bg` dans un **nouveau** `checkout-worker/studio.ts` + 1 ligne d'import et 1 ligne de route à ajouter par toi dans `index.ts` (dans le bloc `if (path.startsWith('/admin/'))`, avant `return json({ error: 'Not found' }, 404);`), secret `REMOVEBG_API_KEY` créé par toi ; côté page `REMOTE.enabled = true; REMOTE.url = VG_ENDPOINT + '/admin/studio/remove-bg'` dans `studio-engine.js` et retirer `disabled` de l'option. Mentionner le sous-traitant dans `theme/pages/confidentialite.html`.

## 5. Pistes non abouties / à surveiller
- Franges et transparences (tulle) : le modèle seul sera approximatif → gomme/restaure + réglages de bords.
- Poussières isolées hors du vêtement : elles élargissent la boîte de cadrage tant qu'elles ne sont pas gommées (idée : supprimer les îlots minuscules automatiquement).
- iPhone avec peu de mémoire : taille de travail limitée à 1600 px ; si le modèle plante, la page se replie sur « fond uni ».
- Jamais touché : `LIVE_MODE`, `noindex`/`robots.txt`, CGV, `emails.ts`, `vg-shop-cart.js`, `checkout-worker/index.ts`.

## 6. Checklist de test avec tes vraies photos (PC d'abord, puis iPhone)

Avant : `git checkout nuit/studio-photo`, `python -m http.server 8765`, ouvrir `http://localhost:8765/admin/studio-photo.html` (Chrome/Edge). Noter pour chaque cas : bon / à retoucher / raté, et le temps de détourage.

1. **Chargement du modèle** : 1re fois, le téléchargement progresse-t-il ? Message « Modèle indisponible » ? (console F12). 2e fois : plus rapide ?
2. **Vêtement noir sur fond sombre** (le cas le plus dur) : le contour est-il juste ? Regarder l'aperçu sur **beige** puis sur **blanc** : un liséré noir ou un trou apparaît-il ? Essayer « Bords : seuil bas » / « Contracter ».
3. **Franges, effilochés** (jean, écharpe) : les franges sont-elles gardées, pas collées en bloc ? Zoom ×4 sur les bords ; si des franges manquent, outil Restaurer.
4. **Tissus fins / mailles / dentelle** : les trous du tissu sont-ils transparents ou remplis du fond d'origine ?
5. **Poils, fausse fourrure, peluche** : bords doux sans halo clair ; réglage « Anti-halo ».
6. **Transparences** (voile, tulle, plastique) : zone semi-transparente conservée, ou découpée en trous ? (le modèle seul sera approximatif : noter ce qui reste à retoucher à la main).
7. **Fermetures, chaînes, boucles métalliques** (reflets) : pas de bouts coupés.
8. **Vêtement clair sur fond clair** et **photo portée** (mannequin/cintre) : le cintre, les mains, le sol sont-ils retirés ?
9. **Ombre portée au sol** : conservée ou supprimée ? Quel résultat préfères-tu pour le site ?
10. **Retouche** : gomme/restaure, taille, annuler (plusieurs fois), zoom molette, espace + glisser.
11. **Cadrage d'une pièce de 4–5 photos** (vues de face, dos, détail) : marge identique ; essayer « chaque pièce remplit le cadre » puis « même échelle pour toutes » ; 4:5 vs 1:1.
12. **Fonds** : vérifier l'export sur *transparent* en ouvrant le WebP dans le navigateur (damier), puis sur *beige*. Poids des fichiers (cible ≤ 150 Ko) et qualité visible.
13. **Rendu réel** : copier les WebP dans `assets/products/<slug-test>/`, regarder la fiche en local (`node generator/build.js`) : cohérence avec les autres pièces, grille 4:5.
14. **iPhone (Safari)** — ouvrir `https://vgthmind.github.io/shop/admin/studio-photo.html` une fois fusionné : ajout depuis la photothèque (HEIC ok ?), mémoire (plante-t-il avec 5 photos ?), temps de détourage, trait au doigt avec/sans « Pinceau décalé », pincement, export « Partager / enregistrer » (WebP bien produit, pas PNG ?).
15. **Publication** (seulement sur une pièce de test) : se connecter à GitHub (fenêtre pop-up autorisée), « Publier » → vérifier le commit sur `main` (photos `v…-n.webp` + fiche) puis l'Action verte et la fiche en ligne ; vérifier qu'aucune ancienne photo n'est restée.
16. **Erreurs** : pièce inexistante (message clair), coupure réseau en cours d'envoi (rien de publié ?).
