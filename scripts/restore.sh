#!/usr/bin/env bash
# Restore a dump made by scripts/backup.sh into an EMPTY PostgreSQL database.
#
#   scripts/restore.sh -d postgres://poker:...@db:5432/poker_restored backups/poker-....dump
#
# Refuses a database that already has tables, so a typo in the URL cannot wipe production.
# Replacing existing data needs the explicit --overwrite-existing-data flag, and then every
# table in the dump is dropped and recreated. The restore runs in one transaction: it either
# fully succeeds or leaves the database as it was. Afterwards, run:
#   DATABASE_URL=<same url> uv run python manage.py check_ledger
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/restore.sh -d TARGET_DATABASE_URL [--overwrite-existing-data] DUMP_FILE

  -d                          database to restore into; must exist and be empty
  --overwrite-existing-data   allow a database that has tables: they are DROPPED first
EOF
}

url=""
overwrite=0
file=""
while [ $# -gt 0 ]; do
  case "$1" in
    -d) [ $# -ge 2 ] || { usage >&2; exit 2; }; url="$2"; shift 2 ;;
    --overwrite-existing-data) overwrite=1; shift ;;
    -h | --help) usage; exit 0 ;;
    -*) echo "restore: unknown option: $1" >&2; usage >&2; exit 2 ;;
    *)
      [ -z "$file" ] || { echo "restore: only one dump file" >&2; exit 2; }
      file="$1"; shift ;;
  esac
done

# No DATABASE_URL fallback on purpose: the target is always typed out.
if [ -z "$url" ] || [ -z "$file" ]; then
  usage >&2
  exit 2
fi
case "$url" in
  postgres://* | postgresql://*) ;;
  *) echo "restore: target must be a postgres:// URL" >&2; exit 2 ;;
esac
for tool in psql pg_restore; do
  command -v "$tool" >/dev/null || { echo "restore: $tool not found" >&2; exit 2; }
done
if [ ! -f "$file" ] || [ ! -r "$file" ]; then
  echo "restore: cannot read $file" >&2
  exit 2
fi
if ! pg_restore --list "$file" >/dev/null 2>&1; then
  echo "restore: $file is not a pg_dump custom-format file" >&2
  exit 2
fi

tables=$(psql "$url" --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1 --command \
  "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')")
clean=()
if [ "$tables" != "0" ]; then
  if [ "$overwrite" != 1 ]; then
    echo "restore: target database has $tables tables; refusing to restore over them." >&2
    echo "restore: restore into a new empty database, or add --overwrite-existing-data." >&2
    exit 3
  fi
  echo "restore: WARNING: dropping and replacing $tables existing tables" >&2
  clean=(--clean --if-exists)
fi

pg_restore --no-owner --no-privileges --exit-on-error --single-transaction \
  ${clean[@]+"${clean[@]}"} --dbname="$url" "$file"
echo "restore: restored $file"
echo "restore: now run: DATABASE_URL=<target url> uv run python manage.py check_ledger"
