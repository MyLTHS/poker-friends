"use client";

// Guest upgrade (design: screens-account.tsx Upgrade): what the guest has now, the member card it
// becomes, and the form (Google or email + password).
import { useState } from "react";
import { ArrowDown, BadgeCheck, Mail, ShieldCheck, UserRound } from "lucide-react";

import { Badge, Button, ChipStack, Skeleton, Strength, TextField, fmt } from "@/ui";

import type { AuthApi, Me } from "./api";
import { AuthFrame, GoogleButton, NoticeAlert, Or, PasswordField, StepLabel } from "./frame";
import { LogoutButton } from "./LogoutButton";
import type { Notice } from "./messages";
import type { MyRooms } from "./myRooms";
import { passwordLevel } from "./password";
import { formValues, useSubmit } from "./ui";

type Done = (me: Me | null, text?: string) => void;

export function UpgradeScreen({
  api,
  me,
  googleEnabled,
  rooms,
  notice,
  onDone,
}: {
  api: AuthApi;
  me: Me;
  googleEnabled: boolean;
  /** undefined while loading, null when it could not be loaded */
  rooms: MyRooms | null | undefined;
  notice: Notice | null;
  onDone: Done;
}) {
  const [email, setEmail] = useState("");
  const roomCount = rooms?.rooms.length ?? 0;
  return (
    <AuthFrame
      hero={{
        headline: (
          <>
            Giữ chỗ của bạn
            <br />
            ở bàn quen.
          </>
        ),
        sub: "Bạn đang chơi bằng khách. Nâng cấp để chip và lịch sử đi theo bạn sang mọi máy.",
      }}
      phone={{ kind: "bar", title: "Nâng cấp tài khoản", sub: "Bạn đang chơi bằng khách", back: "/" }}
      layout="split"
    >
      <div className="auth-col is-narrow upgrade-visual">
        <StepLabel>Bạn đang có</StepLabel>
        <GuestPass name={me.username} rooms={rooms} />
        <span className="upgrade-arrow only-desktop" aria-hidden>
          <ArrowDown size={18} strokeWidth={2} />
        </span>
        <div className="member-card only-desktop">
          <span className="member-crest" aria-hidden>
            <BadgeCheck size={20} strokeWidth={1.8} />
          </span>
          <span>
            <small>Thành viên</small>
            <b className={email ? "" : "is-placeholder"}>{email || "email của bạn"}</b>
          </span>
          {rooms && (
            <span className="member-chips">
              <b>{fmt(rooms.chips)}</b>
              <small>chip · {roomCount} phòng</small>
            </span>
          )}
        </div>
        <KeepRibbon rooms={roomCount} />
        <p className="m-note only-phone">Khách chỉ lưu trên trình duyệt này — xoá dữ liệu trình duyệt là mất chỗ.</p>
      </div>
      <div className="auth-col">
        <StepLabel>Nâng cấp</StepLabel>
        <div className="auth-card is-plain">
          <h2 className="auth-title">Trở thành thành viên</h2>
          <p className="auth-sub">Chọn một cách đăng nhập cho lần sau.</p>
          <UpgradeForm api={api} googleEnabled={googleEnabled} notice={notice} onEmail={setEmail} onDone={onDone} />
        </div>
        <p className="auth-legal only-desktop">Khách chỉ lưu trên trình duyệt này — xoá dữ liệu trình duyệt là mất chỗ.</p>
        <div className="auth-legal">
          <LogoutButton api={api} onDone={onDone} guest kind="quiet" size="sm">
            Rời tài khoản khách
          </LogoutButton>
        </div>
      </div>
    </AuthFrame>
  );
}

function GuestPass({ name, rooms }: { name: string; rooms: MyRooms | null | undefined }) {
  return (
    <div className="guest-pass">
      <div className="gp-head">
        <span>
          <small>Thẻ khách</small>
          <b>{name}</b>
        </span>
        <Badge kind="muted">Chỉ trên máy này</Badge>
      </div>
      <ul className="gp-rooms" aria-label="Chip của bạn ở các phòng">
        {rooms === undefined ? (
          <li>
            <Skeleton style={{ width: "100%", height: 18 }} />
          </li>
        ) : !rooms || rooms.rooms.length === 0 ? (
          <li className="is-empty">{rooms ? "Chưa có chip ở phòng nào" : "Chưa tải được danh sách phòng"}</li>
        ) : (
          rooms.rooms.map((r) => (
            <li key={r.roomId}>
              <span>{r.name}</span>
              <b>
                <ChipStack amount={r.balance} size={14} max={3} />
                {fmt(r.balance)}
              </b>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function KeepRibbon({ rooms }: { rooms: number }) {
  return (
    <div className="keep-ribbon">
      <ShieldCheck size={18} strokeWidth={2} aria-hidden />
      <span>
        <b>Giữ nguyên chip và lịch sử</b>
        <small>
          {rooms > 1 ? `Cả ${rooms} phòng` : rooms === 1 ? "Phòng của bạn" : "Mọi phòng"} chuyển sang tài khoản mới, không mất ván
          nào.
        </small>
      </span>
    </div>
  );
}

function UpgradeForm({
  api,
  googleEnabled,
  notice,
  onEmail,
  onDone,
}: {
  api: AuthApi;
  googleEnabled: boolean;
  notice: Notice | null;
  onEmail: (email: string) => void;
  onDone: Done;
}) {
  const submit = useSubmit();
  const [password, setPassword] = useState("");
  return (
    <div className="form-stack">
      <NoticeAlert notice={submit.notice ?? notice} />
      {googleEnabled && (
        <>
          <GoogleButton process="connect">Nâng cấp bằng Google</GoogleButton>
          <Or label="hoặc bằng email" />
        </>
      )}
      <form
        className="form-stack"
        onSubmit={async (event) => {
          const values = formValues(event);
          const result = await submit.run(() =>
            api.upgrade({ email: values.email, password: values.password, ...(values.username ? { username: values.username } : {}) }),
          );
          if (result.ok) onDone(result.data, `Đã nâng cấp. Mở email ${result.data.email} và bấm link để xác minh.`);
        }}
      >
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          icon={<Mail size={17} strokeWidth={1.8} />}
          onChange={(e) => onEmail(e.target.value)}
          error={submit.fields.email?.join(" ")}
        />
        <div className="field-group">
          <PasswordField
            label="Mật khẩu"
            name="password"
            autoComplete="new-password"
            placeholder="Ít nhất 8 ký tự"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={submit.fields.password?.join(" ")}
          />
          {password && <Strength level={passwordLevel(password)} />}
        </div>
        <TextField
          label="Đổi tên ở bàn"
          labelNote="không bắt buộc"
          name="username"
          autoComplete="nickname"
          icon={<UserRound size={17} strokeWidth={1.8} />}
          error={submit.fields.username?.join(" ")}
        />
        <Button type="submit" kind="primary" size="lg" block busy={submit.busy}>
          Nâng cấp &amp; giữ chip
        </Button>
      </form>
    </div>
  );
}
