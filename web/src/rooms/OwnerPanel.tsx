"use client";

// The owner's panel (D1 "owner-panel"): chips for each seated player, kick, the rules (blinds,
// think time, starting stack, ante, 7-2 bonus, bomb pot, run it twice, rabbit hunt; applied from
// the next hand while one is running), the invite link and closing the room. A standalone component: the room page opens it
// in a side sheet, and the live table (C3) can mount <OwnerSheet> the same way.
//
// Needs a <ToastProvider> (from @/ui) above it, inside the .d1 root (RoomsShell has one; the
// table screen must put one in): results are announced as toasts, errors show where they
// happened. Brings its own CSS (rooms.css).
import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Clock, Copy, Crown, DoorClosed, Link2, Minus, Plus, RefreshCw, UserX } from "lucide-react";

import type { Result } from "@/account/api";
import { errorText } from "@/account/messages";
import { Avatar, Button, Modal, Sheet, Toggle, useToast } from "@/ui";
import { fmt } from "@/ui/format";

import { createRoomsApi, inviteUrl, type RoomDetail, type RoomsApi, type SeatOccupant } from "./api";
import { Choices } from "./Choices";
import { useOrigin, usePhone } from "./hooks";
import { copyText } from "./RoomBits";
import {
  blindsText,
  BOMB_EVERY_DEFAULT,
  changedRules,
  checkRules,
  defaultBombAmount,
  pendingText,
  serverFieldErrors,
  SEVEN_CHOICES,
  PAUSE_CHOICES,
  THINK_CHOICES,
  type EditableRules,
  type FieldErrors,
} from "./rules";
import "./rooms.css";

export type OwnerPanelProps = {
  /** GET /api/rooms/<id>/ of a room the viewer owns (is_owner) */
  detail: RoomDetail;
  /** who sits where: snapshot.table.seats, or the live table's seats */
  seats: SeatOccupant[];
  /** the live table knows who is dealt into the running hand; without it rows say "Ghế n" */
  inHand?: (playerId: string) => boolean;
  /** called after every change that worked, to reload the room */
  onChanged: () => void;
  rooms?: RoomsApi;
};

const STEP = 100;

type Confirm = { kind: "kick"; player: SeatOccupant } | { kind: "close" } | null;

/** "Ván sau: blind 20/40": a rules change waiting for the running hand to end. */
export function PendingNotice({ detail }: { detail: RoomDetail }) {
  const notice = pendingText(detail.pending, detail.room);
  if (!notice) return null;
  return (
    <div className="notice notice-brass" role="status">
      <Clock size={16} strokeWidth={2} aria-hidden />
      <span>
        <b>{notice}</b>
        <small>Ván đang chơi giữ blind {blindsText(detail.room)}</small>
      </span>
    </div>
  );
}

export function OwnerPanel({ detail, seats, inHand, onChanged, rooms, noticeInHead = false }: OwnerPanelProps & { noticeInHead?: boolean }) {
  const api = useMemo(() => rooms ?? createRoomsApi(), [rooms]);
  const toast = useToast();
  const phone = usePhone();
  const room = detail.room;
  const roomId = room.room_id;
  const closed = room.status === "closed";
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const origin = useOrigin();

  /** Runs one owner call: `key` marks the busy button; returns the result for local errors. */
  async function run<T>(key: string, action: () => Promise<Result<T>>, done?: ReactNode): Promise<Result<T>> {
    setBusy(key);
    const result = await action();
    setBusy(null);
    if (result.ok) {
      if (done) toast({ kind: "success", title: done });
      onChanged();
    }
    return result;
  }

  const players = [...seats].sort((a, b) => a.seat - b.seat);

  return (
    <div className="owner">
      {!noticeInHead && <PendingNotice detail={detail} />}
      {detail.closing && (
        <div className="notice notice-claret" role="status">
          <DoorClosed size={16} strokeWidth={2} aria-hidden />
          <span>
            <b>Phòng sẽ đóng khi ván này xong</b>
            <small>Không chia ván mới nữa.</small>
          </span>
        </div>
      )}

      <section className="owner-sec os-players" aria-labelledby="owner-players">
        <h4 id="owner-players">
          Người chơi & chip <small>{players.length ? `${players.length} người đang ngồi` : "chưa ai ngồi"}</small>
        </h4>
        {players.length === 0 ? (
          <p className="owner-empty">Chưa ai ngồi. Ai ngồi vào ghế là có chip đầu vào.</p>
        ) : (
          <ul className="owner-players">
            {players.map((p) => (
              <PlayerRow
                key={p.player_id}
                p={p}
                isOwner={p.player_id === detail.owner_id}
                inHand={inHand?.(p.player_id)}
                disabled={closed}
                busy={busy}
                onGrant={(amount) =>
                  run(`chips-${p.player_id}`, () => api.grantChips(roomId, { player_id: p.player_id, amount }), amount > 0 ? `Đã cấp ${fmt(amount)} chip cho ${p.display_name}` : `Đã trừ ${fmt(amount)} chip của ${p.display_name}`)
                }
                onKick={() => setConfirm({ kind: "kick", player: p })}
              />
            ))}
          </ul>
        )}
        <span className="owner-hint is-desktop-only">Người đang trong ván thì đợi ván xong mới cấp/trừ chip được.</span>
      </section>

      <RulesForm key={JSON.stringify([room, detail.pending])} detail={detail} disabled={closed} busy={busy === "rules"} save={(body, done) => run("rules", () => api.update(roomId, body), done)} />

      {detail.invite_token && (
        <section className="owner-sec os-link" aria-labelledby="owner-link">
          <h4 id="owner-link">Link mời</h4>
          <div className="link-row">
            <span className="link-box">
              <Link2 size={15} aria-hidden />
              <span>{inviteUrl(origin, detail.invite_token).replace(/^https?:\/\//, "")}</span>
            </span>
            <button
              type="button"
              className="mini-btn is-icon"
              title="Chép link"
              aria-label="Chép link mời"
              onClick={async () => {
                const ok = await copyText(inviteUrl(window.location.origin, detail.invite_token!));
                toast(ok ? { kind: "success", title: "Đã chép link mời" } : { kind: "danger", title: "Không chép được", text: "Trình duyệt chặn bộ nhớ tạm. Bấm giữ vào link để chép." });
              }}
            >
              <Copy size={15} aria-hidden />
            </button>
          </div>
          <span className="owner-inline">
            <button
              type="button"
              className="mini-btn"
              disabled={closed || busy === "invite"}
              aria-busy={busy === "invite" || undefined}
              onClick={async () => {
                const result = await run("invite", () => api.rotateInvite(roomId), "Đã đổi link mời");
                if (!result.ok) toast({ kind: "danger", title: "Chưa đổi được link", text: errorText(result.error, result.retryAfter) });
              }}
            >
              <RefreshCw size={13} aria-hidden />
              Đổi link
            </button>
            <span className="owner-hint">Link cũ hết hiệu lực ngay khi đổi.</span>
          </span>
        </section>
      )}

      {!closed && (
        <section className="owner-danger" aria-labelledby="owner-close">
          <span>
            <b id="owner-close">Đóng phòng</b>
            <small>{closeError ?? (phone ? "Kết thúc bàn, hiện bảng lời/lỗ." : "Kết thúc bàn, mọi người thấy bảng tổng kết lời/lỗ.")}</small>
          </span>
          <Button kind="danger" size="sm" disabled={detail.closing} onClick={() => setConfirm({ kind: "close" })} aria-label={detail.closing ? "Đang chờ đóng" : "Đóng phòng"}>
            {detail.closing ? "Đang chờ đóng" : "Đóng phòng"}
          </Button>
        </section>
      )}

      <Modal
        open={confirm?.kind === "kick"}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === "kick" ? `Mời ${confirm.player.display_name} ra khỏi phòng?` : ""}
        icon={<span className="modal-icon is-danger"><UserX size={22} aria-hidden /></span>}
        actions={
          <>
            <Button kind="quiet" onClick={() => setConfirm(null)}>
              Thôi
            </Button>
            <Button
              kind="danger"
              busy={busy === "kick"}
              onClick={async () => {
                if (confirm?.kind !== "kick") return;
                const p = confirm.player;
                const result = await run("kick", () => api.kick(roomId, p.player_id), `Đã mời ${p.display_name} ra khỏi phòng`);
                setConfirm(null);
                if (!result.ok) toast({ kind: "danger", title: `Chưa mời được ${p.display_name} ra`, text: errorText(result.error, result.retryAfter) });
              }}
            >
              Mời ra
            </Button>
          </>
        }
      >
        Người đó rời ghế, không vào lại được phòng này{detail.is_private ? ", và link mời đổi luôn" : ""}. Chip của họ vẫn ghi trong lịch sử.
      </Modal>
      <Modal
        open={confirm?.kind === "close"}
        onClose={() => setConfirm(null)}
        title={`Đóng ${room.name}?`}
        icon={<span className="modal-icon is-danger"><DoorClosed size={22} aria-hidden /></span>}
        actions={
          <>
            <Button kind="quiet" onClick={() => setConfirm(null)}>
              Thôi
            </Button>
            <Button
              kind="danger"
              busy={busy === "close"}
              onClick={async () => {
                const result = await run("close", () => api.close(roomId), room.status === "playing" ? "Phòng sẽ đóng khi ván này xong" : "Đã đóng phòng");
                setConfirm(null);
                setCloseError(result.ok ? null : errorText(result.error, result.retryAfter));
              }}
            >
              Đóng phòng
            </Button>
          </>
        }
      >
        {room.status === "playing" ? "Ván đang chơi vẫn đánh nốt; xong ván thì bàn đóng." : "Bàn đóng ngay."} Mọi người xem được bảng tổng kết lời/lỗ, không mở lại được.
      </Modal>
    </div>
  );
}

function PlayerRow({
  p,
  isOwner,
  inHand,
  disabled,
  busy,
  onGrant,
  onKick,
}: {
  p: SeatOccupant;
  isOwner: boolean;
  inHand?: boolean;
  disabled: boolean;
  busy: string | null;
  onGrant: (amount: number) => Promise<Result<unknown>>;
  onKick: () => void;
}) {
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(500);
  const [error, setError] = useState<string | null>(null);
  const state = !p.connected ? "mất kết nối" : p.sitting_out ? "đang nghỉ" : inHand === undefined ? null : inHand ? (phone ? "trong ván" : "đang trong ván") : "chờ ván sau";
  const key = `chips-${p.player_id}`;
  const grant = async (sign: 1 | -1) => {
    setError(null);
    const result = await onGrant(sign * amount);
    if (!result.ok) setError(errorText(result.error, result.retryAfter));
  };
  const adjustId = `owner-adjust-${p.player_id}`;
  return (
    <li className={open ? "is-open" : ""}>
      <div className="op-row">
        <Avatar name={p.display_name} size={phone ? 30 : 34} />
        <span className="op-id">
          <b>{p.display_name}</b>
          <small>
            Ghế {p.seat}
            {state && ` · ${state}`}
            {isOwner && " · chủ phòng"}
          </small>
        </span>
        <span className="op-stack" aria-label={`${fmt(p.stack)} chip`}>
          {fmt(p.stack)}
        </span>
        {open ? (
          <button type="button" className="op-caret-btn" aria-expanded aria-controls={adjustId} aria-label={`Đóng cấp/trừ chip của ${p.display_name}`} onClick={() => setOpen(false)}>
            <ChevronDown size={16} className="op-caret" aria-hidden />
          </button>
        ) : (
          <span className="op-actions">
            <button type="button" className="mini-btn" aria-expanded={false} aria-controls={adjustId} disabled={disabled} onClick={() => setOpen(true)}>
              Cấp/trừ
            </button>
            {!isOwner && (
              <button type="button" className="mini-icon" title="Mời ra" aria-label={`Mời ${p.display_name} ra khỏi phòng`} disabled={disabled} onClick={onKick}>
                <UserX size={15} aria-hidden />
              </button>
            )}
          </span>
        )}
      </div>
      {open && (
        <div className="op-adjust" id={adjustId}>
          <span className="stepper">
            <button type="button" aria-label={`Bớt ${STEP}`} onClick={() => setAmount((a) => Math.max(STEP, a - STEP))}>
              <Minus size={14} aria-hidden />
            </button>
            <input
              aria-label={`Số chip cho ${p.display_name}`}
              inputMode="numeric"
              value={amount || ""}
              onChange={(e) => setAmount(Number(e.target.value.replace(/[^\d]/g, "").slice(0, 9)) || 0)}
            />
            <button type="button" aria-label={`Thêm ${STEP}`} onClick={() => setAmount((a) => a + STEP)}>
              <Plus size={14} aria-hidden />
            </button>
          </span>
          <button type="button" className="mini-btn is-primary" disabled={!amount || busy === key} aria-busy={busy === key || undefined} onClick={() => grant(1)}>
            Cấp {fmt(amount)}
          </button>
          <button type="button" className="mini-btn is-danger" disabled={!amount || busy === key || amount > p.stack} onClick={() => grant(-1)}>
            Trừ {fmt(amount)}
          </button>
          {!isOwner && (
            <button type="button" className="mini-btn is-kick" onClick={onKick}>
              <UserX size={14} aria-hidden />
              Mời ra
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="op-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

type RulesDraft = {
  small_blind: string;
  big_blind: string;
  think_time_seconds: number;
  hand_pause_seconds: number;
  sevenOn: boolean;
  seven: string;
  starting: string;
  ante: string;
  bombOn: boolean;
  bombEvery: string;
  bombAmount: string;
  run_it_twice: boolean;
  rabbit_hunt: boolean;
};

const draftOf = (r: EditableRules): RulesDraft => ({
  small_blind: String(r.small_blind),
  big_blind: String(r.big_blind),
  think_time_seconds: r.think_time_seconds,
  hand_pause_seconds: r.hand_pause_seconds,
  sevenOn: r.seven_deuce_bonus > 0,
  seven: String(r.seven_deuce_bonus || 50),
  starting: String(r.starting_stack),
  ante: String(r.ante),
  // switched on from off: every 5 hands, 2 big blinds each
  bombOn: r.bomb_pot_every > 0,
  bombEvery: String(r.bomb_pot_every || BOMB_EVERY_DEFAULT),
  bombAmount: String(r.bomb_pot_amount || defaultBombAmount(r.big_blind)),
  run_it_twice: r.run_it_twice,
  rabbit_hunt: r.rabbit_hunt,
});
const toNumber = (text: string) => (text.trim() === "" ? NaN : Number(text));
const digitsOnly = (text: string) => text.replace(/[^\d]/g, "").slice(0, 9);

function RulesForm({
  detail,
  disabled,
  busy,
  save,
}: {
  detail: RoomDetail;
  disabled: boolean;
  busy: boolean;
  save: (body: ReturnType<typeof changedRules>, done: string) => Promise<Result<RoomDetail>>;
}) {
  const room = detail.room;
  // Start from what the next hand will use: a change already waiting stays picked.
  const start: EditableRules = {
    small_blind: detail.pending?.small_blind ?? room.small_blind,
    big_blind: detail.pending?.big_blind ?? room.big_blind,
    think_time_seconds: detail.pending?.think_time_seconds ?? room.think_time_seconds,
    hand_pause_seconds: detail.pending?.hand_pause_seconds ?? room.hand_pause_seconds,
    seven_deuce_bonus: detail.pending?.seven_deuce_bonus ?? room.seven_deuce_bonus,
    starting_stack: detail.pending?.starting_stack ?? room.starting_stack,
    ante: detail.pending?.ante ?? room.ante,
    bomb_pot_every: detail.pending?.bomb_pot_every ?? room.bomb_pot_every,
    bomb_pot_amount: detail.pending?.bomb_pot_amount ?? room.bomb_pot_amount,
    run_it_twice: detail.pending?.run_it_twice ?? room.run_it_twice,
    rabbit_hunt: detail.pending?.rabbit_hunt ?? room.rabbit_hunt,
  };
  const [draft, setDraft] = useState<RulesDraft>(() => draftOf(start));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const set = (patch: Partial<RulesDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const edit: EditableRules = {
    small_blind: toNumber(draft.small_blind),
    big_blind: toNumber(draft.big_blind),
    think_time_seconds: draft.think_time_seconds,
    hand_pause_seconds: draft.hand_pause_seconds,
    seven_deuce_bonus: draft.sevenOn ? toNumber(draft.seven) : 0,
    starting_stack: toNumber(draft.starting),
    // an empty ante box is no ante
    ante: draft.ante.trim() === "" ? 0 : toNumber(draft.ante),
    // switched on, 0 is not an answer; switched off, the amount stays as it was (not sent)
    bomb_pot_every: draft.bombOn ? toNumber(draft.bombEvery) || NaN : 0,
    bomb_pot_amount: draft.bombOn ? toNumber(draft.bombAmount) : start.bomb_pot_amount,
    run_it_twice: draft.run_it_twice,
    rabbit_hunt: draft.rabbit_hunt,
  };
  const body = changedRules(start, edit);
  const dirty = Object.keys(body).length > 0;
  const playing = room.status === "playing";
  const thinks = [...new Set([...THINK_CHOICES, start.think_time_seconds])].sort((a, b) => a - b);
  const pauses = [...new Set([...PAUSE_CHOICES, start.hand_pause_seconds])].sort((a, b) => a - b);
  const blindChanged = edit.small_blind !== room.small_blind || edit.big_blind !== room.big_blind;
  const bombError = errors.bomb_pot_every ?? errors.bomb_pot_amount;

  return (
    <form
      className="owner-rules"
      aria-label="Luật của bàn"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setFailure(null);
        // same limits as the server; the name is not edited here
        const found = checkRules({ ...edit, name: room.name, max_seats: room.max_seats, is_private: detail.is_private });
        setErrors(found);
        if (Object.keys(found).length) return;
        const result = await save(body, playing ? "Đã lưu luật · áp từ ván sau" : "Đã lưu luật");
        if (!result.ok) {
          const fields = serverFieldErrors(result.error.fields as Record<string, string[]> | undefined);
          setErrors(fields);
          if (!Object.keys(fields).length) setFailure(errorText(result.error, result.retryAfter));
        }
      }}
    >
      <div className="owner-two">
        <section className="owner-sec os-blind">
          <h4 id="owner-blind">Blind</h4>
          <span className="blind-pair" role="group" aria-labelledby="owner-blind">
            <span className={`input${errors.small_blind ? " is-error" : ""}`}>
              <input
                aria-label="Blind nhỏ"
                inputMode="numeric"
                value={draft.small_blind}
                disabled={disabled}
                aria-invalid={errors.small_blind ? true : undefined}
                aria-describedby="owner-blind-hint"
                onChange={(e) => set({ small_blind: digitsOnly(e.target.value) })}
              />
            </span>
            <span className="blind-sep" aria-hidden>
              /
            </span>
            <span className={`input${errors.small_blind ? " is-error" : ""}`}>
              <input
                aria-label="Blind lớn"
                inputMode="numeric"
                value={draft.big_blind}
                disabled={disabled}
                aria-invalid={errors.small_blind ? true : undefined}
                aria-describedby="owner-blind-hint"
                onChange={(e) => set({ big_blind: digitsOnly(e.target.value) })}
              />
            </span>
          </span>
          <span id="owner-blind-hint" className={`owner-hint${errors.small_blind ? " is-error" : ""}`} role={errors.small_blind ? "alert" : undefined}>
            {errors.small_blind ?? (blindChanged ? <>Đang {blindsText(room)} · {playing ? "áp từ ván sau" : "áp cho ván tới"}</> : playing ? "Áp từ ván sau" : "Áp cho ván tới")}
          </span>
        </section>
        <section className="owner-sec os-think">
          <h4 id="owner-secs">Giây suy nghĩ</h4>
          <Choices
            labelledBy="owner-secs"
            items={thinks.map((n) => ({ value: n, label: n, title: `${n} giây` }))}
            value={draft.think_time_seconds}
            onChange={(think_time_seconds) => set({ think_time_seconds })}
            className="seg seg-fill"
            itemClass="seg-item"
            disabled={disabled}
          />
          <span className="owner-hint is-desktop-only">Mỗi lượt, không có thời gian cộng</span>
        </section>
        <section className="owner-sec os-pause">
          <h4 id="owner-pause">Nghỉ giữa ván</h4>
          <Choices
            labelledBy="owner-pause"
            items={pauses.map((n) => ({ value: n, label: n, title: `${n} giây` }))}
            value={draft.hand_pause_seconds}
            onChange={(hand_pause_seconds) => set({ hand_pause_seconds })}
            className="seg seg-fill"
            itemClass="seg-item"
            disabled={disabled}
          />
          <span className="owner-hint is-desktop-only">Giây để xem ai thắng trước khi chia ván mới</span>
        </section>
        <section className="owner-sec os-stack">
          <h4 id="owner-stack">Chip đầu vào</h4>
          <span className={`input${errors.starting_stack ? " is-error" : ""}`}>
            <input
              aria-labelledby="owner-stack"
              inputMode="numeric"
              value={draft.starting}
              disabled={disabled}
              aria-invalid={errors.starting_stack ? true : undefined}
              aria-describedby="owner-stack-hint"
              onChange={(e) => set({ starting: digitsOnly(e.target.value) })}
            />
            <span className="input-trailing">chip</span>
          </span>
          <span id="owner-stack-hint" className={`owner-hint${errors.starting_stack ? " is-error" : ""}`} role={errors.starting_stack ? "alert" : undefined}>
            {errors.starting_stack ?? "Khi ngồi vào và khi Mua thêm"}
          </span>
        </section>
        {/* laid out like the starting stack (os-stack), the bomb pot like the 7-2 bonus (os-seven) */}
        <section className="owner-sec os-stack os-ante">
          <h4 id="owner-ante">Ante</h4>
          <span className={`input${errors.ante ? " is-error" : ""}`}>
            <input
              aria-labelledby="owner-ante"
              inputMode="numeric"
              value={draft.ante}
              disabled={disabled}
              aria-invalid={errors.ante ? true : undefined}
              aria-describedby="owner-ante-hint"
              onChange={(e) => set({ ante: digitsOnly(e.target.value) })}
            />
            <span className="input-trailing">chip</span>
          </span>
          <span id="owner-ante-hint" className={`owner-hint${errors.ante ? " is-error" : ""}`} role={errors.ante ? "alert" : undefined}>
            {errors.ante ?? "Mỗi ván ai cũng góp trước · 0 là tắt"}
          </span>
        </section>
        <section className="owner-sec os-seven">
          <h4 id="owner-seven">Thưởng 7-2</h4>
          <span className="os-seven-row">
            <Toggle on={draft.sevenOn} label="Bật thưởng 7-2" disabled={disabled} onChange={(sevenOn) => set({ sevenOn })} />
            {draft.sevenOn && (
              <>
                <span className={`input${errors.seven_deuce_bonus ? " is-error" : ""}`}>
                  <input
                    aria-label="Thưởng 7-2 mỗi người"
                    inputMode="numeric"
                    value={draft.seven}
                    disabled={disabled}
                    aria-invalid={errors.seven_deuce_bonus ? true : undefined}
                    aria-describedby={errors.seven_deuce_bonus ? "owner-seven-error" : undefined}
                    onChange={(e) => set({ seven: digitsOnly(e.target.value) })}
                  />
                  <span className="input-trailing">chip</span>
                </span>
                <Choices
                  label="Mức thưởng nhanh"
                  items={SEVEN_CHOICES.map((n) => ({ value: String(n), label: n, title: `${n} chip mỗi người` }))}
                  value={draft.seven}
                  onChange={(seven) => set({ seven })}
                  className="quick-amts"
                  itemClass="qa"
                  disabled={disabled}
                />
              </>
            )}
          </span>
          {errors.seven_deuce_bonus && (
            <span id="owner-seven-error" className="owner-hint is-error" role="alert">
              {errors.seven_deuce_bonus}
            </span>
          )}
        </section>
        <section className="owner-sec os-seven os-bomb">
          <h4 id="owner-bomb">Bomb pot</h4>
          <span className="os-seven-row">
            <Toggle on={draft.bombOn} label="Bật bomb pot" disabled={disabled} onChange={(bombOn) => set({ bombOn })} />
            {draft.bombOn && (
              <>
                <span className={`input${errors.bomb_pot_every ? " is-error" : ""}`}>
                  <input
                    aria-label="Bomb pot cứ mấy ván một lần"
                    inputMode="numeric"
                    value={draft.bombEvery}
                    disabled={disabled}
                    aria-invalid={errors.bomb_pot_every ? true : undefined}
                    aria-describedby={bombError ? "owner-bomb-error" : undefined}
                    onChange={(e) => set({ bombEvery: digitsOnly(e.target.value).slice(0, 4) })}
                  />
                  <span className="input-trailing">ván</span>
                </span>
                <span className={`input${errors.bomb_pot_amount ? " is-error" : ""}`}>
                  <input
                    aria-label="Bomb pot mỗi người góp"
                    inputMode="numeric"
                    value={draft.bombAmount}
                    disabled={disabled}
                    aria-invalid={errors.bomb_pot_amount ? true : undefined}
                    aria-describedby={bombError ? "owner-bomb-error" : undefined}
                    onChange={(e) => set({ bombAmount: digitsOnly(e.target.value) })}
                  />
                  <span className="input-trailing">chip</span>
                </span>
              </>
            )}
          </span>
          {bombError ? (
            <span id="owner-bomb-error" className="owner-hint is-error" role="alert">
              {bombError}
            </span>
          ) : (
            draft.bombOn && <span className="owner-hint is-desktop-only">Cứ mấy ván một lần, mỗi người góp bao nhiêu · không blind, lật flop luôn</span>
          )}
        </section>
        {/* two switches side by side, laid out like the 7-2 bonus while it is off */}
        <section className="owner-sec os-seven os-flag">
          <h4 id="owner-twice">Chạy 2 lần</h4>
          <span className="os-seven-row">
            <Toggle on={draft.run_it_twice} label="Chạy 2 lần khi all-in" disabled={disabled} onChange={(run_it_twice) => set({ run_it_twice })} />
          </span>
          <span className="owner-hint is-desktop-only">All-in trước river: chia 2 lần, mỗi lần nửa pot</span>
        </section>
        <section className="owner-sec os-seven os-flag">
          <h4 id="owner-rabbit">Bài chưa chia</h4>
          <span className="os-seven-row">
            <Toggle on={draft.rabbit_hunt} label="Xem bài chưa chia (rabbit hunt)" disabled={disabled} onChange={(rabbit_hunt) => set({ rabbit_hunt })} />
          </span>
          <span className="owner-hint is-desktop-only">Ván xong sớm: lật mờ các lá lẽ ra sẽ ra</span>
        </section>
      </div>
      {(dirty || failure) && (
        <div className="owner-save">
          {failure ? (
            <span className="owner-hint is-error" role="alert">
              {failure}
            </span>
          ) : (
            <span className="owner-hint">{playing ? "Đang có ván: luật mới áp từ ván sau." : "Áp ngay cho ván tới."}</span>
          )}
          <Button kind="quiet" size="sm" onClick={() => (setDraft(draftOf(start)), setErrors({}), setFailure(null))} disabled={busy}>
            Bỏ
          </Button>
          <Button kind="primary" size="sm" type="submit" busy={busy} disabled={!dirty}>
            Lưu luật
          </Button>
        </div>
      )}
    </form>
  );
}

/** The panel in the design's side sheet (desktop 500px at the right; phone: a wide sheet with the
 *  table showing at its left). */
export function OwnerSheet({ open, onClose, ...panel }: OwnerPanelProps & { open: boolean; onClose: () => void }) {
  const phone = usePhone();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      // phone: the notice sits in the header row, beside the title (the design's owner-mobile)
      aside={phone ? <PendingNotice detail={panel.detail} /> : undefined}
      title={
        <span className="owner-head">
          <span className="owner-crown" aria-hidden>
            <Crown size={phone ? 17 : 20} strokeWidth={2} />
          </span>
          <span className="owner-title">
            <b>Bảng chủ phòng</b>
            <small>{panel.detail.room.name} · bạn là chủ phòng</small>
          </span>
        </span>
      }
    >
      {open && <OwnerPanel {...panel} noticeInHead={phone} />}
    </Sheet>
  );
}
