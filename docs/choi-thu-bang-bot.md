# Chơi thử bằng bot (soak test)

Một mục của giai đoạn D trong roadmap là "chơi thử nội bộ nhiều giờ". Lệnh `soak` làm phần
máy làm được: thả vài người chơi ảo (bot) vào một **server đang chạy thật**. Bot nói chuyện với
server qua WebSocket y như trình duyệt, rồi đánh liên tục cho tới khi đủ số ván.

Test thường chạy engine ngay trong một process. Bot thì đi qua đủ đường thật: mạng, consumer,
actor, sổ chip, cơ sở dữ liệu. Có những lỗi chỉ lộ ra khi nhiều người cùng bấm, rớt mạng rồi
vào lại, hay để hết giờ; lệnh này dành cho các lỗi đó.

## Cách chạy

1. Chạy server (Docker: `docker compose up`; hoặc `uv run daphne -p 8000 config.asgi:application`).
2. Ở một terminal khác, **cùng cơ sở dữ liệu với server**:

   ```bash
   uv run python manage.py soak --url ws://localhost:8000 --players 6 --hands 200
   ```

Lệnh tự tạo một phòng mới tên `Soak <ngày giờ>`, cho mỗi bot 5000 chip rồi bắt đầu đánh.
Các tuỳ chọn hay dùng:

| Tuỳ chọn | Mặc định | Nghĩa |
|---|---|---|
| `--players` | 6 | Số bot (2–9) |
| `--hands` | 100 | Đánh đủ bấy nhiêu ván thì dừng |
| `--minutes` | 0 | Hoặc dừng sau bấy nhiêu phút (chờ ván đang chơi xong) |
| `--think-time` | 5 | Giây suy nghĩ mỗi lượt của phòng |
| `--reconnect` | 0.01 | Xác suất bot tự rớt mạng rồi vào lại, tính sau mỗi message |
| `--slow` | 0.03 | Xác suất bot để hết giờ, cho server tự check/fold thay |
| `--seven-deuce-bonus` | 50 | Thưởng 7-2 của phòng |

## Bot kiểm những gì

Trong lúc chơi, mỗi bot tự soát mọi message nó nhận:

- **Không lộ bài**: message phải đúng hợp đồng cho chính bot đó (không thấy bài tẩy người khác,
  không có bộ bài, tiền không tự sinh ra hay mất đi trong `hand.completed`).
- **Đúng thứ tự**: sự kiện tới theo `version` tăng 1. Hụt thì bot xin snapshot (resync) như web
  app, và lần hụt đó được đếm lại.
- **Lệnh nào cũng có trả lời** trong 15 giây. Bot chỉ bấm nước hợp lệ, nên lệnh bị từ chối là
  lỗi. Ngoại lệ duy nhất là lúc bot vừa để hết giờ hay vừa rớt mạng: server có thể đã đi tiếp
  trước khi lệnh tới, khi đó lệnh bị từ chối được ghi là `(race)`.
- **Mọi bot thấy cùng một kết quả** cho mỗi ván.
- **Phòng không bao giờ bị tạm dừng** (`room.suspended`).

Khi dừng, lệnh soát lại cơ sở dữ liệu:

- Tổng sổ chip của phòng bằng đúng số chip đã cấp.
- Số dư từng người khớp với kết quả ván cuối mà bot thấy.
- Mỗi ván, phát lại từ log lệnh, ra đúng kết quả đã lưu.

Không có vấn đề gì thì lệnh in `No problems found.`. Có vấn đề thì in từng dòng màu đỏ và kết
thúc với mã lỗi.

## Kết quả lần chạy đầu (28/10/2026)

Chạy trên SQLite và kênh phát tin trong bộ nhớ, server một process như bản thật:

- **4 bot × 5 ván**: 59 lệnh, 4 lần hết giờ, 6 lần rớt mạng. Không lỗi.
- **6 bot, lần 1**: bot lúc đó đánh liều quá nên tới ván 30 chỉ còn một người có chip. Bot
  không thấy lỗi nào. Nhưng log server có một lỗi thật: server gửi tin đúng lúc người chơi đang
  đóng kết nối, thế là phần xử lý kết nối đó sập trước khi kịp báo "người này đã rời". Server
  tưởng người chơi vẫn ngồi và dồn tin vào kênh chết khoảng một phút. Ngoài đời chuyện này xảy
  ra mỗi khi ai đó đóng tab hay mất sóng đúng lúc có người vừa bấm. Đã sửa trong
  `apps/games/consumers.py` (`RoomConsumer.send`).
- **6 bot, lần 2** (sau khi sửa và cho bot bớt liều): 185 ván (dừng khi chỉ còn một người có
  chip), 1945 lệnh, 84 lần hết giờ, 1002 lần rớt mạng, 232 lệnh gửi lại sau khi vào lại (server
  nhận ra là lệnh cũ, không áp hai lần). Không lỗi; log server sạch.
