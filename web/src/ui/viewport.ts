import type { Viewport } from "next";

/** Viewport of a D1 page: `export const viewport = d1Viewport;` in its
 *  page.tsx. viewport-fit=cover lets the landscape phone layout draw under the notch; D1 keeps its
 *  own insets (tokens.css --safe-l / --safe-r / --safe-b). Screens still in direction A keep the
 *  root layout's viewport, without cover, so the notch never hides them. */
export const d1Viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d0a07",
};
