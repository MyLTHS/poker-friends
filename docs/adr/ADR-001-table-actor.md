# ADR-001: Mỗi bàn một table actor

- **Trạng thái:** Đã cài ở B4a (27/10/2026, `apps/games/actor.py`), phần độ bền ở B5 (27/10/2026), chờ chủ dự án duyệt. Chỗ lệch so với đề xuất và quyết định B5: hai mục "Ghi chú khi cài" cuối file.
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
| 4. Phát sự kiện | Tăng `version`; mỗi người một bản `view_for(người đó)`; gửi qua channel layer (trong bộ nhớ của process, xem ghi chú cuối). Ván xong thì `save_completed_hand()` (ván + ledger trong một transaction) **trước** khi phát `hand.completed` | Người nhận mất gói thì tự resync bằng `version` |
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

Khôi phục chạy **lười**, từng phòng: process khởi động không dựng gì cả; actor của một phòng được
dựng lại (`get_actor`) lúc có người đầu tiên mở phòng đó (kết nối WebSocket, hoặc một thao tác bàn
qua REST: vào/rời ghế, sit-out, cấp chip, kick…). Trước lúc đó, lobby và trang phòng chỉ đọc DB
(ván dở hiện là `playing`). Khi dựng:

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
5. Đặt lại đồng hồ cho người đang tới lượt: **phần thời gian còn lại**, tính từ lệnh cuối đã ghi
   (hoặc từ lúc chia bài nếu chưa có lệnh), nhưng không ít hơn 10 giây (và không quá thời gian suy
   nghĩ của phòng) để người chơi kịp vào lại (chốt ở B5).
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
   cho tới khi người quản trị xử lý: `manage.py void_hand <hand_id> --reason "..."` rồi khởi động
   lại server (chốt ở B5, xem "Ghi chú khi cài (B5)"). Không bao giờ tự xoá `HandCommand` để "chữa".

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
- **Chia ván mới** (từ 29/10/2026; trước đó bàn tự chia và nghỉ 4 giây giữa hai ván): chỉ khi chủ
  phòng đã bấm Bắt đầu (`Room.running`, Tạm dừng thì thôi), không có ván, phòng không tạm dừng vì
  lỗi, có ít nhất 2 người chơi được (có chip, không nghỉ, không chờ rời) và có ít nhất một kết nối
  (giống mock: không chia bài cho phòng trống). Đủ điều kiện thì đếm ngược 10 giây
  (`START_COUNTDOWN_SECONDS`) rồi chia; hết ván, còn đủ điều kiện thì nghỉ `room.hand_pause_seconds`
  (6–20 giây) rồi chia ván sau, không đủ thì không hẹn gì. Chia mà ghi `Hand` lỗi thì đếm lại.
- **Vào/rời ghế (REST) cũng đi qua hàng đợi** của phòng, để `seat.updated` có `version` đúng thứ tự
  với lệnh WebSocket. Rời ghế xoá dòng `RoomSeat`; chip vẫn trong sổ của phòng. Đang ở trong ván thì
  rời ghế chờ hết ván (`RoomSeat.leaving`): vẫn chơi nốt, hết ván mới trả ghế.
- **Danh tính tạm (trước B6):** mỗi Django session một user khách (`apps/games/accounts.py`),
  tạo ngay lần đầu gọi REST hoặc mở WebSocket. Hai tab cùng session là cùng người: dùng chung ghế,
  cùng nhận góc nhìn. `GET snapshot` phát cookie `csrftoken` cho các request POST/DELETE.
- **Cấp chip** qua API là B7. Để thử tay: `manage.py create_demo_room --players N --chips C` tạo
  phòng, xếp sẵn N khách có chip và in `sessionid` của từng người; chạy **trước** khi server mở
  phòng đó (actor chỉ đọc sổ chip lúc khôi phục).
- Chỉ một process ASGI: ghi ở `config/asgi.py`; tài liệu deploy ở B5.

### Sửa theo review chỉ-đọc PR #10

- Mọi lỗi khi lưu ván xong đều fail-stop (không chỉ `HandPersistenceError`); khôi phục duyệt **mọi**
  `Hand` chưa xong theo `hand_no` (mục 4.1), ván cũ còn dở mà đã có ván mới thì không dựng phòng.
- Đồng hồ mang số lượt lúc hẹn, chỉ tác động đúng lượt đó; lệnh hết giờ tên `timeout:<hand>-<n>`
  (client không gửi được dấu `:`), ghi thất bại thì hẹn lại sau 1 giây.
- Lỗi sau khi đã ghi lệnh (kể cả khi phát sự kiện) đều fail-stop; một kết nối bị đầy kênh
  (`ChannelFull`) thì chỉ bỏ kết nối đó, rồi đóng socket của nó (mã 4408) khi kênh có chỗ để client
  kết nối lại và nhận snapshot (sửa sau đợt kiểm tra B).
- Snapshot lúc ván mới đã chia trong bộ nhớ mà `Hand` chưa ghi xong: coi như giữa hai ván.
- Lệnh của ván khác ván đang chạy được tra trong `HandCommand`: gửi lại lệnh cuối sau sự cố nhận ack
  trùng (`result_version: null`).
- WebSocket kiểm Origin (`AllowedHostsOriginValidator`).
- Vào ghế đụng ràng buộc DB trả `seat_taken` (409); kết nối mới trong lúc nghỉ giữa hai ván không
  chia ván sớm.
- Ai trả thưởng 7-2 được tính theo các ghế lúc ván kết thúc (kể cả sit-out), không nằm trong
  `Hand.config`. Đã kiểm: khôi phục dùng ghế đọc từ DB đúng lúc đó, và người không trong ván rời ghế
  trước khi ván xong thì cả lúc chơi lẫn lúc khôi phục đều không tính họ, nên hai đường cho cùng kết
  quả.

Còn để sau (B5 trở đi): ghi DB trước khi đổi bộ nhớ cho sit-out/sit-in/rời ghế; gỡ actor của phòng
không còn ai khỏi `_actors`; `_applied` và `TableSession.history` lớn dần theo số ván; hàng đợi
không giới hạn và chưa có rate limit lệnh; WebSocket không có cookie phiên tạo khách mới mỗi lần nối.

## Ghi chú khi cài (B5)

- **Đồng hồ sau khởi động lại** (mục 4.5): người tới lượt giữ phần thời gian còn lại, tính từ
  `created_at` của `HandCommand` cuối (hoặc `Hand.created_at`), tối thiểu
  `RECOVERY_GRACE_SECONDS` = 10 giây (không quá `think_time_seconds`). Lý do: không ai được thêm giờ
  chỉ vì server sập, cũng không ai bị fold oan vì server sập lâu. `turn.deadline` gửi mốc tuyệt đối
  như thường.
- **Replay hỏng lúc khởi động** (mục 5.4): actor vẫn được dựng, ở trạng thái tạm dừng, không có ván
  trong bộ nhớ; kết nối mới nhận snapshot `room.status = "suspended"`, lệnh nhận `room_suspended`,
  không chia ván mới. Lỗi ghi log kèm `room_id`, `hand_id`.
- **Huỷ ván hỏng:** `manage.py void_hand <hand_id> --reason "..."` đánh dấu ván xong với
  `Hand.result = {"voided": true, "reason": ...}`. Chip chỉ ghi sổ khi ván xong, nên ván dở không có
  bút toán nào: huỷ ván là mọi người về đúng số dư trước ván. `HandCommand` giữ nguyên để điều tra.
  Server đang chạy vẫn giữ phòng tạm dừng trong bộ nhớ: **khởi động lại server** để phòng dựng lại
  từ DB. Màn lịch sử (B8) phải bỏ qua hoặc ghi rõ ván đã huỷ.
- **Heartbeat:** dùng ping/pong của chính WebSocket do Daphne gửi (mặc định: kết nối im 20 giây
  thì ping, 30 giây không có pong thì đóng). Trình duyệt tự trả pong, client không phải làm gì.
  Đóng kết nối thì actor phát `seat.updated` với `connected: false` như B4a. Không thêm message
  ping trong giao thức.
- **Chống trùng sit-out/sit-in vẫn chỉ trong bộ nhớ** (ws-protocol mục 5): sau khởi động lại, gửi
  lại nhận `already_sitting_out` / `not_sitting_out`, client coi là đã đúng trạng thái. Lưu bền thì
  phải thêm bảng chỉ để đổi một mã lỗi thành một ack, không đáng.
- **Một process ASGI** và cấu hình sau reverse proxy: [docs/deploy.md](../deploy.md).

## Ghi chú khi cài (B7–B8)

- **Thao tác chủ phòng đi qua hàng đợi** (`_Call`): cấp chip, đổi cấu hình, kick, đóng phòng. Nhờ
  vậy chúng xếp thứ tự cùng ván đang chạy: cấu hình đổi giữa ván để dành (`Room.pending_settings`)
  và áp ngay sau `hand.completed`; đóng giữa ván (`Room.closing`) cũng chờ ván xong. Cả hai lưu
  trong DB nên không mất khi khởi động lại. Phòng tạm dừng từ chối các thao tác này.
- **Người bị kick:** actor đọc `RoomBan` từ DB mỗi lần kết nối, vào ghế, chat. `_kick` ghi ban trước
  mọi thứ xếp hàng sau nó, nên lệnh ngồi ghế hay kết nối chen ngay sau vẫn bị chặn; xoá ban trong
  admin có hiệu lực ngay. Không ai kick được chủ phòng hay staff. Phòng tạm dừng vẫn kick được người
  không ngồi ghế.
- **Thông báo** (`chat.message`, `audience.updated`) do actor gửi nhưng không tăng `version`.
- **Mọi lỗi khi lưu ván xong** (không chỉ `HandPersistenceError`) đều fail-stop: sổ chip trong bộ
  nhớ đã đi trước DB. Khởi động lại thì khôi phục lưu lại ván; lưu vẫn hỏng thì phòng mở tạm dừng.

## Bỏ Redis (28/10/2026)

Mọi chỗ dùng channel layer đều nằm trong actor, tức trong đúng một process Daphne (điểm 1 ở trên),
nên Redis chỉ là đường chuyền tin nội bộ của process đó. Production giờ dùng
`InMemoryChannelLayer` (để trống `REDIS_URL`). Hai lý do, đều đo bằng bot chơi thử
([choi-thu-bang-bot.md](../choi-thu-bang-bot.md)) trên cùng bộ Docker production, 6 bot, 100 ván:

- **Redis làm rơi tin.** channels_redis dùng chung một hàng đợi cho mọi kết nối trong một process,
  và một kết nối bị huỷ đúng lúc nó đang nhận hộ có thể làm rơi tin của kết nối khác. Đo được 16 lần
  hụt `version` với Redis (733 lần ngắt kết nối), 0 lần với kênh trong bộ nhớ (818 lần ngắt).
  Client vẫn tự resync được, nhưng đó là việc thừa.
- **Hàng đợi chung 100 tin cho cả process.** Lúc đông người mà tin dồn dập thì đầy, và server cắt
  kết nối của người đang nhận (`ChannelFull`).

Nếu sau này chạy nhiều process thì phải xem lại toàn bộ ADR này (mỗi bàn một người ghi duy nhất),
không chỉ bật lại Redis. `config/settings.py` vẫn đọc `REDIS_URL` cho trường hợp đó.

## Phòng trống tự đóng (30/10/2026)

Không ai ngồi ghế liên tục `ROOM_IDLE_CLOSE_SECONDS` (5 phút; người xem không tính) thì phòng tự
đóng, y như chủ phòng đóng (`_finish_close`), và ghi `OwnerAction` kind `auto_close`, `user` rỗng.
Vẫn một người ghi duy nhất:

- **Actor đã nạp** tự hẹn giờ (`_IdleClose`, có epoch như hẹn chia bài): ghế cuối cùng trống thì ghi
  `Room.empty_since` và hẹn; có người ngồi thì xoá và huỷ. Hẹn giờ cũ bắn muộn không làm gì. Lúc
  actor mới khởi động (`_idle_at_start`) nó tính lại `empty_since` từ ghế trong DB và đóng ngay nếu
  đã quá giờ, trước mọi lệnh đang xếp hàng.
- **Task quét** (`sweep_idle_rooms`, mỗi 30 giây) trong chính process Daphne tìm phòng mở có
  `empty_since` đã quá giờ. Phòng có actor: hỏi actor (`close_if_idle()`, chờ tối đa 10 giây; actor
  treo hay đã chết thì ghi log và sang phòng khác). Phòng **chưa có actor** (tạo xong không ai mở,
  hay chưa ai đụng tới từ lúc khởi động lại): đóng thẳng trong DB, một transaction có điều kiện
  (còn mở, vẫn quá giờ, không ghế, không ván dở) kèm dòng `auto_close`, trong lúc giữ khoá của bảng
  actor nên `get_actor` không dựng actor cho phòng đó giữa chừng. Không có actor thì không có người
  ghi nào bị qua mặt. Không nạp actor cho nó: nạp là khôi phục cả phòng và giữ actor của một phòng
  đã đóng trong bộ nhớ tới hết đời process (sau deploy là mọi phòng trống cũ). Không có process thứ
  hai (cron, lệnh quản trị) đụng vào phòng: actor đang chạy sẽ không thấy thay đổi đó.
- **Task quét bắt đầu ở kết nối đầu tiên** (`config/asgi.py`, `StartIdleSweep`): Daphne không có
  sự kiện khởi động (lifespan), và vòng lặp asyncio chỉ chạy khi server đã phục vụ. Trước kết nối
  đầu tiên không ai thấy phòng nào; lobby cũng bỏ phòng đã quá giờ, nên không ai thấy phòng "lẽ ra
  đã đóng" trong vài giây trước khi lượt quét đầu xong.
- Phòng tạm dừng vì lỗi không tự đóng: chờ admin.

## Người ngồi mất kết nối thì đứng dậy (01/11/2026)

Người ngồi ghế mà không còn kết nối nào tới bàn liên tục `ROOM_AWAY_STAND_SECONDS` (5 phút) thì
đứng dậy y như tự bấm "Đứng dậy": giữa hai ván thì ngay, đang trong ván thì `leaving: true` và đứng
dậy khi ván xong (đồng hồ suy nghĩ đánh hộ họ tới lúc đó). Chip vẫn là của họ trong phòng (sổ cái
không đổi). Không có luật này thì phòng mọi người bỏ đi mà không bấm đứng dậy giữ ghế mãi và không
bao giờ tự đóng. Ghế trống hết thì phần "Phòng trống tự đóng" ở trên lo tiếp.

- **Actor đã nạp** hẹn giờ cho từng người (`_AwayStand`, có token như epoch): kết nối cuối cùng của
  người ngồi đóng (hay bị staff ngắt), ngồi xuống từ sảnh mà chưa mở bàn, hoặc actor vừa khởi động
  (chưa ai kết nối) thì hẹn; kết nối lại thì huỷ, và bỏ `leaving` mà server đặt cho họ (rời ghế do
  chính họ bấm thì giữ nguyên). Hẹn giờ cũ bắn muộn không làm gì.
- **Phòng chưa có actor** thì chẳng ai đang ở bàn (mọi kết nối đều nạp actor). Task quét
  (`sweep_away_seats`, trước phần đóng phòng) trả ghế của các phòng đó thẳng trong DB, dưới khoá
  bảng actor như đóng phòng, khi process đã phục vụ ít nhất 5 phút (`_serving_since`, từ kết nối
  đầu tiên); `empty_since` = lúc đó nên phòng tự đóng 5 phút sau nữa. Phòng còn ván dở thì để yên:
  chỉ actor mới chơi tiếp được ván đó.
- Ai là người server đặt `leaving` (`_away_leaving`) chỉ nằm trong bộ nhớ: khởi động lại giữa ván
  thì người đó kết nối lại vẫn rời ghế khi ván xong, như tự bấm rời; bấm "Ở lại" là giữ ghế.
