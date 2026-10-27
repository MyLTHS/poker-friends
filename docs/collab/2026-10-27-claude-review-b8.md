# Review B8 (Xã hội và quản trị) — Claude chỉ đọc, 27/10/2026

Một Claude riêng, chỉ đọc, review `89d1dcf..0768abc` (hợp đồng B8, code B8, trang thử B8, và đợt sửa
review B5/B7) trên bản xuất của commit, không xem kết luận của người viết. Sáu điểm được xác nhận
bằng test tạm. Test hồi quy: `apps/games/tests/test_review_b8.py`.

| # | Mức | Nhận xét | Xử lý |
|---|---|---|---|
| 1 | Cao | Client gửi `command_id` trùng tên lệnh hết giờ của server (`timeout-<ván>-<n>`) làm đồng hồ ngừng hẳn, bàn treo; replay còn đánh dấu lệnh giả là "hết giờ" (đã xác nhận) | Sửa ở PR #10 (B4a): tên `timeout:<ván>-<n>` (client không gửi được dấu `:`), ghi lỗi thì hẹn lại; replay chỉ coi tiền tố `timeout:` là hết giờ |
| 2 | Cao | Staff kick được chủ phòng, chủ phòng mất quyền vào phòng mình (đã xác nhận) | Không ai kick được chủ phòng, cũng không kick được staff |
| 3 | Trung bình | Xoá ban trong admin không có hiệu lực tới khi khởi động lại vì actor giữ tập `banned` trong bộ nhớ (đã xác nhận) | Actor đọc `RoomBan` từ DB mỗi lần kết nối/vào ghế/chat; vẫn không thua cuộc đua vì `_kick` ghi ban trước mọi thứ xếp hàng sau nó |
| 4 | Trung bình | Đóng phòng đang tạm dừng trả 500 HTML (đã xác nhận) | Trả 409 `room_suspended` |
| 5 | Trung bình | Danh sách ván thiếu người sit-out trả thưởng 7-2, tổng ván ≠ 0 (đã xác nhận) | Thêm mọi người có bút toán trong ván; người không được chia bài có `seat: null` (sửa `openapi.yaml`) |
| 6 | Trung bình | Trang phòng mở WebSocket trước khi có cookie phiên nên tạo khách thừa, tách danh tính chat/ghế, tiêu hạn mức 20 khách/giờ | Chỉ mở WebSocket sau lần tải REST đầu tiên; ngừng thử lại với 4429 |
| 7 | Thấp | Phòng tạm dừng vẫn chat được nhưng không kick được người xem; chat gửi ngay trước lúc bị kick vẫn được lưu | Phòng tạm dừng vẫn kick được người không ngồi ghế; chat của người không còn kết nối hoặc đã bị ban bị bỏ |
| 8 | Thấp | Replay không nêu người thắng 7-2 khi không ai còn chip để trả | Tính theo luật (`seven_deuce_bluff_winner`) thay vì theo bút toán |
| 9 | Thấp | Kiểm Origin chưa có test; mở bản dev từ địa chỉ LAN bị từ chối không báo | Test qua `config.asgi.application` (PR #10); ghi chú thêm địa chỉ LAN vào `DJANGO_ALLOWED_HOSTS` |
| 10 | Thấp | Admin xoá được user, kéo theo xoá ghế/ban/thành viên sau lưng actor | Admin không xoá user (bỏ "active" để khoá) |

Thêm test còn thiếu: replay một ván đi tới showdown (bài chỉ hiện ở bước cuối).

Reviewer cũng kiểm và thấy ổn: replay qua `view_for` + `hand_view_errors` ở mọi bước, khớp
`hand.completed` lúc chơi; lật 7-2 chỉ ở bước cuối; ván đang chơi không có trong danh sách, ván huỷ
không replay được; phân quyền phòng private/kick; số học bảng lời/lỗ; thông báo không tăng
`version`; chat qua React không `dangerouslySetInnerHTML`; nhật ký append-only; các sửa của
`0768abc` (lưu thay đổi chờ ván sau, mã đóng sau khi nhận bắt tay, mở phòng tạm dừng khi lưu lỗi).
