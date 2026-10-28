// The poker table for d1: a top-down oval, seats placed on fixed coordinates so nothing
// overlaps, plus the bars and panels around it. On the landscape phone the stage is the left
// 612px of the 844×390 frame; the right column holds the actions or a panel.
import type { CSSProperties, ReactNode } from "react";
import {
  ChevronLeft,
  Coffee,
  Crown,
  Ellipsis,
  Eye,
  LogOut,
  MessageCircle,
  Minus,
  Moon,
  Plus,
  Send,
  Settings,
  Smile,
  Timer,
  WifiOff,
} from "lucide-react";

import { CHAT, QUICK_EMOJI, type Card, type Seat } from "../../shared/data";
import type { Device } from "../../shared/screens";
import { Avatar, ChipStack, IconBtn, PlayingCard, TimerRing, fmt } from "./kit";

/* ---------- model ---------- */

export type SeatView = Seat & {
  delta?: { text: string; kind: "gain" | "loss" }; // floating −50 / +250
  bubble?: string; // emote / chat bubble over the seat
  shown?: boolean; // hole cards face up (showdown)
};

export type TableModel = {
  room: string;
  blinds: string;
  handNo: number;
  pot: number;
  potLabel?: string;
  board: Card[];
  boardHi?: number[]; // board cards that make the winning hand
  seats: SeatView[];
};

type Pt = { x: number; y: number };

const GEO: Record<
  Device,
  {
    w: number;
    h: number;
    c: Pt;
    oval: { l: number; t: number; w: number; h: number };
    board: Pt;
    cardW: number;
    pot: Pt;
    mark: Pt;
    seats: Record<number, Pt>;
    meBet: Pt;
    dealer: { k: number; r: number; sign: 1 | -1 };
  }
> = {
  desktop: {
    w: 1100,
    h: 720,
    c: { x: 550, y: 325 },
    oval: { l: 140, t: 120, w: 820, h: 410 },
    board: { x: 550, y: 325 },
    cardW: 66,
    pot: { x: 550, y: 230 },
    mark: { x: 550, y: 410 },
    seats: {
      1: { x: 550, y: 655 },
      2: { x: 262, y: 560 },
      3: { x: 76, y: 330 },
      4: { x: 205, y: 128 },
      5: { x: 430, y: 62 },
      6: { x: 670, y: 62 },
      7: { x: 895, y: 128 },
      8: { x: 1024, y: 330 },
      9: { x: 838, y: 560 },
    },
    meBet: { x: 550, y: 468 },
    dealer: { k: 0.28, r: 38, sign: 1 },
  },
  // Landscape phone: seat points are avatar centres, except seat 1 (bottom centre of my cards
  // and plate). Seats 7 and 9 stay left of x 532 so the chat drawer never cuts one in half.
  mobile: {
    w: 612,
    h: 390,
    c: { x: 328, y: 198 },
    oval: { l: 116, t: 94, w: 424, h: 210 },
    board: { x: 328, y: 198 },
    cardW: 40,
    pot: { x: 328, y: 146 },
    mark: { x: 328, y: 238 },
    seats: {
      1: { x: 328, y: 364 },
      2: { x: 162, y: 290 },
      3: { x: 86, y: 192 },
      4: { x: 162, y: 98 },
      5: { x: 268, y: 58 },
      6: { x: 388, y: 58 },
      7: { x: 494, y: 98 },
      8: { x: 570, y: 192 },
      9: { x: 494, y: 290 },
    },
    meBet: { x: 328, y: 266 },
    dealer: { k: 0.36, r: 32, sign: 1 },
  },
};

export const seatPos = (device: Device, seat: number) => GEO[device].seats[seat];

const lerp = (a: Pt, b: Pt, k: number): Pt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
const at = (p: Pt, extra?: CSSProperties): CSSProperties => ({ left: p.x, top: p.y, ...extra });

function betPos(device: Device, seat: number): Pt {
  const g = GEO[device];
  if (seat === 1) return g.meBet;
  return lerp(g.seats[seat], g.c, 0.42);
}

function dealerPos(device: Device, seat: number): Pt {
  const g = GEO[device];
  const s = g.seats[seat];
  const v = { x: g.c.x - s.x, y: g.c.y - s.y };
  const len = Math.hypot(v.x, v.y);
  const base = lerp(s, g.c, g.dealer.k);
  return { x: base.x - (v.y / len) * g.dealer.r * g.dealer.sign, y: base.y + (v.x / len) * g.dealer.r * g.dealer.sign };
}

/* ---------- pieces on the felt ---------- */

export function Board({ device, cards, hi = [], style }: { device: Device; cards: Card[]; hi?: number[]; style?: CSSProperties }) {
  const g = GEO[device];
  return (
    <div className="board" style={style ?? at(g.board)}>
      {Array.from({ length: 5 }, (_, i) =>
        cards[i] ? (
          <PlayingCard
            key={i}
            card={cards[i]}
            w={g.cardW}
            className={hi.length ? (hi.includes(i) ? "is-hi" : "is-lo") : ""}
          />
        ) : (
          <span key={i} className="board-slot" style={{ width: g.cardW, height: g.cardW * 1.4 }} />
        ),
      )}
    </div>
  );
}

export function Pot({ device, amount, label = "Pot", style }: { device: Device; amount: number; label?: string; style?: CSSProperties }) {
  return (
    <div className="pot" style={style ?? at(GEO[device].pot)}>
      <ChipStack amount={amount} cols={device === "desktop" ? 3 : 2} size={device === "desktop" ? 22 : 14} max={device === "desktop" ? 5 : 3} />
      <span className="pot-pill">
        <small>{label}</small>
        <b>{fmt(amount)}</b>
      </span>
    </div>
  );
}

function Bet({ device, seat, amount }: { device: Device; seat: number; amount: number }) {
  return (
    <div className="bet" style={at(betPos(device, seat))}>
      <ChipStack amount={amount} size={device === "desktop" ? 20 : 14} max={4} />
      <span className="bet-amt">{fmt(amount)}</span>
    </div>
  );
}

/* ---------- seats ---------- */

function SeatTag({ s, device }: { s: SeatView; device: Device }) {
  const ic = device === "desktop" ? 12 : 10;
  switch (s.state) {
    case "turn":
      return (
        <span className="tag tag-turn">
          <Timer size={ic} strokeWidth={2.4} />
          {s.timer?.left}s
        </span>
      );
    case "folded":
      return <span className="tag tag-fold">Đã bỏ</span>;
    case "sitting-out":
      return (
        <span className="tag tag-out">
          <Moon size={ic} strokeWidth={2.2} />
          {s.lastAction ?? "Đang nghỉ"}
        </span>
      );
    case "disconnected":
      return (
        <span className="tag tag-dc">
          <WifiOff size={ic} strokeWidth={2.4} />
          {s.lastAction ?? "Mất kết nối"}
        </span>
      );
    case "all-in":
      return <span className="tag tag-allin">{s.lastAction ?? "All-in"}</span>;
    case "winner":
      return (
        <span className="tag tag-win">
          <Crown size={ic} strokeWidth={2.4} />
          Thắng
        </span>
      );
    default:
      return s.lastAction ? <span className="tag">{s.lastAction}</span> : null;
  }
}

function SeatPod({ device, s, cx }: { device: Device; s: SeatView; cx: number }) {
  const p = seatPos(device, s.seat);
  const avSize = device === "desktop" ? 56 : 36;
  if (s.state === "empty") {
    return (
      <div className="seat seat-empty" style={at(p)}>
        <span className="chair" style={{ width: avSize, height: avSize }}>
          <Plus size={device === "desktop" ? 18 : 14} strokeWidth={2} />
        </span>
        <span className="chair-label">Ngồi vào</span>
      </div>
    );
  }
  const side = p.x <= cx ? "r" : "l";
  const hasHidden = s.cards && s.cards.length > 0 && !s.shown;
  return (
    <div className={`seat st-${s.state} toward-${side}`} style={at(p)}>
      {s.delta && <span className={`delta delta-${s.delta.kind}`}>{s.delta.text}</span>}
      {s.bubble && <span className="bubble">{s.bubble}</span>}
      {s.shown && s.cards && (
        <span className="seat-shown">
          {s.cards.map((c, i) => (
            <PlayingCard key={i} card={c} w={device === "desktop" ? 46 : 30} rotate={i === 0 ? -6 : 6} />
          ))}
        </span>
      )}
      <span className="seat-av" style={{ width: avSize, height: avSize }}>
        {hasHidden && (
          <span className={`seat-cards side-${side}`}>
            {s.cards!.map((c, i) => (
              <PlayingCard key={i} card={c} w={device === "desktop" ? 24 : 15} rotate={i === 0 ? -10 : 8} />
            ))}
          </span>
        )}
        <Avatar name={s.name ?? "?"} size={avSize} />
        {s.timer && <TimerRing size={avSize} left={s.timer.left} total={s.timer.total} gap={2} stroke={device === "desktop" ? 4 : 3} />}
        {s.state === "disconnected" && (
          <span className="av-flag">
            <WifiOff size={device === "desktop" ? 12 : 10} strokeWidth={2.6} />
          </span>
        )}
      </span>
      <span className="seat-plate">
        <b>{s.name}</b>
        <span className="stack">{fmt(s.stack ?? 0)}</span>
      </span>
      <SeatTag s={s} device={device} />
      {s.hand && <span className="seat-hand">{s.hand}</span>}
    </div>
  );
}

/** My own seat: big hole cards, wide plate. Desktop stacks cards over the plate under the rail; the
 *  phone puts the cards beside the plate (hint above it) at the bottom centre of the stage. */
function MeSeat({ device, s, hint }: { device: Device; s: SeatView; hint?: ReactNode }) {
  const p = seatPos(device, 1);
  const cards = s.cards ?? [];
  const d = device === "desktop";
  return (
    <div className={`me me-${device} st-${s.state}`} style={at(p)}>
      {s.delta && <span className={`delta delta-${s.delta.kind}`}>{s.delta.text}</span>}
      <span className="me-cards">
        {cards.length > 0 ? (
          cards.map((c, i) => <PlayingCard key={i} card={c} w={d ? 84 : 54} rotate={i === 0 ? -6 : 6} className="me-card" />)
        ) : (
          <span className="me-nocards">{s.state === "folded" ? "Đã bỏ bài" : "Chưa có bài"}</span>
        )}
        {s.hand && <span className="me-hand">{s.hand}</span>}
      </span>
      <span className="me-plate">
        <span className="me-av">
          <Avatar name={s.name ?? "?"} size={d ? 44 : 38} />
          {s.timer && <TimerRing size={d ? 44 : 38} left={s.timer.left} total={s.timer.total} gap={2} stroke={3.5} />}
        </span>
        <span className="me-id">
          <b>
            {s.name} <em>Bạn</em>
          </b>
          <span className="stack">{fmt(s.stack ?? 0)}</span>
        </span>
        {d && hint && <span className="me-hint">{hint}</span>}
      </span>
      {!d && hint && <span className="me-hint">{hint}</span>}
    </div>
  );
}

/* ---------- the stage ---------- */

export function Stage({
  device,
  model,
  meHint,
  showBoard = true,
  showPot = true,
  showBets = true,
  children,
  className = "",
}: {
  device: Device;
  model: TableModel;
  meHint?: ReactNode;
  showBoard?: boolean;
  showPot?: boolean;
  showBets?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const g = GEO[device];
  const me = model.seats.find((s) => s.isMe);
  const button = model.seats.find((s) => s.isButton);
  return (
    <div className={`stage stage-${device} ${className}`} style={{ width: g.w, height: g.h }}>
      <div className="table-glow" style={{ left: g.oval.l - 60, top: g.oval.t - 50, width: g.oval.w + 120, height: g.oval.h + 100 }} />
      <div className="rail" style={{ left: g.oval.l, top: g.oval.t, width: g.oval.w, height: g.oval.h }}>
        <div className="felt">
          <div className="felt-line" />
        </div>
      </div>
      <div className="felt-mark" style={at(g.mark)}>
        {model.room} · {model.blinds}
      </div>
      {showPot && model.pot > 0 && <Pot device={device} amount={model.pot} label={model.potLabel} />}
      {showBoard && <Board device={device} cards={model.board} hi={model.boardHi} />}
      {showBets &&
        model.seats.filter((s) => (s.bet ?? 0) > 0).map((s) => <Bet key={s.seat} device={device} seat={s.seat} amount={s.bet!} />)}
      {button && (
        <span className="dealer" style={at(dealerPos(device, button.seat))}>
          D
        </span>
      )}
      {model.seats
        .filter((s) => !s.isMe)
        .map((s) => (
          <SeatPod key={s.seat} device={device} s={s} cx={g.c.x} />
        ))}
      {me && <MeSeat device={device} s={me} hint={meHint} />}
      {children}
    </div>
  );
}

/* ---------- desktop chrome around the table ---------- */

export function TableTopBar({
  model,
  watchers = 3,
  title,
  meta,
  back = "Sảnh",
  right,
  ownerActive = false,
}: {
  model: { room: string; blinds: string; handNo: number };
  watchers?: number;
  title?: ReactNode;
  meta?: ReactNode;
  back?: string;
  right?: ReactNode;
  ownerActive?: boolean;
}) {
  return (
    <header className="tbar">
      <span className="tbar-back">
        <ChevronLeft size={18} strokeWidth={2} />
        {back}
      </span>
      <span className="tbar-title">
        <b>{title ?? model.room}</b>
        <span className="tbar-meta">
          {meta ?? (
            <>
              <span>Blind {model.blinds}</span>
              <i />
              <span>Ván #{model.handNo}</span>
              <i />
              <span>Phòng riêng</span>
              <i />
              <span className="is-brass">Thưởng 7-2 · 50</span>
            </>
          )}
        </span>
      </span>
      <span className="tbar-right">
        {right ?? (
          <>
        <span className="tbar-watch">
          <Eye size={16} strokeWidth={1.9} />
          {watchers} đang xem
        </span>
        <span className="tbar-btn">
          <Coffee size={15} strokeWidth={1.9} />
          Nghỉ ván sau
        </span>
        <IconBtn label="Bảng chủ phòng" className={ownerActive ? "is-active" : ""}>
          <Crown size={17} strokeWidth={1.9} />
        </IconBtn>
        <IconBtn label="Cài đặt">
          <Settings size={17} strokeWidth={1.9} />
        </IconBtn>
        <span className="tbar-btn is-quiet">
          <LogOut size={15} strokeWidth={1.9} />
          Rời bàn
        </span>
          </>
        )}
      </span>
    </header>
  );
}

export function SidePanel({ tab, counts, children, footer }: { tab: 0 | 1 | 2; counts?: [number?, number?, number?]; children: ReactNode; footer?: ReactNode }) {
  const labels = ["Chat", "Người chơi", "Nhật ký"];
  return (
    <aside className="side">
      <div className="side-tabs">
        {labels.map((l, i) => (
          <span key={l} className={`side-tab${i === tab ? " is-active" : ""}`}>
            {l}
            {counts?.[i] !== undefined && <i>{counts[i]}</i>}
          </span>
        ))}
      </div>
      <div className="side-body">{children}</div>
      {footer && <div className="side-foot">{footer}</div>}
    </aside>
  );
}

export function ChatList({ compact = false, spectators = ["Mai"] }: { compact?: boolean; spectators?: string[] }) {
  return (
    <div className={`chat${compact ? " is-compact" : ""}`}>
      <div className="chat-day">Ván #38 · 21:04</div>
      {CHAT.map((m, i) => {
        const mine = m.name === "Lym";
        const watching = spectators.includes(m.name);
        const text = watching ? m.text.replace(/^\(đang xem\)\s*/, "") : m.text;
        const onlyEmoji = /^\p{Extended_Pictographic}+$/u.test(text);
        return (
          <div key={i} className={`msg${mine ? " is-mine" : ""}${watching ? " is-watcher" : ""}`}>
            {!mine && <Avatar name={m.name} size={compact ? 26 : 30} />}
            <div className="msg-body">
              {!mine && (
                <span className="msg-who">
                  {m.name}
                  {watching && <em>đang xem</em>}
                  <time>{m.at}</time>
                </span>
              )}
              <span className={`msg-text${onlyEmoji ? " is-emoji" : ""}`}>{text}</span>
              {mine && <time className="msg-time">{m.at} · đã gửi</time>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ChatComposer({ draft }: { draft?: string }) {
  return (
    <div className="composer">
      <div className="emoji-row">
        {QUICK_EMOJI.map((e) => (
          <span key={e} className="emoji">
            {e}
          </span>
        ))}
      </div>
      <div className="composer-row">
        <span className="composer-input">
          <Smile size={18} strokeWidth={1.8} />
          {draft ? (
            <span className="composer-text">
              {draft}
              <i className="caret" />
            </span>
          ) : (
            <span className="composer-ph">Nhắn cho cả bàn…</span>
          )}
        </span>
        <span className={`composer-send${draft ? " is-ready" : ""}`}>
          <Send size={17} strokeWidth={2} />
        </span>
      </div>
    </div>
  );
}

export function LogList({ items }: { items: { t: ReactNode; kind?: "street" | "me" | "win" | "warn" | "pay" }[] }) {
  return (
    <ol className="log">
      {items.map((it, i) => (
        <li key={i} className={it.kind ? `is-${it.kind}` : ""}>
          {it.t}
        </li>
      ))}
    </ol>
  );
}

/* ---------- desktop action bars ---------- */

export function TurnBar({ toCall, raise, presets, active = 0, min, max, left, total }: {
  toCall: number;
  raise: number;
  presets: { label: string; amount: number }[];
  active?: number;
  min: number;
  max: number;
  left: number;
  total: number;
}) {
  const frac = (raise - min) / (max - min);
  return (
    <div className="abar">
      <div className="abar-status">
        <span className="abar-eyebrow">Tới lượt bạn</span>
        <span className="abar-clock">
          <b>{left}</b>
          <small>giây</small>
        </span>
        <span className="abar-timebar">
          <i style={{ width: `${(left / total) * 100}%` }} />
        </span>
        <span className="abar-note">Hết giờ sẽ tự bỏ bài</span>
      </div>
      <div className="abar-main">
        <button type="button" className="act act-fold">
          <span>Bỏ</span>
        </button>
        <button type="button" className="act act-call">
          <span>Theo</span>
          <b>{fmt(toCall)}</b>
        </button>
        <button type="button" className="act act-raise">
          <span>Tố</span>
          <b>{fmt(raise)}</b>
        </button>
      </div>
      <div className="abar-raise">
        <div className="presets">
          {presets.map((p, i) => (
            <span key={p.label} className={`preset${i === active ? " is-active" : ""}`}>
              <span>{p.label}</span>
              <b>{fmt(p.amount)}</b>
            </span>
          ))}
        </div>
        <div className="slider-row">
          <span className="step-btn">
            <Minus size={14} strokeWidth={2.2} />
          </span>
          <span className="slider">
            <span className="slider-fill" style={{ width: `${frac * 100}%` }} />
            <span className="slider-thumb" style={{ left: `${frac * 100}%` }} />
            <span className="slider-min">{fmt(min)}</span>
            <span className="slider-max">{fmt(max)}</span>
          </span>
          <span className="step-btn">
            <Plus size={14} strokeWidth={2.2} />
          </span>
          <span className="amount-box">{fmt(raise)}</span>
        </div>
      </div>
    </div>
  );
}

export function IdleBar({ left, center, right, className = "" }: { left?: ReactNode; center: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={`abar abar-idle ${className}`}>
      <div className="idle-left">{left}</div>
      <div className="idle-center">{center}</div>
      <div className="idle-right">{right}</div>
    </div>
  );
}

export function PreAction({ label, on = false }: { label: string; on?: boolean }) {
  return (
    <span className={`pre${on ? " is-on" : ""}`}>
      <i />
      {label}
    </span>
  );
}

/* ---------- landscape phone chrome ---------- */

/** Over the stage, no background: back + room on the left, viewers / chat / more on the right. */
export function MobileTableBar({
  model,
  chatBadge,
  watchers = 3,
  title,
  sub,
  right,
}: {
  model: { room: string; blinds: string; handNo: number };
  chatBadge?: number;
  watchers?: number;
  title?: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="tbar-m">
      <IconBtn label="Quay lại">
        <ChevronLeft size={22} strokeWidth={2} />
      </IconBtn>
      <span className="tbar-m-title">
        <b>{title ?? model.room}</b>
        <small>{sub ?? `Blind ${model.blinds} · Ván #${model.handNo}`}</small>
      </span>
      <span className="tbar-m-right">
        {right ?? (
          <>
            <span className="tbar-m-watch">
              <Eye size={15} strokeWidth={2} />
              {watchers}
            </span>
            <IconBtn label="Chat" badge={chatBadge}>
              <MessageCircle size={20} strokeWidth={1.9} />
            </IconBtn>
            <IconBtn label="Thêm">
              <Ellipsis size={20} strokeWidth={2} />
            </IconBtn>
          </>
        )}
      </span>
    </header>
  );
}

/** The right column of the phone table (x 612 → edge); content stops 44px before the edge. */
export function PhonePanel({ className = "", children }: { className?: string; children: ReactNode }) {
  return <aside className={`ppanel ${className}`}>{children}</aside>;
}

/** My turn on the phone: the clock on top, raise sizing in the middle, the three actions at the
 *  bottom right where the right thumb rests (Tố largest). */
export function TurnPanel({ toCall, raise, presets, active = 0, min, max, left, total }: {
  toCall: number;
  raise: number;
  presets: { label: string; amount: number }[];
  active?: number;
  min: number;
  max: number;
  left: number;
  total: number;
}) {
  const frac = (raise - min) / (max - min);
  return (
    <PhonePanel className="tpanel">
      <div className="tp-clock">
        <span className="tp-secs">
          <b>{left}</b>
          <small>giây</small>
        </span>
        <span className="tp-label">
          <span className="abar-eyebrow">Tới lượt bạn</span>
          <small>Hết giờ tự bỏ bài</small>
        </span>
        <span className="abar-timebar">
          <i style={{ width: `${(left / total) * 100}%` }} />
        </span>
      </div>
      <div className="presets-m">
        {presets.map((p, i) => (
          <span key={p.label} className={`preset${i === active ? " is-active" : ""}`}>
            <span>{p.label}</span>
            <b>{fmt(p.amount)}</b>
          </span>
        ))}
      </div>
      <div className="slider-row">
        <span className="step-btn">
          <Minus size={16} strokeWidth={2.2} />
        </span>
        <span className="slider">
          <span className="slider-fill" style={{ width: `${frac * 100}%` }} />
          <span className="slider-thumb" style={{ left: `${frac * 100}%` }} />
          <span className="slider-min">{fmt(min)}</span>
          <span className="slider-max">{fmt(max)}</span>
        </span>
        <span className="step-btn">
          <Plus size={16} strokeWidth={2.2} />
        </span>
      </div>
      <div className="tp-acts">
        <button type="button" className="act act-fold">
          <span>Bỏ</span>
        </button>
        <button type="button" className="act act-call">
          <span>Theo</span>
          <b>{fmt(toCall)}</b>
        </button>
        <button type="button" className="act act-raise">
          <span>Tố</span>
          <b>{fmt(raise)}</b>
        </button>
      </div>
    </PhonePanel>
  );
}
