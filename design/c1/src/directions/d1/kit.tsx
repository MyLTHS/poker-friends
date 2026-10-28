// Primitives for direction d1 "Nỉ & Đồng thau": frame root, phone chrome, cards, chips,
// avatars, buttons, fields, navigation. Everything is static (no state, no effects).
import type { CSSProperties, ReactNode } from "react";
import { Bell, ChevronDown, History, LayoutGrid, UserRound } from "lucide-react";

import { isRed, type Card, type Suit } from "../../shared/data";
import { FRAME, type Device } from "../../shared/screens";

/* ---------- numbers ---------- */

/** 1460 -> "1.460" (Vietnamese thousands separator). */
export const fmt = (n: number) => String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
/** Signed with a real minus sign: +1.130 / −540 / 0. */
export const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(n)}` : "0");
export const tone = (n: number) => (n > 0 ? "gain" : n < 0 ? "loss" : "even");

export const cssVars = (vars: Record<string, string | number>) => vars as CSSProperties;

/* ---------- frame root ---------- */

export function Root({ device, className = "", children }: { device: Device; className?: string; children: ReactNode }) {
  const { width, height } = FRAME[device];
  return (
    <div className={`d1 d1-${device} ${className}`} style={{ width, height }}>
      {children}
    </div>
  );
}

/** Home indicator of the landscape phone (iOS hides the status bar in landscape). */
export function HomeBar() {
  return <div className="homebar" />;
}

/* ---------- suits, cards, chips ---------- */

export function SuitIcon({ suit, className = "" }: { suit: Suit; className?: string }) {
  return (
    <svg className={`suit ${className}`} viewBox="0 0 24 24" aria-hidden>
      {suit === "♠" && (
        <path d="M12 2.5C9.2 6.6 3.5 9.7 3.5 14.2c0 2.6 2 4.5 4.4 4.5 1.5 0 2.7-.6 3.4-1.6-.3 1.9-1.1 3.3-2.5 4.4h7.4c-1.4-1.1-2.2-2.5-2.5-4.4.7 1 1.9 1.6 3.4 1.6 2.4 0 4.4-1.9 4.4-4.5 0-4.5-5.7-7.6-8.5-11.7z" />
      )}
      {suit === "♥" && (
        <path d="M12 21C6.2 16.4 2.5 13 2.5 8.7 2.5 5.8 4.7 3.5 7.5 3.5c1.9 0 3.5 1 4.5 2.6 1-1.6 2.6-2.6 4.5-2.6 2.8 0 5 2.3 5 5.2 0 4.3-3.7 7.7-9.5 12.3z" />
      )}
      {suit === "♦" && <path d="M12 1.8 19.6 12 12 22.2 4.4 12z" />}
      {suit === "♣" && (
        <>
          <circle cx="12" cy="7.2" r="4.3" />
          <circle cx="7" cy="13.4" r="4.3" />
          <circle cx="17" cy="13.4" r="4.3" />
          <circle cx="12" cy="12" r="2.6" />
          <path d="M12 11.5c-.2 4.4-1.3 7.3-3.3 9.7h6.6c-2-2.4-3.1-5.3-3.3-9.7z" />
        </>
      )}
    </svg>
  );
}

const COURT = ["K", "Q", "J"];

/** A printed card: corner index, a large centre pip (or a framed court panel for K Q J); from
 *  52px wide it also gets the mirrored bottom index of a real card. Backs carry the club crest. */
export function PlayingCard({
  card,
  w = 44,
  rotate = 0,
  className = "",
  style,
}: {
  card: Card;
  w?: number;
  rotate?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const base: CSSProperties = { ...cssVars({ "--w": `${w}px` }), transform: rotate ? `rotate(${rotate}deg)` : undefined, ...style };
  const size = w >= 52 ? "pc-lg" : w < 28 ? "pc-xs" : "";
  if (card === "back") return <div className={`pc pc-back ${size} ${className}`} style={base} />;
  const index = (flip: boolean) => (
    <span className={`pc-idx${flip ? " is-flip" : ""}`}>
      <b>{card.rank}</b>
      <SuitIcon suit={card.suit} />
    </span>
  );
  return (
    <div className={`pc ${isRed(card) ? "pc-red" : "pc-black"} ${card.rank === "10" ? "pc-ten" : ""} ${size} ${className}`} style={base}>
      {index(false)}
      {COURT.includes(card.rank) ? (
        <span className="pc-court">
          <SuitIcon suit={card.suit} />
          <b>{card.rank}</b>
          <SuitIcon suit={card.suit} />
        </span>
      ) : (
        <SuitIcon suit={card.suit} className="pc-pip" />
      )}
      {w >= 52 && index(true)}
    </div>
  );
}

/** Inline mention of a card in text, e.g. "A♥". */
export function CardText({ card }: { card: Card }) {
  if (card === "back") return <span className="ctext">??</span>;
  return (
    <span className={`ctext ${isRed(card) ? "is-red" : ""}`}>
      {card.rank}
      <SuitIcon suit={card.suit} />
    </span>
  );
}

const CHIP_DENOMS = [
  { v: 500, c: "#B8893C", e: "#2A1A10", d: "#6E4F1E" },
  { v: 100, c: "#232027", e: "#D9BA74", d: "#0E0C10" },
  { v: 25, c: "#1F6B4E", e: "#F1E6CF", d: "#0F3D2B" },
  { v: 5, c: "#8E1F27", e: "#F1E6CF", d: "#4E0F14" },
  { v: 1, c: "#E9DFC8", e: "#8E1F27", d: "#A79B80" },
];

export function Chip({ denom = 25, size = 20, style }: { denom?: number; size?: number; style?: CSSProperties }) {
  const d = CHIP_DENOMS.find((x) => x.v === denom) ?? CHIP_DENOMS[2];
  return <span className="chip" style={{ ...cssVars({ "--s": `${size}px`, "--c": d.c, "--e": d.e, "--d": d.d }), ...style }} />;
}

/** Chips for an amount, grouped into up to `cols` columns of the largest denominations. */
export function ChipStack({ amount, size = 20, cols = 1, max = 5 }: { amount: number; size?: number; cols?: number; max?: number }) {
  const groups: { denom: number; n: number }[] = [];
  let rest = amount;
  for (const d of CHIP_DENOMS) {
    const n = Math.floor(rest / d.v);
    if (n > 0) {
      groups.push({ denom: d.v, n: Math.min(n, max) });
      rest -= n * d.v;
    }
  }
  if (groups.length === 0) groups.push({ denom: 1, n: 1 });
  const shown = cols === 1 ? [{ denom: groups[0].denom, n: groups.reduce((a, g) => a + g.n, 0) }] : groups.slice(0, cols);
  // A single column mixes denominations from the bottom up.
  const singleColumn = groups.flatMap((g) => Array.from({ length: g.n }, () => g.denom)).slice(0, max);
  return (
    <span className="chipstack" style={cssVars({ "--s": `${size}px` })}>
      {cols === 1 ? (
        <span className="chipcol" style={{ height: size + (singleColumn.length - 1) * 3 + 2 }}>
          {singleColumn.map((denom, i) => (
            <Chip key={i} denom={denom} size={size} style={{ bottom: i * 3 }} />
          ))}
        </span>
      ) : (
        shown.map((g, gi) => (
          <span key={gi} className="chipcol" style={{ height: size + (g.n - 1) * 3 + 2 }}>
            {Array.from({ length: g.n }, (_, i) => (
              <Chip key={i} denom={g.denom} size={size} style={{ bottom: i * 3 }} />
            ))}
          </span>
        ))
      )}
    </span>
  );
}

/* ---------- people ---------- */

const AVATAR_TONES = ["#6B2A2A", "#2F4F3E", "#2D3B58", "#5E4526", "#4E2E52", "#3B4B50", "#5A3324", "#344A2B"];
const hash = (s: string) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);

export function Avatar({ name, size = 40, className = "" }: { name: string; size?: number; className?: string }) {
  return (
    <span
      className={`av ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5), backgroundColor: AVATAR_TONES[hash(name) % AVATAR_TONES.length] }}
    >
      {name[0]}
    </span>
  );
}

/** Countdown ring drawn around an avatar of `size`. */
export function TimerRing({ size, left, total, gap = 4, stroke = 4 }: { size: number; left: number; total: number; gap?: number; stroke?: number }) {
  const box = size + (gap + stroke) * 2;
  const r = size / 2 + gap + stroke / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, left / total));
  return (
    <svg className={`timer-ring${left <= 5 ? " is-low" : ""}`} width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden>
      <circle className="tr-bg" cx={box / 2} cy={box / 2} r={r} strokeWidth={stroke} />
      <circle
        className="tr-fg"
        cx={box / 2}
        cy={box / 2}
        r={r}
        strokeWidth={stroke}
        strokeDasharray={`${c * frac} ${c}`}
        transform={`rotate(-90 ${box / 2} ${box / 2})`}
      />
    </svg>
  );
}

/* ---------- brand ---------- */

export function Crest({ size = 40 }: { size?: number }) {
  return (
    <span className="crest" style={{ width: size, height: size }}>
      <SuitIcon suit="♠" />
    </span>
  );
}

export function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <span className={`wordmark${small ? " is-small" : ""}`}>
      <Crest size={small ? 32 : 40} />
      <span className="wm-text">
        <b>Poker Friends</b>
        <small>Câu lạc bộ bàn bè</small>
      </span>
    </span>
  );
}

/* ---------- controls ---------- */

type BtnKind = "primary" | "ghost" | "quiet" | "danger" | "felt" | "light" | "paper";
export function Btn({
  kind = "ghost",
  size = "md",
  block = false,
  icon,
  iconRight,
  children,
  className = "",
  disabled = false,
}: {
  kind?: BtnKind;
  size?: "sm" | "md" | "lg";
  block?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button type="button" className={`btn btn-${kind} btn-${size}${block ? " btn-block" : ""}${disabled ? " is-disabled" : ""} ${className}`}>
      {icon}
      {children !== undefined && <span>{children}</span>}
      {iconRight}
    </button>
  );
}

export function IconBtn({ children, label, badge, className = "" }: { children: ReactNode; label?: string; badge?: string | number; className?: string }) {
  return (
    <span className={`iconbtn ${className}`} title={label}>
      {children}
      {badge !== undefined && <i className="iconbtn-badge">{badge}</i>}
    </span>
  );
}

export function Field({
  label,
  value,
  placeholder,
  icon,
  trailing,
  hint,
  state,
  mono,
  className = "",
}: {
  label?: ReactNode;
  value?: ReactNode;
  placeholder?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  hint?: ReactNode;
  state?: "focus" | "ok" | "error";
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={`field ${className}`}>
      {label && <span className="field-label">{label}</span>}
      <span className={`input${state ? ` is-${state}` : ""}`}>
        {icon && <span className="input-icon">{icon}</span>}
        {value !== undefined ? (
          <span className={`input-value${mono ? " is-mono" : ""}`}>
            {value}
            {state === "focus" && <i className="caret" />}
          </span>
        ) : (
          <span className="input-ph">{placeholder}</span>
        )}
        {trailing && <span className="input-trailing">{trailing}</span>}
      </span>
      {hint && <span className={`field-hint${state === "error" ? " is-error" : state === "ok" ? " is-ok" : ""}`}>{hint}</span>}
    </div>
  );
}

export function Badge({ kind = "muted", icon, children }: { kind?: "muted" | "brass" | "solid" | "gain" | "loss" | "claret" | "felt"; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={`badge b-${kind}`}>
      {icon}
      {children}
    </span>
  );
}

export function Toggle({ on }: { on: boolean }) {
  return <span className={`toggle${on ? " is-on" : ""}`} />;
}

export function Segmented({ items, active, className = "" }: { items: ReactNode[]; active: number; className?: string }) {
  return (
    <span className={`seg ${className}`}>
      {items.map((it, i) => (
        <span key={i} className={`seg-item${i === active ? " is-active" : ""}`}>
          {it}
        </span>
      ))}
    </span>
  );
}

export function Strength({ level, label }: { level: 1 | 2 | 3 | 4; label: string }) {
  return (
    <span className={`strength s-${level}`}>
      <span className="strength-bars">
        {[1, 2, 3, 4].map((i) => (
          <i key={i} className={i <= level ? "is-on" : ""} />
        ))}
      </span>
      <span className="strength-label">{label}</span>
    </span>
  );
}

/* ---------- app chrome ---------- */

export type NavKey = "lobby" | "history" | "profile";

export function DesktopNav({ active }: { active?: NavKey }) {
  const items: { key: NavKey; label: string }[] = [
    { key: "lobby", label: "Sảnh" },
    { key: "history", label: "Lịch sử" },
    { key: "profile", label: "Hồ sơ" },
  ];
  return (
    <header className="nav">
      <Wordmark />
      <nav className="nav-links">
        {items.map((it) => (
          <span key={it.key} className={`nav-link${active === it.key ? " is-active" : ""}`}>
            {it.label}
          </span>
        ))}
      </nav>
      <span className="nav-right">
        <IconBtn label="Thông báo" badge={1}>
          <Bell size={18} strokeWidth={1.8} />
        </IconBtn>
        <span className="nav-me">
          <Avatar name="Lym" size={32} />
          <span>Lym</span>
          <ChevronDown size={14} />
        </span>
      </span>
    </header>
  );
}

/** Landscape phone: a narrow rail on the left (inside the 44px notch inset) for the three tabs. */
export function MobileRail({ active }: { active?: NavKey }) {
  const items: { key: NavKey; label: string; icon: ReactNode }[] = [
    { key: "lobby", label: "Sảnh", icon: <LayoutGrid size={21} strokeWidth={1.7} /> },
    { key: "history", label: "Lịch sử", icon: <History size={21} strokeWidth={1.7} /> },
    { key: "profile", label: "Hồ sơ", icon: <UserRound size={21} strokeWidth={1.7} /> },
  ];
  return (
    <nav className="navrail">
      <Crest size={36} />
      <span className="navrail-tabs">
        {items.map((it) => (
          <span key={it.key} className={`navrail-tab${active === it.key ? " is-active" : ""}`}>
            {it.icon}
            <span>{it.label}</span>
          </span>
        ))}
      </span>
      <IconBtn label="Thông báo" badge={1}>
        <Bell size={19} strokeWidth={1.8} />
      </IconBtn>
      <Avatar name="Lym" size={34} />
    </nav>
  );
}

/** Landscape phone: a compact top bar (48px) for pages below a tab: back, title, actions. */
export function MobileAppBar({ title, left, right, sub }: { title: ReactNode; left?: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <header className="appbar">
      {left}
      <span className="appbar-title">
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </span>
      {right && <span className="appbar-right">{right}</span>}
    </header>
  );
}

/* ---------- decorative ---------- */

/** A deterministic, QR-looking 25×25 matrix (decorative; not a scannable code). */
export function QR({ size = 160 }: { size?: number }) {
  const n = 25;
  let seed = 20261027;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const inFinder = (r: number, c: number) => (r < 8 && c < 8) || (r < 8 && c >= n - 8) || (r >= n - 8 && c < 8);
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const v = rnd();
      if (inFinder(r, c)) continue;
      if ((r === 6 || c === 6) && (r + c) % 2 === 0) d += `M${c} ${r}h1v1h-1z`;
      else if (r !== 6 && c !== 6 && v > 0.53) d += `M${c} ${r}h1v1h-1z`;
    }
  }
  const finder = (x: number, y: number) => `M${x} ${y}h7v7h-7z M${x + 1} ${y + 1}v5h5v-5z M${x + 2} ${y + 2}h3v3h-3z`;
  return (
    <svg className="qr" width={size} height={size} viewBox="-2 -2 29 29" shapeRendering="crispEdges" aria-hidden>
      <rect x="-2" y="-2" width="29" height="29" rx="1.5" className="qr-bg" />
      <path d={d} className="qr-fg" />
      <path d={`${finder(0, 0)} ${finder(18, 0)} ${finder(0, 18)}`} className="qr-fg" fillRule="evenodd" />
      <rect x="10" y="10" width="5" height="5" rx="1" className="qr-bg" />
      <path d="M12.5 10.8c-.7 1-2 1.7-2 2.8 0 .6.5 1 1 1 .4 0 .7-.2.8-.4l-.4 1.1h1.2l-.4-1.1c.2.2.4.4.8.4.6 0 1-.4 1-1 0-1.1-1.3-1.8-2-2.8z" className="qr-mark" />
    </svg>
  );
}

/** Frozen confetti burst around (0,0) of its container. */
export function Confetti({ count = 34, spread = 1, className = "" }: { count?: number; spread?: number; className?: string }) {
  const colors = ["#E8CF92", "#D2AF66", "#C5484B", "#F3EAD7", "#86CFA0", "#9C7838"];
  const pieces = Array.from({ length: count }, (_, i) => {
    const a = (i * 137.508 * Math.PI) / 180;
    const dist = (34 + ((i * 53) % 118)) * spread;
    return {
      x: Math.cos(a) * dist * 1.35,
      y: Math.sin(a) * dist * 0.95,
      r: (i * 47) % 360,
      c: colors[i % colors.length],
      k: i % 3,
    };
  });
  return (
    <span className={`confetti ${className}`}>
      {pieces.map((p, i) => (
        <i
          key={i}
          className={`cf cf-${p.k}`}
          style={{ left: p.x, top: p.y, background: p.c, transform: `translate(-50%,-50%) rotate(${p.r}deg)` }}
        />
      ))}
    </span>
  );
}
