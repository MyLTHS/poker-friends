// Kẹo Đêm (d3) — table screens: turn, showdown, 7-2, reconnect, owner panel, chat.
import type { ReactNode } from "react";
import {
  Check,
  CirclePause,
  Copy,
  Crown,
  Eye,
  Minus,
  Moon,
  Play,
  Plus,
  RefreshCw,
  ServerCrash,
  Timer,
  UserX,
  WifiOff,
  X,
} from "lucide-react";

import { CHAT, OWNER, REPLAY, SEVEN_DEUCE, TABLE_SHOWDOWN, TABLE_TURN, type Card, type Seat } from "../../../shared/data";
import type { Device } from "../../../shared/screens";
import { fmt } from "../lib";
import {
  Board,
  ChatLog,
  ChatMsg,
  Composer,
  DStage,
  DTopBar,
  DeskTable,
  EmojiRow,
  MFelt,
  MOpponents,
  MTableHead,
  Pot,
  RailTabs,
  RoomChips,
  SysMsg,
} from "../table";
import {
  Avatar,
  Btn,
  Confetti,
  HomeBar,
  IconBtn,
  Money,
  PCard,
  Pill,
  Root,
  Seg,
  StatusBar,
  Sticker,
  TimerRing,
  Token,
  type CardSize,
} from "../ui";

const T = TABLE_TURN;
const ME = T.seats[0];
const RAISE = 150;
const raisePct = (RAISE - T.minRaise) / (T.maxRaise - T.minRaise);

/* ================================================================ shared */

function HeroCards({ cards, size = "xl", dim }: { cards: Card[]; size?: CardSize; dim?: boolean }) {
  return (
    <div className={`herocards herocards-${size} ${dim ? "herocards-dim" : ""}`}>
      {cards.map((c, i) => (
        <PCard key={i} c={c} size={size} tilt={i ? 7 : -6} />
      ))}
    </div>
  );
}

function Presets({ mobile }: { mobile?: boolean }) {
  return (
    <div className={mobile ? "presets presets-m" : "presets"}>
      {T.presets.map((p, i) => (
        <span key={p.label} className={`preset ${i === 0 ? "on" : ""} ${p.label === "All-in" ? "preset-allin" : ""}`}>
          <b>{p.label}</b>
          <em className="num">{fmt(p.amount)}</em>
        </span>
      ))}
    </div>
  );
}

function Slider({ mobile }: { mobile?: boolean }) {
  return (
    <div className={`slider ${mobile ? "slider-m" : ""}`}>
      <span className="sl-step">
        <Minus size={16} strokeWidth={3.2} />
      </span>
      <span className="sl-track">
        <i style={{ width: `${raisePct * 100}%` }} />
        <b style={{ left: `${raisePct * 100}%` }}>
          <em className="num">{RAISE}</em>
        </b>
        <small className="sl-min num">{fmt(T.minRaise)}</small>
        <small className="sl-max num">{fmt(T.maxRaise)}</small>
      </span>
      <span className="sl-step">
        <Plus size={16} strokeWidth={3.2} />
      </span>
    </div>
  );
}

function stateText(s: Seat) {
  switch (s.state) {
    case "turn":
      return `tới lượt · còn ${s.timer?.left ?? 0}s`;
    case "folded":
      return "đã bỏ bài";
    case "sitting-out":
      return "đang nghỉ";
    case "disconnected":
      return s.lastAction?.toLowerCase() ?? "mất kết nối";
    case "all-in":
      return s.lastAction ?? "all-in";
    case "winner":
      return "thắng ván này";
    default:
      return s.lastAction ?? "đang chờ";
  }
}

function PlayerRows({ seats }: { seats: Seat[] }) {
  return (
    <div className="plist">
      {seats.map((s) =>
        s.state === "empty" ? (
          <div key={s.seat} className="prow prow-empty">
            <span className="prow-n">{s.seat}</span>
            <span className="prow-dash">
              <Plus size={16} strokeWidth={3} />
            </span>
            <span className="prow-t">
              <b>Ghế trống</b>
              <span>mời bạn vào ngồi</span>
            </span>
          </div>
        ) : (
          <div key={s.seat} className={`prow st-${s.state} ${s.isMe ? "prow-me" : ""}`}>
            <span className="prow-n">{s.seat}</span>
            <Avatar name={s.name!} size={34} dim={s.state === "folded" || s.state === "sitting-out"} />
            <span className="prow-t">
              <b>
                {s.name}
                {s.isMe && <em>bạn</em>}
                {s.isButton && <span className="dealer dealer-inline">D</span>}
              </b>
              <span>{stateText(s)}</span>
            </span>
            <b className="prow-stack num">{fmt(s.stack ?? 0)}</b>
          </div>
        ),
      )}
    </div>
  );
}

function SpecBar({ className = "" }: { className?: string }) {
  return (
    <div className={`specbar ${className}`}>
      <Eye size={16} strokeWidth={3} />
      <span className="specbar-avs">
        {TABLE_SHOWDOWN.spectators.map((n) => (
          <Avatar key={n} name={n} size={24} />
        ))}
      </span>
      <span>
        <b>{TABLE_SHOWDOWN.spectators.join(", ")}</b> đang xem
      </span>
    </div>
  );
}

/* ============================================================ table-turn */

function TurnDock() {
  return (
    <>
      <div className="dock-hero">
        <HeroCards cards={ME.cards!} />
        <div className="dock-hero-txt">
          <span className="dock-lbl">Bài của bạn</span>
          <Sticker tone="sky" tilt={-2}>
            Chờ sảnh · cần một lá 10
          </Sticker>
          <span className="dock-timer">
            <Timer size={16} strokeWidth={3} />
            <b className="num">14</b> giây
            <i>
              <u style={{ width: "70%" }} />
            </i>
          </span>
        </div>
      </div>
      <div className="dock-act">
        <div className="dock-row1">
          <Presets />
          <Slider />
        </div>
        <div className="dock-row2">
          <Btn tone="ghost" size="xl" className="act-fold">
            Bỏ bài
          </Btn>
          <Btn tone="sky" size="xl" className="act-call">
            Theo <span className="num">{T.toCall}</span>
          </Btn>
          <Btn tone="lime" size="xl" className="act-raise">
            Tố lên <span className="num">{RAISE}</span>
          </Btn>
        </div>
      </div>
    </>
  );
}

function TurnCenter() {
  return (
    <>
      <Pot n={T.pot} />
      <Board cards={T.board} />
    </>
  );
}

function DeskTurn() {
  return (
    <Root device="desktop" className="bg-party">
      <DeskTable
        top={<DTopBar room={T.room} sub={<RoomChips hand={T.handNo} />} />}
        stage={<DStage seats={T.seats} center={<TurnCenter />} />}
        dock={<TurnDock />}
        rail={
          <>
            <RailTabs active={1} />
            <PlayerRows seats={T.seats} />
            <div className="rail-mini">
              <span className="rail-lbl">Chat mới nhất</span>
              <ChatMsg name={CHAT[3].name} text={CHAT[3].text} at={CHAT[3].at} />
              <ChatMsg name={CHAT[4].name} text={CHAT[4].text} at={CHAT[4].at} />
              <Composer />
            </div>
          </>
        }
      />
    </Root>
  );
}

function MHero({ cards, children, dim }: { cards: Card[]; children: ReactNode; dim?: boolean }) {
  return (
    <div className="mhero">
      <HeroCards cards={cards} size="lg" dim={dim} />
      <div className="mhero-info">{children}</div>
    </div>
  );
}

function MeLine({ ring, stack = ME.stack!, note }: { ring?: boolean; stack?: number; note?: ReactNode }) {
  return (
    <div className="meline">
      <Avatar name="Lym" size={46} ring={ring ? { pct: 14 / 20 } : undefined} badge={ring ? <span className="av-time num">14</span> : undefined} />
      <span className="meline-t">
        <b>
          Lym <em>bạn</em>
        </b>
        <span className="meline-stack">
          <Token size={13} />
          <b className="num">{fmt(stack)}</b>
        </span>
      </span>
      {note}
    </div>
  );
}

function MobTurn() {
  return (
    <Root device="mobile" className="bg-party mtable">
      <StatusBar />
      <MTableHead hand={T.handNo} />
      <MOpponents seats={T.seats} />
      <MFelt>
        <Pot n={T.pot} />
        <Board cards={T.board} size="md" />
      </MFelt>
      <MHero cards={ME.cards!}>
        <MeLine ring />
        <div className="mhero-tags">
          <Sticker tone="lime" tilt={-3}>
            Lượt của bạn
          </Sticker>
          <Sticker tone="sky" tilt={2}>
            Chờ sảnh
          </Sticker>
        </div>
      </MHero>
      <div className="msheet msheet-act">
        <Presets mobile />
        <Slider mobile />
        <div className="mbtns">
          <Btn tone="ghost" size="xl" className="m-fold">
            Bỏ
          </Btn>
          <Btn tone="sky" size="xl" className="m-call">
            Theo <span className="num">{T.toCall}</span>
          </Btn>
          <Btn tone="lime" size="xl" className="m-raise">
            Tố <span className="num">{RAISE}</span>
          </Btn>
        </div>
        <HomeBar />
      </div>
    </Root>
  );
}

/* ======================================================== table-showdown */

const SD = TABLE_SHOWDOWN;
const SD_ME = SD.seats[0];
const SD_HAND = [0, 1, 2, 4]; // the four hearts on the board that make Chi's flush

function ShowCenter({ size = "lg" as CardSize }) {
  return (
    <>
      <span className="winbanner">
        <Crown size={size === "lg" ? 20 : 16} strokeWidth={3} />
        {SD.winner.name} ăn <b className="num">{fmt(SD.winner.amount)}</b>
      </span>
      <Board cards={SD.board} size={size} hl={SD_HAND} />
    </>
  );
}

function DeskShowdown() {
  const chi = SD.seats.find((s) => s.name === "Chi")!;
  return (
    <Root device="desktop" className="bg-party">
      <DeskTable
        top={<DTopBar room={SD.room} sub={<RoomChips hand={SD.handNo} extra={<Pill tone="lime">Showdown</Pill>} />} />}
        stage={
          <DStage
            seats={SD.seats}
            center={<ShowCenter />}
            faceUp={[4]}
            stickers={{
              4: (
                <Sticker tone="sun" tilt={-5} className="dseat-stk dseat-stk-big">
                  🏆 Thắng +{fmt(SD.winner.amount)}
                </Sticker>
              ),
              1: (
                <Sticker tone="pink" tilt={-3} className="dseat-stk">
                  −400
                </Sticker>
              ),
            }}
            extras={{
              4: <span className="dseat-hand dseat-hand-win">{chi.hand}</span>,
              1: <span className="dseat-hand">{SD_ME.hand}</span>,
            }}
            className="stage-showdown"
          >
            <Confetti seed={38} n={22} className="win-confetti" />
            <SpecBar className="specbar-stage" />
          </DStage>
        }
        dock={
          <>
            <div className="dock-hero">
              <HeroCards cards={SD_ME.cards!} />
              <div className="dock-hero-txt">
                <span className="dock-lbl">Bài của bạn</span>
                <Sticker tone="white" tilt={-2}>
                  {SD_ME.hand}
                </Sticker>
                <span className="dock-result">
                  Ván này <Money n={-400} />
                </span>
              </div>
            </div>
            <div className="dock-next">
              <div className="nextcount">
                <span className="nextcount-ring">
                  <TimerRing size={70} pct={0.8} tone="sky" />
                  <b className="num">4</b>
                </span>
                <span>
                  <b>Ván #39 sắp chia</b>
                  <small>Chip của Chi đã được cộng. Bạn còn {fmt(SD_ME.stack!)}.</small>
                </span>
              </div>
              <div className="dock-next-r">
                <EmojiRow />
                <div className="dock-row2">
                  <Btn tone="ghost" size="lg" icon={<Moon size={18} strokeWidth={3} />}>
                    Nghỉ ván sau
                  </Btn>
                  <Btn tone="sky" size="lg" icon={<Play size={18} strokeWidth={3} />}>
                    Xem lại ván
                  </Btn>
                </div>
              </div>
            </div>
          </>
        }
        rail={
          <>
            <RailTabs active={0} counts={[5, 7, 3]} />
            <SpecStrip />
            <div className="chatlog">
              <SysMsg tone="pink">An all-in 920 · Lym theo</SysMsg>
              <ChatLog upto={2} />
              <SysMsg>🏆 Chi thắng 1.840 · {chi.hand}</SysMsg>
              {CHAT.slice(2).map((m) => (
                <ChatMsg key={m.text} name={m.name} text={m.text} at={m.at} mine={m.name === "Lym"} />
              ))}
            </div>
            <EmojiRow />
            <Composer />
          </>
        }
      />
    </Root>
  );
}

function SpecStrip({ big }: { big?: boolean }) {
  return (
    <div className={`specstrip ${big ? "specstrip-big" : ""}`}>
      <span className="specstrip-l">
        <Eye size={15} strokeWidth={3} /> Đang xem
      </span>
      {SD.spectators.map((n) => (
        <span key={n} className="specstrip-p">
          <Avatar name={n} size={big ? 30 : 24} />
          {n}
        </span>
      ))}
    </div>
  );
}

function MobShowdown() {
  return (
    <Root device="mobile" className="bg-party mtable">
      <StatusBar />
      <MTableHead hand={SD.handNo} />
      <MOpponents
        seats={SD.seats}
        faceUp={[4]}
        stickers={{
          4: (
            <Sticker tone="sun" tilt={-4}>
              🏆 +{fmt(SD.winner.amount)}
            </Sticker>
          ),
        }}
        extras={{ 4: <span className="mseat-crown">👑</span> }}
      />
      <MFelt className="mfelt-show">
        <ShowCenter size="md" />
      </MFelt>
      <MHero cards={SD_ME.cards!}>
        <MeLine />
        <div className="mhero-tags">
          <Sticker tone="white" tilt={-3}>
            {SD_ME.hand}
          </Sticker>
          <Sticker tone="pink" tilt={2}>
            −400
          </Sticker>
        </div>
      </MHero>
      <div className="msheet msheet-next">
        <SpecBar />
        <div className="mnext">
          <span className="nextcount-ring">
            <TimerRing size={54} pct={0.8} tone="sky" />
            <b className="num">4</b>
          </span>
          <span>
            <b>Ván #39 sắp chia</b>
            <small>Chi thắng với {SD.seats[3].hand}</small>
          </span>
        </div>
        <div className="mbtns">
          <Btn tone="ghost" size="lg" icon={<Moon size={18} strokeWidth={3} />}>
            Nghỉ ván sau
          </Btn>
          <Btn tone="sky" size="lg" icon={<Play size={18} strokeWidth={3} />}>
            Xem lại
          </Btn>
        </div>
        <HomeBar />
      </div>
    </Root>
  );
}

/* ============================================================ seven-deuce */

const S7 = SEVEN_DEUCE;
const S7_SEATS: Seat[] = [
  { seat: 1, name: "Lym", stack: 1410, cards: REPLAY.players[0].cards, state: "folded", isMe: true },
  { seat: 2, name: "An", stack: 870, state: "folded" },
  { seat: 3, name: "Bình", stack: 1500, cards: S7.cards, state: "winner" },
  { seat: 4, name: "Chi", stack: 2160, state: "folded", isButton: true },
  { seat: 5, state: "empty" },
  { seat: 6, name: "Dũng", stack: 590, state: "sitting-out" },
  { seat: 7, state: "empty" },
  { seat: 8, name: "Hà", stack: 0, state: "folded" },
  { seat: 9, name: "Khoa", stack: 250, state: "folded" },
];

function payStickers(mobile?: boolean) {
  const out: Record<number, ReactNode> = {};
  for (const s of S7_SEATS) {
    if (!s.name) continue;
    const p = S7.payments.find((x) => x.name === s.name);
    if (p)
      out[s.seat] = (
        <Sticker tone="pink" tilt={s.seat % 2 ? -6 : 5} className={mobile ? "" : "dseat-stk dseat-stk-pay"}>
          <span className="fly-tok" />−{p.amount}
          {p.note && !mobile && <small>{p.note}</small>}
        </Sticker>
      );
    else if (s.name === "Hà")
      out[s.seat] = (
        <Sticker tone="mute" tilt={-3} className={mobile ? "" : "dseat-stk"}>
          {mobile ? "0 chip" : "Hết chip · không trả"}
        </Sticker>
      );
    else if (s.name === "Bình")
      out[s.seat] = (
        <Sticker tone="lime" tilt={-5} className={mobile ? "" : "dseat-stk dseat-stk-big"}>
          {mobile ? "" : "👑 "}+{S7.total}
        </Sticker>
      );
  }
  return out;
}

function SevenCard({ mobile }: { mobile?: boolean }) {
  return (
    <div className={`s7card ${mobile ? "s7card-m" : ""}`}>
      <span className="s7-title">
        <b>7-2</b> BLUFF!
      </span>
      <div className="s7-body">
        <div className="s7-cards">
          <PCard c={S7.cards[0]} size={mobile ? "lg" : "lg"} tilt={-9} />
          <PCard c={S7.cards[1]} size={mobile ? "lg" : "lg"} tilt={8} />
          <Sticker tone="sky" tilt={-4} className="s7-auto">
            Tự lật cho cả bàn
          </Sticker>
        </div>
        <div className="s7-txt">
          <span className="s7-who">
            <Avatar name="Bình" size={mobile ? 30 : 34} />
            <b>{S7.winner}</b> ăn pot {fmt(S7.pot)} khi mọi người bỏ bài
          </span>
          <span className="s7-total">
            <b className="num">+{S7.total}</b>
            <small>thưởng 7-2</small>
          </span>
          <span className="s7-each">
            {S7.payments.length} người × <b className="num">{S7.bonus}</b>
          </span>
        </div>
      </div>
    </div>
  );
}

function PayLedger() {
  return (
    <div className="ledger">
      <div className="ledger-head">
        <Avatar name="Bình" size={52} />
        <span>
          <small>Thưởng 7-2 · Ván #37</small>
          <b>Bình nhận</b>
        </span>
        <b className="ledger-total num">+{S7.total}</b>
      </div>
      <div className="ledger-rows">
        {S7.payments.map((p) => (
          <div key={p.name} className="ledger-row">
            <Avatar name={p.name} size={30} />
            <span className="ledger-name">
              <b>
                {p.name}
                {p.name === "Lym" && <em>bạn</em>}
              </b>
              {p.note && <small>{p.note}</small>}
            </span>
            <b className="ledger-amt num">−{p.amount}</b>
          </div>
        ))}
        <div className="ledger-row ledger-skip">
          <Avatar name="Hà" size={30} dim />
          <span className="ledger-name">
            <b>Hà</b>
            <small>hết chip nên không trả</small>
          </span>
          <b className="ledger-amt num">0</b>
        </div>
      </div>
      <div className="ledger-sum">
        <span>Tổng</span>
        <b className="num">+{S7.total}</b>
      </div>
      <p className="ledger-rule">
        Luật 7-2 của phòng: ăn pot bằng 7 và 2 khi mọi người bỏ bài thì bài tự lật, mỗi người đang ngồi bàn (kể cả đang nghỉ)
        trả {S7.bonus}.
      </p>
    </div>
  );
}

function DeskSeven() {
  return (
    <Root device="desktop" className="bg-party">
      <DeskTable
        top={<DTopBar room={T.room} sub={<RoomChips hand={37} extra={<Pill tone="sun">🎉 Thưởng 7-2</Pill>} />} />}
        stage={
          <DStage seats={S7_SEATS} center={null} faceUp={[3]} stickers={payStickers()} className="stage-seven">
            <Confetti seed={72} n={64} className="s7-confetti" />
            <div className="s7-board">
              <Pot n={S7.pot} label="Bình ăn" />
              <Board cards={REPLAY.board} size="sm" />
            </div>
            <div className="s7-burst" />
            <SevenCard />
            <span className="floaty f1">😎</span>
            <span className="floaty f2">🔥</span>
            <span className="floaty f3">👏</span>
            <Sticker tone="sun" tilt={8} className="floaty-stk fs1">
              GG!
            </Sticker>
          </DStage>
        }
        dock={
          <>
            <div className="dock-hero">
              <HeroCards cards={REPLAY.players[0].cards} dim />
              <div className="dock-hero-txt">
                <span className="dock-lbl">Bài của bạn</span>
                <Sticker tone="mute" tilt={-2}>
                  Đã bỏ bài
                </Sticker>
                <span className="dock-result">
                  Trả thưởng 7-2 <Money n={-50} />
                </span>
              </div>
            </div>
            <div className="dock-next">
              <div className="react-big">
                <span className="react-lbl">Thả cảm xúc cho Bình</span>
                <EmojiRow big active={3} />
              </div>
              <div className="dock-next-r dock-next-col">
                <span className="next-mini">
                  Ván #38 chia sau <b className="num">6</b> giây
                </span>
                <Btn tone="sky" size="lg" icon={<Play size={18} strokeWidth={3} />}>
                  Xem lại ván
                </Btn>
              </div>
            </div>
          </>
        }
        rail={
          <>
            <RailTabs active={0} counts={[6, 7, 3]} />
            <PayLedger />
          </>
        }
      />
    </Root>
  );
}

function MobSeven() {
  const st = payStickers(true);
  return (
    <Root device="mobile" className="bg-party mtable">
      <StatusBar />
      <MTableHead hand={37} />
      <MOpponents
        seats={S7_SEATS}
        faceUp={[3]}
        stickers={st}
        extras={{ 3: <span className="mseat-crown">👑</span> }}
      />
      <MFelt>
        <Pot n={S7.pot} label="Bình ăn" />
        <Board cards={REPLAY.board} size="md" />
      </MFelt>
      <Confetti seed={27} n={36} className="m7-confetti" />
      <div className="msheet msheet-seven">
        <SevenCard mobile />
        <div className="m7-pay">
          {S7.payments.map((p) => (
            <span key={p.name} className={`m7-chip ${p.note ? "m7-chip-note" : ""}`}>
              <Avatar name={p.name} size={26} />
              <b>{p.name === "Lym" ? "Bạn" : p.name}</b>
              <em className="num">−{p.amount}</em>
              {p.note && <small>{p.note}</small>}
            </span>
          ))}
        </div>
        <div className="m7-actions">
          <EmojiRow active={3} />
          <Btn tone="lime" size="lg" className="m7-ok">
            Tiếp tục
          </Btn>
        </div>
        <HomeBar />
      </div>
      <span className="floaty mf1">🔥</span>
      <span className="floaty mf2">😎</span>
    </Root>
  );
}

/* ============================================================== reconnect */

function ReconnectCard({ mobile }: { mobile?: boolean }) {
  return (
    <div className={`rc ${mobile ? "rc-m" : ""}`}>
      <Sticker tone="orange" tilt={-4} className="variant-tag">
        A · Mạng của bạn rớt
      </Sticker>
      <div className="rc-top">
        <span className="rc-icon">
          <svg className="rc-spin" width="92" height="92" viewBox="0 0 92 92" aria-hidden>
            <circle cx="46" cy="46" r="40" className="rc-spin-trk" />
            <path d="M46 6 A40 40 0 0 1 86 46" className="rc-spin-arc" />
          </svg>
          <WifiOff size={34} strokeWidth={2.8} />
        </span>
        <span>
          <b className="rc-title">Đang kết nối lại…</b>
          <span className="rc-sub">Ghế và chip của bạn vẫn giữ nguyên. Lần thử 2 · tự thử lại sau 3 giây.</span>
        </span>
      </div>
      <div className="rc-timer">
        <span className="nextcount-ring">
          <TimerRing size={58} pct={9 / 20} tone="sun" />
          <b className="num">9</b>
        </span>
        <span>
          <b>Đồng hồ của bạn vẫn chạy</b>
          <small>Hết giờ sẽ tự check, không check được thì tự bỏ bài.</small>
        </span>
      </div>
      <div className="rc-btns">
        <Btn tone="lime" size="lg" icon={<RefreshCw size={18} strokeWidth={3} />} block>
          Thử lại ngay
        </Btn>
      </div>
    </div>
  );
}

function PausedCard({ mobile }: { mobile?: boolean }) {
  return (
    <div className={`paused ${mobile ? "paused-m" : ""}`}>
      <Sticker tone="grape" tilt={3} className="variant-tag">
        B · Lỗi máy chủ
      </Sticker>
      <span className="paused-ic">
        <CirclePause size={mobile ? 26 : 34} strokeWidth={2.6} />
      </span>
      <span className="paused-t">
        <b>Bàn tạm dừng</b>
        <span>Máy chủ đang gặp sự cố. Ván #37 được giữ nguyên, đồng hồ cũng dừng, không ai mất chip.</span>
        <span className="paused-status">
          <ServerCrash size={15} strokeWidth={3} /> Đang khôi phục · 0:18
        </span>
      </span>
    </div>
  );
}

function MiniTable() {
  return (
    <div className="minitable">
      <div className="minitable-felt">
        <span className="minitable-pause">
          <CirclePause size={22} strokeWidth={3} /> Tạm dừng
        </span>
      </div>
      {T.seats.map((s, i) => (
        <span key={s.seat} className={`minitable-seat mts-${i + 1}`}>
          {s.name ? <Avatar name={s.name} size={26} dim /> : <i />}
        </span>
      ))}
    </div>
  );
}

function DeskReconnect() {
  return (
    <Root device="desktop" className="bg-party">
      <DeskTable
        className="dtable-dim"
        top={<DTopBar room={T.room} sub={<RoomChips hand={T.handNo} extra={<Pill tone="orange">Mất mạng</Pill>} />} />}
        stage={<DStage seats={T.seats} center={<TurnCenter />} />}
        dock={<TurnDock />}
        rail={
          <div className="variant-rail">
            <span className="variant-lbl">Biến thể khi lỗi máy chủ</span>
            <MiniTable />
            <PausedCard />
            <Btn tone="ghost" size="md" block>
              Về sảnh trong lúc chờ
            </Btn>
          </div>
        }
        overlay={
          <div className="scrim scrim-main">
            <ReconnectCard />
          </div>
        }
      />
    </Root>
  );
}

function MobReconnect() {
  return (
    <Root device="mobile" className="bg-party mtable">
      <StatusBar />
      <MTableHead hand={T.handNo} />
      <MOpponents seats={T.seats} />
      <MFelt>
        <Pot n={T.pot} />
        <Board cards={T.board} size="md" />
      </MFelt>
      <div className="mscrim" />
      <div className="m-variant-b">
        <PausedCard mobile />
      </div>
      <div className="msheet msheet-rc">
        <ReconnectCard mobile />
        <HomeBar />
      </div>
    </Root>
  );
}

/* ============================================================ owner-panel */

function OwnerPlayers({ mobile }: { mobile?: boolean }) {
  return (
    <div className="own-players">
      {OWNER.players.map((p) => {
        const open = p.name === "An";
        return (
          <div key={p.name} className={`own-row ${open ? "own-row-open" : ""}`}>
            <div className="own-row-main">
              <Avatar name={p.name} size={mobile ? 36 : 40} dim={!!p.note} />
              <span className="own-name">
                <b>
                  {p.name}
                  {p.name === "Lym" && <em>bạn</em>}
                </b>
                <small>
                  Ghế {p.seat} · {p.note ?? (p.inHand ? "đang trong ván" : "chờ ván sau")}
                </small>
              </span>
              <span className="own-stack">
                <Token size={14} />
                <b className="num">{fmt(p.stack)}</b>
              </span>
              <span className="own-ctl">
                <span className="mini-btn">
                  <Minus size={15} strokeWidth={3.2} />
                </span>
                <span className="mini-btn mini-btn-lime">
                  <Plus size={15} strokeWidth={3.2} />
                </span>
                {p.name !== "Lym" && (
                  <span className="mini-btn mini-btn-pink">
                    <UserX size={15} strokeWidth={3} />
                  </span>
                )}
              </span>
            </div>
            {open && (
              <div className="own-grant">
                <Seg items={["Cấp thêm", "Trừ bớt"]} active={0} tone="lime" />
                <span className="own-amt">
                  <Token size={16} />
                  <b className="num">500</b>
                  <i className="fld-caret" />
                </span>
                <Btn tone="lime" size="sm" icon={<Check size={16} strokeWidth={3.2} />}>
                  Cấp
                </Btn>
                <small className="own-note">An đang trong ván: chip được cộng ngay khi ván #37 xong.</small>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OwnerSettings({ mobile }: { mobile?: boolean }) {
  return (
    <>
      <div className={`own-grid ${mobile ? "own-grid-m" : ""}`}>
        <div className="own-box">
          <span className="own-lbl">Blind</span>
          <span className="own-blind">
            <span className="own-blind-old num">10/20</span>
            <span className="own-arrow">→</span>
            <span className="own-blind-new num">20/40</span>
          </span>
          <Sticker tone="sun" tilt={-2}>
            ⏳ {mobile ? "từ ván sau" : OWNER.pending}
          </Sticker>
        </div>
        <div className="own-box">
          <span className="own-lbl">Giây suy nghĩ</span>
          <Seg items={["15", "20", "30", "45"]} active={1} tone="sky" className="seg-num" />
          <small className="own-help">Áp dụng từ lượt tiếp theo</small>
        </div>
      </div>
      <div className="own-box own-link">
        <span className="own-lbl">Link mời</span>
        <span className="own-url">
          <span>{OWNER.invite.replace("https://", "")}</span>
          <span className="mini-btn mini-btn-sky">
            <Copy size={15} strokeWidth={3} />
          </span>
        </span>
        <span className="own-link-row">
          <Btn tone="ghost" size="sm" icon={<RefreshCw size={15} strokeWidth={3} />}>
            Đổi link mới
          </Btn>
          <small>Link cũ sẽ hết hiệu lực ngay.</small>
        </span>
      </div>
      <div className="own-danger">
        <span>
          <b>Đóng phòng</b>
          <small>Chốt bảng lời/lỗ cho mọi người, không chơi tiếp được.</small>
        </span>
        <Btn tone="pink" size="md" icon={<X size={17} strokeWidth={3.2} />}>
          Đóng phòng
        </Btn>
      </div>
    </>
  );
}

function DeskOwner() {
  return (
    <Root device="desktop" className="bg-party">
      <DeskTable
        className="dtable-dim"
        top={<DTopBar room={T.room} sub={<RoomChips hand={T.handNo} />} />}
        stage={<DStage seats={T.seats} center={<TurnCenter />} />}
        dock={<TurnDock />}
        rail={<RailTabs active={1} />}
        overlay={
          <>
            <div className="scrim scrim-left" />
            <aside className="drawer">
              <div className="drawer-head">
                <Sticker tone="sun" tilt={-4}>
                  <Crown size={15} strokeWidth={3} /> Chủ phòng
                </Sticker>
                <b>{OWNER.room}</b>
                <IconBtn size={42}>
                  <X size={20} strokeWidth={3} />
                </IconBtn>
              </div>
              <div className="drawer-sec">
                <div className="drawer-sec-h">
                  <b>Người chơi & chip</b>
                  <small>4 người có chip · bấm + / − để cấp hoặc trừ</small>
                </div>
                <OwnerPlayers />
              </div>
              <OwnerSettings />
            </aside>
          </>
        }
      />
    </Root>
  );
}

function MobOwner() {
  return (
    <Root device="mobile" className="bg-party mtable">
      <StatusBar />
      <MTableHead hand={T.handNo} />
      <MOpponents seats={T.seats} />
      <div className="mscrim" />
      <div className="msheet msheet-owner">
        <span className="grab" />
        <div className="own-mhead">
          <Sticker tone="sun" tilt={-4}>
            <Crown size={14} strokeWidth={3} /> Chủ phòng
          </Sticker>
          <b>{OWNER.room}</b>
          <IconBtn size={38}>
            <X size={18} strokeWidth={3} />
          </IconBtn>
        </div>
        <OwnerPlayers mobile />
        <OwnerSettings mobile />
        <HomeBar />
      </div>
    </Root>
  );
}

/* =================================================================== chat */

const TRAY = ["😀", "😂", "🤣", "😅", "😎", "🤔", "😱", "😭", "😤", "🥳", "🙏", "👏", "👍", "👎", "🔥", "💀", "🤡", "🍀", "💸", "🃏", "♠️", "❤️", "🎉", "🍿"];

function ChatRail() {
  return (
    <>
      <RailTabs active={0} counts={[5, 7, 3]} />
      <SpecStrip big />
      <div className="chatlog chatlog-full">
        <SysMsg>🏆 Ván #38 · Chi thắng 1.840</SysMsg>
        <ChatLog />
        <div className="typing">
          <Avatar name="An" size={22} />
          An đang gõ<span className="typing-dots">
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
      <div className="tray">
        <span className="tray-h">
          <b>Emoji</b>
          <span>Hay dùng</span>
        </span>
        <div className="tray-grid">
          {TRAY.map((e, i) => (
            <span key={e} className={i === 14 ? "on" : ""}>
              {e}
            </span>
          ))}
        </div>
      </div>
      <Composer text="ván này ai all-in đi 😆" focus />
    </>
  );
}

function DeskChat() {
  return (
    <Root device="desktop" className="bg-party">
      <DeskTable
        top={<DTopBar room={T.room} sub={<RoomChips hand={T.handNo} />} />}
        stage={
          <DStage seats={T.seats} center={<TurnCenter />}>
            <span className="react r-an">😂</span>
            <span className="react r-chi">🔥</span>
            <span className="react r-khoa">👍</span>
            <span className="bubble-say b-an">ai bluff kìa 😏</span>
          </DStage>
        }
        dock={<TurnDock />}
        rail={<ChatRail />}
      />
    </Root>
  );
}

function MobChat() {
  return (
    <Root device="mobile" className="bg-party mtable">
      <StatusBar />
      <MTableHead hand={T.handNo} unread={0} />
      <MOpponents seats={T.seats} extras={{ 2: <span className="react mr-an">😂</span>, 4: <span className="react mr-chi">🔥</span> }} />
      <div className="mscrim mscrim-soft" />
      <div className="msheet msheet-chat">
        <span className="grab" />
        <div className="mchat-tabs">
          <Seg items={["💬 Chat 5", "👀 Đang xem 3"]} active={0} tone="sky" />
          <IconBtn size={38}>
            <X size={18} strokeWidth={3} />
          </IconBtn>
        </div>
        <EmojiRow big active={1} />
        <SpecStrip />
        <div className="chatlog chatlog-m">
          <ChatLog />
          <div className="typing">
            <Avatar name="An" size={20} />
            An đang gõ
            <span className="typing-dots">
              <i />
              <i />
              <i />
            </span>
          </div>
        </div>
        <Composer text="gg 🙏" focus />
        <HomeBar />
      </div>
    </Root>
  );
}

/* ================================================================= export */

export function renderPlay(screen: string, device: Device): ReactNode | null {
  const d = device === "desktop";
  switch (screen) {
    case "table-turn":
      return d ? <DeskTurn /> : <MobTurn />;
    case "table-showdown":
      return d ? <DeskShowdown /> : <MobShowdown />;
    case "seven-deuce":
      return d ? <DeskSeven /> : <MobSeven />;
    case "reconnect":
      return d ? <DeskReconnect /> : <MobReconnect />;
    case "owner-panel":
      return d ? <DeskOwner /> : <MobOwner />;
    case "chat":
      return d ? <DeskChat /> : <MobChat />;
    default:
      return null;
  }
}
