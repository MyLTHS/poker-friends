# Quy ước làm việc

Dự án có ba thành viên: **chủ dự án** (duyệt, học, gộp vào `main`), **Claude** (viết toàn bộ
code: backend, mock server, trang thử, thiết kế, frontend), **Codex** (chỉ review, ở chế độ chỉ
đọc). Phân vai này do chủ dự án chốt ngày 27/10/2026; trước đó Codex làm trang thử, thiết kế và
frontend. Lộ trình: [docs/roadmap.md](docs/roadmap.md).

## Chạy dự án

```bash
cp .env.example .env
docker compose up            # Django :8000, Postgres :5433, Redis :6380 (cổng trên máy)
```

Không dùng Docker:

```bash
uv sync
.venv/bin/pytest
.venv/bin/python manage.py runserver
```

## Cấu trúc

| Thư mục | Nội dung | Chủ sở hữu |
|---|---|---|
| `apps/` | Backend Django | Claude |
| `apps/games/engine/` | Lõi luật chơi (vùng nhạy cảm) | Claude |
| `web/` | Frontend Next.js (CI riêng thêm ở đợt C2); type sinh từ `docs/api/` | Claude |
| `docs/api/` | Hợp đồng API (sửa phải có Codex review và chủ dự án đồng ý) | Claude |
| `docs/collab/` | Trao đổi và quyết định giữa Claude và Codex | Chung |
| `docs/learning/` | Bài học của từng đợt | Chủ dự án |

## Nhánh và PR

- Không ai đẩy thẳng lên `main`. Mọi thay đổi đi qua PR.
- Tên nhánh: `<người>/<đợt>-<mô-tả>`, ví dụ `claude/b2-ledger-models`, `codex/c1-wireframes`,
  `lym/a-sua-readme`.
- Mỗi PR làm một việc, nên dưới khoảng 400 dòng thay đổi (không tính file sinh tự động,
  lockfile, scaffold ban đầu).
- CI phải xanh. Codex review (chỉ đọc, nhận xét ghi ở `docs/collab/`), Claude sửa.
- **Chỉ chủ dự án được gộp vào `main`.**

## Commit

- Tiêu đề ngắn, động từ ở đầu, có tiền tố phạm vi: `engine: ...`, `rooms: ...`, `web: ...`,
  `docs: ...`, `ci: ...`.
- Commit do AI viết có dòng `Co-Authored-By` của AI đó.

## Test

- TDD: viết test trước, thấy test fail, rồi mới viết code. Ngoại lệ: scaffold và thay đổi
  thuần giao diện (màu, khoảng cách, chữ); những thay đổi này kiểm bằng ảnh chụp hoặc E2E.
- Sửa lỗi thì kèm test hồi quy chứng minh lỗi không quay lại.
- **Sửa `apps/games/engine/`** bắt buộc chạy thêm mô phỏng:
  `.venv/bin/python -m apps.games.engine.simulate --hands 2000 --players 9`

## Hợp đồng API

Đổi hợp đồng: sửa tài liệu và schema trong `docs/api/` trước, Codex review, chủ dự án đồng ý trên
PR, rồi mới sửa code.

## Ngôn ngữ

Tài liệu và giao diện: tiếng Việt. Code, tên biến, comment trong code: tiếng Anh.
