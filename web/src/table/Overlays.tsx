"use client";

// Lost connection and paused table (design screens-table.tsx Reconnect): a scrim over the table,
// a strip saying the buttons are locked, the "Đang kết nối lại…" card with my clock still running,
// and the "Bàn tạm dừng" card when the server suspended the room.
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Clock, Hourglass, Lock, LogIn, RefreshCw, RotateCw, ServerCrash, Timer } from "lucide-react";

import { Button, ButtonLink } from "@/ui";

import type { AuthRefusal } from "./authRefusal";
import { Countdown, type TurnClock } from "./clock";
import type { Device } from "./geometry";
import type { Retry } from "./useTableSocket";

export function ReconnectCard({
  device,
  retry,
  refusal,
  myClock,
  canCheck,
  backHref,
  onRetry,
}: {
  device: Device;
  retry: Retry;
  /** Closed with 4401 (members only): log in again, or wait for the owner's approval. */
  refusal?: AuthRefusal | "checking";
  /** My turn clock, when the connection dropped during my turn: it keeps running on the server. */
  myClock?: TurnClock;
  canCheck: boolean;
  backHref: string;
  onRetry: () => void;
}) {
  const d = device === "desktop";
  // A dialog that takes focus once; its countdowns are hidden from screen readers (a live region
  // would read them every second), a fixed sentence says the same.
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => card.current?.focus(), []);
  if (refusal) return <RefusedCard device={device} refusal={refusal} backHref={backHref} />;
  return (
    <div ref={card} tabIndex={-1} className={`overlay-card rc-card rc-${device}`} role="alertdialog" aria-labelledby="rc-title" aria-describedby="rc-desc">
      <p id="rc-desc" className="sr-only">
        {retry.final
          ? "Máy chủ không cho kết nối lại."
          : `Mất kết nối với bàn, đang tự thử lại. Các nút tạm khoá.${myClock ? " Đồng hồ lượt của bạn vẫn chạy trên máy chủ." : ""}`}
      </p>
      <span className="rc-spinner" aria-hidden>
        <i />
        <RefreshCw size={d ? 22 : 20} strokeWidth={2} />
      </span>
      <b className="rc-title" id="rc-title">{retry.final ? "Không vào lại được bàn" : "Đang kết nối lại…"}</b>
      <span className="rc-sub" aria-hidden>
        {retry.final
          ? "Server không cho kết nối nữa (bị mời ra hoặc hết quyền vào phòng)."
          : retry.at !== null
            ? <>Lần thử {Math.max(1, retry.attempt)} · tự thử lại sau <Countdown deadline={retry.at} /> giây</>
            : `Lần thử ${Math.max(1, retry.attempt)} · đang nối…`}
      </span>
      {myClock && !retry.final && (
        <span className="rc-timer" aria-hidden>
          <Timer size={16} strokeWidth={2.2} />
          <span>
            <b>Đồng hồ của bạn vẫn chạy: còn <Countdown deadline={myClock.deadline} /> giây.</b>{" "}
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

/** The 4401 card: the same place and look as the reconnect card, with the way on. */
function RefusedCard({ device, refusal, backHref }: { device: Device; refusal: AuthRefusal | "checking"; backHref: string }) {
  const d = device === "desktop";
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => card.current?.focus(), [refusal]);
  const wait = refusal !== "checking" && refusal.block === "approval";
  const title = refusal === "checking" ? "Không vào lại được bàn" : wait ? "Đợi chủ phòng duyệt" : "Cần đăng nhập để chơi tiếp";
  const text =
    refusal === "checking"
      ? "Đang kiểm tra tài khoản…"
      : wait
        ? "Tài khoản của bạn chưa được, hoặc không còn được, chủ phòng duyệt. Nhắn chủ phòng nhé."
        : "Bàn này chỉ dành cho thành viên. Đăng nhập xong bạn quay lại đúng bàn này.";
  return (
    <div ref={card} tabIndex={-1} className={`overlay-card rc-card rc-${device}`} role="alertdialog" aria-labelledby="rc-title" aria-describedby="rc-desc">
      <span className="rc-spinner" aria-hidden>
        {wait ? <Hourglass size={d ? 22 : 20} strokeWidth={2} /> : <LogIn size={d ? 22 : 20} strokeWidth={2} />}
      </span>
      <b className="rc-title" id="rc-title">
        {title}
      </b>
      <span className="rc-sub" id="rc-desc">
        {text}
      </span>
      <span className="rc-actions">
        {refusal !== "checking" &&
          (wait ? (
            <ButtonLink kind="primary" size={d ? "md" : "lg"} href="/account">
              Xem tài khoản
            </ButtonLink>
          ) : (
            <ButtonLink kind="primary" size={d ? "md" : "lg"} icon={<LogIn size={16} aria-hidden />} href={refusal.loginHref}>
              Đăng nhập
            </ButtonLink>
          ))}
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
