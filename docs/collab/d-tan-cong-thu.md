# D sớm — tấn công thử và làm cứng backend

Ngày 28/10/2026. Nhánh `claude/d-hardening`. Người làm: Claude (CLI), do phiên trưởng nhóm giao.

Câu hỏi của mục D trong lộ trình: **"Nếu bạn là người gian lận, bạn sẽ thử những gì?"** Mỗi cách
thử dưới đây là một test tự động trong `apps/games/tests/test_attacks.py`, để sau này ai sửa code
mà vô tình mở lại lỗ thì test đỏ ngay. Cách thử nào lọt thì sửa code, và test đó đã được thấy
**đỏ trước khi sửa, xanh sau khi sửa**.

## 1. Kết quả các lần thử

| # | Thử gì | Kết quả |
|---|---|---|
| 1 | Xem lại ván (replay) để nhìn bài tẩy của người khác — với tư cách người chơi, người xem, người lạ chưa đăng nhập | Chặn được: mỗi người chỉ thấy bài mình, ở mọi bước |
| 2 | Tìm bài hay bộ bài trong danh sách ván và bảng tổng kết | Chặn được: hai trang này không có bài |
| 3 | Replay một ván **đang chơi** để xem trước | Chặn được: 404 |
| 4 | Người đã fold xin lại trạng thái bàn (WebSocket và REST) để xem bài người còn trong ván | Chặn được |
| 5 | Đứng dậy khỏi ghế rồi xem ván tiếp theo như người xem | Chặn được: chỉ thấy `??` |
| 6 | Người ngoài đọc replay, lịch sử ván, tổng kết, chat, trạng thái của **phòng private** | Chặn được: 404 |
| 7 | Gửi lệnh mà ghi `player_id` (hoặc `seat`) của người khác vào message | Chặn được: `invalid_command`, không ghi gì |
| 8 | Gửi lệnh vào phòng mình nhưng ghi `room_id` của phòng khác | Chặn được |
| 9 | Gửi lệnh vào phòng mình với `hand_id` của ván đang chạy ở phòng khác | Chặn được: `stale_hand` |
| 10 | Gửi lại `hand_id` + `command_id` **của người khác** (kể cả ở phòng khác) | **Lọt** (xem mục 2) — đã sửa |
| 11 | Dùng quyền chủ phòng ở phòng của người khác: cấp chip cho mình, kick, đóng phòng, đổi link mời, đổi luật 7-2 | Chặn được: 403, phòng không đổi |
| 12 | Người ngoài vào ghế / cấp chip / kick trong phòng private | Chặn được: 404 |
| 13 | "Rời ghế" khi mình không ngồi, mong làm người đang ngồi bị đứng dậy | Chặn được: 409 |
| 14 | Bấm đúp: hai tab cùng gửi một lệnh (cùng `command_id`) | Chặn được: áp một lần, lần sau là "trùng" |
| 15 | Hai tab cùng tài khoản gửi hai lệnh trái nhau (call và fold) | Chặn được: chỉ một lệnh được áp |
| 16 | Gửi lệnh khi chưa tới lượt (fold, call, check) | Chặn được: `not_your_turn`, không ghi gì |
| 17 | Gửi lệnh rồi rút dây mạng ngay | Chặn được: lệnh áp đúng một lần, bàn chạy tiếp; vào lại gửi lại thì nhận "trùng" |
| 18 | Chạy script ngồi xuống/đứng dậy liên tục | **Chưa có giới hạn** — đã thêm (mục 3) |
| 19 | Chạy script đoán link mời phòng private | **Chưa có giới hạn** — đã thêm (mục 3) |

## 2. Lỗ tìm thấy

**Dò mã lệnh của người khác (mức thấp).** Để chống bấm đúp, server nhớ các mã lệnh (`command_id`)
đã áp. Khi một mã đến cho một ván không còn chạy, server tra trong sổ lệnh theo `hand_id` mà **không
kiểm phòng nào, của ai**. Kết quả: gửi `hand_id` + `command_id` của người khác thì server trả
`command_id_reused` ("mã này đã có người dùng"), tức là xác nhận mã đó có thật, kể cả ở phòng khác.
Ngay sau khi ván xong, bộ nhớ chống trùng cũng làm y như vậy.

Mức thấp vì mã lệnh do trình duyệt tạo ngẫu nhiên (UUID), gần như không đoán được, và lỗ này không
cho áp lệnh hay xem bài. Nhưng nó vượt ranh giới phòng, nên vẫn sửa: giờ chỉ lệnh **của chính người
gửi, trong chính phòng đó** mới được coi là gửi lại; còn lại xử lý như lệnh mới và bị từ chối bình
thường (`stale_hand` hoặc `no_active_hand`).

Còn lại đúng một chỗ server vẫn nói "mã đã dùng": hai người trong **cùng một ván đang chạy** trùng
`command_id`. Không tránh được mà không đổi hợp đồng API (mỗi ván, mỗi mã chỉ một lần) và chỉ xảy ra
nếu đoán trúng UUID của người ngồi cùng bàn, nên để nguyên.

## 3. Việc hoãn từ vòng audit B, đã làm

| Việc | Đã làm |
|---|---|
| `DEBUG` mặc định tắt | Server khởi động mà quên cấu hình thì không bao giờ chạy chế độ debug (debug lộ cấu hình khi có lỗi). Quên cả `DJANGO_SECRET_KEY` thì không chạy, kèm lời nhắc. Dev vẫn tiện: `manage.py` tự bật debug khi chưa có `DJANGO_SECRET_KEY` (máy dev, server e2e của CI); pytest tự bật qua `config/settings_test.py`; Docker dev đọc `.env`. |
| HSTS + `SECURE_*` sau proxy HTTPS | `DJANGO_BEHIND_HTTPS_PROXY=true` giờ bật thêm chuyển hướng `http→https` và HSTS 30 ngày (không gồm subdomain, không preload, dễ gỡ khi tên miền còn mới; chỉnh bằng `DJANGO_HSTS_SECONDS`). `manage.py check --deploy` không còn cảnh báo HSTS/HTTPS/cookie. Ghi vào `docs/deploy.md`. |
| Rate limit REST vào ghế / rời ghế / vào phòng | Vào và rời ghế: chung 10 lần mỗi phút cho một người. Thử link mời: 20 lần **sai** mỗi 10 phút cho một địa chỉ IP; mở link đúng thì không tính, vì cả bàn bạn bè thường dùng chung một Wi-Fi (sửa sau review). Quá thì 429 kèm `Retry-After` (đã có trong `openapi.yaml`, không đổi hợp đồng). |
| Lưu người trả thưởng 7-2 vào `Hand` | Cột mới `Hand.seven_deuce`: người thắng, mức thưởng lúc đó, ai trả bao nhiêu, tổng. Ghi cùng transaction với kết quả ván, đọc từ chính bút toán của ván nên luôn khớp sổ chip. **Không đổi luật** (vẫn `min(bonus, chip còn lại)`, vẫn chỉ thưởng khi thắng vì mọi người fold). Ván cũ được điền lại từ sổ chip khi chạy migration. |

## 4. Chưa làm, chưa chắc

- **Chưa chạy trên PostgreSQL.** Máy này không có Postgres của dự án (Docker tắt; Postgres ở cổng
  5433 là của chương trình khác). Toàn bộ test chạy trên SQLite: 9 test chỉ dành cho PostgreSQL
  (trigger chặn sửa sổ chip…) bị bỏ qua. CI chạy Postgres nên sẽ kiểm khi đẩy lên.
- **Sửa ngoài phạm vi được giao một chút**, vì bắt buộc cho việc `DEBUG` mặc định tắt:
  `manage.py`, `pyproject.toml` (pytest dùng `config.settings_test`) và file mới
  `config/settings_test.py`. Không đụng `web/`, `design/`, Docker hay `scripts/`.
- **Mức giới hạn** (10 lần/phút cho ghế, 20 lần/10 phút cho link mời) do Claude chọn; chủ dự án đổi
  được trong `apps/games/rooms.py`.
- **Health check** sau này nếu gọi thẳng Django bằng `http://` (không qua Caddy) sẽ nhận 301 vì đã
  bật chuyển hướng HTTPS; ghi chú ở `docs/deploy.md` cho phiên làm phần vận hành.
- **Chưa thử**: tấn công làm nghẽn WebSocket ở quy mô lớn (đã có giới hạn 20 message/10 giây mỗi
  người), trang admin, đoán mật khẩu (đã có giới hạn và test từ B6), độ ngẫu nhiên của bộ bài (đã
  kiểm ở B1: CSPRNG).
