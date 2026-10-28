"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, ChevronLeft, Globe, LogIn, Lock } from "lucide-react";

import { errorText } from "@/account/messages";
import { Alert, Button, ButtonLink, Chip, Crest, EmptyState, LoadingLine, MiniTable, Panel, TextField, Toggle } from "@/ui";

import { createRoomsApi } from "./api";
import { Choices } from "./Choices";
import { useMe, useOnline, usePhone } from "./hooks";
import { RoomsShell } from "./RoomsShell";
import {
  checkRules,
  DEFAULT_RULES,
  rulesLine,
  rulesSummary,
  SEAT_CHOICES,
  serverFieldErrors,
  SEVEN_CHOICES,
  THINK_CHOICES,
  type FieldErrors,
  type Rules,
} from "./rules";

/** The form keeps what the player typed (an empty box stays empty); `rules()` reads it. */
type Draft = {
  name: string;
  small_blind: string;
  big_blind: string;
  max_seats: number;
  think_time_seconds: number;
  sevenOn: boolean;
  seven: string;
  is_private: boolean;
};

const DRAFT: Draft = {
  name: "",
  small_blind: String(DEFAULT_RULES.small_blind),
  big_blind: String(DEFAULT_RULES.big_blind),
  max_seats: DEFAULT_RULES.max_seats,
  think_time_seconds: DEFAULT_RULES.think_time_seconds,
  sevenOn: true,
  seven: String(DEFAULT_RULES.seven_deuce_bonus),
  is_private: DEFAULT_RULES.is_private,
};

const num = (text: string) => (text.trim() === "" ? NaN : Number(text));

function rules(d: Draft): Rules {
  return {
    name: d.name,
    small_blind: num(d.small_blind),
    big_blind: num(d.big_blind),
    max_seats: d.max_seats,
    think_time_seconds: d.think_time_seconds,
    seven_deuce_bonus: d.sevenOn ? num(d.seven) : 0,
    is_private: d.is_private,
  };
}

/** Preview of rules being typed: an empty or wrong number shows as "?" rather than NaN. */
const shown = (r: Rules): Rules => {
  const n = (v: number) => (Number.isFinite(v) ? v : 0);
  return { ...r, small_blind: n(r.small_blind), big_blind: n(r.big_blind), seven_deuce_bonus: n(r.seven_deuce_bonus) };
};

const digits = (text: string) => text.replace(/[^\d]/g, "").slice(0, 9);
const FORM_ID = "create-room";

/** /rooms/new — open a table (D1 "create-room"), then go to its invite link. */
export function CreateRoomScreen() {
  const api = useMemo(() => createRoomsApi(), []);
  const router = useRouter();
  const { me, whenReady } = useMe();
  const phone = usePhone();
  const online = useOnline();
  const [draft, setDraft] = useState<Draft>(DRAFT);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const r = rules(draft);
    const found = checkRules(r);
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) {
      formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
      return;
    }
    setBusy(true);
    await whenReady();
    const result = await api.create({ ...r, name: r.name.trim() });
    if (result.ok) {
      router.push(`/rooms/${result.data.room.room_id}?moi=1`);
      return;
    }
    setBusy(false);
    if (result.error.code === "validation_error") setErrors(serverFieldErrors(result.error.fields as Record<string, string[]>));
    setFailure(errorText(result.error, result.retryAfter));
  };

  const preview = shown(rules(draft));
  const name = draft.name.trim() || "Bàn mới";
  const submitButton = (
    <Button kind="primary" size={phone ? "md" : "lg"} type="submit" form={FORM_ID} busy={busy} disabled={!online || me === null}>
      Tạo phòng & lấy link mời
    </Button>
  );

  const sub = phone
    ? {
        title: "Tạo phòng",
        sub: "Bạn là chủ phòng",
        back: "/rooms",
        right: me ? (
          <>
            <button type="button" className="link is-muted" onClick={() => (setDraft({ ...DRAFT, name: draft.name }), setErrors({}))}>
              Mặc định
            </button>
            {submitButton}
          </>
        ) : undefined,
      }
    : undefined;

  if (me === null) {
    return (
      <RoomsShell active="lobby" sub={sub ?? undefined}>
        {!phone && <CreateHead />}
        <Panel phone={phone} className="state-panel is-center">
          <EmptyState
            art={<MiniTable seats={9} seated={0} w={phone ? 96 : 180} h={phone ? 58 : 104} />}
            title="Đăng nhập để mở bàn"
            text="Chủ phòng cần một tài khoản (chơi bằng khách cũng được) để cấp chip và quản lý bàn."
            actions={
              <ButtonLink kind="primary" href="/account" icon={<LogIn size={16} aria-hidden />}>
                Đăng nhập hoặc chơi bằng khách
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
      <div className="create-grid">
        <form id={FORM_ID} ref={formRef} className="panel create-form" onSubmit={submit} noValidate aria-label="Cấu hình phòng mới">
          {failure && (
            <Alert kind="error" title="Chưa tạo được phòng">
              {failure}
            </Alert>
          )}
          {!online && (
            <Alert kind="error" title="Đang mất mạng">
              Có mạng lại thì bấm tạo phòng.
            </Alert>
          )}
          <CreateFields draft={draft} set={set} errors={errors} phone={phone} />
          <div className="m-preview" aria-hidden={!phone}>
            <MiniTable seats={preview.max_seats} seated={1} w={84} h={52} dealer />
            <span>
              <small className="eyebrow">Xem trước</small>
              <b>{name}</b>
              <small>{rulesLine(preview)}</small>
            </span>
          </div>
          <div className="form-actions">
            {me === undefined && <LoadingLine>Đang kiểm tra tài khoản…</LoadingLine>}
            <ButtonLink kind="quiet" href="/rooms">
              Huỷ
            </ButtonLink>
            {submitButton}
          </div>
        </form>
        <aside className="panel create-preview" aria-label="Xem trước">
          <span className="eyebrow">Xem trước</span>
          <div className="preview-table">
            <MiniTable seats={preview.max_seats} seated={1} w={360} h={200} dealer />
            <span className="preview-name">{name}</span>
          </div>
          <dl className="summary">
            {rulesSummary(preview).map(([k, v]) => (
              <span key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </span>
            ))}
          </dl>
          <div className="preview-note">
            <Crest size={28} />
            <span>Bạn là chủ phòng: cấp chip, đổi blind, mời ra và đóng phòng từ Bảng chủ phòng.</span>
          </div>
        </aside>
      </div>
    </RoomsShell>
  );
}

function CreateHead() {
  return (
    <div className="page-head">
      <span>
        <span className="crumbs">
          Sảnh <ChevronLeft size={12} className="flip" aria-hidden /> Tạo phòng
        </span>
        <h1 className="page-title">Mở một bàn mới</h1>
      </span>
    </div>
  );
}

function CreateFields({ draft, set, errors, phone }: { draft: Draft; set: (patch: Partial<Draft>) => void; errors: FieldErrors; phone: boolean }) {
  const id = useId();
  const blindHint = errors.small_blind ?? (phone ? undefined : "Gợi ý cấp mỗi người 100 blind lớn = 2.000 chip.");
  return (
    <div className="create-fields">
      <TextField
        className="span-2 f-name"
        label="Tên phòng"
        placeholder="Bàn thứ Sáu"
        value={draft.name}
        maxLength={100}
        onChange={(e) => set({ name: e.target.value })}
        hint={phone ? undefined : "Bạn bè thấy tên này trong sảnh và trong link mời."}
        error={errors.name}
        autoFocus={!phone}
        autoComplete="off"
      />
      <div className="field f-blind">
        <span className="field-label" id={`${id}-blind`}>
          Blind nhỏ / lớn
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
