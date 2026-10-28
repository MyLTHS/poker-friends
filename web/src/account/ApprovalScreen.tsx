"use client";

// "Đợi chủ phòng duyệt" (members only): a real account the owner has not let in yet. Two ways in:
// logged in (the API answered 403 not_approved, or /api/auth/me/ says member: false) — "Thử lại"
// asks /api/auth/me/ again, "Đăng xuất" changes account; or a login refused with not_approved
// (no session then) — "Thử lại" logs in again with what was typed, "Dùng tài khoản khác" goes
// back to the form. Never a way back to the login that would loop.
import { useEffect, useRef, type ReactNode } from "react";
import { Hourglass, RotateCw } from "lucide-react";

import { Button } from "@/ui";

import { AuthFrame, NoticeAlert } from "./frame";
import type { Notice } from "./messages";

export function ApprovalScreen({
  email,
  notice,
  busy,
  onRetry,
  other,
}: {
  email: string | null;
  notice: Notice | null;
  busy: boolean;
  onRetry: () => void;
  /** "Đăng xuất" (logged in) or "Dùng tài khoản khác" (a refused login) */
  other: ReactNode;
}) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => card.current?.focus(), []);
  return (
    <AuthFrame
      hero={{
        headline: (
          <>
            Một ghế đã
            <br />
            chờ sẵn bạn.
          </>
        ),
        sub: "Bàn này chỉ dành cho thành viên. Chủ phòng duyệt xong là bạn vào chơi được.",
      }}
      phone={{ kind: "bar", title: "Đợi chủ phòng duyệt" }}
    >
      <div ref={card} tabIndex={-1} className="auth-card approval" aria-labelledby="approval-title" aria-describedby="approval-text">
        <span className="verify-icon" aria-hidden>
          <Hourglass size={30} strokeWidth={1.6} />
        </span>
        <h2 className="auth-title" id="approval-title">
          Đợi chủ phòng duyệt
        </h2>
        <p className="approval-text" id="approval-text">
          {email ? (
            <>
              Tài khoản <b>{email}</b> đã có. Chủ phòng cần duyệt trước khi bạn vào bàn: nhắn chủ phòng nhé.
            </>
          ) : (
            "Tài khoản của bạn đã có. Chủ phòng cần duyệt trước khi bạn vào bàn: nhắn chủ phòng nhé."
          )}{" "}
          Duyệt xong, bấm Thử lại.
        </p>
        <div className="form-stack">
          <NoticeAlert notice={notice} />
          <Button kind="primary" size="lg" block busy={busy} icon={<RotateCw size={17} strokeWidth={2} aria-hidden />} onClick={onRetry}>
            Thử lại
          </Button>
          {other}
        </div>
      </div>
    </AuthFrame>
  );
}

export const NOT_YET: Notice = { kind: "error", text: "Chủ phòng chưa duyệt. Thử lại sau ít phút nhé." };
