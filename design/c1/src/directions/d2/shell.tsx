// Kính & Ánh Kim (d2) — app chrome around the non-table screens: the desktop glass sidebar,
// the phone's 48px top bar, and the hero art used by the account screens.
import type { ReactNode } from "react";
import { History, LayoutGrid, Plus, User } from "lucide-react";

import { card } from "../../shared/data";
import type { Device } from "../../shared/screens";
import { Avatar, Btn, Dealer, Logo, Mark, PCard, Root, Skyline, Stack } from "./ui";

const NAV = [
  { label: "Sảnh", icon: LayoutGrid },
  { label: "Lịch sử", icon: History },
  { label: "Hồ sơ", icon: User },
];

/** Desktop: glass sidebar on the left, the page on the right. */
export function Shell({ active, children, className = "" }: { active: number; children: ReactNode; className?: string }) {
  return (
    <Root device="desktop" className={className}>
      <aside className="k-side k-glass">
        <Logo size={38} sub="Chip ảo · chơi vui" />
        <nav className="k-side-nav">
          {NAV.map((n, i) => (
            <span key={n.label} className={`k-side-i ${i === active ? "on" : ""}`}>
              <n.icon size={19} strokeWidth={2} />
              {n.label}
            </span>
          ))}
        </nav>
        <div className="k-side-live">
          <small>Đang ngồi</small>
          <span className="k-side-live-r">
            <i className="k-live-dot" />
            <b>Bàn thứ Sáu</b>
            <span className="k-num">10/20</span>
          </span>
        </div>
        <Btn tone="gold" size="lg" block icon={<Plus size={18} strokeWidth={2.6} />}>
          Tạo phòng
        </Btn>
        <div className="k-side-me">
          <Avatar name="Lym" size={40} />
          <span>
            <b>Lym</b>
            <small>lym@example.com</small>
          </span>
        </div>
      </aside>
      <main className="k-main">{children}</main>
    </Root>
  );
}

/** Phone: one compact bar (48px), brand + title on the left, tabs on the right. */
export function MBar({ title, sub, active, right }: { title: string; sub?: string; active?: number; right?: ReactNode }) {
  return (
    <header className="k-mbar">
      <Mark size={28} />
      <span className="k-mbar-t">
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </span>
      {right}
      {active !== undefined && (
        <nav className="k-mbar-nav">
          {NAV.map((n, i) => (
            <span key={n.label} className={i === active ? "on" : ""}>
              <n.icon size={17} strokeWidth={2.1} />
              {i === active && n.label}
            </span>
          ))}
        </nav>
      )}
    </header>
  );
}

/** A table seen from the bar: felt ellipse, chip stacks, a fanned hand. Decorative. */
export function HeroArt({ size = "lg", className = "" }: { size?: "lg" | "md" | "sm"; className?: string }) {
  const k = size === "lg" ? 1 : size === "md" ? 0.78 : 0.48;
  return (
    <div className={`k-art k-art-${size} ${className}`}>
      <Skyline className="k-art-sky" />
      <i className="k-art-lamp" />
      <span className="k-art-table">
        <i />
      </span>
      <span className="k-art-stacks">
        <Stack tones={["petrol", "ivory", "petrol", "onyx", "ivory", "ruby"]} w={Math.round(46 * k)} />
        <Stack tones={["onyx", "onyx", "ivory", "onyx"]} w={Math.round(46 * k)} />
        <Stack tones={["ruby", "ivory", "ruby", "ivory", "ruby", "gold", "ivory", "gold"]} w={Math.round(46 * k)} />
      </span>
      <span className="k-art-dealer">
        <Dealer size={Math.round(34 * k)} />
      </span>
      <span className="k-art-cards">
        <PCard c={card("As")} w={Math.round(118 * k)} tilt={-14} />
        <PCard c={card("Kh")} w={Math.round(118 * k)} tilt={9} />
      </span>
    </div>
  );
}

/** The account screens: hero on the left, the form(s) on the right. */
export function AuthLayout({
  device,
  hero,
  children,
  wide,
}: {
  device: Device;
  hero: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Root device={device} bg="auth">
      <div className={`k-auth k-auth-${device} ${wide ? "k-auth-wide" : ""}`}>
        <section className="k-auth-hero">{hero}</section>
        <section className="k-auth-side">{children}</section>
      </div>
    </Root>
  );
}

export function HeroCopy({ device, title, gold, sub }: { device: Device; title: ReactNode; gold: ReactNode; sub?: ReactNode }) {
  return (
    <div className={`k-herocopy k-herocopy-${device}`}>
      <Logo size={device === "desktop" ? 40 : 28} />
      <h1>
        {title}
        <br />
        <span className="k-gold-t">{gold}</span>
      </h1>
      {sub && <p>{sub}</p>}
    </div>
  );
}
