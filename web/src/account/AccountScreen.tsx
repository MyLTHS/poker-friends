"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { createAuthApi, type AuthConfig, type Me } from "./api";
import { errorText, type Notice } from "./messages";
import { Card, Field, formValues, GoogleButton, NoticeBox, Shell, Submit, useSubmit } from "./ui";

type Tab = "login" | "signup" | "forgot";

export function AccountScreen({ initialNotice }: { initialNotice: Notice | null }) {
  const api = useMemo(() => createAuthApi(), []);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(initialNotice);

  useEffect(() => {
    // The Google result lives in ?google= / ?error=; drop it so a reload does not repeat it.
    if (initialNotice) window.history.replaceState(null, "", "/account");
    let cancelled = false;
    (async () => {
      // config first: it sets the csrftoken cookie every POST needs.
      const configResult = await api.config();
      const meResult = await api.me();
      if (cancelled) return;
      if (configResult.ok) setConfig(configResult.data);
      else setNotice({ kind: "error", text: errorText(configResult.error) });
      setMe(meResult.ok ? meResult.data : null);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [api, initialNotice]);

  const done = (user: Me | null, text?: string) => {
    setMe(user);
    setNotice(text ? { kind: "ok", text } : null);
  };

  return (
    <Shell title={!me ? "Vào câu lạc bộ" : me.is_guest ? "Bạn đang là khách" : `Chào ${me.username}`}>
      <NoticeBox notice={notice} />
      {!loaded ? (
        <p className="text-sm text-[var(--muted)]">Đang tải…</p>
      ) : !me ? (
        <LoggedOut api={api} googleEnabled={config?.google_enabled ?? false} onDone={done} />
      ) : me.is_guest ? (
        <GuestPanel api={api} me={me} googleEnabled={config?.google_enabled ?? false} onDone={done} />
      ) : (
        <MemberPanel api={api} me={me} onDone={done} />
      )}
    </Shell>
  );
}

type Api = ReturnType<typeof createAuthApi>;
type Done = (user: Me | null, text?: string) => void;

function LoggedOut({ api, googleEnabled, onDone }: { api: Api; googleEnabled: boolean; onDone: Done }) {
  const [tab, setTab] = useState<Tab>("login");
  const guest = useSubmit();
  const tabs: [Tab, string][] = [
    ["login", "Đăng nhập"],
    ["signup", "Đăng ký"],
    ["forgot", "Quên mật khẩu"],
  ];

  return (
    <>
      <Card>
        <div role="tablist" className="mb-5 grid grid-cols-3 gap-2">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={`btn whitespace-nowrap px-2! text-xs ${tab === id ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "login" && <LoginForm api={api} onDone={onDone} />}
        {tab === "signup" && <SignupForm api={api} />}
        {tab === "forgot" && <ForgotForm api={api} />}
      </Card>
      {googleEnabled && <GoogleButton process="login">Đăng nhập bằng Google</GoogleButton>}
      <Card>
        <p className="text-sm text-[var(--muted)]">
          Chưa muốn tạo tài khoản? Vào chơi ngay bằng tài khoản khách, lúc nào cũng nâng cấp được mà vẫn giữ chip.
        </p>
        <div className="mt-4 grid gap-2">
          <NoticeBox notice={guest.notice} />
          <button
            className="btn btn-secondary w-full text-sm"
            disabled={guest.busy}
            onClick={async () => {
              const result = await guest.run(() => api.createGuest());
              if (result.ok) onDone(result.data, "Đã tạo tài khoản khách.");
            }}
          >
            Chơi ngay bằng tài khoản khách
          </button>
        </div>
      </Card>
    </>
  );
}

function LoginForm({ api, onDone }: { api: Api; onDone: Done }) {
  const submit = useSubmit();
  const [email, setEmail] = useState("");
  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        const values = formValues(event);
        setEmail(values.email);
        const result = await submit.run(() => api.login({ email: values.email, password: values.password }));
        if (result.ok) onDone(result.data, "Đã đăng nhập.");
      }}
    >
      <NoticeBox notice={submit.notice} />
      {submit.error?.code === "email_not_verified" && <ResendLink api={api} email={email} />}
      <Field label="Email" name="email" type="email" autoComplete="email" errors={submit.fields.email} />
      <Field label="Mật khẩu" name="password" type="password" autoComplete="current-password" />
      <Submit busy={submit.busy}>Đăng nhập</Submit>
    </form>
  );
}

function ResendLink({ api, email }: { api: Api; email: string }) {
  const submit = useSubmit();
  const [sent, setSent] = useState(false);
  if (sent) return <NoticeBox notice={{ kind: "ok", text: `Đã gửi lại link tới ${email}.` }} />;
  return (
    <>
      <NoticeBox notice={submit.notice} />
      <button
        type="button"
        className="btn btn-secondary text-xs"
        disabled={submit.busy}
        onClick={async () => {
          const result = await submit.run(() => api.resendVerification({ email }));
          if (result.ok) setSent(true);
        }}
      >
        Gửi lại link xác minh
      </button>
    </>
  );
}

function SignupForm({ api }: { api: Api }) {
  const submit = useSubmit();
  const [sentTo, setSentTo] = useState<string | null>(null);
  if (sentTo) {
    return (
      <NoticeBox
        notice={{ kind: "ok", text: `Đã tạo tài khoản. Mở email ${sentTo} và bấm link xác minh rồi đăng nhập.` }}
      />
    );
  }
  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        const values = formValues(event);
        const result = await submit.run(() =>
          api.signup({ email: values.email, username: values.username, password: values.password }),
        );
        if (result.ok) setSentTo(result.data.email);
      }}
    >
      <NoticeBox notice={submit.notice} />
      <Field label="Email" name="email" type="email" autoComplete="email" errors={submit.fields.email} />
      <Field
        label="Tên ở bàn chơi"
        name="username"
        autoComplete="nickname"
        hint="2–30 ký tự, không có dấu cách."
        errors={submit.fields.username}
      />
      <Field
        label="Mật khẩu"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="Ít nhất 8 ký tự, không toàn số."
        errors={submit.fields.password}
      />
      <Submit busy={submit.busy}>Đăng ký</Submit>
    </form>
  );
}

function ForgotForm({ api }: { api: Api }) {
  const submit = useSubmit();
  const [sent, setSent] = useState(false);
  if (sent) {
    return (
      <NoticeBox
        notice={{ kind: "ok", text: "Nếu email này có tài khoản, link đặt lại mật khẩu đang trên đường tới (dùng trong 1 giờ)." }}
      />
    );
  }
  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        const values = formValues(event);
        const result = await submit.run(() => api.forgotPassword({ email: values.email }));
        if (result.ok) setSent(true);
      }}
    >
      <NoticeBox notice={submit.notice} />
      <Field label="Email đã đăng ký" name="email" type="email" autoComplete="email" errors={submit.fields.email} />
      <Submit busy={submit.busy}>Gửi link đặt lại</Submit>
    </form>
  );
}

function GuestPanel({ api, me, googleEnabled, onDone }: { api: Api; me: Me; googleEnabled: boolean; onDone: Done }) {
  const submit = useSubmit();
  return (
    <>
      <Card>
        <p className="text-sm">
          Bạn đang chơi với tên <span className="pill pill-gold">{me.username}</span>
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Nâng cấp để đăng nhập lại được trên máy khác. Vẫn là bạn: chip ở mọi phòng và lịch sử ván giữ nguyên.
        </p>
      </Card>
      <Card>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            const values = formValues(event);
            const result = await submit.run(() =>
              api.upgrade({
                email: values.email,
                password: values.password,
                ...(values.username ? { username: values.username } : {}),
              }),
            );
            if (result.ok) {
              onDone(result.data, `Đã nâng cấp. Mở email ${result.data.email} và bấm link để xác minh.`);
            }
          }}
        >
          <h2 className="font-[family-name:var(--font-display)] text-xl">Nâng cấp bằng email</h2>
          <NoticeBox notice={submit.notice} />
          <Field label="Email" name="email" type="email" autoComplete="email" errors={submit.fields.email} />
          <Field
            label="Mật khẩu"
            name="password"
            type="password"
            autoComplete="new-password"
            hint="Ít nhất 8 ký tự, không toàn số."
            errors={submit.fields.password}
          />
          <Field
            label="Đổi tên (không bắt buộc)"
            name="username"
            autoComplete="nickname"
            required={false}
            errors={submit.fields.username}
          />
          <Submit busy={submit.busy}>Nâng cấp tài khoản</Submit>
        </form>
      </Card>
      {googleEnabled && <GoogleButton process="connect">Nâng cấp bằng Google</GoogleButton>}
      <LogoutButton api={api} onDone={onDone} warning="Khách đăng xuất là mất tài khoản này và chip của nó. Chắc chưa?" />
    </>
  );
}

function MemberPanel({ api, me, onDone }: { api: Api; me: Me; onDone: Done }) {
  return (
    <>
      <Card>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-[var(--muted)]">Tên</dt>
          <dd className="font-bold">{me.username}</dd>
          <dt className="text-[var(--muted)]">Email</dt>
          <dd>
            {me.email}{" "}
            <span className={`pill ${me.email_verified ? "pill-green" : "pill-red"}`}>
              {me.email_verified ? "ĐÃ XÁC MINH" : "CHƯA XÁC MINH"}
            </span>
          </dd>
          <dt className="text-[var(--muted)]">Đăng nhập</dt>
          <dd>
            {[me.has_password && "mật khẩu", me.google_connected && "Google"].filter(Boolean).join(" · ")}
          </dd>
        </dl>
        {!me.email_verified && me.email && (
          <div className="mt-4 grid gap-2">
            <ResendLink api={api} email={me.email} />
          </div>
        )}
      </Card>
      <Link href="/" className="btn btn-primary text-sm">
        Vào bàn chơi
      </Link>
      <LogoutButton api={api} onDone={onDone} />
    </>
  );
}

function LogoutButton({ api, onDone, warning }: { api: Api; onDone: Done; warning?: string }) {
  const submit = useSubmit();
  return (
    <>
      <NoticeBox notice={submit.notice} />
      <button
        className={`btn text-sm ${warning ? "btn-danger" : "btn-ghost"}`}
        disabled={submit.busy}
        onClick={async () => {
          if (warning && !window.confirm(warning)) return;
          const result = await submit.run(() => api.logout());
          if (result.ok) onDone(null, "Đã đăng xuất.");
        }}
      >
        Đăng xuất
      </button>
    </>
  );
}
