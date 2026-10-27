// Giấy & Mực — shared primitives. Everything is static: no state, no effects.
import type { CSSProperties, ReactNode } from "react";
import { BatteryFull, CircleUserRound, ScrollText, Signal, Spade as SpadeIcon, Wifi } from "lucide-react";

import { isRed, type Card, type Suit as SuitSym } from "../../shared/data";
import { FRAME, type Device } from "../../shared/screens";

export type Pt = readonly [number, number];

/** 1460 -> "1.460" (Vietnamese grouping); negatives get a real minus sign. */
export function fmt(n: number): string {
  const s = Math.abs(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return n < 0 ? `−${s}` : s;
}
export const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));
export const toneOf = (n: number) => (n > 0 ? "pos" : n < 0 ? "neg" : "zero");

/** The artboard: exact frame size, explicit paper background. */
export function Root({ device, className = "", children }: { device: Device; className?: string; children: ReactNode }) {
  const { width, height } = FRAME[device];
  return (
    <div
      className={`d2 d2-${device} ${className}`}
      style={{ width, height, overflow: "hidden", position: "relative", backgroundColor: "#F4EFE6" }}
    >
      {children}
    </div>
  );
}

/* ---------- suits & cards ---------- */

export function Suit({ s, className = "" }: { s: SuitSym; className?: string }) {
  return (
    <svg className={`suit ${className}`} viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      {s === "♥" && (
        <path
          fill="currentColor"
          d="M12 21.2C9.2 19 2.5 14.3 2.5 8.6 2.5 5.5 4.9 3 7.8 3c1.8 0 3.3.9 4.2 2.4C12.9 3.9 14.4 3 16.2 3c2.9 0 5.3 2.5 5.3 5.6 0 5.7-6.7 10.4-9.5 12.6z"
        />
      )}
      {s === "♦" && <path fill="currentColor" d="M12 1.8 20.2 12 12 22.2 3.8 12z" />}
      {s === "♠" && (
        <path
          fill="currentColor"
          d="M12 2.2C9.6 5.6 3.2 8.9 3.2 13.7c0 2.6 1.9 4.4 4.3 4.4 1.6 0 2.9-.8 3.6-1.9-.3 2-1.1 3.6-2.6 5.4h6.9c-1.5-1.8-2.3-3.4-2.6-5.4.7 1.1 2 1.9 3.6 1.9 2.4 0 4.3-1.8 4.3-4.4 0-4.8-6.4-8.1-8.8-11.5z"
        />
      )}
      {s === "♣" && (
        <g fill="currentColor">
          <circle cx="12" cy="6.9" r="4.4" />
          <circle cx="6.8" cy="13.4" r="4.4" />
          <circle cx="17.2" cy="13.4" r="4.4" />
          <rect x="9" y="9" width="6" height="6" />
          <path d="M11.2 12h1.6c.2 4 1 6.6 3.3 9.5H7.9c2.3-2.9 3.1-5.5 3.3-9.5z" />
        </g>
      )}
    </svg>
  );
}

export type CardSize = "xs" | "sm" | "md" | "lg" | "xl" | "mh";

export function PCard({
  c,
  size = "md",
  dim,
  mark,
  style,
}: {
  c: Card;
  size?: CardSize;
  dim?: boolean;
  mark?: boolean;
  style?: CSSProperties;
}) {
  if (c === "back")
    return (
      <div className={`pc pc-${size} pc-back`} style={style}>
        <i />
      </div>
    );
  return (
    <div className={`pc pc-${size}${isRed(c) ? " red" : ""}${dim ? " dim" : ""}${mark ? " mark" : ""}`} style={style}>
      <span className="pc-idx">
        <b>{c.rank}</b>
        <Suit s={c.suit} />
      </span>
      <Suit s={c.suit} className="pc-pip" />
    </div>
  );
}

export function SlotCard({ size = "md", label }: { size?: CardSize; label?: string }) {
  return <div className={`pc pc-${size} pc-slot`}>{label && <span>{label}</span>}</div>;
}

/** Inline card text for logs: "A♥". */
export function CardText({ c }: { c: Card }) {
  if (c === "back") return <span className="ctext">?</span>;
  return (
    <span className={`ctext${isRed(c) ? " red" : ""}`}>
      {c.rank}
      <Suit s={c.suit} />
    </span>
  );
}

/* ---------- chips ---------- */

export function Chip({ tone = "red", size = 16 }: { tone?: "red" | "ink" | "sage"; size?: number }) {
  return <span className={`chip chip-${tone}`} style={{ width: size, height: size }} />;
}

export function ChipStack() {
  return (
    <span className="chipstack">
      <Chip tone="sage" size={18} />
      <Chip tone="ink" size={18} />
      <Chip tone="red" size={18} />
    </span>
  );
}

/** A tag that sits on the table, centred on `at` (stage coordinates). */
export function OnTable({ at, className = "", children }: { at: Pt; className?: string; children: ReactNode }) {
  return (
    <div className={`ontable ${className}`} style={{ left: at[0], top: at[1] }}>
      {children}
    </div>
  );
}

export function Bet({ at, amount, small }: { at: Pt; amount: number; small?: boolean }) {
  return (
    <OnTable at={at} className={`bet${small ? " bet-sm" : ""}`}>
      <Chip size={small ? 12 : 16} />
      <span className="mono">{fmt(amount)}</span>
    </OnTable>
  );
}

export function Dealer({ at, size = 24 }: { at: Pt; size?: number }) {
  return (
    <OnTable at={at} className="dealer">
      <span style={{ width: size, height: size, fontSize: size * 0.5 }}>D</span>
    </OnTable>
  );
}

/* ---------- people ---------- */

const TINTS = ["sage", "slate", "ochre", "clay", "plum"] as const;
export function tintOf(name: string) {
  if (name === "Lym") return "me";
  let h = 0;
  for (const ch of name) h += ch.charCodeAt(0);
  return TINTS[h % TINTS.length];
}

export function Avatar({ name, size = 36, className = "" }: { name: string; size?: number; className?: string }) {
  return (
    <span
      className={`av av-${tintOf(name)} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {name.normalize("NFD")[0].toUpperCase()}
    </span>
  );
}

export function TimerRing({
  size,
  left,
  total,
  children,
}: {
  size: number;
  left: number;
  total: number;
  children?: ReactNode;
}) {
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  return (
    <span className="tring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={mid} cy={mid} r={r} className="tr-bg" />
        <circle
          cx={mid}
          cy={mid}
          r={r}
          className="tr-fg"
          strokeDasharray={`${(c * left) / total} ${c}`}
          transform={`rotate(-90 ${mid} ${mid})`}
        />
      </svg>
      {children}
    </span>
  );
}

/* ---------- controls ---------- */

export type BadgeKind = "line" | "muted" | "dash" | "warn" | "red" | "ink" | "sage" | "redline" | "paper";
export function Badge({ kind = "line", icon, children }: { kind?: BadgeKind; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={`badge b-${kind}`}>
      {icon}
      {children}
    </span>
  );
}

export function Btn({
  v = "line",
  s = "md",
  icon,
  iconRight,
  block,
  disabled,
  className = "",
  style,
  children,
}: {
  v?: "ink" | "red" | "line" | "ghost" | "paper" | "danger";
  s?: "sm" | "md" | "lg" | "xl";
  icon?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`btn btn-${v} btn-${s}${block ? " btn-block" : ""}${disabled ? " is-disabled" : ""} ${className}`}
      style={style}
    >
      {icon}
      {children !== undefined && <span className="btn-l">{children}</span>}
      {iconRight}
    </button>
  );
}

export function IconBtn({ icon, label, className = "" }: { icon: ReactNode; label: string; className?: string }) {
  return (
    <button type="button" className={`ib ${className}`} aria-label={label} title={label}>
      {icon}
    </button>
  );
}

export function Field({
  label,
  value,
  placeholder,
  hint,
  state,
  icon,
  right,
  mono,
  aside,
}: {
  label?: string;
  value?: ReactNode;
  placeholder?: string;
  hint?: ReactNode;
  state?: "focus" | "error" | "ok" | "disabled";
  icon?: ReactNode;
  right?: ReactNode;
  mono?: boolean;
  aside?: ReactNode;
}) {
  return (
    <div className={`field${state ? ` is-${state}` : ""}`}>
      {(label || aside) && (
        <div className="field-top">
          {label && <label>{label}</label>}
          {aside}
        </div>
      )}
      <div className="input">
        {icon && <span className="input-ic">{icon}</span>}
        <span className={`input-v${value === undefined ? " ph" : ""}${mono ? " mono" : ""}`}>
          {value ?? placeholder}
        </span>
        {state === "focus" && <span className="caret" />}
        {right}
      </div>
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function Toggle({ on }: { on?: boolean }) {
  return (
    <span className={`toggle${on ? " on" : ""}`}>
      <i />
    </span>
  );
}

export function Check({ on, children }: { on?: boolean; children: ReactNode }) {
  return (
    <span className={`check${on ? " on" : ""}`}>
      <i>{on && <svg viewBox="0 0 12 12" width="10" height="10"><path d="M2.5 6.2 5 8.6l4.6-5.2" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>}</i>
      {children}
    </span>
  );
}

export function Seg({ items, on, mono, className = "" }: { items: ReactNode[]; on: number; mono?: boolean; className?: string }) {
  return (
    <div className={`seg ${className}`}>
      {items.map((it, i) => (
        <span key={i} className={`${i === on ? "on" : ""}${mono ? " mono" : ""}`}>
          {it}
        </span>
      ))}
    </div>
  );
}

/** A drawn range slider. `value` 0..1. `ticks` draws N evenly spaced ticks. */
export function Slider({ value, ticks }: { value: number; ticks?: number }) {
  return (
    <div className="slider">
      <div className="slider-track">
        <i style={{ width: `${value * 100}%` }} />
      </div>
      {ticks !== undefined &&
        Array.from({ length: ticks }, (_, i) => (
          <b
            key={i}
            className={`slider-tick${i / (ticks - 1) <= value + 0.001 ? " done" : ""}`}
            style={{ left: `${(i / (ticks - 1)) * 100}%` }}
          />
        ))}
      <span className="slider-thumb" style={{ left: `${value * 100}%` }} />
    </div>
  );
}

export function Progress({ value, tone = "red" }: { value: number; tone?: "red" | "ink" | "sage" | "ochre" }) {
  return (
    <div className={`progress p-${tone}`}>
      <i style={{ width: `${value * 100}%` }} />
    </div>
  );
}

/* ---------- layout bits ---------- */

export function SecHead({ title, meta, children }: { title: ReactNode; meta?: ReactNode; children?: ReactNode }) {
  return (
    <div className="sec-h">
      <h3 className="serif">{title}</h3>
      <span className="sec-rule" />
      {meta && <span className="eyebrow">{meta}</span>}
      {children}
    </div>
  );
}

export function Brand({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`brand brand-${size}`}>
      <span className="brand-mark">
        <Suit s="♥" />
      </span>
      <span className="brand-name serif">Poker Friends</span>
    </span>
  );
}

export function Ornament() {
  return (
    <span className="orn" aria-hidden="true">
      <Suit s="♠" />
      <Suit s="♥" />
      <Suit s="♦" />
      <Suit s="♣" />
    </span>
  );
}

/** Desktop top navigation for the non-table pages. */
export function TopNav({ active, guest }: { active?: "rooms" | "history" | "profile"; guest?: string }) {
  const link = (id: string, text: string) => <span className={`nav-l${active === id ? " on" : ""}`}>{text}</span>;
  return (
    <header className="nav">
      <Brand />
      <nav className="nav-links">
        {link("rooms", "Sảnh")}
        {link("history", "Lịch sử")}
        {link("profile", "Hồ sơ")}
      </nav>
      <div className="nav-right">
        <span className="nav-hint">Chip ảo · không tiền thật</span>
        {guest ? (
          <span className="nav-user">
            <span className="av av-guest" style={{ width: 30, height: 30, fontSize: 13 }}>
              K
            </span>
            <span className="mono">{guest}</span>
            <Badge kind="dash">Khách</Badge>
          </span>
        ) : (
          <span className="nav-user">
            <Avatar name="Lym" size={30} />
            <span>Lym</span>
          </span>
        )}
      </div>
    </header>
  );
}

/* ---------- mobile chrome ---------- */

export function StatusBar({ onDark }: { onDark?: boolean }) {
  return (
    <div className={`sbar${onDark ? " on-dark" : ""}`}>
      <span className="sbar-t">21:04</span>
      <span className="sbar-i">
        <Signal size={15} strokeWidth={2.2} />
        <Wifi size={15} strokeWidth={2.2} />
        <BatteryFull size={22} strokeWidth={1.6} />
      </span>
    </div>
  );
}

export function HomeBar() {
  return <div className="homebar" />;
}

export function TabBar({ active }: { active: "rooms" | "history" | "profile" }) {
  const tab = (id: string, icon: ReactNode, text: string) => (
    <span className={`tab${active === id ? " on" : ""}`}>
      {icon}
      <span>{text}</span>
    </span>
  );
  return (
    <nav className="tabbar">
      {tab("rooms", <SpadeIcon size={20} strokeWidth={1.75} />, "Sảnh")}
      {tab("history", <ScrollText size={20} strokeWidth={1.75} />, "Lịch sử")}
      {tab("profile", <CircleUserRound size={20} strokeWidth={1.75} />, "Hồ sơ")}
      <HomeBar />
    </nav>
  );
}

/** Caption for boards that show two variants of one screen side by side. */
export function VariantCap({ letter, children }: { letter: string; children: ReactNode }) {
  return (
    <div className="vcap">
      <b>{letter}</b>
      <span>{children}</span>
    </div>
  );
}

/* ---------- QR (deterministic, drawn) ---------- */

export function Qr({ size = 168, seed }: { size?: number; seed: string }) {
  const n = 25;
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
  const finder = (x: number, y: number) => (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
  let d = "";
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const v = rnd();
      if (finder(x, y)) continue;
      if (x === 6 || y === 6 ? (x + y) % 2 === 0 : v > 0.5) d += `M${x} ${y}h1v1h-1z`;
    }
  const eye = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width={7} height={7} fill="currentColor" />
      <rect x={x + 1} y={y + 1} width={5} height={5} fill="#fff" />
      <rect x={x + 2} y={y + 2} width={3} height={3} fill="currentColor" />
    </g>
  );
  return (
    <svg className="qr" viewBox={`-2 -2 ${n + 4} ${n + 4}`} width={size} height={size} shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={n + 4} height={n + 4} fill="#fff" />
      <path d={d} fill="currentColor" />
      {eye(0, 0)}
      {eye(n - 7, 0)}
      {eye(0, n - 7)}
    </svg>
  );
}
