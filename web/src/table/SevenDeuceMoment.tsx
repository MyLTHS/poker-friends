import { ChevronRight } from "lucide-react";
import type { SeatOccupant, SevenDeuceAward } from "@/api/protocol";
import { ChipAmount } from "@/club/chips";
import { PlayingCard } from "@/club/PlayingCard";
import { avatarColor, initials, toClubCard } from "./view";

// The 7-2 bluff moment from the direction-A mockup (TableSurface `celebration`), fed by the
// seven_deuce block of hand.completed.
export function SevenDeuceMoment({
  award,
  seats,
  youId,
  onClose,
}: {
  award: SevenDeuceAward;
  seats: SeatOccupant[];
  youId: string;
  onClose: () => void;
}) {
  const winner = seats.find((s) => s.player_id === award.player_id)?.display_name ?? `Ghế ${award.seat}`;
  const isYou = award.player_id === youId;
  return (
    <div className="celebration" role="dialog" aria-label="7–2 bluff thắng">
      <div className="celebration-rays" aria-hidden="true">
        <div className="spark s1">✦</div>
        <div className="spark s2">✦</div>
        <div className="spark s3">✦</div>
      </div>
      <div className="celebration-content">
        <div className="win-avatar">
          <div className="avatar avatar-lg" style={{ background: avatarColor(award.seat) }}>{initials(winner)}<i /></div>
        </div>
        <span className="pill pill-gold">7–2 BLUFF THẮNG</span>
        <h2>{isYou ? "Bạn vừa diễn quá đạt!" : `${winner} vừa diễn quá đạt!`}</h2>
        <div className="reveal-cards">
          {award.cards.map((card) => <PlayingCard value={toClubCard(card)} large key={card} />)}
        </div>
        <p>Mọi người đã bỏ bài · Tự động lật 7–2 cho cả bàn</p>
        <div className="bonus-line">
          <span>{award.payments.length} người trả × <ChipAmount value={award.bonus} /></span>
          <ChipAmount value={award.total} sign="plus" />
        </div>
        <button className="btn btn-primary" onClick={onClose} autoFocus>
          Tiếp tục ván mới <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
