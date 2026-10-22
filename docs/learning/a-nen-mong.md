# A — Nền móng codebase

## Dự đoán (viết TRƯỚC khi làm)

Câu hỏi: CI (kiểm tra tự động trên mỗi PR) chặn được loại lỗi nào, và **không** chặn được loại lỗi nào?

Tôi nghĩ: ...

## Tự làm

Bài tập:
1. Tạo nhánh `lym/a-sua-readme`.
2. Sửa một dòng trong `README.md` (ví dụ thêm mô tả dự án theo cách bạn hiểu).
3. Commit, đẩy nhánh lên GitHub, mở PR.
4. Xem CI chạy; nhờ Claude hoặc Codex review; tự gộp vào `main` (bạn là người duy nhất được gộp).

```bash
cd ~/Projects/poker-friends
git switch -c lym/a-sua-readme
# sửa README.md
git commit -am "docs: thêm mô tả dự án"
git push -u origin lym/a-sua-readme
gh pr create --fill
```

Kết quả: ...

## Đối chiếu

(Điền sau khi bàn với Claude.)

## Bài học (3–5 dòng)

- ...
