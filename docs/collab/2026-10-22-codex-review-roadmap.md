## Nhận xét thẳng

### 1. Thứ tự phase

Khung tổng thể hợp lý, đặc biệt việc chốt hợp đồng trước khi làm UI. Tuy nhiên:

- Auth tối thiểu, định danh guest và vòng đời `Room` đang quá muộn. Phase 3 đã cần quyền sở hữu ghế, chống hai tab và ledger theo người dùng, nhưng auth hoàn chỉnh đến Phase 5 mới làm. Nguy cơ phải sửa lại model và protocol.
- Cơ chế phục hồi actor khi restart không nên để Phase 4. Phase 3 chỉ lưu `Hand.record()` khi ván kết thúc thì không đủ phục hồi ván đang chơi.
- E2E, responsive/mobile và triển khai staging không nên dồn hết vào Phase 7; lúc đó sửa kiến trúc UI hoặc protocol sẽ rất đắt.
- Chat, spectator, replay UI để Phase 6 là hợp lý.
- Phase 1 có ledger trong bộ nhớ của `TableSession`, chưa phải persistent ledger trong Django; câu “chip theo phòng bằng ledger đã xong” dễ gây hiểu nhầm.

### 2. Phân việc Claude/Codex

Frontend vẫn có nguy cơ chờ backend:

- “Server giả” do Claude làm, nên Codex chưa thật sự độc lập trong Phase 2. Nên sinh mock/fixtures trực tiếp từ JSON Schema để Codex chạy trước.
- Claude viết protocol rồi Codex mới phản biện là quá tuần tự. Hai bên cần cùng chốt projection/UI state trước khi triển khai.
- Phase 3 dùng guest session tạm, Phase 5 lại làm guest account và upgrade: đây là phần chồng chéo, dễ phải thay identity, cookie và ownership.
- `Room` model ở Phase 3 nhưng API/vòng đời phòng ở Phase 5 khiến backend phải tạo cơ chế bàn tạm rồi thay lần nữa.
- Timer “chủ phòng chỉnh được” ở Phase 4 nhưng quyền/cấu hình chủ phòng đến Phase 6.

### 3. Ước lượng

11–12 tuần là kịch bản thuận lợi, chưa phải ước lượng an toàn.

Phase 3–6 đều bị đóng khung hai tuần nhưng khối lượng rất khác nhau. Phase 4 có timer, reconnect và crash recovery; Phase 5 có email verification, reset password, OAuth, guest upgrade, private invite và rate limit; Phase 6 lại gom admin, chat, spectator, history và replay. Mỗi phase này có thể tự tiêu tốn 2–3 tuần.

Chưa thấy buffer cho review chéo, sửa sau cổng duyệt, cấu hình Google/email/DNS/VPS và lỗi chỉ xuất hiện khi nhiều trình duyệt cùng chơi. Ước lượng thực tế hơn là 13–16 tuần cho beta ổn định.

### 4. Hạng mục còn thiếu

Hợp đồng WS chưa mô tả đủ:

- Envelope/protocol version, ACK/NACK cho `command_id`, quy tắc idempotency.
- Xử lý event mất, trùng, sai thứ tự và phát hiện khoảng trống `version`.
- `hand_id`, `room_id`, deadline tuyệt đối từ server, thời điểm server, trạng thái reconnect/resync.
- Error code ổn định, authorization và chính sách tương thích schema.
- Sự kiện cấp chip, đổi cấu hình, kick/close, countdown ván mới và kết quả payout/showdown.

Phía frontend thiếu kiến trúc state rõ ràng: snapshot + event reducer, xử lý version gap, chiến lược optimistic/pessimistic, accessibility, loading/error/empty state và định dạng chip trên mobile.

Kiểm thử còn mỏng ở ranh giới hệ thống: contract test Python ↔ TypeScript, kiểm tra generated types không bị stale trong CI, reducer/component test, multi-client E2E từ Phase 3, test mạng chập chờn và test backup/restore.

### 5. Rủi ro lớn nhất

Rủi ro lớn nhất là tính đúng đắn của actor và persistence khi process chết.

“Mỗi bàn một asyncio task” chỉ đảm bảo single-writer trong một process. Nếu chạy nhiều ASGI worker hoặc restart giữa lệnh, có thể tạo hai actor hoặc mất action. Kế hoạch chưa chốt action được ghi DB trước hay sau broadcast, cách claim quyền sở hữu actor, cũng như phục hồi ván dở từ chuỗi event nào. Đây là chỗ có thể phá cả ba nguyên tắc: server authority, bảo toàn chip và replay xác định.

## Đề xuất sửa cụ thể

1. Đưa identity guest ổn định, `Room` lifecycle tối thiểu và ownership vào trước hoặc đầu Phase 3; Phase 5 chỉ bổ sung email/Google/upgrade.
2. Trong Phase 2, chốt DTO projection dựa trên nhu cầu UI; bổ sung ACK, error codes, protocol version, deadline và quy tắc resync khi `version` bị hụt.
3. Sinh mock server/fixtures từ schema để Codex làm frontend độc lập, không chờ implementation của Claude.
4. Chốt ADR actor ngay trước Phase 3: một ASGI worker hoặc cơ chế ownership/locking, thứ tự persist–apply–broadcast và cách xử lý crash giữa các bước.
5. Persist từng accepted command/hand event trong Phase 3; không đợi đến cuối ván mới lưu `Hand.record()`.
6. Chuyển contract test, reducer test và Playwright multi-client cơ bản sang Phase 2–3; Phase 7 chỉ mở rộng regression/chaos.
7. Tách Phase 5–6 thành các mốc nhỏ hơn hoặc tăng tổng lịch lên 13–16 tuần, có buffer cho cổng duyệt và tích hợp dịch vụ ngoài.
8. Dựng staging/deploy skeleton và kiểm tra backup–restore từ Phase 4, thay vì lần đầu triển khai ở Phase 7.
