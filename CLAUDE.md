## Règles d'économie de tokens (à respecter en permanence)
- Réponses courtes, sans récap des étapes ni narration.
- Ne lire que les fichiers et les lignes nécessaires (offset/limit). Jamais tout le projet.
- Pas de sous-agents sauf demande explicite.
- Pas de captures d'écran ni de vérifs en boucle : une vérif max par tâche.
- Si une piste échoue 2 fois, s'arrêter et proposer une alternative.
- Tâche floue ou grosse : poser les questions d'abord, proposer un plan court, attendre mon OK, puis exécuter.
- Ne jamais lire node_modules, dist, build, .git, lockfiles, vidéos.
- En fin de tâche : mettre à jour ETAT.md (racine) en 5 lignes max, puis me dire de faire /clear.

Le site en ligne est construit par Cloudflare (npm run build avec CF_PAGES) ; docs/ ne contient plus que les pages qui redirigent l'ancien aperçu GitHub Pages (vgthmind.github.io/shop/) vers site_url : un npm run build local les régénère, rien d'autre à faire. Adresse du site = site_url dans data/shop-settings.json (réglage central).
