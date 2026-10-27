# Giao thức WebSocket bàn chơi (phiên bản 1)

Viết ngày 27/10/2026, đợt B3. Đây là **hợp đồng** giữa server và mọi client (trang thử, web
Next.js, sau này app mobile). Đổi hợp đồng thì sửa tài liệu này và schema trước, theo
[CONTRIBUTING.md](../../CONTRIBUTING.md#hợp-đồng-api).

Các file đi kèm:

| Thứ | Ở đâu |
|---|---|
| JSON Schema, mỗi message một file | [`schema/messages/`](schema/messages/) |
| Khối dùng chung (lá bài, ghế, góc nhìn ván bài, mã lỗi) | [`schema/common.schema.json`](schema/common.schema.json) |
| Hợp của mọi message mỗi chiều | [`schema/server-message.schema.json`](schema/server-message.schema.json), [`schema/client-message.schema.json`](schema/client-message.schema.json) |
| Ví dụ đúng và ví dụ sai | [`fixtures/{server,client}/{valid,invalid}/`](fixtures/) |
| REST (tạo phòng, vào ghế, lấy snapshot) | [`openapi.yaml`](openapi.yaml) |
| Type TypeScript sinh từ schema | [`web/src/api/`](../../web/src/api/) |
| Mock server + trang thử | [`mockserver/`](../../mockserver/), cách chạy ở [README mock](mock-server.md) |
| Kiểm schema bằng Python | [`apps/games/contract.py`](../../apps/games/contract.py) |

## 1. Ba nguyên tắc

1. **Server là nguồn chân lý.** Client chỉ gửi *ý định* ("tôi call"), không bao giờ gửi kết quả
   ("tôi còn 970 chip"). Mọi luật và phép tính chip chạy trong `HandEngine` trên server.
2. **Mỗi người chỉ thấy bài của mình.** Mọi trạng thái ván bài gửi đi là
   `HandEngine.view_for(người nhận)`; bài úp của người khác luôn là `"??"`.
3. **Lệnh áp dụng đúng một lần.** Mỗi lệnh có `command_id`; gửi lại bao nhiêu lần cũng chỉ áp một
   lần.

## 2. Kết nối

- URL (B4): `ws://<host>/ws/rooms/<room_id>/`. Đăng nhập bằng cookie phiên của Django (khách
  hoặc tài khoản thật, xem B6); chưa đăng nhập thì server đóng kết nối ngay khi bắt tay.
- Mock server dùng tạm `ws://localhost:8765/ws/rooms/1/?player=<player_id>` để chọn mình là ai.
- Mỗi message là **một object JSON trong một frame text**.
- Vừa kết nối xong, server gửi ngay một `table.snapshot` cho riêng người đó.
- Ngồi vào ghế / rời ghế đi qua REST ([`openapi.yaml`](openapi.yaml)); kết quả được phát cho cả bàn
  bằng `seat.updated`.

## 3. Phong bì (envelope)

Mọi message **server gửi** có đủ các trường sau ở cấp ngoài cùng, không thêm trường nào khác:

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `protocol_version` | số, luôn `1` | Phiên bản giao thức. Chỉ tăng khi đổi phá vỡ tương thích |
| `type` | chuỗi | Loại message, ví dụ `action.applied` |
| `room_id` | số ≥ 1 | Phòng |
| `hand_id` | số ≥ 1 hoặc `null` | Ván đang chạy lúc gửi (`Hand.pk` trong DB, không phải số thứ tự ván); `null` giữa hai ván |
| `version` | số ≥ 0 | Bộ đếm sự kiện của phòng (mục 6) |
| `server_time` | chuỗi | Giờ server, UTC, ISO 8601 có `Z`: `2026-10-27T14:03:05.120Z` |
| `payload` | object | Nội dung riêng của từng loại |

Message **client gửi** có `protocol_version`, `type`, `room_id`, `payload`; lệnh có thêm
`command_id`; `command.act` có thêm `hand_id`. Client **không** gửi `version` hay `server_time`.

## 4. Hai loại message server

| Loại | Gồm | Gửi cho | `version` |
|---|---|---|---|
| **Sự kiện trạng thái** | `hand.started`, `action.applied`, `turn.deadline`, `hand.completed`, `seat.updated` | Cả bàn (mỗi người một bản đã che bài theo góc nhìn của họ) | Tăng đúng **1** mỗi sự kiện |
| **Trả lời riêng** | `table.snapshot`, `command.ack`, `command.rejected`, `protocol.error` | Chỉ người gửi lệnh / người kết nối | Không tăng; mang `version` hiện tại của phòng |

Cùng một sự kiện trạng thái thì mọi người nhận cùng `version`, chỉ khác phần bài được che.

## 5. Lệnh và `command_id`

**Quy tắc cho client:** tạo `command_id` (nên dùng UUID v4) **một lần** cho mỗi ý định — mỗi lần
người chơi bấm một nút. Nếu không nhận được `command.ack`/`command.rejected` (mạng chập, kết nối
lại), **gửi lại y nguyên message cũ, cùng `command_id`**. Không bao giờ tạo `command_id` mới cho
một lần thử lại.

**Server xử lý một lệnh có `command_id` đã thấy:**

| Tình huống | Server làm gì |
|---|---|
| Lệnh này đã được áp dụng, nội dung giống hệt | Không áp lại. Trả `command.ack` với `duplicate: true` và cùng `result_version` lần đầu |
| Cùng `command_id` nhưng nội dung khác (ví dụ raise 30 rồi raise 60) | Trả `command.rejected` mã `command_id_reused`. Không áp gì |
| Lần trước lệnh này bị từ chối | Lệnh bị từ chối không được lưu (ADR-001), nên được xét lại như lệnh mới; thường sẽ bị từ chối lại cùng mã |

Phạm vi chống trùng: `command.act` theo **ván** (DB có ràng buộc duy nhất `(hand, command_id)` trên
`HandCommand`); `command.sit_out` / `command.sit_in` theo **phòng**, actor nhớ trong bộ nhớ các
`command_id` gần đây.

Ví dụ bấm đúp nút Call (cả hai lần cùng `command_id`):

```
client → command.act  {command_id: "0d9b…", kind: "call"}
client → command.act  {command_id: "0d9b…", kind: "call"}     (bấm đúp / gửi lại)
server → command.ack  {command_id: "0d9b…", duplicate: false, result_version: 14}
server → action.applied (version 14)  …  turn.deadline (version 15)
server → command.ack  {command_id: "0d9b…", duplicate: true,  result_version: 14}
```

Chỉ có **một** `action.applied`. Ack thứ hai báo "đã nhận rồi", client chỉ cần bỏ qua.

### Bảng mã lỗi

Mã là **ổn định**: client được phép `switch` theo mã. Thêm mã mới là đổi tương thích; đổi tên hay
bỏ mã là đổi phá vỡ. Trường `message` đi kèm chỉ để đọc log, không hiện cho người chơi.

`command.rejected.payload.code`:

| Mã | Khi nào |
|---|---|
| `invalid_command` | Lệnh có `command_id` nhưng sai schema (thiếu trường, `amount` sai kiểu…) |
| `command_id_reused` | `command_id` đã dùng cho một lệnh có nội dung khác |
| `no_active_hand` | Gửi `command.act` lúc không có ván nào đang chạy |
| `stale_hand` | `hand_id` trong lệnh không phải ván đang chạy (lệnh của ván trước tới muộn) |
| `not_seated` | Người gửi không ngồi ở bàn này |
| `not_your_turn` | Chưa tới lượt người gửi (hoặc họ không có trong ván) |
| `cannot_fold` | Fold khi đang được check miễn phí |
| `cannot_check` | Check khi phải trả thêm chip |
| `nothing_to_call` | Call khi không có gì để call (hãy check) |
| `cannot_raise` | Không còn được raise (ví dụ đã all-in hoặc không đủ chip) |
| `invalid_amount` | `amount` ngoài khoảng `min_raise_to`..`max_raise_to` |
| `already_sitting_out` | `command.sit_out` khi đã sit-out |
| `not_sitting_out` | `command.sit_in` khi đang chơi |
| `rate_limited` | Gửi lệnh quá nhanh (B7) |
| `internal_error` | Lỗi phía server; lệnh **không** được áp dụng, có thể gửi lại cùng `command_id` |

Các mã `not_your_turn`, `cannot_fold`, `cannot_check`, `nothing_to_call`, `cannot_raise`,
`invalid_amount` lấy nguyên từ `IllegalAction.code` của `HandEngine`; `hand_complete` của engine
được báo là `no_active_hand`.

`protocol.error.payload.code` — khi không đọc được message tới mức tìm thấy `command_id`:

| Mã | Khi nào |
|---|---|
| `invalid_json` | Frame không phải JSON hoặc không phải object |
| `invalid_message` | Đúng `type` nhưng sai schema và không có `command_id` hợp lệ |
| `unknown_type` | `type` không có trong giao thức |
| `unsupported_protocol_version` | `protocol_version` khác `1` |

## 6. `version` và đồng bộ lại (resync)

- Client nhớ `last_version` = `version` của sự kiện trạng thái cuối cùng đã áp dụng (hoặc của
  `table.snapshot` cuối).
- Nhận sự kiện trạng thái có `version`:
  - `== last_version + 1`: áp dụng, tăng `last_version`.
  - `<= last_version`: đã có rồi, bỏ qua.
  - `> last_version + 1`: **hụt sự kiện**. Không áp dụng; gửi `resync.request` với
    `last_version`, giữ lại các sự kiện tới sau trong hàng chờ.
- Server trả `table.snapshot` (trạng thái đầy đủ, đã che bài). Client **thay toàn bộ** trạng thái
  bằng snapshot, đặt `last_version = snapshot.version`, rồi áp các sự kiện trong hàng chờ có
  `version > last_version` theo thứ tự.
- Trả lời riêng (`command.ack`…) không dùng để phát hiện hụt.
- Kết nối lại sau khi mất mạng: server tự gửi `table.snapshot`, client làm như trên. Client không
  bao giờ phải tự phát lại lịch sử ván.
- `version` chỉ tăng dần **trong một kết nối**. Server khởi động lại có thể đếm lại từ đầu
  ([ADR-001](../adr/ADR-001-table-actor.md)), nên với mỗi kết nối mới, client luôn lấy `version` của
  `table.snapshot` đầu tiên làm mốc, kể cả khi nó nhỏ hơn số cũ.

## 7. Góc nhìn (projection): ai thấy bài nào

Mọi trường `hand` là `HandView` = `HandEngine.view_for(người nhận)` cộng thêm `hand_id`, `hand_no`.

| Bài | Ai thấy |
|---|---|
| Bài tẩy của mình | Chỉ mình |
| Bài tẩy của người khác khi ván đang chạy | Không ai (`"??"`) |
| Bài của người đã fold | Không ai; danh sách `cards` thành rỗng `[]` |
| Bài lật ở showdown | Mọi người, kể cả người xem. Người thua có thể úp bài (PokerKit tự quyết người phải lật), khi đó `cards` là `[]` |
| 2 lá 7-2 của người ăn pot vì mọi người fold, khi phòng bật thưởng 7-2 (#27) | Mọi người, sau khi ván xong (trong `hand.completed`) |
| Bộ bài, lá burn, lá chưa chia | Không ai, không bao giờ rời server |
| Người xem (spectator) | `view_for(None)`: chỉ bài chung và bài đã lật |

`legal_actions` chỉ có trong `HandView` gửi cho đúng người đang tới lượt; mọi người khác nhận
`null`. Client không tự tính luật: nút nào bấm được, raise tối thiểu/tối đa bao nhiêu đều lấy từ
`legal_actions`.

`stack` có hai nghĩa, cần phân biệt:
- `HandView.players[].stack`: chip còn trước mặt trong ván (đã trừ cược).
- `SeatOccupant.stack` (trong `seats` của snapshot, `seat.updated`): số dư phòng theo sổ chip;
  trong lúc ván chạy là số dư **trước** ván đó. Số dư sau ván nằm ở `hand.completed.results[].stack`.

## 8. Message server gửi

Ví dụ dưới đây lấy từ [`fixtures/server/valid/`](fixtures/server/valid/), sinh từ một ván thật
của `HandEngine`: phòng 1, blind 5/10, thưởng 7-2 là 50 chip; Lym ghế 1 (`"1"`), An ghế 3 (`"2"`),
Bình ghế 5 (`"3"`).

### `table.snapshot` (trả lời riêng)

Gửi khi vừa kết nối và khi trả lời `resync.request`. `payload.table` gồm `room` (cấu hình phòng),
`you` (người nhận; `seat: null` nếu là người xem), `seats` (chỉ ghế có người), `hand` (`HandView`
hoặc `null` giữa hai ván), `turn` (ai đang tới lượt và hạn chót, hoặc `null`).
Ví dụ đầy đủ: [giữa hai ván](fixtures/server/valid/table.snapshot.between-hands.json),
[giữa ván, góc nhìn Bình](fixtures/server/valid/table.snapshot.mid-hand.json),
[người xem](fixtures/server/valid/table.snapshot.spectator.json).

```json
{
  "protocol_version": 1, "type": "table.snapshot", "room_id": 1, "hand_id": null,
  "version": 11, "server_time": "2026-10-27T14:03:05.120Z",
  "payload": {"table": {
    "room": {"room_id": 1, "name": "Bàn bạn bè", "status": "playing", "max_seats": 9,
             "small_blind": 5, "big_blind": 10, "think_time_seconds": 20, "seven_deuce_bonus": 50},
    "you": {"player_id": "1", "seat": 1},
    "seats": [
      {"seat": 1, "player_id": "1", "display_name": "Lym", "stack": 1000, "sitting_out": false, "connected": true},
      {"seat": 3, "player_id": "2", "display_name": "An", "stack": 1000, "sitting_out": false, "connected": true},
      {"seat": 5, "player_id": "3", "display_name": "Bình", "stack": 1000, "sitting_out": false, "connected": true}
    ],
    "hand": null, "turn": null
  }}
}
```

### `hand.started` (sự kiện)

Một ván mới vừa chia. `payload.hand` là `HandView` của người nhận: Lym thấy `7h 2c` của mình,
bài người khác là `??`. Blind đã nằm trong `bet`.
[Ví dụ đầy đủ](fixtures/server/valid/hand.started.json).

### `action.applied` (sự kiện)

Một hành động vừa được áp dụng. `payload.action` cho biết ai làm gì (`timeout: true` nếu server
làm thay vì hết giờ); `payload.hand` là trạng thái **ngay sau** hành động, đã gồm lá chung mới
nếu vừa sang vòng. Client chỉ việc thay `hand` cũ bằng `hand` mới.

```json
{
  "protocol_version": 1, "type": "action.applied", "room_id": 1, "hand_id": 41,
  "version": 14, "server_time": "2026-10-27T14:03:09.481Z",
  "payload": {
    "action": {"player_id": "1", "seat": 1, "kind": "raise", "amount": 30, "timeout": false},
    "hand": {
      "hand_id": 41, "hand_no": 1, "button_seat": 1, "small_blind": 5, "big_blind": 10,
      "board": [], "pots": [],
      "players": [
        {"player_id": "1", "seat": 1, "stack": 970, "bet": 30, "in_hand": true, "cards": ["7h", "2c"]},
        {"player_id": "2", "seat": 3, "stack": 995, "bet": 5, "in_hand": true, "cards": ["??", "??"]},
        {"player_id": "3", "seat": 5, "stack": 990, "bet": 10, "in_hand": true, "cards": ["??", "??"]}
      ],
      "actor": "2", "legal_actions": null, "complete": false
    }
  }
}
```

Bản Bình nhận khi tới lượt Bình thì có `legal_actions`:
[ví dụ](fixtures/server/valid/action.applied.with-legal-actions.json). Fold do hết giờ:
[ví dụ](fixtures/server/valid/action.applied.timeout-fold.json).

### `turn.deadline` (sự kiện)

Tới lượt ai và hạn chót. Hết `deadline` mà chưa có lệnh thì server tự check (nếu được) hoặc fold,
rồi phát `action.applied` với `timeout: true`. Client vẽ đồng hồ theo `deadline` và
`server_time` (không theo đồng hồ máy mình).

```json
{
  "protocol_version": 1, "type": "turn.deadline", "room_id": 1, "hand_id": 41,
  "version": 13, "server_time": "2026-10-27T14:03:05.120Z",
  "payload": {"turn": {"player_id": "1", "seat": 1,
                       "deadline": "2026-10-27T14:03:25.120Z", "think_time_seconds": 20}}
}
```

### `hand.completed` (sự kiện)

Ván đã xong và đã chia chip. Gồm `hand` (trạng thái cuối, bài đã lật), `results` (mọi người trong
ván, cộng người ngồi bàn mà không trong ván, như sit-out, nếu họ trả thưởng 7-2; mỗi dòng:
`hand_net` lời/lỗ trong pot, `seven_deuce_net` thưởng 7-2 nhận/trả, `stack` số dư phòng sau
cùng) và `seven_deuce` (`null` nếu không có thưởng). Sau sự kiện này `hand_id` của các message
tiếp theo là `null` cho tới `hand.started` kế tiếp.

Ví dụ: Lym raise, An fold, Bình call; flop `Ah 8d Jc`, Bình check, Lym bet 50, Bình fold. Lym ăn
pot bằng 7-2 nên được lật bài và mỗi người khác trả 50. Đây là bản **An** nhận — An đã fold nhưng
vẫn thấy `7h 2c` của Lym:

```json
{
  "protocol_version": 1, "type": "hand.completed", "room_id": 1, "hand_id": 41,
  "version": 25, "server_time": "2026-10-27T14:03:51.700Z",
  "payload": {
    "hand": {
      "hand_id": 41, "hand_no": 1, "button_seat": 1, "small_blind": 5, "big_blind": 10,
      "board": ["Ah", "8d", "Jc"], "pots": [{"amount": 0, "eligible": ["1"]}],
      "players": [
        {"player_id": "1", "seat": 1, "stack": 1035, "bet": 0, "in_hand": true, "cards": ["7h", "2c"]},
        {"player_id": "2", "seat": 3, "stack": 995, "bet": 0, "in_hand": false, "cards": []},
        {"player_id": "3", "seat": 5, "stack": 970, "bet": 0, "in_hand": false, "cards": []}
      ],
      "actor": null, "legal_actions": null, "complete": true
    },
    "results": [
      {"player_id": "1", "seat": 1, "hand_net": 35, "seven_deuce_net": 100, "stack": 1135},
      {"player_id": "2", "seat": 3, "hand_net": -5, "seven_deuce_net": -50, "stack": 945},
      {"player_id": "3", "seat": 5, "hand_net": -30, "seven_deuce_net": -50, "stack": 920}
    ],
    "seven_deuce": {
      "player_id": "1", "seat": 1, "cards": ["7h", "2c"], "bonus": 50,
      "payments": [{"player_id": "2", "seat": 3, "amount": 50},
                   {"player_id": "3", "seat": 5, "amount": 50}],
      "total": 100
    }
  }
}
```

Lưu ý: `hand.players[].stack` của Lym là 1035 (chip trong ván, **trước** thưởng); số dư thật sau
thưởng là `results[].stack` = 1135. Người còn ít chip hơn mức thưởng chỉ trả số chip còn lại
(`payments[].amount` có thể nhỏ hơn `bonus`); người còn 0 chip không có trong `payments`.
Ván thắng ở showdown: [ví dụ](fixtures/server/valid/hand.completed.showdown.json).

### `seat.updated` (sự kiện)

Một ghế thay đổi: có người ngồi (qua REST), rời ghế, sit-out, quay lại, được cấp chip, mất/có
kết nối. `occupant` là trạng thái mới của ghế, `null` nếu ghế trống.

```json
{
  "protocol_version": 1, "type": "seat.updated", "room_id": 1, "hand_id": null,
  "version": 26, "server_time": "2026-10-27T14:03:05.120Z",
  "payload": {"seat": 3, "occupant": {"seat": 3, "player_id": "2", "display_name": "An",
              "stack": 945, "sitting_out": true, "connected": true}}
}
```

Sit-out có hiệu lực **từ ván sau**: nếu đang trong ván, người đó vẫn phải chơi tiếp (hoặc hết giờ
thì bị check/fold như thường). Người sit-out vẫn phải trả thưởng 7-2 (#27).

### `command.ack` (trả lời riêng)

```json
{
  "protocol_version": 1, "type": "command.ack", "room_id": 1, "hand_id": 41,
  "version": 15, "server_time": "2026-10-27T14:03:09.482Z",
  "payload": {"command_id": "6f1c2a9e-3b7d-4e58-9a10-2c4d8e7f1b30",
              "duplicate": false, "result_version": 14}
}
```

`result_version` là `version` của sự kiện đầu tiên lệnh gây ra, để client ghép ack với sự kiện.
Ack và sự kiện có thể tới theo bất kỳ thứ tự nào; client không được dựa vào thứ tự giữa chúng.

### `command.rejected` (trả lời riêng)

```json
{
  "protocol_version": 1, "type": "command.rejected", "room_id": 1, "hand_id": 41,
  "version": 15, "server_time": "2026-10-27T14:03:11.250Z",
  "payload": {"command_id": "b3e0d7c4-1f2a-4c6b-8d9e-0a1b2c3d4e5f",
              "code": "not_your_turn", "message": "It is player 2's turn."}
}
```

### `protocol.error` (trả lời riêng)

Message hỏng tới mức không tìm được `command_id`. Server không đóng kết nối.
[Ví dụ](fixtures/server/valid/protocol.error.json).

## 9. Message client gửi

### `command.act`

```json
{
  "protocol_version": 1, "type": "command.act", "room_id": 1, "hand_id": 41,
  "command_id": "6f1c2a9e-3b7d-4e58-9a10-2c4d8e7f1b30",
  "payload": {"kind": "raise", "amount": 30}
}
```

`kind` là `fold`, `check`, `call` (khi đó `amount` phải là `null`) hoặc `raise` (`amount` là tổng
số chip **raise tới**, kể cả khi là cược mở đầu vòng). Không có `all-in` riêng: all-in là raise tới
`max_raise_to`, hoặc call khi không đủ chip.

### `command.sit_out` và `command.sit_in`

`payload` rỗng `{}`. Người gửi là người sit-out / quay lại.
[sit_out](fixtures/client/valid/command.sit_out.json), [sit_in](fixtures/client/valid/command.sit_in.json).

### `resync.request`

Không phải lệnh (không đổi gì trên bàn) nên không có `command_id`.

```json
{"protocol_version": 1, "type": "resync.request", "room_id": 1, "payload": {"last_version": 14}}
```

## 10. Một ván từ đầu tới cuối

Góc nhìn Lym, ván ví dụ ở mục 8 (`v` = `version`):

```
← table.snapshot  v11  (vừa kết nối, chưa có ván)
← hand.started    v12  (Lym thấy 7h 2c)
← turn.deadline   v13  (lượt Lym, 20 giây)
→ command.act     raise 30, command_id A
← action.applied  v14  (Lym raise 30; tới lượt An)
← turn.deadline   v15  (lượt An)
← command.ack     A, result_version 14
← action.applied  v16  (An fold do hết giờ, timeout: true)
← turn.deadline   v17  (lượt Bình)
← action.applied  v18  (Bình call; lá chung Ah 8d Jc đã có trong hand.board)
← turn.deadline   v19 … action.applied v20 (Bình check) … turn.deadline v21
→ command.act     raise 50, command_id B
← action.applied  v22  … turn.deadline v23 … ← command.ack B
← action.applied  v24  (Bình fold)
← hand.completed  v25  (7-2 được lật, thưởng 100)
```

## 11. Chưa có trong phiên bản 1

- Heartbeat/ping và tự cập nhật `connected` khi mất kết nối: B5 (đã có trường `connected`).
- Chat, emoji, vào/ra của người xem: B8.
- Chủ phòng cấp chip, đổi blind, kick: REST ở B7, kết quả phát bằng `seat.updated`.

Các thứ này sẽ là **thêm message mới** (đổi tương thích), không đổi message đã có.
