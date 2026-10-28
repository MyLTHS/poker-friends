# E — Vận hành: giữ hệ thống sống

Hai bài ngắn, theo nhịp của [lộ trình](../roadmap.md#nhịp-học-của-mỗi-đợt-gọn): **dự đoán** trước,
**tự làm** một việc nhỏ, rồi mới đọc **chuyện đã xảy ra** và **bài học**.

---

## Bài 1. Backup chưa thử khôi phục thì chưa phải backup

**Dự đoán:** Vì sao người ta nói "backup chưa thử khôi phục thì coi như chưa có backup"? Kể hai cách
một bản backup có thể vô dụng mà không ai biết.

Tôi nghĩ: 1. ... 2. ...

**Tự làm:** Chạy `scripts/play-online.sh up`, chơi một ván với tài khoản khách, rồi
`scripts/play-online.sh down` (lệnh này tự sao lưu). Khôi phục bản vừa sao lưu vào một database
**mới** theo [runbook](../runbook.md) mục "Khôi phục backup", bước 3–4 (lệnh compose lấy theo
[beta-f.md](../beta-f.md)). `check_ledger` trên bản khôi phục phải ra `OK`.

Kết quả: ...

### Chuyện đã xảy ra

- `scripts/backup.sh` ghi ra file tạm, đọc lại được (`pg_restore --list`) mới đổi tên thành bản
  thật. `restore.sh` từ chối khôi phục đè lên database đã có dữ liệu.
- CI diễn tập ở mỗi PR và mỗi Chủ nhật:
  1. chơi 550 ván;
  2. sao lưu;
  3. khôi phục vào database mới;
  4. kiểm migration và sổ chip;
  5. so số dòng 5 bảng;
  6. kiểm các trigger "chỉ ghi thêm" vẫn còn.
- Review tìm ra một chỗ hỏng lặng lẽ. Dòng cron ghi log vào thư mục `backups/`, mà thư mục này
  không có trong git. Thiếu thư mục thì cron không chạy gì cả, và không ai được báo. Sửa:
  - thêm `mkdir -p backups` vào dòng cron;
  - thêm `scripts/check-backup-age.sh`, báo FAIL khi 26 giờ qua không có bản nào.
- `play-online.sh`: database không hỏi được thì báo lỗi, không coi là "trống". Lệnh `down` cảnh
  báo "CHƯA sao lưu" thay vì im lặng.

### Bài học

- Backup là một quy trình có kiểm chứng: sao lưu, khôi phục thử, kiểm dữ liệu. Không phải một file.
- Hỏng lặng lẽ là nguy hiểm nhất. Cần một thứ kêu to khi không có gì xảy ra (bản sao lưu quá cũ).
- Diễn tập tự động trong CI thì không phụ thuộc vào trí nhớ của ai.

---

## Bài 2. Đo trước khi bỏ: Redis 16, trong bộ nhớ 0

**Dự đoán:** Thêm một thành phần (Redis) vào hệ thống làm nó chắc hơn hay dễ hỏng hơn? Trả lời cho
trường hợp server chỉ có một process.

Tôi nghĩ: ...

**Tự làm:** Đọc mục "Bỏ Redis" trong [ADR-001](../adr/ADR-001-table-actor.md) và bảng đo trong
[choi-thu-bang-bot.md](../choi-thu-bang-bot.md). Rồi tìm trong [ws-protocol.md](../api/ws-protocol.md)
mục 6: khi trình duyệt thấy hụt `version` thì nó làm gì? Người chơi sẽ thấy gì?

Kết quả: ...

### Chuyện đã xảy ra

- Trước đó, lúc chạy thử ở nhà, Redis đã gây một lỗi: WebSocket bị đóng sau 5 giây im lặng (hai
  khoảng chờ 5 giây trùng nhau).
- Rồi đo bằng bot: 6 bot × 100 ván trên đúng bộ Docker production, chỉ đổi kênh phát tin.
  - Redis: 733 lần ngắt kết nối, **16** lần hụt `version` (sự kiện rơi mất, không bao giờ tới).
  - Trong bộ nhớ: 818 lần ngắt kết nối, **0** lần hụt.
  - Sổ chip và phát lại ván đúng ở cả hai, nhờ server ghi lệnh trước khi phát tin.
- Nguyên nhân: thư viện Redis dùng chung một hàng đợi nhận cho cả process. Một kết nối bị huỷ giữa
  lúc đang nhận hộ người khác thì làm rơi tin của họ. Hàng đợi chung chỉ chứa 100 tin, đầy thì cắt
  kết nối.
- Server chỉ có một process Daphne, nên Redis chỉ là trạm chuyển tin nội bộ. Bỏ được. Nếu sau này
  chạy nhiều process thì phải xem lại cả ADR-001, không phải chỉ bật lại Redis.

### Bài học

- Đo bằng số, đừng tranh luận bằng cảm giác: "16 so với 0" thì không cần bàn thêm.
- Mỗi thành phần thêm vào là thêm một chỗ có thể hỏng. Chỉ giữ thứ đang giải một vấn đề có thật.
- Ghi quyết định vào ADR kèm **điều kiện phải xem lại**, để người sau biết khi nào nó hết đúng.
- Thiết kế "ghi trước, phát sau" giữ dữ liệu đúng ngay cả khi tin nhắn rơi.
