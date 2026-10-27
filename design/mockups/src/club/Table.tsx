import { ChipAmount } from "../chips";
import { ChipStack } from "./ChipStack";
import { PlayingCard } from "./PlayingCard";
import { Seat, type ClubPlayer } from "./Seat";
import { COMPACT_RADII, DESKTOP_RADII, getSeatLayout } from "./seatLayout";

type TableProps = {
  players: ClubPlayer[];
  board: string[];
  pot: number;
  lastAction?: { player: string; label: string; amount: number };
  heroIndex?: number;
  dealerIndex?: number;
  smallBlindIndex?: number;
  bigBlindIndex?: number;
  compact?: boolean;
  children?: React.ReactNode;
};

export function Table({ players, board, pot, lastAction, heroIndex = players.findIndex((player) => player.cards), dealerIndex, smallBlindIndex, bigBlindIndex, compact = false, children }: TableProps) {
  const resolvedHeroIndex = heroIndex >= 0 ? heroIndex : players.length - 1;
  const radii = compact ? COMPACT_RADII : DESKTOP_RADII;
  return (
    <div className={`table-stage ${compact ? "table-stage-mobile" : ""}`}>
      <div className="poker-table">
        <div className="table-rail" />
        <div className="pot-label"><span>POT CHÍNH</span><ChipAmount value={pot} /></div>
        <div className="community-cards">{board.map((card, index) => card === "—" ? <div className="card-slot" key={`slot-${index}`} /> : <PlayingCard value={card} large={!compact} key={`${card}-${index}`} />)}</div>
        {lastAction && <div className="last-action">{lastAction.player} {lastAction.label} <ChipAmount value={lastAction.amount} /></div>}
      </div>
      {players.map((player, index) => {
        const layout = getSeatLayout(index, players.length, resolvedHeroIndex, radii);
        const blind = index === smallBlindIndex ? "SB" : index === bigBlindIndex ? "BB" : undefined;
        return <Seat key={`${player.name}-${index}`} player={player} position={layout.seat} isHero={index === resolvedHeroIndex} dealer={index === dealerIndex} blind={blind} compact={compact} />;
      })}
      {players.map((player, index) => player.bet && player.state !== "empty" ? <div className={index === resolvedHeroIndex ? "table-wager table-wager-hero" : "table-wager"} style={getSeatLayout(index, players.length, resolvedHeroIndex, radii).wager} key={`bet-${player.name}-${index}`}><ChipStack amount={player.bet} /></div> : null)}
      {children}
    </div>
  );
}
