import type { ReactNode } from "react";

import type { Direction } from "../../shared/direction";
import type { Device, ScreenId } from "../../shared/screens";
import { Forgot, Login, Profile, Signup, Upgrade } from "./screens-account";
import { CreateRoom, Invite, Lobby } from "./screens-rooms";
import { History, Replay, States } from "./screens-social";
import { ChatScreen, OwnerPanelScreen, Reconnect, SevenDeuce, TableShowdown, TableTurn } from "./screens-table";
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
  "owner-panel": OwnerPanelScreen,
  chat: ChatScreen,
  history: History,
  replay: Replay,
  states: States,
};

const direction: Direction = {
  id: "d1",
  name: "Nỉ & Đồng thau",
  tagline: "Một câu lạc bộ poker riêng về đêm: nỉ xanh, gỗ sẫm, ánh đồng thau.",
  description:
    "Bàn nỉ xanh nhìn từ trên xuống, viền da gỗ sẫm, chi tiết đồng thau và ánh đèn vàng ấm; chữ serif Cormorant cho tiêu đề và con số, Inter cho giao diện. Hợp với hội bạn chơi tối cuối tuần muốn cảm giác ấm, thân, \"bàn quen\" thay vì sòng bài lấp lánh. Điểm mạnh là bài và chip như thật, bàn dễ đọc và có không khí riêng; đổi lại nền tối và nhiều lớp đổ bóng nên cần giữ kỷ luật tương phản, và phong cách cổ điển kém trẻ trung hơn các hướng phẳng.",
  swatches: [
    { name: "Nỉ xanh", value: "#155A3F" },
    { name: "Da gỗ sẫm", value: "#3A2417" },
    { name: "Đồng thau", value: "#D2AF66" },
    { name: "Ngà", value: "#F3EAD7" },
    { name: "Đêm", value: "#100C09" },
    { name: "Rượu vang", value: "#9E2B31" },
    { name: "Lời", value: "#86CFA0" },
  ],
  fonts: ["Cormorant Garamond", "Inter"],
  render: (screen, device) => {
    const Screen = SCREENS[screen];
    return <Screen device={device} />;
  },
};

export default direction;
