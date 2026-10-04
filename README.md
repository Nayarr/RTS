# RTS Atelier

Application de gestion d'atelier poids lourds de **Rapid Truck Service** : ordres de réparation,
fiche de contrôle, badgeage, devis et facturation, planning, pointage, pilotage.

Refonte de l'application d'origine (Firebase, fichier unique). L'ancienne version est gardée en local
dans `legacy/` comme référence fonctionnelle ; elle n'est pas versionnée.

## Stack

- **Front** : React + Vite + TypeScript, Tailwind CSS + shadcn/ui, PWA (site sur PC, app sur mobile / tablette)
- **Back** : Supabase (Postgres, Auth, Realtime, Edge Functions, pg_cron)
- **Fichiers** : Cloudflare R2 (URL signées)
- **Hébergement** : Vercel (recette), puis o2switch (production)

## Structure

```
src/
  app/         Coquille de l'appli : routeur, mise en page, pages génériques
  features/    Un dossier par domaine métier (auth, team, files, ...) : écrans, appels API, schémas, tests
  components/  Composants partagés (ui/ = composants shadcn/ui générés)
  lib/         Client Supabase, variables d'environnement, utilitaires
  types/       Types TypeScript générés depuis la base (npm run db:types)
e2e/           Tests end-to-end Playwright
supabase/
  functions/   Edge Functions (admin-users : comptes ; files : fichiers R2)
  migrations/  Schéma de la base (tables, fonctions métier, RLS, tâches planifiées)
  tests/       Tests pgTAP de la base
  seed.sql     Comptes et données de développement (local uniquement)
  demo/        Données fictives de démonstration (npm run db:demo, local uniquement)
```

## Démarrer en local

Prérequis : Node.js 22+, Docker.

```bash
npm install
npx supabase start               # Supabase local (base, authentification, Edge Functions)
npm run storage:start            # stockage de fichiers local compatible S3 (remplace R2)
cp .env.example .env.local       # puis renseigner la clé affichée par `npx supabase status`
npm run dev                      # http://localhost:5173
```

Comptes de test (base locale uniquement, mot de passe `atelier-dev-2026`) :
`direction@rts.local`, `reception@rts.local`, `alice@rts.local` et `bruno@rts.local` (techniciens),
`borne@rts.local` (borne de pointage).

## Commandes utiles

| Commande                | Rôle                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `npm run lint`          | ESLint                                                                                |
| `npm run typecheck`     | Vérification TypeScript                                                               |
| `npm run format:check`  | Formatage Prettier                                                                    |
| `npm test`              | Tests unitaires (Vitest)                                                              |
| `npm run test:e2e`      | Tests end-to-end (Playwright, Supabase et stockage local démarrés)                    |
| `npm run storage:start` | Stockage local compatible S3 sur le port 9000 (après `supabase start`)                |
| `npm run db:types`      | Régénère `src/types/database.ts` après une migration                                  |
| `npx supabase db reset` | Recrée la base locale : migrations + `seed.sql`                                       |
| `npm run db:demo`       | Ajoute des données fictives (clients, 12 mois d'OR et de factures…), après `db reset` |
| `npx supabase test db`  | Tests pgTAP de la base                                                                |
| `npx supabase db lint`  | Lint du schéma                                                                        |

## Contribuer

- **Une feature = une branche**, fusionnée dans `main` par pull request.
- **Titre de PR** en [Conventional Commits](https://www.conventionalcommits.org/fr/) :
  `feat(devis): signature en ligne`, `fix: arrondi TVA`, `ci(database): …`
- **Description de PR** : remplir le modèle ([`.github/pull_request_template.md`](.github/pull_request_template.md)),
  toutes les sections et la checklist.

## Intégration continue

| Workflow              | Déclenchement                     | Vérifie                                                                                                                                                                                                                                  |
| --------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Base de données**   | PR vers `main`, push sur `main`   | Migrations rejouées depuis zéro, lint du schéma, tests pgTAP                                                                                                                                                                             |
| **Conventions de PR** | Ouverture / modification d'une PR | Titre Conventional Commits, description conforme au modèle                                                                                                                                                                               |
| **Application**       | PR vers `main`, push sur `main`   | Formatage, lint, types, tests unitaires, build ; Edge Functions (`deno fmt`, `lint`, `check`, `test`) ; types de la base à jour ; tests end-to-end (desktop + mobile) sur Supabase local, Edge Functions et stockage de fichiers compris |

## Déploiement

- **Recette : Vercel** (intégration GitHub) — un aperçu par PR, la production à chaque fusion sur `main`.
  Configuration dans [`vercel.json`](vercel.json) (routes de l'appli, cache, en-têtes de sécurité).
  Variables à définir dans Vercel : `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
- **Fichiers : Cloudflare R2**. Le navigateur envoie et lit les fichiers directement dans R2 avec
  des URL signées fournies par l'Edge Function `files`. Secrets de la fonction (jamais dans le code) :
  `R2_ENDPOINT` (`https://<id-de-compte>.r2.cloudflarestorage.com`), `R2_BUCKET`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, définis par `npx supabase secrets set`. Le bucket doit autoriser en CORS
  l'origine de l'appli (méthodes `GET`, `PUT`, en-tête `Content-Type`).
- **Lecture automatique des étiquettes** (date du contrôle hayon, échéance et VIN du contrôle technique lus sur la photo) : Edge Function
  `label-read`, assistant Claude. Secret `ANTHROPIC_API_KEY` défini par `npx supabase secrets set`
  (jamais dans le code), puis réglage « Lecture automatique des étiquettes » activé par la direction.
  Sans clé, la photo est gardée et la date se saisit à la main.
- **E-mails au client : Resend** (devis, factures, signatures, contrats, rappels envoyés en un clic,
  PDF joint) : Edge Function `mail-send`, secret `RESEND_API_KEY` défini par `npx supabase secrets set`.
  Dans Réglages › Atelier, la direction active « Envoyer les e-mails depuis l’appli » et règle le
  domaine d’envoi (vérifié chez Resend) et le début de chaque adresse : `facturation@` (devis,
  factures, contrats), `atelier@` (infos du véhicule, rappels, espace client), `signature@` (liens
  de signature). Les réponses du client reviennent sur l’adresse qui a envoyé le message. Sans domaine
  réglé, l’adresse unique du secret `MAIL_FROM` est utilisée. Sans clé ou sans réglage, l’appli ouvre
  la messagerie de l’ordinateur avec le message prêt.
- **Production : o2switch** (plus tard).

## Reprise des forfaits de l’ancienne appli

1. Dans l’ancienne appli, la direction télécharge la sauvegarde (bouton « Sauvegarde », fichier
   `sauvegarde_rts_atelier_AAAA-MM-JJ.json`).
2. `npm run import:forfaits -- sauvegarde_rts_atelier_AAAA-MM-JJ.json` écrit `forfaits-legacy.sql`
   (et liste les forfaits ignorés : sans nom ou sans temps barème).
3. Coller ce script dans l’éditeur SQL du projet Supabase (recette, puis production) et l’exécuter.
   Il est rejouable sans doublon : chaque forfait est repris par son identifiant de l’ancienne appli ;
   un forfait déjà saisi à la main sous le même nom est rattaché au lieu d’être doublé.
