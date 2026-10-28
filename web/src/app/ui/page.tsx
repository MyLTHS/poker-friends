import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Gallery } from "./Gallery";

export const metadata: Metadata = {
  title: "Bộ giao diện D1 — Poker Friends",
  robots: { index: false, follow: false },
};

// The D1 component gallery for C3/C4 and reviewers: on in `next dev`, off in a production build
// unless NEXT_PUBLIC_UI_GALLERY=1 (e.g. on staging).
export default function UiPage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_UI_GALLERY !== "1") notFound();
  return <Gallery />;
}
