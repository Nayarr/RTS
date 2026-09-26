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
  features/    Un dossier par domaine métier (auth, ...) : écrans, appels API, schémas, tests
  components/  Composants partagés (ui/ = composants shadcn/ui générés)
  lib/         Client Supabase, variables d'environnement, utilitaires
  types/       Types TypeScript générés depuis la base (npm run db:types)
e2e/           Tests end-to-end Playwright
supabase/
  migrations/  Schéma de la base (tables, fonctions métier, RLS, tâches planifiées)
  tests/       Tests pgTAP de la base
  seed.sql     Comptes et données de développement (local uniquement)
```

## Démarrer en local

Prérequis : Node.js 22+, Docker.

```bash
npm install
npx supabase start               # Supabase local (base + authentification)
cp .env.example .env.local       # puis renseigner la clé affichée par `npx supabase status`
npm run dev                      # http://localhost:5173
```

Comptes de test (base locale uniquement, mot de passe `atelier-dev-2026`) :
`direction@rts.local`, `reception@rts.local`, `alice@rts.local` et `bruno@rts.local` (techniciens),
`borne@rts.local` (borne de pointage).

## Commandes utiles

| Commande                | Rôle                                                  |
| ----------------------- | ----------------------------------------------------- |
| `npm run lint`          | ESLint                                                |
| `npm run typecheck`     | Vérification TypeScript                               |
| `npm run format:check`  | Formatage Prettier                                    |
| `npm test`              | Tests unitaires (Vitest)                              |
| `npm run test:e2e`      | Tests end-to-end (Playwright, Supabase local démarré) |
| `npm run db:types`      | Régénère `src/types/database.ts` après une migration  |
| `npx supabase db reset` | Recrée la base locale : migrations + `seed.sql`       |
| `npx supabase test db`  | Tests pgTAP de la base                                |
| `npx supabase db lint`  | Lint du schéma                                        |

## Contribuer

- **Une feature = une branche**, fusionnée dans `main` par pull request.
- **Titre de PR** en [Conventional Commits](https://www.conventionalcommits.org/fr/) :
  `feat(devis): signature en ligne`, `fix: arrondi TVA`, `ci(database): …`
- **Description de PR** : remplir le modèle ([`.github/pull_request_template.md`](.github/pull_request_template.md)),
  toutes les sections et la checklist.

## Intégration continue

| Workflow              | Déclenchement                     | Vérifie                                                                                                                           |
| --------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Base de données**   | PR vers `main`, push sur `main`   | Migrations rejouées depuis zéro, lint du schéma, tests pgTAP                                                                      |
| **Conventions de PR** | Ouverture / modification d'une PR | Titre Conventional Commits, description conforme au modèle                                                                        |
| **Application**       | PR vers `main`, push sur `main`   | Formatage, lint, types, tests unitaires, build ; types de la base à jour ; tests end-to-end (desktop + mobile) sur Supabase local |

## Déploiement

- **Recette : Vercel** (intégration GitHub) — un aperçu par PR, la production à chaque fusion sur `main`.
  Configuration dans [`vercel.json`](vercel.json) (routes de l'appli, cache, en-têtes de sécurité).
  Variables à définir dans Vercel : `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
- **Production : o2switch** (plus tard).
