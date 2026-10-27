import type { ReactNode } from "react";

import type { Direction } from "../../shared/direction";
import type { Device, ScreenId } from "../../shared/screens";
import { Forgot, Login, Profile, Signup, Upgrade } from "./screens/account";
import { Chat, OwnerPanel, Reconnect, SevenDeuce, TableShowdown, TableTurn } from "./screens/play";
import { HistoryScreen, Replay, States } from "./screens/records";
import { CreateRoom, Invite, Lobby } from "./screens/rooms";
import "./style.css";

const SCREENS: Record<ScreenId, (p: { device: Device }) => ReactNode> = {
  login: Login,
  signup: Signup,
  forgot: Forgot,
  upgrade: Upgrade,
  profile: Profile,
  lobby: Lobby,
  "create-room": CreateRoom,
  invite: Invite,
  "table-turn": TableTurn,
  "table-showdown": TableShowdown,
  "seven-deuce": SevenDeuce,
  reconnect: Reconnect,
  "owner-panel": OwnerPanel,
  chat: Chat,
  history: HistoryScreen,
  replay: Replay,
  states: States,
};

const direction: Direction = {
  id: "d2",
  name: "Giấy & Mực",
  tagline: "Một cuốn sổ điểm in đẹp: giấy ấm, mực đen, một nét đỏ quân bài.",
  description:
    "Sáng, yên và gọn như trang sách: nền giấy ngà, chữ mực, đường kẻ mảnh, bàn chơi vẽ như bàn cờ với ghế là những tấm thẻ tên ngay hàng. " +
    "Hợp người chơi ban ngày, ngồi lâu, hoặc ngại vẻ sòng bạc; số chip, blind và đồng hồ dùng chữ đơn cách nên đọc sổ lời/lỗ rất nhanh. " +
    "Điểm mạnh là rõ ràng và dịu mắt; đổi lại không khí ít \"hồi hộp\" hơn một bàn nỉ xanh, khoảnh khắc ăn mừng như 7-2 dựa vào dấu mộc đỏ thay vì hiệu ứng.",
  swatches: [
    { name: "Giấy", value: "#F4EFE6" },
    { name: "Giấy trắng", value: "#FBF8F2" },
    { name: "Mực", value: "#1E1B16" },
    { name: "Mực nhạt", value: "#736A5D" },
    { name: "Đỏ quân bài", value: "#C8372D" },
    { name: "Xanh xô thơm", value: "#5E7B66" },
    { name: "Nỉ nhạt", value: "#E3E7D8" },
    { name: "Đường kẻ", value: "#D9CFBE" },
  ],
  fonts: ["Lora", "Be Vietnam Pro", "JetBrains Mono"],
  render: (screen, device) => {
    const Screen = SCREENS[screen];
    return <Screen device={device} />;
  },
};

export default direction;
