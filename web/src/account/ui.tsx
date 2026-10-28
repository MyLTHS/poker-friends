"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";

import { csrfTokenFrom, type ClientError, type Result } from "./api";
import { FIELD_OF_CODE, errorText, invalidText, type Notice } from "./messages";

export function Shell({
  title,
  section = "TÀI KHOẢN",
  wide = false,
  children,
}: {
  title: string;
  section?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="club-theme min-h-screen px-4 py-12">
      <div className={`mx-auto ${wide ? "max-w-3xl" : "max-w-md"}`}>
        <p className="text-xs tracking-[0.2em] text-[var(--muted)]">
          <Link href="/" className="hover:text-[var(--accent)]">
            POKER FRIENDS
          </Link>{" "}
          · {section}
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl">{title}</h1>
        <div className="mt-8 grid gap-4">{children}</div>
      </div>
    </main>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">{children}</section>;
}

export function NoticeBox({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  const tone =
    notice.kind === "ok"
      ? "border-[#6fdfa4]/40 bg-[#113d2d] text-[#6fdfa4]"
      : "border-[var(--danger)]/40 bg-[#461f25] text-[#ff8787]";
  return (
    <p role={notice.kind === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${tone}`}>
      {notice.text}
    </p>
  );
}

type FieldProps = {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
  errors?: string[];
};

export function Field({ label, name, type = "text", autoComplete, required = true, hint, errors }: FieldProps) {
  const id = `field-${name}`;
  return (
    <label htmlFor={id} className="grid gap-1.5 text-sm">
      <span className="font-bold">{label}</span>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        aria-invalid={errors?.length ? true : undefined}
        className="w-full rounded-xl border border-[var(--line)] bg-[var(--canvas)] px-4 py-3 text-[var(--ink)] placeholder:text-[var(--muted)]"
      />
      {hint && !errors?.length && <span className="text-xs text-[var(--muted)]">{hint}</span>}
      {errors?.map((error) => (
        <span key={error} className="text-xs text-[#ff8787]">
          {error}
        </span>
      ))}
    </label>
  );
}

/**
 * Submitting state and the last error of one form. Spread `form` on the <form> and give each box
 * `error={submit.fieldError(name)}`: the browser's own checks (required, type=email, length) are
 * then said in Vietnamese under the box instead of in its bubble, and so are the server's answers
 * about one box. After a failed try the first box in error takes the focus, or the error notice
 * (NoticeAlert) when no box is to blame: the one inside `scope` if given (an action without a
 * form, like "play as a guest"), else the one around the <form>.
 */
export function useSubmit({ scope }: { scope?: RefObject<HTMLElement | null> } = {}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ error: ClientError; retryAfter?: number } | null>(null);
  const [checks, setChecks] = useState<Record<string, string>>({});
  const [tries, setTries] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (tries === 0) return;
    const form = formRef.current;
    // The notice may sit just above the <form> (login, upgrade): look in its parent.
    const area = scope?.current ?? form?.parentElement;
    const target = form?.querySelector<HTMLElement>("[aria-invalid='true']") ?? area?.querySelector<HTMLElement>("[data-form-notice='error']");
    target?.focus();
  }, [tries, scope]);

  async function run<T>(action: () => Promise<Result<T>>): Promise<Result<T>> {
    setBusy(true);
    setFailure(null);
    setChecks({});
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setFailure({ error: result.error, retryAfter: result.retryAfter });
      setTries((n) => n + 1);
    }
    return result;
  }

  const error = failure?.error ?? null;
  const field = error ? FIELD_OF_CODE[error.code] : undefined;
  const fields: Record<string, string[]> = { ...error?.fields, ...(field && error ? { [field]: [errorText(error)] } : {}) };
  // When the answer is under a box, the notice only points there instead of saying it twice.
  const noticeText = failure && (field ? errorText({ code: "validation_error" }) : errorText(failure.error, failure.retryAfter));

  return {
    busy,
    error,
    notice: noticeText ? ({ kind: "error", text: noticeText } as Notice) : null,
    fields,
    fieldError: (name: string): string | undefined => checks[name] ?? fields[name]?.join(" "),
    form: {
      ref: formRef,
      // `invalid` does not bubble; React still sees it in the capture phase.
      onInvalidCapture: (event: FormEvent<HTMLFormElement>) => {
        const input = event.target as HTMLInputElement;
        event.preventDefault(); // no browser bubble: the text goes under the box
        setChecks((current) => ({ ...current, [input.name]: invalidText(input) }));
        setTries((n) => n + 1);
      },
      // Typing in a box clears what was said about that box only. Bubble phase, not capture: in
      // the capture phase this update renders before the box's own onChange, and a controlled
      // box (the passwords) would be put back to its old value, losing the keystroke.
      onInput: (event: FormEvent<HTMLFormElement>) => {
        const name = (event.target as HTMLInputElement).name;
        setChecks((current) => {
          if (!(name in current)) return current;
          const rest = { ...current };
          delete rest[name];
          return rest;
        });
      },
    },
    run,
  };
}

export function formValues(event: FormEvent<HTMLFormElement>): Record<string, string> {
  event.preventDefault();
  const values: Record<string, string> = {};
  new FormData(event.currentTarget).forEach((value, key) => {
    values[key] = String(value);
  });
  return values;
}

export function Submit({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button type="submit" className="btn btn-primary w-full text-sm" disabled={busy}>
      {busy ? "Đang gửi…" : children}
    </button>
  );
}

/**
 * Google's flow is a browser redirect, not fetch: a real form POST to Django (via the proxy),
 * carrying the CSRF token. `connect` attaches Google to the logged-in guest (the upgrade).
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
      <button type="submit" className="btn btn-secondary w-full text-sm">
        <GoogleMark />
        {children}
      </button>
    </form>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}
