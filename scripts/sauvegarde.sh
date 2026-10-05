#!/usr/bin/env bash
# Sauvegarde de nuit : base Supabase et fichiers R2, chiffrés, déposés chez o2switch.
#
# Lancé par .github/workflows/sauvegarde.yml. Les accès rclone sont donnés par l'environnement :
#   r2:         bucket Cloudflare R2 (lecture seule suffit)
#   o2:         compte FTP o2switch (dossier sauvegardes-rts)
#   o2fichiers: le même dossier, fichiers chiffrés par rclone (sous-dossier « fichiers »)
# Restauration : docs/sauvegarde.md
set -euo pipefail

: "${SUPABASE_DB_URL:?adresse de la base manquante}"
: "${BACKUP_PASSPHRASE:?phrase de passe de chiffrement manquante}"
: "${R2_BUCKET:?bucket R2 manquant}"
KEEP_DAYS="${KEEP_DAYS:-30}"

day="$(date -u +%F)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "1. Base : rôles, structure et données"
mkdir -p "$work/base"
supabase db dump --db-url "$SUPABASE_DB_URL" --role-only -f "$work/base/roles.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$work/base/schema.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" --data-only --use-copy -f "$work/base/data.sql"
for file in roles schema data; do
  [ -s "$work/base/$file.sql" ] || { echo "::error::$file.sql vide : sauvegarde annulée"; exit 1; }
done

archive="rts-base-$day.tar.gz.gpg"
tar -C "$work" -czf - base |
  gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 \
    --symmetric --cipher-algo AES256 -o "$work/$archive" 3<<<"$BACKUP_PASSPHRASE"
echo "   $archive : $(du -h "$work/$archive" | cut -f1)"

echo "2. Dépôt chez o2switch"
rclone copyto "$work/$archive" "o2:base/$archive"

echo "3. Archives de plus de $KEEP_DAYS jours supprimées"
limit="$(date -u -d "$KEEP_DAYS days ago" +%F)"
rclone lsf o2:base --files-only | while read -r name; do
  date="${name#rts-base-}"
  date="${date%%.*}"
  if [[ "$date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ && "$date" < "$limit" ]]; then
    echo "   $name"
    rclone deletefile "o2:base/$name"
  fi
done

echo "4. Fichiers (photos, PDF) : seuls les nouveaux sont copiés, rien n'est jamais effacé"
rclone copy "r2:$R2_BUCKET" o2fichiers: --ignore-existing --transfers 4 --stats-one-line --stats 60s

echo "Sauvegarde du $day terminée"
