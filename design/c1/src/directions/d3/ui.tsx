// Kẹo Đêm (d3) — primitives: cards, chips, blob avatars, chunky buttons, stickers, fields.
import type { CSSProperties, ReactNode } from "react";
import { Bell, ChevronLeft, House, History, User, X } from "lucide-react";

import type { Card, Suit } from "../../shared/data";
import { FRAME, type Device } from "../../shared/screens";
import { colorOf, confetti, fmt, initial, qrMatrix } from "./lib";

export type Tone = "pink" | "lime" | "sky" | "sun" | "white" | "ghost" | "grape" | "orange" | "mute";

/* ------------------------------------------------------------------ root */

export function Root({
  device,
  className = "",
  children,
  style,
}: {
  device: Device;
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const f = FRAME[device];
  return (
    <div className={`d3 d3-${device} ${className}`} style={{ width: f.width, height: f.height, ...style }}>
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------- cards */

const SUIT_KEY: Record<Suit, string> = { "♠": "s", "♥": "h", "♦": "d", "♣": "c" };

export function SuitIcon({ suit, size }: { suit: Suit; size: number }) {
  let shape: ReactNode;
  if (suit === "♠")
    shape = (
      <path d="M12 1.6c-2.7 4-8.8 7.6-8.8 12.3 0 2.7 2.1 4.7 4.6 4.7 1.5 0 2.7-.6 3.4-1.6-.3 1.9-1.1 3.6-2.7 4.8h7c-1.6-1.2-2.4-2.9-2.7-4.8.7 1 1.9 1.6 3.4 1.6 2.5 0 4.6-2 4.6-4.7 0-4.7-6.1-8.3-8.8-12.3z" />
    );
  else if (suit === "♥")
    shape = (
      <path d="M12 21.6C5.3 16.8 1.8 13.1 1.8 8.9c0-3 2.4-5.4 5.4-5.4 2 0 3.8 1.1 4.8 2.9 1-1.8 2.8-2.9 4.8-2.9 3 0 5.4 2.4 5.4 5.4 0 4.2-3.5 7.9-10.2 12.7z" />
    );
  else if (suit === "♦") shape = <path d="M12 1.4 20.6 12 12 22.6 3.4 12z" />;
  else
    shape = (
      <g>
        <circle cx="12" cy="6.7" r="4.6" />
        <circle cx="6.5" cy="13.3" r="4.6" />
        <circle cx="17.5" cy="13.3" r="4.6" />
        <path d="M12 8.5 9.4 14h5.2z" />
        <path d="M10.9 12.5h2.2l1.9 9.8H9z" />
      </g>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {shape}
    </svg>
  );
}

export type CardSize = "xs" | "sm" | "md" | "lg" | "xl";
const PIP: Record<CardSize, number> = { xs: 10, sm: 13, md: 15, lg: 18, xl: 22 };
const BIG: Record<CardSize, number> = { xs: 0, sm: 0, md: 26, lg: 34, xl: 46 };

export function PCard({
  c,
  size = "md",
  tilt = 0,
  style,
  className = "",
}: {
  c: Card;
  size?: CardSize;
  tilt?: number;
  style?: CSSProperties;
  className?: string;
}) {
  const st: CSSProperties = { ...style, ...(tilt ? { transform: `rotate(${tilt}deg)` } : {}) };
  if (c === "back")
    return (
      <span className={`pc pc-${size} pc-back ${className}`} style={st}>
        <i />
      </span>
    );
  const small = size === "xs" || size === "sm";
  return (
    <span className={`pc pc-${size} suit-${SUIT_KEY[c.suit]} ${className}`} style={st}>
      <b className="pc-r">{c.rank}</b>
      <span className="pc-p">
        <SuitIcon suit={c.suit} size={PIP[size]} />
      </span>
      {!small && (
        <span className="pc-big">
          <SuitIcon suit={c.suit} size={BIG[size]} />
        </span>
      )}
    </span>
  );
}

export const Slot = ({ size = "md" as CardSize }) => <span className={`pc pc-${size} pc-slot`} />;

/* ----------------------------------------------------------------- chips */

export function Token({ tone = "sun", size = 18 }: { tone?: Tone; size?: number }) {
  return <span className={`tok tok-${tone}`} style={{ width: size, height: size }} />;
}

export function ChipStack({ size = 18 }: { size?: number }) {
  return (
    <span className="tokstack" style={{ width: size + 16, height: size }}>
      <Token tone="pink" size={size} />
      <Token tone="sky" size={size} />
      <Token tone="sun" size={size} />
    </span>
  );
}

export function ChipPill({ n, tone = "sun", label, className = "" }: { n: number; tone?: Tone; label?: string; className?: string }) {
  return (
    <span className={`cpill ${className}`}>
      <span className="cpill-stack">
        <Token tone={tone} size={16} />
        <Token tone={tone} size={16} />
        <Token tone={tone} size={16} />
      </span>
      {label && <span className="cpill-l">{label}</span>}
      <b className="num">{fmt(n)}</b>
    </span>
  );
}

/* --------------------------------------------------------------- avatars */

const BLOBS = [
  "58% 42% 52% 48% / 48% 56% 44% 52%",
  "45% 55% 40% 60% / 55% 45% 55% 45%",
  "52% 48% 60% 40% / 42% 58% 42% 58%",
  "40% 60% 48% 52% / 58% 42% 58% 42%",
];

export function TimerRing({ size, pct, tone = "lime" }: { size: number; pct: number; tone?: Tone }) {
  const r = size / 2 - 3.5;
  const C = 2 * Math.PI * r;
  const m = size / 2;
  return (
    <svg className={`ring ring-${tone}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={m} cy={m} r={r} className="ring-trk" />
      <circle cx={m} cy={m} r={r} className="ring-bar" strokeDasharray={`${C * pct} ${C}`} transform={`rotate(-90 ${m} ${m})`} />
    </svg>
  );
}

const INK = "#16123a";

/** A tiny illustrated face. `mood` picks the eyes and mouth; "sleep" is for folded / away players. */
function Face({ mood }: { mood: number | "sleep" }) {
  const sleep = mood === "sleep";
  const m = sleep ? 0 : mood;
  const eye = (cx: number, wink?: boolean) =>
    sleep ? (
      <path d={`M${cx - 3.2} 18.5 q3.2 2.8 6.4 0`} stroke={INK} strokeWidth="2.4" fill="none" strokeLinecap="round" />
    ) : wink || m === 1 ? (
      <path d={`M${cx - 3.2} 19 q3.2 -4 6.4 0`} stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />
    ) : (
      <g>
        <ellipse cx={cx} cy="18" rx="2.7" ry="3.5" fill={INK} />
        <circle cx={cx + 0.9} cy="16.6" r="1" fill="#fff" />
      </g>
    );
  return (
    <svg className="av-face" viewBox="0 0 40 40" aria-hidden>
      <ellipse cx="8.5" cy="24.5" rx="4" ry="2.6" fill="#ff5fa8" opacity="0.42" />
      <ellipse cx="31.5" cy="24.5" rx="4" ry="2.6" fill="#ff5fa8" opacity="0.42" />
      {eye(13.5)}
      {eye(26.5, m === 3)}
      {sleep ? (
        <path d="M17 27.5 h6" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      ) : m === 1 ? (
        <g>
          <path d="M14 24.5 h12 q0 6.5 -6 6.5 q-6 0 -6 -6.5z" fill={INK} />
          <path d="M16.6 28.6 q3.4 -2.2 6.8 0 q-1.4 2.2 -3.4 2.2 q-2 0 -3.4 -2.2z" fill="#ff6f91" />
        </g>
      ) : m === 2 ? (
        <ellipse cx="20" cy="27.2" rx="2.6" ry="3" fill={INK} />
      ) : (
        <path d="M15 25.2 q5 5 10 0" stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function Avatar({
  name,
  size = 48,
  ring,
  dim,
  badge,
  className = "",
}: {
  name: string;
  size?: number;
  ring?: { pct: number; tone?: Tone };
  dim?: boolean;
  badge?: ReactNode;
  className?: string;
}) {
  const h = name.charCodeAt(0) + name.length;
  const blob = BLOBS[h % BLOBS.length];
  return (
    <span className={`av ${dim ? "av-dim" : ""} ${className}`} style={{ width: size, height: size }}>
      {ring && (
        <span className="av-ring" style={{ inset: -9 }}>
          <TimerRing size={size + 18} pct={ring.pct} tone={ring.tone} />
        </span>
      )}
      <span className="av-blob" style={{ background: colorOf(name), borderRadius: blob, fontSize: Math.round(size * 0.48) }}>
        {size >= 34 ? <Face mood={dim ? "sleep" : (h * 7) % 4} /> : <span className="av-ini">{initial(name)}</span>}
      </span>
      {badge}
    </span>
  );
}

export const Dealer = ({ style }: { style?: CSSProperties }) => (
  <span className="dealer" style={style}>
    D
  </span>
);

/* -------------------------------------------------------- buttons, tags */

export function Btn({
  tone = "pink",
  size = "md",
  icon,
  children,
  block,
  pressed,
  className = "",
  style,
}: {
  tone?: Tone;
  size?: "sm" | "md" | "lg" | "xl";
  icon?: ReactNode;
  children?: ReactNode;
  block?: boolean;
  pressed?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`btn btn-${tone} btn-${size} ${block ? "btn-block" : ""} ${pressed ? "btn-pressed" : ""} ${className}`}
      style={style}
    >
      {icon}
      {children}
    </span>
  );
}

export function IconBtn({ children, tone = "ghost", badge, size = 44 }: { children: ReactNode; tone?: Tone; badge?: ReactNode; size?: number }) {
  return (
    <span className={`ibtn btn-${tone}`} style={{ width: size, height: size }}>
      {children}
      {badge !== undefined && <span className="ibtn-badge">{badge}</span>}
    </span>
  );
}

export function Sticker({
  tone = "sun",
  tilt = -3,
  children,
  className = "",
  style,
}: {
  tone?: Tone;
  tilt?: number;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={`stk stk-${tone} ${className}`} style={{ transform: `rotate(${tilt}deg)`, ...style }}>
      {children}
    </span>
  );
}

export function Pill({ tone = "ghost", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`pill pill-${tone} ${className}`}>{children}</span>;
}

export function Money({ n, className = "" }: { n: number; className?: string }) {
  return (
    <b className={`money num ${n > 0 ? "up" : n < 0 ? "down" : "even"} ${className}`}>
      {n > 0 ? "+" : n < 0 ? "−" : ""}
      {fmt(n)}
    </b>
  );
}

/* ---------------------------------------------------------------- forms */

export function Field({
  label,
  value,
  placeholder,
  icon,
  right,
  hint,
  state,
  secret,
}: {
  label: string;
  value?: string;
  placeholder?: string;
  icon?: ReactNode;
  right?: ReactNode;
  hint?: ReactNode;
  state?: "focus" | "error" | "ok";
  secret?: boolean;
}) {
  return (
    <div className="fld">
      <span className="fld-l">{label}</span>
      <span className={`fld-box ${state ? `fld-${state}` : ""}`}>
        {icon && <span className="fld-i">{icon}</span>}
        <span className={value ? (secret ? "fld-v fld-secret" : "fld-v") : "fld-ph"}>{value ?? placeholder}</span>
        {state === "focus" && <span className="fld-caret" />}
        {right}
      </span>
      {hint && <span className="fld-h">{hint}</span>}
    </div>
  );
}

export const Toggle = ({ on }: { on: boolean }) => (
  <span className={`tgl ${on ? "on" : ""}`}>
    <i />
  </span>
);

export function Seg({ items, active, tone = "lime", className = "" }: { items: ReactNode[]; active: number; tone?: Tone; className?: string }) {
  return (
    <span className={`seg ${className}`}>
      {items.map((it, i) => (
        <span key={i} className={i === active ? `seg-on seg-${tone}` : ""}>
          {it}
        </span>
      ))}
    </span>
  );
}

export function Strength({ level, label }: { level: number; label: string }) {
  const tones = ["pink", "sun", "lime", "lime"];
  return (
    <span className="strength">
      {[0, 1, 2, 3].map((i) => (
        <i key={i} className={i < level ? `on-${tones[level - 1]}` : ""} />
      ))}
      <b className={`str-${tones[level - 1]}`}>{label}</b>
    </span>
  );
}

/* ---------------------------------------------------------- brand, deco */

export function Logo({ size = 28, sub }: { size?: number; sub?: boolean }) {
  return (
    <span className="logo" style={{ fontSize: size }}>
      <span className="logo-blob" style={{ width: size * 1.45, height: size * 1.45 }}>
        <SuitIcon suit="♠" size={size * 0.8} />
      </span>
      <span className="logo-txt">
        poker<em>bạn bè</em>
        {sub && <small>chip ảo · chơi cho vui</small>}
      </span>
    </span>
  );
}

export function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function Confetti({ seed, n = 40, className = "" }: { seed: number; n?: number; className?: string }) {
  return (
    <div className={`confetti ${className}`} aria-hidden>
      {confetti(seed, n).map((b, i) => (
        <i
          key={i}
          className={`cf cf-${b.k}`}
          style={{ left: `${b.x}%`, top: `${b.y}%`, transform: `rotate(${b.r}deg) scale(${b.s})`, color: b.c }}
        />
      ))}
    </div>
  );
}

export function QR({ size = 160, seed = 7 }: { size?: number; seed?: number }) {
  const m = qrMatrix(seed);
  const n = m.length;
  return (
    <svg className="qr" width={size} height={size} viewBox={`-2 -2 ${n + 4} ${n + 4}`} aria-label="Mã QR">
      <rect x="-2" y="-2" width={n + 4} height={n + 4} rx="3" fill="#fff" />
      {m.flatMap((row, y) =>
        row.map((on, x) => (on ? <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" rx="0.28" fill="#16123A" /> : null)),
      )}
    </svg>
  );
}

/* ---------------------------------------------------- phone chrome (landscape) */

/** iOS home indicator: landscape hides the status bar but keeps this bar at the bottom. */
export const HomeBar = () => <div className="homebar" />;

/** Page head for phone sub-pages: back (or close) button, title and one line of context. */
export function MHead({
  title,
  sub,
  right,
  close,
}: {
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  close?: boolean;
}) {
  return (
    <div className="mhead">
      <IconBtn size={44}>{close ? <X size={20} strokeWidth={3} /> : <ChevronLeft size={22} strokeWidth={3} />}</IconBtn>
      <div className="mhead-t">
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </div>
      {right && <div className="mhead-r">{right}</div>}
    </div>
  );
}

/** Left navigation rail of the phone app pages: height is scarce in landscape, width is not. */
export function MRail({ active }: { active: 0 | 1 | 2 }) {
  const items = [
    { icon: <House size={21} strokeWidth={2.6} />, label: "Sảnh" },
    { icon: <History size={21} strokeWidth={2.6} />, label: "Lịch sử" },
    { icon: <User size={21} strokeWidth={2.6} />, label: "Hồ sơ" },
  ];
  return (
    <nav className="mrail">
      <span className="logo-blob mrail-logo">
        <SuitIcon suit="♠" size={22} />
      </span>
      <div className="mrail-tabs">
        {items.map((it, i) => (
          <span key={it.label} className={i === active ? "on" : ""}>
            {it.icon}
            {it.label}
          </span>
        ))}
      </div>
      <IconBtn size={44} badge={1}>
        <Bell size={19} strokeWidth={2.8} />
      </IconBtn>
    </nav>
  );
}

/** Small section label, like a sticker heading. */
export const Eyebrow = ({ children, tone = "sky" }: { children: ReactNode; tone?: Tone }) => (
  <span className={`eyebrow eyebrow-${tone}`}>{children}</span>
);
