// Sơn Mài Vàng Son (d4) — table screens: turn, showdown, 7-2, reconnect, owner panel, chat.
import type { CSSProperties, ReactNode } from "react";
import { Check, CirclePause, Copy, Crown, Minus, Moon, Play, Plus, RefreshCw, ServerCrash, UserX, WifiOff, X } from "lucide-react";

import { CHAT, OWNER, QUICK_EMOJI, REPLAY, SEVEN_DEUCE, TABLE_SHOWDOWN, TABLE_TURN, type Seat } from "../../../shared/data";
import type { Device } from "../../../shared/screens";
import { fmt, rng } from "../lib";
import { Medallion } from "../shell";
import {
  Board,
  ChatLog,
  ChatMsg,
  Composer,
  DTopBar,
  DeskMe,
  DeskStage,
  DeskTable,
  EmojiRow,
  MobMe,
  MobStage,
  MobTable,
  Pot,
  RailTabs,
  RoomMeta,
  SysMsg,
  Viewers,
} from "../table";
import { Amount, Avatar, Btn, Eyebrow, HomeBar, IconBtn, Money, PCard, Root, Seg, Tag, TimerRing } from "../ui";

const T = TABLE_TURN;
const ME = T.seats[0];
const RAISE = 150;
const raisePct = (RAISE - T.minRaise) / (T.maxRaise - T.minRaise);

/* ================================================================ shared */

function Presets({ m }: { m?: boolean }) {
  return (
    <div className={m ? "presets presets-m" : "presets"}>
      {T.presets.map((p, i) => (
        <span key={p.label} className={`preset ${i === 0 ? "on" : ""}`}>
          <small>{p.label}</small>
          <b className="num">{fmt(p.amount)}</b>
        </span>
      ))}
    </div>
  );
}

function Slider({ m }: { m?: boolean }) {
  return (
    <div className={m ? "slider slider-m" : "slider"}>
      <span className="sl-b">
        <Minus size={16} strokeWidth={2.4} />
      </span>
      <span className="sl-track">
        <i style={{ width: `${raisePct * 100}%` }} />
        <b style={{ left: `${raisePct * 100}%` }} />
        {!m && (
          <>
            <small className="sl-min num">{fmt(T.minRaise)}</small>
            <small className="sl-max num">{fmt(T.maxRaise)}</small>
          </>
        )}
      </span>
      <span className="sl-b">
        <Plus size={16} strokeWidth={2.4} />
      </span>
      {!m && <span className="sl-val num">{RAISE}</span>}
    </div>
  );
}

/** Centre of the felt during the turn: pot, the flop with two empty slots, the room engraved. */
function TurnCenter({ m }: { m?: boolean }) {
  return (
    <>
      <Pot n={T.pot} big={!m} />
      <Board cards={T.board} size={m ? "sm" : "lg"} />
      {!m && (
        <span className="engrave">
          {T.room} · Ván #{T.handNo}
        </span>
      )}
    </>
  );
}

const WAIT_NOTE = (
  <span className="dme-hint">
    Chờ sảnh · cần một lá <b>10</b>
  </span>
);

/* ============================================================ table-turn */

function TurnTray() {
  return (
    <>
      <div className="tray-timer">
        <span className="ringnum">
          <TimerRing size={78} pct={14 / 20} stroke={3.2} />
          <b className="num">14</b>
        </span>
        <span className="tray-timer-t">
          <Eyebrow>Lượt của bạn</Eyebrow>
          <b>
            còn <span className="num">14</span> giây
          </b>
          <small>Hết giờ sẽ tự bỏ bài</small>
        </span>
      </div>
      <div className="tray-acts">
        <Btn tone="then" size="xl" className="act-fold">
          Bỏ bài
        </Btn>
        <Btn tone="jade" size="xl" sub={T.toCall} className="act-call">
          Theo
        </Btn>
        <Btn tone="gold" size="xl" sub={RAISE} className="act-raise">
          Tố lên
        </Btn>
      </div>
      <div className="tray-size">
        <Presets />
        <Slider />
      </div>
    </>
  );
}

function HandLog() {
  return (
    <ol className="hlog">
      <li>
        <b>Ván #37</b> bắt đầu · Chi cầm nút
      </li>
      <li className="muted">Bình bỏ · Hà bỏ</li>
      <li className="hlog-flop">
        Flop
        {T.board.map((c, i) => (
          <PCard key={i} c={c} size="xs" />
        ))}
      </li>
      <li>Khoa check</li>
      <li>
        An cược <b className="num">40</b>
      </li>
      <li>
        Chi theo <b className="num">40</b>
      </li>
      <li className="warn">Giang mất kết nối · đồng hồ vẫn chạy</li>
      <li className="now">
        Tới lượt Lym · còn <b className="num">14</b> giây
      </li>
    </ol>
  );
}

function TurnRail() {
  return (
    <>
      <RailTabs active={2} />
      <HandLog />
      <div className="rail-stats">
        <span>
          <small>Pot</small>
          <b className="num">{fmt(T.pot)}</b>
        </span>
        <span>
          <small>Đang cược</small>
          <b className="num">80</b>
        </span>
        <span>
          <small>Trong ván</small>
          <b className="num">
            5<em>người</em>
          </b>
        </span>
      </div>
      <div className="rail-chat">
        <span className="rail-lbl">Chat mới nhất</span>
        <ChatMsg name={CHAT[0].name} text={CHAT[0].text} at={CHAT[0].at} />
        <ChatMsg name={CHAT[4].name} text={CHAT[4].text} at={CHAT[4].at} />
        <Composer />
      </div>
    </>
  );
}

const DeskTurnStage = ({ className, children }: { className?: string; children?: ReactNode }) => (
  <DeskStage
    seats={T.seats}
    center={<TurnCenter />}
    me={<DeskMe cards={ME.cards!} stack={ME.stack!} turn tag={WAIT_NOTE} />}
    className={className}
  >
    {children}
  </DeskStage>
);

function DeskTurn() {
  return (
    <Root device="desktop" className="bg-room">
      <DeskTable top={<DTopBar />} stage={<DeskTurnStage />} tray={<TurnTray />} rail={<TurnRail />} />
    </Root>
  );
}

/** Phone side column for the turn: clock, sizes, slider, then the three buttons under the thumb. */
function TurnSide() {
  return (
    <div className="mact">
      <div className="mact-timer">
        <span className="ringnum">
          <TimerRing size={50} pct={14 / 20} stroke={3.4} />
          <b className="num">14</b>
        </span>
        <span>
          <b>Lượt của bạn</b>
          <small>còn 14 giây · hết giờ tự bỏ</small>
        </span>
      </div>
      <Presets m />
      <Slider m />
      <Btn tone="gold" size="xl" block className="m-raise">
        Tố lên <span className="num">{RAISE}</span>
      </Btn>
      <div className="mact-row">
        <Btn tone="then" size="lg" block>
          Bỏ bài
        </Btn>
        <Btn tone="jade" size="lg" block>
          Theo <span className="num">{T.toCall}</span>
        </Btn>
      </div>
    </div>
  );
}

const MobTurnStage = ({ unread, className, children }: { unread?: number; className?: string; children?: ReactNode }) => (
  <MobStage seats={T.seats} center={<TurnCenter m />} me={<MobMe cards={ME.cards!} stack={ME.stack!} turn />} unread={unread} className={className}>
    {children}
  </MobStage>
);

function MobTurn() {
  return (
    <Root device="mobile" className="bg-room">
      <MobTable stage={<MobTurnStage unread={2} />} side={<TurnSide />} />
      <HomeBar />
    </Root>
  );
}

/* ======================================================== table-showdown */

const SD = TABLE_SHOWDOWN;
const SD_ME = SD.seats[0];
const SD_CHI = SD.seats.find((s) => s.name === "Chi")!;
const SD_HL = [0, 1, 2, 4]; // the four hearts on the board that make Chi's flush

function ShowCenter({ m }: { m?: boolean }) {
  return (
    <>
      <span className="winbanner">
        <Crown size={m ? 13 : 17} strokeWidth={2.2} />
        {SD.winner.name} ăn <b className="num">{fmt(SD.winner.amount)}</b>
      </span>
      <Board cards={SD.board} size={m ? "sm" : "lg"} hl={SD_HL} />
      <span className="engrave">{SD.winner.hand}</span>
    </>
  );
}

const MiniBoard = ({ from, to }: { from: number; to: number }) => (
  <span className="miniboard">
    {SD.board.slice(from, to).map((c, i) => (
      <PCard key={i} c={c} size="xs" />
    ))}
  </span>
);

const SD_TAGS = (m?: boolean): Record<number, ReactNode> => ({
  4: (
    <>
      <Tag tone="gold" icon={<Crown size={m ? 10 : 12} strokeWidth={2.4} />}>
        +{fmt(SD.winner.amount)}
      </Tag>
      {!m && <Tag tone="ink">{SD_CHI.hand}</Tag>}
    </>
  ),
});

function DeskShowdown() {
  return (
    <Root device="desktop" className="bg-room">
      <DeskTable
        top={<DTopBar title={SD.room} meta={<RoomMeta hand={SD.handNo} extra={<Tag tone="gold">Showdown</Tag>} />} />}
        stage={
          <DeskStage
            seats={SD.seats}
            center={<ShowCenter />}
            faceUp={{ 4: SD_CHI.cards! }}
            tags={SD_TAGS()}
            me={<DeskMe cards={SD_ME.cards!} stack={SD_ME.stack!} tag={<Tag tone="ink">{SD_ME.hand}</Tag>} note={<Money n={-400} />} />}
            className="stage-show"
          >
            <GoldFlakes seed={38} n={26} area={{ x: 380, y: 60, w: 400, h: 220 }} />
            <span className="stage-viewers">
              <Viewers names={SD.spectators} />
            </span>
          </DeskStage>
        }
        tray={
          <>
            <div className="tray-timer">
              <span className="ringnum">
                <TimerRing size={70} pct={0.8} stroke={3} ticks={5} />
                <b className="num">4</b>
              </span>
              <span className="tray-timer-t">
                <Eyebrow>Ván #39 sắp chia</Eyebrow>
                <b>Chi thắng bằng thùng</b>
                <small>Chip của Chi đã được cộng. Bạn còn {fmt(SD_ME.stack!)}.</small>
              </span>
            </div>
            <div className="tray-react">
              <span className="rail-lbl">Thả cảm xúc</span>
              <EmojiRow big active={3} />
            </div>
            <div className="tray-acts tray-acts-2">
              <Btn tone="then" size="xl" icon={<Moon size={18} strokeWidth={2} />}>
                Nghỉ ván sau
              </Btn>
              <Btn tone="gold" size="xl" icon={<Play size={18} strokeWidth={2} />}>
                Xem lại ván
              </Btn>
            </div>
          </>
        }
        rail={
          <>
            <RailTabs active={0} counts={[5, 7]} />
            <div className="rail-viewers">
              <Viewers names={SD.spectators} />
            </div>
            <div className="chatlog">
              <SysMsg>Ván #38 bắt đầu · Chi cầm nút</SysMsg>
              <SysMsg>
                Flop <MiniBoard from={0} to={3} />
              </SysMsg>
              <SysMsg tone="son">An all-in 920 · Lym theo</SysMsg>
              <ChatLog upto={2} />
              <SysMsg>
                Turn, river <MiniBoard from={3} to={5} />
              </SysMsg>
              <SysMsg tone="gold">Chi thắng 1.840 · {SD_CHI.hand}</SysMsg>
              <ChatLog from={2} />
            </div>
            <div className="rail-foot">
              <EmojiRow />
              <Composer />
            </div>
          </>
        }
      />
    </Root>
  );
}

function MobShowdown() {
  return (
    <Root device="mobile" className="bg-room">
      <MobTable
        stage={
          <MobStage
            seats={SD.seats}
            center={<ShowCenter m />}
            faceUp={{ 4: SD_CHI.cards! }}
            tags={SD_TAGS(true)}
            me={<MobMe cards={SD_ME.cards!} stack={SD_ME.stack!} tag={<Tag tone="ink">{SD_ME.hand}</Tag>} />}
            unread={5}
            className="stage-show"
          >
            <GoldFlakes seed={38} n={16} area={{ x: 200, y: 40, w: 240, h: 110 }} />
            <span className="m-viewers">
              <Viewers names={SD.spectators} compact />
            </span>
          </MobStage>
        }
        side={
          <div className="mact mres">
            <div className="mres-win">
              <Avatar name="Chi" size={40} />
              <span>
                <small>Showdown · Ván #38</small>
                <b>
                  Chi ăn <span className="num">{fmt(SD.winner.amount)}</span>
                </b>
                <em>{SD.winner.hand}</em>
              </span>
            </div>
            <div className="mres-me">
              <span>
                Bạn · <b>{SD_ME.hand}</b>
              </span>
              <Money n={-400} />
            </div>
            <div className="mact-timer mres-next">
              <span className="ringnum">
                <TimerRing size={44} pct={0.8} stroke={3.2} ticks={5} />
                <b className="num">4</b>
              </span>
              <span>
                <b>Ván #39 sắp chia</b>
                <small>Bạn còn {fmt(SD_ME.stack!)} chip</small>
              </span>
            </div>
            <EmojiRow active={3} />
            <div className="mact-row">
              <Btn tone="then" size="lg" block icon={<Moon size={16} strokeWidth={2} />}>
                Nghỉ
              </Btn>
              <Btn tone="gold" size="lg" block icon={<Play size={16} strokeWidth={2} />}>
                Xem lại
              </Btn>
            </div>
          </div>
        }
      />
      <HomeBar />
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

function payTags(m?: boolean) {
  const out: Record<number, ReactNode> = {};
  for (const s of S7_SEATS) {
    if (!s.name || s.isMe) continue;
    const p = S7.payments.find((x) => x.name === s.name);
    if (p)
      out[s.seat] = (
        <>
          <Tag tone="son">−{p.amount}</Tag>
          {p.note && !m && <Tag tone="mute">{p.note}</Tag>}
        </>
      );
    else if (s.name === "Hà") out[s.seat] = <Tag tone="mute">{m ? "hết chip" : "Hết chip · không trả"}</Tag>;
    else if (s.name === "Bình")
      out[s.seat] = (
        <Tag tone="gold" icon={<Crown size={m ? 10 : 12} strokeWidth={2.4} />}>
          +{S7.total} thưởng
        </Tag>
      );
  }
  return out;
}

/** Gold leaf flakes drifting over the table: the celebration, without confetti. */
function GoldFlakes({ seed, n, area }: { seed: number; n: number; area: { x: number; y: number; w: number; h: number } }) {
  const r = rng(seed);
  return (
    <span className="flakes" style={{ left: area.x, top: area.y, width: area.w, height: area.h }}>
      {Array.from({ length: n }, (_, i) => {
        const s = 4 + r() * 9;
        const st: CSSProperties = {
          left: `${r() * 100}%`,
          top: `${r() * 100}%`,
          width: s,
          height: s * (0.7 + r() * 0.6),
          transform: `rotate(${Math.round(r() * 90)}deg) skew(${Math.round((r() - 0.5) * 20)}deg)`,
          opacity: 0.55 + r() * 0.45,
        };
        return <i key={i} className={r() > 0.8 ? "flake flake-pearl" : "flake"} style={st} />;
      })}
    </span>
  );
}

function SevenCard({ m }: { m?: boolean }) {
  return (
    <div className={m ? "s7 s7-m" : "s7"}>
      <i className="s7-rays" />
      <span className="s7-cards">
        <PCard c={S7.cards[0]} size={m ? "md" : "lg"} tilt={-10} />
        <PCard c={S7.cards[1]} size={m ? "md" : "lg"} tilt={9} />
      </span>
      <span className="s7-t">
        <Eyebrow>{m ? "Bài tự lật" : "Bài tự lật cho cả bàn"}</Eyebrow>
        <b className="s7-title">
          Bluff <em>7-2</em>
        </b>
        <span className="s7-who">
          <b>{S7.winner}</b> ăn pot {fmt(S7.pot)} khi mọi người bỏ bài
        </span>
        <span className="s7-total">
          <b className="num">+{S7.total}</b>
          <small>{m ? `mỗi người ${S7.bonus}` : `thưởng 7-2 · mỗi người ${S7.bonus}`}</small>
        </span>
      </span>
    </div>
  );
}

function PayLedger({ m }: { m?: boolean }) {
  return (
    <div className={m ? "ledger ledger-m" : "ledger"}>
      {!m && (
        <div className="ledger-head">
          <Avatar name="Bình" size={48} />
          <span>
            <small>Thưởng 7-2 · Ván #37</small>
            <b>Bình nhận</b>
          </span>
          <b className="ledger-total num">+{S7.total}</b>
        </div>
      )}
      <div className="ledger-rows">
        {S7.payments.map((p) => (
          <div key={p.name} className="ledger-row">
            <Avatar name={p.name} size={m ? 22 : 30} />
            <span className="ledger-name">
              <b>{p.name}</b>
              {p.note && !m && <small>{p.note}</small>}
            </span>
            <b className="ledger-amt num">−{p.amount}</b>
          </div>
        ))}
        {!m && (
          <div className="ledger-row ledger-skip">
            <Avatar name="Hà" size={30} dim />
            <span className="ledger-name">
              <b>Hà</b>
              <small>hết chip nên không trả</small>
            </span>
            <b className="ledger-amt num">0</b>
          </div>
        )}
      </div>
      {!m && (
        <>
          <div className="ledger-sum">
            <span>Tổng</span>
            <b className="num">+{S7.total}</b>
          </div>
          <p className="ledger-rule">
            Luật 7-2 của phòng: ăn pot bằng 7 và 2 khi mọi người bỏ bài thì bài tự lật, mỗi người đang ngồi bàn (kể cả đang nghỉ) trả {S7.bonus}.
          </p>
        </>
      )}
    </div>
  );
}

const S7_CENTER = (m?: boolean) => (
  <>
    <Pot n={S7.pot} label="Bình ăn" big={!m} />
    <Board cards={REPLAY.board} size={m ? "xs" : "md"} slots={3} />
  </>
);

function DeskSeven() {
  return (
    <Root device="desktop" className="bg-room">
      <DeskTable
        top={<DTopBar meta={<RoomMeta hand={37} extra={<Tag tone="gold">Thưởng 7-2</Tag>} />} />}
        stage={
          <DeskStage
            seats={S7_SEATS}
            center={S7_CENTER()}
            faceUp={{ 3: S7.cards }}
            tags={payTags()}
            me={<DeskMe cards={REPLAY.players[0].cards} stack={1410} dim tag={<Tag tone="mute">Đã bỏ bài</Tag>} note={<Tag tone="son">−50</Tag>} />}
            className="stage-seven"
          >
            <GoldFlakes seed={72} n={40} area={{ x: 170, y: 120, w: 740, h: 400 }} />
            <SevenCard />
          </DeskStage>
        }
        tray={
          <>
            <div className="tray-react tray-react-wide">
              <span className="rail-lbl">Thả cảm xúc cho Bình</span>
              <EmojiRow big active={3} />
            </div>
            <div className="tray-next">
              <span>
                Ván #38 chia sau <b className="num">6</b> giây
              </span>
              <Btn tone="gold" size="xl" icon={<Play size={18} strokeWidth={2} />}>
                Xem lại ván
              </Btn>
            </div>
          </>
        }
        rail={
          <>
            <RailTabs active={0} counts={[6, 7]} />
            <PayLedger />
          </>
        }
      />
    </Root>
  );
}

function MobSeven() {
  return (
    <Root device="mobile" className="bg-room">
      <MobTable
        stage={
          <MobStage
            seats={S7_SEATS}
            center={S7_CENTER(true)}
            faceUp={{ 3: S7.cards }}
            tags={payTags(true)}
            me={<MobMe cards={REPLAY.players[0].cards} stack={1410} dim tag={<Tag tone="son">−50</Tag>} />}
            unread={6}
            className="stage-seven"
          >
            <GoldFlakes seed={72} n={26} area={{ x: 150, y: 90, w: 340, h: 180 }} />
          </MobStage>
        }
        side={
          <div className="mact m7">
            <SevenCard m />
            <PayLedger m />
            <span className="m7-next">
              Ván #38 chia sau <b className="num">6</b> giây
            </span>
            <div className="mact-row">
              <span className="emoji-btn">😎</span>
              <span className="emoji-btn">🔥</span>
              <Btn tone="gold" size="lg" block icon={<Play size={16} strokeWidth={2} />}>
                Xem lại
              </Btn>
            </div>
          </div>
        }
      />
      <HomeBar />
    </Root>
  );
}

/* ============================================================== reconnect */

function ReconnectCard({ m }: { m?: boolean }) {
  return (
    <div className={m ? "rc rc-m" : "rc"}>
      <Tag tone="warn" className="variant">
        A · Mạng của bạn rớt
      </Tag>
      <div className="rc-top">
        <span className="rc-spin">
          <Medallion size={m ? 58 : 84} tone="warn">
            <WifiOff size={m ? 22 : 30} strokeWidth={1.8} />
          </Medallion>
          <i className="rc-arc" />
        </span>
        <span>
          <b className="rc-title">Đang kết nối lại…</b>
          <span className="rc-sub">Ghế và chip của bạn vẫn giữ nguyên. Lần thử 2 · tự thử lại sau 3 giây.</span>
        </span>
      </div>
      <div className="rc-timer">
        <span className="ringnum">
          <TimerRing size={m ? 46 : 58} pct={9 / 20} stroke={3.2} />
          <b className="num">9</b>
        </span>
        <span>
          <b>Đồng hồ của bạn vẫn chạy</b>
          <small>Hết giờ sẽ tự check, không check được thì tự bỏ bài.</small>
        </span>
      </div>
      <Btn tone="gold" size={m ? "md" : "lg"} block icon={<RefreshCw size={17} strokeWidth={2} />}>
        Thử lại ngay
      </Btn>
    </div>
  );
}

function PausedCard({ m }: { m?: boolean }) {
  return (
    <div className={m ? "paused paused-m" : "paused"}>
      <Tag tone="pearl" className="variant">
        B · Lỗi máy chủ
      </Tag>
      <div className="paused-top">
        <Medallion size={m ? 50 : 64} tone="then">
          <CirclePause size={m ? 20 : 26} strokeWidth={1.8} />
        </Medallion>
        <span>
          <b className="paused-title">Bàn tạm dừng</b>
          <span className="paused-sub">Máy chủ đang gặp sự cố. Ván #37 được giữ nguyên, đồng hồ cũng dừng, không ai mất chip.</span>
        </span>
      </div>
      <span className="paused-status">
        <ServerCrash size={15} strokeWidth={2} /> Đang khôi phục · <b className="num">0:18</b>
      </span>
    </div>
  );
}

function DeskReconnect() {
  return (
    <Root device="desktop" className="bg-room">
      <DeskTable
        className="dtable-dim"
        top={<DTopBar meta={<RoomMeta hand={T.handNo} extra={<Tag tone="warn">Mất mạng</Tag>} />} />}
        stage={<DeskTurnStage />}
        tray={<TurnTray />}
        rail={
          <div className="variant-rail">
            <Eyebrow tone="mute">Biến thể khi lỗi máy chủ</Eyebrow>
            <div className="paused-table">
              <i className="paused-felt" />
              <span>
                <CirclePause size={18} strokeWidth={2} /> Tạm dừng
              </span>
            </div>
            <PausedCard />
            <Btn tone="then" size="lg" block>
              Về sảnh trong lúc chờ
            </Btn>
          </div>
        }
        overlay={
          <div className="scrim scrim-stage">
            <ReconnectCard />
          </div>
        }
      />
    </Root>
  );
}

function MobReconnect() {
  return (
    <Root device="mobile" className="bg-room">
      <MobTable
        className="mtable-dim"
        stage={<MobTurnStage />}
        side={
          <div className="mact mpaused">
            <PausedCard m />
            <Btn tone="then" size="md" block>
              Về sảnh trong lúc chờ
            </Btn>
          </div>
        }
        overlay={
          <div className="mscrim">
            <ReconnectCard m />
          </div>
        }
      />
      <HomeBar />
    </Root>
  );
}

/* ============================================================ owner-panel */

function OwnerPlayers({ m }: { m?: boolean }) {
  return (
    <div className="own-players">
      {OWNER.players.map((p) => {
        const open = p.name === "An";
        return (
          <div key={p.name} className={`own-row ${open ? "own-row-open" : ""}`}>
            <div className="own-main">
              <Avatar name={p.name} size={m ? 32 : 40} dim={!!p.note} me={p.name === "Lym"} />
              <span className="own-name">
                <b>{p.name}</b>
                <small>
                  Ghế {p.seat} · {p.note ?? (p.inHand ? "đang trong ván" : "chờ ván sau")}
                </small>
              </span>
              <Amount n={p.stack} size={13} className="own-stack" />
              {m && open && (
                <IconBtn size={44} tone="son">
                  <UserX size={16} strokeWidth={2} />
                </IconBtn>
              )}
              {!m && (
                <span className="own-ctl">
                  <IconBtn size={34}>
                    <Minus size={15} strokeWidth={2.4} />
                  </IconBtn>
                  <IconBtn size={34} tone={open ? "gold" : undefined}>
                    <Plus size={15} strokeWidth={2.4} />
                  </IconBtn>
                  {p.name !== "Lym" && (
                    <IconBtn size={34} tone="son">
                      <UserX size={15} strokeWidth={2} />
                    </IconBtn>
                  )}
                </span>
              )}
            </div>
            {open &&
              (m ? (
                <div className="own-grant own-grant-m">
                  <span className="own-grant-row">
                    <Seg items={["+ Cấp", "− Trừ"]} active={0} />
                    <span className="own-amt">
                      <b className="num">500</b>
                      <i className="caret" />
                    </span>
                    <IconBtn size={44} tone="gold">
                      <Check size={18} strokeWidth={2.4} />
                    </IconBtn>
                  </span>
                  <small className="own-note">Cộng ngay khi ván #37 xong</small>
                </div>
              ) : (
                <div className="own-grant">
                  <Seg items={["Cấp thêm", "Trừ bớt"]} active={0} />
                  <span className="own-amt">
                    <b className="num">500</b>
                    <i className="caret" />
                  </span>
                  <Btn tone="gold" size="sm" icon={<Check size={15} strokeWidth={2.4} />}>
                    Cấp
                  </Btn>
                  <small className="own-note">An đang trong ván: chip được cộng ngay khi ván #37 xong.</small>
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}

function OwnerSettings({ m }: { m?: boolean }) {
  return (
    <div className="own-set">
      <div className="own-box">
        <span className="own-lbl">Blind</span>
        <span className="own-blind">
          <s className="num">10/20</s>
          <span>→</span>
          <b className="num">20/40</b>
          {m && <Tag tone="gold">từ ván sau</Tag>}
        </span>
        {!m && <Tag tone="gold">{OWNER.pending}</Tag>}
      </div>
      <div className="own-box">
        <span className="own-lbl">Giây suy nghĩ</span>
        <Seg items={["15", "20", "30", "45"]} active={1} className="seg-fill" />
        {!m && <small className="own-help">Áp dụng từ lượt tiếp theo</small>}
      </div>
      <div className="own-box own-link">
        <span className="own-lbl">Link mời</span>
        <span className="own-url">
          <span>{OWNER.invite.replace("https://", "")}</span>
          <Copy size={15} strokeWidth={2} />
        </span>
        <span className="own-link-row">
          <Btn tone="then" size={m ? "md" : "sm"} icon={<RefreshCw size={14} strokeWidth={2} />}>
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
        <Btn tone="son" size={m ? "md" : "md"} icon={<X size={16} strokeWidth={2.2} />}>
          Đóng phòng
        </Btn>
      </div>
    </div>
  );
}

const OwnerHead = ({ m }: { m?: boolean }) => (
  <div className="own-head">
    <Tag tone="gold" icon={<Crown size={12} strokeWidth={2.4} />}>
      Chủ phòng
    </Tag>
    <b>{OWNER.room}</b>
    <IconBtn size={m ? 44 : 42}>
      <X size={19} strokeWidth={2} />
    </IconBtn>
  </div>
);

function DeskOwner() {
  return (
    <Root device="desktop" className="bg-room">
      <DeskTable
        className="dtable-dim"
        top={<DTopBar />}
        stage={<DeskTurnStage />}
        tray={<TurnTray />}
        rail={<RailTabs active={1} />}
        overlay={
          <>
            <div className="scrim scrim-all" />
            <aside className="drawer">
              <OwnerHead />
              <section className="drawer-sec">
                <span className="sec-h">Người chơi & chip</span>
                <small className="drawer-help">4 người có chip · bấm + / − để cấp hoặc trừ, nút đỏ để mời ra</small>
                <OwnerPlayers />
              </section>
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
    <Root device="mobile" className="bg-room">
      <MobTable
        className="mtable-dim"
        stage={<MobTurnStage />}
        side={<TurnSide />}
        overlay={
          <>
            <div className="mscrim mscrim-left" />
            <aside className="msheet msheet-owner">
              <OwnerHead m />
              <div className="own-panes">
                <section className="own-pane">
                  <span className="own-lbl">Người chơi & chip</span>
                  <OwnerPlayers m />
                </section>
                <section className="own-pane own-pane-scroll">
                  <OwnerSettings m />
                </section>
              </div>
            </aside>
          </>
        }
      />
      <HomeBar />
    </Root>
  );
}

/* =================================================================== chat */

const TRAY_EMOJI = ["👍", "😂", "😱", "🔥", "🙏", "😏", "🎉", "😎", "🤝", "💸", "🃏", "👀", "😭", "🤞", "🍀", "👏"];

function ChatRail() {
  return (
    <>
      <RailTabs active={0} counts={[5, 8]} />
      <div className="rail-viewers rail-viewers-big">
        <Eyebrow tone="mute">Đang xem · 3</Eyebrow>
        <span className="viewer-list">
          {SD.spectators.map((n) => (
            <span key={n}>
              <Avatar name={n} size={30} />
              {n}
            </span>
          ))}
        </span>
      </div>
      <div className="chatlog">
        <SysMsg tone="gold">Ván #38 · Chi thắng 1.840</SysMsg>
        <ChatLog />
        <div className="typing">
          <Avatar name="An" size={22} />
          An đang gõ
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
      <div className="rail-foot">
        <div className="etray">
          <span className="etray-h">
            <b>Emoji nhanh</b>
            <small>Hay dùng</small>
          </span>
          <div className="etray-grid">
            {TRAY_EMOJI.map((e, i) => (
              <span key={e} className={i === 3 ? "on" : ""}>
                {e}
              </span>
            ))}
          </div>
        </div>
        <Composer text="ván này ai all-in đi 😆" focus />
      </div>
    </>
  );
}

function DeskChat() {
  return (
    <Root device="desktop" className="bg-room">
      <DeskTable
        top={<DTopBar />}
        stage={
          <DeskTurnStage>
            <span className="say say-an">ai bluff kìa 😏</span>
            <span className="react r-chi">🔥</span>
            <span className="react r-khoa">👍</span>
          </DeskTurnStage>
        }
        tray={<TurnTray />}
        rail={<ChatRail />}
      />
    </Root>
  );
}

function MobChat() {
  return (
    <Root device="mobile" className="bg-room">
      <MobTable
        stage={
          <MobTurnStage>
            <span className="say say-m">ai bluff kìa 😏</span>
          </MobTurnStage>
        }
        side={<TurnSide />}
        overlay={
          <>
            <div className="mscrim mscrim-soft" />
            <aside className="msheet msheet-chat">
              <div className="mchat-head">
                <Seg items={["Chat 5", "Đang xem 3"]} active={0} />
                <IconBtn size={44}>
                  <X size={19} strokeWidth={2} />
                </IconBtn>
              </div>
              <Viewers names={SD.spectators} compact />
              <div className="chatlog chatlog-m">
                <ChatLog from={1} />
                <div className="typing">
                  <Avatar name="An" size={20} />
                  An đang gõ
                  <span className="dots">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
              <div className="emojis emojis-m">
                {QUICK_EMOJI.map((e) => (
                  <span key={e}>{e}</span>
                ))}
              </div>
              <Composer text="ván này ai all-in đi 😆" focus />
            </aside>
          </>
        }
      />
      <HomeBar />
    </Root>
  );
}

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
