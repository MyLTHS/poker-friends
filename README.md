# Poker Friends

No-Limit Texas Hold'em chip ảo cho nhóm bạn. Backend Django + PokerKit.

- Đặc tả: [docs/spec.md](docs/spec.md)
- Lộ trình: [docs/roadmap.md](docs/roadmap.md)
- Quy ước làm việc: [CONTRIBUTING.md](CONTRIBUTING.md)

## Tiến độ

Cập nhật: 28/10/2026. Chi tiết từng đợt (việc, câu hỏi dự đoán, bài tập) ở [docs/roadmap.md](docs/roadmap.md);
những gì đổi so với kế hoạch ban đầu ở [roadmap, mục "Đổi so với kế hoạch"](docs/roadmap.md#đổi-so-với-kế-hoạch-ban-đầu).

**Đang ở:** A tới E đã xong và đã gộp vào `main`. **F (beta với bạn bè) đang chuẩn bị**: server chạy
trên máy Mac của chủ dự án qua Cloudflare Tunnel ([choi-online.md](docs/choi-online.md)), sổ tay
buổi chơi ở [beta-f.md](docs/beta-f.md), nút "Gửi phản hồi" và tự báo lỗi trình duyệt (#31).
Chủ dự án đã duyệt A và B1; cổng duyệt và bài tập từ B2 trở đi còn để dành, làm theo
[sổ bài học](docs/learning/README.md).

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| A | Nền móng codebase | ✅ Đã duyệt |
| B1 | Engine luật chơi | ✅ Đã duyệt |
| B2–B8 | Dữ liệu, hợp đồng API, bàn chơi realtime, độ bền, tài khoản, phòng và quyền, xã hội | ✅ Xong (#5–#14, sửa sau kiểm tra toàn bộ ở #16) |
| C1 | Thiết kế | ✅ Chọn **D1 Nỉ & Đồng thau** trong bốn hướng; điện thoại chỉ xoay ngang (#15, #18, #21) |
| C2–C5 | Frontend theo D1 | ✅ Xong: nền D1, bàn chơi, các màn phòng và tài khoản, điện thoại ngang, trợ năng (#23–#25, #27, #28) |
| D | Kiểm thử tổng thể | ✅ Xong: 19 cách tấn công thử, bot chơi thử hàng trăm ván (#19, #22) |
| E | Vận hành | ✅ Xong theo kế hoạch đã đổi: chơi online từ máy Mac, sao lưu/khôi phục có diễn tập, bỏ Redis (#17, #20, #26) |
| F | Beta với bạn bè | 🟡 Đang chuẩn bị: phản hồi + lỗi trình duyệt (#29, #31), xác minh email hộ và lệnh `links`/`verify`/`admin` cho buổi chơi (#30) |
| G | Nhìn lại | ⬜ |

### A. Nền móng codebase

- [x] Repo GitHub, monorepo `apps/` (Django), `web/` (Next.js), `docs/`
- [x] Docker Compose dev: Django/Daphne, Postgres 17 (Redis bỏ từ 28/10/2026, xem ADR-001)
- [x] Settings đọc `.env`; chặn secret yếu khi tắt `DEBUG`
- [x] GitHub Actions: ruff, Django check, kiểm migration, pytest, mô phỏng 500 ván — xanh trên `main`
- [x] `CONTRIBUTING.md`, mẫu PR
- [x] Codex review cấu trúc và quy ước ([trao đổi](docs/collab/2026-10-22-claude-response-phase-a.md))
- [x] Bài tập: sửa README trên nhánh `lym/a-sua-readme`, mở PR, xem CI chạy, gộp
- [x] Cổng duyệt: chủ dự án duyệt trực tiếp, bỏ qua ghi bài học chi tiết để đi nhanh sang B

### B. Backend

**B1. Engine luật chơi** — [kế hoạch và kết quả](docs/plans/phase-1-poc.md)

- [x] `HandEngine` bọc PokerKit: `legal_actions`, `act`, `timeout` (tự check hoặc fold)
- [x] Chia bài bằng CSPRNG (`secrets.SystemRandom`)
- [x] Projection `view_for` không lộ bài úp của người khác
- [x] `record()` / `replay()` ra đúng kết quả
- [x] `TableSession`: ghế, xoay button, sit-out/sit-in, cấp chip, ledger trong bộ nhớ, bảng tổng kết
- [x] 62 test (golden + property test) và mô phỏng 3 × 5.000 ván: 0 mất/sinh chip, 0 lộ bài
- [x] Bài tập test 3 người all-in: bỏ qua, duyệt trực tiếp
- [x] Duyệt với chủ dự án

**B2. Dữ liệu**

- [x] Models `User` (cờ khách), `Room`, `RoomSeat`, `LedgerEntry` (chỉ ghi thêm), `Hand`, `HandCommand`
- [x] Migration `0001`–`0007` (`apps/games/migrations/`), kể cả trigger PostgreSQL chặn sửa/xóa
  ledger và log lệnh, chặn ghế vượt `max_seats`
- [x] Test: tổng ledger một phòng bằng tổng chip đã cấp, không đổi khi chia kết quả ván, không
  update/delete được một dòng ledger hay một lệnh (kể cả bằng SQL thô), ghế/lệnh không trùng,
  ràng buộc blind/ghế/amount, replay từ DB ra đúng kết quả đã lưu
- [x] Trang thử: Django Admin (`apps/games/admin.py`) — ledger chỉ xem, không sửa/xoá được
- [x] Luật 7-2 (#27 trong `docs/spec.md`, chốt lại 27/10/2026): ăn pot bằng bluff khi cầm 7-2
  (bất kỳ chất) thì bài được lật cho cả bàn và mọi người khác ở bàn (kể cả sit-out) trả thêm tối
  đa `Room.seven_deuce_bonus` chip, không ai bị âm — `HandEngine.seven_deuce_bluff_winner()` +
  `TableSession._apply_seven_deuce_bonus()`
- [x] Ghi một ván đã xong cùng toàn bộ ledger của ván trong một transaction:
  `apps/games/services.py` → `save_completed_hand()` (kiểm tổng bằng 0, gọi lại không ghi thêm)
- [x] Gọi `save_completed_hand()` từ table actor (làm ở B4a, cả lúc khôi phục sau crash)
- [ ] Duyệt với chủ dự án

**B3. Hợp đồng API** (Claude làm, một Claude riêng chỉ đọc review)

- [x] [`docs/api/ws-protocol.md`](docs/api/ws-protocol.md): envelope, `command_id`, ack/rejected, resync
- [x] JSON Schema + fixtures, OpenAPI, sinh type TypeScript, CI kiểm schema
- [x] Mock server WebSocket ([cách chạy](docs/api/mock-server.md)); trang thử React trong `web/` ([cách chạy](web/README.md))
- [x] [ADR-001 Table actor](docs/adr/ADR-001-table-actor.md)
- [ ] Duyệt với chủ dự án

**B4. Bàn chơi realtime**

- [x] B4a: table actor theo [ADR-001](docs/adr/ADR-001-table-actor.md) (`apps/games/actor.py`) +
  Channels consumer (`apps/games/consumers.py`), mỗi người nhận góc nhìn riêng, mọi message qua
  `contract.validate_outgoing`
- [x] B4a: REST vào ghế / rời ghế / snapshot; khách lưu DB ngay khi kết nối (Django session);
  `manage.py create_demo_room` để thử tay
- [x] B4a: một user một ghế, 2 tab cùng tài khoản dùng chung ghế, tự bắt đầu ván mới, xoay button,
  hết giờ tự check/fold (đồng hồ tối thiểu, đầy đủ ở B5)
- [x] B4a: test lệnh đồng thời, trùng `command_id`, hết giờ đua với lệnh, khôi phục sau crash
  (kể cả ván xong mà chưa lưu), fail-stop; chơi thật một ván 2 người qua Daphne
- [x] B4b: trang React nối backend thật: `/rooms/<id>/table` (REST snapshot trước để có cookie
  phiên, rồi WebSocket Django), reducer nhận `room.updated`; thử tay một ván trọn với người chơi
  thứ hai qua WebSocket
- [x] B4b: Playwright (`web/e2e/`, `npm run e2e`, job CI `e2e`): hai người chơi và một người xem,
  mỗi người một trình duyệt riêng, chơi trọn một ván trên Django thật; không ai thấy bài úp của người
  khác, stack mọi trang khớp nhau, bấm đúp chỉ áp một lần
- [ ] Duyệt với chủ dự án

**B5. Độ bền + staging**

- [x] Đồng hồ suy nghĩ, hết giờ tự check/fold (B4a); khôi phục giữa ván giữ phần thời gian còn lại
- [x] Heartbeat (ping WebSocket của Daphne), disconnect, reconnect bằng snapshot, khôi phục ván dở
  khi restart (B4a); ván không dựng lại được thì phòng mở ở trạng thái tạm dừng, huỷ bằng
  `manage.py void_hand` ([ADR-001](docs/adr/ADR-001-table-actor.md), [deploy](docs/deploy.md))
- [x] Diễn tập backup → khôi phục: job `restore-drill` trong CI chạy mỗi PR và mỗi Chủ nhật (#17)
- Không làm (đổi kế hoạch, không thuê VPS): staging trên VPS, CD staging. Thay bằng chơi online từ
  máy Mac ([choi-online.md](docs/choi-online.md)) và job `prod-smoke` dựng đúng bộ Docker production trong CI

**B6. Tài khoản** — app `apps/accounts/`, API `/api/auth/` trong [openapi.yaml](docs/api/openapi.yaml)

- [x] Email/mật khẩu: đăng ký, xác minh email (link hết hạn sau 3 ngày), đăng nhập/đăng xuất,
  quên mật khẩu (link dùng một lần, 1 giờ); cookie phiên Django + CSRF
- [x] Google qua `django-allauth`, chỉ bật khi có `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
- [x] Khách (`is_guest`) và nâng cấp khách bằng email hoặc Google: cùng `User.id`, chip và lịch sử
  ván ở mọi phòng giữ nguyên; email đã thuộc người khác thì từ chối, không gộp tài khoản
- [x] Rate limit đăng nhập, quên mật khẩu (theo IP và theo email), gửi email, tạo khách — cache Django
- [x] Email in ra console khi chưa có `EMAIL_URL`; [hướng dẫn tạo key Google + SMTP](docs/huong-dan-google-smtp.md)
- [x] Trang thử React `/account` ([cách chạy](web/README.md))
- [ ] Lym tạo key Google + SMTP thật và thử lại
- [ ] Duyệt với chủ dự án

**B7. Phòng và quyền** — `apps/games/rooms.py`, tag `rooms` trong [openapi.yaml](docs/api/openapi.yaml)

- [x] Phòng public/private, lobby, link mời có token (đổi được, link cũ hết hiệu lực); phòng
  private chỉ chủ phòng, thành viên vào bằng link và người đang ngồi thấy (REST và WebSocket)
- [x] Quyền chủ phòng qua hàng đợi của actor: cấp/trừ chip (không khi người đó đang trong ván, không
  âm), đổi blind/thời gian/thưởng 7-2 (giữa ván thì chờ ván sau, phát `room.updated`), kick (rời
  ghế, đóng kết nối, không vào lại được; phòng private đổi luôn link mời, phòng public chỉ chặn
  được tài khoản, xem [spec](docs/spec.md)), đóng phòng (giữa ván thì đóng khi ván xong)
- [x] Rate limit tạo phòng (10/giờ mỗi người) và lệnh WebSocket (20/10 giây mỗi người chơi)
- [x] Trang thử `web/` → `/rooms`: lobby, tạo phòng, link mời (`/rooms/join?token=`), bảng chủ phòng
  (cấp/trừ chip, kick, đổi cấu hình, đổi link, đóng phòng); ghế cập nhật qua REST mỗi 3 giây
- [ ] Duyệt với chủ dự án

**B8. Xã hội và quản trị**

- [x] Chat + emoji (`chat.send` → `chat.message`, 5 dòng/10 giây, lịch sử 50 dòng), danh sách người
  xem (`audience.updated`); hai loại này là "thông báo", không tăng `version`
- [x] Lịch sử ván + replay từng bước theo góc nhìn người xem (test: không bao giờ lộ bài úp của người
  khác ở bất kỳ bước nào), bảng lời/lỗ từ sổ chip (`apps/games/history.py`)
- [x] Admin: staff có quyền chủ phòng ở mọi phòng (qua đúng API của chủ phòng); mọi thao tác chủ
  phòng/admin ghi vào `OwnerAction` (chỉ ghi thêm, trigger PostgreSQL); Django Admin chỉ xem phần
  do actor nắm, xoá được chat, bỏ kick được
- [x] Trang thử `web/`: chat trực tiếp + người xem ở `/rooms/<id>`, lịch sử + bảng lời/lỗ ở
  `/rooms/<id>/history`, xem lại từng bước ở `/hands/<id>` (thử tay: 2 người chơi qua WebSocket, xem
  bằng trình duyệt)
- [ ] Duyệt với chủ dự án

### C. Thiết kế + frontend

- [x] C1. Bốn hướng thiết kế đầy đủ 17 màn × desktop 1440 + điện thoại ngang 844 (`design/c1/`): D1 Nỉ &
  Đồng thau, D2 Kính & Ánh Kim, D3 Kẹo Đêm, D4 Sơn Mài Vàng Son; xem bằng `npm run dev` hoặc đưa
  vào Figma bằng html.to.design ([hướng dẫn](docs/c1-thiet-ke.md))
- [x] C1. Chủ dự án chọn **D1 Nỉ & Đồng thau**; điện thoại chỉ xoay ngang, cầm dọc thì hiện lời nhắc
  xoay máy (spec #28)
- [x] C2. Nền giao diện D1: token, component, chuyển động, trang mẫu `/ui` (`web/src/ui/`,
  [c2-chuyen-dong.md](docs/c2-chuyen-dong.md)) (#23)
- [x] C3. Bàn chơi D1: 2–9 ghế, thanh hành động, đồng hồ, mất kết nối, chuyển động, thưởng 7-2 (#25)
- [x] C4. Các màn còn lại: sảnh, tạo phòng, link mời + QR, bảng chủ phòng, lịch sử, xem lại ván (#24);
  đăng nhập, đăng ký, mật khẩu, khách, hồ sơ (#28)
- [x] C5. Điện thoại ngang (844×390, 932×430, 667×375), phím tắt, âm thanh, trợ năng (axe), E2E trọn
  luồng (#27, #28)

### D–G. Ra mắt

- [x] D. 19 cách tấn công thử, mỗi cách một test (`apps/games/tests/test_attacks.py`,
  [biên bản](docs/collab/d-tan-cong-thu.md)); bấm đúp, nhiều tab, rút mạng giữa lệnh (#22)
- [x] D. Bot chơi thử với server thật (hàng trăm ván, cả qua tunnel thật): `manage.py soak` ([choi-thu-bang-bot.md](docs/choi-thu-bang-bot.md)) (#19)
- [x] E. `check_ledger`, sao lưu/khôi phục (`scripts/backup.sh`, `restore.sh`), diễn tập khôi phục trong
  CI, compose production, [runbook](docs/runbook.md) (#17)
- [x] E. Chơi online từ máy Mac qua Cloudflare Tunnel: `scripts/play-online.sh` (#20)
- [x] E. Bỏ Redis: một process Daphne, kênh phát tin trong bộ nhớ ([ADR-001](docs/adr/ADR-001-table-actor.md)) (#26)
- Không làm (đổi kế hoạch): Sentry (thay bằng tự báo lỗi trình duyệt vào admin, F), CD production
  theo tag (chưa có VPS; [runbook](docs/runbook.md) có cách đổi bản và quay về bản trước bằng tay)
- [ ] F. Beta: 2–3 buổi chơi thật; một buổi 2 giờ không sai chip, không lộ bài, không crash
  ([sổ tay](docs/beta-f.md)). Đã có: phản hồi và lỗi trình duyệt (#29, #31); xác minh email hộ, lọc link email, tạo admin (#30)
- [ ] G. Nhìn lại: retrospective, sổ bài học, chọn hướng tiếp

### Việc còn lại cho D và E

Từ đợt kiểm tra chỉ-đọc toàn bộ B (trước C), đã làm ở D (#22) và dọn nốt ở #32:

- [x] `DJANGO_DEBUG` mặc định tắt; production đặt `DJANGO_DEBUG=false` rõ ràng. `manage.py` tự bật
  debug khi thiếu `DJANGO_SECRET_KEY` (cho dev) và in cảnh báo ra stderr.
- [x] Vào/rời ghế qua REST có rate limit riêng (10 lần/phút mỗi người).
- [x] `Hand.seven_deuce` lưu người thắng 7-2 và ai trả bao nhiêu; ván cũ được điền lại từ sổ chip
  (migration 0012). Migration 0013 điền nốt ván thắng 7-2 mà không ai trả, cho cùng dạng với ván
  mới (lưới an toàn: chơi thật không sinh ra trường hợp này, vì người bỏ bài luôn còn chip).
- Không làm (đổi kế hoạch): staging, CD production (chưa có VPS).
- Chấp nhận, không làm: kick trong phòng public chỉ chặn tài khoản, không chặn người đó mở tài khoản
  khách mới (không chặn theo IP, [spec](docs/spec.md)); tài khoản bị khóa lúc đang kết nối vẫn nhận
  tin của bàn tới khi gửi tin kế tiếp thì bị đóng (4403).

## Chạy

```bash
cp .env.example .env
docker compose up
```

Hoặc không dùng Docker:

```bash
uv sync
.venv/bin/pytest
.venv/bin/python -m apps.games.engine.simulate --hands 5000 --players 9
```

Mock server WebSocket (không cần Docker hay DB) và trang thử React chơi một ván giả
([docs/api/mock-server.md](docs/api/mock-server.md), [web/README.md](web/README.md)):

```bash
uv run python -m mockserver          # terminal 1
cd web && npm ci && npm run dev      # terminal 2, rồi mở http://localhost:3000
```

Chơi thật với bạn bè, server là máy Mac ([docs/choi-online.md](docs/choi-online.md)):

```bash
scripts/play-online.sh up     # in ra link https://….trycloudflare.com để gửi cho nhóm
scripts/play-online.sh down   # hết buổi: sao lưu rồi tắt
```

## Cấu trúc

```
apps/games/engine/   # lõi thuần Python, không phụ thuộc Django
  cards.py           # bộ bài + xáo bằng CSPRNG
  hand.py            # HandEngine: một ván, bọc PokerKit
  table.py           # TableSession: ghế, chip theo phòng (ledger), nhiều ván
  simulate.py        # bot ngẫu nhiên + kiểm tra bất biến
apps/games/actor.py  # table actor: mỗi phòng một hàng đợi lệnh (ADR-001)
apps/games/consumers.py  # WebSocket (Channels); rooms.py, history.py: REST phòng, lịch sử
apps/games/contract.py   # nạp JSON Schema trong docs/api/, kiểm message WebSocket
apps/games/management/   # check_ledger, void_hand, soak (bot), simulate_hands
apps/accounts/       # tài khoản: email/mật khẩu, Google, khách, rate limit
apps/feedback/       # phản hồi người chơi và lỗi trình duyệt (chỉ xem trong admin)
mockserver/          # mock server WebSocket theo docs/api/
config/              # Django settings (đọc biến môi trường)
web/src/ui/          # design system D1 Nỉ & Đồng thau (trang mẫu: /ui)
web/src/table/       # màn bàn chơi; rooms/, account/: các màn còn lại; api/: type sinh từ docs/api/
web/e2e/             # Playwright: chơi thật trên Django, điện thoại ngang, trợ năng (axe)
scripts/             # play-online.sh (chơi từ máy Mac), backup.sh / restore.sh
deploy/              # Caddyfile, mẫu .env production
docs/                # đặc tả, lộ trình, hợp đồng API, runbook, bài học (learning/)
```
