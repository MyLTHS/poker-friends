// Sơn Mài Vàng Son (d4) — account: login, signup, forgot/reset, guest upgrade, profile.
import type { ReactNode } from "react";
import { ArrowRight, BadgeCheck, Check, Eye, KeyRound, LogOut, Mail, MailCheck, Pencil, ShieldCheck, User, X } from "lucide-react";

import { GUEST, PROFILE, ROOMS } from "../../../shared/data";
import type { Device } from "../../../shared/screens";
import { fmt, TREND } from "../lib";
import { HeroArt, MRail, Medallion, TopNav } from "../shell";
import { Amount, Avatar, Btn, Divider, Eyebrow, Field, GoogleG, HomeBar, Logo, Money, Panel, Root, Spark, Strength, Sun, Tag, Token } from "../ui";

const eye = <Eye size={18} strokeWidth={1.8} />;
const mail = <Mail size={18} strokeWidth={1.8} />;
const key = <KeyRound size={18} strokeWidth={1.8} />;
const ok = <Check size={18} strokeWidth={2.4} className="ok-ic" />;

/* ================================================================ shells */

/** Desktop auth: a cinnabar lacquer panel with the still life on the left, the form on the right. */
function DeskAuth({ children, art = 600 }: { children: ReactNode; art?: number }) {
  return (
    <Root device="desktop" className="bg-hall">
      <div className="auth" style={{ gridTemplateColumns: `${art}px 1fr` }}>
        <section className="auth-art">
          <Logo size={46} sub />
          <HeroArt scale={art > 500 ? 0.98 : 0.74} className={art > 500 ? "auth-hero" : "auth-hero auth-hero-n"} />
          <div className="auth-art-t">
            <h1 className="h-hero">
              Poker với <em>hội bạn thân</em>
            </h1>
            <p>Chip ảo, không tiền thật. Mỗi phòng một sổ lời/lỗ riêng, chủ phòng cấp chip cho cả hội.</p>
          </div>
        </section>
        <section className="auth-main">{children}</section>
      </div>
    </Root>
  );
}

/** Phone auth with two panes side by side (form · what happens next). */
function MobPair({ left, right, link, className }: { left: ReactNode; right: ReactNode; link?: ReactNode; className?: string }) {
  return (
    <Root device="mobile" className="bg-hall">
      <div className={`mpage mpair ${className ?? ""}`}>
        {left}
        {link && <span className="mlink">{link}</span>}
        {right}
      </div>
      <HomeBar />
    </Root>
  );
}

const Connector = ({ children }: { children: ReactNode }) => (
  <span className="connector">
    <i />
    <span>{children}</span>
    <i />
  </span>
);

/* ================================================================== login */

function LoginForm({ mobile }: { mobile?: boolean }) {
  return (
    <div className="authform">
      {!mobile && <Eyebrow>Chào mừng trở lại</Eyebrow>}
      <h2 className={mobile ? "h3" : "h1"}>Vào bàn thôi</h2>
      {!mobile && <p className="lead">Đăng nhập để giữ chip và lịch sử ở mọi phòng.</p>}
      <Field label="Email" value="lym@example.com" icon={mail} />
      <Field label="Mật khẩu" value="••••••••••" secret state="focus" icon={key} right={eye} />
      <span className="auth-row">
        <span className="check">
          <i>
            <Check size={12} strokeWidth={3} />
          </i>
          Nhớ máy này
        </span>
        <span className="link">Quên mật khẩu?</span>
      </span>
      <Btn tone="gold" size="lg" block>
        Đăng nhập
      </Btn>
      <Divider>hoặc</Divider>
      <Btn tone="ivory" size="lg" block icon={<GoogleG />}>
        Tiếp tục với Google
      </Btn>
      {!mobile && <GuestBtn />}
      <span className="auth-foot">
        Chưa có tài khoản? <b className="link">Đăng ký</b>
      </span>
    </div>
  );
}

const GuestBtn = ({ tone = "son" }: { tone?: "son" | "then" }) => (
  <div className="guestbtn">
    <Btn tone={tone} size="lg" block icon={<User size={18} strokeWidth={2} />}>
      Chơi ngay bằng khách
    </Btn>
    <small>Không cần email · nâng cấp sau vẫn giữ chip</small>
  </div>
);

function DeskLogin() {
  return (
    <DeskAuth art={640}>
      <Panel className="authcard">
        <LoginForm />
      </Panel>
    </DeskAuth>
  );
}

function MobLogin() {
  return (
    <Root device="mobile" className="bg-hall">
      <div className="mpage mlogin">
        <Panel className="mauth-art" tone="son">
          <Logo size={34} sub />
          <h1 className="h-hero">
            Poker với <em>hội bạn thân</em>
          </h1>
          <HeroArt scale={0.4} className="mauth-hero" />
          <GuestBtn tone="then" />
        </Panel>
        <Panel className="mauth-form">
          <LoginForm mobile />
        </Panel>
      </div>
      <HomeBar />
    </Root>
  );
}

/* ================================================================= signup */

function PwRules() {
  return (
    <span className="pwrules">
      <span className="ok">
        <Check size={13} strokeWidth={2.6} /> 8+ ký tự
      </span>
      <span className="ok">
        <Check size={13} strokeWidth={2.6} /> có số
      </span>
      <span>
        <X size={13} strokeWidth={2.6} /> ký tự đặc biệt
      </span>
    </span>
  );
}

function SignupForm({ mobile }: { mobile?: boolean }) {
  const email = <Field label="Email" value="lym@example.com" icon={mail} state="ok" right={ok} />;
  const name = <Field label="Tên ở bàn" value="Lym" icon={<User size={18} strokeWidth={1.8} />} hint={mobile ? undefined : "Mọi người thấy tên này cạnh ghế của bạn. Đổi được sau."} />;
  return (
    <div className="authform">
      {!mobile && <Eyebrow>Tài khoản mới</Eyebrow>}
      <h2 className={mobile ? "h3" : "h2"}>Tạo tài khoản</h2>
      {mobile ? (
        <div className="grid2">
          {email}
          {name}
        </div>
      ) : (
        <>
          {email}
          {name}
        </>
      )}
      <Field label="Mật khẩu" value="•••••••••••" secret state="focus" icon={key} right={eye} />
      <div className="pwmeter">
        <Strength level={3} label="Khá mạnh" />
        <PwRules />
      </div>
      <Btn tone="gold" size="lg" block>
        Tạo tài khoản
      </Btn>
      <span className="auth-foot">
        Đã có tài khoản? <b className="link">Đăng nhập</b>
      </span>
    </div>
  );
}

function VerifyCard({ mobile }: { mobile?: boolean }) {
  return (
    <div className="verify">
      <Eyebrow tone="jade">Sau khi gửi</Eyebrow>
      <Medallion size={mobile ? 64 : 104} tone="son">
        <MailCheck size={mobile ? 24 : 38} strokeWidth={1.6} />
      </Medallion>
      <b className="verify-t">Mở email để xác minh</b>
      <span className="verify-s">
        Đã gửi link tới <b>lym@example.com</b>. Bấm link trong 24 giờ là xong.
      </span>
      <div className="verify-btns">
        <Btn tone="gold" size={mobile ? "md" : "lg"} block>
          Mở hộp thư
        </Btn>
        <Btn tone="ghost" size={mobile ? "md" : "lg"} block className="btn-off">
          Gửi lại · <span className="num">0:45</span>
        </Btn>
      </div>
      <small className="verify-tip">Không thấy thư? Xem trong mục Spam hoặc Quảng cáo.</small>
    </div>
  );
}

function DeskSignup() {
  return (
    <DeskAuth art={460}>
      <div className="pair">
        <Panel className="authcard">
          <SignupForm />
        </Panel>
        <Connector>
          gửi <ArrowRight size={14} strokeWidth={2} />
        </Connector>
        <Panel className="authcard authcard-after" tone="deep">
          <VerifyCard />
        </Panel>
      </div>
    </DeskAuth>
  );
}

function MobSignup() {
  return (
    <MobPair
      className="msignup"
      left={
        <Panel className="mcard">
          <SignupForm mobile />
        </Panel>
      }
      link={<ArrowRight size={16} strokeWidth={2} />}
      right={
        <Panel className="mcard mcard-after" tone="deep">
          <VerifyCard mobile />
        </Panel>
      }
    />
  );
}

/* ================================================================= forgot */

function ForgotStep1({ mobile }: { mobile?: boolean }) {
  return (
    <div className="authform">
      <Eyebrow>Bước 1 · Quên mật khẩu</Eyebrow>
      <h2 className={mobile ? "h3" : "h2"}>Quên mật khẩu?</h2>
      <p className="lead">Nhập email bạn dùng để đăng nhập, mình gửi link đặt lại ngay.</p>
      <Field label="Email" value="lym@example.com" icon={mail} />
      <Btn tone="gold" size="lg" block>
        Gửi link đặt lại
      </Btn>
      <span className="sent">
        <Check size={15} strokeWidth={2.6} /> Đã gửi! Kiểm tra hộp thư lym@example.com
      </span>
    </div>
  );
}

function ForgotStep2({ mobile }: { mobile?: boolean }) {
  return (
    <div className="authform">
      <Eyebrow tone="jade">Bước 2 · Mở từ link trong email</Eyebrow>
      <h2 className={mobile ? "h3" : "h2"}>Đặt mật khẩu mới</h2>
      <Field label="Mật khẩu mới" value="•••••••••••••" secret icon={key} right={eye} />
      <Strength level={4} label="Rất mạnh" />
      <Field label="Nhập lại mật khẩu" value="•••••••••••••" secret state="ok" icon={key} right={ok} hint={mobile ? undefined : <span className="hint-ok">Khớp rồi</span>} />
      <Btn tone="gold" size="lg" block>
        Lưu mật khẩu mới
      </Btn>
      <small className="note">Link chỉ dùng được một lần và hết hạn sau 30 phút.</small>
    </div>
  );
}

function DeskForgot() {
  return (
    <DeskAuth art={460}>
      <div className="pair">
        <Panel className="authcard">
          <ForgotStep1 />
        </Panel>
        <Connector>
          bấm link <ArrowRight size={14} strokeWidth={2} />
        </Connector>
        <Panel className="authcard">
          <ForgotStep2 />
        </Panel>
      </div>
    </DeskAuth>
  );
}

function MobForgot() {
  return (
    <MobPair
      className="mforgot"
      left={
        <Panel className="mcard">
          <ForgotStep1 mobile />
        </Panel>
      }
      link={<ArrowRight size={16} strokeWidth={2} />}
      right={
        <Panel className="mcard">
          <ForgotStep2 mobile />
        </Panel>
      }
    />
  );
}

/* ================================================================ upgrade */

function GuestCard({ mobile }: { mobile?: boolean }) {
  return (
    <div className="guest">
      <div className="guest-head">
        <Avatar name={GUEST.name} size={mobile ? 44 : 60} />
        <span>
          <small>Bạn đang chơi bằng khách</small>
          <b>{GUEST.name}</b>
        </span>
        <Tag tone="mute">Khách</Tag>
      </div>
      <div className="guest-rooms">
        {GUEST.rooms.map((r) => (
          <div key={r.name} className="guest-room">
            <span className="guest-room-n">{r.name}</span>
            <Amount n={r.chips} size={14} />
            <span className="guest-keep">
              <Check size={13} strokeWidth={2.6} /> giữ nguyên
            </span>
          </div>
        ))}
      </div>
      <div className="promise">
        <ShieldCheck size={mobile ? 24 : 30} strokeWidth={1.6} />
        <span>
          <b>Giữ nguyên chip và lịch sử</b>
          <small>Chip ở cả 2 phòng, ván đã chơi và lời/lỗ chuyển hết sang tài khoản mới.</small>
        </span>
      </div>
    </div>
  );
}

function Carry({ mobile }: { mobile?: boolean }) {
  const t = mobile ? 16 : 22;
  return (
    <div className="carry">
      <span className="carry-who">
        <Avatar name={GUEST.name} size={mobile ? 30 : 44} />
        <small>{mobile ? "khách" : GUEST.name}</small>
      </span>
      <span className="carry-line">
        <i />
        <Token size={t} tone="son" />
        <Token size={t} tone="egg" />
        <Token size={t} tone="gold" />
        <i />
        <ArrowRight size={mobile ? 15 : 18} strokeWidth={2} />
      </span>
      <span className="carry-who">
        <Avatar name="Lym" size={mobile ? 30 : 44} me />
        <small>tài khoản thật</small>
      </span>
    </div>
  );
}

function UpgradeForm({ mobile }: { mobile?: boolean }) {
  return (
    <div className="authform">
      {!mobile && <Eyebrow>Lên tài khoản thật</Eyebrow>}
      <h2 className={mobile ? "h3" : "h1"}>Nâng cấp tài khoản</h2>
      {!mobile && <p className="lead">Chọn một cách. Mất chưa tới một phút.</p>}
      <Btn tone="ivory" size="lg" block icon={<GoogleG />}>
        Nâng cấp bằng Google
      </Btn>
      <Divider>hoặc bằng email</Divider>
      <Field label="Email" value="lym@example.com" icon={mail} />
      <Field label="Mật khẩu" placeholder="Ít nhất 8 ký tự" state="focus" icon={key} />
      <Btn tone="gold" size="lg" block>
        Nâng cấp bằng email
      </Btn>
      <span className="auth-foot">
        <b className="link">Để sau</b> · khách sẽ mất chip nếu xoá dữ liệu trình duyệt
      </span>
    </div>
  );
}

function DeskUpgrade() {
  return (
    <Root device="desktop" className="bg-hall">
      <TopNav active={2} guest />
      <main className="page upgrade">
        <Panel className="upgrade-l" tone="son">
          <Eyebrow tone="pearl">Đang là khách</Eyebrow>
          <GuestCard />
          <Carry />
        </Panel>
        <Panel className="upgrade-r">
          <UpgradeForm />
        </Panel>
      </main>
    </Root>
  );
}

function MobUpgrade() {
  return (
    <MobPair
      className="mupgrade"
      left={
        <Panel className="mcard" tone="son">
          <Eyebrow tone="pearl">Đang là khách</Eyebrow>
          <GuestCard mobile />
          <Carry mobile />
        </Panel>
      }
      right={
        <Panel className="mcard">
          <UpgradeForm mobile />
        </Panel>
      }
    />
  );
}

/* ================================================================ profile */

function ProfileHead({ mobile }: { mobile?: boolean }) {
  return (
    <div className="phead">
      <span className="phead-av">
        {!mobile && <Sun size={176} className="phead-sun" />}
        <Avatar name="Lym" size={mobile ? 60 : 108} me />
        <span className="phead-edit">
          <Pencil size={mobile ? 12 : 14} strokeWidth={2} />
        </span>
      </span>
      <span className="phead-id">
        <b className="phead-name">{PROFILE.name}</b>
        <span className="phead-mail">
          {PROFILE.email}
          <Tag tone="jade" icon={<BadgeCheck size={12} strokeWidth={2.2} />}>
            Đã xác minh
          </Tag>
        </span>
      </span>
    </div>
  );
}

function Methods() {
  return (
    <div className="methods">
      <div className="method">
        <span className="method-ic">{key}</span>
        <span className="method-t">
          <b>{PROFILE.methods[0]}</b>
          <small>Đổi lần cuối 3 tuần trước</small>
        </span>
        <span className="link">Đổi</span>
      </div>
      <div className="method">
        <span className="method-ic method-ic-g">
          <GoogleG size={17} />
        </span>
        <span className="method-t">
          <b>{PROFILE.methods[1]}</b>
          <small>Đã liên kết · {PROFILE.email}</small>
        </span>
        <span className="method-ok">
          <Check size={15} strokeWidth={2.6} />
        </span>
      </div>
    </div>
  );
}


function MyRooms({ mobile }: { mobile?: boolean }) {
  return (
    <div className="myrooms">
      {PROFILE.rooms.map((r) => {
        const room = ROOMS.find((x) => x.name === r.name)!;
        return (
          <div key={r.name} className="myroom">
            <span className="myroom-n">
              {!mobile && (
                <span className="myroom-tags">
                  {room.status === "Đang chơi" ? <Tag tone="jade">Đang chơi</Tag> : <Tag tone="gold">Đang mở</Tag>}
                  <small>
                    Chủ phòng {room.owner} · Blind {room.blinds}
                  </small>
                </span>
              )}
              <b>{r.name}</b>
              <small>
                còn <Amount n={r.balance} size={12} />
                {!mobile && <em>· được cấp {fmt(r.balance - r.net)}</em>}
              </small>
            </span>
            <Spark points={TREND[r.name]} w={mobile ? 58 : 230} h={mobile ? 28 : 58} />
            <Money n={r.net} className="myroom-net" />
          </div>
        );
      })}
    </div>
  );
}

function DeskProfile() {
  const total = PROFILE.rooms.reduce((a, r) => a + r.net, 0);
  return (
    <Root device="desktop" className="bg-hall">
      <TopNav active={2} />
      <main className="page profile">
        <Panel className="prof-l">
          <ProfileHead />
          <span className="sec-h">Cách đăng nhập</span>
          <Methods />
          <Btn tone="then" size="lg" icon={<LogOut size={18} strokeWidth={2} />} className="logout">
            Đăng xuất
          </Btn>
        </Panel>
        <Panel className="prof-r">
          <span className="sec-h">Phòng đang có chip</span>
          <p className="lead">Chip tính riêng từng phòng, không có ví chung. Lời/lỗ so với số chip được cấp.</p>
          <MyRooms />
          <div className="prof-sum">
            <span>
              <small>Tổng lời/lỗ 2 phòng</small>
              <b>
                {fmt(PROFILE.rooms.reduce((a, r) => a + r.balance, 0))} <em>chip đang giữ</em>
              </b>
            </span>
            <Money n={total} big />
          </div>
        </Panel>
      </main>
    </Root>
  );
}

function MobProfile() {
  const total = PROFILE.rooms.reduce((a, r) => a + r.net, 0);
  return (
    <Root device="mobile" className="bg-hall">
      <MRail active={2} />
      <div className="mpage mrailpage mprofile">
        <Panel className="mcard prof-l">
          <ProfileHead mobile />
          <span className="sec-h">Cách đăng nhập</span>
          <Methods />
          <Btn tone="then" size="md" block icon={<LogOut size={17} strokeWidth={2} />}>
            Đăng xuất
          </Btn>
        </Panel>
        <Panel className="mcard prof-r">
          <span className="sec-h">Phòng đang có chip</span>
          <p className="lead">Chip tính riêng từng phòng, không có ví chung.</p>
          <MyRooms mobile />
          <div className="prof-sum">
            <span>
              <small>Tổng lời/lỗ 2 phòng</small>
            </span>
            <Money n={total} big />
          </div>
        </Panel>
      </div>
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
