# web — Frontend (Next.js)

Next.js + TypeScript + Tailwind, Claude dựng ở đợt C2 theo [docs/roadmap.md](../docs/roadmap.md),
Codex review. Hiện có **trang thử bàn chơi** nối WebSocket tới [mock server](../docs/api/mock-server.md),
giao diện hướng A "Câu lạc bộ nỉ" chép từ mockup ở `design/mockups/`.

Mọi lệnh dưới đây chạy trong `web/`; package cài vào `web/node_modules`, không cài gì toàn cục.
Cần Node 24.

## Chơi thử một ván với mock server

Mở hai terminal ở thư mục gốc của repo:

```bash
uv run python -m mockserver          # terminal 1: mock server, ws://localhost:8765
```

```bash
cd web && npm ci && npm run dev      # terminal 2: trang web, http://localhost:3000
```

Mở <http://localhost:3000>, chọn **Lym**. Ván đầu Lym cầm 7♥ 2♣: bấm **TỐ** trước flop, rồi
**CƯỢC** sau flop. An và Bình là bot sẽ bỏ bài, và màn "7–2 BLUFF THẮNG" hiện ra với số chip thưởng.
Từ ván 2 bài xáo ngẫu nhiên. Mở thêm tab chọn An hoặc Bình để hai người cùng chơi, hoặc "Chỉ xem".

Mỗi lượt có 20 giây; muốn thong thả hơn thì chạy mock server với `--think-time 90`. Mock server ở
cổng khác thì báo cho trang web:

```bash
NEXT_PUBLIC_TABLE_WS_URL=ws://localhost:8775/ws/rooms/1/ npm run dev
```

## Thử trang tài khoản (B6) với Django thật

Trang `/account` gọi API tài khoản của Django. `next.config.ts` chuyển tiếp (proxy) `/api/...` và
`/accounts/...` sang Django (mặc định `http://localhost:8000`, đổi bằng biến `DJANGO_URL`), nên trình
duyệt chỉ thấy một địa chỉ và cookie phiên + CSRF chạy thẳng, không cần CORS.

```bash
uv run python manage.py migrate      # terminal 1, ở thư mục gốc: tạo bảng (lần đầu)
uv run python manage.py runserver    # Django :8000
```

```bash
cd web && npm run dev                # terminal 2: http://localhost:3000/account
```

Chưa cấu hình email thì email (link xác minh, link đặt lại mật khẩu) **in ra terminal 1**: chép
link mở trong trình duyệt. Chưa có key Google thì nút Google ẩn. Chạy web ở cổng khác 3000 thì
báo Django: `FRONTEND_URL=http://localhost:3100 uv run python manage.py runserver`. Cách tạo key
Google và cấu hình gửi email thật: [docs/huong-dan-google-smtp.md](../docs/huong-dan-google-smtp.md).

## Lệnh

| Lệnh | Làm gì |
|---|---|
| `npm run dev` | Chạy trang ở chế độ phát triển (tự tải lại khi sửa code) |
| `npm run build` | Build bản production (CI chạy) |
| `npm run lint` | ESLint (CI chạy) |
| `npm test` | Unit test bằng Vitest (CI chạy) |
| `npm run api:gen` | Sinh lại `src/api/*.ts` từ `docs/api/` |
| `npm run api:check` | CI chạy: báo lỗi nếu type lệch schema hoặc fixture không khớp type |
| `npm run e2e` | Playwright (B4b): tự chạy Django (DB riêng `e2e.sqlite3`, tạo lại mỗi lần) và web ở cổng 3100, 3 trình duyệt chơi một ván. Cần Chromium của Playwright 1.64.1 đã có trên máy; **đừng tự chạy `npx playwright install`** khi chưa hỏi. CI tự cài |

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `src/app/` | Trang: `/` chọn người chơi, `/table?player=<id>` bàn chơi, `/account` tài khoản (+ `/account/verify`, `/account/reset` mở từ link trong email), `/rooms` lobby và phòng (B7) |
| `src/rooms/LiveTableScreen.tsx` | B4b: `/rooms/<id>/table`, cùng màn bàn chơi với mock nhưng nối WebSocket của Django |
| `src/rooms/` | Trang thử B7/B8: lobby, trang phòng + bảng chủ phòng + chat/người xem (WebSocket tới `NEXT_PUBLIC_DJANGO_WS`, mặc định `ws://localhost:8000`), mở link mời, lịch sử + bảng lời/lỗ, xem lại ván; `api.ts`, `live.ts`, `replay.ts` có test |
| `src/account/` | Màn tài khoản (B6): `api.ts` gọi `/api/auth/` kèm CSRF, `messages.ts` câu thông báo theo mã lỗi; có test |
| `src/club/` | Component hướng A (bàn, ghế, lá bài, chip, thanh hành động) và `club.css`, **chép** từ `design/mockups/src/` (không import chéo thư mục). Sửa mockup thì chép lại tay |
| `src/table/reducer.ts` | Trạng thái bàn: snapshot + áp sự kiện theo `version`, hụt thì xin resync, lệnh chờ ack. Hàm thuần, có test |
| `src/table/useTableSocket.ts` | Giữ một WebSocket, tự nối lại khi mất, gửi những gì reducer xếp vào `outbox` |
| `src/table/view.ts` | Đổi dữ liệu server sang props của `<Table>` (lá `Th` → `10♥`, ghế, blind, pot) |
| `src/api/` | Type sinh từ hợp đồng API, **không sửa tay** |

Trang không tự tính luật: nút nào bật, tố tối thiểu/tối đa bao nhiêu đều lấy từ `legal_actions`
server gửi. Mỗi lần bấm nút tạo **một** `command_id`; bấm đúp, chưa nhận được trả lời sau 5 giây,
hoặc mất kết nối rồi nối lại thì gửi lại đúng message cũ cùng `command_id`.

## Type sinh từ hợp đồng API

`src/api/protocol.ts` (WebSocket, từ `docs/api/schema/`) và `src/api/rest.ts` (REST, từ
`docs/api/openapi.yaml`) là **file sinh tự động, không sửa tay**. Đổi hợp đồng trong `docs/api/`
rồi chạy lại `npm run api:gen` và `npm run api:check`.
