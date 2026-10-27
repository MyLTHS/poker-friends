# Review B6 (Tài khoản) — Claude chỉ đọc, 27/10/2026

Một Claude riêng, chỉ đọc, review diff `e6c8a4e..4459a4b` của nhánh `claude/b6-accounts-c0e0c7`
(không được xem kết luận của người viết code). Claude viết code xử lý từng điểm như dưới.
Các điểm "đã xác nhận" là reviewer chạy thử bằng test tạm, giả lập hai lần gọi tới Google.

| # | Mức | Nhận xét | Xử lý |
|---|---|---|---|
| 1 | Cao | Google trả email **chưa xác minh** vẫn được tin: kẻ xấu tạo trước tài khoản bằng email của bạn mình, sau đó chiếm tài khoản khi người bạn đặt lại mật khẩu (đã xác nhận) | Chỉ nhận email Google đánh dấu đã xác minh, cả khi đăng nhập lẫn nâng cấp; bỏ đường dự phòng đọc `extra_data`. Lỗi `?error=email_not_verified`. Có test |
| 2 | Trung bình | Người dùng Google bị admin khoá mà đăng nhập thì lỗi 500, vì allauth tìm trang `account_inactive` không tồn tại (đã xác nhận) | `respond_user_inactive` chuyển về `?error=account_inactive`; thêm lưới an toàn: mọi `NoReverseMatch` trong luồng Google thành `google_failed`. Có test |
| 3 | Trung bình | Rate limit có thể khoá nhầm người: sau proxy mọi người chung một IP; ai cũng khoá được bạn mình 15 phút bằng 5 lần đoán sai | `TRUSTED_PROXIES` đọc IP thật từ `X-Forwarded-For` (chỉ lấy địa chỉ do proxy của mình ghi). Lần sai tính theo (email, IP) 5/15 phút, thêm giới hạn rộng 30/giờ cho một email từ mọi IP. Có test |
| 4 | Trung bình thấp | Server mail lỗi thì đăng ký trả 500 dù tài khoản đã tạo; thử lại bị `email_taken` (đã xác nhận) | Lỗi gửi mail chỉ ghi log (không ghi link vì có token), request vẫn thành công; người dùng bấm "gửi lại link". Có test cho đăng ký và nâng cấp |
| 5 | Thấp trung bình | Nâng cấp bằng Google có thể dừng nửa chừng: Google đã gắn mà khách vẫn là khách | Callback Google chạy trong một transaction; bước nâng cấp kiểm lại dưới khoá dòng, lỗi thì huỷ luôn liên kết Google và về `?error=<mã>`. Có test |
| 6 | Thấp | GET `/accounts/google/login/` hiện trang HTML của allauth; `process=redirect` dẫn về trang 404 | GET chỉ quay về `/account`; `process` ngoài login/connect thì `google_failed`. Có test |
| 7 | Thấp | Thời gian trả lời của quên mật khẩu / gửi lại link để lộ email nào có tài khoản | Ghi rõ trong `openapi.yaml`: `signup` vốn đã trả `email_taken` nên đây không phải lớp chống dò email; chấp nhận cho nhóm bạn |
| 8 | Thấp | Code lệch `openapi.yaml`: thiếu mã lỗi Google, thiếu 403 CSRF ở các POST, 405/415 trả `{"detail"}`, mô tả sai "đăng xuất đổi csrftoken" | Thêm schema `GoogleError` (có test so với code), 403 cho mọi POST, mã `method_not_allowed`, 415 thành `validation_error`, sửa mô tả. Trang web có câu riêng cho từng mã Google |
| 9 | Thấp | Tranh tên khi nâng cấp gây 500 | Bắt `IntegrityError` thành `username_taken`, không đổi gì. Có test |
| 10 | Thấp | Hai người đăng ký cùng email cùng lúc có thể tạo hai tài khoản | Khoá theo email (`pg_advisory_xact_lock`) trong transaction khi kiểm và lưu (đăng ký, nâng cấp, Google). Chỉ có trên PostgreSQL; chưa có test chạy song song thật, CI (Postgres) chạy qua đường code này |

Reviewer cũng kiểm và thấy ổn: CSRF ở mọi POST (kể cả khi chưa đăng nhập), session fixation,
token xác minh và token đặt lại mật khẩu không thay được cho nhau, chặn open redirect, nâng cấp
khách giữ nguyên id và ledger, đọc lại CSRF cookie ở web sau khi đăng nhập.
