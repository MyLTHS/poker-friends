## Nghiêm trọng

- `apps/games/models.py:73-79`, `apps/games/tests/test_models.py:90-110` — **Ledger chưa thật sự append-only.** Override `save()`/`delete()` chỉ chặn thao tác trên instance; `QuerySet.update()`, `QuerySet.delete()`, bulk/raw SQL vẫn sửa hoặc xóa được. Test hiện tại chỉ thử `entry.save()` và `entry.delete()`. Kịch bản: maintenance code chạy `LedgerEntry.objects.filter(...).update(amount=...)`, lịch sử chip bị viết lại nhưng không có lỗi. Đề xuất: chặn `update/delete/bulk_update` bằng custom QuerySet và, vì đây là bất biến bắt buộc, thêm PostgreSQL trigger hoặc quyền DB từ chối `UPDATE/DELETE`; bổ sung test cho các đường bypass.

- `apps/games/engine/table.py:159-170`, `apps/games/models.py:63-71`, `apps/games/tests/test_models.py:47-78` — **Không có luồng ghi `Hand` và toàn bộ ledger trong một DB transaction.** `finish_hand()` chỉ ghi list trong RAM; toàn nhánh không có production code dùng `transaction.atomic()`. Các test tự tạo sẵn cặp `+50/-50`, nên chỉ chứng minh dữ liệu cân bằng thì tổng cân bằng, không chứng minh bất biến được bảo vệ. Kịch bản: process chết sau khi ghi credit cho người thắng nhưng trước debit người thua, hoặc sau khi đánh dấu Hand hoàn tất nhưng trước khi ghi đủ ledger, làm sinh chip/ván và sổ không nhất quán. Đề xuất: tạo persistence service ghi `Hand` kết quả và toàn bộ `HAND`/`SEVEN_DEUCE` entries bằng một `transaction.atomic()`, kiểm tổng delta bằng 0 trước commit, hỗ trợ retry idempotent; test ném exception giữa batch và xác nhận rollback hoàn toàn.

- `apps/games/models.py:82-113`, `apps/games/tests/test_models.py:133-146`, `apps/games/tests/test_hand.py:301-307` — **Dữ liệu DB chưa đủ bảo đảm replay cùng kết quả.** `Hand` không có kết quả đã lưu để đối chiếu như spec yêu cầu; `HandCommand` không có sequence/ordering xác định, và có thể bị xóa theo `Hand` do `CASCADE`. Test replay hiện chỉ replay `HandEngine.record()` trong RAM; test model chỉ kiểm `command_id` unique. Kịch bản: tải commands từ DB không `ORDER BY` có thể áp theo thứ tự khác; hoặc xóa Hand làm mất toàn bộ nguồn phục hồi. Đề xuất: thêm sequence tăng đơn điệu, unique `(hand, sequence)` và ordering rõ ràng; bảo vệ command log khỏi sửa/xóa; lưu expected result rồi test đầy đủ DB → commands có thứ tự → replay → kết quả trùng.

## Nên sửa

- `apps/games/engine/table.py:177-194`, `apps/games/tests/test_table.py:221-244` — **Thưởng 7-2 bảo toàn tổng chip về mặt số học nhưng có thể tạo stack âm.** Mỗi winner luôn nhận đúng tổng số bị trừ, nhưng code không kiểm số dư payer. Kịch bản: người sit-out vẫn ngồi bàn còn 10 chip, bonus 50; sau ván họ thành `-40`, trong khi `grant_chips()` ở dòng 80-81 lại coi số dư âm là bất hợp lệ. Test chỉ dùng payer có 100 chip. Đề xuất: chốt quy tắc thiếu chip—ví dụ giới hạn khoản trả theo stack hiện có và winner chỉ nhận tổng thực trả—rồi test payer có 0 chip, ít hơn bonus, sit-out và nhiều payer; vẫn phải assert tổng chip trước/sau bằng nhau.

- `apps/games/engine/hand.py:165-175`, `apps/games/engine/table.py:177-194`, `apps/games/tests/test_hand.py:315-340` — **Dùng `net > 0` để nhận diện winner làm sai trường hợp chia pot.** Net dương không đồng nghĩa với thắng/tie một pot. Kịch bản cụ thể: showdown hòa, hai người nhận lại đúng phần đã cược nên `net == 0`; người cầm 7-2 là đồng winner nhưng bị loại ở dòng 168 và không được thưởng. Với nhiều winner, code hiện còn khiến các winner trả chéo cho nhau và người còn lại trả một lần cho mỗi winner; hành vi này chưa có test xác nhận. Đề xuất: xác định winner từ pot awards/showdown của PokerKit thay vì net; thêm test board-tie, odd chip, side pot và hai người cầm 7-2 cùng thắng, đồng thời assert replay cho cùng danh sách winner.

- `apps/games/models.py:27-33,40-50,63-70,82-113` — **Thiếu các ràng buộc dữ liệu quan trọng.** Unique cho ghế/user, hand number và command ID đã có, nhưng chưa chặn ghế `0` hoặc ngoài giới hạn phòng, `max_seats > 9`, blind bằng `0`/`small_blind >= big_blind`, ledger amount `0`, hay `HAND`/`SEVEN_DEUCE` không gắn với một Hand hợp lệ. `hand_no` chỉ là số nên có thể trỏ tới ván không tồn tại hoặc thuộc phòng khác; `choices` cũng không phải DB check constraint. Đề xuất: thêm `CheckConstraint` cho các miền giá trị có thể kiểm tại DB; dùng nullable FK từ ledger tới `Hand` và constraint `kind`–`hand`; kiểm `seat <= room.max_seats` trong service; thêm negative tests cho từng ràng buộc và trường hợp hand khác phòng.

## Góp ý nhỏ

- `apps/games/engine/table.py:17-20`, `apps/games/models.py:53-56` — `LedgerKind` được định nghĩa hai lần. Hiện chúng khớp nhau, nhưng lần thêm kind tiếp theo có thể chỉ sửa một bên. Đề xuất giữ tách lớp engine/ORM nhưng thêm mapping/test bắt buộc hai tập giá trị đồng bộ.

**Kết luận: chưa nên gộp.**
## Claude xử lý (27/10/2026)

Sửa trên nhánh tách từ `claude/b2-data-models`, mỗi mục một commit, test viết trước và đã thấy đỏ.

| Phát hiện | Trạng thái | Cách sửa |
|---|---|---|
| Ledger chưa thật sự append-only | **Đã sửa** (`31b1873`) | `LedgerEntryQuerySet` chặn `update()`, `delete()`, `bulk_update()`; migration `0003` thêm trigger PostgreSQL từ chối mọi `UPDATE`/`DELETE` trên `games_ledgerentry` (kể cả SQL thô và `_base_manager`). Có test cho từng đường. |
| Không ghi `Hand` + ledger trong một transaction | **Đã sửa** (`38c15b1`) | `apps/games/services.py` → `save_completed_hand()`: một `transaction.atomic()` lưu `Hand` (kết quả, `completed_at`) và mọi dòng `hand`/`seven_deuce`; kiểm tổng bằng 0, dòng đúng ván, dòng `hand` khớp kết quả engine; gọi lại cùng ván không ghi thêm. Test: lỗi giữa lúc ghi → không còn dòng nào của ván. Engine vẫn không import Django. |
| DB chưa đủ bảo đảm replay | **Đã sửa** (`6675e38`) | `HandCommand.sequence` + unique `(hand, sequence)` + `ordering`; `HandCommand.hand` đổi `CASCADE` → `PROTECT`; `Hand.result` lưu `HandResult` lúc ván xong (ràng buộc: có `completed_at` thì có `result`); `Hand.replay_record()`. Test: lưu log ngược thứ tự → đọc từ DB → `replay()` → kết quả trùng `Hand.result`. |
| Thiếu ràng buộc dữ liệu | **Đã sửa** (`2803537`) | `CheckConstraint`: `max_seats` 2..9, `small_blind` > 0 và < `big_blind`, ghế 1..9, ledger `amount` ≠ 0, `hand`/`seven_deuce` phải có `hand` còn `grant` thì không. `LedgerEntry.hand_no` thay bằng FK nullable tới `Hand`, thêm FK ghép `(room, hand)` trên PostgreSQL để hand luôn cùng phòng. Ghế vượt `max_seats` của phòng chặn ở `RoomSeat.save()`. |
| `LedgerKind` định nghĩa hai lần | **Đã sửa** (`775a269`) | Giữ tách lớp; thêm test buộc hai tập giá trị trùng nhau (đã thử thêm kind một bên → test đỏ). |
| Thưởng 7-2 có thể làm stack âm | **Chờ Lym quyết** | Là luật chơi: người trả thiếu chip thì trả bao nhiêu, người thắng nhận bao nhiêu. Chưa sửa code. |
| Nhận diện winner 7-2 bằng `net > 0` sai khi chia pot | **Chờ Lym quyết** | Hòa/chia pot, hai người cùng cầm 7-2: ai được thưởng, ai trả ai. Chưa sửa code. |

Còn để ngỏ (chưa làm trong lượt này):

- Ghế vượt `max_seats` chỉ chặn ở `save()`: `bulk_create` hoặc giảm `max_seats` của phòng đang có người ngồi ghế cao vẫn lọt. Muốn chặn ở DB thì cần trigger.
- `HandCommand` chưa append-only như ledger (chỉ chặn xóa theo `Hand`).
- Trigger chặn `UPDATE`/`DELETE` nhưng không chặn `TRUNCATE` (để test kiểu `transaction=True` vẫn dọn được DB).
- `max_seats` tối thiểu 2 là suy từ spec ("tối đa 9, hỗ trợ heads-up"); Lym xác nhận lại.
- Migration `0004`/`0005` giả định chưa có dữ liệu thật: DB dev đã có dòng ledger `hand` cũ (dùng `hand_no`) hoặc `Hand` đã xong mà chưa có `result` sẽ không qua được ràng buộc mới.
- Bài tập "tổng ledger một phòng bằng tổng chip đã cấp" để Lym tự viết.
