# Checkout Worker (optionnel, pas déployé)

**Pas nécessaire pour vendre dès maintenant.** Tant que ce Worker n'est pas
déployé, le panier (`assets/vg-shop-cart.js`) affiche un lien de paiement
Stripe par pièce (`stripe_payment_link`, configuré dans `admin/`) — ça
suffit pour un catalogue de pièces uniques où chaque paiement est de toute
façon distinct.

Ce Worker ne devient utile que le jour où tu veux un **paiement groupé**
(plusieurs pièces payées en une seule fois, frais de port calculés une
seule fois pour tout le panier) : il crée une session Stripe Checkout côté
serveur pour l'ensemble du panier, à partir des données déjà présentes
côté site (prix, frais de port France/international — mêmes données que
`data/catalog.json`), sans jamais exposer ta clé secrète Stripe au
navigateur.

## Déploiement

1. Compte [Stripe](https://dashboard.stripe.com/) (si pas déjà fait) — clé
   secrète dans Dashboard > Developers > API keys. **Jamais collée dans ce
   dépôt.**
2. `wrangler.toml` : renseigne `account_id` (voir `oauth-worker/README.md`
   pour la procédure `wrangler login`/`wrangler whoami`, déjà faite une
   fois pour ce compte Cloudflare).
3. `wrangler secret put STRIPE_SECRET_KEY` (colle la clé quand demandé).
4. `npx wrangler deploy` — note l'URL affichée (`https://<nom>.workers.dev`).
5. Dans `assets/vg-shop-cart.js`, pose
   `window.VG_SHOP_CHECKOUT_ENDPOINT = "https://<nom>.workers.dev"` (une
   ligne, en haut du fichier) et relance `node generator/build.js`. Le
   panier affichera alors un bouton "Payer tout le panier" en plus des
   liens par pièce.

## Ce qu'il fait

Reçoit `{ items: [{slug, name, price, shipping_fr, shipping_intl}], region: "fr"|"intl" }`
en POST, calcule les frais de port (même règle que le panier front : le
plus élevé des frais de port des pièces du panier, les frais BigCartel
importés n'ajoutant rien au-delà de la première pièce — voir
`assets/vg-shop-cart.js`), crée une session Stripe Checkout (prix définis à
la volée via `price_data`, pas besoin de produits Stripe pré-créés) et
renvoie `{ url }` à ouvrir pour payer. CORS limité à `ALLOWED_ORIGIN`
(`https://vgthmind.github.io`, voir `wrangler.toml`).
