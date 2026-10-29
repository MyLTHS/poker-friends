"use client";

// "Bạn tên gì?": the one box a newcomer fills to play (server GUESTS_ALLOWED on). The name becomes
// a guest account (POST /api/auth/guest/); a name already used is said under the box. Shared by
// the login (above the email form) and the room pages' name gate (rooms/NameGate.tsx).
import { useRef } from "react";
import { UserRound } from "lucide-react";

import { Button } from "@/ui";

import type { AuthApi, Me } from "./api";
import { Field, NoticeAlert, USERNAME_PATTERN, USERNAME_RULE } from "./frame";
import { formValues, useSubmit } from "./ui";

export function GuestNameForm({
  api,
  onDone,
  onTry,
  quiet = false,
  autoFocus = false,
}: {
  api: AuthApi;
  onDone: (me: Me) => void;
  /** called on every try (the login hides its own error then) */
  onTry?: () => void;
  /** hide this form's last error (another form on the page was tried since) */
  quiet?: boolean;
  autoFocus?: boolean;
}) {
  const area = useRef<HTMLDivElement>(null);
  const submit = useSubmit({ scope: area });
  return (
    <div className="form-stack" ref={area}>
      <NoticeAlert notice={quiet ? null : submit.notice} />
      <form
        {...submit.form}
        className="form-stack"
        onSubmit={async (event) => {
          const values = formValues(event);
          onTry?.();
          const result = await submit.run(() => api.createGuest({ username: values.username.trim() }));
          if (result.ok) onDone(result.data);
        }}
      >
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
          hint="Bạn bè thấy tên này · 2–30 ký tự, không dấu cách"
          error={submit.fieldError("username")}
          autoFocus={autoFocus}
        />
        <Button type="submit" kind="primary" size="lg" block busy={submit.busy}>
          Vào chơi
        </Button>
      </form>
    </div>
  );
}
