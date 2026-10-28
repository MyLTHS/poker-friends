// Sơn Mài Vàng Son (d4) — history + profit/loss, hand replay, loading / error / empty / kicked states.
import type { ReactNode } from "react";
import { Ban, Check, ChevronLeft, CloudOff, Link2, Play, Plus, RefreshCw, SkipBack, SkipForward, StepBack, StepForward, UserX, X } from "lucide-react";

import { HANDS, REPLAY, SUMMARY } from "../../../shared/data";
import type { Device } from "../../../shared/screens";
import { fmt, signed, TREND } from "../lib";
import { EmptyArt, MRail, Medallion, TopNav } from "../shell";
import { Board, Felt, Pot } from "../table";
import { Amount, Avatar, Bet, Btn, Eyebrow, HomeBar, IconBtn, Logo, Money, PCard, Panel, Root, Seg, Tag } from "../ui";

/* ================================================================ history */

const MAX_NET = Math.max(...SUMMARY.map((s) => Math.abs(s.net)));

/** Diverging bar around zero: jade to the right for profit, vermilion to the left for loss. */
function NetBar({ n }: { n: number }) {
  const w = (Math.abs(n) / MAX_NET) * 50;
  return (
    <span className="netbar">
      <i className="netbar-zero" />
      {n !== 0 && <i className={n > 0 ? "netbar-up" : "netbar-down"} style={n > 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />}
    </span>
  );
}

/** Lym's running lời/lỗ in this room: gold line over a zero baseline, last value marked. */
function TrendChart() {
  const pts = TREND["Bàn thứ Sáu"];
  const w = 760;
  const h = 108;
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const px = (i: number) => 40 + (i / (pts.length - 1)) * (w - 90);
  const py = (v: number) => 10 + (1 - (v - lo) / (hi - lo)) * (h - 30);
  const line = pts.map((v, i) => `${i ? "L" : "M"}${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join("");
  const last = pts[pts.length - 1];
  return (
    <div className="trend">
      <span className="trend-h">
        <b>Lời/lỗ của bạn qua các ván</b>
        <small>Bàn thứ Sáu · ván 1 → 38</small>
      </span>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
        <defs>
          <linearGradient id="d4trend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e2b866" stopOpacity=".28" />
            <stop offset="1" stopColor="#e2b866" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[hi, 0, lo].map((v) => (
          <g key={v}>
            <line x1="40" x2={w - 50} y1={py(v)} y2={py(v)} className={v === 0 ? "trend-zero" : "trend-grid"} />
            <text x="32" y={py(v) + 4} textAnchor="end" className="trend-y">
              {signed(v)}
            </text>
          </g>
        ))}
        <path d={`${line}L${px(pts.length - 1)} ${py(0)}L${px(0)} ${py(0)}Z`} fill="url(#d4trend)" />
        <path d={line} className="trend-line" />
        {pts.map((v, i) => (
          <circle key={i} cx={px(i)} cy={py(v)} r={i === pts.length - 1 ? 5 : 2.5} className={i === pts.length - 1 ? "trend-last" : "trend-dot"} />
        ))}
        <text x={px(pts.length - 1) + 10} y={py(last) + 5} className="trend-end">
          {signed(last)}
        </text>
      </svg>
    </div>
  );
}

function SummaryTable({ m }: { m?: boolean }) {
  return (
    <div className={m ? "sumt sumt-m" : "sumt"}>
      <div className="sumt-row sumt-head">
        <span>Người chơi</span>
        <span>Được cấp</span>
        <span>Số ván</span>
        <span>7-2</span>
        <span>Còn</span>
        <span>Lời / lỗ</span>
      </div>
      {SUMMARY.map((s) => (
        <div key={s.name} className={`sumt-row ${s.name === "Lym" ? "sumt-me" : ""}`}>
          <span className="sumt-who">
            <Avatar name={s.name} size={m ? 24 : 34} me={s.name === "Lym"} />
            <b>{s.name}</b>
            {s.name === "Lym" && !m && <Tag tone="pearl">bạn</Tag>}
          </span>
          <span className="num">{fmt(s.granted)}</span>
          <span className="num">{s.hands}</span>
          <span className="num">{s.sevenDeuce === 0 ? <i className="dash">—</i> : s.sevenDeuce > 0 ? <Tag tone="gold">+{s.sevenDeuce}</Tag> : <em className="neg">{signed(s.sevenDeuce)}</em>}</span>
          <span className="num strong">{fmt(s.balance)}</span>
          <span className="sumt-net">
            {!m && <NetBar n={s.net} />}
            <Money n={s.net} />
          </span>
        </div>
      ))}
      <div className="sumt-foot">
        <Check size={15} strokeWidth={2.6} /> Cộng lời/lỗ cả phòng = <b className="num">0</b>
        {!m && <span>· lời/lỗ = còn − được cấp</span>}
      </div>
    </div>
  );
}

function HandRow({ h, m }: { h: (typeof HANDS)[number]; m?: boolean }) {
  return (
    <div className={`hand ${h.voided ? "hand-void" : ""}`}>
      <span className="hand-no">
        <b className="num">#{h.no}</b>
        <small className="num">{h.at}</small>
      </span>
      {h.voided ? (
        <span className="hand-body">
          <Tag tone="mute" icon={<Ban size={11} strokeWidth={2.4} />}>
            Đã huỷ
          </Tag>
          <small>{m ? "chip trả lại như trước ván" : "Ván bị huỷ giữa chừng · chip trả lại như trước ván"}</small>
        </span>
      ) : (
        <span className="hand-body">
          {h.players.map((p) => (
            <span key={p.name} className={`hand-p ${p.net > 0 ? "up" : "down"}`}>
              {p.name} <b className="num">{signed(p.net)}</b>
            </span>
          ))}
        </span>
      )}
      {!h.voided && (
        <IconBtn size={m ? 44 : 40}>
          <Play size={15} strokeWidth={2.2} />
        </IconBtn>
      )}
    </div>
  );
}

const RoomSeg = () => <Seg items={["Bàn thứ Sáu", "Tập luyện nhẹ"]} active={0} />;

function DeskHistory() {
  return (
    <Root device="desktop" className="bg-hall">
      <TopNav active={1} />
      <main className="page history">
        <div className="page-title page-title-row">
          <div>
            <Eyebrow>Sổ lời/lỗ</Eyebrow>
            <h1 className="h1">Lịch sử & lời/lỗ</h1>
            <p className="lead">Bàn thứ Sáu · chủ phòng Lym · đang chơi</p>
          </div>
          <div className="hist-stats">
            <span>
              <b className="num">38</b>
              <small>ván đã chơi</small>
            </span>
            <span>
              <b className="num">1</b>
              <small>ván huỷ</small>
            </span>
            <span>
              <b className="num">1</b>
              <small>lần thưởng 7-2</small>
            </span>
          </div>
          <RoomSeg />
        </div>
        <div className="hist-cols">
          <Panel className="hist-sum">
            <span className="sec-h">Bảng tổng kết</span>
            <SummaryTable />
            <TrendChart />
          </Panel>
          <Panel className="hist-hands">
            <span className="sec-h">Các ván gần đây</span>
            <div className="hands">
              {HANDS.map((h) => (
                <HandRow key={h.no} h={h} />
              ))}
            </div>
            <span className="more">Xem thêm 34 ván cũ hơn</span>
          </Panel>
        </div>
      </main>
    </Root>
  );
}

function MobHistory() {
  return (
    <Root device="mobile" className="bg-hall">
      <MRail active={1} />
      <div className="mpage mrailpage mhistory">
        <div className="mhist-head">
          <span>
            <h1 className="h3">Lịch sử & lời/lỗ</h1>
            <small>Bàn thứ Sáu · chủ phòng Lym · 38 ván, 1 ván huỷ</small>
          </span>
          <RoomSeg />
        </div>
        <div className="mhist-cols">
          <Panel className="mcard mhist-sum">
            <span className="sec-h">Bảng tổng kết</span>
            <SummaryTable m />
          </Panel>
          <Panel className="mcard mhist-hands">
            <span className="sec-h">Các ván gần đây</span>
            <div className="mscroll">
              {HANDS.map((h) => (
                <HandRow key={h.no} h={h} m />
              ))}
              <span className="more">Xem thêm 34 ván cũ hơn</span>
            </div>
          </Panel>
        </div>
      </div>
      <HomeBar />
    </Root>
  );
}

/* ================================================================= replay */

const R = REPLAY;
const CUR = R.step;

function Transport({ m }: { m?: boolean }) {
  return (
    <div className="transport">
      <IconBtn size={44}>
        <SkipBack size={17} strokeWidth={2} />
      </IconBtn>
      <IconBtn size={m ? 44 : 50}>
        <StepBack size={19} strokeWidth={2} />
      </IconBtn>
      <IconBtn size={m ? 52 : 62} tone="gold">
        <Play size={m ? 22 : 26} strokeWidth={2.2} />
      </IconBtn>
      <IconBtn size={m ? 44 : 50}>
        <StepForward size={19} strokeWidth={2} />
      </IconBtn>
      <IconBtn size={44}>
        <SkipForward size={17} strokeWidth={2} />
      </IconBtn>
    </div>
  );
}

function StepSlider({ m }: { m?: boolean }) {
  const pct = (CUR / (R.steps - 1)) * 100;
  return (
    <div className={m ? "steps steps-m" : "steps"}>
      <span className="steps-track">
        <i style={{ width: `${pct}%` }} />
        {Array.from({ length: R.steps }, (_, i) => (
          <span key={i} className={`steps-tick ${i < CUR ? "done" : i === CUR ? "cur" : ""}`} style={{ left: `${(i / (R.steps - 1)) * 100}%` }} />
        ))}
      </span>
      <span className="steps-lbl">
        <span>Chia bài</span>
        <span>Flop</span>
        <span>Kết quả</span>
      </span>
    </div>
  );
}

function Timeline({ m }: { m?: boolean }) {
  return (
    <ol className={m ? "tl tl-m" : "tl"}>
      {R.timeline.map((t, i) => (
        <li key={t} className={i < CUR ? "done" : i === CUR ? "cur" : "next"}>
          <span className="tl-n num">{i < CUR ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
          <span className="tl-t">{t}</span>
          {i === CUR && <Tag tone="gold">đang xem</Tag>}
        </li>
      ))}
    </ol>
  );
}

function ReplayPlayer({ p, cls, m }: { p: (typeof R.players)[number]; cls: string; m?: boolean }) {
  const folded = p.cards.length === 0;
  const me = p.name === "Lym";
  return (
    <div className={`rp ${cls} ${folded ? "rp-fold" : ""}`}>
      <span className="rp-cards">
        {folded ? <Tag tone="mute">Đã bỏ</Tag> : p.cards.map((c, i) => <PCard key={i} c={c} size={m ? (me ? "md" : "sm") : me ? "lg" : "md"} tilt={i ? 6 : -5} />)}
      </span>
      <span className="rp-plate">
        <Avatar name={p.name} size={m ? 30 : 42} dim={folded} me={me} />
        <span className="rp-t">
          <b>
            {p.name}
            {me && <em> · bạn</em>}
          </b>
          <Amount n={p.stack} size={m ? 10 : 12} />
        </span>
      </span>
    </div>
  );
}

function ReplayTable({ m }: { m?: boolean }) {
  const [lym, binh, chi] = R.players;
  return (
    <div className={m ? "rtable rtable-m" : "rtable"}>
      <Felt w={m ? 404 : 720} h={m ? 168 : 330} x={m ? 28 : 50} y={m ? 22 : 80} rail={m ? 12 : 22}>
        <span className="felt-center">
          <Pot n={R.pot} big={!m} />
          <Board cards={R.board} size={m ? "sm" : "md"} />
        </span>
      </Felt>
      <ReplayPlayer p={binh} cls="rp-binh" m={m} />
      <ReplayPlayer p={chi} cls="rp-chi" m={m} />
      <ReplayPlayer p={lym} cls="rp-lym" m={m} />
      <Bet n={binh.bet} tones={["son", "son", "egg"]} size={m ? 16 : 22} label="Tố" className="rbet" />
    </div>
  );
}

function Caption({ m }: { m?: boolean }) {
  return (
    <div className={m ? "caption caption-m" : "caption"}>
      <span className="caption-step">
        Bước <b className="num">{CUR + 1}</b>/{R.steps}
      </span>
      <b className="caption-t">{R.action}</b>
    </div>
  );
}

const Result = ({ m }: { m?: boolean }) => (
  <div className={m ? "result result-m" : "result"}>
    <Eyebrow>Kết quả</Eyebrow>
    <b>{R.timeline[R.timeline.length - 1]}</b>
    <small>{m ? "Bình thắng vì mọi người bỏ bài, bài vẫn úp." : "Bài của Bình vẫn úp: Bình thắng vì mọi người bỏ bài, không cần lật."}</small>
    <span className="result-me">
      Bạn <Money n={-60} />
    </span>
  </div>
);

function DeskReplay() {
  return (
    <Root device="desktop" className="bg-room">
      <header className="dtop">
        <span className="dtop-back">
          <ChevronLeft size={18} strokeWidth={2.2} /> Lịch sử
        </span>
        <Logo size={34} mark />
        <span className="dtop-title">
          <b>Xem lại ván #{R.handNo}</b>
          <span className="dtop-meta">
            <span>Bàn thứ Sáu · 21:03</span>
            <i />
            <span>Góc nhìn của Lym</span>
            <i />
            <span>Bài người khác úp tới cuối</span>
          </span>
        </span>
        <span className="dtop-r">
          <Seg items={["1×", "2×"]} active={0} />
        </span>
      </header>
      <main className="replay">
        <section className="replay-main">
          <Caption />
          <ReplayTable />
          <div className="replay-ctl">
            <Transport />
            <StepSlider />
          </div>
        </section>
        <aside className="replay-side">
          <span className="sec-h">Diễn biến ván</span>
          <Timeline />
          <Result />
        </aside>
      </main>
    </Root>
  );
}

function MobReplay() {
  return (
    <Root device="mobile" className="bg-room">
      <div className="mpage mreplay">
        <section className="mreplay-main">
          <div className="mreplay-head">
            <span className="ibtn" style={{ width: 44, height: 44 }}>
              <ChevronLeft size={22} strokeWidth={2.2} />
            </span>
            <span className="mhead-t">
              <b>Xem lại ván #{R.handNo}</b>
              <small>Bàn thứ Sáu · 21:03 · góc nhìn của Lym</small>
            </span>
            <Caption m />
          </div>
          <ReplayTable m />
          <div className="mreplay-ctl">
            <Transport m />
            <StepSlider m />
          </div>
        </section>
        <Panel className="mcard mreplay-side">
          <span className="sec-h">Diễn biến ván</span>
          <Timeline m />
          <Result m />
        </Panel>
      </div>
      <HomeBar />
    </Root>
  );
}

/* ================================================================= states */

function Skeleton({ m }: { m?: boolean }) {
  return (
    <div className={m ? "skel skel-m" : "skel"}>
      <i className="sk sk-search" />
      {(m ? [0, 1] : [0, 1, 2, 3]).map((k) => (
        <div key={k} className="sk-room">
          <i className="sk sk-table" />
          <span className="sk-lines">
            <i className="sk sk-l1" />
            <i className="sk sk-l2" />
            <i className="sk sk-l3" />
          </span>
        </div>
      ))}
      <span className="skel-note">
        <i className="spin" /> Đang tải danh sách phòng…
      </span>
    </div>
  );
}

function NetError({ m }: { m?: boolean }) {
  return (
    <div className="empty">
      <Medallion size={m ? 64 : 104} tone="warn">
        <CloudOff size={m ? 24 : 38} strokeWidth={1.6} />
      </Medallion>
      <b className="empty-t">Mất kết nối tới sảnh</b>
      <span className="empty-s">Không tải được danh sách phòng. Kiểm tra wifi hoặc 4G rồi thử lại nhé.</span>
      <Btn tone="gold" size={m ? "md" : "lg"} icon={<RefreshCw size={17} strokeWidth={2} />}>
        Thử lại
      </Btn>
    </div>
  );
}

function EmptyLobby({ m }: { m?: boolean }) {
  return (
    <div className="empty">
      <EmptyArt scale={m ? 0.62 : 1} />
      <b className="empty-t">Sảnh đang vắng</b>
      <span className="empty-s">Chưa có phòng nào mở. Tạo một bàn rồi gửi link cho cả hội!</span>
      <span className="empty-btns">
        <Btn tone="gold" size={m ? "md" : "lg"} icon={<Plus size={17} strokeWidth={2.4} />}>
          Tạo phòng
        </Btn>
        {!m && (
          <Btn tone="then" size="lg" icon={<Link2 size={17} strokeWidth={2} />}>
            Dán link mời
          </Btn>
        )}
      </span>
    </div>
  );
}

function KickedToast({ m }: { m?: boolean }) {
  return (
    <div className={m ? "toast toast-m" : "toast"}>
      <span className="toast-ic">
        <UserX size={m ? 18 : 20} strokeWidth={2} />
      </span>
      <span className="toast-t">
        <b>Bạn đã bị mời ra khỏi phòng</b>
        <small>Chủ phòng Bàn thứ Sáu vừa mời bạn ra. Lời/lỗ vẫn lưu trong Lịch sử.</small>
      </span>
      <span className="toast-x">
        <X size={17} strokeWidth={2} />
      </span>
    </div>
  );
}

function StateCard({ label, tone, children, m }: { label: string; tone?: "jade" | "son" | "mute"; children: ReactNode; m?: boolean }) {
  return (
    <Panel className={m ? "mcard state" : "state"}>
      <Eyebrow tone={tone}>{label}</Eyebrow>
      {children}
    </Panel>
  );
}

function DeskStates() {
  return (
    <Root device="desktop" className="bg-hall">
      <TopNav active={0} />
      <KickedToast />
      <main className="page states">
        <div className="page-title">
          <Eyebrow tone="mute">Trạng thái của sảnh</Eyebrow>
          <h1 className="h2">Đang tải · lỗi mạng · trống</h1>
        </div>
        <div className="states-row">
          <StateCard label="Đang tải">
            <Skeleton />
          </StateCard>
          <StateCard label="Lỗi mạng ở sảnh" tone="son">
            <NetError />
          </StateCard>
          <StateCard label="Sảnh trống" tone="jade">
            <EmptyLobby />
          </StateCard>
        </div>
      </main>
    </Root>
  );
}

function MobStates() {
  return (
    <Root device="mobile" className="bg-hall">
      <MRail active={0} />
      <div className="mpage mrailpage mstates">
        <KickedToast m />
        <div className="mstates-row">
          <StateCard label="Đang tải" m>
            <Skeleton m />
          </StateCard>
          <StateCard label="Lỗi mạng" tone="son" m>
            <NetError m />
          </StateCard>
          <StateCard label="Sảnh trống" tone="jade" m>
            <EmptyLobby m />
          </StateCard>
        </div>
      </div>
      <HomeBar />
    </Root>
  );
}

export function renderSocial(screen: string, device: Device): ReactNode | null {
  const d = device === "desktop";
  switch (screen) {
    case "history":
      return d ? <DeskHistory /> : <MobHistory />;
    case "replay":
      return d ? <DeskReplay /> : <MobReplay />;
    case "states":
      return d ? <DeskStates /> : <MobStates />;
    default:
      return null;
  }
}
