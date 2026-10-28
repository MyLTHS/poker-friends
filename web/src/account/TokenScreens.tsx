"use client";

// The two pages opened from an email link: /account/verify?token=… and /account/reset?uid=…&token=….
// Once read, the token leaves the address bar and the history (a screenshot, a shared tab or the
// back button would show it); a reload then needs the link again.
import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, MailWarning } from "lucide-react";

import { ButtonLink, LoadingLine } from "@/ui";

import { createAuthApi } from "./api";
import { ResetScreen as D1ResetScreen } from "./ForgotScreens";
import { AuthFrame } from "./frame";
import { errorText } from "./messages";

type Outcome = { ok: true; email: string } | { ok: false; text: string };

/** /account/verify?token=… — the link in the verification email. */
export function VerifyScreen({ token }: { token: string }) {
  const api = useMemo(() => createAuthApi(), []);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // One POST per link: when React runs the effect twice (StrictMode in development) the second
  // run waits for the first answer instead of sending the token again.
  const sent = useRef<{ token: string; result: ReturnType<typeof api.verifyEmail> } | null>(null);

  useEffect(() => {
    window.history.replaceState(null, "", "/account/verify");
    let cancelled = false;
    if (sent.current?.token !== token) {
      const result = api.config().then(() => api.verifyEmail({ token })); // config sets the csrftoken cookie
      sent.current = { token, result };
    }
    const request = sent.current.result;
    (async () => {
      const result = await request;
      if (cancelled) return;
      setOutcome(result.ok ? { ok: true, email: result.data.email ?? "" } : { ok: false, text: errorText(result.error, result.retryAfter) });
    })();
    return () => {
      cancelled = true;
    };
  }, [api, token]);

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
      phone={{ kind: "bar", title: "Xác minh email", back: "/account" }}
    >
      <div className="auth-card" aria-live="polite">
        {!outcome ? (
          <div className="verify">
            <LoadingLine>Đang xác minh…</LoadingLine>
          </div>
        ) : outcome.ok ? (
          <div className="verify">
            <span className="verify-icon">
              <BadgeCheck size={30} strokeWidth={1.6} aria-hidden />
            </span>
            <h3>Email đã xác minh</h3>
            <p>
              Đã xác minh <b>{outcome.email}</b>. Giờ đăng nhập được rồi.
            </p>
            <div className="verify-actions">
              <ButtonLink href="/account" kind="primary" size="lg" block>
                Đăng nhập
              </ButtonLink>
            </div>
          </div>
        ) : (
          <div className="verify">
            <span className="verify-icon is-error">
              <MailWarning size={30} strokeWidth={1.6} aria-hidden />
            </span>
            <h3>Link không dùng được</h3>
            <p>{outcome.text}</p>
            <div className="verify-actions">
              <ButtonLink href="/account" kind="ghost" size="lg" block>
                Về trang đăng nhập
              </ButtonLink>
            </div>
          </div>
        )}
      </div>
    </AuthFrame>
  );
}

/** /account/reset?uid=…&token=… — the link in the password-reset email. */
export function ResetScreen({ uid, token }: { uid: string; token: string }) {
  const api = useMemo(() => createAuthApi(), []);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    window.history.replaceState(null, "", "/account/reset");
    let cancelled = false;
    void api.config().then(() => {
      if (!cancelled) setReady(true); // the csrftoken cookie the POST needs is set
    });
    return () => {
      cancelled = true;
    };
  }, [api]);
  return <D1ResetScreen api={api} uid={uid} token={token} ready={ready} />;
}
