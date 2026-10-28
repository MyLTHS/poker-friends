// Sơn Mài Vàng Son (d4) — rooms: lobby, create room, invite link.
import type { ReactNode } from "react";
import { Check, ChevronRight, Copy, Crown, Globe, Link2, Lock, Mail, MessageCircle, Plus, Search, Share2, Users, X } from "lucide-react";

import { OWNER, ROOMS } from "../../../shared/data";
import type { Device } from "../../../shared/screens";
import { MHead, MRail, MiniTable, TopNav } from "../shell";
import { Avatar, Btn, Eyebrow, Field, HomeBar, Panel, QR, Root, Seg, Stepper, Tag, Toggle } from "../ui";

type Room = (typeof ROOMS)[number];

/* ================================================================== lobby */

const STATUS = (r: Room) => (r.status === "Đang chơi" ? <Tag tone="jade">Đang chơi</Tag> : <Tag tone="gold">Đang mở</Tag>);
const ACCESS = (r: Room) =>
  r.private ? (
    <Tag tone="mute" icon={<Lock size={11} strokeWidth={2.4} />}>
      Riêng
    </Tag>
  ) : (
    <Tag tone="mute" icon={<Globe size={11} strokeWidth={2.4} />}>
      Công khai
    </Tag>
  );

function RoomCard({ r }: { r: Room }) {
  const mine = r.owner === "Lym";
  const full = r.seated === r.seats;
  return (
    <Panel className={`room ${mine ? "room-mine" : ""}`} tone={mine ? "son" : undefined}>
      <MiniTable seated={r.seated} seats={r.seats} w={196} h={104} me={mine} label={<b className="num">{r.blinds}</b>} />
      <div className="room-body">
        <span className="room-tags">
          {STATUS(r)}
          {ACCESS(r)}
          {mine && (
            <Tag tone="pearl" icon={<Crown size={11} strokeWidth={2.4} />}>
              Của bạn
            </Tag>
          )}
        </span>
        <b className="room-name">{r.name}</b>
        <span className="room-meta">
          <span>
            Chủ phòng <b>{r.owner}</b>
          </span>
          <i />
          <span>
            Blind <b className="num">{r.blinds}</b>
          </span>
          <i />
          <span>
            <b className="num">
              {r.seated}/{r.seats}
            </b>{" "}
            ghế
          </span>
        </span>
        <span className="room-foot">
          {r.bonus > 0 ? <span className="room-bonus">Thưởng 7-2 · {r.bonus}</span> : <span className="room-bonus room-bonus-off">Không thưởng 7-2</span>}
          <Btn tone={mine ? "gold" : full ? "then" : "then"} size="md" iconRight={<ChevronRight size={17} strokeWidth={2.2} />}>
            {full ? "Xem bàn" : mine ? "Vào bàn" : "Ngồi vào"}
          </Btn>
        </span>
      </div>
    </Panel>
  );
}

function RoomRow({ r }: { r: Room }) {
  const mine = r.owner === "Lym";
  const full = r.seated === r.seats;
  return (
    <div className={`mroom ${mine ? "mroom-mine" : ""}`}>
      <MiniTable seated={r.seated} seats={r.seats} w={64} h={36} me={mine} />
      <span className="mroom-t">
        <b>
          {r.name}
          {r.private && <Lock size={12} strokeWidth={2.4} />}
        </b>
        <small>
          {r.owner} · Blind <span className="num">{r.blinds}</span> · <span className="num">{r.seated}/{r.seats}</span> ghế
        </small>
        {r.bonus > 0 && <em>Thưởng 7-2 · {r.bonus}</em>}
      </span>
      {STATUS(r)}
      <Btn tone={mine ? "gold" : "then"} size="md" className="mroom-go">
        {full ? "Xem" : "Vào"}
      </Btn>
    </div>
  );
}

function DeskLobby() {
  return (
    <Root device="desktop" className="bg-hall">
      <TopNav active={0} />
      <main className="page lobby">
        <div className="lobby-hero">
          <div>
            <Eyebrow>Sảnh · tối thứ Sáu</Eyebrow>
            <h1 className="h1">
              Chào Lym, <span className="gold-t">tối nay chơi bàn nào?</span>
            </h1>
            <p className="lead">Có {ROOMS.length} phòng đang mở cho bạn: 1 phòng riêng của bạn, 3 phòng công khai.</p>
          </div>
          <Btn tone="gold" size="xl" icon={<Plus size={20} strokeWidth={2.4} />}>
            Tạo phòng
          </Btn>
        </div>
        <div className="lobby-tools">
          <span className="fld lobby-search">
            <Search size={18} strokeWidth={2} />
            <span className="fld-v fld-ph">Tìm theo tên phòng hoặc chủ phòng…</span>
          </span>
          <span className="fld lobby-paste">
            <Link2 size={18} strokeWidth={2} />
            <span className="fld-v fld-ph">Dán link mời để vào thẳng phòng riêng</span>
            <Btn tone="then" size="sm">
              Vào
            </Btn>
          </span>
          <Seg items={["Tất cả 4", "Của tôi 1", "Công khai 3"]} active={0} />
        </div>
        <div className="lobby-grid">
          {ROOMS.map((r) => (
            <RoomCard key={r.id} r={r} />
          ))}
        </div>
      </main>
    </Root>
  );
}

function MobLobby() {
  return (
    <Root device="mobile" className="bg-hall">
      <MRail active={0} />
      <div className="mpage mrailpage mlobby">
        <section className="mlobby-side">
          <Eyebrow>Sảnh · tối thứ Sáu</Eyebrow>
          <h1 className="h3">
            Chào Lym,
            <br />
            <span className="gold-t">tối nay chơi bàn nào?</span>
          </h1>
          <p className="lead">Có {ROOMS.length} phòng đang mở cho bạn.</p>
          <span className="fld">
            <Search size={17} strokeWidth={2} />
            <span className="fld-v fld-ph">Tìm phòng, chủ phòng…</span>
          </span>
          <span className="fld">
            <Link2 size={17} strokeWidth={2} />
            <span className="fld-v fld-ph">Dán link mời</span>
          </span>
          <Btn tone="gold" size="lg" block icon={<Plus size={19} strokeWidth={2.4} />}>
            Tạo phòng
          </Btn>
        </section>
        <section className="mlobby-main">
          <Seg items={["Tất cả 4", "Của tôi 1", "Công khai 3"]} active={0} className="seg-fill" />
          <div className="mscroll">
            {ROOMS.map((r) => (
              <RoomRow key={r.id} r={r} />
            ))}
          </div>
        </section>
      </div>
      <HomeBar />
    </Root>
  );
}

/* ============================================================ create-room */

function SeatChips() {
  return (
    <span className="seatpick">
      {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
        <span key={n} className={n === 9 ? "on" : ""}>
          {n}
        </span>
      ))}
    </span>
  );
}

function Ctl({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={`ctl ${className ?? ""}`}>
      <span className="ctl-l">{label}</span>
      {children}
      {hint && <span className="ctl-h">{hint}</span>}
    </div>
  );
}

const ACCESS_SEG = (
  <Seg
    items={[
      <>
        <Globe size={15} strokeWidth={2} /> Công khai
      </>,
      <>
        <Lock size={15} strokeWidth={2} /> Riêng
      </>,
    ]}
    active={1}
    className="seg-fill"
  />
);

function SevenRow({ mobile }: { mobile?: boolean }) {
  return (
    <div className="seven">
      <span className="seven-mark">
        <b>7</b>
        <b>2</b>
      </span>
      <span className="seven-t">
        <b>Thưởng 7-2</b>
        <small>{mobile ? "mỗi người trả khi bị bluff 7-2" : "Ai ăn pot bằng 7-2 khi mọi người bỏ bài thì mỗi người trả"}</small>
      </span>
      <Stepper value="50" />
      <Toggle on />
    </div>
  );
}

const PREVIEW_TAGS = (
  <span className="ptags">
    <Tag tone="ink">Blind 10/20</Tag>
    <Tag tone="ink">9 ghế</Tag>
    <Tag tone="ink">20 giây / lượt</Tag>
    <Tag tone="son">7-2 · mỗi người 50</Tag>
    <Tag tone="mute" icon={<Lock size={11} strokeWidth={2.4} />}>
      Riêng
    </Tag>
  </span>
);

function DeskCreate() {
  return (
    <Root device="desktop" className="bg-hall">
      <TopNav active={0} />
      <main className="page create">
        <div className="page-title">
          <span className="crumb">Sảnh ›</span>
          <h1 className="h1">Tạo phòng mới</h1>
        </div>
        <div className="create-cols">
          <Panel className="create-form">
            <Field label="Tên phòng" value="Bàn thứ Sáu" state="focus" hint="Bạn bè sẽ thấy tên này trong link mời" />
            <div className="ctl-row">
              <Ctl label="Blind nhỏ">
                <Stepper value="10" />
              </Ctl>
              <Ctl label="Blind lớn" hint="Thường gấp đôi blind nhỏ">
                <Stepper value="20" />
              </Ctl>
              <Ctl label="Số ghế (2–9)">
                <SeatChips />
              </Ctl>
            </div>
            <div className="ctl-row">
              <Ctl label="Giây suy nghĩ mỗi lượt">
                <Seg items={["10", "15", "20", "30", "45"]} active={2} className="seg-fill" />
              </Ctl>
              <Ctl label="Ai được vào" hint="Riêng: chỉ ai có link mới vào được">
                {ACCESS_SEG}
              </Ctl>
            </div>
            <SevenRow />
            <div className="create-actions">
              <Btn tone="ghost" size="lg">
                Huỷ
              </Btn>
              <Btn tone="gold" size="lg" icon={<Check size={19} strokeWidth={2.4} />}>
                Tạo phòng
              </Btn>
            </div>
          </Panel>
          <Panel className="create-prev" tone="deep">
            <Eyebrow>Xem trước</Eyebrow>
            <MiniTable
              seated={1}
              seats={9}
              w={360}
              h={190}
              me
              label={
                <span className="prev-label">
                  <b>Bàn thứ Sáu</b>
                  <small>10/20 · 20 giây</small>
                </span>
              }
              className="mini-big"
            />
            {PREVIEW_TAGS}
            <p className="prev-note">
              Bạn sẽ là chủ phòng: cấp chip cho từng người, đổi blind, kick và đóng phòng trong <b>Bảng chủ phòng</b>.
            </p>
          </Panel>
        </div>
      </main>
    </Root>
  );
}

function MobCreate() {
  return (
    <Root device="mobile" className="bg-hall">
      <div className="mpage mcreate">
        <section className="mcreate-form">
          <MHead
            title="Tạo phòng mới"
            sub="Bạn sẽ là chủ phòng"
            right={
              <span className="ibtn mhead-x">
                <X size={19} strokeWidth={2} />
              </span>
            }
          />
          <div className="grid2">
            <Field label="Tên phòng" value="Bàn thứ Sáu" state="focus" />
            <Ctl label="Ai được vào">{ACCESS_SEG}</Ctl>
            <Ctl label="Blind nhỏ">
              <Stepper value="10" />
            </Ctl>
            <Ctl label="Blind lớn">
              <Stepper value="20" />
            </Ctl>
            <Ctl label="Số ghế (2–9)">
              <Stepper value="9" unit="ghế" />
            </Ctl>
            <Ctl label="Giây suy nghĩ mỗi lượt">
              <Seg items={["10", "15", "20", "30", "45"]} active={2} className="seg-fill" />
            </Ctl>
          </div>
          <SevenRow mobile />
        </section>
        <Panel className="mcard mcreate-prev" tone="deep">
          <Eyebrow>Xem trước</Eyebrow>
          <MiniTable
            seated={1}
            seats={9}
            w={176}
            h={86}
            me
            label={
              <span className="prev-label">
                <b>Bàn thứ Sáu</b>
                <small>10/20 · 20 giây</small>
              </span>
            }
          />
          {PREVIEW_TAGS}
          <Btn tone="gold" size="lg" block icon={<Check size={19} strokeWidth={2.4} />}>
            Tạo phòng
          </Btn>
        </Panel>
      </div>
      <HomeBar />
    </Root>
  );
}

/* ================================================================= invite */

const LINK = OWNER.invite.replace("https://", "");

function ShareCard({ mobile }: { mobile?: boolean }) {
  return (
    <Panel className={mobile ? "mcard share" : "share"}>
      <Eyebrow>Người mời chia sẻ</Eyebrow>
      <h2 className={mobile ? "h3" : "h2"}>Gọi hội vào Bàn thứ Sáu</h2>
      <div className="linkbox">
        <Link2 size={17} strokeWidth={2} />
        <span className="linkbox-url">{LINK}</span>
        <Btn tone="gold" size={mobile ? "md" : "md"} icon={<Copy size={15} strokeWidth={2.2} />}>
          Chép
        </Btn>
        <Tag tone="jade" icon={<Check size={11} strokeWidth={3} />} className="copied">
          Đã chép!
        </Tag>
      </div>
      <div className="share-row">
        <span className="qrframe">
          <QR size={mobile ? 92 : 156} seed={11} />
          {!mobile && <small>Quét bằng camera điện thoại</small>}
        </span>
        <span className="share-btns">
          <Btn tone="then" size="md" block icon={<MessageCircle size={17} strokeWidth={2} />}>
            Gửi tin nhắn
          </Btn>
          <Btn tone="then" size="md" block icon={<Mail size={17} strokeWidth={2} />}>
            Gửi email
          </Btn>
          {!mobile && (
            <Btn tone="then" size="md" block icon={<Share2 size={17} strokeWidth={2} />}>
              Chia sẻ khác…
            </Btn>
          )}
        </span>
      </div>
      <p className="share-note">
        {mobile ? "Ai có link đều vào được. Chặn link cũ: đổi link trong Bảng chủ phòng." : "Ai có link đều vào được phòng riêng này. Muốn chặn link cũ? Đổi link trong Bảng chủ phòng."}
      </p>
    </Panel>
  );
}

function InviteTicket({ mobile }: { mobile?: boolean }) {
  const seated = ["An", "Bình", "Chi", "Dũng", "Giang", "Hà", "Khoa"];
  return (
    <section className={`ticket-wrap ${mobile ? "ticket-wrap-m" : ""}`}>
      {!mobile && <Eyebrow tone="pearl">Người nhận mở link</Eyebrow>}
      <Panel className="ticket" tone="son">
        <div className="ticket-from">
          <Avatar name="An" size={mobile ? 38 : 52} />
          <span>
            <b>An</b> mời bạn vào
          </span>
        </div>
        <b className="ticket-room">Bàn thứ Sáu</b>
        <span className="ticket-tags">
          <Tag tone="ink">Blind 10/20</Tag>
          <Tag tone="ink">7/9 ghế</Tag>
          <Tag tone="mute" icon={<Lock size={11} strokeWidth={2.4} />}>
            Riêng
          </Tag>
          <Tag tone="gold">7-2 · 50</Tag>
        </span>
        <div className="ticket-who">
          <span className="avstack">
            {seated.map((n) => (
              <Avatar key={n} name={n} size={mobile ? 24 : 32} />
            ))}
          </span>
          <span>
            <Users size={14} strokeWidth={2} /> đang ở bàn · còn 2 ghế trống
          </span>
        </div>
        <i className="ticket-perf" />
        <Btn tone="gold" size={mobile ? "lg" : "xl"} block>
          Vào phòng
        </Btn>
        <span className="ticket-acct">
          Đang đăng nhập: <b>Lym</b> · <span className="link">Đổi tài khoản</span>
        </span>
      </Panel>
    </section>
  );
}

function DeskInvite() {
  return (
    <Root device="desktop" className="bg-hall">
      <TopNav active={0} />
      <main className="page invite">
        <ShareCard />
        <span className="connector connector-wide">
          <i />
          <span>gửi link →</span>
          <i />
        </span>
        <InviteTicket />
      </main>
    </Root>
  );
}

function MobInvite() {
  return (
    <Root device="mobile" className="bg-hall">
      <div className="mpage mpair minvite">
        <ShareCard mobile />
        <span className="mlink">
          <ChevronRight size={18} strokeWidth={2} />
        </span>
        <InviteTicket mobile />
      </div>
      <HomeBar />
    </Root>
  );
}

export function renderRooms(screen: string, device: Device): ReactNode | null {
  const d = device === "desktop";
  switch (screen) {
    case "lobby":
      return d ? <DeskLobby /> : <MobLobby />;
    case "create-room":
      return d ? <DeskCreate /> : <MobCreate />;
    case "invite":
      return d ? <DeskInvite /> : <MobInvite />;
    default:
      return null;
  }
}
