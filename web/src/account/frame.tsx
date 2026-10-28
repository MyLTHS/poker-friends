"use client";

// Pieces every D1 account screen shares (design: screens-account.tsx "shared auth pieces"):
// the frame (hero | form on desktop; hero | form or bar over columns on the landscape phone),
// step labels, the Google button, a password field with show/hide, and the form error.
import Link from "next/link";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { ChevronLeft, Eye, EyeOff, Lock } from "lucide-react";

import { Alert, ChipStack, D1Root, PlayingCard, TextField, Wordmark } from "@/ui";

import { csrfTokenFrom } from "./api";
import type { Notice } from "./messages";

type Bar = { kind: "bar"; title: ReactNode; sub?: ReactNode; back?: string; right?: ReactNode };
type PhoneHero = { kind: "hero"; title: ReactNode; sub?: ReactNode };

/** Root of an account screen. `hero` is the left column on desktop; on the landscape phone the
 *  login keeps a small hero (`phone.kind === "hero"`), the other pages get a bar instead. */
export function AuthFrame({
  hero,
  phone,
  layout = "single",
  children,
}: {
  hero: { headline: ReactNode; sub: ReactNode };
  phone: Bar | PhoneHero;
  layout?: "single" | "split" | "forgot";
  children: ReactNode;
}) {
  const main = `auth-main${layout !== "single" ? " is-split" : ""}${layout === "forgot" ? " is-forgot" : ""}`;
  useFocusedBoxInView();
  return (
    <D1Root bg="auth" className={`auth auth-phone-${phone.kind}`}>
      <AuthHero {...hero} />
      {phone.kind === "hero" ? <MobileHero title={phone.title} sub={phone.sub} /> : <AuthBar {...phone} />}
      <main className={main}>{children}</main>
    </D1Root>
  );
}

/**
 * The phone's keyboard takes half the landscape screen. When the visible area shrinks over the box
 * being typed in, bring the box back to the middle of what is left (under the sticky bar). Android
 * resizes the page itself (interactive-widget, app/account/layout.tsx); iOS only shrinks the
 * visual viewport, which is what this listens to.
 */
function useFocusedBoxInView() {
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return;
    const reveal = () => {
      const box = document.activeElement;
      if (!(box instanceof HTMLInputElement)) return;
      const bar = document.querySelector(".d1.auth .appbar")?.getBoundingClientRect().bottom ?? 0;
      const r = box.getBoundingClientRect();
      if (r.top < Math.max(view.offsetTop, bar) || r.bottom > view.offsetTop + view.height) box.scrollIntoView({ block: "center" });
    };
    view.addEventListener("resize", reveal);
    return () => view.removeEventListener("resize", reveal);
  }, []);
}

function AuthHero({ headline, sub }: { headline: ReactNode; sub: ReactNode }) {
  return (
    <aside className="auth-hero">
      <Link href="/" aria-label="Poker Friends: trang đầu">
        <Wordmark />
      </Link>
      <div className="hero-copy">
        <span className="eyebrow">Texas Hold&apos;em · chip ảo · giữa bạn bè</span>
        <h1 className="hero-title">{headline}</h1>
        <p className="hero-sub">{sub}</p>
      </div>
      <div className="hero-lamp" aria-hidden />
      <div className="hero-table" aria-hidden>
        <div className="hero-felt">
          <div className="felt-line" />
        </div>
        <div className="hero-cards">
          <PlayingCard card="??" w={92} rotate={-24} />
          <PlayingCard card="As" w={96} rotate={-10} />
          <PlayingCard card="Kh" w={96} rotate={7} />
        </div>
        <div className="hero-chips hc-1">
          <ChipStack amount={760} cols={3} size={34} max={5} />
        </div>
        <div className="hero-chips hc-2">
          <ChipStack amount={130} cols={2} size={30} max={4} />
        </div>
        <span className="hero-dealer">D</span>
      </div>
      <ul className="hero-facts">
        <li>
          <b>2–9</b> ghế mỗi bàn
        </li>
        <li>
          <b>0 đồng</b> tiền thật, không nhà cái
        </li>
        <li>
          <b>7-2</b> thưởng cho cú bluff
        </li>
      </ul>
    </aside>
  );
}

/** Landscape phone: the left part of the login, a corner of the felt under the brand. */
function MobileHero({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <aside className="m-hero">
      <div className="hero-lamp" aria-hidden />
      <div className="m-hero-felt" aria-hidden>
        <div className="felt-line" />
      </div>
      <div className="m-hero-content">
        <Link href="/" aria-label="Poker Friends: trang đầu">
          <Wordmark small />
        </Link>
        <span className="eyebrow">Texas Hold&apos;em · chip ảo · giữa bạn bè</span>
        <h1 className="m-hero-title">{title}</h1>
        {sub && <p className="m-hero-sub">{sub}</p>}
      </div>
      <div className="m-hero-cards" aria-hidden>
        <PlayingCard card="??" w={54} rotate={-26} />
        <PlayingCard card="As" w={56} rotate={-12} />
        <PlayingCard card="Kh" w={56} rotate={8} />
      </div>
      <div className="m-hero-chips" aria-hidden>
        <ChipStack amount={630} cols={3} size={24} max={4} />
      </div>
      <span className="hero-dealer" aria-hidden>
        D
      </span>
    </aside>
  );
}

/** The phone bar of a page under the login (the same look as AppShell's sub-page bar). Its title
 *  is the page's h1 on the phone, where the hero (the desktop h1) is hidden. */
function AuthBar({ title, sub, back, right }: Omit<Bar, "kind">) {
  return (
    <header className="appbar">
      {back && (
        <Link href={back} className="iconbtn" aria-label="Quay lại">
          <ChevronLeft size={22} aria-hidden />
        </Link>
      )}
      <div className="appbar-title">
        <h1>
          <b>{title}</b>
        </h1>
        {sub && <small>{sub}</small>}
      </div>
      {right && <span className="appbar-right">{right}</span>}
    </header>
  );
}

export function StepLabel({ n, done = false, onPhone = false, children }: { n?: number; done?: boolean; onPhone?: boolean; children: ReactNode }) {
  return (
    <span className={`step-label${done ? " is-done" : ""}${onPhone ? " on-phone" : ""}`}>
      {n !== undefined && <i>{n}</i>}
      {children}
    </span>
  );
}

export const Or = ({ label = "hoặc" }: { label?: string }) => (
  <div className="or" aria-hidden>
    <i />
    <span>{label}</span>
    <i />
  </div>
);

export function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * Google's flow is a browser redirect, not fetch: a real form POST to Django (through the proxy)
 * with the CSRF token. `connect` attaches Google to the logged-in guest (the upgrade).
 */
export function GoogleButton({ process, children }: { process: "login" | "connect"; children: ReactNode }) {
  return (
    <form
      method="post"
      action="/accounts/google/login/"
      onSubmit={(event) => {
        const input = event.currentTarget.elements.namedItem("csrfmiddlewaretoken") as HTMLInputElement;
        input.value = csrfTokenFrom(() => document.cookie);
      }}
    >
      <input type="hidden" name="process" value={process} />
      <input type="hidden" name="csrfmiddlewaretoken" value="" />
      <button type="submit" className="btn btn-light btn-lg btn-block">
        <GoogleG />
        <span>{children}</span>
      </button>
    </form>
  );
}

/** A password box with the eye button of the design (show / hide what was typed). */
export function PasswordField(props: Omit<ComponentProps<typeof TextField>, "type" | "icon" | "trailing">) {
  const [shown, setShown] = useState(false);
  return (
    <TextField
      {...props}
      type={shown ? "text" : "password"}
      icon={<Lock size={17} strokeWidth={1.8} />}
      trailing={
        <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={shown}>
          {shown ? <EyeOff size={17} strokeWidth={1.8} /> : <Eye size={17} strokeWidth={1.8} />}
        </button>
      }
    />
  );
}

/** A notice (Google result, "logged out", a server error) as the D1 alert. An error can take the
 *  focus (useSubmit moves it there when no box is to blame), so Tab goes on from it. */
export function NoticeAlert({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <div className="form-notice" tabIndex={-1} data-form-notice={notice.kind}>
      <Alert kind={notice.kind} title={notice.text} />
    </div>
  );
}

/** Seconds left before "send again" is allowed; `start()` begins a new wait. */
export function useCooldown(seconds: number) {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= now) return;
    const timer = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => window.clearTimeout(timer);
  }, [until, now]);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  return {
    left,
    start: () => {
      const t = Date.now();
      setNow(t);
      setUntil(t + seconds * 1000);
    },
  };
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** "l•••@example.com": enough to recognise one's own address on a shared screen. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  return `${email[0]}•••${email.slice(at)}`;
}
