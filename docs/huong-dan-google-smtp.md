# Hướng dẫn: tạo key Google và cấu hình gửi email (B6)

Dành cho chủ dự án. Chưa làm hai việc này thì web vẫn chạy: nút "Đăng nhập bằng Google" bị ẩn,
và email (link xác minh, link đặt lại mật khẩu) chỉ **in ra terminal đang chạy Django** để chép
link. Làm xong thì ghi các giá trị vào file `.env` ở thư mục gốc (file này không bao giờ commit;
mẫu ở `.env.example`) rồi **khởi động lại Django**.

## Phần 1 — Key đăng nhập Google (khoảng 10 phút)

Cần một tài khoản Google. Giao diện Google Cloud hay đổi chữ; nếu không thấy đúng tên nút thì tìm
mục gần nghĩa nhất.

1. Mở <https://console.cloud.google.com/>, đăng nhập. Ở thanh trên cùng bấm chọn project →
   **New project**, đặt tên `Poker Friends`, bấm **Create**, rồi chọn project vừa tạo.
2. Ô tìm kiếm trên cùng gõ **Google Auth Platform** (tên cũ: *OAuth consent screen*) và mở nó.
   Bấm **Get started**:
   - *App name*: `Poker Friends`; *User support email*: email của bạn.
   - *Audience*: **External** (bạn bè dùng Gmail riêng của họ).
   - *Contact information*: email của bạn. Đồng ý điều khoản, bấm **Create**.
3. Mục **Audience**: app mới ở chế độ *Testing* — chỉ những email có trong danh sách
   **Test users** mới đăng nhập được. Chọn một trong hai:
   - Thêm email từng người bạn vào **Test users** (tối đa 100 người), hoặc
   - Bấm **Publish app**. Dự án chỉ xin tên + email (quyền cơ bản) nên Google không bắt duyệt; người
     dùng có thể thấy cảnh báo "app chưa xác minh" lần đầu, bấm tiếp là được.
4. Mục **Clients** → **Create client**:
   - *Application type*: **Web application**, *Name*: `Poker Friends web`.
   - *Authorized redirect URIs* → **Add URI**, dán đúng từng ký tự (kể cả dấu `/` cuối):
     `http://localhost:8000/accounts/google/login/callback/`
     Sau này có tên miền thật thì thêm một dòng nữa:
     `https://<tên-miền>/accounts/google/login/callback/`
   - Bấm **Create**.
5. Google hiện **Client ID** và **Client secret**. Chép cả hai ngay (secret có thể chỉ hiện một
   lần; lỡ mất thì vào client đó tạo secret mới). Đừng dán secret vào chat, issue hay commit.
6. Mở `.env`, điền:

   ```bash
   GOOGLE_CLIENT_ID=1234567890-abc...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   ```

7. Khởi động lại Django rồi kiểm tra: mở <http://localhost:3000/api/auth/config/> (khi đang chạy
   `npm run dev` trong `web/`) phải thấy `{"google_enabled": true}`. Mở
   <http://localhost:3000/account>: nút **Đăng nhập bằng Google** hiện ra; bấm thử.

**Hay gặp:** Google báo `redirect_uri_mismatch` → URI ở bước 4 lệch một ký tự (thiếu `/` cuối,
`https` thay vì `http`, `127.0.0.1` thay vì `localhost`). Trang lỗi của Google ghi URI mà server
gửi lên: chép đúng URI đó vào bước 4.

## Phần 2 — Gửi email thật (khoảng 5 phút, dùng Gmail)

Gmail miễn phí, gửi được khoảng 500 email/ngày — thừa cho 20 người. Cần bật xác minh 2 bước cho
tài khoản Gmail dùng để gửi (nên dùng một Gmail riêng cho dự án).

1. Mở <https://myaccount.google.com/security>, bật **2-Step Verification** nếu chưa bật.
2. Mở <https://myaccount.google.com/apppasswords>, đặt tên `Poker Friends`, bấm **Create**.
   Google hiện **mật khẩu ứng dụng** 16 chữ (dạng `abcd efgh ijkl mnop`). Chép lại, **bỏ dấu cách**.
   Đây không phải mật khẩu Gmail của bạn; lộ thì vào lại trang này xoá nó.
3. Mở `.env`, điền (thay `ten` bằng tên Gmail; ký tự `@` trong tên đăng nhập viết thành `%40`):

   ```bash
   EMAIL_URL=smtp://ten%40gmail.com:abcdefghijklmnop@smtp.gmail.com:587
   DEFAULT_FROM_EMAIL=Poker Friends <ten@gmail.com>
   ```

4. Khởi động lại Django, rồi gửi thử một email tới chính bạn:

   ```bash
   uv run python manage.py sendtestemail email-cua-ban@gmail.com
   ```

   Không báo lỗi và hộp thư nhận được email "Test email from ..." là xong. Nhớ xem cả thư mục Spam.

**Hay gặp:** `SMTPAuthenticationError` → sai mật khẩu ứng dụng, hoặc quên đổi `@` thành `%40`.
Muốn quay lại in email ra terminal: xoá giá trị `EMAIL_URL` (để `EMAIL_URL=`).

Dùng dịch vụ khác (Brevo, Mailgun, Zoho...): lấy host/cổng/tên đăng nhập/mật khẩu SMTP của dịch vụ
đó và ghép theo cùng mẫu. Cổng 465 thì dùng `smtps://` thay cho `smtp://`.

## Phần 3 — Khi chạy web ở địa chỉ khác

Link trong email và cuối luồng Google đưa người dùng về `FRONTEND_URL` (mặc định
`http://localhost:3000`). Chạy web ở cổng hay tên miền khác thì sửa trong `.env`, ví dụ
`FRONTEND_URL=https://poker.ten-mien.vn`. Địa chỉ này cũng được Django tự tin cậy cho CSRF.

## Ghi chú cho đợt staging/production (chưa làm ở B6)

- Sau Caddy (HTTPS), Django cần biết request gốc là `https` (`SECURE_PROXY_SSL_HEADER`) để gửi
  Google đúng `https://.../callback/`.
- Rate limit theo IP: sau reverse proxy mọi request có cùng IP của proxy. Đặt `TRUSTED_PROXIES`
  trong `.env` bằng đúng số proxy đứng trước Django (Caddy trỏ thẳng vào Django thì là `1`) để
  Django đọc IP thật từ header `X-Forwarded-For`. Đặt sai thì hoặc mọi người bị tính chung một
  IP, hoặc người dùng tự khai IP giả được.
