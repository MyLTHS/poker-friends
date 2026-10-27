"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { createAuthApi } from "./api";
import { errorText, type Notice } from "./messages";
import { Card, Field, formValues, NoticeBox, Shell, Submit, useSubmit } from "./ui";

/** /account/verify?token=… — the link in the verification email. */
export function VerifyScreen({ token }: { token: string }) {
  const api = useMemo(() => createAuthApi(), []);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await api.config(); // sets the csrftoken cookie
      const result = await api.verifyEmail({ token });
      if (cancelled) return;
      setNotice(
        result.ok
          ? { kind: "ok", text: `Đã xác minh ${result.data.email}. Giờ đăng nhập được rồi.` }
          : { kind: "error", text: errorText(result.error, result.retryAfter) },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [api, token]);

  return (
    <Shell title="Xác minh email">
      {notice ? <NoticeBox notice={notice} /> : <p className="text-sm text-[var(--muted)]">Đang xác minh…</p>}
      <Link href="/account" className="btn btn-secondary text-sm">
        Về trang tài khoản
      </Link>
    </Shell>
  );
}

/** /account/reset?uid=…&token=… — the link in the password-reset email. */
export function ResetScreen({ uid, token }: { uid: string; token: string }) {
  const api = useMemo(() => createAuthApi(), []);
  const submit = useSubmit();
  const [done, setDone] = useState(false);

  useEffect(() => {
    void api.config();
  }, [api]);

  return (
    <Shell title="Đặt mật khẩu mới">
      {done ? (
        <NoticeBox notice={{ kind: "ok", text: "Đã đổi mật khẩu. Đăng nhập bằng mật khẩu mới nhé." }} />
      ) : (
        <Card>
          <form
            className="grid gap-4"
            onSubmit={async (event) => {
              const { password } = formValues(event);
              const result = await submit.run(() => api.resetPassword({ uid, token, password }));
              if (result.ok) setDone(true);
            }}
          >
            <NoticeBox notice={submit.notice} />
            <Field
              label="Mật khẩu mới"
              name="password"
              type="password"
              autoComplete="new-password"
              hint="Ít nhất 8 ký tự, không toàn số."
              errors={submit.fields.password}
            />
            <Submit busy={submit.busy}>Lưu mật khẩu</Submit>
          </form>
        </Card>
      )}
      <Link href="/account" className="btn btn-secondary text-sm">
        Về trang tài khoản
      </Link>
    </Shell>
  );
}
