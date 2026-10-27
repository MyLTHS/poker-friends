// Kẹo Đêm (d3) — playful, bold, mobile-first party-game direction.
import type { Direction } from "../../shared/direction";
import { FRAME, SCREENS } from "../../shared/screens";
import { renderAccount } from "./screens/account";
import { renderPlay } from "./screens/play";
import { renderRooms } from "./screens/rooms";
import { renderSocial } from "./screens/social";
import "./style.css";

const direction: Direction = {
  id: "d3",
  name: "Kẹo Đêm",
  tagline: "Poker như một trò chơi tiệc tùng: màu kẹo trên nền đêm, nút to cho ngón cái.",
  description:
    "Nền chàm đêm với bốn màu kẹo (hồng, chanh, xanh trời, vàng hướng dương), góc bo tròn, nút viên thuốc dày có mép dưới để “bấm lún” và nhãn dán nghiêng như sticker. " +
    "Hợp hội bạn chơi cho vui trên điện thoại: bàn hình sân vận động màu bạc hà, bộ bài 4 màu đọc nhanh, ba nút hành động lớn trong tầm ngón cái, chat ưu tiên emoji. " +
    "Điểm mạnh là cảm xúc và tốc độ đọc trạng thái; đánh đổi là ít vẻ “sòng bài” sang trọng và nhiều màu nên cần kỷ luật khi thêm tính năng mới.",
  swatches: [
    { name: "Chàm đêm", value: "#16123A" },
    { name: "Mặt nổi", value: "#2C2568" },
    { name: "Hồng kẹo", value: "#FF4FA3" },
    { name: "Chanh", value: "#B8F35A" },
    { name: "Xanh trời", value: "#4FD1FF" },
    { name: "Hướng dương", value: "#FFC93C" },
    { name: "Bạc hà (mặt bàn)", value: "#17B998" },
  ],
  fonts: ["Baloo 2", "Nunito"],
  render: (screen, device) => {
    const node = renderPlay(screen, device) ?? renderRooms(screen, device) ?? renderAccount(screen, device) ?? renderSocial(screen, device);
    if (node) return node;
    const f = FRAME[device];
    const spec = SCREENS.find((s) => s.id === screen);
    return (
      <div className={`d3 d3-${device}`} style={{ width: f.width, height: f.height, display: "grid", placeItems: "center" }}>
        {spec?.title ?? screen}
      </div>
    );
  },
};

export default direction;
