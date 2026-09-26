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
supabase/
  migrations/  Schéma de la base (tables, fonctions métier, RLS, tâches planifiées)
  tests/       Tests pgTAP de la base
```

## Base de données en local

Prérequis : Node.js 22+, Docker.

```bash
npx supabase start       # démarre Supabase en local
npx supabase db reset    # recrée la base et applique toutes les migrations
npx supabase test db     # lance les tests de la base
npx supabase db lint     # vérifie le schéma
```
