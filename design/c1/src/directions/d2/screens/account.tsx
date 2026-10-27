// Account screens: login, signup, forgot/reset, guest upgrade, profile.
import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check as CheckIcon,
  ChevronLeft,
  ChevronRight,
  Eye,
  KeyRound,
  LogOut,
  Mail,
  MailCheck,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";

import { GUEST, HANDS, ME, PROFILE, card } from "../../../shared/data";
import type { Device } from "../../../shared/screens";
import {
  Avatar,
  Badge,
  Brand,
  Btn,
  Check,
  Field,
  HomeBar,
  IconBtn,
  Ornament,
  PCard,
  Root,
  SecHead,
  StatusBar,
  TabBar,
  TopNav,
  fmt,
  signed,
  toneOf,
} from "../ui";

const ic = { size: 17, strokeWidth: 1.8 } as const;

function GoogleMark() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="#fff" stroke="#d9cfbe" />
      <text x="10" y="14.2" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#4f6472" fontFamily="Be Vietnam Pro, sans-serif">
        G
      </text>
    </svg>
  );
}

function Or() {
  return (
    <div className="or">
      <span />
      hoặc
      <span />
    </div>
  );
}

function Strength({ level, text }: { level: number; text: ReactNode }) {
  return (
    <div className="strength">
      <div className="strength-bars">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className={i < level ? `on l${level}` : ""} />
        ))}
      </div>
      <small>{text}</small>
    </div>
  );
}

function Rules({ items }: { items: [string, boolean][] }) {
  return (
    <ul className="rules">
      {items.map(([t, ok]) => (
        <li key={t} className={ok ? "ok" : ""}>
          {ok ? <CheckIcon size={12} strokeWidth={2.4} /> : <span className="dot" />}
          {t}
        </li>
      ))}
    </ul>
  );
}

const pwRight = (
  <span className="input-r">
    <Eye size={16} strokeWidth={1.8} />
  </span>
);

/* ---------- the editorial poster used by login ---------- */

function ScoreExcerpt() {
  const rows: [string, number][] = [
    ["Chi", 1130],
    ["An", 110],
    ["Bình", 0],
    ["Lym", -540],
  ];
  return (
    <div className="excerpt">
      <div className="excerpt-h">
        <span className="serif">Bàn thứ Sáu</span>
        <span className="mono">tối 24/10 · 38 ván</span>
      </div>
      {rows.map(([n, v]) => (
        <div key={n} className="excerpt-r">
          <span>{n}</span>
          <span className="dots" />
          <span className={`mono ${toneOf(v)}`}>{signed(v)}</span>
        </div>
      ))}
      <div className="excerpt-t">
        <span>Cộng</span>
        <span className="mono">0</span>
      </div>
    </div>
  );
}

function Poster() {
  return (
    <div className="poster">
      <Brand size="lg" />
      <div className="poster-main">
        <span className="eyebrow">Texas Hold'em · chip ảo · giữa bạn bè</span>
        <h1 className="serif">
          Bàn quen của hội bạn,
          <br />
          sổ điểm luôn rõ ràng.
        </h1>
        <p>Không tiền thật, không rake. Chỉ có ván bài, một tách trà và cuốn sổ ghi lời/lỗ minh bạch cho từng phòng.</p>
      </div>
      <div className="poster-art">
        <ScoreExcerpt />
        <div className="poster-cards">
          <PCard c={card("As")} size="xl" style={{ transform: "rotate(-9deg)" }} />
          <PCard c={card("Kh")} size="xl" style={{ transform: "rotate(6deg) translate(-26px, 10px)" }} />
        </div>
      </div>
      <div className="poster-facts">
        <span>
          <b>Chip theo từng phòng</b>chủ phòng cấp, sổ ghi lại mọi thay đổi
        </span>
        <span>
          <b>Xem lại mọi ván</b>từng bước, bài người khác vẫn úp
        </span>
        <span>
          <b>Thưởng 7-2</b>tuỳ phòng, bluff thành công mới có
        </span>
      </div>
    </div>
  );
}

/* ---------- login ---------- */

function LoginForm({ mobile }: { mobile?: boolean }) {
  return (
    <div className="auth-form">
      {!mobile && <span className="eyebrow">Chào mừng trở lại</span>}
      {!mobile && <h2 className="serif">Đăng nhập</h2>}
      <Field label="Email" value="lym@example.com" icon={<Mail {...ic} />} />
      <Field
        label="Mật khẩu"
        value="••••••••••"
        icon={<KeyRound {...ic} />}
        right={pwRight}
        state="focus"
        aside={<span className="link">Quên mật khẩu?</span>}
      />
      {!mobile && <Check on>Ghi nhớ trên máy này</Check>}
      <Btn v="ink" s={mobile ? "xl" : "lg"} block>
        Đăng nhập
      </Btn>
      <Or />
      <Btn v="line" s={mobile ? "xl" : "lg"} block icon={<GoogleMark />}>
        Tiếp tục với Google
      </Btn>
      <Btn v="paper" s={mobile ? "xl" : "lg"} block icon={<UserRound {...ic} />}>
        Chơi ngay bằng khách
      </Btn>
      <small className="auth-note">Khách vào chơi được ngay; nâng cấp sau vẫn giữ nguyên chip và lịch sử.</small>
      <div className="auth-foot">
        Chưa có tài khoản? <span className="link">Đăng ký</span>
      </div>
    </div>
  );
}

export function Login({ device }: { device: Device }) {
  if (device === "desktop")
    return (
      <Root device="desktop" className="auth">
        <Poster />
        <div className="auth-side">
          <div className="auth-card">
            <LoginForm />
          </div>
        </div>
      </Root>
    );
  return (
    <Root device="mobile" className="auth">
      <StatusBar />
      <div className="m-auth-top ruled">
        <Brand />
        <h1 className="serif">
          Bàn quen,
          <br />
          sổ điểm rõ ràng.
        </h1>
        <Ornament />
      </div>
      <div className="m-auth-body">
        <LoginForm mobile />
      </div>
      <HomeBar />
    </Root>
  );
}

/* ---------- two-step board used by signup & forgot on desktop ---------- */

function StepBoard({
  title,
  sub,
  steps,
  link,
}: {
  title: string;
  sub: string;
  steps: [ReactNode, ReactNode];
  link: ReactNode;
}) {
  return (
    <>
      <header className="board-head">
        <Brand />
        <span className="board-head-r">{link}</span>
      </header>
      <div className="board-title">
        <h1 className="serif">{title}</h1>
        <p>{sub}</p>
      </div>
      <div className="steps">
        {steps[0]}
        <span className="step-arrow">
          <ArrowRight size={22} strokeWidth={1.6} />
        </span>
        {steps[1]}
      </div>
    </>
  );
}

function StepCard({ n, label, children, tone }: { n: number; label: string; children: ReactNode; tone?: "done" }) {
  return (
    <section className={`step-card${tone ? ` ${tone}` : ""}`}>
      <div className="step-tag">
        <b className="mono">{n}</b>
        <span className="eyebrow">{label}</span>
      </div>
      {children}
    </section>
  );
}

/* ---------- signup ---------- */

function SignupFields({ compact }: { compact?: boolean }) {
  return (
    <>
      <Field label="Email" value="lym@example.com" icon={<Mail {...ic} />} />
      <Field label="Tên ở bàn" value="Lym" hint={compact ? undefined : "Bạn bè sẽ thấy tên này cạnh ghế của bạn."} />
      <Field label="Mật khẩu" value="•••••••••••" icon={<KeyRound {...ic} />} right={pwRight} state="focus" />
      <Strength level={3} text={<><b>Khá mạnh</b> · thêm ký tự đặc biệt để mạnh hơn</>} />
      {!compact && (
        <Rules
          items={[
            ["Ít nhất 8 ký tự", true],
            ["Có chữ số", true],
            ["Có ký tự đặc biệt", false],
          ]}
        />
      )}
    </>
  );
}

function SentNotice({ mobile }: { mobile?: boolean }) {
  return (
    <div className="sent">
      <span className="sent-ic">
        <MailCheck size={mobile ? 26 : 30} strokeWidth={1.6} />
      </span>
      <h2 className="serif">Mở email để xác minh</h2>
      <p>
        Đã gửi thư tới <b>{ME.email}</b>. Bấm link trong thư để kích hoạt tài khoản — link có hạn 24 giờ.
      </p>
      <Btn v="ink" s="lg" block>
        Mở ứng dụng thư
      </Btn>
      <Btn v="line" s="lg" block disabled>
        Gửi lại thư · <span className="mono">0:45</span>
      </Btn>
      <small className="auth-note">
        Sai email? <span className="link">Sửa lại</span>
      </small>
    </div>
  );
}

export function Signup({ device }: { device: Device }) {
  if (device === "desktop")
    return (
      <Root device="desktop" className="auth paged">
        <StepBoard
          title="Tạo tài khoản"
          sub="Một tài khoản dùng cho mọi phòng. Chip vẫn tính riêng từng phòng."
          link={
            <>
              Đã có tài khoản? <span className="link">Đăng nhập</span>
            </>
          }
          steps={[
            <StepCard key="a" n={1} label="Điền thông tin">
              <div className="auth-form">
                <SignupFields />
                <Btn v="ink" s="lg" block>
                  Tạo tài khoản
                </Btn>
                <Or />
                <Btn v="line" s="lg" block icon={<GoogleMark />}>
                  Đăng ký với Google
                </Btn>
              </div>
            </StepCard>,
            <StepCard key="b" n={2} label="Sau khi gửi" tone="done">
              <SentNotice />
            </StepCard>,
          ]}
        />
      </Root>
    );
  return (
    <Root device="mobile" className="auth">
      <StatusBar />
      <div className="mbar">
        <IconBtn icon={<ChevronLeft size={22} strokeWidth={1.8} />} label="Quay lại" />
        <b className="serif">Tạo tài khoản</b>
        <span className="mbar-sp" />
      </div>
      <div className="m-auth-body tight">
        <div className="auth-form">
          <SignupFields compact />
          <Btn v="ink" s="xl" block>
            Tạo tài khoản
          </Btn>
        </div>
      </div>
      <div className="veil" />
      <div className="msheet sent-sheet" style={{ top: 420 }}>
        <span className="handle" />
        <SentNotice mobile />
        <HomeBar />
      </div>
    </Root>
  );
}

/* ---------- forgot / reset ---------- */

function ForgotCard({ compact }: { compact?: boolean }) {
  return (
    <div className="auth-form">
      <h2 className="serif">Quên mật khẩu</h2>
      <p className="muted">Nhập email bạn dùng để đăng nhập. Chúng tôi gửi một link đặt lại.</p>
      <Field label={compact ? undefined : "Email"} value="lym@example.com" icon={<Mail {...ic} />} />
      <Btn v="ink" s="lg" block>
        Gửi link đặt lại
      </Btn>
      <div className="inline-ok">
        <CheckIcon size={14} strokeWidth={2.4} />
        <span>Đã gửi. Nếu email có tài khoản, link sẽ tới trong vài phút.</span>
      </div>
    </div>
  );
}

function ResetCard({ compact }: { compact?: boolean }) {
  return (
    <div className="auth-form">
      <h2 className="serif">Đặt mật khẩu mới</h2>
      <p className="muted">
        Cho <b>{ME.email}</b> · link dùng được một lần, hết hạn sau 1 giờ.
      </p>
      <Field label="Mật khẩu mới" value="••••••••••••" icon={<KeyRound {...ic} />} right={pwRight} />
      <Strength level={4} text={<b>Mạnh</b>} />
      <Field
        label="Nhập lại"
        value="••••••••••••"
        icon={<KeyRound {...ic} />}
        state="ok"
        hint={compact ? undefined : "Khớp với mật khẩu mới."}
        right={
          <span className="input-r ok">
            <CheckIcon size={16} strokeWidth={2.2} />
          </span>
        }
      />
      <Btn v="red" s="lg" block>
        Lưu mật khẩu mới
      </Btn>
    </div>
  );
}

export function Forgot({ device }: { device: Device }) {
  if (device === "desktop")
    return (
      <Root device="desktop" className="auth paged">
        <StepBoard
          title="Lấy lại mật khẩu"
          sub="Hai bước: xin link qua email, rồi đặt mật khẩu mới từ link đó."
          link={
            <>
              Nhớ ra rồi? <span className="link">Đăng nhập</span>
            </>
          }
          steps={[
            <StepCard key="a" n={1} label="Xin link">
              <ForgotCard />
            </StepCard>,
            <StepCard key="b" n={2} label="Mở link trong email">
              <ResetCard />
            </StepCard>,
          ]}
        />
      </Root>
    );
  return (
    <Root device="mobile" className="auth">
      <StatusBar />
      <div className="mbar">
        <IconBtn icon={<ChevronLeft size={22} strokeWidth={1.8} />} label="Quay lại" />
        <b className="serif">Lấy lại mật khẩu</b>
        <span className="mbar-sp" />
      </div>
      <div className="m-stack">
        <section className="m-card">
          <ForgotCard compact />
        </section>
        <div className="m-flow">
          <span className="sec-rule" />
          <ArrowDown size={14} strokeWidth={2} />
          <span>mở link trong email</span>
          <span className="sec-rule" />
        </div>
        <section className="m-card">
          <ResetCard compact />
        </section>
      </div>
      <HomeBar />
    </Root>
  );
}

/* ---------- guest upgrade ---------- */

function GuestCard() {
  return (
    <div className="guest">
      <div className="guest-who">
        <span className="av av-guest" style={{ width: 44, height: 44 }}>
          <UserRound size={22} strokeWidth={1.7} />
        </span>
        <span>
          <b className="mono">{GUEST.name}</b>
          <Badge kind="dash">Khách</Badge>
        </span>
      </div>
      <div className="guest-rooms">
        {GUEST.rooms.map((r) => (
          <div key={r.name} className="guest-r">
            <span>{r.name}</span>
            <span className="mono">{fmt(r.chips)}</span>
            <span className="keep">
              <CheckIcon size={12} strokeWidth={2.6} /> giữ nguyên
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function KeepBanner() {
  return (
    <div className="keep-banner">
      <ShieldCheck size={22} strokeWidth={1.7} />
      <span>
        <b>Giữ nguyên chip và lịch sử.</b> Cùng một người chơi, chỉ thêm email hoặc Google để đăng nhập lại ở máy khác.
      </span>
    </div>
  );
}

function UpgradeForm({ compact }: { compact?: boolean }) {
  return (
    <div className="auth-form">
      <Field label="Email" value="lym@example.com" icon={<Mail {...ic} />} />
      <Field label="Tên ở bàn" value="Lym" hint={compact ? undefined : `Đang là “${GUEST.name}”.`} state="focus" />
      <Field label="Mật khẩu" value="••••••••••" icon={<KeyRound {...ic} />} right={pwRight} />
      <Btn v="red" s={compact ? "xl" : "lg"} block>
        Nâng cấp bằng email
      </Btn>
      <Or />
      <Btn v="line" s={compact ? "xl" : "lg"} block icon={<GoogleMark />}>
        Nâng cấp bằng Google
      </Btn>
    </div>
  );
}

export function Upgrade({ device }: { device: Device }) {
  if (device === "desktop")
    return (
      <Root device="desktop" className="paged">
        <TopNav guest={GUEST.name} />
        <div className="page upgrade">
          <div className="page-head">
            <span className="eyebrow">Tài khoản khách</span>
            <h1 className="serif">Nâng cấp, không mất gì</h1>
            <p>Bạn đang chơi bằng tài khoản khách. Thêm email hoặc Google để giữ lâu dài.</p>
          </div>
          <div className="up-grid">
            <section className="panel">
              <SecHead title="Bạn bây giờ" />
              <GuestCard />
              <div className="up-flow">
                <span className="sec-rule" />
                <ArrowDown size={16} strokeWidth={1.8} />
                <span className="sec-rule" />
              </div>
              <div className="guest after">
                <div className="guest-who">
                  <Avatar name="Lym" size={44} />
                  <span>
                    <b>Lym</b>
                    <small>{ME.email}</small>
                  </span>
                </div>
                <div className="guest-rooms">
                  {GUEST.rooms.map((r) => (
                    <div key={r.name} className="guest-r">
                      <span>{r.name}</span>
                      <span className="mono">{fmt(r.chips)}</span>
                      <span className="keep">
                        <CheckIcon size={12} strokeWidth={2.6} /> vẫn vậy
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
            <section className="panel">
              <SecHead title="Thêm cách đăng nhập" />
              <KeepBanner />
              <UpgradeForm />
            </section>
          </div>
        </div>
      </Root>
    );
  return (
    <Root device="mobile">
      <StatusBar />
      <div className="mbar">
        <IconBtn icon={<X size={22} strokeWidth={1.8} />} label="Đóng" />
        <b className="serif">Nâng cấp tài khoản</b>
        <span className="mbar-sp" />
      </div>
      <div className="m-stack up-m">
        <KeepBanner />
        <GuestCard />
        <UpgradeForm compact />
      </div>
      <HomeBar />
    </Root>
  );
}

/* ---------- profile ---------- */

function Methods() {
  return (
    <div className="methods">
      <div className="method">
        <KeyRound {...ic} />
        <span>
          <b>{PROFILE.methods[0]}</b>
          <small>Đặt lần cuối 12/10/2026</small>
        </span>
        <span className="link">Đổi</span>
      </div>
      <div className="method">
        <GoogleMark />
        <span>
          <b>{PROFILE.methods[1]}</b>
          <small>Đã liên kết · {PROFILE.email}</small>
        </span>
        <span className="link muted">Gỡ</span>
      </div>
    </div>
  );
}

function ProfileRooms() {
  return (
    <div className="ruled-table rooms-t">
      <div className="rt-h">
        <span>Phòng</span>
        <span className="r">Còn</span>
        <span className="r">Lời / lỗ</span>
        <span />
      </div>
      {PROFILE.rooms.map((r) => (
        <div key={r.name} className="rt-r">
          <span className="rt-name">{r.name}</span>
          <span className="mono r">{fmt(r.balance)}</span>
          <span className={`mono r ${toneOf(r.net)}`}>{signed(r.net)}</span>
          <span className="r">
            <ChevronRight size={16} strokeWidth={1.8} />
          </span>
        </div>
      ))}
    </div>
  );
}

export function Profile({ device }: { device: Device }) {
  const mine = HANDS.filter((h) => h.players.some((p) => p.name === "Lym"));
  if (device === "desktop")
    return (
      <Root device="desktop" className="paged">
        <TopNav active="profile" />
        <div className="page profile">
          <section className="panel id-card">
            <Avatar name="Lym" size={76} />
            <h1 className="serif">{PROFILE.name}</h1>
            <div className="id-mail">
              <span>{PROFILE.email}</span>
              {PROFILE.verified && (
                <Badge kind="sage" icon={<ShieldCheck size={12} strokeWidth={2} />}>
                  Đã xác minh
                </Badge>
              )}
            </div>
            <SecHead title="Cách đăng nhập" />
            <Methods />
            <Btn v="line" s="lg" block icon={<LogOut size={16} strokeWidth={1.9} />}>
              Đăng xuất
            </Btn>
          </section>
          <div className="profile-main">
            <section className="panel">
              <SecHead title="Phòng đang có chip" meta={`${PROFILE.rooms.length} phòng`} />
              <ProfileRooms />
              <p className="note">Chip tính riêng từng phòng — không cộng dồn, không chuyển qua lại giữa các phòng.</p>
            </section>
            <section className="panel">
              <SecHead title="Ván gần đây của bạn" meta="Bàn thứ Sáu" />
              <div className="ruled-table">
                {mine.map((h) => {
                  const me = h.players.find((p) => p.name === "Lym")!;
                  const top = h.players.reduce((a, b) => (b.net > a.net ? b : a));
                  return (
                    <div key={h.no} className="rt-r recent">
                      <span className="mono">#{h.no}</span>
                      <span className="mono muted">{h.at}</span>
                      <span>
                        {top.name} thắng <span className="mono">{fmt(top.net)}</span>
                      </span>
                      <span className={`mono r ${toneOf(me.net)}`}>{signed(me.net)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </Root>
    );
  return (
    <Root device="mobile">
      <StatusBar />
      <div className="m-stack profile-m">
        <div className="m-id">
          <Avatar name="Lym" size={64} />
          <div>
            <h1 className="serif">{PROFILE.name}</h1>
            <span>{PROFILE.email}</span>
            <Badge kind="sage" icon={<ShieldCheck size={12} strokeWidth={2} />}>
              Đã xác minh
            </Badge>
          </div>
        </div>
        <SecHead title="Phòng đang có chip" />
        <ProfileRooms />
        <p className="note">Chip tính riêng từng phòng, không cộng dồn.</p>
        <SecHead title="Cách đăng nhập" />
        <Methods />
        <Btn v="line" s="lg" block icon={<LogOut size={16} strokeWidth={1.9} />}>
          Đăng xuất
        </Btn>
      </div>
      <TabBar active="profile" />
    </Root>
  );
}
