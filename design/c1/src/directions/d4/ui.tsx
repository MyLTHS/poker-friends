// Sơn Mài Vàng Son (d4) — primitives: root, buttons, fields, cards, chips, avatars, rings, tags.
import { useId, type CSSProperties, type ReactNode } from "react";

import type { Card, Suit } from "../../shared/data";
import { FRAME, type Device } from "../../shared/screens";
import { fmt, initial, pigment, qrMatrix, ringTicks, signed, sunRays, TEXTURES } from "./lib";

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");
const useSvgId = () => useId().replace(/[^a-zA-Z0-9]/g, "");

/* ------------------------------------------------------------------ root */

/** The direction's root: exactly the frame size, carries the textures as CSS variables. */
export function Root({ device, className, children }: { device: Device; className?: string; children: ReactNode }) {
  const f = FRAME[device];
  return (
    <div className={cx("d4", `d4-${device}`, className)} style={{ width: f.width, height: f.height, ...(TEXTURES as CSSProperties) }}>
      {children}
    </div>
  );
}

/** iOS home indicator (landscape phone). */
export const HomeBar = () => <i className="homebar" aria-hidden />;

/* ------------------------------------------------------------ ornaments */

/** Đông Sơn drum sun: star, ladder band and rings, in gold leaf. */
export function Sun({ size = 40, rays = 14, rings = true, tone = "gold", className }: { size?: number; rays?: number; rings?: boolean; tone?: "gold" | "ink" | "pearl"; className?: string }) {
  const id = useSvgId();
  const fill = tone === "gold" ? `url(#g${id})` : tone === "pearl" ? `url(#p${id})` : "currentColor";
  return (
    <svg className={cx("sun", className)} width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8d6427" />
          <stop offset=".28" stopColor="#f7dd98" />
          <stop offset=".5" stopColor="#c99a48" />
          <stop offset=".7" stopColor="#fdebb6" />
          <stop offset="1" stopColor="#a17533" />
        </linearGradient>
        <linearGradient id={`p${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6efe2" />
          <stop offset=".3" stopColor="#d3ebee" />
          <stop offset=".55" stopColor="#f0d6e3" />
          <stop offset=".8" stopColor="#dbe1f6" />
          <stop offset="1" stopColor="#f3e7cf" />
        </linearGradient>
      </defs>
      {rings && (
        <>
          <circle cx="50" cy="50" r="47" fill="none" stroke={fill} strokeWidth="2" />
          <path d={ringTicks(50, 38, 45, 40)} stroke={fill} strokeWidth="1.4" />
          <circle cx="50" cy="50" r="37" fill="none" stroke={fill} strokeWidth="1.2" />
        </>
      )}
      <path d={sunRays(50, rings ? 9 : 12, rings ? 34 : 48, rays, rings ? 0.15 : 0.13)} fill={fill} />
      <circle cx="50" cy="50" r={rings ? 9 : 12} fill={fill} />
    </svg>
  );
}

/** App mark: a cinnabar lacquer seal with the gold sun, plus the wordmark. */
export function Logo({ size = 40, sub, mark }: { size?: number; sub?: boolean; mark?: boolean }) {
  return (
    <span className="logo">
      <span className="seal" style={{ width: size, height: size }}>
        <Sun size={size * 0.74} />
      </span>
      {!mark && (
        <span className="logo-t">
          <b>Poker Bạn Bè</b>
          {sub && <small>chip ảo · chơi cho vui</small>}
        </span>
      )}
    </span>
  );
}

export function Eyebrow({ children, tone, className }: { children: ReactNode; tone?: "son" | "jade" | "pearl" | "mute"; className?: string }) {
  return (
    <span className={cx("eyebrow", tone && `eyebrow-${tone}`, className)}>
      <i />
      {children}
    </span>
  );
}

export function Divider({ children }: { children: ReactNode }) {
  return (
    <span className="divider">
      <i />
      <span>{children}</span>
      <i />
    </span>
  );
}

/** A lacquer panel with gold corner fittings. */
export function Panel({
  children,
  className,
  tone,
  as: Tag = "section",
  style,
}: {
  children: ReactNode;
  className?: string;
  tone?: "son" | "deep" | "egg";
  as?: "section" | "div" | "aside" | "article";
  style?: CSSProperties;
}) {
  return (
    <Tag className={cx("pnl", tone && `pnl-${tone}`, className)} style={style}>
      <i className="pnl-corners" aria-hidden />
      {children}
    </Tag>
  );
}

/* ---------------------------------------------------------------- inputs */

export type BtnTone = "gold" | "son" | "then" | "ivory" | "ghost" | "jade";
export type BtnSize = "sm" | "md" | "lg" | "xl";

export function Btn({
  tone = "then",
  size = "md",
  block,
  icon,
  iconRight,
  children,
  className,
  sub,
}: {
  tone?: BtnTone;
  size?: BtnSize;
  block?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  children?: ReactNode;
  className?: string;
  sub?: ReactNode;
}) {
  return (
    <span className={cx("btn", `btn-${tone}`, `btn-${size}`, block && "btn-block", sub != null && "btn-stack", className)}>
      {icon}
      {sub != null ? (
        <span className="btn-two">
          <span>{children}</span>
          <small>{sub}</small>
        </span>
      ) : (
        children != null && <span className="btn-t">{children}</span>
      )}
      {iconRight}
    </span>
  );
}

export function IconBtn({ children, size = 44, tone, className, badge }: { children: ReactNode; size?: number; tone?: "gold" | "son"; className?: string; badge?: ReactNode }) {
  return (
    <span className={cx("ibtn", tone && `ibtn-${tone}`, className)} style={{ width: size, height: size }}>
      {children}
      {badge != null && <b className="ibtn-badge">{badge}</b>}
    </span>
  );
}

export function Field({
  label,
  value,
  placeholder,
  icon,
  right,
  state,
  hint,
  secret,
  className,
}: {
  label: string;
  value?: string;
  placeholder?: string;
  icon?: ReactNode;
  right?: ReactNode;
  state?: "focus" | "ok" | "err";
  hint?: ReactNode;
  secret?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("fld-wrap", className)}>
      <span className={cx("fld", state && `fld-${state}`)}>
        {icon && <span className="fld-ic">{icon}</span>}
        <span className="fld-main">
          <small className="fld-l">{label}</small>
          <span className={cx("fld-v", !value && "fld-ph", secret && "fld-secret")}>
            {value ?? placeholder}
            {state === "focus" && <i className="caret" />}
          </span>
        </span>
        {right && <span className="fld-r">{right}</span>}
      </span>
      {hint && <span className="fld-h">{hint}</span>}
    </div>
  );
}

export function Seg({ items, active, className }: { items: ReactNode[]; active: number; className?: string }) {
  return (
    <span className={cx("seg", className)}>
      {items.map((it, i) => (
        <span key={i} className={i === active ? "on" : ""}>
          {it}
        </span>
      ))}
    </span>
  );
}

export const Toggle = ({ on }: { on?: boolean }) => (
  <span className={cx("tgl", on && "tgl-on")}>
    <i />
  </span>
);

export function Stepper({ value, unit }: { value: string; unit?: string }) {
  return (
    <span className="stepper">
      <span className="stp-b">−</span>
      <b className="num">
        {value}
        {unit && <small>{unit}</small>}
      </b>
      <span className="stp-b stp-plus">+</span>
    </span>
  );
}

export function Strength({ level, label }: { level: 1 | 2 | 3 | 4; label: string }) {
  return (
    <span className={`strength strength-${level}`}>
      <span className="strength-bars">
        {[1, 2, 3, 4].map((i) => (
          <i key={i} className={i <= level ? "on" : ""} />
        ))}
      </span>
      <b>{label}</b>
    </span>
  );
}

export function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/* ---------------------------------------------------------------- people */

export function Avatar({
  name,
  size = 40,
  dim,
  me,
  ring,
  badge,
  className,
}: {
  name: string;
  size?: number;
  dim?: boolean;
  me?: boolean;
  ring?: { pct: number; left?: number };
  badge?: ReactNode;
  className?: string;
}) {
  const [a, b, c] = pigment(name);
  return (
    <span
      className={cx("av", dim && "av-dim", me && "av-me", ring && "av-turn", className)}
      style={{ width: size, height: size, "--av-a": a, "--av-b": b, "--av-c": c, fontSize: size * 0.44 } as CSSProperties}
    >
      <span className="av-in">{initial(name)}</span>
      {ring && <TimerRing size={size + 14} pct={ring.pct} className="av-ring" />}
      {badge}
    </span>
  );
}

/** The countdown: a gold-leaf arc over a tick-marked lacquer track, with a bright tip. */
export function TimerRing({ size = 56, pct, stroke = 3, ticks = 20, className }: { size?: number; pct: number; stroke?: number; ticks?: number; className?: string }) {
  const id = useSvgId();
  const r = 50 - stroke * 1.6;
  const C = 2 * Math.PI * r;
  const a = pct * Math.PI * 2 - Math.PI / 2;
  return (
    <svg className={cx("tring", className)} width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id={`t${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fdeab4" />
          <stop offset=".45" stopColor="#d9a650" />
          <stop offset="1" stopColor="#f7d98c" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r={r} fill="none" className="tring-trk" strokeWidth={stroke * 1.6} />
      <path d={ringTicks(50, r - stroke * 0.55, r + stroke * 0.55, ticks)} className="tring-tick" strokeWidth={0.9} />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={`url(#t${id})`}
        strokeWidth={stroke * 1.6}
        strokeLinecap="round"
        strokeDasharray={`${C * pct} ${C}`}
        transform="rotate(-90 50 50)"
      />
      <circle cx={50 + Math.cos(a) * r} cy={50 + Math.sin(a) * r} r={stroke * 1.25} className="tring-tip" />
    </svg>
  );
}

/* ----------------------------------------------------------------- cards */

const SUIT_PATH: Record<Suit, ReactNode> = {
  "♥": <path d="M12 21.6S2.4 15.4 2.4 8.7C2.4 5.5 4.8 3 7.9 3c1.8 0 3.3.9 4.1 2.3C12.8 3.9 14.3 3 16.1 3c3.1 0 5.5 2.5 5.5 5.7 0 6.7-9.6 12.9-9.6 12.9Z" />,
  "♦": <path d="M12 1.6c2.3 3.9 5 7.3 8.6 10.4-3.6 3.1-6.3 6.5-8.6 10.4-2.3-3.9-5-7.3-8.6-10.4C7 8.9 9.7 5.5 12 1.6Z" />,
  "♠": (
    <path d="M12 1.8S2.8 9.1 2.8 14.3c0 2.8 2.2 4.9 4.9 4.9 1.6 0 2.9-.7 3.7-1.8-.2 2-1 3.5-2.6 4.8h6.4c-1.6-1.3-2.4-2.8-2.6-4.8.8 1.1 2.1 1.8 3.7 1.8 2.7 0 4.9-2.1 4.9-4.9C21.2 9.1 12 1.8 12 1.8Z" />
  ),
  "♣": (
    <path d="M12 2.2a4.6 4.6 0 0 0-4.3 6.3 4.6 4.6 0 1 0 3.5 8.6c-.2 2-1 3.6-2.6 4.8h6.8c-1.6-1.2-2.4-2.8-2.6-4.8a4.6 4.6 0 1 0 3.5-8.6A4.6 4.6 0 0 0 12 2.2Z" />
  ),
};

export function SuitIcon({ suit, size = 14, className }: { suit: Suit; size?: number; className?: string }) {
  return (
    <svg className={cx("suit", className)} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {SUIT_PATH[suit]}
    </svg>
  );
}

export type CardSize = "xs" | "sm" | "md" | "lg" | "xl";
const CARD_W: Record<CardSize, number> = { xs: 24, sm: 34, md: 44, lg: 58, xl: 78 };

/** A playing card: ivory paper face with corner index and a large pip, or the lacquer back. */
export function PCard({ c, size = "md", tilt = 0, className, style }: { c: Card; size?: CardSize; tilt?: number; className?: string; style?: CSSProperties }) {
  const w = CARD_W[size];
  const st: CSSProperties = { width: w, height: Math.round(w * 1.4), transform: tilt ? `rotate(${tilt}deg)` : undefined, ...style };
  if (c === "back") return <span className={cx("pc", "pc-back", `pc-${size}`, className)} style={st} />;
  const red = c.suit === "♥" || c.suit === "♦";
  const court = c.rank === "K" || c.rank === "Q" || c.rank === "J";
  return (
    <span className={cx("pc", `pc-${size}`, red ? "pc-red" : "pc-blk", court && "pc-court", className)} style={st}>
      <span className="pc-idx">
        <b>{c.rank}</b>
        <SuitIcon suit={c.suit} size={w * 0.2} />
      </span>
      {size !== "xs" &&
        (court ? (
          <span className="pc-face">
            <b>{c.rank}</b>
            <SuitIcon suit={c.suit} size={w * 0.22} />
          </span>
        ) : (
          <SuitIcon suit={c.suit} size={w * (c.rank === "A" ? 0.56 : 0.46)} className="pc-pip" />
        ))}
    </span>
  );
}

/** An empty board slot (turn / river not dealt yet). */
export const Slot = ({ size = "md" }: { size?: CardSize }) => (
  <span className={`pc-slot pc-${size}`} style={{ width: CARD_W[size], height: Math.round(CARD_W[size] * 1.4) }} />
);

/* ----------------------------------------------------------------- chips */

export type ChipTone = "son" | "then" | "egg" | "jade" | "gold";
const CHIP: Record<ChipTone, { body: [string, string]; inlay: string; edge: string }> = {
  son: { body: ["#c2412b", "#6c150c"], inlay: "#f1e5cc", edge: "#4a0c06" },
  then: { body: ["#3a2c26", "#0d0907"], inlay: "#e3be72", edge: "#050303" },
  egg: { body: ["#fbf3e2", "#cdbd9b"], inlay: "#a8291c", edge: "#8f7f62" },
  jade: { body: ["#3f8a72", "#173f33"], inlay: "#f1e5cc", edge: "#0d2a21" },
  gold: { body: ["#f6d98f", "#9a6e2c"], inlay: "#6c150c", edge: "#5e4317" },
};

/**
 * A stack of chips in three-quarter view: banded edges with inlay stripes, and an inlaid top face
 * (edge blocks, gold ring, mother-of-pearl centre).
 */
export function ChipStack({ tones, size = 26, className }: { tones: ChipTone[]; size?: number; className?: string }) {
  const id = useSvgId();
  const rx = size / 2;
  const ry = size * 0.31;
  const band = size * 0.15;
  const n = tones.length;
  const h = ry * 2 + band * n + 1;
  const top = tones[n - 1];
  const t = CHIP[top];
  const cy = ry + 0.5;
  const blocks = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2 + Math.PI / 8);
  return (
    <svg className={cx("chips", className)} width={size} height={h} viewBox={`0 0 ${size} ${h}`} aria-hidden>
      <defs>
        {(Object.keys(CHIP) as ChipTone[]).map((k) => (
          <linearGradient key={k} id={`${k}${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={CHIP[k].body[1]} />
            <stop offset=".35" stopColor={CHIP[k].body[0]} />
            <stop offset="1" stopColor={CHIP[k].body[1]} />
          </linearGradient>
        ))}
        <radialGradient id={`top${id}`} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor={t.body[0]} />
          <stop offset="1" stopColor={t.body[1]} />
        </radialGradient>
        <linearGradient id={`pearl${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbf4e6" />
          <stop offset=".35" stopColor="#d5ecef" />
          <stop offset=".6" stopColor="#f1d8e5" />
          <stop offset="1" stopColor="#e5e9f6" />
        </linearGradient>
      </defs>
      {tones.map((tone, i) => {
        const y = cy + band * (n - 1 - i);
        const c = CHIP[tone];
        return (
          <g key={i}>
            <path d={`M0 ${y} V${y + band} A${rx} ${ry} 0 0 0 ${size} ${y + band} V${y} Z`} fill={`url(#${tone}${id})`} stroke={c.edge} strokeWidth=".5" />
            {[0.16, 0.5, 0.84].map((p) => (
              <rect key={p} x={p * size - size * 0.045} y={y + ry * Math.sin(Math.acos(1 - 2 * p)) * 0.98} width={size * 0.09} height={band * 0.92} fill={c.inlay} opacity=".92" />
            ))}
          </g>
        );
      })}
      <ellipse cx={rx} cy={cy} rx={rx} ry={ry} fill={`url(#top${id})`} stroke={t.edge} strokeWidth=".5" />
      {blocks.map((a) => (
        <ellipse key={a} cx={rx + Math.cos(a) * rx * 0.84} cy={cy + Math.sin(a) * ry * 0.84} rx={size * 0.055} ry={size * 0.035} fill={t.inlay} />
      ))}
      <ellipse cx={rx} cy={cy} rx={rx * 0.62} ry={ry * 0.62} fill="none" stroke="#e8c27a" strokeWidth=".7" />
      <ellipse cx={rx} cy={cy} rx={rx * 0.42} ry={ry * 0.42} fill={`url(#pearl${id})`} opacity=".92" />
    </svg>
  );
}

/** A single chip seen from above, used as the currency mark next to numbers. */
export function Token({ size = 14, tone = "gold" }: { size?: number; tone?: ChipTone }) {
  const c = CHIP[tone];
  return (
    <span className="token" style={{ width: size, height: size, "--tk-a": c.body[0], "--tk-b": c.body[1], "--tk-i": c.inlay } as CSSProperties} aria-hidden />
  );
}

/** Chips plus the amount, for bets and the pot. */
export function Bet({ n, tones, size = 22, className, style, label }: { n: number; tones: ChipTone[]; size?: number; className?: string; style?: CSSProperties; label?: string }) {
  return (
    <span className={cx("bet", className)} style={style}>
      <ChipStack tones={tones} size={size} />
      <b className="num">
        {label && <small>{label}</small>}
        {fmt(n)}
      </b>
    </span>
  );
}

/** The dealer button: a mother-of-pearl puck with a gold rim. */
export const Dealer = ({ style, size = 26 }: { style?: CSSProperties; size?: number }) => (
  <span className="dealer" style={{ width: size, height: size, fontSize: size * 0.5, ...style }}>
    D
  </span>
);

/* ------------------------------------------------------------ indicators */

export type TagTone = "gold" | "son" | "jade" | "mute" | "pearl" | "warn" | "ink";
export function Tag({ tone = "ink", children, icon, className }: { tone?: TagTone; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <span className={cx("tag", `tag-${tone}`, className)}>
      {icon}
      {children}
    </span>
  );
}

export function Money({ n, className, big }: { n: number; className?: string; big?: boolean }) {
  return <span className={cx("money", n > 0 ? "up" : n < 0 ? "down" : "zero", big && "money-big", className)}>{n === 0 ? "0" : signed(n)}</span>;
}

/** Chips amount with the gold token. */
export const Amount = ({ n, size = 13, className }: { n: number; size?: number; className?: string }) => (
  <span className={cx("amt", className)}>
    <Token size={size} />
    <b className="num">{fmt(n)}</b>
  </span>
);

export function QR({ size = 160, seed = 11 }: { size?: number; seed?: number }) {
  const m = qrMatrix(seed);
  const n = m.length;
  return (
    <svg className="qr" width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" aria-hidden>
      {m.flatMap((row, y) => row.map((on, x) => (on ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" /> : null)))}
    </svg>
  );
}

/** A small lời/lỗ line: zero baseline, gold area, end dot in jade (up) or vermilion (down). */
export function Spark({ points, w = 140, h = 40 }: { points: number[]; w?: number; h?: number }) {
  const id = useSvgId();
  const lo = Math.min(0, ...points);
  const hi = Math.max(0, ...points);
  const span = hi - lo || 1;
  const px = (i: number) => 2 + (i / (points.length - 1)) * (w - 6);
  const py = (v: number) => 3 + (1 - (v - lo) / span) * (h - 6);
  const line = points.map((v, i) => `${i ? "L" : "M"}${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join("");
  const last = points[points.length - 1];
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <defs>
        <linearGradient id={`s${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e2b866" stopOpacity=".32" />
          <stop offset="1" stopColor="#e2b866" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" x2={w} y1={py(0)} y2={py(0)} className="spark-zero" />
      <path d={`${line}L${px(points.length - 1)} ${py(0)}L${px(0)} ${py(0)}Z`} fill={`url(#s${id})`} />
      <path d={line} className="spark-line" />
      <circle cx={px(points.length - 1)} cy={py(last)} r="3" className={last >= 0 ? "spark-up" : "spark-down"} />
    </svg>
  );
}
