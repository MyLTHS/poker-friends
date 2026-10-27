# Codex review B3 — Hợp đồng API (27/10/2026)

Review chỉ đọc của Codex trên nhánh `claude/b3-api-contract-7ec657`, trước các commit sửa ở mục "Claude xử lý".

## Nghiêm trọng

1. [docs/api/schema/common.schema.json:95](../../docs/api/schema/common.schema.json:95) — Schema không thực thi quy tắc projection. `HandPlayer.cards` cho phép tối đa hai lá thật với mọi người chơi, không ràng buộc spectator chỉ thấy `"??"`, người xem chỉ thấy bài mình, hay người fold phải có `[]`.

   - Kịch bản: đổi snapshot spectator để hai đối thủ có `["As","Ah"]` và `["Ks","Kh"]`; `contract.errors(message, "server")` vẫn trả `[]`. Vì vậy `_send()` tại `mockserver/table.py:441` cũng coi message lộ bài là hợp lệ.
   - Các fixture hợp lệ và đường phát hiện tại của mock dùng `view_for()` đúng, chưa thấy chúng thực sự lộ bài; lỗ hổng nằm ở lớp kiểm hợp đồng/CI.
   - Đề xuất: thêm validator ngữ nghĩa nhận cả `viewer_id` và message, cộng test projection cho mọi loại chứa `HandView`, mọi người chơi và spectator; kiểm rõ không có `deck`/burn/undealt card. Không nên coi JSON Schema đơn thuần là chốt bảo mật.

2. [docs/adr/ADR-001-table-actor.md:43](../../docs/adr/ADR-001-table-actor.md:43), [docs/adr/ADR-001-table-actor.md:69](../../docs/adr/ADR-001-table-actor.md:69) — Khôi phục bỏ sót cửa sổ final action đã ghi nhưng kết quả/ledger chưa được settle.

   - Kịch bản: final `HandCommand` được commit, `engine.act()` làm ván complete, process chết trước `save_completed_hand()`. Khi restart, replay tạo engine complete nhưng quy trình khôi phục chỉ nạp engine, command IDs, timer và snapshot; không có bước chạy settlement. `Hand` có thể mãi chưa `completed_at`, ledger chưa nhận kết quả và bàn bị kẹt.
   - Đề xuất: sau replay, nếu engine complete thì bắt buộc tái tạo ledger entries và gọi `save_completed_hand()` idempotently trước khi nhận kết nối/lệnh mới; thêm test kill đúng cửa sổ này và xác minh ledger chỉ ghi một lần.

## Nên sửa

3. [docs/api/ws-protocol.md:76](../../docs/api/ws-protocol.md:76), [docs/adr/ADR-001-table-actor.md:115](../../docs/adr/ADR-001-table-actor.md:115), [apps/games/models.py:188](../../apps/games/models.py:188) — Semantics của `result_version` sau restart tự mâu thuẫn.

   - Kịch bản: protocol hứa retry nhận đúng `result_version` lần đầu, nhưng version chỉ ở RAM và `HandCommand` không lưu nó. ADR lại nói sau restart trả version hiện tại, có thể trỏ tới sự kiện hoàn toàn khác.
   - Đề xuất: hoặc persist room version/result version, hoặc thêm stream epoch; phương án đơn giản hơn là cho `result_version: null` đối với duplicate sau restart và bắt client dùng snapshot. Không trả một version hiện tại không liên quan.

4. [mockserver/table.py:85](../../mockserver/table.py:85), [mockserver/table.py:149](../../mockserver/table.py:149), [docs/api/ws-protocol.md:80](../../docs/api/ws-protocol.md:80) — Phạm vi idempotency của mock không khớp hợp đồng/model.

   - Kịch bản: `_applied` dùng duy nhất `command_id` và không reset qua ván. Cùng ID ở ván kế tiếp hợp lệ theo unique `(hand, command_id)` sẽ bị mock trả `command_id_reused`. Ngược lại sit-in/out chỉ nhớ trong RAM; restart rồi retry không còn phân biệt được retry y nguyên với tái sử dụng ID cho nội dung khác.
   - Đề xuất: key action bằng `(hand_id, command_id)`; với sit-in/out, hoặc thêm kho lệnh bền theo phòng, hoặc sửa hợp đồng để công khai rằng chúng không có idempotency bền qua restart.

5. [docs/spec.md:107](../../docs/spec.md:107), [docs/api/ws-protocol.md:72](../../docs/api/ws-protocol.md:72) — Tài liệu nguồn nói mọi `command_id` trùng bị reject, trong khi protocol mới yêu cầu retry giống hệt được ACK duplicate.

   - Kịch bản: implementer B4 bám `spec.md` sẽ trả `command.rejected` cho retry hợp lệ khi mạng chập.
   - Đề xuất: sửa spec thành “`command_id` trùng với nội dung khác” và ghi rõ retry y nguyên trả ACK của lần áp dụng trước.

6. [docs/adr/ADR-001-table-actor.md:108](../../docs/adr/ADR-001-table-actor.md:108), [apps/games/engine/hand.py:223](../../apps/games/engine/hand.py:223) — Lỗi sau khi ghi `HandCommand` tạo “poison command” nhưng protocol chưa định nghĩa kết quả.

   - Kịch bản: `act()` thay đổi PokerKit rồi ném `RuntimeError` ở chốt bảo toàn chip. Command đã commit; replay tiếp tục gặp lỗi. Trong khi `internal_error` tại `ws-protocol.md:119` lại cam kết lệnh chưa áp và retry an toàn.
   - Đề xuất: dùng chung đúng một hàm validate/check như ADR dự kiến; quy định rõ lỗi sau WAL là trạng thái fail-stop/unknown, không trả `internal_error` với nghĩa “chưa áp”; thêm test replay failure và quy trình quarantine/khôi phục phòng.

7. [docs/api/openapi.yaml:179](../../docs/api/openapi.yaml:179), [web/scripts/gen-api-types.mjs:51](../../web/scripts/gen-api-types.mjs:51), [web/src/api/rest.ts:117](../../web/src/api/rest.ts:117) — Type REST sinh ra hẹp hơn OpenAPI.

   - Kịch bản: OpenAPI cho phép `CreateRoomRequest` tối thiểu chỉ có `name`, `small_blind`, `big_blind`; nhưng TS bắt buộc thêm `max_seats`, `think_time_seconds`, `seven_deuce_bonus` vì generator mặc định `defaultNonNullable: true`.
   - Đề xuất: gọi `openapiTS` với `defaultNonNullable: false` và thêm type-test cho request tối thiểu. CI hiện vẫn xanh vì nó chỉ so output với chính cấu hình generator.

8. [docs/api/schema/common.schema.json:258](../../docs/api/schema/common.schema.json:258) — `AppliedAction` không ràng buộc `kind` với `amount`.

   - Kịch bản: `{"kind":"call","amount":30}` hoặc `{"kind":"raise","amount":null}` vẫn có thể lọt tùy kiểu; trường hợp call-with-amount đã được xác nhận là hợp schema.
   - Đề xuất: chuyển thành discriminated union giống `command.act`; thêm fixture invalid cho call-with-amount và raise-with-null.

9. [docs/api/schema/messages/action.applied.schema.json:16](../../docs/api/schema/messages/action.applied.schema.json:16) — Các sự kiện chắc chắn thuộc một ván vẫn cho phép `hand_id: null`.

   - Kịch bản: `hand.started`, `action.applied`, `turn.deadline` và `hand.completed` với `hand_id:null` đều hợp schema, dù payload chứa state của một ván. Client không thể định danh/chặn sự kiện ván cũ.
   - Đề xuất: bốn schema này dùng `HandId`, chỉ snapshot/reply giữa hai ván mới dùng `HandIdOrNull`; thêm fixture hồi quy.

10. [docs/api/schema/common.schema.json:278](../../docs/api/schema/common.schema.json:278), [apps/games/contract.py:109](../../apps/games/contract.py:109) — Contract validation không kiểm bất biến chip của `hand.completed`.

   - Kịch bản: tăng tùy ý `hand_net` trong fixture showdown; message vẫn qua validator dù tổng chip bị sinh thêm.
   - Đề xuất: thêm kiểm ngữ nghĩa cho `hand.completed`: tổng `hand_net = 0`, tổng `seven_deuce_net = 0`, `seven_deuce.total` bằng tổng payments và stack khớp settlement; B4 cần integration test từ engine tới serialized message.

## Góp ý nhỏ

- CI thực sự bắt generated file bị cũ: `gen-api-types --check` và `tsc` đều chạy xanh. Tuy nhiên nó chỉ chứng minh output khớp generator, không chứng minh TypeScript và JSON Schema có cùng semantics—finding về REST defaults là ví dụ cụ thể.
- Kiểm tra read-only chạy được 119 test contract/mock-table. Hai test socket không chạy vì sandbox cấm bind localhost, không phải failure của code.

**Kết luận: chưa nên gộp.**

## Claude xử lý (27/10/2026)

Sửa trên cùng nhánh, test viết trước và đã thấy đỏ, mỗi điểm hoặc nhóm điểm một commit.

| Điểm | Trạng thái | Cách sửa |
|---|---|---|
| 1. Schema không thực thi projection | **Đã sửa** (`4254770`) | `apps/games/contract.py`: `semantic_errors(message, viewer)` / `validate_outgoing(message, viewer)` biết người nhận. Chặn: bài tẩy người khác lộ khi ván chạy, người nhận không thấy bài mình, người fold còn bài, bài lật nửa vời, lá trùng, `legal_actions` tới người không tới lượt, khoá `deck`/`burn`, `hand_id` phong bì lệch ván, snapshot gửi nhầm người. Mock server chạy nó trong `_send()` cho mọi message. 11 fixture `fixtures/server/leaks/` đúng schema nhưng phải bị chặn (người nhận trong `viewers.json`); property test 300 ván ngẫu nhiên có all-in, kiểm góc nhìn mọi người + người xem sau mỗi hành động. `ws-protocol.md` mục 7 ghi rõ: JSON Schema không phải lớp bảo mật; lớp chặn là `view_for` + kiểm ngữ nghĩa. |
| 2. Khôi phục bỏ sót ván xong mà chưa settle | **Đã sửa trong ADR** (`47959b2`) | ADR-001 mục 4 bước 3: replay ra ván `is_complete` mà `completed_at` trống thì dựng lại bút toán bằng cùng hàm với lúc kết thúc ván bình thường và gọi `save_completed_hand()` (idempotent) trước khi nhận kết nối/lệnh. Thêm test B4 phải có (chết đúng cửa sổ này, ledger đúng một lần, chạy khôi phục hai lần không ghi thêm). Cài ở B4. |
| 3. `result_version` sau restart mâu thuẫn | **Đã sửa** (`a2b03ea`) | Chọn phương án đơn giản: ack trùng sau khởi động lại có `result_version: null`, client dựa vào snapshot. `command.ack` thành union: `duplicate: false` luôn có số, `duplicate: true` có thể `null`. Sửa giao thức, ADR; fixture hợp lệ `command.ack.duplicate-after-restart`, fixture sai `command.ack.fresh-without-result-version`. |
| 4. Phạm vi idempotency của mock | **Đã sửa** (`fd75a08`) | Mock khoá `command.act` theo `(hand_id, command_id)` như unique `(hand, command_id)` của DB; test cùng id ở ván sau được áp như lệnh mới. Hợp đồng ghi rõ sit-out/sit-in chỉ chống trùng trong bộ nhớ, không bền qua khởi động lại (gửi lại sau restart nhận `already_sitting_out`/`not_sitting_out`, client coi là đã đúng trạng thái); B5 xem lại. |
| 5. `spec.md` nói mọi `command_id` trùng bị từ chối | **Đã sửa** (`47959b2`) | Chỉ từ chối khi trùng mà nội dung khác; gửi lại y nguyên thì trả ack của lần đầu (`duplicate: true`). |
| 6. Lỗi sau khi ghi `HandCommand` | **Đã sửa** (`a2b03ea`) | Fail-stop: không ack/rejected cho lệnh đó, phát sự kiện mới `room.suspended` (`reason: recovery_needed`), lệnh sau bị từ chối mã mới `room_suspended`, `RoomInfo.status` thêm `suspended`; khôi phục xong thì đóng mọi kết nối của phòng. `internal_error` chỉ còn cho lỗi **trước** khi ghi. ADR-001 mục 5 mới; replay hỏng cùng chỗ thì phòng giữ tạm dừng chờ người quản trị (quy trình chốt ở B5), không bao giờ tự xoá `HandCommand`. `HandEngine.check()` dùng chung với `act()` vẫn là việc của B4 (lượt này không sửa engine). |
| 7. Type REST hẹp hơn OpenAPI | **Đã sửa** (`044fb80`) | `openapiTS(..., {defaultNonNullable: false})`; `web/typetests/rest-requests.ts` kiểm body tạo phòng tối thiểu gán được và thiếu `big_blind` thì lỗi; `api:check` biên dịch cả typetests. |
| 8. `AppliedAction` không ràng buộc kind–amount | **Đã sửa** (`fb68f21`) | Union giống `command.act`; fixture sai `action.applied.call-with-amount`, `action.applied.raise-amount-null`. |
| 9. Sự kiện của ván cho phép `hand_id: null` | **Đã sửa** (`fb68f21`) | `hand.started`, `action.applied`, `turn.deadline`, `hand.completed` dùng `HandId`; 4 fixture sai `*.null-hand-id`. Kiểm ngữ nghĩa còn bắt `hand_id` phong bì phải bằng `payload.hand.hand_id`. |
| 10. Không kiểm bất biến chip của `hand.completed` | **Đã sửa** (`4254770`) | Kiểm ngữ nghĩa: tổng `hand_net` = 0, tổng `seven_deuce_net` = 0, `seven_deuce.total` = tổng `payments`, không ai trả quá `bonus`, `seven_deuce_net` từng người khớp `payments`, `results[].stack − seven_deuce_net` = stack cuối ván, 2 lá 7-2 được lật đúng trong `hand`. Integration test từ engine tới message của actor thật: B4. |

Góp ý nhỏ (CI chỉ chứng minh output khớp generator): điểm 7 thêm type-test cho request; kiểm tra
fixture hợp lệ khớp type (`check-fixture-types.mjs`) đã có từ trước.

Ghi chú: trang thử HTML đã được gỡ ở `eed8b5c` (trước lượt sửa này) theo quyết định của Lym; lượt này
không đụng tới phần trang.
