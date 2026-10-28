# Deploy và vận hành

> Phần **staging thật trên VPS chưa làm**: chờ chủ dự án có VPS, tên miền và SSH key (roadmap B5).
> Cấu hình production đã có và được CI dựng thử mỗi PR (workflow `Ops`, job `prod-smoke`):
> [`docker-compose.prod.yml`](../docker-compose.prod.yml), [`deploy/Caddyfile`](../deploy/Caddyfile),
> mẫu `.env` ở [`deploy/env.production.example`](../deploy/env.production.example). Trang này ghi
> những điều **bắt buộc đúng** khi deploy; xử lý sự cố, backup, đổi bản: [runbook.md](runbook.md).
>
> Trước khi có VPS, các buổi chơi thử chạy trên máy Mac của chủ dự án qua Cloudflare Tunnel:
> [choi-online.md](choi-online.md) (`scripts/play-online.sh`, `docker-compose.home.yml`).

## Bắt buộc khi deploy

1. **Chỉ một process ASGI** (một Daphne). Mỗi phòng có đúng một "người ghi" sống trong bộ nhớ của
   process ([ADR-001](adr/ADR-001-table-actor.md)); hai process là hai người ghi cho cùng một bàn.
   Không bật nhiều worker, không chạy hai container `backend` cùng lúc (kể cả lúc đổi bản: dừng bản
   cũ rồi mới chạy bản mới; bàn đang chơi tự khôi phục từ DB khi bản mới lên).
2. **Biến môi trường** (mẫu ở `.env.example`):
   - `DJANGO_DEBUG=false`, `DJANGO_SECRET_KEY` dài 32+ ký tự ngẫu nhiên (server không chạy nếu yếu).
     Quên đặt `DJANGO_DEBUG` thì mặc định đã là tắt; quên `DJANGO_SECRET_KEY` thì Daphne không chạy.
     Riêng `manage.py` tự bật debug khi **không** có `DJANGO_SECRET_KEY` (coi là máy dev).
   - `DJANGO_ALLOWED_HOSTS=<tên-miền>`, `FRONTEND_URL=https://<tên-miền>`.
   - `DJANGO_BEHIND_HTTPS_PROXY=true`: Django tin header `X-Forwarded-Proto` của Caddy, nên link
     callback Google là `https://...`, cookie phiên và CSRF chỉ gửi qua HTTPS. Biến này còn bật
     chuyển hướng `http://` sang `https://` và HSTS (trình duyệt nhớ chỉ dùng HTTPS, mặc định 30
     ngày, không gồm subdomain; chỉnh bằng `DJANGO_HSTS_SECONDS`). Health check gọi thẳng Django
     bằng `http://` mà không có header `X-Forwarded-Proto: https` sẽ nhận 301.
   - `TRUSTED_PROXIES=1` nếu Caddy trỏ thẳng vào Django (đúng số proxy đứng trước Django). Sai số
     này thì rate limit theo IP hỏng: hoặc mọi người chung một IP, hoặc người dùng tự khai IP giả.
   - `EMAIL_URL`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`: [hướng dẫn](huong-dan-google-smtp.md).
     Thêm redirect URI `https://<tên-miền>/accounts/google/login/callback/` vào Google Cloud.
3. **WebSocket kiểm Origin**: trang web phải được mở từ một tên trong `DJANGO_ALLOWED_HOSTS`. Thử
   bản dev từ điện thoại qua địa chỉ LAN (ví dụ `192.168.1.5`) thì thêm địa chỉ đó vào biến này.
4. **Heartbeat** có sẵn: Daphne ping WebSocket khi kết nối im 20 giây, đóng nếu 30 giây không có
   pong. Caddy phải để WebSocket đi qua (mặc định của `reverse_proxy` đã được) và không cắt kết nối
   im lặng dưới 60 giây.

## Cài lần đầu trên server

1. Cài Docker, trỏ tên miền về IP server, mở cổng 80 và 443.
2. `git clone` repo vào `/srv/poker-friends`, `cp deploy/env.production.example .env`, sửa mọi
   chỗ có "doi-ten" / "thay-bang" (mục 2 ở trên).
3. `docker compose -f docker-compose.prod.yml up -d --build`. Caddy tự lấy chứng chỉ HTTPS.
4. Backup lần đầu và kiểm nó (thư mục `backups/` không có trong git nên tạo trước):

   ```bash
   mkdir -p backups
   docker compose -f docker-compose.prod.yml run --rm tools scripts/backup.sh
   scripts/check-backup-age.sh
   ```

5. Đặt backup hằng ngày bằng cron: [runbook.md](runbook.md#backup-hằng-ngày-và-diễn-tập).

Sao lưu và khôi phục (`scripts/backup.sh`, `scripts/restore.sh`, rồi `check_ledger`), bàn tạm
dừng, lệch chip, đổi bản và quay về bản trước: [runbook.md](runbook.md).

## Sự cố: "Bàn tạm dừng" (`room.suspended`)

Server đã ghi một lệnh nhưng engine không áp được, nên dừng phòng thay vì đoán (ADR-001 mục 5).
Các bước xử lý (khởi động lại, `void_hand`): [runbook.md](runbook.md#bàn-tạm-dừng).
