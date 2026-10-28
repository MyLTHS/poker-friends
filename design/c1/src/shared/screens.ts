// The 17 screens every design direction draws, each at both sizes. Same list, same data:
// only the look and the layout differ between directions, so Lym compares like with like.
// The phone is landscape only (Lym, 27/10/2026): no portrait layouts.

export type Device = "desktop" | "mobile";

export const FRAME: Record<Device, { width: number; height: number; label: string }> = {
  desktop: { width: 1440, height: 900, label: "Desktop 1440×900" },
  mobile: { width: 844, height: 390, label: "Điện thoại ngang 844×390" },
};

export type ScreenId =
  | "login"
  | "signup"
  | "forgot"
  | "upgrade"
  | "profile"
  | "lobby"
  | "create-room"
  | "invite"
  | "table-turn"
  | "table-showdown"
  | "seven-deuce"
  | "reconnect"
  | "owner-panel"
  | "chat"
  | "history"
  | "replay"
  | "states";

export type ScreenSpec = { id: ScreenId; group: string; title: string; brief: string };

export const SCREENS: ScreenSpec[] = [
  {
    id: "login",
    group: "Tài khoản",
    title: "Đăng nhập",
    brief: "Email + mật khẩu, nút Google, 'Chơi ngay bằng khách', link đăng ký và quên mật khẩu.",
  },
  {
    id: "signup",
    group: "Tài khoản",
    title: "Đăng ký",
    brief: "Email, tên ở bàn, mật khẩu (gợi ý độ mạnh); sau khi gửi: thông báo 'mở email để xác minh'.",
  },
  {
    id: "forgot",
    group: "Tài khoản",
    title: "Quên / đặt lại mật khẩu",
    brief: "Ô email + nút gửi link; bên cạnh là màn đặt mật khẩu mới từ link (trên điện thoại ngang: hai khung cạnh nhau hoặc hai bước).",
  },
  {
    id: "upgrade",
    group: "Tài khoản",
    title: "Nâng cấp từ khách",
    brief: "Đang là khách 'khach-a1b2c3' với chip ở 2 phòng; nâng cấp bằng email hoặc Google, nhấn mạnh 'giữ nguyên chip và lịch sử'.",
  },
  {
    id: "profile",
    group: "Tài khoản",
    title: "Hồ sơ",
    brief: "Tên, email (đã xác minh), cách đăng nhập, các phòng đang có chip và lời/lỗ từng phòng, đăng xuất.",
  },
  {
    id: "lobby",
    group: "Phòng",
    title: "Lobby",
    brief: "Danh sách phòng (public + phòng riêng của mình), blind, số ghế, trạng thái; tìm phòng; dán link mời; nút tạo phòng.",
  },
  {
    id: "create-room",
    group: "Phòng",
    title: "Tạo phòng",
    brief: "Tên, blind nhỏ/lớn, số ghế 2–9, giây suy nghĩ, thưởng 7-2, public/riêng; xem trước cấu hình.",
  },
  {
    id: "invite",
    group: "Phòng",
    title: "Link mời",
    brief: "Chủ phòng chia sẻ link (chép, QR) và người nhận mở link: 'An mời bạn vào Bàn thứ Sáu' + nút vào phòng.",
  },
  {
    id: "table-turn",
    group: "Bàn chơi",
    title: "Bàn — tới lượt mình",
    brief: "9 ghế, flop đã lật, pot, đồng hồ của mình còn 14 giây, thanh hành động: Bỏ, Theo 40, Tố (½ pot, ¾ pot, pot, all-in, thanh trượt).",
  },
  {
    id: "table-showdown",
    group: "Bàn chơi",
    title: "Bàn — nhiều trạng thái",
    brief: "Showdown: 2 người lật bài, người thắng nổi bật; cùng lúc thấy ghế đã bỏ, sit-out, mất kết nối, all-in, ghế trống, và thanh người xem.",
  },
  {
    id: "seven-deuce",
    group: "Bàn chơi",
    title: "Khoảnh khắc 7-2",
    brief: "Ăn pot bằng bluff khi cầm 7-2: bài tự lật cho cả bàn, mỗi người trả 50, tổng +250; ăn mừng nhưng không che hết bàn.",
  },
  {
    id: "reconnect",
    group: "Bàn chơi",
    title: "Mất kết nối / tạm dừng",
    brief: "Lớp phủ 'Đang kết nối lại…' (đồng hồ vẫn chạy) và biến thể 'Bàn tạm dừng' do lỗi server.",
  },
  {
    id: "owner-panel",
    group: "Chủ phòng",
    title: "Bảng chủ phòng",
    brief: "Cấp/trừ chip từng người, đổi blind (áp từ ván sau), giây suy nghĩ, kick, đổi link mời, đóng phòng.",
  },
  {
    id: "chat",
    group: "Xã hội",
    title: "Chat + người xem",
    brief: "Chat bên bàn (desktop: cột cạnh bàn; điện thoại ngang: ngăn trượt từ cạnh phải, bàn vẫn thấy), emoji nhanh, danh sách người đang xem.",
  },
  {
    id: "history",
    group: "Xã hội",
    title: "Lịch sử + lời/lỗ",
    brief: "Bảng tổng kết (được cấp, số ván, 7-2, còn, lời/lỗ) và danh sách ván (ván đã huỷ có nhãn).",
  },
  {
    id: "replay",
    group: "Xã hội",
    title: "Xem lại ván",
    brief: "Từng bước: thanh kéo bước, mô tả 'Bình tố lên 120', bài chung, bài từng người (bài người khác úp), kết quả.",
  },
  {
    id: "states",
    group: "Trạng thái",
    title: "Đang tải / lỗi / trống",
    brief: "Ba khối: đang tải (skeleton), lỗi mạng ở lobby (thử lại), lobby trống (mời tạo phòng); thêm toast 'Bạn đã bị mời ra khỏi phòng'.",
  },
];
