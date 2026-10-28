#!/usr/bin/env bash
# Back up the Poker Friends PostgreSQL database to one pg_dump custom-format file (-Fc).
#
#   scripts/backup.sh                      # DATABASE_URL from the environment
#   scripts/backup.sh -d postgres://... -o backups/mine.dump
#
# On the production server, through the compose "tools" service (same pg_dump version as the
# database, see docs/runbook.md):
#   docker compose -f docker-compose.prod.yml run --rm tools scripts/backup.sh
#
# The dump is written to a temporary name and renamed only once pg_restore can read it back,
# so a file with the final name is always a complete backup. Never overwrites a file.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/backup.sh [-d DATABASE_URL] [-o OUTPUT_FILE]

  -d  database to back up (default: $DATABASE_URL)
  -o  output file (default: backups/poker-YYYYmmdd-HHMMSS.dump); must not exist yet
EOF
}

url="${DATABASE_URL:-}"
out=""
while getopts "d:o:h" opt; do
  case "$opt" in
    d) url="$OPTARG" ;;
    o) out="$OPTARG" ;;
    h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1))
if [ $# -gt 0 ]; then
  echo "backup: unexpected argument: $1" >&2
  usage >&2
  exit 2
fi

if [ -z "$url" ]; then
  echo "backup: no database: pass -d or set DATABASE_URL" >&2
  exit 2
fi
case "$url" in
  postgres://* | postgresql://*) ;;
  *) echo "backup: DATABASE_URL must be a postgres:// URL (SQLite has nothing to back up here)" >&2; exit 2 ;;
esac
for tool in pg_dump pg_restore; do
  command -v "$tool" >/dev/null || { echo "backup: $tool not found" >&2; exit 2; }
done

out="${out:-backups/poker-$(date -u +%Y%m%d-%H%M%S).dump}"
if [ -e "$out" ]; then
  echo "backup: $out already exists; not overwriting it" >&2
  exit 2
fi
mkdir -p "$(dirname "$out")"
tmp="$out.partial"
trap 'rm -f "$tmp"' EXIT

pg_dump --format=custom --no-owner --no-privileges --dbname="$url" --file="$tmp"
# A dump pg_restore cannot list is not a backup.
pg_restore --list "$tmp" >/dev/null
mv "$tmp" "$out"
trap - EXIT

size=$(wc -c <"$out" | tr -d ' ')
echo "backup: wrote $out ($size bytes)"
