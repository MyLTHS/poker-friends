// Kẹo Đêm (d3) — account: login, signup, forgot/reset, guest upgrade, profile.
import type { ReactNode } from "react";
import { ArrowRight, BadgeCheck, Check, Eye, KeyRound, LogOut, Mail, Pencil, ShieldCheck, X } from "lucide-react";

import { GUEST, PROFILE } from "../../../shared/data";
import type { Device } from "../../../shared/screens";
import { fmt } from "../lib";
import { AppNav, AuthArt, Divider, PartyArt } from "../shell";
import {
  Avatar,
  Btn,
  Eyebrow,
  Field,
  GoogleG,
  HomeBar,
  Logo,
  MHead,
  Money,
  Root,
  StatusBar,
  Sticker,
  Strength,
  TabBar,
  Token,
} from "../ui";

const eye = <Eye size={19} strokeWidth={2.6} />;

/* ================================================================== login */

function LoginForm({ mobile }: { mobile?: boolean }) {
  return (
    <div className={`authform ${mobile ? "authform-m" : ""}`}>
      <h2 className={mobile ? "h-m" : "h1"}>Vào bàn thôi!</h2>
      {!mobile && <p className="lead">Đăng nhập để giữ chip và lịch sử ở mọi phòng.</p>}
      <Field label="Email" value="lym@example.com" icon={<Mail size={18} strokeWidth={2.6} />} />
      <Field label="Mật khẩu" value="••••••••••" secret state="focus" icon={<KeyRound size={18} strokeWidth={2.6} />} right={eye} />
      <span className="auth-forgot">Quên mật khẩu?</span>
      <Btn tone="pink" size="lg" block>
        Đăng nhập
      </Btn>
      <Divider>hoặc</Divider>
      <Btn tone="white" size="lg" block icon={<GoogleG />}>
        Tiếp tục với Google
      </Btn>
      <div className="guest-wrap">
        <Btn tone="lime" size="lg" block>
          Chơi ngay bằng khách
        </Btn>
        <Sticker tone="sun" tilt={6} className="guest-stk">
          không cần email
        </Sticker>
      </div>
      <span className="auth-foot">
        Chưa có tài khoản? <b>Đăng ký</b>
      </span>
    </div>
  );
}

function DeskAuth({ children }: { children: ReactNode }) {
  return (
    <Root device="desktop" className="bg-party">
      <div className="auth">
        <AuthArt />
        <section className="auth-side">{children}</section>
      </div>
    </Root>
  );
}

function MobAuthTop() {
  return (
    <div className="mauth-top">
      <Logo size={20} />
      <h1>
        Poker với <em>hội bạn thân</em>
      </h1>
      <PartyArt compact />
    </div>
  );
}

function DeskLogin() {
  return (
    <DeskAuth>
      <div className="card authcard">
        <LoginForm />
      </div>
    </DeskAuth>
  );
}

function MobLogin() {
  return (
    <Root device="mobile" className="bg-party">
      <StatusBar />
      <MobAuthTop />
      <div className="msheet msheet-auth">
        <LoginForm mobile />
        <HomeBar />
      </div>
    </Root>
  );
}

/* ================================================================= signup */

function SignupForm({ mobile }: { mobile?: boolean }) {
  return (
    <div className={`authform ${mobile ? "authform-m" : ""}`}>
      {!mobile && <h2 className="h1">Tạo tài khoản</h2>}
      <Field label="Email" value="lym@example.com" icon={<Mail size={18} strokeWidth={2.6} />} state="ok" right={<Check size={18} strokeWidth={3.2} className="ok-ic" />} />
      <Field label="Tên ở bàn" value="Lym" hint="Mọi người thấy tên này cạnh ghế của bạn. Đổi được sau." />
      <Field label="Mật khẩu" value="•••••••••••" secret state="focus" icon={<KeyRound size={18} strokeWidth={2.6} />} right={eye} />
      <div className="pw-meter">
        <Strength level={3} label="Khá mạnh" />
        <span className="pw-rules">
          <span className="ok">
            <Check size={13} strokeWidth={3.4} /> 8+ ký tự
          </span>
          <span className="ok">
            <Check size={13} strokeWidth={3.4} /> có số
          </span>
          <span>
            <X size={13} strokeWidth={3.4} /> ký tự đặc biệt
          </span>
        </span>
      </div>
      <Btn tone="pink" size="lg" block pressed={mobile}>
        Tạo tài khoản
      </Btn>
      {!mobile && (
        <span className="auth-foot">
          Đã có tài khoản? <b>Đăng nhập</b>
        </span>
      )}
    </div>
  );
}

function VerifyCard({ mobile }: { mobile?: boolean }) {
  return (
    <div className={`verify ${mobile ? "verify-m" : ""}`}>
      <span className="verify-ic">📬</span>
      <div className="verify-t">
        <b>Mở email để xác minh</b>
        <span>
          Đã gửi link tới <u>lym@example.com</u>. Bấm link trong 24 giờ là xong.
        </span>
      </div>
      <div className="verify-btns">
        <Btn tone="sky" size={mobile ? "md" : "lg"} block={!mobile}>
          Mở hộp thư
        </Btn>
        <Btn tone="ghost" size={mobile ? "md" : "lg"} block={!mobile} className="btn-off">
          Gửi lại · 0:45
        </Btn>
      </div>
      {!mobile && <small className="verify-tip">Không thấy thư? Xem trong mục Spam hoặc Quảng cáo.</small>}
    </div>
  );
}

function DeskSignup() {
  return (
    <DeskAuth>
      <div className="auth-pair">
        <div className="card authcard authcard-n">
          <SignupForm />
        </div>
        <div className="pair-arrow">
          <Sticker tone="sun" tilt={-8}>
            gửi <ArrowRight size={14} strokeWidth={3.4} />
          </Sticker>
        </div>
        <div className="card authcard authcard-n authcard-after">
          <Eyebrow tone="lime">Sau khi gửi</Eyebrow>
          <VerifyCard />
        </div>
      </div>
    </DeskAuth>
  );
}

function MobSignup() {
  return (
    <Root device="mobile" className="bg-party">
      <StatusBar />
      <MHead title="Đăng ký" sub="Giữ chip và lịch sử ở mọi phòng" />
      <div className="mpage msignup">
        <SignupForm mobile />
        <VerifyCard mobile />
      </div>
      <HomeBar />
    </Root>
  );
}

/* ================================================================= forgot */

function ForgotStep1({ mobile }: { mobile?: boolean }) {
  return (
    <div className="authform">
      <Eyebrow tone="sky">Bước 1 · Quên mật khẩu</Eyebrow>
      {!mobile && <h2 className="h2">Quên mật khẩu?</h2>}
      {!mobile && <p className="lead">Nhập email bạn dùng để đăng nhập, mình gửi link đặt lại ngay.</p>}
      <Field label="Email" value="lym@example.com" icon={<Mail size={18} strokeWidth={2.6} />} />
      <Btn tone="pink" size="lg" block>
        Gửi link đặt lại
      </Btn>
      <span className="sent-note">
        <Check size={16} strokeWidth={3.4} /> Đã gửi! Kiểm tra hộp thư lym@example.com
      </span>
    </div>
  );
}

function ForgotStep2({ mobile }: { mobile?: boolean }) {
  return (
    <div className="authform">
      <Eyebrow tone="lime">Bước 2 · Mở từ link trong email</Eyebrow>
      {!mobile && <h2 className="h2">Đặt mật khẩu mới</h2>}
      <Field label="Mật khẩu mới" value="•••••••••••••" secret icon={<KeyRound size={18} strokeWidth={2.6} />} right={eye} />
      <Strength level={4} label="Rất mạnh" />
      <Field
        label="Nhập lại mật khẩu"
        value="•••••••••••••"
        secret
        state="ok"
        icon={<KeyRound size={18} strokeWidth={2.6} />}
        right={<Check size={18} strokeWidth={3.2} className="ok-ic" />}
        hint={<span className="hint-ok">Khớp rồi 👌</span>}
      />
      <Btn tone="lime" size="lg" block>
        Lưu mật khẩu mới
      </Btn>
      {!mobile && <small className="muted-note">Link chỉ dùng được một lần và hết hạn sau 30 phút.</small>}
    </div>
  );
}

function DeskForgot() {
  return (
    <DeskAuth>
      <div className="auth-pair">
        <div className="card authcard authcard-n">
          <ForgotStep1 />
        </div>
        <div className="pair-arrow">
          <Sticker tone="sun" tilt={-8}>
            📧 bấm link <ArrowRight size={14} strokeWidth={3.4} />
          </Sticker>
        </div>
        <div className="card authcard authcard-n">
          <ForgotStep2 />
        </div>
      </div>
    </DeskAuth>
  );
}

function MobForgot() {
  return (
    <Root device="mobile" className="bg-party">
      <StatusBar />
      <MHead title="Quên mật khẩu" sub="Đặt lại qua email" />
      <div className="mpage mforgot">
        <div className="card mcard">
          <ForgotStep1 mobile />
        </div>
        <div className="m-connector">
          <Sticker tone="sun" tilt={-4}>
            📧 mở link trong email ↓
          </Sticker>
        </div>
        <div className="card mcard">
          <ForgotStep2 mobile />
        </div>
      </div>
      <HomeBar />
    </Root>
  );
}

/* ================================================================ upgrade */

function GuestCard({ mobile }: { mobile?: boolean }) {
  return (
    <div className={`guest ${mobile ? "guest-m" : ""}`}>
      <div className="guest-head">
        <Avatar name={GUEST.name} size={mobile ? 48 : 64} />
        <span>
          <small>Bạn đang chơi bằng khách</small>
          <b className="guest-name">{GUEST.name}</b>
        </span>
        <Sticker tone="mute" tilt={4}>
          Khách
        </Sticker>
      </div>
      <div className="guest-rooms">
        {GUEST.rooms.map((r) => (
          <div key={r.name} className="guest-room">
            <span className="guest-room-n">{r.name}</span>
            <span className="guest-room-c">
              <Token size={15} />
              <b className="num">{fmt(r.chips)}</b>
            </span>
            <span className="guest-keep">
              <Check size={14} strokeWidth={3.4} />
            </span>
          </div>
        ))}
      </div>
      <div className="promise">
        <ShieldCheck size={mobile ? 26 : 32} strokeWidth={2.6} />
        <span>
          <b>Giữ nguyên chip và lịch sử</b>
          <small>Chip ở cả 2 phòng, ván đã chơi và lời/lỗ chuyển hết sang tài khoản mới.</small>
        </span>
      </div>
    </div>
  );
}

function UpgradeForm({ mobile }: { mobile?: boolean }) {
  return (
    <div className={`authform ${mobile ? "authform-m" : ""}`}>
      {!mobile && <h2 className="h1">Nâng cấp tài khoản</h2>}
      {!mobile && <p className="lead">Chọn một cách. Mất chưa tới một phút.</p>}
      <Btn tone="white" size="lg" block icon={<GoogleG />}>
        Nâng cấp bằng Google
      </Btn>
      <Divider>hoặc bằng email</Divider>
      <Field label="Email" value="lym@example.com" icon={<Mail size={18} strokeWidth={2.6} />} />
      <Field label="Mật khẩu" placeholder="Ít nhất 8 ký tự" state="focus" icon={<KeyRound size={18} strokeWidth={2.6} />} />
      <Btn tone="pink" size="lg" block>
        Nâng cấp bằng email
      </Btn>
      <span className="auth-foot">
        <b className="soft">Để sau</b> · khách sẽ mất chip nếu xoá dữ liệu trình duyệt
      </span>
    </div>
  );
}

function DeskUpgrade() {
  return (
    <Root device="desktop" className="bg-party">
      <AppNav active={2} />
      <main className="page upgrade">
        <section className="card upgrade-l">
          <Eyebrow tone="sun">Đang là khách</Eyebrow>
          <GuestCard />
          <div className="carry">
            <span className="carry-from">
              <Avatar name={GUEST.name} size={40} />
              {GUEST.name}
            </span>
            <span className="carry-line">
              <i />
              <Token tone="sun" size={20} />
              <Token tone="pink" size={20} />
              <i />
              <ArrowRight size={20} strokeWidth={3.4} />
            </span>
            <span className="carry-to">
              <Avatar name="Lym" size={40} />
              tài khoản thật
            </span>
          </div>
        </section>
        <section className="card upgrade-r">
          <UpgradeForm />
        </section>
      </main>
    </Root>
  );
}

function MobUpgrade() {
  return (
    <Root device="mobile" className="bg-party">
      <StatusBar />
      <MHead title="Nâng cấp tài khoản" sub="Từ khách lên tài khoản thật" />
      <div className="mpage mupgrade">
        <GuestCard mobile />
        <UpgradeForm mobile />
      </div>
      <HomeBar />
    </Root>
  );
}

/* ================================================================ profile */

function ProfileHead({ mobile }: { mobile?: boolean }) {
  return (
    <div className={`prof-head ${mobile ? "prof-head-m" : ""}`}>
      <span className="prof-av">
        <Avatar name="Lym" size={mobile ? 84 : 112} />
        <span className="prof-edit">
          <Pencil size={14} strokeWidth={3} />
        </span>
      </span>
      <div className="prof-id">
        <b className="prof-name">{PROFILE.name}</b>
        <span className="prof-mail">
          {PROFILE.email}
          <Sticker tone="lime" tilt={-3}>
            <BadgeCheck size={13} strokeWidth={3} /> Đã xác minh
          </Sticker>
        </span>
      </div>
    </div>
  );
}

function Methods() {
  return (
    <div className="methods">
      <div className="method">
        <span className="method-ic">
          <KeyRound size={19} strokeWidth={2.8} />
        </span>
        <span className="method-t">
          <b>{PROFILE.methods[0]}</b>
          <small>Đổi lần cuối 3 tuần trước</small>
        </span>
        <span className="method-a">Đổi</span>
      </div>
      <div className="method">
        <span className="method-ic method-ic-w">
          <GoogleG size={19} />
        </span>
        <span className="method-t">
          <b>{PROFILE.methods[1]}</b>
          <small>Đã liên kết · {PROFILE.email}</small>
        </span>
        <span className="method-a ok">
          <Check size={15} strokeWidth={3.4} />
        </span>
      </div>
    </div>
  );
}

function MyRooms() {
  return (
    <div className="myrooms">
      {PROFILE.rooms.map((r, i) => (
        <div key={r.name} className={`myroom myroom-${i ? "sky" : "pink"}`}>
          <span className="myroom-n">
            <b>{r.name}</b>
            <small>
              còn <Token size={12} /> <b className="num">{fmt(r.balance)}</b>
            </small>
          </span>
          <Money n={r.net} className="money-pill" />
        </div>
      ))}
    </div>
  );
}

function DeskProfile() {
  return (
    <Root device="desktop" className="bg-party">
      <AppNav active={2} />
      <main className="page profile">
        <section className="card prof-l">
          <ProfileHead />
          <span className="sec-h">Cách đăng nhập</span>
          <Methods />
          <Btn tone="ghost" size="lg" icon={<LogOut size={19} strokeWidth={3} />} className="logout">
            Đăng xuất
          </Btn>
        </section>
        <section className="card prof-r">
          <span className="sec-h">Phòng đang có chip</span>
          <p className="lead">Chip tính riêng từng phòng, không có ví chung. Lời/lỗ so với số chip được cấp.</p>
          <MyRooms />
          <div className="prof-sum">
            <span>Tổng lời/lỗ 2 phòng</span>
            <Money n={PROFILE.rooms.reduce((a, r) => a + r.net, 0)} className="money-pill money-big" />
          </div>
        </section>
      </main>
    </Root>
  );
}

function MobProfile() {
  return (
    <Root device="mobile" className="bg-party">
      <StatusBar />
      <MHead title="Hồ sơ" back={false} center />
      <div className="mpage mprofile">
        <ProfileHead mobile />
        <span className="sec-h">Cách đăng nhập</span>
        <Methods />
        <span className="sec-h">Phòng đang có chip</span>
        <MyRooms />
        <Btn tone="ghost" size="md" block icon={<LogOut size={18} strokeWidth={3} />} className="logout">
          Đăng xuất
        </Btn>
      </div>
      <TabBar active={2} />
      <HomeBar />
    </Root>
  );
}

export function renderAccount(screen: string, device: Device): ReactNode | null {
  const d = device === "desktop";
  switch (screen) {
    case "login":
      return d ? <DeskLogin /> : <MobLogin />;
    case "signup":
      return d ? <DeskSignup /> : <MobSignup />;
    case "forgot":
      return d ? <DeskForgot /> : <MobForgot />;
    case "upgrade":
      return d ? <DeskUpgrade /> : <MobUpgrade />;
    case "profile":
      return d ? <DeskProfile /> : <MobProfile />;
    default:
      return null;
  }
}
