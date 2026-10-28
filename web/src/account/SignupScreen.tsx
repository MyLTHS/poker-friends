"use client";

// Signup (design: screens-account.tsx Signup): one form. A new account is logged in at once (no
// email to open, no one to approve), so it goes straight on: to `next` (an invite link) or the
// lobby.
import Link from "next/link";
import { useState } from "react";
import { Check, Circle, Mail, UserRound } from "lucide-react";

import { Button } from "@/ui";

import type { AuthApi } from "./api";
import { AuthFrame, Field, GoogleButton, NoticeAlert, Or, PasswordField, StrengthBar, USERNAME_PATTERN, USERNAME_RULE } from "./frame";
import { MEMBERS_HINT } from "./LoginScreen";
import { loginPath, takeRememberedNext } from "./members";
import { passwordRules } from "./password";
import { formValues, useSubmit } from "./ui";

/** `ready`: the auth config has loaded, so the csrftoken cookie the POST needs is set.
 *  `membersOnly` (server GUESTS_ALLOWED off): a line says an account is all it takes. */
export function SignupScreen({
  api,
  googleEnabled,
  ready,
  membersOnly = false,
  next = null,
}: {
  api: AuthApi;
  googleEnabled: boolean;
  ready: boolean;
  membersOnly?: boolean;
  /** where the visitor was going (an invite link, already checked by safeNext) */
  next?: string | null;
}) {
  const login = loginPath(next);
  // Signed up = logged in: a full load of where they were going (the remembered one is taken, and
  // so cleared, either way).
  const goOn = () => {
    const remembered = takeRememberedNext();
    window.location.assign(next ?? remembered ?? "/rooms");
  };
  return (
    <AuthFrame
      hero={{
        headline: (
          <>
            Một ghế đã
            <br />
            chờ sẵn bạn.
          </>
        ),
        sub: "Tài khoản giữ chip và lịch sử của bạn ở mọi bàn, trên mọi máy.",
      }}
      phone={{
        kind: "bar",
        title: "Tạo tài khoản",
        sub: "Vào hội để giữ chip, lịch sử và mở bàn riêng.",
        back: login,
        right: (
          <span className="appbar-note">
            Đã có tài khoản?{" "}
            <Link href={login} className="link">
              Đăng nhập
            </Link>
          </span>
        ),
      }}
    >
      <div className="auth-card">
        <h2 className="auth-title">Tạo tài khoản</h2>
        <p className="auth-sub">Chỉ mất một phút, xong là vào chơi.</p>
        <SignupForm api={api} ready={ready} onSignedUp={goOn} />
        {googleEnabled && (
          <div className="form-stack">
            <Or />
            <GoogleButton process="login">Đăng ký bằng Google</GoogleButton>
          </div>
        )}
        <p className="form-foot">
          Đã có tài khoản?{" "}
          <Link href={login} className="link">
            Đăng nhập
          </Link>
        </p>
      </div>
      {membersOnly && <p className="auth-legal">{MEMBERS_HINT}</p>}
    </AuthFrame>
  );
}

function SignupForm({ api, ready, onSignedUp }: { api: AuthApi; ready: boolean; onSignedUp: () => void }) {
  const submit = useSubmit();
  const [password, setPassword] = useState("");
  // the server compares the password with these two
  const [account, setAccount] = useState({ email: "", username: "" });
  const rules = passwordRules(password, account);
  return (
    <form
      {...submit.form}
      className="form-stack"
      onSubmit={async (event) => {
        const values = formValues(event);
        const result = await submit.run(() => api.signup({ email: values.email, username: values.username, password: values.password }));
        if (result.ok) onSignedUp();
      }}
    >
      <NoticeAlert notice={submit.notice} />
      <fieldset>
        <div className="form-pair">
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            icon={<Mail size={17} strokeWidth={1.8} />}
            onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))}
            error={submit.fieldError("email")}
          />
          <Field
            label="Tên ở bàn"
            name="username"
            autoComplete="nickname"
            required
            minLength={2}
            maxLength={30}
            pattern={USERNAME_PATTERN}
            title={USERNAME_RULE}
            icon={<UserRound size={17} strokeWidth={1.8} />}
            onChange={(e) => setAccount((a) => ({ ...a, username: e.target.value }))}
            hint="Bạn bè thấy tên này · 2–30 ký tự, không dấu cách"
            error={submit.fieldError("username")}
          />
        </div>
        <div className="field-group">
          <PasswordField
            label="Mật khẩu"
            name="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={submit.fieldError("password")}
          />
          {password && <StrengthBar password={password} account={account} />}
          <ul className="pw-rules">
            {rules.map((rule) => (
              <li key={rule.text} className={rule.ok ? "is-ok" : ""}>
                {rule.ok ? <Check size={13} strokeWidth={3} aria-hidden /> : <Circle size={11} strokeWidth={2.4} aria-hidden />}
                {rule.text}
                <span className="sr-only">{rule.ok ? " (đạt)" : rule.optional ? " (nên có)" : " (chưa đạt)"}</span>
              </li>
            ))}
          </ul>
        </div>
        <Button type="submit" kind="primary" size="lg" block busy={submit.busy || !ready}>
          Tạo tài khoản
        </Button>
      </fieldset>
    </form>
  );
}
