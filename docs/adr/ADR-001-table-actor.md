# ADR-001: Mỗi bàn một table actor

- **Trạng thái:** Đã cài ở B4a (27/10/2026, `apps/games/actor.py`), chờ chủ dự án duyệt. Độ bền ở B5. Chỗ lệch so với đề xuất: mục "Ghi chú khi cài (B4a)" cuối file.
- **Liên quan:** [docs/spec.md](../spec.md) mục 3, [giao thức WebSocket](../api/ws-protocol.md),
  `apps/games/models.py` (`Hand`, `HandCommand`), `apps/games/services.py`
  (`save_completed_hand`).

## Bối cảnh

Một bàn có tới 9 người (và người xem) gửi lệnh qua WebSocket cùng lúc, cộng thêm đồng hồ suy nghĩ
của server tự check/fold khi hết giờ. Ta cần:

1. **Một thứ tự duy nhất** cho mọi thay đổi của bàn: hai người bấm cùng lúc thì một người được xử lý
   trước, người kia thấy kết quả đó rồi mới tới lượt mình.
2. **Mỗi lệnh áp đúng một lần**, kể cả khi client gửi lại (`command_id`, xem giao thức mục 5).
3. **Không mất ván khi process chết**: khởi động lại phải dựng lại đúng ván dở (nguyên tắc #3:
   mọi ván replay được).
4. Quy mô 10–20 người, **một server**, không Celery, không Redis HA (spec #11).

`HandEngine` không an toàn khi hai luồng cùng gọi `act()`; trạng thái PokerKit nằm trong bộ nhớ và
không có cách lưu/nạp sẵn ngoài `record()`/`replay()`.

## Quyết định

### 1. Một process ASGI, mỗi phòng một asyncio task

- Toàn bộ WebSocket chạy trong **một process** Daphne (Django Channels).
- Mỗi phòng đang có người có **một `TableActor`**: một asyncio task đọc lệnh từ **một
  `asyncio.Queue`** riêng của phòng. Chỉ task này được đụng vào `TableSession`/`HandEngine` của
  phòng: đây là "người ghi duy nhất" của bàn.
- Process giữ một bảng `room_id → TableActor`. Actor được tạo khi người đầu tiên kết nối vào phòng
  (hoặc khi khởi động lại mà phòng còn ván dở) và dừng khi phòng đóng hoặc trống một lúc.
- Channels consumer (mỗi kết nối một cái) **không** đụng engine. Nó chỉ: kiểm message theo schema
  (`apps.games.contract`), gắn người gửi (lấy từ phiên đăng nhập, không bao giờ tin `player_id` do
  client gửi), đặt lệnh vào hàng đợi của phòng, rồi chờ actor trả `command.ack`/`command.rejected`.
- Hết giờ suy nghĩ cũng là một lệnh trong cùng hàng đợi (actor tự đặt hẹn giờ, khi tới hạn thì
  xếp một lệnh `timeout` vào hàng). Nhờ vậy "Lym call đúng giây cuối" và "đồng hồ hết giờ" không
  bao giờ chạy đè nhau: cái nào vào hàng trước thì được xử lý trước, cái sau thấy lượt đã qua và
  bị từ chối (`not_your_turn`) hoặc bị bỏ qua.

### 2. Thứ tự xử lý một lệnh (bắt buộc)

**kiểm tra hợp lệ → ghi `HandCommand` → áp vào engine → phát sự kiện**

| Bước | Làm gì | Lỗi ở bước này thì |
|---|---|---|
| 1. Kiểm tra hợp lệ | `command_id` đã áp chưa (bộ nhớ, rồi ràng buộc duy nhất `(hand, command_id)` trong DB); đúng `hand_id` đang chạy; người gửi ngồi bàn; hành động hợp lệ theo `HandEngine.legal_actions` | Trả `command.rejected`, ghi log. **Không** ghi DB, không đổi gì |
| 2. Ghi `HandCommand` | Một transaction ngắn: `HandCommand(hand, player, sequence = n + 1, command_id, kind, amount)` | Không ghi được (DB lỗi) thì trả `command.rejected` mã `internal_error`; chưa áp gì nên client gửi lại an toàn |
| 3. Áp vào engine | `HandEngine.act(...)` | Không được xảy ra vì bước 1 đã kiểm đúng luật đó. Nếu vẫn xảy ra: **fail-stop** (mục 5) |
| 4. Phát sự kiện | Tăng `version`; mỗi người một bản `view_for(người đó)`; gửi qua channel layer (Redis). Ván xong thì `save_completed_hand()` (ván + ledger trong một transaction) **trước** khi phát `hand.completed` | Người nhận mất gói thì tự resync bằng `version` |
| 5. Trả lời | `command.ack` cho người gửi, mang `result_version` | |

Vì sao **ghi trước rồi mới áp**: nếu process chết ở bất kỳ đâu sau bước 2, lệnh đã nằm trong DB nên
replay sẽ áp lại nó đúng một lần; nếu chết trước bước 2, coi như lệnh chưa từng tới, client gửi lại
cùng `command_id` và được xử lý như mới. Không có trường hợp nào lệnh bị áp hai lần hay mất mà
người gửi tưởng đã xong.

Lệnh hết giờ được ghi y như lệnh người chơi, với `command_id` do server tạo
(`timeout:<hand_id>-<sequence>`; dấu `:` nằm ngoài mẫu `CommandId` của client nên client không chiếm
trước được), để replay ra đúng ván.

### 3. Lệnh bị từ chối chỉ ghi log

Lệnh sai luật, sai lượt, trùng `command_id` với nội dung khác… **không** tạo `HandCommand`. Bảng
`HandCommand` chỉ chứa lệnh đã áp, đúng thứ tự `sequence`, nên replay không phải lọc gì. Log có
`room_id`, `hand_id`, người gửi, `command_id`, mã lỗi để tra khi cần.

### 4. Khôi phục bằng `HandEngine.replay`

Khi process khởi động (hoặc actor của một phòng được tạo lại):

1. Tìm `Hand` của phòng chưa có `completed_at` (ván dở).
2. `HandEngine.replay(hand.replay_record())`: dựng lại từ cấu hình đã lưu (ghế, stack, button,
   blind, **bộ bài**, thưởng 7-2) và các `HandCommand` theo `sequence`. Kết quả giống hệt lúc trước
   khi chết, kể cả bài chưa lật, vì bộ bài đã được lưu từ đầu ván.
3. **Nếu engine sau replay đã `is_complete` mà `Hand.completed_at` còn trống** (process chết sau khi
   ghi lệnh cuối nhưng trước `save_completed_hand()`): dựng lại các bút toán `hand` và
   `seven_deuce` của ván rồi gọi `save_completed_hand()`. Hàm này idempotent (gọi lại cho ván đã
   lưu thì không ghi thêm), nên chạy khôi phục bao nhiêu lần cũng chỉ có một bộ bút toán. Việc này
   phải xong **trước khi** actor nhận kết nối hay lệnh mới; sau đó phòng ở trạng thái giữa hai ván.
   Bút toán phải dựng bằng **đúng một hàm** dùng chung với lúc kết thúc ván bình thường (lời/lỗ từ
   `HandEngine.result()`, thưởng 7-2 theo số dư sổ chip và các ghế đang ngồi như
   `TableSession._apply_seven_deuce_bonus`), để hai đường không bao giờ ra kết quả khác nhau.
4. Ván còn dở: nạp tập `command_id` đã áp của ván đó để chống trùng tiếp.
5. Đặt lại đồng hồ cho người đang tới lượt (B5 quyết định: cho lại đủ thời gian hay phần còn lại).
6. Client kết nối lại nhận `table.snapshot` như bình thường.

Không cần lưu "ảnh chụp" trạng thái riêng: `Hand.config` + `HandCommand` là đủ. Ván xong thì đã có
`Hand.result` để đối chiếu với kết quả replay.

### 5. Lỗi sau khi đã ghi `HandCommand`: fail-stop

Từ lúc `HandCommand` đã commit, lệnh **đã thuộc về ván**: replay sẽ áp nó. Vì vậy mọi lỗi từ bước 3
trở đi (engine ném `IllegalAction`, chốt bảo toàn chip ném `RuntimeError`, lỗi lập trình) **không**
được trả `command.rejected` mã `internal_error`: mã đó hứa "chưa áp, gửi lại an toàn", sai ở đây.
Actor làm như sau:

1. Không trả ack hay rejected cho lệnh đó (kết quả chưa biết).
2. Phát `room.suspended` (`reason: "recovery_needed"`) cho cả phòng, ghi log mức nghiêm trọng kèm
   `room_id`, `hand_id`, `sequence`, `command_id`.
3. Ngừng nhận lệnh: mọi lệnh sau nhận `command.rejected` mã `room_suspended`; snapshot cho kết nối
   mới có `room.status = "suspended"`. Phòng khác không bị ảnh hưởng.
4. Thử khôi phục bằng replay (mục 4). Replay thành công thì đóng mọi kết nối của phòng để client vào
   lại với snapshot mới. Replay hỏng cùng chỗ (lệnh "độc") thì phòng **giữ trạng thái tạm dừng**
   cho tới khi người quản trị xử lý (huỷ ván và trả lại chip theo `Hand.config`, hoặc cách khác):
   quy trình chốt ở B5. Không bao giờ tự xoá `HandCommand` để "chữa".

Lỗi **trước** khi ghi (DB không ghi được ở bước 2) thì chưa có gì thay đổi: trả `internal_error`,
client gửi lại cùng `command_id` an toàn.

## Phương án đã cân nhắc: khoá trong DB

Mỗi lệnh xử lý ngay trong consumer nhận nó: mở transaction, `SELECT … FOR UPDATE` trên dòng `Hand`
(hoặc `Room`), dựng lại engine, áp lệnh, ghi `HandCommand`, commit, rồi phát sự kiện.

| | Actor (chọn) | Khoá DB |
|---|---|---|
| Thứ tự lệnh | Tự nhiên: hàng đợi xử lý từng cái | Do khoá quyết định; người chờ khoá bị treo |
| Trạng thái engine | Giữ sẵn trong bộ nhớ | Phải replay toàn bộ ván **mỗi lệnh** (PokerKit không lưu/nạp trạng thái sẵn), hoặc tự viết phần lưu trạng thái |
| Thứ tự sự kiện tới client | Một task phát nên luôn đúng thứ tự `version` | Hai transaction commit A rồi B nhưng phát có thể tới B trước A; phải lấy `version` từ DB và client phải sắp lại |
| Đồng hồ hết giờ | Lệnh trong cùng hàng đợi | Cần thêm bộ hẹn giờ chạy ngoài (không có Celery) cùng tranh khoá với người chơi |
| Nhiều process / nhiều server | Không (một phòng phải ở đúng một process) | Có, đây là ưu điểm chính |
| Độ phức tạp ở quy mô 20 người | Thấp | Cao hơn: khoá, chờ khoá, deadlock, replay mỗi lệnh |

Lợi thế lớn nhất của khoá DB là chạy được nhiều process. Ta không cần điều đó (một server, 10–20
người, spec #11), nên chọn actor cho đơn giản và đúng thứ tự một cách tự nhiên. Ghi `HandCommand`
trước khi áp vẫn cho ta độ bền mà phương án khoá DB có.

Cũng đã loại: khoá Redis (thêm một nơi có thể hỏng mà không thêm gì so với actor khi chỉ có một
process) và một worker toàn cục cho mọi bàn (một bàn chậm làm chậm cả hệ thống).

## Hệ quả

- **Chỉ chạy một process ASGI.** Không bật nhiều worker Daphne/uvicorn cho WebSocket: hai process
  sẽ có hai actor cho cùng một phòng. Muốn mở rộng sau này thì chia phòng theo process (sharding
  theo `room_id`), ngoài phạm vi hiện tại. Cần ghi điều này trong tài liệu deploy (B5).
- **Bước 1 và bước 3 phải dùng cùng một luật.** Hiện `HandEngine.act()` tự kiểm rồi mới đổi trạng
  thái, còn bước 1 kiểm bằng `legal_actions`. B4 nên thêm `HandEngine.check(action)` dùng chung
  đúng đoạn kiểm của `act()` (không đổi trạng thái), để "kiểm thì qua mà áp thì lỗi" không thể xảy
  ra. Nếu vẫn xảy ra (lỗi lập trình) thì fail-stop như mục 5.
- **Mỗi lệnh một lần ghi DB** (một dòng `HandCommand`), trong transaction ngắn, qua async ORM hoặc
  `sync_to_async`. Ở quy mô này không đáng lo.
- **`version` sống trong bộ nhớ của actor**, không lưu DB. Sau khi process khởi động lại có thể
  đếm lại từ đầu; mọi kết nối cũ đã đứt nên client luôn nhận `table.snapshot` mới và lấy `version`
  của nó làm mốc (đã ghi trong giao thức mục 6). Ack cho lệnh trùng gửi lại sau khi khởi động lại
  mang `result_version: null`: số cũ đã mất, và trả `version` hiện tại thì sẽ trỏ nhầm sang một sự
  kiện khác. Client dựa vào snapshot của kết nối mới.
- **Chống trùng `command.sit_out`/`command.sit_in` chỉ trong bộ nhớ.** Sau khởi động lại, gửi lại một
  lệnh sit-out đã áp sẽ nhận `already_sitting_out` thay vì ack trùng; vô hại vì trạng thái ghế đã
  nằm trong `RoomSeat.sitting_out`.
- Một actor bị chậm (chờ DB) chỉ làm chậm phòng của nó, không ảnh hưởng phòng khác.
- Mock server (`mockserver/`) đã làm theo đúng mô hình một-người-ghi này (một event loop, xử lý từng
  message, một hàng đợi gửi) nhưng không có DB; nó không thay cho actor.

## Test B4 phải có

- Hai lệnh cùng lúc từ hai người: đúng một được áp, người kia nhận `not_your_turn`.
- Cùng `command_id` gửi hai lần: áp một lần, lần hai nhận ack `duplicate: true`.
- Process "chết" sau khi ghi `HandCommand` nhưng trước khi phát: dựng lại bằng replay, trạng thái
  đúng, client gửi lại lệnh đó thì nhận ack trùng chứ không áp lại.
- Hết giờ và lệnh người chơi tới cùng lúc: chỉ một cái có hiệu lực.
- Replay mọi ván đã xong cho đúng `Hand.result`.
- Process "chết" sau khi ghi `HandCommand` **cuối** của ván (engine đã xong) nhưng trước
  `save_completed_hand()`: khởi động lại thì `Hand.completed_at` và `Hand.result` được điền, ledger
  có đúng một bộ bút toán `hand`/`seven_deuce` của ván (tổng bằng 0), kể cả ván có thưởng 7-2; chạy
  khôi phục lần hai không ghi thêm dòng nào; actor không nhận lệnh nào trước khi xong bước này.
- Lệnh "độc" (engine lỗi sau khi đã ghi): phòng phát `room.suspended`, từ chối lệnh sau bằng
  `room_suspended`, không ghi thêm `HandCommand`; khôi phục bằng replay cũng hỏng thì phòng vẫn tạm
  dừng; phòng khác vẫn chạy bình thường.

## Ghi chú khi cài (B4a)

Cài đúng thứ tự mục 2 (`HandEngine.check` → ghi `HandCommand` → `HandEngine.act` → phát), chống
trùng theo `(hand, command_id)`, khôi phục mục 4 và fail-stop mục 5. Những chỗ khác hoặc chưa làm:

- **Snapshot không đi qua hàng đợi.** `resync.request` và `GET /api/rooms/{id}/snapshot/` dựng
  snapshot thẳng từ trạng thái trong bộ nhớ (`TableActor.snapshot_message`), vì chỉ đọc. Snapshot có
  thể đã chứa một thay đổi mà sự kiện của nó tới ngay sau; sự kiện mang trạng thái đầy đủ (`hand`,
  `occupant`) nên client áp lại cũng không sai. Ván vừa xong thì actor chuyển sang "giữa hai ván"
  ngay khi `finish_hand()` (không có `await` ở giữa), nên snapshot không bao giờ có `hand_id` mà
  thiếu `hand`.
- **Chống trùng sau khởi động lại** nạp từ `HandCommand` (kind + amount là toàn bộ payload), nên
  vẫn phân biệt được gửi lại (ack `duplicate`, `result_version: null`) với dùng lại mã cho lệnh khác
  (`command_id_reused`).
- **Đồng hồ tối thiểu.** Mỗi lượt đặt một hẹn giờ `think_time_seconds`; tới hạn thì xếp lệnh hết
  giờ (gắn `hand` **và** người tới lượt) vào cùng hàng đợi; lượt đã qua thì bỏ qua. Lệnh hết giờ ghi
  `command_id` = `timeout:<hand_id>-<sequence>` (gắn số lượt: đồng hồ chỉ tác động đúng lượt nó được
  hẹn; ghi lệnh hết giờ thất bại thì hẹn lại sau 1 giây). Khôi phục giữa ván cho người đang tới lượt đủ thời
  gian lại từ đầu (mục 4.5 để B5 chốt). Mất kết nối không đổi đồng hồ.
- **Fail-stop chưa tự khôi phục** (mục 5.4): phòng giữ trạng thái tạm dừng tới khi process khởi
  động lại; lúc đó khôi phục chạy như mục 4. Nếu lệnh "độc" làm replay hỏng thì actor của phòng không
  dựng được và kết nối vào phòng đó thất bại, thay vì nhận snapshot `status: "suspended"`. Làm ở B5.
- **Ván mới tự bắt đầu** khi không có ván, phòng không tạm dừng, có ít nhất 2 người đủ chip và có
  ít nhất một kết nối (giống mock: không chia bài cho phòng trống). Giữa hai ván nghỉ
  `TableActor.next_hand_delay` (4 giây).
- **Vào/rời ghế (REST) cũng đi qua hàng đợi** của phòng, để `seat.updated` có `version` đúng thứ tự
  với lệnh WebSocket. Rời ghế xoá dòng `RoomSeat`; chip vẫn trong sổ của phòng.
- **Danh tính tạm (trước B6):** mỗi Django session một user khách (`apps/games/accounts.py`),
  tạo ngay lần đầu gọi REST hoặc mở WebSocket. Hai tab cùng session là cùng người: dùng chung ghế,
  cùng nhận góc nhìn. `GET snapshot` phát cookie `csrftoken` cho các request POST/DELETE.
- **Cấp chip** qua API là B7. Để thử tay: `manage.py create_demo_room --players N --chips C` tạo
  phòng, xếp sẵn N khách có chip và in `sessionid` của từng người; chạy **trước** khi server mở
  phòng đó (actor chỉ đọc sổ chip lúc khôi phục).
- Chỉ một process ASGI: ghi ở `config/asgi.py`; tài liệu deploy ở B5.
