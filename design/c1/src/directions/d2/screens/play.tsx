// Table screens: turn, showdown, 7-2, reconnect, owner panel, chat.
import type { ReactNode } from "react";
import {
  Copy,
  Info,
  Lock,
  LogOut,
  MessageCircle,
  Minus,
  Pause,
  Plus,
  RefreshCw,
  Send,
  ServerCrash,
  Smile,
  Sparkles,
  Trophy,
  UserPlus,
  UserX,
  WifiOff,
  X,
} from "lucide-react";

import {
  CHAT,
  HANDS,
  OWNER,
  QUICK_EMOJI,
  SEVEN_DEUCE,
  TABLE_SHOWDOWN,
  TABLE_TURN,
  card,
  type Seat,
} from "../../../shared/data";
import type { Device } from "../../../shared/screens";
import {
  D_SEATS,
  DeskTable,
  IdleBar,
  MobHero,
  MobTable,
  TurnBar,
  TurnSheet,
  type DeskTableProps,
  type MobTableProps,
} from "../table";
import {
  Avatar,
  Badge,
  Btn,
  CardText,
  Check,
  Chip,
  ChipStack,
  Field,
  HomeBar,
  IconBtn,
  OnTable,
  PCard,
  Progress,
  Root,
  SecHead,
  Seg,
  VariantCap,
  fmt,
  type Pt,
} from "../ui";

const ME_TURN = TABLE_TURN.seats.find((s) => s.isMe)!;
const ME_SHOW = TABLE_SHOWDOWN.seats.find((s) => s.isMe)!;
/** Board cards that make Chi's flush (9♥ K♥ 7♥ with A♥ 5♥). */
const SHOW_MARKS = [true, false, true, false, true];

/* =====================================================================
   Right-column panels (desktop)
   ===================================================================== */

function LogRow({ n, a, x, now, auto }: { n: string; a: ReactNode; x?: ReactNode; now?: boolean; auto?: boolean }) {
  return (
    <div className={`log-r${now ? " now" : ""}${auto ? " auto" : ""}`}>
      <span className="log-n">{n}</span>
      <span className="log-a">{a}</span>
      {x && <span className="log-x">{x}</span>}
    </div>
  );
}

function LogPanel() {
  return (
    <div className="log">
      <div className="log-head">
        <span className="serif">Ván #37</span>
        <span className="mono">21:03 · blind 10/20</span>
      </div>
      <div className="log-street">
        <span className="eyebrow">Preflop</span>
        <span className="sec-rule" />
        <span className="mono">pot 180</span>
      </div>
      <LogRow n="Giang" a="bịt nhỏ" x="10" />
      <LogRow n="Hà" a="bịt lớn" x="20" />
      <LogRow n="Khoa" a="theo" x="20" />
      <LogRow n="Lym" a="tố lên" x="30" />
      <LogRow n="An" a="theo" x="30" />
      <LogRow n="Bình" a="bỏ bài" />
      <LogRow n="Chi" a="theo" x="30" />
      <LogRow n="Giang, Hà, Khoa" a="theo" x="30" />
      <div className="log-street">
        <span className="eyebrow">Flop</span>
        <span className="log-cards">
          {TABLE_TURN.board.map((c, i) => (
            <CardText key={i} c={c} />
          ))}
        </span>
        <span className="sec-rule" />
        <span className="mono">pot 260</span>
      </div>
      <LogRow n="Giang" a="check · tự động" x={<WifiOff size={12} strokeWidth={2} />} auto />
      <LogRow n="Hà" a="check" />
      <LogRow n="Khoa" a="check" />
      <LogRow n="Lym" a="check" />
      <LogRow n="An" a="cược" x="40" />
      <LogRow n="Chi" a="theo" x="40" />
      <LogRow n="Hà" a="bỏ bài" />
      <LogRow n="Lym" a="đang nghĩ…" x="0:14" now />
      <div className="log-street pending">
        <span className="eyebrow">Turn · River</span>
        <span className="sec-rule" />
        <span>chưa chia</span>
      </div>
      <p className="side-foot">
        Mọi ván được ghi lại đầy đủ — xem lại từng bước ở <b>Lịch sử</b>.
      </p>
    </div>
  );
}

function PlayersPanel({ seats, spectators }: { seats: Seat[]; spectators: string[] }) {
  const state: Record<string, ReactNode> = {
    winner: <Badge kind="ink">Thắng</Badge>,
    "all-in": <Badge kind="red">All-in</Badge>,
    folded: <Badge kind="muted">Đã bỏ</Badge>,
    "sitting-out": <Badge kind="dash">Đang nghỉ</Badge>,
    disconnected: <Badge kind="warn">Mất kết nối</Badge>,
  };
  return (
    <div className="plist">
      <SecHead title="Tại bàn" meta={`${seats.filter((s) => s.state !== "empty").length}/9 ghế`} />
      {seats.map((s) => (
        <div key={s.seat} className={`pl-r${s.state === "empty" ? " empty" : ""}${s.isMe ? " me" : ""}`}>
          <span className="pl-seat mono">{String(s.seat).padStart(2, "0")}</span>
          {s.state === "empty" ? (
            <>
              <span className="pl-hole" />
              <span className="pl-name">Ghế trống</span>
              <span className="pl-mini">mời bạn vào</span>
            </>
          ) : (
            <>
              <Avatar name={s.name!} size={28} />
              <span className="pl-name">
                {s.name}
                {s.isMe && <em> · bạn</em>}
                {s.isButton && <span className="pl-d">D</span>}
              </span>
              <span className="pl-st">{state[s.state]}</span>
              <span className="mono pl-stack">{fmt(s.stack ?? 0)}</span>
            </>
          )}
        </div>
      ))}
      <SecHead title="Người xem" meta={`${spectators.length} người`} />
      <div className="pl-specs">
        {spectators.map((n) => (
          <span key={n} className="pl-spec">
            <Avatar name={n} size={24} />
            {n}
          </span>
        ))}
      </div>
      <Btn v="line" s="md" block icon={<UserPlus size={16} strokeWidth={1.8} />}>
        Mời thêm bạn
      </Btn>
    </div>
  );
}

function ChatLine({ m, me, spectator }: { m: (typeof CHAT)[number]; me?: boolean; spectator?: boolean }) {
  return (
    <div className={`msg${me ? " me" : ""}`}>
      <Avatar name={m.name} size={28} />
      <div className="msg-b">
        <div className="msg-h">
          <b>{m.name}</b>
          {me && <em>bạn</em>}
          {spectator && <Badge kind="dash">đang xem</Badge>}
          <span className="mono">{m.at}</span>
        </div>
        <p>{m.text.replace("(đang xem) ", "")}</p>
      </div>
    </div>
  );
}

function ChatBody() {
  return (
    <>
      <div className="msg-sys">
        <span className="sec-rule" />
        <span>
          <Trophy size={12} strokeWidth={2} /> Ván #38 · Chi thắng <b className="mono">1.840</b>
        </span>
        <span className="sec-rule" />
      </div>
      {CHAT.map((m, i) => (
        <ChatLine key={i} m={m} me={m.name === "Lym"} spectator={m.name === "Mai"} />
      ))}
    </>
  );
}

function ChatComposer() {
  return (
    <div className="composer">
      <div className="emoji-row">
        {QUICK_EMOJI.map((e) => (
          <span key={e} className="emoji">
            {e}
          </span>
        ))}
        <span className="emoji more">
          <Smile size={18} strokeWidth={1.8} />
        </span>
      </div>
      <div className="compose-row">
        <Field placeholder="Nhắn cho cả bàn…" />
        <span className="send">
          <Send size={17} strokeWidth={1.9} />
        </span>
      </div>
    </div>
  );
}

function ChatPanel() {
  return (
    <div className="chat">
      <div className="chat-specs">
        <span className="eyebrow">Đang xem</span>
        <span className="spec-avs">
          {TABLE_SHOWDOWN.spectators.map((n) => (
            <Avatar key={n} name={n} size={24} />
          ))}
        </span>
        <span>{TABLE_SHOWDOWN.spectators.join(", ")}</span>
      </div>
      <div className="chat-list">
        <ChatBody />
      </div>
      <ChatComposer />
    </div>
  );
}

function SevenLedger({ compact }: { compact?: boolean }) {
  return (
    <div className={`ledger${compact ? " compact" : ""}`}>
      {SEVEN_DEUCE.payments.map((p) => (
        <div key={p.name} className="lg-r">
          <Avatar name={p.name} size={compact ? 24 : 26} />
          <span className="lg-n">
            {p.name}
            {p.name === "Lym" && <em> · bạn</em>}
          </span>
          {p.note && <span className="lg-note">{p.note}</span>}
          <span className="mono neg lg-v">−{p.amount}</span>
        </div>
      ))}
      <div className="lg-r lg-zero">
        <Avatar name="Hà" size={compact ? 24 : 26} />
        <span className="lg-n">Hà</span>
        <span className="lg-note">còn 0 chip — không trả</span>
        <span className="mono lg-v">0</span>
      </div>
      <div className="lg-total">
        <span>
          Bình nhận <em>({SEVEN_DEUCE.payments.length} × {SEVEN_DEUCE.bonus})</em>
        </span>
        <b className="mono">+{SEVEN_DEUCE.total}</b>
      </div>
    </div>
  );
}

function SevenPanel() {
  return (
    <div className="seven-side">
      <div className="log-head">
        <span className="serif">Ván #37 · kết thúc</span>
        <span className="mono">21:03</span>
      </div>
      <LogRow n="Bình" a="tố lên" x="120" />
      <LogRow n="Còn lại" a="đều bỏ bài · 4 người" />
      <LogRow n="Bình" a="ăn pot" x="340" />
      <div className="rule-box">
        <span className="eyebrow red">
          <Sparkles size={12} strokeWidth={2} /> Luật thưởng 7-2
        </span>
        <p>
          Cầm <CardText c={card("7c")} /> <CardText c={card("2d")} /> và ăn pot vì mọi người bỏ bài → bài tự lật, mỗi
          người đang ngồi bàn trả <b className="mono">{SEVEN_DEUCE.bonus}</b>, kể cả người đang nghỉ.
        </p>
      </div>
      <SecHead title="Sổ thưởng" meta="6 dòng" />
      <SevenLedger />
    </div>
  );
}

/* =====================================================================
   Shared data shapes for the scenes
   ===================================================================== */

const turnDesk: DeskTableProps = {
  room: TABLE_TURN.room,
  blinds: TABLE_TURN.blinds,
  handNo: TABLE_TURN.handNo,
  seats: TABLE_TURN.seats,
  board: TABLE_TURN.board,
  pot: TABLE_TURN.pot,
  showBets: true,
  heroHint: (
    <>
      <span className="eyebrow">Bài của bạn</span>
      <b>K cao, chờ sảnh</b>
      <small>Cần một lá 10 · còn 4 lá</small>
    </>
  ),
  side: <LogPanel />,
  sideTab: 2,
  bar: <TurnBar />,
};

const turnMob: MobTableProps = {
  room: TABLE_TURN.room,
  blinds: TABLE_TURN.blinds,
  handNo: TABLE_TURN.handNo,
  pot: TABLE_TURN.pot,
  seats: TABLE_TURN.seats,
  board: TABLE_TURN.board,
  showBets: true,
};

const turnHint = (
  <>
    <span className="eyebrow">Bài của bạn</span>
    <b>K cao</b>
    <small>chờ sảnh, cần lá 10</small>
  </>
);

function WinBanner({ at, small }: { at: Pt; small?: boolean }) {
  const chi = TABLE_SHOWDOWN.seats.find((s) => s.state === "winner")!;
  return (
    <OnTable at={at} className={`win-banner${small ? " sm" : ""}`}>
      <span className="wb-txt">
        <span className="wb-top">
          {!small && <Trophy size={15} strokeWidth={2} />}
          <b>{chi.name} thắng</b>
          <span className="mono">{fmt(TABLE_SHOWDOWN.pot)}</span>
        </span>
        <span className="wb-hand">{chi.hand}</span>
      </span>
      {small && (
        <span className="wb-cards">
          {chi.cards!.map((c, i) => (
            <PCard key={i} c={c} size="xs" />
          ))}
        </span>
      )}
    </OnTable>
  );
}

const showDesk: DeskTableProps = {
  room: TABLE_SHOWDOWN.room,
  blinds: TABLE_SHOWDOWN.blinds,
  handNo: TABLE_SHOWDOWN.handNo,
  seats: TABLE_SHOWDOWN.seats,
  board: TABLE_SHOWDOWN.board,
  marks: SHOW_MARKS,
  win: { seat: 4, amount: TABLE_SHOWDOWN.pot },
  spectators: TABLE_SHOWDOWN.spectators,
  center: <WinBanner at={[550, 214]} />,
  under: (
    <svg className="flow" width={1100} height={704} aria-hidden="true">
      <path d="M 550 236 Q 430 236 338 206" />
    </svg>
  ),
  over: (
    <OnTable at={D_SEATS[4].bet} className="collect">
      <ChipStack />
      <span className="mono">+{fmt(TABLE_SHOWDOWN.pot)}</span>
    </OnTable>
  ),
  heroHint: (
    <>
      <span className="eyebrow">Kết quả của bạn</span>
      <b>Bộ ba K · thua</b>
      <small>
        Ván #38: <span className="mono neg">{fmt(HANDS[0].players.find((p) => p.name === "Lym")!.net)}</span>
      </small>
    </>
  ),
  sideTab: 0,
  side: <PlayersPanel seats={TABLE_SHOWDOWN.seats} spectators={TABLE_SHOWDOWN.spectators} />,
  bar: (
    <IdleBar
      eyebrow="Ván #38 · lật bài"
      title="Ván #39 bắt đầu sau 0:04"
      progress={0.6}
      sub="Chỉ bài của Lym và Chi được lật; bài người khác vẫn úp."
      actions={
        <>
          <Btn v="line" s="lg">
            Xem lại ván #38
          </Btn>
          <Btn v="ghost" s="lg">
            Đứng dậy
          </Btn>
        </>
      }
    />
  ),
};

const showMob: MobTableProps = {
  room: TABLE_SHOWDOWN.room,
  blinds: TABLE_SHOWDOWN.blinds,
  handNo: TABLE_SHOWDOWN.handNo,
  pot: TABLE_SHOWDOWN.pot,
  seats: TABLE_SHOWDOWN.seats,
  board: TABLE_SHOWDOWN.board,
  marks: SHOW_MARKS,
  center: <WinBanner at={[195, 236]} small />,
};

const showHint = (
  <>
    <span className="eyebrow">Kết quả</span>
    <b>Bộ ba K</b>
    <small>
      thua · <span className="mono neg">{fmt(HANDS[0].players.find((p) => p.name === "Lym")!.net)}</span>
    </small>
  </>
);

/* =====================================================================
   table-turn
   ===================================================================== */

export function TableTurn({ device }: { device: Device }) {
  if (device === "desktop")
    return (
      <Root device="desktop">
        <DeskTable {...turnDesk} />
      </Root>
    );
  return (
    <Root device="mobile">
      <MobTable {...turnMob} />
      <MobHero s={ME_TURN} hint={turnHint} />
      <TurnSheet />
    </Root>
  );
}

/* =====================================================================
   table-showdown
   ===================================================================== */

export function TableShowdown({ device }: { device: Device }) {
  if (device === "desktop")
    return (
      <Root device="desktop">
        <DeskTable {...showDesk} />
      </Root>
    );
  return (
    <Root device="mobile">
      <MobTable {...showMob} />
      <MobHero s={ME_SHOW} hint={showHint} />
      <div className="msheet idle" style={{ top: 604 }}>
        <span className="handle" />
        <div className="idle-row">
          <span className="serif idle-t">Ván #39 sau 0:04</span>
          <Progress value={0.6} tone="ink" />
        </div>
        <div className="idle-specs">
          <span className="spec-avs">
            {TABLE_SHOWDOWN.spectators.map((n) => (
              <Avatar key={n} name={n} size={24} />
            ))}
          </span>
          <span>
            <b>{TABLE_SHOWDOWN.spectators.length} người xem</b> · {TABLE_SHOWDOWN.spectators.join(", ")}
          </span>
        </div>
        <div className="idle-checks">
          <Check on>Tự check / bỏ</Check>
          <Check>Nghỉ từ ván sau</Check>
        </div>
        <div className="idle-acts">
          <Btn v="line" s="lg">
            Xem lại ván
          </Btn>
          <Btn v="ink" s="lg" icon={<MessageCircle size={17} strokeWidth={1.9} />}>
            Chat <em className="count">2</em>
          </Btn>
        </div>
        <HomeBar />
      </div>
    </Root>
  );
}

/* =====================================================================
   seven-deuce — Bình (seat 3) bluffs with 7-2; everyone else pays 50.
   Giang has left the table (seat 7 empty), Hà has 0 chips and pays nothing.
   ===================================================================== */

const SD_SEATS: Seat[] = TABLE_TURN.seats.map((s): Seat => {
  if (s.seat === 3) return { seat: 3, name: "Bình", stack: 1500, cards: SEVEN_DEUCE.cards, state: "winner", hand: `ăn pot ${SEVEN_DEUCE.pot}` };
  if (s.seat === 7) return { seat: 7, state: "empty" };
  const paid = SEVEN_DEUCE.payments.some((p) => p.name === s.name) ? SEVEN_DEUCE.bonus : 0;
  const base = { ...s, stack: (s.stack ?? 0) - paid, bet: undefined, timer: undefined, lastAction: undefined };
  if (s.state === "sitting-out") return base;
  if (s.state === "empty") return s;
  return { ...base, state: "folded", cards: s.isMe ? s.cards : [] };
});

const PAYERS: { seat: number; note?: string }[] = [
  { seat: 1 },
  { seat: 2 },
  { seat: 4 },
  { seat: 6, note: "đang nghỉ vẫn trả" },
  { seat: 9 },
];

function payLines(to: Pt, from: Pt[]) {
  return from.map(([x, y], i) => {
    const mx = (x + to[0]) / 2;
    const my = (y + to[1]) / 2 + (y > to[1] ? 30 : -30);
    return <path key={i} d={`M ${x} ${y} Q ${mx} ${my} ${to[0] + 18} ${to[1]}`} />;
  });
}

function SevenDeuceDesk() {
  const to = D_SEATS[3].bet;
  return (
    <DeskTable
      room={TABLE_TURN.room}
      blinds={TABLE_TURN.blinds}
      handNo={TABLE_TURN.handNo}
      seats={SD_SEATS}
      board={TABLE_TURN.board}
      boardDim
      center={<></>}
      seatTabs={{
        3: (
          <Badge kind="red" icon={<Sparkles size={11} strokeWidth={2} />}>
            Bluff 7-2
          </Badge>
        ),
      }}
      under={
        <svg className="flow pay" width={1100} height={704} aria-hidden="true">
          {payLines(
            to,
            PAYERS.map((p) => D_SEATS[p.seat].bet),
          )}
        </svg>
      }
      over={
        <>
          <div className="stamp" style={{ left: 356, top: 214, width: 388, height: 178 }}>
            <div className="stamp-cards">
              <PCard c={SEVEN_DEUCE.cards[0]} size="lg" style={{ transform: "rotate(-7deg)" }} />
              <PCard c={SEVEN_DEUCE.cards[1]} size="lg" style={{ transform: "rotate(5deg) translate(-14px, 6px)" }} />
            </div>
            <div className="stamp-txt">
              <span className="eyebrow red">Thưởng 7-2 · tự lật</span>
              <b className="serif">Bình bluff thành công!</b>
              <span className="stamp-sum">
                <b className="mono">+{SEVEN_DEUCE.total}</b>
                <small>
                  {SEVEN_DEUCE.payments.length} người × {SEVEN_DEUCE.bonus} · cộng pot {SEVEN_DEUCE.pot}
                </small>
              </span>
            </div>
          </div>
          {PAYERS.map((p) => (
            <OnTable key={p.seat} at={D_SEATS[p.seat].bet} className="pay-tag">
              <Chip size={14} />
              <b className="mono">−{SEVEN_DEUCE.bonus}</b>
              {p.note && <small>{p.note}</small>}
            </OnTable>
          ))}
          <OnTable at={D_SEATS[8].bet} className="pay-tag zero">
            <small>0 chip · miễn</small>
          </OnTable>
          <OnTable at={to} className="collect">
            <ChipStack />
            <span className="mono">+{SEVEN_DEUCE.total}</span>
          </OnTable>
        </>
      }
      side={<SevenPanel />}
      sideTab={2}
      bar={
        <IdleBar
          eyebrow="Ván #37 · đã xong"
          title="Ván #38 bắt đầu sau 0:06"
          progress={0.25}
          sub="Đã ghi vào sổ: 5 dòng −50 và 1 dòng +250 cho Bình."
          actions={
            <>
              <Btn v="line" s="lg">
                Xem lại ván #37
              </Btn>
              <Btn v="ghost" s="lg">
                Đứng dậy
              </Btn>
            </>
          }
        />
      }
    />
  );
}

function SevenDeuceMob() {
  const neg = <Badge kind="red">−50</Badge>;
  return (
    <>
      <MobTable
        room={TABLE_TURN.room}
        blinds={TABLE_TURN.blinds}
        handNo={TABLE_TURN.handNo}
        pot={SEVEN_DEUCE.pot}
        seats={SD_SEATS}
        board={[]}
        noBoard
        badges={{ 2: neg, 3: <Badge kind="ink">+250</Badge>, 4: neg, 6: neg, 8: <Badge kind="muted">0 chip</Badge>, 9: neg }}
        center={
          <>
            <div className="board-pos" style={{ left: 155, top: 186 }}>
              <div className="board board-xs">
                {TABLE_TURN.board.map((c, i) => (
                  <PCard key={i} c={c} size="xs" dim />
                ))}
              </div>
            </div>
            <div className="stamp m" style={{ left: 104, top: 228, width: 182, height: 132 }}>
              <span className="eyebrow red">Bluff 7-2 · tự lật</span>
              <div className="stamp-row">
                <div className="stamp-cards">
                  <PCard c={SEVEN_DEUCE.cards[0]} size="sm" style={{ transform: "rotate(-7deg)" }} />
                  <PCard c={SEVEN_DEUCE.cards[1]} size="sm" style={{ transform: "rotate(6deg) translate(-8px, 3px)" }} />
                </div>
                <span className="stamp-sum">
                  <b className="mono">+{SEVEN_DEUCE.total}</b>
                  <small>pot {SEVEN_DEUCE.pot}</small>
                </span>
              </div>
            </div>
          </>
        }
      />
      <div className="msheet seven" style={{ top: 460 }}>
        <span className="handle" />
        <span className="eyebrow red">
          <Sparkles size={12} strokeWidth={2} /> Thưởng 7-2 · ván #37
        </span>
        <h2 className="serif">Bình bluff 7-2 thành công!</h2>
        <p className="seven-sub">Mọi người bỏ bài — bài tự lật cho cả bàn. Mỗi người đang ngồi trả {SEVEN_DEUCE.bonus}.</p>
        <SevenLedger compact />
        <HomeBar />
      </div>
    </>
  );
}

export function SevenDeuce({ device }: { device: Device }) {
  return <Root device={device}>{device === "desktop" ? <SevenDeuceDesk /> : <SevenDeuceMob />}</Root>;
}

/* =====================================================================
   reconnect — two variants on one board
   ===================================================================== */

function ReconnectCard({ compact }: { compact?: boolean }) {
  return (
    <div className={`ovl-card${compact ? " compact" : ""}`}>
      <span className="ovl-ic warn">
        <RefreshCw size={compact ? 20 : 24} strokeWidth={1.8} />
      </span>
      <span className="eyebrow">Mất kết nối · lần thử 3</span>
      <h2 className="serif">Đang kết nối lại…</h2>
      {!compact && <p>Bàn vẫn chơi tiếp trong lúc bạn vắng mặt. Đến lượt bạn thì đồng hồ vẫn chạy như thường.</p>}
      <div className="ovl-timer">
        <span className="ovl-timer-h">
          <span>Đồng hồ của bạn vẫn chạy</span>
          <b className="mono">0:09</b>
        </span>
        <Progress value={9 / 20} />
        <small>Hết giờ: tự check nếu được, không thì tự bỏ bài.</small>
      </div>
      <div className="ovl-acts">
        <Btn v="ink" s={compact ? "md" : "lg"} icon={<RefreshCw size={16} strokeWidth={1.9} />}>
          Thử lại ngay
        </Btn>
        <Btn v="ghost" s={compact ? "md" : "lg"}>
          Về sảnh
        </Btn>
      </div>
    </div>
  );
}

function PausedCard({ compact }: { compact?: boolean }) {
  return (
    <div className={`ovl-card paused${compact ? " compact" : ""}`}>
      <span className="ovl-ic ink">
        <ServerCrash size={compact ? 20 : 24} strokeWidth={1.8} />
      </span>
      <span className="eyebrow">Lỗi máy chủ · 21:04</span>
      <h2 className="serif">Bàn tạm dừng</h2>
      <p>Ván #37 dừng đúng chỗ. Không ai mất chip — khi máy chủ chạy lại, ván chơi tiếp từ nhật ký.</p>
      <div className="ovl-list">
        <span>
          <Pause size={14} strokeWidth={2} /> Đồng hồ đã dừng cho mọi người
        </span>
        <span>
          <RefreshCw size={14} strokeWidth={2} /> Đang khôi phục… thử lại sau <b className="mono">5</b> giây
        </span>
      </div>
      <div className="ovl-acts">
        <Btn v="ink" s={compact ? "md" : "lg"}>
          Chờ ở bàn
        </Btn>
        <Btn v="line" s={compact ? "md" : "lg"}>
          Về sảnh
        </Btn>
      </div>
    </div>
  );
}

function ReconnectDesk() {
  const meWait: Seat = { ...ME_TURN, timer: { left: 9, total: 20 } };
  const seats = TABLE_TURN.seats.map((s) => (s.isMe ? meWait : s));
  return (
    <>
      <div className="half" style={{ left: 0, top: 0, width: 719, height: 900 }}>
        <div className="crop" style={{ left: -190, top: 0 }}>
          <DeskTable
            {...turnDesk}
            seats={seats}
            status={
              <Badge kind="warn" icon={<WifiOff size={12} strokeWidth={2} />}>
                Mất kết nối
              </Badge>
            }
          />
        </div>
        <div className="veil" />
        <VariantCap letter="A">Bạn mất mạng — đồng hồ vẫn chạy</VariantCap>
        <div className="ovl-pos" style={{ left: 150, top: 220, width: 420 }}>
          <ReconnectCard />
        </div>
      </div>
      <div className="half-rule" style={{ left: 719 }} />
      <div className="half" style={{ left: 721, top: 0, width: 719, height: 900 }}>
        <div className="crop" style={{ left: -190, top: 0 }}>
          <DeskTable
            {...turnDesk}
            seats={seats}
            status={
              <Badge kind="ink" icon={<Pause size={12} strokeWidth={2} />}>
                Tạm dừng
              </Badge>
            }
          />
        </div>
        <div className="veil strong" />
        <VariantCap letter="B">Lỗi máy chủ — bàn tạm dừng</VariantCap>
        <div className="ovl-pos" style={{ left: 150, top: 220, width: 420 }}>
          <PausedCard />
        </div>
      </div>
    </>
  );
}

function ReconnectMob() {
  return (
    <>
      <div className="half" style={{ left: 0, top: 0, width: 390, height: 421 }}>
        <div className="crop" style={{ left: 0, top: 0 }}>
          <MobTable {...turnMob} stripTag={<span className="strip-warn">· mất mạng</span>} />
        </div>
        <div className="veil" />
        <div className="ovl-pos" style={{ left: 24, top: 108, width: 342 }}>
          <ReconnectCard compact />
        </div>
        <VariantCap letter="A">Bạn mất mạng</VariantCap>
      </div>
      <div className="half-rule h" style={{ top: 421 }} />
      <div className="half" style={{ left: 0, top: 423, width: 390, height: 421 }}>
        <div className="crop" style={{ left: 0, top: -96 }}>
          <MobTable {...turnMob} />
        </div>
        <div className="veil strong" />
        <div className="ovl-pos" style={{ left: 24, top: 52, width: 342 }}>
          <PausedCard compact />
        </div>
        <VariantCap letter="B">Lỗi máy chủ</VariantCap>
      </div>
    </>
  );
}

export function Reconnect({ device }: { device: Device }) {
  return (
    <Root device={device} className="board-2">
      {device === "desktop" ? <ReconnectDesk /> : <ReconnectMob />}
    </Root>
  );
}

/* =====================================================================
   owner-panel
   ===================================================================== */

type OwnerRow = (typeof OWNER.players)[number];
const ADJUST: Record<string, number> = { Bình: 500, Dũng: -100 };

function OwnerPlayer({ p, compact }: { p: OwnerRow; compact?: boolean }) {
  const delta = ADJUST[p.name];
  const isMe = p.name === "Lym";
  return (
    <div className={`own-r${p.inHand ? " locked" : ""}`}>
      <Avatar name={p.name} size={compact ? 30 : 34} />
      <span className="own-who">
        <b>
          {p.name}
          {isMe && <em> · bạn</em>}
        </b>
        <small>
          Ghế {p.seat} · {p.inHand ? "đang trong ván" : (p.note ?? "ngoài ván")}
        </small>
      </span>
      <span className="mono own-stack">{fmt(p.stack)}</span>
      {p.inHand ? (
        <span className="own-lock">
          <Lock size={13} strokeWidth={2} />
          {compact ? "Đợi hết ván" : "Đợi hết ván mới chỉnh"}
        </span>
      ) : (
        <span className="own-step">
          <span className="stp">
            <Minus size={14} strokeWidth={2} />
          </span>
          <span className={`stp-v mono ${delta > 0 ? "pos" : "neg"}`}>{delta > 0 ? `+${delta}` : `−${-delta}`}</span>
          <span className="stp">
            <Plus size={14} strokeWidth={2} />
          </span>
          {!compact && (
            <Btn v={delta > 0 ? "red" : "line"} s="sm">
              {delta > 0 ? "Cấp" : "Trừ"}
            </Btn>
          )}
        </span>
      )}
      {isMe ? (
        <span className="own-kick ghost" />
      ) : (
        <IconBtn icon={<UserX size={16} strokeWidth={1.8} />} label={`Mời ${p.name} ra`} className="own-kick" />
      )}
    </div>
  );
}

function OwnerBody({ compact }: { compact?: boolean }) {
  return (
    <>
      <section className="own-sec">
        <SecHead title="Chip người chơi" meta={`${OWNER.players.length} người`} />
        <p className="note">
          <Info size={14} strokeWidth={1.9} />
          Chỉ chỉnh được khi người đó không ở trong ván. Mỗi lần cấp/trừ là một dòng trong sổ.
        </p>
        {OWNER.players.map((p) => (
          <OwnerPlayer key={p.name} p={p} compact={compact} />
        ))}
        {compact && (
          <Btn v="red" s="md" block>
            Áp dụng: Bình +500 · Dũng −100
          </Btn>
        )}
      </section>
      <section className="own-sec own-grid">
        <div>
          <SecHead title="Blind" />
          <div className="blind-row">
            <Field label="Nhỏ" value="20" mono />
            <span className="slash">/</span>
            <Field label="Lớn" value="40" mono state="focus" />
          </div>
          <span className="pending">
            <Clock3 /> {OWNER.pending} · đang 10/20
          </span>
        </div>
        <div>
          <SecHead title="Giây suy nghĩ" />
          <Seg items={["15", "20", "30", "45"]} on={1} mono className="secs" />
          <span className="own-hint">Áp dụng từ ván sau · không có giờ dự trữ</span>
        </div>
      </section>
      <section className="own-sec">
        <SecHead title="Link mời" />
        <div className="invite-row">
          <span className="invite-url mono">{OWNER.invite.replace("https://", "")}</span>
          <Btn v="line" s="sm" icon={<Copy size={14} strokeWidth={1.9} />}>
            Chép
          </Btn>
          <Btn v="ghost" s="sm" icon={<RefreshCw size={14} strokeWidth={1.9} />}>
            Đổi link
          </Btn>
        </div>
        <span className="own-hint">Đổi link thì link cũ hết hiệu lực ngay.</span>
      </section>
      <section className="own-sec danger">
        <div>
          <b>Đóng phòng</b>
          <small>Chốt sổ lời/lỗ và mời mọi người rời bàn. Không mở lại được.</small>
        </div>
        <Btn v="danger" s="md" icon={<LogOut size={15} strokeWidth={1.9} />}>
          Đóng phòng
        </Btn>
      </section>
    </>
  );
}

function Clock3() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 4.6V8l2.4 1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function OwnerDesk() {
  return (
    <>
      <DeskTable {...turnDesk} />
      <div className="veil" style={{ width: 880 }} />
      <aside className="drawer" style={{ left: 880, width: 560 }}>
        <header className="dr-head">
          <div>
            <span className="eyebrow">Bảng chủ phòng</span>
            <h2 className="serif">{OWNER.room}</h2>
            <small>7/9 ghế · đang chơi ván #37 · bàn vẫn chạy khi bảng này mở</small>
          </div>
          <IconBtn icon={<X size={20} strokeWidth={1.8} />} label="Đóng" />
        </header>
        <div className="dr-body">
          <OwnerBody />
        </div>
      </aside>
    </>
  );
}

function OwnerMob() {
  return (
    <>
      <MobTable {...turnMob} />
      <div className="veil" />
      <div className="msheet owner" style={{ top: 52 }}>
        <span className="handle" />
        <header className="dr-head">
          <div>
            <span className="eyebrow">Bảng chủ phòng</span>
            <h2 className="serif">{OWNER.room}</h2>
          </div>
          <IconBtn icon={<X size={20} strokeWidth={1.8} />} label="Đóng" />
        </header>
        <OwnerBody compact />
        <HomeBar />
      </div>
    </>
  );
}

export function OwnerPanel({ device }: { device: Device }) {
  return <Root device={device}>{device === "desktop" ? <OwnerDesk /> : <OwnerMob />}</Root>;
}

/* =====================================================================
   chat
   ===================================================================== */

export function Chat({ device }: { device: Device }) {
  if (device === "desktop")
    return (
      <Root device="desktop">
        <DeskTable {...showDesk} sideTab={1} side={<ChatPanel />} />
      </Root>
    );
  return (
    <Root device="mobile">
      <MobTable {...showMob} />
      <div className="veil soft" />
      <div className="msheet chat-sheet" style={{ top: 300 }}>
        <span className="handle" />
        <div className="cs-tabs">
          <span className="on">
            Chat <em>2</em>
          </span>
          <span>Người xem · {TABLE_SHOWDOWN.spectators.length}</span>
          <IconBtn icon={<X size={18} strokeWidth={1.8} />} label="Thu gọn" />
        </div>
        <div className="chat-specs">
          <span className="spec-avs">
            {TABLE_SHOWDOWN.spectators.map((n) => (
              <Avatar key={n} name={n} size={22} />
            ))}
          </span>
          <span>{TABLE_SHOWDOWN.spectators.join(", ")} đang xem</span>
        </div>
        <div className="chat-list">
          <ChatBody />
        </div>
        <ChatComposer />
        <HomeBar />
      </div>
    </Root>
  );
}

