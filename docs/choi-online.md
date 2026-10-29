# Chơi online từ máy Mac của Lym

> Lần đầu làm? Đọc [hướng dẫn từ đầu](huong-dan-tu-dau.md): cài đặt, mỗi buổi chơi, đoạn gửi bạn
> bè. Trang này giải thích cách chơi online hoạt động và các lệnh chi tiết.

Chưa thuê VPS, nên trong các buổi chơi thử (giai đoạn E/F) **máy Mac của Lym là server**. Bạn bè
vào qua một link `https://<chữ-ngẫu-nhiên>.trycloudflare.com`: Cloudflare nhận kết nối của họ
rồi chuyển qua một "đường hầm" (container `tunnel` chạy `cloudflared` trong Docker) về server.
Không cần mở cổng modem, không cần tên miền, có sẵn HTTPS.

Đổi lại: **link đổi mỗi lần bật**, và máy tắt/ngủ là bàn dừng.

Mọi việc làm bằng một lệnh, chạy trong thư mục dự án:

| Lệnh | Làm gì |
|---|---|
| ▶ ở nhóm **poker-home** trong Docker Desktop | Bật tất cả (đường hầm và sao lưu tự động có sẵn); link nằm trong Logs của **poker-home-tunnel-1**. Cần dựng lần đầu bằng `up` |
| `scripts/play-online.sh up` | Sao lưu, bật server và đường hầm, giữ máy thức, in link và copy sẵn |
| `scripts/play-online.sh status` | Đang chạy không, link nào |
| `scripts/play-online.sh logs` | Xem log server (cả email đặt lại mật khẩu khi chưa có Gmail, xem dưới) |
| `scripts/play-online.sh down` | Sao lưu cuối buổi, tắt đường hầm và server (dữ liệu vẫn giữ) |

## Trước buổi chơi (khoảng 15 phút trước)

1. **Cắm sạc.** Mở Docker Desktop, đợi biểu tượng cá voi báo đang chạy.
2. Chạy `scripts/play-online.sh up`. Lần đầu phải build nên mất vài phút, các lần sau nhanh hơn.
   Đợi dòng **XONG** và cái link bên dưới.
3. Tự mở link đó trên điện thoại, **tắt wifi dùng 4G** cho giống bạn bè ở xa. Vào được trang và
   vào được một bàn là ổn.
4. Gửi link vào nhóm chat.

## Trong buổi chơi

- **Không gập máy.** Gập máy là Mac ngủ dù script đã giữ máy thức (lệnh `caffeinate`). Màn hình
  tự tắt thì không sao.
- Không tắt Docker Desktop, không ngắt wifi, không cho máy tự cập nhật hay khởi động lại.
- Máy chậm thì tắt bớt ứng dụng nặng (game, nhiều tab video).

## Hết buổi

Chạy `scripts/play-online.sh down`. Script tự sao lưu vào thư mục `backups/` rồi tắt hết. Thỉnh
thoảng (mỗi tuần) chép thư mục `backups/` ra chỗ khác (Google Drive, ổ ngoài): hỏng máy là mất
cả database lẫn backup nằm cùng máy.

## Trang quản trị (xem phản hồi, lỗi, tài khoản)

Lần đầu, khi server đang chạy: `scripts/play-online.sh admin`, rồi tự gõ tên, email và mật khẩu
quản trị. Sau đó mở `<link của buổi>/admin/` và đăng nhập bằng tài khoản đó. Mục **Phản hồi và
lỗi** có góp ý của bạn bè và lỗi trình duyệt (xem [runbook.md](runbook.md)).

## Tài khoản khi link đổi liên tục

Trình duyệt coi mỗi link mới là một trang web khác, nên đăng nhập của buổi trước không theo sang
buổi sau.

- **Khách vào được**: server ở nhà bật chế độ khách (`GUESTS_ALLOWED=true` trong `.env.home`;
  `play-online.sh up` tự sửa file cũ còn ghi `false`). Bạn bè **chỉ cần gõ tên** là tạo phòng, ngồi
  vào bàn được; ngồi xuống là **có chip ngay** (chip khởi điểm của phòng), hết chip thì tự **mua
  thêm**. Tài khoản bị bỏ tick **Active** trong `/admin/` vẫn bị chặn.
- **Khách mất chỗ khi link đổi**: khách gắn với trình duyệt và link của buổi đó. Ai muốn giữ phòng,
  chip và lịch sử qua nhiều buổi thì tạo tài khoản email + mật khẩu (hoặc nâng cấp từ khách), không
  cần xác minh email, không cần ai duyệt.
- **Mỗi buổi đăng nhập lại** trên link mới là có lại hết phòng và chip (với tài khoản).
- Email chỉ cần cho **quên mật khẩu**:
  - Có cấu hình Gmail (`EMAIL_URL` trong file `.env.home`, cách làm ở
    [huong-dan-google-smtp.md](huong-dan-google-smtp.md)): email tự gửi đi.
  - Chưa có: email chỉ in vào log server. `scripts/play-online.sh links` in ra các link đặt lại mật
    khẩu của buổi này, mỗi link kèm email người nhận. Gửi **riêng** từng link cho đúng người. Link
    chỉ dùng được **trong buổi đó** (nó chứa link của buổi).
- **Đăng nhập Google: không dùng được** với link đổi liên tục (Google chỉ chấp nhận địa chỉ đã
  khai trước). Script để trống phần Google, nên trang web không hiện nút này.

## Sự cố thường gặp

| Chuyện gì | Làm gì |
|---|---|
| `up` báo "Docker Desktop chưa chạy" | Mở Docker Desktop, đợi nó chạy xong, chạy lại `up` |
| `up` báo "không lấy được link" | Mạng nhà có vấn đề hoặc Cloudflare đang lỗi. Kiểm wifi, đợi một lúc, chạy lại `up` |
| `up` xong nhưng báo link chưa trả lời | Link mới cần vài chục giây mới mở được. Đợi một phút rồi thử lại trên điện thoại |
| Bạn bè mở link cũ không được | Link đổi mỗi lần `up`. Chạy `status` lấy link hiện tại, gửi lại |
| Lỡ gập máy, máy ngủ, mất điện | Mở máy lên. Nếu `status` vẫn thấy link mà link không vào được: `down` rồi `up`, gửi **link mới** |
| Mạng nhà rớt một lúc | `cloudflared` tự nối lại khi có mạng; người chơi tự kết nối lại. Lâu quá thì `down` rồi `up` |
| Bàn báo "tạm dừng" | Xem [runbook.md](runbook.md#bàn-tạm-dừng); các lệnh `dc ...` ở đó thay bằng `docker compose -p poker-home -f docker-compose.prod.yml -f docker-compose.home.yml --env-file .env.home ...` |
| Nghi chip sai | Như trên, mục [Lệch chip](runbook.md#lệch-chip) |

## Biết thêm

- Dữ liệu nằm trong Docker (volume `poker-home_pgdata`), không mất khi `down` hay khởi động lại
  máy. Đừng xoá volume này và đừng chạy `docker compose down -v`.
- File `.env.home` chứa mật khẩu database và khoá bí mật, do script tự tạo lần đầu. **Không gửi
  cho ai, không commit** (git đã bỏ qua nó). Mất file này thì server không mở được database cũ.
- Server chỉ nghe trên chính máy Mac (`127.0.0.1:8080`): máy khác trong nhà không vào thẳng được,
  mọi người đi qua link Cloudflare.
- Link `trycloudflare.com` là dịch vụ thử miễn phí, không có cam kết luôn chạy. Muốn link cố định
  (không đổi mỗi buổi, dùng được Google) thì cần tài khoản Cloudflare + tên miền ("named
  tunnel"), hoặc thuê VPS như [deploy.md](deploy.md).
