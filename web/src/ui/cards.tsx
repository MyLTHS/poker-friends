// Playing cards of D1 (ports of the design kit's SuitIcon / PlayingCard / CardText), fed with
// protocol cards: "As", "Th", "7c"; "??" is a face-down card.
import type { CSSProperties, HTMLAttributes } from "react";

import { cardName, isRed, parseCard, type Suit } from "./format";

export function SuitIcon({ suit, className = "" }: { suit: Suit; className?: string }) {
  return (
    <svg className={`suit ${className}`} viewBox="0 0 24 24" aria-hidden>
      {suit === "♠" && (
        <path d="M12 2.5C9.2 6.6 3.5 9.7 3.5 14.2c0 2.6 2 4.5 4.4 4.5 1.5 0 2.7-.6 3.4-1.6-.3 1.9-1.1 3.3-2.5 4.4h7.4c-1.4-1.1-2.2-2.5-2.5-4.4.7 1 1.9 1.6 3.4 1.6 2.4 0 4.4-1.9 4.4-4.5 0-4.5-5.7-7.6-8.5-11.7z" />
      )}
      {suit === "♥" && (
        <path d="M12 21C6.2 16.4 2.5 13 2.5 8.7 2.5 5.8 4.7 3.5 7.5 3.5c1.9 0 3.5 1 4.5 2.6 1-1.6 2.6-2.6 4.5-2.6 2.8 0 5 2.3 5 5.2 0 4.3-3.7 7.7-9.5 12.3z" />
      )}
      {suit === "♦" && <path d="M12 1.8 19.6 12 12 22.2 4.4 12z" />}
      {suit === "♣" && (
        <>
          <circle cx="12" cy="7.2" r="4.3" />
          <circle cx="7" cy="13.4" r="4.3" />
          <circle cx="17" cy="13.4" r="4.3" />
          <circle cx="12" cy="12" r="2.6" />
          <path d="M12 11.5c-.2 4.4-1.3 7.3-3.3 9.7h6.6c-2-2.4-3.1-5.3-3.3-9.7z" />
        </>
      )}
    </svg>
  );
}

const COURT = ["K", "Q", "J"];

type CardProps = {
  /** Protocol card ("As", "Th"); "??" draws the back. */
  card: string;
  /** Width in px; the height is 1.4×. From 52px a card gets the mirrored bottom index. */
  w?: number;
  rotate?: number;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">;

/** A printed card: corner index, a large centre pip (or a framed court panel for K Q J). Backs
 *  carry the club crest. */
export function PlayingCard({ card, w = 44, rotate = 0, className = "", style, ...rest }: CardProps) {
  const face = parseCard(card);
  const base: CSSProperties = {
    ...({ "--w": `${w}px` } as CSSProperties),
    transform: rotate ? `rotate(${rotate}deg)` : undefined,
    ...style,
  };
  const size = w >= 52 ? "pc-lg" : w < 28 ? "pc-xs" : "";
  if (!face) return <div role="img" aria-label={cardName(null)} className={`pc pc-back ${size} ${className}`} style={base} {...rest} />;
  const index = (flip: boolean) => (
    <span className={`pc-idx${flip ? " is-flip" : ""}`} aria-hidden>
      <b>{face.rank}</b>
      <SuitIcon suit={face.suit} />
    </span>
  );
  return (
    <div
      role="img"
      aria-label={cardName(face)}
      className={`pc ${isRed(face) ? "pc-red" : "pc-black"} ${face.rank === "10" ? "pc-ten" : ""} ${size} ${className}`}
      style={base}
      {...rest}
    >
      {index(false)}
      {COURT.includes(face.rank) ? (
        <span className="pc-court" aria-hidden>
          <SuitIcon suit={face.suit} />
          <b>{face.rank}</b>
          <SuitIcon suit={face.suit} />
        </span>
      ) : (
        <SuitIcon suit={face.suit} className="pc-pip" />
      )}
      {w >= 52 && index(true)}
    </div>
  );
}

/** A card that turns over (showdown, the 7-2 reveal): the back until `faceUp`, then a 3D turn of
 *  --dur-flip; reduced motion cross-fades instead (d1.css .pc-flip). */
export function FlipCard({ card, faceUp, w = 44, className = "" }: { card: string; faceUp: boolean; w?: number; className?: string }) {
  return (
    <span className={`pc-flip${faceUp ? " is-up" : ""} ${className}`} style={{ "--w": `${w}px` } as CSSProperties}>
      <PlayingCard card="??" w={w} className="pc-flip-back" aria-hidden={faceUp} />
      <PlayingCard card={card} w={w} className="pc-flip-front" aria-hidden={!faceUp} />
    </span>
  );
}

/** Inline mention of a card in text, e.g. "A♥". */
export function CardText({ card }: { card: string }) {
  const face = parseCard(card);
  if (!face) return <span className="ctext">??</span>;
  return (
    <span className={`ctext ${isRed(face) ? "is-red" : ""}`} aria-label={cardName(face)}>
      {face.rank}
      <SuitIcon suit={face.suit} />
    </span>
  );
}
