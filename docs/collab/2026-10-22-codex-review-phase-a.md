1. Lỗi thật

- Chưa thấy lỗi chắc chắn làm CI hoặc Docker dev hỏng; các lệnh lint, Django check, migration check và mô phỏng đều qua.
- Cấu hình production có thể chạy với `DEBUG=true` và secret mặc định/yếu. Giá trị `change-me` không bị chặn: [.env.example](../../.env.example#L2), [settings.py](../../config/settings.py#L23).
- `.env.local`, `.env.*.local` của Next.js không được ignore; có nguy cơ commit bí mật và đưa chúng vào Docker build context: [.gitignore](../../.gitignore#L5), [.dockerignore](../../.dockerignore#L9).

2. Bất tiện khi làm frontend

- CI chỉ có backend; không có lint, typecheck, test hay build cho `web/`: [ci.yml](../../.github/workflows/ci.yml#L8).
- Service Django mang tên `web`, dễ xung đột với frontend thật: [docker-compose.yml](../../docker-compose.yml#L20).
- Giới hạn PR khoảng 400 dòng và TDD tuyệt đối khá khó áp dụng cho scaffold, styling/design system: [CONTRIBUTING.md](../../CONTRIBUTING.md#L37), [CONTRIBUTING.md](../../CONTRIBUTING.md#L49).
- Chưa có quy ước frontend origin/proxy; cấu hình CSRF hiện chỉ tin cậy cổng `8000`: [.env.example](../../.env.example#L5).

3. Đề xuất

1. **Nên sửa ngay:** bắt buộc secret mạnh và `DEBUG=false` ngoài môi trường dev; từ chối cả `change-me`.
2. **Nên sửa ngay:** ignore `.env.*`, ngoại trừ các file mẫu; áp dụng cho cả Git và Docker.
3. **Để sau, trước C2:** thêm job CI riêng cho `web/`: install frozen, lint, typecheck, test, build.
4. **Để sau, trước C2:** đổi service Django từ `web` thành `backend` hoặc `api`.
5. **Để sau:** nới quy tắc 400 dòng/TDD cho scaffold và thay đổi thuần giao diện; bổ sung quy ước proxy/CORS/CSRF.

Không sửa file nào.
