# Passerelle OAuth (optionnelle)

**Non necessaire pour un usage solo.** Voir `README.md` (racine du depot),
section "Securite" / "Connexion" : avec Sveltia CMS, un jeton GitHub
"fine-grained" suffit et n'a besoin d'aucun serveur.

Ce dossier ne devient utile que si un jour tu veux donner acces a
l'interface de gestion (`admin/`) a quelqu'un d'autre que toi, sans lui
donner directement un jeton GitHub sur ton compte — dans ce cas seulement,
deployer ce Worker permet une vraie connexion "avec son propre compte GitHub".

Code recupere tel quel (licence MIT, voir `LICENSE.txt`) depuis
[ottmartens/decap-cms-github-oauth-provider-cloudflare](https://github.com/ottmartens/decap-cms-github-oauth-provider-cloudflare) —
compatible avec Sveltia CMS car les deux utilisent le meme protocole
d'authentification GitHub OAuth (`base_url` + `/auth` + `/callback`).

## Si besoin un jour : etapes de deploiement

1. [Creer une GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app) —
   noter le Client ID, generer et noter le Client Secret.
2. Compte [Cloudflare](https://dash.cloudflare.com/) (gratuit).
3. `npm install --global wrangler`, puis `wrangler login`, puis `wrangler whoami`
   pour recuperer ton `account_id` — le mettre dans `wrangler.toml`.
4. `wrangler secret put CLIENT_ID` et `wrangler secret put CLIENT_SECRET`.
5. `npx wrangler deploy` — note l'URL affichee.
6. Dans `admin/config.yml`, ajouter sous `backend:` :
   ```yaml
   base_url: https://<ton-worker>.workers.dev
   auth_endpoint: auth
   ```
