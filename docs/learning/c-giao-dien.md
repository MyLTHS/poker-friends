# C — Giao diện (thiết kế + frontend)

Bốn bài ngắn. Mỗi bài theo nhịp của [lộ trình](../roadmap.md#nhịp-học-của-mỗi-đợt-gọn): viết
**dự đoán** trước (ngay sau chữ "Tôi nghĩ:", sai không sao), làm **bài tập nhỏ**, rồi mới đọc
**chuyện đã xảy ra** và **bài học**.

---

## Bài 1. Chọn hướng thiết kế

**Dự đoán:** Vì sao vẽ hẳn nhiều hướng thiết kế đầy đủ (17 màn, cả máy tính lẫn điện thoại) rồi
mới chọn, thay vì vẽ một hướng rồi sửa dần?

Tôi nghĩ: ...

**Tự làm:** Mở bốn hướng theo [c1-thiet-ke.md](../c1-thiet-ke.md). Chọn một màn, ví dụ bàn chơi
trên điện thoại. Với mỗi hướng ghi một dòng: thích gì, khó chịu gì. Rồi mở app thật xem D1 đang
chạy khác bản vẽ ở đâu.

Kết quả: ...

### Chuyện đã xảy ra (đọc sau khi viết dự đoán)

- Vòng 1 (27/10): ba hướng (D1 Nỉ & Đồng thau, D2 Giấy & Mực, D3 Kẹo Đêm), mỗi hướng 17 màn, mỗi
  hướng một Claude vẽ song song. Người điều phối mở từng màn trên trình duyệt và sửa chữ đè nhau ở D3.
- Vòng 2 (28/10): bạn muốn có thêm lựa chọn. D2 đổi thành Kính & Ánh Kim, thêm D4 Sơn Mài Vàng Son.
  Điện thoại chỉ còn bản xoay ngang 844×390.
- Bạn thấy chữ của D1, D2, D4 xấu. Đo lại thì 40–45% chữ là nét mảnh, 53–63% chữ trên máy tính nhỏ
  hơn 14px. Bạn chọn lại font từ một bảng mẫu chữ; D1 dùng Josefin Sans và Be Vietnam Pro.
- D1 được chọn và thành nền cho toàn bộ C2–C5.

### Bài học

- So nhiều phương án **đầy đủ** bằng mắt dễ hơn nhiều so với bàn bằng lời về một phương án tưởng tượng.
- Cảm giác "xấu" thường đo được: cỡ chữ, độ đậm, độ tương phản. Đo ra số thì sửa đúng chỗ.
- Chốt sớm điều khó đổi về sau (chỉ xoay ngang) làm mọi bước sau đơn giản hơn.

---

## Bài 2. Design system: một bộ "gạch" dùng chung

**Dự đoán:** Nếu mỗi màn tự vẽ nút bấm của riêng mình, sau 15 màn sẽ gặp chuyện gì?

Tôi nghĩ: ...

**Tự làm:** Chạy `cd web && npm run dev`, mở `http://localhost:3000/ui` (trang mẫu các thành phần).
Đổi tạm màu `--brass` trong `web/src/ui/tokens.css` thành `red`, tải lại trang mẫu và màn đăng
nhập: những gì đổi theo? Đổi lại như cũ.

Kết quả: ...

### Chuyện đã xảy ra

- C2 dựng `web/src/ui/`: `tokens.css` (màu, chữ, khoảng cách), các thành phần (nút, ô nhập, hộp
  thoại, toast, lá bài, chip…) và trang mẫu `/ui` để xem và thử từng thứ.
- Biến trong `tokens.css` giữ đúng tên của bản thiết kế, nên CSS của bản vẽ chép sang được nguyên văn.
- C3 (bàn chơi) và C4 (các màn khác) chỉ lắp từ bộ này. Khi C5 cần mọi chỗ chạm trên điện thoại
  ≥ 44px, sửa một chỗ trong `d1.css` là mọi màn theo.

### Bài học

- Design system là "một chỗ để sửa": đổi một lần, mọi màn đổi theo, không màn nào lạc tông.
- Có trang mẫu thì người review xem được từng thành phần mà không phải đi tìm nó trong app.
- Đặt tên giống bản thiết kế giúp người vẽ và người code nói cùng một thứ tiếng.

---

## Bài 3. Chuyển động không được nói dối

**Dự đoán:** Bạn bấm "Theo". Bàn nên đẩy chip vào giữa **ngay lúc bấm**, hay **đợi server trả lời**
rồi mới đẩy? Vì sao?

Tôi nghĩ: ...

**Tự làm:** Chạy `cd web && npx vitest run src/table/reducer.test.ts`. Tìm test có chữ
"before the ack" và giải thích bằng hai câu: nó kiểm chuyện gì, và vì sao chuyện đó quan trọng.

Kết quả: ...

### Chuyện đã xảy ra

- Nguyên tắc số 1 của [spec](../spec.md): server là nguồn sự thật duy nhất, client chỉ gửi ý định.
- C2 viết nguyên tắc ấy thành luật chuyển động ([c2-chuyen-dong.md](../c2-chuyen-dong.md) mục b):
  - Trạng thái luôn đúng ngay; chuyển động chỉ là lớp trang điểm chạy sau.
  - Không để chuyển động làm chậm trạng thái.
  - Chỉ chạy chuyển động theo sự kiện server gửi, không chạy khi nhận cả bàn một lúc (snapshot,
    đồng bộ lại), vì lúc đó không biết chuyện gì vừa xảy ra.
- Một lỗi thật: đo vị trí cũ của lá bài **sau** khi cập nhật trạng thái, nên đo nhầm vị trí mới và
  chuyển động không chạy. Sửa: đo trước khi cập nhật.
- Bấm đúp khi server chưa trả lời: lần bấm thứ hai gửi lại đúng mã lệnh cũ, nên server chỉ áp một lần.

### Bài học

- Hình ảnh phải theo sự thật, không được đi trước sự thật. Nếu chip bay trước rồi server từ chối,
  người chơi đã thấy một điều không xảy ra.
- Chuyển động đẹp mà làm chậm hoặc làm sai trạng thái thì nên bỏ.
- "Đo trước, đổi sau": thứ tự nhỏ nhưng quyết định chuyển động có chạy hay không.

---

## Bài 4. Lỗi chỉ thấy được bằng mắt: ghế đè nhau

**Dự đoán:** Test đều xanh mà màn bàn chơi vẫn sai. Loại lỗi nào test khó bắt nhất, và làm sao để
lần sau test bắt được?

Tôi nghĩ: ...

**Tự làm:** Chạy `cd web && npx vitest run src/table/seatView.test.ts` và đọc hai test "never puts two
seats on one spot" và "keeps every seat inside the frame". Đổi tạm một con số vị trí ghế trong
`web/src/table/geometry.ts` cho hai ghế trùng chỗ, chạy lại: test phải đỏ. Đổi lại như cũ.

Kết quả: ...

### Chuyện đã xảy ra

- Lúc review màn bàn chơi C3 (so ảnh chụp với bản thiết kế): ngồi xuống xong thì bàn không xoay để
  mình ở giữa phía dưới, ghế mình chồng lên ghế người khác; một ghế khác thò ra ngoài khung.
- Không test nào đỏ, vì chưa test nào hỏi "hai ghế có trùng chỗ không".
- Sửa xong thì thêm test cho mọi cỡ bàn 2–9 ghế, với mọi ghế mình có thể ngồi. C5 thêm kiểm tự động
  trên điện thoại ở ba cỡ màn: không gì thò ra ngoài, không gì bị cắt, chỗ chạm đủ 44px.

### Bài học

- Test chỉ trả lời những câu đã được hỏi. Lỗi "thấy được" là dấu hiệu còn thiếu một câu hỏi.
- Nhìn bằng mắt là bước đầu; biến điều nhìn thấy thành phép đo tự động là bước cuối.
- Thử mọi tổ hợp (mọi cỡ bàn × mọi ghế) rẻ hơn nhiều so với đoán trường hợp nào hay hỏng.
