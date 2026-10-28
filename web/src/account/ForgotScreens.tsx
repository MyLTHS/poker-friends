"use client";

// Forgot / reset password (design: screens-account.tsx Forgot). The design draws both steps side by
// side; for real, step 2 only works from the email link, so /account/forgot shows step 2 as "what
// comes next" and /account/reset (the link) marks step 1 done.
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, KeyRound, Mail, MailCheck, ShieldCheck } from "lucide-react";

import { Alert, Button, ButtonLink } from "@/ui";

import type { AuthApi } from "./api";
import { AuthFrame, Field, NoticeAlert, PasswordField, StepLabel, StrengthBar, maskEmail } from "./frame";
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
// The invitation link (an account staff made in the admin) opens the same form.
const INVITE_HERO = {
  headline: (
    <>
      Bạn được mời
      <br />
      vào bàn.
    </>
  ),
  sub: "Tài khoản đã có sẵn. Đặt mật khẩu là vào chơi được.",
};
const INVITE_PHONE = { kind: "bar" as const, title: "Lời mời vào bàn", sub: "Đặt mật khẩu là vào chơi được.", back: "/account" };

function FlowArrow() {
  return (
    <span className="flow-arrow" aria-hidden>
      <ArrowRight size={18} strokeWidth={2} />
      <small>link trong email</small>
    </span>
  );
}

/** `ready`: the auth config has loaded, so the csrftoken cookie the POST needs is set. */
export function ForgotScreen({ api, ready }: { api: AuthApi; ready: boolean }) {
  return (
    <AuthFrame hero={HERO} phone={PHONE} layout="forgot">
      <div className="auth-col">
        <StepLabel n={1}>Xin link đặt lại</StepLabel>
        <div className="auth-card">
          <ForgotRequest api={api} ready={ready} />
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

function ForgotRequest({ api, ready }: { api: AuthApi; ready: boolean }) {
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
      <Field label="Email" name="email" type="email" autoComplete="email" required icon={<Mail size={17} strokeWidth={1.8} />} error={submit.fieldError("email")} />
      <Button type="submit" kind="primary" size="lg" block busy={submit.busy || !ready}>
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

/** /account/reset?uid=…&token=…: the link in the password-reset email. `ready` as above. */
export function ResetScreen({ api, uid, token, ready, invite = false }: { api: AuthApi; uid: string; token: string; ready: boolean; invite?: boolean }) {
  return (
    <AuthFrame hero={invite ? INVITE_HERO : HERO} phone={invite ? INVITE_PHONE : PHONE} layout="forgot">
      <div className="auth-col only-desktop">
        <StepLabel n={1} done>
          {invite ? "Nhận thư mời" : "Xin link đặt lại"}
        </StepLabel>
        <div className="auth-card is-quiet">
          <div className="card-head">
            <span className="card-icon">
              <Check size={20} strokeWidth={2.4} aria-hidden />
            </span>
            <span>
              <h3>{invite ? "Đã có lời mời" : "Đã có link"}</h3>
              <p>{invite ? "Bạn đã mở link trong thư mời. Còn một bước nữa." : "Bạn đã mở link trong email. Còn một bước nữa."}</p>
            </span>
          </div>
        </div>
      </div>
      <FlowArrow />
      <div className="auth-col">
        <StepLabel n={2}>Mở từ link</StepLabel>
        <div className="auth-card">
          <ResetForm api={api} uid={uid} token={token} ready={ready} invite={invite} />
        </div>
      </div>
    </AuthFrame>
  );
}

const MISMATCH = "Hai mật khẩu chưa khớp";

function ResetForm({
  api,
  uid = "",
  token = "",
  ready = true,
  preview = false,
  invite = false,
}: {
  api?: AuthApi;
  uid?: string;
  token?: string;
  ready?: boolean;
  preview?: boolean;
  invite?: boolean;
}) {
  const submit = useSubmit();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [done, setDone] = useState(false);
  const matches = again.length > 0 && again === password;
  // said while typing only once "again" stops being the start of the password
  const mismatch = again.length > 0 && !password.startsWith(again) && again !== password;
  // "Lưu" stays pressable and says why it cannot save: the browser's own check refuses the form
  // and useSubmit puts this text under "Nhập lại" and moves the focus there.
  const againBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    againBox.current?.setCustomValidity(again && again !== password ? MISMATCH : "");
  }, [again, password]);
  if (done) {
    return (
      <div className="form-stack">
        <Alert kind="ok" icon={<ShieldCheck size={17} strokeWidth={1.9} aria-hidden />} title={invite ? "Tài khoản đã sẵn sàng" : "Đã đổi mật khẩu"}>
          {invite ? "Đăng nhập bằng email trong thư mời và mật khẩu vừa đặt." : "Đăng nhập bằng mật khẩu mới nhé."}
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
        if (!api || password !== again) return; // the browser's check already said why
        const result = await submit.run(() => api.resetPassword({ uid, token, password }));
        if (result.ok) setDone(true);
      }}
    >
      <div className="card-head">
        <span className="card-icon">
          <ShieldCheck size={20} strokeWidth={1.8} aria-hidden />
        </span>
        <span>
          <h3>{invite ? "Đặt mật khẩu để vào chơi" : "Đặt mật khẩu mới"}</h3>
          <p>{preview ? "Mở link trong email để dùng bước này." : invite ? "Cho tài khoản người mời đã tạo sẵn." : "Cho tài khoản của bạn."}</p>
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
          {password && <StrengthBar password={password} />}
        </div>
        <PasswordField
          label="Nhập lại"
          name="password_again"
          autoComplete="new-password"
          required
          value={again}
          onChange={(e) => setAgain(e.target.value)}
          ref={againBox}
          ok={matches}
          hint={matches ? "Hai mật khẩu khớp nhau" : undefined}
          error={submit.fieldError("password_again") ?? (mismatch ? MISMATCH : undefined)}
        />
        <Button type="submit" kind="primary" size="lg" block busy={submit.busy || !ready}>
          Lưu mật khẩu mới
        </Button>
      </fieldset>
    </form>
  );
}
