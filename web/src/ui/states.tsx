// Loading, error and empty states of D1 (the design's "states" screen: skeleton cards under a
// sweeping light band, a claret error block with a retry, an empty block with a call to action).
// On the landscape phone the error and empty blocks lay out as one row (d1.css).
import type { CSSProperties, ReactNode } from "react";
import { WifiOff } from "lucide-react";

export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <span className={`sk ${className}`} style={style} aria-hidden />;
}

/** A placeholder list row: an oval (the mini table) and three lines. */
export function SkeletonCard({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`sk-card${compact ? " is-compact" : ""}`} aria-hidden>
      <Skeleton className="sk-oval" />
      <span className="sk-lines">
        <Skeleton className="sk-l1" />
        <Skeleton className="sk-l2" />
        <Skeleton className="sk-l3" />
      </span>
    </div>
  );
}

/** Wraps skeletons: adds the light band and tells screen readers what is loading. */
export function Loading({ label = "Đang tải…", children, className = "" }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`is-loading ${className}`} role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** One line "spinner + text" for small waits (a button area, a panel footer). */
export function LoadingLine({ children = "Đang tải…" }: { children?: ReactNode }) {
  return (
    <span className="loading-line" role="status">
      <i className="btn-spinner" aria-hidden />
      {children}
    </span>
  );
}

/** The brass ring spinner of the reconnect card. */
export function Spinner({ size = 64, children }: { size?: number; children?: ReactNode }) {
  return (
    <span className="rc-spinner" style={{ width: size, height: size }} aria-hidden>
      <i />
      {children}
    </span>
  );
}

export function ErrorState({
  title,
  text,
  icon = <WifiOff size={26} strokeWidth={1.9} />,
  actions,
  meta,
}: {
  title: ReactNode;
  text?: ReactNode;
  icon?: ReactNode;
  /** usually one primary "Thử lại" button */
  actions?: ReactNode;
  /** small line under the actions (desktop only), e.g. "Đã thử 2 lần · lần cuối 21:06" */
  meta?: ReactNode;
}) {
  return (
    <div className="err-block" role="alert">
      <span className="err-icon" aria-hidden>
        {icon}
      </span>
      <span className="err-text">
        <b>{title}</b>
        {text && <small>{text}</small>}
      </span>
      {(actions || meta) && (
        <span className="err-actions">
          {actions}
          {meta && <small className="err-meta">{meta}</small>}
        </span>
      )}
    </div>
  );
}

export function EmptyState({ art, badge, title, text, actions }: { art?: ReactNode; badge?: ReactNode; title: ReactNode; text?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="empty-block">
      {art && (
        <span className="empty-art" aria-hidden>
          {art}
          {badge && <span className="empty-plus">{badge}</span>}
        </span>
      )}
      <b>{title}</b>
      {text && <small>{text}</small>}
      {actions && <span className="empty-actions">{actions}</span>}
    </div>
  );
}
