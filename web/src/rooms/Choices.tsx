"use client";

// A row of mutually exclusive buttons that picks one value of a form: the seat picker, think
// time, 7-2 amounts, public/private. A radio group (arrow keys move and pick), drawn with the
// design's classes (.seat-picker .sp, .seg .seg-item, .quick-amts, .vis-pick .vis).
import { useRef, type KeyboardEvent, type ReactNode } from "react";

export function Choices<T extends string | number>({
  label,
  labelledBy,
  describedBy,
  items,
  value,
  onChange,
  className,
  itemClass,
  disabled = false,
}: {
  label?: string;
  labelledBy?: string;
  /** id of the error under the group */
  describedBy?: string;
  /** `name`: the radio's accessible name when its label is more than plain text. */
  items: { value: T; label: ReactNode; title?: string; name?: string }[];
  value: T;
  onChange: (value: T) => void;
  className: string;
  itemClass: string;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = items.findIndex((it) => it.value === value);
  const move = (e: KeyboardEvent, i: number) => {
    const last = items.length - 1;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? i === last ? 0 : i + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? i === 0 ? last : i - 1
          : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(items[next].value);
    refs.current[next]?.focus();
  };
  return (
    <span role="radiogroup" aria-label={label} aria-labelledby={labelledBy} aria-describedby={describedBy} aria-invalid={describedBy ? true : undefined} className={className}>
      {items.map((it, i) => {
        const on = it.value === value;
        return (
          <button
            key={String(it.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={it.name}
            title={it.title}
            // one tab stop for the group: the picked one (or the first when none matches)
            tabIndex={on || (current < 0 && i === 0) ? 0 : -1}
            disabled={disabled}
            className={`${itemClass}${on ? " is-active" : ""}`}
            onClick={() => onChange(it.value)}
            onKeyDown={(e) => move(e, i)}
          >
            {it.label}
          </button>
        );
      })}
    </span>
  );
}
