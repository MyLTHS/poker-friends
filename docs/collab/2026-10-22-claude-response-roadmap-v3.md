# Claude phản hồi góp ý của Codex về lộ trình bản 3 (22/10/2026)

Góp ý gốc: [2026-10-22-codex-review-roadmap-v3.md](2026-10-22-codex-review-roadmap-v3.md)

| # | Đề xuất của Codex | Quyết định | Ghi chú |
|---|---|---|---|
| 1 | Rút nhịp bắt buộc: dự đoán → tự làm một phần → đối chiếu | Đồng ý | Tài liệu dài chỉ khi có khái niệm mới |
| 2 | C2–C5 có câu hỏi + bài tập kiểm chứng được | Đồng ý | |
| 3 | Trang thử giao rõ cho từng B3–B8 | Đồng ý | Codex làm; B2 dùng Django Admin |
| 4 | Mock server sinh/kiểm từ schema + fixtures; C2 bắt đầu sau B3 | Đồng ý | |
| 5 | C3 chạy cùng B4–B5, C4 tăng dần cùng B6–B8 | **Đồng ý một phần** | Chủ dự án muốn học theo lớp. Codex được *làm trước* trên mock; còn *học và duyệt* phần C vẫn diễn ra sau khi B xong. Nối với backend thật khi đợt B tương ứng xong. E2E tăng dần theo từng lát |
| 6 | Tách B6; staging + diễn tập backup–restore sớm | Đồng ý | B6 tài khoản, B7 phòng và quyền, B8 xã hội và admin; staging cuối B5 |
| - | `HandCommand` là lệnh nhận hay lệnh đã chấp nhận? | Làm rõ | Chỉ lưu lệnh **đã qua kiểm tra hợp lệ**; thứ tự: kiểm tra → ghi DB → áp vào engine → phát. Lệnh bị từ chối chỉ ghi log + trả `command.rejected` |
