// Kính & Ánh Kim (d2) — the table: a petrol felt under one overhead lamp, a dark polished rail
// with a champagne inlay, nine seats on fixed coordinates, the screen chrome around it.
import type { ReactNode } from "react";
import { ChevronLeft, Crown, Eye, Lock, MessageCircle, Minus, Plus, Settings2, WifiOff, Moon } from "lucide-react";

import { TABLE_TURN, type Card, type Seat } from "../../shared/data";
import type { Device } from "../../shared/screens";
import { fmt } from "./lib";
import { Avatar, Bet, Btn, Chip, Dealer, IconBtn, Mark, PCard, Pill, Ring, Slot, Stack, type ChipTone } from "./ui";

/* ============================================================= geometry */

type P = { x: number; y: number };
/** Stage sizes: desktop stage sits under the 64px top bar, left of the 400px side column. */
export const STAGE: Record<Device, { w: number; h: number; c: P; felt: { w: number; h: number } }> = {
  desktop: { w: 1040, h: 836, c: { x: 520, y: 392 }, felt: { w: 750, h: 386 } },
  mobile: { w: 588, h: 390, c: { x: 316, y: 196 }, felt: { w: 384, h: 192 } },
};

/** Seat anchors (centre of the avatar), clockwise from my seat at the bottom. */
export const SEAT_AT: Record<Device, Record<number, P>> = {
  desktop: {
    1: { x: 520, y: 704 },
    2: { x: 226, y: 618 },
    3: { x: 84, y: 424 },
    4: { x: 150, y: 206 },
    5: { x: 384, y: 112 },
    6: { x: 656, y: 112 },
    7: { x: 890, y: 206 },
    8: { x: 956, y: 424 },
    9: { x: 814, y: 618 },
  },
  mobile: {
    1: { x: 316, y: 346 },
    2: { x: 164, y: 304 },
    3: { x: 100, y: 214 },
    4: { x: 132, y: 116 },
    5: { x: 248, y: 74 },
    6: { x: 384, y: 74 },
    7: { x: 500, y: 116 },
    8: { x: 532, y: 214 },
    9: { x: 468, y: 304 },
  },
};

const lerp = (a: P, b: P, k: number): P => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
/** Where a seat's bet sits: on the felt, between the seat and the pot. */
const betAt = (d: Device, seat: number): P => lerp(SEAT_AT[d][seat], STAGE[d].c, d === "desktop" ? 0.42 : 0.4);
/** The dealer button sits beside the bet line, rotated a quarter turn away from it. */
const dealerAt = (d: Device, seat: number): P => {
  const a = SEAT_AT[d][seat];
  const c = STAGE[d].c;
  const len = Math.hypot(c.x - a.x, c.y - a.y);
  const off = d === "desktop" ? 40 : 30;
  const p = lerp(a, c, d === "desktop" ? 0.3 : 0.24);
  return { x: p.x - ((c.y - a.y) / len) * off, y: p.y + ((c.x - a.x) / len) * off };
};

const BET_TONES: ChipTone[][] = [["ivory", "petrol"], ["onyx", "ivory", "petrol"], ["ruby", "ivory"]];

/* ================================================================= seats */

function seatTag(s: Seat, d: Device): ReactNode {
  const small = d === "mobile";
  switch (s.state) {
    case "turn":
      return null;
    case "folded":
      return <Pill tone="mute">Đã bỏ</Pill>;
    case "sitting-out":
      return (
        <Pill tone="glass" icon={<Moon size={small ? 10 : 12} strokeWidth={2.4} />}>
          Đang nghỉ
        </Pill>
      );
    case "disconnected":
      return (
        <Pill tone="red" icon={<WifiOff size={small ? 10 : 12} strokeWidth={2.4} />}>
          {s.lastAction ?? "Mất kết nối"}
        </Pill>
      );
    case "all-in":
      return <Pill tone="solid">{s.lastAction ?? "All-in"}</Pill>;
    case "winner":
      return (
        <Pill tone="gold" icon={<Crown size={small ? 10 : 12} strokeWidth={2.4} />}>
          {s.hand ?? "Thắng"}
        </Pill>
      );
    default:
      if (s.hand) return <Pill tone="glass">{s.hand}</Pill>;
      if (!s.lastAction) return null;
      if (s.lastAction.startsWith("Theo")) return <Pill tone="cyan">{s.lastAction}</Pill>;
      if (s.lastAction.startsWith("Cược") || s.lastAction.startsWith("Tố")) return <Pill tone="gold">{s.lastAction}</Pill>;
      return <Pill tone="glass">{s.lastAction}</Pill>;
  }
}

export type SeatOpts = {
  /** Show these cards face up next to the seat (showdown / 7-2). */
  reveal?: boolean;
  /** Replace the state tag. */
  tag?: ReactNode;
  /** Extra node under the seat (payments in the 7-2 moment). */
  extra?: ReactNode;
  /** Chat bubble above the seat. */
  say?: string;
};

function EmptySeat({ d, p }: { d: Device; p: P }) {
  return (
    <div className={`k-seat k-seat-empty ${d === "mobile" ? "k-mseat" : ""}`} style={{ left: p.x, top: p.y }}>
      <span className="k-empty-ring">
        <Plus size={d === "mobile" ? 15 : 20} strokeWidth={2.2} />
      </span>
      <span className="k-empty-t">
        <b>Ngồi vào</b>
        {d === "desktop" && <small>Ghế trống</small>}
      </span>
    </div>
  );
}

function SeatView({ s, d, o = {} }: { s: Seat; d: Device; o?: SeatOpts }) {
  const p = SEAT_AT[d][s.seat];
  if (s.state === "empty") return <EmptySeat d={d} p={p} />;
  const mob = d === "mobile";
  const name = s.name ?? "";
  const turn = s.state === "turn";
  const av = mob ? (s.isMe ? 38 : 30) : s.isMe ? 66 : 56;
  const ring = s.state === "winner" ? "gold" : turn ? "none" : "steel";
  const dim = s.state === "folded" || s.state === "sitting-out";
  const avatar = <Avatar name={name} size={av} ring={ring} dim={dim} />;
  const face = turn && s.timer ? (
    <Ring size={av + (mob ? 10 : 14)} left={s.timer.left} total={s.timer.total} stroke={mob ? 3 : 4}>
      {avatar}
    </Ring>
  ) : (
    avatar
  );
  const holeBacks = !o.reveal && !s.isMe && s.cards && s.cards.length > 0 && s.cards[0] === "back";
  const shown = o.reveal && s.cards && s.cards.length > 0 && s.cards[0] !== "back";
  const tag = o.tag ?? seatTag(s, d);
  return (
    <div
      className={`k-seat k-seat-${s.state} ${s.isMe ? "k-seat-me" : ""} ${mob ? "k-mseat" : ""}`}
      style={{ left: p.x, top: p.y }}
    >
      {o.say && <span className="k-say">{o.say}</span>}
      {holeBacks && (
        <span className="k-hole">
          <PCard c="back" w={mob ? 14 : 22} tilt={-8} />
          <PCard c="back" w={mob ? 14 : 22} tilt={7} />
        </span>
      )}
      {shown && (
        <span className={`k-shown ${mob ? (s.seat >= 2 && s.seat <= 5 ? "k-shown-r" : "k-shown-l") : ""}`}>
          {s.cards!.map((c, i) => (
            <PCard key={i} c={c} w={mob ? 30 : 46} tilt={i ? 6 : -6} glow={s.state === "winner" ? "gold" : undefined} />
          ))}
        </span>
      )}
      <span className="k-seat-av">
        {face}
        {s.state === "disconnected" && (
          <span className="k-av-flag red">
            <WifiOff size={mob ? 9 : 12} strokeWidth={2.6} />
          </span>
        )}
        {s.state === "sitting-out" && (
          <span className="k-av-flag">
            <Moon size={mob ? 9 : 12} strokeWidth={2.6} />
          </span>
        )}
        {s.state === "winner" && (
          <span className="k-av-crown">
            <Crown size={mob ? 12 : 16} strokeWidth={2.4} />
          </span>
        )}
      </span>
      <span className="k-plate">
        <b className="k-plate-n">
          {name}
          {s.isMe && <em>bạn</em>}
        </b>
        <span className="k-plate-s">
          <Chip size={mob ? 10 : 12} />
          <b className="k-num">{fmt(s.stack ?? 0)}</b>
        </span>
      </span>
      {tag && <span className="k-seat-tag">{tag}</span>}
      {o.extra && <span className="k-seat-extra">{o.extra}</span>}
    </div>
  );
}

/* ================================================================= table */

export function Felt({ d, room = "Bàn thứ Sáu", children }: { d: Device; room?: string; children?: ReactNode }) {
  const st = STAGE[d];
  return (
    <div
      className="k-rail"
      style={{
        left: st.c.x - st.felt.w / 2,
        top: st.c.y - st.felt.h / 2,
        width: st.felt.w,
        height: st.felt.h,
      }}
    >
      <i className="k-rail-shine" />
      <div className="k-felt">
        <i className="k-felt-line" />
        <span className="k-felt-mark">
          <Mark size={d === "mobile" ? 14 : 22} />
          {room}
        </span>
        {children}
      </div>
    </div>
  );
}

export function Board({ cards, w, glow = [], dim = [], className = "" }: { cards: Card[]; w: number; glow?: number[]; dim?: number[]; className?: string }) {
  return (
    <div className={`k-board ${className}`}>
      {Array.from({ length: 5 }, (_, i) =>
        cards[i] ? <PCard key={i} c={cards[i]} w={w} glow={glow.includes(i) ? "gold" : undefined} dim={dim.includes(i)} /> : <Slot key={i} w={w} />,
      )}
    </div>
  );
}

export function Pot({ n, label = "Pot", d, tones = ["petrol", "ivory", "onyx", "ruby", "ivory"] }: { n: number; label?: string; d: Device; tones?: ChipTone[] }) {
  return (
    <span className={`k-pot ${d === "mobile" ? "k-pot-m" : ""}`}>
      <Stack tones={tones.slice(0, 3)} w={d === "mobile" ? 16 : 24} />
      <Stack tones={tones} w={d === "mobile" ? 16 : 24} />
      <span className="k-pot-t">
        <small>{label}</small>
        <b className="k-num">{fmt(n)}</b>
      </span>
    </span>
  );
}

export function Table({
  d,
  seats,
  board,
  pot,
  potLabel,
  opts = {},
  center,
  hero,
  glowBoard,
  dimBoard,
  className = "",
  children,
}: {
  d: Device;
  seats: Seat[];
  board: Card[];
  pot: number;
  potLabel?: string;
  opts?: Record<number, SeatOpts>;
  /** Replaces pot + board in the middle of the felt. */
  center?: ReactNode;
  /** My two cards, big, in front of my seat. */
  hero?: ReactNode;
  glowBoard?: number[];
  dimBoard?: number[];
  className?: string;
  children?: ReactNode;
}) {
  const st = STAGE[d];
  const mob = d === "mobile";
  const button = seats.find((s) => s.isButton);
  return (
    <div className={`k-table ${mob ? "k-table-m" : ""} ${className}`} style={{ width: st.w, height: st.h }}>
      <i className="k-lamp" style={{ left: st.c.x, top: st.c.y }} />
      <Felt d={d} />
      <div className="k-mid" style={{ left: st.c.x, top: st.c.y }}>
        {center ?? (
          <>
            <Pot n={pot} label={potLabel} d={d} />
            <Board cards={board} w={mob ? 38 : 64} glow={glowBoard} dim={dimBoard} />
          </>
        )}
      </div>
      {seats.map((s) =>
        (s.bet ?? 0) > 0 ? (
          <span key={`b${s.seat}`} className="k-bet-at" style={{ left: betAt(d, s.seat).x, top: betAt(d, s.seat).y }}>
            <Bet amount={s.bet!} tones={BET_TONES[s.seat % BET_TONES.length]} w={mob ? 15 : 22} />
          </span>
        ) : null,
      )}
      {button && (
        <span className="k-dealer-at" style={{ left: dealerAt(d, button.seat).x, top: dealerAt(d, button.seat).y }}>
          <Dealer size={mob ? 18 : 26} />
        </span>
      )}
      {seats.map((s) => (
        <SeatView key={s.seat} s={s} d={d} o={opts[s.seat]} />
      ))}
      {hero && <div className="k-hero">{hero}</div>}
      {children}
    </div>
  );
}

/** My two cards, fanned, lifted off the felt. */
export function HeroCards({ cards, d, dim }: { cards: Card[]; d: Device; dim?: boolean }) {
  return (
    <span className={`k-herocards ${dim ? "dim" : ""}`}>
      {cards.map((c, i) => (
        <PCard key={i} c={c} w={d === "mobile" ? 40 : 76} tilt={i ? 7 : -7} />
      ))}
    </span>
  );
}

/* ================================================================ chrome */

export function RoomMeta({ hand, extra }: { hand: number; extra?: ReactNode }) {
  return (
    <span className="k-meta">
      <span>
        Blind <b className="k-num">10/20</b>
      </span>
      <i />
      <span>
        Ván <b className="k-num">#{hand}</b>
      </span>
      <i />
      <span>
        Thưởng 7-2 <b className="k-num">50</b>
      </span>
      {extra}
    </span>
  );
}

/** Desktop top bar over the table screens. */
export function TableTop({ hand, extra, chatBadge = 2 }: { hand: number; extra?: ReactNode; chatBadge?: number }) {
  return (
    <header className="k-ttop">
      <span className="k-ttop-back">
        <IconBtn icon={<ChevronLeft size={20} strokeWidth={2.2} />} />
        <span>Sảnh</span>
      </span>
      <span className="k-ttop-room">
        <b>
          {TABLE_TURN.room}
          <Lock size={14} strokeWidth={2.4} />
        </b>
        <RoomMeta hand={hand} extra={extra} />
      </span>
      <span className="k-ttop-r">
        <span className="k-watchers">
          <span className="k-watchers-av">
            <Avatar name="Mai" size={24} ring="none" />
            <Avatar name="Tùng" size={24} ring="none" />
            <Avatar name="Ngọc" size={24} ring="none" />
          </span>
          <Eye size={15} strokeWidth={2.2} />
          <b className="k-num">3</b> đang xem
        </span>
        <IconBtn icon={<MessageCircle size={19} strokeWidth={2.1} />} badge={chatBadge || undefined} active={!chatBadge} />
        <IconBtn icon={<Settings2 size={19} strokeWidth={2.1} />} />
        <span className="k-ttop-me">
          <Avatar name="Lym" size={34} />
        </span>
      </span>
    </header>
  );
}

/** Phone: back + room at top-left of the stage, chat/viewers at its top-right. */
export function MTableTop({ hand, chatBadge = 2, right = true }: { hand: number; chatBadge?: number; right?: boolean }) {
  return (
    <>
      <span className="k-mtop-l">
        <IconBtn icon={<ChevronLeft size={20} strokeWidth={2.2} />} />
        <span className="k-mtop-room">
          <b>{TABLE_TURN.room}</b>
          <small>
            Ván <span className="k-num">#{hand}</span> · <span className="k-num">10/20</span>
          </small>
        </span>
      </span>
      {right && (
        <span className="k-mtop-r">
          <IconBtn icon={<Eye size={18} strokeWidth={2.1} />} badge={3} className="k-ibtn-quiet" />
          <IconBtn icon={<MessageCircle size={18} strokeWidth={2.1} />} badge={chatBadge} />
        </span>
      )}
    </>
  );
}

/* ============================================================== actions */

const T = TABLE_TURN;
export const RAISE = 150;
const raisePct = (RAISE - T.minRaise) / (T.maxRaise - T.minRaise);

export function Presets({ d }: { d: Device }) {
  return (
    <div className={`k-presets ${d === "mobile" ? "k-presets-m" : ""}`}>
      {T.presets.map((p, i) => (
        <span key={p.label} className={`k-preset ${i === 0 ? "on" : ""} ${p.label === "All-in" ? "allin" : ""}`}>
          <small>{p.label}</small>
          <b className="k-num">{fmt(p.amount)}</b>
        </span>
      ))}
    </div>
  );
}

export function Slider({ d }: { d: Device }) {
  const mob = d === "mobile";
  return (
    <div className={`k-slider ${mob ? "k-slider-m" : ""}`}>
      <span className="k-step">
        <Minus size={mob ? 16 : 18} strokeWidth={2.4} />
      </span>
      <span className="k-track">
        <i className="k-track-fill" style={{ width: `${raisePct * 100}%` }} />
        <b className="k-thumb" style={{ left: `${raisePct * 100}%` }} />
        {!mob && (
          <>
            <small className="k-track-min k-num">{fmt(T.minRaise)}</small>
            <small className="k-track-max k-num">{fmt(T.maxRaise)}</small>
          </>
        )}
      </span>
      <span className="k-step">
        <Plus size={mob ? 16 : 18} strokeWidth={2.4} />
      </span>
    </div>
  );
}

export function TurnHead({ d, left = 14, title = "Lượt của bạn", sub = "còn 14 giây để chọn" }: { d: Device; left?: number; title?: string; sub?: string }) {
  const mob = d === "mobile";
  return (
    <div className={`k-turnhead ${mob ? "k-turnhead-m" : ""}`}>
      <Ring size={mob ? 46 : 74} left={left} total={20} stroke={mob ? 3.5 : 5}>
        <b className="k-num">{left}</b>
      </Ring>
      <span>
        <b>{title}</b>
        <small>{sub}</small>
      </span>
    </div>
  );
}

/** The betting console: presets, slider, Bỏ bài / Theo / Tố. */
export function Actions({ d }: { d: Device }) {
  const mob = d === "mobile";
  return (
    <div className={`k-actions ${mob ? "k-actions-m" : ""}`}>
      <Presets d={d} />
      <Slider d={d} />
      <Btn tone="gold" size={mob ? "lg" : "xl"} block className="k-raise">
        Tố lên <b className="k-num">{RAISE}</b>
      </Btn>
      <div className="k-actions-row">
        <Btn tone="danger" size={mob ? "lg" : "xl"} block>
          Bỏ bài
        </Btn>
        <Btn tone="cyan" size={mob ? "lg" : "xl"} block>
          Theo <b className="k-num">{T.toCall}</b>
        </Btn>
      </div>
    </div>
  );
}

/* ============================================================ utilities */

export function LogLine({ who, children, time, tone = "" }: { who?: string; children: ReactNode; time?: string; tone?: string }) {
  return (
    <li className={`k-log-i ${tone}`}>
      {who ? <Avatar name={who} size={22} ring="none" /> : <i className="k-log-dot" />}
      <span className="k-log-t">{children}</span>
      {time && <small className="k-num">{time}</small>}
    </li>
  );
}

export function MiniCards({ cards, w = 22 }: { cards: Card[]; w?: number }) {
  return (
    <span className="k-minicards">
      {cards.map((c, i) => (
        <PCard key={i} c={c} w={w} />
      ))}
    </span>
  );
}
