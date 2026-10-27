// Kẹo Đêm (d3) — rooms: lobby, create room, invite link.
import type { ReactNode } from "react";
import { Check, Copy, Link2, Mail, MessageCircle, Minus, Plus, Search, Share2, X } from "lucide-react";

import { OWNER, ROOMS } from "../../../shared/data";
import type { Device } from "../../../shared/screens";
import { AppNav, Ticket } from "../shell";
import {
  Avatar,
  Btn,
  Eyebrow,
  Field,
  HomeBar,
  IconBtn,
  Logo,
  MHead,
  QR,
  Root,
  Seg,
  StatusBar,
  Sticker,
  TabBar,
  Toggle,
} from "../ui";

/* ================================================================== lobby */

function DeskLobby() {
  return (
    <Root device="desktop" className="bg-party">
      <AppNav active={0} />
      <main className="page">
        <div className="lobby-hero">
          <div>
            <h1 className="h-display">Chào Lym 👋</h1>
            <p className="lead">Tối nay chơi bàn nào? Có {ROOMS.length} phòng đang mở cho bạn.</p>
          </div>
          <Btn tone="pink" size="xl" icon={<Plus size={22} strokeWidth={3.4} />}>
            Tạo phòng
          </Btn>
        </div>
        <div className="lobby-tools">
          <div className="searchbox">
            <Search size={20} strokeWidth={3} />
            <span>Tìm theo tên phòng hoặc chủ phòng…</span>
          </div>
          <div className="pastebox">
            <Link2 size={20} strokeWidth={3} />
            <span>Dán link mời vào đây để vào thẳng phòng riêng</span>
            <Btn tone="sky" size="sm">
              Vào
            </Btn>
          </div>
          <Seg items={["Tất cả 4", "Của tôi 1", "Công khai 3"]} active={0} tone="lime" />
        </div>
        <div className="lobby-grid">
          {ROOMS.map((r, i) => (
            <Ticket key={r.id} room={r} i={i} />
          ))}
        </div>
      </main>
    </Root>
  );
}

function MobLobby() {
  return (
    <Root device="mobile" className="bg-party">
      <StatusBar />
      <div className="mlobby-head">
        <Logo size={20} />
        <span className="mlobby-me">
          <Avatar name="Lym" size={36} />
        </span>
      </div>
      <div className="mpage mlobby">
        <div className="mlobby-hi">
          <h1 className="h-m">Chào Lym 👋</h1>
          <Btn tone="pink" size="sm" icon={<Plus size={17} strokeWidth={3.4} />}>
            Tạo phòng
          </Btn>
        </div>
        <div className="m-search">
          <div className="searchbox">
            <Search size={18} strokeWidth={3} />
            <span>Tìm phòng…</span>
          </div>
          <span className="m-paste">
            <Link2 size={18} strokeWidth={3} />
            Dán link
          </span>
        </div>
        <Seg items={["Tất cả 4", "Của tôi 1", "Công khai 3"]} active={0} tone="lime" className="seg-m" />
        <div className="mlobby-list">
          {ROOMS.map((r, i) => (
            <Ticket key={r.id} room={r} i={i} mobile />
          ))}
        </div>
      </div>
      <TabBar active={0} />
      <HomeBar />
    </Root>
  );
}

/* ============================================================ create-room */

function Stepper({ value }: { value: string }) {
  return (
    <span className="stepper">
      <span className="mini-btn">
        <Minus size={16} strokeWidth={3.2} />
      </span>
      <b className="num">{value}</b>
      <span className="mini-btn mini-btn-lime">
        <Plus size={16} strokeWidth={3.2} />
      </span>
    </span>
  );
}

function SeatChips() {
  return (
    <span className="seatchips">
      {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
        <span key={n} className={n === 9 ? "on" : ""}>
          {n}
        </span>
      ))}
    </span>
  );
}

function Ctl({ label, children, hint, wide }: { label: string; children: ReactNode; hint?: ReactNode; wide?: boolean }) {
  return (
    <div className={`ctl ${wide ? "ctl-wide" : ""}`}>
      <span className="fld-l">{label}</span>
      {children}
      {hint && <span className="fld-h">{hint}</span>}
    </div>
  );
}

function SevenRow({ mobile }: { mobile?: boolean }) {
  return (
    <div className={`seven-row ${mobile ? "seven-row-m" : ""}`}>
      <span className="seven-ic">7·2</span>
      <span className="seven-t">
        <b>Thưởng 7-2</b>
        <small>{mobile ? "mỗi người trả" : "Ai ăn pot bằng 7-2 khi mọi người bỏ bài thì mỗi người trả"}</small>
      </span>
      <Stepper value="50" />
      <Toggle on />
    </div>
  );
}

function PreviewTable({ small }: { small?: boolean }) {
  return (
    <div className={`ptable ${small ? "ptable-s" : ""}`}>
      <div className="ptable-felt">
        <b>Bàn thứ Sáu</b>
        <span>10/20 · 20 giây</span>
      </div>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`pseat ps-${i + 1} ${i === 0 ? "pseat-me" : ""}`}>
          {i === 0 ? <Avatar name="Lym" size={36} /> : <i>{i + 1}</i>}
        </span>
      ))}
    </div>
  );
}

function DeskCreate() {
  return (
    <Root device="desktop" className="bg-party">
      <AppNav active={0} />
      <main className="page">
        <div className="page-title">
          <span className="crumb">Sảnh ›</span>
          <h1 className="h1">Tạo phòng mới</h1>
        </div>
        <div className="create">
          <section className="card create-form">
            <Field label="Tên phòng" value="Bàn thứ Sáu" state="focus" hint="Bạn bè sẽ thấy tên này trong link mời" />
            <div className="ctl-row">
              <Ctl label="Blind nhỏ">
                <Stepper value="10" />
              </Ctl>
              <Ctl label="Blind lớn" hint="Thường gấp đôi blind nhỏ">
                <Stepper value="20" />
              </Ctl>
            </div>
            <Ctl label="Số ghế (2–9)" wide>
              <SeatChips />
            </Ctl>
            <div className="ctl-row">
              <Ctl label="Giây suy nghĩ mỗi lượt">
                <Seg items={["10", "15", "20", "30", "45"]} active={2} tone="sky" className="seg-num" />
              </Ctl>
              <Ctl label="Ai được vào" hint="Riêng: chỉ ai có link mới vào được">
                <Seg items={["🌐 Công khai", "🔒 Riêng"]} active={1} tone="lime" />
              </Ctl>
            </div>
            <SevenRow />
            <div className="create-actions">
              <Btn tone="ghost" size="lg">
                Huỷ
              </Btn>
              <Btn tone="pink" size="lg" icon={<Check size={20} strokeWidth={3.4} />}>
                Tạo phòng
              </Btn>
            </div>
          </section>
          <section className="card create-preview">
            <Eyebrow tone="lime">Xem trước</Eyebrow>
            <PreviewTable />
            <div className="preview-tags">
              <Sticker tone="white" tilt={-3}>
                Blind 10/20
              </Sticker>
              <Sticker tone="sky" tilt={2}>
                9 ghế
              </Sticker>
              <Sticker tone="lime" tilt={-2}>
                20 giây / lượt
              </Sticker>
              <Sticker tone="pink" tilt={3}>
                7-2 · mỗi người 50
              </Sticker>
              <Sticker tone="sun" tilt={-4}>
                🔒 Riêng
              </Sticker>
            </div>
            <p className="preview-note">
              Bạn sẽ là chủ phòng: cấp chip cho từng người, đổi blind, kick và đóng phòng trong <b>Bảng chủ phòng</b>.
            </p>
          </section>
        </div>
      </main>
    </Root>
  );
}

function MobCreate() {
  return (
    <Root device="mobile" className="bg-party">
      <StatusBar />
      <MHead
        title="Tạo phòng"
        back={false}
        right={
          <IconBtn size={42}>
            <X size={20} strokeWidth={3} />
          </IconBtn>
        }
      />
      <div className="mpage mcreate">
        <div className="mprev">
          <PreviewTable small />
          <div className="mprev-tags">
            <Sticker tone="white" tilt={-3}>
              10/20
            </Sticker>
            <Sticker tone="sky" tilt={2}>
              9 ghế
            </Sticker>
            <Sticker tone="lime" tilt={-2}>
              20s
            </Sticker>
            <Sticker tone="sun" tilt={3}>
              🔒 Riêng
            </Sticker>
          </div>
        </div>
        <Field label="Tên phòng" value="Bàn thứ Sáu" state="focus" />
        <div className="ctl-row">
          <Ctl label="Blind nhỏ">
            <Stepper value="10" />
          </Ctl>
          <Ctl label="Blind lớn">
            <Stepper value="20" />
          </Ctl>
        </div>
        <Ctl label="Số ghế" wide>
          <SeatChips />
        </Ctl>
        <Ctl label="Giây suy nghĩ" wide>
          <Seg items={["10", "15", "20", "30", "45"]} active={2} tone="sky" className="seg-num seg-fill" />
        </Ctl>
        <SevenRow mobile />
        <Ctl label="Ai được vào" wide>
          <Seg items={["🌐 Công khai", "🔒 Riêng"]} active={1} tone="lime" className="seg-fill" />
        </Ctl>
      </div>
      <div className="mfoot">
        <Btn tone="pink" size="xl" block icon={<Check size={22} strokeWidth={3.4} />}>
          Tạo phòng
        </Btn>
        <HomeBar />
      </div>
    </Root>
  );
}

/* ================================================================= invite */

const LINK = OWNER.invite.replace("https://", "");

function ShareCard({ mobile }: { mobile?: boolean }) {
  return (
    <section className={`card share ${mobile ? "share-m" : ""}`}>
      <Eyebrow tone="sky">Người mời chia sẻ</Eyebrow>
      {!mobile && <h2 className="h2">Gọi hội vào Bàn thứ Sáu</h2>}
      <div className="linkbox">
        <span className="linkbox-url">{LINK}</span>
        <Btn tone="lime" size={mobile ? "sm" : "md"} icon={<Copy size={16} strokeWidth={3} />}>
          Chép
        </Btn>
        <Sticker tone="lime" tilt={6} className="copied">
          <Check size={13} strokeWidth={3.4} /> Đã chép!
        </Sticker>
      </div>
      <div className="share-row">
        <div className="qrbox">
          <QR size={mobile ? 96 : 168} seed={11} />
          {!mobile && <small>Quét bằng camera điện thoại</small>}
        </div>
        <div className="share-btns">
          <Btn tone="ghost" size={mobile ? "sm" : "md"} icon={<MessageCircle size={17} strokeWidth={3} />}>
            Gửi tin nhắn
          </Btn>
          <Btn tone="ghost" size={mobile ? "sm" : "md"} icon={<Mail size={17} strokeWidth={3} />}>
            Gửi email
          </Btn>
          <Btn tone="ghost" size={mobile ? "sm" : "md"} icon={<Share2 size={17} strokeWidth={3} />}>
            Chia sẻ khác…
          </Btn>
        </div>
      </div>
      {!mobile && (
        <p className="share-note">Ai có link đều vào được phòng riêng này. Muốn chặn link cũ? Đổi link trong Bảng chủ phòng.</p>
      )}
    </section>
  );
}

function InviteTicket({ mobile }: { mobile?: boolean }) {
  const seated = ["An", "Bình", "Chi", "Dũng", "Giang", "Hà", "Khoa"];
  return (
    <section className={`invite ${mobile ? "invite-m" : ""}`}>
      <Eyebrow tone="pink">Người nhận mở link</Eyebrow>
      <div className="invite-card">
        <div className="invite-from">
          <Avatar name="An" size={mobile ? 48 : 60} />
          <span>
            <b>An</b> mời bạn vào
          </span>
        </div>
        <b className="invite-room">Bàn thứ Sáu</b>
        <div className="invite-tags">
          <Sticker tone="white" tilt={-3}>
            Blind 10/20
          </Sticker>
          <Sticker tone="sky" tilt={2}>
            7/9 ghế
          </Sticker>
          <Sticker tone="sun" tilt={-2}>
            🔒 Riêng
          </Sticker>
          <Sticker tone="pink" tilt={3}>
            7-2 · 50
          </Sticker>
        </div>
        <div className="invite-who">
          <span className="avstack">
            {seated.map((n) => (
              <Avatar key={n} name={n} size={mobile ? 30 : 36} />
            ))}
          </span>
          <span>đang ở bàn · còn 2 ghế trống</span>
        </div>
        <div className="invite-perf" />
        <Btn tone="pink" size="xl" block>
          Vào phòng
        </Btn>
        <span className="invite-acct">
          Đang đăng nhập: <b>Lym</b> · <u>Đổi tài khoản</u>
        </span>
      </div>
    </section>
  );
}

function DeskInvite() {
  return (
    <Root device="desktop" className="bg-party">
      <AppNav active={0} />
      <main className="page invite-page">
        <ShareCard />
        <div className="invite-arrow">
          <i className="arrow-dash" />
          <Sticker tone="sun" tilt={-6}>
            gửi link →
          </Sticker>
          <i className="arrow-dash" />
        </div>
        <InviteTicket />
      </main>
    </Root>
  );
}

function MobInvite() {
  return (
    <Root device="mobile" className="bg-party">
      <StatusBar />
      <MHead title="Link mời" sub="Bàn thứ Sáu" />
      <div className="mpage minvite">
        <ShareCard mobile />
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
