// Page frames of D1. Desktop: a 64px top bar (wordmark, Sảnh / Lịch sử / Hồ sơ, bell, me) over a
// scrolling page. Landscape phone: tab pages get the wood rail on the left, pages under a tab get
// a 48px bar with back and title instead. Both bars are always rendered; CSS shows the right one.
import Link from "next/link";
import type { ReactNode } from "react";
import { Bell, ChevronDown, ChevronLeft, History, LayoutGrid, UserRound } from "lucide-react";

import { Avatar, Crest, Wordmark } from "./people";

export type NavKey = "lobby" | "history" | "profile";

/** Where the three tabs go. C4 changes them here if routes move. */
export const NAV_ITEMS: { key: NavKey; label: string; href: string; icon: ReactNode }[] = [
  { key: "lobby", label: "Sảnh", href: "/rooms", icon: <LayoutGrid size={21} strokeWidth={1.7} /> },
  { key: "history", label: "Lịch sử", href: "/rooms", icon: <History size={21} strokeWidth={1.7} /> },
  { key: "profile", label: "Hồ sơ", href: "/account", icon: <UserRound size={21} strokeWidth={1.7} /> },
];

/** Root of every D1 screen: tokens, base type and one of the three backgrounds of the design. */
export function D1Root({ bg = "app", className = "", children }: { bg?: "app" | "auth" | "table"; className?: string; children: ReactNode }) {
  return <div className={`d1 bg-${bg} ${className}`}>{children}</div>;
}

export type Me = { name: string; notifications?: number };

function DesktopNav({ active, me }: { active?: NavKey; me?: Me }) {
  return (
    <header className="nav">
      <Link href="/" aria-label="Poker Friends: trang đầu">
        <Wordmark />
      </Link>
      <nav className="nav-links" aria-label="Chính">
        {NAV_ITEMS.map((it) => (
          <Link key={it.key} href={it.href} className={`nav-link${active === it.key ? " is-active" : ""}`} aria-current={active === it.key ? "page" : undefined}>
            {it.label}
          </Link>
        ))}
      </nav>
      {me && (
        <span className="nav-right">
          <Bell_ count={me.notifications} />
          <span className="nav-me">
            <Avatar name={me.name} size={32} />
            <span>{me.name}</span>
            <ChevronDown size={14} aria-hidden />
          </span>
        </span>
      )}
    </header>
  );
}

function Bell_({ count, size = 18 }: { count?: number; size?: number }) {
  return (
    <span className="iconbtn" role="img" aria-label={count ? `Thông báo (${count} mới)` : "Thông báo"}>
      <Bell size={size} strokeWidth={1.8} aria-hidden />
      {!!count && (
        <i className="iconbtn-badge" aria-hidden>
          {count}
        </i>
      )}
    </span>
  );
}

function PhoneRail({ active, me }: { active?: NavKey; me?: Me }) {
  return (
    <nav className="navrail" aria-label="Chính">
      <Link href="/" aria-label="Poker Friends: trang đầu">
        <Crest size={36} />
      </Link>
      <span className="navrail-tabs">
        {NAV_ITEMS.map((it) => (
          <Link key={it.key} href={it.href} className={`navrail-tab${active === it.key ? " is-active" : ""}`} aria-current={active === it.key ? "page" : undefined}>
            {it.icon}
            <span>{it.label}</span>
          </Link>
        ))}
      </span>
      {me && (
        <>
          <Bell_ count={me.notifications} size={19} />
          <Avatar name={me.name} size={34} />
        </>
      )}
    </nav>
  );
}

/** Phone bar of a page under a tab (create room, invite, replay …): back, title, actions. */
function PhoneAppBar({ title, sub, back, right }: { title: ReactNode; sub?: ReactNode; back?: string; right?: ReactNode }) {
  return (
    <header className="appbar">
      {back && (
        <Link href={back} className="iconbtn" aria-label="Quay lại">
          <ChevronLeft size={22} aria-hidden />
        </Link>
      )}
      <span className="appbar-title">
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </span>
      {right && <span className="appbar-right">{right}</span>}
    </header>
  );
}

/** The app frame. `sub` makes it a page under a tab: on the phone the rail gives way to a bar
 *  with `sub.title` and a back link (the desktop keeps its top bar). */
export function AppShell({
  active,
  me,
  sub,
  bg = "app",
  children,
}: {
  active?: NavKey;
  me?: Me;
  sub?: { title: ReactNode; sub?: ReactNode; back?: string; right?: ReactNode };
  bg?: "app" | "auth" | "table";
  children: ReactNode;
}) {
  return (
    <D1Root bg={bg} className={sub ? "shell-sub" : "shell-tab"}>
      <DesktopNav active={active} me={me} />
      {sub ? <PhoneAppBar {...sub} /> : <PhoneRail active={active} me={me} />}
      <main className="page">{children}</main>
    </D1Root>
  );
}

/** Eyebrow, page title and subtitle, with actions at the right. */
export function PageHead({ eyebrow, title, sub, actions }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <span>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </span>
      {actions && <span className="nav-right">{actions}</span>}
    </div>
  );
}
