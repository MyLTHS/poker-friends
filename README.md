# Poker Friends

No-Limit Texas Hold'em chip ảo cho nhóm bạn. Backend Django + PokerKit.

- Đặc tả: [docs/spec.md](docs/spec.md)
- Lộ trình: [docs/roadmap.md](docs/roadmap.md)
- Quy ước làm việc: [CONTRIBUTING.md](CONTRIBUTING.md)

## Tiến độ

Cập nhật: 27/10/2026. Chi tiết từng đợt (việc, câu hỏi dự đoán, bài tập) ở [docs/roadmap.md](docs/roadmap.md).

**Đang ở:** A và B1 đã được chủ dự án duyệt (bỏ qua bài tập/ghi bài học để đi nhanh). Đang làm
**B2 — Dữ liệu**.

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| A | Nền móng codebase | ✅ Đã duyệt |
| B1 | Engine luật chơi | ✅ Đã duyệt |
| B2 | Dữ liệu | 🟡 Đang làm |
| B3–B8 | Hợp đồng API, realtime, độ bền, tài khoản, phòng, xã hội | 🟡 B3 xong chờ duyệt, B6 có code chờ duyệt, còn lại chưa xong |
| C1–C5 | Thiết kế + frontend | ⬜ Chưa bắt đầu (Claude làm trên mock từ sau B3, một Claude riêng chỉ đọc review) |
| D | Kiểm thử tổng thể | ⬜ |
| E | Production và vận hành | ⬜ |
| F | Beta với bạn bè | ⬜ |
| G | Nhìn lại | ⬜ |

### A. Nền móng codebase

- [x] Repo GitHub, monorepo `apps/` (Django), `web/` (Next.js), `docs/`
- [x] Docker Compose dev: Django/Daphne, Postgres 17, Redis 7
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
- [ ] Gọi `save_completed_hand()` từ table actor (B3–B4, chưa có actor)
- [ ] Duyệt với chủ dự án

**B3. Hợp đồng API** (Claude làm, một Claude riêng chỉ đọc review)

- [x] [`docs/api/ws-protocol.md`](docs/api/ws-protocol.md): envelope, `command_id`, ack/rejected, resync
- [x] JSON Schema + fixtures, OpenAPI, sinh type TypeScript, CI kiểm schema
- [x] Mock server WebSocket ([cách chạy](docs/api/mock-server.md)); trang thử React trong `web/` ([cách chạy](web/README.md))
- [x] [ADR-001 Table actor](docs/adr/ADR-001-table-actor.md)
- [ ] Duyệt với chủ dự án

**B4. Bàn chơi realtime**

- [ ] Table actor + Channels consumer, projection riêng từng người
- [ ] Ownership ghế, nhiều tab, tự bắt đầu ván mới
- [ ] Test lệnh đồng thời và lệnh trùng `command_id`; Playwright nhiều trình duyệt

**B5. Độ bền + staging**

- [ ] Đồng hồ suy nghĩ, hết giờ tự check/fold
- [ ] Heartbeat, disconnect, reconnect bằng snapshot, khôi phục ván dở khi restart
- [ ] Staging trên VPS (Caddy HTTPS), diễn tập backup → khôi phục
- [ ] CD staging: gộp vào `main` + CI xanh thì tự build, migrate, deploy lên staging

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

**B7. Phòng và quyền**

- [ ] Phòng public/private, lobby, link mời
- [ ] Quyền chủ phòng: cấp chip, đổi blind, kick, đóng phòng; rate limit

**B8. Xã hội và quản trị**

- [ ] Chat + emoji, spectator
- [ ] Lịch sử + replay, bảng lời/lỗ
- [ ] Django Admin + nhật ký thao tác admin

### C. Thiết kế + frontend

- [ ] C1. Thiết kế: user flow, wireframe, design system, mockup desktop + mobile
- [ ] C2. Nền frontend: Next.js + TypeScript + Tailwind, state snapshot + reducer, CI cho `web/`
- [ ] C3. Màn bàn chơi: 9 ghế, thanh hành động, đồng hồ, reconnect, animation
- [ ] C4. Các màn còn lại: đăng nhập, lobby, tạo phòng, chủ phòng, chat, lịch sử, hồ sơ
- [ ] C5. Mobile và hoàn thiện: điện thoại thật, accessibility, rà E2E

### D–G. Ra mắt

- [ ] D. Kiểm thử tổng thể: thử gian lận, bấm đúp, mạng chập, kill server
- [ ] E. Production: Sentry, backup hằng ngày, runbook
- [ ] E. CD production: gắn tag `vX.Y.Z` thì deploy image đã chạy trên staging; rollback về tag trước
- [ ] F. Beta: 2–3 buổi chơi thật; một buổi 2 giờ không sai chip, không lộ bài, không crash
- [ ] G. Nhìn lại: retrospective, sổ bài học, chọn hướng tiếp

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

## Cấu trúc

```
apps/games/engine/   # lõi thuần Python, không phụ thuộc Django
  cards.py           # bộ bài + xáo bằng CSPRNG
  hand.py            # HandEngine: một ván, bọc PokerKit
  table.py           # TableSession: ghế, chip theo phòng (ledger), nhiều ván
  simulate.py        # bot ngẫu nhiên + kiểm tra bất biến
apps/games/contract.py  # nạp JSON Schema trong docs/api/, kiểm message WebSocket
apps/games/tests/    # golden tests, property tests, test hợp đồng API
mockserver/          # mock server WebSocket theo docs/api/
config/              # Django settings (đọc biến môi trường)
web/                 # frontend Next.js (trang thử bàn chơi); src/api/ là type sinh từ docs/api/
docs/                # đặc tả, lộ trình, hợp đồng API, trao đổi, bài học
```
