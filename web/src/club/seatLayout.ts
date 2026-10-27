import type { CSSProperties } from "react";

export type SeatLayout = {
  seat: CSSProperties;
  wager: CSSProperties;
};

// Radii are percentages of the table stage, measured from its centre.
export type SeatRadii = { seatX: number; seatY: number; wagerX: number; wagerY: number };

export const DESKTOP_RADII: SeatRadii = { seatX: 42, seatY: 43, wagerX: 29, wagerY: 28 };
// Landscape handset (stage about 550 x 332): keeps every seat clear of a 60% x 58% table.
export const COMPACT_RADII: SeatRadii = { seatX: 42, seatY: 42, wagerX: 24, wagerY: 22 };

const pointOnEllipse = (angle: number, radiusX: number, radiusY: number) => ({
  x: 50 + Math.cos(angle) * radiusX,
  y: 50 + Math.sin(angle) * radiusY,
});

export function getSeatLayout(
  index: number,
  count: number,
  heroIndex = count - 1,
  radii: SeatRadii = DESKTOP_RADII,
): SeatLayout {
  const step = (Math.PI * 2) / count;
  const angle = Math.PI / 2 + (index - heroIndex) * step;
  const seat = pointOnEllipse(angle, radii.seatX, radii.seatY);
  const wager = pointOnEllipse(angle, radii.wagerX, radii.wagerY);

  return {
    seat: { left: `${seat.x}%`, top: `${seat.y}%` },
    wager: { left: `${wager.x}%`, top: `${wager.y}%` },
  };
}
