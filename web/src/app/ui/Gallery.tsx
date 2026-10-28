"use client";

// Every D1 token and component on one page (/ui), to compare with design/c1 (D1 frames) and to
// copy usage from. Data is the design's sample data (Lym, An, Bình … at "Bàn thứ Sáu").
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Bell, Copy, DoorOpen, Eye, EyeOff, Link2, Lock, Mail, MessageCircle, Plus, RotateCw, Settings, Users } from "lucide-react";

import {
  Alert,
  AppShell,
  Avatar,
  Badge,
  Button,
  CardText,
  Checkbox,
  Chip,
  ChipStack,
  Confetti,
  Crest,
  DURATION,
  EASE,
  EmptyState,
  ErrorState,
  FlipCard,
  IconButton,
  Loading,
  LoadingLine,
  MiniTable,
  Modal,
  PageHead,
  Panel,
  PlayingCard,
  QR,
  Sheet,
  Skeleton,
  SkeletonCard,
  Spinner,
  STAGGER,
  Strength,
  Tabs,
  TextField,
  TimerRing,
  Toast,
  ToastProvider,
  Toggle,
  Wordmark,
  fly,
  fmt,
  sampleQrModules,
  signed,
  tone,
  useToast,
} from "@/ui";

const SECTIONS = [
  ["mau", "Màu"],
  ["chu", "Chữ"],
  ["chat-lieu", "Chất liệu"],
  ["nut", "Nút"],
  ["form", "Ô nhập"],
  ["nguoi", "Avatar"],
  ["bai-chip", "Bài, chip"],
  ["lop-phu", "Lớp phủ"],
  ["trang-thai", "Trạng thái"],
  ["chuyen-dong", "Chuyển động"],
] as const;

const COLORS = [
  ["bg", "Đêm"],
  ["ink", "Mực"],
  ["panel-a", "Da sáng"],
  ["panel-b", "Da tối"],
  ["felt", "Nỉ xanh"],
  ["wood", "Gỗ sẫm"],
  ["brass", "Đồng thau"],
  ["brass-2", "Đồng sáng"],
  ["brass-3", "Đồng tối"],
  ["ivory", "Ngà"],
  ["ivory-2", "Ngà 2"],
  ["ivory-3", "Ngà 3"],
  ["claret", "Rượu vang"],
  ["claret-text", "Chữ vang"],
  ["gain", "Lời"],
  ["loss", "Lỗ"],
] as const;

const TYPE = [
  ["--fs-6xl", "display", "Bàn thứ Sáu"],
  ["--fs-5xl", "display", "Sảnh của hội bạn"],
  ["--fs-4xl", "display", "Người thắng: Bình"],
  ["--fs-3xl", "display", "Pot 1.460"],
  ["--fs-2xl", "text", "Bàn thứ Sáu · 6 ghế"],
  ["--fs-xl", "text", "Tiêu đề nhỏ"],
  ["--fs-lg", "text", "Giá trị nhấn mạnh 12.840"],
  ["--fs-base", "text", "Chữ thường: Lym đã theo cược, còn lượt của An."],
  ["--fs-md", "text", "Dòng phụ: mời bạn bè bằng link, không cần tài khoản."],
  ["--fs-sm", "text", "Chú thích · 21:06 · gợi ý dưới ô nhập"],
  ["--fs-xs", "text", "NHÃN · HUY HIỆU"],
] as const;

const MATERIALS: [string, string][] = [
  ["Nỉ", "var(--tx-felt), radial-gradient(ellipse at 50% 40%, #237e57, #0f4630)"],
  ["Gỗ", "var(--tx-wood), linear-gradient(90deg, #1a110a, #3a2417)"],
  ["Da", "var(--leather)"],
  ["Đồng thau", "var(--tx-brushed), var(--brass-metal)"],
  ["Giấy bài", "var(--tx-paper), linear-gradient(165deg, #fffdf7, #ece1c7)"],
];

function Section({ id, title, note, children }: { id: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mt-12 phone:mt-8">
      <span className="eyebrow">{String(SECTIONS.findIndex((s) => s[0] === id) + 1).padStart(2, "0")}</span>
      <h2 id={`${id}-h`} className="mt-1 font-display text-d1-4xl font-bold">
        {title}
      </h2>
      {note && <p className="mt-1 max-w-3xl text-d1-md text-ivory-3">{note}</p>}
      <div className="mt-5 phone:mt-3">{children}</div>
    </section>
  );
}

function Row({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-4 phone:gap-3 ${className}`}>{children}</div>;
}

function Label({ children }: { children: ReactNode }) {
  return <span className="text-d1-sm text-ivory-3">{children}</span>;
}

function Tokens() {
  return (
    <>
      <Section id="mau" title="Màu" note="Biến CSS trên :root (src/ui/tokens.css) và lớp Tailwind tương ứng: bg-brass, text-ivory-2, border-line …">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {COLORS.map(([v, name]) => (
            <div key={v} className="overflow-hidden rounded-d1-md border border-hair bg-panel-b">
              <div className="h-14" style={{ background: `var(--${v})` }} />
              <div className="px-3 py-2">
                <b className="block text-d1-md">{name}</b>
                <code className="text-d1-xs text-ivory-3">--{v}</code>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="chu" title="Chữ" note="Josefin Sans 600/700 cho tiêu đề và số lớn; Be Vietnam Pro 500–800 cho mọi chữ giao diện. Không có nét dưới 500. Dấu chồng phải hiện đúng: ầ ặ ữ ỗ ể ậ ẵ.">
        <div className="panel grid gap-3">
          {TYPE.map(([v, family, text]) => (
            <div key={v} className="grid grid-cols-[120px_1fr] items-baseline gap-4 phone:grid-cols-[96px_1fr]">
              <code className="text-d1-xs text-ivory-3">{v}</code>
              <span style={{ fontSize: `var(${v})`, fontFamily: `var(--${family})`, fontWeight: family === "display" ? 700 : 500, lineHeight: 1.2 }}>{text}</span>
            </div>
          ))}
          <div className="mt-2 grid gap-1 border-t border-hair pt-3">
            <span className="font-display text-d1-3xl font-bold">Josefin: Ầm ầm, nặng trĩu, những người bạn — Thắng lớn ở ván ữ</span>
            <span className="text-d1-lg font-bold">Be Vietnam Pro: Ầm ầm, nặng trĩu, những người bạn — Thắng lớn ở ván ữ</span>
            <span className="text-d1-base">
              Số xếp cột: <b>1.460</b> · <b className="is-gain">{signed(1130)}</b> · <b className="is-loss">{signed(-540)}</b> · <b className={`is-${tone(0)}`}>{signed(0)}</b>
            </span>
          </div>
        </div>
      </Section>

      <Section id="chat-lieu" title="Chất liệu, bo góc, bóng" note="--tx-felt, --tx-wood, --leather, --brass-metal, --tx-paper; bo góc --r-sm/md/lg/xl; bóng --sh-1/2/3.">
        <Row>
          {MATERIALS.map(([name, bg]) => (
            <div key={name} className="grid gap-2 text-center">
              <div className="h-24 w-36 rounded-d1-lg shadow-d1-2 phone:h-16 phone:w-28" style={{ background: bg }} />
              <Label>{name}</Label>
            </div>
          ))}
        </Row>
        <Row className="mt-6">
          {(["sm", "md", "lg", "xl"] as const).map((r, i) => (
            <div key={r} className="grid gap-2 text-center">
              <div className="h-20 w-28 border border-line bg-panel-a" style={{ borderRadius: `var(--r-${r})`, boxShadow: `var(--sh-${Math.min(i + 1, 3)})` }} />
              <Label>
                --r-{r} · --sh-{Math.min(i + 1, 3)}
              </Label>
            </div>
          ))}
        </Row>
      </Section>
    </>
  );
}

function Buttons() {
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState(true);
  return (
    <Section id="nut" title="Nút" note="primary (đồng thau), ghost, quiet, danger, felt, light, paper × sm/md/lg. Trên điện thoại ngang mọi nút cao ≥ 44px. Bấm Tab để thấy vòng focus.">
      <div className="grid gap-4">
        {(["primary", "ghost", "quiet", "danger", "felt", "light"] as const).map((kind) => (
          <Row key={kind}>
            <code className="w-20 text-d1-xs text-ivory-3">{kind}</code>
            <Button kind={kind} size="sm">
              Nhỏ
            </Button>
            <Button kind={kind}>Vừa</Button>
            <Button kind={kind} size="lg" icon={<Plus size={17} strokeWidth={2.4} />}>
              Lớn có biểu tượng
            </Button>
            <Button kind={kind} disabled>
              Không bấm được
            </Button>
          </Row>
        ))}
        <Row>
          <code className="w-20 text-d1-xs text-ivory-3">paper</code>
          <span className="rounded-d1-md p-3" style={{ background: "var(--tx-paper), linear-gradient(165deg, #fffdf7, #ece1c7)" }}>
            <Button kind="paper">Trên nền giấy</Button>
          </span>
          <Button
            kind="primary"
            busy={busy}
            onClick={() => {
              setBusy(true);
              window.setTimeout(() => setBusy(false), 1600);
            }}
            iconRight={<ArrowRight size={16} strokeWidth={2.2} />}
          >
            Bấm để thấy đang gửi
          </Button>
          <IconButton label="Thông báo" badge={1}>
            <Bell size={18} strokeWidth={1.8} />
          </IconButton>
          <IconButton label="Cài đặt bàn">
            <Settings size={18} strokeWidth={1.8} />
          </IconButton>
          <IconButton label="Trò chuyện" pressed={chat} onClick={() => setChat(!chat)}>
            <MessageCircle size={18} strokeWidth={1.8} />
          </IconButton>
          <a className="link" href="#nut">
            Quên mật khẩu?
          </a>
        </Row>
      </div>
    </Section>
  );
}

function Forms() {
  const [show, setShow] = useState(false);
  const [name, setName] = useState("Lym");
  const [on, setOn] = useState(true);
  const [remember, setRemember] = useState(true);
  const [tab, setTab] = useState<"all" | "mine" | "open">("all");
  return (
    <Section id="form" title="Ô nhập, tab, bật/tắt" note="Ô nhập thật (input) trong khung của thiết kế; lỗi đặt aria-invalid và được đọc ra. Trên màn cảm ứng chữ trong ô 16px để iOS không phóng to.">
      <div className="grid grid-cols-3 gap-6 phone:grid-cols-2">
        <div className="form-stack">
          <TextField label="Email" type="email" placeholder="ban@vidu.vn" icon={<Mail size={16} />} autoComplete="email" />
          <TextField label="Tên ở bàn" labelNote="2–20 ký tự" value={name} onChange={(e) => setName(e.target.value)} ok hint="Tên còn trống, dùng được." />
          <TextField
            label="Mật khẩu"
            type={show ? "text" : "password"}
            defaultValue="matkhau"
            icon={<Lock size={16} />}
            error="Mật khẩu cần ít nhất 10 ký tự."
            trailing={
              <button type="button" aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setShow(!show)}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />
          <Strength level={3} />
        </div>
        <div className="form-stack">
          <TextField label="Link mời" mono readOnly value="pokerfriends.vn/j/ban-thu-sau-7K2Q" icon={<Link2 size={16} />} trailing={<Copy size={15} />} />
          <TextField label="Không sửa được" disabled value="khach-a1b2c3" />
          <Checkbox checked={remember} onChange={setRemember}>
            Nhớ đăng nhập trên máy này
          </Checkbox>
          <span className="flex items-center gap-3">
            <Toggle on={on} onChange={setOn} label="Cho người xem vào bàn" />
            <span className="text-d1-md text-ivory-2">Cho người xem vào bàn</span>
          </span>
          <div className="badges">
            {(["muted", "brass", "solid", "gain", "loss", "claret", "felt"] as const).map((k) => (
              <Badge key={k} kind={k}>
                {k}
              </Badge>
            ))}
            <Badge kind="felt" live>
              Đang chơi
            </Badge>
            <Badge kind="muted" icon={<Users size={12} />}>
              4/6
            </Badge>
          </div>
        </div>
        <div className="form-stack phone:col-span-2">
          <Tabs
            id="lobby-tabs"
            label="Lọc phòng"
            value={tab}
            onChange={setTab}
            items={[
              { value: "all", label: "Tất cả", count: 5 },
              { value: "mine", label: "Của tôi", count: 2 },
              { value: "open", label: "Còn ghế" },
            ]}
          />
          <div role="tabpanel" id={`lobby-tabs-panel-${tab}`} aria-labelledby={`lobby-tabs-tab-${tab}`} className="text-d1-md text-ivory-2">
            Đang xem: {tab === "all" ? "tất cả phòng" : tab === "mine" ? "phòng của tôi" : "phòng còn ghế"} (mũi tên trái/phải để đổi tab).
          </div>
          <Tabs id="small-tabs" label="Khoảng thời gian" value="7" onChange={() => {}} small items={[{ value: "7", label: "7 ngày" }, { value: "30", label: "30 ngày" }]} />
          <Alert title="Đã gửi link đặt lại mật khẩu" icon={<Mail size={18} />}>
            Kiểm hộp thư của lym@vidu.vn trong 15 phút.
          </Alert>
          <Alert kind="error" title="Không lưu được cài đặt">
            Thử lại sau vài giây.
          </Alert>
        </div>
      </div>
    </Section>
  );
}

function People() {
  const [left, setLeft] = useState(18);
  useEffect(() => {
    const t = window.setInterval(() => setLeft((s) => (s <= 0 ? 20 : s - 1)), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <Section id="nguoi" title="Avatar, đồng hồ lượt, thương hiệu" note="Màu avatar cố định theo tên. Vòng đồng hồ đổi đỏ khi còn ≤ 5 giây (ở đây đếm thật để xem).">
      <Row>
        {["Lym", "An", "Bình", "Chi", "Dũng", "Giang", "Hà", "Khoa"].map((n) => (
          <span key={n} className="grid justify-items-center gap-1">
            <Avatar name={n} size={44} />
            <Label>{n}</Label>
          </span>
        ))}
        <Avatar name="Lym" size={64} large />
        <span className="relative grid h-[72px] w-[72px] place-items-center">
          <Avatar name="An" size={52} />
          <TimerRing size={52} left={left} total={20} />
        </span>
        <Label>còn {left}s</Label>
      </Row>
      <Row className="mt-6">
        <Wordmark />
        <Wordmark small />
        <Crest size={48} />
        <MiniTable seats={6} seated={4} dealer />
        <MiniTable seats={9} seated={2} w={96} h={58} />
        <span className="qr-wrap">
          <QR modules={sampleQrModules()} size={120} label="Mã QR mẫu (không quét được)" />
          <small>QR mẫu: C4 nối bộ mã hoá thật</small>
        </span>
      </Row>
    </Section>
  );
}

function CardsAndChips() {
  const [up, setUp] = useState(false);
  const [burst, setBurst] = useState(0);
  return (
    <Section id="bai-chip" title="Lá bài và chip" note="Bài nhận mã giao thức (As, Th, 7c; ?? là bài úp). Từ 52px rộng có thêm chỉ số lật ngược ở góc dưới như bài thật.">
      <Row>
        {["As", "Kh", "Qd", "Jc", "Th", "7h", "2s"].map((c) => (
          <PlayingCard key={c} card={c} w={56} />
        ))}
        <PlayingCard card="??" w={56} />
      </Row>
      <Row className="mt-4">
        {[24, 32, 44, 72].map((w) => (
          <PlayingCard key={w} card="Ah" w={w} />
        ))}
        <PlayingCard card="??" w={24} />
        <PlayingCard card="7c" w={44} rotate={-6} />
        <PlayingCard card="2d" w={44} rotate={6} />
        <span className="text-d1-base">
          Trong câu: Bình thắng với <CardText card="Ah" /> <CardText card="Kd" />
        </span>
      </Row>
      <Row className="mt-4">
        <FlipCard card="7d" faceUp={up} w={56} />
        <FlipCard card="2c" faceUp={up} w={56} />
        <Button kind="ghost" size="sm" onClick={() => setUp(!up)}>
          {up ? "Úp lại" : "Lật bài (showdown)"}
        </Button>
        <span className="relative ml-24 inline-block h-14 w-14 phone:ml-16">
          <Confetti key={burst} count={30} spread={0.6} className="left-1/2 top-1/2" />
        </span>
        <Button kind="ghost" size="sm" onClick={() => setBurst((n) => n + 1)}>
          Pháo giấy 7-2
        </Button>
      </Row>
      <Row className="mt-6">
        {[500, 100, 25, 5, 1].map((d) => (
          <span key={d} className="grid justify-items-center gap-1">
            <Chip denom={d} size={32} />
            <Label>{d}</Label>
          </span>
        ))}
        {[40, 135, 860, 2480].map((a) => (
          <span key={a} className="grid justify-items-center gap-1">
            <ChipStack amount={a} size={28} />
            <Label>{fmt(a)}</Label>
          </span>
        ))}
        <span className="grid justify-items-center gap-1">
          <ChipStack amount={12840} size={28} cols={3} />
          <Label>{fmt(12840)} · 3 cột</Label>
        </span>
      </Row>
    </Section>
  );
}

function Surfaces() {
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [lost, setLost] = useState(false);
  const [sheet, setSheet] = useState(false);
  return (
    <Section id="lop-phu" title="Panel, toast, modal, sheet" note="Modal và sheet là <dialog> thật: giữ focus bên trong, Esc hoặc bấm ra ngoài để đóng.">
      <div className="grid grid-cols-2 gap-6 phone:gap-4">
        <Panel title="Bàn thứ Sáu" aside="6 ghế · mù 10/20">
          <p className="text-d1-md text-ivory-2">Panel da với viền đồng thau mảnh, dùng cho mọi khối nội dung trên desktop.</p>
        </Panel>
        <Panel phone title="Thẻ điện thoại">
          <p className="text-d1-md text-ivory-2">Bản gọn của panel cho màn ngang (.m-card).</p>
        </Panel>
      </div>
      <Row className="mt-5">
        <Button kind="ghost" onClick={() => toast({ kind: "danger", title: "Bạn đã bị mời ra khỏi phòng", text: "Chủ phòng Bàn thứ Sáu đã mời bạn ra. 1.460 chip vẫn ghi trong lịch sử.", icon: <DoorOpen size={20} strokeWidth={1.9} /> })}>
          Toast lỗi
        </Button>
        <Button kind="ghost" onClick={() => toast({ kind: "info", title: "Đã chép link mời", text: "Gửi cho hội bạn qua Zalo hay Messenger." })}>
          Toast thông tin
        </Button>
        <Button kind="ghost" onClick={() => toast({ kind: "success", title: "Đã lưu cài đặt bàn" })}>
          Toast thành công
        </Button>
        <Button kind="ghost" onClick={() => setModal(true)}>
          Mở modal
        </Button>
        <Button kind="ghost" onClick={() => setLost(true)}>
          Modal không đóng được
        </Button>
        <Button kind="ghost" onClick={() => setSheet(true)}>
          Mở sheet
        </Button>
      </Row>
      <div className="mt-5 max-w-[430px]">
        <Toast kind="danger" title="Bạn đã bị mời ra khỏi phòng" text="Chủ phòng Bàn thứ Sáu đã mời bạn ra. 1.460 chip vẫn ghi trong lịch sử." icon={<DoorOpen size={20} strokeWidth={1.9} />} onClose={() => {}} />
      </div>
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        icon={<Spinner />}
        title="Đang nối lại…"
        actions={
          <>
            <Button kind="primary" onClick={() => setModal(false)}>
              Thử lại ngay
            </Button>
            <Button kind="quiet" onClick={() => setModal(false)}>
              Rời bàn
            </Button>
          </>
        }
      >
        Mạng vừa chập chờn. Ghế và chip của bạn vẫn giữ nguyên; bàn tự chơi tiếp khi bạn vào lại.
      </Modal>
      <Modal
        open={lost}
        onClose={() => setLost(false)}
        dismissible={false}
        icon={<Spinner />}
        title="Mất kết nối"
        actions={
          <Button kind="primary" onClick={() => setLost(false)}>
            Giả lập: đã nối lại
          </Button>
        }
      >
        Esc và bấm ra ngoài không đóng được; chỉ màn chơi đóng khi socket nối lại.
      </Modal>
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Bảng chủ phòng" aside={<Badge kind="brass">Chủ phòng</Badge>}>
        <TextField label="Tên phòng" defaultValue="Bàn thứ Sáu" />
        <span className="flex items-center justify-between">
          <span className="text-d1-md text-ivory-2">Cho người xem vào bàn</span>
          <Toggle on onChange={() => {}} label="Cho người xem vào bàn" />
        </span>
        <Button kind="danger" block>
          Đóng phòng
        </Button>
      </Sheet>
    </Section>
  );
}

function States() {
  return (
    <Section id="trang-thai" title="Đang tải, lỗi, trống" note="Dải sáng chạy qua khối đang tải (đứng yên khi giảm chuyển động). Trên điện thoại ngang, khối lỗi và khối trống xếp thành một hàng.">
      <div className="grid grid-cols-3 gap-6 phone:grid-cols-2 phone:gap-4">
        <Loading className="panel grid content-start gap-3 phone:col-span-1">
          <Skeleton className="sk-title" />
          <Skeleton className="sk-search" />
          <SkeletonCard />
          <SkeletonCard compact />
        </Loading>
        <div className="panel grid place-items-center text-center">
          <ErrorState
            title="Không tải được danh sách phòng"
            text="Mạng đang chập chờn. Bàn và chip của bạn vẫn an toàn."
            actions={
              <Button kind="primary" icon={<RotateCw size={15} strokeWidth={2.2} />}>
                Thử lại
              </Button>
            }
            meta="Đã thử 2 lần · lần cuối 21:06"
          />
        </div>
        <div className="panel grid place-items-center text-center phone:col-span-2">
          <EmptyState
            art={<MiniTable seats={6} seated={0} w={180} h={104} />}
            badge={<Plus size={18} strokeWidth={2.4} />}
            title="Sảnh còn trống"
            text="Chưa có phòng nào. Mở bàn đầu tiên rồi gửi link cho hội bạn."
            actions={
              <>
                <Button kind="primary" icon={<Plus size={15} strokeWidth={2.4} />}>
                  Tạo phòng
                </Button>
                <Button kind="ghost" icon={<Link2 size={15} />}>
                  Dán link mời
                </Button>
              </>
            }
          />
        </div>
      </div>
      <Row className="mt-4">
        <LoadingLine>Đang vào bàn…</LoadingLine>
      </Row>
    </Section>
  );
}

/** Live check of motion.ts: a card dealt from the deck, bets thrown into the pot, the pot to the winner. */
function Motion() {
  const deck = useRef<HTMLSpanElement>(null);
  const pot = useRef<HTMLSpanElement>(null);
  const seats = useRef<(HTMLSpanElement | null)[]>([]);
  const [dealt, setDealt] = useState(0);
  const [phase, setPhase] = useState<"bets" | "pot" | "won">("bets");
  const box = (el: Element | null | undefined) => el?.getBoundingClientRect() ?? new DOMRect();

  const deal = () => {
    const from = box(deck.current);
    setDealt((n) => (n >= 6 ? 0 : n + 2));
    requestAnimationFrame(() => {
      document.querySelectorAll<HTMLElement>("[data-new-card]").forEach((el, i) => {
        fly(el, from, { duration: DURATION.deal, delay: i * STAGGER.deal, lift: 24 });
        el.removeAttribute("data-new-card");
      });
    });
  };
  const collect = () => {
    if (phase === "bets") {
      const froms = seats.current.map((s) => box(s));
      setPhase("pot");
      requestAnimationFrame(() => {
        document.querySelectorAll<HTMLElement>("[data-pot-chip]").forEach((el, i) => fly(el, froms[i], { duration: DURATION.chip, delay: i * STAGGER.chips, easing: EASE.settle }));
      });
    } else if (phase === "pot") {
      const from = box(pot.current);
      setPhase("won");
      requestAnimationFrame(() => {
        const el = document.querySelector("[data-won]");
        if (el) fly(el, from, { duration: DURATION.collect, lift: 30 });
      });
    } else setPhase("bets");
  };

  return (
    <Section
      id="chuyen-dong"
      title="Chuyển động"
      note={
        <>
          Thời lượng và easing chuẩn ở src/ui/motion.ts (và --dur-*, --ease-* trong CSS); kế hoạch từng animation ở docs/c2-chuyen-dong.md. Bật &quot;Giảm chuyển động&quot; của máy: bay biến thành mờ dần 120ms.
        </>
      }
    >
      <div className="grid grid-cols-[1fr_auto] gap-6 phone:gap-4">
        <div className="relative grid min-h-[220px] grid-cols-3 items-center gap-4 rounded-[120px] border-[6px] border-[#3a2417] p-6 phone:min-h-[170px]" style={{ background: "var(--tx-felt), radial-gradient(ellipse at 50% 40%, #237e57, #0f4630)" }}>
          <span className="grid justify-items-center gap-2">
            <span ref={deck}>
              <PlayingCard card="??" w={40} />
            </span>
            <Label>bộ bài</Label>
          </span>
          <span ref={pot} className="grid justify-items-center gap-2">
            {phase === "pot" ? (
              [0, 1, 2].map((i) => (
                <span key={i} data-pot-chip>
                  <ChipStack amount={[120, 120, 60][i]} size={22} />
                </span>
              ))
            ) : (
              <Label>pot</Label>
            )}
          </span>
          <span className="grid justify-items-center gap-2">
            <span className="flex min-h-[56px] gap-1">
              {Array.from({ length: dealt }, (_, i) => (
                <span key={i} data-new-card={i >= dealt - 2 ? "" : undefined}>
                  <PlayingCard card="??" w={40} />
                </span>
              ))}
            </span>
            <Label>ghế của Lym</Label>
            {phase === "won" && (
              <span data-won>
                <ChipStack amount={300} size={22} cols={2} />
              </span>
            )}
          </span>
          <span className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-6">
            {[0, 1, 2].map((i) => (
              <span key={i} ref={(el) => {
                seats.current[i] = el;
              }}>
                {phase === "bets" ? <ChipStack amount={[120, 120, 60][i]} size={18} /> : <span className="inline-block h-[20px] w-[18px]" />}
              </span>
            ))}
          </span>
        </div>
        <div className="grid content-start gap-3">
          <Button kind="ghost" size="sm" onClick={deal}>
            Chia 2 lá
          </Button>
          <Button kind="ghost" size="sm" onClick={collect}>
            {phase === "bets" ? "Gom cược vào pot" : phase === "pot" ? "Pot về người thắng" : "Làm lại"}
          </Button>
          <table className="text-d1-sm text-ivory-3">
            <tbody>
              {Object.entries(DURATION).map(([k, v]) => (
                <tr key={k}>
                  <td className="pr-3">{k}</td>
                  <td className="text-right text-ivory-2">{v}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

export function Gallery() {
  return (
    <AppShell active="lobby" me={{ name: "Lym", notifications: 1, notificationsHref: "/account" }}>
      <ToastProvider>
        <PageHead eyebrow="C2 · nền giao diện" title="Bộ giao diện D1 · Nỉ & Đồng thau" sub="Mọi token và component dùng chung, để C3/C4 dựng màn và so với design/c1." />
        <nav aria-label="Mục" className="flex flex-wrap gap-2">
          {SECTIONS.map(([id, name]) => (
            <a key={id} href={`#${id}`} className="badge b-muted">
              {name}
            </a>
          ))}
        </nav>
        <Tokens />
        <Buttons />
        <Forms />
        <People />
        <CardsAndChips />
        <Surfaces />
        <States />
        <Motion />
      </ToastProvider>
    </AppShell>
  );
}
