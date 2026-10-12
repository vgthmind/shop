# Bascule vers vgthmind.org — pas à pas (rien n'est fait, tout est prêt)

Écrit la nuit du 12 → 13 octobre 2026. Remplace le §2 de `BASCULE.md` (qui parlait de GitHub Pages : le site est maintenant sur **Cloudflare Pages**, projet `vgthmind-shop`).

## Ce qui est déjà prêt (à ta place)
- **Mêmes adresses que BigCartel** : `/product/…`, `/category/…`, `/products`, `/cart`, `/contact` (vérifié par `tests/launch-root.test.mjs` : toutes les pièces du catalogue + les 7 catégories). Ton lien Instagram continue de marcher.
- **Branche `bascule-prete`** (dans le dépôt, PAS fusionnée) : elle ne change que 3 choses : `data/shop-settings.json` (`public: true` = plus de « noindex », robots.txt ouvert ; `site_url` = `https://www.vgthmind.org` = sitemap et adresses canoniques), et dans `checkout-worker/wrangler.toml` : `SITE_BASE = "https://www.vgthmind.org"` (liens des mails). Le jour J : « fusionne la bascule » = 1 commande, retour arrière = `git revert`.
- **Contrôle automatique** : `node outils/verifier-site.mjs https://www.vgthmind.org` (je le lance, 30 secondes) : toutes les adresses de l'ancien site, robots/sitemap/canonical, admin protégé, et que le Worker accepte le domaine pour le paiement.
- Le Worker accepte déjà `https://www.vgthmind.org` et `https://vgthmind.org` (`ALLOWED_ORIGIN`).

## Ce que tu dois avoir fait AVANT (aucun n'est faisable par moi)
1. **Stripe live** : BASCULE.md §1 (clé restreinte live + webhook live), puis moi : secrets + `LIVE_MODE=1`. Droits à cocher en plus (codes promo) : Écriture « Coupons » et « Promotion Codes ».
2. **Test avec ta vraie carte** sur une pièce fictive à 1 €, remboursée ensuite (BASCULE.md §1.6).
3. **Textes** relus : `CGV-A-VERIFIER.md` (médiateur, TVA).
4. **La veille** : IONOS → Domaines → vgthmind.org → DNS → ligne `www` → TTL **300 secondes**.

## Le jour J (mardi ou mercredi matin, toi dispo 1 h)
| # | Qui | Quoi | Durée |
|---|---|---|---|
| 1 | toi | dash.cloudflare.com → Workers & Pages → **vgthmind-shop** → onglet **Custom domains** → **Set up a custom domain** → `www.vgthmind.org` → Continue. Cloudflare affiche la cible à mettre dans le DNS : `vgthmind-shop.pages.dev` | 2 min |
| 2 | toi | IONOS → DNS → ligne **`www`** (CNAME) : remplace `vgthmind.bigcartel.com` par `vgthmind-shop.pages.dev` → Enregistrer. **Ne touche à rien d'autre** (pas MX, pas SPF, pas `_dmarc`, pas `resend`, pas `send`, pas la ligne `@`) | 2 min |
| 3 | toi | Retour sur Cloudflare, Custom domains : attends que `www.vgthmind.org` passe à **Active** (certificat HTTPS, 2 à 30 min). Pendant ce temps le site BigCartel reste visible pour certains visiteurs, puis tout le monde bascule | 2–30 min |
| 4 | moi | « fusionne la bascule » : je fusionne `bascule-prete` dans `main` (Cloudflare reconstruit, 1–2 min) et je déploie le Worker (`SITE_BASE`). Je note l'id de version pour le retour arrière | 5 min |
| 5 | moi | `node outils/verifier-site.mjs https://www.vgthmind.org` + je t'envoie la liste de contrôle iPhone (accueil, une fiche, panier, paiement 1 € remboursé, mail de commande, suivi, 404) | 10 min |
| 6 | toi | Test sur ton iPhone, ton lien Instagram compris. Tu dis « OK » | 10 min |

**Apex `vgthmind.org` (sans www)** : ne touche à rien au départ. La ligne `@` (hébergement IONOS) renvoie vers `www`, donc vers le nouveau site. Le contrôle de l'étape 5 vérifie qu'un lien SANS www (ex. `vgthmind.org/product/ch_0002`) arrive bien sur la même pièce. S'il arrive seulement sur l'accueil : IONOS → Domaines → vgthmind.org → **Redirection** → cocher « conserver le chemin / les sous-adresses ». Si IONOS ne le propose pas, l'autre solution (plus longue, à faire un autre jour) est de confier le DNS à Cloudflare.
**BigCartel** : ne résilie pas avant 1 à 2 semaines. Rien à y changer (le domaine n'y pointe plus).

## Retour d'urgence (1 clic chacun)
1. IONOS → ligne `www` → remets `vgthmind.bigcartel.com` : BigCartel revient en quelques minutes (TTL 300 s).
2. Moi : `git revert` de la fusion de bascule (site) ; Worker : `LIVE_MODE="0"` + clés de test + `npx wrangler@4 rollback <id noté à l'étape 4>`.
3. Rembourser dans Stripe les paiements éventuellement faits entre-temps.

## Après
Surveille Stripe et ta boîte contact@ pendant 48 h. Search Console : ajoute `www.vgthmind.org` et envoie `sitemap.xml`. Remets le TTL de `www` à 1 h. Le pop de « Add to cart » et les 3 pages légales : relis-les une dernière fois en ligne.
