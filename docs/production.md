# Mise en production chez o2switch

La production, c'est trois morceaux :

- le **site** (build Vite, fichiers statiques) chez o2switch, sur un sous-domaine en HTTPS ;
- un **projet Supabase de production**, distinct de la recette ;
- un **bucket R2 de production**, distinct de la recette.

La tâche GitHub « Production » (`.github/workflows/production.yml`) met tout à jour d'un coup :
migrations, Edge Functions, build, envoi du site par FTP explicite sur TLS. Elle s'ajoute à la CI
et à Vercel, qui reste la recette (chaque fusion sur `main`). Docker n'est pas utilisé : l'offre
o2switch est un hébergement mutualisé (cPanel, Apache), et le site n'est qu'un dossier `dist/`.

## Publier une version

```bash
git tag v1.0.0
git push origin v1.0.0
```

Puis GitHub › Actions › Production › « Review deployments » › Approve. Relance possible à la main
(« Run workflow », en choisissant le tag).

Ordre suivi : migrations, Edge Functions, build, assets, puis `index.html` et le service worker.
Une migration doit donc rester compatible quelques minutes avec la version précédente (ajouter
une colonne puis s'en servir, pas renommer d'un coup). Les anciens assets restent 30 jours sur le
serveur : un onglet ouvert sur l'ancienne version continue de fonctionner.

**Retour arrière** : relancer « Run workflow » sur le tag précédent remet l'ancien site et les
anciennes fonctions. Une migration ne se défait pas : écrire une migration corrective, ou en
dernier recours restaurer la sauvegarde de la nuit ([`sauvegarde.md`](sauvegarde.md)).

## Mise en place (une seule fois)

### o2switch (cPanel)

1. Domaines : créer le sous-domaine de l'appli (ex. `atelier.rapidtruckservice.fr`).
2. « Let's Encrypt SSL » (ou AutoSSL) sur ce sous-domaine : HTTPS obligatoire pour la PWA, le
   service worker, la caméra et les notifications push.
3. Comptes FTP : un compte dédié (ex. `deploy@rapidtruckservice.fr`) **limité au dossier du
   sous-domaine**, distinct du compte de sauvegarde.
4. Serveur : `pendragon.o2switch.net` (nom du certificat TLS, voir [`sauvegarde.md`](sauvegarde.md)).

Le site embarque `public/.htaccess` (routes de l'appli, HTTPS, en-têtes de sécurité, cache) et
`public/assets/.htaccess` (cache long), équivalents de `vercel.json`.

### Supabase (projet de production)

- Région UE, plan Pro (un projet gratuit se met en pause sans activité et n'a pas de sauvegarde
  quotidienne).
- Jamais `seed.sql` ni `npm run db:demo` : les comptes se créent depuis l'appli.
- Auth › URL Configuration : Site URL = adresse du site, Redirect URLs = la même suivie de `/**`.
  Auth › SMTP : Resend, pour que les e-mails d'authentification partent du domaine de l'atelier.
- Vault (éditeur SQL) : secrets `project_url` (`https://<ref>.supabase.co`) et `cron_secret`, lus
  par pg_cron pour appeler les Edge Functions. Sans eux, les tâches planifiées ne font rien.

  ```sql
  select vault.create_secret('https://<ref>.supabase.co', 'project_url');
  select vault.create_secret('<valeur aléatoire>', 'cron_secret');
  ```

- Secrets des Edge Functions (`npx supabase secrets set --project-ref <ref> NOM=valeur …`) :
  `APP_URL` (adresse du site), `CRON_SECRET` (même valeur que dans Vault), `R2_ENDPOINT`,
  `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `RESEND_API_KEY`, `MAIL_FROM`,
  `RESEND_RECEIVING_API_KEY`, `RESEND_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`,
  `ANTHROPIC_AGENT_API_KEY`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `TOMTOM_API_KEY`, et la
  clé privée VAPID (paire générée par `node scripts/vapid-keys.mjs`).
- Webhook de réception Resend (`mail-inbox`) pointé vers le projet de production.

### Cloudflare R2

Bucket de production, CORS autorisant l'adresse du site (méthodes `GET`, `PUT`, en-tête
`Content-Type`). Un jeton en écriture pour l'Edge Function `files`, un en lecture seule pour la
sauvegarde.

### GitHub

Settings › Environments › `production` : « Required reviewers » coché, déploiement limité aux
tags `v*` et à `main`. Dans cet environnement :

| Variable  | Valeur                                                    |
| --------- | --------------------------------------------------------- |
| `APP_URL` | adresse du site, sans `/` final (ex. `https://atelier.…`) |

| Secret                          | Valeur                                             |
| ------------------------------- | -------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN`         | jeton personnel Supabase (Account › Access Tokens) |
| `SUPABASE_PROJECT_REF`          | identifiant du projet de production                |
| `SUPABASE_DB_PASSWORD`          | mot de passe de la base de production              |
| `VITE_SUPABASE_URL`             | `https://<ref>.supabase.co`                        |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | clé « publishable » du projet de production        |
| `VITE_VAPID_PUBLIC_KEY`         | clé publique VAPID de production                   |
| `O2_DEPLOY_FTP_USER`            | compte FTP de déploiement                          |
| `O2_DEPLOY_FTP_PASSWORD`        | mot de passe de ce compte                          |

Enfin, faire viser la production aux secrets de la tâche « Sauvegarde » (`SUPABASE_DB_URL`,
`R2_*`), la lancer une fois à la main et tester une restauration sur un projet neuf.

## Après la première mise en ligne

- `curl -I <adresse>/` et `curl -I <adresse>/assets/<fichier>.js` : mêmes en-têtes que sur Vercel.
- Recharger une page profonde (ex. une fiche OR) : elle doit s'afficher, pas une erreur 404.
- Se connecter, installer la PWA sur une tablette, tester une photo, un PDF, un e-mail et une
  notification push.
- Reprises : forfaits (`npm run import:forfaits`, script collé dans l'éditeur SQL du projet de
  production) et clients / véhicules GTA ([`reprise-gta.md`](reprise-gta.md)).
