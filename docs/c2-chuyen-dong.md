# C2 — Quy ước chuyển động (D1 "Nỉ & Đồng thau")

Viết ngày 28/10/2026 cho C3 (màn bàn chơi) và C4 (các màn còn lại). Code nằm ở
`web/src/ui/motion.ts` (số và hàm), `web/src/ui/tokens.css` (biến CSS) và `web/src/ui/d1.css` (các
hiệu ứng đã làm sẵn).

Một câu cho người mới: **chuyển động là để người chơi hiểu chuyện gì vừa xảy ra** (ai vừa cược, chip
đi đâu, ai thắng), không phải để trang trí. Chuyển động nào không giúp hiểu ván thì bỏ, và mọi
chuyển động đều có bản thay thế cho người bật "Giảm chuyển động" trong máy.

## a. Bảng token

Một con số dùng chung cho cả TypeScript (`motion.ts`) và CSS (`tokens.css`). Đổi thì đổi cả hai.

### Thời lượng (ms)

| TypeScript | CSS | Giá trị | Khi giảm chuyển động (CSS) | Dùng cho |
|---|---|---|---|---|
| `DURATION.press` | `--dur-press` | 90 | 1 | Nút lún khi bấm |
| `DURATION.fast` | `--dur-fast` | 140 | 1 | Hover, bật/tắt, toast biến mất |
| `DURATION.base` | `--dur-base` | 220 | 120 | Toast hiện ra, đổi tab, mờ dần nhỏ |
| `DURATION.slow` | `--dur-slow` | 320 | 120 | Mở/đóng modal và sheet |
| `DURATION.deal` | `--dur-deal` | 280 | 1 | Một lá bài bay từ chỗ chia tới ghế |
| `DURATION.chip` | `--dur-chip` | 380 | 1 | Chip bay từ ghế ra chỗ cược, từ chỗ cược vào pot |
| `DURATION.collect` | `--dur-collect` | 560 | 1 | Pot trượt về người thắng |
| `DURATION.flip` | `--dur-flip` | 420 | 120 | Một lá bài lật |
| `DURATION.turnPulse` | *(chưa có)* | 1600 | — | Một nhịp "thở" của vòng sáng ghế tới lượt |
| `DURATION.sevenDeuce` | *(chưa có)* | 2600 | — | Cả khoảnh khắc 7-2 trước khi thu về thành banner |

### Đường cong (easing)

| TypeScript | CSS | Giá trị | Dùng cho |
|---|---|---|---|
| `EASE.standard` | `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Phần lớn thay đổi giao diện |
| `EASE.out` | `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Thứ **đi tới**: chạy nhanh rồi chậm dần vào chỗ |
| `EASE.in` | `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Thứ **rời đi**: chậm rồi nhanh dần |
| `EASE.settle` | `--ease-settle` | `cubic-bezier(0.34, 1.4, 0.64, 1)` | Chip và bài **đáp xuống**: vượt quá một chút rồi nằm yên, như chip rơi trên nỉ |
| `EASE.linear` | `linear` | `linear` | Đồng hồ: thời gian trôi đều |

### Nhịp so le (stagger) và bản mờ dần

| TypeScript | Giá trị (ms) | Dùng cho |
|---|---|---|
| `STAGGER.deal` | 90 | Lá này cách lá kia khi chia bài |
| `STAGGER.chips` | 40 | Chip của nhiều người cùng bay (gom cược vào pot) |
| `STAGGER.showdown` | 180 | Tay bài này lật cách tay kia ở showdown |
| `REDUCED_FADE` | 120 | Độ dài bản "hiện mờ dần" thay cho chuyển động khi giảm chuyển động (bằng `--dur-base` lúc giảm) |

## b. Nguyên tắc

1. **Không thêm thư viện chuyển động.** CSS transition/animation cho trạng thái giao diện (nút,
   modal, toast); Web Animations (`element.animate()`, qua `play()`/`fly()` trong `motion.ts`) cho
   những gì đi theo sự kiện của ván (bài, chip). Lý do:
   - **Đủ dùng:** mọi chuyển động trong danh sách dưới đây là di chuyển + mờ dần, trình duyệt làm
     được sẵn.
   - **Nhẹ:** không thêm vài chục KB JavaScript cho điện thoại tải.
   - **Hợp SSR:** Next.js vẽ trang trên server trước. CSS chạy ngay, còn `element.animate()` chỉ
     chạy trong trình duyệt sau khi trang đã hiện (trên server `play()` tự trả `null`), nên không bao
     giờ lệch giữa bản server và bản trình duyệt.
2. **Chỉ animate `transform` và `opacity`.** Hai thuộc tính này card đồ hoạ tự làm, không bắt trình
   duyệt tính lại bố cục trang, nên mượt cả trên điện thoại yếu. Không animate `width`, `height`,
   `top`, `left`, `margin`, `box-shadow`.
3. **Kỹ thuật FLIP** cho mọi thứ "bay" từ chỗ này sang chỗ khác (bài, chip, pot):
   - **F**irst: **đo vị trí cũ** (`getBoundingClientRect()`) *trước khi* React vẽ lại. Ví dụ: hộp của
     cỗ bài, của chồng chip trước ghế, của pot.
   - **L**ast: để React vẽ phần tử ở **chỗ mới**, như thể không có chuyển động.
   - **I**nvert: `flyKeyframes(cũ, mới)` tính độ dời và tỉ lệ để phần tử *trông như* vẫn ở chỗ cũ.
   - **P**lay: `fly(el, cũ, {duration, lift})` cho nó trôi về chỗ mới. `lift` làm đường đi cong lên
     (ném bài, ném chip) thay vì trượt thẳng.

   Nhờ vậy **trạng thái luôn đúng ngay lập tức**; chuyển động chỉ là lớp trang điểm. Mất chuyển động
   (máy yếu, tab ẩn, giảm chuyển động) thì giao diện vẫn đúng.
4. **Không bao giờ để chuyển động làm chậm trạng thái.** Reducer (`web/src/table/reducer.ts`) áp sự
   kiện ngay; chuyển động chạy song song. Sự kiện tới dồn dập (ví dụ hết giờ liên tiếp) thì
   `animation.finish()` cái đang chạy rồi chạy cái mới, không xếp hàng.
5. **Chỉ chuyển động theo sự kiện, không theo ảnh chụp.** `table.snapshot` (lúc vừa kết nối, lúc
   resync) thì **hiện ngay**, không chia lại bài, không bay chip. Chỉ các sự kiện trạng thái
   (`hand.started`, `action.applied`, `hand.completed`…) mới có chuyển động.
6. **Giảm chuyển động có hai mức:** chuyển động mang thông tin (bài nào vừa lật, ai thắng) đổi thành
   **mờ dần 120 ms** (`play()` làm sẵn); chuyển động chỉ để đẹp (confetti, lấp lánh, nhịp thở) thì
   **bỏ hẳn** (`play(..., "skip")` hoặc `animation: none` trong CSS).

## c. Từng chuyển động

"Ai kích hoạt" là sự kiện WebSocket trong `web/src/api/protocol.ts`, đã đi qua reducer.

| Chuyển động | Thời lượng, easing | Thứ tự / so le | Ai kích hoạt | Khi giảm chuyển động | Đã có? |
|---|---|---|---|---|---|
| **Chia bài** | `deal` 280 ms, `out`, `lift` nhỏ (~16 px) | Vòng tròn từ small blind: mỗi người lá 1, rồi mỗi người lá 2; lá sau cách lá trước `STAGGER.deal` 90 ms | `hand.started` | Hiện ngay (hoặc mờ dần 120 ms) | C3 làm |
| **Đẩy chip ra chỗ cược** trước ghế | `chip` 380 ms, `settle` | Một lần | `action.applied` có `kind` = `call`/`raise` (blind đã nằm trong `bet` lúc `hand.started`) | Hiện ngay | C3 làm |
| **Gom cược vào pot** cuối vòng cược | `chip` 380 ms, `settle` | Mỗi người cách nhau `STAGGER.chips` 40 ms | `action.applied` làm qua vòng mới (bảng có thêm lá, các `bet` về 0) và trước khi chia pot ở `hand.completed` | Hiện ngay | C3 làm |
| **Gom pot về người thắng** | `collect` 560 ms, `out` | Pot chính trước, pot phụ lần lượt sau (mỗi pot một lần bay) | `hand.completed` (`results[].hand_net > 0`, `hand.pots[].eligible`) | Hiện ngay | C3 làm |
| **Lật bài showdown** | `flip` 420 ms, `standard` (`FlipCard`, lớp `.pc-flip.is-up`) | Tay này cách tay kia `STAGGER.showdown` 180 ms, theo thứ tự lật bài | `hand.completed` (bài trong `hand.players[].cards` không còn `??`) | Đổi mặt bằng mờ dần 120 ms (CSS đã làm) | `FlipCard` có; thứ tự lật C3 làm |
| **Vòng đồng hồ lượt** (`TimerRing`) | Theo `deadline` của server, `linear` | — | `turn.deadline` | **Vẫn chạy** (đó là thông tin); chỉ bỏ hiệu ứng nhấp nháy nếu có | Vòng có; ≤ 5 giây chuyển đỏ (`.is-low`) |
| **Nổi bật ghế tới lượt** (vòng sáng) | `turnPulse` 1600 ms một nhịp, lặp | — | `turn.deadline` (đổi người tới lượt) | Vòng sáng đứng yên | C3 làm |
| **Khoảnh khắc 7-2** | `sevenDeuce` 2600 ms tổng: lật 2 lá (`flip`), confetti, rồi thu về banner | Lật trước, confetti sau | `hand.completed` có `seven_deuce` (reducer đặt `celebration`) | Banner và 2 lá hiện ngay, **không confetti** | Màn cũ `SevenDeuceMoment.tsx` có; nhịp mới C3 làm |
| **Toast** | Vào: `base` 220 ms, `out`, trượt xuống 10 px từ trên. Ra: `fast` 140 ms, `in`, trượt sang phải 16 px | — | Code gọi toast | Gần như tức thì (1 ms ra; 120 ms vào) | Có (`d1-toast-in/out`) |
| **Mở modal / sheet** | `slow` 320 ms, `out`. Modal nổi lên 12 px + phóng từ 0,98; sheet trượt vào 40 px từ phải; nền mờ dần | — | Mở/đóng `<dialog>` | 120 ms | Có (`@starting-style`) |
| **Nút bấm** | `press` 90 ms: lún 2 px, tối đi một chút | — | Nhấn chuột/ngón tay | Tức thì | Có |
| **Đang tải** (dải sáng quét ngang) | 1,6 giây, lặp | — | Danh sách/khối đang tải (`.is-loading`) | Đứng yên | Có (`d1-shimmer`) |
| **Vòng quay chờ** (spinner) | 0,8–1,1 giây một vòng, lặp | — | Nút/khối đang chờ | Quay chậm lại 2,4 giây (vẫn quay để biết là đang chờ) | Có |
| **Màn nhắc xoay máy** (điện thoại dọc) | 2,6 giây, lặp: điện thoại xoay −90° rồi về | — | Điện thoại đang cầm dọc (spec #28) | Đứng yên ở tư thế đã xoay | Có (`d1-rotate-phone`) |

## d. Kiểm tra "giảm chuyển động"

- **macOS:** Cài đặt hệ thống → Trợ năng → Màn hình → bật **Giảm chuyển động**.
- **iPhone:** Cài đặt → Trợ năng → Chuyển động → **Giảm chuyển động**.
- **Windows:** Cài đặt → Trợ năng → Hiệu ứng hình ảnh → tắt **Hiệu ứng hoạt ảnh**.
- **Chrome không cần đổi máy:** DevTools → menu ⋮ → More tools → **Rendering** → "Emulate CSS media
  feature prefers-reduced-motion" → `reduce`.
- **Playwright:** `await page.emulateMedia({ reducedMotion: "reduce" })`, hoặc
  `test.use({ reducedMotion: "reduce" })` cho cả file.
- **Unit test:** `web/src/ui/motion.test.ts` giả `window.matchMedia` để kiểm `play()` đổi sang mờ
  dần (hoặc không chạy gì với `"skip"`).

Khi kiểm, xem đủ ba điều: trạng thái cuối giống hệt lúc có chuyển động; không có gì nhấp nháy hay
lặp mãi (trừ đồng hồ và spinner); thông tin vẫn đọc được (ai thắng, bài nào lật).

## e. Việc để lại

**C3 (bàn chơi):**

- Dàn chuyển động bài, chip, pot trong màn bàn chơi bằng `fly()`: đo hộp cũ (cỗ bài, chồng chip trước
  ghế, pot) trước khi áp sự kiện, rồi bay sau khi React vẽ.
- Chia pot phụ lần lượt; thứ tự lật bài ở showdown (server chưa gửi thứ tự lật: tạm đi vòng từ người
  bên trái nút button, chốt lại khi làm).
- Vòng sáng ghế tới lượt (`turnPulse`) và khoảnh khắc 7-2 theo nhịp 2600 ms: cần thêm CSS, chưa có
  biến `--dur-turn-pulse`/`--dur-seven-deuce`. Confetti chỉ dùng vài phần tử, chỉ `transform`/`opacity`.
- Cho vòng đồng hồ chạy mượt (CSS transition `linear` giữa các lần `tick`, hoặc `requestAnimationFrame`),
  tính theo giờ server (`deadline`, `server_time`), không theo đồng hồ máy.
- Không chạy chuyển động cho `table.snapshot`/resync; tab đang ẩn (`document.hidden`) thì bỏ qua.
- Thêm test Playwright với `reducedMotion: "reduce"`.

**C4 (các màn khác):** toast, modal, sheet, nút, đang tải đã có sẵn; chỉ cần dùng đúng lớp. Không làm
chuyển cảnh giữa các trang.
