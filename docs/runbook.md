# Runbook: xử lý sự cố

Trang này dùng **khi có chuyện**: làm theo từng bước, không cần hiểu hết code. Điều bắt buộc khi
cài server nằm ở [deploy.md](deploy.md). Các lệnh dưới đây chạy **trên server**, trong thư mục
chứa code (ví dụ `/srv/poker-friends`).

Cho gọn, mọi chỗ ghi `dc` nghĩa là:

```bash
alias dc='docker compose -f docker-compose.prod.yml'
```

## Ba điều luôn nhớ

1. **Không bao giờ xoá hay sửa tay** dòng nào trong sổ chip (`LedgerEntry`) hay log lệnh
   (`HandCommand`). Database cũng chặn việc này. Sai thì *thêm* dòng bù, không xoá dòng cũ.
2. **Backup trước khi động vào database** (đổi bản, khôi phục, sửa dữ liệu):
   `dc run --rm tools scripts/backup.sh`.
3. **Lưu log trước khi khởi động lại**, vì khởi động lại xong thì manh mối dễ mất:
   `dc logs --no-color --tail 2000 backend > su-co-$(date +%F-%H%M).log`.

## Lệnh hay dùng

| Muốn biết | Lệnh |
|---|---|
| Container nào đang chạy, có khoẻ không | `dc ps` |
| Log server (Django, Daphne) | `dc logs --tail 200 backend` |
| Sổ chip có lệch không | `dc exec backend python manage.py check_ledger` |
| Ổ đĩa còn trống không | `df -h` |
| Backup hằng ngày có còn chạy không (có bản trong 26 giờ qua) | `scripts/check-backup-age.sh` |

`check_ledger` in từng phòng: `[ok ]` là ổn, `[LỖI]` kèm danh sách lỗi. Dòng "ván #N đang chơi
dở" là **bình thường** (có bàn đang chơi, hoặc server tắt giữa ván; server sẽ chơi tiếp). Lệnh
kết thúc bằng `OK: ...` là không lệch, `LỆCH: ...` thì xem mục [Lệch chip](#lệch-chip).

## Sau buổi chơi: phản hồi và lỗi

Phản hồi người chơi gửi và lỗi JavaScript trình duyệt tự báo **chỉ xem được trong Django Admin**
(không có trang hay API nào đọc lại). Vào `https://<tên miền>/admin/` bằng tài khoản staff; chưa
có thì tạo một lần: `dc exec backend python manage.py createsuperuser`. Trong nhóm "Phản hồi và lỗi
trình duyệt":

- **Phản hồi**: mới nhất ở trên, lọc theo loại (Lỗi / Ý tưởng / Khác) và theo phòng ở cột bên
  phải, theo ngày ở thanh trên. Mỗi dòng có người gửi, trang đang mở và trình duyệt.
- **Lỗi trình duyệt**: cùng lỗi trên cùng trang của cùng bản (`release`), trong cùng khung 10 phút
  (10:00–10:10, 10:10–10:20…), chỉ là một dòng, cột `Count` đếm số lần. Lọc theo `release` để biết
  lỗi thuộc bản nào, mở dòng để xem `stack`.

Cookie, token trong link và bài đã bị xoá trước khi lưu (chỗ đó ghi `[đã xoá]`). Hai bảng chỉ xem
và xoá được, không sửa. Lỗi phía server (bàn tạm dừng, lệch chip) vẫn nằm trong log, xem các mục
dưới.

## Server sập

Dấu hiệu: trang web không vào được, hoặc vào được nhưng bàn báo mất kết nối mãi.

1. `dc ps`. Xem cột STATUS:
   - Có container không ở trạng thái `Up` / `healthy`: xem log của nó (`dc logs --tail 200 <tên>`),
     lưu log (điều 3 ở trên), rồi `dc up -d` để chạy lại.
   - `backend` cứ khởi động lại liên tục: thường là lỗi cấu hình (`.env`) hoặc migration lỗi.
     Đọc dòng lỗi cuối trong log. Nếu vừa đổi bản thì [quay về bản trước](#quay-về-bản-trước).
2. Ổ đĩa đầy (`df -h` báo 100%): Postgres sẽ dừng ghi. Xoá bớt backup cũ trong `backups/` (sau
   khi đã chép ra ngoài) hoặc `docker image prune` để bỏ image cũ không dùng, rồi `dc up -d`.
3. Tất cả đều `Up` mà vẫn không vào được: kiểm tên miền còn trỏ đúng IP server không, và
   `dc logs --tail 100 caddy` (lỗi chứng chỉ HTTPS hiện ở đây).

Sau khi server lên lại: bàn đang chơi **tự dựng lại** từ database lúc có người mở trang bàn đó
(không cần làm gì). Chạy `check_ledger` để chắc sổ chip vẫn đúng, rồi báo bạn bè vào lại.

## Bàn tạm dừng

Dấu hiệu: người chơi thấy bàn "tạm dừng" (`room.suspended`), các bàn khác vẫn chạy. Nghĩa là
server đã ghi một lệnh nhưng engine không áp được, nên dừng bàn thay vì đoán
([ADR-001](adr/ADR-001-table-actor.md) mục 5). Nguyên nhân nằm trong log, dòng
`room <room_id> suspended: ...` (mức CRITICAL).

1. Lưu log, rồi **khởi động lại**: `dc restart backend`. Mở trang bàn đó: bàn chỉ được dựng lại
   khi có người mở nó. Nếu lỗi chỉ thoáng qua (ví dụ database chập chờn) thì bàn chạy tiếp.
2. Nếu bàn **vẫn tạm dừng**, tìm trong log dòng `replay of hand <hand_id> failed`, rồi huỷ ván đó:

   ```bash
   dc exec backend python manage.py void_hand <hand_id> --reason "mô tả ngắn lỗi"
   ```

   Chip chỉ ghi sổ khi ván xong, nên huỷ ván dở là mọi người về đúng số dư trước ván đó.
3. `dc restart backend` lần nữa, mở lại bàn, chạy `check_ledger`, báo người chơi vào lại.
4. Ghi lại `hand_id` và log để tìm lỗi trong code (log lệnh của ván vẫn còn nguyên).

## Lệch chip

Dấu hiệu: `check_ledger` báo `LỆCH`, hoặc người chơi kêu số chip sai.

**Đừng sửa gì vội.** Sổ chip chỉ thêm, không mất gì, nên có thời gian điều tra.

1. Lưu báo cáo: `dc exec backend python manage.py check_ledger > lech-$(date +%F-%H%M).txt`.
   Backup ngay (`dc run --rm tools scripts/backup.sh`) để giữ đúng trạng thái lúc phát hiện.
2. Đọc lỗi:

   | Báo cáo ghi | Nghĩa là | Làm gì |
   |---|---|---|
   | `tổng chip đang có ... khác tổng chip đã cấp` | Có ván tạo ra hoặc làm mất chip | Xem các dòng lỗi ván đi kèm để biết ván nào |
   | `ván #N: chip ghi sổ cộng lại X, phải bằng 0` | Ván đó ghi sổ không cân | Lỗi code: dừng cho chơi phòng đó, báo Claude kèm file báo cáo |
   | `ván #N: sổ chip ... khác kết quả đã lưu` | Sổ và kết quả ván không khớp | Như trên |
   | `ván #N: replay ra kết quả khác` | Chơi lại ván từ log lệnh không ra kết quả cũ | Thường là engine đã đổi luật; báo Claude, **không** huỷ ván đã xong |
   | `có số dư âm` | Ai đó đang nợ chip | Kiểm các lần cấp chip (có thể là cấp số âm nhầm) |
   | `thiếu ván số ...` | Có ván mất khỏi database | Thường gặp sau khôi phục hỏng: khôi phục lại từ backup khác |
   | `ván chưa xong không phải ván cuối` | Ván cũ bị kẹt | Huỷ ván đó bằng `void_hand` (mục trên), server tắt trước khi dùng `--force` |

3. Nếu số chip một người sai thật và đã biết đúng phải là bao nhiêu: chủ phòng **cấp bù**
   (số dương hoặc âm) qua chức năng cấp chip của phòng, ghi rõ lý do trong nhóm chat. Không bao giờ
   sửa dòng sổ cũ. Chạy lại `check_ledger` sau đó.

## Khôi phục backup

Khi nào: database hỏng hoặc mất (ổ đĩa hỏng, xoá nhầm, máy chủ mới). **Mọi ván sau lần backup
đó sẽ mất**: báo bạn bè trước.

1. Dừng app, giữ database chạy: `dc stop caddy web backend`.
2. Chọn file backup: `ls -lt backups/` (mới nhất ở trên). Nếu server mới, chép file từ chỗ lưu
   ngoài vào `backups/`.
3. Tạo một database **mới, trống** và khôi phục vào đó (không ghi đè database cũ). Các lệnh dưới
   đây lấy tên người dùng và mật khẩu từ `.env` bên trong container, nên **không gõ mật khẩu**
   ra dòng lệnh (dòng lệnh được lưu lại trong lịch sử shell). Giữ nguyên dấu nháy đơn `'...'`:

   ```bash
   dc exec db sh -c 'createdb -U "$POSTGRES_USER" poker_restored'
   dc run --rm tools sh -c \
     'scripts/restore.sh -d "${DATABASE_URL%/*}/poker_restored" backups/<tên-file>.dump'
   ```

   (`${DATABASE_URL%/*}/poker_restored` là địa chỉ database trong `.env`, đổi tên cuối thành
   `poker_restored`.)

   Script từ chối nếu database đích đã có bảng. Cờ `--overwrite-existing-data` cho phép ghi đè,
   **chỉ dùng khi chắc chắn** database đích là bản hỏng không cần giữ.
4. Kiểm bản vừa khôi phục, phải ra `OK`:

   ```bash
   dc run --rm --no-deps backend sh -c \
     'DATABASE_URL="${DATABASE_URL%/*}/poker_restored" python manage.py check_ledger'
   ```

5. Đổi tên để app dùng bản khôi phục, giữ bản cũ lại để điều tra:

   ```bash
   dc exec db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "ALTER DATABASE \"$POSTGRES_DB\" RENAME TO poker_hong"'
   dc exec db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "ALTER DATABASE poker_restored RENAME TO \"$POSTGRES_DB\""'
   ```

   (Database cũ mất hẳn thì bỏ lệnh đầu. Đã có `poker_hong` từ lần trước thì đổi tên khác, ví dụ
   `poker_hong_2`.)
6. `dc up -d`, vào thử một bàn, chạy `check_ledger` lần nữa.

### Backup hằng ngày và diễn tập

- Hằng ngày lúc 4 giờ sáng (thêm bằng `crontab -e` trên server). `mkdir -p backups` đứng trước
  vì thư mục này không có trong git: thiếu nó thì shell không mở được file log và cron không
  chạy gì cả, lặng lẽ:

  ```
  0 4 * * * cd /srv/poker-friends && mkdir -p backups && { docker compose -f docker-compose.prod.yml run --rm -T tools scripts/backup.sh && scripts/check-backup-age.sh; } >> backups/backup.log 2>&1
  ```

- Ngay sau khi thêm cron, **chạy tay một lần** cùng lệnh đó (bỏ phần `0 4 * * *`), rồi
  `scripts/check-backup-age.sh` phải ra `OK`. Sau đó mỗi lần lên server (ít nhất mỗi tuần) chạy
  lại `scripts/check-backup-age.sh`: báo `FAIL` nghĩa là cron đã ngừng, xem `backups/backup.log`.

- Backup nằm cùng ổ với database thì hỏng ổ là mất cả hai: **chép ra ngoài** (máy khác, Google
  Drive...) ít nhất mỗi tuần. Xoá bản cũ trên server khi đã chép:
  `find backups -name '*.dump' -mtime +14 -delete`.
- Backup chưa thử khôi phục thì coi như chưa có. CI tự diễn tập mỗi PR và mỗi Chủ nhật (workflow
  `Ops`, job `restore-drill`: chơi ván, backup, khôi phục vào database khác, `check_ledger`). Khi
  có staging, mỗi tháng làm tay các bước trên với backup thật của production, trên staging.

## Đổi bản

Mỗi bản production là một tag `vX.Y.Z`. Chỉ có **một** backend: `dc up -d` dừng bản cũ rồi mới
chạy bản mới, nên bàn đang chơi gián đoạn vài giây rồi tự dựng lại.

Image được đặt tên theo `APP_VERSION` trong `.env`. Build khi `APP_VERSION` vẫn là tag cũ thì
image mới **đè lên** image của bản cũ, và không còn gì để quay về. Nên luôn đổi `APP_VERSION`
**trước** khi build, đúng thứ tự dưới đây.

1. Ghi lại tag đang chạy (`grep APP_VERSION .env`): cần nó để quay về.
2. Backup: `dc run --rm tools scripts/backup.sh` (bản mới có thể chạy migration).
3. Lấy code: `git fetch --tags && git checkout vX.Y.Z`.
4. Sửa `APP_VERSION=vX.Y.Z` trong `.env` (đúng tag vừa checkout), **rồi mới** build và chạy:
   `dc up -d --build`.
5. `dc ps` (tất cả `healthy`), vào thử một bàn, chạy `check_ledger`. `docker image ls poker-friends-backend`
   phải thấy cả tag cũ lẫn tag mới.

## Quay về bản trước

Khi bản mới lỗi. Image của bản cũ vẫn còn trên server (cùng tên, tag cũ, nếu lúc đổi bản đã đổi
`APP_VERSION` trước khi build), nên không cần build.

1. Sửa `APP_VERSION=<tag cũ>` trong `.env`, rồi:

   ```bash
   git checkout <tag cũ>
   dc up -d --no-build
   ```

2. `dc ps`, vào thử một bàn, `check_ledger`.

Migration được viết để bản cũ vẫn chạy trên database của bản mới (roadmap mục E), nên thường
chỉ cần vậy. Nếu bản cũ không chạy được vì database đã đổi: [khôi phục](#khôi-phục-backup) backup
chụp ở bước 1 của lần đổi bản (mất các ván chơi sau lúc đó), rồi làm lại bước 1 ở đây.

> Phần chưa có (chờ VPS, roadmap E): GitHub Actions tự deploy khi gắn tag, có bước duyệt; Sentry
> báo lỗi. Khi có, mục "Đổi bản" và "Quay về bản trước" sẽ thành chạy lại workflow với tag.
