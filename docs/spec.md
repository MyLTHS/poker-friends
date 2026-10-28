# Poker Friends — Đặc tả sản phẩm (đã chốt)

Ngày chốt: 22/10/2026

## Mục đích

Web chơi **No-Limit Texas Hold'em cash game bằng chip ảo** giữa bạn bè. Không kinh doanh,
không tiền thật, không rake. Quy mô 10–20 người, 1 server.

## Quyết định sản phẩm

| # | Chủ đề | Quyết định |
|---|---|---|
| 1 | Tiền | Chip ảo |
| 2 | Game | No-Limit Texas Hold'em cash game |
| 3 | Số ghế | Từ 2 đến 9 ghế mỗi phòng (chủ phòng chọn), hỗ trợ heads-up |
| 4 | Loại bàn | Public + private |
| 5 | Vào bàn | Lobby + link mời |
| 6, 22 | Chip | Chip **theo từng phòng**: chủ phòng cấp/điều chỉnh, admin can thiệp được. Cuối phòng có bảng tổng kết lời/lỗ. Không có ví chung |
| 7, 8 | Tournament, bot | Chưa làm (bot chỉ dùng nội bộ để test) |
| 9 | Đăng nhập | Email/mật khẩu, Google, khách (khách nâng cấp được lên tài khoản thật) |
| 10 | Ngôn ngữ | Tiếng Việt |
| 11 | Quy mô | 10–20 người → 1 server, không dùng Celery, Prometheus hay Redis HA |
| 12 | Hạ tầng | Repo GitHub private; 1 VPS + Docker Compose |
| 13, 14 | Xem, chat | Có spectator; có chat + emoji |
| 15, 16 | Mất mạng | Hiện icon disconnect, đồng hồ chạy như thường, hết giờ thì tự check (nếu được) hoặc fold. Không có time bank |
| 17 | Sit-out | Có sit-out và quay lại |
| 18 | Lịch sử | Có hand history + replay |
| 19 | Leaderboard | Không |
| 20 | Vai trò | Chủ bàn: đặt blind, cấp chip, kick, đóng bàn. Không club/đại lý |
| 21 | Rake | Không |
| 23 | Cách làm | Theo giai đoạn, mỗi giai đoạn dừng để duyệt; bắt đầu bằng POC PokerKit |
| 24 | TDD | Có |
| 25 | API | Phục vụ web của dự án, thiết kế chuẩn để dùng lại cho app mobile |
| 26 | Dự án | Django mới hoàn toàn |
| 27 | Luật 7-2 | Chủ phòng cấu hình theo phòng (`Room.seven_deuce_bonus`, mặc định 0 = tắt). Chỉ thưởng khi người cầm đúng hạng **7 và 2** (bất kỳ chất) **ăn pot vì mọi người khác đã fold** (bluff thành công); thắng ở showdown thì **không** thưởng, nên mỗi ván có tối đa một người nhận. Khi đó server **tự lật 2 lá 7-2** của người thắng cho cả bàn (kể cả người xem) sau khi ván xong; bài của người đã fold vẫn úp. **Mọi người khác đang ngồi bàn** (kể cả sit-out) trả người thắng `min(bonus, chip còn lại sau khi chia pot)`, không bao giờ âm; người thắng nhận đúng tổng thực trả; ai còn 0 chip thì không trả. *Walk* (mọi người fold tới big blind, BB cầm 7-2) **cũng được thưởng** (quyết định 27/10/2026, thay bản cũ "thắng tại showdown") |
| 28 | Điện thoại | Giao diện điện thoại **chỉ xoay ngang**, không thiết kế màn dọc (quyết định 27/10/2026). Cầm dọc thì làm gì (ví dụ lời nhắc xoay máy) quyết ở C2 |

## Kiến trúc (tối giản cho 20 người)

Stack: Django + DRF (REST), Django Channels (WebSocket), PostgreSQL 17, Redis 7 (channel layer).
Không Celery, không Prometheus, không Redis HA — quy mô 10–20 người không cần.

Backend chia 3 lớp, lớp dưới không biết lớp trên:

```
apps/games/engine/     # lõi luật chơi — thuần Python, KHÔNG import Django (đã xong, giai đoạn B1)
apps/games/models.py   # lớp dữ liệu — Django ORM, bền vững qua Postgres (giai đoạn B2)
apps/games/actor.py    # lớp điều phối — table actor + Channels consumer (giai đoạn B3–B4)
```

### 1. Lớp engine (đã xong — `apps/games/engine/`)

- **`cards.py`** — bộ bài 52 lá, xáo bằng `secrets.SystemRandom` (CSPRNG), không dùng
  `random.shuffle` sẵn có của PokerKit.
- **`hand.py` — `HandEngine`** — một ván bài, bọc `pokerkit.NoLimitTexasHoldem`. PokerKit là
  nguồn chân lý về luật; `HandEngine` thêm phần PokerKit không có: map ghế ↔ chỉ số người chơi,
  chia bài từ bộ bài server đã xáo, validate ý định người chơi (`legal_actions`, `act`),
  `timeout` (tự check nếu được, không thì fold), `view_for(player)` — projection che bài úp của
  người khác, `record()`/`replay()` để tái tạo đúng kết quả từ (cấu hình + thứ tự bộ bài + danh
  sách action). Có chốt chặn nội bộ: tổng chip đổi khác 0 sau mỗi `act()` → ném `RuntimeError`
  ngay, không để lọt. `seven_deuce_bluff_winner()` — luật 7-2 (#27): người
  ăn pot vì mọi người khác fold mà đang cầm đúng hạng 7 và 2 (bất kỳ chất), hoặc `None`; xác định
  từ danh sách action nên replay luôn ra cùng kết quả. `HandConfig.seven_deuce_bonus` > 0 thì
  `view_for` lật 2 lá đó cho mọi người sau khi ván xong.
- **`table.py` — `TableSession`** — nhiều ván liên tiếp trên một bàn: xoay ghế/button, sit-out /
  sit-in, cấp chip giữa các ván, ledger tạm trong bộ nhớ, bảng tổng kết. `seven_deuce_bonus`
  (mặc định 0): khi `finish_hand()` có người thắng luật 7-2, mọi người khác đang ngồi bàn (kể cả
  sit-out) trả `min(bonus, chip còn lại sau pot)`, người thắng nhận đúng tổng thực trả — luôn cân
  bằng về 0 trong phòng, không ai bị âm chip. Khi lên B2, phần ledger này được thay bằng bản
  ghi DB bền vững (xem mục 2).
- **`simulate.py`** — bot ngẫu nhiên chạy N ván, dùng trong test + CI để kiểm bất biến (không
  mất/sinh chip, không lộ bài) ở quy mô lớn (hàng nghìn ván) mà property test đơn lẻ khó phủ hết.

Phát hiện quan trọng về PokerKit cần nhớ khi code các lớp trên (chi tiết:
[docs/plans/phase-1-poc.md](plans/phase-1-poc.md)): PokerKit chỉ *cảnh báo* khi fold lúc được
check miễn phí ở `Mode.CASH_GAME` — engine phải tự quyết `can_fold = call_amount > 0`, không dựa
vào `can_fold()` của PokerKit.

### 2. Lớp dữ liệu (B2 — đã code, `apps/games/models.py`)

Các model chính (B7–B8 thêm `RoomMember`, `RoomBan`, `OwnerAction`, `ChatMessage`; đủ danh sách và
ràng buộc: `apps/games/models.py`):

| Model | Vai trò | Ghi chú |
|---|---|---|
| `User` | Tài khoản, có cờ `is_guest` | Khách nâng cấp lên thật vẫn giữ nguyên `id` → giữ lịch sử + chip |
| `Room` | Một bàn/phòng chơi | `status` trong DB chỉ là `open` hoặc `closed`; `playing` (đang có ván) và `suspended` (chờ khôi phục) là trạng thái **tính ra** lúc gửi cho client, không lưu; cấu hình blind, số ghế, thời gian suy nghĩ, `seven_deuce_bonus` (luật #27, 0 = tắt thưởng) |
| `RoomSeat` | Một người ngồi ở một ghế của một `Room` | Gắn `User` ↔ `Room`, số ghế (1 đến `max_seats` của phòng, DB kiểm bằng trigger), trạng thái sit-out |
| `LedgerEntry` | Bút toán chip | **Chỉ ghi thêm (append-only)** — không `UPDATE`/`DELETE` dòng cũ; mọi thay đổi chip (cấp, kết quả ván, thưởng luật 7-2) là một dòng mới. `kind`: `grant` / `hand` / `seven_deuce`; dòng `hand`/`seven_deuce` trỏ tới `Hand` cùng phòng, `grant` thì không. Trigger PostgreSQL chặn cả SQL thô |
| `Hand` | Một ván, ghi lúc chia bài (`completed_at` có khi ván xong) | Lưu `HandConfig` (ghế/stack/button/blind/bộ bài/mức thưởng 7-2) + `result` (kết quả lúc ván xong, để đối chiếu khi replay), đủ để `HandEngine.replay()` lại |
| `HandCommand` | Một lệnh người chơi đã được áp dụng vào một `Hand` | Ghi **trước khi** áp vào engine (xem mục 3) — là nguồn phục hồi khi process chết giữa ván. `sequence` cho thứ tự replay; **chỉ ghi thêm** như ledger; xóa `Hand` bị chặn (`PROTECT`) |

Bất biến bắt buộc có test: **tổng `LedgerEntry` của một `Room` luôn bằng tổng chip đã cấp cho
phòng đó** — không có "ví chung" giữa các phòng (chip theo từng phòng, theo quyết định #6/#22).
Ghi `LedgerEntry` luôn trong một DB transaction cùng với bản ghi kết quả ván
(`apps/games/services.py` → `save_completed_hand()`).

### 3. Lớp điều phối — Table actor (B3–B4, ADR-001)

Quyết định kiến trúc (thống nhất với Codex ở `docs/collab/`, đã chốt thành
[ADR-001](adr/ADR-001-table-actor.md) ở B3):

- Một process ASGI; **mỗi phòng (room) có một asyncio task + một hàng đợi lệnh riêng** — đây
  chính là "writer duy nhất" cho bàn đó, tránh phải dùng khoá (lock) khi nhiều người bấm cùng lúc.
- Thứ tự xử lý một lệnh bắt buộc là:
  **kiểm tra hợp lệ → ghi `HandCommand` vào DB → áp vào `HandEngine` → phát sự kiện qua
  Channels/Redis.**
  Ghi trước-rồi-áp đảm bảo: nếu process chết giữa lúc áp dụng, khởi động lại chỉ cần
  `HandEngine.replay()` từ các `HandCommand` đã ghi — không mất, không lặp lại hiệu ứng.
- Lệnh bị từ chối (sai lượt, sai luật, `command_id` trùng nhưng nội dung khác) **chỉ ghi log**,
  không ghi `HandCommand`, trả `command.rejected` với mã lỗi ổn định cho client. Lệnh gửi lại
  **y nguyên** (cùng `command_id`, cùng nội dung) thì không bị từ chối: server không áp lại mà trả
  `command.ack` của lần áp đầu (`duplicate: true`).
- Giao thức WebSocket (chi tiết đầy đủ ở `docs/api/ws-protocol.md`, làm ở B3):
  - Envelope mỗi message: `protocol_version`, `room_id`, `hand_id`, `version` (số thứ tự sự kiện
    tăng dần trong phòng), `server_time`.
  - Mỗi lệnh client gửi có `command_id` riêng (client tự sinh) — server dùng để chống áp dụng
    trùng khi client gửi lại do mạng chập.
  - Sự kiện server phát: `command.ack` / `command.rejected`, `table.snapshot`, `action.applied`,
    `turn.deadline`, `hand.completed`.
  - Khi client phát hiện hụt `version` (mất gói) → gửi yêu cầu, server trả `table.snapshot` đầy
    đủ để đồng bộ lại (resync), không cần replay toàn bộ lịch sử ở phía client.

### 4. Bảo mật & độ bền (xuyên suốt B4–B5)

- **Server là nguồn chân lý duy nhất; client chỉ gửi ý định** (nguyên tắc #1, xem mục dưới) —
  mọi luật, mọi phép tính chip chạy ở `HandEngine`/table actor, không tin bất kỳ số liệu nào
  client tự tính.
- Projection (`view_for`) đảm bảo không lộ bài úp của người khác qua REST, WebSocket, hay log —
  kể cả với người đã fold và spectator.
- Đồng hồ suy nghĩ chạy ở server; hết giờ tự check (nếu được) hoặc fold — không có time bank.
- Mất kết nối: server hiện trạng thái disconnect cho người khác thấy, đồng hồ vẫn chạy như
  thường; khi client reconnect, đồng bộ lại bằng `table.snapshot` (không replay thủ công).
- Process ASGI restart giữa ván: khôi phục trạng thái bàn bằng `HandEngine.replay()` từ
  `HandCommand` đã ghi trong DB — không cần snapshot riêng cho mục đích này.

### 5. Tài khoản & quyền (B6–B7)

> **Tiến độ B6 (27/10/2026):** đã có code, chờ duyệt — app `apps/accounts/`, API `/api/auth/`
> ([openapi.yaml](api/openapi.yaml), tag `auth`), trang thử `web/` → `/account`. Trạng thái "email
> đã xác minh" lưu ở bảng `EmailAddress` của django-allauth (không thêm cột vào `User`); đăng nhập
> bằng mật khẩu cần email đã xác minh. Google chỉ bật khi có key
> ([hướng dẫn](huong-dan-google-smtp.md)).

- Đăng nhập: email/mật khẩu (có xác minh + quên mật khẩu), Google OAuth, hoặc khách
  (`is_guest=True`) — khách chơi được ngay, nâng cấp lên tài khoản thật sau mà không mất chip
  hay lịch sử (cùng `User.id`).
- Quyền chủ phòng (gắn trên `Room`, không phải vai trò toàn hệ thống): cấp/điều chỉnh chip khi
  người đó không trong ván, đổi blind/thời gian suy nghĩ cho ván kế tiếp, kick, đóng phòng.
  Không có khái niệm club/đại lý.
- Kick chặn **tài khoản**. Phòng private: kick đổi luôn link mời, nên người bị kick không quay lại
  được bằng một tài khoản khách mới qua link cũ. Phòng public ai cũng vào được, nên kick không chặn
  được người đó mở một tài khoản khách mới (trình duyệt ẩn danh). Chấp nhận giới hạn này cho bàn
  bạn bè; không chặn theo IP (nhiều người chung một mạng nhà/quán).
- Rate limit ở tầng API cho: đăng nhập, tạo phòng, gửi lệnh WebSocket — chống spam/brute-force ở
  quy mô nhỏ mà không cần hạ tầng riêng (không Celery/queue ngoài).

### 6. Hạ tầng

Repo GitHub private; 1 VPS + Docker Compose (Django/Daphne, Postgres 17, Redis 7, Caddy làm
HTTPS reverse proxy ở staging/production). Quy mô 10–20 người/server nên cố tình **không** thêm
Celery, Prometheus hay Redis HA — thêm sớm là over-engineering cho bài toán này.

## Ba nguyên tắc không phá vỡ

1. Server là nguồn chân lý duy nhất; client chỉ gửi ý định.
2. Chip luôn được bảo toàn: mọi thay đổi chip có bút toán (append-only ledger).
3. Mọi ván replay được ra cùng kết quả.

## Lộ trình

| Giai đoạn | Nội dung |
|---|---|
| 1 | POC PokerKit: `HandEngine`, chia bài bằng CSPRNG, projection, replay, golden tests, mô phỏng hàng nghìn ván |
| 2 | Nền Django: accounts (email/Google/khách), rooms, seats, ledger chip theo phòng, hand history |
| 3 | Table actor + WebSocket protocol + reconnect + timer/auto check-fold |
| 4 | Chat, spectator, quyền chủ bàn, admin |
| 5 | Frontend (Next.js) |
| 6 | Hardening, Docker Compose, deploy VPS, beta với bạn bè |
