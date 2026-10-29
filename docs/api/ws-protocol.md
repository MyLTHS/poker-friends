# Giao thức WebSocket bàn chơi (phiên bản 1)

Viết ngày 27/10/2026, đợt B3. Đây là **hợp đồng** giữa server và mọi client (web
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
| Mock server | [`mockserver/`](../../mockserver/), cách chạy ở [README mock](mock-server.md) |
| Kiểm schema và kiểm ngữ nghĩa theo người nhận (Python) | [`apps/games/contract.py`](../../apps/games/contract.py) |

## 1. Ba nguyên tắc

1. **Server là nguồn chân lý.** Client chỉ gửi *ý định* ("tôi call"), không bao giờ gửi kết quả
   ("tôi còn 970 chip"). Mọi luật và phép tính chip chạy trong `HandEngine` trên server.
2. **Mỗi người chỉ thấy bài của mình.** Mọi trạng thái ván bài gửi đi là
   `HandEngine.view_for(người nhận)`; bài úp của người khác luôn là `"??"`.
3. **Lệnh áp dụng đúng một lần.** Mỗi lệnh có `command_id`; gửi lại bao nhiêu lần cũng chỉ áp một
   lần.

## 2. Kết nối

- URL (B4): `ws://<host>/ws/rooms/<room_id>/`. Đăng nhập bằng cookie phiên của Django (khách
  hoặc tài khoản thật, xem B6). Chưa đăng nhập mà vào phòng **public**: server tạo luôn một tài
  khoản khách và đăng nhập cho người đó (như `POST /api/auth/guest/`, tính vào giới hạn khách mỗi
  IP; hết lượt thì đóng với mã 4429). WebSocket không đặt được cookie, nên trình duyệt chưa có cookie
  thì mỗi kết nối là một khách mới: web app gọi REST trước để có cookie. Phòng **private** thì phải
  đã đăng nhập (khách cũng được) và có quyền xem, không thì đóng với mã 4404 (các mã đóng: xem
  cuối phần `room.updated`).
- Server chỉ cho thành viên (`guests_allowed: false` trong `/api/auth/config/`, mặc định khi chạy
  thật): không tạo khách; người chưa đăng nhập, phiên khách, tài khoản chưa xác minh email hay chưa
  được chủ phòng duyệt đều bị đóng với mã **4401** ngay sau bắt tay; bị bỏ duyệt lúc đang kết nối
  thì đóng 4401 ở tin kế tiếp. Client đưa người đó tới màn đăng nhập, không thử lại.
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
| `hand_id` | số ≥ 1 hoặc `null` | Ván đang chạy lúc gửi (`Hand.pk` trong DB, không phải số thứ tự ván); `null` giữa hai ván. `hand.started`, `action.applied`, `turn.deadline`, `hand.completed` luôn thuộc một ván nên **không bao giờ** `null` |
| `version` | số ≥ 0 | Bộ đếm sự kiện của phòng (mục 6) |
| `server_time` | chuỗi | Giờ server, UTC, ISO 8601 có `Z`: `2026-10-27T14:03:05.120Z` |
| `payload` | object | Nội dung riêng của từng loại |

Message **client gửi** có `protocol_version`, `type`, `room_id`, `payload`; lệnh có thêm
`command_id`; `command.act` có thêm `hand_id`. Client **không** gửi `version` hay `server_time`.

## 4. Hai loại message server

| Loại | Gồm | Gửi cho | `version` |
|---|---|---|---|
| **Sự kiện trạng thái** | `hand.started`, `action.applied`, `turn.deadline`, `hand.completed`, `seat.updated`, `room.suspended`, `room.updated` | Cả bàn (mỗi người một bản đã che bài theo góc nhìn của họ) | Tăng đúng **1** mỗi sự kiện |
| **Trả lời riêng** | `table.snapshot`, `command.ack`, `command.rejected`, `protocol.error` | Chỉ người gửi lệnh / người kết nối | Không tăng; mang `version` hiện tại của phòng |
| **Thông báo** (B8) | `chat.message`, `audience.updated` | Cả phòng | Không tăng; mang `version` hiện tại. Không phải trạng thái bàn: hụt một thông báo không cần resync |

Cùng một sự kiện trạng thái thì mọi người nhận cùng `version`, chỉ khác phần bài được che.

## 5. Lệnh và `command_id`

**Quy tắc cho client:** tạo `command_id` (nên dùng UUID v4) **một lần** cho mỗi ý định — mỗi lần
người chơi bấm một nút. Nếu không nhận được `command.ack`/`command.rejected` (mạng chập, kết nối
lại), **gửi lại y nguyên message cũ, cùng `command_id`**. Không bao giờ tạo `command_id` mới cho
một lần thử lại.

**Server xử lý một lệnh có `command_id` đã thấy:**

| Tình huống | Server làm gì |
|---|---|
| Lệnh này đã được áp dụng, nội dung giống hệt | Không áp lại. Trả `command.ack` với `duplicate: true` và cùng `result_version` lần đầu. Nếu server đã khởi động lại kể từ lần đầu (số `version` cũ không còn), `result_version` là `null`: client không ghép được với sự kiện nào, chỉ cần dựa vào `table.snapshot` của kết nối mới |
| Cùng `command_id` nhưng nội dung khác (ví dụ raise 30 rồi raise 60) | Trả `command.rejected` mã `command_id_reused`. Không áp gì |
| Lần trước lệnh này bị từ chối | Lệnh bị từ chối không được lưu (ADR-001), nên được xét lại như lệnh mới; thường sẽ bị từ chối lại cùng mã |

Phạm vi chống trùng:

- `command.act`: khoá là **`(hand_id, command_id)`**, giống ràng buộc duy nhất `(hand, command_id)`
  của `HandCommand` trong DB, nên **bền qua khởi động lại**. Cùng `command_id` ở một ván khác là
  một lệnh mới (dù client vẫn nên tạo id mới cho mỗi ý định).
- `command.sit_out` / `command.sit_in`: khoá là `command_id` trong phạm vi **phòng**, và **chỉ nằm
  trong bộ nhớ** của server: **không bền qua khởi động lại**. Sau khi server khởi động lại, gửi lại
  một sit-out đã áp sẽ nhận `command.rejected` mã `already_sitting_out` (hoặc `not_sitting_out` với
  sit-in) thay vì ack trùng. Client coi hai mã này là "ghế đã ở đúng trạng thái mình muốn". B5 đã
  xem lại và giữ như vậy (không lưu bền, lý do ở ADR-001 "Ghi chú khi cài (B5)").

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
| `rate_limited` | Gửi lệnh quá nhanh (B7); với `protocol.error`: chat quá nhanh (B8) |
| `room_suspended` | Phòng đang tạm dừng chờ khôi phục (xem mục 8, `room.suspended`) |
| `internal_error` | Lỗi phía server xảy ra **trước khi** lệnh được ghi (`HandCommand`): lệnh chưa áp dụng, gửi lại cùng `command_id` là an toàn. Lỗi **sau khi** đã ghi không bao giờ trả mã này (xem `room.suspended`) |

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

Luật bàn của ván nằm ngay trong `HandView` (cấu hình phòng có thể đổi giữa hai ván):
- `ante`: mỗi người được chia bài bỏ trước blind, là tiền chết vào pot; thiếu thì all-in.
- `bomb_pot` lớn hơn 0: ván bomb pot (cứ `room.bomb_pot_every` ván một lần, theo `hand_no`). Mọi
  người được chia bài bỏ `bomb_pot` (thiếu thì all-in, không lấy ante), không có blind, không có
  vòng cược trước flop: `hand.started` đã có 3 lá flop, người đầu tiên quyết định là người bên trái
  nút. Không có `action.applied` nào trước flop.

| Bài | Ai thấy |
|---|---|
| Bài tẩy của mình | Chỉ mình |
| Bài tẩy của người khác khi ván đang chạy | Không ai (`"??"`) |
| Bài của người đã fold | Không ai; danh sách `cards` thành rỗng `[]` |
| Bài lật ở showdown | Mọi người, kể cả người xem. Người thua có thể úp bài (PokerKit tự quyết người phải lật), khi đó `cards` là `[]` |
| 2 lá 7-2 của người ăn pot vì mọi người fold, khi phòng bật thưởng 7-2 (#27) | Mọi người, sau khi ván xong (trong `hand.completed`) |
| Tên bộ bài (`hand.completed.payload.showdown`) | Mọi người, nhưng **chỉ** cho bài còn ngửa sau showdown. Người fold, người úp bài khi thua, người thắng vì mọi người bỏ bài (kể cả 7-2 được lật) không có tên bộ bài |
| Bộ bài, lá burn, lá chưa chia | Không ai, không bao giờ rời server |
| Người xem (spectator) | `view_for(None)`: chỉ bài chung và bài đã lật |

`legal_actions` chỉ có trong `HandView` gửi cho đúng người đang tới lượt; mọi người khác nhận
`null`. Client không tự tính luật: nút nào bấm được, raise tối thiểu/tối đa bao nhiêu đều lấy từ
`legal_actions`.

### Chặn lộ bài: JSON Schema **không** phải lớp bảo mật

JSON Schema chỉ kiểm **hình dạng** message. Một snapshot cho người xem thấy bài tẩy của người khác
vẫn đúng hình dạng, nên vẫn qua schema. Hai lớp chặn thật, theo thứ tự:

1. **`HandEngine.view_for(người nhận)`**: mọi trạng thái ván gửi đi đều dựng từ đây, không bao giờ
   từ trạng thái đầy đủ của engine.
2. **Kiểm ngữ nghĩa theo người nhận** (`apps.games.contract.validate_outgoing(message, viewer)`),
   chạy với **mọi** message ngay trước khi gửi (mock server: `MockTable._send`; B4: actor/consumer).
   Nó biết người nhận là ai và từ chối gửi khi: bài tẩy người khác lộ lúc ván đang chạy; người nhận
   không thấy bài mình; người đã fold còn bài; `legal_actions` tới người không đang tới lượt; một lá
   xuất hiện hai lần; có khoá như `deck`/`burn`; `hand_id` của phong bì khác của ván; snapshot gửi
   nhầm người; `hand.completed` làm sinh/mất chip (tổng `hand_net` khác 0, tổng `seven_deuce_net`
   khác 0, `seven_deuce.total` khác tổng `payments`, `stack` không khớp kết quả ván); `showdown`
   đặt tên bộ bài cho người không còn bài ngửa, dùng lá không phải bài ngửa của họ hay bài chung,
   có khi ván thắng vì mọi người bỏ bài (7-2) hoặc khi chưa đủ 5 lá chung, bỏ sót người có
   bài ngửa (trừ chính người nhận), hoặc đặt tên sai: tự tính lại bằng PokerKit từ 5 lá (đúng hạng,
   đúng bộ mạnh nhất của người đó) và kiểm thứ tự lá mà client đọc.

Ví dụ những message đúng schema mà phải bị chặn: [`fixtures/server/leaks/`](fixtures/server/leaks/)
(người nhận của từng file ghi trong [`fixtures/server/viewers.json`](fixtures/server/viewers.json)).
Test chơi 300 ván ngẫu nhiên (có all-in) và kiểm góc nhìn của mọi người sau mỗi hành động.

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
             "small_blind": 5, "big_blind": 10, "think_time_seconds": 20, "seven_deuce_bonus": 50,
             "starting_stack": 1000, "ante": 0, "bomb_pot_every": 0, "bomb_pot_amount": 0},
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
      "ante": 0, "bomb_pot": 0,
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
cùng), `seven_deuce` (`null` nếu không có thưởng) và `showdown` (tên bộ bài, xem dưới). Sau sự
kiện này `hand_id` của các message tiếp theo là `null` cho tới `hand.started` kế tiếp.

`showdown` có một dòng cho **mỗi người còn bài ngửa sau showdown**, theo số ghế; `[]` khi ván kết
thúc vì mọi người bỏ bài (kể cả khi 7-2 được lật). Người thua thường úp bài (PokerKit tự quyết, kể
cả khi all-in), nên thường chỉ có người thắng; chia pot thì có đủ những người chia. Mỗi dòng:

| Trường | Nghĩa |
|---|---|
| `player_id`, `seat` | Người có bài |
| `category` | Mã bộ bài, ổn định: `high_card`, `one_pair`, `two_pair`, `three_of_a_kind`, `straight`, `flush`, `full_house`, `four_of_a_kind`, `straight_flush`. Server tính bằng PokerKit; client chỉ đổi mã ra chữ (web: "Mậu thầu", "Đôi", "Hai đôi", "Bộ ba", "Sảnh", "Thùng", "Cù lũ", "Tứ quý", "Thùng phá sảnh") |
| `cards` | 5 lá tạo nên bộ bài (từ 2 lá ngửa của họ và bài chung), **lá quan trọng trước**: nhóm lớn trước, rồi lá cao trước; sảnh A-2-3-4-5 để A cuối. Nhờ vậy client ghi được "Thùng già A", "Cù lũ K đôi 9" mà không tự so bài |

Ví dụ ván thắng ở showdown (An đôi A): `"showdown": [{"player_id": "2", "seat": 3, "category":
"one_pair", "cards": ["Ac", "Ad", "Qh", "Jh", "7d"]}]`. Thêm trường này là đổi tương thích (client
cũ bỏ qua trường lạ); bản xem lại ván (REST `GET /api/hands/{id}/replay/`) có cùng `showdown`.

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
      "ante": 0, "bomb_pot": 0,
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
    },
    "showdown": []
  }
}
```

Lưu ý: `hand.players[].stack` của Lym là 1035 (chip trong ván, **trước** thưởng); số dư thật sau
thưởng là `results[].stack` = 1135. Người còn ít chip hơn mức thưởng chỉ trả số chip còn lại
(`payments[].amount` có thể nhỏ hơn `bonus`); người còn 0 chip không có trong `payments`.
Ván thắng ở showdown: [ví dụ](fixtures/server/valid/hand.completed.showdown.json).

### `seat.updated` (sự kiện)

Một ghế thay đổi: có người ngồi (qua REST; chưa có chip thì đã kèm `starting_stack` của phòng),
rời ghế, sit-out, quay lại, được cấp chip hoặc tự mua thêm (`rebuy`), mất/có kết nối. `occupant` là trạng thái mới của ghế, `null` nếu ghế trống.

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
Lệnh vừa áp (`duplicate: false`) luôn có `result_version`; ack trùng sau khi server khởi động lại
mang `result_version: null` ([ví dụ](fixtures/server/valid/command.ack.duplicate-after-restart.json)).

### `command.rejected` (trả lời riêng)

```json
{
  "protocol_version": 1, "type": "command.rejected", "room_id": 1, "hand_id": 41,
  "version": 15, "server_time": "2026-10-27T14:03:11.250Z",
  "payload": {"command_id": "b3e0d7c4-1f2a-4c6b-8d9e-0a1b2c3d4e5f",
              "code": "not_your_turn", "message": "It is player 2's turn."}
}
```

### `room.suspended` (sự kiện): lỗi sau khi đã ghi lệnh

Server ghi lệnh vào DB (`HandCommand`) **trước** khi áp vào engine ([ADR-001](../adr/ADR-001-table-actor.md)).
Nếu có lỗi **sau** bước ghi (engine từ chối một lệnh đã ghi, chốt bảo toàn chip báo lỗi…), server
không biết chắc trạng thái nên **dừng phòng** (fail-stop) thay vì đoán:

1. Lệnh đó **không** nhận `command.ack` hay `command.rejected`: kết quả chưa biết.
2. Cả phòng nhận `room.suspended` (`reason: "recovery_needed"`). Client hiện "Bàn tạm dừng" và tắt
   nút hành động. `message` luôn là một câu cố định; nguyên nhân chỉ ghi ở log server (lỗi engine có
   thể nhắc tới bộ bài hay bài tẩy).
3. Trong lúc tạm dừng: mọi lệnh nhận `command.rejected` mã `room_suspended`; kết nối mới nhận
   `table.snapshot` với `room.status` là `"suspended"`.
   Phòng cũng mở ra ở trạng thái này nếu lúc server khởi động lại, ván dở không dựng lại được (B5).
4. Khôi phục xong (dựng lại bằng replay, hoặc người quản trị xử lý ván hỏng ở B5), server **đóng mọi
   kết nối** của phòng. Client kết nối lại, nhận snapshot mới, rồi gửi lại lệnh còn treo cùng
   `command_id`: nếu lệnh đã nằm trong ván thì nhận ack trùng (`result_version: null`), nếu không
   thì được xử lý như lệnh mới.

```json
{
  "protocol_version": 1, "type": "room.suspended", "room_id": 1, "hand_id": 41,
  "version": 23, "server_time": "2026-10-27T14:03:44.902Z",
  "payload": {"reason": "recovery_needed",
              "message": "The table stopped after a server error and waits for recovery."}
}
```

### `room.updated` (sự kiện): cấu hình hoặc trạng thái phòng đổi (B7)

Chủ phòng đổi blind, thời gian suy nghĩ, thưởng 7-2 hay tên phòng (REST `PATCH /api/rooms/{id}/`),
hoặc đóng phòng. `room` là `RoomInfo` mới, thay nguyên cục. Đổi lúc đang có ván thì **ván đó giữ
cấu hình cũ**; sự kiện này được phát khi cấu hình mới bắt đầu có hiệu lực (ngay sau
`hand.completed`, trước `hand.started` của ván sau). Thay đổi chờ ván sau được lưu
trong DB nên không mất khi server khởi động lại. Đóng phòng giữa ván cũng chờ ván xong; sau đó `room.status` là
`"closed"`, server không chia ván mới, vào ghế bị từ chối `room_closed`.

```json
{
  "protocol_version": 1, "type": "room.updated", "room_id": 1, "hand_id": null,
  "version": 31, "server_time": "2026-10-27T15:10:02.000Z",
  "payload": {"room": {"room_id": 1, "name": "Bàn bạn bè", "status": "open", "max_seats": 9,
              "small_blind": 10, "big_blind": 20, "think_time_seconds": 30,
              "seven_deuce_bonus": 50, "starting_stack": 1000, "ante": 0,
              "bomb_pot_every": 0, "bomb_pot_amount": 0}}
}
```

Người bị chủ phòng kick: cả bàn nhận `seat.updated` (ghế trống); mọi kết nối của người đó bị server
đóng với mã **4403**, và người đó không vào lại được phòng (REST trả `kicked`). Tài khoản bị khóa
trong admin (bỏ "active") lúc đang kết nối: tin kế tiếp người đó gửi không được xử lý, server đóng
kết nối với **4403** (tới lúc đó họ vẫn nhận tin của bàn). Kết nối vào phòng
private mà không có quyền xem: mã **4404**. Chưa đăng nhập và IP này đã tạo quá nhiều khách
(20/giờ): mã **4429**. Server nhận bắt tay rồi mới đóng, để trình duyệt thấy được mã (đóng ngay lúc
bắt tay thì trình duyệt chỉ thấy 1006). Client **không thử kết nối lại** khi nhận 4401, 4403 hay
4404. Server chỉ cho thành viên mà người kết nối chưa phải thành viên đã xác minh: mã **4401**.
Client đọc không kịp (kênh của kết nối đầy): server bỏ kết nối đó khỏi bàn (nó đã lỡ ít nhất một sự
kiện) rồi đóng với mã **4408** ngay khi kênh có chỗ; client kết nối lại như mất mạng và nhận
snapshot mới.

### `chat.message` (thông báo, B8)

Một dòng chat, gửi cho mọi người đang kết nối phòng, kể cả người gửi (client hiện dòng của mình
khi nhận lại, không tự thêm trước). Emoji là ký tự bình thường trong `text`. Lịch sử (50 dòng gần
nhất) lấy qua `GET /api/rooms/{room_id}/chat/`, ví dụ khi vừa kết nối lại.

```json
{
  "protocol_version": 1, "type": "chat.message", "room_id": 1, "hand_id": 41,
  "version": 18, "server_time": "2026-10-27T14:03:12.400Z",
  "payload": {"message": {"message_id": 9, "player_id": "2", "display_name": "An",
              "text": "bluff à 😏", "sent_at": "2026-10-27T14:03:12.398Z"}}
}
```

### `audience.updated` (thông báo, B8)

Danh sách người đang xem mà không ngồi ghế (người xem). Gửi cho cả phòng mỗi khi danh sách đổi, và
gửi riêng cho kết nối mới ngay sau `table.snapshot`. Một người mở nhiều tab vẫn chỉ tính một lần.

```json
{
  "protocol_version": 1, "type": "audience.updated", "room_id": 1, "hand_id": null,
  "version": 12, "server_time": "2026-10-27T14:00:01.000Z",
  "payload": {"spectators": [{"player_id": "5", "display_name": "Chi"}]}
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

### `chat.send` (B8)

```json
{"protocol_version": 1, "type": "chat.send", "room_id": 1, "payload": {"text": "gg 🎉"}}
```

Không phải lệnh: không có `command_id`, không có ack. `text` 1–300 ký tự, không toàn khoảng trắng.
Người ngồi ghế và người xem đều chat được. Gửi quá nhanh (quá 5 dòng trong 10 giây) thì nhận
`protocol.error` mã `rate_limited` và dòng đó bị bỏ.

Giới hạn chung (B7): mỗi người chơi tối đa 20 message trong 10 giây, mọi loại đều tính (lệnh,
`resync.request`, chat, cả message sai). Quá thì lệnh nhận `command.rejected` mã `rate_limited`,
message không phải lệnh nhận `protocol.error` mã `rate_limited`.

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

- Heartbeat ở tầng giao thức: không có và không cần. Server (Daphne) ping ở tầng WebSocket khi
  kết nối im 20 giây và đóng nếu 30 giây không có pong; trình duyệt tự trả pong. Kết nối đóng thì
  cả bàn nhận `seat.updated` với `connected: false` (B5).
- (Đã có từ B7) Chủ phòng cấp chip, kick: REST, kết quả phát bằng `seat.updated`; đổi cấu hình
  và đóng phòng: `room.updated`. Người chơi hết chip tự mua thêm (`POST .../rebuy/`): cũng
  `seat.updated`.
- (Đã có từ B8) Chat (`chat.send` → `chat.message`), danh sách người xem (`audience.updated`);
  lịch sử ván, replay và bảng lời/lỗ qua REST ([`openapi.yaml`](openapi.yaml), tag `history`).

Các thứ này sẽ là **thêm message mới** (đổi tương thích), không đổi message đã có.
