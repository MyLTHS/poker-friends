"use client";

// Signup (design: screens-account.tsx Signup): step 1 the form, step 2 "open your email". Step 2 is
// shown faded beforehand so the player knows what comes next.
import Link from "next/link";
import { useState } from "react";
import { Check, Circle, Mail, MailCheck, UserRound } from "lucide-react";

import { Button, Strength, TextField } from "@/ui";

import type { AuthApi } from "./api";
import { AuthFrame, GoogleButton, NoticeAlert, Or, PasswordField, StepLabel } from "./frame";
import { ResendVerification } from "./LoginScreen";
import { passwordLevel, passwordRules } from "./password";
import { formValues, useSubmit } from "./ui";

export function SignupScreen({ api, googleEnabled }: { api: AuthApi; googleEnabled: boolean }) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
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
        back: "/account",
        right: (
          <span className="appbar-note">
            Đã có tài khoản?{" "}
            <Link href="/account" className="link">
              Đăng nhập
            </Link>
          </span>
        ),
      }}
      layout="split"
    >
      <div className="auth-col">
        <StepLabel n={1} done={sentTo !== null}>
          Điền thông tin
        </StepLabel>
        <div className="auth-card is-plain">
          <h2 className="auth-title">Tạo tài khoản</h2>
          <p className="auth-sub">Chỉ mất một phút.</p>
          <SignupForm key={formKey} api={api} sentTo={sentTo} onSent={setSentTo} />
          {googleEnabled && (
            <div className="form-stack only-desktop">
              <Or />
              <GoogleButton process="login">Đăng ký bằng Google</GoogleButton>
            </div>
          )}
          <p className="form-foot">
            Đã có tài khoản?{" "}
            <Link href="/account" className="link">
              Đăng nhập
            </Link>
          </p>
        </div>
      </div>
      <div className="auth-col is-narrow">
        <StepLabel n={2} onPhone>
          Sau khi bấm &quot;Tạo tài khoản&quot;
        </StepLabel>
        <div className="auth-card is-quiet" aria-live="polite">
          <VerifyNotice
            api={api}
            email={sentTo}
            onEdit={() => {
              setSentTo(null);
              setFormKey((k) => k + 1);
            }}
          />
        </div>
      </div>
    </AuthFrame>
  );
}

function SignupForm({ api, sentTo, onSent }: { api: AuthApi; sentTo: string | null; onSent: (email: string) => void }) {
  const submit = useSubmit();
  const [password, setPassword] = useState("");
  const rules = passwordRules(password);
  return (
    <form
      {...submit.form}
      className="form-stack"
      onSubmit={async (event) => {
        const values = formValues(event);
        const result = await submit.run(() => api.signup({ email: values.email, username: values.username, password: values.password }));
        if (result.ok) onSent(result.data.email ?? values.email);
      }}
    >
      <NoticeAlert notice={sentTo ? { kind: "ok", text: "Đã tạo tài khoản. Mở email để xác minh." } : submit.notice} />
      <fieldset disabled={sentTo !== null}>
        <div className="form-pair">
          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            icon={<Mail size={17} strokeWidth={1.8} />}
            error={submit.fieldError("email")}
          />
          <TextField
            label="Tên ở bàn"
            name="username"
            autoComplete="nickname"
            required
            minLength={2}
            maxLength={30}
            icon={<UserRound size={17} strokeWidth={1.8} />}
            hint="Bạn bè thấy tên này · 2–30 ký tự"
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
          {password && <Strength level={passwordLevel(password)} />}
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
        <Button type="submit" kind="primary" size="lg" block busy={submit.busy}>
          Tạo tài khoản
        </Button>
      </fieldset>
    </form>
  );
}

function VerifyNotice({ api, email, onEdit }: { api: AuthApi; email: string | null; onEdit: () => void }) {
  return (
    <div className={`verify${email ? "" : " is-pending"}`}>
      <span className="verify-icon">
        <MailCheck size={30} strokeWidth={1.6} aria-hidden />
      </span>
      <h3>Mở email để xác minh</h3>
      <p>
        {email ? (
          <>
            Đã gửi link tới <b>{email}</b>. Bấm link trong thư để kích hoạt tài khoản, rồi quay lại đây đăng nhập.
          </>
        ) : (
          "Chúng tôi gửi một link tới email bạn nhập. Bấm link để kích hoạt tài khoản, rồi đăng nhập."
        )}
      </p>
      <ul className="verify-tips">
        <li>Không thấy thư? Xem mục Spam hoặc Quảng cáo.</li>
        <li>Link có hiệu lực trong 3 ngày.</li>
      </ul>
      {email && (
        <div className="verify-actions">
          <ResendVerification api={api} email={email} block />
          <button type="button" className="link" onClick={onEdit}>
            Sửa email
          </button>
        </div>
      )}
    </div>
  );
}
