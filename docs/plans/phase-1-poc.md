# Giai đoạn 1 — POC PokerKit

## Mục tiêu

Chứng minh PokerKit làm lõi luật chơi được, bọc sau `HandEngine` thuần Python (không phụ thuộc
Django), trước khi xây bất kỳ thứ gì khác.

## Phạm vi

- `apps/games/engine/cards.py`: bộ bài 52 lá, xáo bằng CSPRNG.
- `apps/games/engine/hand.py`: `HandEngine` cho một ván:
  - nhận ghế/stack/button/blind/bộ bài; tự map ghế → chỉ số người chơi của PokerKit;
  - `legal_actions`, `act`, `timeout` (tự check hoặc fold);
  - tự chia bài và burn theo thứ tự bộ bài của server;
  - `view_for(player)`: projection đã che bài;
  - `record()` và `replay(record)`.
- `apps/games/engine/table.py`: `TableSession` cho cash game nhiều ván: xoay button, sit-out,
  cấp chip giữa các ván.
- `apps/games/engine/simulate.py`: bot ngẫu nhiên, chạy N ván và kiểm tra bất biến.

## Golden tests (viết trước code)

- Bảo toàn chip mọi ván.
- Không được hành động sai lượt; không bet/raise sai giới hạn.
- Heads-up: button đặt SB và hành động trước ở preflop.
- Short all-in không mở lại quyền raise.
- Side pot nhiều tầng (4 người all-in, stack khác nhau).
- Hoà bài chia đôi pot, kể cả chip lẻ.
- Timeout: được check thì check, không thì fold.
- Projection không lộ bài úp của người khác hay bộ bài, kể cả với người đã fold và spectator.
- Replay ra đúng kết quả.
- Property test (hypothesis) và mô phỏng hàng nghìn ván không mất hay sinh thêm chip.

## Ngoài phạm vi (để các giai đoạn sau)

Django models, DB, WebSocket, `command_id`/version chống trùng, auth, UI.

## Checklist

- [x] Golden tests viết xong và đang fail
- [x] `HandEngine` pass golden tests
- [x] `TableSession` + mô phỏng 5.000 ván pass
- [x] Ruff sạch
- [ ] Duyệt với chủ dự án

## Kết quả (22/10/2026)

- 62 test pass (`.venv/bin/pytest`).
- Mô phỏng ngoài pytest, mỗi cấu hình 5.000 ván: bàn 9 người (54.111 action), 6 người
  (37.446), heads-up (11.766). Kết quả: 0 lần mất hoặc sinh thêm chip, 0 lần lộ bài, replay
  khớp 100%.

## Phát hiện về PokerKit (cần nhớ cho các giai đoạn sau)

1. **Fold khi được check miễn phí**: ở `Mode.CASH_GAME`, PokerKit chỉ *cảnh báo*, và
   `can_fold()` trả về `True` hay `False` tuỳ theo bộ lọc warning của process. Nếu để lọt,
   những ván kiểu "người all-in và hai người còn lại cùng check-fold" sẽ làm crash `push_chips`
   hoặc làm **chip bị burn**. Engine tự quyết `can_fold = call_amount > 0`; có test hồi quy.
2. `total_pot_amount` đã bao gồm các cược chưa thu (bets).
3. Khi mọi đối thủ đều all-in thấp hơn mức cược hiện tại, người chơi chỉ được call, không
   được raise.
4. Short all-in không mở lại quyền raise: PokerKit làm đúng.
5. Heads-up: PokerKit tự đặt button ở SB khi thứ tự là [không-button, button].
6. `HandEngine.act` có chốt chặn: tổng chip thay đổi thì ném `RuntimeError` ngay.

## Ghi chú cho giai đoạn 2–3

- Bước kiểm tra lộ bài của bộ mô phỏng chiếm phần lớn thời gian chạy (khoảng 30 ms/ván ở
  bàn 9 người). Bản thân engine nhanh hơn nhiều.
- `record()` chứa bộ bài: chỉ lưu ở server, không bao giờ gửi cho client.
- Chưa có `command_id`/version chống gửi trùng: thuộc giai đoạn 3 (table actor).
