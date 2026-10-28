"use client";

// Next.js error boundary for the root layout itself: it replaces <html>, so it brings the styles
// and fonts the layout would have.
import { useEffect } from "react";

import { reportClientError } from "@/feedback/browser";
import { CrashScreen } from "@/feedback/CrashScreen";
import { fontVariables } from "@/ui/fonts";

import "./globals.css";

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportClientError(error), [error]);
  return (
    <html lang="vi" className={fontVariables}>
      <body>
        <CrashScreen />
      </body>
    </html>
  );
}
