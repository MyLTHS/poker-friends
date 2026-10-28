"use client";

// Lost connection and paused table (design screens-table.tsx Reconnect): a scrim over the table,
// a strip saying the buttons are locked, the "Đang kết nối lại…" card with my clock still running,
// and the "Bàn tạm dừng" card when the server suspended the room.
import Link from "next/link";
import { Clock, Lock, RefreshCw, RotateCw, ServerCrash, Timer } from "lucide-react";

import { Button, ButtonLink } from "@/ui";

import { secondsLeft, type TurnClock } from "./clock";
import type { Device } from "./geometry";
import type { Retry } from "./useTableSocket";

export function ReconnectCard({
  device,
  retry,
  now,
  myClock,
  canCheck,
  backHref,
  onRetry,
}: {
  device: Device;
  retry: Retry;
  now: number;
  /** My turn clock, when the connection dropped during my turn: it keeps running on the server. */
  myClock?: TurnClock;
  canCheck: boolean;
  backHref: string;
  onRetry: () => void;
}) {
  const d = device === "desktop";
  const wait = retry.at !== null ? secondsLeft(retry.at, now) : 0;
  return (
    <div className={`overlay-card rc-card rc-${device}`} role="alertdialog" aria-live="assertive" aria-label="Mất kết nối">
      <span className="rc-spinner" aria-hidden>
        <i />
        <RefreshCw size={d ? 22 : 20} strokeWidth={2} />
      </span>
      <b className="rc-title">{retry.final ? "Không vào lại được bàn" : "Đang kết nối lại…"}</b>
      <span className="rc-sub">
        {retry.final
          ? "Server không cho kết nối nữa (bị mời ra hoặc hết quyền vào phòng)."
          : retry.at !== null
            ? `Lần thử ${Math.max(1, retry.attempt)} · tự thử lại sau ${wait} giây`
            : `Lần thử ${Math.max(1, retry.attempt)} · đang nối…`}
      </span>
      {myClock && !retry.final && (
        <span className="rc-timer">
          <Timer size={16} strokeWidth={2.2} />
          <span>
            <b>Đồng hồ của bạn vẫn chạy: còn {secondsLeft(myClock.deadline, now)} giây.</b>{" "}
            {canCheck ? "Hết giờ sẽ tự check." : "Hết giờ sẽ tự bỏ bài."}
          </span>
        </span>
      )}
      <span className="rc-actions">
        {!retry.final && (
          <Button kind="primary" size={d ? "md" : "lg"} icon={<RotateCw size={16} />} onClick={onRetry} disabled={retry.at === null}>
            Thử lại ngay
          </Button>
        )}
        <ButtonLink kind="ghost" size={d ? "md" : "lg"} href={backHref}>
          Về sảnh
        </ButtonLink>
      </span>
    </div>
  );
}

/** Conn strip of the desktop (under the top bar) and of the phone bar. */
export function ConnStrip({ device }: { device: Device }) {
  return (
    <div className={`conn-strip conn-strip-${device === "desktop" ? "d" : "m"}`} role="status">
      <span className="conn-dot" />
      {device === "desktop" ? "Mất kết nối với bàn — các nút tạm khoá cho tới khi kết nối lại" : "Mất kết nối · đang thử lại"}
    </div>
  );
}

export function PausedCard({ device, handNo, frozenAt, onReload, backHref }: { device: Device; handNo?: number; frozenAt?: number; onReload: () => void; backHref: string }) {
  const d = device === "desktop";
  return (
    <div className={`paused paused-${device}`} role="alert">
      <span className="variant-label">Bàn tạm dừng</span>
      <div className="paused-card">
        <span className="paused-icon">
          <ServerCrash size={d ? 24 : 20} strokeWidth={1.9} />
        </span>
        <span className="paused-head">
          <b>Bàn tạm dừng</b>
          <span>
            Máy chủ gặp sự cố.
            {handNo ? ` Ván #${handNo} được giữ nguyên${d ? ", đồng hồ dừng lại." : "."}` : ""}
          </span>
        </span>
        <ul className="paused-facts">
          {frozenAt !== undefined && (
            <li>
              <Clock size={14} /> {d ? "Đồng hồ dừng ở" : "Dừng ở"} <b>{frozenAt} giây</b>
            </li>
          )}
          <li>
            <Lock size={14} /> {d ? "Chip và bài" : "Chip"} <b>giữ nguyên</b>
          </li>
          <li>
            <RefreshCw size={14} /> {d ? "Bàn tự nối lại khi" : "Tự nối lại khi"} <b>sửa xong</b>
          </li>
        </ul>
        <Button kind="ghost" size="md" block icon={<RotateCw size={15} />} onClick={onReload}>
          Tải lại bàn
        </Button>
        {!d && (
          <Link className="link paused-back" href={backHref}>
            Về sảnh
          </Link>
        )}
      </div>
    </div>
  );
}
