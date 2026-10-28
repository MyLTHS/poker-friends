#!/usr/bin/env bash
# Fail unless the newest backup in a folder is recent: a daily cron that silently stopped
# running shows up here, not on the day a restore is needed.
#
#   scripts/check-backup-age.sh                 # backups/, newest .dump at most 26 hours old
#   scripts/check-backup-age.sh -d backups -H 50
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/check-backup-age.sh [-d DIR] [-H HOURS]

  -d  folder with the .dump files (default: backups)
  -H  newest dump must be at most this many hours old (default: 26: daily, plus slack)
EOF
}

dir="backups"
hours=26
while getopts "d:H:h" opt; do
  case "$opt" in
    d) dir="$OPTARG" ;;
    H) hours="$OPTARG" ;;
    h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done
case "$hours" in
  '' | *[!0-9]*) echo "check-backup-age: -H must be a whole number of hours" >&2; exit 2 ;;
esac
if [ ! -d "$dir" ]; then
  echo "check-backup-age: FAIL: no folder $dir (backup never ran?)" >&2
  exit 1
fi

# Empty files are failed dumps, not backups.
recent=$(find "$dir" -maxdepth 1 -name '*.dump' -size +0 -mmin "-$((hours * 60))" | sort | tail -n 1)
if [ -z "$recent" ]; then
  newest=$(ls -t "$dir"/*.dump 2>/dev/null | head -n 1 || true)
  echo "check-backup-age: FAIL: no backup in $dir from the last $hours hours (newest: ${newest:-none})" >&2
  exit 1
fi
echo "check-backup-age: OK: $recent"
