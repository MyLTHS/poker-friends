import { Plus, SignalZero } from "lucide-react";
import type { CSSProperties } from "react";
import { ChipAmount } from "./chips";
import { PlayingCard } from "./PlayingCard";

// Copied from design/mockups/src/club/Seat.tsx. Added for web/: `holding` (draw the two card
// backs only for players still holding hidden cards) and face-down cards in `cards` ("??").
export type ClubPlayer = {
  name: string;
  stack: number;
  avatar: string;
  avatarColor?: string;
  bet?: number;
  state?: "turn" | "offline" | "sitout" | "empty" | "folded";
  cards?: string[];
  holding?: boolean;
};

type SeatProps = {
  player: ClubPlayer;
  position: CSSProperties;
  isHero?: boolean;
  dealer?: boolean;
  blind?: "SB" | "BB";
  compact?: boolean;
  countdown?: number;
};

export function Seat({ player, position, isHero = false, dealer = false, blind, compact = false, countdown = 14 }: SeatProps) {
  const empty = player.state === "empty";
  const className = [
    "seat",
    player.state === "turn" && "seat-turn",
    empty && "seat-empty",
    compact && "seat-compact",
    isHero && "seat-hero",
    player.holding === false && "seat-no-cards",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className} style={position}>
      {player.state === "turn" && <span className="seat-countdown">{countdown}</span>}
      <div className="seat-avatar">
        {empty ? <Plus /> : <div className="avatar avatar-md" style={{ background: player.avatarColor ?? "var(--panel-2)" }}>{player.avatar}{player.state !== "offline" && <i />}</div>}
        {dealer && <span className="dealer">D</span>}
      </div>
      <div className="seat-info"><strong>{player.name}</strong>{!empty && <ChipAmount value={player.stack} />}</div>
      {blind && <span className={`blind-marker ${blind === "BB" ? "big" : ""}`}>{blind}</span>}
      {player.state === "offline" && <span className="state-badge offline"><SignalZero size={12} /> Mất mạng</span>}
      {player.state === "sitout" && <span className="state-badge">Tạm nghỉ</span>}
      {player.state === "folded" && <span className="state-badge">Đã bỏ</span>}
      {player.cards && player.cards.length > 0 && (
        <div className="seat-cards">
          {player.cards.map((card, index) => <PlayingCard value={card} faceDown={card === "??"} key={`${card}-${index}`} />)}
        </div>
      )}
    </div>
  );
}
