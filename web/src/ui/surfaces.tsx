"use client";

// Surfaces of D1: leather panels, the modal and side sheet (native <dialog>), and toasts.
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type MouseEvent, type ReactNode, type SyntheticEvent } from "react";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";

import { DURATION } from "./motion";

/** The design's .panel (desktop) / .m-card (phone): leather, brass hairline, deep shadow. */
export function Panel({
  title,
  aside,
  quiet = false,
  phone = false,
  className = "",
  children,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  quiet?: boolean;
  /** the tighter phone card (.m-card) instead of the desktop panel */
  phone?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${phone ? "m-card" : "panel"}${quiet ? " is-quiet" : ""} ${className}`}>
      {(title || aside) && (
        <header className="panel-head">
          {title && <h3>{title}</h3>}
          {aside && <small>{aside}</small>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Opens and closes a <dialog> with showModal() as `open` changes: focus moves in and is
 *  trapped, the page behind is inert, Esc and a click on the backdrop call onClose. */
function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const props = {
    ref,
    onCancel: (e: SyntheticEvent) => {
      e.preventDefault();
      onClose();
    },
    onClick: (e: MouseEvent<HTMLDialogElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
  };
  return props;
}

/** Centred dialog on the overlay card (confirmations, the reconnect notice). */
export function Modal({
  open,
  onClose,
  title,
  icon,
  actions,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const dialog = useDialog(open, onClose);
  const titleId = `${useId()}-title`;
  return (
    <dialog className="modal" aria-labelledby={titleId} {...dialog}>
      <div className="overlay-card modal-card">
        <button type="button" className="iconbtn modal-x" aria-label="Đóng" onClick={onClose}>
          <X size={18} />
        </button>
        {icon}
        <h2 id={titleId} className="modal-title">
          {title}
        </h2>
        {children && <div className="modal-body">{children}</div>}
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </dialog>
  );
}

/** Side sheet from the right edge (owner panel, chat drawer); on the phone it leaves the table
 *  showing at its left. */
export function Sheet({ open, onClose, title, aside, children }: { open: boolean; onClose: () => void; title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  const dialog = useDialog(open, onClose);
  const titleId = `${useId()}-title`;
  return (
    <dialog className="sheet" aria-labelledby={titleId} {...dialog}>
      <div className="sheet-panel">
        <header className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <span className="nav-right">
            {aside}
            <button type="button" className="iconbtn" aria-label="Đóng" onClick={onClose}>
              <X size={18} />
            </button>
          </span>
        </header>
        {children}
      </div>
    </dialog>
  );
}

/* ---------- toasts ---------- */

export type ToastKind = "danger" | "info" | "success";
type ToastItem = { id: number; kind: ToastKind; title: ReactNode; text?: ReactNode; icon?: ReactNode; leaving: boolean };
type ToastInput = { kind?: ToastKind; title: ReactNode; text?: ReactNode; icon?: ReactNode; /** ms; 0 keeps it until closed */ duration?: number };

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

const TOAST_ICONS: Record<ToastKind, ReactNode> = {
  danger: <TriangleAlert size={20} strokeWidth={1.9} />,
  info: <Info size={20} strokeWidth={1.9} />,
  success: <CircleCheck size={20} strokeWidth={1.9} />,
};

/** One toast (the design's "kicked from the room" card). Mostly used through useToast(). */
export function Toast({ kind = "danger", title, text, icon, onClose, leaving = false }: { kind?: ToastKind; title: ReactNode; text?: ReactNode; icon?: ReactNode; onClose?: () => void; leaving?: boolean }) {
  return (
    <div className={`toast is-${kind}${leaving ? " is-leaving" : ""}`} role={kind === "danger" ? "alert" : "status"}>
      <span className="toast-icon" aria-hidden>
        {icon ?? TOAST_ICONS[kind]}
      </span>
      <span className="toast-text">
        <b>{title}</b>
        {text && <small>{text}</small>}
      </span>
      {onClose && (
        <button type="button" className="toast-x" aria-label="Đóng thông báo" onClick={onClose}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}

/** Put once inside a D1 root; children call useToast()(…) to show a toast. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const close = useCallback((id: number) => {
    setItems((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => setItems((all) => all.filter((t) => t.id !== id)), DURATION.fast);
  }, []);
  const show = useCallback(
    ({ kind = "info", title, text, icon, duration = 5000 }: ToastInput) => {
      const id = ++seq.current;
      setItems((all) => [...all.slice(-2), { id, kind, title, text, icon, leaving: false }]);
      if (duration > 0) window.setTimeout(() => close(id), duration);
    },
    [close],
  );
  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <Toast key={t.id} kind={t.kind} title={t.title} text={t.text} icon={t.icon} leaving={t.leaving} onClose={() => close(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast() needs a <ToastProvider> above it");
  return show;
}
