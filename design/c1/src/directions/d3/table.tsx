// Kẹo Đêm (d3) — the table: desktop stadium stage with 9 bubbles, landscape phone felt with seat pills + dock.
import type { ReactNode } from "react";
import { ChevronLeft, Crown, Ellipsis, Eye, History, MessageCircle, Moon, Plus, Send, Settings, Smile, WifiOff } from "lucide-react";

import type { Card, Seat } from "../../shared/data";
import { CHAT, QUICK_EMOJI } from "../../shared/data";
import { fmt } from "./lib";
import { Avatar, ChipPill, ChipStack, Dealer, IconBtn, Logo, PCard, Pill, Slot, Sticker, Token, type CardSize, type Tone } from "./ui";

/* ------------------------------------------------------------ stickers */

export function seatSticker(s: Seat): { tone: Tone; text: ReactNode } | null {
  const a = s.lastAction ?? "";
  switch (s.state) {
    case "turn":
      return { tone: "lime", text: s.isMe ? "Lượt của bạn" : "Đang nghĩ…" };
    case "folded":
      return { tone: "mute", text: "Đã bỏ" };
    case "all-in":
      return { tone: "pink", text: a || "ALL-IN" };
    case "sitting-out":
      return { tone: "grape", text: "😴 Đang nghỉ" };
    case "disconnected":
      return { tone: "orange", text: a || "Mất kết nối" };
    case "winner":
      return { tone: "sun", text: "🏆 Thắng" };
    case "waiting":
      if (!a) return null;
      if (a.startsWith("Theo")) return { tone: "sky", text: a };
      if (a.startsWith("Cược") || a.startsWith("Tố")) return { tone: "sun", text: a };
      return { tone: "white", text: a };
    default:
      return null;
  }
}

const dimmed = (s: Seat) => s.state === "folded" || s.state === "sitting-out";

/* ================================================================ DESKTOP */

type Pos = { x: number; y: number; bx: number; by: number; dx: number; dy: number };
/** Stage is 1080×676. Felt pill: x 230–850, y 180–450. Board ~ x 364–716, y 275–365. */
export const DPOS: Record<number, Pos> = {
  1: { x: 540, y: 566, bx: 540, by: 406, dx: 604, dy: 406 },
  2: { x: 300, y: 535, bx: 362, by: 410, dx: 300, dy: 404 },
  3: { x: 112, y: 315, bx: 298, by: 315, dx: 298, dy: 268 },
  4: { x: 205, y: 112, bx: 326, by: 230, dx: 394, dy: 206 },
  5: { x: 432, y: 70, bx: 455, by: 205, dx: 395, dy: 205 },
  6: { x: 648, y: 70, bx: 625, by: 205, dx: 685, dy: 205 },
  7: { x: 875, y: 112, bx: 754, by: 230, dx: 686, dy: 206 },
  8: { x: 968, y: 315, bx: 782, by: 315, dx: 782, dy: 268 },
  9: { x: 780, y: 535, bx: 718, by: 410, dx: 780, dy: 404 },
};

export function DSeat({
  s,
  faceUp,
  sticker,
  extra,
  hideCards,
  className = "",
}: {
  s: Seat;
  faceUp?: boolean;
  sticker?: ReactNode;
  extra?: ReactNode;
  hideCards?: boolean;
  className?: string;
}) {
  const p = DPOS[s.seat];
  if (s.state === "empty")
    return (
      <div className="dseat dseat-empty" style={{ left: p.x - 92, top: p.y - 32 }}>
        <span className="dseat-plus">
          <Plus size={20} strokeWidth={3} />
        </span>
        <span className="dseat-txt">
          <b>Ghế trống</b>
          <span>Bấm để ngồi</span>
        </span>
      </div>
    );
  const me = !!s.isMe;
  const w = me ? 236 : 196;
  const h = me ? 78 : 64;
  const st = seatSticker(s);
  const backs = !me && !faceUp && s.cards && s.cards.length > 0 && !dimmed(s);
  return (
    <div className={`dseat st-${s.state} ${me ? "dseat-me" : ""} ${className}`} style={{ left: p.x - w / 2, top: p.y - h / 2, width: w, height: h }}>
      <Avatar
        name={s.name!}
        size={me ? 64 : 50}
        dim={dimmed(s)}
        ring={s.timer ? { pct: s.timer.left / s.timer.total } : undefined}
        badge={
          s.state === "disconnected" ? (
            <span className="av-badge av-badge-orange">
              <WifiOff size={13} strokeWidth={3} />
            </span>
          ) : s.state === "sitting-out" ? (
            <span className="av-badge av-badge-grape">
              <Moon size={12} strokeWidth={3} />
            </span>
          ) : s.timer ? (
            <span className="av-time num">{s.timer.left}</span>
          ) : null
        }
      />
      <div className="dseat-txt">
        <b className="dseat-name">
          {s.name}
          {me && <em>bạn</em>}
        </b>
        <span className="dseat-stack">
          <Token size={14} />
          <b className="num">{fmt(s.stack ?? 0)}</b>
        </span>
      </div>
      {!hideCards && backs && (
        <span className="dseat-cards">
          <PCard c="back" size="xs" tilt={-8} />
          <PCard c="back" size="xs" tilt={6} />
        </span>
      )}
      {!hideCards && faceUp && s.cards && s.cards.length > 0 && (
        <span className="dseat-cards dseat-faceup">
          {s.cards.map((c, i) => (
            <PCard key={i} c={c} size="sm" tilt={i ? 5 : -5} />
          ))}
        </span>
      )}
      {sticker ??
        (st && (
          <Sticker tone={st.tone} tilt={-4} className="dseat-stk">
            {st.text}
          </Sticker>
        ))}
      {extra}
    </div>
  );
}

export function Board({
  cards,
  size = "lg",
  total = 5,
  hl,
  className = "",
}: {
  cards: Card[];
  size?: CardSize;
  total?: number;
  hl?: number[];
  className?: string;
}) {
  return (
    <div className={`board board-${size} ${className}`}>
      {cards.map((c, i) => (
        <PCard key={i} c={c} size={size} className={hl ? (hl.includes(i) ? "pc-hl" : "pc-dim") : ""} />
      ))}
      {Array.from({ length: Math.max(0, total - cards.length) }, (_, i) => (
        <Slot key={`s${i}`} size={size} />
      ))}
    </div>
  );
}

export function Pot({ n, label = "Pot", big }: { n: number; label?: string; big?: boolean }) {
  return (
    <span className={`pot ${big ? "pot-big" : ""}`}>
      <ChipStack size={big ? 20 : 16} />
      <span className="pot-l">{label}</span>
      <b className="num">{fmt(n)}</b>
    </span>
  );
}

/** The 1080×676 stage. `center` sits in the middle of the felt (pot + board). */
export function DStage({
  seats,
  center,
  faceUp = [],
  stickers = {},
  extras = {},
  showBets = true,
  children,
  className = "",
}: {
  seats: Seat[];
  center: ReactNode;
  faceUp?: number[];
  stickers?: Record<number, ReactNode>;
  extras?: Record<number, ReactNode>;
  showBets?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const btn = seats.find((s) => s.isButton);
  return (
    <div className={`dstage ${className}`}>
      <div className="dfelt">
        <div className="dfelt-stitch" />
      </div>
      <div className="dfelt-center">{center}</div>
      {showBets &&
        seats
          .filter((s) => (s.bet ?? 0) > 0)
          .map((s) => (
            <span key={`b${s.seat}`} className="dbet" style={{ left: DPOS[s.seat].bx, top: DPOS[s.seat].by }}>
              <ChipPill n={s.bet!} />
            </span>
          ))}
      {btn && <Dealer style={{ left: DPOS[btn.seat].dx, top: DPOS[btn.seat].dy }} />}
      {seats.map((s) => (
        <DSeat key={s.seat} s={s} faceUp={faceUp.includes(s.seat)} sticker={stickers[s.seat]} extra={extras[s.seat]} />
      ))}
      {children}
    </div>
  );
}

export function DTopBar({ room, sub, right }: { room: string; sub: ReactNode; right?: ReactNode }) {
  return (
    <header className="dtop">
      <div className="dtop-l">
        <IconBtn size={44}>
          <ChevronLeft size={22} strokeWidth={3} />
        </IconBtn>
        <Logo size={20} />
      </div>
      <div className="dtop-c">
        <b className="dtop-room">{room}</b>
        <span className="dtop-sub">{sub}</span>
      </div>
      <div className="dtop-r">
        {right ?? (
          <>
            <IconBtn size={44}>
              <History size={20} strokeWidth={2.6} />
            </IconBtn>
            <IconBtn size={44} tone="sun">
              <Crown size={20} strokeWidth={2.6} />
            </IconBtn>
            <IconBtn size={44}>
              <Settings size={20} strokeWidth={2.6} />
            </IconBtn>
            <span className="dtop-me">
              <Avatar name="Lym" size={36} />
              <b>Lym</b>
            </span>
          </>
        )}
      </div>
    </header>
  );
}

export function RoomChips({ hand, extra }: { hand: number; extra?: ReactNode }) {
  return (
    <>
      <Pill tone="ghost">Blind 10/20</Pill>
      <Pill tone="ghost">Ván #{hand}</Pill>
      <Pill tone="pink">7-2 · thưởng 50</Pill>
      {extra}
    </>
  );
}

/** Whole desktop table screen: top bar, stage, dock, right rail. */
export function DeskTable({
  top,
  stage,
  dock,
  rail,
  overlay,
  className = "",
  railWide,
}: {
  top: ReactNode;
  stage: ReactNode;
  dock: ReactNode;
  rail: ReactNode;
  overlay?: ReactNode;
  className?: string;
  railWide?: boolean;
}) {
  return (
    <div className={`dtable ${railWide ? "dtable-wide" : ""} ${className}`}>
      {top}
      <main className="dmain">
        {stage}
        <div className="ddock">{dock}</div>
      </main>
      <aside className="drail">{rail}</aside>
      {overlay}
    </div>
  );
}

/* ----------------------------------------------------------- rail parts */

export function RailTabs({ active, counts = [3, 8, 3] }: { active: 0 | 1 | 2; counts?: number[] }) {
  const items = [{ label: "💬 Chat" }, { label: "Người chơi" }, { label: "Đang xem" }];
  return (
    <div className="rtabs">
      {items.map((it, i) => (
        <span key={it.label} className={i === active ? "on" : ""}>
          {it.label}
          <i>{counts[i]}</i>
        </span>
      ))}
    </div>
  );
}

export function ChatMsg({ name, text, at, mine }: { name: string; text: string; at: string; mine?: boolean }) {
  const watching = text.startsWith("(đang xem)");
  const body = watching ? text.replace("(đang xem)", "").trim() : text;
  const onlyEmoji = /^\p{Extended_Pictographic}+$/u.test(body);
  return (
    <div className={`msg ${mine ? "msg-me" : ""}`}>
      {!mine && <Avatar name={name} size={30} />}
      <div className="msg-col">
        {!mine && (
          <span className="msg-name">
            {name}
            {watching && (
              <span className="msg-tag">
                <Eye size={11} strokeWidth={3} /> đang xem
              </span>
            )}
            <time>{at}</time>
          </span>
        )}
        <span className={`msg-b ${onlyEmoji ? "msg-emoji" : ""}`}>{body}</span>
        {mine && <time className="msg-at">{at} · đã gửi</time>}
      </div>
    </div>
  );
}

export function SysMsg({ children, tone = "sun" }: { children: ReactNode; tone?: Tone }) {
  return <div className={`sysmsg sysmsg-${tone}`}>{children}</div>;
}

export function ChatLog({ upto = CHAT.length }: { upto?: number }) {
  return (
    <>
      {CHAT.slice(0, upto).map((m, i) => (
        <ChatMsg key={i} name={m.name} text={m.text} at={m.at} mine={m.name === "Lym"} />
      ))}
    </>
  );
}

export function EmojiRow({ big, active }: { big?: boolean; active?: number }) {
  return (
    <div className={`emojirow ${big ? "emojirow-big" : ""}`}>
      {QUICK_EMOJI.map((e, i) => (
        <span key={e} className={i === active ? "on" : ""}>
          {e}
        </span>
      ))}
    </div>
  );
}

export function Composer({ text, focus }: { text?: string; focus?: boolean }) {
  return (
    <div className={`composer ${focus ? "composer-focus" : ""}`}>
      <span className="composer-emoji">
        <Smile size={20} strokeWidth={2.6} />
      </span>
      <span className={text ? "composer-v" : "composer-ph"}>
        {text ?? "Nhắn cả bàn…"}
        {focus && <i className="fld-caret" />}
      </span>
      <span className="composer-send">
        <Send size={18} strokeWidth={2.8} />
      </span>
    </div>
  );
}

/* ================================================================== PHONE */

type MP = { x: number; y: number; side: "l" | "r" | "b" };
/**
 * Phone, landscape 844×390. The table zone is x 0–552 (the dock takes the right edge); the felt
 * sits at x 155–445, y 96–252. Seat pills are 112×42 and stay inside x 44–552 (the side safe
 * areas hold only felt). `side` is where the seat faces the felt: hole cards peek out on that
 * side. Seat 1 is you: the hero block, not a pill.
 */
export const MPOS: Record<number, MP> = {
  2: { x: 120, y: 290, side: "r" },
  3: { x: 100, y: 188, side: "r" },
  4: { x: 124, y: 98, side: "r" },
  5: { x: 262, y: 46, side: "b" },
  6: { x: 386, y: 46, side: "b" },
  7: { x: 476, y: 98, side: "l" },
  8: { x: 496, y: 188, side: "l" },
  9: { x: 480, y: 290, side: "l" },
};

export function MSeat({ s, faceUp, sticker, extra }: { s: Seat; faceUp?: boolean; sticker?: ReactNode; extra?: ReactNode }) {
  const p = MPOS[s.seat];
  const pos = { left: p.x - 56, top: p.y - 21 };
  if (s.state === "empty")
    return (
      <div className={`mseat mseat-${p.side} mseat-empty`} style={pos}>
        <span className="mseat-plus">
          <Plus size={16} strokeWidth={3} />
        </span>
        <span className="mseat-t">
          <b className="mseat-name">Ghế trống</b>
          <span className="mseat-sub">Bấm để ngồi</span>
        </span>
      </div>
    );
  const st = seatSticker(s);
  const backs = !faceUp && s.cards && s.cards.length > 0 && !dimmed(s);
  return (
    <>
      {backs && (
        <span className={`mseat-hold mseat-hold-${p.side} ${s.state === "disconnected" ? "mseat-hold-off" : ""}`} style={pos}>
          <PCard c="back" size="xs" tilt={-8} />
          <PCard c="back" size="xs" tilt={8} />
        </span>
      )}
      <div className={`mseat mseat-${p.side} st-${s.state}`} style={pos}>
        <Avatar
          name={s.name!}
          size={34}
          dim={dimmed(s)}
          badge={
            s.state === "disconnected" ? (
              <span className="av-badge av-badge-orange">
                <WifiOff size={11} strokeWidth={3} />
              </span>
            ) : s.state === "sitting-out" ? (
              <span className="av-badge av-badge-grape">
                <Moon size={10} strokeWidth={3} />
              </span>
            ) : null
          }
        />
        <span className="mseat-t">
          <b className="mseat-name">{s.name}</b>
          <span className="mseat-stack">
            <Token size={11} />
            <b className="num">{fmt(s.stack ?? 0)}</b>
          </span>
        </span>
        {faceUp && s.cards && (
          <span className="mseat-faceup">
            {s.cards.map((c, i) => (
              <PCard key={i} c={c} size="sm" tilt={i ? 6 : -6} />
            ))}
          </span>
        )}
        {s.isButton && <span className="dealer mseat-dealer">D</span>}
        {sticker ??
          (st && (
            <Sticker tone={st.tone} tilt={-4} className="mseat-stk">
              {(s.bet ?? 0) > 0 && <Token size={12} />}
              {st.text}
            </Sticker>
          ))}
        {extra}
      </div>
    </>
  );
}

/** The table zone: felt, the eight other seats (their bets ride on the action sticker) and `me`. */
export function MTable({
  seats,
  center,
  me,
  print = "Blind 10/20 · 7-2: 50",
  faceUp = [],
  stickers = {},
  extras = {},
  children,
  className = "",
}: {
  seats: Seat[];
  center: ReactNode;
  me: ReactNode;
  print?: string;
  faceUp?: number[];
  stickers?: Record<number, ReactNode>;
  extras?: Record<number, ReactNode>;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mzone ${className}`}>
      <div className="mfelt">
        <div className="mfelt-stitch" />
      </div>
      <div className="mfelt-center">
        {print && <span className="mfelt-print">{print}</span>}
        {center}
      </div>
      {seats
        .filter((s) => s.seat !== 1)
        .map((s) => (
          <MSeat key={s.seat} s={s} faceUp={faceUp.includes(s.seat)} sticker={stickers[s.seat]} extra={extras[s.seat]} />
        ))}
      {me}
      {children}
    </div>
  );
}

/** Corner controls over the table: back + room on the top left, chat + menu on the top right. */
export function MTableBar({ hand, unread = 3 }: { hand: number; unread?: number }) {
  return (
    <>
      <div className="mtbar">
        <IconBtn size={44}>
          <ChevronLeft size={22} strokeWidth={3} />
        </IconBtn>
        <span className="mtbar-room">
          <b>Bàn thứ Sáu</b>
          <small>Ván #{hand}</small>
        </span>
      </div>
      <div className="mtbar mtbar-r">
        <IconBtn size={44} badge={unread || undefined}>
          <MessageCircle size={20} strokeWidth={2.8} />
        </IconBtn>
        <IconBtn size={44}>
          <Ellipsis size={20} strokeWidth={3} />
        </IconBtn>
      </div>
    </>
  );
}

/** The right-hand dock: betting controls, next-hand info or the 7-2 reactions, under the right thumb. */
export const MDock = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <aside className={`mdock ${className}`}>{children}</aside>
);
