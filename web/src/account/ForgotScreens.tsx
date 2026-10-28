"use client";

// Forgot / reset password (design: screens-account.tsx Forgot). The design draws both steps side by
// side; for real, step 2 only works from the email link, so /account/forgot shows step 2 as "what
// comes next" and /account/reset (the link) marks step 1 done.
import { useState } from "react";
import { ArrowRight, Check, KeyRound, Mail, MailCheck, ShieldCheck } from "lucide-react";

import { Alert, Button, ButtonLink, Strength, TextField } from "@/ui";

import type { AuthApi } from "./api";
import { AuthFrame, NoticeAlert, PasswordField, StepLabel, maskEmail } from "./frame";
import { passwordLevel } from "./password";
import { formValues, useSubmit } from "./ui";

const HERO = {
  headline: (
    <>
      Quên mật khẩu
      <br />
      không mất chỗ ngồi.
    </>
  ),
  sub: "Chip và lịch sử vẫn nằm yên ở bàn. Đặt lại mật khẩu là vào chơi tiếp.",
};
const PHONE = { kind: "bar" as const, title: "Lấy lại mật khẩu", sub: "Chip và lịch sử vẫn nằm yên ở bàn.", back: "/account" };

function FlowArrow() {
  return (
    <span className="flow-arrow" aria-hidden>
      <ArrowRight size={18} strokeWidth={2} />
      <small>link trong email</small>
    </span>
  );
}

export function ForgotScreen({ api }: { api: AuthApi }) {
  return (
    <AuthFrame hero={HERO} phone={PHONE} layout="forgot">
      <div className="auth-col">
        <StepLabel n={1}>Xin link đặt lại</StepLabel>
        <div className="auth-card">
          <ForgotRequest api={api} />
        </div>
      </div>
      <FlowArrow />
      <div className="auth-col">
        <StepLabel n={2}>Mở từ link</StepLabel>
        <div className="auth-card is-quiet">
          <ResetForm preview />
        </div>
      </div>
    </AuthFrame>
  );
}

function ForgotRequest({ api }: { api: AuthApi }) {
  const submit = useSubmit();
  const [sentTo, setSentTo] = useState<string | null>(null);
  return (
    <form
      {...submit.form}
      className="form-stack"
      onSubmit={async (event) => {
        const { email } = formValues(event);
        const result = await submit.run(() => api.forgotPassword({ email }));
        if (result.ok) setSentTo(email);
      }}
    >
      <div className="card-head">
        <span className="card-icon">
          <KeyRound size={20} strokeWidth={1.8} aria-hidden />
        </span>
        <span>
          <h3>Quên mật khẩu?</h3>
          <p>Nhập email, chúng tôi gửi link đặt lại.</p>
        </span>
      </div>
      <NoticeAlert notice={submit.notice} />
      <TextField label="Email" name="email" type="email" autoComplete="email" required icon={<Mail size={17} strokeWidth={1.8} />} error={submit.fieldError("email")} />
      <Button type="submit" kind="primary" size="lg" block busy={submit.busy}>
        {sentTo ? "Gửi lại link" : "Gửi link đặt lại"}
      </Button>
      {sentTo && (
        <Alert kind="ok" icon={<MailCheck size={17} strokeWidth={1.9} aria-hidden />} title={`Đã gửi tới ${maskEmail(sentTo)}`}>
          Nếu email này có tài khoản, link sẽ tới sau ít phút. Link hết hạn sau 1 giờ.
        </Alert>
      )}
    </form>
  );
}

/** /account/reset?uid=…&token=…: the link in the password-reset email. */
export function ResetScreen({ api, uid, token }: { api: AuthApi; uid: string; token: string }) {
  return (
    <AuthFrame hero={HERO} phone={PHONE} layout="forgot">
      <div className="auth-col only-desktop">
        <StepLabel n={1} done>
          Xin link đặt lại
        </StepLabel>
        <div className="auth-card is-quiet">
          <div className="card-head">
            <span className="card-icon">
              <Check size={20} strokeWidth={2.4} aria-hidden />
            </span>
            <span>
              <h3>Đã có link</h3>
              <p>Bạn đã mở link trong email. Còn một bước nữa.</p>
            </span>
          </div>
        </div>
      </div>
      <FlowArrow />
      <div className="auth-col">
        <StepLabel n={2}>Mở từ link</StepLabel>
        <div className="auth-card">
          <ResetForm api={api} uid={uid} token={token} />
        </div>
      </div>
    </AuthFrame>
  );
}

function ResetForm({ api, uid = "", token = "", preview = false }: { api?: AuthApi; uid?: string; token?: string; preview?: boolean }) {
  const submit = useSubmit();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [done, setDone] = useState(false);
  const matches = again.length > 0 && again === password;
  const mismatch = again.length > 0 && !password.startsWith(again) && again !== password;
  if (done) {
    return (
      <div className="form-stack">
        <Alert kind="ok" icon={<ShieldCheck size={17} strokeWidth={1.9} aria-hidden />} title="Đã đổi mật khẩu">
          Đăng nhập bằng mật khẩu mới nhé.
        </Alert>
        <ButtonLink href="/account" kind="primary" size="lg" block>
          Đăng nhập
        </ButtonLink>
      </div>
    );
  }
  return (
    <form
      {...submit.form}
      className="form-stack"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!api || password !== again) return;
        const result = await submit.run(() => api.resetPassword({ uid, token, password }));
        if (result.ok) setDone(true);
      }}
    >
      <div className="card-head">
        <span className="card-icon">
          <ShieldCheck size={20} strokeWidth={1.8} aria-hidden />
        </span>
        <span>
          <h3>Đặt mật khẩu mới</h3>
          <p>{preview ? "Mở link trong email để dùng bước này." : "Cho tài khoản của bạn."}</p>
        </span>
      </div>
      <NoticeAlert notice={submit.notice} />
      <fieldset disabled={preview}>
        <div className="field-group">
          <PasswordField
            label="Mật khẩu mới"
            name="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={submit.fieldError("password")}
          />
          {password && <Strength level={passwordLevel(password)} />}
        </div>
        <PasswordField
          label="Nhập lại"
          name="password_again"
          autoComplete="new-password"
          required
          value={again}
          onChange={(e) => setAgain(e.target.value)}
          ok={matches}
          hint={matches ? "Hai mật khẩu khớp nhau" : undefined}
          error={mismatch ? "Hai mật khẩu chưa khớp" : undefined}
        />
        <Button type="submit" kind="primary" size="lg" block busy={submit.busy} disabled={!matches}>
          Lưu mật khẩu mới
        </Button>
      </fieldset>
    </form>
  );
}
