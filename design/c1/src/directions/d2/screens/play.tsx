// Kính & Ánh Kim (d2) — table screens: my turn, showdown, the 7-2 moment, reconnect / paused,
// owner panel, chat. Desktop: top bar + stage + a glass column on the right. Phone: stage on
// the left, a glass column (or drawer / sheet) along the right edge.
import type { ReactNode } from "react";
import {
  Check,
  Copy,
  Crown,
  DoorClosed,
  Eye,
  Hourglass,
  Minus,
  PauseCircle,
  Plus,
  RefreshCw,
  Send,
  ServerCrash,
  Smile,
  Sparkles,
  Timer,
  UserX,
  WifiOff,
  X,
} from "lucide-react";

import { CHAT, OWNER, QUICK_EMOJI, SEVEN_DEUCE, TABLE_SHOWDOWN, TABLE_TURN, type Seat } from "../../../shared/data";
import type { Device } from "../../../shared/screens";
import { fmt } from "../lib";
import {
  Actions,
  HeroCards,
  LogLine,
  MiniCards,
  MTableTop,
  Pot,
  STAGE,
  SEAT_AT,
  Table,
  TableTop,
  TurnHead,
  type SeatOpts,
} from "../table";
import { Avatar, Btn, Chip, Eyebrow, Glass, IconBtn, Pill, Ring, Root, Seg, Suit } from "../ui";

const T = TABLE_TURN;
const SD = TABLE_SHOWDOWN;
const S7 = SEVEN_DEUCE;
const ME_CARDS = T.seats[0].cards!;

/** The stage box: under the top bar on desktop, the left part of the phone. */
function Stage({ d, children, className = "" }: { d: Device; children: ReactNode; className?: string }) {
  return (
    <div className={`k-stagebox k-stagebox-${d} ${className}`} style={{ width: STAGE[d].w, height: STAGE[d].h }}>
      {children}
    </div>
  );
}

/* ============================================================= table-turn */

function TurnLog() {
  return (
    <section className="k-sec k-col-log">
      <span className="k-sec-h">
        <Eyebrow>Diễn biến ván #37</Eyebrow>
        <small className="k-col-note">Flop</small>
      </span>
      <ul className="k-log">
        <LogLine>
          Flop <MiniCards cards={T.board} />
        </LogLine>
        <LogLine who="An">
          <b>An</b> cược <b className="k-num">40</b>
        </LogLine>
        <LogLine who="Chi">
          <b>Chi</b> theo <b className="k-num">40</b>
        </LogLine>
        <LogLine who="Lym" tone="now">
          <b>Tới lượt bạn</b> · cần theo <b className="k-num">40</b>
        </LogLine>
      </ul>
    </section>
  );
}

function TableTurn({ device: d }: { device: Device }) {
  const hero = <HeroCards cards={ME_CARDS} d={d} />;
  if (d === "desktop")
    return (
      <Root device={d} bg="table">
        <TableTop hand={T.handNo} />
        <Stage d={d}>
          <Table d={d} seats={T.seats} board={T.board} pot={T.pot} hero={hero} />
        </Stage>
        <aside className="k-col k-glass">
          <TurnHead d={d} />
          <div className="k-tocall">
            <span>
              Cần theo <b className="k-num">40</b>
            </span>
            <i />
            <span>
              Pot <b className="k-num">260</b>
            </span>
            <i />
            <span>
              Tố tối thiểu <b className="k-num">80</b>
            </span>
          </div>
          <Actions d={d} />
          <div className="k-hr" />
          <TurnLog />
          <div className="k-col-foot k-peek">
            <span className="k-sec-h">
              <Eyebrow tone="mute">Chat</Eyebrow>
              <span className="k-link">
                Mở chat · <b className="k-num">2</b> tin mới
              </span>
            </span>
            {CHAT.slice(0, 2).map((m) => (
              <span key={m.at + m.name} className="k-peek-i">
                <Avatar name={m.name} size={22} ring="none" />
                <b>{m.name}</b>
                <span>{m.text}</span>
              </span>
            ))}
          </div>
        </aside>
      </Root>
    );
  return (
    <Root device={d} bg="table">
      <Stage d={d}>
        <Table d={d} seats={T.seats} board={T.board} pot={T.pot} hero={hero} />
        <MTableTop hand={T.handNo} />
      </Stage>
      <aside className="k-mcol k-glass">
        <TurnHead d={d} />
        <Actions d={d} />
      </aside>
    </Root>
  );
}

/* ========================================================= table-showdown */

const SD_OPTS: Record<number, SeatOpts> = { 4: { reveal: true } };

function Watchers({ d }: { d: Device }) {
  return (
    <div className={`k-watchbar ${d === "mobile" ? "k-watchbar-m" : ""}`}>
      <Eye size={d === "mobile" ? 14 : 16} strokeWidth={2.2} />
      <b className="k-num">{SD.spectators.length}</b>
      <span>đang xem</span>
      <span className="k-watchbar-av">
        {SD.spectators.map((n) => (
          <span key={n} className="k-watcher">
            <Avatar name={n} size={d === "mobile" ? 22 : 26} ring="none" />
            {d === "desktop" && n}
          </span>
        ))}
      </span>
    </div>
  );
}

function WinnerCard({ d }: { d: Device }) {
  const mob = d === "mobile";
  return (
    <div className={`k-win ${mob ? "k-win-m" : ""}`}>
      <span className="k-win-rays" aria-hidden />
      <Avatar name="Chi" size={mob ? 40 : 64} ring="gold" />
      <span className="k-win-t">
        <small>
          <Crown size={mob ? 11 : 13} strokeWidth={2.4} /> Chi thắng ván #{SD.handNo}
        </small>
        <b className="k-num">+{fmt(SD.winner.amount)}</b>
        <em>{SD.winner.hand}</em>
      </span>
    </div>
  );
}

function ShownHands({ d }: { d: Device }) {
  const mob = d === "mobile";
  const rows = [
    { name: "Chi", cards: SD.seats[3].cards!, hand: "Thùng già A", win: true },
    { name: "Lym", cards: SD.seats[0].cards!, hand: "Bộ ba K", win: false },
  ];
  return (
    <div className="k-shownlist">
      {rows.map((r) => (
        <div key={r.name} className={`k-shownrow ${r.win ? "win" : ""}`}>
          {!mob && <Avatar name={r.name} size={30} ring={r.win ? "gold" : "steel"} />}
          <span className="k-shownrow-n">
            <b>
              {r.name}
              {r.name === "Lym" && <em>bạn</em>}
            </b>
            <small>{r.hand}</small>
          </span>
          <MiniCards cards={r.cards} w={mob ? 24 : 30} />
        </div>
      ))}
    </div>
  );
}

function NextHand({ d, n = 4, hand = 39 }: { d: Device; n?: number; hand?: number }) {
  return (
    <div className={`k-next ${d === "mobile" ? "k-next-m" : ""}`}>
      <Ring size={d === "mobile" ? 34 : 44} left={n} total={6} stroke={3} tone="gold">
        <b className="k-num">{n}</b>
      </Ring>
      <span>
        <b>Ván #{hand} sắp chia</b>
        <small>Tự chia sau {n} giây</small>
      </span>
    </div>
  );
}

function TableShowdown({ device: d }: { device: Device }) {
  const hero = <HeroCards cards={SD.seats[0].cards!} d={d} />;
  const table = (
    <Table
      d={d}
      seats={SD.seats}
      board={SD.board}
      pot={SD.pot}
      potLabel="Chi ăn"
      opts={SD_OPTS}
      hero={hero}
      glowBoard={[0, 1, 2, 4]}
      dimBoard={[3]}
    />
  );
  if (d === "desktop")
    return (
      <Root device={d} bg="table">
        <TableTop hand={SD.handNo} extra={<Pill tone="gold">Showdown</Pill>} />
        <Stage d={d}>
          {table}
          <Watchers d={d} />
        </Stage>
        <aside className="k-col k-glass">
          <Eyebrow>Showdown · ván #{SD.handNo}</Eyebrow>
          <WinnerCard d={d} />
          <ShownHands d={d} />
          <div className="k-hr" />
          <section className="k-sec">
            <Eyebrow tone="mute">Trên bàn lúc này</Eyebrow>
            <ul className="k-log">
              <LogLine who="An">
                <b>An</b> all-in <b className="k-num">920</b>, hết chip
              </LogLine>
              <LogLine who="Giang">
                <b>Giang</b> mất kết nối · giữ ghế <b className="k-num">0:42</b>
              </LogLine>
              <LogLine who="Dũng">
                <b>Dũng</b> đang nghỉ, không vào ván
              </LogLine>
              <LogLine>
                <b>2 ghế trống</b> · bạn bè vào ngồi được
              </LogLine>
            </ul>
          </section>
          <div className="k-col-foot">
            <NextHand d={d} />
          </div>
        </aside>
      </Root>
    );
  return (
    <Root device={d} bg="table">
      <Stage d={d}>
        {table}
        <MTableTop hand={SD.handNo} right={false} />
      </Stage>
      <aside className="k-mcol k-glass">
        <WinnerCard d={d} />
        <ShownHands d={d} />
        <NextHand d={d} />
        <Watchers d={d} />
      </aside>
    </Root>
  );
}

/* ============================================================ seven-deuce */

const S7_SEATS: Seat[] = [
  { seat: 1, name: "Lym", stack: 1410, state: "folded", isMe: true },
  { seat: 2, name: "An", stack: 870, state: "folded" },
  { seat: 3, name: "Bình", stack: 1500, cards: S7.cards, state: "winner" },
  { seat: 4, name: "Chi", stack: 2160, state: "folded", isButton: true },
  { seat: 5, state: "empty" },
  { seat: 6, name: "Dũng", stack: 590, state: "sitting-out" },
  { seat: 7, state: "empty" },
  { seat: 8, name: "Hà", stack: 0, state: "folded" },
  { seat: 9, name: "Khoa", stack: 250, state: "folded" },
];

function s7Opts(d: Device): Record<number, SeatOpts> {
  const out: Record<number, SeatOpts> = {};
  for (const s of S7_SEATS) {
    if (!s.name) continue;
    const p = S7.payments.find((x) => x.name === s.name);
    if (p) out[s.seat] = { tag: <Pill tone="red">−{p.amount}</Pill>, extra: d === "desktop" && p.note ? <small className="k-paynote">{p.note}</small> : undefined };
    else if (s.name === "Hà") out[s.seat] = { tag: <Pill tone="mute">{d === "desktop" ? "Hết chip · không trả" : "Hết chip"}</Pill> };
    else if (s.name === "Bình") out[s.seat] = { reveal: true, tag: <Pill tone="gold" icon={<Crown size={12} strokeWidth={2.4} />}>+{S7.total}</Pill> };
  }
  return out;
}

/** Light trails from every payer to Bình, with a chip riding each one. */
function Trails({ d }: { d: Device }) {
  const to = SEAT_AT[d][3];
  const payers = [1, 2, 4, 6, 9];
  const st = STAGE[d];
  return (
    <svg className="k-trails" width={st.w} height={st.h} viewBox={`0 0 ${st.w} ${st.h}`} aria-hidden>
      <defs>
        <linearGradient id="k-trail" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f0dcaa" stopOpacity="0" />
          <stop offset="1" stopColor="#f0dcaa" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      {payers.map((seat) => {
        const a = SEAT_AT[d][seat];
        const mx = (a.x + to.x) / 2 + (st.c.x - (a.x + to.x) / 2) * 0.35;
        const my = (a.y + to.y) / 2 + (st.c.y - (a.y + to.y) / 2) * 0.35;
        return <path key={seat} d={`M${a.x} ${a.y}Q${mx} ${my} ${to.x} ${to.y}`} className="k-trail" />;
      })}
    </svg>
  );
}

function TrailChips({ d }: { d: Device }) {
  const to = SEAT_AT[d][3];
  const st = STAGE[d];
  return (
    <>
      {[1, 2, 4, 6, 9].map((seat, i) => {
        const a = SEAT_AT[d][seat];
        const mx = (a.x + to.x) / 2 + (st.c.x - (a.x + to.x) / 2) * 0.35;
        const my = (a.y + to.y) / 2 + (st.c.y - (a.y + to.y) / 2) * 0.35;
        // a point at t = 0.55 on the quadratic curve
        const t = 0.55;
        const x = (1 - t) ** 2 * a.x + 2 * (1 - t) * t * mx + t ** 2 * to.x;
        const y = (1 - t) ** 2 * a.y + 2 * (1 - t) * t * my + t ** 2 * to.y;
        return (
          <span key={seat} className="k-flychip" style={{ left: x, top: y }}>
            <Chip tone={(["ruby", "ivory", "petrol", "onyx", "ruby"] as const)[i]} size={d === "mobile" ? 14 : 22} />
          </span>
        );
      })}
    </>
  );
}

function Medal({ d }: { d: Device }) {
  const mob = d === "mobile";
  return (
    <div className={`k-medal ${mob ? "k-medal-m" : ""}`}>
      <span className="k-medal-rays" aria-hidden />
      <span className="k-medal-disc">
        <small>Thưởng</small>
        <b>
          7<Suit suit="♣" size={mob ? 12 : 20} />2<Suit suit="♦" size={mob ? 12 : 20} className="red" />
        </b>
        <em className="k-num">+{S7.total}</em>
      </span>
      <span className="k-medal-ribbon">
        <Sparkles size={mob ? 11 : 14} strokeWidth={2.2} />
        {mob ? "Bluff 7-2!" : "Bình bluff bằng 7-2!"}
      </span>
    </div>
  );
}

function Ledger({ d }: { d: Device }) {
  const mob = d === "mobile";
  return (
    <div className={`k-ledger ${mob ? "k-ledger-m" : ""}`}>
      <div className="k-ledger-head">
        <Avatar name="Bình" size={mob ? 34 : 52} ring="gold" />
        <span className="k-ledger-ht">
          <small>Thưởng 7-2 · ván #37</small>
          <b>
            Bình nhận <em className="k-num">+{S7.total}</em>
          </b>
        </span>
      </div>
      <ul className="k-ledger-l">
        {S7.payments.map((p) => (
          <li key={p.name}>
            <Avatar name={p.name} size={mob ? 20 : 26} ring="none" />
            <span className="k-ledger-n">
              {p.name}
              {p.name === "Lym" && <em>bạn</em>}
              {p.note && <small>{mob ? "đang nghỉ" : p.note}</small>}
            </span>
            <b className="k-num k-down">−{p.amount}</b>
          </li>
        ))}
        <li className="muted">
          <Avatar name="Hà" size={mob ? 20 : 26} ring="none" className="k-av-dim" />
          <span className="k-ledger-n">
            Hà<small>{mob ? "hết chip" : "hết chip nên không trả"}</small>
          </span>
          <b className="k-num">0</b>
        </li>
      </ul>
      <div className="k-ledger-sum">
        <span>Tổng · 5 người × {S7.bonus}</span>
        <b className="k-num k-up">+{S7.total}</b>
      </div>
    </div>
  );
}

function SevenDeuce({ device: d }: { device: Device }) {
  const table = (
    <Table
      d={d}
      seats={S7_SEATS}
      board={[]}
      pot={S7.pot}
      opts={s7Opts(d)}
      className="k-table-s7"
      center={
        <>
          <Medal d={d} />
          <Pot n={S7.pot} label="Bình ăn" d={d} />
        </>
      }
    >
      <Trails d={d} />
      <TrailChips d={d} />
    </Table>
  );
  if (d === "desktop")
    return (
      <Root device={d} bg="table">
        <TableTop hand={37} extra={<Pill tone="gold" icon={<Sparkles size={12} strokeWidth={2.4} />}>Thưởng 7-2</Pill>} />
        <Stage d={d}>{table}</Stage>
        <aside className="k-col k-glass">
          <Eyebrow>Khoảnh khắc 7-2</Eyebrow>
          <p className="k-col-lead">
            Bình ăn pot bằng 7-2 khi mọi người bỏ bài. Bài tự lật cho cả bàn xem, mỗi người đang có ghế trả thưởng {S7.bonus}.
          </p>
          <Ledger d={d} />
          <div className="k-react">
            <span>Thả cảm xúc cho Bình</span>
            <span className="k-react-e">
              {["👏", "😂", "🔥", "😱", "🙏"].map((e) => (
                <i key={e}>{e}</i>
              ))}
            </span>
          </div>
          <div className="k-col-foot">
            <NextHand d={d} n={6} hand={38} />
          </div>
        </aside>
      </Root>
    );
  return (
    <Root device={d} bg="table">
      <Stage d={d}>
        {table}
        <MTableTop hand={37} right={false} />
      </Stage>
      <aside className="k-mcol k-glass">
        <Ledger d={d} />
        <span className="k-mnext">
          Ván #38 chia sau <b className="k-num">6</b> giây
        </span>
      </aside>
    </Root>
  );
}

/* ============================================================== reconnect */

const RC_SEATS: Seat[] = T.seats.map((s) => (s.isMe ? { ...s, timer: { left: 9, total: 20 } } : s));

function Reconnecting({ d }: { d: Device }) {
  const mob = d === "mobile";
  return (
    <div className={`k-rc ${mob ? "k-rc-m" : ""}`}>
      <span className="k-rc-spin" aria-hidden>
        <WifiOff size={mob ? 18 : 26} strokeWidth={2.2} />
      </span>
      <b className="k-rc-t">Đang kết nối lại…</b>
      <span className="k-rc-s">
        Ghế và chip của bạn vẫn giữ nguyên. Lần thử <b className="k-num">2</b> · tự thử lại sau <b className="k-num">3</b> giây.
      </span>
      <span className="k-rc-clock">
        <Ring size={mob ? 36 : 46} left={9} total={20} stroke={3} tone="red">
          <b className="k-num">9</b>
        </Ring>
        <span>
          <b>Đồng hồ của bạn vẫn chạy</b>
          <small>Hết giờ sẽ tự check, không check được thì tự bỏ bài.</small>
        </span>
      </span>
    </div>
  );
}

function Paused({ d }: { d: Device }) {
  const mob = d === "mobile";
  return (
    <div className={`k-paused ${mob ? "k-paused-m" : ""}`}>
      <div className="k-paused-art" aria-hidden>
        <span className="k-paused-felt">
          <PauseCircle size={mob ? 26 : 40} strokeWidth={1.6} />
        </span>
      </div>
      <span className="k-paused-tag">
        <ServerCrash size={13} strokeWidth={2.4} /> Lỗi máy chủ
      </span>
      <b className="k-paused-t">Bàn tạm dừng</b>
      <span className="k-paused-s">Máy chủ đang gặp sự cố. Ván #37 được giữ nguyên, đồng hồ cũng dừng, không ai mất chip.</span>
      {!mob && (
        <ul className="k-paused-l">
          <li>
            <Timer size={15} strokeWidth={2.2} />
            <span>
              Đồng hồ dừng ở <b className="k-num">14</b> giây
            </span>
          </li>
          <li>
            <RefreshCw size={15} strokeWidth={2.2} />
            <span>Tự chơi tiếp khi máy chủ ổn lại</span>
          </li>
        </ul>
      )}
    </div>
  );
}

function Reconnect({ device: d }: { device: Device }) {
  const table = <Table d={d} seats={RC_SEATS} board={T.board} pot={T.pot} hero={<HeroCards cards={ME_CARDS} d={d} />} className="k-table-dim" />;
  if (d === "desktop")
    return (
      <Root device={d} bg="table">
        <TableTop hand={T.handNo} extra={<Pill tone="red" icon={<WifiOff size={12} strokeWidth={2.4} />}>Mất mạng</Pill>} />
        <Stage d={d}>
          {table}
          <div className="k-veil" />
          <Glass strong className="k-rc-card">
            <Reconnecting d={d} />
          </Glass>
        </Stage>
        <aside className="k-col k-glass">
          <Eyebrow tone="red">Biến thể khi lỗi máy chủ</Eyebrow>
          <Paused d={d} />
          <div className="k-col-foot">
            <Btn tone="glass" size="lg" block>
              Về sảnh
            </Btn>
          </div>
        </aside>
      </Root>
    );
  return (
    <Root device={d} bg="table">
      <Stage d={d}>
        {table}
        <div className="k-veil" />
        <MTableTop hand={T.handNo} right={false} />
        <Glass strong className="k-rc-card k-rc-card-m">
          <Reconnecting d={d} />
        </Glass>
      </Stage>
      <aside className="k-mcol k-glass">
        <Eyebrow tone="red">Khi lỗi máy chủ</Eyebrow>
        <Paused d={d} />
        <Btn tone="glass" block className="k-mcol-foot">
          Về sảnh
        </Btn>
      </aside>
    </Root>
  );
}

/* ============================================================ owner-panel */

function PlayerRows({ d }: { d: Device }) {
  const mob = d === "mobile";
  return (
    <div className="k-own-list">
      {OWNER.players.map((p) => {
        const sel = p.name === "An";
        return (
          <div key={p.name} className={`k-own-p ${sel ? "sel" : ""}`}>
            <div className="k-own-row">
              <Avatar name={p.name} size={mob ? 28 : 36} ring={sel ? "gold" : "steel"} />
              <span className="k-own-n">
                <b>
                  {p.name}
                  {p.name === "Lym" && <em>bạn</em>}
                </b>
                <small>
                  Ghế {p.seat} · {p.note ?? (p.inHand ? "đang trong ván" : "chờ ván sau")}
                </small>
              </span>
              <b className="k-own-stack k-num">{fmt(p.stack)}</b>
              {!mob && (
                <span className="k-own-btns">
                  <span className="k-mini-b">
                    <Minus size={15} strokeWidth={2.4} />
                  </span>
                  <span className="k-mini-b">
                    <Plus size={15} strokeWidth={2.4} />
                  </span>
                  {p.name !== "Lym" && (
                    <span className="k-mini-b red">
                      <UserX size={15} strokeWidth={2.2} />
                    </span>
                  )}
                </span>
              )}
            </div>
            {sel && (
              <div className="k-own-grant">
                <Seg items={["Cấp thêm", "Trừ bớt"]} active={0} small />
                <span className="k-own-amt">
                  <Chip size={mob ? 14 : 16} />
                  <b className="k-num">500</b>
                </span>
                <Btn tone="gold" size="sm" icon={<Check size={15} strokeWidth={2.6} />}>
                  {mob ? "Cấp" : "Cấp cho An"}
                </Btn>
                <small className="k-own-note">
                  {mob ? "Đang trong ván: cộng khi ván #37 xong." : "An đang trong ván: chip được cộng ngay khi ván #37 xong."}
                </small>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OwnerSettings({ d }: { d: Device }) {
  const mob = d === "mobile";
  return (
    <div className="k-own-set">
      <div className="k-own-blk">
        <span className="k-own-lbl">Blind</span>
        <span className="k-own-blind">
          <span className="old k-num">10/20</span>
          <i>→</i>
          <span className="new k-num">20/40</span>
        </span>
        <Pill tone="gold" icon={<Hourglass size={11} strokeWidth={2.4} />}>
          {mob ? "từ ván sau" : OWNER.pending}
        </Pill>
      </div>
      <div className="k-own-blk">
        <span className="k-own-lbl">Giây suy nghĩ</span>
        <span className="k-stepper">
          <span className="k-mini-b">
            <Minus size={14} strokeWidth={2.4} />
          </span>
          <b className="k-num">20</b>
          <span className="k-mini-b">
            <Plus size={14} strokeWidth={2.4} />
          </span>
        </span>
        {!mob && <small>Áp dụng từ lượt tiếp theo</small>}
      </div>
      <div className="k-own-blk k-own-link">
        <span className="k-own-lbl">Link mời</span>
        <span className="k-linkbox">
          <span>{OWNER.invite.replace("https://", "")}</span>
          <Copy size={14} strokeWidth={2.2} />
        </span>
        <span className="k-own-linkrow">
          <Btn tone="glass" size="sm" icon={<RefreshCw size={14} strokeWidth={2.4} />}>
            Đổi link
          </Btn>
          <small>Link cũ sẽ hết hiệu lực ngay.</small>
        </span>
      </div>
      <div className="k-own-close">
        <span className="k-own-close-t">
          <b>Đóng phòng</b>
          <small>Chốt bảng lời/lỗ cho mọi người, không chơi tiếp được.</small>
        </span>
        <Btn tone="danger" size="sm" icon={<DoorClosed size={14} strokeWidth={2.4} />}>
          Đóng
        </Btn>
      </div>
    </div>
  );
}

function OwnerPanel({ device: d }: { device: Device }) {
  const table = <Table d={d} seats={T.seats} board={T.board} pot={T.pot} hero={<HeroCards cards={ME_CARDS} d={d} />} className="k-table-hint" />;
  if (d === "desktop")
    return (
      <Root device={d} bg="table">
        <TableTop hand={T.handNo} />
        <Stage d={d}>{table}</Stage>
        <aside className="k-sheet k-glass k-glass-strong">
          <header className="k-sheet-h">
            <span className="k-sheet-ht">
              <Eyebrow>Chủ phòng</Eyebrow>
              <b className="k-h2">Bảng chủ phòng</b>
              <small>{OWNER.room} · 7 người đang ngồi · bạn là chủ phòng</small>
            </span>
            <IconBtn icon={<X size={18} strokeWidth={2.2} />} />
          </header>
          <div className="k-sheet-cols">
            <section className="k-sec">
              <span className="k-sec-h">
                <b className="k-h3">Người chơi & chip</b>
                <small className="k-col-note">bấm + / − để cấp hoặc trừ</small>
              </span>
              <PlayerRows d={d} />
            </section>
            <section className="k-sec">
              <b className="k-h3">Luật bàn</b>
              <OwnerSettings d={d} />
            </section>
          </div>
        </aside>
      </Root>
    );
  return (
    <Root device={d} bg="table">
      <Stage d={d}>{table}</Stage>
      <aside className="k-msheet k-glass k-glass-strong">
        <section className="k-msheet-l">
          <header className="k-msheet-h">
            <IconBtn icon={<X size={18} strokeWidth={2.2} />} />
            <span className="k-msheet-ht">
              <b>Bảng chủ phòng</b>
              <small>{OWNER.room} · bấm để cấp / trừ</small>
            </span>
          </header>
          <PlayerRows d={d} />
        </section>
        <section className="k-msheet-r">
          <OwnerSettings d={d} />
        </section>
      </aside>
    </Root>
  );
}

/* =================================================================== chat */

function Bubble({ m, mob }: { m: (typeof CHAT)[number]; mob?: boolean }) {
  const mine = m.name === "Lym";
  const watching = m.text.startsWith("(đang xem)");
  const text = watching ? m.text.replace("(đang xem)", "").trim() : m.text;
  return (
    <div className={`k-msg ${mine ? "mine" : ""}`}>
      {!mine && <Avatar name={m.name} size={mob ? 24 : 30} ring="none" />}
      <span className="k-msg-b">
        {!mine && (
          <small>
            {m.name}
            {watching && <em>đang xem</em>}
            <i className="k-num">{m.at}</i>
          </small>
        )}
        <span className="k-msg-t">{text}</span>
      </span>
    </div>
  );
}

function ChatPane({ d }: { d: Device }) {
  const mob = d === "mobile";
  return (
    <>
      <div className="k-chat-h">
        <Seg
          items={[
            <>
              Chat <b className="k-num">5</b>
            </>,
            <>
              Đang xem <b className="k-num">3</b>
            </>,
          ]}
          active={0}
          small={mob}
        />
        {mob ? <IconBtn icon={<X size={18} strokeWidth={2.2} />} /> : <IconBtn icon={<Eye size={18} strokeWidth={2.1} />} badge={3} className="k-ibtn-quiet" />}
      </div>
      {!mob && (
        <div className="k-viewers">
          <span className="k-sec-h">
            <Eyebrow tone="mute">Người đang xem</Eyebrow>
            <small className="k-col-note">không thấy bài úp</small>
          </span>
          <div className="k-viewers-l">
            {SD.spectators.map((n, i) => (
              <span key={n} className="k-viewer">
                <Avatar name={n} size={30} ring="none" />
                <span>
                  <b>{n}</b>
                  <small>{["từ 20:58", "từ 21:01", "từ 21:05"][i]}</small>
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="k-chat-list">
        <div className="k-sys">
          <Crown size={13} strokeWidth={2.4} /> Ván #38 · Chi thắng <b className="k-num">1.840</b>
        </div>
        {CHAT.map((m, i) => (
          <Bubble key={i} m={m} mob={mob} />
        ))}
      </div>
      <div className="k-emoji">
        {QUICK_EMOJI.map((e) => (
          <span key={e}>{e}</span>
        ))}
        {!mob && <small>Gửi nhanh</small>}
      </div>
      <div className="k-composer">
        <Smile size={18} strokeWidth={2.1} />
        <span>
          ván này ai all-in đi 😆
          <i className="k-caret" />
        </span>
        <span className="k-send">
          <Send size={16} strokeWidth={2.4} />
        </span>
      </div>
    </>
  );
}

function Chat({ device: d }: { device: Device }) {
  const table = (
    <Table
      d={d}
      seats={SD.seats}
      board={SD.board}
      pot={SD.pot}
      potLabel="Chi ăn"
      opts={{ 4: { say: "flush rồi nha 🎉" }, 2: { say: "ai bluff kìa 😏" } }}
      hero={<HeroCards cards={SD.seats[0].cards!} d={d} />}
    />
  );
  if (d === "desktop")
    return (
      <Root device={d} bg="table">
        <TableTop hand={SD.handNo} chatBadge={0} />
        <Stage d={d}>{table}</Stage>
        <aside className="k-col k-glass k-col-chat">
          <ChatPane d={d} />
        </aside>
      </Root>
    );
  return (
    <Root device={d} bg="table">
      <Stage d={d}>
        {table}
        <MTableTop hand={SD.handNo} right={false} />
      </Stage>
      <i className="k-drawer-shade" />
      <aside className="k-drawer k-glass k-glass-strong">
        <ChatPane d={d} />
      </aside>
    </Root>
  );
}

/* ================================================================ router */

export function renderPlay(screen: string, device: Device): ReactNode {
  switch (screen) {
    case "table-turn":
      return <TableTurn device={device} />;
    case "table-showdown":
      return <TableShowdown device={device} />;
    case "seven-deuce":
      return <SevenDeuce device={device} />;
    case "reconnect":
      return <Reconnect device={device} />;
    case "owner-panel":
      return <OwnerPanel device={device} />;
    case "chat":
      return <Chat device={device} />;
    default:
      return null;
  }
}

