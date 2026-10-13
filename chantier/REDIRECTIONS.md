# Anciennes URL (vgthmind.org / Big Cartel) → nouveau site — 2026-10-12

Méthode : plan du site de l'ancienne boutique (`sitemap.xml`, 38 adresses) comparé à celui du nouveau (`docs/sitemap.xml`) + test de quelques adresses connues. **Rien n'est mis en ligne.**

## Résultat
- **Les 37 adresses produit/catégorie/accueil de l'ancien site existent à l'identique** sur le nouveau (`/products`, `/product/<nom>`, `/category/<nom>`, `/contact`, `/cart`). Même nom de pièce = même adresse. Aucune pièce de l'ancien site n'a disparu du nouveau catalogue.
- Donc **si le nouveau site prend la racine de vgthmind.org (réglage `BASE_PATH = ''`), presque rien ne casse.**
- Si au contraire la boutique reste sous `/shop/` (adresse actuelle `vgthmind.github.io/shop/`), **tout l'ancien chemin casse** (`/product/ch_0002` → `/shop/product/ch_0002`).

## Ce qui casserait
| Ancienne adresse | Nouveau site | Effet | Redirection proposée |
|---|---|---|---|
| `/products.xml` (flux Big Cartel) | **existe maintenant** (flux RSS Google Merchant / catalogue Meta, généré au build) | OK : même adresse | à lire par Google Merchant / Meta s'ils l'utilisaient (rien dans le dépôt ne le prouve : à vérifier dans Meta Commerce Manager et Merchant Center) |
| `/products?page=2`, `/products?category=…`, `/products?search=…` | page `/products` sans ces filtres côté serveur | atterrit sur la liste complète | rien à faire (la liste complète est servie) |
| `/product/<nom>` d'une pièce **vendue/supprimée** plus tard | page « Sold out » tant que la fiche existe ; 404 si la fiche est supprimée | 404 | `404.html` : renvoyer vers `/products` |
| `/contact` | existe | OK | — |
| Toute adresse si on garde `/shop/` | préfixe `/shop` | 404 | voir plus bas |
| `/admin` (Big Cartel) | admin différent (`/admin/…` du nouveau) | sans objet | — |
| Liens d'Instagram/TikTok/mails déjà envoyés pointant vers une pièce précise | idem ci-dessus | OK si racine | — |

## Si le site reste sous /shop/ : règles à poser (ne sont PAS en ligne)
GitHub Pages ne sait pas faire de vraies redirections serveur. Deux possibilités :
1. **Recommandé** : faire prendre la racine au nouveau site (`BASE_PATH = ''`, déjà dans ta liste « Reste (toi) ») → aucune redirection nécessaire.
2. Sinon, règles Cloudflare/IONOS (301) :
   - `/product/*` → `/shop/product/$1`
   - `/category/*` → `/shop/category/$1`
   - `/products` → `/shop/products`
   - `/cart` → `/shop/cart`
   - `/contact` → `/shop/contact`

## Adresses à surveiller le jour du passage
- Le sitemap (`sitemap.xml`) doit pointer vers `https://vgthmind.org/…` et non `vgthmind.github.io/shop/…` (réglage `site_url`).
- Ancien domaine : conserver la même orthographe `www` ou sans `www` : l'ancien sitemap utilise `https://www.vgthmind.org/…`. Prévoir que `vgthmind.org` et `www.vgthmind.org` mènent au même site.
- Pièce de test fictive : retirée du catalogue (elle apparaissait brièvement dans le plan du site).
