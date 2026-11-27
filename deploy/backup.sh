#!/usr/bin/env bash
# Respaldo de Nober: base de datos (pg_dump) y archivos subidos (volumen «uploads»), comprimidos.
# Conserva los últimos BACKUP_KEEP de cada uno (14 por defecto) en BACKUP_DIR (~/backups/nober por defecto).
#
#   deploy/backup.sh                # a mano
#   crontab: 30 3 * * * /ruta/a/nober/deploy/backup.sh >> ~/backups/nober/backup.log 2>&1
#
# Restaurar la base (con la app detenida):
#   gunzip -c nober-db-AAAA-MM-DD-HHMM.sql.gz | docker compose --env-file .env.production exec -T db psql -U <usuario> <base>
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE=.env.production
DEST="${BACKUP_DIR:-$HOME/backups/nober}"
KEEP="${BACKUP_KEEP:-14}"
PROJECT="$(basename "$PWD")" # nombre del proyecto de compose (volúmenes «<proyecto>_uploads»)

val() { grep -oP "^$1=\K.*" "$ENV_FILE" 2>/dev/null | tail -1; }
DB_USER="$(val POSTGRES_USER)"; DB_USER="${DB_USER:-nober}"
DB_NAME="$(val POSTGRES_DB)"; DB_NAME="${DB_NAME:-nober}"

mkdir -p "$DEST"
STAMP="$(date +%F-%H%M)"
DB_FILE="$DEST/nober-db-$STAMP.sql.gz"
UP_FILE="$DEST/nober-uploads-$STAMP.tar.gz"

# Base de datos: se escribe en .tmp y solo se renombra si todo salió bien (pipefail + gzip -t)
docker compose --env-file "$ENV_FILE" exec -T db pg_dump -U "$DB_USER" "$DB_NAME" | gzip -9 > "$DB_FILE.tmp"
gzip -t "$DB_FILE.tmp"
mv "$DB_FILE.tmp" "$DB_FILE"

# Archivos subidos (si existe el volumen)
if docker volume inspect "${PROJECT}_uploads" >/dev/null 2>&1; then
  docker run --rm -v "${PROJECT}_uploads:/uploads:ro" alpine tar czf - -C /uploads . > "$UP_FILE.tmp"
  gzip -t "$UP_FILE.tmp"
  mv "$UP_FILE.tmp" "$UP_FILE"
fi

# Rotación: quedan los KEEP más recientes de cada tipo
for kind in db uploads; do
  ls -1t "$DEST"/nober-"$kind"-*.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm --
done

echo "$(date '+%F %T') respaldo ok: $(du -h "$DB_FILE" | cut -f1) base$( [ -f "$UP_FILE" ] && echo ", $(du -h "$UP_FILE" | cut -f1) archivos")"
