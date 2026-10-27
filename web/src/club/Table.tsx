import { ChipAmount } from "./chips";
import { ChipStack } from "./ChipStack";
import { PlayingCard } from "./PlayingCard";
import { Seat, type ClubPlayer } from "./Seat";
import { COMPACT_RADII, DESKTOP_RADII, getSeatLayout } from "./seatLayout";

// Copied from design/mockups/src/club/Table.tsx. Added for web/: heroIndex -1 (spectator: seat 0
// at the bottom, nobody drawn as hero), lastAction without an amount (fold, check), and the
// turn countdown passed through to the seat that is acting.
type TableProps = {
  players: ClubPlayer[];
  board: string[];
  pot: number;
  lastAction?: { player: string; label: string; amount?: number };
  heroIndex?: number;
  dealerIndex?: number;
  smallBlindIndex?: number;
  bigBlindIndex?: number;
  compact?: boolean;
  countdown?: number;
  children?: React.ReactNode;
};

export function Table({ players, board, pot, lastAction, heroIndex = players.findIndex((player) => player.cards), dealerIndex, smallBlindIndex, bigBlindIndex, compact = false, countdown, children }: TableProps) {
  const resolvedHeroIndex = heroIndex >= 0 ? heroIndex : 0;
  const hasHero = heroIndex >= 0;
  const radii = compact ? COMPACT_RADII : DESKTOP_RADII;
  return (
    <div className={`table-stage ${compact ? "table-stage-mobile" : ""}`}>
      <div className="poker-table">
        <div className="table-rail" />
        <div className="pot-label"><span>POT CHÍNH</span><ChipAmount value={pot} /></div>
        <div className="community-cards">{board.map((card, index) => card === "—" ? <div className="card-slot" key={`slot-${index}`} /> : <PlayingCard value={card} large={!compact} key={`${card}-${index}`} />)}</div>
        {lastAction && <div className="last-action">{lastAction.player} {lastAction.label}{lastAction.amount !== undefined && <> <ChipAmount value={lastAction.amount} /></>}</div>}
      </div>
      {players.map((player, index) => {
        const layout = getSeatLayout(index, players.length, resolvedHeroIndex, radii);
        const blind = index === smallBlindIndex ? "SB" : index === bigBlindIndex ? "BB" : undefined;
        return <Seat key={`${player.name}-${index}`} player={player} position={layout.seat} isHero={hasHero && index === resolvedHeroIndex} dealer={index === dealerIndex} blind={blind} compact={compact} countdown={countdown} />;
      })}
      {players.map((player, index) => player.bet && player.state !== "empty" ? <div className={hasHero && index === resolvedHeroIndex ? "table-wager table-wager-hero" : "table-wager"} style={getSeatLayout(index, players.length, resolvedHeroIndex, radii).wager} key={`bet-${player.name}-${index}`}><ChipStack amount={player.bet} /></div> : null)}
      {children}
    </div>
  );
}
