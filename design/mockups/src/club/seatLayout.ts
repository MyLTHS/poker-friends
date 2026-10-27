import type { CSSProperties } from "react";

export type SeatLayout = {
  seat: CSSProperties;
  wager: CSSProperties;
};

const pointOnEllipse = (angle: number, radiusX: number, radiusY: number) => ({
  x: 50 + Math.cos(angle) * radiusX,
  y: 50 + Math.sin(angle) * radiusY,
});

export function getSeatLayout(
  index: number,
  count: number,
  heroIndex = count - 1,
): SeatLayout {
  const step = (Math.PI * 2) / count;
  const angle = Math.PI / 2 + (index - heroIndex) * step;
  const seat = pointOnEllipse(angle, 42, 43);
  const wager = pointOnEllipse(angle, 29, 28);

  return {
    seat: { left: `${seat.x}%`, top: `${seat.y}%` },
    wager: { left: `${wager.x}%`, top: `${wager.y}%` },
  };
}
