// Sơn Mài Vàng Son (d4) — page shells (desktop top bar, phone rail, auth split) and the art pieces
// (hero still life, medallions, mini table) used by the non-table screens.
import type { CSSProperties, ReactNode } from "react";
import { Bell, History, House, Plus, User } from "lucide-react";

import { card } from "../../shared/data";
import { Felt } from "./table";
import { Avatar, ChipStack, Dealer, Logo, PCard, Sun } from "./ui";

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

const NAV = [
  { icon: House, label: "Sảnh" },
  { icon: History, label: "Lịch sử" },
  { icon: User, label: "Hồ sơ" },
];

/** Desktop app bar: seal + wordmark, three sections, the signed-in player. */
export function TopNav({ active, guest }: { active: number; guest?: boolean }) {
  return (
    <header className="topnav">
      <Logo size={40} sub />
      <nav className="topnav-nav">
        {NAV.map(({ icon: I, label }, i) => (
          <span key={label} className={i === active ? "on" : ""}>
            <I size={17} strokeWidth={2} />
            {label}
          </span>
        ))}
      </nav>
      <span className="topnav-r">
        <span className="ibtn" style={{ width: 40, height: 40 }}>
          <Bell size={17} strokeWidth={2} />
        </span>
        <span className="topnav-me">
          <Avatar name={guest ? "khach-a1b2c3" : "Lym"} size={36} me={!guest} />
          <span>
            <b>{guest ? "khach-a1b2c3" : "Lym"}</b>
            <small>{guest ? "Đang là khách" : "lym@example.com"}</small>
          </span>
        </span>
      </span>
    </header>
  );
}

/** Phone rail: lacquer strip on the left (its buttons clear the 44px safe area). */
export function MRail({ active }: { active: number }) {
  return (
    <nav className="mrail">
      <Logo size={36} mark />
      <span className="mrail-nav">
        {NAV.map(({ icon: I, label }, i) => (
          <span key={label} className={i === active ? "on" : ""}>
            <I size={19} strokeWidth={2} />
            {label}
          </span>
        ))}
      </span>
      <Avatar name="Lym" size={34} me />
    </nav>
  );
}

/** Phone page header for screens without the rail. */
export function MHead({ title, sub, right, back = true }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; back?: boolean }) {
  return (
    <div className="mhead">
      {back && <span className="ibtn mhead-back">‹</span>}
      <span className="mhead-t">
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </span>
      {right}
    </div>
  );
}

/* ================================================================== art */

/**
 * Still life for the auth screens: a gold-leaf sun over a lacquered table corner, a fanned hand,
 * chip stacks and the dealer puck. Drawn at 520×520 and scaled.
 */
export function HeroArt({ scale = 1, className }: { scale?: number; className?: string }) {
  return (
    <div className={cx("hero", className)} style={{ width: 520 * scale, height: 520 * scale }}>
      <div className="hero-in" style={{ transform: `scale(${scale})` }}>
        <i className="hero-sun" />
        <i className="hero-sun-ring" />
        <Felt w={540} h={262} x={-10} y={252} rail={24} className="hero-felt" />
        <span className="hero-fan">
          <PCard c="back" size="xl" tilt={-30} />
          <PCard c="back" size="xl" tilt={-15} />
          <PCard c={card("Ah")} size="xl" tilt={0} />
          <PCard c={card("Kh")} size="xl" tilt={15} />
          <PCard c="back" size="xl" tilt={30} />
        </span>
        <span className="hero-chips">
          <ChipStack tones={["then", "then", "son", "son", "son", "egg"]} size={58} />
          <ChipStack tones={["son", "egg", "egg", "gold", "gold"]} size={58} />
          <ChipStack tones={["jade", "jade", "then", "egg"]} size={58} />
        </span>
        <Dealer size={46} style={{ left: 150, top: 410 }} />
      </div>
    </div>
  );
}

/** A round lacquer medallion with a gold rim and eggshell ring, holding an icon. */
export function Medallion({ children, size = 72, tone = "then", className }: { children: ReactNode; size?: number; tone?: "then" | "son" | "jade" | "warn"; className?: string }) {
  return (
    <span className={cx("medal", `medal-${tone}`, className)} style={{ width: size, height: size } as CSSProperties}>
      <i className="medal-egg" />
      <span className="medal-in">{children}</span>
    </span>
  );
}

/** A small lacquer table with N seat markers, for room cards and previews. */
export function MiniTable({ seated, seats, w = 150, h = 84, me, label, className }: { seated: number; seats: number; w?: number; h?: number; me?: boolean; label?: ReactNode; className?: string }) {
  const rx = w / 2 + 9;
  const ry = h / 2 + 9;
  return (
    <div className={cx("mini", className)} style={{ width: w + 30, height: h + 30 }}>
      <Felt w={w} h={h} x={15} y={15} rail={Math.max(6, Math.round(h * 0.09))} mark={false}>
        {label && <span className="felt-center mini-label">{label}</span>}
      </Felt>
      {Array.from({ length: seats }, (_, i) => {
        const a = Math.PI / 2 + (i / seats) * Math.PI * 2;
        const x = 15 + w / 2 + Math.cos(a) * rx;
        const y = 15 + h / 2 + Math.sin(a) * ry;
        const on = i < seated;
        return <i key={i} className={cx("mini-seat", on && "on", me && i === 0 && "me")} style={{ left: x, top: y }} />;
      })}
    </div>
  );
}

/** Empty lobby art: a quiet table with chairs pushed in and the sun on the felt. */
export function EmptyArt({ scale = 1 }: { scale?: number }) {
  return (
    <div className="emptyart" style={{ width: 260 * scale, height: 150 * scale }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0", width: 260, height: 150, position: "relative" }}>
        <MiniTable seated={0} seats={8} w={200} h={100} />
        <span className="emptyart-sun">
          <Sun size={46} />
        </span>
        <span className="emptyart-plus">
          <Plus size={16} strokeWidth={2.4} />
        </span>
      </div>
    </div>
  );
}
