// Kính & Ánh Kim (d2) — rooms: lobby, create room, invite link (share + open).
import type { ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Globe,
  Link2,
  Lock,
  Mail,
  MessageCircle,
  Minus,
  Plus,
  Search,
  Share2,
  Sparkles,
  Users,
  X,
} from "lucide-react";

import { OWNER, ROOMS } from "../../../shared/data";
import type { Device } from "../../../shared/screens";
import { jewel, vars } from "../lib";
import { MBar, Shell } from "../shell";
import { Avatar, Btn, Eyebrow, Field, Glass, IconBtn, Mark, Pill, QR, Root, Seg, Toggle } from "../ui";

type Room = (typeof ROOMS)[number];

/* ============================================================ mini table */

const SEATED_NAMES = ["Lym", "An", "Bình", "Chi", "Dũng", "Giang", "Hà", "Khoa", "Mai"];

/** A small felt seen from above with one dot per seat: filled = someone sits there. */
export function MiniTable({
  seats,
  seated,
  w = 220,
  label,
  names = SEATED_NAMES,
  className = "",
}: {
  seats: number;
  seated: number;
  w?: number;
  label?: ReactNode;
  names?: string[];
  className?: string;
}) {
  const h = w * 0.56;
  const dot = Math.max(12, Math.round(w * 0.085));
  return (
    <div className={`k-minitable ${className}`} style={vars({ width: w, height: h, "--dot": `${dot}px` })}>
      <span className="k-minitable-felt">{label}</span>
      {Array.from({ length: seats }, (_, i) => {
        const a = Math.PI / 2 + (i * 2 * Math.PI) / seats;
        const x = 50 + 47 * Math.cos(a);
        const y = 50 + 44 * Math.sin(a);
        const on = i < seated;
        const [j1, j2] = jewel(names[i] ?? "");
        return (
          <i
            key={i}
            className={on ? "on" : ""}
            style={vars({ left: `${x}%`, top: `${y}%`, "--j1": j1, "--j2": j2 })}
          />
        );
      })}
    </div>
  );
}

/* ================================================================== lobby */

function statusPill(r: Room) {
  return r.status === "Đang chơi" ? (
    <Pill tone="cyan" icon={<i className="k-live-dot" />}>
      Đang chơi
    </Pill>
  ) : (
    <Pill tone="glass">Đang mở</Pill>
  );
}

function RoomPills({ r }: { r: Room }) {
  return (
    <span className="k-room-top">
      {statusPill(r)}
      {r.private && (
        <Pill tone="gold" icon={<Lock size={11} strokeWidth={2.6} />}>
          Riêng
        </Pill>
      )}
      {r.bonus > 0 && (
        <Pill tone="mute" icon={<Sparkles size={11} strokeWidth={2.4} />}>
          7-2 · {r.bonus}
        </Pill>
      )}
    </span>
  );
}

function Fact({ k, v }: { k: string; v: ReactNode }) {
  return (
    <span className="k-fact">
      <small>{k}</small>
      <b className="k-num">{v}</b>
    </span>
  );
}

/** The room you sit at: a wide banner on top of the lobby. */
function FeaturedRoom({ r }: { r: Room }) {
  return (
    <Glass className="k-roomfeat">
      <MiniTable seats={r.seats} seated={r.seated} w={290} label={<Mark size={26} />} />
      <div className="k-room-body">
        <RoomPills r={r} />
        <b className="k-room-n">{r.name}</b>
        <span className="k-room-meta">
          <Avatar name={r.owner} size={20} ring="none" />
          chủ phòng là bạn · ván #37 đang chạy
        </span>
        <span className="k-room-facts">
          <Fact k="Blind" v={r.blinds} />
          <Fact k="Ghế" v={`${r.seated}/${r.seats}`} />
          <Fact k="Mỗi lượt" v="20 giây" />
          <Fact k="Chip của bạn" v="1.460" />
        </span>
      </div>
      <div className="k-roomfeat-r">
        <span className="k-ticket-av">
          {SEATED_NAMES.slice(0, r.seated).map((n) => (
            <Avatar key={n} name={n} size={30} ring="none" />
          ))}
        </span>
        <Btn tone="gold" size="xl" iconRight={<ArrowRight size={18} strokeWidth={2.4} />}>
          Vào bàn
        </Btn>
      </div>
    </Glass>
  );
}

function RoomCard({ r }: { r: Room }) {
  const full = r.seated >= r.seats;
  return (
    <Glass className="k-roomcard">
      <MiniTable seats={r.seats} seated={r.seated} w={200} names={["Chi", "Khoa", "An", "Mai", "Tùng", "Ngọc"].slice(r.id === 3 ? 0 : 1)} label={<Mark size={18} />} />
      <RoomPills r={r} />
      <b className="k-room-n">{r.name}</b>
      <span className="k-room-meta">
        <Avatar name={r.owner} size={20} ring="none" />
        chủ phòng {r.owner}
      </span>
      <span className="k-room-facts">
        <Fact k="Blind" v={r.blinds} />
        <Fact k="Ghế" v={`${r.seated}/${r.seats}`} />
        <Btn tone={full ? "glass" : "cyan"} size="sm" iconRight={<ChevronRight size={15} strokeWidth={2.4} />}>
          {full ? "Xem" : "Ngồi vào"}
        </Btn>
      </span>
    </Glass>
  );
}

function Lobby({ device: d }: { device: Device }) {
  if (d === "desktop")
    return (
      <Shell active={0}>
        <header className="k-pagehead">
          <span>
            <Eyebrow>Sảnh</Eyebrow>
            <h1 className="k-h1">Chào Lym</h1>
            <p className="k-lead">4 phòng đang mở · 12 người đang ngồi bàn</p>
          </span>
          <span className="k-search">
            <Search size={18} strokeWidth={2} />
            <span>Tìm theo tên phòng hoặc chủ phòng…</span>
            <kbd>⌘K</kbd>
          </span>
        </header>
        <div className="k-paste">
          <span className="k-paste-ic">
            <Link2 size={18} strokeWidth={2.2} />
          </span>
          <span className="k-paste-t">
            <b>Có link mời?</b>
            <small>Dán link mời vào đây để vào thẳng phòng riêng</small>
          </span>
          <span className="k-paste-in">poker.ban-be.vn/rooms/join?token=…</span>
          <Btn tone="glass" size="md">
            Dán & vào
          </Btn>
        </div>
        <div className="k-lobby-bar">
          <Seg items={["Tất cả 4", "Của tôi 1", "Công khai 3"]} active={0} />
          <span className="k-col-note">Sắp xếp: đang chơi trước</span>
        </div>
        <FeaturedRoom r={ROOMS[0]} />
        <div className="k-rooms">
          {ROOMS.slice(1).map((r) => (
            <RoomCard key={r.id} r={r} />
          ))}
        </div>
      </Shell>
    );
  const sel = ROOMS[0];
  return (
    <Root device={d}>
      <MBar title="Sảnh" sub="Chào Lym · 4 phòng" active={0} />
      <div className="k-mpage k-mlobby">
        <div className="k-mlist">
          <div className="k-mtools">
            <span className="k-search k-search-m">
              <Search size={16} strokeWidth={2} />
              <span>Tìm phòng, chủ phòng…</span>
            </span>
            <Btn tone="glass" size="md" icon={<Link2 size={16} strokeWidth={2.2} />}>
              Dán link
            </Btn>
          </div>
          <Seg items={["Tất cả 4", "Của tôi 1", "Công khai 3"]} active={0} small />
          <div className="k-scroll">
            {ROOMS.map((r, i) => (
              <div key={r.id} className={`k-mroom ${i === 0 ? "on" : ""}`}>
                <MiniTable seats={r.seats} seated={r.seated} w={58} />
                <span className="k-mroom-t">
                  <b>
                    {r.name}
                    {r.private && <Lock size={11} strokeWidth={2.6} />}
                  </b>
                  <small>
                    <span className="k-num">{r.blinds}</span> · chủ {r.owner === "Lym" ? "bạn" : r.owner}
                    {r.bonus > 0 && <> · 7-2 {r.bonus}</>}
                  </small>
                </span>
                <span className="k-mroom-r">
                  <b className="k-num">
                    {r.seated}/{r.seats}
                  </b>
                  <small className={r.status === "Đang chơi" ? "live" : ""}>{r.status}</small>
                </span>
              </div>
            ))}
          </div>
        </div>
        <Glass className="k-mdetail">
          <span className="k-room-top">
            {statusPill(sel)}
            <Pill tone="gold" icon={<Lock size={11} strokeWidth={2.6} />}>
              Riêng
            </Pill>
          </span>
          <MiniTable seats={sel.seats} seated={sel.seated} w={176} label={<Mark size={16} />} />
          <span className="k-ticket-av">
            {SEATED_NAMES.slice(0, sel.seated).map((n) => (
              <Avatar key={n} name={n} size={22} ring="none" />
            ))}
          </span>
          <span className="k-mdetail-t">
            <b>{sel.name}</b>
            <small>
              Blind <b className="k-num">{sel.blinds}</b> · <b className="k-num">7/9</b> ghế · 7-2 thưởng <b className="k-num">50</b>
            </small>
          </span>
          <div className="k-row2">
            <Btn tone="glass" size="md" icon={<Plus size={16} strokeWidth={2.4} />}>
              Tạo phòng
            </Btn>
            <Btn tone="gold" size="md" iconRight={<ArrowRight size={16} strokeWidth={2.4} />}>
              Vào bàn
            </Btn>
          </div>
        </Glass>
      </div>
    </Root>
  );
}

/* ============================================================ create-room */

function Stepper({ value, unit }: { value: string; unit?: string }) {
  return (
    <span className="k-stepper k-stepper-box">
      <span className="k-mini-b">
        <Minus size={15} strokeWidth={2.4} />
      </span>
      <b className="k-num">
        {value}
        {unit && <small>{unit}</small>}
      </b>
      <span className="k-mini-b">
        <Plus size={15} strokeWidth={2.4} />
      </span>
    </span>
  );
}

function Ctl({ label, hint, children, className = "" }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`k-ctl ${className}`}>
      <span className="k-field-l">{label}</span>
      {children}
      {hint && <span className="k-field-hint">{hint}</span>}
    </div>
  );
}

const SeatPick = () => (
  <span className="k-seatpick">
    {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
      <span key={n} className={`k-num ${n === 9 ? "on" : ""}`}>
        {n}
      </span>
    ))}
  </span>
);

const Access = ({ small }: { small?: boolean }) => (
  <Seg
    small={small}
    items={[
      <>
        <Globe size={15} strokeWidth={2.2} /> Công khai
      </>,
      <>
        <Lock size={15} strokeWidth={2.2} /> Riêng
      </>,
    ]}
    active={1}
    className="k-seg-fill"
  />
);

function SevenCtl({ d }: { d: Device }) {
  return (
    <div className="k-seven">
      <span className="k-seven-ic">
        7<i>·</i>2
      </span>
      <span className="k-seven-t">
        <b>Thưởng 7-2</b>
        {d === "desktop" && <small>Ai ăn pot bằng 7-2 khi mọi người bỏ bài thì mỗi người trả</small>}
      </span>
      <Stepper value="50" />
      <Toggle on />
    </div>
  );
}

function Preview({ d }: { d: Device }) {
  const mob = d === "mobile";
  const facts: [string, ReactNode][] = [
    ["Blind", <b className="k-num">10/20</b>],
    ["Số ghế", <b className="k-num">9</b>],
    ["Mỗi lượt", <b className="k-num">20 giây</b>],
    ["Thưởng 7-2", <b className="k-num">50 / người</b>],
    ["Ai được vào", <b>Riêng · có link</b>],
  ];
  return (
    <div className={`k-preview ${mob ? "k-preview-m" : ""}`}>
      <Eyebrow>Xem trước</Eyebrow>
      <MiniTable
        seats={9}
        seated={1}
        w={mob ? 200 : 300}
        label={
          <span className="k-preview-felt">
            <b>Bàn thứ Sáu</b>
            <small className="k-num">10/20 · 20 giây</small>
          </span>
        }
      />
      {!mob && (
        <ul className="k-facts">
          {facts.map(([k, v]) => (
            <li key={k}>
              <span>{k}</span>
              {v}
            </li>
          ))}
        </ul>
      )}
      {!mob && (
        <p className="k-note">
          Bạn sẽ là chủ phòng: cấp chip cho từng người, đổi blind, kick và đóng phòng trong <b>Bảng chủ phòng</b>.
        </p>
      )}
      {mob && (
        <small className="k-preview-sub">
          <Lock size={11} strokeWidth={2.6} /> Riêng · 9 ghế · 7-2 thưởng 50
        </small>
      )}
      <Btn tone="gold" size={mob ? "md" : "xl"} block icon={<Plus size={18} strokeWidth={2.6} />}>
        Tạo phòng
      </Btn>
    </div>
  );
}

function CreateRoom({ device: d }: { device: Device }) {
  if (d === "desktop")
    return (
      <Shell active={0}>
        <header className="k-pagehead">
          <span>
            <span className="k-crumb">
              Sảnh <ChevronRight size={14} strokeWidth={2.2} /> Phòng mới
            </span>
            <h1 className="k-h1">Tạo phòng mới</h1>
          </span>
        </header>
        <div className="k-create">
          <Glass className="k-card-p k-create-form">
            <Field label="Tên phòng" value="Bàn thứ Sáu" state="focus" hint="Bạn bè sẽ thấy tên này trong link mời" />
            <div className="k-row2">
              <Ctl label="Blind nhỏ">
                <Stepper value="10" />
              </Ctl>
              <Ctl label="Blind lớn" hint="Thường gấp đôi blind nhỏ">
                <Stepper value="20" />
              </Ctl>
            </div>
            <Ctl label="Số ghế (2–9)">
              <SeatPick />
            </Ctl>
            <div className="k-row2">
              <Ctl label="Giây suy nghĩ mỗi lượt">
                <Seg items={["15", "20", "30", "45"]} active={1} className="k-seg-fill" />
              </Ctl>
              <Ctl label="Ai được vào" hint="Riêng: chỉ ai có link mới vào được">
                <Access />
              </Ctl>
            </div>
            <Ctl label="Thưởng 7-2 · mỗi người trả">
              <SevenCtl d={d} />
            </Ctl>
          </Glass>
          <Glass strong className="k-card-p">
            <Preview d={d} />
          </Glass>
        </div>
      </Shell>
    );
  return (
    <Root device={d}>
      <MBar title="Tạo phòng mới" sub="Bạn sẽ là chủ phòng" right={<IconBtn icon={<X size={18} strokeWidth={2.2} />} className="k-mbar-close" />} />
      <div className="k-mpage k-mcreate">
        <Glass className="k-mcard k-mcreate-form">
          <div className="k-row2">
            <Field label="Tên phòng" value="Bàn thứ Sáu" state="focus" />
            <Ctl label="Ai được vào">
              <Access small />
            </Ctl>
          </div>
          <div className="k-row2">
            <Ctl label="Blind nhỏ">
              <Stepper value="10" />
            </Ctl>
            <Ctl label="Blind lớn">
              <Stepper value="20" />
            </Ctl>
          </div>
          <div className="k-row2">
            <Ctl label="Số ghế (2–9)">
              <Stepper value="9" unit="ghế" />
            </Ctl>
            <Ctl label="Giây mỗi lượt">
              <Seg items={["15", "20", "30"]} active={1} small className="k-seg-fill" />
            </Ctl>
          </div>
          <Ctl label="Thưởng 7-2 · mỗi người trả">
            <SevenCtl d={d} />
          </Ctl>
        </Glass>
        <Glass strong className="k-mcard">
          <Preview d={d} />
        </Glass>
      </div>
    </Root>
  );
}

/* ================================================================= invite */

const LINK = OWNER.invite.replace("https://", "");
const AT_TABLE = ["An", "Bình", "Chi", "Dũng", "Giang", "Hà", "Khoa"];

function Share({ d }: { d: Device }) {
  const mob = d === "mobile";
  return (
    <div className={`k-share ${mob ? "k-share-m" : ""}`}>
      <Eyebrow tone="cyan">Người mời chia sẻ</Eyebrow>
      <b className={mob ? "k-h3" : "k-h2"}>Gọi hội vào Bàn thứ Sáu</b>
      <div className="k-linkrow">
        <span className="k-linkbox">
          <Link2 size={15} strokeWidth={2.2} />
          <span>{LINK}</span>
        </span>
        <Btn tone="gold" size={mob ? "md" : "lg"} icon={<Copy size={16} strokeWidth={2.4} />}>
          Chép
        </Btn>
        <span className="k-copied">
          <Check size={12} strokeWidth={3} /> Đã chép!
        </span>
      </div>
      <div className="k-share-row">
        <span className="k-qrwrap">
          <QR size={mob ? 112 : 176} seed={11} />
          {!mob && <small>Quét bằng camera điện thoại</small>}
        </span>
        <span className="k-share-btns">
          <Btn tone="glass" size={mob ? "md" : "lg"} block icon={<MessageCircle size={17} strokeWidth={2.1} />}>
            Gửi tin nhắn
          </Btn>
          <Btn tone="glass" size={mob ? "md" : "lg"} block icon={<Mail size={17} strokeWidth={2.1} />}>
            Gửi email
          </Btn>
          <Btn tone="glass" size={mob ? "md" : "lg"} block icon={<Share2 size={17} strokeWidth={2.1} />}>
            Chia sẻ khác…
          </Btn>
        </span>
      </div>
      {!mob && <p className="k-note">Ai có link đều vào được phòng riêng này. Muốn chặn link cũ? Đổi link trong Bảng chủ phòng.</p>}
    </div>
  );
}

function Ticket({ d }: { d: Device }) {
  const mob = d === "mobile";
  return (
    <div className={`k-ticket ${mob ? "k-ticket-m" : ""}`}>
      <Eyebrow>Người nhận mở link</Eyebrow>
      <span className="k-ticket-from">
        <Avatar name="An" size={mob ? 26 : 34} ring="gold" />
        <span>
          <b>An</b> mời bạn vào
        </span>
      </span>
      <b className="k-ticket-room">Bàn thứ Sáu</b>
      <span className="k-ticket-facts">
        <span>
          Blind <b className="k-num">10/20</b>
        </span>
        <i />
        <span>
          <Clock size={13} strokeWidth={2.2} /> <b className="k-num">20</b> giây
        </span>
        <i />
        <span>
          7-2 thưởng <b className="k-num">50</b>
        </span>
      </span>
      <MiniTable seats={9} seated={7} names={AT_TABLE} w={mob ? 168 : 280} label={<Mark size={mob ? 14 : 20} />} />
      <span className="k-ticket-who">
        <span className="k-ticket-av">
          {AT_TABLE.map((n) => (
            <Avatar key={n} name={n} size={mob ? 20 : 26} ring="none" />
          ))}
        </span>
        <small>
          <Users size={13} strokeWidth={2.2} /> 7 đang ở bàn · còn 2 ghế trống
        </small>
      </span>
      <Btn tone="gold" size={mob ? "md" : "xl"} block iconRight={<ArrowRight size={18} strokeWidth={2.4} />}>
        Vào phòng
      </Btn>
      {!mob && (
        <small className="k-ticket-foot">
          Vào bằng tài khoản đang đăng nhập · <u>Đổi tài khoản</u>
        </small>
      )}
    </div>
  );
}

function Invite({ device: d }: { device: Device }) {
  if (d === "desktop")
    return (
      <Shell active={0}>
        <header className="k-pagehead">
          <span>
            <span className="k-crumb">
              Bàn thứ Sáu <ChevronRight size={14} strokeWidth={2.2} /> Link mời
            </span>
            <h1 className="k-h1">Link mời</h1>
          </span>
          <span className="k-col-note">Chỉ ai có link mới vào được phòng riêng</span>
        </header>
        <div className="k-invite">
          <Glass className="k-card-p">
            <Share d={d} />
          </Glass>
          <span className="k-invite-arrow">
            <ArrowRight size={18} strokeWidth={2.4} />
          </span>
          <Glass strong className="k-card-p k-ticketcard">
            <Ticket d={d} />
          </Glass>
        </div>
      </Shell>
    );
  return (
    <Root device={d}>
      <MBar title="Link mời" sub="Bàn thứ Sáu · chỉ ai có link mới vào được" right={<IconBtn icon={<X size={18} strokeWidth={2.2} />} className="k-mbar-close" />} />
      <div className="k-mpage k-minvite">
        <Glass className="k-mcard">
          <Share d={d} />
        </Glass>
        <Glass strong className="k-mcard k-ticketcard">
          <Ticket d={d} />
        </Glass>
      </div>
    </Root>
  );
}

/* ================================================================ router */

export function renderRooms(screen: string, device: Device): ReactNode {
  switch (screen) {
    case "lobby":
      return <Lobby device={device} />;
    case "create-room":
      return <CreateRoom device={device} />;
    case "invite":
      return <Invite device={device} />;
    default:
      return null;
  }
}
