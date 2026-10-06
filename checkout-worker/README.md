# Checkout Worker (paiement groupé Stripe)

Déployé : `https://vgthmind-shop-checkout.vgthm66.workers.dev`. Appelé par
`assets/vg-shop-cart.js` (bouton « Checkout / Payer » du panier).

## Ce qu'il fait

- `POST /checkout` `{ items: ["ch_0002", …], region: "fr" | "intl" }` →
  `{ url }` (page de paiement Stripe). Prix, stock et frais de port sont relus
  dans `https://vgthmind.github.io/shop/products.json`, jamais pris du
  navigateur. Pièce vendue ou « France uniquement » à l'international →
  `409 { problems }`, le panier se met à jour.
- Frais de port : un seul tarif, le plus élevé du panier pour la zone (règle
  BigCartel, `amount_with_others = 0`), en `shipping_options` Stripe ; adresse
  de livraison limitée à la France ou à tous les autres pays.
- Retour : `/shop/merci/?session_id=…` (succès) ou `/shop/paiement-annule/`.
- `GET /session?id=cs_…` → résumé pour la page merci.
- Session Stripe valable 30 min.

## Secrets (jamais dans le dépôt)

```
cd checkout-worker
npx wrangler secret put STRIPE_SECRET_KEY
```

Tant que `LIVE_MODE = "0"` (`wrangler.toml`), seule une clé `sk_test_…` est
acceptée.

## Redéployer

```
cd checkout-worker
npx wrangler deploy
```
