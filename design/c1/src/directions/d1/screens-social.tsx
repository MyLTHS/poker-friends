import {
  Ban,
  Check,
  ChevronDown,
  ChevronLeft,
  DoorOpen,
  Link2,
  Play,
  Plus,
  RotateCw,
  Scale,
  SkipBack,
  SkipForward,
  WifiOff,
  X,
} from "lucide-react";

import { HANDS, REPLAY, SUMMARY, TABLE_TURN } from "../../shared/data";
import type { Device } from "../../shared/screens";
import {
  Avatar,
  Badge,
  Btn,
  DesktopNav,
  HomeBar,
  MobileRail,
  Root,
  Segmented,
  fmt,
  signed,
  tone,
} from "./kit";
import { MiniTable } from "./screens-rooms";
import { MobileTableBar, PhonePanel, Stage, TableTopBar, type TableModel } from "./table";

/* ================= history ================= */

const maxAbs = Math.max(...SUMMARY.map((r) => Math.abs(r.net)));

function NetBar({ net }: { net: number }) {
  const w = (Math.abs(net) / maxAbs) * 50;
  return (
    <span className="netbar">
      <i className={`netbar-fill is-${tone(net)}`} style={net >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />
      <i className="netbar-axis" />
    </span>
  );
}

function Ledger() {
  const granted = SUMMARY.reduce((a, r) => a + r.granted, 0);
  const balance = SUMMARY.reduce((a, r) => a + r.balance, 0);
  const net = SUMMARY.reduce((a, r) => a + r.net, 0);
  return (
    <div className="ledger">
      <div className="lg-row lg-head">
        <span>Người chơi</span>
        <span>Được cấp</span>
        <span>Số ván</span>
        <span>7-2</span>
        <span>Còn</span>
        <span>Lời / lỗ</span>
      </div>
      {SUMMARY.map((r) => (
        <div key={r.name} className={`lg-row${r.name === "Lym" ? " is-me" : ""}`}>
          <span className="lg-name">
            <Avatar name={r.name} size={30} />
            <b>{r.name}</b>
            {r.name === "Lym" && <em>bạn</em>}
          </span>
          <span>{fmt(r.granted)}</span>
          <span>{r.hands}</span>
          <span className={`lg-seven is-${tone(r.sevenDeuce)}`}>{r.sevenDeuce === 0 ? "—" : signed(r.sevenDeuce)}</span>
          <span>{fmt(r.balance)}</span>
          <span className="lg-net">
            <NetBar net={r.net} />
            <b className={`is-${tone(r.net)}`}>{signed(r.net)}</b>
          </span>
        </div>
      ))}
      <div className="lg-row lg-total">
        <span>Tổng</span>
        <span>{fmt(granted)}</span>
        <span />
        <span />
        <span>{fmt(balance)}</span>
        <span className="lg-net">
          <span className="lg-check">
            <Scale size={14} /> Sổ khớp
          </span>
          <b>{signed(net)}</b>
        </span>
      </div>
    </div>
  );
}

function HandItem({ h, device }: { h: (typeof HANDS)[number]; device: Device }) {
  return (
    <li className={`hand${h.voided ? " is-void" : ""}`}>
      <span className="hand-no">
        <b>#{h.no}</b>
        <time>{h.at}</time>
      </span>
      {h.voided ? (
        <span className="hand-void">
          <Badge kind="claret" icon={<Ban size={11} strokeWidth={2.6} />}>
            Đã huỷ
          </Badge>
          <small>Lỗi máy chủ giữa ván — chip đã hoàn lại cho mọi người</small>
        </span>
      ) : (
        <span className="hand-players">
          {h.players.map((p) => (
            <span key={p.name} className={`hp is-${tone(p.net)}${p.name === "Lym" ? " is-me" : ""}`}>
              {p.name} <b>{signed(p.net)}</b>
            </span>
          ))}
        </span>
      )}
      {!h.voided &&
        (device === "desktop" ? (
          <Btn kind="quiet" size="sm" icon={<Play size={13} strokeWidth={2.4} />}>
            Xem lại
          </Btn>
        ) : (
          <span className="hand-play">
            <Play size={14} strokeWidth={2.4} />
          </span>
        ))}
    </li>
  );
}

export function History({ device }: { device: Device }) {
  if (device === "mobile") {
    return (
      <Root device="mobile" className="bg-app">
        <MobileRail active="history" />
        <main className="m-main m-history">
          <div className="m-head">
            <div className="m-title">
              <h1>Lời / lỗ tối nay</h1>
              <small>Chip ảo · không phải tiền thật</small>
            </div>
            <span className="room-select">
              <MiniTable seats={9} seated={7} w={40} h={26} />
              <span>
                <small>Phòng</small>
                <b>Bàn thứ Sáu</b>
              </span>
              <ChevronDown size={16} />
            </span>
          </div>
          <section className="m-col">
            <div className="m-sec-row">
              <h4 className="m-sec">Tổng kết · 38 ván</h4>
              <span className="lg-check">
                <Scale size={13} /> Sổ khớp
              </span>
            </div>
            <ul className="m-ledger">
              {SUMMARY.map((r) => (
                <li key={r.name} className={r.name === "Lym" ? "is-me" : ""}>
                  <Avatar name={r.name} size={28} />
                  <span className="ml-id">
                    <b>
                      {r.name}
                      {r.name === "Lym" && <em>bạn</em>}
                    </b>
                    <small>
                      cấp {fmt(r.granted)} · {r.hands} ván · 7-2 {r.sevenDeuce === 0 ? "0" : signed(r.sevenDeuce)}
                    </small>
                  </span>
                  <NetBar net={r.net} />
                  <span className="ml-net">
                    <b className={`is-${tone(r.net)}`}>{signed(r.net)}</b>
                    <small>còn {fmt(r.balance)}</small>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="m-col">
            <div className="m-sec-row">
              <h4 className="m-sec">Các ván gần đây</h4>
              <span className="link is-muted">Xem thêm 34 ván</span>
            </div>
            <ul className="m-scroll hands is-mobile">
              {HANDS.map((h) => (
                <HandItem key={h.no} h={h} device="mobile" />
              ))}
            </ul>
          </section>
        </main>
        <HomeBar />
      </Root>
    );
  }
  return (
    <Root device="desktop" className="bg-app">
      <DesktopNav active="history" />
      <main className="page">
        <div className="page-head">
          <span>
            <span className="eyebrow">Lịch sử · chip ảo</span>
            <h1 className="page-title">Lời / lỗ tối nay</h1>
            <p className="page-sub">Tính theo chip được cấp ở phòng này. Không phải tiền thật.</p>
          </span>
          <span className="room-select">
            <MiniTable seats={9} seated={7} w={44} h={28} />
            <span>
              <small>Phòng</small>
              <b>Bàn thứ Sáu</b>
            </span>
            <ChevronDown size={16} />
          </span>
        </div>
        <div className="history-grid">
          <section className="panel">
            <div className="panel-head">
              <h3>Bảng tổng kết</h3>
              <small>38 ván · mở từ 19:30</small>
            </div>
            <Ledger />
          </section>
          <section className="panel">
            <div className="panel-head">
              <h3>Các ván</h3>
              <Segmented items={["Tất cả", "Có tôi"]} active={0} className="seg-sm" />
            </div>
            <ul className="hands">
              {HANDS.map((h) => (
                <HandItem key={h.no} h={h} device="desktop" />
              ))}
            </ul>
            <span className="hands-more">Xem thêm 34 ván cũ hơn</span>
          </section>
        </div>
      </main>
    </Root>
  );
}

/* ================= replay ================= */

const R = REPLAY;
const current = R.timeline.indexOf(R.action);
const replayModel: TableModel = {
  room: TABLE_TURN.room,
  blinds: TABLE_TURN.blinds,
  handNo: R.handNo,
  pot: R.pot,
  board: R.board,
  seats: [
    { seat: 1, name: R.players[0].name, stack: R.players[0].stack, cards: R.players[0].cards, state: "waiting", isMe: true, lastAction: "Check" },
    { seat: 3, name: R.players[1].name, stack: R.players[1].stack, cards: R.players[1].cards, bet: R.players[1].bet, state: "waiting", lastAction: R.players[1].note },
    { seat: 4, name: R.players[2].name, stack: R.players[2].stack, cards: [], state: "folded", isButton: true },
  ],
};

function Caption({ device }: { device: Device }) {
  return (
    <div className={`rp-caption rp-caption-${device}`}>
      <small>
        Bước {current + 1}/{R.steps}
      </small>
      <b>{R.action}</b>
    </div>
  );
}

function StepSlider({ device }: { device: Device }) {
  const frac = current / (R.steps - 1);
  return (
    <div className={`rp-slider rp-slider-${device}`}>
      <span className="rp-track">
        <i className="rp-fill" style={{ width: `${frac * 100}%` }} />
        {R.timeline.map((_, i) => (
          <i key={i} className={`rp-tick${i < current ? " is-past" : i === current ? " is-now" : ""}`} style={{ left: `${(i / (R.steps - 1)) * 100}%` }} />
        ))}
        <i className="rp-thumb" style={{ left: `${frac * 100}%` }} />
      </span>
      {device === "desktop" && (
        <span className="rp-labels">
          {["Chia", "Preflop", "", "Flop", "", "", "Kết quả"].map((l, i) => (
            <span key={i} style={{ left: `${(i / (R.steps - 1)) * 100}%` }}>
              {l}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

function Transport({ device }: { device: Device }) {
  const s = device === "desktop" ? 18 : 20;
  return (
    <span className="transport">
      <span className="tp-btn">
        <SkipBack size={s} strokeWidth={2} />
      </span>
      <span className="tp-btn">
        <ChevronLeft size={s + 2} strokeWidth={2.2} />
      </span>
      <span className="tp-btn is-play">
        <Play size={s + 2} strokeWidth={2.2} />
      </span>
      <span className="tp-btn">
        <ChevronLeft size={s + 2} strokeWidth={2.2} className="flip" />
      </span>
      <span className="tp-btn">
        <SkipForward size={s} strokeWidth={2} />
      </span>
    </span>
  );
}

function Timeline({ device }: { device: Device }) {
  return (
    <ol className={`timeline tl-${device}`}>
      {R.timeline.map((t, i) => (
        <li key={i} className={i < current ? "is-past" : i === current ? "is-now" : "is-future"}>
          <span className="tl-dot">{i < current ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
          <span className="tl-text">{t}</span>
          {i === current && <span className="tl-now">đang xem</span>}
        </li>
      ))}
    </ol>
  );
}

export function Replay({ device }: { device: Device }) {
  if (device === "mobile") {
    return (
      <Root device="mobile" className="bg-table">
        <div className="table-area-m">
          <Stage device="mobile" model={replayModel} meHint={<span className="turn-hint is-quiet"><small>Bạn xem bài mình,</small><small>bài người khác úp</small></span>}>
            <Caption device="mobile" />
          </Stage>
        </div>
        <MobileTableBar model={replayModel} title={`Xem lại ván #${R.handNo}`} sub={`${TABLE_TURN.room} · 21:03`} right={false} />
        <PhonePanel className="rp-panel">
          <div className="rp-panel-head">
            <span>
              <b>Diễn biến</b>
              <small>{R.steps} bước</small>
            </span>
            <span className="speed">
              1× <ChevronDown size={13} />
            </span>
          </div>
          <Timeline device="mobile" />
          <div className="rp-result-m">
            Kết quả: <b>Bình ăn 220</b> · bạn <b className="is-loss">−60</b>
          </div>
          <StepSlider device="mobile" />
          <Transport device="mobile" />
        </PhonePanel>
        <HomeBar />
      </Root>
    );
  }
  return (
    <Root device="desktop" className="bg-table">
      <TableTopBar
        model={replayModel}
        back="Lịch sử"
        right={
          <>
            <span className="tbar-btn is-quiet">
              <ChevronLeft size={15} strokeWidth={2} />
              Ván trước
            </span>
            <span className="tbar-btn">
              Ván #38
              <ChevronLeft size={15} strokeWidth={2} className="flip" />
            </span>
          </>
        }
        title={`Xem lại ván #${R.handNo}`}
        meta={
          <>
            <span>{TABLE_TURN.room}</span>
            <i />
            <span>Blind {TABLE_TURN.blinds}</span>
            <i />
            <span>21:03</span>
            <i />
            <span>Bạn chỉ thấy bài của mình</span>
          </>
        }
        watchers={0}
      />
      <div className="table-area">
        <Stage device="desktop" model={replayModel} meHint={<span className="turn-hint is-quiet"><small>Bài của bạn</small></span>}>
          <Caption device="desktop" />
        </Stage>
      </div>
      <div className="abar abar-replay">
        <Transport device="desktop" />
        <StepSlider device="desktop" />
        <span className="rp-right">
          <span className="rp-step">
            <b>{current + 1}</b>/{R.steps}
          </span>
          <span className="speed">
            1× <ChevronDown size={13} />
          </span>
        </span>
      </div>
      <aside className="side">
        <div className="side-title">
          <b>Diễn biến</b>
          <small>{R.steps} bước</small>
        </div>
        <div className="side-body">
          <Timeline device="desktop" />
          <div className="rp-result">
            <span className="eyebrow">Kết quả ván</span>
            <b>Bình ăn 220</b>
            <span className="rp-result-rows">
              <span>
                Bình <b className="is-gain">+340</b>
              </span>
              <span>
                Lym <b className="is-loss">−60</b>
              </span>
            </span>
            <small>Không có showdown nên bài của Bình vẫn úp trong bản xem lại.</small>
          </div>
        </div>
      </aside>
    </Root>
  );
}

/* ================= states ================= */

function SkeletonCard({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`sk-card${compact ? " is-compact" : ""}`}>
      <span className="sk sk-oval" />
      <span className="sk-lines">
        <span className="sk sk-l1" />
        <span className="sk sk-l2" />
        <span className="sk sk-l3" />
      </span>
    </div>
  );
}

function ErrorBlock({ device }: { device: Device }) {
  const d = device === "desktop";
  return (
    <div className={`err-block err-${device}`}>
      <span className="err-icon">
        <WifiOff size={d ? 26 : 22} strokeWidth={1.9} />
      </span>
      <span className="err-text">
        <b>Không tải được danh sách phòng</b>
        <small>Mạng đang chập chờn. Bàn và chip của bạn vẫn an toàn.</small>
      </span>
      <span className="err-actions">
        <Btn kind="primary" size={d ? "md" : "sm"} icon={<RotateCw size={15} strokeWidth={2.2} />}>
          Thử lại
        </Btn>
        {d && <small className="err-meta">Đã thử 2 lần · lần cuối 21:06</small>}
      </span>
    </div>
  );
}

function EmptyBlock({ device }: { device: Device }) {
  const d = device === "desktop";
  return (
    <div className={`empty-block empty-${device}`}>
      <span className="empty-art">
        <MiniTable seats={6} seated={0} w={d ? 180 : 96} h={d ? 104 : 58} />
        <span className="empty-plus">
          <Plus size={d ? 18 : 15} strokeWidth={2.4} />
        </span>
      </span>
      <b>Sảnh còn trống</b>
      <small>Chưa có phòng nào. Mở bàn đầu tiên rồi gửi link cho hội bạn.</small>
      <span className="empty-actions">
        <Btn kind="primary" size={d ? "md" : "sm"} icon={<Plus size={15} strokeWidth={2.4} />}>
          Tạo phòng
        </Btn>
        <Btn kind="ghost" size={d ? "md" : "sm"} icon={<Link2 size={15} />}>
          {d ? "Dán link mời" : "Dán link"}
        </Btn>
      </span>
    </div>
  );
}

function KickedToast({ device }: { device: Device }) {
  return (
    <div className={`toast toast-${device}`}>
      <span className="toast-icon">
        <DoorOpen size={device === "desktop" ? 20 : 18} strokeWidth={1.9} />
      </span>
      <span className="toast-text">
        <b>Bạn đã bị mời ra khỏi phòng</b>
        <small>Chủ phòng Bàn thứ Sáu đã mời bạn ra. 1.460 chip vẫn ghi trong lịch sử.</small>
      </span>
      <span className="toast-x">
        <X size={16} />
      </span>
    </div>
  );
}

export function States({ device }: { device: Device }) {
  if (device === "mobile") {
    return (
      <Root device="mobile" className="bg-app">
        <MobileRail active="lobby" />
        <main className="m-main m-states">
          <KickedToast device="mobile" />
          <section className="m-col">
            <span className="state-label">
              <i>1</i> Đang tải
            </span>
            <div className="state-box is-loading">
              <span className="sk sk-search" />
              <SkeletonCard compact />
              <SkeletonCard compact />
              <SkeletonCard compact />
            </div>
          </section>
          <div className="m-col">
            <section>
              <span className="state-label">
                <i>2</i> Lỗi mạng
              </span>
              <div className="state-box">
                <ErrorBlock device="mobile" />
              </div>
            </section>
            <section>
              <span className="state-label">
                <i>3</i> Sảnh trống
              </span>
              <div className="state-box">
                <EmptyBlock device="mobile" />
              </div>
            </section>
          </div>
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
            <span className="eyebrow">Sảnh · trạng thái</span>
            <h1 className="page-title">Khi sảnh chưa sẵn sàng</h1>
            <p className="page-sub">Ba tình huống của danh sách phòng, cùng một khung sảnh.</p>
          </span>
        </div>
        <div className="states-grid">
          <section className="state-col">
            <span className="state-label">
              <i>1</i> Đang tải
            </span>
            <div className="panel state-panel is-loading">
              <span className="sk sk-title" />
              <span className="sk sk-search" />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </section>
          <section className="state-col">
            <span className="state-label">
              <i>2</i> Lỗi mạng
            </span>
            <div className="panel state-panel is-center">
              <ErrorBlock device="desktop" />
              <div className="err-alt">
                <span>Có link mời? Vẫn vào thẳng bàn được.</span>
                <span className="input">
                  <span className="input-icon">
                    <Link2 size={16} />
                  </span>
                  <span className="input-ph">Dán link mời…</span>
                </span>
              </div>
            </div>
          </section>
          <section className="state-col">
            <span className="state-label">
              <i>3</i> Sảnh trống
            </span>
            <div className="panel state-panel is-center">
              <EmptyBlock device="desktop" />
            </div>
          </section>
        </div>
      </main>
      <KickedToast device="desktop" />
    </Root>
  );
}
