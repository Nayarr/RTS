# Sauvegarde automatique chez o2switch

Chaque nuit (2 h 30 l'hiver, 3 h 30 l'été), la tâche GitHub « Sauvegarde »
(`.github/workflows/sauvegarde.yml`, script `scripts/sauvegarde.sh`) :

1. fait une copie complète de la base Supabase (rôles, structure, données, comptes compris) ;
2. la chiffre (AES-256) avec la phrase de passe et la dépose dans `sauvegardes-rts/base/`
   (`rts-base-AAAA-MM-JJ.tar.gz.gpg`), les 30 derniers jours sont gardés ;
3. copie les nouveaux fichiers de R2 (photos, PDF) dans `sauvegardes-rts/fichiers/`, chiffrés un
   par un. Rien n'y est jamais effacé : un fichier supprimé par erreur dans l'appli reste récupérable.

En cas d'échec, GitHub envoie un e-mail. Relance à la main : onglet Actions › Sauvegarde ›
« Run workflow ».

## Mise en place (une seule fois)

Dans GitHub : dépôt › Settings › Secrets and variables › Actions › « New repository secret ».

| Secret                 | Valeur                                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_DB_URL`      | Supabase › Connect › « Session pooler » (URI complète, mot de passe de la base compris)                                          |
| `R2_ENDPOINT`          | `https://<id-de-compte>.r2.cloudflarestorage.com`                                                                                |
| `R2_BUCKET`            | nom du bucket R2                                                                                                                 |
| `R2_ACCESS_KEY_ID`     | jeton R2 en lecture seule sur ce bucket                                                                                          |
| `R2_SECRET_ACCESS_KEY` | secret du même jeton                                                                                                             |
| `O2_FTP_USER`          | `sauvegarde@rapidtruckservice.fr`                                                                                                |
| `O2_FTP_PASSWORD`      | mot de passe du compte FTP                                                                                                       |
| `BACKUP_PASSPHRASE`    | phrase de passe de chiffrement : à garder aussi dans un gestionnaire de mots de passe, sans elle les sauvegardes sont illisibles |

Le serveur FTP est `pendragon.o2switch.net` (inscrit dans le workflow) : c'est le nom porté par
le certificat TLS d'o2switch, `ftp.rapidtruckservice.fr` serait refusé en connexion chiffrée.

## Restaurer la base

Sur un ordinateur avec `gpg` et `psql` (Git for Windows fournit `gpg`).

1. Télécharger l'archive voulue : FileZilla, hôte `pendragon.o2switch.net`, « FTP explicite sur
   TLS », compte `sauvegarde@rapidtruckservice.fr`, dossier `base/`. Ou cPanel › Gestionnaire de
   fichiers › `sauvegardes-rts/base`.
2. Déchiffrer (la phrase de passe est demandée) :

   ```bash
   gpg -d rts-base-AAAA-MM-JJ.tar.gz.gpg | tar xz
   ```

   Le dossier `base/` contient `roles.sql`, `schema.sql` et `data.sql`.

3. Recharger dans un projet Supabase **neuf** (jamais par-dessus la production en service) :

   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file base/roles.sql --file base/schema.sql \
     --command 'SET session_replication_role = replica' --file base/data.sql \
     --dbname "<URI Session pooler du nouveau projet>"
   ```

4. Redéployer les Edge Functions et remettre leurs secrets (`npx supabase secrets set`), puis
   pointer l'appli vers le nouveau projet.

## Restaurer les fichiers

Avec [rclone](https://rclone.org), en déclarant les accès par variables d'environnement
(mêmes valeurs que les secrets GitHub) :

```bash
export RCLONE_CONFIG_O2_TYPE=ftp RCLONE_CONFIG_O2_HOST=pendragon.o2switch.net \
  RCLONE_CONFIG_O2_USER=sauvegarde@rapidtruckservice.fr RCLONE_CONFIG_O2_EXPLICIT_TLS=true
export RCLONE_CONFIG_O2_PASS="$(rclone obscure '<mot de passe FTP>')"
export RCLONE_CONFIG_O2FICHIERS_TYPE=crypt RCLONE_CONFIG_O2FICHIERS_REMOTE=o2:fichiers \
  RCLONE_CONFIG_O2FICHIERS_FILENAME_ENCRYPTION=off RCLONE_CONFIG_O2FICHIERS_DIRECTORY_NAME_ENCRYPTION=false
export RCLONE_CONFIG_O2FICHIERS_PASSWORD="$(rclone obscure '<phrase de passe>')"

rclone copy o2fichiers: ./fichiers-restaures          # tout récupérer en clair
rclone copy o2fichiers:ro/<id>/photo.jpg ./           # ou un seul fichier
```

Pour renvoyer les fichiers dans R2, déclarer aussi le distant `r2` (type `s3`, fournisseur
`Cloudflare`, jeton en écriture cette fois) puis `rclone copy o2fichiers: r2:<bucket>`.
