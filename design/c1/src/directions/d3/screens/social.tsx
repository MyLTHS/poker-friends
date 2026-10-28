// Kẹo Đêm (d3) — history + profit/loss, hand replay, loading / error / empty / kicked states.
import type { ReactNode } from "react";
import { Ban, Check, ChevronLeft, CloudOff, Link2, Play, Plus, RefreshCw, SkipBack, SkipForward, StepBack, StepForward, UserX, X } from "lucide-react";

import { HANDS, REPLAY, SUMMARY } from "../../../shared/data";
import type { Device } from "../../../shared/screens";
import { fmt, signed } from "../lib";
import { Board, Pot } from "../table";
import { AppNav } from "../shell";
import {
  Avatar,
  Btn,
  ChipPill,
  Eyebrow,
  HomeBar,
  IconBtn,
  Logo,
  MHead,
  MRail,
  Money,
  PCard,
  Pill,
  Root,
  Seg,
  Sticker,
  Token,
} from "../ui";

/* ================================================================ history */

const MAXNET = Math.max(...SUMMARY.map((s) => Math.abs(s.net)));

function NetBar({ n }: { n: number }) {
  const w = (Math.abs(n) / MAXNET) * 50;
  return (
    <span className="netbar">
      <i className="netbar-mid" />
      {n !== 0 && <u className={n > 0 ? "up" : "down"} style={n > 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />}
    </span>
  );
}

function SevenCell({ n }: { n: number }) {
  if (n === 0) return <span className="dash">—</span>;
  return <b className={`seven-cell ${n > 0 ? "up" : "down"} num`}>{signed(n)}</b>;
}

function SummaryTable({ mobile }: { mobile?: boolean }) {
  return (
    <div className={mobile ? "sumtable sumtable-m" : "sumtable"}>
      <div className="sum-row sum-headrow">
        <span>Người chơi</span>
        <span>Được cấp</span>
        <span>Số ván</span>
        <span>7-2</span>
        <span>Còn</span>
        <span>Lời / lỗ</span>
      </div>
      {SUMMARY.map((s) => (
        <div key={s.name} className={`sum-row ${s.name === "Lym" ? "sum-me" : ""}`}>
          <span className="sum-who">
            <Avatar name={s.name} size={mobile ? 28 : 36} />
            <b>{s.name}</b>
            {s.name === "Lym" && <em>bạn</em>}
            {s.sevenDeuce > 0 && !mobile && (
              <Sticker tone="sun" tilt={-5}>
                7-2 😎
              </Sticker>
            )}
          </span>
          <span className="num">{fmt(s.granted)}</span>
          <span className="num">{s.hands}</span>
          <SevenCell n={s.sevenDeuce} />
          <span className="num strong">{fmt(s.balance)}</span>
          <span className="sum-net">
            <Money n={s.net} className="money-pill" />
            {!mobile && <NetBar n={s.net} />}
          </span>
        </div>
      ))}
      <div className="sum-foot">
        <Check size={16} strokeWidth={3.4} /> Cộng lời/lỗ cả phòng = <b className="num">0</b>
        {mobile ? " · sổ cân" : " · sổ cân, không ai “in” thêm chip"}
      </div>
    </div>
  );
}

function HandRow({ h, mobile }: { h: (typeof HANDS)[number]; mobile?: boolean }) {
  if (h.voided)
    return (
      <div className="hand hand-void">
        <span className="hand-no">
          <b className="num">#{h.no}</b>
          <small>{h.at}</small>
        </span>
        <span className="hand-body">
          <Sticker tone="mute" tilt={-3}>
            <Ban size={13} strokeWidth={3} /> Đã huỷ
          </Sticker>
          <small>Ván bị huỷ giữa chừng · chip trả lại như trước ván</small>
        </span>
      </div>
    );
  return (
    <div className="hand">
      <span className="hand-no">
        <b className="num">#{h.no}</b>
        <small>{h.at}</small>
      </span>
      <span className="hand-body">
        {h.players.map((p) => (
          <span key={p.name} className={`hand-p ${p.net > 0 ? "up" : "down"}`}>
            {!mobile && <Avatar name={p.name} size={22} />}
            {p.name}
            <b className="num">{signed(p.net)}</b>
          </span>
        ))}
      </span>
      <span className="hand-play">
        <Play size={16} strokeWidth={3} />
        {!mobile && "Xem lại"}
      </span>
    </div>
  );
}

const RoomSeg = () => <Seg items={["Bàn thứ Sáu", "Tập luyện nhẹ"]} active={0} tone="pink" />;

function DeskHistory() {
  return (
    <Root device="desktop" className="bg-party">
      <AppNav active={1} />
      <main className="page history">
        <div className="page-title page-title-row">
          <div>
            <h1 className="h1">Lịch sử & lời/lỗ</h1>
            <p className="lead">Bàn thứ Sáu · chủ phòng Lym · đang chơi</p>
          </div>
          <div className="hist-stats">
            <Sticker tone="white" tilt={-3}>
              🃏 38 ván
            </Sticker>
            <Sticker tone="mute" tilt={2}>
              1 ván huỷ
            </Sticker>
            <Sticker tone="sun" tilt={-2}>
              😎 1 lần 7-2
            </Sticker>
          </div>
          <RoomSeg />
        </div>
        <div className="hist-cols">
          <section className="card hist-sum">
            <span className="sec-h">Bảng tổng kết</span>
            <SummaryTable />
          </section>
          <section className="card hist-hands">
            <span className="sec-h">Các ván gần đây</span>
            {HANDS.map((h) => (
              <HandRow key={h.no} h={h} />
            ))}
            <span className="more">Xem thêm 34 ván cũ hơn</span>
          </section>
        </div>
      </main>
    </Root>
  );
}

function MobHistory() {
  return (
    <Root device="mobile" className="bg-party">
      <MRail active={1} />
      <div className="mpage mpage-rail mhistory">
        <div className="mhist-head">
          <span>
            <h1 className="h-m">Lịch sử & lời/lỗ</h1>
            <small>Bàn thứ Sáu · chủ phòng Lym · 38 ván, 1 ván huỷ</small>
          </span>
          <RoomSeg />
        </div>
        <section className="card mcard mhist-sum">
          <span className="sec-h">Bảng tổng kết</span>
          <SummaryTable mobile />
        </section>
        <section className="mhist-hands">
          <span className="sec-h">Các ván gần đây</span>
          <div className="mscroll">
            {HANDS.map((h) => (
              <HandRow key={h.no} h={h} mobile />
            ))}
            <span className="more">Xem thêm 34 ván cũ hơn</span>
          </div>
        </section>
      </div>
      <HomeBar />
    </Root>
  );
}

/* ================================================================= replay */

const R = REPLAY;
const CUR = R.step; // index into the timeline (0-based): "Bình tố lên 120"

function Transport({ mobile }: { mobile?: boolean }) {
  const s = mobile ? 20 : 22;
  return (
    <div className={`transport ${mobile ? "transport-m" : ""}`}>
      <IconBtn size={mobile ? 48 : 48}>
        <SkipBack size={s} strokeWidth={2.8} />
      </IconBtn>
      <IconBtn size={mobile ? 52 : 52}>
        <StepBack size={s} strokeWidth={2.8} />
      </IconBtn>
      <IconBtn size={mobile ? 64 : 64} tone="lime">
        <Play size={mobile ? 26 : 28} strokeWidth={3} />
      </IconBtn>
      <IconBtn size={mobile ? 52 : 52}>
        <StepForward size={s} strokeWidth={2.8} />
      </IconBtn>
      <IconBtn size={mobile ? 48 : 48}>
        <SkipForward size={s} strokeWidth={2.8} />
      </IconBtn>
    </div>
  );
}

function StepSlider({ mobile }: { mobile?: boolean }) {
  const pct = (CUR / (R.steps - 1)) * 100;
  return (
    <div className={`stepslider ${mobile ? "stepslider-m" : ""}`}>
      <span className="ss-track">
        <i style={{ width: `${pct}%` }} />
        {Array.from({ length: R.steps }, (_, i) => (
          <span key={i} className={`ss-tick ${i < CUR ? "done" : i === CUR ? "cur" : ""}`} style={{ left: `${(i / (R.steps - 1)) * 100}%` }}>
            {i === CUR ? <b className="num">{i + 1}</b> : null}
          </span>
        ))}
      </span>
      <span className="ss-labels">
        <span>Chia bài</span>
        <span>Flop</span>
        <span>Kết quả</span>
      </span>
    </div>
  );
}

function Timeline({ mobile }: { mobile?: boolean }) {
  return (
    <ol className={`timeline ${mobile ? "timeline-m" : ""}`}>
      {R.timeline.map((t, i) => (
        <li key={t} className={i < CUR ? "done" : i === CUR ? "cur" : "next"}>
          <span className="tl-n num">{i < CUR ? <Check size={14} strokeWidth={3.6} /> : i + 1}</span>
          <span className="tl-t">{t}</span>
          {i === CUR && (
            <Sticker tone="lime" tilt={-3}>
              đang xem
            </Sticker>
          )}
        </li>
      ))}
    </ol>
  );
}

function ReplayPlayer({ p, me, mobile }: { p: (typeof R.players)[number]; me?: boolean; mobile?: boolean }) {
  const folded = p.cards.length === 0;
  const av = mobile ? (me ? 40 : 34) : me ? 52 : 46;
  const cs = mobile ? (me ? "sm" : "xs") : me ? "md" : "sm";
  return (
    <div className={`rp ${folded ? "rp-fold" : ""} ${me ? "rp-me" : ""}`}>
      <Avatar name={p.name} size={av} dim={folded} />
      <span className="rp-t">
        <b>
          {p.name}
          {me && <em>bạn</em>}
        </b>
        <span className="rp-stack">
          <Token size={12} /> <b className="num">{fmt(p.stack)}</b>
        </span>
      </span>
      <span className="rp-cards">
        {folded ? (
          <Sticker tone="mute" tilt={-3}>
            Đã bỏ
          </Sticker>
        ) : (
          p.cards.map((c, i) => <PCard key={i} c={c} size={cs} tilt={i ? 6 : -5} />)
        )}
      </span>
    </div>
  );
}

function ReplayTable({ mobile }: { mobile?: boolean }) {
  const [lym, binh, chi] = R.players;
  return (
    <div className={`rtable ${mobile ? "rtable-m" : ""}`}>
      <div className="rtable-felt">
        <Pot n={R.pot} />
        <Board cards={R.board} size={mobile ? "sm" : "lg"} />
      </div>
      <div className="rseat rseat-binh">
        <ReplayPlayer p={binh} mobile={mobile} />
      </div>
      <div className="rseat rseat-chi">
        <ReplayPlayer p={chi} mobile={mobile} />
      </div>
      <div className="rseat rseat-me">
        <ReplayPlayer p={lym} me mobile={mobile} />
      </div>
      <span className="rbet">
        <ChipPill n={binh.bet} label="Tố" />
      </span>
    </div>
  );
}

function Caption({ mobile }: { mobile?: boolean }) {
  return (
    <div className={`caption ${mobile ? "caption-m" : ""}`}>
      <span className="caption-step">
        Bước <b className="num">{CUR + 1}</b>/{R.steps}
      </span>
      <b className="caption-t">{R.action}</b>
      {!mobile && <Pill tone="sky">Flop · pot {fmt(R.pot)}</Pill>}
    </div>
  );
}

const Result = () => (
  <div className="result">
    <Eyebrow tone="sun">Kết quả</Eyebrow>
    <b>{R.timeline[R.timeline.length - 1]}</b>
    <small>Bài của Bình vẫn úp: Bình thắng vì mọi người bỏ bài, không cần lật. Bạn: −60.</small>
  </div>
);

function DeskReplay() {
  return (
    <Root device="desktop" className="bg-party">
      <header className="dtop">
        <div className="dtop-l">
          <IconBtn size={44}>
            <ChevronLeft size={22} strokeWidth={3} />
          </IconBtn>
          <Logo size={20} />
        </div>
        <div className="dtop-c">
          <b className="dtop-room">Xem lại ván #{R.handNo}</b>
          <span className="dtop-sub">
            <Pill tone="ghost">Bàn thứ Sáu · 21:03</Pill>
            <Pill tone="ghost">Bạn xem với góc nhìn của Lym</Pill>
          </span>
        </div>
        <div className="dtop-r">
          <Seg items={["1×", "2×"]} active={0} tone="sky" />
        </div>
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
    <Root device="mobile" className="bg-party">
      <div className="mpage mreplay">
        <section className="mreplay-main">
          <MHead title={`Xem lại ván #${R.handNo}`} sub="Bàn thứ Sáu · 21:03" right={<Caption mobile />} />
          <ReplayTable mobile />
          <div className="mreplay-ctl">
            <Transport mobile />
            <StepSlider mobile />
          </div>
        </section>
        <aside className="mreplay-side">
          <span className="sec-h">Diễn biến ván</span>
          <Timeline mobile />
          <Result />
        </aside>
      </div>
      <HomeBar />
    </Root>
  );
}

/* ================================================================= states */

function Skeleton({ mobile }: { mobile?: boolean }) {
  return (
    <div className={`skel ${mobile ? "skel-m" : ""}`}>
      {!mobile && <i className="sk sk-title" />}
      <i className="sk sk-search" />
      {Array.from({ length: mobile ? 2 : 3 }, (_, k) => (
        <div key={k} className="sk-ticket">
          <i className="sk sk-stub" />
          <span className="sk-lines">
            <i className="sk sk-l1" />
            <i className="sk sk-l2" />
            <span className="sk-dots">
              {Array.from({ length: 6 }, (_, j) => (
                <i key={j} className="sk" />
              ))}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function NetError({ mobile }: { mobile?: boolean }) {
  return (
    <div className={`empty empty-err ${mobile ? "empty-m" : ""}`}>
      <span className="empty-ic empty-ic-orange">
        <CloudOff size={mobile ? 30 : 44} strokeWidth={2.6} />
      </span>
      <span className="empty-col">
        <b className="empty-t">Mất kết nối tới sảnh</b>
        <span className="empty-s">Không tải được danh sách phòng. Kiểm tra wifi hoặc 4G rồi thử lại nhé.</span>
      </span>
      <Btn tone="sun" size={mobile ? "md" : "lg"} icon={<RefreshCw size={18} strokeWidth={3} />}>
        Thử lại
      </Btn>
      {!mobile && <small className="empty-auto">Tự thử lại sau 10 giây</small>}
    </div>
  );
}

function EmptyLobby({ mobile }: { mobile?: boolean }) {
  return (
    <div className={`empty ${mobile ? "empty-m" : ""}`}>
      <span className="empty-table">
        <i className="et-felt" />
        <i className="et-s et-1" />
        <i className="et-s et-2" />
        <i className="et-s et-3" />
        <i className="et-s et-4" />
        <span className="et-emo">🦗</span>
      </span>
      <span className="empty-col">
        <b className="empty-t">Sảnh đang vắng tanh</b>
        <span className="empty-s">Chưa có phòng nào mở. Tạo một bàn rồi gửi link cho cả hội!</span>
        <span className="empty-btns">
          <Btn tone="pink" size={mobile ? "md" : "lg"} icon={<Plus size={18} strokeWidth={3.4} />}>
            Tạo phòng
          </Btn>
          {!mobile && (
            <Btn tone="ghost" size="lg" icon={<Link2 size={18} strokeWidth={3} />}>
              Dán link mời
            </Btn>
          )}
        </span>
      </span>
    </div>
  );
}

function KickedToast({ mobile }: { mobile?: boolean }) {
  return (
    <div className={`toast ${mobile ? "toast-m" : ""}`}>
      <span className="toast-ic">
        <UserX size={mobile ? 20 : 22} strokeWidth={3} />
      </span>
      <span className="toast-t">
        <b>Bạn đã bị mời ra khỏi phòng</b>
        <small>Chủ phòng Bàn thứ Sáu vừa mời bạn ra. Lời/lỗ vẫn lưu trong Lịch sử.</small>
      </span>
      <span className="toast-x">
        <X size={18} strokeWidth={3} />
      </span>
    </div>
  );
}

function DeskStates() {
  return (
    <Root device="desktop" className="bg-party">
      <AppNav active={0} />
      <KickedToast />
      <main className="page states">
        <section className="card state-card">
          <Eyebrow tone="sky">Đang tải</Eyebrow>
          <Skeleton />
        </section>
        <section className="card state-card">
          <Eyebrow tone="orange">Lỗi mạng ở sảnh</Eyebrow>
          <NetError />
        </section>
        <section className="card state-card">
          <Eyebrow tone="lime">Sảnh trống</Eyebrow>
          <EmptyLobby />
        </section>
      </main>
    </Root>
  );
}

function MobStates() {
  return (
    <Root device="mobile" className="bg-party">
      <MRail active={0} />
      <div className="mpage mpage-rail mstates">
        <KickedToast mobile />
        <section className="card mcard state-card">
          <Eyebrow tone="sky">Đang tải</Eyebrow>
          <Skeleton mobile />
        </section>
        <section className="card mcard state-card">
          <Eyebrow tone="orange">Lỗi mạng ở sảnh</Eyebrow>
          <NetError mobile />
        </section>
        <section className="card mcard state-card">
          <Eyebrow tone="lime">Sảnh trống</Eyebrow>
          <EmptyLobby mobile />
        </section>
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
