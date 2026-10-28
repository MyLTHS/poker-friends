// Sơn Mài Vàng Son (d4) — Vietnamese lacquer art as a premium poker room: black and cinnabar
// lacquer, hand-laid gold leaf, eggshell inlay and mother-of-pearl accents.
import type { Direction } from "../../shared/direction";
import { FRAME, SCREENS } from "../../shared/screens";
import { renderAccount } from "./screens/account";
import { renderPlay } from "./screens/play";
import { renderRooms } from "./screens/rooms";
import { renderSocial } from "./screens/social";
import "./style.css";

const direction: Direction = {
  id: "d4",
  name: "Sơn Mài Vàng Son",
  tagline: "Sơn then, son đỏ và vàng lá: một phòng chơi riêng mang hồn tranh sơn mài Việt.",
  description:
    "Nền sơn then đen bóng nhiều lớp, mặt bàn son đỏ viền vàng lá thếp tay, dải khảm vỏ trứng và điểm xà cừ óng ánh; chữ có chân Playfair Display cho tiêu đề, số lớn và nút cược, Be Vietnam Pro cho chữ thường." +
    "Hợp hội bạn muốn một bàn chơi trang trọng, ấm và có bản sắc Việt mà vẫn hiện đại, đọc nhanh trên điện thoại xoay ngang. " +
    "Điểm mạnh là chất liệu và chiều sâu (như cầm một hộp sơn mài thật) và một hệ thống nhất quán từ lá bài, chip tới nút; đánh đổi là nền tối nhiều lớp nên cần giữ kỷ luật tương phản, và vẻ sang trọng ít “vui nhộn” hơn hướng Kẹo Đêm.",
  swatches: [
    { name: "Sơn then", value: "#0C0807" },
    { name: "Son đỏ", value: "#A3281A" },
    { name: "Mặt bàn son", value: "#84200F" },
    { name: "Vàng lá", value: "#E2B866" },
    { name: "Vỏ trứng", value: "#F0E6D2" },
    { name: "Xà cừ", value: "#D5ECEF" },
    { name: "Ngọc bích (lời)", value: "#74C7A3" },
  ],
  fonts: ["Playfair Display", "Be Vietnam Pro"],
  render: (screen, device) => {
    const node = renderPlay(screen, device) ?? renderRooms(screen, device) ?? renderAccount(screen, device) ?? renderSocial(screen, device);
    if (node) return node;
    const f = FRAME[device];
    const spec = SCREENS.find((s) => s.id === screen);
    return (
      <div className={`d4 d4-${device}`} style={{ width: f.width, height: f.height, display: "grid", placeItems: "center" }}>
        {spec?.title ?? screen}
      </div>
    );
  },
};

export default direction;
