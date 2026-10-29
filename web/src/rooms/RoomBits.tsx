"use client";

// Pieces several room screens share: status badges and the owner's share card (link, copy, share,
// QR).
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Globe, Link2, Lock, QrCode, RefreshCw, Share2 } from "lucide-react";

import { Badge, Button, QR } from "@/ui";
import { fmt } from "@/ui/format";

import { inviteUrl, type RoomDetail } from "./api";
import { useClientValue, useOrigin, usePhone } from "./hooks";
import { STATUS_TEXT } from "./lobby";
import { qrModules } from "./qr";
import type { RoomInfo } from "./rules";

export function StatusBadge({ status }: { status: RoomInfo["status"] }) {
  if (status === "playing") return <Badge kind="felt" icon={<i className="dot is-live" aria-hidden />}>Đang chơi</Badge>;
  if (status === "open") return <Badge kind="brass" icon={<i className="dot" aria-hidden />}>Đang mở</Badge>;
  return <Badge kind="claret">{STATUS_TEXT[status]}</Badge>;
}

export function VisibilityBadge({ isPrivate }: { isPrivate: boolean }) {
  return isPrivate ? (
    <Badge kind="muted" icon={<Lock size={11} strokeWidth={2.4} aria-hidden />}>
      Riêng
    </Badge>
  ) : (
    <Badge kind="muted" icon={<Globe size={11} strokeWidth={2.4} aria-hidden />}>
      Công khai
    </Badge>
  );
}

export function RoomBadges({ room, isPrivate }: { room: RoomInfo; isPrivate: boolean }) {
  return (
    <span className="badges">
      <StatusBadge status={room.status} />
      <VisibilityBadge isPrivate={isPrivate} />
      {room.seven_deuce_bonus > 0 && <Badge kind="claret">7-2 · {fmt(room.seven_deuce_bonus)}</Badge>}
    </span>
  );
}

/** Copies `text`; true when it worked. Older browsers and http pages have no clipboard API. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The owner's share card: the link, copy / share, the QR to scan from across the table.
 *  `path` shares another link of this site instead of the invite (a public room's page, which
 *  any player may pass on). */
export function ShareCard({
  detail,
  onCopied,
  rotateHint = true,
  path,
  eyebrow = "Chủ phòng chia sẻ",
}: {
  detail: RoomDetail;
  onCopied?: (ok: boolean) => void;
  rotateHint?: boolean;
  path?: string;
  eyebrow?: string;
}) {
  const phone = usePhone();
  const origin = useOrigin();
  const [copied, setCopied] = useState(false);
  const canShare = useClientValue(() => typeof navigator.share === "function", false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const link = path ? `${origin}${path}` : detail.invite_token ? inviteUrl(origin, detail.invite_token) : "";
  // the matrix only changes with the link (a re-render every poll would rebuild it)
  const modules = useMemo(() => (link ? qrModules(link) : []), [link]);
  if (!link || !origin) return null;
  const shown = link.replace(/^https?:\/\//, "");
  const room = detail.room;
  return (
    <section className="share" aria-label={path ? "Link phòng" : "Link mời"}>
      <div className="share-head">
        <span>
          <span className="eyebrow">{eyebrow}</span>
          <b>{room.name}</b>
        </span>
        <VisibilityBadge isPrivate={detail.is_private} />
      </div>
      <div className="share-body">
        <div className="share-left">
          <span className="link-box is-large">
            <Link2 size={16} aria-hidden />
            <span data-testid="invite-link" title={link}>
              {shown}
            </span>
          </span>
          <span className="share-actions">
            <Button
              kind="primary"
              icon={copied ? <Check size={16} strokeWidth={2.6} aria-hidden /> : <Copy size={16} aria-hidden />}
              onClick={async () => {
                const ok = await copyText(link);
                setCopied(ok);
                onCopied?.(ok);
              }}
            >
              {copied ? "Đã chép link" : "Chép link"}
            </Button>
            {canShare && (
              <Button
                kind="ghost"
                icon={<Share2 size={16} aria-hidden />}
                onClick={() => navigator.share({ title: room.name, text: `Vào ${room.name} chơi poker nhé`, url: link }).catch(() => undefined)}
              >
                Gửi qua…
              </Button>
            )}
          </span>
          {rotateHint && (
            <span className="share-note">
              <RefreshCw size={14} aria-hidden /> Lỡ gửi nhầm? Đổi link trong Bảng chủ phòng — link cũ hết hiệu lực ngay.
            </span>
          )}
        </div>
        <span className="qr-wrap">
          <QR modules={modules} size={phone ? 112 : 168} label={`Mã QR của ${path ? "link phòng" : "link mời vào"} ${room.name}`} />
          <small>
            <QrCode size={12} aria-hidden /> Quét để vào
          </small>
        </span>
      </div>
    </section>
  );
}
