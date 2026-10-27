# Poker Friends — UI mockup tương tác

Mockup độc lập bằng **Vite + React 18 + TypeScript + Tailwind CSS**, dùng hoàn toàn dữ liệu giả và không gọi backend.

## Cách chạy

```bash
cd design/mockups
npm install
npm run dev
```

Mở URL Vite in ra trên terminal (thường là `http://localhost:5173`). Kiểm tra bản production bằng:

```bash
npm run build
npm run preview
```

## Các màn hình

1. Mục lục chuyển nhanh giữa mọi màn và hai hướng thiết kế.
2. Đăng nhập bằng email/mật khẩu, Google hoặc tài khoản khách.
3. Lobby phòng public, tìm phòng, dán link mời và tạo phòng.
4. Tạo phòng: blind, số ghế, timer, public/private, thưởng 7–2.
5. Bàn desktop 9 ghế: đủ trạng thái turn, disconnect, sit-out, fold, ghế trống, spectator, chat và action bar.
6. Bàn mobile ngang 844×390 với action dock trong vùng ngón cái và chat dạng sheet.
7. Khoảnh khắc ăn mừng 7–2 bluff thắng, tự lật bài và hiển thị tiền thưởng.
8. Bảng chủ phòng: cấp chip, đổi blind, kick và đóng phòng.
9. Tổng kết lời/lỗ, hand history và replay từng bước.

## Hai hướng thiết kế

- **A — Câu lạc bộ nỉ:** xanh nỉ, vàng champagne, typography serif ở tiêu đề; ấm, giàu không khí và hợp một buổi chơi thân mật.
- **B — Midnight Grid:** một dashboard poker hình học độc lập với A: nền lưới xanh đen, typography sans condensed viết hoa, bàn chữ nhật nhìn từ trên xuống, 9 người chơi thành các thẻ trạng thái theo hàng, action dock ở cạnh phải và chat thành dải ngang dưới bàn. Trên mobile, board, lưới người chơi 3×3, bài cá nhân và action dock được xếp thành từng mô-đun rõ ràng.

**Khuyến nghị:** chọn hướng **A — Câu lạc bộ nỉ** làm nền tảng thương hiệu. Nó tạo cảm giác “bàn quen của hội bạn” rõ hơn, khác các sản phẩm poker thiên casino/crypto, trong khi hệ thống component vẫn giữ cách đọc dữ liệu và vùng bấm rõ ràng như hướng B. Có thể mượn độ gọn của B cho mobile và các màn quản trị.

## Tương tác có thể thử

- Chuyển màn và đổi theme A/B từ thanh mockup.
- Đăng nhập/chuyển sang khách, lọc phòng, vào bàn, tạo phòng.
- Đổi số ghế, bật/tắt public và thưởng 7–2.
- Chọn mức tố, kéo slider, Fold/Check/Raise, gửi chat/emoji.
- Kick người chơi, đổi blind, đóng phòng.
- Chọn hand history và tua từng bước replay.

## Thay đổi vòng 2

- Tách trải nghiệm bàn của hướng B thành component riêng, với cấu trúc desktop, mobile, chat, action dock và khoảnh khắc 7–2 khác hẳn hướng A. Các màn đăng nhập, lobby, tạo phòng, host và tổng kết của B cũng dùng bố cục dashboard góc cạnh riêng.
- Thiết kế lại bàn mobile 375px ở cả hai hướng: 9 ghế nằm trọn trong lưới 3×3, tên/chip tối thiểu 11px và các nút hành động chính cao ít nhất 44px.
- Đưa tia sáng ăn mừng xuống lớp nền, đặt nội dung 7–2 trên panel tương phản cao và tắt chuyển động khi hệ điều hành bật `prefers-reduced-motion`.
- Thay ký hiệu cent cũ bằng icon chip poker; mọi số chip đi qua component/hàm định dạng chung và dùng dấu chấm phân cách hàng nghìn kiểu Việt Nam.

## Thay đổi vòng 3

- Làm lại bàn desktop hướng A theo bố cục poker thương mại: bàn oval chiếm gần toàn màn, nỉ có chiều sâu, rail nhiều lớp, community card lớn, pot và cược là chồng chip, 9 avatar tròn quanh bàn, vòng thời gian ở hero, dealer/SB/BB và bài úp có hoa văn. Hero nằm giữa cạnh dưới với bài lớn; action bar thêm preset 1/2 pot, 3/4 pot, pot, all-in và slider.
- Bỏ sidebar danh sách màn khỏi bàn chơi. Nút menu nhỏ ở góc trên mở drawer khi cần; chat desktop là popover thu gọn thay vì một cột cố định.
- Đổi cả hai mockup mobile sang khung máy ngang 844×390 có notch. Bàn và 9 ghế nằm trọn bên trái, bài hero cùng action dock ở cạnh phải; các nút hành động chính cao tối thiểu 44px.
- Hoàn thiện hướng B thành arena hình học độc lập với A: bàn cắt góc, HUD avatar quanh bàn, palette xanh đen/cyan, action dock riêng và biến thể mobile ngang cùng ngôn ngữ đó. Các màn login, lobby, tạo phòng, host và tổng kết tiếp tục dùng layout dashboard góc cạnh riêng của B.
- Màn 7–2 đặt hiệu ứng ở lớp nền, nội dung trên panel đặc có độ tương phản cao và tắt animation theo `prefers-reduced-motion`.
- Mọi số chip hiển thị dùng `ChipAmount`/`formatChipText` trong `src/chips.tsx`, kể cả blind ở lobby và bảng chủ phòng. `vite.config.ts` dùng `base: './'`; điều hướng màn dùng React state, không cần server-side router; icon Lucide được bundle vào JavaScript và không có asset CDN.

## Thay đổi vòng 4

- Chốt và đánh bóng hướng A — Câu lạc bộ nỉ; hướng B được giữ nguyên.
- Bố trí 2–9 ghế theo một công thức elip dùng chung. Ghế nằm ngoài rail, còn mọi chip cược nằm trên nỉ theo đường nối từ ghế vào tâm bàn.
- Sắp lại bài A♠ J♠ cạnh avatar người chơi chính, tách khỏi avatar và action bar; tăng khung mobile ngang tối đa khoảng 1,4 lần trong không gian cho phép và giữ các nút hành động trên một dòng.
- Menu ở các màn bàn dùng cùng hàm điều hướng: chọn màn sẽ đổi nội dung và đóng drawer.

### Component hướng A có thể dùng lại

- `src/club/Table.tsx`: bàn, board, pot, ghế và cược; nhận toàn bộ trạng thái qua props.
- `src/club/Seat.tsx`: ghế/người chơi, trạng thái, dealer, blind, bài và countdown.
- `src/club/PlayingCard.tsx`: bài ngửa/úp và kích thước hiển thị.
- `src/club/ActionBar.tsx`: slider, preset và callback fold/check/raise.
- `src/club/ChipStack.tsx`: chồng chip cược theo số tiền.
- `src/club/seatLayout.ts`: công thức tọa độ elip cho 2–9 ghế và vị trí cược hướng vào tâm.
