# Mock server

Mock server giả làm server bàn chơi theo đúng [giao thức WebSocket](ws-protocol.md), để làm và thử
frontend trước khi có table actor thật (B4). Nó chạy `HandEngine` và `TableSession` thật trong bộ
nhớ (không DB), nên luật chơi, projection và thưởng 7-2 giống hệt server thật sẽ làm.

## Chạy

```bash
uv run python -m mockserver
```

Server chỉ có WebSocket ở `ws://localhost:8765/ws/rooms/1/?player=<1|2|3>` (không có `player`
thì vào làm người xem). Dừng bằng `Ctrl+C`.

Tuỳ chọn: `--port 8765`, `--think-time 20` (giây mỗi lượt), `--bot-delay 1.5` (giây trước khi bot
đánh), `--quiet` (không in từng message), `--scenario <file>`.

## Thử bằng một client WebSocket

Thư viện `websockets` (đã có trong nhóm dev) kèm sẵn một client dòng lệnh. Mở terminal thứ hai:

```bash
uv run python -m websockets "ws://localhost:8765/ws/rooms/1/?player=1"
```

Server gửi ngay `table.snapshot`, rồi `hand.started` (Lym thấy `7h 2c`) và `turn.deadline`. Gõ
(hoặc dán) một dòng JSON rồi Enter để gửi lệnh; `hand_id` phải đúng ván trong `hand.started`
(ván đầu tiên của server mới chạy là `41`):

```json
{"protocol_version": 1, "type": "command.act", "room_id": 1, "hand_id": 41, "command_id": "thu-raise-30", "payload": {"kind": "raise", "amount": 30}}
```

Gửi lại đúng dòng đó lần nữa: server trả `command.ack` với `duplicate: true` và không áp lại.
Gửi `{"protocol_version": 1, "type": "resync.request", "room_id": 1, "payload": {"last_version": 0}}`
để nhận lại `table.snapshot`. Thoát bằng `Ctrl+D`.

Trang thử có giao diện sẽ làm bằng React trong `web/`, dùng chung thiết kế với mockup UI, ở đợt
frontend sau khi chủ dự án chốt thiết kế. Không có trang HTML tĩnh.

## Kịch bản

[`fixtures/scenarios/three-friends.json`](fixtures/scenarios/three-friends.json): ba người bạn
Lym (ghế 1), An (ghế 3), Bình (ghế 5), mỗi người 1000 chip, blind 5/10, thưởng 7-2 là 50.

- **Ván 1** chia sẵn: Lym cầm 7♥ 2♣. An và Bình là bot đánh theo kịch bản: An fold, Bình call,
  check rồi fold. Nếu Lym **raise** trước flop rồi **bet** sau flop, Lym ăn pot bằng 7-2 và thấy
  thưởng 7-2 (bài được lật, mỗi người trả 50). Đây cũng chính là ván trong các ví dụ của
  `ws-protocol.md`, và test kiểm mock server tạo ra đúng y hệt các fixtures đó.
- Ván 1 chỉ bắt đầu khi có client kết nối. Từ ván 2, bộ bài xáo ngẫu nhiên (theo `seed`).
- **Ai không kết nối là bot**: đánh sau `--bot-delay` giây (check nếu được, call nếu rẻ, thỉnh
  thoảng raise). Người đang kết nối có đủ thời gian suy nghĩ; hết giờ thì server tự check/fold.

## Mọi message đều được kiểm theo schema

Mọi message mock server gửi đi đều qua một chỗ (`MockTable._send`) kiểm bằng
`apps.games.contract.validate_outgoing(message, người nhận)` trước khi gửi: đúng schema **và**
đúng ngữ nghĩa với người nhận (không lộ bài người khác, chip cộng lại khớp). Sai thì ném lỗi chứ
không gửi. Message client
gửi tới cũng được kiểm: sai thì trả `command.rejected` (`invalid_command`) hoặc `protocol.error`.

## Code

| File | Nội dung |
|---|---|
| `mockserver/table.py` | `MockTable`: logic một phòng, không có socket; trả về danh sách message cần gửi |
| `mockserver/server.py` | WebSocket `/ws/rooms/1/`, một hàng đợi gửi giữ đúng thứ tự |
| `mockserver/tests/` | Test logic (không socket) và test qua socket thật |

Mock server **không** phải table actor của B4: không ghi DB, không có `HandCommand`, không khôi
phục sau khi tắt. Thiết kế actor thật: [ADR-001](../adr/ADR-001-table-actor.md).
