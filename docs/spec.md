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
| 3 | Số ghế | Tối đa 9, hỗ trợ heads-up |
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

## Kiến trúc (tối giản cho 20 người)

- Django + DRF (REST), Django Channels (WebSocket), PostgreSQL, Redis (channel layer).
- **PokerKit** là nguồn chân lý về luật; được bọc sau `HandEngine` nội bộ.
- Mỗi bàn có một writer duy nhất (table actor chạy trong process ASGI).
- Bộ bài do server xáo bằng `secrets.SystemRandom` (CSPRNG), không dùng `random.shuffle` của PokerKit.
- Ván bài replay được từ (cấu hình + thứ tự bộ bài + danh sách action).

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
