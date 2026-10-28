// Mock data shared by the four directions (Vietnamese, like the real app). Shapes follow the
// API (docs/api/) loosely; this app never calls a server.

export type Suit = "♠" | "♥" | "♦" | "♣";
export type Card = { rank: string; suit: Suit } | "back";

export const card = (code: string): Card => {
  // "Ah" "Td" "7c" "2s" -> rank + suit symbol; "??" -> back
  if (code === "??") return "back";
  const suits: Record<string, Suit> = { s: "♠", h: "♥", d: "♦", c: "♣" };
  const rank = code[0] === "T" ? "10" : code[0];
  return { rank, suit: suits[code[1]] };
};
export const isRed = (c: Card) => c !== "back" && (c.suit === "♥" || c.suit === "♦");

export const ME = { id: "7", name: "Lym", email: "lym@example.com" };

export type SeatState =
  | "turn" // to act, timer running
  | "waiting" // in hand, not to act
  | "folded"
  | "all-in"
  | "sitting-out"
  | "disconnected"
  | "winner"
  | "empty";

export type Seat = {
  seat: number;
  name?: string;
  stack?: number;
  bet?: number;
  cards?: Card[];
  state: SeatState;
  isMe?: boolean;
  isButton?: boolean;
  lastAction?: string;
  hand?: string; // showdown hand name
  timer?: { left: number; total: number };
};

/** table-turn: flop dealt, my turn, 14 s left of 20. */
export const TABLE_TURN = {
  room: "Bàn thứ Sáu",
  blinds: "10/20",
  handNo: 37,
  pot: 260,
  board: ["Ah", "8d", "Jc"].map(card),
  toCall: 40,
  minRaise: 80,
  maxRaise: 1460,
  presets: [
    { label: "½ pot", amount: 150 },
    { label: "¾ pot", amount: 225 },
    { label: "Pot", amount: 300 },
    { label: "All-in", amount: 1460 },
  ],
  seats: [
    { seat: 1, name: "Lym", stack: 1460, bet: 0, cards: ["Kh", "Qh"].map(card), state: "turn", isMe: true, timer: { left: 14, total: 20 } },
    { seat: 2, name: "An", stack: 920, bet: 40, cards: ["??", "??"].map(card), state: "waiting", lastAction: "Cược 40" },
    { seat: 3, name: "Bình", stack: 0, cards: [], state: "folded", lastAction: "Bỏ" },
    { seat: 4, name: "Chi", stack: 2210, bet: 40, cards: ["??", "??"].map(card), state: "waiting", lastAction: "Theo 40", isButton: true },
    { seat: 5, state: "empty" },
    { seat: 6, name: "Dũng", stack: 640, cards: [], state: "sitting-out", lastAction: "Đang nghỉ" },
    { seat: 7, name: "Giang", stack: 1180, cards: ["??", "??"].map(card), state: "disconnected", lastAction: "Mất kết nối" },
    { seat: 8, name: "Hà", stack: 0, bet: 0, cards: [], state: "folded", lastAction: "Bỏ" },
    { seat: 9, name: "Khoa", stack: 300, cards: ["??", "??"].map(card), state: "waiting", lastAction: "Check" },
  ] as Seat[],
};

/** table-showdown: river, two hands shown, Chi wins with a flush; other states visible. */
export const TABLE_SHOWDOWN = {
  room: "Bàn thứ Sáu",
  blinds: "10/20",
  handNo: 38,
  pot: 1840,
  board: ["9h", "4h", "Kh", "2c", "7h"].map(card),
  winner: { name: "Chi", amount: 1840, hand: "Thùng (flush) già A" },
  spectators: ["Mai", "Tùng", "Ngọc"],
  seats: [
    { seat: 1, name: "Lym", stack: 1460, cards: ["Ks", "Kd"].map(card), state: "waiting", isMe: true, hand: "Bộ ba K" },
    { seat: 2, name: "An", stack: 0, cards: [], state: "all-in", lastAction: "All-in 920" },
    { seat: 3, name: "Bình", stack: 1500, cards: [], state: "folded", lastAction: "Bỏ" },
    { seat: 4, name: "Chi", stack: 3130, cards: ["Ah", "5h"].map(card), state: "winner", hand: "Thùng già A", isButton: true },
    { seat: 5, state: "empty" },
    { seat: 6, name: "Dũng", stack: 640, cards: [], state: "sitting-out", lastAction: "Đang nghỉ" },
    { seat: 7, name: "Giang", stack: 1180, cards: [], state: "disconnected", lastAction: "Mất kết nối 0:42" },
    { seat: 8, name: "Hà", stack: 870, cards: [], state: "folded", lastAction: "Bỏ" },
    { seat: 9, state: "empty" },
  ] as Seat[],
};

/** seven-deuce: Bình bluffs with 7-2, everybody folds; the bonus is 50 each. */
export const SEVEN_DEUCE = {
  winner: "Bình",
  cards: ["7c", "2d"].map(card),
  pot: 340,
  bonus: 50,
  payments: [
    { name: "Lym", amount: 50 },
    { name: "An", amount: 50 },
    { name: "Chi", amount: 50 },
    { name: "Dũng", amount: 50, note: "đang nghỉ vẫn trả" },
    { name: "Khoa", amount: 50 },
  ],
  total: 250,
};

export const ROOMS = [
  { id: 1, name: "Bàn thứ Sáu", blinds: "10/20", seated: 7, seats: 9, status: "Đang chơi", private: true, owner: "Lym", bonus: 50 },
  { id: 2, name: "Tập luyện nhẹ", blinds: "1/2", seated: 3, seats: 6, status: "Đang mở", private: false, owner: "An", bonus: 0 },
  { id: 3, name: "Heads-up 1:1", blinds: "50/100", seated: 2, seats: 2, status: "Đang chơi", private: false, owner: "Chi", bonus: 0 },
  { id: 4, name: "Phòng cuối tuần", blinds: "5/10", seated: 0, seats: 9, status: "Đang mở", private: false, owner: "Khoa", bonus: 100 },
];

export const CHAT = [
  { name: "An", text: "ai bluff kìa 😏", at: "21:04" },
  { name: "Chi", text: "flush rồi nha 🎉", at: "21:05" },
  { name: "Lym", text: "gg, ván sau gỡ", at: "21:05" },
  { name: "Mai", text: "(đang xem) căng quá 😱", at: "21:06" },
  { name: "Khoa", text: "👍", at: "21:06" },
];
export const QUICK_EMOJI = ["👍", "😂", "😱", "🔥", "🙏"];

export const SUMMARY = [
  { name: "Chi", granted: 2000, hands: 38, sevenDeuce: 0, balance: 3130, net: 1130 },
  { name: "Lym", granted: 2000, hands: 38, sevenDeuce: -50, balance: 1460, net: -540 },
  { name: "Bình", granted: 1500, hands: 35, sevenDeuce: 250, balance: 1500, net: 0 },
  { name: "Khoa", granted: 1000, hands: 30, sevenDeuce: -50, balance: 300, net: -700 },
  { name: "An", granted: 1000, hands: 38, sevenDeuce: -50, balance: 1110, net: 110 },
];

export const HANDS = [
  { no: 38, at: "21:06", voided: false, players: [{ name: "Chi", net: 920 }, { name: "Lym", net: -400 }, { name: "An", net: -520 }] },
  { no: 37, at: "21:03", voided: false, players: [{ name: "Bình", net: 340 }, { name: "Lym", net: -60 }] },
  { no: 36, at: "21:01", voided: true, players: [] },
  { no: 35, at: "20:58", voided: false, players: [{ name: "Khoa", net: 120 }, { name: "Chi", net: -120 }] },
];

/** replay: step 4 of 7 of hand 37, seen by Lym (Bình's cards stay face down until the end). */
export const REPLAY = {
  handNo: 37,
  step: 4, // index into `timeline` (0-based): the screen shows "Bước 5/7"
  steps: 7,
  action: "Bình tố lên 120",
  board: ["Qs", "9c", "3d"].map(card),
  pot: 220,
  players: [
    { name: "Lym", cards: ["Ad", "Th"].map(card), stack: 1400, bet: 0, note: "Bạn" },
    { name: "Bình", cards: ["??", "??"].map(card), stack: 1380, bet: 120, note: "Tố 120" },
    { name: "Chi", cards: [], stack: 2210, bet: 0, note: "Đã bỏ" },
  ],
  timeline: ["Chia bài", "Lym theo 20", "Bình check", "Flop · Lym check", "Bình tố lên 120", "Lym bỏ bài", "Bình ăn 220"],
};

export const OWNER = {
  room: "Bàn thứ Sáu",
  invite: "https://poker.ban-be.vn/rooms/join?token=XU8wtup9qfFdc74H",
  pending: "Blind 20/40 từ ván sau",
  players: [
    { name: "Lym", stack: 1460, seat: 1, inHand: true },
    { name: "An", stack: 920, seat: 2, inHand: true },
    { name: "Bình", stack: 1500, seat: 3, inHand: false },
    { name: "Dũng", stack: 640, seat: 6, inHand: false, note: "đang nghỉ" },
  ],
};

export const GUEST = {
  name: "khach-a1b2c3",
  rooms: [
    { name: "Bàn thứ Sáu", chips: 1460 },
    { name: "Tập luyện nhẹ", chips: 230 },
  ],
};

export const PROFILE = {
  name: "Lym",
  email: "lym@example.com",
  verified: true,
  methods: ["Mật khẩu", "Google"],
  rooms: [
    { name: "Bàn thứ Sáu", balance: 1460, net: -540 },
    { name: "Tập luyện nhẹ", balance: 230, net: 30 },
  ],
};
