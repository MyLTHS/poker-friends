## Nhận xét thẳng

### 1. Cấu trúc lớp và nhịp học

Hướng **nền móng → backend → giao diện → vận hành → nhìn lại** phục vụ mục tiêu học tốt: mỗi lớp giới thiệu một nhóm tư duy tương đối rõ, có cổng duyệt và sản phẩm quan sát được.

Nhưng nhịp học hiện hơi “đẹp trên khung, thiếu khi thi hành”:

- Sáu bước cho mọi đợt khá nặng: tài liệu, 2–3 câu hỏi, duyệt, giải thích PR, bài tập, chơi thử. Nếu áp cứng cho 12 đợt, dự án dễ biến thành khóa học viết tài liệu.
- B2–B7 có câu hỏi tư duy nhưng gần như không ghi bài tập cụ thể. C2–C5 thậm chí thiếu cả câu hỏi lẫn bài tập.
- Mục tiêu “cuối mỗi đợt backend có trang thử” không khớp nội dung: B3, B6 và B7 chưa có trang thử rõ ràng.
- Kiến thức quan trọng còn thiếu nhịp ôn lại: người học nên dự đoán trước, tự làm một phần nhỏ, rồi đối chiếu với kết quả—không chỉ đọc giải thích PR.

Nên coi sáu bước là khung linh hoạt; mỗi đợt chỉ cần một câu hỏi trọng tâm và một bài thực hành thật.

### 2. Góp ý bản trước

Phần lớn đã được giữ khá tốt:

- Guest identity, vòng đời `Room`, ownership được đưa sớm.
- Protocol có version, ACK/rejected, error code, deadline và resync.
- Có JSON Schema, fixtures, generated TypeScript và contract CI.
- ADR actor, single writer, persist trước broadcast và replay đã được chốt.
- Command được lưu từng bước; reducer test và Playwright nhiều client xuất hiện sớm.
- B5–B7 đã được chia nhỏ và tổng lịch thực tế hơn.

Hai điểm chưa giữ đủ:

- **Mock server sinh từ schema/fixtures** chưa được nói rõ; fixtures một mình chưa bảo đảm Codex chạy frontend độc lập.
- **Staging và diễn tập backup–restore sớm** bị đẩy lại tận E. Đây là góp ý quan trọng đã được Claude đồng ý ở bản trước nhưng bản 3 không còn thể hiện.

Ngoài ra cần làm rõ `HandCommand` là lệnh nhận được hay lệnh đã được engine chấp nhận, và trạng thái rejected được lưu thế nào.

### 3. Vai trò Codex

Phân vai nhìn chung hợp lý: Codex sở hữu UX/frontend/trang thử và review backend, Claude sở hữu backend và review frontend. Việc cùng làm B3 là đúng vì protocol chính là ranh giới giữa hai bên.

Tuy vậy Codex vẫn có nguy cơ chờ:

- A–B2 gần như chỉ có review.
- C1 xong khoảng B4, nhưng C2 được trình bày như giai đoạn sau toàn bộ B; như vậy Codex có thể rỗi trong B5–B7.
- “Trang thử cuối mỗi đợt B” chưa được giao và mô tả nhất quán.

Nên chạy frontend theo lát dọc: C2 ngay sau B3, C3 bám B4–B5, C4 bổ sung từng màn khi B6–B7 hoàn tất.

### 4. Thứ tự B1–B7 và C1–C5

Trật tự backend cơ bản đúng: dữ liệu → hợp đồng → realtime → độ bền → tài khoản/quyền → xã hội.

Điểm nên đổi không phải đảo toàn bộ B, mà là tách và gối đầu:

- B6 đang quá tải: auth, OAuth, guest upgrade, lobby, invite, host permissions và rate limit là nhiều bài học khác nhau.
- B7 cũng trộn social, spectator, history/replay, báo cáo và admin audit.
- C5 để toàn bộ E2E đến cuối là muộn; E2E cơ bản đã có ở B4 nhưng cần tiếp tục tăng theo từng lát frontend.
- C2–C4 không nên chờ B7; nếu không, lợi ích của contract-first và fixtures bị bỏ phí.

## Đề xuất sửa cụ thể

1. Rút nhịp bắt buộc mỗi đợt còn: **dự đoán → tự làm một phần nhỏ → đối chiếu và ghi bài học**; tài liệu/giải thích PR chỉ dùng khi thực sự có khái niệm mới.
2. Thêm cho C2–C5 mỗi đợt một câu hỏi tư duy và một bài tập có đầu ra kiểm chứng được.
3. Ghi rõ Codex làm trang thử hoặc vertical slice cho **từng B3–B7**, không chỉ B4–B5.
4. Thêm mock server được sinh/kiểm tra từ schema và fixtures; cho C2 bắt đầu ngay sau khi hợp đồng B3 ổn định.
5. Xếp C3 chạy cùng B4–B5, C4 phát triển tăng dần cùng B6–B7; bổ sung E2E sau mỗi lát thay vì dồn vào C5.
6. Tách B6 thành **identity/auth** và **room/permissions**, đồng thời đưa staging tối thiểu cùng diễn tập backup–restore lên B5 hoặc ngay sau B5.
