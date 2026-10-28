#!/usr/bin/env bash
# Play online from this Mac: the production stack (docker-compose.prod.yml + home override)
# behind a Cloudflare quick tunnel (https://<random>.trycloudflare.com). docs/choi-online.md.
# The tunnel is a container of the stack (docker-compose.home.yml), so after the first "up" the
# same game also starts from Docker Desktop: ▶ on "poker-home", link in the tunnel's log.
#
#   scripts/play-online.sh up       # back up, start everything, print the link for friends
#   scripts/play-online.sh status   # running? which link?
#   scripts/play-online.sh logs     # last server log lines (email links when EMAIL_URL is empty)
#   scripts/play-online.sh links    # verification / password reset links emailed this session
#   scripts/play-online.sh verify <email>   # let a friend in: approve their account (asks first)
#   scripts/play-online.sh admin    # create the owner's admin login (feedback, errors, users)
#   scripts/play-online.sh down     # back up, stop the tunnel and the stack (data and the Docker
#                                     # Desktop group are kept: ▶ starts it again)
#
# Secrets live in .env.home (created on the first `up`, never committed). Messages are in
# Vietnamese: the owner runs this before and after each game night.
set -euo pipefail
# Every file this script writes (.env.home holds the secret key and the DB password, and the
# set_env rewrites below replace it) is readable by this user only.
umask 077
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
  chmod 600 "$ENV_FILE"
}

ensure_env() {
  if [ -f "$ENV_FILE" ]; then
    chmod 600 "$ENV_FILE" # also fixes a file left 0644 by an older version of this script
    return
  fi
  local secret password
  secret=$(openssl rand -hex 32)
  password=$(openssl rand -hex 24)
  cat >"$ENV_FILE" <<EOF
# Created by scripts/play-online.sh: secrets for playing from this Mac. Never commit this file.
# Every start of the tunnel gives a new https://<words>.trycloudflare.com address: any of them
# is accepted, and links in emails follow the address the player used.
SITE_ADDRESS=:80
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=$secret
DJANGO_BEHIND_HTTPS_PROXY=true
TRUSTED_PROXIES=1
DJANGO_ALLOWED_HOSTS=.trycloudflare.com,localhost,127.0.0.1
FRONTEND_URL=http://localhost
FRONTEND_URL_FROM_REQUEST=true
# Members only: only verified accounts reach the rooms (no guests). Friends sign up, then the owner
# vouches for each: scripts/play-online.sh verify <email>, or the "verified" box in /admin/.
GUESTS_ALLOWED=false
POSTGRES_DB=poker
POSTGRES_USER=poker
POSTGRES_PASSWORD=$password
DATABASE_URL=postgres://poker:$password@db:5432/poker
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

table_count() { # number of tables in the database; fails if the database cannot be asked
  local n
  n=$(echo "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'" |
    dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' 2>/dev/null) || return 1
  case "$n" in '' | *[!0-9]*) return 1 ;; esac
  echo "$n"
}

backup() { # fails (never silently skips) when the database cannot be asked or the dump fails
  mkdir -p backups
  local n="" _
  for _ in 1 2 3 4 5; do
    n=$(table_count) && break
    n=""
    sleep 3 # the database may still be starting
  done
  if [ -z "$n" ]; then
    say "   KHÔNG hỏi được database (đang khởi động hay bị lỗi?): CHƯA sao lưu." >&2
    return 1
  fi
  if [ "$n" -gt 0 ]; then
    dc run --rm -T tools scripts/backup.sh
  else
    say "   (database còn trống, chưa cần sao lưu)"
  fi
}

# The quick-tunnel link from cloudflared's banner in the tunnel container's log. A restart (▶ in
# Docker Desktop) prints a new banner: the last one is the live link. Only the banner counts: on a
# network error the log also mentions https://api.trycloudflare.com, which is not our link.
tunnel_url() {
  # Only this start's log: after ■ Stop and a new start, the same container still holds the
  # banner of the last session, whose link is dead.
  local id since
  id=$(dc ps -q tunnel 2>/dev/null) || true
  [ -n "$id" ] || return 0
  since=$(docker inspect -f '{{.State.StartedAt}}' "$id" 2>/dev/null) || return 0
  dc logs --no-color --no-log-prefix --since "$since" tunnel 2>/dev/null | awk '
    /Your quick Tunnel has been created/ { banner = 1; next }
    banner && match($0, /https:\/\/[a-z0-9-]+\.trycloudflare\.com/) {
      found = substr($0, RSTART, RLENGTH)
      if (found != "https://api.trycloudflare.com") { url = found; banner = 0 }
    }
    END { if (url) print url }' || true
}

tunnel_running() {
  [ -f "$ENV_FILE" ] && [ -n "$(dc ps -q --status running tunnel 2>/dev/null)" ]
}

# The production file names the backend container: another stack using that name (an older
# test, a production try-out) would make `up` fail with a cryptic Docker error.
check_backend_name() {
  local owner
  owner=$(docker ps -a --filter 'name=^/poker-friends-backend$' \
    --format '{{.Label "com.docker.compose.project"}}' | head -n 1)
  if [ -n "$owner" ] && [ "$owner" != "$PROJECT" ]; then
    die "đang có container poker-friends-backend của bộ \"$owner\" (không phải \"$PROJECT\"). \
Chỉ được một server chạy: tắt bộ kia trước bằng \"docker compose -p $owner down\" rồi chạy lại."
  fi
}

# Cleanup for an `up` that did not finish: close the tunnel and stop the containers (the data
# volume stays). Runs on any error, die, or Ctrl-C until `up` has printed the link.
UP_DONE=0
abort_up() {
  [ "$UP_DONE" = 1 ] && return
  say "Chưa bật xong: đang đóng đường hầm và tắt server (dữ liệu vẫn giữ)..." >&2
  stop_pid caffeinate
  stop_pid sh
  dc stop >/dev/null 2>&1 || true
}

check_public() { # HTTP status of the page through the tunnel, or 000
  curl -s -o /dev/null -m 10 -w '%{http_code}' "$1/api/auth/config/" || true
}

cmd_up() {
  command -v docker >/dev/null || die "chưa có Docker."
  docker info >/dev/null 2>&1 || die "Docker Desktop chưa chạy: mở Docker Desktop, đợi nó báo xong rồi chạy lại."
  check_backend_name
  mkdir -p "$STATE"
  ensure_env
  # Files made by older versions of this script: Redis is gone, the host list was one fixed
  # link, and email links followed FRONTEND_URL.
  set_env REDIS_URL ""
  set_env DJANGO_ALLOWED_HOSTS ".trycloudflare.com,localhost,127.0.0.1"
  set_env FRONTEND_URL_FROM_REQUEST true
  set_env FRONTEND_URL http://localhost
  trap abort_up EXIT
  trap 'exit 130' INT TERM

  say "1/4 Bật database..."
  dc up -d --wait db
  say "2/4 Sao lưu trước khi chơi..."
  backup || die "không sao lưu được nên không bật (tránh mất dữ liệu). Thử lại sau một phút."

  say "3/4 Bật server và đường hầm Cloudflare (lần đầu build mất vài phút)..."
  dc up -d --build --wait --wait-timeout 600
  local url=""
  for _ in $(seq 1 60); do
    url=$(tunnel_url)
    [ -n "$url" ] && break
    tunnel_running || die "đường hầm đã dừng (mất mạng?). Xem: docker compose -p $PROJECT logs tunnel"
    sleep 1
  done
  [ -n "$url" ] || die "không lấy được link sau 60 giây (mạng?). Xem: docker compose -p $PROJECT logs tunnel"

  if command -v caffeinate >/dev/null; then
    # Keeps the Mac awake while the tunnel container runs: a watcher exits when it stops (■ in
    # Docker Desktop or "down"), and caffeinate with it. Started from ▶ alone, nothing keeps the
    # Mac awake: see the guide.
    stop_pid caffeinate
    stop_pid sh
    local container="${PROJECT}-tunnel-1"
    nohup sh -c "while [ -n \"\$(docker ps -q --filter name=^/$container\$)\" ]; do sleep 30; done" \
      >/dev/null 2>&1 &
    echo $! >"$STATE/sh.pid"
    nohup caffeinate -ims -w "$(cat "$STATE/sh.pid")" >/dev/null 2>&1 &
    echo $! >"$STATE/caffeinate.pid"
  fi

  say "4/4 Thử link từ ngoài..."
  local code=000
  for _ in $(seq 1 45); do
    code=$(check_public "$url")
    [ "$code" = 200 ] && break
    sleep 2
  done
  UP_DONE=1
  trap - EXIT INT TERM
  say ""
  if [ "$code" = 200 ]; then
    say "XONG. Gửi link này cho bạn bè:"
  else
    say "Server đã chạy nhưng link chưa trả lời (mã $code); đợi một phút rồi thử mở. Link:"
  fi
  say ""
  say "    $url"
  say ""
  if command -v pbcopy >/dev/null; then
    printf '%s' "$url" | pbcopy && say "(Link đã được copy sẵn: chỉ cần dán.)"
  fi
  say "Cắm sạc, đừng gập máy. Hết buổi chạy: scripts/play-online.sh down"
}

cmd_down() {
  if [ -f "$ENV_FILE" ] && [ -z "$(dc ps -q db 2>/dev/null)" ]; then
    say "Database không chạy nên không sao lưu được lúc này; lần \"up\" sau sẽ sao lưu trước." >&2
  elif [ -f "$ENV_FILE" ]; then
    say "Sao lưu cuối buổi..."
    if ! backup; then
      say "" >&2
      say "CẢNH BÁO: buổi này CHƯA được sao lưu. Dữ liệu vẫn nằm trong Docker; lần \"up\" sau" >&2
      say "sẽ sao lưu trước khi bật. Vẫn tắt tiếp." >&2
      say "" >&2
    fi
  fi
  stop_pid caffeinate
  stop_pid sh
  if [ -f "$ENV_FILE" ]; then
    say "Tắt server và đường hầm (dữ liệu vẫn giữ)..."
    # stop, not down: the containers stay, so "poker-home" stays in Docker Desktop with its ▶.
    dc stop
  fi
  say "Đã tắt."
}

cmd_status() {
  if tunnel_running; then
    local url
    url=$(tunnel_url)
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

cmd_links() {
  [ -f "$ENV_FILE" ] || die "chưa chạy lần nào."
  # Without EMAIL_URL every email is printed to the server log (apps/accounts/console_email.py):
  # "To: <address>", then the body with the link. The server is recreated on each "up", so these
  # are this session's links only; links from an earlier session point at its old address.
  local found
  found=$(dc logs --no-color --no-log-prefix backend | awk '
    /^To: / { to = substr($0, 5) }
    /\/account\/verify\?token=/ { print "Xác minh email  " to "\n  " $0 }
    /\/account\/reset\?/ { print "Đặt lại mật khẩu " to "\n  " $0 }') || die "không đọc được log server (Docker có đang chạy không?)."
  if [ -z "$found" ]; then
    say "Chưa có email nào trong buổi này."
  else
    say "$found"
    say ""
    say "Gửi riêng từng link cho đúng người (link chứa mã bí mật, đừng gửi vào nhóm chung)."
  fi
}

cmd_verify() {
  [ -n "${1:-}" ] || die "cần email, ví dụ: scripts/play-online.sh verify ban@example.com"
  [ -f "$ENV_FILE" ] || die "chưa chạy lần nào."
  # Show whose account it is first: someone could have signed up with a friend's email.
  dc exec -T backend python manage.py verify_email --show -- "$1" || exit 1
  local answer=""
  read -r -p "Đúng là bạn của bạn? Duyệt tài khoản này? (y/n) " answer
  case "$answer" in
    y | Y | yes | có | co) dc exec -T backend python manage.py verify_email -- "$1" ;;
    *) say "Không duyệt." ;;
  esac
}

cmd_admin() {
  [ -f "$ENV_FILE" ] || die "chưa chạy lần nào."
  say "Tạo tài khoản quản trị (trang <link>/admin/). Bạn tự gõ tên, email và mật khẩu."
  dc exec backend python manage.py createsuperuser
}

case "${1:-}" in
  up) cmd_up ;;
  down) cmd_down ;;
  status) cmd_status ;;
  logs) cmd_logs "${2:-}" ;;
  links) cmd_links ;;
  verify) cmd_verify "${2:-}" ;;
  admin) cmd_admin ;;
  *)
    say "Cách dùng: scripts/play-online.sh up | down | status | logs [số dòng] | links | verify <email> | admin"
    exit 2
    ;;
esac
