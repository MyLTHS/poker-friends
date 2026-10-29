"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, ChevronLeft, ChevronRight, Globe, LogIn, Lock } from "lucide-react";

import { loginPath } from "@/account/members";
import { errorText } from "@/account/messages";
import { Alert, Button, ButtonLink, Chip, EmptyState, LoadingLine, MiniTable, Panel, TextField, Toggle } from "@/ui";

import { createRoomsApi } from "./api";
import { Choices } from "./Choices";
import { needsName, useMe, useOnline, usePhone } from "./hooks";
import { NameGate } from "./NameGate";
import { RoomsShell } from "./RoomsShell";
import {
  checkRules,
  DEFAULT_RULES,
  SEAT_CHOICES,
  serverFieldErrors,
  SEVEN_CHOICES,
  startingStackText,
  THINK_CHOICES,
  type FieldErrors,
  type Rules,
} from "./rules";

/** The form keeps what the player typed (an empty box stays empty); `rules()` reads it. `name`
 *  null: not touched yet, the box shows "Bàn của <tên>"; `starting` null: not touched yet, the box
 *  follows the big blind (100 of them, like the server's default). */
type Draft = {
  name: string | null;
  small_blind: string;
  big_blind: string;
  starting: string | null;
  max_seats: number;
  think_time_seconds: number;
  sevenOn: boolean;
  seven: string;
  is_private: boolean;
};

const DRAFT: Draft = {
  name: null,
  small_blind: String(DEFAULT_RULES.small_blind),
  big_blind: String(DEFAULT_RULES.big_blind),
  starting: null,
  max_seats: DEFAULT_RULES.max_seats,
  think_time_seconds: DEFAULT_RULES.think_time_seconds,
  sevenOn: true,
  seven: String(DEFAULT_RULES.seven_deuce_bonus),
  is_private: DEFAULT_RULES.is_private,
};

const num = (text: string) => (text.trim() === "" ? NaN : Number(text));

const startingText = (d: Draft) => startingStackText(d.starting, d.big_blind);

function rules(d: Draft, name: string): Rules {
  return {
    name,
    small_blind: num(d.small_blind),
    big_blind: num(d.big_blind),
    max_seats: d.max_seats,
    think_time_seconds: d.think_time_seconds,
    seven_deuce_bonus: d.sevenOn ? num(d.seven) : 0,
    starting_stack: num(startingText(d)),
    is_private: d.is_private,
  };
}

/** The fields under "Thêm tuỳ chọn": an error there opens it. */
const MORE: (keyof Rules)[] = ["max_seats", "think_time_seconds", "seven_deuce_bonus", "is_private"];

const digits = (text: string) => text.replace(/[^\d]/g, "").slice(0, 9);

/**
 * /rooms/new — open a table (D1 "create-room"), as short as Poker Now's: a name (already filled
 * in), the blinds, the chips each seat comes with (100 big blinds unless changed), "Tạo bàn". Seats, think time, the 7-2 bonus and who sees the room wait under
 * "Thêm tuỳ chọn" with their defaults. Then straight to the table, its "Mời bạn" sheet open.
 */
export function CreateRoomScreen() {
  const api = useMemo(() => createRoomsApi(), []);
  const router = useRouter();
  const { me, guestsAllowed, whenReady, signedIn } = useMe();
  const phone = usePhone();
  const online = useOnline();
  const [draft, setDraft] = useState<Draft>(DRAFT);
  const [more, setMore] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const name = draft.name ?? (me ? `Bàn của ${me.username}` : "");

  const showErrors = (found: FieldErrors) => {
    setErrors(found);
    if (MORE.some((key) => found[key])) setMore(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const r = rules(draft, name);
    const found = checkRules(r);
    showErrors(found);
    setFailure(null);
    if (Object.keys(found).length) {
      // after "Thêm tuỳ chọn" opened for it
      window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
      return;
    }
    setBusy(true);
    await whenReady();
    const result = await api.create({ ...r, name: r.name.trim() });
    if (result.ok) {
      // ?moi=1: the table opens its "Mời bạn" sheet once (LiveTableScreen)
      router.push(`/rooms/${result.data.room.room_id}/table?moi=1`);
      return;
    }
    setBusy(false);
    if (result.error.code === "validation_error") showErrors(serverFieldErrors(result.error.fields as Record<string, string[]>));
    setFailure(errorText(result.error, result.retryAfter));
  };

  const sub = phone ? { title: "Tạo bàn", sub: "Bạn là chủ bàn", back: "/rooms" } : undefined;

  if (needsName(me, guestsAllowed)) {
    return (
      <RoomsShell active="lobby" sub={sub}>
        <NameGate onDone={signedIn} />
      </RoomsShell>
    );
  }
  if (me === null) {
    return (
      <RoomsShell active="lobby" sub={sub}>
        {!phone && <CreateHead />}
        <Panel phone={phone} className="state-panel is-center">
          <EmptyState
            art={<MiniTable seats={9} seated={0} w={phone ? 96 : 180} h={phone ? 58 : 104} />}
            title="Đăng nhập để mở bàn"
            text={
              guestsAllowed === false
                ? "Đăng nhập (hoặc đăng ký, xong là vào) để mở bàn."
                : "Cần đăng nhập, hoặc gõ một cái tên để chơi bằng khách, rồi mới mở bàn."
            }
            actions={
              <ButtonLink kind="primary" href={loginPath("/rooms/new")} icon={<LogIn size={16} aria-hidden />}>
                {guestsAllowed === false ? "Đăng nhập" : "Đăng nhập hoặc chơi bằng khách"}
              </ButtonLink>
            }
          />
        </Panel>
      </RoomsShell>
    );
  }

  return (
    <RoomsShell active="lobby" me={me} sub={sub} className="create-page">
      {!phone && <CreateHead />}
      <form ref={formRef} className="panel create-form" onSubmit={submit} noValidate aria-label="Bàn mới">
        {failure && (
          <Alert kind="error" title="Chưa tạo được bàn">
            {failure}
          </Alert>
        )}
        {!online && (
          <Alert kind="error" title="Đang mất mạng">
            Có mạng lại thì bấm Tạo bàn.
          </Alert>
        )}
        <MainFields name={name} draft={draft} set={set} errors={errors} phone={phone} />
        <details className="create-more" open={more} onToggle={(e) => setMore(e.currentTarget.open)}>
          <summary>
            <ChevronRight size={16} strokeWidth={2.2} className="create-more-chev" aria-hidden />
            Thêm tuỳ chọn
          </summary>
          {/* only while open: Chrome keeps a closed <details>' boxes laid out, under the buttons */}
          {more && <MoreFields draft={draft} set={set} errors={errors} phone={phone} />}
        </details>
        <div className="form-actions">
          {me === undefined && <LoadingLine>Đang kiểm tra tài khoản…</LoadingLine>}
          {!phone && (
            <ButtonLink kind="quiet" href="/rooms" aria-label="Huỷ">
              Huỷ
            </ButtonLink>
          )}
          {/* aria-label: also named for tools that read only the element's own text, not the <span> in it */}
          <Button kind="primary" size="lg" type="submit" busy={busy} disabled={!online || me === undefined} aria-label="Tạo bàn">
            Tạo bàn
          </Button>
        </div>
      </form>
    </RoomsShell>
  );
}

function CreateHead() {
  return (
    <div className="page-head">
      <span>
        <span className="crumbs">
          Sảnh <ChevronLeft size={12} className="flip" aria-hidden /> Tạo bàn
        </span>
        <h1 className="page-title">Mở một bàn mới</h1>
      </span>
    </div>
  );
}

type FieldsProps = { draft: Draft; set: (patch: Partial<Draft>) => void; errors: FieldErrors; phone: boolean };

function MainFields({ name, draft, set, errors, phone }: FieldsProps & { name: string }) {
  const id = useId();
  const blindHint = errors.small_blind;
  return (
    <div className="create-fields">
      <TextField
        className="span-2 f-name"
        label="Tên bàn"
        value={name}
        maxLength={100}
        onChange={(e) => set({ name: e.target.value })}
        hint={phone ? undefined : "Bạn bè thấy tên này trong sảnh và trong link mời."}
        error={errors.name}
        autoComplete="off"
      />
      <div className="field f-blind">
        <span className="field-label" id={`${id}-blind`}>
          Blind nhỏ / Blind lớn
        </span>
        <span className="blind-pair" role="group" aria-labelledby={`${id}-blind`}>
          <TextField
            aria-label="Blind nhỏ"
            inputMode="numeric"
            icon={<Chip denom={5} size={18} />}
            value={draft.small_blind}
            onChange={(e) => set({ small_blind: digits(e.target.value) })}
            aria-invalid={errors.small_blind ? true : undefined}
            aria-describedby={blindHint ? `${id}-blind-hint` : undefined}
          />
          <span className="blind-sep" aria-hidden>
            /
          </span>
          <TextField
            aria-label="Blind lớn"
            inputMode="numeric"
            icon={<Chip denom={25} size={18} />}
            value={draft.big_blind}
            onChange={(e) => set({ big_blind: digits(e.target.value) })}
            aria-invalid={errors.small_blind ? true : undefined}
            aria-describedby={blindHint ? `${id}-blind-hint` : undefined}
          />
        </span>
        {blindHint && (
          <span id={`${id}-blind-hint`} className={`field-hint${errors.small_blind ? " is-error" : ""}`} role={errors.small_blind ? "alert" : undefined}>
            {blindHint}
          </span>
        )}
      </div>
      <TextField
        className="f-stack"
        label="Chip đầu vào"
        inputMode="numeric"
        icon={<Chip denom={100} size={18} />}
        trailing="chip / người"
        value={startingText(draft)}
        onChange={(e) => set({ starting: digits(e.target.value) })}
        hint={phone ? undefined : "Ai ngồi vào ghế (và mỗi lần Mua thêm) nhận chừng này chip."}
        error={errors.starting_stack}
      />
    </div>
  );
}

function MoreFields({ draft, set, errors, phone }: FieldsProps) {
  const id = useId();
  return (
    <div className="create-fields">
      <div className="field f-seats">
        <span className="field-label" id={`${id}-seats`}>
          <span>Số ghế</span> <em>2 ghế = đấu tay đôi</em>
        </span>
        <Choices
          labelledBy={`${id}-seats`}
          items={SEAT_CHOICES.map((n) => ({ value: n, label: n, title: `${n} ghế` }))}
          value={draft.max_seats}
          onChange={(max_seats) => set({ max_seats })}
          className="seat-picker"
          itemClass="sp"
          describedBy={errors.max_seats ? `${id}-seats-error` : undefined}
        />
        {errors.max_seats && (
          <span id={`${id}-seats-error`} className="field-hint is-error" role="alert">
            {errors.max_seats}
          </span>
        )}
      </div>
      <div className="field f-secs">
        <span className="field-label" id={`${id}-secs`}>
          Giây suy nghĩ mỗi lượt
        </span>
        <Choices
          labelledBy={`${id}-secs`}
          items={THINK_CHOICES.map((n) => ({ value: n, label: n, title: `${n} giây` }))}
          value={draft.think_time_seconds}
          onChange={(think_time_seconds) => set({ think_time_seconds })}
          className="seg seg-fill"
          itemClass="seg-item"
          describedBy={errors.think_time_seconds ? `${id}-secs-error` : undefined}
        />
        {errors.think_time_seconds ? (
          <span id={`${id}-secs-error`} className="field-hint is-error" role="alert">
            {errors.think_time_seconds}
          </span>
        ) : (
          !phone && <span className="field-hint">Hết giờ: tự check nếu được, không thì bỏ bài. Không có thời gian cộng.</span>
        )}
      </div>
      <div className={`field seven-field span-2 f-seven${draft.sevenOn ? "" : " is-off"}`}>
        <span className="seven-head">
          <span>
            <b id={`${id}-seven`}>Thưởng 7-2</b>
            <small>Ăn pot bằng 7-2 khi cả bàn bỏ bài → mỗi người đang ngồi trả thưởng.</small>
          </span>
          <Toggle on={draft.sevenOn} onChange={(sevenOn) => set({ sevenOn })} label="Bật thưởng 7-2" />
        </span>
        {draft.sevenOn && (
          <span className="seven-amount">
            <TextField
              aria-label="Thưởng 7-2 mỗi người"
              inputMode="numeric"
              icon={<Chip denom={25} size={18} />}
              trailing="chip / người"
              value={draft.seven}
              onChange={(e) => set({ seven: digits(e.target.value) })}
              error={errors.seven_deuce_bonus}
            />
            <Choices
              label="Mức thưởng nhanh"
              items={SEVEN_CHOICES.map((n) => ({ value: String(n), label: n }))}
              value={draft.seven}
              onChange={(seven) => set({ seven })}
              className="quick-amts"
              itemClass="qa"
            />
          </span>
        )}
      </div>
      <div className="field f-vis">
        <span className="field-label" id={`${id}-vis`}>
          Ai thấy phòng này
        </span>
        <Choices
          labelledBy={`${id}-vis`}
          items={[
            {
              value: "public",
              name: "Công khai: hiện trong sảnh",
              label: (
                <>
                  <Globe size={18} strokeWidth={1.8} aria-hidden />
                  <span>
                    <b>Công khai</b>
                    <small>Hiện trong sảnh</small>
                  </span>
                  <i className="vis-check" aria-hidden>
                    <Check size={12} strokeWidth={3} />
                  </i>
                </>
              ),
            },
            {
              value: "private",
              name: "Riêng: chỉ ai có link mời",
              label: (
                <>
                  <Lock size={18} strokeWidth={1.8} aria-hidden />
                  <span>
                    <b>Riêng</b>
                    <small>Chỉ ai có link mời</small>
                  </span>
                  <i className="vis-check" aria-hidden>
                    <Check size={12} strokeWidth={3} />
                  </i>
                </>
              ),
            },
          ]}
          value={draft.is_private ? "private" : "public"}
          onChange={(v) => set({ is_private: v === "private" })}
          className="vis-pick"
          itemClass="vis"
        />
      </div>
    </div>
  );
}
