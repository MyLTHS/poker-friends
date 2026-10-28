// Kính & Ánh Kim (d2) — account screens: login, signup, forgot/reset, guest upgrade, profile.
import type { ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Coins,
  Eye,
  KeyRound,
  Link2,
  LogOut,
  Mail,
  MailCheck,
  Pencil,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import { GUEST, HANDS, PROFILE } from "../../../shared/data";
import type { Device } from "../../../shared/screens";
import { fmt, signed, tone } from "../lib";
import { AuthLayout, HeroArt, HeroCopy, MBar, Shell } from "../shell";
import { Avatar, Btn, Chip, Divider, Eyebrow, Field, Glass, GoogleG, Mark, OkTick, Root, Spark, Strength } from "../ui";

const eye = <Eye size={18} strokeWidth={2} />;
const mailIc = <Mail size={18} strokeWidth={2} />;
const keyIc = <KeyRound size={18} strokeWidth={2} />;

function Feats() {
  return (
    <ul className="k-feats">
      <li>
        <Coins size={17} strokeWidth={2} /> Chip ảo, không tiền thật
      </li>
      <li>
        <Link2 size={17} strokeWidth={2} /> Bàn riêng bằng link mời
      </li>
      <li>
        <Sparkles size={17} strokeWidth={2} /> Thưởng 7-2 cho cú bluff
      </li>
    </ul>
  );
}

/* ================================================================== login */

function LoginForm({ d }: { d: Device }) {
  const mob = d === "mobile";
  return (
    <div className={`k-form ${mob ? "k-form-m" : ""}`}>
      <div className="k-form-head">
        {!mob && <Eyebrow>Chào mừng trở lại</Eyebrow>}
        <h2 className="k-h2">Đăng nhập</h2>
        {!mob && <p className="k-lead">Giữ chip và lịch sử ở mọi phòng.</p>}
      </div>
      <Field label="Email" value="lym@example.com" icon={mailIc} />
      <Field label="Mật khẩu" value="••••••••••" secret state="focus" icon={keyIc} right={eye} aside="Quên mật khẩu?" />
      {mob ? (
        <div className="k-row2">
          <Btn tone="gold" size="md" block>
            Đăng nhập
          </Btn>
          <Btn tone="light" size="md" block icon={<GoogleG />}>
            Google
          </Btn>
        </div>
      ) : (
        <>
          <Btn tone="gold" size="lg" block>
            Đăng nhập
          </Btn>
          <Divider>hoặc</Divider>
          <Btn tone="light" size="lg" block icon={<GoogleG />}>
            Tiếp tục với Google
          </Btn>
          <Btn tone="glass" size="lg" block>
            Chơi ngay bằng khách <small className="k-btn-note">không cần email</small>
          </Btn>
        </>
      )}
      <span className="k-form-foot">
        Chưa có tài khoản? <b>Đăng ký</b>
      </span>
    </div>
  );
}

function Login({ device: d }: { device: Device }) {
  if (d === "desktop")
    return (
      <AuthLayout
        device={d}
        wide
        hero={
          <>
            <HeroCopy
              device={d}
              title="Ván bài của hội,"
              gold="trên tầng cao nhất."
              sub="Chip ảo, bàn riêng cho bạn bè. Vào bàn trong vài giây, chip và lịch sử giữ nguyên ở mọi phòng."
            />
            <HeroArt size="lg" />
            <Feats />
          </>
        }
      >
        <Glass strong className="k-authcard">
          <LoginForm d={d} />
        </Glass>
      </AuthLayout>
    );
  return (
    <AuthLayout
      device={d}
      hero={
        <>
          <HeroCopy device={d} title="Ván bài của hội," gold="trên tầng cao nhất." />
          <HeroArt size="sm" />
          <Btn tone="glass" block>
            Chơi ngay bằng khách <small className="k-btn-note">không cần email</small>
          </Btn>
        </>
      }
    >
      <Glass strong className="k-authcard k-authcard-m">
        <LoginForm d={d} />
      </Glass>
    </AuthLayout>
  );
}

/* ================================================================= signup */

function PwRules() {
  return (
    <span className="k-rules">
      <span className="ok">
        <Check size={13} strokeWidth={3} /> 8+ ký tự
      </span>
      <span className="ok">
        <Check size={13} strokeWidth={3} /> có số
      </span>
      <span>
        <X size={13} strokeWidth={3} /> ký tự đặc biệt
      </span>
    </span>
  );
}

function SignupForm({ d }: { d: Device }) {
  const mob = d === "mobile";
  const email = <Field label="Email" value="lym@example.com" icon={mob ? undefined : mailIc} state="ok" right={mob ? undefined : <OkTick />} />;
  const name = <Field label="Tên ở bàn" value="Lym" hint={mob ? undefined : "Mọi người thấy tên này cạnh ghế của bạn. Đổi được sau."} />;
  return (
    <div className={`k-form ${mob ? "k-form-m" : ""}`}>
      <div className="k-form-head">
        {!mob && <Eyebrow>Tạo tài khoản</Eyebrow>}
        <h2 className="k-h2">Đăng ký</h2>
      </div>
      {mob ? (
        <div className="k-row2">
          {email}
          {name}
        </div>
      ) : (
        <>
          {email}
          {name}
        </>
      )}
      <Field label="Mật khẩu" value="•••••••••••" secret state="focus" icon={keyIc} right={eye} />
      <div className="k-pwmeter">
        <Strength level={3} label="Khá mạnh" />
        <PwRules />
      </div>
      <Btn tone="gold" size={mob ? "md" : "lg"} block>
        Tạo tài khoản
      </Btn>
      <span className="k-form-foot">
        Đã có tài khoản? <b>Đăng nhập</b>
      </span>
    </div>
  );
}

function Envelope({ d }: { d: Device }) {
  const s = d === "mobile" ? 0.62 : 1;
  return (
    <span className="k-envelope" style={{ width: 150 * s, height: 104 * s }}>
      <svg viewBox="0 0 150 104" width={150 * s} height={104 * s} aria-hidden>
        <defs>
          <linearGradient id="k-env" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F7F9FA" />
            <stop offset="1" stopColor="#C9D3D8" />
          </linearGradient>
          <linearGradient id="k-env-in" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#E6ECEF" />
            <stop offset="1" stopColor="#AEBBC1" />
          </linearGradient>
        </defs>
        <rect x="4" y="18" width="142" height="84" rx="10" fill="url(#k-env)" />
        <path d="M4 28 75 70l71-42v64a10 10 0 0 1-10 10H14A10 10 0 0 1 4 92z" fill="url(#k-env-in)" opacity="0.55" />
        <path d="M6 24 75 66l69-42" fill="none" stroke="#9AA9B0" strokeWidth="1.4" />
        <circle cx="75" cy="64" r="15" fill="url(#k-gold)" stroke="#7A5B30" strokeWidth="1" />
        <path d="M75 55c1.6 1.9 3.9 3.3 3.9 5.2 0 1.2-.9 2-2 2-.6 0-1.2-.3-1.5-.7.1 1.1.6 1.9 1.4 2.5h-3.6c.8-.6 1.3-1.4 1.4-2.5-.3.4-.9.7-1.5.7-1.1 0-2-.8-2-2 0-1.9 2.3-3.3 3.9-5.2z" fill="#2A1C07" />
      </svg>
      <i className="k-envelope-glow" />
    </span>
  );
}

function VerifyCard({ d }: { d: Device }) {
  const mob = d === "mobile";
  return (
    <div className={`k-verify ${mob ? "k-verify-m" : ""}`}>
      <Eyebrow tone="cyan">Sau khi gửi</Eyebrow>
      <Envelope d={d} />
      <b className="k-h3">Mở email để xác minh</b>
      <span className="k-verify-s">
        Đã gửi link tới <u>lym@example.com</u>. Bấm link trong 24 giờ là xong.
      </span>
      <div className={mob ? "k-row2" : "k-col2"}>
        <Btn tone="cyan" size={mob ? "md" : "lg"} block icon={<MailCheck size={17} strokeWidth={2.2} />}>
          Mở hộp thư
        </Btn>
        <Btn tone="ghost" size={mob ? "md" : "lg"} block>
          Gửi lại · <span className="k-num">0:45</span>
        </Btn>
      </div>
      {!mob && <small className="k-verify-tip">Không thấy thư? Xem trong mục Spam hoặc Quảng cáo.</small>}
    </div>
  );
}

function Pair({ a, b, label, d }: { a: ReactNode; b: ReactNode; label: string; d: Device }) {
  return (
    <div className={`k-pair k-pair-${d}`}>
      {a}
      <span className="k-pair-arrow">
        <i />
        <span>
          {label} <ArrowRight size={13} strokeWidth={2.4} />
        </span>
        <i />
      </span>
      {b}
    </div>
  );
}

function Signup({ device: d }: { device: Device }) {
  const pair = (
    <Pair
      d={d}
      label="gửi"
      a={
        <Glass strong className="k-authcard k-paircard">
          <SignupForm d={d} />
        </Glass>
      }
      b={
        <Glass className="k-authcard k-paircard k-paircard-after">
          <VerifyCard d={d} />
        </Glass>
      }
    />
  );
  if (d === "desktop")
    return (
      <AuthLayout
        device={d}
        hero={
          <>
            <HeroCopy device={d} title="Một tài khoản," gold="mọi bàn của hội." sub="Đăng ký để giữ chip, lịch sử và lời/lỗ ở mọi phòng bạn ngồi." />
            <HeroArt size="md" />
            <Feats />
          </>
        }
      >
        {pair}
      </AuthLayout>
    );
  return (
    <Root device={d} bg="auth">
      <div className="k-mauth2">{pair}</div>
    </Root>
  );
}

/* ================================================================= forgot */

function ForgotStep1({ d }: { d: Device }) {
  const mob = d === "mobile";
  return (
    <div className={`k-form ${mob ? "k-form-m" : ""}`}>
      <div className="k-form-head">
        <Eyebrow tone="cyan">Bước 1 · Quên mật khẩu</Eyebrow>
        <h2 className="k-h2">Quên mật khẩu?</h2>
        <p className="k-lead">Nhập email bạn dùng để đăng nhập, mình gửi link đặt lại ngay.</p>
      </div>
      <Field label="Email" value="lym@example.com" icon={mailIc} />
      <Btn tone="gold" size={mob ? "md" : "lg"} block>
        Gửi link đặt lại
      </Btn>
      <span className="k-sent">
        <OkTick />
        <span>
          Đã gửi! Kiểm tra hộp thư <b>lym@example.com</b>
        </span>
      </span>
    </div>
  );
}

function ForgotStep2({ d }: { d: Device }) {
  const mob = d === "mobile";
  return (
    <div className={`k-form ${mob ? "k-form-m" : ""}`}>
      <div className="k-form-head">
        <Eyebrow>Bước 2 · Mở từ link trong email</Eyebrow>
        <h2 className="k-h2">Đặt mật khẩu mới</h2>
      </div>
      <Field label="Mật khẩu mới" value="•••••••••••••" secret icon={keyIc} right={eye} />
      <Strength level={4} label="Rất mạnh" />
      <Field
        label="Nhập lại mật khẩu"
        value="•••••••••••••"
        secret
        state="ok"
        icon={keyIc}
        right={<OkTick />}
        hint={mob ? undefined : <span className="k-hint-ok">Khớp rồi</span>}
        aside={mob ? <span className="k-hint-ok">Khớp rồi</span> : undefined}
      />
      <Btn tone="gold" size={mob ? "md" : "lg"} block>
        Lưu mật khẩu mới
      </Btn>
    </div>
  );
}

function Forgot({ device: d }: { device: Device }) {
  const pair = (
    <Pair
      d={d}
      label="email"
      a={
        <Glass strong className="k-authcard k-paircard">
          <ForgotStep1 d={d} />
        </Glass>
      }
      b={
        <Glass strong className="k-authcard k-paircard">
          <ForgotStep2 d={d} />
        </Glass>
      }
    />
  );
  if (d === "desktop")
    return (
      <AuthLayout
        device={d}
        hero={
          <>
            <HeroCopy device={d} title="Quên mật khẩu?" gold="Lấy lại trong một phút." sub="Chip và lịch sử vẫn nằm yên trong tài khoản, chỉ cần đặt mật khẩu mới." />
            <HeroArt size="md" />
            <Feats />
          </>
        }
      >
        {pair}
      </AuthLayout>
    );
  return (
    <Root device={d} bg="auth">
      <div className="k-mauth2">{pair}</div>
    </Root>
  );
}

/* ================================================================ upgrade */

function Passes({ d }: { d: Device }) {
  const mob = d === "mobile";
  const total = GUEST.rooms.reduce((a, r) => a + r.chips, 0);
  return (
    <div className={`k-passes ${mob ? "k-passes-m" : ""}`}>
      <div className="k-pass k-pass-guest">
        <span className="k-pass-top">
          <small>Thẻ khách</small>
          <span className="k-pass-tag">Khách</span>
        </span>
        <span className="k-pass-who">
          <Avatar name="K" size={mob ? 30 : 40} />
          <b>{GUEST.name}</b>
        </span>
        <span className="k-pass-rooms">
          {GUEST.rooms.map((r) => (
            <span key={r.name}>
              {r.name}
              <b className="k-num">
                <Chip size={12} />
                {fmt(r.chips)}
              </b>
            </span>
          ))}
        </span>
      </div>
      <span className="k-pass-arrow">
        <ArrowRight size={mob ? 16 : 20} strokeWidth={2.4} />
      </span>
      <div className="k-pass k-pass-member">
        <span className="k-pass-top">
          <small>Tài khoản thật</small>
          <Mark size={mob ? 18 : 24} />
        </span>
        <span className="k-pass-chip">
          <small>Chip mang theo</small>
          <b className="k-num">{fmt(total)}</b>
        </span>
        <span className="k-pass-foot">
          <span>2 phòng · lịch sử giữ nguyên</span>
          <ShieldCheck size={mob ? 14 : 16} strokeWidth={2.2} />
        </span>
      </div>
    </div>
  );
}

function Promise({ d }: { d: Device }) {
  return (
    <div className={`k-promise ${d === "mobile" ? "k-promise-m" : ""}`}>
      <ShieldCheck size={d === "mobile" ? 22 : 28} strokeWidth={2} />
      <span>
        <b>Giữ nguyên chip và lịch sử</b>
        <small>Chip ở cả 2 phòng, ván đã chơi và lời/lỗ chuyển hết sang tài khoản mới.</small>
      </span>
    </div>
  );
}

function UpgradeForm({ d }: { d: Device }) {
  const mob = d === "mobile";
  const email = <Field label="Email" value="lym@example.com" icon={mob ? undefined : mailIc} />;
  const pw = <Field label="Mật khẩu" placeholder="Ít nhất 8 ký tự" state="focus" icon={mob ? undefined : keyIc} />;
  return (
    <div className={`k-form ${mob ? "k-form-m" : ""}`}>
      <div className="k-form-head">
        {!mob && <Eyebrow>Nâng cấp tài khoản</Eyebrow>}
        <h2 className="k-h2">{mob ? "Nâng cấp tài khoản" : "Chọn một cách"}</h2>
        {!mob && <p className="k-lead">Mất chưa tới một phút.</p>}
      </div>
      <Btn tone="light" size={mob ? "md" : "lg"} block icon={<GoogleG />}>
        Nâng cấp bằng Google
      </Btn>
      <Divider>hoặc bằng email</Divider>
      {mob ? (
        <div className="k-row2">
          {email}
          {pw}
        </div>
      ) : (
        <>
          {email}
          {pw}
        </>
      )}
      <Btn tone="gold" size={mob ? "md" : "lg"} block>
        Nâng cấp bằng email
      </Btn>
      <span className="k-form-foot">
        <b className="soft">Để sau</b> · khách sẽ mất chip nếu xoá dữ liệu trình duyệt
      </span>
    </div>
  );
}

function Upgrade({ device: d }: { device: Device }) {
  if (d === "desktop")
    return (
      <AuthLayout
        device={d}
        wide
        hero={
          <>
            <HeroCopy device={d} title="Đang chơi bằng khách?" gold="Lấy tài khoản thật." sub="Bạn đang là khách với chip ở 2 phòng. Nâng cấp để không mất gì khi đổi máy hay xoá trình duyệt." />
            <Passes d={d} />
            <Promise d={d} />
          </>
        }
      >
        <Glass strong className="k-authcard">
          <UpgradeForm d={d} />
        </Glass>
      </AuthLayout>
    );
  return (
    <AuthLayout
      device={d}
      hero={
        <>
          <Eyebrow>Đang là khách</Eyebrow>
          <Passes d={d} />
          <Promise d={d} />
        </>
      }
    >
      <Glass strong className="k-authcard k-authcard-m">
        <UpgradeForm d={d} />
      </Glass>
    </AuthLayout>
  );
}

/* ================================================================ profile */

const TRENDS: Record<string, number[]> = {
  "Bàn thứ Sáu": [0, 140, 60, 210, -120, -260, -400, -540],
  "Tập luyện nhẹ": [0, -40, -10, 50, 20, 30],
};

function Methods({ d }: { d: Device }) {
  const mob = d === "mobile";
  return (
    <div className="k-methods">
      <div className="k-method">
        <span className="k-method-ic">
          <KeyRound size={mob ? 16 : 18} strokeWidth={2} />
        </span>
        <span className="k-method-t">
          <b>{PROFILE.methods[0]}</b>
          <small>Đổi lần cuối 3 tuần trước</small>
        </span>
        <span className="k-method-a">Đổi</span>
      </div>
      <div className="k-method">
        <span className="k-method-ic light">
          <GoogleG size={mob ? 16 : 18} />
        </span>
        <span className="k-method-t">
          <b>{PROFILE.methods[1]}</b>
          <small>Đã liên kết · {PROFILE.email}</small>
        </span>
        <span className="k-method-ok">
          <Check size={14} strokeWidth={3} />
        </span>
      </div>
    </div>
  );
}

function RoomRows({ d }: { d: Device }) {
  const mob = d === "mobile";
  const total = PROFILE.rooms.reduce((a, r) => a + r.net, 0);
  return (
    <div className="k-prooms">
      {PROFILE.rooms.map((r) => (
        <div key={r.name} className="k-proom">
          <span className="k-proom-ic">
            <Mark size={mob ? 22 : 28} />
          </span>
          <span className="k-proom-t">
            <b>{r.name}</b>
            <small>
              còn <Chip size={11} /> <b className="k-num">{fmt(r.balance)}</b>
            </small>
          </span>
          <Spark points={TRENDS[r.name]} w={mob ? 70 : 140} h={mob ? 28 : 40} />
          <b className={`k-proom-net k-num k-${tone(r.net)}`}>{signed(r.net)}</b>
        </div>
      ))}
      <div className="k-proom-sum">
        <span>Tổng lời/lỗ 2 phòng</span>
        <b className={`k-num k-${tone(total)}`}>{signed(total)}</b>
      </div>
    </div>
  );
}

function Identity({ d }: { d: Device }) {
  const mob = d === "mobile";
  return (
    <div className={`k-ident ${mob ? "k-ident-m" : ""}`}>
      <Avatar name="Lym" size={mob ? 52 : 92} ring="gold" />
      <span className="k-ident-t">
        <b className={mob ? "k-h3" : "k-h1"}>
          {PROFILE.name}
          <span className="k-ident-edit">
            <Pencil size={mob ? 12 : 14} strokeWidth={2.2} />
          </span>
        </b>
        <span className="k-verified">
          {PROFILE.email}
          <span className="k-badge-ok">
            <BadgeCheck size={14} strokeWidth={2.2} /> Đã xác minh
          </span>
        </span>
      </span>
    </div>
  );
}

function Profile({ device: d }: { device: Device }) {
  if (d === "desktop")
    return (
      <Shell active={2}>
        <header className="k-pagehead">
          <span>
            <Eyebrow>Tài khoản</Eyebrow>
            <h1 className="k-h1">Hồ sơ</h1>
          </span>
        </header>
        <Glass className="k-identcard">
          <Identity d={d} />
          <div className="k-identstats">
            <span>
              <small>Phòng có chip</small>
              <b className="k-num">2</b>
            </span>
            <span>
              <small>Tổng chip</small>
              <b className="k-num">{fmt(PROFILE.rooms.reduce((a, r) => a + r.balance, 0))}</b>
            </span>
            <span>
              <small>Lời / lỗ</small>
              <b className="k-num k-down">{signed(PROFILE.rooms.reduce((a, r) => a + r.net, 0))}</b>
            </span>
          </div>
        </Glass>
        <div className="k-pgrid">
          <Glass className="k-card-p">
            <span className="k-sec-h">
              <b className="k-h3">Cách đăng nhập</b>
            </span>
            <Methods d={d} />
            <Btn tone="danger" size="lg" block icon={<LogOut size={17} strokeWidth={2.2} />} className="k-logout">
              Đăng xuất
            </Btn>
          </Glass>
          <Glass className="k-card-p">
            <span className="k-sec-h">
              <b className="k-h3">Phòng đang có chip</b>
            </span>
            <p className="k-note">Chip tính riêng từng phòng, không có ví chung. Lời/lỗ so với số chip được cấp.</p>
            <RoomRows d={d} />
          </Glass>
        </div>
        <Glass className="k-card-p k-recent">
          <span className="k-sec-h">
            <b className="k-h3">Ván gần đây của bạn</b>
            <span className="k-link">
              Xem lịch sử <ArrowRight size={14} strokeWidth={2.4} />
            </span>
          </span>
          <div className="k-recent-l">
            {HANDS.map((h) => {
              const me = h.players.find((p) => p.name === "Lym");
              const win = h.players.find((p) => p.net > 0);
              return (
                <div key={h.no} className={`k-recent-i ${h.voided ? "void" : ""}`}>
                  <b className="k-num">#{h.no}</b>
                  <small className="k-num">{h.at}</small>
                  <span>{h.voided ? "Ván bị huỷ · chip trả lại" : win ? `${win.name} thắng +${fmt(win.net)}` : ""}</span>
                  <b className={`k-num ${me ? `k-${tone(me.net)}` : "k-flat"}`}>{h.voided ? "0" : me ? signed(me.net) : "—"}</b>
                </div>
              );
            })}
          </div>
        </Glass>
      </Shell>
    );
  return (
    <Root device={d}>
      <MBar title="Hồ sơ" sub="Tài khoản của bạn" active={2} />
      <div className="k-mpage k-mprofile">
        <Glass className="k-mcard">
          <Identity d={d} />
          <Methods d={d} />
          <Btn tone="danger" block icon={<LogOut size={16} strokeWidth={2.2} />}>
            Đăng xuất
          </Btn>
        </Glass>
        <Glass className="k-mcard">
          <span className="k-sec-h">
            <b className="k-h3">Phòng đang có chip</b>
          </span>
          <p className="k-note">Chip tính riêng từng phòng, không có ví chung.</p>
          <RoomRows d={d} />
        </Glass>
      </div>
    </Root>
  );
}

/* ================================================================ router */

export function renderAccount(screen: string, device: Device): ReactNode {
  switch (screen) {
    case "login":
      return <Login device={device} />;
    case "signup":
      return <Signup device={device} />;
    case "forgot":
      return <Forgot device={device} />;
    case "upgrade":
      return <Upgrade device={device} />;
    case "profile":
      return <Profile device={device} />;
    default:
      return null;
  }
}
