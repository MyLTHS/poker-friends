"use client";

// Login (design: screens-account.tsx Login): email + password, Google, play as a guest. Members
// only (server GUESTS_ALLOWED off): no guest, and a line saying that an account is all it takes.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Lock, Mail, UserRound } from "lucide-react";

import { Button } from "@/ui";

import type { AuthApi, Me } from "./api";
import { AuthFrame, Field, GoogleButton, NoticeAlert, Or, PasswordField, mmss, useCooldown } from "./frame";
import { rememberNext, signupPath } from "./members";
import type { Notice } from "./messages";
import { formValues, useSubmit } from "./ui";

type Done = (me: Me | null, text?: string) => void;

/** The line members-only shows under the login, the signup and the invite. */
export const MEMBERS_HINT = "Chỉ thành viên: đăng ký tài khoản là vào chơi được.";

export function LoginScreen({
  api,
  googleEnabled,
  membersOnly = false,
  next = null,
  notice,
  onDone,
}: {
  api: AuthApi;
  googleEnabled: boolean;
  /** server GUESTS_ALLOWED off: no guest, members only */
  membersOnly?: boolean;
  /** where to go back after logging in (already checked by safeNext) */
  next?: string | null;
  notice: Notice | null;
  onDone: Done;
}) {
  useEffect(() => rememberNext(next), [next]);
  return (
    <AuthFrame
      hero={{
        headline: (
          <>
            Bàn nỉ xanh
            <br />
            cho hội bạn thân.
          </>
        ),
        sub: "Mở bàn, gửi link, chia bài. Chip ảo cho vui — không tiền thật, không nhà cái.",
      }}
      phone={{ kind: "hero", title: "Chào mừng trở lại", sub: "Bàn quen đang chờ bạn." }}
    >
      <div className="auth-card">
        <span className="eyebrow">Thành viên</span>
        <h2 className="auth-title">Chào mừng trở lại</h2>
        <p className="auth-sub">Đăng nhập để vào bàn của hội.</p>
        <LoginForm api={api} googleEnabled={googleEnabled} membersOnly={membersOnly} next={next} notice={notice} onDone={onDone} />
      </div>
      <p className="auth-legal">
        {membersOnly ? MEMBERS_HINT : "Khách vẫn chơi đủ mọi bàn; nâng cấp lên tài khoản sau vẫn giữ chip và lịch sử."}
      </p>
    </AuthFrame>
  );
}

function LoginForm({
  api,
  googleEnabled,
  membersOnly,
  next,
  notice,
  onDone,
}: {
  api: AuthApi;
  googleEnabled: boolean;
  membersOnly: boolean;
  next: string | null;
  notice: Notice | null;
  onDone: Done;
}) {
  const area = useRef<HTMLDivElement>(null);
  const login = useSubmit({ scope: area });
  const guest = useSubmit({ scope: area });
  // Only the last action speaks: a wrong password tried before must not hide why "play as a
  // guest" failed just now, and the page's notice (Google, logged out) goes once anything is tried.
  const [last, setLast] = useState<"login" | "guest" | null>(null);
  const shown = last === "login" ? login.notice : last === "guest" ? guest.notice : notice;
  return (
    <div className="form-stack" ref={area}>
      {membersOnly && (
        <p className="members-note">
          <Lock size={15} strokeWidth={2} aria-hidden />
          <span>{MEMBERS_HINT}</span>
        </p>
      )}
      <NoticeAlert notice={shown} />
      <form
        {...login.form}
        className="form-stack"
        onSubmit={async (event) => {
          const values = formValues(event);
          setLast("login");
          const result = await login.run(() => api.login({ email: values.email, password: values.password }));
          if (result.ok) onDone(result.data, "Đã đăng nhập.");
        }}
      >
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          icon={<Mail size={17} strokeWidth={1.8} />}
          error={login.fieldError("email")}
        />
        <PasswordField label="Mật khẩu" name="password" autoComplete="current-password" required error={login.fieldError("password")} />
        <div className="form-row-between">
          <span />
          <Link href="/account/forgot" className="link">
            Quên mật khẩu?
          </Link>
        </div>
        <Button type="submit" kind="primary" size="lg" block busy={login.busy}>
          Đăng nhập
        </Button>
      </form>
      {(googleEnabled || !membersOnly) && (
        <>
          <Or />
          <div className="auth-alts">
            {googleEnabled && <GoogleButton process="login">Tiếp tục với Google</GoogleButton>}
            {!membersOnly && (
              <Button
                kind="ghost"
                size="lg"
                block
                busy={guest.busy}
                icon={<UserRound size={18} strokeWidth={1.8} />}
                onClick={async () => {
                  setLast("guest");
                  const result = await guest.run(() => api.createGuest());
                  if (result.ok) onDone(result.data, "Đã tạo tài khoản khách.");
                }}
              >
                Chơi ngay bằng khách
              </Button>
            )}
          </div>
        </>
      )}
      <p className="form-foot">
        Chưa có tài khoản?{" "}
        <Link href={signupPath(next)} className="link">
          Đăng ký
        </Link>
      </p>
    </div>
  );
}

/** "Send the verification link again", with the design's countdown before the next try. */
export function ResendVerification({ api, email, block = false }: { api: AuthApi; email: string; block?: boolean }) {
  const submit = useSubmit();
  const wait = useCooldown(60);
  const [sent, setSent] = useState(false);
  return (
    <>
      {sent && <NoticeAlert notice={{ kind: "ok", text: `Đã gửi lại link xác minh tới ${email}.` }} />}
      <NoticeAlert notice={submit.notice} />
      <Button
        kind="quiet"
        size={block ? "lg" : "md"}
        block={block}
        busy={submit.busy}
        disabled={wait.left > 0 || !email}
        onClick={async () => {
          const result = await submit.run(() => api.resendVerification({ email }));
          if (result.ok) {
            setSent(true);
            wait.start();
          }
        }}
      >
        {wait.left > 0 ? `Gửi lại sau ${mmss(wait.left)}` : "Gửi lại link xác minh"}
      </Button>
    </>
  );
}
