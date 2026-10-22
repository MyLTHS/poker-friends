# Lộ trình Poker Friends

Bản 4: 22/10/2026. Xây theo lớp, phục vụ mục tiêu **học hỏi và rèn tư duy**. Đã qua hai vòng phản
biện với Codex ([docs/collab/](collab/)). Chờ chủ dự án duyệt.

## Nguyên tắc

- **Học theo lớp**: nền móng → backend → thiết kế + frontend → kiểm thử → vận hành → beta → nhìn lại.
  Chủ dự án học và duyệt theo đúng thứ tự này.
- **Codex được làm trước trên dữ liệu giả**: sau khi chốt hợp đồng API (B3), Codex dựng thiết kế
  và frontend song song trên mock, nên không phải ngồi chờ. Phần nào nối được với backend thật
  thì nối dần. Còn bài học và cổng duyệt của phần C vẫn diễn ra sau khi xong B.
- **Mỗi đợt backend có trang thử** (Codex làm) để chủ dự án tự bấm và thấy hệ thống chạy thật.
- **Claude**: trưởng nhóm, backend, review code Codex. **Codex**: trang thử, thiết kế, frontend,
  review code Claude.
- Nhánh riêng, PR vào `main`, CI xanh, bên kia review. Gộp vào `main`, deploy và đổi phạm vi thì
  luôn hỏi chủ dự án.
- Trao đổi Claude ↔ Codex ghi ở `docs/collab/`; bài học ghi ở `docs/learning/`.

## Nhịp học của mỗi đợt (gọn)

1. **Dự đoán**: chủ dự án trả lời **một câu hỏi trọng tâm** trước khi code. Sai không sao.
2. **Tự làm một phần nhỏ**: một bài tập có kết quả kiểm chứng được (test pass, thấy trên trang thử).
3. **Đối chiếu**: so dự đoán và bài làm với cách Claude/Codex làm; ghi 3–5 dòng bài học.

Claude chỉ viết tài liệu giải thích dài khi đợt đó có khái niệm mới. Cổng duyệt: chủ dự án chơi
thử trên trang thử và nói "được" mới sang đợt sau.

## Tổng quan

| Giai đoạn | Nội dung | Thời gian | Kiểu tư duy rèn luyện |
|---|---|---|---|
| A | Nền móng codebase | 1 tuần | Tổ chức để nhiều người cùng làm |
| B | Backend (B1–B8) | 8–10 tuần | Logic, dữ liệu, đồng thời, lỗi, bảo mật |
| C | Thiết kế + frontend (C1–C5) | 5–6 tuần, Codex làm trước từ B3 | Đặt mình vào vị trí người dùng |
| D | Kiểm thử tổng thể | 1–2 tuần | Nghĩ như kẻ phá |
| E | Production và vận hành | 1 tuần | Giữ hệ thống sống |
| F | Beta với bạn bè | 1–2 tuần | Lắng nghe người dùng, ưu tiên |
| G | Nhìn lại | 2–3 ngày | Tự đánh giá |
| | **Tổng** | **khoảng 16–20 tuần** (C chồng một phần lên B) | |

---

## A. Nền móng codebase (1 tuần)

**Việc:**
- Claude: commit B1, repo GitHub private; monorepo `apps/` (Django), `web/` (Next.js), `docs/`;
  Docker Compose dev (Django, Postgres 17, Redis 7); settings đọc `.env`; GitHub Actions (ruff,
  pytest, mô phỏng 500 ván); `CONTRIBUTING.md`.
- Codex: review cấu trúc và quy ước.

**Dự đoán:** CI chặn được loại lỗi nào, không chặn được loại nào?
**Tự làm:** tạo nhánh, sửa README, mở PR, xem CI chạy, nhờ Codex review.
**Cổng duyệt:** clone repo, chạy một lệnh, test pass.

---

## B. Backend

### B1. Engine luật chơi ✅

Đã xong: `HandEngine` bọc PokerKit, chia bài bằng CSPRNG, projection chống lộ bài, replay,
`TableSession` (ledger trong bộ nhớ), mô phỏng 15.000 ván. Chi tiết: [plans/phase-1-poc.md](plans/phase-1-poc.md).

**Dự đoán (làm lại để học):** vì sao 60 test pass mà mô phỏng vẫn tìm ra lỗi fold?
**Tự làm:** viết một test mới cho trường hợp 3 người all-in, stack khác nhau.

### B2. Dữ liệu (1 tuần)

**Việc:** models `User` (có cờ khách), `Room` (mở → đang chơi → đóng; blind, số ghế, thời gian suy
nghĩ), `RoomSeat`, `LedgerEntry` (chỉ ghi thêm), `Hand`, `HandCommand`; migration; ghi ledger trong
transaction; identity khách lưu DB ngay từ đầu.

**Dự đoán:** server tắt giữa lúc ghi kết quả ván thì sổ chip có thể sai thế nào?
**Tự làm:** viết test chứng minh tổng ledger một phòng luôn bằng tổng chip đã cấp.
**Trang thử:** Django Admin xem phòng, ghế, sổ chip.

### B3. Hợp đồng API (1 tuần, Claude + Codex làm chung)

**Việc:**
- `docs/api/ws-protocol.md`: envelope (`protocol_version`, `room_id`, `hand_id`, `version`,
  `server_time`); lệnh có `command_id`; `command.ack` / `command.rejected` (mã lỗi ổn định);
  `table.snapshot`, `action.applied`, `turn.deadline`, `hand.completed`…; resync khi hụt version.
- JSON Schema + fixtures; OpenAPI cho REST; sinh type TypeScript; CI kiểm schema.
- **Mock server** do Codex dựng, phát sự kiện từ fixtures và được kiểm tra theo schema.
- **ADR-001 Table actor:** một process ASGI; mỗi phòng một asyncio task + hàng đợi lệnh; thứ tự
  **kiểm tra hợp lệ → ghi `HandCommand` → áp vào engine → phát sự kiện**; lệnh bị từ chối chỉ ghi
  log và trả `command.rejected`; khôi phục bằng `HandEngine.replay`.

**Dự đoán:** client bấm Call, mạng chập nên gửi lại lần nữa; server phải làm gì?
**Tự làm:** viết thêm một message (ví dụ `player.sit_out`) vào schema + fixture, CI phải xanh.
**Trang thử:** trang thô chạy một ván giả từ mock server.
**Song song từ đây:** Codex bắt đầu C1 (thiết kế) rồi C2 (nền frontend) trên mock.

### B4. Bàn chơi realtime (2 tuần)

**Việc:** table actor theo ADR-001; Channels consumer; projection riêng từng người qua Redis;
ownership ghế; 2 tab cùng tài khoản dùng chung ghế; tự bắt đầu ván mới, xoay button; test 2 lệnh
cùng lúc, test lệnh trùng `command_id`.

**Dự đoán:** hai người bấm cùng lúc thì chuyện gì xảy ra? Vì sao "mỗi bàn một người ghi" đơn giản
hơn dùng khoá?
**Tự làm:** viết test gửi cùng một `command_id` hai lần, chứng minh chỉ áp dụng một lần.
**Trang thử:** trang thô nối backend thật; mở nhiều tab chơi một ván. Playwright 2–3 trình duyệt.

### B5. Độ bền + staging (2 tuần)

**Việc:** đồng hồ suy nghĩ, hết giờ tự check/fold, deadline tuyệt đối; heartbeat + trạng thái
disconnect; reconnect bằng snapshot; khôi phục ván dở khi restart; sit-out / sit-in. **Staging tối
thiểu** trên VPS (Docker Compose + Caddy HTTPS) và **diễn tập backup → khôi phục**.

**Dự đoán:** kể 5 cách ván bài có thể hỏng giữa chừng. Cái nào nguy hiểm nhất?
**Tự làm:** tự kill server giữa ván trên staging, khởi động lại, kiểm chip không lệch.
**Trang thử:** rút mạng 10 giây rồi vào lại; chơi thử qua link staging.
**Cần chủ dự án chuẩn bị:** VPS, tên miền.

### B6. Tài khoản (1,5 tuần)

**Việc:** email/mật khẩu (xác minh, quên mật khẩu), Google, nâng cấp khách giữ nguyên lịch sử và
chip; rate limit đăng nhập.

**Dự đoán:** xác thực (authentication) khác phân quyền (authorization) ở đâu?
**Tự làm:** viết test: khách nâng cấp xong vẫn còn đúng chip trong các phòng.
**Trang thử:** đăng nhập email/Google, nâng cấp từ khách.
**Cần chủ dự án chuẩn bị:** Google Cloud OAuth, dịch vụ email.

### B7. Phòng và quyền (1,5 tuần)

**Việc:** tạo phòng public/private, lobby API, link mời có token; quyền chủ phòng (cấp chip khi
người đó không trong ván, đổi blind/thời gian cho ván sau, kick, đóng phòng); rate limit tạo phòng
và gửi lệnh.

**Dự đoán:** một người sửa `room_id` để vào phòng private; server chặn ở đâu?
**Tự làm:** viết test: người không phải chủ phòng gọi API cấp chip thì bị từ chối.
**Trang thử:** tạo phòng, gửi link mời, chủ phòng cấp chip và kick.

### B8. Xã hội và quản trị (1–1,5 tuần)

**Việc:** chat + emoji; spectator; API lịch sử + replay (chỉ bài đã lật hoặc của chính người xem);
bảng tổng kết lời/lỗ; Django Admin + nhật ký thao tác admin.

**Dự đoán:** khi xem lại một ván cũ, dữ liệu nào tuyệt đối không được trả về?
**Tự làm:** viết test: API replay không bao giờ trả bài úp của người khác.
**Trang thử:** chat, xem bàn, xem lại ván, bảng lời/lỗ.

**Cổng duyệt cuối B:** chơi trọn một buổi trên trang thử với đủ tính năng backend.

---

## C. Thiết kế + frontend

Codex làm trước trên mock từ sau B3; mỗi màn nối backend thật khi đợt B tương ứng xong; E2E tăng
dần sau mỗi lát. Bài học và cổng duyệt của chủ dự án diễn ra theo thứ tự dưới đây sau khi xong B.

### C1. Thiết kế

**Việc:** user flow; wireframe; 2 phương án phong cách để chọn; design system (màu, chữ, lá bài,
chip, nút); mockup Figma desktop + mobile dọc.
**Dự đoán:** trên điện thoại, khi tới lượt mình trong 20 giây, người chơi cần thấy gì?
**Tự làm:** vẽ tay (hoặc Figma) wireframe màn bàn chơi trên mobile, rồi so với bản của Codex.

### C2. Nền frontend

**Việc:** Next.js + TypeScript + Tailwind; component theo design system; state = snapshot +
reducer sự kiện + resync; API client từ type sinh tự động; reducer test với fixtures.
**Dự đoán:** vì sao frontend không được tự tính kết quả ván?
**Tự làm:** viết một reducer test cho sự kiện `action.applied` từ fixture.

### C3. Màn bàn chơi

**Việc:** bàn 9 ghế, thanh hành động (½ pot, ¾ pot, pot, all-in, thanh trượt), đồng hồ, icon
disconnect, overlay reconnect, animation chia bài / đẩy chip / gom pot.
**Dự đoán:** animation nào giúp hiểu ván, animation nào chỉ làm chậm?
**Tự làm:** thêm nút raise nhanh "2x" theo hướng dẫn; test E2E phải pass.

### C4. Các màn còn lại

**Việc:** đăng nhập, lobby, tạo phòng, link mời, bảng chủ phòng, chat, người xem, lịch sử + replay,
tổng kết, hồ sơ; trạng thái loading/lỗi/trống.
**Dự đoán:** khi mất mạng ở lobby thì nên hiển thị gì?
**Tự làm:** viết một E2E cho luồng tạo phòng → mời → vào chơi.

### C5. Mobile và hoàn thiện

**Việc:** điện thoại thật, accessibility, phím tắt, âm thanh bật/tắt; rà soát toàn bộ E2E.
**Dự đoán:** liệt kê 3 điều làm người chơi khó chịu nhất trên điện thoại.
**Tự làm:** chơi một ván trên điện thoại thật, ghi lại 3 vấn đề và cùng sửa một cái.

**Cổng duyệt cuối C:** chơi đủ luồng trên giao diện thật, cả desktop và điện thoại.

---

## D. Kiểm thử tổng thể (1–2 tuần)

**Việc:** tấn công thử (lộ bài qua API/WS, giả mạo người chơi, sửa ID); bấm đúp, nhiều tab, mạng
chập, kill server giữa lệnh; chơi thử nội bộ nhiều giờ.
**Dự đoán:** nếu bạn là người gian lận, bạn sẽ thử những gì?
**Tự làm:** thử 3 cách gian lận bạn nghĩ ra; cách nào lọt thì thành test hồi quy.

## E. Production và vận hành (1 tuần)

**Việc:** nâng staging thành production; Sentry; backup hằng ngày + lịch diễn tập khôi phục;
script deploy và rollback; runbook sự cố.
**Dự đoán:** vì sao "backup chưa thử khôi phục thì coi như chưa có backup"?
**Tự làm:** tự deploy một thay đổi nhỏ rồi rollback.

## F. Beta với bạn bè (1–2 tuần)

**Việc:** 2–3 buổi chơi thật; form phản hồi; theo dõi lỗi; sửa theo ưu tiên.
**Dự đoán:** phản hồi nào sửa ngay, cái nào để sau, cái nào không làm?
**Tự làm:** tự xếp ưu tiên danh sách phản hồi, so với cách xếp của Claude.
**Điều kiện xong:** một buổi 2 giờ không sai chip, không lộ bài, không crash không khôi phục được.

## G. Nhìn lại (2–3 ngày)

**Việc:** retrospective; tổng hợp `docs/learning/` thành sổ bài học; cập nhật tài liệu kiến trúc;
chọn hướng tiếp (tournament, bạn bè, thống kê, app mobile).
**Tự làm:** viết một trang "nếu làm lại từ đầu, tôi sẽ làm khác 3 điều".

---

## Rủi ro chính

| Rủi ro | Cách giảm |
|---|---|
| Actor và lưu trữ sai khi process chết | ADR-001 ở B3; ghi lệnh trước khi phát; replay; test kill server ở B5 |
| Học theo lớp nên phát hiện vấn đề giao diện muộn | Trang thử mỗi đợt B; Codex làm C trước trên mock từ B3 |
| Nhịp học quá nặng thành viết tài liệu | Mỗi đợt chỉ 1 câu hỏi + 1 bài tập + 3–5 dòng bài học |
| Hợp đồng API đổi làm vỡ frontend | Tài liệu trước code; type sinh tự động; contract test hai phía |
| Hai AI sửa đè code nhau | Nhánh + worktree riêng; phân vùng `apps/` và `web/` |
| PokerKit có thêm hành vi bất ngờ | Mô phỏng chạy trong CI; mọi bất thường thành test hồi quy |
| Dịch vụ ngoài làm chậm | VPS/tên miền trước B5; Google/email trước B6 |
