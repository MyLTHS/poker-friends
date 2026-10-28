# C3 — Bàn chơi D1 "Nỉ & Đồng thau" + animation (kế hoạch)

Viết 28/10/2026, trước khi PR #23 (C2, nền `web/src/ui/`) được gộp. Code bắt đầu sau khi trưởng nhóm
báo "C2 đã gộp" (`git fetch origin && git merge origin/main`).

Một câu: thay bàn chơi tạm (hướng A, `web/src/club/`) bằng bàn D1 đúng thiết kế ở 1440×900 và
844×390 ngang, có chuyển động chia bài / chip / pot / lật bài / 7-2 đúng `docs/c2-chuyen-dong.md`,
mà **trạng thái vẫn chỉ lấy từ server** — chuyển động là lớp trang điểm, mất nó giao diện vẫn đúng.

## 1. Nguồn

| Màn thiết kế (`design/c1`, `#/d1/<màn>/<desktop|mobile>`) | Code gốc | Màn thật |
|---|---|---|
| table-turn | `screens-table.tsx` `TableTurn`, `table.tsx` | `/rooms/<id>/table` (và `/table` của mockserver) |
| table-showdown | `TableShowdown` | như trên, sau `hand.completed` có lật bài |
| seven-deuce | `SevenDeuce` | như trên, `hand.completed` có `seven_deuce` |
| reconnect | `Reconnect` (thẻ "Đang kết nối lại…" + biến thể "Bàn tạm dừng") | socket rớt / `room.suspended` |
| chat | `ChatScreen` (desktop: cột phải; điện thoại: ngăn trượt từ phải) | nút Chat trên thanh bàn |
| replay | `screens-social.tsx` `Replay` | `/hands/<id>` |

CSS: `design/c1/src/directions/d1/style.css` dòng 4186–7560 (phần TABLE). Nền chung (token, bài,
chip, avatar, `TimerRing`, nút, overlay-card, `fly`/`play`) dùng từ `@/ui` của C2, không sửa.

Không thuộc C3: bảng chủ phòng (`owner-panel`) — C4 làm. Trên thanh bàn C3 chỉ đặt nút vương miện
(chỉ hiện với chủ phòng/staff); xem mục 9 câu hỏi 1.

## 2. File

Mọi file mới nằm trong `web/src/table/` (trừ các route và màn trong `rooms/` được giao).

| File | Việc |
|---|---|
| `table.css` | Port CSS bàn từ design (giữ selector `.d1 .seat`, `.stage`, `.abar`, `.sd-*`, `.chat`, `.rp-*`…), bọc `@layer components`, `@import` trong `globals.css` sau `d1.css`. `.d1-mobile` → `@media (orientation: landscape) and (max-height: 500px)`. Thêm `--dur-turn-pulse`, `--dur-seven-deuce`, halo, confetti, keyframes của 7-2 (C2 để lại cho C3). |
| `geometry.ts` | Toạ độ ghế/bàn/pot/board từ `GEO` của design (desktop 1100×720, phone 612×390) + bố cục 2–9 ghế: mình luôn ở vị trí 1 (giữa dưới); bàn ít ghế dùng tập con vị trí cân đối (vd 6 ghế: 1,3,4,6,7,9). Hàm thuần, có test. |
| `seatView.ts` (thay `view.ts`) | `TableState` → mô hình hiển thị theo thiết kế (`SeatView`): trạng thái ghế `turn / waiting / folded / all-in / sitting-out / disconnected / winner / empty`, dealer + SB/BB (từ `button_seat`, như `blindSeats` cũ), bài úp/ngửa, cược, nhãn hành động cuối, người xem (`you.seat === null`). Chỉ hiển thị, không quyết luật. |
| `Stage.tsx` | Bàn (rail, nỉ, chữ khắc phòng · blind), `Board`, `Pot`, `Bet`, `SeatPod`, `MeSeat`, nút dealer. Vị trí theo % của khung; kích thước nhân hệ số `k` = bề rộng thật / bề rộng thiết kế (ResizeObserver) ⇒ ở 1440×900 và 844×390, `k = 1` đúng từng px thiết kế. Không dùng `transform: scale` cho cả bàn để FLIP đo đúng toạ độ. |
| `ActionBar.tsx` | Desktop `TurnBar` / `IdleBar`; điện thoại `TurnPanel` / panel chờ. Nút: Bỏ (`can_fold`), Check (`can_check`) hoặc Theo `call_amount`, Tố/Cược (`min_raise_to`…`max_raise_to`); ½ pot, ¾ pot, pot, all-in (`raisePresets` cũ, kẹp theo server); thanh trượt + nút −/+ (bước = big blind, luôn kẹp min/max) + ô số. Phím tắt desktop: F bỏ, C check/theo, R tố. Thiếu `legal_actions` ⇒ không có nút. |
| `useTurnClock.ts` | Đồng hồ lượt theo `turn.deadline` + `clockOffsetMs` (giờ server, không giờ máy), cập nhật bằng `requestAnimationFrame` cho vòng `TimerRing` mượt và số giây; dừng khi bàn tạm dừng. |
| `fx/` (`cues.ts`, `useTableFx.ts`, `Confetti.tsx`) | Chuyển động, xem mục 4. |
| `SevenDeuce.tsx` | Khoảnh khắc 7-2 mới (thay `SevenDeuceMoment.tsx`): medal, 2 lá tự lật, banner, sổ trả thưởng (`payments`), confetti. |
| `Overlays.tsx` | Mất kết nối (scrim, dải `conn-strip`, thẻ `ReconnectCard`: lần thử, tự thử lại sau N giây, đồng hồ của mình vẫn chạy, nút "Thử lại ngay"/"Về sảnh") và "Bàn tạm dừng" (`room.suspended`). |
| `Side.tsx` | Cột phải desktop: tab Chat / Người chơi / Nhật ký; chân "Pot · Đang cược · Trong ván". Điện thoại: ngăn trượt Chat / Người xem (bàn vẫn thấy bên trái). |
| `log.ts` | Nhật ký ván dựng từ các sự kiện đã áp (ván #, blind, hành động, đường bài, lật bài, ai ăn). Snapshot giữa ván ⇒ nhật ký bắt đầu từ lúc vào. |
| `TableScreen.tsx` | Ráp các phần trên; giữ chữ ký props cũ để `/table` (mock) và `LiveTableScreen` không đổi cách gọi. |
| `rooms/ReplayScreen.tsx` | Viết lại theo thiết kế replay: cùng `Stage`, thanh bước có vạch, nút ⏮ ◀ ▶/⏸ ▶ ⏭, tốc độ 1×/2×, dòng diễn biến, kết quả. Chuyển bước dùng lại cue chuyển động (bước tới 1 = có animation; kéo nhảy nhiều bước = hiện ngay). |
| `club/*` | Xoá khi không còn import (`club.css` để lại nếu màn C4 còn dùng — kiểm lúc làm). |

Reducer (`reducer.ts`) thêm, không đổi luật cũ:
- `chat`, `spectators` nhận `chat.message` / `audience.updated` ngay trên socket bàn (dùng lại
  `mergeChat` của `rooms/live.ts`; `useRoomLive` giữ nguyên API vì `RoomScreen` của C4 dùng), gửi
  `chat.send` qua outbox; lịch sử chat lấy REST khi socket mở (như `useRoomLive`).
- `lastActions` theo ghế trong ván hiện tại (nhãn "Theo 40", "Bỏ"… dưới ghế), xoá khi `hand.started`.
- `fx`: hàng cue chuyển động (mục 4), kèm `fxEpoch` tăng ở mỗi snapshot để bỏ cue cũ.
- `sit_out` / `sit_in` ("Nghỉ ván sau") qua outbox.
- `useTableSocket` trả thêm `attempt` và `retryAt` cho thẻ mất kết nối, và `reconnectNow()`.

## 3. Ghế và trạng thái

| Trạng thái thiết kế | Lấy từ server |
|---|---|
| tới lượt (`st-turn`, halo, vòng đồng hồ) | `hand.actor === player_id` và ván chưa xong; giờ từ `turn.deadline` |
| đã bỏ (`st-folded`) | `hand.players[].in_hand === false` |
| all-in | `in_hand` và `stack === 0` |
| nghỉ (`st-sitting-out`) | `seats[].sitting_out` |
| mất kết nối (`st-disconnected`, cờ wifi) | `seats[].connected === false` (đồng hồ vẫn chạy nếu tới lượt) |
| thắng (`st-winner`, vương miện) | `hand.completed` `results[].hand_net > 0` |
| trống ("Ngồi vào") | không có người; bấm ⇒ `rooms.takeSeat(id, seat)` khi mình đang xem |
| người xem | `you.seat === null`: không có ghế "Bạn", thanh dưới hiện "Bạn đang xem" + nút ngồi |
| dealer / SB / BB | `button_seat` (+ `blindSeats` cũ) |
| +250 / −50 nổi trên ghế | `results[].hand_net + seven_deuce_net` |

## 4. Chuyển động ↔ sự kiện socket

Nguyên tắc (theo `docs/c2-chuyen-dong.md`):
1. Reducer áp sự kiện **ngay**; cùng lúc đẩy một *cue* (`{id, kind, …}`) vào `fx`. Cue chỉ sinh
   từ sự kiện trạng thái đã áp theo đúng thứ tự version — **không bao giờ từ `table.snapshot`**,
   kể cả các sự kiện đệm được áp lại sau snapshot (đánh dấu là "replay", không tạo cue). Snapshot
   tăng `fxEpoch` ⇒ mọi chuyển động đang chạy `finish()` ngay.
2. `useTableFx` (trong `useLayoutEffect`, sau khi React vẽ trạng thái mới) chạy cue bằng
   `fly()`/`play()` của C2. Hộp "cũ" (FLIP First) lấy từ bản ghi vị trí đo ở lần vẽ trước (chồng
   cược từng ghế, pot, avatar ghế, cỗ bài giữa bàn), vì sau khi áp sự kiện phần tử cũ có thể đã biến
   mất (cược về 0).
3. Phần tử bay là **bóng tạm** (clone nhẹ trong lớp `fx-layer` phủ trên stage, `pointer-events:none`)
   khi phần tử thật không còn (chip đã vào pot); phần tử thật đang ở chỗ mới thì cho chính nó bay.
   Nút bấm không bao giờ bị khoá vì đang có animation.
4. Cue mới tới khi cue cũ chưa xong ⇒ `finish()` cái cũ (không xếp hàng). Tab ẩn
   (`document.hidden`) ⇒ bỏ cue. `prefers-reduced-motion` ⇒ `play()` tự đổi sang mờ dần 120 ms hoặc bỏ.

| Chuyển động | Cue sinh khi | Từ → tới | Nhịp |
|---|---|---|---|
| Chia bài | `hand.started` | cỗ bài giữa bàn → bài từng ghế (ghế mình: 2 lá lớn) | `deal` 280 ms, `out`, lift 16; vòng từ SB, lá 1 hết bàn rồi lá 2, cách `STAGGER.deal` 90 ms |
| Đẩy chip ra trước ghế | `action.applied` `call`/`raise` (`bet` ghế đó tăng) | avatar ghế → chồng cược | `chip` 380 ms, `settle` |
| Bỏ bài | `action.applied` `fold` | bài ghế → giữa bàn, mờ đi | `base` 220 ms, `in` |
| Gom cược vào pot | `action.applied` làm đổi vòng (board dài thêm / mọi `bet` về 0) và đầu `hand.completed` | chồng cược từng ghế → pot | `chip` 380 ms, `settle`, cách `STAGGER.chips` 40 ms |
| Lật bài chung | `action.applied` mà `board` dài thêm | cỗ bài → ô bài chung, lật | `deal` + `flip`; flop 3 lá cách nhau 90 ms; chạy sau khi gom cược xong |
| Lật bài showdown | `hand.completed` có lá trước là `??` nay ngửa | `FlipCard faceUp` từng tay | `flip` 420 ms; tay sau cách 180 ms, đi vòng từ người bên trái button (server chưa gửi thứ tự lật) |
| Gom pot về người thắng | `hand.completed` (`results[].hand_net > 0`, `pots[].eligible`) | pot → avatar người thắng | `collect` 560 ms, `out`; pot chính trước, pot phụ lần lượt; sau đó nổi `+X`/`−X` (`base`) |
| Vòng đồng hồ | `turn.deadline` | — | `linear` theo deadline server, rAF; ≤ 5 s đỏ (`.is-low`); giảm chuyển động vẫn chạy |
| Nổi bật ghế tới lượt | `turn.deadline` (đổi người) | halo quanh avatar | `--dur-turn-pulse` 1600 ms lặp; giảm chuyển động: halo đứng yên |
| Khoảnh khắc 7-2 | `hand.completed` có `seven_deuce` | lật 2 lá → medal + banner → confetti → thu về banner nhỏ | tổng `--dur-seven-deuce` 2600 ms; giảm chuyển động: banner + 2 lá hiện ngay, không confetti |
| Ngăn chat (điện thoại) / tab | bấm nút | trượt từ phải | `slow` 320 ms `out` (CSS) |
| Overlay mất kết nối | `socket.closed` | scrim + thẻ | `base` 220 ms mờ dần (CSS) |

Ngân sách thời gian: server chờ 4 giây giữa hai ván (`next_hand_delay` trong `apps/games/actor.py`).
Chuỗi cuối ván ≈ gom 380 + lật 420 + 180·(số tay−1) + pot 560·(số pot) ≈ 1,5–2,5 s; 7-2 là 2,6 s
chạy song song phần lật. `hand.started` tới khi còn chạy ⇒ `finish()` tất cả rồi mới chia.

## 5. Bố cục

- Desktop (≥ 1024 px rộng): lưới như thiết kế — thanh trên `tbar` (về, tên phòng, blind, ván #,
  thưởng 7-2, số người xem, "Nghỉ ván sau", chủ phòng, rời bàn), giữa là `table-area` với stage
  1100×720 co theo chỗ trống, dưới là `abar`, phải là `side` (chat / người chơi / nhật ký).
- Điện thoại ngang (`landscape and max-height: 500px`): stage chiếm trái (612/844), thanh `tbar-m`
  nổi trên stage, cột phải là panel hành động / panel chờ / sổ 7-2 / thẻ tạm dừng; chat là ngăn trượt.
  Lề `var(--safe-l)`, `var(--safe-r)`, `var(--safe-b)`; vùng chạm ≥ 44 px.
- Cầm dọc ⇒ `RotatePrompt` của C2 (socket vẫn giữ).

## 6. Chưa có dữ liệu từ server (sẽ khác thiết kế, không tự bịa)

- **Tên tay bài** ("Bộ ba K", "Thùng già A"): server không gửi; client không tự chấm bài ⇒ bỏ dòng
  này (hoặc chờ backend thêm, câu hỏi 2).
- **"Ván mới sau 4 giây"**: không có trong giao thức ⇒ ghi "Ván mới sắp bắt đầu…" không số.
- **"Tự thử lại sau 0:30" của bàn tạm dừng**: không có ⇒ chỉ nút "Tải lại bàn" (gửi resync / nối lại).
- **Nhật ký trước lúc mình vào bàn**: snapshot không có lịch sử ⇒ nhật ký bắt đầu từ lúc vào.
- **"Chọn trước" (Check / Bỏ, Theo bất kỳ)** ở thanh chờ: làm nếu kịp, hoàn toàn phía client và
  chỉ gửi lệnh khi `legal_actions` tới (huỷ nếu mức cần theo đổi) — câu hỏi 3.

## 7. Kiểm tra

- **Unit (vitest)**: `geometry` (2–9 ghế, mình luôn dưới, không trùng chỗ), `seatView` (mọi trạng
  thái bảng mục 3), `cues` (mỗi sự kiện sinh đúng cue; snapshot và sự kiện áp lại sau snapshot
  **không** sinh cue; nhảy version ⇒ không cue), reducer (chat, sit-out, lastActions), `ActionBar`
  (chỉ hiện nút có trong `legal_actions`, thanh trượt kẹp min/max), `useTurnClock` (theo giờ server).
- **E2E (Playwright, Chromium có sẵn, không `playwright install`)**: sửa `web/e2e/table.spec.ts`
  sang selector mới (theo vai trò/nhãn: `getByRole("button", {name: "Bỏ"})`, nhãn bài
  `role=img`); thêm: một lượt chơi với `reducedMotion: "reduce"`, bàn ở 844×390, mất kết nối rồi
  nối lại không phát lại animation, người xem không thấy bài úp.
- **So ảnh**: `cd design/c1 && npx vite --port 5175`, chụp `#/d1/<màn>/desktop|mobile` và màn thật
  (backend 8101 sqlite + `create_demo_room --players 4`, web dev 3101) ở 1440×900 và 844×390 cho
  table-turn, table-showdown, seven-deuce, reconnect, chat, replay; tự sửa chỗ lệch; ảnh để trong
  thư mục ghi chú chung và mô tả trong PR.
- `npm run lint`, `npm test`, `npm run build`, `npm run e2e` qua trước khi mở PR.

## 8. Thứ tự commit

1. Port `table.css` + `geometry.ts` + `seatView.ts` (+ test).
2. `Stage` + `TableScreen` mới (tĩnh, đúng ảnh table-turn), `ActionBar` + `useTurnClock`.
3. Reducer: chat/người xem/lastActions/sit-out; `Side` + ngăn chat điện thoại; nhật ký.
4. Overlay mất kết nối / tạm dừng.
5. Showdown + 7-2 (tĩnh), rồi `fx/` (cue + `useTableFx`) từng chuyển động, kèm giảm chuyển động.
6. Replay mới.
7. E2E + xoá `club/` + so ảnh, sửa lệch. PR.

Primitive dùng chung tạo trong `table/` để gom về `ui/` sau (ghi lại trong PR): thanh trượt mức
cược, ngăn trượt (drawer), `Confetti`, medal 7-2, tab cột phải.

## 9. Câu hỏi cho trưởng nhóm (đã chọn mặc định, làm tiếp nếu không ai đổi)

1. **Bảng chủ phòng trên bàn**: thiết kế mở nó đè lên bàn. Mặc định: nút vương miện mở component
   bảng chủ phòng C4 xuất ra (vd `@/rooms/OwnerPanel`) trong `Sheet`; nếu C4 chưa có thì tạm là link
   về `/rooms/<id>`.
2. **Tên tay bài ở showdown**: mặc định không hiện (cần backend gửi nếu muốn).
3. **"Chọn trước"**: mặc định làm cuối cùng nếu kịp; không kịp thì để thanh chờ chỉ có
   "Nghỉ ván sau".
