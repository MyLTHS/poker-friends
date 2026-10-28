"use client";

// Next.js error boundary for every page under the root layout: report the error, then the D1
// "Có lỗi, tải lại" screen instead of a blank page.
import { useEffect } from "react";

import { reportClientError } from "@/feedback/browser";
import { CrashScreen } from "@/feedback/CrashScreen";

export default function PageError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportClientError(error), [error]);
  return <CrashScreen />;
}
