# Panier (pays + port en direct), compta (Google Sheet) et export CSV — rapport

Rien n'est branché : tout est dans des fichiers nouveaux. Tests : `npm test` (47 tests). `docs/` est reconstruit (`node generator/build.js`).

## 1) Panier : sélecteur de pays + prix d'envoi en direct
| Fichier | Rôle |
|---|---|
| `assets/vg-shipping-view.js` | Partie pure : textes FR/EN (langue de la page, sinon du navigateur), prix, liste des pays Stripe triée (France, Canada, Belgique… en tête), message « pays non livré ». |
| `assets/vg-shipping-picker.js` | Partie navigateur : s'insère dans `.cart-footer`, liste déroulante (16 px, 44 px de haut = confortable sur iPhone), met à jour les montants « Shipping » et « Total », cache l'ancienne liste France/International, **bloque Checkout** si pays non choisi ou non livré. Pays mémorisé (`vg-shop-country`). Expose `window.VGShippingPicker.country()`. |
| `admin/shipping-calc.js` | Le même calcul que le Worker (déjà livré). Ajout : `blocked_countries` dans la grille (liste de codes pays refusés) → message « Je ne livre pas encore en … ». |
Texte si pays non livré — FR : « Je ne livre pas encore en Japon. Choisis un autre pays, ou écris-moi en DM Instagram : on trouvera une solution. » EN : « I don't ship to Japan yet. Pick another country, or DM me on Instagram and we'll work something out. »
Le prix affiché est une indication ; le Worker recalcule (voir `envoi.md`, étapes a-4 à a-6). La grille est lue sur `GET /shipping/config` (Worker), à défaut sur `/admin/shipping-config.json`.

### Lignes à ajouter
**`generator/build.js`**
- Copie des fichiers, à côté de la ligne 581 (`copyFileSync … vg-shop-cart.js`) :
```js
fs.copyFileSync(rel(ROOT, 'admin', 'shipping-calc.js'), rel(OUT_DIR, 'assets', 'vg-shipping-calc.js'));
fs.copyFileSync(rel(ROOT, 'assets', 'vg-shipping-view.js'), rel(OUT_DIR, 'assets', 'vg-shipping-view.js'));
fs.copyFileSync(rel(ROOT, 'assets', 'vg-shipping-picker.js'), rel(OUT_DIR, 'assets', 'vg-shipping-picker.js'));
```
- Injection, ligne 431 (remplace la ligne `const cartScript = …`) :
```js
const cartScript = '<script src="/assets/vg-shop-cart.js" defer></script>\n'
  + '<script src="/assets/vg-shipping-calc.js" defer></script>\n'
  + '<script src="/assets/vg-shipping-view.js" defer></script>\n'
  + '<script src="/assets/vg-shipping-picker.js" defer></script>';
```
(Si tu branches aussi la balise de trafic, ajoute-la dans la même chaîne.) Puis `node generator/build.js`.

**`assets/vg-shop-cart.js`** (non modifié)
1. Dans `checkout(btn)` (≈ l.325-328), corps JSON du `fetch(ENDPOINT + '/checkout', …)` : ajouter
```js
country: window.VGShippingPicker ? window.VGShippingPicker.country() : '',
```
et remplacer `region: region` par
```js
region: (window.VGShippingPicker && window.VGShippingPicker.country()) ? (window.VGShippingPicker.country() === 'FR' ? 'fr' : 'intl') : region,
```
2. Une fois le Worker branché sur la grille (`envoi.md`), les règles « France uniquement » par pièce n'ont plus lieu d'être : remplacer le corps de `franceOnly()` (l.232) par `return [];`.
3. Dans le `.then` du checkout, le Worker renvoie `409 { code: 'country_not_served' }` si le pays est refusé : dans la branche `else` (l.352-356) afficher `message = 'Pays non livré / Country not served.'` quand `res.data.code === 'country_not_served'`.

## 2) Compta : ventes et remboursements vers ton Google Sheet
| Fichier | Rôle |
|---|---|
| `checkout-worker/accounting-core.js` | Construit les lignes (pure, testée) et la signature HMAC-SHA256. |
| `checkout-worker/accounting.ts` | Envoi vers Apps Script, file d'attente KV, rejeu, routes admin. |
| `apps-script/compta.gs` | Script à coller dans ton Sheet (onglets **Ventes** et **Remboursements**, créés tout seuls). |

**Aucune donnée client** : ni nom, email, téléphone, adresse, ni même le pays (test automatique qui le vérifie). Une ligne de vente = date (Paris), n° de commande `VG-XXXXXX`, désignation des pièces, nature (« Vente de marchandises »), mode de règlement, pièces TTC, frais de port, remise, total encaissé, ID de paiement Stripe, clé technique. Remboursement = date, n° de commande, ID de paiement, montant remboursé, motif, clé.
**Sécurité** : le secret n'est jamais envoyé, seulement une signature HMAC de `horodatage.contenu` ; le script refuse une signature fausse ou un message de plus de 15 min. `COMPTA_URL` (adresse /exec) et `COMPTA_SECRET` sont des **secrets Cloudflare** : rien dans le dépôt. Les commandes de test Stripe sont ignorées (sauf `COMPTA_TEST=1`).
**Rejouable** : chaque ligne a une clé (id de session ou de remboursement) ; renvoyer la même ligne **met à jour** au lieu de dupliquer. Un envoi raté reste en file (`compta:q:…`, sans donnée client) et repart avec le cron ou `POST /admin/compta/replay` ; `POST /admin/compta/resync` renvoie tout l'historique (100 dernières).

### Mise en place (à faire par toi, dans cet ordre)
1. Google Sheet vierge → Extensions → Apps Script → colle `apps-script/compta.gs`.
2. Paramètres du projet → Propriétés du script → `SECRET` = une longue phrase au hasard (ne la mets nulle part ailleurs que dans les deux endroits ci-dessous).
3. Déployer → Application Web → exécuter en tant que toi, accès « Tout le monde » → copier l'adresse `/exec`.
4. Depuis `checkout-worker/` : `npx wrangler secret put COMPTA_URL` (adresse /exec) et `npx wrangler secret put COMPTA_SECRET` (la même phrase).
5. Stripe → Développeurs → Webhooks → ton endpoint → ajouter l'événement **`refund.created`** (en plus de ceux existants).
6. Déployer le Worker (toi), puis `POST /admin/compta/resync` pour remplir l'historique.

### Lignes à ajouter dans `checkout-worker/index.ts` (non modifié)
- Imports : `import { recordSale, recordRefund, replayPending, accountingRoutes } from './accounting';`
- `interface Env` : `COMPTA_URL?: string; COMPTA_SECRET?: string; COMPTA_TEST?: string;`
- Dans `processPaid`, après la ligne `await sendOrderEmails(env, s).catch(() => {});` :
```ts
await recordSale(env, s, await assignRef(env, String(s.id))).catch(() => {}); // jamais bloquant ; sans doublon
```
- Dans `webhook`, juste **avant** `if (event.type !== 'checkout.session.completed' && …)` :
```ts
if (event.type === 'refund.created') {
  let ref = '';
  const k = stripeKey(env);
  if (k.ok && typeof s.payment_intent === 'string') {
    const r = await stripeCall(k.value, 'GET', `/v1/checkout/sessions?payment_intent=${encodeURIComponent(s.payment_intent)}&limit=1`);
    const sid = r.data && r.data.data && r.data.data[0] && r.data.data[0].id;
    if (sid) ref = await assignRef(env, sid);
  }
  await recordRefund(env, s, ref).catch(() => {});
  return json({ received: true });
}
```
- Dans le bloc admin, avant `return json({ error: 'Not found' }, 404);` :
```ts
const k = stripeKey(env);
const stripeList = async (p: string) => (k.ok ? ((await stripeCall(k.value, 'GET', p)).data.data || []) : []);
const ar = await accountingRoutes(request, env, path, json, {
  paidSessions: async () => (await stripeList('/v1/checkout/sessions?status=complete&limit=100')).filter((x: any) => x.payment_status === 'paid'),
  refunds: () => stripeList('/v1/refunds?limit=100'),
  refFor: (id: string) => assignRef(env, id),
});
if (ar) return ar;
```
- `scheduled()` : `ctx.waitUntil(replayPending(env));`
À noter : `/webhook` ne passe pas par `/admin/`, donc aucune session admin n'est requise pour les ventes/remboursements automatiques.

## 3) Admin : `admin/export.html`
Export CSV des ventes par **mois, trimestre ou année** (par défaut : le mois précédent), aperçu du total et du nombre de ventes avant téléchargement. Format Excel FR : `;`, virgule décimale, dates `JJ/MM/AAAA`, CRLF, UTF-8 avec BOM, guillemets doublés, protection contre les formules (`=…` neutralisé). Colonnes identiques à l'onglet Ventes + ligne **TOTAL**. Commandes de test exclues (case à cocher pour les inclure). Fuseau Paris (une vente du 31/03 à 23 h UTC compte au 1er avril). Essai : `…/admin/export.html?demo=1`.
Ligne de menu à ajouter dans `admin/index.html` : `<a href="export.html" style="padding:8px 14px;border-radius:999px;background:#171717;color:#fff;text-decoration:none">Export</a>`
**Limites connues** : (1) l'export lit `GET /orders` qui ne renvoie que les **100 dernières commandes** Stripe : pour une année complète, il faudra ajouter la pagination (`starting_after`) dans `listOrders` ; la page prévient quand 100 commandes sont chargées. (2) Les remboursements ne figurent pas dans ce CSV (ils sont dans l'onglet Remboursements du Sheet) : les recettes déclarées sont les encaissements bruts.

## 4) Tests
`tests/shipping-view.test.mjs` (7), `tests/accounting.test.mjs` (11 : lignes sans donnée client, signature, file/rejeu avec KV et fetch simulés, routes admin, **le script Apps Script exécuté tel quel** avec des services Google simulés : signature valide/fausse/expirée, upsert sans doublon, onglets), `tests/export-csv.test.mjs` (6). Le picker a été vérifié une fois dans un navigateur headless à 390 px (FR → 8,00 ; CA → 25,00 ; sans pays → bouton bloqué).

## 5) Questions pour toi
1. Livre des recettes : confirme avec ton comptable/ta structure les colonnes et si l'**identité du client** doit y figurer (elle est volontairement absente ; elle reste consultable dans Stripe via le n° de commande).
2. Remises et frais de port : le total encaissé est enregistré TTC, port compris. Faut-il séparer la TVA (régime, franchise en base ?) — sinon rien à changer.
3. Frais Stripe : non récupérés (recettes brutes). Les veux-tu dans une colonne (appel Stripe supplémentaire) ?
