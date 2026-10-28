import {
  ArrowRight,
  Check,
  ChevronLeft,
  Eye,
  Globe,
  Link2,
  Lock,
  MessageCircle,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Share2,
  Users,
  X,
} from "lucide-react";

import { OWNER, ROOMS } from "../../shared/data";
import type { Device } from "../../shared/screens";
import {
  Avatar,
  Badge,
  Btn,
  Chip,
  Crest,
  DesktopNav,
  Field,
  HomeBar,
  IconBtn,
  MobileAppBar,
  MobileRail,
  QR,
  Root,
  Segmented,
  Toggle,
} from "./kit";

type Room = (typeof ROOMS)[number];

/* ---------- mini table (seat occupancy) ---------- */

export function MiniTable({ seats, seated, w = 160, h = 96, dealer = false }: { seats: number; seated: number; w?: number; h?: number; dealer?: boolean }) {
  const dot = w >= 120 ? 12 : w >= 60 ? 8 : 5;
  const rx = w / 2 - dot / 2 - 1;
  const ry = h / 2 - dot / 2 - 1;
  return (
    <span className="mini-table" style={{ width: w, height: h }}>
      <span className="mini-rail" style={{ inset: dot / 2 + 2 }}>
        <span className="mini-felt" />
      </span>
      {Array.from({ length: seats }, (_, i) => {
        const a = Math.PI / 2 + (i * 2 * Math.PI) / seats;
        return (
          <i
            key={i}
            className={`mini-seat${i < seated ? " is-taken" : ""}`}
            style={{ width: dot, height: dot, left: w / 2 + Math.cos(a) * rx - dot / 2, top: h / 2 + Math.sin(a) * ry - dot / 2 }}
          />
        );
      })}
      {dealer && w >= 120 && <b className="mini-dealer">D</b>}
    </span>
  );
}

/* ---------- lobby ---------- */

function roomCta(r: Room): { label: string; short: string; kind: "primary" | "ghost" | "quiet"; note: string; icon?: JSX.Element } {
  if (r.owner === "Lym") return { label: "Về bàn", short: "Về bàn", kind: "primary", note: "Bạn ở ghế 1 · 1.460 chip" };
  if (r.seated >= r.seats) return { label: "Vào xem", short: "Xem", kind: "quiet", note: "Hết ghế · vào xem được", icon: <Eye size={15} /> };
  if (r.seated === 0) return { label: "Ngồi đầu tiên", short: "Ngồi", kind: "ghost", note: "Bàn đang trống" };
  return { label: "Ngồi vào", short: "Ngồi", kind: "ghost", note: `Còn ${r.seats - r.seated} ghế` };
}

function RoomBadges({ r }: { r: Room }) {
  return (
    <span className="badges">
      {r.status === "Đang chơi" ? (
        <Badge kind="felt" icon={<i className="dot is-live" />}>
          Đang chơi
        </Badge>
      ) : (
        <Badge kind="brass" icon={<i className="dot" />}>
          Đang mở
        </Badge>
      )}
      {r.private ? (
        <Badge kind="muted" icon={<Lock size={11} strokeWidth={2.4} />}>
          Riêng
        </Badge>
      ) : (
        <Badge kind="muted" icon={<Globe size={11} strokeWidth={2.4} />}>
          Công khai
        </Badge>
      )}
      {r.bonus > 0 && <Badge kind="claret">7-2 · {r.bonus}</Badge>}
    </span>
  );
}

function RoomCard({ r }: { r: Room }) {
  const cta = roomCta(r);
  return (
    <article className={`room-card${r.owner === "Lym" ? " is-mine" : ""}`}>
      {r.owner === "Lym" && <span className="room-ribbon">Bàn của bạn</span>}
      <MiniTable seats={r.seats} seated={r.seated} w={168} h={100} dealer={r.status === "Đang chơi"} />
      <div className="rc-body">
        <h3>{r.name}</h3>
        <RoomBadges r={r} />
        <dl className="rc-meta">
          <span>
            <dt>Blind</dt>
            <dd>{r.blinds}</dd>
          </span>
          <span>
            <dt>Ghế</dt>
            <dd>
              {r.seated}/{r.seats}
            </dd>
          </span>
          <span>
            <dt>Chủ phòng</dt>
            <dd>{r.owner}</dd>
          </span>
        </dl>
        <div className="rc-foot">
          <small>{cta.note}</small>
          <Btn kind={cta.kind} size="sm" icon={cta.icon}>
            {cta.label}
          </Btn>
        </div>
      </div>
    </article>
  );
}

function RoomRow({ r }: { r: Room }) {
  const cta = roomCta(r);
  return (
    <article className={`room-row${r.owner === "Lym" ? " is-mine" : ""}`}>
      <MiniTable seats={r.seats} seated={r.seated} w={70} h={44} />
      <div className="rr-body">
        <span className="rr-top">
          <b>{r.name}</b>
          {r.private && <Lock size={12} strokeWidth={2.4} className="rr-lock" />}
        </span>
        <span className="rr-meta">
          {r.blinds} · {r.seated}/{r.seats} ghế · {r.owner === "Lym" ? "của bạn" : `chủ ${r.owner}`}
        </span>
        <span className="rr-badges">
          <span className={`rr-status${r.status === "Đang chơi" ? " is-live" : ""}`}>{r.status}</span>
          {r.bonus > 0 && <span className="rr-seven">7-2 · {r.bonus}</span>}
        </span>
      </div>
      <span className={`rr-cta is-${cta.kind}`}>{cta.short}</span>
    </article>
  );
}

export function Lobby({ device }: { device: Device }) {
  const seatedTotal = ROOMS.reduce((a, r) => a + r.seated, 0);
  if (device === "mobile") {
    return (
      <Root device="mobile" className="bg-app">
        <MobileRail active="lobby" />
        <main className="m-main m-lobby">
          <section className="m-col">
            <div className="m-title">
              <h1>Chọn một bàn</h1>
              <small>
                {ROOMS.length} phòng · {seatedTotal} người · 3 đang xem
              </small>
            </div>
            <div className="m-scroll room-list">
              {ROOMS.map((r) => (
                <RoomRow key={r.id} r={r} />
              ))}
            </div>
          </section>
          <aside className="m-col m-lobby-side">
            <span className="eyebrow">Sảnh · tối thứ Sáu</span>
            <span className="input">
              <span className="input-icon">
                <Search size={17} strokeWidth={1.9} />
              </span>
              <span className="input-ph">Tìm phòng hoặc chủ phòng…</span>
            </span>
            <Segmented items={["Tất cả", "Công khai", "Của tôi"]} active={0} className="seg-fill" />
            <div className="paste-row">
              <Link2 size={17} strokeWidth={1.9} />
              <span>
                <b>Có link mời?</b> Dán để vào thẳng bàn
              </span>
              <span className="paste-btn">Dán</span>
            </div>
            <p className="m-note">
              <Lock size={12} /> Phòng riêng chỉ hiện với chủ phòng và người có link mời.
            </p>
            <Btn kind="primary" size="lg" block icon={<Plus size={18} strokeWidth={2.4} />}>
              Tạo phòng
            </Btn>
          </aside>
        </main>
        <HomeBar />
      </Root>
    );
  }
  return (
    <Root device="desktop" className="bg-app">
      <DesktopNav active="lobby" />
      <main className="page">
        <div className="page-head">
          <span>
            <span className="eyebrow">Sảnh · tối thứ Sáu</span>
            <h1 className="page-title">Chọn một bàn</h1>
            <p className="page-sub">
              {ROOMS.length} phòng · {seatedTotal} người đang ngồi · 3 người đang xem
            </p>
          </span>
          <Btn kind="primary" size="lg" icon={<Plus size={18} strokeWidth={2.4} />}>
            Tạo phòng
          </Btn>
        </div>
        <div className="toolbar">
          <span className="input search">
            <span className="input-icon">
              <Search size={17} strokeWidth={1.9} />
            </span>
            <span className="input-ph">Tìm theo tên phòng hoặc chủ phòng…</span>
          </span>
          <Segmented
            items={[
              <>
                Tất cả <i>4</i>
              </>,
              <>
                Công khai <i>3</i>
              </>,
              <>
                Của tôi <i>1</i>
              </>,
              "Còn ghế",
            ]}
            active={0}
          />
          <span className="paste">
            <span className="input">
              <span className="input-icon">
                <Link2 size={17} strokeWidth={1.9} />
              </span>
              <span className="input-ph">Dán link mời…</span>
            </span>
            <Btn kind="ghost">Vào</Btn>
          </span>
        </div>
        <div className="room-grid">
          {ROOMS.map((r) => (
            <RoomCard key={r.id} r={r} />
          ))}
        </div>
        <p className="page-foot">
          <Lock size={13} /> Phòng riêng chỉ hiện với chủ phòng và người có link mời.
        </p>
      </main>
    </Root>
  );
}

/* ---------- create room ---------- */

function SeatPicker({ value }: { value: number }) {
  return (
    <span className="seat-picker">
      {Array.from({ length: 8 }, (_, i) => i + 2).map((n) => (
        <span key={n} className={`sp${n === value ? " is-active" : ""}`}>
          {n}
        </span>
      ))}
    </span>
  );
}

function CreateFields({ device }: { device: Device }) {
  const d = device === "desktop";
  return (
    <div className="create-fields">
      <Field className="span-2 f-name" label="Tên phòng" value="Bàn thứ Sáu" state="focus" hint={d ? "Bạn bè thấy tên này trong sảnh và trong link mời." : undefined} />
      <div className="field f-blind">
        <span className="field-label">Blind nhỏ / lớn</span>
        <span className="blind-pair">
          <span className="input">
            <Chip denom={5} size={18} />
            <span className="input-value">10</span>
          </span>
          <span className="blind-sep">/</span>
          <span className="input">
            <Chip denom={25} size={18} />
            <span className="input-value">20</span>
          </span>
        </span>
        {d && <span className="field-hint">Gợi ý cấp mỗi người 100 blind lớn = 2.000 chip.</span>}
      </div>
      <div className="field f-seats">
        <span className="field-label">
          Số ghế <em>2 ghế = đấu tay đôi</em>
        </span>
        <SeatPicker value={9} />
      </div>
      <div className="field f-secs">
        <span className="field-label">Giây suy nghĩ mỗi lượt</span>
        <Segmented items={["15", "20", "30", "45", "60"]} active={1} className="seg-fill" />
        {d && <span className="field-hint">Hết giờ: tự check nếu được, không thì bỏ bài. Không có thời gian cộng.</span>}
      </div>
      <div className="field seven-field span-2 f-seven">
        <span className="seven-head">
          <span>
            <b>Thưởng 7-2</b>
            <small>Ăn pot bằng 7-2 khi cả bàn bỏ bài → mỗi người đang ngồi trả thưởng.</small>
          </span>
          <Toggle on />
        </span>
        <span className="seven-amount">
          <span className="input">
            <Chip denom={25} size={18} />
            <span className="input-value">50</span>
            <span className="input-trailing">chip / người</span>
          </span>
          <span className="quick-amts">
            <span>25</span>
            <span className="is-active">50</span>
            <span>100</span>
          </span>
        </span>
      </div>
      <div className="field f-vis">
        <span className="field-label">Ai thấy phòng này</span>
        <span className="vis-pick">
          <span className="vis">
            <Globe size={18} strokeWidth={1.8} />
            <span>
              <b>Công khai</b>
              <small>Hiện trong sảnh</small>
            </span>
          </span>
          <span className="vis is-active">
            <Lock size={18} strokeWidth={1.8} />
            <span>
              <b>Riêng</b>
              <small>Chỉ ai có link mời</small>
            </span>
            <i className="vis-check">
              <Check size={12} strokeWidth={3} />
            </i>
          </span>
        </span>
      </div>
    </div>
  );
}

function ConfigSummary() {
  const rows: [string, string][] = [
    ["Blind", "10 / 20"],
    ["Số ghế", "9 ghế"],
    ["Suy nghĩ", "20 giây mỗi lượt"],
    ["Thưởng 7-2", "50 chip mỗi người"],
    ["Hiển thị", "Riêng — chỉ có link"],
  ];
  return (
    <dl className="summary">
      {rows.map(([k, v]) => (
        <span key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </span>
      ))}
    </dl>
  );
}

export function CreateRoom({ device }: { device: Device }) {
  if (device === "mobile") {
    return (
      <Root device="mobile" className="bg-app">
        <MobileAppBar
          title="Tạo phòng"
          sub="Bạn là chủ phòng"
          left={
            <IconBtn>
              <X size={21} />
            </IconBtn>
          }
          right={
            <>
              <span className="link is-muted">Mặc định</span>
              <Btn kind="primary">Tạo phòng & lấy link mời</Btn>
            </>
          }
        />
        <div className="m-create">
          <CreateFields device="mobile" />
          <div className="m-preview">
            <MiniTable seats={9} seated={1} w={84} h={52} dealer />
            <span>
              <small className="eyebrow">Xem trước</small>
              <b>Bàn thứ Sáu</b>
              <small>10/20 · 9 ghế · 20s · 7-2: 50 · Riêng</small>
            </span>
          </div>
        </div>
        <HomeBar />
      </Root>
    );
  }
  return (
    <Root device="desktop" className="bg-app">
      <DesktopNav active="lobby" />
      <main className="page">
        <div className="page-head">
          <span>
            <span className="crumbs">
              Sảnh <ChevronLeft size={12} className="flip" /> Tạo phòng
            </span>
            <h1 className="page-title">Mở một bàn mới</h1>
          </span>
        </div>
        <div className="create-grid">
          <div className="panel create-form">
            <CreateFields device="desktop" />
            <div className="form-actions">
              <Btn kind="quiet">Huỷ</Btn>
              <Btn kind="primary" size="lg">
                Tạo phòng & lấy link mời
              </Btn>
            </div>
          </div>
          <aside className="panel create-preview">
            <span className="eyebrow">Xem trước</span>
            <div className="preview-table">
              <MiniTable seats={9} seated={1} w={360} h={200} dealer />
              <span className="preview-name">Bàn thứ Sáu</span>
            </div>
            <ConfigSummary />
            <div className="preview-note">
              <Crest size={28} />
              <span>Bạn là chủ phòng: cấp chip, đổi blind, mời ra và đóng phòng từ Bảng chủ phòng.</span>
            </div>
          </aside>
        </div>
      </main>
    </Root>
  );
}

/* ---------- invite ---------- */

function ShareCard({ device }: { device: Device }) {
  const d = device === "desktop";
  return (
    <div className={`share share-${device}`}>
      <div className="share-head">
        <span>
          <span className="eyebrow">Chủ phòng chia sẻ</span>
          <b>{OWNER.room}</b>
        </span>
        <Badge kind="muted" icon={<Lock size={11} strokeWidth={2.4} />}>
          Riêng
        </Badge>
      </div>
      <div className="share-body">
        <div className="share-left">
          <span className="link-box is-large">
            <Link2 size={16} />
            <span>{OWNER.invite.replace("https://", "")}</span>
          </span>
          <span className="share-actions">
            <Btn kind="primary" size="md" icon={<Check size={16} strokeWidth={2.6} />}>
              Đã chép link
            </Btn>
            {d && (
              <Btn kind="ghost" icon={<Share2 size={16} />}>
                Gửi qua…
              </Btn>
            )}
          </span>
          <span className="share-note">
            <RefreshCw size={14} /> Lỡ gửi nhầm? Đổi link trong Bảng chủ phòng — link cũ hết hiệu lực ngay.
          </span>
        </div>
        <span className="qr-wrap">
          <QR size={d ? 168 : 112} />
          <small>
            <QrCode size={12} /> Quét để vào
          </small>
        </span>
      </div>
    </div>
  );
}

/** Red wax seal pressed into the invitation's corner. */
function SuitSeal() {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%">
      <path
        d="M24 2.5c2.6 0 3.6 2.4 6 3s4.6-.9 6.5.8.6 4.2 1.9 6.3 4 2.6 4.4 5.2-1.9 4-1.9 6.4 2.3 3.9 1.6 6.4-3.4 2.7-4.9 4.8-.5 4.7-2.7 6.2-4.5-.1-7 .9-3.4 3.4-6 3.4-3.5-2.4-6-3.4-4.9.6-7-.9-1.2-4.1-2.7-6.2-4.2-2.3-4.9-4.8 1.6-4 1.6-6.4-2.3-3.9-1.9-6.4 3.1-3.1 4.4-5.2-.4-4.6 1.9-6.3 4.1-.2 6.5-.8 3.4-3 6-3z"
        className="seal-wax"
      />
      <circle cx="24" cy="24" r="13.5" className="seal-ring" />
      <path
        d="M24 15.2c-1.7 2.5-5.2 4.4-5.2 7.1 0 1.6 1.2 2.7 2.7 2.7.9 0 1.6-.4 2.1-1-.2 1.2-.7 2-1.5 2.7h3.8c-.8-.7-1.3-1.5-1.5-2.7.5.6 1.2 1 2.1 1 1.5 0 2.7-1.1 2.7-2.7 0-2.7-3.5-4.6-5.2-7.1z"
        className="seal-mark"
      />
    </svg>
  );
}

function Invitation({ device }: { device: Device }) {
  const d = device === "desktop";
  return (
    <div className={`invitation inv-${device}`}>
      <span className="inv-corner tl" />
      <span className="inv-corner tr" />
      <span className="inv-corner bl" />
      <span className="inv-corner br" />
      <span className="inv-seal" aria-hidden>
        <SuitSeal />
      </span>
      <Crest size={d ? 52 : 40} />
      <span className="inv-from">
        <Avatar name="An" size={d ? 26 : 22} />
        <b>An</b> mời bạn vào
      </span>
      <h2 className="inv-room">Bàn thứ Sáu</h2>
      <span className="inv-line" />
      <dl className="inv-meta">
        <span>
          <dt>Blind</dt>
          <dd>10/20</dd>
        </span>
        <span>
          <dt>Ghế</dt>
          <dd>7/9</dd>
        </span>
        <span>
          <dt>Thưởng 7-2</dt>
          <dd>50</dd>
        </span>
      </dl>
      <span className="inv-live">
        <i className="dot is-live" /> Đang chơi ván #37 · 3 người xem
      </span>
      <span className="inv-actions">
        <Btn kind="felt" size="lg" icon={<Users size={17} />}>
          Vào phòng
        </Btn>
        <Btn kind="paper" size="lg" icon={<Eye size={17} />}>
          Chỉ xem
        </Btn>
      </span>
      <small className="inv-who">
        Bạn đang đăng nhập là <b>Lym</b> · <span>đổi tài khoản</span>
      </small>
    </div>
  );
}

export function Invite({ device }: { device: Device }) {
  if (device === "mobile") {
    return (
      <Root device="mobile" className="bg-app">
        <MobileAppBar
          title="Link mời"
          sub="Một link cho cả hội"
          left={
            <IconBtn>
              <ChevronLeft size={22} />
            </IconBtn>
          }
        />
        <div className="m-invite">
          <ShareCard device="mobile" />
          <div className="m-connector">
            <MessageCircle size={14} strokeWidth={2.2} />
            Người nhận mở link sẽ thấy
            <ArrowRight size={14} strokeWidth={2.2} />
          </div>
        </div>
        <div className="m-invite-stage">
          <Invitation device="mobile" />
        </div>
        <HomeBar />
      </Root>
    );
  }
  return (
    <Root device="desktop" className="bg-app">
      <DesktopNav active="lobby" />
      <main className="page">
        <div className="page-head">
          <span>
            <span className="eyebrow">Phòng · Bàn thứ Sáu</span>
            <h1 className="page-title">Link mời</h1>
            <p className="page-sub">Một link cho cả hội: ai có link đều vào được, kể cả khi chưa có tài khoản.</p>
          </span>
        </div>
        <div className="invite-grid">
          <div className="invite-col">
            <ShareCard device="desktop" />
            <div className="panel recent">
              <div className="panel-head">
                <h3>Đã vào bằng link</h3>
                <small>tối nay</small>
              </div>
              <ul className="recent-list">
                {[
                  ["An", "21:01", "ngồi ghế 2"],
                  ["Mai", "21:03", "đang xem"],
                  ["khach-a1b2c3", "21:05", "khách · ngồi ghế 6"],
                ].map(([n, t, s]) => (
                  <li key={n}>
                    <Avatar name={n} size={28} />
                    <b>{n}</b>
                    <span>{s}</span>
                    <time>{t}</time>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="invite-col">
            <span className="step-label">Người nhận mở link sẽ thấy</span>
            <div className="invite-stage">
              <Invitation device="desktop" />
            </div>
          </div>
        </div>
      </main>
    </Root>
  );
}

