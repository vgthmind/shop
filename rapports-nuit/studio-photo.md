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

Fichiers (tous nouveaux) :
- `admin/studio-photo.html` — page (non liée au menu, `noindex`).
- `admin/studio-photo.js` — interface (photos, aperçu côte à côte, valider/annuler/relancer, pinceau, export).
- `admin/studio-engine.js` — chargement du modèle (navigateur) + **emplacement du service payant** (`remoteEngine`, désactivé, sans clé).
- `admin/studio-process.js` — fonctions pures : défrangeage, durcissement du masque, cadrage commun, testées sous Node (`admin/studio-process.test.mjs`).

Fonctionnement : sélection de plusieurs photos → détourage une par une (file) → pour chacune : original | détouré sur le fond du site (noir) → Valider / Garder l'original / Relancer → pinceau gomme/restaure (taille réglable, annuler) → export WebP : un fichier par photo, nommés `0.webp, 1.webp…` (ordre = ordre de la pièce), cadrage centré avec la même marge sur toutes les photos de la pièce, fond transparent ou noir du site.

Limites connues (honnêtes) :
- **Le vrai modèle n'a pas pu être testé cette nuit** (accès Hugging Face/jsDelivr bloqué dans l'environnement). L'interface, le défrangeage, le cadrage et l'export ont été testés avec un faux moteur. Premier essai réel = à faire sur ton PC (voir « Tester »). Si le nom des entrées/sorties du modèle diffère, c'est dans `studio-engine.js`, fonction `runModel` (une dizaine de lignes).
- iPhone : non testé sur appareil. Prévu : modèle quantifié + WASM, image réduite à 1024 px pour l'inférence, 2000 px max pour le travail.
- Pas de téléversement automatique : l'export télécharge les fichiers (voir §4 pour le branchement).

## 4. Branchement prévu (à NE PAS faire cette nuit)

Ordre conseillé, chaque étape indépendante :

1. **Menu** — `admin/index.html`, dans le `<nav>` (après la ligne du lien Stock, ~l.27) ajouter :
   `<a href="studio-photo.html" style="padding:8px 14px;border-radius:999px;background:#171717;color:#fff;text-decoration:none">Studio photo</a>`
   Puis `node generator/build.js` pour mettre `docs/` à jour. (`admin/index.html` n'est pas dans la liste des fichiers modifiés sur ton PC, mais vérifie avant.)
2. **Depuis la fiche pièce** — Sveltia n'a pas de bouton personnalisé simple. Plus fiable : le studio devient le point d'entrée « nouvelle pièce / modifier photos » : l'export pousse directement dans `assets/products/<slug>/` et met à jour `data/products/<slug>.json` (champ `images`) par l'API GitHub (`PUT /repos/vgthmind/shop/contents/...`) via le Worker (route `/admin/publish`), authentifié par la même session que Stock/Commandes (`vgAdminToken()`). Fichiers : nouvelle route dans un **nouveau** fichier `checkout-worker/studio.ts`, importée dans `checkout-worker/index.ts` par :
   `import { handleStudio } from './studio';` (en tête) et, dans le routeur `fetch`, avant le 404 : `if (url.pathname.startsWith('/admin/studio/')) return handleStudio(request, env);`
   (À ajouter par toi : `index.ts` a des modifs non commitées sur ton PC.) Le Worker doit disposer du jeton GitHub déjà utilisé pour l'OAuth/commit ; **ne pas en créer de nouveau dans le dépôt**.
3. **Format** — le studio exporte déjà du WebP ; `config.yml` dit « PNG ou WebP » et `resize-images.js` accepte `.webp` (`/\.(png|jpe?g|webp)$/i`) : rien à changer côté build.
4. **Publication** — commit sur `main` → l'Action reconstruit → site à jour. Ajouter un bouton « Publier la pièce » dans le studio appelant la route ci-dessus (fichier `studio-photo.js`, fonction `publish()` déjà prévue, vide).
5. **Service payant (option)** — nouvelle route Worker `/admin/studio/remove-bg` (même fichier `studio.ts`) qui lit `env.REMOVEBG_API_KEY` (secret créé par toi : `npx wrangler secret put REMOVEBG_API_KEY`), relaie l'image et renvoie le PNG. Côté page : mettre `remoteEngine.enabled = true` dans `studio-engine.js`.
6. **Confidentialité** — si l'option payante est activée : une ligne dans `theme/pages/confidentialite.html` (sous-traitant d'image). Non fait (page légale).
