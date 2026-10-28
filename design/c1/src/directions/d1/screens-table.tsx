import {
  ChevronDown,
  Clock,
  Coffee,
  Copy,
  Crown,
  Hourglass,
  Link2,
  Lock,
  Minus,
  Plus,
  RefreshCw,
  RotateCw,
  ServerCrash,
  Timer,
  UserX,
  X,
} from "lucide-react";

import { OWNER, SEVEN_DEUCE, TABLE_SHOWDOWN, TABLE_TURN } from "../../shared/data";
import type { Device } from "../../shared/screens";
import { Avatar, Btn, CardText, Confetti, HomeBar, IconBtn, PlayingCard, Root, Segmented, fmt } from "./kit";
import {
  ChatComposer,
  ChatList,
  IdleBar,
  LogList,
  MobileTableBar,
  PhonePanel,
  PreAction,
  SidePanel,
  Stage,
  TableTopBar,
  TurnBar,
  TurnPanel,
  seatPos,
  type SeatView,
  type TableModel,
} from "./table";

const T = TABLE_TURN;
const S = TABLE_SHOWDOWN;

const turnModel: TableModel = { room: T.room, blinds: T.blinds, handNo: T.handNo, pot: T.pot, board: T.board, seats: T.seats };

const turnLog = [
  { t: "Ván #37 · Chi cầm nút", kind: "street" as const },
  { t: "Khoa blind nhỏ 10 · An blind lớn 20" },
  { t: "Giang mất kết nối — đồng hồ vẫn chạy", kind: "warn" as const },
  { t: "Bình bỏ · Hà bỏ" },
  {
    t: (
      <>
        Flop <CardText card={T.board[0]} /> <CardText card={T.board[1]} /> <CardText card={T.board[2]} />
      </>
    ),
    kind: "street" as const,
  },
  { t: "Khoa check" },
  { t: "An cược 40" },
  { t: "Chi theo 40" },
  { t: "Tới lượt Lym · còn 14 giây", kind: "me" as const },
];

const turnBarProps = {
  toCall: T.toCall,
  raise: T.presets[0].amount,
  presets: T.presets,
  active: 0,
  min: T.minRaise,
  max: T.maxRaise,
};

/* ================= table-turn ================= */

export function TableTurn({ device }: { device: Device }) {
  if (device === "mobile") {
    return (
      <Root device="mobile" className="bg-table">
        <div className="table-area-m">
          <Stage device="mobile" model={turnModel} meHint={<TurnHint left={14} />} />
        </div>
        <MobileTableBar model={T} chatBadge={2} />
        <TurnPanel {...turnBarProps} left={14} total={20} />
        <HomeBar />
      </Root>
    );
  }
  return (
    <Root device="desktop" className="bg-table">
      <TableTopBar model={T} />
      <div className="table-area">
        <Stage device="desktop" model={turnModel} meHint={<TurnHint left={14} />} />
      </div>
      <TurnBar {...turnBarProps} left={14} total={20} />
      <SidePanel tab={2} counts={[5, 8]} footer={<HandFooter pot={T.pot} bets={80} />}>
        <LogList items={turnLog} />
      </SidePanel>
    </Root>
  );
}

function TurnHint({ left }: { left: number }) {
  return (
    <span className="turn-hint">
      <b>{left}s</b>
      <small>Tới lượt bạn</small>
    </span>
  );
}

function HandFooter({ pot, bets }: { pot: number; bets: number }) {
  return (
    <div className="hand-foot">
      <span>
        <small>Pot</small>
        <b>{fmt(pot)}</b>
      </span>
      <span>
        <small>Đang cược</small>
        <b>{fmt(bets)}</b>
      </span>
      <span>
        <small>Trong ván</small>
        <b>5 người</b>
      </span>
    </div>
  );
}

/* ================= table-showdown ================= */

const showdownSeats: SeatView[] = S.seats.map((s) => ({ ...s, shown: s.state === "winner" || s.isMe }));
const showdownModel: TableModel = {
  room: S.room,
  blinds: S.blinds,
  handNo: S.handNo,
  pot: 0,
  board: S.board,
  boardHi: [0, 1, 2, 4],
  seats: showdownSeats,
};
const winnerSeat = S.seats.find((s) => s.state === "winner")!;

function LossHint() {
  return (
    <span className="turn-hint">
      <b className="is-loss">−400</b>
      <small>Ván này</small>
    </span>
  );
}

function Spectators({ device }: { device: Device }) {
  return (
    <div className={`watchers watchers-${device}`}>
      <span className="watchers-avs">
        {S.spectators.map((n) => (
          <Avatar key={n} name={n} size={device === "desktop" ? 26 : 22} />
        ))}
      </span>
      <span className="watchers-text">
        <b>{S.spectators.length} người đang xem</b>
        <small>{S.spectators.join(", ")}</small>
      </span>
    </div>
  );
}

function WinnerBanner({ device }: { device: Device }) {
  return (
    <div className={`win-banner win-${device}`}>
      <span className="win-crown">
        <Crown size={device === "desktop" ? 16 : 13} strokeWidth={2.2} />
      </span>
      <b>
        {S.winner.name} thắng {fmt(S.winner.amount)}
      </b>
      <small>{winnerSeat.hand}</small>
    </div>
  );
}

export function TableShowdown({ device }: { device: Device }) {
  if (device === "mobile") {
    return (
      <Root device="mobile" className="bg-table">
        <div className="table-area-m">
          <Stage device="mobile" model={showdownModel} meHint={<LossHint />}>
            <WinnerBanner device="mobile" />
          </Stage>
        </div>
        <MobileTableBar model={S} chatBadge={3} />
        <PhonePanel className="idle-panel">
          <div className="ip-next">
            <span className="abar-eyebrow">Ván #{S.handNo} đã xong</span>
            <span className="next-hand">
              <Hourglass size={15} strokeWidth={2} />
              Ván mới sau <b>4</b> giây
            </span>
          </div>
          <div className="ip-win">
            <Crown size={16} strokeWidth={2} />
            <span>
              <b>Chi thắng {fmt(S.winner.amount)}</b>
              <small>với Thùng già A — An all-in 920 không qua được</small>
            </span>
          </div>
          <span className="ip-me">
            Bạn: <b>Bộ ba K · thua 400</b>
          </span>
          <Spectators device="mobile" />
          <div className="ip-actions">
            <Btn kind="quiet" block icon={<Coffee size={16} />}>
              Nghỉ ván sau
            </Btn>
            <Btn kind="ghost" block>
              Xem lại ván
            </Btn>
          </div>
        </PhonePanel>
        <HomeBar />
      </Root>
    );
  }
  return (
    <Root device="desktop" className="bg-table">
      <TableTopBar model={S} />
      <div className="table-area">
        <Stage device="desktop" model={showdownModel} meHint={<LossHint />}>
          <Spectators device="desktop" />
          <WinnerBanner device="desktop" />
          <div className="win-chips" style={{ left: 268, top: 300 }}>
            <span className="pot-pill is-win">
              <small>Pot về Chi</small>
              <b>+{fmt(S.pot)}</b>
            </span>
          </div>
        </Stage>
      </div>
      <IdleBar
        left={
          <span className="idle-hand">
            <small>Ván #{S.handNo} đã xong</small>
            <b>Bạn: Bộ ba K · thua 400</b>
          </span>
        }
        center={
          <span className="idle-msg">
            <Crown size={18} strokeWidth={2} />
            <span>
              <b>Chi thắng {fmt(S.winner.amount)}</b> với Thùng già A — An all-in 920 không qua được
            </span>
          </span>
        }
        right={
          <>
            <PreAction label="Nghỉ ván sau" />
            <span className="next-hand">
              <Hourglass size={15} strokeWidth={2} />
              Ván mới sau <b>4</b> giây
            </span>
          </>
        }
      />
      <SidePanel tab={2} counts={[5, 7]}>
        <LogList
          items={[
            { t: "Ván #38 · Chi cầm nút", kind: "street" },
            { t: "An all-in 920 · Chi theo · Lym theo" },
            {
              t: (
                <>
                  River <CardText card={S.board[4]} />
                </>
              ),
              kind: "street",
            },
            { t: "Giang mất kết nối 0:42 — tự check", kind: "warn" },
            {
              t: (
                <>
                  Lật bài: Lym <CardText card={S.seats[0].cards![0]} /> <CardText card={S.seats[0].cards![1]} /> — Bộ ba K
                </>
              ),
            },
            {
              t: (
                <>
                  Lật bài: Chi <CardText card={S.seats[3].cards![0]} /> <CardText card={S.seats[3].cards![1]} /> — Thùng già A
                </>
              ),
            },
            { t: "An không lật bài (thua)" },
            { t: `Chi ăn ${fmt(S.winner.amount)}`, kind: "win" },
          ]}
        />
      </SidePanel>
    </Root>
  );
}

/* ================= seven-deuce ================= */

const SD = SEVEN_DEUCE;
const paid = (name: string) => SD.payments.find((p) => p.name === name);
const sevenSeats: SeatView[] = [
  { seat: 1, name: "Lym", stack: 1410, cards: [], state: "folded", isMe: true, delta: { text: `−${SD.bonus}`, kind: "loss" } },
  { seat: 2, name: "An", stack: 870, cards: [], state: "folded", delta: { text: `−${SD.bonus}`, kind: "loss" } },
  // Bình's 7-2 is drawn large next to the seat (auto-revealed), so the pod itself shows no mini cards.
  { seat: 3, name: SD.winner, stack: 1500 + SD.pot + SD.total, cards: [], state: "winner", delta: { text: `+${SD.total}`, kind: "gain" } },
  { seat: 4, name: "Chi", stack: 2160, cards: [], state: "folded", isButton: true, delta: { text: `−${SD.bonus}`, kind: "loss" } },
  { seat: 5, state: "empty" },
  { seat: 6, name: "Dũng", stack: 590, cards: [], state: "sitting-out", lastAction: "Đang nghỉ", delta: { text: `−${paid("Dũng")!.amount}`, kind: "loss" } },
  { seat: 7, state: "empty" },
  { seat: 8, state: "empty" },
  { seat: 9, name: "Khoa", stack: 250, cards: [], state: "folded", delta: { text: `−${SD.bonus}`, kind: "loss" } },
];
const sevenModel: TableModel = { room: T.room, blinds: T.blinds, handNo: T.handNo, pot: 0, board: [], seats: sevenSeats };

function SevenMedal({ size = 64 }: { size?: number }) {
  return (
    <span className="sd-medal" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>
      <b>7·2</b>
    </span>
  );
}

function SevenLedger({ device }: { device: Device }) {
  return (
    <div className={`sd-ledger sd-ledger-${device}`}>
      <div className="sd-ledger-head">
        <span>
          <small>Thưởng 7-2</small>
          <b>{SD.bonus} mỗi người đang ngồi</b>
        </span>
        <SevenMedal size={device === "desktop" ? 40 : 34} />
      </div>
      <ul className="sd-pay">
        {SD.payments.map((p) => (
          <li key={p.name}>
            <Avatar name={p.name} size={device === "desktop" ? 26 : 22} />
            <span className="sd-pay-name">
              {p.name}
              {p.note && <em>{p.note}</em>}
            </span>
            <b>−{p.amount}</b>
          </li>
        ))}
      </ul>
      <div className="sd-total">
        <span>
          Tổng {SD.winner} nhận
          <small>{device === "desktop" ? `${SD.payments.length} người trả đủ, không ai âm chip` : "kể cả Dũng đang nghỉ"}</small>
        </span>
        <b>+{SD.total}</b>
      </div>
    </div>
  );
}

export function SevenDeuce({ device }: { device: Device }) {
  const bp = seatPos(device, 3);
  if (device === "mobile") {
    return (
      <Root device="mobile" className="bg-table">
        <div className="table-area-m">
          <Stage device="mobile" model={sevenModel} className="is-seven">
            <Confetti count={30} spread={0.8} className="cf-m" />
            <div className="sd-banner sd-banner-m">
              <span className="sd-cards">
                {SD.cards.map((c, i) => (
                  <PlayingCard key={i} card={c} w={44} rotate={i === 0 ? -7 : 7} />
                ))}
              </span>
              <span className="sd-banner-text">
                <span className="sd-eyebrow">Bluff 7-2 thành công</span>
                <b className="sd-amount">+{SD.total}</b>
                <span className="sd-reveal">Bài {SD.winner} tự lật cho cả bàn</span>
                <small className="sd-sub">Ăn pot {SD.pot} khi cả bàn bỏ bài</small>
              </span>
            </div>
            <span className="sd-pointer" style={{ left: bp.x + 120, top: bp.y }} />
          </Stage>
        </div>
        <MobileTableBar model={T} chatBadge={4} />
        <PhonePanel className="sd-panel">
          <SevenLedger device="mobile" />
          <span className="next-hand">
            <Hourglass size={15} strokeWidth={2} />
            Ván mới sau <b>5</b> giây
          </span>
        </PhonePanel>
        <HomeBar />
      </Root>
    );
  }
  return (
    <Root device="desktop" className="bg-table">
      <TableTopBar model={T} />
      <div className="table-area">
        <Stage device="desktop" model={sevenModel} className="is-seven">
          <Confetti count={40} spread={1.25} className="cf-d" />
          <div className="sd-reveal-cards" style={{ left: bp.x + 168, top: bp.y - 6 }}>
            <span className="sd-ribbon">Tự lật</span>
            <span className="sd-cards">
              {SD.cards.map((c, i) => (
                <PlayingCard key={i} card={c} w={68} rotate={i === 0 ? -7 : 7} />
              ))}
            </span>
            <span className="sd-reveal">Bài của {SD.winner} · cả bàn và người xem đều thấy</span>
          </div>
          <div className="sd-banner sd-banner-d">
            <SevenMedal size={76} />
            <span className="sd-eyebrow">Bluff 7-2 thành công</span>
            <b className="sd-title">{SD.winner} ăn pot bằng 7-2!</b>
            <span className="sd-line">
              Pot <b>{SD.pot}</b> <i /> Thưởng <b className="is-gain">+{SD.total}</b>
            </span>
            <small className="sd-sub">Mỗi người đang ngồi trả {SD.bonus} — kể cả người đang nghỉ</small>
          </div>
        </Stage>
      </div>
      <IdleBar
        left={
          <span className="idle-hand">
            <small>Bạn đã bỏ bài</small>
            <b>Trả thưởng 7-2 · −{SD.bonus}</b>
          </span>
        }
        center={
          <span className="idle-msg is-seven">
            <SevenMedal size={30} />
            <span>
              <b>{SD.winner} +{SD.total}</b> từ thưởng 7-2 · thêm pot {SD.pot}
            </span>
          </span>
        }
        right={
          <span className="next-hand">
            <Hourglass size={15} strokeWidth={2} />
            Ván mới sau <b>5</b> giây
          </span>
        }
      />
      <SidePanel tab={2} counts={[6, 6]}>
        <SevenLedger device="desktop" />
        <LogList
          items={[
            { t: "Bình tố 120 · cả bàn bỏ bài", kind: "street" },
            { t: "Bình ăn pot 340" },
            {
              t: (
                <>
                  Tự lật bài Bình: <CardText card={SD.cards[0]} /> <CardText card={SD.cards[1]} />
                </>
              ),
              kind: "win",
            },
            { t: "Thưởng 7-2: 5 người × 50 = +250", kind: "pay" },
          ]}
        />
      </SidePanel>
    </Root>
  );
}

/* ================= reconnect ================= */

const reconnectModel: TableModel = {
  ...turnModel,
  seats: T.seats.map((s) => (s.isMe ? { ...s, timer: { left: 9, total: 20 } } : s)),
};

function ReconnectCard({ device }: { device: Device }) {
  return (
    <div className={`overlay-card rc-card rc-${device}`}>
      <span className="rc-spinner">
        <i />
        <RefreshCw size={device === "desktop" ? 22 : 20} strokeWidth={2} />
      </span>
      <b className="rc-title">Đang kết nối lại…</b>
      <span className="rc-sub">Lần thử 2 · tự thử lại sau 3 giây</span>
      <span className="rc-timer">
        <Timer size={16} strokeWidth={2.2} />
        <span>
          <b>Đồng hồ của bạn vẫn chạy: còn 9 giây.</b> Hết giờ sẽ tự check nếu được, không thì bỏ bài.
        </span>
      </span>
      <span className="rc-actions">
        <Btn kind="primary" size={device === "desktop" ? "md" : "lg"} icon={<RotateCw size={16} />}>
          Thử lại ngay
        </Btn>
        <Btn kind="ghost" size={device === "desktop" ? "md" : "lg"}>
          Về sảnh
        </Btn>
      </span>
    </div>
  );
}

function PausedCard({ device }: { device: Device }) {
  return (
    <div className={`paused paused-${device}`}>
      <span className="variant-label">Biến thể · lỗi máy chủ</span>
      <div className="paused-card">
        <span className="paused-icon">
          <ServerCrash size={device === "desktop" ? 24 : 20} strokeWidth={1.9} />
        </span>
        <span className="paused-head">
          <b>Bàn tạm dừng</b>
          <span>Máy chủ gặp sự cố. Ván #37 được giữ nguyên, đồng hồ dừng lại.</span>
        </span>
        <ul className="paused-facts">
          <li>
            <Clock size={14} /> Đồng hồ dừng ở <b>14 giây</b>
          </li>
          <li>
            <Lock size={14} /> Chip và bài <b>giữ nguyên</b>
          </li>
          <li>
            <RefreshCw size={14} /> Tự thử lại sau <b>0:30</b>
          </li>
        </ul>
        <Btn kind="ghost" size="md" block icon={<RotateCw size={15} />}>
          Tải lại bàn
        </Btn>
      </div>
    </div>
  );
}

export function Reconnect({ device }: { device: Device }) {
  if (device === "mobile") {
    return (
      <Root device="mobile" className="bg-table">
        <div className="table-area-m is-dimmed is-spot-me">
          <Stage device="mobile" model={reconnectModel} meHint={<TurnHint left={9} />} />
        </div>
        <div className="scrim scrim-m" />
        <MobileTableBar
          model={T}
          right={
            <span className="conn-strip conn-strip-m">
              <span className="conn-dot" />
              Mất kết nối · đang thử lại
            </span>
          }
        />
        <ReconnectCard device="mobile" />
        <PhonePanel className="paused-panel">
          <PausedCard device="mobile" />
        </PhonePanel>
        <HomeBar />
      </Root>
    );
  }
  return (
    <Root device="desktop" className="bg-table">
      <TableTopBar model={T} />
      <div className="table-area is-dimmed is-spot-me">
        <Stage device="desktop" model={reconnectModel} meHint={<TurnHint left={9} />} />
      </div>
      <div className="is-dimmed abar-wrap">
        <TurnBar {...turnBarProps} left={9} total={20} />
      </div>
      <div className="scrim scrim-d" />
      <div className="conn-strip conn-strip-d">
        <span className="conn-dot" />
        Mất kết nối với bàn — các nút tạm khoá cho tới khi kết nối lại
      </div>
      <ReconnectCard device="desktop" />
      <aside className="side side-variant">
        <PausedCard device="desktop" />
      </aside>
    </Root>
  );
}

/* ================= owner-panel ================= */

function OwnerPanel({ device }: { device: Device }) {
  const d = device === "desktop";
  const notice = (
    <div className="notice notice-brass">
      <Clock size={16} strokeWidth={2} />
      <span>
        <b>{OWNER.pending}</b>
        <small>Ván đang chơi giữ blind 10/20</small>
      </span>
      <span className="notice-link">Huỷ</span>
    </div>
  );
  // Desktop stacks everything in one column; the landscape phone puts the notice in the header
  // row and splits the rest into two columns (players | settings), see .owner-mobile.
  return (
    <div className={`owner owner-${device}`}>
      <div className="owner-head">
        <span className="owner-crown">
          <Crown size={d ? 20 : 17} strokeWidth={2} />
        </span>
        <span className="owner-title">
          <b>Bảng chủ phòng</b>
          <small>{OWNER.room} · bạn là chủ phòng</small>
        </span>
        {!d && notice}
        <IconBtn label="Đóng">
          <X size={18} />
        </IconBtn>
      </div>
      {d && notice}

      <section className="owner-sec os-players">
        <h4>
          Người chơi & chip <small>{OWNER.players.length} người đang ngồi</small>
        </h4>
        <ul className="owner-players">
          {OWNER.players.map((p) => {
            const open = p.name === "Bình";
            return (
              <li key={p.name} className={open ? "is-open" : ""}>
                <div className="op-row">
                  <Avatar name={p.name} size={d ? 34 : 30} />
                  <span className="op-id">
                    <b>{p.name}</b>
                    <small>
                      Ghế {p.seat} · {p.note ?? (p.inHand ? "đang trong ván" : "chờ ván sau")}
                    </small>
                  </span>
                  <span className="op-stack">{fmt(p.stack)}</span>
                  {!open && (
                    <span className="op-actions">
                      <span className="mini-btn">Cấp/trừ</span>
                      <span className="mini-icon" title="Mời ra">
                        <UserX size={15} />
                      </span>
                    </span>
                  )}
                  {open && <ChevronDown size={16} className="op-caret" />}
                </div>
                {open && (
                  <div className="op-adjust">
                    <span className="stepper">
                      <span>
                        <Minus size={14} />
                      </span>
                      <b>500</b>
                      <span>
                        <Plus size={14} />
                      </span>
                    </span>
                    <span className="mini-btn is-primary">Cấp 500</span>
                    <span className="mini-btn is-danger">Trừ 500</span>
                    <span className="mini-btn is-kick">
                      <UserX size={14} />
                      Mời ra
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <span className="owner-hint is-desktop-only">Người đang trong ván: chip cấp/trừ được áp sau khi ván kết thúc.</span>
      </section>

      <div className="owner-two">
        <section className="owner-sec">
          <h4>Blind</h4>
          <span className="select">
            <span>
              <s>10/20</s> → <b>20/40</b>
            </span>
            <ChevronDown size={16} />
          </span>
          <span className="owner-hint">Áp từ ván sau</span>
        </section>
        <section className="owner-sec">
          <h4>Giây suy nghĩ</h4>
          <Segmented items={["15", "20", "30", "45"]} active={1} className="seg-fill" />
          <span className="owner-hint is-desktop-only">Mỗi lượt, không có thời gian cộng</span>
        </section>
      </div>

      <section className="owner-sec os-link">
        <h4>Link mời</h4>
        <div className="link-row">
          <span className="link-box">
            <Link2 size={15} />
            <span>{OWNER.invite.replace("https://", "")}</span>
          </span>
          <span className="mini-btn is-icon" title="Chép">
            <Copy size={15} />
          </span>
        </div>
        <span className="owner-inline">
          <span className="mini-btn">
            <RefreshCw size={13} />
            Đổi link
          </span>
          <span className="owner-hint">Link cũ hết hiệu lực ngay khi đổi.</span>
        </span>
      </section>

      <section className="owner-danger">
        <span>
          <b>Đóng phòng</b>
          <small>Kết thúc bàn, mọi người thấy bảng tổng kết lời/lỗ.</small>
        </span>
        <Btn kind="danger" size="sm">
          Đóng phòng
        </Btn>
      </section>
    </div>
  );
}

export function OwnerPanelScreen({ device }: { device: Device }) {
  if (device === "mobile") {
    return (
      <Root device="mobile" className="bg-table">
        <div className="table-area-m is-dimmed">
          <Stage device="mobile" model={turnModel} />
        </div>
        <MobileTableBar model={T} />
        <div className="scrim scrim-full" />
        <OwnerPanel device="mobile" />
        <HomeBar />
      </Root>
    );
  }
  return (
    <Root device="desktop" className="bg-table">
      <TableTopBar model={T} ownerActive />
      <div className="table-area is-dimmed">
        <Stage device="desktop" model={turnModel} meHint={<TurnHint left={14} />} />
      </div>
      <div className="is-dimmed abar-wrap">
        <TurnBar {...turnBarProps} left={14} total={20} />
      </div>
      <div className="scrim scrim-d" />
      <OwnerPanel device="desktop" />
    </Root>
  );
}

/* ================= chat ================= */

const chatModel: TableModel = {
  ...turnModel,
  pot: T.pot,
  seats: T.seats.map((s): SeatView => {
    if (s.isMe) return { ...s, state: "waiting", timer: undefined, bet: 40, stack: 1420, lastAction: "Theo 40" };
    if (s.seat === 9) return { ...s, state: "turn", timer: { left: 9, total: 20 }, lastAction: undefined, bubble: "👍" };
    if (s.seat === 2) return { ...s, bubble: "ai bluff kìa 😏" };
    return s;
  }),
};

function WatchersBlock({ device }: { device: Device }) {
  return (
    <div className={`watch-block watch-${device}`}>
      <span className="watch-head">
        Đang xem <i>{S.spectators.length}</i>
      </span>
      <span className="watch-list">
        {S.spectators.map((n) => (
          <span key={n} className="watch-person">
            <Avatar name={n} size={device === "desktop" ? 28 : 26} />
            <span>{n}</span>
          </span>
        ))}
      </span>
      <small className="watch-note">Người xem chat được nhưng không thấy bài úp.</small>
    </div>
  );
}

export function ChatScreen({ device }: { device: Device }) {
  if (device === "mobile") {
    return (
      <Root device="mobile" className="bg-table">
        <div className="table-area-m">
          <Stage device="mobile" model={chatModel} />
        </div>
        <MobileTableBar model={T} right={false} />
        <div className="scrim scrim-soft" />
        <div className="drawer chat-drawer">
          <div className="drawer-tabs">
            <span className="is-active">
              Chat <i>5</i>
            </span>
            <span>
              Người xem <i>3</i>
            </span>
            <IconBtn label="Đóng">
              <X size={18} />
            </IconBtn>
          </div>
          <WatchersBlock device="mobile" />
          <ChatList compact spectators={S.spectators} />
          <ChatComposer draft="ván này căng ghê" />
        </div>
        <HomeBar />
      </Root>
    );
  }
  return (
    <Root device="desktop" className="bg-table">
      <TableTopBar model={T} />
      <div className="table-area">
        <Stage device="desktop" model={chatModel} />
      </div>
      <IdleBar
        className="abar-pre"
        left={
          <span className="idle-hand">
            <small>Đang chờ</small>
            <b>Khoa suy nghĩ · 9s</b>
          </span>
        }
        center={
          <span className="pre-group">
            <span className="pre-title">Chọn trước</span>
            <PreAction label="Check / Bỏ" />
            <PreAction label="Check" on />
            <PreAction label="Theo bất kỳ" />
          </span>
        }
        right={<PreAction label="Nghỉ ván sau" />}
      />
      <SidePanel tab={0} counts={[5, 8]} footer={<ChatComposer draft="ván này căng ghê" />}>
        <WatchersBlock device="desktop" />
        <ChatList spectators={S.spectators} />
      </SidePanel>
    </Root>
  );
}
