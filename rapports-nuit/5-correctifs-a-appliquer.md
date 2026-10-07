# 5 — Correctifs à appliquer toi-même (fichiers que je n'ai pas le droit de toucher)

Ces fichiers ont du travail non commité sur ton PC : `checkout-worker/index.ts`, `checkout-worker/emails.ts`, `assets/vg-shop-cart.js`, la page CGV (`theme/pages/infos-conditions-generales.html`).
Pour chaque point : l'identifiant du rapport d'audit (rapport 2), le fichier, le texte **avant** (à chercher tel quel : les numéros de ligne sont ceux de `main` au 2026-10-07 et ont peut-être bougé chez toi), le texte **après**.
Rien de ce qui suit n'est appliqué. Après toute modification de `theme/` : `node generator/build.js` avant de commiter. Après modification du Worker : `cd checkout-worker && npx wrangler deploy` (je ne déploie jamais).
Ordre conseillé : 1 → 2 (immédiats, sans risque), puis 3 à 8 (Worker), puis 9 à 11 (textes, après tes décisions).

---

## 1. Retirer ton prénom du code (audit A8)

`checkout-worker/index.ts`, ligne 81

```diff
-// une adresse de livraison, sauf la France (decision de Jules, 2026-10-06).
+// une adresse de livraison, sauf la France (decision du 2026-10-06).
```

Ton prénom n'apparaît nulle part ailleurs dans les fichiers actuels (vérifié avec `git grep`, y compris `docs/`). **Mais il est dans l'historique git** : cette ligne (et ses versions précédentes) figure dans environ 70 commits de `index.ts`. Les auteurs des commits sont « vgthmind » (pas de prénom).

### Options pour l'historique (je ne réécris RIEN, c'est ta décision)

| Option | Effet | Risques / limites |
|---|---|---|
| **A. Ne rien faire** | La ligne reste visible dans l'historique public (page « History » du fichier, commits). | Aucun risque technique. Quelqu'un qui cherche peut la trouver. C'est un prénom dans un commentaire, sans autre donnée. |
| **B. Réécrire l'historique** (`git filter-repo --replace-text`, puis `git push --force`) | Le texte disparaît de toutes les versions de la branche `main`. | Commits à **identifiants changés** : toute copie locale (ton PC, ce qui est « seulement sur ton PC ») doit être re-clonée ou réalignée, sous peine de conflits. Les copies déjà faites par des tiers, les caches de GitHub, les vues « commit » accessibles par ancien identifiant et les pull requests déjà ouvertes peuvent **rester accessibles** (GitHub peut purger sur demande via son support). Le GitHub Action pousse aussi des commits : à suspendre pendant l'opération. À ne faire qu'avec une sauvegarde complète. |
| **C. Nouveau dépôt à l'historique propre** (un seul commit « état actuel ») | Plus aucune trace dans le nouveau dépôt. | Perte de l'historique (il peut être gardé dans un dépôt privé), changement d'adresse GitHub Pages (`vgthmind.github.io/shop`) et de `repo:` dans `admin/config.yml`, OAuth App GitHub, `ALLOWED_ORIGIN`, secrets, DNS à revoir. Lourd. |
| **D. Rendre le dépôt privé** | L'historique n'est plus public. | GitHub Pages sur dépôt privé demande un abonnement payant ; coupe aussi la lecture publique de l'admin si elle en dépend. |

Mon avis : A suffit pour un simple prénom en commentaire ; B seulement si c'est important pour toi, et alors avant tout lancement (moins de copies externes).

---

## 2. CGV : fautes de français (audit C5, C4)

`theme/pages/infos-conditions-generales.html` (partie française, vers les lignes 21 à 26)

```diff
-N'h&eacute;sitez pas a venir poser vos questions en DM sur Instagram !
+N'h&eacute;sitez pas &agrave; venir poser vos questions en DM sur Instagram&nbsp;!
```
```diff
-conceptualis&eacute; et r&eacute;alis&eacute; par moi m&ecirc;me.
+conceptualis&eacute; et r&eacute;alis&eacute; par moi-m&ecirc;me.
```
```diff
-fournisseurs locaux de marques de luxes qui se d&eacute;barrassent
+fournisseurs locaux de marques de luxe qui se d&eacute;barrassent
```
```diff
-<p>-Stylisme/Mod&eacute;lisme: dessins
+<p>- Stylisme / Mod&eacute;lisme&nbsp;: dessins
-<p>-Recherche de mati&egrave;res: fournisseurs
+<p>- Recherche de mati&egrave;res&nbsp;: fournisseurs
-<p>-Montage: d&eacute;coupe
+<p>- Montage&nbsp;: d&eacute;coupe
```
(« gamme de montage » est un vrai terme de métier : à laisser.) Équivalent anglais, à harmoniser : `-Design/Patternmaking:` → `- Design / Patternmaking:` etc.

---

## 3. Code promo absent des e-mails, de la page Merci et de /suivi (audit B1.2)

Constat : le total payé inclut la remise Stripe, mais aucune ligne « Remise » n'est affichée (articles + port ≠ total).

**a) `checkout-worker/emails.ts`, type `OrderData` (vers la ligne 20)**
```diff
   shipping: string;
+  discount?: string; // remise (code promo), deja formatee, vide si aucune
   total: string;
```

**b) `T.fr` et `T.en` (vers les lignes 63 et 89)** — ajouter une clé à côté de `shipping`
```diff
     shipping: 'Livraison',
+    discount: 'Remise',
```
```diff
     shipping: 'Shipping',
+    discount: 'Discount',
```

**c) `itemsTable` (vers la ligne 138)** — insérer une ligne avant « Livraison »
```diff
   const totals = withTotals
-    ? `<tr><td colspan="2" style="padding:10px 0 4px;font:14px ${FONT};color:${MUTED}">${t.shipping}</td>...
+    ? (o.discount ? `<tr><td colspan="2" style="padding:10px 0 0;font:14px ${FONT};color:${MUTED}">${t.discount}</td><td align="right" style="padding:10px 0 0;font:14px ${FONT};color:${MUTED};white-space:nowrap">- ${esc(o.discount)}</td></tr>` : '')
+      + `<tr><td colspan="2" style="padding:10px 0 4px;font:14px ${FONT};color:${MUTED}">${t.shipping}</td>...
```
(ne pas toucher à la fin de la chaîne ; seul le début de l'expression change.)

**d) Versions texte : `customerEmail` (vers la ligne 175) et `sellerEmail` (vers la ligne 233)**
```diff
-    `${t.shipping} : ${o.shipping}`, `${t.total} : ${o.total}`, '',
+    ...(o.discount ? [`${t.discount} : - ${o.discount}`] : []), `${t.shipping} : ${o.shipping}`, `${t.total} : ${o.total}`, '',
```
```diff
-    `Frais de port : ${o.shipping}`, `Total : ${o.total}`, '',
+    ...(o.discount ? [`Remise : - ${o.discount}`] : []), `Frais de port : ${o.shipping}`, `Total : ${o.total}`, '',
```

**e) `checkout-worker/index.ts`, `buildOrder` (vers la ligne 519)**
```diff
     shipping: money(o.shipping_cost?.amount_total || 0),
+    discount: o.total_details?.amount_discount ? money(o.total_details.amount_discount) : '',
     total: money(o.amount_total),
```

**f) Page /suivi : `trackOrder` (vers la ligne 839) et `session` (vers la ligne 410)**
```diff
     shipping: (s.shipping_cost?.amount_total || 0) / 100,
+    discount: (s.total_details?.amount_discount || 0) / 100,
     total: s.amount_total / 100,
```
(les deux fonctions ; `session()` a la même ligne `shipping:`).

**g) `assets/vg-shop-cart.js`, rendu du suivi (vers la ligne 548)** — avant la ligne « Livraison »
```diff
+        + (d.discount ? '<div class="cart-subtotal vg-cart-line"><span class="cart-subtotal__label">' + esc(t.discount) + ':</span><span class="cart-subtotal__amount">- ' + money(d.discount) + '</span></div>' : '')
         + '<div class="cart-subtotal vg-cart-line"><span class="cart-subtotal__label">' + esc(t.shipping) + ':</span>...
```
et ajouter `discount: 'Remise'` (fr) / `discount: 'Discount'` (en) dans les deux tables de textes du suivi (vers les lignes 464 et 475). La page Merci (vers la ligne 444) peut recevoir la même ligne avec `s.discount`.

---

## 4. E-mails en français aussi pour la Belgique, la Suisse, etc. (audit B1.3)

`checkout-worker/emails.ts`, ligne 47

```diff
-export const langFor = (country: string) => (String(country).toUpperCase() === 'FR' ? 'fr' : 'en');
+// Pays francophones (France, DROM-COM, Monaco, Belgique, Luxembourg, Suisse) : e-mails en français.
+// Le Canada est volontairement en anglais (Québec / reste du pays non distinguables par pays) : à décider.
+const FR_COUNTRIES = ['FR', 'MC', 'BE', 'LU', 'CH', 'GP', 'MQ', 'GF', 'RE', 'YT', 'PM', 'BL', 'MF', 'NC', 'PF', 'WF'];
+export const langFor = (country: string) => (FR_COUNTRIES.includes(String(country).toUpperCase()) ? 'fr' : 'en');
```
Effet de bord : le lien « suivi » (`orderUrl`, `&l=…`) et le mail vendeur (« Langue du mail client ») suivent automatiquement.

---

## 5. Acceptation des CGV par case à cocher (audit B1.5)

`checkout-worker/index.ts`, vers les lignes 365-366

```diff
-  params.set('custom_text[submit][message]',
-    `En payant, tu acceptes les conditions de vente : ${env.SITE_BASE}/infos-conditions-generales — By paying you accept our terms.`);
+  params.set('consent_collection[terms_of_service]', 'required');
+  params.set('custom_text[terms_of_service_acceptance][message]',
+    `J'accepte les conditions de vente / I accept the terms of sale : ${env.SITE_BASE}/infos-conditions-generales`);
```
**Condition** : dans le tableau de bord Stripe (Réglages → Informations publiques), renseigner l'adresse des CGV ; sans elle Stripe refuse la création de session (erreur 400). À tester en mode test d'abord.

---

## 6. Limiter les appels publics (audit B2.9, B2.10)

**a) `/checkout` : plafond par adresse IP.** `checkout-worker/index.ts`, début de `checkout()` (juste après `let body…`)
```diff
 async function checkout(request: Request, env: Env, key: string, json: JsonFn): Promise<Response> {
+  // Un robot pourrait ouvrir des sessions en boucle et bloquer tout le stock 32 min : 12 sessions / 15 min / IP.
+  const ip = request.headers.get('CF-Connecting-IP') || 'inconnue';
+  if ((await bump(env, 'rl:co:' + ip)) > 12) return json({ error: 'Trop de tentatives, réessaie dans quelques minutes.' }, 429);
   let body: { items?: unknown; region?: unknown; cart_id?: unknown };
```
(`bump` existe déjà, fenêtre de 15 min. Réglable. Les paniers abandonnés libèrent leur réservation via `/release` ou l'expiration.)

**b) `/status` : ne plus l'exposer publiquement.** `checkout-worker/index.ts`, vers la ligne 205
```diff
-      if (path === '/status') return await status(env);
+      if (path === '/status') {
+        if (!(await isAdmin(request, env))) return json({ error: 'Non autorisé.' }, 401);
+        return await status(env);
+      }
```
Conséquence : la page ne s'ouvre plus dans le navigateur sans jeton ; la consulter depuis l'admin (même mécanisme `Authorization: Bearer` que `/orders`). Variante sans changer l'usage : supprimer le préfixe de clé affiché (`(${key.slice(0, 7)}…)`, vers la ligne 624) et l'appel `fetch('https://api.stripe.com/v1/balance')`.

---

## 7. Pays proposés à l'international (audit B2.11)

`checkout-worker/index.ts`, lignes 82-92 (`STRIPE_COUNTRIES`) : la liste est celle de **tous** les pays acceptés par Stripe (254 codes, dont `RU`, `BY` et des codes qui ne sont pas des destinations : `ZZ`, `AC`, `TA`, `AQ`, `BV`, `GS`, `TF`…).
**Décision à prendre avec ta grille Colissimo / tes frais d'envoi** : restreindre à une liste blanche. Proposition de départ (à valider contre le tarif Colissimo réel) :

```ts
const STRIPE_COUNTRIES = (
  'AT BE BG HR CY CZ DK EE FI DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE ' // Union européenne (hors France)
  + 'GB CH NO IS LI MC AD SM VA ' // Europe hors UE
  + 'CA US AU NZ JP KR SG HK AE IL MX BR' // monde : à ajuster
).split(' ');
```
La liste `FIRST` (Canada en premier, etc.) dans `checkout()` reste valable. Les DROM-COM (`GP MQ GF RE YT PM BL MF NC PF WF`) sont des destinations françaises mais **hors zone « France »** du Worker : à classer (zone France ou à part).

---

## 8. Remboursements : indiquer « remboursée », remettre la pièce en vente (audit B1.4, B2.12)

Aujourd'hui `webhook()` ignore tout sauf `checkout.session.completed / expired / async_payment_succeeded`.

**Dans Stripe** : ajouter l'événement `charge.refunded` à l'endpoint du webhook (Développeurs → Webhooks).

**`checkout-worker/index.ts`, dans `webhook()`**, avant le test `if (event.type !== 'checkout.session.completed' …`
```ts
  if (event.type === 'charge.refunded') {
    await processRefund(env, s); // s = la charge
    return json({ received: true });
  }
```
**Nouvelle fonction** (à côté de `processPaid`)
```ts
// Remboursement : on retrouve la commande (session) par le paiement, on la marque « remboursée » (KV),
// et on previent l'admin. La pièce n'est PAS remise en stock automatiquement (elle n'est pas forcément
// revenue) : elle se remet en vente à la main, page Stock. Total ou partiel selon montant.
async function processRefund(env: Env, charge: any) {
  const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : '';
  if (!pi || !env.STRIPE_SECRET_KEY) return;
  const found = await stripeCall(env.STRIPE_SECRET_KEY, 'GET', `/v1/checkout/sessions?payment_intent=${encodeURIComponent(pi)}&limit=1`);
  const session = found.ok && found.data.data && found.data.data[0];
  if (!session) return;
  const full = charge.amount_refunded >= charge.amount;
  await env.HOLDS.put('refunded:' + session.id, JSON.stringify({ at: Math.floor(Date.now() / 1000), amount: charge.amount_refunded / 100, full }));
  // + e-mail d'alerte (resendSend) et, à terme, ligne négative vers la compta (rapport 3).
}
```
**Admin « Commandes »** : dans `listOrders()`, lire `env.HOLDS.get('refunded:' + s.id)` à côté de `shipped:` / `preparing:` et renvoyer `refunded`; `admin/commandes.html` (que je peux modifier si tu le souhaites) affiche alors « Remboursée ».
**Remise en stock automatique** : possible via une méthode `restock(refundId, items)` du Durable Object, idempotente (`r:<id>`), à n'appeler que sur remboursement **total** : je te la fournis sur demande ; je ne l'ai pas mise ici parce que remettre en vente une pièce unique que le client n'a pas encore renvoyée peut provoquer une double vente.

---

## 9. Liste des commandes : plus de 100 paiements (audit B2.13)

`checkout-worker/index.ts`, `listOrders()` (vers la ligne 701)
```diff
-  const stripe = await stripeCall(key, 'GET', '/v1/checkout/sessions?status=complete&limit=100&expand[]=data.line_items&expand[]=data.line_items.data.price.product');
-  if (!stripe.ok) return json({ error: stripe.data.error?.message || 'Erreur Stripe' }, 502);
+  // Jusqu'à 5 pages de 100 (500 commandes) ; au-delà : export CSV (rapport 3) ou cache KV.
+  const sessions: any[] = [];
+  let after = '';
+  for (let page = 0; page < 5; page++) {
+    const r = await stripeCall(key, 'GET', '/v1/checkout/sessions?status=complete&limit=100&expand[]=data.line_items&expand[]=data.line_items.data.price.product' + (after ? '&starting_after=' + after : ''));
+    if (!r.ok) return json({ error: r.data.error?.message || 'Erreur Stripe' }, 502);
+    sessions.push(...(r.data.data || []));
+    if (!r.data.has_more) break;
+    after = r.data.data[r.data.data.length - 1].id;
+  }
```
et remplacer plus bas `for (const s of stripe.data.data || []) {` par `for (const s of sessions) {`. Attention au nombre d'appels internes (Cloudflare limite à 50 sous-requêtes par exécution sur le plan gratuit : chaque commande fait aussi 3 lectures KV, d'où le plafond de 500 qui est déjà optimiste ; à tester). Mettre aussi à jour le texte « Sur les 100 derniers paiements » de `admin/commandes.html`.

---

## 10. Panier : libellés bilingues (audit B2.14)

`assets/vg-shop-cart.js`
```diff
-      btn.textContent = 'Un instant…';
+      btn.textContent = 'One moment… / Un instant…';
```
(vers la ligne 324)
```diff
-            message = 'Payment unavailable right now / Paiement indisponible pour le moment (' + (res.data.error || 'erreur') + ').';
+            message = 'Payment unavailable right now / Paiement indisponible pour le moment.';
```
(vers la ligne 359 : on n'affiche plus le texte d'erreur brut de Stripe au client)
```diff
-          + '...data-slug="' + esc(it.slug) + '">Remove<span class="visually-hidden"> '
+          + '...data-slug="' + esc(it.slug) + '">Remove / Retirer<span class="visually-hidden"> '
```
(vers la ligne 270 ; ne remplacer que le mot « Remove » juste après `">`.) Les autres libellés du panier (« Subtotal », « Shipping », « Total », « Checkout ») sont des mots courants identiques ou proches en français ; à traduire seulement si tu le souhaites.

---

## 11. CGV : textes à rédiger après tes décisions (audit A3, A4, A5)

Les CGV sont ta décision et celle de ton juriste : voici des **propositions de rédaction**, avec `[crochets]` pour ce qui dépend de toi. À faire valider avant mise en ligne.

**a) Livraison (A3, A4)** — `infos-conditions-generales.html`, paragraphe « SHIPPING & PAYMENT » (vers la ligne 16) / « LIVRAISON & PAIEMENT » (vers la ligne 34)
Avant : « Shipping via Colissimo, with rates and timing calculated by weight and destination at checkout. » / « Livraison via Colissimo, délais et frais calculés selon le poids et la destination au moment de la commande. »
Après (à ajuster selon la grille finale) :
> EN: Shipping via Colissimo. The shipping fee is shown in your cart and at checkout, depending on the destination [(France / international)]. Orders are prepared within [X] working days; delivery usually takes [X–Y] working days in France and [X–Y] working days abroad.
> FR : Livraison via Colissimo. Les frais de livraison s'affichent dans le panier et au paiement, selon la destination [(France / international)]. Les commandes sont préparées sous [X] jours ouvrés ; la livraison prend en général [X à Y] jours ouvrés en France et [X à Y] jours ouvrés à l'étranger.

Mettre aussi à jour `generator/shop-pages/merci.html` (« Ta pièce part sous quelques jours ») avec le même délai de préparation (fichier que je peux modifier : dis-moi le délai).

**b) Rétractation : modalités (A4)** — à ajouter sous « WITHDRAWAL RIGHT » / « DROIT DE RÉTRACTATION »
> EN: To withdraw, tell me within 14 days of receiving your order (by e-mail or Instagram DM, clearly stating your decision). Send the piece back within 14 days after that, unworn and in its original condition. [Return shipping costs are borne by the buyer.] You will be refunded within 14 days of my receiving the piece, with the same payment method.
> FR : Pour vous rétracter, prévenez-moi dans les 14 jours suivant la réception de votre commande (par e-mail ou en DM Instagram, en exprimant clairement votre décision). Renvoyez la pièce dans les 14 jours suivants, non portée et en l'état d'origine. [Les frais de retour sont à la charge de l'acheteur.] Le remboursement intervient dans les 14 jours suivant la réception de la pièce, avec le même moyen de paiement.

**c) Pièces « personnalisées » (A5)** — reformulation proposée de la phrase « IMPORTANT » et de la clause (L221-28 3°) pour distinguer ce qui est **déjà fabriqué** (y compris les pièces customisées à l'aérographe vendues sur la boutique : droit de rétractation applicable) de ce qui est **fabriqué à la demande du client** (création sur commande par DM : non reprise sauf défaut) :
> FR : Les pièces présentées sur la boutique, y compris les pièces customisées, bénéficient du droit de rétractation de 14 jours. Les créations réalisées sur-mesure ou sur demande personnalisée du client (commande passée par message) ne sont ni reprises ni échangées, sauf défaut de fabrication (art. L221-28 3° du Code de la consommation).
Même texte à reprendre dans `checkout-worker/emails.ts` (`withdrawal`, vers les lignes 72 et 98).

**d) Médiateur (A1) et adresse (A2)** : ajouter dans les CGV un paragraphe « Médiation » (nom, adresse web, adresse postale du médiateur choisi) et dans `theme/pages/mentions-legales.html` (lignes 3 et 9) l'adresse complète de l'activité. Dès que tu me donnes les informations, je peux faire la partie mentions légales (hors CGV) ; le commentaire à remplacer est la ligne 6.

**e) TVA (B1.6)** : la mention actuelle cite « art. L. 223-3 du CIBS ». À confirmer avec ton service des impôts / ton relevé d'entreprise : la formule habituelle de la franchise en base est « TVA non applicable, art. 293 B du CGI ». Si confirmé, remplacer dans `theme/pages/mentions-legales.html` (lignes 3 et 9, partie que je peux modifier sur ton ordre) et l'ajouter près du prix au paiement.
