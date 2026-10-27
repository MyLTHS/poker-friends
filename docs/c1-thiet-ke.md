# C1 — Ba hướng thiết kế: cách xem và đưa vào Figma

Ba hướng vẽ **cùng 17 màn với cùng dữ liệu**, mỗi màn có bản **desktop 1440×900** và **điện thoại
dọc 390×844** (tổng 34 khung mỗi hướng). Chỉ khác nhau ở cái nhìn và cách bố cục, để so cho công
bằng. Code nằm ở `design/c1/`:

| Hướng | Thư mục | Tinh thần |
|---|---|---|
| D1 · Nỉ & Đồng thau | `design/c1/src/directions/d1/` | Câu lạc bộ riêng ban đêm: nỉ xanh, viền gỗ, đồng thau, chữ có chân |
| D2 · Giấy & Mực | `design/c1/src/directions/d2/` | Sáng, kiểu sổ ghi điểm in đẹp: giấy ngà, mực đen, một màu đỏ lá bài |
| D3 · Kẹo Đêm | `design/c1/src/directions/d3/` | Vui, đậm, ưu tiên điện thoại: nền chàm, màu kẹo, nút to bo tròn |

Các màn: đăng nhập, đăng ký, quên/đặt lại mật khẩu, nâng cấp từ khách, hồ sơ, lobby, tạo phòng,
link mời, bàn tới lượt mình, bàn nhiều trạng thái (showdown, đã bỏ, nghỉ, mất kết nối, all-in, người
xem), khoảnh khắc 7-2, mất kết nối/tạm dừng, bảng chủ phòng, chat + người xem, lịch sử + lời/lỗ, xem
lại ván, đang tải/lỗi/trống. Danh sách và yêu cầu từng màn: `design/c1/src/shared/screens.ts`.

## Xem trên máy

```bash
cd design/c1 && npm ci && npm run dev
```

Mở <http://localhost:5174>:

- Trang đầu: ba hướng cạnh nhau (bàn chơi desktop + điện thoại), mô tả, bảng màu, phông chữ.
- Bấm tên một hướng: mọi màn của hướng đó.
- "So từng màn": một màn ở cả ba hướng cạnh nhau.
- Bấm vào một khung: mở **khung đúng kích thước, không có gì khác**, địa chỉ dạng
  `http://localhost:5174/#/d2/table-turn/mobile`. Đây là trang để đưa vào Figma.

## Đưa vào Figma (html.to.design)

Figma không tự đọc được trang web, và công cụ Figma của Claude chỉ đọc file Figma chứ không vẽ được,
nên dùng plugin miễn phí **html.to.design**: nó biến một trang web thành các lớp Figma sửa được (khung,
chữ, màu, bo góc).

Vì trang chạy trên máy bạn (`localhost`), plugin trên Figma không tự mở được. Dùng **tiện ích Chrome
html.to.design**, vì nó chụp đúng trang đang mở trong trình duyệt của bạn:

1. Cài tiện ích **html.to.design** cho Chrome (Chrome Web Store) và plugin **html.to.design** trong
   Figma (Figma → Plugins → tìm "html.to.design").
2. Chạy `npm run dev` như trên, mở một khung, ví dụ `http://localhost:5174/#/d1/lobby/desktop`.
3. Đặt cửa sổ trình duyệt rộng hơn khung (desktop cần ≥ 1440 px; điện thoại thì cửa sổ nào cũng được).
4. Bấm biểu tượng tiện ích → chụp trang → nó tải về một file `.h2d`.
5. Trong Figma, mở plugin html.to.design → tab nhập file → chọn file `.h2d` → plugin dựng khung.
6. Lặp lại cho các khung cần. Gợi ý: mỗi hướng một trang (page) trong Figma; chỉ cần nhập vài màn
   tiêu biểu để chọn hướng (lobby, bàn tới lượt mình desktop + điện thoại, 7-2).

Giao diện của tiện ích và plugin có thể đổi tên nút theo phiên bản; ý chính là "chụp trang trong
trình duyệt → nhập file vào Figma". Nếu không muốn cài gì: chụp màn hình từng khung (khung đúng kích
thước nên ảnh chụp chính là bản thiết kế) và kéo ảnh vào Figma để xem và ghi chú.

## Chọn xong thì sao

Báo hướng bạn chọn (và chỗ muốn đổi, ví dụ "lấy D2 nhưng bàn chơi mobile của D3"). Hướng được chọn
thành design system cho C2–C5: màu, chữ, lá bài, chip, nút, và các màn của `web/` được làm lại theo
hướng đó. Hai hướng còn lại giữ trong `design/c1/` làm tư liệu.
