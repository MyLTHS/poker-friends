// Records & states: history (scorebook), replay, loading / error / empty + kicked toast.
import type { CSSProperties, ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Link2,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  UserX,
  X,
} from "lucide-react";

import { HANDS, REPLAY, SUMMARY, type Card } from "../../../shared/data";
import type { Device } from "../../../shared/screens";
import { Board, Pot } from "../table";
import {
  Avatar,
  Badge,
  Bet,
  Btn,
  HomeBar,
  IconBtn,
  OnTable,
  PCard,
  Root,
  SecHead,
  Seg,
  Slider,
  StatusBar,
  TabBar,
  TopNav,
  fmt,
  signed,
  toneOf,
} from "../ui";

/* =====================================================================
   history
   ===================================================================== */

const SORTED = [...SUMMARY].sort((a, b) => b.net - a.net);
const MAX_NET = Math.max(...SUMMARY.map((s) => Math.abs(s.net)));
const SEVEN_HAND = 37;

function NetBar({ v }: { v: number }) {
  const w = (Math.abs(v) / MAX_NET) * 50;
  return (
    <span className="netbar">
      <i className={toneOf(v)} style={v >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />
    </span>
  );
}

function SummaryTable() {
  const total = (k: "granted" | "balance") => SUMMARY.reduce((a, s) => a + s[k], 0);
  return (
    <div className="ruled-table sum-t">
      <div className="rt-h">
        <span>Người chơi</span>
        <span className="r">Được cấp</span>
        <span className="r">Số ván</span>
        <span className="r">7-2</span>
        <span className="r">Còn</span>
        <span className="r">Lời / lỗ</span>
        <span />
      </div>
      {SORTED.map((s) => (
        <div key={s.name} className={`rt-r${s.name === "Lym" ? " me" : ""}`}>
          <span className="who">
            <Avatar name={s.name} size={28} />
            <b>{s.name}</b>
            {s.name === "Lym" && <em>bạn</em>}
          </span>
          <span className="mono r">{fmt(s.granted)}</span>
          <span className="mono r">{s.hands}</span>
          <span className={`mono r ${toneOf(s.sevenDeuce)}`}>{s.sevenDeuce ? signed(s.sevenDeuce) : "—"}</span>
          <span className="mono r">{fmt(s.balance)}</span>
          <span className={`mono r net ${toneOf(s.net)}`}>{signed(s.net)}</span>
          <NetBar v={s.net} />
        </div>
      ))}
      <div className="rt-r total">
        <span className="who">
          <b>Cộng</b>
        </span>
        <span className="mono r">{fmt(total("granted"))}</span>
        <span className="r muted">—</span>
        <span className="r muted">—</span>
        <span className="mono r">{fmt(total("balance"))}</span>
        <span className="mono r net">0</span>
        <span className="balanced">cân bằng</span>
      </div>
    </div>
  );
}

function HandRow({ h, compact }: { h: (typeof HANDS)[number]; compact?: boolean }) {
  const me = h.players.find((p) => p.name === "Lym");
  if (h.voided)
    return (
      <div className="hand-r voided">
        <span className="mono hand-no">#{h.no}</span>
        <span className="mono hand-at">{h.at}</span>
        <span className="hand-ps">
          <Badge kind="redline">Đã huỷ</Badge>
          <small>{compact ? "không tính chip" : "Ván bị huỷ · không tính chip, không xem lại được"}</small>
        </span>
        <span className="hand-me" />
      </div>
    );
  return (
    <div className="hand-r">
      <span className="mono hand-no">#{h.no}</span>
      <span className="mono hand-at">{h.at}</span>
      <span className="hand-ps">
        {h.no === SEVEN_HAND && <Badge kind="red">7-2</Badge>}
        {h.players.map((p, i) => (
          <span key={p.name} className="hp">
            {i > 0 && <i>·</i>}
            {p.name} <span className={`mono ${toneOf(p.net)}`}>{signed(p.net)}</span>
          </span>
        ))}
      </span>
      <span className="hand-me">
        {me ? <span className={`mono ${toneOf(me.net)}`}>{signed(me.net)}</span> : <span className="muted">—</span>}
        <ChevronRight size={16} strokeWidth={1.8} />
      </span>
    </div>
  );
}

export function HistoryScreen({ device }: { device: Device }) {
  if (device === "desktop")
    return (
      <Root device="desktop" className="paged">
        <TopNav active="history" />
        <div className="page history">
          <div className="page-head row">
            <div>
              <span className="eyebrow">Sổ điểm · Bàn thứ Sáu</span>
              <h1 className="serif">Lời / lỗ của phòng</h1>
              <p>38 ván · 5 người có chip · cập nhật sau mỗi ván</p>
            </div>
            <Seg items={["Bàn thứ Sáu", "Tập luyện nhẹ"]} on={0} />
          </div>
          <div className="hist-grid">
            <section className="panel">
              <SecHead title="Bảng tổng kết" meta="xếp theo lời / lỗ" />
              <SummaryTable />
              <p className="note">
                Lời / lỗ = còn − được cấp. Cột 7-2 là tiền thưởng đã trả hoặc nhận. Tổng luôn về 0 vì chip chỉ chuyển giữa
                người trong phòng.
              </p>
            </section>
            <section className="panel">
              <SecHead title="Các ván" meta="mới nhất trước" />
              <div className="hand-h">
                <span>Ván</span>
                <span>Giờ</span>
                <span>Kết quả</span>
                <span className="r">Bạn</span>
              </div>
              {HANDS.map((h) => (
                <HandRow key={h.no} h={h} />
              ))}
              <div className="more">
                Xem thêm 34 ván <ChevronRight size={14} strokeWidth={2} />
              </div>
            </section>
          </div>
        </div>
      </Root>
    );
  return (
    <Root device="mobile" className="paged">
      <StatusBar />
      <div className="m-head">
        <div>
          <span className="eyebrow">Sổ điểm · 38 ván</span>
          <h1 className="serif">Lời / lỗ</h1>
        </div>
        <Seg items={["Bàn thứ Sáu", "Luyện"]} on={0} className="sm" />
      </div>
      <div className="m-stack hist-m">
        <SecHead title="Tổng kết" meta="cân bằng về 0" />
        <div className="sum-m">
          {SORTED.map((s) => (
            <div key={s.name} className={`sm-r${s.name === "Lym" ? " me" : ""}`}>
              <Avatar name={s.name} size={30} />
              <span className="sm-who">
                <b>
                  {s.name}
                  {s.name === "Lym" && <em> · bạn</em>}
                </b>
                <small>
                  cấp <span className="mono">{fmt(s.granted)}</span> · <span className="mono">{s.hands}</span> ván · 7-2{" "}
                  <span className="mono">{s.sevenDeuce ? signed(s.sevenDeuce) : "0"}</span> · còn{" "}
                  <span className="mono">{fmt(s.balance)}</span>
                </small>
              </span>
              <span className={`mono sm-net ${toneOf(s.net)}`}>{signed(s.net)}</span>
            </div>
          ))}
        </div>
        <SecHead title="Các ván" meta="chạm để xem lại" />
        <div className="hands-m">
          {HANDS.map((h) => (
            <HandRow key={h.no} h={h} compact />
          ))}
        </div>
      </div>
      <TabBar active="history" />
    </Root>
  );
}

/* =====================================================================
   replay — step 5 of 7 (REPLAY.step is zero-based)
   ===================================================================== */

const STEP_LABELS = ["Chia", "Theo", "Check", "Flop", "Tố", "Bỏ", "Kết"];
const [P_ME, P_BINH, P_CHI] = REPLAY.players;

function RSeat({
  name,
  stack,
  cards,
  note,
  folded,
  me,
  style,
}: {
  name: string;
  stack: number;
  cards: Card[];
  note: string;
  folded?: boolean;
  me?: boolean;
  style: CSSProperties;
}) {
  const up = cards.length > 0 && cards[0] !== "back";
  return (
    <div className={`seat${folded ? " st-folded" : ""}${me ? " r-me" : ""}`} style={style}>
      {cards.length > 0 && (
        <div className={`seat-cards ${up ? "up" : "down"}`}>
          {cards.map((c, i) => (
            <PCard key={i} c={c} size={up ? "sm" : "xs"} />
          ))}
        </div>
      )}
      <div className="seat-tab">
        {folded ? <Badge kind="muted">Đã bỏ</Badge> : me ? <Badge kind="line">Bạn</Badge> : <Badge kind="red">{note}</Badge>}
      </div>
      <span className="seat-av">
        <Avatar name={name} size={36} />
      </span>
      <span className="seat-txt">
        <span className="seat-name">{name}</span>
        <span className="seat-sub">
          <span className="mono">{fmt(stack)}</span>
          {!up && cards.length > 0 && <span className="seat-act">bài úp</span>}
        </span>
      </span>
    </div>
  );
}

function Timeline({ compact }: { compact?: boolean }) {
  return (
    <ol className={`timeline${compact ? " compact" : ""}`}>
      {REPLAY.timeline.map((t, i) => (
        <li key={i} className={i === REPLAY.step ? "now" : i > REPLAY.step ? "next" : "done"}>
          <span className="mono tl-i">{i + 1}</span>
          <span className="tl-t">{t}</span>
          {i === REPLAY.step && <span className="tl-here">đang xem</span>}
        </li>
      ))}
    </ol>
  );
}

function Controls({ compact }: { compact?: boolean }) {
  const s = compact ? 18 : 20;
  return (
    <div className="r-ctrl">
      <IconBtn icon={<SkipBack size={s} strokeWidth={1.8} />} label="Về đầu" />
      <IconBtn icon={<StepBack size={s} strokeWidth={1.8} />} label="Lùi một bước" />
      <span className="play">
        <Play size={compact ? 20 : 22} strokeWidth={2} />
      </span>
      <IconBtn icon={<StepForward size={s} strokeWidth={1.8} />} label="Tới một bước" />
      <IconBtn icon={<SkipForward size={s} strokeWidth={1.8} />} label="Tới cuối" />
    </div>
  );
}

function StepSlider() {
  return (
    <div className="r-slider">
      <Slider value={REPLAY.step / (REPLAY.steps - 1)} ticks={REPLAY.steps} />
      <div className="r-ticks">
        {STEP_LABELS.map((l, i) => (
          <span key={i} className={i === REPLAY.step ? "on" : ""} style={{ left: `${(i / (REPLAY.steps - 1)) * 100}%` }}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

function Result({ compact }: { compact?: boolean }) {
  const h = HANDS.find((x) => x.no === REPLAY.handNo)!;
  return (
    <div className={`r-result${compact ? " compact" : ""}`}>
      <span className="eyebrow">Kết quả ván #{REPLAY.handNo}</span>
      <div className="r-res-row">
        <span>{REPLAY.timeline[REPLAY.steps - 1]}</span>
        {h.players.map((p) => (
          <span key={p.name} className={`mono ${toneOf(p.net)}`}>
            {p.name} {signed(p.net)}
          </span>
        ))}
      </div>
      {!compact && <small>Bài của Bình úp đến hết — ván kết thúc không cần lật bài.</small>}
    </div>
  );
}

function ReplayDesk() {
  return (
    <>
      <TopNav active="history" />
      <div className="page replay">
        <div className="page-head row">
          <div>
            <span className="eyebrow back">
              <ChevronLeft size={14} strokeWidth={2} /> Lịch sử · Bàn thứ Sáu
            </span>
            <h1 className="serif">Xem lại ván #{REPLAY.handNo}</h1>
            <p>21:03 · blind 10/20 · 3 người · bạn chỉ thấy bài của mình</p>
          </div>
          <Seg items={["1×", "2×", "4×"]} on={0} mono />
        </div>
        <div className="replay-grid">
          <section className="panel r-main">
            <div className="r-stage">
              <div className="stadium" style={{ left: 200, top: 92, width: 520, height: 250 }}>
                <div className="stadium-in" />
              </div>
              <OnTable at={[460, 136]}>
                <Pot amount={REPLAY.pot} />
              </OnTable>
              <div className="board-pos" style={{ left: 260, top: 168 }}>
                <Board cards={REPLAY.board} size="lg" />
              </div>
              <RSeat
                name={P_BINH.name}
                stack={P_BINH.stack}
                cards={P_BINH.cards}
                note={P_BINH.note}
                style={{ left: 100, top: 28 }}
              />
              <RSeat name={P_CHI.name} stack={P_CHI.stack} cards={P_CHI.cards} note={P_CHI.note} folded style={{ left: 628, top: 28 }} />
              <RSeat name={P_ME.name} stack={P_ME.stack} cards={P_ME.cards} note={P_ME.note} me style={{ left: 364, top: 384 }} />
              <Bet at={[322, 128]} amount={P_BINH.bet} />
            </div>
            <div className="r-panel">
              <div className="r-now">
                <span className="eyebrow red">
                  Bước {REPLAY.step + 1} / {REPLAY.steps} · Flop
                </span>
                <h2 className="serif">{REPLAY.action}</h2>
                <small>
                  Pot <span className="mono">{REPLAY.pot}</span> · Lym cần theo <span className="mono">120</span>
                </small>
              </div>
              <div className="r-right">
                <StepSlider />
                <Controls />
              </div>
            </div>
          </section>
          <aside className="panel r-side">
            <SecHead title="Diễn biến" meta={`${REPLAY.steps} bước`} />
            <Timeline />
            <Result />
          </aside>
        </div>
      </div>
    </>
  );
}

function ReplayMob() {
  return (
    <>
      <StatusBar />
      <div className="mbar">
        <IconBtn icon={<ChevronLeft size={22} strokeWidth={1.8} />} label="Lịch sử" />
        <b className="serif">Ván #{REPLAY.handNo}</b>
        <span className="mbar-r mono">
          {REPLAY.step + 1}/{REPLAY.steps}
        </span>
      </div>
      <div className="rm-stage">
        <div className="stadium m" style={{ left: 40, top: 30, width: 310, height: 176 }}>
          <div className="stadium-in" />
        </div>
        <OnTable at={[195, 74]}>
          <Pot amount={REPLAY.pot} small />
        </OnTable>
        <div className="board-pos" style={{ left: 92, top: 100 }}>
          <Board cards={REPLAY.board} size="sm" />
        </div>
        <RMSeat name={P_BINH.name} stack={P_BINH.stack} at={[40, 118]} tag={P_BINH.note} back />
        <RMSeat name={P_CHI.name} stack={P_CHI.stack} at={[350, 118]} tag="Đã bỏ" folded />
        <Bet at={[112, 80]} amount={P_BINH.bet} small />
        <div className="rm-me" style={{ left: 87, top: 178 }}>
          <Avatar name="Lym" size={40} />
          <span className="rm-me-t">
            <b>Lym · bạn</b>
            <span className="mono">{fmt(P_ME.stack)}</span>
          </span>
          <span className="rm-me-cards">
            {P_ME.cards.map((c, i) => (
              <PCard key={i} c={c} size="sm" />
            ))}
          </span>
        </div>
      </div>
      <div className="m-stack replay-m">
        <div className="r-now">
          <span className="eyebrow red">
            Bước {REPLAY.step + 1} / {REPLAY.steps} · Flop
          </span>
          <h2 className="serif">{REPLAY.action}</h2>
        </div>
        <StepSlider />
        <Controls compact />
        <Timeline compact />
        <Result compact />
      </div>
      <HomeBar />
    </>
  );
}

function RMSeat({
  name,
  stack,
  at,
  tag,
  back,
  folded,
}: {
  name: string;
  stack: number;
  at: [number, number];
  tag: string;
  back?: boolean;
  folded?: boolean;
}) {
  return (
    <div className={`ms rms${folded ? " mst-folded" : ""}`} style={{ left: at[0] - 36, top: at[1] - 20 }}>
      {back && (
        <span className="ms-cards">
          <i />
          <i />
        </span>
      )}
      <Avatar name={name} size={40} />
      <span className="ms-badge">{folded ? <Badge kind="muted">{tag}</Badge> : <Badge kind="red">{tag}</Badge>}</span>
      <span className="ms-label">
        <span className="ms-name">{name}</span>
        <span className="ms-stack mono">{fmt(stack)}</span>
      </span>
    </div>
  );
}

export function Replay({ device }: { device: Device }) {
  return (
    <Root device={device} className="paged">
      {device === "desktop" ? <ReplayDesk /> : <ReplayMob />}
    </Root>
  );
}

/* =====================================================================
   states — loading, network error, empty lobby, kicked toast
   ===================================================================== */

function Skeleton({ rows, compact }: { rows: number; compact?: boolean }) {
  return (
    <div className={`skel${compact ? " compact" : ""}`}>
      {!compact && <i className="sk sk-search" />}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="sk-row">
          <i className="sk sk-av" />
          <span className="sk-lines">
            <i className="sk" style={{ width: `${68 - i * 9}%` }} />
            <i className="sk thin" style={{ width: `${44 + i * 6}%` }} />
          </span>
          <i className="sk sk-btn" />
        </div>
      ))}
      <span className="sk-cap">
        <LoaderCircle size={14} strokeWidth={2} /> Đang tải danh sách phòng…
      </span>
    </div>
  );
}

function NetError({ compact }: { compact?: boolean }) {
  if (compact)
    return (
      <div className="state-row">
        <span className="state-ic warn">
          <CloudOff size={20} strokeWidth={1.7} />
        </span>
        <div className="state-txt">
          <h3 className="serif">Không tải được sảnh</h3>
          <p>Mạng chập chờn hoặc máy chủ chưa trả lời.</p>
        </div>
        <div className="state-acts">
          <Btn v="ink" s="md" icon={<RefreshCw size={15} strokeWidth={1.9} />}>
            Thử lại
          </Btn>
          <small>
            tự thử lại sau <span className="mono">10</span> giây
          </small>
        </div>
      </div>
    );
  return (
    <div className="state-box">
      <span className="state-ic warn">
        <CloudOff size={compact ? 20 : 26} strokeWidth={1.7} />
      </span>
      <h3 className="serif">Không tải được sảnh</h3>
      <p>Mạng chập chờn hoặc máy chủ chưa trả lời. Ván bạn đang chơi vẫn an toàn.</p>
      <Btn v="ink" s={compact ? "md" : "lg"} icon={<RefreshCw size={16} strokeWidth={1.9} />}>
        Thử lại
      </Btn>
      <small>
        Lần thử cuối <span className="mono">21:04</span> · tự thử lại sau <span className="mono">10</span> giây
      </small>
    </div>
  );
}

function EmptyArt({ w, h, seats = 6 }: { w: number; h: number; seats?: number }) {
  const small = w < 80;
  const px = small ? 9 : 18;
  const py = small ? 9 : 16;
  const r = small ? 3.5 : 9;
  return (
    <svg className="empty-art" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <rect x={px} y={py} width={w - 2 * px} height={h - 2 * py} rx={(h - 2 * py) / 2} className="ea-felt" />
      {Array.from({ length: seats }, (_, i) => {
        const t = Math.PI / 2 + (i * 2 * Math.PI) / seats;
        return <circle key={i} cx={w / 2 + (w / 2 - px) * Math.cos(t)} cy={h / 2 + (h / 2 - py) * Math.sin(t)} r={r} className="ea-seat" />;
      })}
    </svg>
  );
}

function Empty({ compact }: { compact?: boolean }) {
  if (compact)
    return (
      <div className="state-row">
        <span className="state-ic line">
          <EmptyArt w={40} h={40} seats={4} />
        </span>
        <div className="state-txt">
          <h3 className="serif">Chưa có phòng nào</h3>
          <p>Tạo bàn đầu tiên rồi gửi link cho bạn bè.</p>
        </div>
        <div className="state-acts">
          <Btn v="red" s="md" icon={<Plus size={15} strokeWidth={2} />}>
            Tạo phòng
          </Btn>
          <Btn v="line" s="md" icon={<Link2 size={15} strokeWidth={1.9} />}>
            Dán link mời
          </Btn>
        </div>
      </div>
    );
  return (
    <div className="state-box">
      <EmptyArt w={220} h={110} />
      <h3 className="serif">Chưa có phòng nào</h3>
      <p>Tạo bàn đầu tiên rồi gửi link mời cho bạn bè.</p>
      <div className="state-acts">
        <Btn v="red" s={compact ? "md" : "lg"} icon={<Plus size={16} strokeWidth={2} />}>
          Tạo phòng
        </Btn>
        <Btn v="line" s={compact ? "md" : "lg"} icon={<Link2 size={16} strokeWidth={1.9} />}>
          Dán link mời
        </Btn>
      </div>
    </div>
  );
}

function KickedToast() {
  return (
    <div className="toast">
      <span className="toast-ic">
        <UserX size={18} strokeWidth={1.9} />
      </span>
      <span className="toast-t">
        <b>Bạn đã bị mời ra khỏi phòng</b>
        <small>Chủ phòng Bàn thứ Sáu đã mời bạn ra. Chip còn lại vẫn nằm trong sổ của phòng.</small>
      </span>
      <IconBtn icon={<X size={16} strokeWidth={2} />} label="Đóng" />
    </div>
  );
}

function StateCol({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="panel state-col">
      <div className="state-cap">
        <b className="mono">{n}</b>
        <span className="eyebrow">{title}</span>
      </div>
      {children}
    </section>
  );
}

export function States({ device }: { device: Device }) {
  if (device === "desktop")
    return (
      <Root device="desktop" className="paged">
        <TopNav active="rooms" />
        <div className="page states">
          <div className="page-head">
            <span className="eyebrow">Trạng thái của sảnh</span>
            <h1 className="serif">Khi chưa có gì để hiện</h1>
          </div>
          <div className="states-grid">
            <StateCol n={1} title="Đang tải">
              <Skeleton rows={4} />
            </StateCol>
            <StateCol n={2} title="Lỗi mạng">
              <NetError />
            </StateCol>
            <StateCol n={3} title="Sảnh trống">
              <Empty />
            </StateCol>
          </div>
        </div>
        <div className="toast-pos" style={{ left: 470, top: 812, width: 500 }}>
          <KickedToast />
        </div>
      </Root>
    );
  return (
    <Root device="mobile" className="paged">
      <StatusBar />
      <div className="toast-pos" style={{ left: 12, top: 50, width: 366 }}>
        <KickedToast />
      </div>
      <div className="m-stack states-m">
        <StateCol n={1} title="Đang tải">
          <Skeleton rows={3} compact />
        </StateCol>
        <StateCol n={2} title="Lỗi mạng">
          <NetError compact />
        </StateCol>
        <StateCol n={3} title="Sảnh trống">
          <Empty compact />
        </StateCol>
      </div>
      <HomeBar />
    </Root>
  );
}

