"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Ban, ChevronDown, Play, RotateCw, Scale } from "lucide-react";

import { errorText } from "@/account/messages";
import { Avatar, Badge, Button, ButtonLink, EmptyState, ErrorState, Loading, MiniTable, PageHead, Panel, Skeleton, Tabs } from "@/ui";
import { fmt, signed, tone } from "@/ui/format";

import { createRoomsApi, type LobbyRoom, type RoomDetail, type RoomsApi } from "./api";
import { clock, HANDS_PAGE, ledgerTotals, netBarWidth, withPlayer, type HandSummary, type SummaryRow } from "./history";
import { useMe, usePhone, useReloadWhenOnline } from "./hooks";
import { RoomsShell } from "./RoomsShell";

type Data = { detail: RoomDetail; hands: HandSummary[]; summary: SummaryRow[] };
type State = Data | { error: { code: string; text: string } } | null;

async function loadHistory(rooms: RoomsApi, roomId: number): Promise<State> {
  const [detail, hands, summary] = await Promise.all([rooms.get(roomId), rooms.hands(roomId), rooms.summary(roomId)]);
  if (!detail.ok) return { error: { code: detail.error.code, text: errorText(detail.error) } };
  if (!hands.ok) return { error: { code: hands.error.code, text: errorText(hands.error) } };
  if (!summary.ok) return { error: { code: summary.error.code, text: errorText(summary.error) } };
  return { detail: detail.data, hands: hands.data.hands, summary: summary.data.players };
}

/** /rooms/<id>/history — profit/loss ledger and the finished hands (D1 "history"). */
export function HistoryScreen({ roomId }: { roomId: number }) {
  const rooms = useMemo(() => createRoomsApi(), []);
  const { me } = useMe();
  const phone = usePhone();
  const [state, setState] = useState<State>(null);
  const [lobby, setLobby] = useState<LobbyRoom[]>([]);
  const [which, setWhich] = useState<"all" | "mine">("all");
  const [shownCount, setShownCount] = useState(HANDS_PAGE);

  const load = useCallback(() => loadHistory(rooms, roomId).then(setState), [rooms, roomId]);

  useEffect(() => {
    void load();
    rooms.lobby().then((r) => r.ok && setLobby(r.data.rooms));
  }, [load, rooms]);
  useReloadWhenOnline(useCallback(() => void load(), [load]));

  const myId = me ? String(me.id) : null;
  const sub = { title: "Lời / lỗ", sub: "Chip ảo · không phải tiền thật", back: `/rooms/${roomId}` };

  if (state === null || "error" in state) {
    return (
      <RoomsShell active="history" me={me} sub={phone ? sub : undefined}>
        {!phone && <PageHead eyebrow="Lịch sử · chip ảo" title="Lời / lỗ" sub="Tính theo chip được cấp ở phòng này. Không phải tiền thật." />}
        {state === null ? (
          <Loading label="Đang tải lịch sử…" className="history-grid">
            <Panel phone={phone}>
              <Skeleton className="sk-title" />
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="sk-row" />
              ))}
            </Panel>
            <Panel phone={phone}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="sk-row" />
              ))}
            </Panel>
          </Loading>
        ) : (
          <Panel phone={phone} className="state-panel is-center">
            <ErrorState
              title={state.error.code === "network_error" ? "Không tải được lịch sử" : "Không xem được lịch sử phòng này"}
              text={state.error.code === "network_error" ? "Mạng đang chập chờn. Chip và lịch sử vẫn được lưu an toàn." : state.error.text}
              actions={
                <>
                  {state.error.code === "network_error" && (
                    <Button kind="primary" size={phone ? "sm" : "md"} icon={<RotateCw size={15} strokeWidth={2.2} aria-hidden />} onClick={() => (setState(null), void load())}>
                      Thử lại
                    </Button>
                  )}
                  <ButtonLink kind="ghost" size={phone ? "sm" : "md"} href="/rooms" icon={<ArrowLeft size={15} aria-hidden />}>
                    Về sảnh
                  </ButtonLink>
                </>
              }
            />
          </Panel>
        )}
      </RoomsShell>
    );
  }

  const { detail, hands, summary } = state;
  const listed = which === "mine" ? withPlayer(hands, myId) : hands;
  const visible = listed.slice(0, shownCount);
  const counted = hands.filter((h) => !h.voided).length;
  const first = hands.at(-1);
  const roomSelect = <RoomSelect current={detail} rooms={lobby} small={phone} />;

  const ledger =
    summary.length === 0 ? (
      <EmptyState title="Chưa ai được cấp chip" text="Chủ phòng cấp chip cho người ngồi vào bàn, rồi lời/lỗ hiện ở đây." />
    ) : phone ? (
      <ul className="m-ledger">
        {summary.map((r) => (
          <li key={r.player_id} className={r.player_id === myId ? "is-me" : ""}>
            <Avatar name={r.display_name} size={28} />
            <span className="ml-id">
              <b>
                {r.display_name}
                {r.player_id === myId && <em>bạn</em>}
              </b>
              <small>
                cấp {fmt(r.granted)} · {r.hands_played} ván · 7-2 {signed(r.seven_deuce_net)}
              </small>
            </span>
            <NetBar net={r.net} rows={summary} />
            <span className="ml-net">
              <b className={`is-${tone(r.net)}`}>{signed(r.net)}</b>
              <small>còn {fmt(r.balance)}</small>
            </span>
          </li>
        ))}
      </ul>
    ) : (
      <Ledger rows={summary} myId={myId} />
    );

  const handList =
    visible.length === 0 ? (
      <EmptyState
        title={hands.length === 0 ? "Chưa có ván nào xong" : "Bạn chưa chơi ván nào ở đây"}
        text={hands.length === 0 ? "Ván xong là hiện ở đây, có nút xem lại từng bước." : "Chọn \"Tất cả\" để xem các ván của cả bàn."}
      />
    ) : (
      <ul className={`hands${phone ? " is-mobile" : ""}`}>
        {visible.map((h) => (
          <HandItem key={h.hand_id} h={h} myId={myId} phone={phone} />
        ))}
      </ul>
    );
  const more = listed.length > shownCount && (
    <button type="button" className="hands-more link is-muted" onClick={() => setShownCount((n) => n + HANDS_PAGE)}>
      Xem thêm {Math.min(HANDS_PAGE, listed.length - shownCount)} ván cũ hơn
    </button>
  );
  const tabs = (
    <Tabs
      id="history-hands"
      label="Lọc ván"
      small
      items={[
        { value: "all", label: "Tất cả" },
        { value: "mine", label: "Có tôi" },
      ]}
      value={which}
      onChange={(v) => (setWhich(v), setShownCount(HANDS_PAGE))}
    />
  );
  const balanced = summary.length > 0 && ledgerTotals(summary).balanced;

  if (phone) {
    return (
      <RoomsShell active="history" me={me} className="m-history">
        <div className="m-head">
          <div className="m-title">
            <h1>Lời / lỗ</h1>
            <small>Chip ảo · không phải tiền thật</small>
          </div>
          {roomSelect}
        </div>
        <section className="m-col">
          <div className="m-sec-row">
            <h2 className="m-sec">Tổng kết · {counted} ván</h2>
            {balanced && (
              <span className="lg-check">
                <Scale size={13} aria-hidden /> Sổ khớp
              </span>
            )}
          </div>
          {ledger}
        </section>
        <section className="m-col">
          <div className="m-sec-row">
            <h2 className="m-sec">Các ván gần đây</h2>
            {tabs}
          </div>
          <div id={`history-hands-panel-${which}`} role="tabpanel" aria-labelledby={`history-hands-tab-${which}`}>
            {handList}
            {more}
          </div>
        </section>
      </RoomsShell>
    );
  }
  return (
    <RoomsShell active="history" me={me}>
      <PageHead eyebrow="Lịch sử · chip ảo" title="Lời / lỗ" sub="Tính theo chip được cấp ở phòng này. Không phải tiền thật." actions={roomSelect} />
      <div className="history-grid">
        <Panel title="Bảng tổng kết" aside={`${counted} ván${first ? ` · ván đầu ${clock(first.completed_at)}` : ""}`}>
          {ledger}
        </Panel>
        <section className="panel">
          <header className="panel-head">
            <h3>Các ván</h3>
            {tabs}
          </header>
          <div id={`history-hands-panel-${which}`} role="tabpanel" aria-labelledby={`history-hands-tab-${which}`}>
            {handList}
            {more}
          </div>
        </section>
      </div>
      <p className="page-foot">
        <Link href={`/rooms/${roomId}`} className="link">
          <ArrowLeft size={13} aria-hidden /> Về {detail.room.name}
        </Link>
      </p>
    </RoomsShell>
  );
}

function NetBar({ net, rows }: { net: number; rows: SummaryRow[] }) {
  const w = netBarWidth(net, rows);
  return (
    <span className="netbar" aria-hidden>
      <i className={`netbar-fill is-${tone(net)}`} style={net >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />
      <i className="netbar-axis" />
    </span>
  );
}

function Ledger({ rows, myId }: { rows: SummaryRow[]; myId: string | null }) {
  const total = ledgerTotals(rows);
  return (
    <div className="ledger" role="table" aria-label="Bảng tổng kết lời/lỗ">
      <div className="lg-row lg-head" role="row">
        {["Người chơi", "Được cấp", "Số ván", "7-2", "Còn", "Lời / lỗ"].map((h) => (
          <span key={h} role="columnheader">
            {h}
          </span>
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.player_id} className={`lg-row${r.player_id === myId ? " is-me" : ""}`} role="row">
          <span className="lg-name" role="cell">
            <Avatar name={r.display_name} size={30} />
            <b>{r.display_name}</b>
            {r.player_id === myId && <em>bạn</em>}
          </span>
          <span role="cell">{fmt(r.granted)}</span>
          <span role="cell">{r.hands_played}</span>
          <span role="cell" className={`lg-seven is-${tone(r.seven_deuce_net)}`}>
            {r.seven_deuce_net === 0 ? "—" : signed(r.seven_deuce_net)}
          </span>
          <span role="cell">{fmt(r.balance)}</span>
          <span role="cell" className="lg-net">
            <NetBar net={r.net} rows={rows} />
            <b className={`is-${tone(r.net)}`}>{signed(r.net)}</b>
          </span>
        </div>
      ))}
      <div className="lg-row lg-total" role="row">
        <span role="cell">Tổng</span>
        <span role="cell">{fmt(total.granted)}</span>
        <span role="cell" />
        <span role="cell" />
        <span role="cell">{fmt(total.balance)}</span>
        <span role="cell" className="lg-net">
          {total.balanced && (
            <span className="lg-check">
              <Scale size={14} aria-hidden /> Sổ khớp
            </span>
          )}
          <b>{signed(total.net)}</b>
        </span>
      </div>
    </div>
  );
}

/** Who a hand row names: those who won or lost chips, and the viewer (as the design's rows). */
const shownPlayers = (h: HandSummary, myId: string | null) => h.players.filter((p) => p.net !== 0 || p.player_id === myId);

function HandItem({ h, myId, phone }: { h: HandSummary; myId: string | null; phone: boolean }) {
  return (
    <li className={`hand${h.voided ? " is-void" : ""}`}>
      <span className="hand-no">
        <b>#{h.hand_no}</b>
        <time dateTime={h.completed_at}>{clock(h.completed_at)}</time>
      </span>
      {h.voided ? (
        <span className="hand-void">
          <Badge kind="claret" icon={<Ban size={11} strokeWidth={2.6} aria-hidden />}>
            Đã huỷ
          </Badge>
          <small>Ván bị huỷ (lỗi máy chủ giữa ván) — chip đã hoàn lại cho mọi người</small>
        </span>
      ) : (
        <span className="hand-players">
          {shownPlayers(h, myId).length === 0 && <small className="hand-even">Không ai lời/lỗ</small>}
          {shownPlayers(h, myId).map((p) => (
            <span key={p.player_id} className={`hp is-${tone(p.net)}${p.player_id === myId ? " is-me" : ""}`}>
              {p.display_name} <b>{signed(p.net)}</b>
            </span>
          ))}
        </span>
      )}
      {!h.voided &&
        (phone ? (
          <Link href={`/hands/${h.hand_id}`} className="hand-play" aria-label={`Xem lại ván #${h.hand_no}`}>
            <Play size={14} strokeWidth={2.4} aria-hidden />
          </Link>
        ) : (
          <ButtonLink kind="quiet" size="sm" href={`/hands/${h.hand_id}`} icon={<Play size={13} strokeWidth={2.4} aria-hidden />} aria-label={`Xem lại ván #${h.hand_no}`}>
            Xem lại
          </ButtonLink>
        ))}
    </li>
  );
}

/** The design's room picker: this room, and the others of the lobby, to switch history. */
function RoomSelect({ current, rooms, small }: { current: RoomDetail; rooms: LobbyRoom[]; small: boolean }) {
  const router = useRouter();
  const room = current.room;
  const others = rooms.filter((r) => r.room.room_id !== room.room_id);
  return (
    <label className="room-select">
      <MiniTable seats={room.max_seats} seated={rooms.find((r) => r.room.room_id === room.room_id)?.seated ?? 0} w={small ? 40 : 44} h={small ? 26 : 28} />
      <span>
        <small>Phòng</small>
        <b>{room.name}</b>
      </span>
      <ChevronDown size={16} aria-hidden />
      <select aria-label="Đổi phòng" value={room.room_id} onChange={(e) => router.push(`/rooms/${e.target.value}/history`)} disabled={others.length === 0}>
        <option value={room.room_id}>{room.name}</option>
        {others.map((r) => (
          <option key={r.room.room_id} value={r.room.room_id}>
            {r.room.name}
          </option>
        ))}
      </select>
    </label>
  );
}
