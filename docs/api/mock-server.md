# Mock server và trang thử

Mock server giả làm server bàn chơi theo đúng [giao thức WebSocket](ws-protocol.md), để làm và thử
frontend trước khi có table actor thật (B4). Nó chạy `HandEngine` và `TableSession` thật trong bộ
nhớ (không DB), nên luật chơi, projection và thưởng 7-2 giống hệt server thật sẽ làm.

## Chạy

```bash
uv run python -m mockserver
```

Rồi mở <http://localhost:8765/> trong trình duyệt. Dừng bằng `Ctrl+C`.

Tuỳ chọn: `--port 8765`, `--think-time 20` (giây mỗi lượt), `--bot-delay 1.5` (giây trước khi bot
đánh), `--quiet` (không in từng message), `--scenario <file>`.

## Kịch bản

[`fixtures/scenarios/three-friends.json`](fixtures/scenarios/three-friends.json): ba người bạn
Lym (ghế 1), An (ghế 3), Bình (ghế 5), mỗi người 1000 chip, blind 5/10, thưởng 7-2 là 50.

- **Ván 1** chia sẵn: Lym cầm 7♥ 2♣. An và Bình là bot đánh theo kịch bản: An fold, Bình call,
  check rồi fold. Nếu Lym **raise** trước flop rồi **bet** sau flop, Lym ăn pot bằng 7-2 và thấy
  thưởng 7-2 (bài được lật, mỗi người trả 50). Đây cũng chính là ván trong các ví dụ của
  `ws-protocol.md`, và test kiểm mock server tạo ra đúng y hệt các fixtures đó.
- Ván 1 chỉ bắt đầu khi có người mở trang. Từ ván 2, bộ bài xáo ngẫu nhiên (theo `seed`).
- **Ai không mở trang là bot**: đánh sau `--bot-delay` giây (check nếu được, call nếu rẻ, thỉnh
  thoảng raise). Người đang mở trang có đủ thời gian suy nghĩ; hết giờ thì server tự check/fold.

## Trang thử

[`mockserver/static/table.html`](../../mockserver/static/table.html): một file HTML + JS thuần,
không cần build. Mock server phục vụ nó ở `/`.

- Chọn **Tôi là** Lym / An / Bình / Người xem rồi bấm **Kết nối**. Có thể mở nhiều tab với người
  khác nhau (thêm `?player=2` vào địa chỉ) để chơi với chính mình.
- Nút **Fold / Check / Call / Raise tới** chỉ sáng khi tới lượt và đúng `legal_actions` server gửi.
- **Gửi lại lệnh cuối (cùng command_id)**: giả lập bấm đúp / mạng chập. Server không áp lại, trả
  `command.ack` với `duplicate: true` (xem trong nhật ký bên phải).
- **Bỏ qua sự kiện kế tiếp**: giả lập mất một gói. Sự kiện sau đó hụt `version`, trang tự gửi
  `resync.request`, nhận `table.snapshot` và đi tiếp.
- **Sit-out / Vào chơi lại**: có hiệu lực từ ván sau.
- Bấm một dòng trong nhật ký để xem JSON đầy đủ của message.

## Mọi message đều được kiểm theo schema

Mọi message mock server gửi đi đều qua một chỗ (`MockTable._send`) kiểm bằng
`apps.games.contract.validate` trước khi gửi; sai schema thì ném lỗi chứ không gửi. Message client
gửi tới cũng được kiểm: sai thì trả `command.rejected` (`invalid_command`) hoặc `protocol.error`.

## Code

| File | Nội dung |
|---|---|
| `mockserver/table.py` | `MockTable`: logic một phòng, không có socket; trả về danh sách message cần gửi |
| `mockserver/server.py` | WebSocket `/ws/rooms/1/` + trang thử `/`, một hàng đợi gửi giữ đúng thứ tự |
| `mockserver/tests/` | Test logic (không socket) và test qua socket thật |

Mock server **không** phải table actor của B4: không ghi DB, không có `HandCommand`, không khôi
phục sau khi tắt. Thiết kế actor thật: [ADR-001](../adr/ADR-001-table-actor.md).
