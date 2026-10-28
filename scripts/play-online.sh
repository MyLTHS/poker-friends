#!/usr/bin/env bash
# Play online from this Mac: the production stack (docker-compose.prod.yml + home override)
# behind a Cloudflare quick tunnel (https://<random>.trycloudflare.com). docs/choi-online.md.
#
#   scripts/play-online.sh up       # back up, start everything, print the link for friends
#   scripts/play-online.sh status   # running? which link?
#   scripts/play-online.sh logs     # last server log lines (email links when EMAIL_URL is empty)
#   scripts/play-online.sh down     # back up, stop the tunnel and the stack (data is kept)
#
# Secrets live in .env.home (created on the first `up`, never committed). Messages are in
# Vietnamese: the owner runs this before and after each game night.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=.env.home
STATE=.play-online
export HOME_PORT="${HOME_PORT:-8080}"
PROJECT="${PLAY_ONLINE_PROJECT:-poker-home}"

say() { printf '%s\n' "$*"; }
die() { printf 'LỖI: %s\n' "$*" >&2; exit 1; }
dc() {
  docker compose -p "$PROJECT" -f docker-compose.prod.yml -f docker-compose.home.yml \
    --env-file "$ENV_FILE" "$@"
}

# A pid file whose process is still alive and is the program we started.
alive() {
  [ -f "$STATE/$1.pid" ] || return 1
  local pid
  pid=$(cat "$STATE/$1.pid")
  ps -p "$pid" -o comm= 2>/dev/null | grep -q "$1"
}

stop_pid() {
  if alive "$1"; then
    kill "$(cat "$STATE/$1.pid")" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do alive "$1" || break; sleep 1; done
  fi
  rm -f "$STATE/$1.pid"
}

set_env() { # set_env KEY VALUE: replace the line KEY=... in .env.home, or add it
  local tmp="$ENV_FILE.tmp"
  awk -v k="$1" -v v="$2" 'BEGIN { done = 0 }
    index($0, k "=") == 1 { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }' "$ENV_FILE" >"$tmp"
  mv "$tmp" "$ENV_FILE"
}

ensure_env() {
  [ -f "$ENV_FILE" ] && return
  local secret password
  secret=$(openssl rand -hex 32)
  password=$(openssl rand -hex 24)
  umask 077
  cat >"$ENV_FILE" <<EOF
# Created by scripts/play-online.sh: secrets for playing from this Mac. Never commit this file.
# The script rewrites DJANGO_ALLOWED_HOSTS and FRONTEND_URL on every "up" (the link changes).
SITE_ADDRESS=:80
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=$secret
DJANGO_BEHIND_HTTPS_PROXY=true
TRUSTED_PROXIES=1
DJANGO_ALLOWED_HOSTS=localhost
FRONTEND_URL=http://localhost
POSTGRES_DB=poker
POSTGRES_USER=poker
POSTGRES_PASSWORD=$password
DATABASE_URL=postgres://poker:$password@db:5432/poker
# socket_timeout above Channels' 5 s blocking read: redis-py 8 defaults to 5 s, which drops
# every WebSocket that is quiet for 5 s.
REDIS_URL=redis://redis:6379/0?socket_timeout=15
# Empty: emails (verification, password reset) only go to the server log: play-online.sh logs.
# Gmail: docs/huong-dan-google-smtp.md
EMAIL_URL=
DEFAULT_FROM_EMAIL=Poker Friends <no-reply@localhost>
# Google sign-in cannot work with a link that changes every time: leave empty.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EOF
  say "Đã tạo $ENV_FILE (mật khẩu, khoá bí mật ngẫu nhiên)."
}

has_tables() {
  local n
  n=$(echo "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'" |
    dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' 2>/dev/null || echo 0)
  [ "${n:-0}" -gt 0 ]
}

backup() {
  mkdir -p backups
  if has_tables; then
    dc run --rm -T tools scripts/backup.sh
  else
    say "   (database còn trống, chưa cần sao lưu)"
  fi
}

public_url() { cat "$STATE/url" 2>/dev/null || true; }

check_public() { # HTTP status of the page through the tunnel, or 000
  curl -s -o /dev/null -m 10 -w '%{http_code}' "$1/api/auth/config/" || true
}

cmd_up() {
  command -v docker >/dev/null || die "chưa có Docker."
  command -v cloudflared >/dev/null || die "chưa có cloudflared."
  docker info >/dev/null 2>&1 || die "Docker Desktop chưa chạy: mở Docker Desktop, đợi nó báo xong rồi chạy lại."
  if alive cloudflared; then
    say "Đang chạy rồi. Link: $(public_url)"
    exit 0
  fi
  mkdir -p "$STATE"
  ensure_env

  say "1/5 Bật database..."
  dc up -d --wait db
  say "2/5 Sao lưu trước khi chơi..."
  backup

  say "3/5 Mở đường hầm Cloudflare..."
  nohup cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$HOME_PORT" \
    >"$STATE/cloudflared.log" 2>&1 &
  echo $! >"$STATE/cloudflared.pid"
  # From here on, a failure closes the tunnel again: never leave it open half set up.
  trap 'say "Có lỗi, đang đóng đường hầm..."; stop_pid cloudflared' ERR
  trap 'say "Đã dừng giữa chừng, đang đóng đường hầm..."; stop_pid cloudflared; exit 130' INT TERM
  local url=""
  for _ in $(seq 1 60); do
    url=$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$STATE/cloudflared.log" | head -n 1 || true)
    [ -n "$url" ] && break
    alive cloudflared || break
    sleep 1
  done
  if [ -z "$url" ]; then
    stop_pid cloudflared
    die "không lấy được link (mạng?). Xem $STATE/cloudflared.log"
  fi
  echo "$url" >"$STATE/url"
  set_env DJANGO_ALLOWED_HOSTS "${url#https://},localhost,127.0.0.1"
  set_env FRONTEND_URL "$url"

  say "4/5 Bật server (lần đầu build mất vài phút)..."
  dc up -d --build --wait --wait-timeout 600

  if command -v caffeinate >/dev/null; then
    # Keeps the Mac awake while the tunnel runs; ends by itself when the tunnel stops.
    nohup caffeinate -ims -w "$(cat "$STATE/cloudflared.pid")" >/dev/null 2>&1 &
    echo $! >"$STATE/caffeinate.pid"
  fi

  say "5/5 Thử link từ ngoài..."
  local code=000
  for _ in $(seq 1 45); do
    code=$(check_public "$url")
    [ "$code" = 200 ] && break
    sleep 2
  done
  trap - ERR INT TERM
  say ""
  if [ "$code" = 200 ]; then
    say "XONG. Gửi link này cho bạn bè:"
  else
    say "Server đã chạy nhưng link chưa trả lời (mã $code); đợi một phút rồi thử mở. Link:"
  fi
  say ""
  say "    $url"
  say ""
  say "Cắm sạc, đừng gập máy. Hết buổi chạy: scripts/play-online.sh down"
}

cmd_down() {
  if [ -f "$ENV_FILE" ] && [ -n "$(dc ps -q db 2>/dev/null)" ]; then
    say "Sao lưu cuối buổi..."
    backup || say "   (sao lưu lỗi, xem dòng trên; vẫn tắt tiếp)"
  fi
  say "Đóng đường hầm..."
  stop_pid cloudflared
  stop_pid caffeinate
  rm -f "$STATE/url"
  if [ -f "$ENV_FILE" ]; then
    say "Tắt server (dữ liệu vẫn giữ)..."
    dc down
  fi
  say "Đã tắt."
}

cmd_status() {
  if alive cloudflared; then
    local url
    url=$(public_url)
    say "Đường hầm: đang mở, link $url (trả lời: $(check_public "$url"))"
  else
    say "Đường hầm: đang tắt"
  fi
  if alive caffeinate; then say "Giữ máy không ngủ: có"; else say "Giữ máy không ngủ: không"; fi
  if [ -f "$ENV_FILE" ]; then
    dc ps --format 'table {{.Service}}\t{{.Status}}'
  fi
}

cmd_logs() {
  [ -f "$ENV_FILE" ] || die "chưa chạy lần nào."
  dc logs --no-color --tail "${1:-100}" backend
}

case "${1:-}" in
  up) cmd_up ;;
  down) cmd_down ;;
  status) cmd_status ;;
  logs) cmd_logs "${2:-}" ;;
  *)
    say "Cách dùng: scripts/play-online.sh up | down | status | logs [số dòng]"
    exit 2
    ;;
esac
