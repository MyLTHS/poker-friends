# Sổ tay buổi beta (giai đoạn F)

Giai đoạn F là 2–3 buổi chơi thật với bạn bè. Mục đích không phải để chơi cho vui (dù vui là tốt),
mà để **tìm lỗi và nghe người dùng thật**, trước khi coi dự án là xong.

Cách bật server và gửi link nằm ở [choi-online.md](choi-online.md). Gặp sự cố thì xem
[runbook.md](runbook.md). Trang này chỉ nói những gì riêng cho buổi beta.

## Điều kiện "đạt" (từ roadmap)

Một buổi chơi **2 giờ** mà:

1. **Không sai chip.** `check_ledger` cuối buổi báo sạch, và không ai kêu "tự nhiên mất chip".
2. **Không lộ bài.** Không ai thấy được bài tẩy của người khác khi ván đang chạy.
3. **Không crash mà không tự khôi phục được.** Mất mạng, tải lại trang hay bàn tạm dừng đều được,
   miễn là chơi tiếp được mà không phải xoá dữ liệu.

Đạt cả ba trong một buổi là xong F. Buổi nào trượt điều nào thì sửa rồi chơi buổi sau.

## Trước buổi chơi

1. **Hẹn giờ và số người.** Lần đầu 4–6 người là vừa: đủ đông để thấy lỗi, đủ ít để theo dõi.
2. **Cắm sạc, tắt chế độ ngủ, mạng ổn định.** Máy Mac chính là server.
3. Ngay trước giờ: `scripts/play-online.sh up`. Tự mở link trên điện thoại (xoay ngang) và trên máy
   tính, đánh thử một ván với tài khoản khách.
4. **Tạo phòng và cấp chip.** Bạn là chủ phòng. Ghi lại mỗi người được cấp bao nhiêu chip, để cuối
   buổi đối chiếu.
5. Gửi cho nhóm **ba điều**: link, cách xoay ngang điện thoại, và câu "gặp gì lạ thì bấm Gửi phản
   hồi hoặc nhắn mình ngay, kèm giờ".

### Tin nhắn mẫu gửi nhóm

Sửa giờ, link và tên phòng rồi dán vào nhóm chat:

> Tối nay 21h chơi poker chip ảo nhé, không tiền thật 🃏
> 1. Mở link: https://xxx.trycloudflare.com (link chỉ dùng tối nay)
> 2. Điện thoại thì **xoay ngang** máy.
> 3. Bấm "Chơi ngay bằng khách" là vào được. Muốn giữ chip cho lần sau thì "Đăng ký" bằng email,
>    rồi nhắn mình để mình xác minh cho.
> 4. Vào phòng bằng link mời mình gửi riêng.
> Gặp gì lạ thì bấm **Gửi phản hồi** hoặc nhắn mình kèm giờ nhé!

Link mời phòng (có mã bí mật) thì gửi trong nhóm kín, đừng đăng công khai.

## Trong buổi chơi

- **Ghi chép nhanh.** Mỗi khi ai đó kêu, ghi một dòng: giờ, ai, đang làm gì, thấy gì. Ví dụ:
  "21:14, An, điện thoại, bấm Theo không ăn". Giờ rất quan trọng để tìm trong log.
- **Đừng sửa code giữa buổi.** Nếu bàn tạm dừng, làm theo runbook mục "Bàn tạm dừng". Lỗi khác thì
  ghi lại rồi chơi tiếp.
- **Để ý những thứ khó nói thành lời**:
  - Ai chần chừ lâu ở một màn.
  - Ai hỏi "bấm đâu".
  - Ai bị hết giờ liên tục.
  - Ai cầm điện thoại dọc.

## Hết buổi

1. **Trước khi tắt**, kiểm sổ chip trong lúc server còn chạy. Dòng cuối phải là `OK: ...`. Đối
   chiếu thêm với số chip đã cấp lúc đầu.

   ```bash
   docker compose -p poker-home -f docker-compose.prod.yml -f docker-compose.home.yml --env-file .env.home exec backend python manage.py check_ledger
   ```

2. `scripts/play-online.sh down` (tự sao lưu).
3. Đọc **phản hồi và lỗi trình duyệt** trong trang admin (mục Feedback và Client errors), cộng với
   ghi chép của bạn. Cách xem: [runbook.md](runbook.md).
4. Hỏi cả nhóm hai câu, ngay hôm đó khi còn nhớ:
   - Điều gì làm bạn khó chịu nhất?
   - Điều gì bạn muốn có mà chưa có?

## Xếp ưu tiên phản hồi

Gom mọi phản hồi vào một danh sách, mỗi dòng xếp vào một trong ba nhóm:

| Nhóm | Là gì | Ví dụ |
|---|---|---|
| **Sửa ngay** | Sai chip, lộ bài, không chơi tiếp được, mất dữ liệu | "Ván xong mà chip không cộng" |
| **Để sau** | Khó dùng, xấu, chậm, nhưng vẫn chơi được | "Nút Tố hơi nhỏ trên điện thoại" |
| **Không làm** | Ngoài phạm vi dự án, hoặc chỉ một người muốn mà làm khó cho người khác | "Cho nạp tiền thật" |

> **Tự làm:** sau buổi đầu, bạn tự xếp danh sách trước, rồi so với cách xếp của Claude. Chỗ hai bên
> xếp khác nhau chính là chỗ đáng bàn nhất.
