# D — Kiểm thử tổng thể: nghĩ như kẻ phá

Ba bài ngắn, theo nhịp của [lộ trình](../roadmap.md#nhịp-học-của-mỗi-đợt-gọn): **dự đoán** trước,
**tự làm** một việc nhỏ, rồi mới đọc **chuyện đã xảy ra** và **bài học**.

---

## Bài 1. 19 cách gian lận

**Dự đoán:** Nếu bạn muốn gian lận trong game này, bạn sẽ thử 3 cách nào?

Tôi nghĩ: 1. ... 2. ... 3. ...

**Tự làm:** Tìm 3 cách của bạn trong bảng của [biên bản tấn công thử](../collab/d-tan-cong-thu.md).
Cách nào đã có thì tìm test của nó trong `apps/games/tests/test_attacks.py`. Chạy
`uv run pytest apps/games/tests/test_attacks.py -q`: tất cả phải xanh. Cách nào chưa có thì viết
một dòng mô tả, nhờ Claude biến thành test.

Kết quả: ...

### Chuyện đã xảy ra

- 19 cách, mỗi cách một test. Ví dụ:
  - xem bài úp của người khác qua phần xem lại ván;
  - người đã bỏ bài xin lại trạng thái bàn;
  - giả `player_id` hay số ghế của người khác;
  - dùng `hand_id` của phòng khác;
  - dùng quyền chủ phòng ở phòng người khác;
  - bấm đúp từ hai tab;
  - gửi lệnh rồi rút mạng.
- Một cách **lọt** (bài 2). Hai cách chưa có giới hạn tần suất: script ngồi xuống đứng lên liên tục,
  và đoán link mời. Đã thêm giới hạn.
- Review sửa thêm: giới hạn đoán link mời lúc đầu đếm cả lần mở link **đúng**. Cả bàn chung một
  Wi-Fi có thể bị chặn 10 phút, nên giờ chỉ đếm lần sai.

### Bài học

- Nghĩ như kẻ phá là một cách nghĩ riêng: hỏi "làm sao để hệ thống làm điều nó không được làm".
- Mỗi cách tấn công thành một test thì lỗi đã sửa không quay lại.
- Chặn kẻ xấu không được làm khổ người tốt: nhóm bạn ngồi chung một Wi-Fi là chuyện bình thường.

---

## Bài 2. Lỗ nhỏ: dò `command_id`

**Dự đoán:** Server trả lời "mã lệnh này đã dùng rồi". Câu trả lời ấy có thể tiết lộ gì cho kẻ gian?

Tôi nghĩ: ...

**Tự làm:** Đọc mục 2 của [biên bản](../collab/d-tan-cong-thu.md). Tìm hàm
`_someone_elses_old_command` trong `apps/games/actor.py` và giải thích bằng hai câu: nó trả lời câu
hỏi gì, và vì sao cần hỏi câu đó.

Kết quả: ...

### Chuyện đã xảy ra

- Để chống bấm đúp, server nhớ các mã lệnh đã nhận. Nhưng nó tìm theo `hand_id` mà không kiểm
  phòng hay người gửi.
- Gửi `hand_id` và `command_id` của người khác, kể cả từ phòng khác, server trả "mã đã dùng". Tức
  là nó xác nhận mã đó có thật.
- Mức độ thấp: mã là UUID ngẫu nhiên, lỗ này không áp được lệnh và không lộ bài.
- Tìm ra nhờ viết test tấn công: hai test đỏ trước khi sửa.
- Sửa: chỉ lệnh của chính người gửi, trong đúng phòng đó, mới tính là gửi lại. Còn lại server từ
  chối như lệnh của ván cũ.

### Bài học

- Câu báo lỗi cũng là thông tin. Server chỉ nên nói với một người điều người đó vốn đã biết.
- Lỗ "nhỏ" vẫn đáng sửa khi sửa rẻ: lỗ nhỏ hôm nay có thể ghép với lỗ khác ngày mai.
- Test đỏ trước, sửa sau: thấy test đỏ là có bằng chứng lỗ có thật, thấy xanh là có bằng chứng đã vá.

---

## Bài 3. Bot chơi hàng trăm ván: "bóng ma" khi đóng tab

**Dự đoán:** Test nào cũng xanh, sao còn cho bot chơi hàng trăm ván? Bot tìm được loại lỗi gì mà
test thường không tìm được?

Tôi nghĩ: ...

**Tự làm:** Làm theo [choi-thu-bang-bot.md](../choi-thu-bang-bot.md): bật server, chạy
`uv run python manage.py soak --url ws://localhost:8000 --players 4 --hands 20`. Đọc dòng tổng kết
của bot, **rồi đọc cả log server**: có traceback nào không?

Kết quả: ...

### Chuyện đã xảy ra

- Lần chạy 6 bot đầu tiên: bot báo sạch, nhưng log server có traceback.
- Server gửi tin vào một kết nối vừa bắt đầu đóng. Daphne báo lỗi, và phần xử lý kết nối dừng
  **trước khi** kịp báo "người này đã đi".
- Bàn tưởng người chơi vẫn ngồi đó và dồn tin cho một kết nối đã chết, khoảng một phút, tới khi
  hàng đợi đầy. Một "bóng ma" ngồi ở bàn.
- Ngoài đời: ai đó đóng tab hay mất sóng đúng lúc người khác vừa bấm.
- Sửa: bỏ qua lỗi gửi vào kết nối đang đóng, để bước "người này đã đi" chạy như thường. Có test.
- Chạy lại: 185 ván, 1945 lệnh, 84 lần hết giờ, 1002 lần rớt mạng, 232 lệnh gửi lại được nhận ra
  là trùng. Không lỗi.

### Bài học

- Lỗi về thời điểm (hai việc xảy ra cùng lúc) rất hiếm, chỉ lộ ra khi chạy nhiều và chạy lâu.
- Đừng chỉ nhìn kết quả: bot báo sạch mà log server vẫn có lỗi.
- Một kiểm thử tốt có số liệu (bao nhiêu ván, bao nhiêu lần rớt mạng), để lần sau so sánh được.
