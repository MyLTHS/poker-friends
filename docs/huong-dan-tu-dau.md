# Hướng dẫn từ đầu: bật Poker Friends để bạn bè vào chơi

Trang này dành cho **chủ phòng** (người có máy Mac chạy server). Làm theo từ trên xuống là có link
gửi bạn bè. Không cần biết lập trình. Mỗi lệnh dưới đây gõ vào ứng dụng **Terminal** của Mac
(mở bằng Spotlight: bấm ⌘ + Space, gõ "Terminal", Enter).

Máy Mac của bạn chính là server: bạn bè vào qua một link `https://….trycloudflare.com`, link đó
chuyển thẳng về máy bạn. Vì vậy **trong lúc chơi, máy phải bật, cắm sạc và có mạng**.

- Phần 1 làm **một lần duy nhất** (khoảng 20–30 phút).
- Phần 2 làm **mỗi buổi chơi** (khoảng 5 phút).
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

### 1.2. Homebrew và cloudflared

`cloudflared` là chương trình mở "đường hầm" để bạn bè ở xa vào được máy bạn mà không phải chỉnh
modem. Nó được cài qua Homebrew.

Kiểm tra đã có Homebrew chưa:

```bash
brew --version
```

Nếu báo `command not found`: cài Homebrew theo một dòng lệnh ở <https://brew.sh>, làm theo các
dòng "Next steps" nó in ra cuối cùng, rồi mở lại Terminal.

Cài cloudflared:

```bash
brew install cloudflared
```

Kiểm tra (thấy dòng `cloudflared version …` là được):

```bash
cloudflared --version
```

### 1.3. Lấy code về máy

Nếu đã có thư mục dự án (ví dụ `~/Projects/notes-2026`) thì bỏ qua bước tải, chỉ cần **cập nhật
bản mới nhất**:

```bash
cd ~/Projects/notes-2026
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

---

## Phần 2. Mỗi buổi chơi

### 2.1. Bật server (khoảng 15 phút trước giờ chơi)

1. **Cắm sạc.** Mở **Docker Desktop**, đợi cá voi đứng yên.
2. Vào thư mục dự án và bật:

   ```bash
   cd ~/Projects/notes-2026
   ```

   ```bash
   scripts/play-online.sh up
   ```

   - Lần đầu tiên phải tải và dựng mọi thứ nên mất **5–15 phút**. Các lần sau khoảng 1 phút.
   - Lần đầu, script tự tạo file `.env.home` chứa mật khẩu và khoá bí mật. **Không gửi file này
     cho ai.**
   - Chờ tới dòng **XONG** và một link dạng `https://chu-ngau-nhien.trycloudflare.com`. Đó là
     **link của buổi hôm nay**. Mỗi lần `up` là một link mới.
3. **Tự thử trước:** mở link trên điện thoại, **tắt Wi‑Fi để dùng 4G** cho giống bạn bè ở xa.
   Thấy trang sảnh là ổn. Link mới đôi khi cần chờ 30–60 giây mới mở được.

Quên link thì xem lại bằng:

```bash
scripts/play-online.sh status
```

### 2.2. Tạo tài khoản quản trị (chỉ lần đầu)

Tài khoản này để xem phản hồi, lỗi và danh sách người chơi trong trang quản trị. Khi server đang
chạy:

```bash
scripts/play-online.sh admin
```

Tự gõ tên, email và mật khẩu (lúc gõ mật khẩu màn hình không hiện gì, cứ gõ rồi Enter). Trang
quản trị là `<link của buổi>/admin/`.

### 2.3. Tạo phòng

1. Mở link của buổi trên máy tính. Trang mở ra **Sảnh**.
2. Bấm **Tạo phòng**. Lần đầu, trang báo "Đăng nhập để mở bàn": bấm **Đăng nhập hoặc chơi bằng
   khách**, rồi bấm **Chơi ngay bằng khách** (hoặc **Đăng ký** bằng email nếu muốn giữ chip và lịch
   sử qua nhiều buổi; tự xác minh bằng `scripts/play-online.sh verify email-cua-ban@gmail.com`).
   Xong bấm **Sảnh** ở thanh trên, rồi **Tạo phòng** lần nữa.
3. Điền form tạo phòng:
   - đặt tên, blind (ví dụ 10/20), số ghế, thời gian suy nghĩ;
   - **thưởng 7-2** nếu muốn;
   - chọn **Riêng** để chỉ người có link mời mới vào được.
4. Bấm **Tạo phòng & lấy link mời**. Trang phòng hiện **link mời** và **mã QR**. Bấm **Chép
   link** để copy.

### 2.4. Gửi bạn bè

Dán **đoạn ở Phần 3** vào nhóm chat, thay `<LINK MỜI PHÒNG>` bằng link mời ở bước 2.3. Bạn bè
**chỉ cần đúng link mời này**: mở ra là web tự tạo tài khoản khách và đưa họ vào phòng, không phải
đăng ký hay mở link nào khác.

Link mời có mã bí mật: chỉ gửi trong nhóm kín.

### 2.5. Ngồi vào bàn và cấp chip

1. Ở trang phòng, bấm **Ngồi đây** cạnh một ghế trống (hoặc **Vào bàn chơi** rồi **Ngồi vào**).
2. Đợi bạn bè vào và **ngồi xuống ghế**. Chủ phòng chỉ cấp chip được cho người **đang ngồi**.
3. Bấm biểu tượng **vương miện** (Bảng chủ phòng) trên thanh trên cùng. Ở mục **Người chơi &
   chip**, bấm **Cấp/trừ** cạnh từng người, rồi **Cấp 500** (hoặc gõ số khác). Nhớ cấp cho cả
   chính mình.
4. Đủ **2 người có chip** là ván đầu tự chia. Các ván sau tự chia tiếp.

Người đang trong ván thì đợi ván xong mới cấp hoặc trừ chip được.

### 2.6. Trong lúc chơi

- **Không gập máy.** Màn hình tự tắt thì không sao.
- Không tắt Docker Desktop, không ngắt Wi‑Fi, không cho máy cập nhật hay khởi động lại.
- Bạn nào **đăng ký bằng email** mà không nhận được email xác minh (chưa cài Gmail thì email không
  gửi đi), có hai cách:
  - In link xác minh của buổi kèm email người nhận, rồi gửi **riêng** cho đúng người:

    ```bash
    scripts/play-online.sh links
    ```

  - Hoặc xác minh hộ luôn người bạn tin:

    ```bash
    scripts/play-online.sh verify ban@gmail.com
    ```

- Ai gặp lỗi lạ thì nhắc họ bấm **Gửi phản hồi** (nút có ở mọi màn), hoặc nhắn bạn kèm giờ.

### 2.7. Hết buổi

1. **Trước khi tắt**, kiểm tra sổ chip. Dòng cuối phải là `OK: …`:

   ```bash
   docker compose -p poker-home -f docker-compose.prod.yml -f docker-compose.home.yml --env-file .env.home exec backend python manage.py check_ledger
   ```

2. Tắt mọi thứ. Script tự sao lưu vào thư mục `backups/` trước khi tắt:

   ```bash
   scripts/play-online.sh down
   ```

3. Mỗi tuần, chép thư mục `backups/` ra chỗ khác (Google Drive, ổ ngoài). Hỏng máy thì mất cả dữ
   liệu lẫn bản sao lưu nằm cùng máy.

Dữ liệu (tài khoản, phòng, chip, lịch sử) vẫn giữ nguyên sau `down`. Buổi sau chạy lại `up` là có
lại hết, chỉ có **link mới**.

---

## Phần 3. Đoạn dán cho bạn bè

> 🃏 Tối nay chơi poker **chip ảo**, không tiền thật!
>
> **1.** Mở link này (chỉ dùng tối nay): `<LINK MỜI PHÒNG>`
> **2.** Điện thoại thì **xoay ngang** máy. Máy tính thì Chrome, Safari hay Edge đều được.
> **3.** Trang tự vào phòng. Bấm **Ngồi đây** cạnh một ghế trống.
> **4.** Đợi mình cấp chip, rồi bấm **Vào bàn chơi** (hoặc **Về bàn**) là chơi.
>
> Mở bằng **một trình duyệt** suốt buổi nhé: đổi máy hay đổi trình duyệt là thành người khách
> mới. Muốn giữ chip cho lần sau thì bấm **Hồ sơ**, điền email + mật khẩu rồi bấm **Nâng cấp &
> giữ chip**, xong nhắn mình để mình xác minh cho.
>
> Gặp gì lạ thì bấm **Gửi phản hồi** hoặc nhắn mình kèm giờ nhé!

Mẹo cho bạn bè:
- Trên máy tính, bấm phím `?` ở bàn để xem phím tắt: `F` bỏ bài, `C` check/theo, `R` tố.
- Âm thanh bật/tắt ở biểu tượng bánh răng của bàn.
- Lỡ đóng tab hay mất mạng thì mở lại link, bàn tự nối lại đúng chỗ.
- Chưa tới lượt mà đã biết sẽ làm gì thì bấm **Chọn trước** (Check/Bỏ, Check, Theo bất kỳ): tới
  lượt là tự làm, sang vòng mới thì tự huỷ.

---

## Phần 4. Khi gặp sự cố

| Chuyện gì | Làm gì |
|---|---|
| `up` báo Docker chưa chạy | Mở Docker Desktop, đợi cá voi đứng yên, chạy lại `up` |
| `up` báo không lấy được link | Kiểm Wi‑Fi, đợi một lúc, chạy lại `up` |
| Link mới mở chưa được | Đợi 30–60 giây rồi thử lại |
| Bạn bè mở link cũ không vào được | Link đổi mỗi lần `up`. Chạy `scripts/play-online.sh status` lấy link hiện tại, gửi lại |
| Lỡ gập máy, máy ngủ, mất điện | Mở máy lên, chạy `scripts/play-online.sh down` rồi `scripts/play-online.sh up`, gửi **link mới** |
| `up` báo đã có một server khác đang chạy | Làm đúng lệnh `docker compose -p … down` mà script in ra, rồi chạy lại `up` |
| Bàn báo "tạm dừng" | [runbook.md](runbook.md#bàn-tạm-dừng) (thay `dc` bằng lệnh `docker compose -p poker-home …` như ở bước 2.7) |
| Nghi chip bị sai | Chạy lệnh kiểm sổ chip ở bước 2.7, rồi xem [runbook.md](runbook.md#lệch-chip) |

Chi tiết hơn: [choi-online.md](choi-online.md) (cách chơi online hoạt động) và
[beta-f.md](beta-f.md) (sổ tay buổi beta: điều kiện đạt, cách xếp phản hồi).

**Đừng bao giờ** chạy `docker compose down -v` hay xoá volume `poker-home_pgdata`: đó là toàn bộ
dữ liệu.
