# Hướng dẫn từ đầu: bật Poker Friends để bạn bè vào chơi

Trang này dành cho **chủ phòng** (người có máy Mac chạy server). Làm theo từ trên xuống là có link
gửi bạn bè. Không cần biết lập trình. Mỗi lệnh dưới đây gõ vào ứng dụng **Terminal** của Mac
(mở bằng Spotlight: bấm ⌘ + Space, gõ "Terminal", Enter).

Máy Mac của bạn chính là server: bạn bè vào qua một link `https://….trycloudflare.com`, link đó
chuyển thẳng về máy bạn. Vì vậy **trong lúc chơi, máy phải bật, cắm sạc và có mạng**.

- Phần 1 làm **một lần duy nhất** (khoảng 20–30 phút).
- Phần 2 làm **mỗi buổi chơi**: chỉ cần **bấm ▶ trong Docker Desktop rồi copy link** (1 phút).
- Phần 3 là đoạn **dán cho bạn bè**.

---

## Phần 1. Cài đặt (một lần duy nhất)

### 1.1. Docker Desktop

Docker chạy server, database và trang web trong các "hộp" riêng, nên không phải cài từng thứ.

1. Tải Docker Desktop cho Mac: <https://www.docker.com/products/docker-desktop/>. Máy chip
   Apple (M1, M2, M3…) chọn bản **Apple Silicon**.
2. Kéo vào Applications, mở lên, đồng ý các bước cài đặt. Không cần đăng nhập tài khoản Docker.
3. Đợi biểu tượng cá voi trên thanh menu đứng yên (không còn nhấp nháy).

Kiểm tra: gõ lệnh dưới, thấy một con số phiên bản là được.

```bash
docker info --format '{{.ServerVersion}}'
```

### 1.2. Không cần cài gì thêm

Đường hầm Cloudflare (để bạn bè ở xa vào được máy bạn mà không phải chỉnh modem) chạy luôn trong
Docker, nên không phải cài `cloudflared` riêng.

### 1.3. Lấy code về máy

Nếu đã có thư mục dự án (ví dụ `~/Projects/notes-2026`) thì bỏ qua bước tải, chỉ cần **cập nhật
bản mới nhất**:

```bash
cd ~/Projects/notes-2026
```

```bash
git switch main
```

```bash
git pull
```

Nếu máy chưa có code (máy mới), tải về. Repo là riêng tư, nên đăng nhập GitHub trước bằng `gh`
(`brew install gh` rồi `gh auth login`, làm theo hướng dẫn trên màn hình):

```bash
gh repo clone MyLTHS/poker-friends ~/Projects/notes-2026
```

```bash
cd ~/Projects/notes-2026
```

Từ đây trở đi, **mọi lệnh đều chạy trong thư mục này**. Mở Terminal mới thì gõ lại
`cd ~/Projects/notes-2026` trước.

### 1.4. Dựng game lần đầu (bằng Terminal, chỉ một lần)

Mở Docker Desktop, đợi cá voi đứng yên, rồi chạy:

```bash
scripts/play-online.sh up
```

- Lần đầu phải tải và dựng mọi thứ nên mất **5–15 phút**. Script tự tạo file `.env.home` chứa
  mật khẩu và khoá bí mật. **Không gửi file này cho ai.**
- Chờ tới dòng **XONG**: script in ra link và copy sẵn vào clipboard.
- Từ giờ trong Docker Desktop, mục **Containers**, có nhóm **poker-home**: đó là cả game
  (database, server, web, đường hầm, sao lưu tự động).

Tạo luôn tài khoản quản trị (để xem phản hồi, lỗi, người chơi ở `<link>/admin/`). Tự gõ tên,
email, mật khẩu; lúc gõ mật khẩu màn hình không hiện gì, cứ gõ rồi Enter:

```bash
scripts/play-online.sh admin
```

**Mỗi khi cập nhật code** (`git pull` có thay đổi), chạy lại `scripts/play-online.sh up` một lần để
dựng bản mới. Nút ▶ trong Docker Desktop chỉ bật lại bản đã dựng.

### 1.5. Cho Mac không tự ngủ khi cắm sạc

Bấm ▶ trong Docker Desktop thì không có gì giữ máy thức. Mở **System Settings** → **Battery** →
**Options…** (máy bàn: **Energy**), bật **Prevent automatic sleeping on power adapter when the
display is off**. Màn hình vẫn tự tắt được, chỉ là máy không ngủ.

---

## Phần 2. Mỗi buổi chơi

### 2.1. Bật game và lấy link (khoảng 15 phút trước giờ chơi)

1. **Cắm sạc.** Mở **Docker Desktop**, đợi cá voi đứng yên.
2. Vào **Containers**, ở dòng nhóm **poker-home**, bấm nút **▶ (Start)**.
3. Bấm mũi tên **›** để mở nhóm, bấm vào container **poker-home-tunnel-1**, chọn tab **Logs**.
   Đợi vài giây sẽ thấy một khung chữ:

   ```
   Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):
   https://chu-ngau-nhien.trycloudflare.com
   ```

   Link `https://….trycloudflare.com` đó là **link của buổi hôm nay**. Bôi đen, copy. Mỗi lần bấm
   Start là một link mới, link cũ hết dùng được. Logs giữ cả các lần trước, nên nếu thấy nhiều
   khung như vậy thì lấy **khung cuối cùng** (dưới cùng).
4. **Tự thử trước:** mở link trên điện thoại, **tắt Wi‑Fi để dùng 4G** cho giống bạn bè ở xa.
   Link mới đôi khi cần chờ 30–60 giây mới mở được. Thấy trang sảnh là ổn.

Mỗi lần bấm Start, game **tự sao lưu** database vào thư mục `backups/` (rồi cứ 6 tiếng thêm một
bản trong lúc chạy; giữ 60 bản mới nhất).

Thích gõ lệnh hơn? `scripts/play-online.sh up` làm đúng những việc trên, còn giữ máy thức và copy
sẵn link; `scripts/play-online.sh status` cho xem lại link đang dùng.

### 2.2. Tạo bàn

1. Mở link của buổi trên máy tính. Trang hỏi **Bạn tên gì?**: gõ tên, bấm **Vào chơi**. (Có tài
   khoản rồi thì bấm **Đăng nhập** ngay dưới.)
2. Ở **Sảnh**, bấm **Tạo bàn**. Tên bàn, blind (10/20) và **chip đầu vào** (mặc định 100 blind lớn)
   đã điền sẵn; muốn đổi số ghế, giờ suy nghĩ, thưởng 7-2 hay bàn riêng thì mở **Thêm tuỳ chọn**.
3. Bấm **Tạo bàn**. Bạn vào thẳng bàn chơi, khung **Mời bạn** mở sẵn **link mời** và **mã QR**.
   Bấm **Chép link**.

### 2.3. Gửi bạn bè

Dán **đoạn ở Phần 3** vào nhóm chat, thay `<LINK MỜI PHÒNG>` bằng link mời. Bạn bè mở link, gõ tên
là vào bàn, không cần tài khoản.

Link mời chứa link của buổi, nên **mỗi buổi phải lấy lại link mời**: vào bàn cũ (Sảnh → bàn của
bạn), bấm **Mời bạn** → **Chép link**. Link mời có mã bí mật: chỉ gửi trong nhóm kín.

Có người tới muộn: bấm **Mời bạn** ngay trên bàn (trên điện thoại là biểu tượng người có dấu +)
để chép link hoặc cho họ quét mã QR.

### 2.4. Ngồi vào bàn là có chip

1. Bấm một **ghế trống** trên bàn. Ngồi xuống là có ngay **chip đầu vào** của bàn, không ai phải
   chờ chủ phòng.
2. Đủ **2 người có chip** là ván đầu tự chia. Các ván sau tự chia tiếp.
3. Ai thua hết chip thì bấm **Mua thêm** để lấy lại chip đầu vào (khi đã ra khỏi ván đang chơi).

Chủ phòng vẫn cấp thêm hoặc trừ bớt chip cho từng người ở **Bảng chủ phòng** (biểu tượng vương
miện trên thanh trên cùng), đổi blind hay chip đầu vào cũng ở đó.

### 2.5. Trong lúc chơi

- **Không gập máy.** Màn hình tự tắt thì không sao.
- Không tắt Docker Desktop, không ngắt Wi‑Fi, không cho máy cập nhật hay khởi động lại.
- Ai gặp lỗi lạ thì nhắc họ bấm **Gửi phản hồi** (nút có ở mọi màn), hoặc nhắn bạn kèm giờ.

### 2.6. Hết buổi

1. **Trước khi tắt**, kiểm tra sổ chip (trong Terminal). Dòng cuối phải là `OK: …`:

   ```bash
   docker compose -p poker-home -f docker-compose.prod.yml -f docker-compose.home.yml --env-file .env.home exec backend python manage.py check_ledger
   ```

2. Tắt: trong Docker Desktop bấm **■ (Stop)** ở dòng nhóm **poker-home**. Hoặc chạy lệnh dưới,
   lệnh này sao lưu thêm một bản cuối buổi rồi mới tắt:

   ```bash
   scripts/play-online.sh down
   ```

3. Mỗi tuần, chép thư mục `backups/` ra chỗ khác (Google Drive, ổ ngoài). Hỏng máy thì mất cả dữ
   liệu lẫn bản sao lưu nằm cùng máy.

Dữ liệu (tài khoản, phòng, chip, lịch sử) vẫn giữ nguyên khi tắt. Buổi sau bấm ▶ lại là có **link
mới**: ai có tài khoản thì đăng nhập lại là có lại phòng và chip. Người chơi bằng tên khách thì
trình duyệt quên họ khi đổi link; muốn giữ chip cho buổi sau, vào **Hồ sơ** nâng cấp thành tài
khoản (email và mật khẩu) trước khi tắt.

---

## Phần 3. Đoạn dán cho bạn bè

> 🃏 Tối nay chơi poker **chip ảo**, không tiền thật!
>
> **1.** Mở link này (chỉ dùng tối nay): `<LINK MỜI PHÒNG>`
> **2.** Điện thoại thì **xoay ngang** máy. Máy tính thì Chrome, Safari hay Edge đều được.
> **3.** Gõ tên của bạn, bấm **Vào chơi**.
> **4.** Bấm một ghế trống là có chip, đủ 2 người là chia bài. Hết chip thì bấm **Mua thêm**.
>
> Gặp gì lạ thì bấm **Gửi phản hồi** hoặc nhắn mình kèm giờ nhé!

Mẹo cho bạn bè:
- Trên máy tính, bấm phím `?` ở bàn để xem phím tắt: `F` bỏ bài, `C` check/theo, `R` tố.
- Âm thanh bật/tắt: trên máy tính ở biểu tượng bánh răng của bàn, trên điện thoại ở nút **Thêm**
  (dấu ba chấm).
- Lỡ đóng tab hay mất mạng thì mở lại link, bàn tự nối lại đúng chỗ.
- Chưa tới lượt mà đã biết sẽ làm gì thì bấm **Chọn trước** (Check / Bỏ, Check, Theo bất kỳ): tới
  lượt là tự làm, sang vòng mới thì tự huỷ.

---

## Phần 4. Khi gặp sự cố

| Chuyện gì | Làm gì |
|---|---|
| Không thấy nhóm **poker-home** trong Docker Desktop | Chưa dựng lần đầu: làm bước 1.4 |
| Logs của tunnel không hiện link sau một phút | Kiểm Wi‑Fi; bấm ■ rồi ▶ lại nhóm poker-home |
| `up` báo Docker chưa chạy | Mở Docker Desktop, đợi cá voi đứng yên, chạy lại `up` |
| `up` báo không lấy được link | Kiểm Wi‑Fi, đợi một lúc, chạy lại `up` |
| Link mới mở chưa được | Đợi 30–60 giây rồi thử lại |
| Bạn bè mở link cũ không vào được | Link đổi mỗi lần Start. Lấy link hiện tại trong Logs của **poker-home-tunnel-1** (hoặc `scripts/play-online.sh status`), gửi lại |
| Lỡ gập máy, máy ngủ, mất điện | Mở máy, mở Docker Desktop, bấm ■ rồi ▶ nhóm **poker-home**, lấy link mới trong Logs, lấy lại link mời phòng và gửi lại |
| `up` báo đã có một server khác đang chạy | Làm đúng lệnh `docker compose -p … down` mà script in ra, rồi chạy lại `up` |
| Bàn báo "tạm dừng" | [runbook.md](runbook.md#bàn-tạm-dừng) (thay `dc` bằng lệnh `docker compose -p poker-home …` như ở bước 2.6) |
| Nghi chip bị sai | Chạy lệnh kiểm sổ chip ở bước 2.6, rồi xem [runbook.md](runbook.md#lệch-chip) |

Chi tiết hơn: [choi-online.md](choi-online.md) (cách chơi online hoạt động) và
[beta-f.md](beta-f.md) (sổ tay buổi beta: điều kiện đạt, cách xếp phản hồi).

**Đừng bao giờ** chạy `docker compose down -v` hay xoá volume `poker-home_pgdata`: đó là toàn bộ
dữ liệu.
