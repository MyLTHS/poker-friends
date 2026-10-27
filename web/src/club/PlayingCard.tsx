type PlayingCardProps = {
  value: string;
  large?: boolean;
  faceDown?: boolean;
};

export function PlayingCard({ value, large = false, faceDown = false }: PlayingCardProps) {
  const red = value.includes("♥") || value.includes("♦");
  const className = ["playing-card", large && "card-large", red && "red", faceDown && "card-back"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className} aria-label={faceDown ? "Bài úp" : value}>
      {faceDown ? "♠" : <><b>{value.slice(0, -1)}</b><span>{value.slice(-1)}</span></>}
    </div>
  );
}
