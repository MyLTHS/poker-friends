// Kính & Ánh Kim (d2) — records: history + lời/lỗ, hand replay, loading / error / empty states.
import type { ReactNode } from "react";
import {
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  History as HistoryIc,
  Link2,
  Play,
  Plus,
  RefreshCw,
  SkipBack,
  SkipForward,
  UserX,
  WifiOff,
  X,
} from "lucide-react";

import { HANDS, REPLAY, SUMMARY, type Seat } from "../../../shared/data";
import type { Device } from "../../../shared/screens";
import { fmt, signed, tone } from "../lib";
import { MBar, Shell } from "../shell";
import { Board, HeroCards, MiniCards, Pot, STAGE, Table } from "../table";
import { Avatar, Btn, Dealer, Eyebrow, Glass, IconBtn, Pill, Root, Seg } from "../ui";

/* ================================================================ history */

const MAXNET = Math.max(...SUMMARY.map((s) => Math.abs(s.net)));

function NetBar({ n }: { n: number }) {
  const w = (Math.abs(n) / MAXNET) * 50;
  return (
    <span className="k-netbar">
      <i className="k-netbar-mid" />
      {n !== 0 && <u className={n > 0 ? "up" : "down"} style={n > 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />}
    </span>
  );
}

function SummaryTable({ d }: { d: Device }) {
  const mob = d === "mobile";
  return (
    <div className={`k-sum ${mob ? "k-sum-m" : ""}`}>
      <div className="k-sum-row k-sum-head">
        <span>Người chơi</span>
        <span>{mob ? "Cấp" : "Được cấp"}</span>
        <span>{mob ? "Ván" : "Số ván"}</span>
        <span>7-2</span>
        <span>Còn</span>
        <span>Lời / lỗ</span>
      </div>
      {SUMMARY.map((s) => (
        <div key={s.name} className={`k-sum-row ${s.name === "Lym" ? "me" : ""}`}>
          <span className="k-sum-n">
            <Avatar name={s.name} size={mob ? 22 : 30} ring="none" />
            <b>{s.name}</b>
            {s.name === "Lym" && !mob && <em>bạn</em>}
          </span>
          <span className="k-num">{fmt(s.granted)}</span>
          <span className="k-num">{s.hands}</span>
          <span className={`k-num k-${tone(s.sevenDeuce)}`}>{s.sevenDeuce === 0 ? "—" : signed(s.sevenDeuce)}</span>
          <span className="k-num">{fmt(s.balance)}</span>
          <span className="k-sum-net">
            {!mob && <NetBar n={s.net} />}
            <b className={`k-num k-${tone(s.net)}`}>{s.net === 0 ? "0" : signed(s.net)}</b>
          </span>
        </div>
      ))}
      <div className="k-sum-foot">
        <Check size={15} strokeWidth={2.8} /> Cộng lời/lỗ cả phòng = <b className="k-num">0</b>
        {mob ? " · sổ cân" : " · sổ cân, không ai “in” thêm chip"}
      </div>
    </div>
  );
}

function HandRow({ h, d }: { h: (typeof HANDS)[number]; d: Device }) {
  const mob = d === "mobile";
  if (h.voided)
    return (
      <div className="k-hand void">
        <span className="k-hand-no">
          <b className="k-num">#{h.no}</b>
          <small className="k-num">{h.at}</small>
        </span>
        <span className="k-hand-body">
          <Pill tone="mute" icon={<Ban size={12} strokeWidth={2.4} />}>
            Đã huỷ
          </Pill>
          <small>{mob ? "Chip trả lại như cũ" : "Ván bị huỷ giữa chừng · chip trả lại như trước ván"}</small>
        </span>
      </div>
    );
  return (
    <div className="k-hand">
      <span className="k-hand-no">
        <b className="k-num">#{h.no}</b>
        <small className="k-num">{h.at}</small>
      </span>
      <span className="k-hand-body">
        {h.players.map((p) => (
          <span key={p.name} className={`k-hand-p ${p.net > 0 ? "up" : "down"}`}>
            {!mob && <Avatar name={p.name} size={22} ring="none" />}
            {p.name}
            <b className="k-num">{signed(p.net)}</b>
          </span>
        ))}
      </span>
      <span className="k-hand-play">
        <Play size={14} strokeWidth={2.4} />
        {!mob && "Xem lại"}
      </span>
    </div>
  );
}

function HistoryScreen({ device: d }: { device: Device }) {
  const me = SUMMARY.find((s) => s.name === "Lym")!;
  if (d === "desktop")
    return (
      <Shell active={1}>
        <header className="k-pagehead">
          <span>
            <Eyebrow>Lịch sử</Eyebrow>
            <h1 className="k-h1">Lịch sử & lời/lỗ</h1>
            <p className="k-lead">Bàn thứ Sáu · chủ phòng Lym · đang chơi</p>
          </span>
          <Seg items={["Bàn thứ Sáu", "Tập luyện nhẹ"]} active={0} />
        </header>
        <div className="k-tiles">
          <Glass className="k-tile">
            <small>Số ván</small>
            <b className="k-num">38</b>
            <span>1 ván bị huỷ</span>
          </Glass>
          <Glass className="k-tile">
            <small>Chip đã cấp</small>
            <b className="k-num">{fmt(SUMMARY.reduce((a, s) => a + s.granted, 0))}</b>
            <span>5 người có chip</span>
          </Glass>
          <Glass className="k-tile">
            <small>Thưởng 7-2</small>
            <b className="k-num">1 lần</b>
            <span>Bình nhận +250</span>
          </Glass>
          <Glass className="k-tile k-tile-me">
            <small>Lời / lỗ của bạn</small>
            <b className={`k-num k-${tone(me.net)}`}>{signed(me.net)}</b>
            <span>
              còn <b className="k-num">{fmt(me.balance)}</b> / cấp {fmt(me.granted)}
            </span>
          </Glass>
        </div>
        <div className="k-hgrid">
          <Glass className="k-card-p">
            <span className="k-sec-h">
              <b className="k-h3">Bảng tổng kết</b>
              <small className="k-col-note">Lời/lỗ = còn − được cấp</small>
            </span>
            <SummaryTable d={d} />
          </Glass>
          <Glass className="k-card-p">
            <span className="k-sec-h">
              <b className="k-h3">Các ván gần đây</b>
            </span>
            <div className="k-hands">
              {HANDS.map((h) => (
                <HandRow key={h.no} h={h} d={d} />
              ))}
            </div>
            <span className="k-link k-more">
              Xem thêm 34 ván cũ hơn <ChevronRight size={14} strokeWidth={2.4} />
            </span>
          </Glass>
        </div>
      </Shell>
    );
  return (
    <Root device={d}>
      <MBar title="Lịch sử & lời/lỗ" sub="Bàn thứ Sáu · 38 ván, 1 ván huỷ" active={1} />
      <div className="k-mpage k-mhistory">
        <Glass className="k-mcard">
          <span className="k-sec-h">
            <b className="k-h3">Bảng tổng kết</b>
            <Seg items={["Bàn thứ Sáu", "Tập luyện"]} active={0} small />
          </span>
          <SummaryTable d={d} />
        </Glass>
        <Glass className="k-mcard">
          <span className="k-sec-h">
            <b className="k-h3">Các ván gần đây</b>
          </span>
          <div className="k-scroll k-hands">
            {HANDS.map((h) => (
              <HandRow key={h.no} h={h} d={d} />
            ))}
            <span className="k-link k-more">Xem thêm 34 ván cũ hơn</span>
          </div>
        </Glass>
      </div>
    </Root>
  );
}

/* ================================================================= replay */

const R = REPLAY;
const CUR = R.step;
const [RL, RB, RC] = R.players;
const R_SEATS: Seat[] = [
  { seat: 1, name: RL.name, stack: RL.stack, state: "waiting", isMe: true },
  { seat: 4, name: RB.name, stack: RB.stack, bet: RB.bet, cards: RB.cards, state: "waiting", lastAction: RB.note },
  { seat: 7, name: RC.name, stack: RC.stack, state: "folded" },
];

function Transport({ d }: { d: Device }) {
  const mob = d === "mobile";
  const s = mob ? 18 : 20;
  return (
    <div className={`k-transport ${mob ? "k-transport-m" : ""}`}>
      <IconBtn icon={<SkipBack size={s} strokeWidth={2.2} />} />
      <IconBtn icon={<ChevronLeft size={s + 2} strokeWidth={2.2} />} />
      <span className="k-play">
        <Play size={mob ? 20 : 24} strokeWidth={2.4} />
      </span>
      <IconBtn icon={<ChevronRight size={s + 2} strokeWidth={2.2} />} />
      <IconBtn icon={<SkipForward size={s} strokeWidth={2.2} />} />
    </div>
  );
}

function Steps({ d }: { d: Device }) {
  const pct = (CUR / (R.steps - 1)) * 100;
  return (
    <div className={`k-steps ${d === "mobile" ? "k-steps-m" : ""}`}>
      <span className="k-steps-track">
        <i style={{ width: `${pct}%` }} />
        {Array.from({ length: R.steps }, (_, i) => (
          <span key={i} className={`k-steps-tick ${i < CUR ? "done" : i === CUR ? "cur" : ""}`} style={{ left: `${(i / (R.steps - 1)) * 100}%` }} />
        ))}
      </span>
      {d === "desktop" && (
        <span className="k-steps-lbl">
          <span>Chia bài</span>
          <span>Flop</span>
          <span>Kết quả</span>
        </span>
      )}
    </div>
  );
}

function Timeline({ d }: { d: Device }) {
  return (
    <ol className={`k-tl ${d === "mobile" ? "k-tl-m" : ""}`}>
      {R.timeline.map((t, i) => (
        <li key={t} className={i < CUR ? "done" : i === CUR ? "cur" : "next"}>
          <span className="k-tl-n k-num">{i < CUR ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
          <span className="k-tl-t">{t}</span>
          {i === CUR && <Pill tone="cyan">đang xem</Pill>}
        </li>
      ))}
    </ol>
  );
}

function Result({ d }: { d: Device }) {
  return (
    <div className={`k-result ${d === "mobile" ? "k-result-m" : ""}`}>
      <Eyebrow>Kết quả</Eyebrow>
      <b>
        Bình ăn <span className="k-num">{fmt(R.pot)}</span>
      </b>
      <small>
        Bài của Bình vẫn úp: Bình thắng vì mọi người bỏ bài, không cần lật. Bạn: <b className="k-num k-down">−60</b>.
      </small>
    </div>
  );
}

function ReplayTop() {
  return (
    <header className="k-ttop">
      <span className="k-ttop-back">
        <IconBtn icon={<ChevronLeft size={20} strokeWidth={2.2} />} />
        <span>Lịch sử</span>
      </span>
      <span className="k-ttop-room">
        <b>Xem lại ván #{R.handNo}</b>
        <span className="k-meta">
          <span>Bàn thứ Sáu</span>
          <i />
          <span className="k-num">21:03</span>
          <i />
          <span>
            Góc nhìn của <b>Lym</b>
          </span>
        </span>
      </span>
      <span className="k-ttop-r">
        <Seg items={["1×", "2×"]} active={0} small />
      </span>
    </header>
  );
}

function Replay({ device: d }: { device: Device }) {
  const mob = d === "mobile";
  const table = (
    <Table
      d={d}
      seats={R_SEATS}
      board={R.board}
      pot={R.pot}
      hero={<HeroCards cards={RL.cards} d={d} />}
      center={
        <>
          <span className={`k-caption ${mob ? "k-caption-m" : ""}`}>
            <small>
              Bước <b className="k-num">{CUR + 1}</b>/{R.steps}
            </small>
            <b>{R.action}</b>
          </span>
          <Pot n={R.pot} d={d} />
          <Board cards={R.board} w={mob ? 38 : 64} />
        </>
      }
    />
  );
  if (d === "desktop")
    return (
      <Root device={d} bg="table">
        <ReplayTop />
        <div className="k-stagebox k-stagebox-desktop" style={{ width: STAGE.desktop.w, height: STAGE.desktop.h }}>
          {table}
          <Glass strong className="k-player">
            <Transport d={d} />
            <Steps d={d} />
            <span className="k-player-n">
              Bước <b className="k-num">{CUR + 1}</b>/<span className="k-num">{R.steps}</span>
            </span>
          </Glass>
        </div>
        <aside className="k-col k-glass">
          <span className="k-sec-h">
            <Eyebrow>Diễn biến ván</Eyebrow>
            <small className="k-col-note">
              <HistoryIc size={12} strokeWidth={2.2} /> 7 bước
            </small>
          </span>
          <Timeline d={d} />
          <div className="k-hr" />
          <section className="k-sec">
            <Eyebrow tone="mute">Bài từng người ở bước này</Eyebrow>
            <div className="k-rplayers">
              {R.players.map((p, i) => (
                <div key={p.name} className={`k-rplayer ${p.cards.length ? "" : "fold"}`}>
                  <Avatar name={p.name} size={30} ring="none" dim={!p.cards.length} />
                  <span className="k-rplayer-n">
                    <b>
                      {p.name}
                      {i === 0 && <em>bạn</em>}
                    </b>
                    <small className="k-num">{fmt(p.stack)}</small>
                  </span>
                  {p.cards.length ? <MiniCards cards={p.cards} w={28} /> : <Pill tone="mute">Đã bỏ</Pill>}
                  <span className="k-rplayer-note">{i === 0 ? "ngửa · góc của bạn" : p.cards.length ? "úp" : ""}</span>
                </div>
              ))}
            </div>
          </section>
          <div className="k-col-foot">
            <Result d={d} />
          </div>
        </aside>
      </Root>
    );
  return (
    <Root device={d} bg="table">
      <div className="k-stagebox" style={{ width: STAGE.mobile.w, height: STAGE.mobile.h }}>
        {table}
        <span className="k-mtop-l">
          <IconBtn icon={<ChevronLeft size={20} strokeWidth={2.2} />} />
          <span className="k-mtop-room">
            <b>Xem lại ván #{R.handNo}</b>
            <small>Bàn thứ Sáu · 21:03 · góc nhìn của Lym</small>
          </span>
        </span>
      </div>
      <aside className="k-mcol k-glass">
        <Transport d={d} />
        <Steps d={d} />
        <Timeline d={d} />
        <Result d={d} />
      </aside>
    </Root>
  );
}

/* ================================================================= states */

function Skeleton({ d }: { d: Device }) {
  const mob = d === "mobile";
  return (
    <div className="k-skel">
      <i className="k-sk k-sk-h" />
      <i className="k-sk k-sk-s" />
      {Array.from({ length: mob ? 3 : 6 }, (_, i) => (
        <span key={i} className="k-sk-card">
          <i className="k-sk k-sk-table" />
          <span>
            <i className="k-sk k-sk-l1" />
            <i className="k-sk k-sk-l2" />
          </span>
          <i className="k-sk k-sk-pill" />
        </span>
      ))}
    </div>
  );
}

function ErrorArt({ d }: { d: Device }) {
  return (
    <span className={`k-errart ${d === "mobile" ? "k-errart-m" : ""}`}>
      <i className="k-errart-a a1" />
      <i className="k-errart-a a2" />
      <i className="k-errart-a a3" />
      <span className="k-errart-c">
        <WifiOff size={d === "mobile" ? 22 : 30} strokeWidth={2} />
      </span>
    </span>
  );
}

function EmptyArt({ d }: { d: Device }) {
  return (
    <span className={`k-emptyart ${d === "mobile" ? "k-emptyart-m" : ""}`}>
      <span className="k-emptyart-felt">
        <Dealer size={d === "mobile" ? 16 : 22} />
      </span>
      {Array.from({ length: 6 }, (_, i) => (
        <i key={i} className={`s${i}`} />
      ))}
    </span>
  );
}

function StateBlocks({ d }: { d: Device }) {
  const mob = d === "mobile";
  return (
    <>
      <Glass className="k-state">
        <Eyebrow tone="cyan">Đang tải</Eyebrow>
        <Skeleton d={d} />
      </Glass>
      <Glass className="k-state">
        <Eyebrow tone="red">Lỗi mạng ở sảnh</Eyebrow>
        <div className="k-state-c">
          <ErrorArt d={d} />
          <b className="k-state-t">Mất kết nối tới sảnh</b>
          <span className="k-state-s">Không tải được danh sách phòng. Kiểm tra wifi hoặc 4G rồi thử lại nhé.</span>
          <Btn tone="gold" size={mob ? "md" : "lg"} block icon={<RefreshCw size={16} strokeWidth={2.4} />}>
            Thử lại
          </Btn>
          {!mob && <small className="k-state-auto">Tự thử lại sau 10 giây</small>}
        </div>
      </Glass>
      <Glass className="k-state">
        <Eyebrow>Sảnh trống</Eyebrow>
        <div className="k-state-c">
          <EmptyArt d={d} />
          <b className="k-state-t">Sảnh đang vắng tanh</b>
          <span className="k-state-s">Chưa có phòng nào mở. Tạo một bàn rồi gửi link cho cả hội!</span>
          <Btn tone="gold" size={mob ? "md" : "lg"} block icon={<Plus size={17} strokeWidth={2.6} />}>
            Tạo phòng
          </Btn>
          {!mob && (
            <Btn tone="ghost" size="md" block icon={<Link2 size={16} strokeWidth={2.2} />}>
              Dán link mời
            </Btn>
          )}
        </div>
      </Glass>
    </>
  );
}

function Toast({ d }: { d: Device }) {
  return (
    <div className={`k-toast ${d === "mobile" ? "k-toast-m" : ""}`}>
      <span className="k-toast-ic">
        <UserX size={d === "mobile" ? 16 : 20} strokeWidth={2.2} />
      </span>
      <span className="k-toast-t">
        <b>Bạn đã bị mời ra khỏi phòng</b>
        <small>Chủ phòng Bàn thứ Sáu vừa mời bạn ra. Lời/lỗ vẫn lưu trong Lịch sử.</small>
      </span>
      <X size={16} strokeWidth={2.2} className="k-toast-x" />
    </div>
  );
}

function States({ device: d }: { device: Device }) {
  if (d === "desktop")
    return (
      <Shell active={0}>
        <header className="k-pagehead">
          <span>
            <Eyebrow>Trạng thái</Eyebrow>
            <h1 className="k-h1">Đang tải, lỗi và trống</h1>
            <p className="k-lead">Ba khối của sảnh, cùng một thông báo nổi khi bị mời ra khỏi phòng.</p>
          </span>
        </header>
        <Toast d={d} />
        <div className="k-states">
          <StateBlocks d={d} />
        </div>
      </Shell>
    );
  return (
    <Root device={d}>
      <MBar title="Sảnh" sub="Đang tải · lỗi · trống" />
      <div className="k-mpage k-mstates">
        <StateBlocks d={d} />
      </div>
      <Toast d={d} />
    </Root>
  );
}

/* ================================================================ router */

export function renderRecords(screen: string, device: Device): ReactNode {
  switch (screen) {
    case "history":
      return <HistoryScreen device={device} />;
    case "replay":
      return <Replay device={device} />;
    case "states":
      return <States device={device} />;
    default:
      return null;
  }
}
