# Deploy và vận hành (bản nháp B5)

> Phần **staging thật trên VPS chưa làm**: chờ chủ dự án có VPS, tên miền và SSH key (roadmap B5).
> Trang này ghi những điều **bắt buộc đúng** khi deploy, rút ra từ code đã có, và quy trình xử lý
> sự cố đã có lệnh. Cấu hình Caddy/Compose cho production viết và thử cùng lúc với staging.

## Bắt buộc khi deploy

1. **Chỉ một process ASGI** (một Daphne). Mỗi phòng có đúng một "người ghi" sống trong bộ nhớ của
   process ([ADR-001](adr/ADR-001-table-actor.md)); hai process là hai người ghi cho cùng một bàn.
   Không bật nhiều worker, không chạy hai container `backend` cùng lúc (kể cả lúc đổi bản: dừng bản
   cũ rồi mới chạy bản mới; bàn đang chơi tự khôi phục từ DB khi bản mới lên).
2. **Biến môi trường** (mẫu ở `.env.example`):
   - `DJANGO_DEBUG=false`, `DJANGO_SECRET_KEY` dài 32+ ký tự ngẫu nhiên (server không chạy nếu yếu).
   - `DJANGO_ALLOWED_HOSTS=<tên-miền>`, `FRONTEND_URL=https://<tên-miền>`.
   - `DJANGO_BEHIND_HTTPS_PROXY=true`: Django tin header `X-Forwarded-Proto` của Caddy, nên link
     callback Google là `https://...`, cookie phiên và CSRF chỉ gửi qua HTTPS.
   - `TRUSTED_PROXIES=1` nếu Caddy trỏ thẳng vào Django (đúng số proxy đứng trước Django). Sai số
     này thì rate limit theo IP hỏng: hoặc mọi người chung một IP, hoặc người dùng tự khai IP giả.
   - `EMAIL_URL`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`: [hướng dẫn](huong-dan-google-smtp.md).
     Thêm redirect URI `https://<tên-miền>/accounts/google/login/callback/` vào Google Cloud.
3. **WebSocket kiểm Origin**: trang web phải được mở từ một tên trong `DJANGO_ALLOWED_HOSTS`. Thử
   bản dev từ điện thoại qua địa chỉ LAN (ví dụ `192.168.1.5`) thì thêm địa chỉ đó vào biến này.
4. **Heartbeat** có sẵn: Daphne ping WebSocket khi kết nối im 20 giây, đóng nếu 30 giây không có
   pong. Caddy phải để WebSocket đi qua (mặc định của `reverse_proxy` đã được) và không cắt kết nối
   im lặng dưới 60 giây.

## Sao lưu và khôi phục (diễn tập khi có staging)

Dữ liệu cần giữ nằm hết trong PostgreSQL (sổ chip, ván, lệnh, tài khoản). Redis chỉ là kênh phát
tin, mất không sao.

```bash
docker compose exec -T db pg_dump -U poker -Fc poker > backup-$(date +%F).dump
```

Khôi phục vào một DB trống (diễn tập trên staging, không bao giờ trên production đang chạy):

```bash
docker compose exec -T db pg_restore -U poker -d poker --clean --if-exists < backup-YYYY-MM-DD.dump
```

Sau khi khôi phục: kiểm tổng chip mỗi phòng bằng tổng chip đã cấp (Django Admin hoặc truy vấn
`LedgerEntry`), rồi khởi động server và vào thử một bàn.

## Sự cố: "Bàn tạm dừng" (`room.suspended`)

Nghĩa là server đã ghi một lệnh nhưng engine không áp được, nên dừng phòng thay vì đoán
(ADR-001 mục 5). Các phòng khác vẫn chạy.

1. **Khởi động lại server.** Lúc khởi động, phòng được dựng lại bằng replay. Nếu lỗi chỉ thoáng qua
   thì phòng chạy tiếp như thường.
2. Nếu phòng **vẫn tạm dừng** sau khởi động lại (replay hỏng ở cùng một lệnh), xem log tìm dòng
   `replay of hand <hand_id> failed`, rồi huỷ ván đó:

   ```bash
   uv run python manage.py void_hand <hand_id> --reason "mô tả ngắn lỗi"
   ```

   Chip chỉ ghi sổ khi ván xong, nên huỷ ván dở là mọi người về đúng số dư trước ván. Log lệnh
   (`HandCommand`) giữ nguyên để điều tra; **không bao giờ xoá tay**.
3. **Khởi động lại server lần nữa** để phòng dựng lại từ DB, rồi báo người chơi vào lại.
