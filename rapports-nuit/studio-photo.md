# Studio photo (détourage) — rapport de nuit

Branche : `nuit/studio-photo`. Rien déployé, aucun secret, aucun fichier existant sensible modifié.

## 1. État des lieux (ce qui existait)

- **Détourage : rien dans le dépôt.** Les photos de `assets/products/<slug>/<n>.png` sont déjà détourées à la main (fond transparent, ~1000 px), puis `generator/resize-images.js` fabrique des WebP 24/320/540/800 px (`assets/products-sized/`).
- **Publication d'une pièce** : admin Sveltia CMS (`admin/index.html`, `admin/config.yml`). Champ `images` = liste d'images ; dossier média `assets/products`, `public_folder: /assets/products`. Un enregistrement = un commit sur `main`, puis l'Action `build-shop.yml` reconstruit le site (1–2 min).
- Pages admin maison : `stock.html`, `commandes.html`, connexion via `vg-admin-auth.js` (Worker). Raccourcis dans le menu flottant de `admin/index.html`.
- Fond du site (thème) : noir `#000000` (`theme/settings.json`). Les photos doivent donc rester transparentes ou posées sur du noir.
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
- `admin/studio-photo.js` — interface : ajout de plusieurs photos, file de détourage, original | détouré (fond du site noir ou damier), Valider / Garder l'original / Relancer, ordre (← →) et retrait, pinceau Gommer/Restaurer (taille réglable, Annuler, 8 niveaux), réglages de bords (seuils, contraction, anti-halo), export.
- `admin/studio-engine.js` — moteurs : **`model`** (vrai branchement BiRefNet-lite via transformers.js 3.8.1, chargé depuis jsDelivr/Hugging Face au moment de l'usage ; essaie WebGPU fp16 → WASM q8 → WASM complet ; si tout échoue → **repli automatique** sur `simple` + message), **`simple`** (fond uni, sans téléchargement), **`remote`** (emplacement du service payant, `REMOTE.enabled=false`, sans clé).
- `admin/studio-process.js` — fonctions pures (affinage du masque, anti-halo, boîte englobante, cadrage, ZIP) ; `admin/studio-process.test.mjs` = test Node.

Export : WebP (qualité réglée automatiquement pour rester sous le poids max choisi, 150 Ko par défaut), `0.webp, 1.webp…` dans un ZIP `<slug>/`, cadrage centré avec la même marge (4:5, 1:1 ou 3:4 ; 800/1000/1200 px), fond transparent ou noir du site, option « même échelle pour toutes ». Sur iPhone : bouton « Partager / enregistrer » (feuille de partage → Fichiers/Photos). Safari ne sait pas encoder le WebP via canvas : repli sur un encodeur WASM (jSquash), puis PNG en dernier recours.

Vérifié cette nuit (Chromium headless, moteur `simple`) : ajout de 3 photos de formats différents, détourage, gomme, annulation, validation, aperçu de cadrage, ZIP valide (3 WebP de 6–8 Ko), aucune erreur JS. `node admin/studio-process.test.mjs` : OK.
**Non vérifié** : le vrai modèle (accès Hugging Face/jsDelivr bloqué ici), l'iPhone réel, l'encodeur jSquash, la qualité sur tes vêtements.

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

## 4. Branchement prévu (à NE PAS faire cette nuit)

Constat important : le Worker **n'a pas de jeton GitHub** (`GITHUB_TOKEN` « n'est plus utilisé, à supprimer », `index.ts` l.52 ; OAuth : le jeton n'est pas gardé). Écrire dans le dépôt depuis le Worker demande donc de créer un jeton « fine-grained » (Contents : lecture/écriture, ce dépôt uniquement) que **tu** mets en secret (`npx wrangler secret put GITHUB_TOKEN`). Deux niveaux possibles :

**Niveau 1 — sans Worker (le plus simple, recommandé pour commencer)**
1. `admin/index.html`, dans le `<nav>` flottant (après le lien Stock, ~l.27), ajouter :
   `<a href="studio-photo.html" style="padding:8px 14px;border-radius:999px;background:#171717;color:#fff;text-decoration:none">Studio photo</a>`
2. `node generator/build.js`, commit (met `docs/admin/index.html` à jour).
3. Usage : studio → ZIP/WebP → dans Sveltia, Pièce → Photos → ajouter les `0.webp`… dans l'ordre. Aucun changement de build : `resize-images.js` accepte déjà `.webp` (`/\.(png|jpe?g|webp)$/i`) et `config.yml` dit « PNG ou WebP ».
4. `admin/AIDE.md`, section « Ajouter une pièce » : remplacer « photos détourées, fond transparent, ~1000 px » par un renvoi au Studio photo.

**Niveau 2 — publication directe depuis le studio**
1. Nouveau fichier `checkout-worker/studio.ts` : `export async function handleStudio(request, env, json)` — vérifie le nom de fichier (`^assets/products/[a-z0-9-]+/\d+\.webp$`), puis `PUT https://api.github.com/repos/vgthmind/shop/contents/<chemin>` avec `env.GITHUB_TOKEN`, puis met à jour `data/products/<slug>.json` (champ `images`).
2. `checkout-worker/index.ts` (à ajouter par toi, fichier modifié sur ton PC) :
   - en tête : `import { handleStudio } from './studio';`
   - dans le bloc `if (path.startsWith('/admin/')) {` (après `/admin/backup` POST, juste avant `return json({ error: 'Not found' }, 404);` ~l.226) : `if (path === '/admin/studio/publish' && request.method === 'POST') return await handleStudio(request, env, json);`
   - dans `interface Env` (~l.52) : garder `GITHUB_TOKEN?: string;` (déjà là) et mettre à jour son commentaire.
   Le bloc `/admin/` exige déjà `isAdmin()` (session signée) : rien d'autre à faire pour la sécurité. Limite de taille de requête Worker : envoyer une photo par appel.
3. `admin/studio-photo.js` : écrire `window.VGStudio.publish()` (déjà prévu, vide, en bas du fichier) : pour chaque fichier de `lastZip`, `fetch(VG_ENDPOINT + '/admin/studio/publish', { method:'POST', headers:{ Authorization:'Bearer '+vgAdminToken() }, body })` ; ajouter `<script src="vg-admin-auth.js">` dans `studio-photo.html` avant `studio-photo.js` (même connexion que Stock/Commandes) et un bouton « Publier la pièce ».
4. Le commit sur `main` déclenche l'Action `build-shop.yml` : le site se reconstruit seul (1–2 min).

**Service payant (option, plus tard)**
- `checkout-worker/studio.ts` : route `/admin/studio/remove-bg` qui lit `env.REMOVEBG_API_KEY` (secret créé par toi), relaie le PNG au prestataire et renvoie le PNG détouré ; ligne `wrangler.toml` : aucune (les secrets n'y vont pas).
- `admin/studio-engine.js` : `REMOTE.enabled = true; REMOTE.url = VG_ENDPOINT + '/admin/studio/remove-bg'` ; retirer `disabled` de l'option « Service payant » dans `studio-photo.html`.
- `theme/pages/confidentialite.html` : une ligne « sous-traitant de traitement d'image » (non fait, page légale).

## 5. Pistes non abouties / à surveiller
- Franges et transparences (tulle) : le modèle seul sera approximatif → gomme/restaure + réglages de bords.
- Poussières isolées hors du vêtement : elles élargissent la boîte de cadrage tant qu'elles ne sont pas gommées (idée : supprimer les îlots minuscules automatiquement).
- iPhone avec peu de mémoire : taille de travail limitée à 1600 px ; si le modèle plante, la page se replie sur « fond uni ».
- Jamais touché : `LIVE_MODE`, `noindex`/`robots.txt`, CGV, `emails.ts`, `vg-shop-cart.js`, `checkout-worker/index.ts`.
