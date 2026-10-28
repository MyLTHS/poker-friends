# C4 — Màn tài khoản theo D1 "Nỉ & Đồng thau" (kế hoạch)

Ngày 28/10/2026. Nhánh `claude/c4-account`. Người làm: Claude CLI, do phiên trưởng nhóm giao.
Chờ PR #23 (nền D1 `web/src/ui/`) gộp rồi mới code; kế hoạch viết trước để duyệt.

## Phạm vi

Chỉ sửa: `web/src/account/`, `web/src/app/account/**`, E2E mới `web/e2e/account.spec.ts`.
Không sửa `web/src/ui/` (của C2), `web/src/rooms/`, `web/src/table/`, backend, `design/`.

**Ràng buộc quan trọng:** `web/src/rooms/` (phiên C4-phòng đang làm lại song song) đang import từ
`@/account/ui` (`Shell`, `Card`, `Field`, `NoticeBox`, `Submit`, `useSubmit`, `formValues`),
`@/account/api` (`createAuthApi`, `makeRequest`, `Me`, `Result`) và `@/account/messages`
(`errorText`, `Notice`). **Giữ nguyên các export này** (không đổi tên, không đổi hành vi) để không
làm vỡ màn của họ; màn D1 mới viết ở file mới. Khi `rooms/` bỏ hết import cũ thì xoá `ui.tsx` cũ
trong một commit riêng sau.

## Đường dẫn

Giữ mọi URL đang dùng ngoài web (link trong email, Google):

| URL | Màn |
|---|---|
| `/account` | Chưa đăng nhập → **Đăng nhập**; khách → **Nâng cấp**; thành viên → **Hồ sơ**. Vẫn đọc `?google=` / `?error=` của luồng Google |
| `/account/signup` (mới) | **Đăng ký** + bước 2 "mở email để xác minh" |
| `/account/forgot` (mới) | **Quên mật khẩu**, bước 1 (xin link); bước 2 hiện dạng "việc tiếp theo" |
| `/account/reset?uid&token` (giữ) | **Đặt mật khẩu mới** (bước 2), bước 1 đã xong |
| `/account/verify?token` (giữ) | **Xác minh email**: đang xác minh / xong / link hỏng |

## Từng màn (thiết kế: `design/c1/src/directions/d1/screens-account.tsx`)

Dùng component của `@/ui` (`D1Root`, `AppShell`, `Button`, `TextField`, `Strength`, `Alert`,
`Badge`, `Avatar`, `Wordmark`, `PlayingCard`, `ChipStack`, `fmt`/`signed`/`tone`). Bố cục riêng của
màn tài khoản (hero bàn nỉ, `auth-card`, cột bước 1/2, thẻ khách, ruy băng "giữ chip", lưới hồ sơ)
chưa có trong `d1.css` → chép từ `design/c1/.../style.css` sang `web/src/account/account.css`, bọc
dưới `.d1`. Desktop và điện thoại ngang là **một cây React**; CSS đổi bố cục theo
`(orientation: landscape) and (max-height: 500px)` (như `AppShell`).

| Màn | Có dữ liệu thật | Khác thiết kế (vì API chưa có, không sửa backend) |
|---|---|---|
| Đăng nhập | Email + mật khẩu, nút "Chơi ngay bằng khách", Google (ẩn khi `google_enabled` false), "Quên mật khẩu?", "Đăng ký", gửi lại link xác minh khi `email_not_verified` | Bỏ ô "Nhớ đăng nhập" (server không có tuỳ chọn này) |
| Đăng ký | Email, tên ở bàn, mật khẩu + thanh độ mạnh + gợi ý luật; xong thì cột 2 "Mở email để xác minh" với email thật | Gợi ý tên theo luật thật **2–30 ký tự, không dấu cách** (thiết kế ghi 2–16). "Link có hiệu lực" lấy đúng 3 ngày của server. "Gửi lại sau 0:42": đếm ngược phía trình duyệt 60 giây sau mỗi lần gửi |
| Quên / đặt lại | Bước 1 gửi link (luôn báo "nếu có tài khoản thì link đang tới", không lộ email nào có tài khoản), bước 2 đặt mật khẩu mới + nhập lại + thanh độ mạnh | Thiết kế vẽ hai bước cạnh nhau trên một màn; thật thì bước 2 chỉ dùng được từ link email → ở `/account/forgot` cột 2 là hướng dẫn, ở `/account/reset` cột 1 đánh dấu "đã xong". Ô "Nhập lại" kiểm khớp ở trình duyệt. Hạn link 1 giờ (thiết kế ghi 30 phút) |
| Nâng cấp khách | Thẻ khách (tên), form email + mật khẩu + đổi tên (tuỳ chọn), Google (ẩn khi tắt), đăng xuất khách có cảnh báo | Danh sách "phòng + chip" của khách: không có API "phòng của tôi" → ghép phía trình duyệt từ `GET /api/rooms/` + `GET /api/rooms/{id}/summary/` (vài phòng, đủ cho quy mô 10–20 người); lỗi thì ẩn danh sách, form vẫn dùng được |
| Hồ sơ | Avatar, tên, email + huy hiệu xác minh (gửi lại link nếu chưa), cách đăng nhập (mật khẩu / Google), đăng xuất | "Phòng đang có chip" + tổng lời/lỗ: ghép như trên. Thống kê: "ván đã chơi" (tổng, không có "tối nay"), "phòng có chip", "bàn làm chủ" (đếm theo `owner_name`). **Không đổi tên ở bàn** (chưa có API) → tên chỉ đọc. "Đổi mật khẩu" = gửi link đặt lại tới email của mình (API có sẵn); bỏ dòng "đổi lần cuối" (không có dữ liệu) |

Lỗi server: mã lỗi chung (`errorText`) hiện trong `Alert` đầu form; lỗi từng ô (`fields.email`…)
hiện dưới đúng ô (`TextField` có chỗ báo lỗi). Đang gửi: nút ở trạng thái bận, khoá nút. Đang tải
trang: `Loading`/`Skeleton` của `@/ui`.

## Chuyển động (theo `docs/c2-chuyen-dong.md`)

Chỉ chuyển động nhẹ: thẻ form hiện mờ dần + nổi 8px (`base` 220 ms, `out`); đổi bước (đăng ký →
xác minh) mờ dần; báo lỗi/thành công hiện bằng `Alert`, không rung. Hero bàn nỉ đứng yên. Có
`prefers-reduced-motion`: chỉ mờ dần, không dời chỗ.

## Kiểm tra

- Unit (`vitest`): luật hiện độ mạnh mật khẩu, ghép "phòng của tôi" từ lobby + summary, chọn màn
  theo `Me` (khách / thành viên / chưa đăng nhập).
- `npm run lint`, `npm test`, `npm run build`.
- E2E `web/e2e/account.spec.ts` (Django thật + web thật, như `table.spec.ts`): vào bằng khách → màn
  Nâng cấp; nâng cấp bằng email → Hồ sơ; đăng xuất → Đăng nhập; đăng ký → bước xác minh; đăng nhập
  sai → lỗi dưới form; quên mật khẩu → báo đã gửi; điện thoại ngang 844×390 hiện đúng bố cục.
  Lưu ý: `playwright.config.ts` dùng cổng cố định 8000/3100, không chạy E2E cùng lúc với phiên khác.
- So ảnh với thiết kế (`design/c1`, `npx vite --port 5177`, `#/d1/<màn>/<desktop|mobile>`) ở
  1440×900 và 844×390; ghi lại chỗ còn lệch.

## Việc để lại / cần quyết

- API "phòng của tôi" và "đổi tên ở bàn" (backend) nếu muốn hồ sơ đúng hẳn thiết kế.
- Xoá `web/src/account/ui.tsx` cũ khi `rooms/` không còn dùng.
