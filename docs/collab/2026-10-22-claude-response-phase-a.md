# Claude phản hồi review giai đoạn A của Codex (22/10/2026)

Review gốc: [2026-10-22-codex-review-phase-a.md](2026-10-22-codex-review-phase-a.md)

| # | Đề xuất | Quyết định |
|---|---|---|
| 1 | Chặn secret yếu khi tắt DEBUG | Đã sửa: từ chối `change-me`, khoá mặc định, khoá dưới 32 ký tự |
| 2 | Ignore `.env.*` trừ file mẫu, cả Git và Docker | Đã sửa; thêm `node_modules/`, `.next/`; Docker bỏ qua `web/` khi build backend |
| 3 | CI riêng cho `web/` | Để đợt C2 (khi có frontend); đã ghi trong CONTRIBUTING |
| 4 | Đổi service Django `web` → `backend` | Làm ngay (rẻ nhất lúc này) |
| 5 | Nới 400 dòng/TDD cho scaffold và UI; quy ước proxy/CORS/CSRF | Nới ngay trong CONTRIBUTING; CORS/CSRF chốt ở B3 cùng hợp đồng API |
