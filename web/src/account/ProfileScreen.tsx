"use client";

// Profile (design: screens-account.tsx Profile): the member's card, rooms they have chips in, and
// how they sign in. What the API cannot do yet (rename, change password in place) is left out or
// done another way: "Đổi mật khẩu" sends the reset link to one's own email.
import Link from "next/link";
import { useState } from "react";
import { BadgeCheck, Check, ChevronRight, KeyRound, MailWarning } from "lucide-react";

import { AppShell, Avatar, Badge, PageHead, Skeleton, fmt, signed, tone } from "@/ui";

import type { AuthApi, Me } from "./api";
import { GoogleG, NoticeAlert } from "./frame";
import { ResendVerification } from "./LoginScreen";
import { LogoutButton } from "./LogoutButton";
import type { Notice } from "./messages";
import type { MyRooms } from "./myRooms";
import { useSubmit } from "./ui";

type Done = (me: Me | null, text?: string) => void;

export function ProfileScreen({
  api,
  me,
  rooms,
  notice,
  onDone,
}: {
  api: AuthApi;
  me: Me;
  rooms: MyRooms | null | undefined;
  notice: Notice | null;
  onDone: Done;
}) {
  return (
    <AppShell active="profile" me={{ name: me.username }}>
      <div className="profile-page">
        <PageHead eyebrow="Tài khoản" title="Hồ sơ" />
        {notice && (
          <div className="profile-notice">
            <NoticeAlert notice={notice} />
          </div>
        )}
        <div className="profile-grid">
          <section className="panel p-card">
            <Avatar name={me.username} size={96} large />
            <h2 className="p-name">{me.username}</h2>
            <span className="p-email">
              {me.email}
              {me.email_verified ? (
                <Badge kind="gain" icon={<BadgeCheck size={12} strokeWidth={2.4} aria-hidden />}>
                  Đã xác minh
                </Badge>
              ) : (
                <Badge kind="claret" icon={<MailWarning size={12} strokeWidth={2.4} aria-hidden />}>
                  Chưa xác minh
                </Badge>
              )}
            </span>
            <div className="p-stats">
              <Stat value={rooms?.handsPlayed} label="ván đã chơi" />
              <Stat value={rooms?.rooms.length} label="phòng có chip" />
              <Stat value={rooms?.owned} label="bàn làm chủ" />
            </div>
            <div className="p-actions">
              {!me.email_verified && me.email && <ResendVerification api={api} email={me.email} block />}
              <LogoutButton api={api} onDone={onDone} block />
            </div>
          </section>
          <div className="profile-right">
            <section className="panel">
              <header className="panel-head">
                <h3>Phòng đang có chip</h3>
                <Link href="/rooms" className="link">
                  Về sảnh
                </Link>
              </header>
              <ProfileRooms rooms={rooms} />
            </section>
            <section className="panel">
              <header className="panel-head">
                <h3>Cách đăng nhập</h3>
              </header>
              <SignInMethods api={api} me={me} />
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ value, label }: { value: number | undefined; label: string }) {
  return (
    <span>
      <b>{value === undefined ? "—" : fmt(value)}</b>
      <small>{label}</small>
    </span>
  );
}

function ProfileRooms({ rooms }: { rooms: MyRooms | null | undefined }) {
  if (rooms === undefined) {
    return (
      <div className="p-rooms" aria-busy>
        <Skeleton style={{ height: 52, margin: "10px 0" }} />
        <Skeleton style={{ height: 52, margin: "10px 0" }} />
      </div>
    );
  }
  if (rooms === null) return <p className="p-empty">Chưa tải được danh sách phòng. Tải lại trang để thử lại.</p>;
  if (rooms.rooms.length === 0) return <p className="p-empty">Bạn chưa có chip ở phòng nào. Vào sảnh chọn một bàn nhé.</p>;
  return (
    <div className="p-rooms">
      {rooms.rooms.map((r) => (
        <Link key={r.roomId} href={`/rooms/${r.roomId}/table`} className="p-room">
          <span className="p-room-mini" aria-hidden>
            <i />
          </span>
          <span className="p-room-name">
            <b>{r.name}</b>
            <small>Còn {fmt(r.balance)} chip</small>
          </span>
          <span className={`p-net is-${tone(r.net)}`}>
            {signed(r.net)}
            <small>lời/lỗ</small>
          </span>
          <ChevronRight size={18} className="p-chev" aria-hidden />
        </Link>
      ))}
      <div className="p-total">
        <span>Tổng lời/lỗ các phòng này</span>
        <b className={`is-${tone(rooms.totalNet)}`}>{signed(rooms.totalNet)}</b>
      </div>
    </div>
  );
}

function SignInMethods({ api, me }: { api: AuthApi; me: Me }) {
  const reset = useSubmit();
  const [sent, setSent] = useState(false);
  return (
    <ul className="p-methods">
      <li>
        <span className="p-m-icon" aria-hidden>
          <KeyRound size={17} strokeWidth={1.8} />
        </span>
        <span>
          <b>Email và mật khẩu</b>
          <small>
            {sent
              ? `Đã gửi link đổi mật khẩu tới ${me.email}.`
              : reset.notice?.text ?? (me.has_password ? "Đổi bằng link gửi tới email của bạn." : "Chưa đặt mật khẩu; đặt bằng link gửi tới email.")}
          </small>
        </span>
        {me.email && !sent && (
          <button
            type="button"
            className="link"
            disabled={reset.busy}
            onClick={async () => {
              const result = await reset.run(() => api.forgotPassword({ email: me.email! }));
              if (result.ok) setSent(true);
            }}
          >
            {me.has_password ? "Đổi mật khẩu" : "Đặt mật khẩu"}
          </button>
        )}
      </li>
      <li>
        <span className="p-m-icon" aria-hidden>
          <GoogleG size={16} />
        </span>
        <span>
          <b>Google</b>
          {/* the Google account's own address may differ from the account's email: not shown */}
          <small>{me.google_connected ? "Đăng nhập được bằng tài khoản Google đã liên kết" : "Chưa liên kết"}</small>
        </span>
        {me.google_connected ? (
          <Badge kind="gain" icon={<Check size={12} strokeWidth={3} aria-hidden />}>
            Đã liên kết
          </Badge>
        ) : (
          <Badge kind="muted">Chưa liên kết</Badge>
        )}
      </li>
    </ul>
  );
}
