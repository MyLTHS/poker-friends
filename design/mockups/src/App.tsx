import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  Crown,
  Eye,
  Gamepad2,
  History,
  LayoutGrid,
  Link2,
  LockKeyhole,
  LogIn,
  Menu,
  MessageCircle,
  Mic2,
  MoreHorizontal,
  Plus,
  Radio,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Signal,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Spade,
  Trophy,
  UserMinus,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { history, players, rooms } from "./data";
import { themes, type Direction } from "./tokens";
import { ChipAmount, ChipIcon } from "./chips";
import { GridDesktopTable, GridMobileTable } from "./GridTables";
import { ActionBar, type BetPreset } from "./club/ActionBar";
import { ChipStack } from "./club/ChipStack";
import { PlayingCard } from "./club/PlayingCard";
import { Table } from "./club/Table";

type Screen =
  | "index"
  | "login"
  | "lobby"
  | "create"
  | "desktop"
  | "mobile"
  | "seven"
  | "host"
  | "summary";

const screens: {
  id: Screen;
  label: string;
  short: string;
  icon: typeof Gamepad2;
}[] = [
  {
    id: "index",
    label: "Mục lục",
    short: "Tổng quan hai hướng",
    icon: LayoutGrid,
  },
  {
    id: "login",
    label: "Đăng nhập",
    short: "Email, Google, khách",
    icon: LogIn,
  },
  {
    id: "lobby",
    label: "Sảnh chơi",
    short: "Phòng công khai & link mời",
    icon: Users,
  },
  { id: "create", label: "Tạo phòng", short: "Thiết lập luật bàn", icon: Plus },
  {
    id: "desktop",
    label: "Bàn desktop",
    short: "9 ghế & đầy đủ trạng thái",
    icon: Gamepad2,
  },
  {
    id: "mobile",
    label: "Bàn mobile",
    short: "Khung ngang 844 × 390",
    icon: SlidersHorizontal,
  },
  {
    id: "seven",
    label: "7–2 bluff thắng",
    short: "Khoảnh khắc ăn mừng",
    icon: Sparkles,
  },
  {
    id: "host",
    label: "Bảng chủ phòng",
    short: "Chip, blind, kick, đóng",
    icon: Crown,
  },
  {
    id: "summary",
    label: "Tổng kết & replay",
    short: "Lời/lỗ và lịch sử",
    icon: History,
  },
];

const cn = (...xs: (string | false | undefined)[]) =>
  xs.filter(Boolean).join(" ");

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="logo">
      <div className="logo-mark">
        <Spade size={18} />
      </div>
      {!compact && (
        <div>
          <b>POKER</b>
          <span>FRIENDS</span>
        </div>
      )}
    </div>
  );
}

function Button({
  children,
  kind = "primary",
  className = "",
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  kind?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn("btn", `btn-${kind}`, className)}
    >
      {children}
    </button>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("card", className)}>{children}</div>;
}
function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "green" | "gold" | "red" | "blue";
}) {
  return <span className={cn("pill", `pill-${tone}`)}>{children}</span>;
}

function Avatar({
  label,
  size = "md",
  online = true,
}: {
  label: string;
  size?: "sm" | "md" | "lg";
  online?: boolean;
}) {
  const hues: Record<string, string> = {
    TR: "#9c6de8",
    DU: "#e88155",
    AN: "#419ca2",
    MA: "#dd6c87",
    KH: "#b58a46",
    LI: "#4d7ee8",
    SƠ: "#7773c9",
    VY: "#cc658e",
  };
  return (
    <div
      className={cn("avatar", `avatar-${size}`)}
      style={{ background: hues[label] || "var(--panel-2)" }}
    >
      {label}
      {online && <i />}
    </div>
  );
}

function Timer({
  value = 14,
  small = false,
}: {
  value?: number;
  small?: boolean;
}) {
  return (
    <div
      className={cn("timer", small && "timer-small")}
      style={
        { "--progress": `${(value / 20) * 360}deg` } as React.CSSProperties
      }
    >
      <span>{value}</span>
    </div>
  );
}

const tableActionProps = {
  minRaise: 80,
  maxRaise: 1540,
  step: 20,
  initialRaise: 240,
  presets: [
    { label: "1/2 POT", value: 240 },
    { label: "3/4 POT", value: 360 },
    { label: "POT", value: 480 },
    { label: "ALL-IN", value: 1540 },
  ] satisfies BetPreset[],
};

function ChatPanel({ mobile = false }: { mobile?: boolean }) {
  const [messages, setMessages] = useState([
    { who: "Vy", text: "Tối nay ai chốt sổ cuối?" },
    { who: "Duy", text: "Tôi nhé 😄" },
    { who: "Trâm", text: "Linh nghĩ lâu thế 👀" },
  ]);
  const [draft, setDraft] = useState("");
  const send = () => {
    if (draft.trim()) {
      setMessages([...messages, { who: "Bạn", text: draft.trim() }]);
      setDraft("");
    }
  };
  return (
    <aside className={cn("chat", mobile && "chat-mobile")}>
      <div className="chat-head">
        <div>
          <MessageCircle size={16} />
          <b>Trò chuyện</b>
          <Pill tone="green">8</Pill>
        </div>
        <MoreHorizontal size={18} />
      </div>
      <div className="chat-feed">
        {messages.map((m, i) => (
          <div className="message" key={i}>
            <Avatar
              label={m.who === "Bạn" ? "AN" : m.who.slice(0, 2).toUpperCase()}
              size="sm"
            />
            <p>
              <b>{m.who}</b>
              <span>{m.text}</span>
            </p>
          </div>
        ))}
      </div>
      <div className="emoji-row">
        {["😄", "🔥", "👏", "🫣", "♠️"].map((x) => (
          <button key={x} onClick={() => setDraft(draft + x)}>
            {x}
          </button>
        ))}
      </div>
      <div className="chat-input">
        <input
          placeholder="Nhắn cả bàn…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button onClick={send}>
          <ChevronRight />
        </button>
      </div>
    </aside>
  );
}

function TableSurface({
  mobile = false,
  celebration = false,
}: {
  mobile?: boolean;
  celebration?: boolean;
}) {
  return (
    <Table
      players={players}
      board={["10♥", "J♣", "4♦", "K♠", "—"]}
      pot={480}
      lastAction={{ player: "Khôi", label: "đã theo", amount: 120 }}
      heroIndex={6}
      dealerIndex={4}
      smallBlindIndex={4}
      bigBlindIndex={5}
      compact={mobile}
    >
      {celebration && (
        <div className="celebration">
          <div className="celebration-rays" aria-hidden="true">
            <div className="spark s1">✦</div>
            <div className="spark s2">✦</div>
            <div className="spark s3">✦</div>
          </div>
          <div className="celebration-content">
            <div className="win-avatar">
              <Avatar label="LI" size="lg" />
            </div>
            <Pill tone="gold">7–2 BLUFF THẮNG</Pill>
            <h2>Linh vừa diễn quá đạt!</h2>
            <div className="reveal-cards">
              <PlayingCard value="7♥" large />
              <PlayingCard value="2♠" large />
            </div>
            <p>Mọi người đã bỏ bài · Tự động lật 7–2 cho cả bàn</p>
            <div className="bonus-line">
              <span>8 người trả × <ChipAmount value={50} /></span>
              <ChipAmount value={400} sign="plus" />
            </div>
            <Button>
              Tiếp tục ván mới <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}
    </Table>
  );
}

function GameHeader({
  sound,
  setSound,
}: {
  sound: boolean;
  setSound: (x: boolean) => void;
}) {
  return (
    <div className="game-head">
      <div>
        <button className="icon-btn">
          <ArrowLeft />
        </button>
        <div>
          <b>Thứ Sáu Vui Vẻ</b>
          <span>
            <i className="live-dot" /> Ván #1843 · <ChipAmount value={10} /> / <ChipAmount value={20} />
          </span>
        </div>
      </div>
      <div className="game-tools">
        <Pill tone="green">
          <Eye size={13} /> 3 người xem
        </Pill>
        <button className="icon-btn" onClick={() => setSound(!sound)}>
          {sound ? <Volume2 /> : <VolumeX />}
        </button>
        <button className="icon-btn">
          <Settings />
        </button>
      </div>
    </div>
  );
}

function DesktopTable({ celebration = false }: { celebration?: boolean }) {
  const [sound, setSound] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  return (
    <div className="game-shell">
      <GameHeader sound={sound} setSound={setSound} />
      <div className="game-grid">
        <main className="game-main">
          <TableSurface celebration={celebration} />
          {!celebration && <ActionBar {...tableActionProps} />}
        </main>
        {!celebration && (
          <button className="game-chat-toggle" onClick={() => setChatOpen(!chatOpen)}>
            <MessageCircle /> Chat <i>3</i>
          </button>
        )}
        {chatOpen && !celebration && (
          <div className="game-chat-popover">
            <button className="chat-popover-close" onClick={() => setChatOpen(false)}><X /></button>
            <ChatPanel />
          </div>
        )}
      </div>
    </div>
  );
}

function MobileTable() {
  const [chatOpen, setChatOpen] = useState(false);
  return (
    <div className="phone-wrap landscape-wrap">
      <div className="phone landscape-phone">
        <div className="phone-notch" aria-hidden="true" />
        <div className="landscape-topbar">
          <ArrowLeft />
          <b>Thứ Sáu Vui Vẻ</b>
          <span>Ván #1843</span>
          <span className="landscape-blinds"><ChipAmount value={10} /> / <ChipAmount value={20} /></span>
          <button onClick={() => setChatOpen(!chatOpen)}><MessageCircle /><i>3</i></button>
        </div>
        <div className="landscape-play">
          <div className="landscape-table"><TableSurface mobile /></div>
          <aside className="landscape-controls">
            <div className="your-hand">
              <div><PlayingCard value="A♠" large /><PlayingCard value="J♠" large /></div>
              <span>Bài của bạn<ChipAmount value={1540} /></span>
              <Timer value={14} />
            </div>
            <ActionBar mobile {...tableActionProps} />
          </aside>
        </div>
        {chatOpen && (
          <div className="mobile-chat-sheet">
            <div className="sheet-handle" />
            <ChatPanel mobile />
            <button className="sheet-close" onClick={() => setChatOpen(false)}>
              <X />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function IndexScreen({
  go,
  direction,
}: {
  go: (x: Screen) => void;
  direction: Direction;
}) {
  return (
    <div className="index-screen">
      <div className="eyebrow">
        <Sparkles size={14} /> UI EXPLORATION · 2026
      </div>
      <h1>
        Chọn cảm giác
        <br />
        <em>cho cuộc vui.</em>
      </h1>
      <p className="lead">
        Hai ngôn ngữ thiết kế cho cùng một bàn poker thân mật. Tất cả màn hình
        đều dùng dữ liệu giả và bấm thử được.
      </p>
      <div className="direction-preview">
        <Card className="big-preview">
          <div className="preview-table">
            <div />
            <span>♠</span>
          </div>
          <div>
            <Pill tone="gold">HƯỚNG {direction === "club" ? "A" : "B"}</Pill>
            <h3>{direction === "club" ? "Câu lạc bộ nỉ" : "Midnight Grid"}</h3>
            <p>
              {direction === "club"
                ? "Ấm, vui và có chất bàn poker truyền thống."
                : "Tối, sắc nét, đặt thông tin và tốc độ lên trước."}
            </p>
            <Button onClick={() => go("desktop")}>
              Mở bàn chơi <ChevronRight size={16} />
            </Button>
          </div>
        </Card>
        <div className="screen-grid">
          {screens.slice(1).map((s) => (
            <button key={s.id} onClick={() => go(s.id)}>
              <s.icon />
              <div>
                <b>{s.label}</b>
                <span>{s.short}</span>
              </div>
              <ChevronRight />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LoginScreen() {
  const [mode, setMode] = useState<"email" | "guest">("email");
  const [done, setDone] = useState(false);
  return (
    <div className="auth-screen">
      <div className="auth-art">
        <Logo />
        <div className="floating-card fc1">
          <PlayingCard value="A♠" large />
        </div>
        <div className="floating-card fc2">
          <PlayingCard value="K♥" large />
        </div>
        <div className="art-copy">
          <Pill tone="gold">CHỈ CHIP ẢO · KHÔNG TIỀN THẬT</Pill>
          <h2>
            Bàn quen.
            <br />
            Bạn thân.
            <br />
            Ván đáng nhớ.
          </h2>
          <p>Tạo phòng riêng và bắt đầu một tối poker cùng hội bạn.</p>
        </div>
        <div className="art-quote">
          <div className="avatar-stack">
            <Avatar label="AN" />
            <Avatar label="LI" />
            <Avatar label="VY" />
          </div>
          <span>12 người bạn đang trực tuyến</span>
        </div>
      </div>
      <Card className="auth-card">
        <div className="mobile-logo">
          <Logo />
        </div>
        {done ? (
          <div className="success-state">
            <div className="success-icon">✓</div>
            <h2>Chào mừng trở lại!</h2>
            <p>Đang đưa bạn tới sảnh chơi…</p>
            <Button onClick={() => setDone(false)}>Quay lại mockup</Button>
          </div>
        ) : (
          <>
            <span className="kicker">CHÀO MỪNG</span>
            <h1>
              {mode === "email"
                ? "Vào bàn thôi."
                : "Chơi ngay với tư cách khách"}
            </h1>
            <p>
              {mode === "email"
                ? "Đăng nhập để tiếp tục cuộc vui."
                : "Bạn có thể nâng cấp tài khoản sau mà không mất lịch sử."}
            </p>
            {mode === "email" ? (
              <>
                <label>
                  Email
                  <input type="email" defaultValue="an@pokerfriends.vn" />
                </label>
                <label>
                  Mật khẩu<a>Quên mật khẩu?</a>
                  <input type="password" defaultValue="password" />
                </label>
                <Button className="wide" onClick={() => setDone(true)}>
                  Đăng nhập <ChevronRight size={16} />
                </Button>
                <div className="divider">hoặc</div>
                <Button
                  kind="secondary"
                  className="wide google"
                  onClick={() => setDone(true)}
                >
                  <b>G</b> Tiếp tục với Google
                </Button>
                <button className="text-link" onClick={() => setMode("guest")}>
                  Chơi ngay với tư cách khách
                </button>
              </>
            ) : (
              <>
                <label>
                  Tên hiển thị
                  <input defaultValue="Người chơi vui vẻ" />
                </label>
                <Button className="wide" onClick={() => setDone(true)}>
                  Vào sảnh ngay <ChevronRight size={16} />
                </Button>
                <button className="text-link" onClick={() => setMode("email")}>
                  Đã có tài khoản? Đăng nhập
                </button>
              </>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function LobbyScreen({ go }: { go: (x: Screen) => void }) {
  const [joined, setJoined] = useState("");
  const [tab, setTab] = useState("Tất cả");
  return (
    <div className="page-screen">
      <header className="page-head">
        <Logo />
        <nav>
          <button className="active">Sảnh chơi</button>
          <button>Lịch sử</button>
          <button>Bạn bè</button>
        </nav>
        <div className="profile-tools">
          <button className="icon-btn">
            <Bell />
          </button>
          <Avatar label="AN" />
          <ChevronDown />
        </div>
      </header>
      <main className="lobby">
        <div className="welcome-row">
          <div>
            <span className="kicker">TỐI THỨ SÁU, 21:04</span>
            <h1>Chào An, vào bàn nhé?</h1>
            <p>3 phòng đang mở · 12 người bạn trực tuyến</p>
          </div>
          <Button onClick={() => go("create")}>
            <Plus /> Tạo phòng mới
          </Button>
        </div>
        <div className="invite-bar">
          <div className="invite-icon">
            <Link2 />
          </div>
          <div>
            <b>Có link mời?</b>
            <span>Dán link hoặc mã phòng để vào bàn riêng</span>
          </div>
          <input defaultValue="poker.friends/join/" />
          <Button
            kind="secondary"
            onClick={() => setJoined("Đã tìm thấy phòng “Bàn của Nam”")}
          >
            Vào phòng
          </Button>
        </div>
        {joined && (
          <div className="notice">
            <ShieldCheck /> {joined}
            <button onClick={() => setJoined("")}>
              <X />
            </button>
          </div>
        )}
        <div className="lobby-toolbar">
          <div className="tabs">
            {["Tất cả", "Đang chơi", "Chờ người"].map((x) => (
              <button
                className={tab === x ? "active" : ""}
                onClick={() => setTab(x)}
                key={x}
              >
                {x}
              </button>
            ))}
          </div>
          <div className="search">
            <Search />
            <input placeholder="Tìm phòng…" />
          </div>
        </div>
        <div className="room-list">
          {rooms
            .filter((r) => tab === "Tất cả" || r.status === tab)
            .map((r, i) => (
              <Card className="room-card" key={r.name}>
                <div className={cn("room-symbol", `symbol-${i}`)}>
                  <Spade />
                </div>
                <div className="room-main">
                  <div>
                    <h3>{r.name}</h3>
                    <Pill tone={r.tone === "live" ? "green" : "gold"}>
                      <i />
                      {r.status}
                    </Pill>
                  </div>
                  <span>
                    <Crown /> Chủ phòng: {r.host}
                  </span>
                </div>
                <div className="room-stat">
                  <span>BLIND</span>
                  <b><ChipAmount value={r.blind[0]} /> / <ChipAmount value={r.blind[1]} /></b>
                </div>
                <div className="room-stat">
                  <span>NGƯỜI CHƠI</span>
                  <b>
                    <Users />
                    {r.seats}
                  </b>
                </div>
                <div className="mini-avatars">
                  <Avatar label="TR" size="sm" />
                  <Avatar label="DU" size="sm" />
                  <Avatar label="AN" size="sm" />
                </div>
                <Button
                  kind={i === 1 ? "primary" : "secondary"}
                  onClick={() => go("desktop")}
                >
                  {i === 1 ? "Ngồi vào bàn" : "Xem bàn"} <ChevronRight />
                </Button>
              </Card>
            ))}
        </div>
      </main>
    </div>
  );
}

function Toggle({ on, setOn }: { on: boolean; setOn: (x: boolean) => void }) {
  return (
    <button className={cn("toggle", on && "on")} onClick={() => setOn(!on)}>
      <i />
    </button>
  );
}
function CreateScreen({ go }: { go: (x: Screen) => void }) {
  const [pub, setPub] = useState(false);
  const [seats, setSeats] = useState(9);
  const [bonus, setBonus] = useState(true);
  const [created, setCreated] = useState(false);
  return (
    <div className="page-screen">
      <header className="simple-head">
        <button className="icon-btn">
          <ArrowLeft />
        </button>
        <Logo />
        <span />
      </header>
      <main className="form-page">
        <div className="form-intro">
          <span className="kicker">THIẾT LẬP BÀN</span>
          <h1>Tạo một cuộc vui mới</h1>
          <p>
            Bạn có thể thay đổi blind và thời gian ở bảng chủ phòng trước ván kế
            tiếp.
          </p>
        </div>
        {created ? (
          <Card className="created-card">
            <div className="success-icon">✓</div>
            <h2>Phòng đã sẵn sàng!</h2>
            <p>Gửi link này cho hội bạn rồi vào bàn.</p>
            <div className="copy-field">
              poker.friends/join/PF-9XK2 <Copy />
            </div>
            <Button onClick={() => go("desktop")}>Vào bàn ngay</Button>
          </Card>
        ) : (
          <Card className="create-card">
            <section>
              <h3>Thông tin cơ bản</h3>
              <label>
                Tên phòng
                <input defaultValue="Thứ Sáu Vui Vẻ" />
              </label>
              <div className="field-grid">
                <label>
                  Small blind
                  <div className="money-input">
                    <ChipIcon />
                    <input type="number" defaultValue="10" />
                  </div>
                </label>
                <label>
                  Big blind
                  <div className="money-input">
                    <ChipIcon />
                    <input type="number" defaultValue="20" />
                  </div>
                </label>
              </div>
            </section>
            <section>
              <div className="section-row">
                <div>
                  <h3>Số ghế</h3>
                  <p>Tối đa 9 người chơi</p>
                </div>
                <div className="stepper">
                  <button onClick={() => setSeats(Math.max(2, seats - 1))}>
                    −
                  </button>
                  <b>{seats}</b>
                  <button onClick={() => setSeats(Math.min(9, seats + 1))}>
                    +
                  </button>
                </div>
              </div>
              <label>
                Thời gian suy nghĩ
                <select defaultValue="20">
                  <option value="15">15 giây</option>
                  <option value="20">20 giây</option>
                  <option value="30">30 giây</option>
                </select>
              </label>
            </section>
            <section>
              <div className="setting-row">
                <div className="setting-icon">
                  <LockKeyhole />
                </div>
                <div>
                  <h3>Phòng công khai</h3>
                  <p>
                    {pub
                      ? "Mọi người thấy phòng trong sảnh"
                      : "Chỉ vào được bằng link mời"}
                  </p>
                </div>
                <Toggle on={pub} setOn={setPub} />
              </div>
              <div className="setting-row seven-setting">
                <div className="setting-icon">7/2</div>
                <div>
                  <h3>
                    Thưởng bluff 7–2 <Pill tone="gold">VUI</Pill>
                  </h3>
                  <p>Mỗi người trả thưởng khi 7–2 bluff thắng</p>
                </div>
                <Toggle on={bonus} setOn={setBonus} />
              </div>
              {bonus && (
                <label>
                  Mức thưởng mỗi người
                  <div className="money-input">
                    <ChipIcon />
                    <input type="number" defaultValue="50" />
                  </div>
                  <small>
                    Người không đủ chip chỉ trả số còn lại. Không ai bị âm.
                  </small>
                </label>
              )}
            </section>
            <Button
              className="wide create-submit"
              onClick={() => setCreated(true)}
            >
              <Sparkles /> Tạo phòng
            </Button>
          </Card>
        )}
      </main>
    </div>
  );
}

function HostScreen({ direction }: { direction: Direction }) {
  const [blind, setBlind] = useState<[number, number]>([10, 20]);
  const [closed, setClosed] = useState(false);
  const [members, setMembers] = useState(
    players.filter((p) => p.state !== "empty").slice(0, 6),
  );
  return (
    <div className="panel-screen">
      <div className="panel-backdrop">
        {direction === "grid" ? <GridDesktopTable /> : <DesktopTable />}
      </div>
      <Card className="host-panel">
        <div className="panel-title">
          <div>
            <Pill tone="gold">
              <Crown size={12} /> CHỦ PHÒNG
            </Pill>
            <h2>Quản lý bàn chơi</h2>
            <p>Thay đổi áp dụng từ ván kế tiếp.</p>
          </div>
          <button className="icon-btn">
            <X />
          </button>
        </div>
        {closed ? (
          <div className="closed-state">
            <div className="success-icon">✓</div>
            <h3>Phòng đã đóng</h3>
            <p>Bảng tổng kết đã được tạo cho 8 người chơi.</p>
          </div>
        ) : (
          <>
            <div className="host-tabs">
              <button className="active">Người chơi</button>
              <button>Thiết lập bàn</button>
              <button>Nhật ký</button>
            </div>
            <section className="host-section">
              <div className="section-title">
                <b>Người chơi · {members.length}</b>
                <Button kind="secondary">
                  <Plus /> Cấp chip
                </Button>
              </div>
              {members.map((p, i) => (
                <div className="member-row" key={p.name}>
                  <Avatar label={p.avatar} />
                  <div>
                    <b>
                      {p.name}
                      {i === 2 && <small>BẠN</small>}
                    </b>
                    <span>
                      {p.state === "sitout"
                        ? "Đang tạm nghỉ"
                        : "Đang ngồi ghế " + (i + 1)}
                    </span>
                  </div>
                  <ChipStack amount={p.stack} />
                  <button
                    onClick={() => setMembers(members.filter((x) => x !== p))}
                    title="Mời khỏi phòng"
                  >
                    <UserMinus />
                  </button>
                </div>
              ))}
            </section>
            <section className="host-section">
              <div className="section-title">
                <div>
                  <b>Blind bàn</b>
                  <span>Hiện tại: <ChipAmount value={blind[0]} /> / <ChipAmount value={blind[1]} /></span>
                </div>
              </div>
              <div className="blind-choice">
                {([[10, 20], [25, 50], [50, 100]] as [number, number][]).map((x) => (
                  <button
                    className={blind[0] === x[0] ? "active" : ""}
                    onClick={() => setBlind(x)}
                    key={x.join("-")}
                  >
                    <ChipAmount value={x[0]} /> / <ChipAmount value={x[1]} />
                  </button>
                ))}
              </div>
            </section>
            <Button
              kind="danger"
              className="wide"
              onClick={() => setClosed(true)}
            >
              Đóng phòng & tạo tổng kết
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}

function SummaryScreen() {
  const [step, setStep] = useState(3);
  const [selected, setSelected] = useState(0);
  const results = [
    ["Linh", 1240],
    ["Vy", 680],
    ["Khôi", 220],
    ["An", -180],
    ["Sơn", -420],
    ["Duy", -640],
    ["Trâm", -900],
  ];
  return (
    <div className="page-screen">
      <header className="page-head">
        <Logo />
        <nav>
          <button>Sảnh chơi</button>
          <button className="active">Lịch sử</button>
          <button>Bạn bè</button>
        </nav>
        <Avatar label="AN" />
      </header>
      <main className="summary-page">
        <div className="summary-head">
          <div>
            <Pill tone="neutral">PHÒNG ĐÃ ĐÓNG</Pill>
            <h1>Thứ Sáu Vui Vẻ</h1>
            <p>25/10/2026 · 20:12–23:48 · 42 ván</p>
          </div>
          <Button kind="secondary">
            <Copy /> Chia sẻ tổng kết
          </Button>
        </div>
        <div className="summary-grid">
          <Card className="leaderboard">
            <div className="card-heading">
              <div>
                <Trophy />
                <span>
                  <b>Tổng kết lời / lỗ</b>
                  <small>So với tổng chip đã được cấp</small>
                </span>
              </div>
              <Pill tone="green">Cân bằng <ChipAmount value={0} /></Pill>
            </div>
            {results.map(([name, value], i) => (
              <div className={cn("result-row", i === 0 && "winner")} key={name}>
                <span className="rank">{i + 1}</span>
                <Avatar label={(name as string).slice(0, 2).toUpperCase()} />
                <b>{name}</b>
                <div className="result-bar">
                  <i
                    style={{ width: `${Math.abs(value as number) / 12.4}%` }}
                  />
                </div>
                <strong
                  className={(value as number) > 0 ? "positive" : "negative"}
                >
                  <ChipAmount
                    value={Math.abs(value as number)}
                    sign={(value as number) > 0 ? "plus" : "minus"}
                  />
                </strong>
              </div>
            ))}
          </Card>
          <Card className="history-card">
            <div className="card-heading">
              <div>
                <History />
                <span>
                  <b>Lịch sử ván</b>
                  <small>Chọn một ván để xem lại</small>
                </span>
              </div>
              <button className="icon-btn">
                <Search />
              </button>
            </div>
            {history.map((h, i) => (
              <button
                className={cn("history-row", selected === i && "active")}
                key={h.id}
                onClick={() => setSelected(i)}
              >
                <div>
                  <b>{h.id}</b>
                  <span>{h.ago}</span>
                </div>
                <div>
                  <span>Pot</span>
                  <ChipAmount value={h.pot} />
                </div>
                <div>
                  <span>Thắng</span>
                  <b>{h.winner}</b>
                </div>
                <ChevronRight />
              </button>
            ))}
          </Card>
        </div>
        <Card className="replay">
          <div className="replay-top">
            <div>
              <Pill tone="blue">REPLAY</Pill>
              <b>{history[selected].id}</b>
              <span>Pot <ChipAmount value={history[selected].pot} /> · {history[selected].winner} thắng</span>
            </div>
            <span>Bước {step}/7 · Vòng Turn</span>
          </div>
          <div className="replay-stage">
            <div className="replay-player rp1">
              <Avatar label="TR" />
              <b>Trâm</b>
              <span>Đã bỏ bài</span>
            </div>
            <div className="replay-player rp2">
              <Avatar label="KH" />
              <b>Khôi</b>
              <span>Theo <ChipAmount value={120} /></span>
            </div>
            <div className="replay-board">
              <ChipStack amount={480} />
              <div>
                {["10♥", "J♣", "4♦", "K♠"]
                  .slice(0, Math.max(3, step))
                  .map((x) => (
                    <PlayingCard value={x} key={x} />
                  ))}
              </div>
            </div>
            <div className="replay-player rp3">
              <Avatar label="LI" />
              <b>Linh</b>
              <span>Tố <ChipAmount value={240} /></span>
            </div>
          </div>
          <div className="replay-controls">
            <button onClick={() => setStep(1)}>
              <SkipBack />
            </button>
            <button onClick={() => setStep(Math.max(1, step - 1))}>
              <ArrowLeft />
            </button>
            <div className="timeline">
              {[1, 2, 3, 4, 5, 6, 7].map((x) => (
                <button
                  className={x <= step ? "done" : ""}
                  onClick={() => setStep(x)}
                  key={x}
                />
              ))}
            </div>
            <button onClick={() => setStep(Math.min(7, step + 1))}>
              <ChevronRight />
            </button>
            <button onClick={() => setStep(7)}>
              <SkipForward />
            </button>
          </div>
        </Card>
      </main>
    </div>
  );
}

export default function App() {
  const [direction, setDirection] = useState<Direction>("club");
  const [screen, setScreen] = useState<Screen>("index");
  const [navOpen, setNavOpen] = useState(false);
  const current = useMemo(
    () => screens.find((s) => s.id === screen)!,
    [screen],
  );
  const go = (next: Screen) => {
    setScreen(next);
    setNavOpen(false);
  };
  const tableMode = ["desktop", "mobile", "seven"].includes(screen);
  const content = () => {
    switch (screen) {
      case "login":
        return <LoginScreen />;
      case "lobby":
        return <LobbyScreen go={go} />;
      case "create":
        return <CreateScreen go={go} />;
      case "desktop":
        return direction === "grid" ? <GridDesktopTable /> : <DesktopTable />;
      case "mobile":
        return direction === "grid" ? <GridMobileTable /> : <MobileTable />;
      case "seven":
        return direction === "grid" ? (
          <GridDesktopTable celebration />
        ) : (
          <DesktopTable celebration />
        );
      case "host":
        return <HostScreen direction={direction} />;
      case "summary":
        return <SummaryScreen />;
      default:
        return <IndexScreen go={go} direction={direction} />;
    }
  };
  return (
    <div className={cn("app", `theme-${direction}`, tableMode && "table-mode")} style={themes[direction]}>
      <div className="prototype-bar">
        <button className="nav-trigger" onClick={() => setNavOpen(!navOpen)}>
          <Menu />
        </button>
        <div className="proto-title">
          <span>POKER FRIENDS</span>
          <b>{current.label}</b>
        </div>
        <div className="direction-switch">
          <span>Hướng thiết kế</span>
          <button
            className={direction === "club" ? "active" : ""}
            onClick={() => setDirection("club")}
          >
            <i /> A · Câu lạc bộ nỉ
          </button>
          <button
            className={direction === "grid" ? "active" : ""}
            onClick={() => setDirection("grid")}
          >
            <i /> B · Midnight Grid
          </button>
        </div>
        <Pill tone="neutral">MOCKUP TƯƠNG TÁC</Pill>
      </div>
      <div className="prototype-layout">
        <aside className={cn("screen-nav", navOpen && "open")}>
          <div className="nav-brand">
            <Logo />
            <button onClick={() => setNavOpen(false)}>
              <X />
            </button>
          </div>
          <p>MÀN HÌNH</p>
          {screens.map((s, i) => (
            <button
              className={screen === s.id ? "active" : ""}
              onClick={() => go(s.id)}
              key={s.id}
            >
              <span>{String(i).padStart(2, "0")}</span>
              <s.icon />
              <div>
                <b>{s.label}</b>
                <small>{s.short}</small>
              </div>
            </button>
          ))}
          <div className="nav-foot">
            <Signal />
            <span>Dữ liệu giả · Không backend</span>
          </div>
        </aside>
        <div className="mockup-canvas">{content()}</div>
      </div>
    </div>
  );
}
