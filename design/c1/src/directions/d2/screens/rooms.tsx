// Room screens: lobby, create room, invite link.
import type { ReactNode } from "react";
import {
  Check as CheckIcon,
  ClipboardPaste,
  Eye,
  Globe,
  Link2,
  Lock,
  Plus,
  Search,
  Share2,
  Sparkles,
  X,
} from "lucide-react";

import { OWNER, PROFILE, ROOMS, TABLE_TURN } from "../../../shared/data";
import type { Device } from "../../../shared/screens";
import {
  Avatar,
  Badge,
  Brand,
  Btn,
  Field,
  HomeBar,
  IconBtn,
  Qr,
  Root,
  SecHead,
  Seg,
  StatusBar,
  TabBar,
  Toggle,
  TopNav,
  VariantCap,
  fmt,
  signed,
  toneOf,
} from "../ui";

type Room = (typeof ROOMS)[number];
const TOKEN = OWNER.invite.split("token=")[1];

function SeatDots({ seated, seats }: { seated: number; seats: number }) {
  return (
    <span className="dots9">
      {Array.from({ length: seats }, (_, i) => (
        <i key={i} className={i < seated ? "on" : ""} />
      ))}
    </span>
  );
}

function statusBadge(r: Room) {
  if (r.seated === r.seats) return <Badge kind="line">Đủ người</Badge>;
  return r.status === "Đang chơi" ? <Badge kind="ink">{r.status}</Badge> : <Badge kind="sage">{r.status}</Badge>;
}

function roomAction(r: Room, size: "md" | "sm" = "md") {
  if (r.owner === "Lym") return <Btn v="ink" s={size}>Vào lại</Btn>;
  if (r.seated === r.seats)
    return (
      <Btn v="ghost" s={size} icon={<Eye size={15} strokeWidth={1.9} />}>
        Xem
      </Btn>
    );
  return <Btn v="line" s={size}>Vào bàn</Btn>;
}

const mineIn = (r: Room) => PROFILE.rooms.find((p) => p.name === r.name);

/* ---------- lobby ---------- */

function LobbyDesk() {
  return (
    <>
      <TopNav active="rooms" />
      <div className="page lobby">
        <div className="lobby-main">
          <div className="page-head row">
            <div>
              <span className="eyebrow">Sảnh · tối thứ Sáu</span>
              <h1 className="serif">Chọn một bàn</h1>
              <p>
                {ROOMS.length} phòng · {ROOMS.reduce((a, r) => a + r.seated, 0)} người đang ngồi
              </p>
            </div>
            <Btn v="red" s="lg" icon={<Plus size={18} strokeWidth={2} />}>
              Tạo phòng
            </Btn>
          </div>
          <div className="lobby-tools">
            <Field icon={<Search size={17} strokeWidth={1.8} />} placeholder="Tìm theo tên phòng hoặc chủ phòng" />
            <Seg items={["Tất cả · 4", "Công khai · 3", "Của tôi · 1"]} on={0} />
          </div>
          <div className="ruled-table rooms-list">
            <div className="rt-h">
              <span>Phòng</span>
              <span>Blind</span>
              <span>Ghế</span>
              <span>Thưởng 7-2</span>
              <span>Trạng thái</span>
              <span />
            </div>
            {ROOMS.map((r) => {
              const mine = mineIn(r);
              return (
                <div key={r.id} className={`rt-r${mine ? " mine" : ""}`}>
                  <span className="room-n">
                    <b className="serif">{r.name}</b>
                    <small>
                      {r.private ? <Lock size={12} strokeWidth={2} /> : <Globe size={12} strokeWidth={2} />}
                      {r.private ? "Riêng tư" : "Công khai"} · chủ phòng {r.owner}
                    </small>
                  </span>
                  <span className="mono big">{r.blinds}</span>
                  <span className="room-seats">
                    <SeatDots seated={r.seated} seats={r.seats} />
                    <span className="mono">
                      {r.seated}/{r.seats}
                    </span>
                  </span>
                  <span className="mono">{r.bonus ? r.bonus : <span className="muted">—</span>}</span>
                  <span>{statusBadge(r)}</span>
                  <span className="room-act">
                    {mine && (
                      <small>
                        bạn có <b className="mono">{fmt(mine.balance)}</b>
                      </small>
                    )}
                    {roomAction(r)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <aside className="lobby-aside">
          <section className="panel">
            <SecHead title="Có link mời?" />
            <Field
              icon={<Link2 size={17} strokeWidth={1.8} />}
              value={`poker.ban-be.vn/rooms/join?token=${TOKEN.slice(0, 6)}…`}
              mono
              state="focus"
              right={
                <span className="input-r">
                  <ClipboardPaste size={16} strokeWidth={1.8} />
                </span>
              }
            />
            <Btn v="ink" s="md" block>
              Vào phòng từ link
            </Btn>
          </section>
          <section className="panel">
            <SecHead title="Chip của bạn" meta="theo phòng" />
            {PROFILE.rooms.map((r) => (
              <div key={r.name} className="kv">
                <span>{r.name}</span>
                <span className="mono">{fmt(r.balance)}</span>
                <span className={`mono ${toneOf(r.net)}`}>{signed(r.net)}</span>
              </div>
            ))}
          </section>
          <section className="panel house">
            <SecHead title="Luật nhà" />
            <ul>
              <li>Chip ảo, không tiền thật, không rake.</li>
              <li>Chip tính riêng từng phòng, chủ phòng cấp.</li>
              <li>Mất mạng: đồng hồ vẫn chạy, hết giờ tự check hoặc bỏ.</li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}

function LobbyMob() {
  return (
    <>
      <StatusBar />
      <div className="m-head">
        <div>
          <span className="eyebrow">Sảnh · {ROOMS.length} phòng</span>
          <h1 className="serif">Chọn một bàn</h1>
        </div>
        <Avatar name="Lym" size={36} />
      </div>
      <div className="m-stack lobby-m">
        <Field icon={<Search size={17} strokeWidth={1.8} />} placeholder="Tìm phòng hoặc chủ phòng" />
        <div className="paste-row">
          <Link2 size={16} strokeWidth={1.8} />
          <span>Dán link mời để vào phòng riêng</span>
          <Btn v="line" s="sm">
            Dán
          </Btn>
        </div>
        <Seg items={["Tất cả", "Công khai", "Của tôi"]} on={0} className="full" />
        {ROOMS.map((r) => {
          const mine = mineIn(r);
          return (
            <div key={r.id} className={`room-card${mine ? " mine" : ""}`}>
              <div className="rc-top">
                <b className="serif">{r.name}</b>
                {r.private && <Lock size={13} strokeWidth={2} />}
                <span className="sp" />
                {statusBadge(r)}
              </div>
              <div className="rc-meta">
                <span className="mono">{r.blinds}</span>
                <i />
                <SeatDots seated={r.seated} seats={r.seats} />
                <span className="mono">
                  {r.seated}/{r.seats}
                </span>
                <i />
                <span>7-2: {r.bonus ? <span className="mono">{r.bonus}</span> : "tắt"}</span>
              </div>
              <div className="rc-bot">
                <small>
                  {mine ? (
                    <>
                      Bạn có <b className="mono">{fmt(mine.balance)}</b> ở đây
                    </>
                  ) : (
                    <>chủ phòng {r.owner}</>
                  )}
                </small>
                {roomAction(r, "sm")}
              </div>
            </div>
          );
        })}
      </div>
      <Btn v="red" s="lg" className="fab" icon={<Plus size={18} strokeWidth={2.2} />}>
        Tạo phòng
      </Btn>
      <TabBar active="rooms" />
    </>
  );
}

export function Lobby({ device }: { device: Device }) {
  return (
    <Root device={device} className="paged">
      {device === "desktop" ? <LobbyDesk /> : <LobbyMob />}
    </Root>
  );
}

/* ---------- create room ---------- */

/** A little drawn board for the preview: stadium + numbered seat markers. */
function MiniBoard({ w, h, seats }: { w: number; h: number; seats: number }) {
  const cx = w / 2;
  const cy = h / 2;
  const a = w / 2 - 14;
  const b = h / 2 - 14;
  const r = h / 2 - 24;
  return (
    <svg className="miniboard" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <rect x={24} y={24} width={w - 48} height={h - 48} rx={r} className="mb-felt" />
      <rect x={32} y={32} width={w - 64} height={h - 64} rx={r - 8} className="mb-in" />
      <text x={cx} y={cy + 5} textAnchor="middle" className="mb-t">
        10/20
      </text>
      {Array.from({ length: seats }, (_, i) => {
        const t = Math.PI / 2 + (i * 2 * Math.PI) / seats;
        const x = cx + a * Math.cos(t);
        const y = cy + b * Math.sin(t);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={11} className={i === 0 ? "mb-seat me" : "mb-seat"} />
            <text x={x} y={y + 3.6} textAnchor="middle" className="mb-n">
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function SevenRow({ compact }: { compact?: boolean }) {
  return (
    <div className="seven-row">
      <span className="seven-ic">
        <Sparkles size={16} strokeWidth={1.9} />
      </span>
      <span className="seven-txt">
        <b>Thưởng 7-2</b>
        {!compact && <small>Ăn pot bằng 7-2 khi mọi người bỏ bài → mỗi người đang ngồi trả mức này.</small>}
      </span>
      <span className="seven-amt">
        <span className="mono">50</span>
        <small>/người</small>
      </span>
      <Toggle on />
    </div>
  );
}

function Privacy({ compact }: { compact?: boolean }) {
  const opt = (on: boolean, icon: ReactNode, t: string, s: string) => (
    <div className={`radio-card${on ? " on" : ""}`}>
      <span className="radio">
        <i />
      </span>
      {icon}
      <span>
        <b>{t}</b>
        {!compact && <small>{s}</small>}
      </span>
    </div>
  );
  return (
    <div className="privacy">
      {opt(false, <Globe size={17} strokeWidth={1.8} />, "Công khai", "Hiện ở sảnh, ai cũng vào được")}
      {opt(true, <Lock size={17} strokeWidth={1.8} />, "Riêng tư", "Chỉ người có link mời")}
    </div>
  );
}

function SummaryRows() {
  const rows: [string, ReactNode][] = [
    ["Tên", "Bàn thứ Sáu"],
    ["Blind", <span className="mono">10 / 20</span>],
    ["Số ghế", <span className="mono">9</span>],
    ["Suy nghĩ", <><span className="mono">20</span> giây mỗi lượt</>],
    ["Thưởng 7-2", <><span className="mono">50</span> mỗi người</>],
    ["Loại", "Riêng tư · vào bằng link"],
  ];
  return (
    <div className="summary">
      {rows.map(([k, v]) => (
        <div key={k} className="kv">
          <span>{k}</span>
          <span className="dots" />
          <b>{v}</b>
        </div>
      ))}
    </div>
  );
}

function CreateDesk() {
  return (
    <>
      <TopNav active="rooms" />
      <div className="page create">
        <div className="page-head">
          <span className="eyebrow">Phòng mới</span>
          <h1 className="serif">Tạo phòng</h1>
          <p>Bạn sẽ là chủ phòng: cấp chip, đổi blind, mời ra và đóng phòng.</p>
        </div>
        <div className="create-grid">
          <section className="panel form-panel">
            <Field label="Tên phòng" value="Bàn thứ Sáu" state="focus" hint="Tối đa 40 ký tự · bạn bè thấy tên này ở sảnh và link mời." />
            <div className="two">
              <div className="fgroup">
                <label className="flabel">Blind nhỏ / lớn</label>
                <div className="blind-row">
                  <Field value="10" mono />
                  <span className="slash">/</span>
                  <Field value="20" mono />
                </div>
                <div className="chips-row">
                  {["1/2", "5/10", "10/20", "50/100"].map((b) => (
                    <span key={b} className={`pick mono${b === "10/20" ? " on" : ""}`}>
                      {b}
                    </span>
                  ))}
                </div>
              </div>
              <div className="fgroup">
                <label className="flabel">Giây suy nghĩ</label>
                <Seg items={["15", "20", "30", "45"]} on={1} mono className="full" />
                <small className="fhint">Hết giờ: tự check nếu được, không thì bỏ bài.</small>
              </div>
            </div>
            <div className="fgroup">
              <label className="flabel">Số ghế</label>
              <Seg items={["2", "3", "4", "5", "6", "7", "8", "9"]} on={7} mono className="full" />
              <small className="fhint">2 ghế = heads-up. Đổi được trước khi có người ngồi.</small>
            </div>
            <SevenRow />
            <div className="fgroup">
              <label className="flabel">Ai vào được</label>
              <Privacy />
            </div>
            <div className="form-foot">
              <Btn v="ghost" s="lg">
                Huỷ
              </Btn>
              <Btn v="red" s="lg">
                Tạo phòng
              </Btn>
            </div>
          </section>
          <section className="panel preview">
            <SecHead title="Xem trước" meta="9 ghế" />
            <MiniBoard w={392} h={196} seats={9} />
            <SummaryRows />
            <p className="note">Thưởng 7-2 và blind đổi được sau trong Bảng chủ phòng (áp từ ván sau).</p>
          </section>
        </div>
      </div>
    </>
  );
}

function CreateMob() {
  return (
    <>
      <StatusBar />
      <div className="mbar">
        <IconBtn icon={<X size={22} strokeWidth={1.8} />} label="Huỷ" />
        <b className="serif">Tạo phòng</b>
        <span className="mbar-sp" />
      </div>
      <div className="m-stack create-m">
        <div className="mini-prev">
          <MiniBoard w={150} h={88} seats={9} />
          <div>
            <b className="serif">Bàn thứ Sáu</b>
            <small>
              <span className="mono">10/20</span> · 9 ghế · <span className="mono">20</span>s · 7-2: <span className="mono">50</span>
            </small>
            <small>Riêng tư · vào bằng link</small>
          </div>
        </div>
        <Field label="Tên phòng" value="Bàn thứ Sáu" state="focus" />
        <div className="fgroup">
          <label className="flabel">Blind nhỏ / lớn</label>
          <div className="blind-row">
            <Field value="10" mono />
            <span className="slash">/</span>
            <Field value="20" mono />
          </div>
        </div>
        <div className="fgroup">
          <label className="flabel">Số ghế</label>
          <Seg items={["2", "3", "4", "5", "6", "7", "8", "9"]} on={7} mono className="full" />
        </div>
        <div className="fgroup">
          <label className="flabel">Giây suy nghĩ</label>
          <Seg items={["15", "20", "30", "45"]} on={1} mono className="full" />
        </div>
        <SevenRow compact />
        <Privacy compact />
      </div>
      <div className="m-footbar">
        <Btn v="red" s="xl" block>
          Tạo phòng
        </Btn>
        <HomeBar />
      </div>
    </>
  );
}

export function CreateRoom({ device }: { device: Device }) {
  return (
    <Root device={device} className="paged">
      {device === "desktop" ? <CreateDesk /> : <CreateMob />}
    </Root>
  );
}

/* ---------- invite ---------- */

const SEATED = TABLE_TURN.seats.filter((s) => s.name).map((s) => s.name!).slice(0, 7);

function ShareSide({ compact }: { compact?: boolean }) {
  return (
    <div className="share">
      <div className="share-h">
        <span className="eyebrow">Phía chủ phòng</span>
        <h2 className="serif">Mời bạn vào {OWNER.room}</h2>
      </div>
      <div className="link-box">
        <span className="mono">{OWNER.invite.replace("https://", "")}</span>
      </div>
      <div className="share-acts">
        <Btn v="paper" s={compact ? "md" : "lg"} className="copied" icon={<CheckIcon size={16} strokeWidth={2.4} />}>
          Đã chép link
        </Btn>
        <Btn v="line" s={compact ? "md" : "lg"} icon={<Share2 size={16} strokeWidth={1.9} />}>
          Gửi…
        </Btn>
      </div>
      <div className="qr-row">
        <div className="qr-frame">
          <Qr size={compact ? 112 : 168} seed={TOKEN} />
        </div>
        <div className="qr-txt">
          <b>Quét bằng camera</b>
          <small>Bạn bè ngồi cạnh mở điện thoại là vào được ngay.</small>
          {!compact && (
            <small className="warn-note">Ai có link đều vào được phòng riêng. Lỡ gửi nhầm thì đổi link trong Bảng chủ phòng.</small>
          )}
        </div>
      </div>
    </div>
  );
}

function Facts() {
  const r = ROOMS[0];
  return (
    <div className="facts">
      <span>
        <small>Blind</small>
        <b className="mono">{r.blinds}</b>
      </span>
      <span>
        <small>Ghế</small>
        <b className="mono">
          {r.seated}/{r.seats}
        </b>
      </span>
      <span>
        <small>Suy nghĩ</small>
        <b className="mono">20s</b>
      </span>
      <span>
        <small>7-2</small>
        <b className="mono">{r.bonus}</b>
      </span>
    </div>
  );
}

function ReceiveSide({ compact }: { compact?: boolean }) {
  return (
    <div className="receive">
      <Brand size="sm" />
      <div className="inv-from">
        <Avatar name="An" size={compact ? 36 : 44} />
        <span>
          <b>An</b> mời bạn vào
        </span>
      </div>
      <h2 className="serif inv-room">{OWNER.room}</h2>
      <span className="inv-sub">
        <Lock size={13} strokeWidth={2} /> Phòng riêng · chip ảo, chủ phòng cấp khi bạn vào
      </span>
      <Facts />
      <div className="inv-people">
        <span className="spec-avs">
          {SEATED.map((n) => (
            <Avatar key={n} name={n} size={compact ? 26 : 30} />
          ))}
        </span>
        <small>{SEATED.slice(0, 3).join(", ")} và {SEATED.length - 3} người khác đang ngồi</small>
      </div>
      <Btn v="red" s="xl" block>
        Vào phòng
      </Btn>
      <div className="inv-alt">
        <span className="link">Đăng nhập</span> để giữ chip lâu dài, hoặc <span className="link">vào bằng khách</span>
      </div>
    </div>
  );
}

export function Invite({ device }: { device: Device }) {
  if (device === "desktop")
    return (
      <Root device="desktop" className="paged">
        <TopNav active="rooms" />
        <div className="page invite">
          <div className="page-head">
            <span className="eyebrow">Link mời</span>
            <h1 className="serif">Gửi đi, và người nhận thấy gì</h1>
          </div>
          <div className="invite-grid">
            <section className="panel">
              <ShareSide />
            </section>
            <span className="step-arrow">
              <Link2 size={20} strokeWidth={1.7} />
            </span>
            <section className="panel letter">
              <span className="eyebrow">Phía người nhận · mở link</span>
              <ReceiveSide />
            </section>
          </div>
        </div>
      </Root>
    );
  return (
    <Root device="mobile" className="board-2">
      <div className="half" style={{ left: 0, top: 0, width: 390, height: 421 }}>
        <StatusBar />
        <div className="m-share">
          <ShareSide compact />
        </div>
        <VariantCap letter="A">Chủ phòng chia sẻ</VariantCap>
      </div>
      <div className="half-rule h" style={{ top: 421 }} />
      <div className="half letter-bg" style={{ left: 0, top: 423, width: 390, height: 421 }}>
        <div className="m-receive">
          <ReceiveSide compact />
        </div>
        <VariantCap letter="B">Người nhận mở link</VariantCap>
      </div>
    </Root>
  );
}
