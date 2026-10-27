# Review B5 + B7 — Claude chỉ đọc, 27/10/2026

Một Claude riêng, chỉ đọc, review `70ee559..89d1dcf` (thống nhất danh tính B4a/B6, B5, hợp đồng
và code B7, trang thử B7) mà không xem kết luận của người viết. Mục "đã xác nhận" là reviewer chạy
test tạm trên bản xuất của commit `89d1dcf`. Test hồi quy cho từng điểm:
`apps/games/tests/test_hardening.py`.

| # | Mức | Nhận xét | Xử lý |
|---|---|---|---|
| 1 | Cao | Kick thua cuộc đua: lệnh ngồi ghế / kết nối của người bị kick xếp hàng ngay sau lệnh kick vẫn được nhận, người đó tiếp tục ngồi và nhận mọi sự kiện (đã xác nhận) | Actor giữ tập `banned` (nạp từ `RoomBan` khi khôi phục), kiểm trong `_on_connect` (đóng 4403) và `_on_take_seat` (`kicked`) |
| 2 | Cao | Tên phòng toàn dấu cách qua được kiểm tra, lưu thành chuỗi rỗng, mọi message mang `RoomInfo` hỏng, snapshot 500 (đã xác nhận) | Cắt khoảng trắng trước khi kiểm độ dài |
| 3 | Trung bình | Cấu hình chờ ván sau và lệnh đóng phòng giữa ván chỉ nằm trong bộ nhớ, mất khi khởi động lại (đã xác nhận) | `Room.pending_settings`, `Room.closing` (migration 0011); khôi phục giữa ván thì giữ tới cuối ván, giữa hai ván thì áp ngay |
| 4 | Trung bình | Mã đóng 4403/4404 gửi lúc bắt tay thì trình duyệt chỉ thấy 1006 và thử lại mãi | Nhận bắt tay rồi mới đóng; client (`useTableSocket`, `useRoomLive`) ngừng thử lại với 4403/4404 |
| 5 | Trung bình | Khách tạo tự động khi mở bàn không bị giới hạn 20 khách/giờ mỗi IP, phá luôn giới hạn tạo phòng theo người (đã xác nhận) | Áp `GUESTS_PER_IP` cho REST (429) và WebSocket (đóng 4429) |
| 6 | Trung bình | Khởi động lại khi ván xong mà lưu hỏng thì phòng lỗi 500 mãi thay vì tạm dừng | Bắt lỗi lưu lúc khôi phục, mở phòng ở trạng thái tạm dừng |
| 7 | Trung bình | Lỗi DB giữa chừng khi áp cấu hình / đóng phòng làm bộ nhớ lệch DB, và làm bàn không chia ván tiếp | Lưu trước rồi mới đổi bộ nhớ (lỗi thì trả lại); bước "giữa hai ván" luôn hẹn ván sau dù áp cấu hình lỗi |
| 8 | Trung bình | Phòng tạm dừng vẫn nhận cấp chip, kick, đổi cấu hình, vào/rời ghế; `void_hand` huỷ được cả ván còn replay được | Phòng tạm dừng từ chối các thao tác này (`room_suspended`, thêm vào ApiError); `void_hand` từ chối ván replay được trừ khi `--force` (chỉ dùng khi server đã tắt) |
| 9 | Thấp | Lệch hợp đồng: thiếu 403 `kicked` ở getRoom/snapshot/leaveSeat; endpoint POST nhận PATCH; `player_id` nhận "007" và chữ số không phải ASCII; mô tả thời điểm `room.updated`; lobby báo "open" cho phòng có ván dở | Sửa cả năm (thêm 403/429 vào openapi, chỉ nhận đúng method, kiểm `player_id` theo pattern, sửa câu chữ, lobby báo "playing") |
| 10 | Thấp | Rate limit WebSocket bỏ sót `resync.request` và message sai | Mọi message đều tính vào 20/10 giây (chat còn giới hạn riêng 5/10 giây) |
| — | Ghi chú (có từ trước) | Lỗi DB không phải `HandPersistenceError` khi lưu ván xong làm sổ chip trong bộ nhớ đi trước DB mà phòng vẫn chơi; WebSocket không kiểm Origin | Mọi lỗi khi lưu ván đều fail-stop; thêm `AllowedHostsOriginValidator` |

Reviewer cũng kiểm và thấy ổn: cấp chip (ghi bộ nhớ rồi DB, lỗi thì trả lại; xếp hàng cùng ván),
cấu hình giữa ván không đổi blind ván đang chạy, lỗi trong `_Call` không giết actor, công thức đồng
hồ khi khôi phục, đường replay hỏng → tạm dừng → `void_hand` → khởi động lại, `invite_token` chỉ
chủ phòng thấy, lọc lobby, khách vãng lai bị từ chối ở phòng private trước khi tạo khách.
