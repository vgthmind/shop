# Trafic du site — rapport (nuit/envoi-trafic)

## 1) Comparatif
| | **Cloudflare Web Analytics** (déjà actif : `cf_analytics_token`) | **Maison – Durable Object** (construit) | **Maison – Analytics Engine** |
|---|---|---|---|
| Coût | Gratuit | Gratuit tant que le Worker reste dans le plan gratuit (voir limites) ; le DO est déjà utilisé pour le stock | Réservé au plan Workers payant (~5 $/mois) d'après mes informations — **à vérifier** sur la page tarifs Cloudflare |
| Temps réel | **Non** : tableau de bord décalé de quelques minutes, pas de compteur « en ce moment » | **Oui** (battement toutes les 30 s, fenêtre 90 s) | Quasi (écriture rapide, mais requête SQL en différé de quelques secondes) ; pas de présence native |
| Données | Pages vues, visites, pages, référents, pays, appareils ; historique limité ; export peu pratique | Exactement ce que tu as demandé, conservé 13 mois | Très flexible (requêtes SQL), grosse capacité, rétention ~3 mois |
| Vie privée | Sans cookie, sans identifiant | Sans cookie ; visiteur = hachage à sel quotidien supprimé (voir §3) | Idem selon ce qu'on écrit |
| Limites | Pas de personnalisation, ne sait pas exclure « mes visites » finement | Un seul DO = point unique : ~dizaines de requêtes/s max ; plan gratuit **100 000 requêtes DO/jour et 100 000 requêtes Worker/jour** (partagées avec le paiement) | Écriture limitée par requête ; nécessite un token d'API pour lire hors Worker |
| Entretien | Aucun | Code à maintenir (module fourni + tests) | Code + requêtes SQL |

Ordre de grandeur du coût en requêtes : 1 page vue = 1 requête ; 1 battement = 1 requête (30 s). 1 000 visites/jour de ~3 min ≈ 3 000 vues + 6 000 battements ≈ 9 000 requêtes/jour : très sous 100 000. Au-delà d'environ 8 000 visites/jour, passer au plan payant ou espacer les battements (60 s).
**Recommandation** : garder Cloudflare Web Analytics en filet de sécurité (aucune maintenance) et brancher la solution maison pour le compteur « en ce moment » et « mes visites exclues ». Analytics Engine ne vaut le coup que si tu passes au plan payant et veux de l'historique SQL fin.

## 2) Ce qui est construit (rien n'est branché)
| Fichier | Rôle |
|---|---|
| `assets/vg-traffic.js` | Balise du navigateur (sans cookie, rien en mémoire locale). Envoie : page, domaine du référent, `?utm_source`, battement 30 s si page visible. **Ne fait rien** si : session admin active dans ce navigateur, URL `/admin`, « Ne pas me suivre » (DNT) activé. |
| `checkout-worker/traffic-core.js` | Logique pure testée : provenance (Instagram dont navigateur intégré, Google, Facebook, TikTok, YouTube…, Direct), mobile/tablette/ordinateur, robots, nettoyage du chemin (`/admin` refusé), jour (fuseau Paris), compteurs bornés (60 clés/catégorie), présence, résumé. |
| `checkout-worker/traffic.ts` | Durable Object `TrafficDO` + routes `POST /t`, `GET /admin/traffic?days=N`, `GET /admin/traffic/live`. |
| `admin/trafic.html` | Page admin « Trafic » (mobile d'abord, gros boutons, actualisation du direct toutes les 10 s). Essai sans Worker : `trafic.html?demo=1`. |
| `tests/traffic.test.mjs` | 8 tests (`npm test`). |

Serveur : refuse tout `POST /t` dont l'`Origin` n'est pas `ALLOWED_ORIGIN`, ignore les robots (UA), ne compte jamais un chemin contenant `admin`. Pays = en-tête Cloudflare (pas d'IP stockée).

## 3) Lignes à ajouter pour brancher

### `checkout-worker/wrangler.toml` (ajouter ; ne pas déployer sans ton accord)
```toml
[[durable_objects.bindings]]
name = "TRAFFIC"
class_name = "TrafficDO"

[[migrations]]
tag = "v2"
new_sqlite_classes = ["TrafficDO"]
```
(dans la section déjà existante des `durable_objects.bindings`, le bloc `[[durable_objects.bindings]]` se répète pour un 2e binding.)

### `checkout-worker/index.ts`
1. Imports : `import { trafficRoutes } from './traffic';` et, à côté de `export class StockDO`, `export { TrafficDO } from './traffic';`
2. Dans `interface Env` : `TRAFFIC: any; // DurableObjectNamespace<TrafficDO>`
3. Dans `fetch`, juste **avant** `if (path.startsWith('/admin/')) {` (route publique, aucune clé Stripe nécessaire) :
```ts
if (path === '/t') { const r = await trafficRoutes(request, env, path, json); if (r) return r; }
```
4. Dans le bloc admin, **avant** `return json({ error: 'Not found' }, 404);` (après le garde `isAdmin`) :
```ts
const tr = await trafficRoutes(request, env, path, json); if (tr) return tr;
```
5. CORS : l'en-tête `Access-Control-Allow-Origin` est déjà fixé par `/t` ; rien d'autre à changer.

### Chargement de la balise sur les pages — `generator/build.js`
- Copie (près de la ligne 581) : `fs.copyFileSync(rel(ROOT, 'assets', 'vg-traffic.js'), rel(OUT_DIR, 'assets', 'vg-traffic.js'));`
- Injection (ligne 431) : `const cartScript = '<script src="/assets/vg-shop-cart.js" defer></script>\n<script src="/assets/vg-traffic.js" defer></script>';`
- Puis `node generator/build.js` (règle docs/). Les pages `/admin` ne passent pas par ce gabarit : jamais comptées de toute façon.

### Menu admin — `admin/index.html`
`<a href="trafic.html" style="padding:8px 14px;border-radius:999px;background:#171717;color:#fff;text-decoration:none">Trafic</a>` à côté des autres liens.

### Déploiement (quand tu le décides)
`npx wrangler deploy` depuis `checkout-worker/` (migration v2 incluse) ; rien à créer à la main, aucun secret. Aucun changement à `LIVE_MODE`, `noindex` ni `robots.txt`.

## 4) Texte à ajouter dans la page confidentialité (`theme/pages/confidentialite.html`, non modifié)
Aujourd'hui : « …les visites sont mesurées avec Cloudflare Web Analytics, qui n'utilise aucun cookie et ne vous identifie pas. » (FR) / « …visits are measured with Cloudflare Web Analytics, which sets no cookie and does not identify you. » (EN). À **compléter** (garder la phrase actuelle tant que Cloudflare WA reste actif) par :

**FR** : « Je mesure aussi l'audience du site avec mon propre outil, sans cookie ni traceur. Pour chaque page vue, je compte uniquement : la page visitée, le site d'où vous venez (par exemple Instagram ou Google), votre pays et le type d'appareil (mobile ou ordinateur). Votre adresse IP n'est jamais enregistrée : elle sert uniquement à calculer, pendant la journée, un code anonyme qui évite de compter deux fois la même personne ; ce code utilise une clé aléatoire détruite chaque nuit et est effacé à minuit, il ne permet donc ni de vous reconnaître d'un jour à l'autre ni de vous identifier. Seuls des totaux (sans lien avec une personne) sont conservés 13 mois. Mes propres visites et les pages d'administration ne sont pas comptées, et l'option « Ne pas me suivre » de votre navigateur est respectée. »

**EN** : « I also measure site audience with my own tool, with no cookie and no tracker. For each page view I only count: the page visited, the site you came from (for example Instagram or Google), your country and the type of device (mobile or computer). Your IP address is never stored: it is only used, during the day, to compute an anonymous code that avoids counting the same person twice; this code relies on a random key destroyed every night and is erased at midnight, so it cannot recognise you from one day to the next or identify you. Only totals (not linked to any person) are kept, for 13 months. My own visits and the administration pages are not counted, and your browser's “Do Not Track” setting is respected. »

Note : ces choix (pas de cookie, pas d'IP stockée, finalité statistique seule, conservation courte) sont ceux de l'exemption de consentement de la CNIL pour la mesure d'audience ; à faire relire si tu as un doute, ce n'est pas un avis juridique.

## 5) Comment tester en local
- Tests : `npm test` (22 tests).
- Page Trafic avec données de démo : `cd docs && python3 -m http.server 8765` puis `http://localhost:8765/admin/trafic.html?demo=1` (idem iPhone sur le même réseau).
- Test du Worker réel (sans déployer) : `cd checkout-worker && npx wrangler dev` après avoir ajouté les lignes ci-dessus ; `curl -X POST -H 'Origin: https://vgthmind.github.io' -H 'User-Agent: Mozilla/5.0 (iPhone) Mobile' -d '{"p":"/shop/","r":"https://l.instagram.com/"}' localhost:8787/t`.
