// Sơn Mài Vàng Son (d4) — the table: cinnabar lacquer panel with gold-leaf rim and eggshell inlay,
// seats, board, pot, and the desktop / landscape-phone frames every table screen shares.
import type { CSSProperties, ReactNode } from "react";
import { ChevronLeft, Crown, Eye, LogOut, Menu, MessageCircle, Moon, Plus, Send, Settings, Smile, WifiOff } from "lucide-react";

import type { Card, Seat } from "../../shared/data";
import { CHAT, QUICK_EMOJI, TABLE_TURN } from "../../shared/data";
import { fmt } from "./lib";
import { Avatar, Bet, Dealer, IconBtn, Logo, PCard, Slot, Tag, Token, type CardSize, type ChipTone, type TagTone } from "./ui";

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

/* ================================================================== felt */

/** The lacquered table: black rail, gold-leaf fillet, eggshell inlay band, cinnabar surface. */
export function Felt({ w, h, x = 0, y = 0, rail, children, className, mark = true }: { w: number; h: number; x?: number; y?: number; rail?: number; children?: ReactNode; className?: string; mark?: boolean }) {
  const r = rail ?? Math.round(Math.min(w, h) * 0.07);
  return (
    <div className={cx("felt", className)} style={{ left: x, top: y, width: w, height: h, "--rail": `${r}px` } as CSSProperties}>
      <i className="felt-rail" />
      <i className="felt-rim" />
      <i className="felt-inlay" />
      <i className="felt-top">{mark && <i className="felt-mark" />}</i>
      <i className="felt-line" />
      <i className="felt-sheen" />
      {children}
    </div>
  );
}

/* ================================================================= seats */

export type SeatPos = { x: number; y: number };

const dimmed = (s: Seat) => s.state === "folded" || s.state === "sitting-out";

/** What a seat's tag says and how it is coloured. */
export function seatTag(s: Seat): { tone: TagTone; text: string } | null {
  const a = s.lastAction ?? "";
  switch (s.state) {
    case "turn":
      return { tone: "gold", text: s.isMe ? "Lượt của bạn" : "Đang nghĩ…" };
    case "folded":
      return { tone: "mute", text: "Bỏ bài" };
    case "all-in":
      return { tone: "son", text: a || "All-in" };
    case "sitting-out":
      return { tone: "mute", text: "Đang nghỉ" };
    case "disconnected":
      return { tone: "warn", text: a || "Mất kết nối" };
    case "winner":
      return { tone: "gold", text: "Thắng" };
    case "waiting":
      if (!a) return null;
      if (a.startsWith("Cược") || a.startsWith("Tố")) return { tone: "son", text: a };
      if (a.startsWith("Theo")) return { tone: "jade", text: a };
      return { tone: "ink", text: a };
    default:
      return null;
  }
}

/** Two small lacquer backs tucked behind the avatar: this player still holds cards. */
const MiniBacks = ({ off }: { off?: boolean }) => (
  <span className={cx("minibacks", off && "minibacks-off")}>
    <i />
    <i />
  </span>
);

export function SeatView({
  s,
  pos,
  device,
  tag,
  faceUp,
  hand,
  className,
}: {
  s: Seat;
  pos: SeatPos;
  device: "d" | "m";
  tag?: ReactNode | false;
  faceUp?: Card[];
  hand?: ReactNode;
  className?: string;
}) {
  const style: CSSProperties = { left: pos.x, top: pos.y };
  if (s.state === "empty")
    return (
      <div className={cx("seat", `seat-${device}`, "seat-empty", className)} style={style}>
        <span className="seat-plus">
          <Plus size={device === "d" ? 20 : 16} strokeWidth={2.4} />
        </span>
        <span className="seat-empty-t">
          <b>Ghế trống</b>
          {device === "d" && <small>Mời bạn vào ngồi</small>}
        </span>
      </div>
    );
  const t = tag === false ? null : (tag ?? (() => {
    const st = seatTag(s);
    return st ? <Tag tone={st.tone}>{st.text}</Tag> : null;
  })());
  const holds = !faceUp && s.cards && s.cards.length > 0 && !dimmed(s);
  const icon =
    s.state === "disconnected" ? (
      <span className="av-badge av-badge-warn">
        <WifiOff size={device === "d" ? 13 : 11} strokeWidth={2.6} />
      </span>
    ) : s.state === "sitting-out" ? (
      <span className="av-badge">
        <Moon size={device === "d" ? 12 : 10} strokeWidth={2.6} />
      </span>
    ) : null;
  return (
    <div className={cx("seat", `seat-${device}`, `st-${s.state}`, className)} style={style}>
      {holds && <MiniBacks off={s.state === "disconnected"} />}
      <Avatar name={s.name!} size={device === "d" ? 54 : 34} dim={dimmed(s)} badge={icon} />
      <span className="seat-plate">
        <b className="seat-name">{s.name}</b>
        <span className="seat-stack">
          <Token size={device === "d" ? 13 : 10} />
          <b className="num">{fmt(s.stack ?? 0)}</b>
        </span>
      </span>
      {faceUp && (
        <span className="seat-cards">
          {faceUp.map((c, i) => (
            <PCard key={i} c={c} size={device === "d" ? "md" : "sm"} tilt={i ? 6 : -5} />
          ))}
        </span>
      )}
      {(t || hand) && (
        <span className="seat-tags">
          {t}
          {hand}
        </span>
      )}
    </div>
  );
}

/* ================================================================ centre */

export function Board({ cards, size = "md", hl, slots = 5 }: { cards: Card[]; size?: CardSize; hl?: number[]; slots?: number }) {
  return (
    <span className={cx("board", hl && "board-hl")}>
      {cards.map((c, i) => (
        <PCard key={i} c={c} size={size} className={hl?.includes(i) ? "pc-hl" : hl ? "pc-lo" : undefined} />
      ))}
      {Array.from({ length: slots - cards.length }, (_, i) => (
        <Slot key={`s${i}`} size={size} />
      ))}
    </span>
  );
}

export function Pot({ n, label = "Pot", big }: { n: number; label?: string; big?: boolean }) {
  return (
    <span className={cx("pot", big && "pot-big")}>
      <Bet n={n} tones={["then", "son", "egg"]} size={big ? 24 : 18} className="pot-chips" />
      <span className="pot-t">
        <small>{label}</small>
        <b className="num">{fmt(n)}</b>
      </span>
    </span>
  );
}

export const BetAt = ({ n, at, tones = ["son", "egg"] as ChipTone[], size = 20 }: { n: number; at: SeatPos; tones?: ChipTone[]; size?: number }) => (
  <Bet n={n} tones={tones} size={size} className="bet-at" style={{ left: at.x, top: at.y }} />
);

/* ============================================================== desktop */

/** Desktop stage is 1080×836 (under the 64px top bar). Felt centred at (540, 330). */
export const D_STAGE = { w: 1080, h: 836, cx: 540, cy: 318 };
export const DPOS: Record<number, SeatPos> = {
  2: { x: 226, y: 512 },
  3: { x: 104, y: 318 },
  4: { x: 214, y: 130 },
  5: { x: 420, y: 58 },
  6: { x: 660, y: 58 },
  7: { x: 866, y: 130 },
  8: { x: 976, y: 318 },
  9: { x: 854, y: 512 },
};
export const D_BETS: Record<number, SeatPos> = {
  2: { x: 330, y: 432 },
  3: { x: 262, y: 318 },
  4: { x: 316, y: 226 },
  5: { x: 450, y: 176 },
  6: { x: 630, y: 176 },
  7: { x: 764, y: 226 },
  8: { x: 818, y: 318 },
  9: { x: 750, y: 432 },
};
export const D_DEALER: Record<number, SeatPos> = { 4: { x: 262, y: 258 }, 1: { x: 620, y: 470 } };

export function DeskStage({
  seats,
  center,
  faceUp = {},
  tags = {},
  hands = {},
  bets = true,
  me,
  children,
  className,
}: {
  seats: Seat[];
  center: ReactNode;
  faceUp?: Record<number, Card[]>;
  tags?: Record<number, ReactNode | false>;
  hands?: Record<number, ReactNode>;
  bets?: boolean;
  me?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const btn = seats.find((s) => s.isButton);
  return (
    <div className={cx("stage", "stage-d", className)}>
      <i className="stage-light" />
      <Felt w={800} h={440} x={D_STAGE.cx - 400} y={D_STAGE.cy - 220} rail={26}>
        <span className="felt-center">{center}</span>
      </Felt>
      {bets &&
        seats.map((s) => (s.bet && !s.isMe ? <BetAt key={`b${s.seat}`} n={s.bet} at={D_BETS[s.seat]} size={22} /> : null))}
      {btn && D_DEALER[btn.seat] && <Dealer style={{ left: D_DEALER[btn.seat].x, top: D_DEALER[btn.seat].y }} size={30} />}
      {seats
        .filter((s) => !s.isMe)
        .map((s) => (
          <SeatView key={s.seat} s={s} pos={DPOS[s.seat]} device="d" faceUp={faceUp[s.seat]} tag={tags[s.seat]} hand={hands[s.seat]} />
        ))}
      {me}
      {children}
    </div>
  );
}

/** You, at the bottom of the desktop table: large hole cards resting on the rail, then your plate. */
export function DeskMe({
  cards,
  stack,
  turn,
  dim,
  note,
  tag,
}: {
  cards: Card[];
  stack: number;
  turn?: boolean;
  dim?: boolean;
  note?: ReactNode;
  tag?: ReactNode;
}) {
  return (
    <div className={cx("dme", turn && "dme-turn", dim && "dme-dim")}>
      <span className="dme-cards">
        <PCard c={cards[0]} size="xl" tilt={-7} />
        <PCard c={cards[1]} size="xl" tilt={6} />
      </span>
      <span className="dme-plate">
        <Avatar name="Lym" size={58} me ring={turn ? { pct: 14 / 20 } : undefined} />
        <span className="dme-t">
          <b>
            Lym <em>bạn</em>
          </b>
          <span className="seat-stack">
            <Token size={14} />
            <b className="num">{fmt(stack)}</b>
          </span>
        </span>
        {note && <span className="dme-note">{note}</span>}
      </span>
      {tag && <span className="dme-tag">{tag}</span>}
    </div>
  );
}

/** The desktop table top bar: back, room, meta, viewers and room actions. */
export function DTopBar({ title, meta, right }: { title?: ReactNode; meta?: ReactNode; right?: ReactNode }) {
  return (
    <header className="dtop">
      <span className="dtop-back">
        <ChevronLeft size={18} strokeWidth={2.2} /> Sảnh
      </span>
      <Logo size={34} mark />
      <span className="dtop-title">
        <b>{title ?? TABLE_TURN.room}</b>
        <span className="dtop-meta">{meta ?? <RoomMeta hand={TABLE_TURN.handNo} />}</span>
      </span>
      <span className="dtop-r">
        {right ?? (
          <>
            <span className="dtop-view">
              <Eye size={16} strokeWidth={2} /> 3 đang xem
            </span>
            <span className="btn btn-then btn-sm">
              <Moon size={15} strokeWidth={2.2} />
              <span className="btn-t">Nghỉ ván sau</span>
            </span>
            <IconBtn size={38}>
              <Crown size={17} strokeWidth={2} />
            </IconBtn>
            <IconBtn size={38}>
              <Settings size={17} strokeWidth={2} />
            </IconBtn>
            <span className="btn btn-ghost btn-sm">
              <LogOut size={15} strokeWidth={2.2} />
              <span className="btn-t">Rời bàn</span>
            </span>
          </>
        )}
      </span>
    </header>
  );
}

export function RoomMeta({ hand, extra }: { hand: number; extra?: ReactNode }) {
  return (
    <>
      <span>Blind 10/20</span>
      <i />
      <span>Ván #{hand}</span>
      <i />
      <span>Phòng riêng</span>
      <i />
      <span className="gold">Thưởng 7-2 · 50</span>
      {extra}
    </>
  );
}

/** Desktop table frame: top bar, stage (with the action tray at its foot), right rail, overlay. */
export function DeskTable({ top, stage, tray, rail, overlay, className }: { top: ReactNode; stage: ReactNode; tray?: ReactNode; rail: ReactNode; overlay?: ReactNode; className?: string }) {
  return (
    <div className={cx("dtable", className)}>
      {top}
      <main className="dtable-main">
        {stage}
        {tray && <div className="tray">{tray}</div>}
      </main>
      <aside className="drail">{rail}</aside>
      {overlay}
    </div>
  );
}

export function RailTabs({ active, counts = [5, 8] }: { active: 0 | 1 | 2; counts?: [number, number] }) {
  const items = [`Chat`, `Người chơi`, `Nhật ký`];
  return (
    <div className="rtabs">
      {items.map((t, i) => (
        <span key={t} className={i === active ? "on" : ""}>
          {t}
          {i < 2 && <small>{counts[i]}</small>}
        </span>
      ))}
    </div>
  );
}

/* ================================================================= phone */

/** Phone table area is x 0–584; felt centred at (316, 182). */
export const M_CENTER = { x: 316, y: 180 };
export const MPOS: Record<number, SeatPos> = {
  2: { x: 140, y: 266 },
  3: { x: 98, y: 178 },
  4: { x: 140, y: 90 },
  5: { x: 258, y: 42 },
  6: { x: 376, y: 42 },
  7: { x: 494, y: 90 },
  8: { x: 534, y: 178 },
  9: { x: 494, y: 266 },
};
export const M_BETS: Record<number, SeatPos> = {
  2: { x: 214, y: 236 },
  3: { x: 186, y: 182 },
  4: { x: 212, y: 128 },
  5: { x: 268, y: 104 },
  6: { x: 364, y: 104 },
  7: { x: 420, y: 128 },
  8: { x: 446, y: 182 },
  9: { x: 418, y: 236 },
};
export const M_DEALER: Record<number, SeatPos> = { 4: { x: 186, y: 140 } };

export function MobStage({
  seats,
  center,
  faceUp = {},
  tags = {},
  hands = {},
  bets = true,
  me,
  top = true,
  unread,
  children,
  className,
}: {
  seats: Seat[];
  center: ReactNode;
  faceUp?: Record<number, Card[]>;
  tags?: Record<number, ReactNode | false>;
  hands?: Record<number, ReactNode>;
  bets?: boolean;
  me?: ReactNode;
  top?: boolean;
  unread?: number;
  children?: ReactNode;
  className?: string;
}) {
  const btn = seats.find((s) => s.isButton);
  return (
    <div className={cx("stage", "stage-m", className)}>
      <i className="stage-light" />
      <Felt w={392} h={210} x={M_CENTER.x - 196} y={M_CENTER.y - 104} rail={13}>
        <span className="felt-center">{center}</span>
      </Felt>
      {bets && seats.map((s) => (s.bet && !s.isMe ? <BetAt key={`b${s.seat}`} n={s.bet} at={M_BETS[s.seat]} size={16} /> : null))}
      {btn && M_DEALER[btn.seat] && <Dealer style={{ left: M_DEALER[btn.seat].x, top: M_DEALER[btn.seat].y }} size={20} />}
      {seats
        .filter((s) => !s.isMe)
        .map((s) => (
          <SeatView key={s.seat} s={s} pos={MPOS[s.seat]} device="m" faceUp={faceUp[s.seat]} tag={tags[s.seat]} hand={hands[s.seat]} />
        ))}
      {top && (
        <>
          <IconBtn size={44} className="m-back">
            <ChevronLeft size={22} strokeWidth={2.2} />
          </IconBtn>
          <IconBtn size={44} className="m-menu">
            <Menu size={19} strokeWidth={2} />
          </IconBtn>
          <IconBtn size={44} className="m-chat" badge={unread || undefined}>
            <MessageCircle size={19} strokeWidth={2} />
          </IconBtn>
        </>
      )}
      {me}
      {children}
    </div>
  );
}

/** You on the phone: two big hole cards on the rail, your plate under them. */
export function MobMe({ cards, stack, turn, dim, tag, note }: { cards: Card[]; stack: number; turn?: boolean; dim?: boolean; tag?: ReactNode; note?: ReactNode }) {
  return (
    <div className={cx("mme", turn && "mme-turn", dim && "mme-dim")}>
      <span className="mme-cards">
        <PCard c={cards[0]} size="md" tilt={-7} />
        <PCard c={cards[1]} size="md" tilt={6} />
      </span>
      <span className="mme-plate">
        <Avatar name="Lym" size={34} me ring={turn ? { pct: 14 / 20 } : undefined} />
        <span className="mme-t">
          <b>
            Lym <em>bạn</em>
          </b>
          <span className="seat-stack">
            <Token size={10} />
            <b className="num">{fmt(stack)}</b>
          </span>
        </span>
        {note}
      </span>
      {tag && <span className="mme-tag">{tag}</span>}
    </div>
  );
}

/** Phone table frame: the stage on the left, a lacquer column on the right. */
export function MobTable({ stage, side, overlay, className }: { stage: ReactNode; side: ReactNode; overlay?: ReactNode; className?: string }) {
  return (
    <div className={cx("mtable", className)}>
      {stage}
      <aside className="mside">{side}</aside>
      {overlay}
    </div>
  );
}

/* ================================================================== chat */

export function ChatMsg({ name, text, at, mine }: { name: string; text: string; at: string; mine?: boolean }) {
  return (
    <div className={cx("msg", mine && "msg-me")}>
      {!mine && <Avatar name={name} size={28} />}
      <span className="msg-b">
        <span className="msg-h">
          <b>{mine ? "Bạn" : name}</b>
          <small>{at}</small>
        </span>
        <span className="msg-t">{text}</span>
      </span>
    </div>
  );
}

export function ChatLog({ from = 0, upto = CHAT.length }: { from?: number; upto?: number }) {
  return (
    <>
      {CHAT.slice(from, upto).map((m) => (
        <ChatMsg key={m.text} name={m.name} text={m.text} at={m.at} mine={m.name === "Lym"} />
      ))}
    </>
  );
}

export const SysMsg = ({ children, tone }: { children: ReactNode; tone?: "gold" | "son" }) => <div className={cx("sysmsg", tone && `sysmsg-${tone}`)}>{children}</div>;

export function Composer({ text, focus }: { text?: string; focus?: boolean }) {
  return (
    <div className={cx("composer", focus && "composer-focus")}>
      <span className="composer-ic">
        <Smile size={19} strokeWidth={2} />
      </span>
      <span className={text ? "composer-v" : "composer-ph"}>
        {text ?? "Nhắn cho cả bàn…"}
        {focus && <i className="caret" />}
      </span>
      <span className="composer-send">
        <Send size={17} strokeWidth={2.2} />
      </span>
    </div>
  );
}

export function EmojiRow({ active, big }: { active?: number; big?: boolean }) {
  return (
    <div className={cx("emojis", big && "emojis-big")}>
      {QUICK_EMOJI.map((e, i) => (
        <span key={e} className={i === active ? "on" : ""}>
          {e}
        </span>
      ))}
    </div>
  );
}

/** Viewers strip: avatars plus names. */
export function Viewers({ names, compact }: { names: string[]; compact?: boolean }) {
  return (
    <div className={cx("viewers", compact && "viewers-c")}>
      <Eye size={15} strokeWidth={2} />
      <span className="viewers-av">
        {names.map((n) => (
          <Avatar key={n} name={n} size={compact ? 22 : 26} />
        ))}
      </span>
      <span>
        <b>{names.join(", ")}</b> đang xem
      </span>
    </div>
  );
}
