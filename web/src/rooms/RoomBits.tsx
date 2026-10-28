"use client";

// Pieces several room screens share: status badges, the invitation card a guest sees, the
// owner's share card (link, copy, share, QR) and the "paste an invite link" box.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Check, Copy, Globe, Link2, Lock, QrCode, RefreshCw, Share2 } from "lucide-react";

import { Avatar, Badge, Button, Crest, QR, TextField } from "@/ui";
import { fmt } from "@/ui/format";

import { inviteUrl, type RoomDetail } from "./api";
import { useClientValue, useOrigin, usePhone } from "./hooks";
import { inviteToken, STATUS_TEXT } from "./lobby";
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

/** Red wax seal pressed into the invitation's corner. */
function SuitSeal() {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%">
      <path
        d="M24 2.5c2.6 0 3.6 2.4 6 3s4.6-.9 6.5.8.6 4.2 1.9 6.3 4 2.6 4.4 5.2-1.9 4-1.9 6.4 2.3 3.9 1.6 6.4-3.4 2.7-4.9 4.8-.5 4.7-2.7 6.2-4.5-.1-7 .9-3.4 3.4-6 3.4-3.5-2.4-6-3.4-4.9.6-7-.9-1.2-4.1-2.7-6.2-4.2-2.3-4.9-4.8 1.6-4 1.6-6.4-2.3-3.9-1.9-6.4 3.1-3.1 4.4-5.2-.4-4.6 1.9-6.3 4.1-.2 6.5-.8 3.4-3 6-3z"
        className="seal-wax"
      />
      <circle cx="24" cy="24" r="13.5" className="seal-ring" />
      <path
        d="M24 15.2c-1.7 2.5-5.2 4.4-5.2 7.1 0 1.6 1.2 2.7 2.7 2.7.9 0 1.6-.4 2.1-1-.2 1.2-.7 2-1.5 2.7h3.8c-.8-.7-1.3-1.5-1.5-2.7.5.6 1.2 1 2.1 1 1.5 0 2.7-1.1 2.7-2.7 0-2.7-3.5-4.6-5.2-7.1z"
        className="seal-mark"
      />
    </svg>
  );
}

/** The ivory invitation card on the felt ("An mời bạn vào Bàn thứ Sáu"). `from` = the owner. */
export function Invitation({
  from,
  title,
  meta,
  live,
  actions,
  who,
  children,
}: {
  from?: ReactNode;
  title: ReactNode;
  meta?: [string, ReactNode][];
  live?: ReactNode;
  actions?: ReactNode;
  who?: ReactNode;
  children?: ReactNode;
}) {
  const phone = usePhone();
  return (
    <article className="invitation" aria-label="Thiệp mời">
      <span className="inv-corner tl" aria-hidden />
      <span className="inv-corner tr" aria-hidden />
      <span className="inv-corner bl" aria-hidden />
      <span className="inv-corner br" aria-hidden />
      <span className="inv-seal" aria-hidden>
        <SuitSeal />
      </span>
      <Crest size={phone ? 40 : 52} />
      {from}
      <h2 className="inv-room">{title}</h2>
      <span className="inv-line" aria-hidden />
      {meta && (
        <dl className="inv-meta">
          {meta.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {live && <span className="inv-live">{live}</span>}
      {children}
      {actions && <span className="inv-actions">{actions}</span>}
      {who && <small className="inv-who">{who}</small>}
    </article>
  );
}

export function InviteFrom({ name }: { name: string }) {
  const phone = usePhone();
  return (
    <span className="inv-from">
      <Avatar name={name} size={phone ? 22 : 26} />
      <span>
        <b>{name}</b> mời bạn vào
      </span>
    </span>
  );
}

/** Room facts of an invitation: blinds, seats taken, 7-2 bonus. */
export function invitationMeta(room: RoomInfo, seated?: number): [string, ReactNode][] {
  return [
    ["Blind", `${fmt(room.small_blind)}/${fmt(room.big_blind)}`],
    ["Ghế", seated === undefined ? room.max_seats : `${seated}/${room.max_seats}`],
    ["Thưởng 7-2", room.seven_deuce_bonus > 0 ? fmt(room.seven_deuce_bonus) : "Tắt"],
  ];
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

/** The owner's share card: the link, copy / share, the QR to scan from across the table. */
export function ShareCard({ detail, onCopied, rotateHint = true }: { detail: RoomDetail; onCopied?: (ok: boolean) => void; rotateHint?: boolean }) {
  const phone = usePhone();
  const origin = useOrigin();
  const [copied, setCopied] = useState(false);
  const canShare = useClientValue(() => typeof navigator.share === "function", false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const link = detail.invite_token ? inviteUrl(origin, detail.invite_token) : "";
  // the matrix only changes with the link (a re-render every poll would rebuild it)
  const modules = useMemo(() => (link ? qrModules(link) : []), [link]);
  if (!detail.invite_token || !origin) return null;
  const shown = link.replace(/^https?:\/\//, "");
  const room = detail.room;
  return (
    <section className="share" aria-label="Link mời">
      <div className="share-head">
        <span>
          <span className="eyebrow">Chủ phòng chia sẻ</span>
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
          <QR modules={modules} size={phone ? 112 : 168} label={`Mã QR của link mời vào ${room.name}`} />
          <small>
            <QrCode size={12} aria-hidden /> Quét để vào
          </small>
        </span>
      </div>
    </section>
  );
}

/** "Dán link mời…" + Vào: accepts the whole link or just the token, then opens /rooms/join. */
export function PasteInvite({ inputId, compact = false, autoFocus = false }: { inputId?: string; compact?: boolean; autoFocus?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const go = (event: FormEvent) => {
    event.preventDefault();
    const token = inviteToken(text);
    if (!token) {
      setError("Đây không phải link mời. Link có dạng …/rooms/join?token=…");
      return;
    }
    router.push(`/rooms/join?token=${encodeURIComponent(token)}`);
  };
  return (
    <form className={`paste${compact ? " is-compact" : ""}`} onSubmit={go} aria-label="Vào bằng link mời">
      <TextField
        id={inputId}
        aria-label="Link mời"
        placeholder="Dán link mời…"
        icon={<Link2 size={17} strokeWidth={1.9} aria-hidden />}
        value={text}
        error={error ?? undefined}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
      />
      <Button kind="ghost" type="submit">
        Vào
      </Button>
    </form>
  );
}
