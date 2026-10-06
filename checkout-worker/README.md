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

- Stock : `GET /stock` (public), compteur par pièce tenu dans un Durable
  Object ; sauvegarde quotidienne (cron) dans KV.
- Webhook Stripe `POST /webhook` : confirme la vente, envoie l'alerte et la
  confirmation client par Resend.
- Admin (Stock, Commandes) : connexion GitHub via `/auth` et `/callback` (seul
  le compte `ADMIN_GITHUB_LOGIN` passe ; ce Worker sert aussi de relais à
  Sveltia). Il rend une session signée de 30 jours, gardée dans le navigateur
  (localStorage, pas de cookie : Safari bloque les cookies tiers), envoyée en
  `Authorization: Bearer vgs.…` et renouvelée par `POST /admin/renew`. Les
  pages admin ne gardent pas le jeton GitHub.

## Secrets (jamais dans le dépôt)

```
cd checkout-worker
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put ALERT_EMAIL
```

Tant que `LIVE_MODE = "0"` (`wrangler.toml`), seule une clé `sk_test_…` est
acceptée. Changer `SESSION_SECRET` déconnecte l'admin partout.

## Redéployer

```
cd checkout-worker
npx wrangler deploy
```
