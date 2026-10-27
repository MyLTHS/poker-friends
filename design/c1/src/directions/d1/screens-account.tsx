import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  MailCheck,
  Pencil,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { GUEST, PROFILE, card } from "../../shared/data";
import type { Device } from "../../shared/screens";
import {
  Avatar,
  Badge,
  Btn,
  ChipStack,
  DesktopNav,
  Field,
  HomeBar,
  IconBtn,
  MobileAppBar,
  MobileTabBar,
  PlayingCard,
  Root,
  StatusBar,
  Strength,
  Wordmark,
  fmt,
  signed,
  tone,
} from "./kit";

/* ---------- shared auth pieces ---------- */

function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

const Or = ({ label = "hoặc" }: { label?: string }) => (
  <div className="or">
    <i />
    <span>{label}</span>
    <i />
  </div>
);

function AuthHero({ headline, sub }: { headline: ReactNode; sub: ReactNode }) {
  return (
    <div className="auth-hero">
      <Wordmark />
      <div className="hero-copy">
        <span className="eyebrow">Texas Hold'em · chip ảo · giữa bạn bè</span>
        <h1 className="hero-title">{headline}</h1>
        <p className="hero-sub">{sub}</p>
      </div>
      <div className="hero-table">
        <div className="hero-felt">
          <div className="felt-line" />
        </div>
        <div className="hero-cards">
          <PlayingCard card={card("As")} w={96} rotate={-12} />
          <PlayingCard card={card("Kh")} w={96} rotate={6} />
        </div>
        <div className="hero-chips hc-1">
          <ChipStack amount={760} cols={3} size={34} max={5} />
        </div>
        <div className="hero-chips hc-2">
          <ChipStack amount={130} cols={2} size={30} max={4} />
        </div>
        <span className="hero-dealer">D</span>
      </div>
      <ul className="hero-facts">
        <li>
          <b>2–9</b> ghế mỗi bàn
        </li>
        <li>
          <b>0 đồng</b> tiền thật, không nhà cái
        </li>
        <li>
          <b>7-2</b> thưởng cho cú bluff
        </li>
      </ul>
    </div>
  );
}

function MobileHero({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="m-hero">
      <div className="m-hero-felt">
        <div className="felt-line" />
      </div>
      <div className="m-hero-content">
        <Wordmark small />
        <h1 className="m-hero-title">{title}</h1>
        {sub && <p className="m-hero-sub">{sub}</p>}
      </div>
      <div className="m-hero-cards">
        <PlayingCard card={card("As")} w={52} rotate={-14} />
        <PlayingCard card={card("Kh")} w={52} rotate={8} />
      </div>
      <div className="m-hero-chips">
        <ChipStack amount={630} cols={3} size={22} max={4} />
      </div>
    </div>
  );
}

const PasswordEye = ({ shown = false }: { shown?: boolean }) =>
  shown ? <EyeOff size={17} strokeWidth={1.8} /> : <Eye size={17} strokeWidth={1.8} />;

function Checkbox({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span className={`check${on ? " is-on" : ""}`}>
      <i>{on && <Check size={12} strokeWidth={3} />}</i>
      {children}
    </span>
  );
}

/* ================= login ================= */

function LoginForm({ device }: { device: Device }) {
  const lg = device === "mobile" ? "lg" : "lg";
  return (
    <div className="form-stack">
      <Field label="Email" icon={<Mail size={17} strokeWidth={1.8} />} value="lym@example.com" />
      <Field
        label="Mật khẩu"
        icon={<Lock size={17} strokeWidth={1.8} />}
        value="••••••••••"
        state="focus"
        trailing={<PasswordEye />}
      />
      <div className="form-row-between">
        <Checkbox on>Nhớ đăng nhập</Checkbox>
        <span className="link">Quên mật khẩu?</span>
      </div>
      <Btn kind="primary" size={lg} block>
        Đăng nhập
      </Btn>
      <Or />
      <Btn kind="light" size={lg} block icon={<GoogleG />}>
        Tiếp tục với Google
      </Btn>
      <Btn kind="ghost" size={lg} block icon={<UserRound size={18} strokeWidth={1.8} />}>
        Chơi ngay bằng khách
      </Btn>
      <p className="form-foot">
        Chưa có tài khoản? <span className="link">Đăng ký</span>
      </p>
    </div>
  );
}

export function Login({ device }: { device: Device }) {
  if (device === "mobile") {
    return (
      <Root device="mobile" className="bg-auth">
        <StatusBar />
        <MobileHero title="Chào mừng trở lại" sub="Bàn quen đang chờ bạn." />
        <div className="m-auth-body">
          <LoginForm device="mobile" />
        </div>
        <HomeBar />
      </Root>
    );
  }
  return (
    <Root device="desktop" className="bg-auth">
      <AuthHero
        headline={
          <>
            Bàn nỉ xanh
            <br />
            cho hội bạn thân.
          </>
        }
        sub="Mở bàn, gửi link, chia bài. Chip ảo cho vui — không tiền thật, không nhà cái."
      />
      <div className="auth-main">
        <div className="auth-card">
          <span className="eyebrow">Thành viên</span>
          <h2 className="auth-title">Chào mừng trở lại</h2>
          <p className="auth-sub">Đăng nhập để vào bàn của hội.</p>
          <LoginForm device="desktop" />
        </div>
        <p className="auth-legal">Khách vẫn chơi đủ mọi bàn; nâng cấp lên tài khoản sau vẫn giữ chip và lịch sử.</p>
      </div>
    </Root>
  );
}

/* ================= signup ================= */

function SignupForm() {
  return (
    <div className="form-stack">
      <Field label="Email" icon={<Mail size={17} strokeWidth={1.8} />} value="lym@example.com" state="ok" />
      <Field
        label="Tên ở bàn"
        icon={<UserRound size={17} strokeWidth={1.8} />}
        value="Lym"
        hint="Bạn bè thấy tên này ở bàn · 2–16 ký tự"
      />
      <div className="field">
        <span className="field-label">Mật khẩu</span>
        <span className="input is-focus">
          <span className="input-icon">
            <Lock size={17} strokeWidth={1.8} />
          </span>
          <span className="input-value">
            ••••••••••
            <i className="caret" />
          </span>
          <span className="input-trailing">
            <PasswordEye />
          </span>
        </span>
        <Strength level={3} label="Khá mạnh" />
        <ul className="pw-rules">
          <li className="is-ok">
            <Check size={13} strokeWidth={3} /> 8 ký tự trở lên
          </li>
          <li className="is-ok">
            <Check size={13} strokeWidth={3} /> Có chữ số
          </li>
          <li>
            <Circle size={11} strokeWidth={2.4} /> Thêm ký tự đặc biệt để mạnh hơn
          </li>
        </ul>
      </div>
      <Btn kind="primary" size="lg" block>
        Tạo tài khoản
      </Btn>
    </div>
  );
}

function VerifyNotice({ device }: { device: Device }) {
  return (
    <div className={`verify verify-${device}`}>
      <span className="verify-icon">
        <MailCheck size={device === "desktop" ? 30 : 26} strokeWidth={1.6} />
      </span>
      <h3>Mở email để xác minh</h3>
      <p>
        Đã gửi link tới <b>lym@example.com</b>. Bấm link trong thư để kích hoạt tài khoản, rồi quay lại đây.
      </p>
      <ul className="verify-tips">
        <li>Không thấy thư? Xem mục Spam hoặc Quảng cáo.</li>
        <li>Link có hiệu lực trong 24 giờ.</li>
      </ul>
      <div className="verify-actions">
        <Btn kind="quiet" size={device === "desktop" ? "md" : "lg"} block disabled>
          Gửi lại sau 0:42
        </Btn>
        <span className="link">Sửa email</span>
      </div>
    </div>
  );
}

export function Signup({ device }: { device: Device }) {
  if (device === "mobile") {
    return (
      <Root device="mobile" className="bg-auth">
        <StatusBar />
        <MobileAppBar
          title="Tạo tài khoản"
          left={
            <IconBtn>
              <ChevronLeft size={22} />
            </IconBtn>
          }
        />
        <div className="m-page is-under-sheet">
          <p className="m-lead">Vào hội để giữ chip, lịch sử và mở bàn riêng.</p>
          <SignupForm />
        </div>
        <div className="scrim scrim-soft" />
        <div className="sheet verify-sheet">
          <span className="grabber" />
          <VerifyNotice device="mobile" />
        </div>
        <HomeBar />
      </Root>
    );
  }
  return (
    <Root device="desktop" className="bg-auth">
      <AuthHero
        headline={
          <>
            Một ghế đã
            <br />
            chờ sẵn bạn.
          </>
        }
        sub="Tài khoản giữ chip và lịch sử của bạn ở mọi bàn, trên mọi máy."
      />
      <div className="auth-main is-split">
        <div className="auth-col">
          <span className="step-label">
            <i>1</i> Điền thông tin
          </span>
          <div className="auth-card">
            <h2 className="auth-title">Tạo tài khoản</h2>
            <p className="auth-sub">Chỉ mất một phút.</p>
            <SignupForm />
            <Or />
            <Btn kind="light" size="lg" block icon={<GoogleG />}>
              Đăng ký bằng Google
            </Btn>
            <p className="form-foot">
              Đã có tài khoản? <span className="link">Đăng nhập</span>
            </p>
          </div>
        </div>
        <div className="auth-col is-narrow">
          <span className="step-label">
            <i>2</i> Sau khi bấm "Tạo tài khoản"
          </span>
          <div className="auth-card is-quiet">
            <VerifyNotice device="desktop" />
          </div>
        </div>
      </div>
    </Root>
  );
}

/* ================= forgot / reset ================= */

function ForgotRequest({ device }: { device: Device }) {
  return (
    <div className="form-stack">
      <div className="card-head">
        <span className="card-icon">
          <KeyRound size={20} strokeWidth={1.8} />
        </span>
        <span>
          <h3>Quên mật khẩu?</h3>
          <p>Nhập email, chúng tôi gửi link đặt lại.</p>
        </span>
      </div>
      <Field label="Email" icon={<Mail size={17} strokeWidth={1.8} />} value="lym@example.com" />
      <Btn kind="primary" size={device === "desktop" ? "lg" : "lg"} block>
        Gửi link đặt lại
      </Btn>
      <div className="alert alert-ok">
        <MailCheck size={17} strokeWidth={1.9} />
        <span>
          <b>Đã gửi tới l•••@example.com</b>
          <small>Link hết hạn sau 30 phút.</small>
        </span>
      </div>
    </div>
  );
}

function ForgotReset({ device }: { device: Device }) {
  return (
    <div className="form-stack">
      <div className="card-head">
        <span className="card-icon">
          <ShieldCheck size={20} strokeWidth={1.8} />
        </span>
        <span>
          <h3>Đặt mật khẩu mới</h3>
          <p>Cho tài khoản lym@example.com</p>
        </span>
      </div>
      <div className="field">
        <span className="field-label">Mật khẩu mới</span>
        <span className="input is-focus">
          <span className="input-icon">
            <Lock size={17} strokeWidth={1.8} />
          </span>
          <span className="input-value">
            ••••••••••••
            <i className="caret" />
          </span>
          <span className="input-trailing">
            <PasswordEye />
          </span>
        </span>
        <Strength level={4} label="Mạnh" />
      </div>
      <Field
        label="Nhập lại"
        icon={<Lock size={17} strokeWidth={1.8} />}
        value="••••••••••••"
        state="ok"
        trailing={<Check size={17} strokeWidth={2.4} className="ok-mark" />}
        hint={device === "desktop" ? "Hai mật khẩu khớp nhau" : undefined}
      />
      <Btn kind="primary" size="lg" block>
        Lưu và đăng nhập
      </Btn>
    </div>
  );
}

export function Forgot({ device }: { device: Device }) {
  if (device === "mobile") {
    return (
      <Root device="mobile" className="bg-auth">
        <StatusBar />
        <MobileAppBar
          title="Lấy lại mật khẩu"
          left={
            <IconBtn>
              <ChevronLeft size={22} />
            </IconBtn>
          }
        />
        <div className="m-page">
          <div className="m-card">
            <ForgotRequest device="mobile" />
          </div>
          <div className="m-connector">
            <ArrowDown size={14} strokeWidth={2.2} />
            Bấm link trong email sẽ mở
          </div>
          <div className="m-card">
            <ForgotReset device="mobile" />
          </div>
        </div>
        <HomeBar />
      </Root>
    );
  }
  return (
    <Root device="desktop" className="bg-auth">
      <AuthHero
        headline={
          <>
            Quên mật khẩu
            <br />
            không mất chỗ ngồi.
          </>
        }
        sub="Chip và lịch sử vẫn nằm yên ở bàn. Đặt lại mật khẩu là vào chơi tiếp."
      />
      <div className="auth-main is-split is-forgot">
        <div className="auth-col">
          <span className="step-label">
            <i>1</i> Xin link đặt lại
          </span>
          <div className="auth-card">
            <ForgotRequest device="desktop" />
          </div>
        </div>
        <span className="flow-arrow">
          <ArrowRight size={18} strokeWidth={2} />
          <small>link trong email</small>
        </span>
        <div className="auth-col">
          <span className="step-label">
            <i>2</i> Mở từ link
          </span>
          <div className="auth-card">
            <ForgotReset device="desktop" />
          </div>
        </div>
      </div>
    </Root>
  );
}

/* ================= upgrade guest ================= */

function GuestPass({ device }: { device: Device }) {
  return (
    <div className={`guest-pass gp-${device}`}>
      <div className="gp-head">
        <span>
          <small>Thẻ khách</small>
          <b>{GUEST.name}</b>
        </span>
        <Badge kind="muted">Chỉ trên máy này</Badge>
      </div>
      <ul className="gp-rooms">
        {GUEST.rooms.map((r) => (
          <li key={r.name}>
            <span>{r.name}</span>
            <b>
              <ChipStack amount={r.chips} size={14} max={3} />
              {fmt(r.chips)}
            </b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function KeepRibbon() {
  return (
    <div className="keep-ribbon">
      <ShieldCheck size={18} strokeWidth={2} />
      <span>
        <b>Giữ nguyên chip và lịch sử</b>
        <small>Cả 2 phòng chuyển sang tài khoản mới, không mất ván nào.</small>
      </span>
    </div>
  );
}

function UpgradeForm({ device }: { device: Device }) {
  return (
    <div className="form-stack">
      <Btn kind="light" size="lg" block icon={<GoogleG />}>
        Nâng cấp bằng Google
      </Btn>
      <Or label="hoặc bằng email" />
      <Field label="Email" icon={<Mail size={17} strokeWidth={1.8} />} value="lym@example.com" />
      <Field
        label="Mật khẩu"
        icon={<Lock size={17} strokeWidth={1.8} />}
        placeholder="Ít nhất 8 ký tự"
        state="focus"
        trailing={<PasswordEye />}
      />
      <Btn kind="primary" size="lg" block>
        Nâng cấp & giữ chip
      </Btn>
      {device === "desktop" && (
        <p className="form-foot">
          Tên ở bàn đổi được sau trong <span className="link">Hồ sơ</span>.
        </p>
      )}
    </div>
  );
}

export function Upgrade({ device }: { device: Device }) {
  if (device === "mobile") {
    return (
      <Root device="mobile" className="bg-auth">
        <StatusBar />
        <MobileAppBar
          title="Nâng cấp tài khoản"
          left={
            <IconBtn>
              <ChevronLeft size={22} />
            </IconBtn>
          }
        />
        <div className="m-page">
          <GuestPass device="mobile" />
          <KeepRibbon />
          <UpgradeForm device="mobile" />
          <p className="m-note">Khách chỉ lưu trên trình duyệt này — xoá dữ liệu trình duyệt là mất chỗ.</p>
        </div>
        <HomeBar />
      </Root>
    );
  }
  return (
    <Root device="desktop" className="bg-auth">
      <AuthHero
        headline={
          <>
            Giữ chỗ của bạn
            <br />
            ở bàn quen.
          </>
        }
        sub="Bạn đang chơi bằng khách. Nâng cấp để chip và lịch sử đi theo bạn sang mọi máy."
      />
      <div className="auth-main is-split">
        <div className="auth-col is-narrow upgrade-visual">
          <span className="step-label">Bạn đang có</span>
          <GuestPass device="desktop" />
          <span className="upgrade-arrow">
            <ArrowDown size={18} strokeWidth={2} />
          </span>
          <div className="member-card">
            <span className="member-crest">
              <BadgeCheck size={20} strokeWidth={1.8} />
            </span>
            <span>
              <small>Thành viên</small>
              <b>lym@example.com</b>
            </span>
            <span className="member-chips">
              <b>1.690</b>
              <small>chip · 2 phòng</small>
            </span>
          </div>
          <KeepRibbon />
        </div>
        <div className="auth-col">
          <span className="step-label">Nâng cấp</span>
          <div className="auth-card">
            <h2 className="auth-title">Trở thành thành viên</h2>
            <p className="auth-sub">Chọn một cách đăng nhập cho lần sau.</p>
            <UpgradeForm device="desktop" />
          </div>
          <p className="auth-legal">Khách chỉ lưu trên trình duyệt này — xoá dữ liệu trình duyệt là mất chỗ.</p>
        </div>
      </div>
    </Root>
  );
}

/* ================= profile ================= */

function ProfileRooms({ device }: { device: Device }) {
  const total = PROFILE.rooms.reduce((a, r) => a + r.net, 0);
  return (
    <div className={`p-rooms p-rooms-${device}`}>
      {PROFILE.rooms.map((r) => (
        <div key={r.name} className="p-room">
          <span className="p-room-mini">
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
          <ChevronRight size={18} className="p-chev" />
        </div>
      ))}
      <div className="p-total">
        <span>Tổng lời/lỗ các phòng</span>
        <b className={`is-${tone(total)}`}>{signed(total)}</b>
      </div>
    </div>
  );
}

function ProfileMethods() {
  return (
    <ul className="p-methods">
      <li>
        <span className="p-m-icon">
          <KeyRound size={17} strokeWidth={1.8} />
        </span>
        <span>
          <b>{PROFILE.methods[0]}</b>
          <small>Đổi lần cuối 12/10/2026</small>
        </span>
        <span className="link">Đổi mật khẩu</span>
      </li>
      <li>
        <span className="p-m-icon">
          <GoogleG size={16} />
        </span>
        <span>
          <b>{PROFILE.methods[1]}</b>
          <small>Đã liên kết với {PROFILE.email}</small>
        </span>
        <Badge kind="gain" icon={<Check size={12} strokeWidth={3} />}>
          Đã liên kết
        </Badge>
      </li>
    </ul>
  );
}

export function Profile({ device }: { device: Device }) {
  if (device === "mobile") {
    return (
      <Root device="mobile" className="bg-app">
        <StatusBar />
        <MobileAppBar title="Hồ sơ" right={<span className="link">Sửa</span>} />
        <div className="m-page m-profile">
          <div className="p-id-m">
            <Avatar name={PROFILE.name} size={64} className="av-lg" />
            <span>
              <b>{PROFILE.name}</b>
              <small>
                {PROFILE.email}
                <Badge kind="gain" icon={<BadgeCheck size={12} strokeWidth={2.4} />}>
                  Đã xác minh
                </Badge>
              </small>
            </span>
          </div>
          <h4 className="m-sec">Phòng đang có chip</h4>
          <ProfileRooms device="mobile" />
          <h4 className="m-sec">Cách đăng nhập</h4>
          <ProfileMethods />
          <Btn kind="danger" size="lg" block icon={<LogOut size={17} />}>
            Đăng xuất
          </Btn>
        </div>
        <MobileTabBar active="profile" />
        <HomeBar />
      </Root>
    );
  }
  return (
    <Root device="desktop" className="bg-app">
      <DesktopNav active="profile" />
      <main className="page">
        <div className="page-head">
          <span>
            <span className="eyebrow">Tài khoản</span>
            <h1 className="page-title">Hồ sơ</h1>
          </span>
        </div>
        <div className="profile-grid">
          <div className="panel p-card">
            <Avatar name={PROFILE.name} size={96} className="av-lg" />
            <h2 className="p-name">
              {PROFILE.name}
              <span className="p-edit">
                <Pencil size={14} />
              </span>
            </h2>
            <span className="p-email">
              {PROFILE.email}
              <Badge kind="gain" icon={<BadgeCheck size={12} strokeWidth={2.4} />}>
                Đã xác minh
              </Badge>
            </span>
            <div className="p-stats">
              <span>
                <b>38</b>
                <small>ván tối nay</small>
              </span>
              <span>
                <b>2</b>
                <small>phòng có chip</small>
              </span>
              <span>
                <b>1</b>
                <small>bàn làm chủ</small>
              </span>
            </div>
            <Btn kind="danger" block icon={<LogOut size={16} />}>
              Đăng xuất
            </Btn>
          </div>
          <div className="profile-right">
            <div className="panel">
              <div className="panel-head">
                <h3>Phòng đang có chip</h3>
                <span className="link">Xem lịch sử</span>
              </div>
              <ProfileRooms device="desktop" />
            </div>
            <div className="panel">
              <div className="panel-head">
                <h3>Cách đăng nhập</h3>
              </div>
              <ProfileMethods />
              <Field label="Tên ở bàn" value="Lym" hint="Hiện cho mọi người ở bàn và trong lịch sử." trailing={<span className="link">Lưu</span>} />
            </div>
          </div>
        </div>
      </main>
    </Root>
  );
}
