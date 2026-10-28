"use client";

// Controls of D1: the design kit's Btn / IconBtn / Field / Badge / Toggle / Segmented / Strength,
// made real (buttons, inputs, keyboard, ARIA). Sizes follow the design: 42/34/50px on desktop, at
// least 44px on the landscape phone (d1.css).
import Link from "next/link";
import { useId, useRef, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { Check } from "lucide-react";

export type ButtonKind = "primary" | "ghost" | "quiet" | "danger" | "felt" | "light" | "paper";
type ButtonLook = { kind?: ButtonKind; size?: "sm" | "md" | "lg"; block?: boolean; icon?: ReactNode; iconRight?: ReactNode };

const btnClass = ({ kind = "ghost", size = "md", block = false }: ButtonLook, extra = "") =>
  `btn btn-${kind} btn-${size}${block ? " btn-block" : ""} ${extra}`;

/** `busy` keeps the width, hides the label behind a spinner and blocks clicks (aria-busy).
 *  Every <button> prop passes through, `ref` included (React 19). */
export function Button({
  kind,
  size,
  block,
  icon,
  iconRight,
  busy = false,
  className = "",
  children,
  type = "button",
  disabled,
  ...rest
}: ButtonLook & { busy?: boolean } & ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={btnClass({ kind, size, block }, `${busy ? "is-busy" : ""} ${className}`)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {icon}
      {children !== undefined && <span>{children}</span>}
      {iconRight}
      {busy && <i className="btn-spinner" aria-hidden />}
    </button>
  );
}

/** A link that looks like a button (navigation, not an action). Every next/link prop passes
 *  through (target, prefetch, onClick, aria-*, ref …). */
export function ButtonLink({ kind, size, block, icon, iconRight, className = "", children, ...link }: ButtonLook & ComponentProps<typeof Link>) {
  return (
    <Link className={btnClass({ kind, size, block }, className)} {...link}>
      {icon}
      {children !== undefined && <span>{children}</span>}
      {iconRight}
    </Link>
  );
}

/** Square icon button; `label` is required: it is the accessible name and the tooltip.
 *  `pressed` makes it a toggle (aria-pressed true/false, brass when on); `active` only lights it
 *  (e.g. the panel it opens is showing) without announcing a toggle. */
export function IconButton({
  label,
  badge,
  pressed,
  active = pressed ?? false,
  className = "",
  children,
  ...rest
}: { label: string; badge?: string | number; pressed?: boolean; active?: boolean } & Omit<ComponentProps<"button">, "aria-label" | "aria-pressed">) {
  return (
    <button type="button" className={`iconbtn${active ? " is-active" : ""} ${className}`} title={label} aria-label={badge !== undefined ? `${label} (${badge})` : label} aria-pressed={pressed} {...rest}>
      {children}
      {badge !== undefined && <i className="iconbtn-badge" aria-hidden>{badge}</i>}
    </button>
  );
}

/** Label, input box (with optional icon / trailing slot), and a hint or error under it. `error`
 *  replaces the hint, marks the box red and is announced (aria-invalid + aria-describedby, added
 *  to any aria-describedby of the caller). Every <input> prop passes through, `ref` included. */
export function TextField({
  label,
  labelNote,
  hint,
  error,
  ok = false,
  icon,
  trailing,
  mono = false,
  className = "",
  id,
  "aria-describedby": describedBy,
  ...input
}: {
  label?: ReactNode;
  labelNote?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  ok?: boolean;
  icon?: ReactNode;
  trailing?: ReactNode;
  mono?: boolean;
} & ComponentProps<"input">) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  const message = error ?? hint;
  const state = error ? " is-error" : ok ? " is-ok" : "";
  return (
    <div className={`field ${className}`}>
      {label && (
        <label className="field-label" htmlFor={inputId}>
          <span>{label}</span>
          {labelNote && <em>{labelNote}</em>}
        </label>
      )}
      <span className={`input${state}${mono ? " is-mono" : ""}`}>
        {icon && <span className="input-icon">{icon}</span>}
        <input id={inputId} aria-invalid={error ? true : undefined} aria-describedby={[describedBy, message ? hintId : ""].filter(Boolean).join(" ") || undefined} {...input} />
        {trailing && <span className="input-trailing">{trailing}</span>}
      </span>
      {message && (
        <span id={hintId} className={`field-hint${error ? " is-error" : ok ? " is-ok" : ""}`} role={error ? "alert" : undefined}>
          {message}
        </span>
      )}
    </div>
  );
}

export type BadgeKind = "muted" | "brass" | "solid" | "gain" | "loss" | "claret" | "felt";
export function Badge({ kind = "muted", icon, children, live = false }: { kind?: BadgeKind; icon?: ReactNode; children: ReactNode; live?: boolean }) {
  return (
    <span className={`badge b-${kind}`}>
      {live && <i className="dot is-live" aria-hidden />}
      {icon}
      {children}
    </span>
  );
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`toggle${on ? " is-on" : ""}`} onClick={() => onChange(!on)} />
  );
}

export function Checkbox({ checked, onChange, children, name, disabled }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode; name?: string; disabled?: boolean }) {
  return (
    <label className={`check${checked ? " is-on" : ""}${disabled ? " is-disabled" : ""}`}>
      <input type="checkbox" name={name} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden>
        <Check size={13} strokeWidth={3} />
      </i>
      <span>{children}</span>
    </label>
  );
}

/** The design's segmented control as tabs: role=tablist, arrow keys / Home / End move between
 *  them (WAI-ARIA tabs pattern). Give each panel id={`${id}-panel-${value}`} and role="tabpanel". */
export function Tabs<T extends string>({
  id,
  items,
  value,
  onChange,
  label,
  fill = false,
  small = false,
  className = "",
}: {
  id: string;
  items: { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  fill?: boolean;
  small?: boolean;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (e: KeyboardEvent, i: number) => {
    const last = items.length - 1;
    const next = e.key === "ArrowRight" ? (i === last ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(items[next].value);
    refs.current[next]?.focus();
  };
  return (
    <span role="tablist" aria-label={label} className={`seg${fill ? " seg-fill" : ""}${small ? " seg-sm" : ""} ${className}`}>
      {items.map((it, i) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${it.value}`}
            aria-selected={active}
            aria-controls={`${id}-panel-${it.value}`}
            tabIndex={active ? 0 : -1}
            className={`seg-item${active ? " is-active" : ""}`}
            onClick={() => onChange(it.value)}
            onKeyDown={(e) => move(e, i)}
          >
            {it.label}
            {it.count !== undefined && <i>{it.count}</i>}
          </button>
        );
      })}
    </span>
  );
}

const STRENGTH_LABELS = ["", "Yếu", "Tạm được", "Khá mạnh", "Rất mạnh"] as const;
export function Strength({ level, label = STRENGTH_LABELS[level] }: { level: 1 | 2 | 3 | 4; label?: string }) {
  return (
    <span className={`strength s-${level}`}>
      <span className="strength-bars" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <i key={i} className={i <= level ? "is-on" : ""} />
        ))}
      </span>
      <span className="strength-label">
        <span className="sr-only">Độ mạnh: </span>
        {label}
      </span>
    </span>
  );
}

/** Inline notice above or inside a form (the design's .alert-ok; `error` uses the claret tone). */
export function Alert({ kind = "ok", icon, title, children }: { kind?: "ok" | "error"; icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <p className={`alert alert-${kind}`} role={kind === "error" ? "alert" : "status"}>
      {icon}
      <span>
        <b>{title}</b>
        {children && <small>{children}</small>}
      </span>
    </p>
  );
}
