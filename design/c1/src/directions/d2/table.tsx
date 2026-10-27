// Giấy & Mực — the table, drawn like a game board. Seats sit at fixed, hand-checked coordinates
// so nothing overlaps at 1440×900 or 390×844.
import type { ReactNode } from "react";
import {
  Armchair,
  ChevronLeft,
  Coffee,
  Eye,
  History,
  Lock,
  LogOut,
  Menu,
  Plus,
  Settings2,
  Trophy,
  WifiOff,
} from "lucide-react";

import { TABLE_TURN, type Card, type Seat } from "../../shared/data";
import {
  Avatar,
  Badge,
  Bet,
  Brand,
  Btn,
  Check,
  ChipStack,
  Dealer,
  HomeBar,
  IconBtn,
  OnTable,
  PCard,
  Progress,
  Slider,
  SlotCard,
  StatusBar,
  TimerRing,
  fmt,
  type CardSize,
  type Pt,
} from "./ui";

/* =====================================================================
   Desktop geometry — stage is x 0..1100, y 56..760 of the 1440×900 frame
   ===================================================================== */

export const STAGE = { top: 56, width: 1100, height: 704 };
/** Stadium: x 230..870, y 140..470 (r = 165). Board: x 350..750, y 255..355. */
export const D_SEATS: Record<number, { card: Pt; bet: Pt; dealer: Pt }> = {
  1: { card: [550, 652], bet: [550, 425], dealer: [640, 428] },
  2: { card: [196, 482], bet: [318, 412], dealer: [300, 380] },
  3: { card: [112, 305], bet: [282, 305], dealer: [282, 262] },
  4: { card: [196, 128], bet: [318, 198], dealer: [300, 236] },
  5: { card: [440, 80], bet: [452, 172], dealer: [390, 176] },
  6: { card: [660, 80], bet: [648, 172], dealer: [710, 176] },
  7: { card: [904, 128], bet: [782, 198], dealer: [800, 236] },
  8: { card: [988, 305], bet: [818, 305], dealer: [818, 262] },
  9: { card: [904, 482], bet: [782, 412], dealer: [800, 380] },
};
export const D_CENTER: Pt = [550, 222];

export function Board({
  cards,
  size,
  marks,
  dim,
  slots = 5,
}: {
  cards: Card[];
  size: CardSize;
  marks?: boolean[];
  dim?: boolean;
  slots?: number;
}) {
  return (
    <div className={`board board-${size}`}>
      {Array.from({ length: slots }, (_, i) =>
        cards[i] ? (
          <PCard key={i} c={cards[i]} size={size} dim={dim || (marks ? !marks[i] : false)} mark={marks?.[i]} />
        ) : (
          <SlotCard key={i} size={size} label={i === 3 ? "Turn" : i === 4 ? "River" : undefined} />
        ),
      )}
    </div>
  );
}

export function Pot({ amount, label = "Pot", small }: { amount: number; label?: string; small?: boolean }) {
  return (
    <div className={`pot${small ? " pot-sm" : ""}`}>
      <ChipStack />
      <span className="pot-l">{label}</span>
      <span className="mono pot-n">{fmt(amount)}</span>
    </div>
  );
}

function seatTab(s: Seat, win?: number): ReactNode {
  switch (s.state) {
    case "folded":
      return <Badge kind="muted">Đã bỏ</Badge>;
    case "sitting-out":
      return (
        <Badge kind="dash" icon={<Coffee size={11} strokeWidth={2} />}>
          Đang nghỉ
        </Badge>
      );
    case "disconnected":
      return (
        <Badge kind="warn" icon={<WifiOff size={11} strokeWidth={2} />}>
          {s.lastAction ?? "Mất kết nối"}
        </Badge>
      );
    case "all-in":
      return <Badge kind="red">{s.lastAction ?? "All-in"}</Badge>;
    case "winner":
      return (
        <Badge kind="ink" icon={<Trophy size={11} strokeWidth={2} />}>
          {win ? `Thắng +${fmt(win)}` : "Thắng"}
        </Badge>
      );
    case "turn":
      return <Badge kind="red">Đến lượt</Badge>;
    default:
      return null;
  }
}

/** A name card around the desktop table (192×64), centred on `at`. */
export function SeatCard({ s, win, tab }: { s: Seat; win?: number; tab?: ReactNode }) {
  const [cx, cy] = D_SEATS[s.seat].card;
  const style = { left: cx - 96, top: cy - 32 };
  if (s.state === "empty")
    return (
      <div className="seat seat-empty" style={style}>
        <span className="seat-hole">
          <Armchair size={16} strokeWidth={1.75} />
        </span>
        <span className="seat-txt">
          <span className="seat-name">Ghế {s.seat}</span>
          <span className="seat-sub">Đang trống</span>
        </span>
      </div>
    );
  const cards = s.cards ?? [];
  const faceUp = cards.length > 0 && cards[0] !== "back";
  const sub = s.hand ?? (s.state === "waiting" || s.state === "turn" ? s.lastAction : undefined);
  const t = tab ?? seatTab(s, win);
  return (
    <div className={`seat st-${s.state}${faceUp ? " has-up" : ""}`} style={style}>
      {cards.length > 0 && (
        <div className={`seat-cards ${faceUp ? "up" : "down"}`}>
          {cards.map((c, i) => (
            <PCard key={i} c={c} size={faceUp ? "sm" : "xs"} />
          ))}
        </div>
      )}
      {t && <div className="seat-tab">{t}</div>}
      <span className="seat-av">
        {s.state === "turn" && s.timer ? (
          <TimerRing size={42} left={s.timer.left} total={s.timer.total}>
            <Avatar name={s.name!} size={32} />
          </TimerRing>
        ) : (
          <Avatar name={s.name!} size={36} />
        )}
        {s.state === "disconnected" && (
          <span className="av-flag">
            <WifiOff size={10} strokeWidth={2.4} />
          </span>
        )}
      </span>
      <span className="seat-txt">
        <span className="seat-name">{s.name}</span>
        <span className="seat-sub">
          <span className="mono">{fmt(s.stack ?? 0)}</span>
          {sub && <span className="seat-act">{sub}</span>}
        </span>
      </span>
    </div>
  );
}

/** Seat 1 on desktop: large cards above a wide name card. */
export function HeroDesk({ s, hint, result }: { s: Seat; hint?: ReactNode; result?: ReactNode }) {
  const turn = s.state === "turn" && s.timer;
  return (
    <>
      <div className={`hero-cards${s.state === "folded" ? " is-folded" : ""}`} style={{ left: 466, top: 500 }}>
        {(s.cards ?? []).map((c, i) => (
          <PCard key={i} c={c} size="xl" />
        ))}
      </div>
      <div className={`hero-card${turn ? " is-turn" : ""}`} style={{ left: 420, top: 620 }}>
        {turn ? (
          <TimerRing size={50} left={s.timer!.left} total={s.timer!.total}>
            <Avatar name="Lym" size={40} />
          </TimerRing>
        ) : (
          <Avatar name="Lym" size={42} />
        )}
        <span className="seat-txt">
          <span className="seat-name">
            {s.name} <em className="you">Bạn · ghế 1</em>
          </span>
          <span className="seat-sub">
            <span className="mono">{fmt(s.stack ?? 0)}</span>
            {s.hand && <span className="seat-act">{s.hand}</span>}
          </span>
        </span>
        {s.state === "folded" && (
          <span className="hero-state">
            <Badge kind="muted">Đã bỏ</Badge>
          </span>
        )}
        {turn && (
          <span className="hero-clock">
            <b className="mono">0:{String(s.timer!.left).padStart(2, "0")}</b>
            <small>còn lại</small>
          </span>
        )}
        {result}
      </div>
      {hint && (
        <div className="hero-hint" style={{ left: 652, top: 516 }}>
          {hint}
        </div>
      )}
    </>
  );
}

function SpectatorBar({ names }: { names: string[] }) {
  return (
    <div className="spec-bar" style={{ left: 16, top: 14 }}>
      <Eye size={14} strokeWidth={1.8} />
      <span className="eyebrow">Đang xem</span>
      <span className="spec-avs">
        {names.map((n) => (
          <Avatar key={n} name={n} size={22} />
        ))}
      </span>
      <span>{names.join(" · ")}</span>
    </div>
  );
}

export type DeskTableProps = {
  room: string;
  blinds: string;
  handNo: number;
  seats: Seat[];
  board: Card[];
  marks?: boolean[];
  boardDim?: boolean;
  pot?: number;
  center?: ReactNode;
  showBets?: boolean;
  win?: { seat: number; amount: number };
  heroHint?: ReactNode;
  heroResult?: ReactNode;
  under?: ReactNode;
  over?: ReactNode;
  spectators?: string[];
  status?: ReactNode;
  sideTab?: 0 | 1 | 2;
  side?: ReactNode;
  bar?: ReactNode;
  seatTabs?: Record<number, ReactNode>;
};

/** The whole 1440×900 desktop table screen, positioned absolutely (so it can also be cropped). */
export function DeskTable(p: DeskTableProps) {
  return (
    <div className="dt">
      <header className="ttop">
        <Brand size="sm" />
        <span className="ttop-div" />
        <div className="ttop-room">
          <h1 className="serif">{p.room}</h1>
          <span className="ttop-meta">
            <span className="mono">Blind {p.blinds}</span>
            <i />
            <span>
              Ván <span className="mono">#{p.handNo}</span>
            </span>
            <i />
            <span className="ttop-lock">
              <Lock size={12} strokeWidth={2} /> Riêng tư
            </span>
            <i />
            <span>
              Thưởng 7-2 · <span className="mono">50</span>
            </span>
          </span>
        </div>
        <div className="ttop-right">
          {p.status}
          <span className="ttop-watch">
            <Eye size={15} strokeWidth={1.8} /> 3 người xem
          </span>
          <IconBtn icon={<Settings2 size={18} strokeWidth={1.75} />} label="Bảng chủ phòng" />
          <IconBtn icon={<History size={18} strokeWidth={1.75} />} label="Lịch sử ván" />
          <Btn v="ghost" s="sm" icon={<LogOut size={15} strokeWidth={1.9} />}>
            Rời bàn
          </Btn>
        </div>
      </header>

      <div className="stage" style={{ top: STAGE.top, width: STAGE.width, height: STAGE.height }}>
        <div className="stadium" style={{ left: 230, top: 140, width: 640, height: 330 }}>
          <div className="stadium-in" />
          <span className="stadium-print">No-Limit Hold'em · Blind {p.blinds}</span>
        </div>
        {p.spectators && <SpectatorBar names={p.spectators} />}
        {p.under}
        {p.center ??
          (p.pot !== undefined && (
            <OnTable at={D_CENTER}>
              <Pot amount={p.pot} />
            </OnTable>
          ))}
        <div className="board-pos" style={{ left: 350, top: 255 }}>
          <Board cards={p.board} size="lg" marks={p.marks} dim={p.boardDim} />
        </div>
        {p.seats.map((s) =>
          s.isMe ? (
            <HeroDesk key={s.seat} s={s} hint={p.heroHint} result={p.heroResult} />
          ) : (
            <SeatCard key={s.seat} s={s} win={p.win?.seat === s.seat ? p.win.amount : undefined} tab={p.seatTabs?.[s.seat]} />
          ),
        )}
        {p.showBets && p.seats.filter((s) => s.bet).map((s) => <Bet key={s.seat} at={D_SEATS[s.seat].bet} amount={s.bet!} />)}
        {p.seats
          .filter((s) => s.isButton)
          .map((s) => (
            <Dealer key={s.seat} at={D_SEATS[s.seat].dealer} />
          ))}
        {p.over}
      </div>

      <aside className="side">
        <div className="side-tabs">
          {(["Người chơi", "Chat", "Nhật ký ván"] as const).map((t, i) => (
            <span key={t} className={i === (p.sideTab ?? 2) ? "on" : ""}>
              {t}
              {i === 1 && <em>2</em>}
            </span>
          ))}
        </div>
        <div className="side-body">{p.side}</div>
      </aside>

      <div className="dbar">{p.bar}</div>
    </div>
  );
}

/* ---------- desktop action bars ---------- */

export function TurnBar() {
  const t = TABLE_TURN;
  const value = (225 - t.minRaise) / (t.maxRaise - t.minRaise);
  return (
    <div className="tbar">
      <div className="tbar-status">
        <span className="eyebrow red">Đến lượt bạn</span>
        <span className="tbar-clock">
          <b className="mono">0:14</b>
          <small>/ 20 giây</small>
        </span>
        <Progress value={14 / 20} />
        <small className="tbar-need">
          Cần theo <b className="mono">{t.toCall}</b> · pot <b className="mono">{t.pot}</b>
        </small>
      </div>
      <div className="tbar-raise">
        <div className="presets">
          {t.presets.map((p, i) => (
            <span key={p.label} className={`preset${i === 1 ? " on" : ""}`}>
              <span>{p.label}</span>
              <b className="mono">{fmt(p.amount)}</b>
            </span>
          ))}
        </div>
        <div className="raise-row">
          <span className="mono raise-end">{t.minRaise}</span>
          <Slider value={value} />
          <span className="mono raise-end">{fmt(t.maxRaise)}</span>
          <span className="raise-box">
            <small>Tố tới</small>
            <b className="mono">225</b>
          </span>
        </div>
      </div>
      <div className="tbar-acts">
        <Btn v="line" s="xl" className="act">
          Bỏ bài
          <kbd>F</kbd>
        </Btn>
        <Btn v="ink" s="xl" className="act">
          Theo {t.toCall}
          <kbd>C</kbd>
        </Btn>
        <Btn v="red" s="xl" className="act">
          Tố 225
          <kbd>R</kbd>
        </Btn>
      </div>
    </div>
  );
}

export function IdleBar({
  eyebrow,
  title,
  progress,
  sub,
  actions,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  progress: number;
  sub: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="ibar">
      <div className="ibar-status">
        <span className="eyebrow">{eyebrow}</span>
        <b className="serif">{title}</b>
        <Progress value={progress} tone="ink" />
        <small>{sub}</small>
      </div>
      <div className="ibar-pre">
        <span className="eyebrow">Chọn trước</span>
        <div className="ibar-checks">
          <Check on>Tự check / bỏ</Check>
          <Check>Tự theo mọi mức</Check>
          <Check>Nghỉ từ ván sau</Check>
        </div>
      </div>
      <div className="ibar-acts">{actions}</div>
    </div>
  );
}

/* =====================================================================
   Mobile geometry — 390×844 portrait. Stadium x 50..340, y 116..452.
   Avatars sit on the outline; labels hang below them.
   ===================================================================== */

export const M_SEATS: Record<number, { av: Pt; bet: Pt }> = {
  1: { av: [195, 452], bet: [195, 352] },
  2: { av: [76, 390], bet: [128, 352] },
  3: { av: [50, 284], bet: [110, 240] },
  4: { av: [76, 178], bet: [140, 214] },
  5: { av: [150, 123], bet: [172, 196] },
  6: { av: [240, 123], bet: [218, 196] },
  7: { av: [314, 178], bet: [250, 214] },
  8: { av: [340, 284], bet: [280, 240] },
  9: { av: [314, 390], bet: [262, 352] },
};

function mBadge(s: Seat): ReactNode {
  switch (s.state) {
    case "folded":
      return <Badge kind="muted">Đã bỏ</Badge>;
    case "sitting-out":
      return <Badge kind="dash">Đang nghỉ</Badge>;
    case "disconnected":
      return <Badge kind="warn">Mất kết nối</Badge>;
    case "all-in":
      return <Badge kind="red">All-in</Badge>;
    case "winner":
      return <Badge kind="ink">Thắng</Badge>;
    case "waiting":
      return s.lastAction ? <Badge kind="paper">{s.lastAction}</Badge> : null;
    default:
      return null;
  }
}

export function MSeat({ s, badge }: { s: Seat; badge?: ReactNode }) {
  const [cx, cy] = M_SEATS[s.seat].av;
  const style = { left: cx - 36, top: cy - 20 };
  if (s.state === "empty")
    return (
      <div className="ms ms-empty" style={style}>
        <span className="ms-hole">
          <Plus size={14} strokeWidth={2} />
        </span>
        <span className="ms-spacer" />
        <span className="ms-label">
          <span className="ms-name">Ghế {s.seat}</span>
          <span className="ms-stack">trống</span>
        </span>
      </div>
    );
  const b = badge === undefined ? mBadge(s) : badge;
  const faceDown = (s.cards ?? []).length > 0 && s.cards![0] === "back";
  return (
    <div className={`ms mst-${s.state}`} style={style}>
      {faceDown && (
        <span className="ms-cards">
          <i />
          <i />
        </span>
      )}
      <Avatar name={s.name!} size={40} />
      {s.isButton && <span className="ms-dealer">D</span>}
      {s.state === "disconnected" && (
        <span className="ms-flag">
          <WifiOff size={10} strokeWidth={2.4} />
        </span>
      )}
      {b ? <span className="ms-badge">{b}</span> : <span className="ms-spacer" />}
      <span className="ms-label">
        <span className="ms-name">{s.name}</span>
        <span className="ms-stack mono">{fmt(s.stack ?? 0)}</span>
      </span>
    </div>
  );
}

export type MobTableProps = {
  room: string;
  blinds: string;
  handNo: number;
  pot: number;
  seats: Seat[];
  board: Card[];
  marks?: boolean[];
  boardDim?: boolean;
  center?: ReactNode;
  showBets?: boolean;
  badges?: Record<number, ReactNode>;
  extra?: ReactNode;
  stripTag?: ReactNode;
  boardTop?: number;
  noBoard?: boolean;
};

/** Status bar, top strip and the ring of seats (y 0..~452). */
export function MobTable(p: MobTableProps) {
  const boardTop = p.boardTop ?? 269;
  return (
    <div className="mt">
      <StatusBar />
      <div className="mstrip">
        <IconBtn icon={<ChevronLeft size={20} strokeWidth={1.9} />} label="Về sảnh" />
        <span className="mstrip-room">
          <b className="serif">{p.room}</b>
          <span>
            <span className="mono">{p.blinds}</span> · Ván <span className="mono">#{p.handNo}</span>
            {p.stripTag}
          </span>
        </span>
        <span className="mstrip-pot">
          <span className="eyebrow">Pot</span>
          <b className="mono">{fmt(p.pot)}</b>
        </span>
        <IconBtn icon={<Menu size={20} strokeWidth={1.9} />} label="Menu" />
      </div>
      <div className="stadium m" style={{ left: 50, top: 116, width: 290, height: 336 }}>
        <div className="stadium-in" />
      </div>
      {p.center ?? (
        <OnTable at={[195, 245]}>
          <Pot amount={p.pot} small />
        </OnTable>
      )}
      {!p.noBoard && (
        <div className="board-pos" style={{ left: 92, top: boardTop }}>
          <Board cards={p.board} size="sm" marks={p.marks} dim={p.boardDim} />
        </div>
      )}
      {p.seats
        .filter((s) => !s.isMe)
        .map((s) => (
          <MSeat key={s.seat} s={s} badge={p.badges?.[s.seat]} />
        ))}
      {p.showBets &&
        p.seats.filter((s) => s.bet && !s.isMe).map((s) => <Bet key={s.seat} at={M_SEATS[s.seat].bet} amount={s.bet!} small />)}
      {p.extra}
    </div>
  );
}

/** Me, near the bottom: timer ring + big cards + a hand hint (y 462..592). */
export function MobHero({ s, hint }: { s: Seat; hint: ReactNode }) {
  const turn = s.state === "turn" && s.timer;
  return (
    <div className="mhero">
      <div className={`mhero-me${turn ? " is-turn" : ""}`}>
        {turn ? (
          <TimerRing size={56} left={s.timer!.left} total={s.timer!.total}>
            <Avatar name="Lym" size={44} />
          </TimerRing>
        ) : (
          <Avatar name="Lym" size={48} />
        )}
        <span className="mhero-name">
          Lym <em>· bạn</em>
        </span>
        <span className="mono mhero-stack">{fmt(s.stack ?? 0)}</span>
      </div>
      <div className="mhero-cards">
        {(s.cards ?? []).map((c, i) => (
          <PCard key={i} c={c} size="mh" />
        ))}
      </div>
      <div className="mhero-hint">{hint}</div>
    </div>
  );
}

/** The bottom sheet with the betting controls (y 592..844). */
export function TurnSheet() {
  const t = TABLE_TURN;
  const value = (225 - t.minRaise) / (t.maxRaise - t.minRaise);
  return (
    <div className="msheet ts" style={{ top: 592 }}>
      <span className="handle" />
      <div className="ts-row">
        <span className="eyebrow red">Đến lượt bạn</span>
        <Progress value={14 / 20} />
        <b className="mono ts-clock">0:14</b>
      </div>
      <div className="ts-presets">
        {t.presets.map((p, i) => (
          <span key={p.label} className={`preset${i === 1 ? " on" : ""}`}>
            <span>{p.label}</span>
            <b className="mono">{fmt(p.amount)}</b>
          </span>
        ))}
      </div>
      <div className="ts-slider">
        <span className="mono raise-end">{t.minRaise}</span>
        <Slider value={value} />
        <span className="raise-box">
          <b className="mono">225</b>
        </span>
      </div>
      <div className="ts-acts">
        <Btn v="line" s="xl">
          Bỏ bài
        </Btn>
        <Btn v="ink" s="xl">
          Theo {t.toCall}
        </Btn>
        <Btn v="red" s="xl">
          Tố 225
        </Btn>
      </div>
      <HomeBar />
    </div>
  );
}
