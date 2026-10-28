// Kính & Ánh Kim (d2) — a sky-lounge at night: frosted glass, champagne metal, petrol felt.
import type { Direction } from "../../shared/direction";
import { renderAccount } from "./screens/account";
import { renderPlay } from "./screens/play";
import { renderRecords } from "./screens/records";
import { renderRooms } from "./screens/rooms";
import "./style.css";

const direction: Direction = {
  id: "d2",
  name: "Kính & Ánh Kim",
  tagline: "Sảnh tầng thượng lúc nửa đêm: kính mờ, viền vàng sâm panh, bàn xanh dầu dưới một ngọn đèn.",
  description:
    "Nền than chì chuyển xanh mòng két đêm, các tấm kính mờ có viền sáng 1px, điểm nhấn kim loại vàng sâm panh và một màu xanh điện cho “tới lượt bạn”, đỏ ấm cho lỗ và nguy hiểm. " +
    "Hợp hội bạn thích cảm giác một ứng dụng poker cao cấp kiểu Apple: bàn xanh dầu có viền phản chiếu, chip kim loại – gốm có viền khảm, lá bài sứ trắng, vòng đếm giờ phát sáng. " +
    "Điểm mạnh là sang, gọn và số đọc rất nhanh (chữ Mona Sans bản rộng + Geist, số cùng bề rộng); đánh đổi là nền tối nhiều lớp kính tốn công dựng lại và cần giữ kỷ luật chỉ hai màu nhấn.",
  swatches: [
    { name: "Than chì", value: "#0A0F14" },
    { name: "Mòng két đêm", value: "#0B2C33" },
    { name: "Kính mờ", value: "#162A33" },
    { name: "Vàng sâm panh", value: "#E3C68C" },
    { name: "Xanh điện", value: "#3EE6F2" },
    { name: "Đỏ ấm", value: "#FF6F61" },
    { name: "Nỉ xanh dầu", value: "#11605A" },
    { name: "Sứ trắng", value: "#F5F7F8" },
  ],
  fonts: ["Mona Sans", "Geist"],
  render: (screen, device) =>
    renderPlay(screen, device) ?? renderAccount(screen, device) ?? renderRooms(screen, device) ?? renderRecords(screen, device),
};

export default direction;
