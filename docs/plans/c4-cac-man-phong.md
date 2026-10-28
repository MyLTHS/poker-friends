# C4 — Các màn về phòng theo D1 "Nỉ & Đồng thau"

Viết 28/10/2026. Nhánh `claude/c4-d1-rooms-dc7fb5`. Bắt đầu code **sau khi PR #23 (C2, nền D1) gộp
vào main** (`git fetch origin && git merge origin/main`).

Bản gốc: `design/c1/src/directions/d1/screens-rooms.tsx` (lobby, create-room, invite),
`screens-social.tsx` (history, states), `screens-table.tsx` dòng 584–760 (owner-panel), CSS
`design/c1/src/directions/d1/style.css` dòng 2492–4185 (lobby → states) và 6802–7160 (owner).
So ảnh ở `http://localhost:5176/#/d1/<màn>/<desktop|mobile>` với màn thật 1440×900 và 844×390.

## 1. Phạm vi file

| Của C4 (chỉ mình sửa) | Không đụng |
|---|---|
| `web/src/rooms/*` trừ 5 file của C3 dưới đây | `LiveTableScreen.tsx`, `useRoomLive.ts`, `live.ts`, `ReplayScreen.tsx`, `replay.ts` (C3) — chỉ **dùng** `useRoomLive` |
| `web/src/app/page.tsx`, `app/rooms/page.tsx`, `app/rooms/join/`, `app/rooms/[id]/page.tsx`, `app/rooms/[id]/history/` | `web/src/ui/*` có sẵn (C2), `web/src/account/**`, `app/account/**` (CLI) |
| **Route mới** `app/rooms/new/page.tsx` (màn tạo phòng; chưa ai có) | `app/globals.css`, `app/layout.tsx` (C2/C3 đang sửa) |
| E2E mới `web/e2e/rooms.spec.ts` | `web/e2e/table.spec.ts`, backend, `design/` |

CSS riêng: `web/src/rooms/rooms.css` — port nguyên selector `.d1 .x` của các đoạn trên, bọc
`@layer components { … }`, đổi `.d1.d1-mobile .x` thành
`@media (orientation: landscape) and (max-height: 500px) { .d1 .x }`, đổi vị trí tuyệt đối của
khung mẫu sang flex/grid. **Import từ chính các file màn của mình** (`import "./rooms.css"`) thay
vì thêm dòng vào `globals.css`, để không giẫm file của C2/C3. (App Router cho phép import CSS
toàn cục ở bất kỳ component nào.)

Primitive dùng chung mới (để ở `web/src/rooms/`, ghi vào báo cáo để C2 cân nhắc kéo về `ui/`):
- `QrCode.tsx` — QR thật của link mời. Kit thiết kế chỉ vẽ QR giả; C2 chưa có QR. Dùng gói npm
  nhỏ không phụ thuộc `qrcode-generator` (MIT, ~20 KB) chỉ để tính ma trận, vẽ bằng SVG theo đúng
  lớp `.qr / .qr-bg / .qr-fg` và con dấu ♠ giữa (mức sửa lỗi H để con dấu không làm hỏng mã).
- `SeatPicker`, `BlindPair`, `VisibilityPick`, `QuickAmounts` (trong `CreateRoomForm.tsx`) — chỉ
  màn phòng dùng.
- `useOnline()` — đọc `navigator.onLine` + sự kiện `online/offline` cho trạng thái mất mạng.

## 2. Màn thiết kế ↔ route ↔ API

| Màn D1 | Route | API (`web/src/rooms/api.ts`, không đổi) | Ghi chú |
|---|---|---|---|
| **lobby** | `/rooms` (và `/` chuyển hướng về đây) | `GET /api/rooms/`, `GET /api/auth/me/` | Desktop: `AppShell active="lobby"`, `page-head` + nút Tạo phòng, toolbar (tìm, tab Tất cả/Công khai/Của tôi/Còn ghế, ô dán link mời), lưới `room-card` 3 cột. Điện thoại: rail gỗ + 2 cột (danh sách `room-row` cuộn được \| cột bên: tìm, tab, dán link, Tạo phòng). Lọc/tìm làm ở trình duyệt. |
| **create-room** | `/rooms/new` (mới) | `POST /api/rooms/` | Form thật: tên, blind nhỏ/lớn, ghế 2–9 (`seat-picker`), giây suy nghĩ (tab 15/20/30/45/60), thưởng 7-2 (toggle + số + nhanh 25/50/100), công khai/riêng; khung "Xem trước" cập nhật theo form. Thành công → `/rooms/<id>?moi=1` (mở thẳng phần link mời). Chưa đăng nhập → khối mời đăng nhập/chơi khách (link `/account`). Điện thoại: `AppShell sub` (thanh 48px, nút X về sảnh, nút "Tạo phòng & lấy link mời" bên phải). |
| **invite** (phía chủ phòng) | `/rooms/<id>` khi `is_owner` | `GET /api/rooms/<id>/`, `POST …/invite/` (đổi link) | `ShareCard`: link thật `inviteUrl()`, nút Chép (đổi thành "Đã chép link" + toast), "Gửi qua…" = `navigator.share` nếu có, QR thật, câu "Lỡ gửi nhầm? Đổi link…". Phòng công khai không có link riêng thì vẫn hiện link (backend vẫn cấp token). |
| **invite** (phía người nhận) | `/rooms/join?token=…` | `POST /api/rooms/join/` | Hiện thiệp mời `Invitation` (con dấu sáp, góc đồng, "An mời bạn vào Bàn thứ Sáu", blind/ghế/7-2, trạng thái phòng) với nút **Vào phòng** (→ `/rooms/<id>`) và **Chỉ xem** (→ `/rooms/<id>/table`), dòng "Bạn đang đăng nhập là … · đổi tài khoản". API chỉ có "join" (không có xem trước bằng mã) nên **join ngay khi mở trang như hiện nay**, rồi vẽ thiệp từ `RoomDetail` trả về — hành vi giữ nguyên, chỉ khác là không tự chuyển trang nữa mà để người dùng bấm. |
| *(trang phòng — không có màn riêng trong thiết kế)* | `/rooms/<id>` | `GET …/`, `GET …/snapshot/`, `POST/DELETE …/seats/`, `useRoomLive` (chat, người xem, `room.updated`) | Ghép từ các khối D1: desktop dùng lưới 2 cột của màn invite — trái: `ShareCard` (chỉ chủ phòng) + panel "Ghế" (danh sách ghế, Ngồi đây / Rời ghế, mất kết nối, nghỉ); phải: thiệp phòng (thông tin + nút **Vào bàn chơi**) + panel chat/người xem + link Lịch sử. Chủ phòng có nút **Bảng chủ phòng** mở `OwnerSheet`. Điện thoại: `AppShell sub` (back về sảnh), 2 cột cuộn riêng. Giữ poll REST 10 s + reload khi `tableChanges`. |
| **owner-panel** | component `OwnerPanel` / `OwnerSheet` (gắn ở `/rooms/<id>`; C3 gắn vào bàn sau) | `POST …/chips/`, `POST …/kick/`, `PATCH …/`, `POST …/invite/`, `POST …/close/` | Xem mục 3. |
| **history** | `/rooms/<id>/history` | `GET …/summary/`, `GET …/hands/`, `GET /api/rooms/` (chọn phòng), `GET /api/auth/me/` (đánh dấu "bạn", tab "Có tôi") | Bảng `ledger` (Được cấp, Số ván, 7-2, Còn, Lời/lỗ + `netbar`), dòng Tổng + "Sổ khớp" khi tổng net = 0; danh sách ván (ván huỷ có nhãn "Đã huỷ" + câu giải thích, ván khác nút Xem lại → `/hands/<id>`), tab Tất cả/Có tôi. `room-select` = menu các phòng trong lobby để đổi phòng. Điện thoại: rail (tab Lịch sử) + 2 cột. |
| **states** | mọi màn trên | — | Xem mục 4. |

Dữ liệu thiết kế có mà API **không có** (bỏ hoặc thay, ghi rõ trong PR):
- Lobby "3 người đang xem", nhãn "Bạn ở ghế 1 · 1.460 chip" → bỏ; "Bàn của bạn" so `owner_name` với
  tên mình (LobbyRoom không có `owner_id`; trùng tên chỉ làm sai nhãn, không sai quyền).
- Invite "Đã vào bằng link tối nay" → thay bằng panel "Ghế" (ai đang ngồi) vì API không ghi ai vào bằng link.
- Thiệp "Đang chơi ván #37 · 3 người xem" → dùng `status` của phòng (+ số người xem nếu đã nối socket).
- History "mở từ 19:30" → giờ ván đầu tiên trong danh sách; "Xem thêm 34 ván" → API trả tối đa
  100 ván, hiện 20 rồi nút "Xem thêm" mở dần ở trình duyệt.

## 3. OwnerPanel (component độc lập cho C3)

```ts
// web/src/rooms/OwnerPanel.tsx
export function OwnerPanel(props: {
  detail: RoomDetail;                 // từ GET /api/rooms/<id>/
  seats: SeatOccupant[];              // từ snapshot.table.seats (hoặc state bàn của C3)
  inHand?: (playerId: string) => boolean; // C3 truyền vào; không có thì hiện "Ghế n"
  onChanged: () => void;              // gọi lại sau mỗi thao tác thành công để tải lại phòng
  onClose?: () => void;
  rooms?: RoomsApi;                   // mặc định createRoomsApi()
}): JSX.Element
export function OwnerSheet(props: Parameters<typeof OwnerPanel>[0] & { open: boolean; onClose: () => void })
```

Nội dung theo thiết kế: đầu (vương miện, "Bảng chủ phòng", tên phòng); thông báo đồng thau khi có
`detail.pending` ("Ván sau: blind 20/40 · 15 giây" — không có nút Huỷ vì API không có lệnh huỷ
thay đổi chờ); "Người chơi & chip": mỗi người một dòng, bấm **Cấp/trừ** mở dòng (stepper ±, ô số,
**Cấp n**, **Trừ n** = amount âm, **Mời ra**); Blind (cặp ô nhỏ/lớn, hiện `cũ → mới`), Giây suy nghĩ
(tab 15/20/30/45/60, giữ giá trị lạ nếu đang khác), Thưởng 7-2 (toggle + số) — một nút **Lưu luật**
(PATCH chỉ trường đã đổi; đang có ván thì báo "áp từ ván sau"); Link mời (ô link, chép, **Đổi link**);
vùng nguy hiểm **Đóng phòng**. Mời ra và Đóng phòng hỏi lại bằng `Modal` của C2 (thay
`window.confirm`). Lỗi server hiện ngay tại chỗ: lỗi trường dưới ô (`fields`), lỗi thao tác dưới
dòng người chơi/khối đó, thành công bằng toast. Chủ phòng không tự mời ra mình (ẩn nút như hiện nay).

## 4. Trạng thái từng màn

| Màn | Đang tải | Lỗi | Trống | Mất mạng |
|---|---|---|---|---|
| Lobby | `Loading` + `Skeleton` tiêu đề/ô tìm + 3 `SkeletonCard` (điện thoại: compact) | `ErrorState` "Không tải được danh sách phòng" + **Thử lại**, kèm ô "Có link mời? Vẫn vào thẳng bàn được" | `EmptyState` mini-table 6 ghế + "Sảnh còn trống" + Tạo phòng / Dán link mời; lọc ra rỗng → "Không có phòng khớp …" + xoá lọc | banner/toast "Mất mạng — đang chờ có lại" (`useOnline`), có mạng lại thì tự tải lại |
| Tạo phòng | — (form hiện ngay; chờ `me` thì nút bận) | lỗi trường dưới từng ô, lỗi chung `Alert error` trên nút; 429 → câu "đợi n phút" | — | nút Tạo bị khoá + câu "Đang mất mạng" |
| Vào bằng link | thiệp khung `Spinner` "Đang mở thiệp mời…" | thiệp lỗi: mã sai/đã đổi (`room_not_found`), bị kick (`kicked`), 429 — kèm **Về sảnh**; lỗi mạng → **Thử lại** | không có token → "Link mời thiếu mã" | như lỗi mạng |
| Trang phòng | skeleton 2 cột | 404/403 → `ErrorState` + Về sảnh; lỗi mạng → Thử lại; lỗi thao tác (ngồi ghế…) → toast lỗi | ghế trống hết → câu mời ngồi; chat rỗng → "Chưa ai nói gì" | banner mất mạng; socket mất → chấm trạng thái "Đang kết nối lại…" |
| Bị kick / phòng đóng (socket) | — | toast nguy hiểm "Bạn đã bị mời ra khỏi phòng" (đúng màn states), rồi khoá thao tác + nút Về sảnh; phòng đóng → nhãn "Đã đóng" + link Lịch sử | — | — |
| Owner panel | nút đang làm có `busy` | lỗi tại chỗ (mục 3) | không ai ngồi → "Chưa ai ngồi. Cấp chip khi bạn bè đã vào ghế." | các nút khoá |
| Lịch sử | skeleton ledger + 4 dòng ván | `ErrorState` + Thử lại / Về phòng | chưa ai có chip → "Chưa ai được cấp chip"; chưa ván nào → "Chưa có ván nào xong"; tab "Có tôi" rỗng → câu riêng | banner mất mạng |

## 5. Chuyển động (theo `docs/c2-chuyen-dong.md`)

- Chỉ `transform`/`opacity`, token `--dur-*`/`--ease-*`; không thêm thư viện.
- Chuyển trang: nội dung `.page` hiện mờ dần + trồi 8px (`--dur-base`, `--ease-out`); danh sách
  phòng so le `STAGGER.chips` (40 ms) tối đa 8 thẻ đầu.
- Mở/đóng owner sheet, modal xác nhận: dùng sẵn `Sheet`/`Modal` của C2 (`--dur-slow`).
- Toast: `ToastProvider` của C2 (chép link, cấp chip, lỗi thao tác, bị kick).
- Dòng người chơi trong owner panel mở ra: mờ dần + trượt xuống 4px; thiệp mời hiện ra: trồi + nghiêng nhẹ rồi nằm yên (`--ease-settle`).
- Hover thẻ phòng: nhấc 2px (`--dur-fast`).
- `prefers-reduced-motion: reduce` → tất cả thành mờ dần 120 ms hoặc tắt (token CSS của C2 đã tự rút ngắn; phần mình viết thêm bọc media query).

## 6. Kiểm tra

1. Backend thật: `DATABASE_URL=sqlite:///<scratchpad>/c4.sqlite3 DJANGO_DEBUG=true uv run python manage.py migrate`
   rồi `… uv run daphne -p 8102 config.asgi:application`; web `DJANGO_URL=http://127.0.0.1:8102 npm run dev -- -p 3102`.
2. Thiết kế `cd design/c1 && npx vite --port 5176`; chụp cùng kích thước 1440×900 và 844×390 bằng
   Playwright (Chromium đã có sẵn trong cache, không `playwright install`) cho lobby, create-room,
   invite (2 phía), owner-panel, history, states; so từng cặp, sửa chỗ lệch.
3. Unit (vitest): lọc/tìm lobby, đọc token từ link dán, tính "xem trước" của form tạo phòng, PATCH
   chỉ trường đổi, QR mã hoá đúng (giải lại ma trận bằng chính thư viện), tổng net/"Sổ khớp".
4. E2E mới `web/e2e/rooms.spec.ts`: An mở lobby trống → Tạo phòng (form thật) → thấy link mời +
   QR → Bình (trình duyệt khác, chưa đăng nhập) mở link → thấy thiệp "An mời bạn vào …" → Vào phòng
   → ngồi ghế; An mở Bảng chủ phòng cấp chip cho Bình → số dư đổi. Thêm một ca link sai → thiệp lỗi.
5. `npm run lint`, `npm test`, `npm run build`, `npm run e2e` (cả `table.spec.ts`) đều qua.
6. Commit nhỏ theo màn; push; PR vào main kèm ảnh so sánh; không gộp.

## 7. Thứ tự làm

1. Merge main (có C2) → `rooms.css` (port CSS) + `QrCode` + `useOnline`.
2. Lobby + `/` chuyển hướng + trạng thái lobby.
3. Tạo phòng `/rooms/new`.
4. Trang phòng + `ShareCard` + `OwnerPanel`/`OwnerSheet`.
5. Vào bằng link (thiệp).
6. Lịch sử.
7. So ảnh, sửa lệch; E2E; lint/test/build; PR.

## Câu hỏi để trưởng nhóm chốt (mặc định ghi bên cạnh, cứ thế làm nếu không ai đổi)

- Thêm route `/rooms/new` — **mặc định: thêm** (thiết kế có màn riêng, chưa ai sở hữu).
- `/` (đang là trang chọn người chơi của mock server) — **mặc định: chuyển hướng về `/rooms`**; danh
  sách chọn người của mock server giữ lại ở chân lobby, chỉ hiện khi `NODE_ENV !== "production"`.
- Thêm gói `qrcode-generator` vào `web/package.json` — **mặc định: thêm** (QR phải quét được thật).
- `NAV_ITEMS` (C2) đang trỏ tab "Lịch sử" về `/rooms`; lịch sử cần biết phòng nên C4 **không đổi**
  file của C2 — trang lịch sử vẫn mở từ trang phòng/thẻ phòng. Đề nghị C2/C5 sau này cho tab trỏ
  `/rooms/<phòng gần nhất>/history`.
