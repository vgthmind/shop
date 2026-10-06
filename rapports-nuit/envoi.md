# Frais d'envoi automatiques — rapport (nuit/envoi-trafic)

## 1) Comment ça marche aujourd'hui
- **Données** : chaque pièce du catalogue (`products.json`, hérité de BigCartel) porte une liste `shipping` : une ligne **France** (`country.code = "FR"`, `amount_alone`) et, parfois, une ligne **sans pays = International**. Pas de ligne internationale = « France uniquement ».
- **Panier** (`assets/vg-shop-cart.js`, `shippingFor` / `shippingTotal`) : le client choisit **France ou International** (liste déroulante, gardée dans le navigateur). Le port affiché = le **tarif le plus élevé** parmi les pièces (règle BigCartel : `amount_with_others = 0`). Pas de poids, pas de pays précis.
- **Worker** (`checkout-worker/index.ts`, fonction `checkout`, ~l.347-352) : relit le catalogue publié (jamais les prix du navigateur), recalcule le même « plus élevé du panier », et crée **une seule option d'expédition Stripe** à montant fixe (`Livraison France` / `Livraison internationale`).
- **Stripe** : région `fr` → adresse limitée à `FR` ; région `intl` → tous les pays Stripe sauf la France (Canada, BE, CH, LU, DE, GB, US en tête). Le prix est donc **le même pour tous les pays étrangers** (Canada = Japon).
- Limite structurelle : Stripe Checkout demande l'adresse **après** la création de la session ; il ne sait pas changer le prix selon le pays saisi. D'où la solution ci-dessous : **le pays est choisi dans le panier, avant le paiement**.

## 2) Ce qui est construit (rien n'est branché)
| Fichier | Rôle |
|---|---|
| `admin/shipping-calc.js` | Calcul pur (centimes entiers). Utilisé par le Worker, la page admin et les tests (même fichier). |
| `admin/shipping-config.json` | Grille : zones (FR, UE, Canada, Europe hors UE, Monde `*`), tranches de poids, supplément/kg, livraison offerte, max places/colis, poids max/colis, emballage, formats. **Tous les chiffres = « À REMPLACER PAR MES VRAIS TARIFS ».** |
| `admin/expedition.html` | Page admin (pas liée au menu) : grille, formats/poids par pièce, simulateur. Test local : `…/admin/expedition.html?local=1`. |
| `checkout-worker/shipping-worker.ts` | Lecture de la grille (KV `shipping:config`, sinon `SITE_BASE/admin/shipping-config.json`), prix recalculé depuis le **catalogue**, routes `/shipping/config`, `/shipping/quote` (public), `/admin/shipping` (GET/POST, admin). |
| `tests/shipping.test.mjs` | 14 tests (`npm test`) : simple, multi-pièces, gros colis, plusieurs colis, offert, pays non prévu, centimes. |

Règles du calcul : une pièce = un format (petit/moyen/gros) ou un poids précis ; un format occupe des « places » (gros = 3 par défaut) ; les pièces sont rangées par colis (poids décroissant) tant que places ≤ max et poids ≤ max ; chaque colis = poids + emballage → tranche de la zone ; total = somme des colis. Livraison offerte : si le montant des pièces (avant remise) ≥ seuil, pour les zones listées. Pays absent de toute zone et pas de zone `*` → refus `country_not_served`.

## 3) Comment brancher (3 fichiers que je n'ai pas touchés)

### a) `checkout-worker/index.ts`
1. En haut, avec les imports :
```ts
import { shippingRoutes, shippingForCart } from './shipping-worker';
```
2. Dans `fetch`, **juste avant** `if (path.startsWith('/admin/')) {` (routes publiques) :
```ts
if (path.startsWith('/shipping/')) {
  const r = await shippingRoutes(request, env, path, json, () => loadCatalog(env));
  if (r) return r;
}
```
3. Dans le bloc admin, **juste avant** `return json({ error: 'Not found' }, 404);` (l.227, après le garde `isAdmin`) :
```ts
const sr = await shippingRoutes(request, env, path, json, () => loadCatalog(env));
if (sr) return sr;
```
4. Dans `checkout()` : après le calcul de `region` (l.324) ajouter
```ts
const country = String(body.country || (region === 'fr' ? 'FR' : '')).toUpperCase();
if (!/^[A-Z]{2}$/.test(country)) return json({ error: 'Choisis le pays de livraison.' }, 400);
```
5. Après `const bySlug = …` et la boucle `problems` (avant la **réservation du stock**, l.341), calculer le port **côté Worker** :
```ts
const quote = await shippingForCart(env, catalog, wanted, country);
if (!quote.ok) return json({ error: 'Pays non livré.', code: quote.error }, 409);
```
   Remplacer l'ancien bloc `const shipping = Math.max(0, …)` (l.347-352) par `const shipping = quote.total;`.
6. Stripe : remplacer la liste de pays (l.381-385) par `params.set('shipping_address_collection[allowed_countries][0]', country);` (le client ne peut saisir **que** le pays payé), et le libellé (l.387) par `` `Livraison – ${quote.zoneName} (${quote.parcels.length} colis)` ``. Ajouter `params.set('metadata[country]', country);`.
7. Optionnel : supprimer le test `france_uniquement` (l.336) si tout se livre partout selon la grille.

Le montant envoyé à Stripe vient **uniquement** de `shippingForCart` (grille + catalogue côté serveur) ; le navigateur n'envoie que `slug`, `qty`, `country`.

### b) `assets/vg-shop-cart.js` (affichage du panier)
- Remplacer la liste France/International par une liste de pays (mémorisée dans `localStorage` comme `vg-shop-region`).
- Variable `quote = null` ; fonction `refreshQuote()` : `fetch(ENDPOINT + '/shipping/quote', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({items: items.map(it => ({slug: it.slug, qty: qty(it)})), country})}).then(r => r.json()).then(q => { quote = q; render(); })` ; l'appeler à chaque changement de panier ou de pays.
- `shippingTotal()` devient `return quote && quote.ok ? quote.total : 0;` ; si `quote.error === 'country_not_served'`, afficher « Pays non livré » et désactiver le bouton Payer.
- Dans le `fetch(ENDPOINT + '/checkout', …)` (l.325-328), ajouter `country: country` au corps JSON.
- L'affichage reste une **indication** : le Worker recalcule et c'est lui qui fixe le montant Stripe.

### c) Menu admin
Dans `admin/index.html`, avec les autres liens : `<a href="expedition.html" …>Envoi</a>` (non fait, comme demandé).

### d) Mise en service de la grille
Remplir la page admin → « Enregistrer » (écrit en KV via `/admin/shipping`). Tant que rien n'est enregistré, c'est `admin/shipping-config.json` du dépôt qui sert. Aucune modification du `wrangler.toml` (KV `HOLDS` déjà liée). Les CGV devront décrire ce mode de calcul (non touchées).

### Points d'attention
- La remise (code promo) est appliquée par Stripe **après** : le seuil « offert » se compare au montant avant remise.
- DOM-TOM (GP, MQ, RE…) tombent dans « Monde » tant qu'une zone dédiée n'existe pas (douane/tarif différents).
- Un client qui veut un autre pays que celui choisi doit revenir au panier (Stripe n'accepte que le pays payé).

## 4) Infos nécessaires de ta part
1. **Transporteur(s)** et leurs **vrais tarifs par tranche de poids** pour : France, UE, Canada, Europe hors UE, reste du monde (+ DOM-TOM ? États-Unis à part ?).
2. **Poids réel emballé de chaque pièce** (ou au moins son format petit/moyen/gros) ; poids des formats par défaut.
3. **Poids de l'emballage** d'un colis, **poids max** et **nombre max de pièces** par colis ; ce qu'une « grosse » pièce occupe.
4. **Livraison offerte** : oui/non, à partir de quel montant, pour quelles zones.
5. Tranches maximales par transporteur (au-delà de 2 kg ? supplément par kilo ?), pays que tu refuses de livrer.
6. Suivi / assurance inclus ou non (change les tarifs, à mentionner dans les CGV).
