export const rooms = [
  {
    name: "Thứ Sáu Vui Vẻ",
    blind: [10, 20],
    seats: "7/9",
    host: "Minh",
    status: "Đang chơi",
    tone: "live",
  },
  {
    name: "Bàn Tân Binh",
    blind: [5, 10],
    seats: "3/6",
    host: "Hà",
    status: "Chờ người",
    tone: "wait",
  },
  {
    name: "Cú Đêm",
    blind: [25, 50],
    seats: "8/9",
    host: "Long",
    status: "Đang chơi",
    tone: "live",
  },
];

export type Player = {
  name: string;
  stack: number;
  avatar: string;
  avatarColor?: string;
  bet?: number;
  state?: "turn" | "offline" | "sitout" | "empty" | "folded";
  cards?: string[];
};
export const players: Player[] = [
  { name: "Trâm", stack: 2280, avatar: "TR", avatarColor: "#9c6de8", bet: 20, state: "offline" },
  { name: "Duy", stack: 1940, avatar: "DU", avatarColor: "#e88155", bet: 40, state: "folded" },
  { name: "An", stack: 3120, avatar: "AN", avatarColor: "#419ca2", bet: 60 },
  { name: "Mai", stack: 860, avatar: "MA", avatarColor: "#dd6c87", bet: 80, state: "sitout" },
  { name: "Ghế trống", stack: 0, avatar: "+", state: "empty" },
  { name: "Khôi", stack: 1760, avatar: "KH", avatarColor: "#b58a46", bet: 120 },
  {
    name: "Linh",
    stack: 2460,
    avatar: "LI",
    avatarColor: "#4d7ee8",
    bet: 240,
    state: "turn",
    cards: ["A♠", "J♠"],
  },
  { name: "Sơn", stack: 1540, avatar: "SƠ", avatarColor: "#7773c9", bet: 40 },
  { name: "Vy", stack: 2880, avatar: "VY", avatarColor: "#cc658e", bet: 20 },
];

export const history = [
  {
    id: "#PF-1842",
    ago: "2 phút trước",
    pot: 1240,
    winner: "Linh",
    result: "Thùng, A cao",
  },
  {
    id: "#PF-1841",
    ago: "6 phút trước",
    pot: 680,
    winner: "Khôi",
    result: "Thắng không lật",
  },
  {
    id: "#PF-1840",
    ago: "11 phút trước",
    pot: 2100,
    winner: "Trâm",
    result: "Hai đôi, Q và 8",
  },
  {
    id: "#PF-1839",
    ago: "16 phút trước",
    pot: 440,
    winner: "Vy",
    result: "Một đôi, K",
  },
];
